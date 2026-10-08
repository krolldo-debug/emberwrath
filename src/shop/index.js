import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl } from '../gfx/Icons.js';
import { panelFrame, goldEl } from '../progression/widgets.js';
import { resolveGear } from '../character/gearLook.js';
import { GOLD_PACKS, DESIGNS, DESIGN_ITEMS, packTotal, formatPrice, RETURN_PARAM, PRICE_NOTE, TERMS_PATH, WAIVER_TEXT, MINOR_NOTE } from './catalog.js';

// Shop: Gold-Pakete und exklusive Designs für Echtgeld (Bezahlung über Stripe, Worker worker/shop.js, Einrichtung docs/SHOP.md).
//
// game.shop
//   status        { enabled, configured, products } vom Server oder null (noch nicht geladen / nicht erreichbar)
//   visible       true, wenn der Shop für dieses Konto sichtbar ist (freigeschaltet oder Admin-Vorschau)
//   refresh()     Status und Admin-Recht neu laden → Promise<visible>
//   open()        Panel 'goldshop' in der laufenden Sitzung öffnen
//   claim()       bezahlte Bestellungen des aktuellen Charakters gutschreiben, erstattete/zurückgebuchte wieder
//                 abziehen, gekaufte Designs übernehmen → Promise<Gold> (Saldo der Gutschriften)
//   owns(designId) true, wenn das Design zum Konto gehört (laut Spielstand, vom Server abgeglichen)
// Panel 'goldshop' (Menü-Knopf „Shop“, Klick auf den Goldbetrag im HUD).
// Slice 'shop' { credited: [orderId], revoked: [orderId], owned: ['mount:<id>'|'dye:<id>'] }: credited/revoked verhindern
// doppelte Gutschrift und doppelten Abzug; owned sind die bezahlten Designs des Kontos (Server: shop_designs()).
// Command 'shop:designs' { items } gleicht Designs ab: exklusive Reittiere lernen bzw. entfernen, Färbung zurücksetzen.
// Commands 'shop:credit' { orderId, gold } und 'shop:revoke' { orderId, gold } (Rückbuchung, Gold darf ins Minus).
// Gold kommt nur über bezahlte Bestellungen in der Datenbank ins Spiel (Webhook von Stripe → 'paid').
const CREDITED_KEEP = 200;
const RETRY_AFTER_RETURN_S = [3, 8, 15, 30, 60, 120];

export function installShop(game) {
  const state = game.state;
  state.defineSlice('shop', {
    create: () => ({ credited: [], revoked: [], owned: [] }),
    deserialize: (raw) => ({
      credited: Array.isArray(raw?.credited) ? raw.credited.slice(-CREDITED_KEEP) : [],
      revoked: Array.isArray(raw?.revoked) ? raw.revoked.slice(-CREDITED_KEEP) : [],
      owned: Array.isArray(raw?.owned) ? raw.owned.filter((k) => DESIGN_ITEMS.includes(k)) : [],
    }),
  });
  // Designs laut Server übernehmen. Der Server lehnt Spielstände mit unbezahlten exklusiven Designs ab.
  state.defineCommand('shop:designs', (s, { items }, ctx) => {
    if (!Array.isArray(items)) return { ok: false };
    const owned = DESIGN_ITEMS.filter((k) => items.includes(k));
    const sl = s.get('shop');
    const ch = s.get('character');
    const added = owned.filter((k) => !sl.owned.includes(k));
    sl.owned = owned;
    for (const k of owned) if (k.startsWith('mount:')) s.commit('mount:learn', { mountId: k.slice(6), shop: true });
    const m = ch.mounts;
    const lost = m.owned.filter((id) => DESIGN_ITEMS.includes(`mount:${id}`) && !owned.includes(`mount:${id}`));
    if (lost.length) {
      m.owned = m.owned.filter((id) => !lost.includes(id));
      if (lost.includes(m.active)) {
        m.active = m.owned[0] ?? null;
        if (m.riding) { m.riding = false; ctx.bus.emit(EV.MOUNT_CHANGED, { riding: false, mountId: m.active }); }
      }
    }
    const dye = ch.appearance?.dye;
    if (dye && DESIGN_ITEMS.includes(`dye:${dye}`) && !owned.includes(`dye:${dye}`)) ch.appearance.dye = null;
    return { ok: true, added, removed: lost.length > 0 };
  }, { authoritative: true });
  state.defineCommand('shop:credit', (s, { orderId, gold }) => {
    const sl = s.get('shop');
    if (typeof orderId !== 'string' || !(gold > 0) || sl.credited.includes(orderId)) return { ok: false };
    sl.credited.push(orderId);
    if (sl.credited.length > CREDITED_KEEP) sl.credited.splice(0, sl.credited.length - CREDITED_KEEP);
    s.commit('wallet:addGold', { amount: gold | 0, source: `shop:${orderId}` });
    return { ok: true, gold };
  }, { authoritative: true });
  // Erstattet oder zurückgebucht: Gold wieder abziehen, auch wenn es schon ausgegeben ist (Saldo wird negativ).
  state.defineCommand('shop:revoke', (s, { orderId, gold }, ctx) => {
    const sl = s.get('shop');
    if (typeof orderId !== 'string' || !(gold > 0) || sl.revoked.includes(orderId)) return { ok: false };
    sl.revoked.push(orderId);
    if (sl.revoked.length > CREDITED_KEEP) sl.revoked.splice(0, sl.revoked.length - CREDITED_KEEP);
    const w = s.get('wallet');
    w.gold -= gold | 0;
    ctx.bus.emit(EV.GOLD_CHANGED, { delta: -(gold | 0), total: w.gold, source: `shop:revoke:${orderId}` });
    return { ok: true, gold };
  }, { authoritative: true });

  // Rückkehr von der Bezahlseite: Parameter merken und aus der Adresszeile entfernen.
  let returned = null;
  try {
    const url = new URL(window.location.href);
    const r = url.searchParams.get(RETURN_PARAM);
    if (r) {
      returned = r === 'erfolg' ? 'ok' : 'cancel';
      url.searchParams.delete(RETURN_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch { /* egal */ }

  let session = null;
  let admin = false;
  let loading = null;
  let claiming = null;
  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn());

  const online = () => game.online;
  const isOnlineChar = () => !!online()?.user && online().isOnlineAccount(state.meta.accountId) && !!state.meta.characterId;

  const shop = {
    status: null,
    returned,
    get visible() { return !!this.status && (this.status.enabled || admin); },
    get admin() { return admin; },
    get canBuy() { return !!this.status && isOnlineChar() && (this.status.enabled || (admin && this.status.configured)); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    owns(designId) {
      const d = DESIGNS.find((x) => x.id === designId);
      return !!d && d.items.every((k) => state.slices.shop?.owned?.includes(k));
    },

    refresh() {
      loading ??= (async () => {
        try {
          const r = await fetch('/net/shop/status', { headers: { accept: 'application/json' } });
          shop.status = r.ok ? await r.json() : null;
        } catch { shop.status = null; }
        admin = online()?.user ? await online().isAdmin().catch(() => false) : false;
        changed();
        return shop.visible;
      })().finally(() => { loading = null; });
      return loading;
    },

    open() { session?.panels.open('goldshop'); },

    // Weiter zur Bezahlseite. Vorher speichern, damit beim Zurückkommen nichts fehlt.
    async checkout(productId) {
      if (!isOnlineChar()) throw new Error('Kaufen geht nur mit einem Charakter in deinem Konto.');
      const token = await online().client.getAccessToken();
      game.saveNow('shop');
      try { await online().sync.flush(); } catch { /* Cloud holt es nach */ }
      const r = await fetch('/net/shop/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, characterId: state.meta.characterId, waiver: true, from: 'game', lang: document.documentElement.lang?.startsWith('en') ? 'en' : 'de' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(CHECKOUT_ERRORS[d.error] ?? 'Die Bezahlseite ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.');
      window.location.assign(d.url);
    },

    // Bezahlte Bestellungen abholen, gutschreiben, speichern, dann bestätigen. Liefert das gutgeschriebene Gold.
    claim() {
      if (!isOnlineChar()) return Promise.resolve(0);
      claiming ??= (async () => {
        // Erst nach dem Abgleich beim Start buchen: übernimmt der Abgleich den Cloud-Stand, wäre die Buchung sonst weg.
        for (let i = 0; i < 60 && online().sync.status === 'syncing'; i++) await new Promise((r) => setTimeout(r, 250));
        const characterId = state.meta.characterId;
        const rpc = (fn, args) => online().client.rpc(fn, args);
        const [credits, revokes, designs] = await Promise.all([
          rpc('shop_pending_credits', { p_character: characterId }),
          rpc('shop_pending_revokes', { p_character: characterId }).catch(() => []), // Migration noch nicht ausgeführt
          rpc('shop_designs', {}).catch(() => null),
        ]);
        const list = Array.isArray(credits) ? credits : [];
        const back = Array.isArray(revokes) ? revokes : [];
        if (state.meta.characterId !== characterId) return 0;
        let designChange = false;
        if (Array.isArray(designs)) {
          const sl = state.slices.shop;
          const want = DESIGN_ITEMS.filter((k) => designs.includes(k));
          const ch = state.slices.character;
          const stale = ch?.mounts?.owned?.some((id) => DESIGN_ITEMS.includes(`mount:${id}`) && !want.includes(`mount:${id}`))
            || want.some((k) => k.startsWith('mount:') && !ch?.mounts?.owned?.includes(k.slice(6)));
          if (stale || want.join() !== (sl.owned ?? []).join()) {
            const r = state.commit('shop:designs', { items: want });
            designChange = !!r?.ok;
            const names = DESIGNS.filter((d) => d.items.some((k) => r?.added?.includes(k))).map((d) => d.name);
            if (names.length) {
              game.bus.emit(EV.UI_TOAST, { text: `Exklusives Design freigeschaltet: ${names.join(', ')}. Danke für deine Unterstützung!`, kind: 'loot' });
              shop.returned = null;
            }
          }
        }
        if (!list.length && !back.length) {
          if (designChange) { game.saveNow('shop'); online().sync.flush().catch(() => {}); }
          changed();
          return 0;
        }
        let gold = 0, taken = 0;
        for (const o of list) {
          const r = state.commit('shop:credit', { orderId: o.id, gold: o.gold });
          if (r?.ok) gold += o.gold;
        }
        for (const o of back) {
          const r = state.commit('shop:revoke', { orderId: o.id, gold: o.gold });
          if (r?.ok) taken += o.gold;
        }
        // Erst bestätigen, wenn der Stand lokal und in der Cloud gespeichert ist; sonst bleiben die Bestellungen offen
        // und kommen beim nächsten Start wieder (der Spielstand merkt sich, was schon verbucht ist).
        if ((gold || taken) && !game.saveNow('shop')) {
          game.bus.emit(EV.UI_TOAST, { text: 'Der Browser-Speicher ist voll. Bitte Speicher freigeben – die Buchung wird beim nächsten Start wiederholt.', kind: 'warn' });
          return gold - taken;
        }
        let uploaded = true;
        if (gold || taken) uploaded = await online().sync.flush().then(() => true, () => false);
        // Hat ein Abgleich den Spielstand inzwischen ersetzt, fehlen die Buchungen dort: dann nicht bestätigen (kommt wieder).
        const sl = state.slices.shop;
        const kept = state.meta.characterId === characterId && list.every((o) => sl.credited.includes(o.id)) && back.every((o) => sl.revoked.includes(o.id));
        if (!kept) return 0;
        if (uploaded) {
          if (list.length) await rpc('shop_confirm_credits', { p_ids: list.map((o) => o.id) }).catch(() => {});
          if (back.length) await rpc('shop_confirm_revokes', { p_ids: back.map((o) => o.id) }).catch(() => {});
        }
        if (gold) {
          game.bus.emit(EV.UI_TOAST, { text: `${gold.toLocaleString('de-DE')} Gold gutgeschrieben. Danke für deine Unterstützung!`, kind: 'loot', icon: 'gold' });
          shop.returned = null;
        }
        if (taken) {
          game.bus.emit(EV.UI_TOAST, { text: `Eine Zahlung wurde erstattet oder zurückgebucht. ${taken.toLocaleString('de-DE')} Gold wurden wieder abgezogen.`, kind: 'warn', icon: 'gold' });
        }
        return gold - taken;
      })().catch(() => 0).finally(() => { claiming = null; });
      return claiming;
    },
  };
  game.shop = shop;

  game.panels.register('goldshop', (s) => shopPanel(s, game, shop), { title: 'Shop' });

  // Pro Sitzung: beim Betreten Gutschriften abholen; nach der Rückkehr von Stripe mehrmals (Webhook kann kurz dauern).
  game.addSessionSystem('shop', (sess) => {
    session = sess;
    const timers = [];
    shop.refresh();
    shop.claim();
    if (shop.returned === 'ok') {
      sess.bus.emit(EV.UI_TOAST, { text: 'Zahlung erhalten. Dein Kauf wird gleich freigeschaltet.', kind: 'info', icon: 'gold' });
      for (const sec of RETRY_AFTER_RETURN_S) timers.push(setTimeout(() => { if (shop.returned === 'ok') shop.claim(); }, sec * 1000));
    } else if (shop.returned === 'cancel') {
      sess.bus.emit(EV.UI_TOAST, { text: 'Kauf abgebrochen. Es wurde nichts abgebucht.', kind: 'info' });
      shop.returned = null;
    }
    return { dispose: () => { timers.forEach(clearTimeout); if (session === sess) session = null; } };
  }, 20);

  game.bus.on(EV.ONLINE_CHANGED, () => { if (session) shop.refresh(); });
}

const CHECKOUT_ERRORS = {
  owned: 'Dieses Design gehört dir schon.',
  rate_limited: 'Zu viele Kaufversuche in kurzer Zeit. Bitte warte ein paar Minuten.',
  auth: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.',
  closed: 'Der Shop ist noch nicht geöffnet.',
  unavailable: 'Der Shop ist noch nicht geöffnet.',
  waiver: 'Bitte bestätige zuerst den Hinweis zum Widerrufsrecht.',
  blocked: 'Käufe sind für dein Konto gesperrt. Bitte wende dich an den Support.',
  revoke_pending: 'Eine erstattete Zahlung wird gerade verbucht. Bitte versuch es gleich noch einmal.',
};

function shopPanel(session, game, shop) {
  const root = h('div.pg-mount');
  let waiver = false;
  let busy = null; // productId während der Weiterleitung
  let error = null;
  const previews = new Map(); // designId → Vorschau mit dem eigenen Helden auf dem Reittier

  let nudge = false; // Kauf ohne Häkchen versucht → Hinweis hervorheben

  const buyButton = (id, label) => h('button.ef-btn.primary.sh-buy', {
    type: 'button',
    disabled: !(shop.canBuy && !busy),
    onclick: async () => {
      if (!waiver) {
        nudge = true; draw();
        root.querySelector('.sh-waiver')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      busy = id; error = null; draw();
      try { await shop.checkout(id); } catch (e) { busy = null; error = e.message; draw(); }
    },
  }, busy === id ? 'Weiter …' : label);

  const preview = (d) => {
    if (!previews.has(d.id)) previews.set(d.id, designPreview(game, session, d));
    return previews.get(d.id).canvas;
  };

  const render = () => {
    const st = shop.status;
    const gold = session.state.slices.wallet?.gold ?? 0;
    const charName = session.state.slices.character?.name ?? 'deinen Charakter';
    const products = st?.products ?? GOLD_PACKS.map((p) => ({ ...p, total: packTotal(p) }));

    let notice = null;
    if (!st) notice = h('p.sh-notice', 'Der Shop lädt …');
    else if (!game.online?.user) notice = h('p.sh-notice', 'Melde dich mit deinem Konto an, um im Shop zu kaufen.');
    else if (!st.enabled && shop.admin) notice = h('p.sh-notice.sh-admin', st.configured
      ? 'Admin-Vorschau: Für Spieler noch geschlossen.'
      : 'Admin-Vorschau: Stripe ist noch nicht eingerichtet.');
    else if (!st.enabled) notice = h('p.sh-notice', 'Der Shop öffnet in Kürze.');

    const designs = DESIGNS.map((d) => {
      const owned = shop.owns(d.id);
      return h(`div.sh-design${d.tag ? '.tagged' : ''}${owned ? '.owned' : ''}`,
        d.tag ? h('span.sh-tag', d.tag) : null,
        h('div.sh-stage', preview(d)),
        h('div.sh-dname', d.name),
        owned ? h('div.sh-owned', 'Gehört dir') : buyButton(d.id, `Kaufen · ${formatPrice(d.priceCents)}`));
    });

    const cards = products.map((p) => h(`div.sh-pack${p.tag ? '.tagged' : ''}`,
      p.tag ? h('span.sh-tag', p.tag) : null,
      h('div.sh-coins', iconEl('gold', 40)),
      h('div.sh-amount', p.total.toLocaleString()),
      h('div.sh-unit', 'Gold'),
      p.bonus ? h('div.sh-bonus', `inkl. ${p.bonus.toLocaleString()} Bonus`) : h('div.sh-bonus.none', ' '),
      buyButton(p.id, `Kaufen · ${formatPrice(p.priceCents)}`),
    ));

    return panelFrame(session, 'goldshop', 'Shop', h('div.pg-scroll.sh-body',
      h('div.sh-balance', h('span', 'Dein Gold'), goldEl(gold)),
      notice,
      h('h3.sh-head', 'Exklusive Designs'),
      h('p.sh-sub', 'Reittier mit Färbung, für alle deine Charaktere.'),
      h('div.sh-designs', designs),
      h('h3.sh-head', 'Gold'),
      h('p.sh-sub', `Für ${charName}.`),
      h('div.sh-grid', cards),
      error ? h('p.sh-error', { role: 'alert' }, error) : null,
      h(`label.sh-waiver${nudge && !waiver ? '.nudge' : ''}`,
        h('input', { type: 'checkbox', checked: waiver, onchange: (e) => { waiver = e.target.checked; nudge = false; draw(); } }),
        h('span', WAIVER_TEXT),
      ),
      h('p.ef-note.sh-legal',
        h('a', { href: TERMS_PATH, target: '_blank', rel: 'noopener' }, 'Kaufbedingungen'), ' · ',
        MINOR_NOTE, ' · ', PRICE_NOTE, ' · ',
        h('a', { href: '/impressum', target: '_blank', rel: 'noopener' }, 'Impressum'), ' · ',
        h('a', { href: '/support', target: '_blank', rel: 'noopener' }, 'Hilfe zu Käufen'),
      ),
    ));
  };
  const draw = () => root.replaceChildren(render());
  const off = shop.onChange(draw);
  const offState = session.bus.on(EV.STATE_CHANGED, (e) => { if (e.type === 'wallet:addGold' || e.type === 'shop:credit' || e.type === 'shop:designs') draw(); });
  draw();
  shop.refresh();
  shop.claim();
  return {
    root,
    update: (dt) => { for (const p of previews.values()) p.update(dt); },
    dispose: () => { off(); offState(); },
  };
}

// Der eigene Held mit Ausrüstung und Design-Färbung auf dem exklusiven Reittier, laufend, mit Leuchten.
const PREVIEW_W = 136, PREVIEW_H = 100; // Spielpixel × 2 (Feinpixel)
function designPreview(game, session, design) {
  const canvas = h('canvas.sh-preview', { width: PREVIEW_W, height: PREVIEW_H, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const mountId = design.items.find((k) => k.startsWith('mount:'))?.slice(6);
  const dye = design.items.find((k) => k.startsWith('dye:'))?.slice(4) ?? null;
  const sl = session.state.slices;
  let anim = null;
  try {
    anim = game.character?.animsForLook?.({
      raceId: sl.character?.raceId, classId: sl.character?.classId, mountId,
      appearance: { ...(sl.character?.appearance ?? {}), dye },
      gear: resolveGear(sl.inventory?.equipment, session.content),
    }, 2)?.rideRun ?? null;
  } catch { anim = null; }
  let t = 0, shown = -1;
  const paint = () => {
    if (!anim?.frames?.length) return;
    const i = Math.floor(t * (anim.fps || 8)) % anim.frames.length;
    if (i === shown) return;
    shown = i;
    const fr = anim.frames[i];
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    ctx.save(); ctx.scale(2, 2); fr.draw(ctx, PREVIEW_W / 4, PREVIEW_H / 2 - 4, {}); ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of fr.glows ?? []) {
      const r = g.r * 4, x = PREVIEW_W / 2 + g.x * 2, y = PREVIEW_H - 8 + g.y * 2;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `${g.color}99`); grad.addColorStop(1, `${g.color}00`);
      ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  paint();
  return { canvas, update: (dt) => { t += dt; paint(); } };
}
