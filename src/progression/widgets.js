import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { SETS } from './sets.js';
import { RARITIES, ITEMS, EQUIP_SLOTS, EQUIP_SLOT_NAMES, STAT_ORDER, STAT_NAMES, formatStat, formatStatDelta, equipSlotFor, canUseClass, typeLabel, itemScore } from './items.js';
import { RARE_ENEMIES } from './rares.js';

// Bausteine für die HTML-Panels von Thread C (Inventar, Charakter, Quests, Händler, Schmiede).
// Nur Darstellung: Aktionen laufen als Commands über den Aufrufer.

export function panelFrame(session, id, title, ...body) {
  return h(`div.ef-panel.pg-panel.pg-${id}`, { role: 'dialog', 'aria-label': title },
    h('header.pg-head',
      h('h2.pg-title', title),
      h('button.pg-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)', onclick: () => session.panels.close() }, '✕'),
    ),
    ...body);
}

export function goldEl(amount, cls = '') {
  return h(`span.pg-gold${cls}`, iconEl('gold', 18), h('b', Number(amount).toLocaleString('de-DE')));
}

// Ein Slot-Knopf mit Icon (Seltenheitsrahmen von D), Stapelzahl und Markierungen.
// item = { itemId, qty, n? } | null
// opts: selected, label (leerer Ausrüstungsplatz), placeholder (Icon-ID für leere Plätze),
//       upgrade (grüner Pfeil), blocked (false | 'Stufe 9' | 'Klasse' – rote Marke), dim (ausgefiltert), onclick, index
export function itemSlot(content, item, { selected = false, label = null, placeholder = null, upgrade = false, blocked = false, dim = false, onclick, index, size = 40 } = {}) {
  const def = item ? content.find('item', item.itemId) : null;
  const cls = `button.pg-slot${def ? `.r-${def.rarity}` : '.empty'}${selected ? '.selected' : ''}${blocked ? '.blocked' : ''}${dim ? '.dim' : ''}`;
  return h(cls, {
    type: 'button',
    'aria-label': def ? `${def.name}${item.qty > 1 ? ` ×${item.qty}` : ''}` : label ?? 'Leerer Platz',
    'data-index': index == null ? null : String(index),
    onclick,
  },
  def ? itemIconEl({ ...def, name: null }, size) : placeholder ? h('span.pg-slot-ph', iconEl(placeholder, Math.round(size * 0.7))) : null,
  !def && label ? h('span.pg-slot-label', label) : null,
  def && item.qty > 1 ? h('span.pg-qty', String(item.qty)) : null,
  def && item.n ? h('span.pg-new', { title: 'Neu' }) : null,
  def && upgrade ? h('span.pg-up', { title: 'Verbesserung' }, '▲') : null,
  def && blocked ? h('span.pg-lock', { title: blocked === 'Klasse' ? 'Deine Klasse kann das nicht führen' : `Benötigt ${blocked}` }, blocked === 'Klasse' ? '✕' : blocked.replace('Stufe ', '')) : null);
}

// Herkunft besonderer Stücke (Tooltip)
const RARE_SOURCE = Object.fromEntries(Object.values(RARE_ENEMIES).map((r) => [r.signature[0], `${r.name}, ${r.title}`]));
function sourceLabel(itemId, def) {
  if (def.source === 'rare') return RARE_SOURCE[itemId] ? `Beute: ${RARE_SOURCE[itemId]}` : 'Beute seltener Gegner';
  if (def.source === 'boss') return def.set ? `Bossbeute · ${SETS[def.set]?.name ?? 'Set'}` : 'Bossbeute';
  if (def.source === 'trial') return 'Aus den Glutprüfungen';
  if (def.source === 'quest') return 'Questbelohnung';
  return null;
}

// Detailansicht / Tooltip eines Items mit Vergleich zur getragenen Ausrüstung.
// actionsTop: Knöpfe direkt unter dem Kopf (Handy: kein Scrollen bis zu „Ausrüsten“/„Verkaufen“)
export function itemDetail(content, itemId, { equipment = {}, level = 99, classId = null, actions = [], extra = null, compare = true, price = null, sell = null, compact = false, actionsTop = false } = {}) {
  const def = content.find('item', itemId);
  if (!def) return h('div.pg-detail.empty', h('p.ef-note', 'Wähle einen Gegenstand aus.'));
  const rar = RARITIES[def.rarity];
  const eqSlot = equipSlotFor(def);
  const worn = compare && eqSlot && equipment[eqSlot] && equipment[eqSlot] !== itemId ? content.find('item', equipment[eqSlot]) : null;
  const keys = STAT_ORDER.filter((k) => def.stats?.[k] || worn?.stats?.[k]);
  const stats = keys.map((k) => {
    const v = def.stats?.[k] ?? 0, d = v - (worn?.stats?.[k] ?? 0);
    const diff = worn && Math.abs(d) > 1e-6 ? h(`span.pg-diff${d > 0 ? '.up' : '.down'}`, formatStatDelta(k, d)) : null;
    return h(`li${v ? '' : '.pg-lost'}`, h('span', v ? formatStat(k, v) : `±0 ${STAT_NAMES[k]}`), diff);
  });
  const lvlBad = (def.reqLevel ?? 1) > level;
  const clsBad = !canUseClass(def, classId);
  const classNames = def.classes ? def.classes.map((c) => content.find('class', c)?.name ?? c).join(', ') : null;
  const use = def.use ? [
    def.use.heal ? `stellt ${def.use.heal >= 9999 ? 'alles' : def.use.heal} Leben wieder her` : null,
    def.use.resource ? `stellt ${def.use.resource >= 9999 ? 'alle' : def.use.resource} Mana/Energie wieder her` : null,
  ].filter(Boolean).join(' und ') : '';

  return h(`div.pg-detail.rb-${def.rarity}${compact ? '.compact' : ''}`,
    h('div.pg-detail-head', itemIconEl({ ...def, name: null }, compact ? 40 : 48),
      h('div.pg-detail-title', h(`div.pg-item-name.r-${def.rarity}`, def.name),
        h('div.pg-item-type', h(`span.r-${def.rarity}`, rar.name), ` · ${typeLabel(def)}`))),
    actionsTop && actions.length ? h('div.pg-actions.top', actions) : null,
    eqSlot ? h('div.pg-ilvl', `Gegenstandsstufe ${def.ilvl}`) : null,
    stats.length ? h('ul.pg-stats', stats) : null,
    worn ? h('div.pg-compare', 'Verglichen mit ', h(`b.r-${worn.rarity}`, worn.name), verdictEl(itemScore(def) - itemScore(worn)))
      : eqSlot && compare && !equipment[eqSlot] ? h('div.pg-compare', `${EQUIP_SLOT_NAMES[eqSlot]}: nichts angelegt`) : null,
    def.set ? setInfoEl(def.set, equipment) : null,
    use ? h('p.pg-use', `Benutzen: ${use}.`) : null,
    eqSlot && (def.reqLevel ?? 1) > 1 ? h(`p.pg-req${lvlBad ? '.bad' : ''}`, `Benötigt Stufe ${def.reqLevel}`) : null,
    classNames ? h(`p.pg-req${clsBad ? '.bad' : ''}`, `Klassen: ${classNames}`) : null,
    def.desc && !compact ? h('p.pg-desc', def.desc) : null,
    sourceLabel(itemId, def) ? h('p.pg-source', sourceLabel(itemId, def)) : null,
    def.type === 'quest' ? h('p.pg-value', 'Questgegenstand') : h('p.pg-value',
      price != null ? ['Preis: ', goldEl(price)] : sell != null ? ['Verkauf: ', goldEl(sell)] : ['Wert: ', goldEl(def.value)]),
    extra,
    !actionsTop && actions.length ? h('div.pg-actions', actions) : null,
  );
}

// Gesamturteil des Vergleichs (grobe Stärke, itemScore)
function verdictEl(d) {
  if (Math.abs(d) < 0.5) return h('span.pg-verdict', ' · gleichwertig');
  return h(`span.pg-verdict${d > 0 ? '.up' : '.down'}`, d > 0 ? ' · ▲ insgesamt stärker' : ' · ▼ insgesamt schwächer');
}

// Set-Anzeige: Name, Teile (angelegt hell) und Boni (aktive grün)
export function setInfoEl(setId, equipment = {}) {
  const set = SETS[setId];
  if (!set) return null;
  const worn = new Set(EQUIP_SLOTS.map((k) => equipment[k]).filter(Boolean));
  const count = set.pieces.filter((p) => worn.has(p)).length;
  return h('div.pg-set',
    h('div.pg-set-name', `${set.name} (${count}/${set.pieces.length})`),
    h('ul.pg-set-pieces', set.pieces.map((p) => h(`li${worn.has(p) ? '.on' : ''}`, ITEMS[p]?.name ?? p))),
    h('ul.pg-set-bonus', set.bonuses.map((b) => h(`li${count >= b.count ? '.on' : ''}`, `(${b.count}) `,
      Object.entries(b.stats).map(([k, v]) => formatStat(k, v)).join(', ')))));
}

export function actionBtn(text, onclick, { primary = false, danger = false, disabled = false, small = false } = {}) {
  return h(`button.ef-btn.pg-btn${primary ? '.primary' : ''}${danger ? '.danger' : ''}${small ? '.small' : ''}`, { type: 'button', onclick, disabled }, text);
}

// Belohnungen einer Quest: rewards { xp, gold }, items = aufgelöste Gegenstände [{ itemId, qty }]
export function rewardsEl(content, rewards = {}, items = rewards.items ?? []) {
  return h('div.pg-rewards',
    h('div.pg-rewards-head', 'Belohnung'),
    h('div.pg-rewards-row',
      rewards.xp ? h('span.pg-xp', `${rewards.xp} EP`) : null,
      rewards.gold ? goldEl(rewards.gold) : null),
    items.length ? h('div.pg-rewards-items', items.map((it) => {
      const def = content.find('item', it.itemId);
      if (!def) return null;
      const el = h(`div.pg-reward-item.rb-${def.rarity}`,
        itemIconEl({ ...def, name: null }, 32),
        h('span.pg-reward-text', h(`b.r-${def.rarity}`, def.name), h('small', `${RARITIES[def.rarity].name} · ${typeLabel(def)}${it.qty > 1 ? ` · ×${it.qty}` : ''}`)));
      attachTip(el, () => itemDetail(content, it.itemId, { compact: true, compare: false }));
      return el;
    })) : null);
}

export function barEl(frac, text, cls = '') {
  return h(`div.pg-bar${cls}`, h('div.pg-bar-fill', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }), h('span.pg-bar-text', text));
}

export function objectivesEl(objectives) {
  return h('ul.pg-objs', objectives.map((o) => h(`li${o.done ? '.done' : ''}`,
    h('span.pg-check', o.done ? '✓' : '•'), h('span', o.text), o.count > 1 ? h('span.pg-count', `${o.current}/${o.count}`) : null)));
}

// ---------------------------------------------------------------- Tooltip (nur Maus)
// Ein einziges schwebendes Element im Dokument; Touch-Geräte nutzen stattdessen die Detailansicht.
let tipEl = null;
const hoverCapable = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function attachTip(el, build) {
  if (!hoverCapable()) return el;
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTip(build(), e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') placeTip(e); });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('pointerdown', hideTip);
  return el;
}
function showTip(node, e) {
  if (!node) return;
  if (!tipEl) tipEl = h('div.pg-tip', { role: 'tooltip' });
  tipEl.replaceChildren(node);
  document.body.append(tipEl);
  placeTip(e);
}
function placeTip(e) {
  if (!tipEl?.isConnected) return;
  const r = tipEl.getBoundingClientRect(), pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > innerWidth - 4) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 4) y = Math.max(4, innerHeight - r.height - 4);
  tipEl.style.transform = `translate(${Math.max(4, Math.round(x))}px, ${Math.round(y)}px)`;
}
export function hideTip() { tipEl?.remove(); }

// ---------------------------------------------------------------- Panel-Rahmen
// Rahmen: neu zeichnen bei jeder Zustandsänderung, Scrollpositionen behalten.
export function reactive(session, render, onClose) {
  const root = h('div.pg-mount');
  let queued = false;
  const redraw = () => {
    queued = false;
    hideTip();
    const tops = [...root.querySelectorAll('.pg-keep-scroll')].map((el) => el.scrollTop);
    root.replaceChildren(render(redraw));
    root.querySelectorAll('.pg-keep-scroll').forEach((el, i) => { el.scrollTop = tops[i] ?? 0; });
  };
  // Mehrere Commands in einem Tick (z. B. Quest abgeben) nur einmal zeichnen
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(redraw); } };
  const off = session.bus.on(EV.STATE_CHANGED, schedule);
  redraw();
  return { root, dispose: () => { off(); hideTip(); onClose?.(); } };
}

// Doppeltipp/Doppelklick erkennen (dblclick ist auf Touch unzuverlässig)
export function tapper(ms = 380) {
  let last = null, t = 0;
  return (key) => {
    const now = performance.now(), dbl = last === key && now - t < ms;
    last = dbl ? null : key; t = now;
    return dbl;
  };
}

