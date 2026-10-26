import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { fmtNum, tr } from '../i18n/index.js';
import { ITEMS } from '../progression/items.js';
import { panelFrame, itemDetail, actionBtn, attachTip, hideTip } from '../progression/widgets.js';
import { frameUrl, pixelTitle } from '../ui/pixelFrame.js';
import { CATEGORIES, DURATIONS, MAX_ACTIVE, PRICE_MAX, FEE_RATE, TRADE_MIN_LEVEL, tradeable, minBid, proceedsOf, listStack } from './rules.js';

// Fenster des Auktionators: Kaufen · Verkaufen · Gebote (Erlöse und gekaufte Ware kommen ins Postfach, src/mail). Daten und Buchungen über game.market (index.js).
// Warengruppen als Bildleiste (Symbol aus dem Item-Atlas), Seltenheit als drei Edelsteine, Sortierung als Umschalter.
// Ein Pixelraster im ganzen Fenster: Rahmen, Titel, Edelsteine, Münzen und Item-Symbole alle 2-fach (market.css).
const CAT_ICONS = { weapon: 'sword_steel', armor: 'mail_chain', jewelry: 'ring_ruby', consumable: 'potion_hp_m', material: 'ore_ember', mount: 'mount_ash_wolf' };
const RARITY_GEMS = [[2, 'rare', 'Ab Selten'], [3, 'epic', 'Ab Episch'], [4, 'legendary', 'Nur Legendär']];
const SORTS = [['new', 'Neueste'], ['price', 'Günstigste'], ['ending', 'Endet bald']];
const GEM_COLORS = {
  rare: ['#14060a', '#163070', '#2a58b8', '#5a98f0', '#c0e0ff'],
  epic: ['#14060a', '#3a1466', '#6a2cb0', '#a060f0', '#e8c8ff'],
  legendary: ['#14060a', '#7a2208', '#c8640c', '#f0a01c', '#ffe8a0'],
  off: ['#14060a', '#241820', '#34262e', '#4a3a42', '#6a5a60'],
};
// Edelstein 9×9 als Pixelbild (Umriss, Schatten unten rechts, Glanz oben links), Anzeige 2-fach
const gems = new Map();
function gemUrl(kind) {
  if (gems.has(kind)) return gems.get(kind);
  const [k, d, m, l, w] = GEM_COLORS[kind];
  const c = document.createElement('canvas'); c.width = c.height = 9;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const r = Math.abs(x - 4) + Math.abs(y - 4);
    if (r > 4) continue;
    ctx.fillStyle = r === 4 ? k : (x + y <= 5 && r >= 2) ? l : (x + y >= 10) ? d : m;
    if (r < 4 && x === 3 && y === 2) ctx.fillStyle = w;
    ctx.fillRect(x, y, 1, 1);
  }
  gems.set(kind, c.toDataURL());
  return gems.get(kind);
}

// Münze 7×7 für Goldbeträge im Fenster (2-fach = 14 px, passt zur Schrift statt des verkleinerten Item-Symbols)
let coin = null;
function coinUrl() {
  if (coin) return coin;
  const rows = ['..kkk..', '.kyyyk.', 'kyywyok', 'kywyyok', 'kyyyook', '.koodk.', '..kkk..'];
  const col = { k: '#14060a', y: '#f0b030', w: '#fff0b0', o: '#c87818', d: '#7a4410' };
  const c = document.createElement('canvas'); c.width = c.height = 7;
  const ctx = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { ctx.fillStyle = col[ch]; ctx.fillRect(x, y, 1, 1); } }));
  coin = c.toDataURL();
  return coin;
}
export const coinEl = () => h('img.mk-coin', { src: coinUrl(), width: 14, height: 14, alt: '' });
export const goldEl = (amount, cls = '') => h(`span.pg-gold.mk-gold${cls}`, coinEl(), h('b', fmtNum(Number(amount))));

let names = null;
// Handelbare Gegenstände, deren Name (deutsch oder in der Anzeigesprache) den Suchtext enthält; leer → null (alle)
function searchItems(text) {
  const q = String(text ?? '').trim().toLowerCase();
  if (!q) return null;
  names ??= Object.entries(ITEMS).filter(([, d]) => tradeable(d)).map(([id, d]) => [id, d.name.toLowerCase()]);
  return names.filter(([id, n]) => n.includes(q) || tr(ITEMS[id].name).toLowerCase().includes(q)).map(([id]) => id);
}

function timeLeft(endsAt, now) {
  const min = Math.ceil((Date.parse(endsAt) - now) / 60000);
  if (min <= 0) return 'beendet';
  if (min < 60) return `noch ${fmtNum(min)} Min.`;
  return `noch ${fmtNum(Math.floor(min / 60))} Std.`;
}

const num = (v) => {
  const n = Math.floor(Number(String(v ?? '').replace(/[^\d]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function marketPanel(session, game, market) {
  const root = h('div.pg-mount');
  let tab = 'buy', err = '';
  // Kaufen
  const filter = { q: '', category: '', rarity: 0, sort: 'new', mine: false };
  let rows = [], more = false, loading = false, loadErr = null, sel = null, bidText = '', searchTimer = 0, gen = 0;
  // Verkaufen
  let pick = null; // { kind: 'slot'|'mat'|'mount', itemId, max }
  const form = { qty: 1, start: '', buyout: '', hours: 24 };
  let working = false;

  const st = () => session.state.slices;
  const content = session.content;
  // Erfolg als Meldung im Spiel, Fehler direkt im Fenster (dort, wo gerade geklickt wurde)
  const say = (text, isBad = false) => {
    err = isBad ? text : '';
    if (text && !isBad) session.bus.emit(EV.UI_TOAST, { text, kind: 'info', icon: 'gold' });
  };
  const errEl = () => (err ? h('p.mk-err', { role: 'alert' }, err) : null);

  async function load(append = false) {
    if (!market.ready) { rows = []; return draw(); }
    const items = searchItems(filter.q);
    if (items && !items.length) { rows = []; more = false; loading = false; return draw(); }
    const my = ++gen;
    loading = true; loadErr = null; draw();
    try {
      const r = await market.browse({
        category: filter.category || null, minRarity: filter.rarity, items, sort: filter.sort,
        classId: filter.mine ? st().character?.classId ?? null : null, maxLevel: filter.mine ? st().progress?.level ?? null : null,
        offset: append ? rows.length : 0,
      });
      if (my !== gen) return;
      rows = append ? [...rows, ...r.rows] : r.rows;
      more = r.more;
      if (sel && !rows.some((x) => x.id === sel)) sel = null;
    } catch (e) {
      if (my !== gen) return;
      loadErr = e.message;
    }
    loading = false;
    draw();
  }

  async function run(action, done) {
    if (working) return;
    working = true; say(''); draw();
    try {
      const r = await action();
      say(done(r));
    } catch (e) { say(e.message, true); }
    working = false;
    draw();
  }

  // ------------------------------------------------------------------ Kaufen
  const listingName = (l) => {
    const def = content.find('item', l.itemId);
    return def ? h(`span.r-${def.rarity}`, def.name) : h('span', l.itemId);
  };
  // Links Zustand und Restzeit, rechts immer ein Preis: Sofortkauf, sonst Höchst- oder Startgebot
  const priceLine = (l) => (l.buyout == null ? 'Nur Gebote' : l.bid != null ? `Gebot ${fmtNum(l.bid)}` : l.startBid != null ? `Startgebot ${fmtNum(l.startBid)}` : 'Nur Sofortkauf');
  const priceEl = (l) => (l.buyout != null ? h('span.mk-price', h('small', 'Sofortkauf'), goldEl(l.buyout))
    : h('span.mk-price.bid', h('small', l.bid != null ? 'Gebot' : 'Startgebot'), goldEl(l.bid ?? l.startBid ?? 0)));

  function listingRow(l, now, onclick, right = null) {
    const def = content.find('item', l.itemId);
    const row = h(`li.pg-stock-row.mk-row${sel === l.id ? '.selected' : ''}${l.mine ? '.mine' : ''}`, { onclick },
      h('span.mk-icon', def ? itemIconEl({ ...def, name: null }, 52) : null, l.qty > 1 ? h('span.pg-qty', fmtNum(l.qty)) : null),
      h('div.pg-stock-name', listingName(l),
        h('small', l.top ? `${priceLine(l)} · du führst · ${timeLeft(l.endsAt, now)}` : `${priceLine(l)} · ${timeLeft(l.endsAt, now)}`)),
      right ?? priceEl(l));
    if (def && sel !== l.id) attachTip(row, () => itemDetail(content, l.itemId, detailOpts(true)));
    return row;
  }
  const detailOpts = (compact) => ({ equipment: st().inventory?.equipment ?? {}, level: st().progress?.level ?? 1, classId: st().character?.classId, compact });

  function buyView(now) {
    const gold = st().wallet?.gold ?? 0;
    const catBtn = (id, label, icon) => h(`button.mk-cat${filter.category === id ? '.on' : ''}`, {
      type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(filter.category === id),
      onclick: () => { filter.category = filter.category === id && id ? '' : id; load(); },
    }, iconEl(icon, 52));
    const cats = h('div.mk-cats', { role: 'group', 'aria-label': 'Warengruppe' },
      catBtn('', 'Alle Waren', 'bag'), CATEGORIES.map(([id, label]) => catBtn(id, label, CAT_ICONS[id])));
    const rar = h('div.mk-gems', { role: 'group', 'aria-label': 'Seltenheit' }, RARITY_GEMS.map(([v, r, label]) => h(`button.mk-gem.g-${r}`, {
      type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(filter.rarity === v),
      onclick: () => { filter.rarity = filter.rarity === v ? 0 : v; load(); },
    }, h('img.mk-gem-img', { src: gemUrl(!filter.rarity || v >= filter.rarity ? r : 'off'), width: 18, height: 18, alt: '' }))));
    const si = Math.max(0, SORTS.findIndex(([v]) => v === filter.sort));
    const sort = h('button.mk-chip.mk-sort', {
      type: 'button', 'aria-label': 'Sortierung', title: 'Sortierung',
      onclick: () => { filter.sort = SORTS[(si + 1) % SORTS.length][0]; load(); },
    }, h('i.mk-sort-ico'), SORTS[si][1]);
    const search = h('input.ef-input.mk-search', {
      type: 'search', value: filter.q, placeholder: 'Suchen …', 'aria-label': 'Suchen', 'data-k': 'search', enterkeyhint: 'search', maxlength: '40',
      oninput: (e) => { filter.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => load(), 350); },
    });
    const filters = h('div.mk-filters',
      h('div.mk-frow', search, sort,
        h(`button.mk-chip${filter.mine ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(filter.mine), onclick: () => { filter.mine = !filter.mine; load(); } }, 'Für mich')),
      h('div.mk-frow', cats, rar));

    let list;
    if (!market.ready) list = h('p.ef-note', 'Melde dich mit deinem Konto an, um zu handeln.');
    else if (loadErr) list = h('p.ef-note', loadErr);
    else if (!rows.length) list = h('p.ef-note.mk-empty', loading ? 'Die Gilde blättert im Auktionsbuch …' : 'Keine passenden Angebote.');
    else list = h('ul.pg-stock.mk-list', rows.map((l) => listingRow(l, now, () => { sel = sel === l.id ? null : l.id; bidText = ''; say(''); draw(); })));

    const l = sel != null ? rows.find((x) => x.id === sel) : null;
    return h('div.mk-view.mk-buy',
      filters,
      split(h('div.mk-main.mk-scroll.pg-keep-scroll', list, more && !loading ? h('div.mk-more', actionBtn('Weitere Angebote', () => load(true), { small: true })) : null),
        l ? side(() => { sel = null; draw(); }, l.itemId, offerBox(l, now, gold)) : null));
  }

  // Liste links, Details rechts. Kopf und Knöpfe stehen fest, nur die Werte darunter scrollen.
  // Handy quer: die Details legen sich über die ganze Ansicht, Werte links, Knöpfe rechts (wie im Inventar).
  const split = (main, aside) => h(`div.mk-split${aside ? '.has-side' : ''}`, aside ? main : [errEl(), main], aside);
  const side = (close, itemId, acts, opts = {}) => {
    const def = content.find('item', itemId);
    const det = itemDetail(content, itemId, { ...detailOpts(true), ...opts });
    const head = det.querySelector('.pg-detail-head');
    head?.remove();
    det.querySelectorAll('.pg-gold > img.ef-icon').forEach((img) => img.replaceWith(coinEl()));
    head?.firstChild?.replaceWith(itemIconEl({ ...def, name: null }, 52));
    return h(`div.mk-side.rb-${def?.rarity ?? 'common'}`,
      h('div.mk-side-head', head,
        h('button.mk-side-close', { type: 'button', 'aria-label': 'Details schließen', onclick: close }, '✕')),
      h('div.mk-acts', errEl(), acts),
      h('div.mk-side-body.mk-scroll.pg-keep-scroll', det));
  };

  function offerBox(l, now, gold) {
    const need = minBid(l);
    // Unter Stufe 10 und bei Angeboten des eigenen Kontos (auch anderer Helden) lehnt der Server ab: gleich sagen, keine Knöpfe
    const young = (st().progress?.level ?? 1) < TRADE_MIN_LEVEL;
    const canBuy = !l.mine && !young;
    const canBid = l.startBid != null && canBuy;
    const amount = num(bidText) ?? need;
    const bidLine = l.bid != null ? `Höchstgebot ${fmtNum(l.bid)} · ${fmtNum(l.bids)} Gebote` : l.startBid != null ? `Startgebot ${fmtNum(l.startBid)}` : 'Nur Sofortkauf';
    const otherHero = l.mine && market.loaded && !market.mine.some((x) => x.id === l.id);
    return h('div.mk-offer',
      h('div.mk-offer-line', h('span', bidLine), h('span.mk-time', timeLeft(l.endsAt, now))),
      otherHero ? h('p.mk-note', 'Das hast du mit einem anderen Helden eingestellt. Eigene Angebote kannst du nicht kaufen.')
        : l.mine ? h('p.mk-note', 'Dein Angebot.') : young ? h('p.mk-note', `Handeln geht ab Stufe ${TRADE_MIN_LEVEL} und nach einer Stunde Spielzeit.`)
          : l.top ? h('p.mk-note.good', 'Du hast das Höchstgebot.') : null,
      canBid ? h('div.mk-bid',
        h('input.ef-input.mk-num', {
          type: 'text', inputmode: 'numeric', value: bidText || String(need), 'aria-label': 'Dein Gebot', 'data-k': `bid${l.id}`,
          oninput: (e) => { bidText = e.target.value; },
        }),
        actionBtn('Bieten', () => run(() => market.bid(l.id, num(bidText) ?? need), () => { bidText = ''; refreshSoon(); return 'Gebot abgegeben.'; }),
          { disabled: working || gold < amount - (l.top ? l.bid : 0) })) : null,
      l.buyout != null && canBuy ? actionBtn(`Sofort kaufen · ${fmtNum(l.buyout)}`, () => run(() => market.buyout(l.id), () => {
        sel = null; refreshSoon();
        return 'Gekauft. Es liegt in deinem Postfach.';
      }), { primary: true, disabled: working || gold < l.buyout - (l.top ? l.bid : 0) }) : null);
  }

  // ------------------------------------------------------------------ Verkaufen
  function sellView(now) {
    const s = st(), inv = s.inventory;
    const mine = market.mine ?? [];
    const pickSlot = (kind, itemId, max) => () => {
      pick = pick?.itemId === itemId && pick.kind === kind ? null : { kind, itemId, max };
      const def = content.find('item', itemId);
      form.qty = Math.min(max, listStack(def));
      form.start = String(Math.max(1, (def?.value ?? 1) * form.qty));
      form.buyout = '';
      say(''); draw();
    };
    // Nur, was sich handeln lässt: Taschenstapel zusammengefasst, Materialien, gelernte Reittiere
    const goods = [];
    const bagQty = new Map();
    for (const it of inv.slots) if (it && tradeable(content.find('item', it.itemId))) bagQty.set(it.itemId, (bagQty.get(it.itemId) ?? 0) + it.qty);
    for (const [id, n] of bagQty) goods.push(['slot', id, n]);
    for (const [id, n] of Object.entries(inv.mats ?? {})) if (n > 0 && tradeable(content.find('item', id))) goods.push(['mat', id, n]);
    for (const { itemId } of market.sellableMounts()) goods.push(['mount', itemId, 1]);
    const WHERE = { slot: (n) => `Tasche · ${fmtNum(n)}`, mat: (n) => `Materialbeutel · ${fmtNum(n)}`, mount: () => 'Gelerntes Reittier' };
    const slots = goods.map(([kind, id, n]) => {
      const def = content.find('item', id);
      const on = pick?.kind === kind && pick.itemId === id;
      const btn = h(`button.pg-stock-row.mk-row.mk-good${on ? '.selected' : ''}`, {
        type: 'button', 'data-k': `good-${kind}-${id}`, 'aria-pressed': String(on), onclick: pickSlot(kind, id, n),
      },
        h('span.mk-icon', itemIconEl({ ...def, name: null }, 52), n > 1 ? h('span.pg-qty', fmtNum(n)) : null),
        h('span.pg-stock-name', h(`span.r-${def.rarity}`, def.name), h('small', WHERE[kind](n))));
      if (!on) attachTip(btn, () => itemDetail(content, id, detailOpts(true)));
      return h('li', btn);
    });
    const young = (s.progress?.level ?? 1) < TRADE_MIN_LEVEL;

    return h('div.mk-view.mk-sell', split(h('div.mk-main.mk-scroll.pg-keep-scroll',
      mine.length ? h('section',
        h('h3', `Deine Angebote · ${fmtNum(mine.length)}/${fmtNum(MAX_ACTIVE)}`),
        h('ul.pg-stock.mk-list', mine.map((l) => listingRow({ ...l, mine: true }, now, null,
          l.bid != null ? priceEl(l)
            : actionBtn('Zurückziehen', () => run(() => market.cancel(l.id), (r) => (r.mailed ? 'Zurückgezogen. Deine Tasche ist voll, es liegt im Postfach.' : 'Zurückgezogen.')),
              { small: true, disabled: working }))))) : null,
      h('section',
        h('h3', 'Einstellen'),
        !market.ready ? h('p.ef-note', 'Melde dich mit deinem Konto an, um zu handeln.')
          : young ? h('p.ef-note.mk-empty', `Handeln geht ab Stufe ${TRADE_MIN_LEVEL} und nach einer Stunde Spielzeit.`)
            : slots.length ? h('ul.pg-stock.mk-list.mk-goods', slots) : h('p.ef-note.mk-empty', 'Du hast gerade nichts, was sich handeln lässt.'))),
    pick ? sellSheet() : null));
  }

  function sellSheet() {
    const def = content.find('item', pick.itemId);
    const stack = Math.min(pick.max, listStack(def));
    const start = num(form.start), buyout = num(form.buyout);
    const valid = (start != null || buyout != null) && (start == null || start <= PRICE_MAX) && (buyout == null || buyout <= PRICE_MAX)
      && !(start != null && buyout != null && buyout < start);
    const price = buyout ?? start;
    const field = (label, key, max = null) => h('label.mk-field', h('span', label), h('span.mk-numwrap', h('input.ef-input.mk-num', {
      type: 'text', inputmode: 'numeric', value: String(form[key] ?? ''), 'data-k': `sell-${key}`,
      oninput: (e) => { form[key] = e.target.value; },
      onchange: () => draw(),
    }), max ? h('small.mk-max', `/${fmtNum(max)}`) : null));
    const submit = () => {
      const qty = pick.kind === 'mount' ? 1 : Math.max(1, Math.min(stack, num(form.qty) ?? 1));
      const item = pick.itemId, mount = pick.kind === 'mount';
      run(() => market.list({ itemId: item, qty, startBid: num(form.start), buyout: num(form.buyout), hours: form.hours, mount }), () => {
        pick = null; refreshSoon();
        return 'Eingestellt. Die Gilde ruft es aus.';
      });
    };
    return side(() => { pick = null; draw(); }, pick.itemId, h('div.mk-form',
          h(`div.mk-prices${stack > 1 ? '.three' : ''}`,
            stack > 1 ? field('Menge', 'qty', stack) : null, field('Startgebot', 'start'), field('Sofortkauf', 'buyout')),
          h('div.mk-hours', { role: 'radiogroup', 'aria-label': 'Laufzeit' },
            DURATIONS.map((hrs) => h(`button.mk-chip${form.hours === hrs ? '.on' : ''}`, {
              type: 'button', role: 'radio', 'aria-checked': String(form.hours === hrs), onclick: () => { form.hours = hrs; draw(); },
            }, `${fmtNum(hrs)} Std.`))),
          h('p.mk-note', price ? `Du erhältst ab ${fmtNum(proceedsOf(start ?? buyout))} Gold (${fmtNum(FEE_RATE * 100)} % Gebühr).`
            : `Beim Verkauf behält die Gilde ${fmtNum(FEE_RATE * 100)} % ein.`),
          actionBtn('Einstellen', submit, { primary: true, disabled: working || !valid || !market.ready })), { compare: false });
  }

  // ------------------------------------------------------------------ Gebote (Erlöse und Ware liegen im Postfach, src/mail)
  function bidsView(now) {
    const bids = market.bids ?? [];
    return h('div.mk-view.mk-mailbox.mk-scroll.pg-keep-scroll', errEl(),
      bids.length ? h('ul.pg-stock.mk-list', bids.map((l) => listingRow(l, now, () => { tab = 'buy'; rows = [l, ...rows.filter((x) => x.id !== l.id)]; sel = l.id; draw(); })))
        : h('p.ef-note.mk-empty', market.loaded ? 'Du bietest gerade auf nichts.' : 'Die Gilde sieht nach …'));
  }

  // ------------------------------------------------------------------ Rahmen
  const render = () => {
    const now = market.serverNow();
    const gold = st().wallet?.gold ?? 0;
    const n = market.bids?.length ?? 0;
    const tabs = [['buy', 'Kaufen'], ['sell', 'Verkaufen'], ['bids', 'Gebote']];
    const panel = panelFrame(session, 'market', 'Auktionshaus',
      h('div.pg-tabs.mk-tabs', { role: 'tablist' }, tabs.map(([id, label]) => h(`button.pg-tabbtn${tab === id ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(tab === id),
        onclick: () => { tab = id; sel = null; pick = null; say(''); draw(); if (id === 'buy') load(); else market.refresh().catch(() => {}); },
      }, label, id === 'bids' && n ? h('span.mk-badge', fmtNum(n)) : null)), goldEl(gold, '.mk-purse')),
      h('div.mk-body', tab === 'buy' ? buyView(now) : tab === 'sell' ? sellView(now) : bidsView(now)));
    // Gezeichneter Rahmen und Titel in Pixelschrift (wie der Todesbildschirm), Stufe je Gerät in market.css
    panel.style.setProperty('--mk-frame2', `url(${frameUrl(2)})`);
    panel.style.setProperty('--mk-frame3', `url(${frameUrl(3)})`);
    const t = panel.querySelector('.pg-title');
    if (t && session.font) {
      if (title?.lang !== tr('Auktionshaus')) title = { c: pixelTitle(session.font, 'Auktionshaus'), lang: tr('Auktionshaus') };
      const tc = title.c;
      const c = h('canvas.mk-ptitle', { width: tc.width, height: tc.height, 'aria-hidden': 'true' });
      c.getContext('2d').drawImage(tc, 0, 0);
      c.style.setProperty('--tw', String(tc.width)); c.style.setProperty('--th', String(tc.height));
      t.replaceChildren(c, h('span.mk-sr', 'Auktionshaus'));
    }
    return panel;
  };
  let title = null;

  // Neu zeichnen ohne Fokus, Cursor und Scrollstand zu verlieren (Eingabefelder, Liste)
  let queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      hideTip();
      const act = document.activeElement, k = root.contains(act) ? act?.dataset?.k : null;
      const caret = k && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null;
      const tops = [...root.querySelectorAll('.pg-keep-scroll')].map((el) => el.scrollTop);
      root.replaceChildren(render());
      root.querySelectorAll('.pg-keep-scroll').forEach((el, i) => { el.scrollTop = tops[i] ?? 0; });
      // Abgeschnittener Inhalt: unterer Rand blendet aus, solange es weiter unten noch etwas gibt
      root.querySelectorAll('.mk-scroll').forEach((el) => {
        const more = () => el.classList.toggle('more', el.scrollHeight - el.scrollTop - el.clientHeight > 4);
        more();
        el.addEventListener('scroll', more, { passive: true });
      });
      if (k) {
        const el = root.querySelector(`[data-k="${k}"]`);
        if (el) { el.focus({ preventScroll: true }); if (caret) try { el.setSelectionRange(caret[0], caret[1]); } catch { /* egal */ } }
      }
    });
  }
  let soon = 0;
  const refreshSoon = () => { clearTimeout(soon); soon = setTimeout(() => { if (tab === 'buy') load(); }, 200); };

  const offs = [
    market.onChange(draw),
    session.bus.on(EV.STATE_CHANGED, (e) => { if (/^(wallet|inventory|market|mount|shop)/.test(e.type)) draw(); }),
  ];
  const tick = setInterval(draw, 30_000);
  draw();
  load();
  market.refresh().catch(() => {});
  return { root, dispose: () => { offs.forEach((off) => off()); clearInterval(tick); clearTimeout(searchTimer); clearTimeout(soon); hideTip(); } };
}

