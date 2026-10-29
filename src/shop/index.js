import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl } from '../gfx/Icons.js';
import { panelFrame, goldEl } from '../progression/widgets.js';
import { resolveGear } from '../character/gearLook.js';
import { GOLD_PACKS, DESIGNS, DESIGN_ITEMS, packTotal, formatPrice, RETURN_PARAM, PRICE_NOTE, TERMS_PATH, WAIVER_TEXT, MINOR_NOTE, isSetDesign, SET_CLASS_NAMES, appleProductId, fromAppleProductId } from './catalog.js';
import { SET_ITEMS, ownedSetLooks, findSkinSet } from '../character/skinSets.js';
import { drawSetGlow, drawSetEmit } from '../sprites/heroSets.js';
import { fmtNum } from '../i18n/index.js';
import { inApp } from '../app/native.js';
import { hasAppStore, appStore } from '../app/store.js';

// Shop: Gold-Pakete und exklusive Designs für Echtgeld (Bezahlung über Stripe, Worker worker/shop.js, Einrichtung docs/SHOP.md).
// In der iOS-App bezahlt man stattdessen über den App Store (src/app/store.js): Kauf bei Apple → Worker prüft die Signatur
// und trägt die Bestellung als bezahlt ein (/net/shop/apple) → Kauf bei Apple abschließen → Gutschrift wie bei Stripe.
// Ohne App-Store-Baustein (App 1.0) oder ohne freigegebene Produkte bleibt der Shop in der App verborgen.
//
// game.shop
//   status        { enabled, configured, products } vom Server oder null (noch nicht geladen / nicht erreichbar)
//   visible       true, wenn der Shop für dieses Konto sichtbar ist (freigeschaltet oder Admin-Vorschau)
//   refresh()     Status und Admin-Recht neu laden → Promise<visible>
//   open()        Panel 'goldshop' in der laufenden Sitzung öffnen
//   claim()       bezahlte Bestellungen des aktuellen Charakters gutschreiben, erstattete/zurückgebuchte wieder
//                 abziehen, gekaufte Designs übernehmen → Promise<Gold> (Saldo der Gutschriften)
//   owns(designId) true, wenn das Design zum Konto gehört (laut Spielstand, vom Server abgeglichen)
//   appStore      true in der App: Preise von Apple (applePrice(id)), Käufe über Apple, restore() für „Käufe wiederherstellen“
// Panel 'goldshop' (Menü-Knopf „Shop“, Klick auf den Goldbetrag im HUD).
// Slice 'shop' { credited: [orderId], revoked: [orderId], owned: ['mount:<id>'|'dye:<id>'|'look:<setId>'] }: credited/revoked verhindern
// doppelte Gutschrift und doppelten Abzug; owned sind die bezahlten Designs des Kontos (Server: shop_designs()).
// Command 'shop:designs' { items } gleicht Designs ab: exklusive Reittiere lernen bzw. entfernen, Färbung zurücksetzen,
// angelegte Teile eines nicht mehr bezahlten Skinsets aus der Garderobe nehmen.
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
    const shown = ch.wardrobe?.shown, keep = ownedSetLooks({ shop: sl });
    if (shown && Object.values(shown).some((id) => SET_ITEMS[id] && !keep.has(id))) {
      ch.wardrobe.shown = Object.fromEntries(Object.entries(shown).map(([k, id]) => [k, SET_ITEMS[id] && !keep.has(id) ? null : id]));
    }
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
  let applePrices = null; // App: Katalog-ID → Preis laut App Store (nur Produkte, die Apple freigegeben hat)
  let appleSyncing = null;
  let loading = null;
  let claiming = null;
  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn());

  const online = () => game.online;
  const isOnlineChar = () => !!online()?.user && online().isOnlineAccount(state.meta.accountId) && !!state.meta.characterId;

  // App Store: bezahlte Käufe dem Server melden; was er bestätigt (oder dauerhaft ablehnt), bei Apple abschließen.
  // → Zahl der gutgeschriebenen Käufe. Nicht bestätigte bleiben bei Apple offen und kommen beim nächsten Abgleich wieder.
  const appleSubmit = async (entries) => {
    if (!entries.length || !isOnlineChar()) return 0;
    const token = await online().client.getAccessToken();
    let credited = 0;
    for (let i = 0; i < entries.length; i += 20) {
      const part = entries.slice(i, i + 20);
      const r = await fetch('/net/shop/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ transactions: part.map((e) => e.jws), characterId: state.meta.characterId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.results)) throw new Error(d.error ?? 'server');
      for (const [k, res] of d.results.entries()) {
        if (res?.done && part[k]) await appStore.finish(part[k].transactionId).catch(() => {});
        if (res?.ok) credited++;
      }
    }
    return credited;
  };

  const shop = {
    status: null,
    returned,
    get appStore() { return inApp(); },
    // In der App nur über den App Store (Apple-Richtlinie 3.1.1), sonst über Stripe.
    get visible() {
      if (inApp()) return !!applePrices?.size && !!this.status && (this.status.apple || admin);
      return !!this.status && (this.status.enabled || admin);
    },
    get admin() { return admin; },
    get canBuy() {
      if (inApp()) return this.visible && isOnlineChar();
      return !!this.status && isOnlineChar() && (this.status.enabled || (admin && this.status.configured));
    },
    applePrice(id) { return applePrices?.get(id) ?? null; },
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
        if (hasAppStore() && !applePrices?.size) {
          const ids = [...GOLD_PACKS, ...DESIGNS].map((p) => appleProductId(p.id));
          const list = await appStore.products(ids).catch(() => []);
          applePrices = new Map(list.map((p) => [fromAppleProductId(p.id)?.id, p.displayPrice]).filter(([k, v]) => k && v));
        }
        changed();
        return shop.visible;
      })().finally(() => { loading = null; });
      return loading;
    },

    open() { session?.panels.open('goldshop'); },

    // Kauf über den App Store. → 'ok' | 'pending' | 'cancel'
    async appleBuy(productId) {
      if (!isOnlineChar()) throw new Error('Kaufen geht nur mit einem Charakter in deinem Konto.');
      game.saveNow('shop');
      let r;
      try { r = await appStore.purchase(appleProductId(productId), online().user?.id); } catch { r = null; }
      if (r?.status === 'cancel') return 'cancel';
      if (r?.status === 'pending') {
        game.bus.emit(EV.UI_TOAST, { text: 'Dein Kauf wartet noch auf eine Bestätigung, zum Beispiel durch deine Eltern. Danach wird er automatisch freigeschaltet.', kind: 'info' });
        return 'pending';
      }
      if (r?.status !== 'ok' || !r.jws) throw new Error('Der Kauf konnte nicht abgeschlossen werden. Bitte versuch es gleich noch einmal.');
      const n = await appleSubmit([{ jws: r.jws, transactionId: r.transactionId }]).catch(() => 0);
      if (!n) {
        game.bus.emit(EV.UI_TOAST, { text: 'Kauf erhalten. Die Freischaltung wird beim nächsten Start nachgeholt.', kind: 'info', icon: 'gold' });
        return 'ok';
      }
      await shop.claim();
      return 'ok';
    },

    // App: bezahlte, noch nicht bestätigte Käufe nachreichen (Absturz, Funkloch, Erlaubnis der Eltern kam später).
    appleSync() {
      if (!hasAppStore() || !isOnlineChar()) return Promise.resolve(0);
      appleSyncing ??= appStore.unfinished().then(appleSubmit)
        .then(async (n) => { if (n) await shop.claim(); return n; })
        .catch(() => 0).finally(() => { appleSyncing = null; });
      return appleSyncing;
    },

    // App: „Käufe wiederherstellen“ (Designs, die mit dieser Apple-ID für dieses Konto gekauft wurden).
    async restore() {
      const list = await appStore.restore().catch(() => null);
      if (!list) throw new Error('Der App Store ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.');
      await appleSubmit(list).catch(() => 0);
      await shop.claim();
      game.bus.emit(EV.UI_TOAST, { text: list.length ? 'Deine Käufe sind wiederhergestellt.' : 'Für diese Apple-ID wurden keine Käufe gefunden.', kind: 'info' });
    },

    // Weiter zur Bezahlseite. Vorher speichern, damit beim Zurückkommen nichts fehlt.
    async checkout(productId) {
      if (inApp()) return this.appleBuy(productId);
      if (!isOnlineChar()) throw new Error('Kaufen geht nur mit einem Charakter in deinem Konto.');
      const token = await online().client.getAccessToken();
      game.saveNow('shop');
      try { await online().sync.flush(); } catch { /* Cloud holt es nach */ }
      const r = await fetch('/net/shop/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, characterId: state.meta.characterId, waiver: true, from: 'game', lang: document.documentElement.lang === 'de' ? 'de' : 'en' }),
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
          game.bus.emit(EV.UI_TOAST, { text: `${fmtNum(gold)} Gold gutgeschrieben. Danke für deine Unterstützung!`, kind: 'loot', icon: 'gold' });
          shop.returned = null;
        }
        if (taken) {
          game.bus.emit(EV.UI_TOAST, { text: `Eine Zahlung wurde erstattet oder zurückgebucht. ${fmtNum(taken)} Gold wurden wieder abgezogen.`, kind: 'warn', icon: 'gold' });
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
    shop.appleSync();
    // App kommt aus dem Hintergrund (z. B. nach der Erlaubnis der Eltern): offene App-Store-Käufe nachreichen.
    const onVisible = () => { if (document.visibilityState === 'visible') shop.appleSync(); };
    if (hasAppStore()) document.addEventListener('visibilitychange', onVisible);
    if (shop.returned === 'ok') {
      sess.bus.emit(EV.UI_TOAST, { text: 'Zahlung erhalten. Dein Kauf wird gleich freigeschaltet.', kind: 'info', icon: 'gold' });
      for (const sec of RETRY_AFTER_RETURN_S) timers.push(setTimeout(() => { if (shop.returned === 'ok') shop.claim(); }, sec * 1000));
    } else if (shop.returned === 'cancel') {
      sess.bus.emit(EV.UI_TOAST, { text: 'Kauf abgebrochen. Es wurde nichts abgebucht.', kind: 'info' });
      shop.returned = null;
    }
    return { dispose: () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      if (session === sess) session = null;
    } };
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

  // Preis: in der App laut App Store (Landeswährung), sonst aus dem Katalog
  const price = (id, cents) => (shop.appStore ? shop.applePrice(id) : formatPrice(cents));
  const buyButton = (id, label) => h('button.ef-btn.primary.sh-buy', {
    type: 'button',
    disabled: !(shop.canBuy && !busy),
    onclick: async () => {
      if (!waiver && !shop.appStore) { // im App Store gelten Apples Bedingungen, Apple fragt selbst nach
        nudge = true; draw();
        root.querySelector('.sh-waiver')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      busy = id; error = null; draw();
      try {
        await shop.checkout(id);
        if (shop.appStore) { busy = null; draw(); } // Stripe: Seite wechselt zur Bezahlseite
      } catch (e) { busy = null; error = e.message; draw(); }
    },
  }, busy === id ? 'Weiter …' : label);
  const restoreButton = () => h('button.ef-btn.sh-restore', {
    type: 'button',
    disabled: !!busy || !shop.canBuy,
    onclick: async () => {
      busy = 'restore'; error = null; draw();
      try { await shop.restore(); } catch (e) { error = e.message; }
      busy = null; draw();
    },
  }, busy === 'restore' ? 'Einen Moment …' : 'Käufe wiederherstellen');

  const preview = (d) => {
    if (!previews.has(d.id)) previews.set(d.id, designPreview(game, session, d));
    return previews.get(d.id).canvas;
  };

  const render = () => {
    const st = shop.status;
    const gold = session.state.slices.wallet?.gold ?? 0;
    const charName = session.state.slices.character?.name ?? 'deinen Charakter';
    const products = (st?.products ?? GOLD_PACKS.map((p) => ({ ...p, total: packTotal(p) })))
      .filter((p) => !shop.appStore || shop.applePrice(p.id));

    let notice = null;
    if (!st) notice = h('p.sh-notice', 'Der Shop lädt …');
    else if (!game.online?.user) notice = h('p.sh-notice', 'Melde dich mit deinem Konto an, um im Shop zu kaufen.');
    else if (shop.appStore && !st.apple && shop.admin) notice = h('p.sh-notice.sh-admin', 'Admin-Vorschau: Für Spieler noch geschlossen.');
    else if (shop.appStore) notice = null;
    else if (!st.enabled && shop.admin) notice = h('p.sh-notice.sh-admin', st.configured
      ? 'Admin-Vorschau: Für Spieler noch geschlossen.'
      : 'Admin-Vorschau: Stripe ist noch nicht eingerichtet.');
    else if (!st.enabled) notice = h('p.sh-notice', 'Der Shop öffnet in Kürze.');

    // Skinset nur der eigenen Klasse (die anderen zeigt die Website)
    const myClass = session.state.slices.character?.classId;
    const designs = DESIGNS.filter((d) => (!isSetDesign(d) || d.classId === myClass) && (!shop.appStore || shop.applePrice(d.id) || shop.owns(d.id))).map((d) => {
      const owned = shop.owns(d.id);
      return h(`div.sh-design${d.tag ? '.tagged' : ''}${owned ? '.owned' : ''}`,
        d.tag ? h('span.sh-tag', d.tag) : null,
        h('div.sh-stage', preview(d)),
        h('div.sh-dname', d.name),
        isSetDesign(d) ? h('div.sh-dkind', `Skinset · ${SET_CLASS_NAMES[d.classId] ?? ''}`) : null,
        owned ? h('div.sh-owned', 'Gehört dir') : buyButton(d.id, `Kaufen · ${price(d.id, d.priceCents)}`));
    });

    const cards = products.map((p) => h(`div.sh-pack${p.tag ? '.tagged' : ''}`,
      p.tag ? h('span.sh-tag', p.tag) : null,
      h('div.sh-coins', iconEl('gold', 40)),
      h('div.sh-amount', fmtNum(p.total)),
      h('div.sh-unit', 'Gold'),
      p.bonus ? h('div.sh-bonus', `inkl. ${fmtNum(p.bonus)} Bonus`) : h('div.sh-bonus.none', ' '),
      buyButton(p.id, `Kaufen · ${price(p.id, p.priceCents)}`),
    ));

    return panelFrame(session, 'goldshop', 'Shop', h('div.pg-scroll.sh-body',
      h('div.sh-balance', h('span', 'Dein Gold'), goldEl(gold)),
      notice,
      h('h3.sh-head', 'Exklusive Designs'),
      h('p.sh-sub', 'Für alle deine Charaktere.'),
      h('div.sh-designs', designs),
      h('h3.sh-head', 'Gold'),
      h('p.sh-sub', `Für ${charName}.`),
      h('div.sh-grid', cards),
      error ? h('p.sh-error', { role: 'alert' }, error) : null,
      shop.appStore ? h('div.sh-restore-row', restoreButton()) : null,
      shop.appStore ? h('p.ef-note.sh-legal',
        'Bezahlt wird über deinen Apple-Account. Es gelten die Bedingungen des App Store.', ' · ', MINOR_NOTE, ' · ',
        h('a', { href: '/impressum', target: '_blank', rel: 'noopener' }, 'Impressum'), ' · ',
        h('a', { href: '/support', target: '_blank', rel: 'noopener' }, 'Hilfe zu Käufen'),
      ) : null,
      shop.appStore ? null : h(`label.sh-waiver${nudge && !waiver ? '.nudge' : ''}`,
        h('input', { type: 'checkbox', checked: waiver, onchange: (e) => { waiver = e.target.checked; nudge = false; draw(); } }),
        h('span', WAIVER_TEXT),
      ),
      shop.appStore ? null : h('p.ef-note.sh-legal',
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
  shop.appleSync();
  return {
    root,
    update: (dt) => { for (const p of previews.values()) p.update(dt); },
    dispose: () => { off(); offState(); },
  };
}

// Der eigene Held mit Ausrüstung und Design-Färbung auf dem exklusiven Reittier, laufend, mit Leuchten.
const PREVIEW_W = 136, PREVIEW_H = 100; // Spielpixel × 2 (Feinpixel)
function designPreview(game, session, design) {
  if (isSetDesign(design)) return setPreview(game, session, design);
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

// Skinset am eigenen Helden (Rasse, Aussehen), stehend, mit pulsierenden Set-Leuchtpunkten (sprites/heroSets.js)
function setPreview(game, session, design) {
  const canvas = h('canvas.sh-preview', { width: PREVIEW_W, height: PREVIEW_H, 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sl = session.state.slices;
  const set = findSkinSet(design.items[0].slice(5));
  let anim = null;
  try {
    anim = game.character?.animsForLook?.({
      raceId: sl.character?.raceId, classId: set?.classId, appearance: sl.character?.appearance ?? {},
      gear: resolveGear(set?.pieces ?? {}, session.content),
    }, 2)?.idle ?? null;
  } catch { anim = null; }
  let t = 0;
  const X = PREVIEW_W / 4, Y = PREVIEW_H / 2 - 4;   // Fußpunkt in Spielpixeln
  const paint = () => {
    const fr = anim?.frames?.[Math.floor(t * (anim.fps || 6)) % anim.frames.length];
    if (!fr) return;
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    const r = fr.res ?? 1;
    ctx.drawImage(fr.canvas, Math.round(X * 2 - fr.ax * (2 / r)), Math.round(Y * 2 - fr.ay * (2 / r)), fr.canvas.width * (2 / r), fr.canvas.height * (2 / r));
    ctx.save(); ctx.scale(2, 2);
    drawSetEmit(ctx, fr.emit, X, Y, false, t);
    for (const g of fr.glows ?? []) if (g.orbit) drawSetGlow(ctx, g, X + g.x, Y + g.y, t, 2);
    ctx.restore();
  };
  paint();
  return { canvas, update: (dt) => { t += dt; paint(); } };
}
