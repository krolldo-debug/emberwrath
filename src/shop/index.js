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
//   claim()       bezahlte Bestellungen des aktuellen Charakters gutschreiben → Promise<Gold>
// Panel 'goldshop' (Menü-Knopf „Shop“, Klick auf den Goldbetrag im HUD).
// Slice 'shop' { credited: [orderId] } verhindert doppelte Gutschrift, Command 'shop:credit' { orderId, gold }.
// Gold kommt nur über bezahlte Bestellungen in der Datenbank ins Spiel (Webhook von Stripe → 'paid').
const CREDITED_KEEP = 200;
const RETRY_AFTER_RETURN_S = [3, 8, 15, 30, 60, 120];

export function installShop(game) {
  const state = game.state;
  state.defineSlice('shop', {
    create: () => ({ credited: [] }),
    deserialize: (raw) => ({ credited: Array.isArray(raw?.credited) ? raw.credited.slice(-CREDITED_KEEP) : [] }),
  });
  state.defineCommand('shop:credit', (s, { orderId, gold }) => {
    const sl = s.get('shop');
    if (typeof orderId !== 'string' || !(gold > 0) || sl.credited.includes(orderId)) return { ok: false };
    sl.credited.push(orderId);
    if (sl.credited.length > CREDITED_KEEP) sl.credited.splice(0, sl.credited.length - CREDITED_KEEP);
    s.commit('wallet:addGold', { amount: gold | 0, source: `shop:${orderId}` });
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
        const characterId = state.meta.characterId;
        const list = await online().client.rpc('shop_pending_credits', { p_character: characterId });
        if (!Array.isArray(list) || !list.length || state.meta.characterId !== characterId) return 0;
        let gold = 0;
        for (const o of list) {
          const r = state.commit('shop:credit', { orderId: o.id, gold: o.gold });
          if (r?.ok) gold += o.gold;
        }
        // Erst bestätigen, wenn das Gold sicher gespeichert ist; sonst bleibt die Bestellung offen und kommt beim nächsten Start wieder.
        if (gold && !game.saveNow('shop')) {
          game.bus.emit(EV.UI_TOAST, { text: 'Gold erhalten, aber der Browser-Speicher ist voll. Bitte Speicher freigeben – die Gutschrift wird beim nächsten Start wiederholt.', kind: 'warn' });
          return gold;
        }
        if (gold) await online().sync.flush().catch(() => {});
        await online().client.rpc('shop_confirm_credits', { p_ids: list.map((o) => o.id) }).catch(() => {});
        if (gold) {
          game.bus.emit(EV.UI_TOAST, { text: `${gold.toLocaleString('de-DE')} Gold gutgeschrieben. Danke für deine Unterstützung!`, kind: 'loot', icon: 'gold' });
          shop.returned = null;
        }
        return gold;
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
