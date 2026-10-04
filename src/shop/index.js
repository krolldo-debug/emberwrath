import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl } from '../gfx/Icons.js';
import { panelFrame, goldEl } from '../progression/widgets.js';
import { GOLD_PACKS, packTotal, formatPrice, RETURN_PARAM } from './catalog.js';

// Gold-Shop: Gold-Pakete für Echtgeld (Bezahlung über Stripe, Worker worker/shop.js, Einrichtung docs/SHOP.md).
//
// game.shop
//   status        { enabled, configured, products } vom Server oder null (noch nicht geladen / nicht erreichbar)
//   visible       true, wenn der Shop für dieses Konto sichtbar ist (freigeschaltet oder Admin-Vorschau)
//   refresh()     Status und Admin-Recht neu laden → Promise<visible>
//   open()        Panel 'goldshop' in der laufenden Sitzung öffnen
//   claim()       bezahlte Bestellungen des aktuellen Charakters gutschreiben, erstattete/zurückgebuchte wieder
//                 abziehen → Promise<Gold> (Saldo der Gutschriften)
// Panel 'goldshop' (Menü-Knopf „Shop“, Klick auf den Goldbetrag im HUD).
// Slice 'shop' { credited: [orderId], revoked: [orderId] } verhindert doppelte Gutschrift und doppelten Abzug.
// Commands 'shop:credit' { orderId, gold } und 'shop:revoke' { orderId, gold } (Rückbuchung, Gold darf ins Minus).
// Gold kommt nur über bezahlte Bestellungen in der Datenbank ins Spiel (Webhook von Stripe → 'paid').
const CREDITED_KEEP = 200;
const RETRY_AFTER_RETURN_S = [3, 8, 15, 30, 60, 120];

export function installShop(game) {
  const state = game.state;
  state.defineSlice('shop', {
    create: () => ({ credited: [], revoked: [] }),
    deserialize: (raw) => ({
      credited: Array.isArray(raw?.credited) ? raw.credited.slice(-CREDITED_KEEP) : [],
      revoked: Array.isArray(raw?.revoked) ? raw.revoked.slice(-CREDITED_KEEP) : [],
    }),
  });
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
      if (!isOnlineChar()) throw new Error('Gold kaufen geht nur mit einem Charakter in deinem Konto.');
      const token = await online().client.getAccessToken();
      game.saveNow('shop');
      try { await online().sync.flush(); } catch { /* Cloud holt es nach */ }
      const r = await fetch('/net/shop/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, characterId: state.meta.characterId, waiver: true }),
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
        const [credits, revokes] = await Promise.all([
          rpc('shop_pending_credits', { p_character: characterId }),
          rpc('shop_pending_revokes', { p_character: characterId }).catch(() => []), // Migration noch nicht ausgeführt
        ]);
        const list = Array.isArray(credits) ? credits : [];
        const back = Array.isArray(revokes) ? revokes : [];
        if ((!list.length && !back.length) || state.meta.characterId !== characterId) return 0;
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
      sess.bus.emit(EV.UI_TOAST, { text: 'Zahlung erhalten. Dein Gold wird gleich gutgeschrieben.', kind: 'info', icon: 'gold' });
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

  const render = () => {
    const st = shop.status;
    const gold = session.state.slices.wallet?.gold ?? 0;
    const charName = session.state.slices.character?.name ?? 'deinen Charakter';
    const products = st?.products ?? GOLD_PACKS.map((p) => ({ ...p, total: packTotal(p) }));

    let notice = null;
    if (!st) notice = h('p.sh-notice', 'Der Shop lädt …');
    else if (!game.online?.user) notice = h('p.sh-notice', 'Melde dich mit deinem Konto an, um Gold zu kaufen.');
    else if (!st.enabled && shop.admin) notice = h('p.sh-notice.sh-admin', st.configured
      ? 'Admin-Vorschau: Für Spieler ist der Shop noch geschlossen. Käufe gehen nur mit deinem Admin-Konto.'
      : 'Admin-Vorschau: Zahlungen sind noch nicht eingerichtet (Stripe-Schlüssel fehlen, siehe docs/SHOP.md).');
    else if (!st.enabled) notice = h('p.sh-notice', 'Der Shop öffnet in Kürze.');

    const canBuy = shop.canBuy && !busy;
    const cards = products.map((p) => h(`div.sh-pack${p.tag ? '.tagged' : ''}`,
      p.tag ? h('span.sh-tag', p.tag) : null,
      h('div.sh-coins', iconEl('gold', 40)),
      h('div.sh-amount', p.total.toLocaleString('de-DE')),
      h('div.sh-unit', 'Gold'),
      p.bonus ? h('div.sh-bonus', `inkl. ${p.bonus.toLocaleString('de-DE')} Bonus`) : h('div.sh-bonus.none', ' '),
      h('button.ef-btn.primary.sh-buy', {
        type: 'button',
        disabled: !canBuy || !waiver,
        title: !waiver ? 'Bitte zuerst den Hinweis unten bestätigen' : null,
        onclick: async () => {
          busy = p.id; error = null; draw();
          try { await shop.checkout(p.id); } catch (e) { busy = null; error = e.message; draw(); }
        },
      }, busy === p.id ? 'Weiter …' : formatPrice(p.priceCents)),
    ));

    return panelFrame(session, 'goldshop', 'Shop', h('div.pg-scroll.sh-body',
      h('div.sh-balance', h('span', 'Dein Gold'), goldEl(gold)),
      notice,
      h('label.sh-waiver',
        h('input', { type: 'checkbox', checked: waiver, onchange: (e) => { waiver = e.target.checked; draw(); } }),
        h('span', 'Ich möchte, dass das Gold sofort gutgeschrieben wird, und weiß, dass ich damit mein Widerrufsrecht verliere.'),
      ),
      h('div.sh-grid', cards),
      error ? h('p.sh-error', { role: 'alert' }, error) : null,
      h('p.ef-note.sh-legal',
        `Das Gold geht an ${charName}. Preise inklusive Mehrwertsteuer. Bezahlung sicher über Stripe. `,
        h('a', { href: '/impressum', target: '_blank', rel: 'noopener' }, 'Impressum'), ' · ',
        h('a', { href: '/support', target: '_blank', rel: 'noopener' }, 'Hilfe zu Käufen'),
      ),
    ));
  };
  const draw = () => root.replaceChildren(render());
  const off = shop.onChange(draw);
  const offState = session.bus.on(EV.STATE_CHANGED, (e) => { if (e.type === 'wallet:addGold' || e.type === 'shop:credit') draw(); });
  draw();
  shop.refresh();
  shop.claim();
  return { root, dispose: () => { off(); offState(); } };
}
