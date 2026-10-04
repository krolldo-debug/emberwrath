import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { computeStats } from '../character/stats.js';
import { EQUIP_SLOTS, EQUIP_SLOT_NAMES, STAT_NAMES, RARITIES, buyPrice, equipSlotFor, canUseClass, typeLabel, itemScore } from './items.js';
import { RECIPE_GROUPS } from './crafting.js';
import { xpInfo, trackedQuests, trackedQuestId, questStatus, questsForNpc, npcName, npcShortName, freeSlots, isUpgrade, countItem, turnInOf, questRewardItems, vendorStock, npcIdleLine, sellableSlots, sellValue } from './selectors.js';
import { panelFrame, goldEl, itemSlot, itemDetail, actionBtn, rewardsEl, barEl, objectivesEl, attachTip, hideTip, reactive, tapper } from './widgets.js';
import { registerEndgamePanels, bonusSectionEl } from './endgamePanels.js';
import { ACHIEVEMENTS } from './achievements.js';

// HTML-Panels von Thread C. Jedes Panel zeichnet sich bei jeder Zustandsänderung
// neu (EV.STATE_CHANGED) und löst Spielaktionen nur über Commands aus.
//   inventory   (Taste I)  Charakterpuppe mit 7 Plätzen, Tasche (36), Filter, Sortieren, Vergleich
//   character   (Taste C)  Werte, Stufe, Erfahrung, Statistik
//   questlog    (Taste L)  aktive (Verfolgen), verfügbare und erledigte Quests
//   questDialog (npc:interact) Quest annehmen / abgeben, Händler und Schmiede öffnen
//   shop        (aus dem Dialog) kaufen, verkaufen, Plunder verkaufen
//   craft       (aus dem Dialog) Schmiede: Rezepte aus Materialien

export function registerPanels(game) {
  const P = game.panels;
  P.register('inventory', (s, p) => reactive(s, inventoryView(s, p), () => s.state.commit('inventory:seen', {})), { action: 'inventory', title: 'Inventar' });
  P.register('character', (s) => reactive(s, characterView(s)), { action: 'character', title: 'Charakter' });
  P.register('questlog', (s) => reactive(s, questlogView(s)), { action: 'quests', title: 'Quests' });
  P.register('questDialog', (s, p) => reactive(s, questDialogView(s, p)), { title: 'Gespräch' });
  P.register('shop', (s, p) => reactive(s, shopView(s, p), () => s.state.commit('inventory:seen', {})), { title: 'Händler' });
  P.register('craft', (s, p) => reactive(s, craftView(s, p)), { title: 'Schmiede' });
  registerEndgamePanels(game);
}

const commit = (s, type, payload) => s.state.commit(type, payload);
const zoneName = (c, id) => (id ? c.find('zone', id)?.name ?? null : null);
const classOf = (s) => s.state.slices.character?.classId ?? null;
const levelOf = (s) => s.state.slices.progress.level;

// Gewählter Titel (Erfolge) oder null
function titleOf(st) {
  const id = st.slices.achievements?.title;
  return id ? ACHIEVEMENTS[id]?.title ?? null : null;
}

// Tausenderpunkte für Goldbeträge in Texten; Touch-Geräte bekommen Tipp-Hinweise, Maus-Geräte Klick-Hinweise
const fmt = (n) => Number(n).toLocaleString('de-DE');
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const MOUNT_FAIL = { known: 'Dieses Reittier kennst du schon. Du kannst den Gegenstand verkaufen.', unavailable: 'Das Reittier lässt sich gerade nicht erlernen. Versuch es gleich noch einmal.' };
const EQUIP_FAIL = { class: 'Deine Klasse kann das nicht führen.', level: 'Deine Stufe ist zu niedrig.', notEquippable: '' };
const SLOT_PH = { weapon: 'sword', head: 'helm', chest: 'armor', hands: 'gloves', feet: 'boots', ring: 'ring', amulet: 'amulet' };
const FILTERS = [
  ['all', 'Alle', () => true],
  ['gear', 'Ausrüstung', (d) => !!d.slot],
  ['use', 'Verbrauch', (d) => d.type === 'consumable' || d.type === 'mount'],
  ['mat', 'Material', (d) => d.type === 'material'],
  ['quest', 'Quest', (d) => d.type === 'quest'],
];

// Werte liefert Thread A (computeStats). Fehlt dort etwas, zeigen die Panels Grundwerte statt abzustürzen.
function safeStats(st, c) {
  try { return computeStats(st, c); } catch (err) {
    console.warn('computeStats fehlgeschlagen', err);
    return { maxHp: 0, power: 0, armor: 0, critChance: 0 };
  }
}

// ---------------------------------------------------------------- Inventar
function inventoryView(s) {
  let sel = null; // { bag: index } | { eq: slot }
  let msg = '';
  let filter = 'all';
  let confirmDrop = null;
  let dragFrom = null;
  let multi = null; // Mehrfachauswahl zum Verkaufen: Set von Taschenplätzen
  const dbl = tapper();
  const content = s.content;

  return (redraw) => {
    const st = s.state, inv = st.slices.inventory;
    const level = levelOf(s), classId = classOf(s);
    const act = (type, payload, fail) => {
      const r = commit(s, type, payload);
      msg = r && r.ok === false ? fail?.(r) ?? '' : '';
      redraw();
      return r;
    };
    const selItemId = sel?.bag != null ? inv.slots[sel.bag]?.itemId : sel?.eq ? inv.equipment[sel.eq] : null;
    if (sel && !selItemId) sel = null;

    const primary = (i) => {
      const it = inv.slots[i];
      const def = it && content.find('item', it.itemId);
      if (!def) return;
      if (equipSlotFor(def)) {
        const r = act('inventory:equip', { slot: i }, (x) => EQUIP_FAIL[x.reason] ?? '');
        if (r?.ok) sel = { eq: r.slot };
      } else if (def.type === 'consumable') act('inventory:use', { slot: i }, (x) => (x.reason === 'level' ? EQUIP_FAIL.level : x.reason === 'riding' ? 'Nicht beritten.' : ''));
      else if (def.type === 'mount') {
        const r = act('inventory:use', { slot: i }, (x) => MOUNT_FAIL[x.reason] ?? '');
        if (r?.ok) { sel = null; msg = `Neues Reittier: ${s.content.find('mount', r.mountId)?.name ?? def.name}. Aufsitzen mit V oder dem Reittier-Knopf.`; redraw(); }
      }
    };
    const unequip = (slot) => act('inventory:unequip', { slot }, () => 'Kein Platz im Inventar.');
    const detailOpts = { equipment: inv.equipment, level, classId };

    // --- Tasche
    const pass = FILTERS.find((f) => f[0] === filter)[2];
    const bagSlots = inv.slots.map((it, i) => {
      const def = it && content.find('item', it.itemId);
      const el = itemSlot(content, it, {
        index: i, selected: sel?.bag === i,
        upgrade: !!def?.slot && isUpgrade(st, content, it.itemId),
        blocked: !def?.slot ? false : !canUseClass(def, classId) ? 'Klasse' : (def.reqLevel ?? 1) > level ? `Stufe ${def.reqLevel}` : false,
        dim: !!def && !pass(def),
        onclick: () => {
          if (multi) {
            if (it && def.type !== 'quest' && def.value) { if (multi.has(i)) multi.delete(i); else multi.add(i); }
            redraw(); return;
          }
          if (!it) { sel = null; redraw(); return; }
          if (dbl(`b${i}`)) { primary(i); return; }
          sel = { bag: i }; msg = ''; confirmDrop = null; redraw();
        },
      });
      if (multi?.has(i)) el.classList.add('marked');
      if (def) attachTip(el, () => itemDetail(content, it.itemId, { ...detailOpts, compact: true }));
      // Umsortieren per Ziehen (Maus)
      el.draggable = !!it;
      el.addEventListener('dragstart', () => { dragFrom = i; hideTip(); });
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom != null && dragFrom !== i) { commit(s, 'inventory:move', { from: dragFrom, to: i }); sel = { bag: i }; }
        dragFrom = null; redraw();
      });
      return el;
    });

    // --- Charakterpuppe
    const eqSlot = (slot) => {
      const id = inv.equipment[slot];
      const el = itemSlot(content, id ? { itemId: id, qty: 1 } : null, {
        label: EQUIP_SLOT_NAMES[slot], placeholder: SLOT_PH[slot], selected: sel?.eq === slot, size: 44,
        onclick: () => {
          if (!id) { sel = null; redraw(); return; }
          if (dbl(`e${slot}`)) { unequip(slot); return; }
          sel = { eq: slot }; msg = ''; redraw();
        },
      });
      if (id) attachTip(el, () => itemDetail(content, id, { ...detailOpts, compare: false, compact: true }));
      // Ziehen aus der Tasche auf einen Ausrüstungsplatz
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom != null) primary(dragFrom); dragFrom = null; });
      return h(`div.pg-doll-slot.s-${slot}`, el, h('span.pg-eq-label', EQUIP_SLOT_NAMES[slot]));
    };
    const stats = safeStats(st, content);
    const cls = classId ? content.find('class', classId) : null;
    const gearScore = Math.round(EQUIP_SLOTS.reduce((sum, sl) => sum + itemScore(inv.equipment[sl] ? content.find('item', inv.equipment[sl]) : null), 0));
    const doll = h('section.pg-doll',
      eqSlot('head'), eqSlot('amulet'), eqSlot('chest'), eqSlot('ring'), eqSlot('hands'), eqSlot('weapon'), eqSlot('feet'),
      h('div.pg-doll-mid',
        h('div.pg-doll-name', st.slices.character?.name ?? 'Held'),
        titleOf(st) ? h('div.pg-doll-title', titleOf(st)) : null,
        h('div.pg-doll-sub', h('span', `Stufe ${level}`), cls ? h('span', cls.name) : null),
        h('dl.pg-doll-stats',
          h('dt', 'Leben'), h('dd', String(stats.maxHp ?? 0)),
          h('dt', STAT_NAMES.power), h('dd', String(Math.round(stats.power ?? 0))),
          h('dt', STAT_NAMES.armor), h('dd', String(Math.round(stats.armor ?? 0))),
          h('dt', 'Krit'), h('dd', `${Math.round((stats.critChance ?? 0) * 100)} %`)),
        h('div.pg-gs', { title: 'Summe der Ausrüstungsstärke' }, h('span', 'Ausrüstung'), h('b', String(gearScore)))),
    );

    // --- Aktionen
    const actions = [];
    if (sel?.bag != null) {
      const it = inv.slots[sel.bag], def = content.find('item', it.itemId);
      if (equipSlotFor(def)) {
        const lvlBad = (def.reqLevel ?? 1) > level, clsBad = !canUseClass(def, classId);
        actions.push(lvlBad || clsBad
          ? actionBtn(clsBad ? 'Nicht für deine Klasse' : `Ab Stufe ${def.reqLevel}`, null, { disabled: true })
          : actionBtn('Ausrüsten', () => primary(sel.bag), { primary: true }));
      }
      if (def.type === 'consumable') actions.push(actionBtn('Benutzen', () => primary(sel.bag), { primary: true }));
      if (def.type === 'mount') {
        const known = st.slices.character?.mounts?.owned?.includes(def.mountId);
        actions.push(known ? actionBtn('Schon bekannt', null, { disabled: true }) : actionBtn('Erlernen', () => primary(sel.bag), { primary: true }));
      }
      if (def.type !== 'quest' && def.value) {
        const g = def.value * it.qty;
        actions.push(actionBtn(`Verkaufen +${g}`, () => { const i = sel.bag; sel = null; const r = act('inventory:sell', { slots: [i] }); if (r?.ok) msg = `${def.name} für ${fmt(r.gold)} Gold verkauft.`; redraw(); }));
      }
      if (def.type !== 'quest') {
        const valuable = RARITIES[def.rarity].order >= 2;
        if (confirmDrop === sel.bag) {
          actions.push(actionBtn('Wirklich wegwerfen', () => { confirmDrop = null; act('inventory:discard', { slot: sel.bag }); }, { danger: true }));
          actions.push(actionBtn('Behalten', () => { confirmDrop = null; redraw(); }));
        } else {
          actions.push(actionBtn(it.qty > 1 ? 'Alle wegwerfen' : 'Wegwerfen', () => {
            if (valuable || it.qty > 1) { confirmDrop = sel.bag; redraw(); } else act('inventory:discard', { slot: sel.bag });
          }, { danger: true }));
        }
      }
    } else if (sel?.eq) {
      actions.push(actionBtn('Ablegen', () => unequip(sel.eq), { primary: true }));
    }
    const detail = selItemId
      ? h('div.pg-sheet.open',
        h('button.pg-sheet-close', { type: 'button', 'aria-label': 'Details schließen', onclick: () => { sel = null; redraw(); } }, '✕'),
        itemDetail(content, selItemId, { ...detailOpts, actions, compare: sel?.bag != null, actionsTop: true }),
        msg ? h('p.pg-msg', msg) : null)
      : h('div.pg-sheet', h('div.pg-detail.empty',
        h('p.ef-note', TOUCH ? 'Antippen zeigt Details und Vergleich. Doppeltippen legt an oder benutzt.' : 'Klick zeigt Details und Vergleich. Doppelklick legt an oder benutzt.'),
        h('p.ef-note', '▲ = besser als deine Ausrüstung. Heiltränke: Taste H oder Trank-Knopf.')),
      msg ? h('p.pg-msg', msg) : null);

    // Schnellverkauf: Weiße verkaufen, Auto-Verkauf, Mehrfachauswahl
    function quickSellBar() {
      if (multi) {
        const list = [...multi].filter((i) => inv.slots[i]);
        const gold = sellValue(st, content, list);
        return h('div.pg-quicksell.multi',
          h('span.pg-qs-info', list.length ? `${list.length} gewählt · +${fmt(gold)} Gold` : 'Teile antippen zum Auswählen'),
          actionBtn('Verkaufen', () => { const r = act('inventory:sell', { slots: list }); if (r?.ok) { msg = `${r.count} Teile für ${fmt(r.gold)} Gold verkauft.`; multi = null; redraw(); } }, { small: true, primary: true, disabled: !list.length }),
          actionBtn('+ Alle Weißen', () => { for (const i of sellableSlots(st, content, 'common')) multi.add(i); redraw(); }, { small: true }));
      }
      const junk = sellableSlots(st, content, 'common');
      const auto = inv.autoSell ?? null;
      const AUTO = [[null, 'Aus'], ['common', 'Weiße'], ['uncommon', 'Weiße + Grüne']];
      const next = AUTO[(AUTO.findIndex(([m]) => m === auto) + 1) % AUTO.length][0];
      return h('div.pg-quicksell',
        junk.length ? actionBtn(`Weiße verkaufen · ${junk.length} (+${sellValue(st, content, junk)})`, () => {
          const r = act('inventory:sellJunk', { upTo: 'common' }); if (r?.ok) { msg = `${r.count} Teile für ${fmt(r.gold)} Gold verkauft.`; sel = null; redraw(); }
        }, { small: true }) : h('span.pg-qs-info', 'Kein weißer Plunder'),
        h(`button.pg-chip.pg-auto${auto ? '.on' : ''}`, { type: 'button', title: 'Beim Aufsammeln automatisch verkaufen (Verbesserungen werden behalten)', onclick: () => { act('inventory:autoSell', { mode: next }); } },
          `Auto-Verkauf: ${AUTO.find(([m]) => m === auto)[1]}`));
    }

    const used = inv.slots.length - freeSlots(st);
    return panelFrame(s, 'inventory', 'Inventar',
      h('div.pg-scroll.pg-keep-scroll.pg-inv',
        doll,
        h('section.pg-bagwrap',
          h('div.pg-bagbar',
            h('div.pg-filters', { role: 'tablist' }, FILTERS.map(([id, label]) => h(`button.pg-chip${filter === id ? '.on' : ''}`, {
              type: 'button', role: 'tab', 'aria-selected': String(filter === id), onclick: () => { filter = id; redraw(); },
            }, label)),
            h('button.pg-chip.pg-sort', { type: 'button', title: 'Sortieren: Ausrüstung, Verbrauch, Material, Quest', onclick: () => { sel = null; act('inventory:sort', {}); } }, '⇅ Sortieren'),
            h(`button.pg-chip.pg-multi${multi ? '.on' : ''}`, { type: 'button', title: 'Mehrere Teile antippen und zusammen verkaufen', onclick: () => { multi = multi ? null : new Set(); sel = null; msg = ''; redraw(); } }, multi ? '✓ Auswahl' : '☐ Auswählen'))),
          quickSellBar(),
          h('div.pg-bag', { role: 'grid', 'aria-label': 'Tasche' }, bagSlots),
          inv.questBag?.length ? h('div.pg-questbag', { title: 'Questgegenstände und Questbelohnungen, für die in der Tasche kein Platz war. Sie wandern zurück, sobald Platz frei ist.' },
            h('span.pg-questbag-label', 'Questbeutel'),
            inv.questBag.map((e) => { const d = content.find('item', e.itemId); return h('span.pg-questbag-item', itemIconEl({ ...d, name: null }, 24), h('b', `${e.qty}× ${d?.name ?? e.itemId}`)); })) : null,
          !selItemId && msg ? h('p.pg-msg', msg) : null,
          h('div.pg-inv-foot', goldEl(st.slices.wallet.gold),
            h(`span.pg-cap${used >= inv.slots.length - 2 ? '.full' : ''}`, `${used}/${inv.slots.length} Plätze`))),
        detail));
  };
}

// ---------------------------------------------------------------- Charakter
function fmtTime(sec) {
  const m = Math.floor(sec / 60), hh = Math.floor(m / 60);
  return hh ? `${hh} h ${m % 60} min` : `${m} min`;
}
const RES = { rage: 'Wut', mana: 'Mana', energy: 'Energie' };
const ATTR = { str: 'Stärke', agi: 'Geschick', int: 'Intellekt', vit: 'Ausdauer' };

function characterView(s) {
  let tab = 'overview';
  return (redraw) => {
    const st = s.state, c = s.content, ch = st.slices.character ?? {};
    const tabs = h('div.pg-tabs', { role: 'tablist' },
      [['overview', 'Übersicht'], ['mounts', 'Reittiere']].map(([id, label]) => h(`button.pg-tabbtn${tab === id ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; redraw(); },
      }, label)));
    if (tab === 'mounts') return panelFrame(s, 'character', 'Charakter', tabs, h('div.pg-scroll.pg-keep-scroll.pg-char', mountsSection(s)));
    const stats = safeStats(st, c);
    const xp = xpInfo(st);
    const race = ch.raceId ? c.find('race', ch.raceId) : null;
    const cls = ch.classId ? c.find('class', ch.classId) : null;
    const pst = st.slices.progress.stats;
    const row = (k, v) => h('div.pg-kv', h('dt', String(k)), h('dd', String(v)));
    const statRows = [
      row('Leben', stats.maxHp),
      stats.maxResource ? row(stats.resourceName ?? RES[stats.resourceType] ?? STAT_NAMES.maxResource, stats.maxResource) : null,
      row(STAT_NAMES.power, Math.round(stats.power ?? 0)),
      row(STAT_NAMES.armor, stats.damageReduction != null ? `${Math.round(stats.armor ?? 0)} (−${Math.round(stats.damageReduction * 100)} %)` : Math.round(stats.armor ?? 0)),
      row(STAT_NAMES.critChance, `${Math.round((stats.critChance ?? 0) * 100)} %`),
      stats.moveSpeed ? row(STAT_NAMES.moveSpeed, typeof stats.moveSpeed === 'number' && stats.moveSpeed < 1 ? `+${Math.round(stats.moveSpeed * 100)} %` : stats.moveSpeed) : null,
    ];
    const attrs = stats.attributes ? Object.entries(stats.attributes).map(([k, v]) => row(ATTR[k] ?? k, Math.round(v))) : [];
    const inv = st.slices.inventory;
    return panelFrame(s, 'character', 'Charakter', tabs,
      h('div.pg-scroll.pg-keep-scroll.pg-char',
        h('section.pg-char-id',
          h('div.pg-char-name', ch.name ?? 'Unbekannt'),
          titleOf(st) ? h('div.pg-char-title', titleOf(st)) : null,
          h('div.pg-char-sub', `Stufe ${xp.level}${race ? ` · ${race.name}` : ''}${cls ? ` · ${cls.name}` : ''}`),
          barEl(xp.frac, xp.capped ? 'Höchststufe erreicht' : `${xp.into} / ${xp.need} EP bis Stufe ${xp.level + 1}`, '.pg-xpbar'),
          h('div.pg-char-gold', goldEl(st.slices.wallet.gold))),
        h('section', h('h3', 'Werte'), h('dl.pg-kvs', statRows), attrs.length ? h('dl.pg-kvs.pg-attrs', attrs) : null),
        h('section', h('h3', 'Ausrüstung'), h('div.pg-char-eq', EQUIP_SLOTS.map((slot) => {
          const def = inv.equipment[slot] ? c.find('item', inv.equipment[slot]) : null;
          const el = h('div.pg-char-eqrow', def ? itemIconEl({ ...def, name: null }, 30) : h('span.pg-mini', iconEl(SLOT_PH[slot], 20)),
            h('span.pg-eq-slotname', EQUIP_SLOT_NAMES[slot]), h(`span${def ? `.r-${def.rarity}` : '.ef-note'}`, def?.name ?? 'nichts'));
          if (def) attachTip(el, () => itemDetail(c, def.id, { compare: false, compact: true }));
          return el;
        }))),
        bonusSectionEl(st),
        h('section', h('h3', 'Chronik'), h('dl.pg-kvs',
          row('Besiegte Gegner', pst.kills), row('Elite', pst.eliteKills ?? 0), row('Bosse', pst.bossKills),
          row('Quests erfüllt', pst.questsCompleted), row('Gegenstände gefunden', pst.itemsLooted ?? 0),
          row('Geschmiedet', pst.crafted ?? 0), row('Gold verdient', pst.goldEarned), row('Spielzeit', fmtTime(st.meta.playTime ?? 0)))),
        h('div.pg-actions', actionBtn('Talente', () => s.panels.open('talents'), { primary: true }), actionBtn(`Erfolge (${Object.keys(st.slices.achievements?.unlocked ?? {}).length}/${Object.keys(ACHIEVEMENTS).length})`, () => s.panels.open('achievements'))),
        h('p.ef-note.pg-local', 'Gespeichert in deinem Konto · in der Cloud gesichert.')));
  };
}

// Reiter „Reittiere“ (§12.6): Daten und Commands von Thread A (content 'mount', character.mounts, mount:select)
const MOUNT_RARITY = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
function mountLine(c, def, level, st) {
  const m = c.find('mount', def.mountId);
  const q = def.reqQuest && !st?.slices.quests?.completed.includes(def.reqQuest) ? c.find('quest', def.reqQuest) : null;
  // Sperrgrund zuerst: Auf dem Handy wird die Zeile hinten abgeschnitten
  const lock = [(def.reqLevel ?? 1) > level ? `Ab Stufe ${def.reqLevel}` : null, q ? `nach „${q.title}“` : null].filter(Boolean).join(', ');
  return `${lock ? `${lock} · ` : 'Reittier · '}+${Math.round((m?.speed ?? 0) * 100)} % Tempo`;
}
const questLocked = (st, def) => !!def.reqQuest && !st.slices.quests?.completed.includes(def.reqQuest);
function mountsSection(s) {
  const st = s.state, c = s.content;
  const defs = c.all('mount');
  if (!defs.length) return h('p.ef-note', 'Reittiere kommen mit dem nächsten Update.');
  const m = st.slices.character?.mounts ?? { owned: [], active: null };
  const check = s.character?.canMount?.() ?? { ok: false, reason: null };
  const status = check.reason === 'level' || check.reason === 'lesson'
    ? (s.character?.mountReasonText?.(check.reason) ?? 'Ab Stufe 20 bei Stallmeisterin Orla in der Aschensteppe')
    : m.owned.length ? 'Aufsitzen mit V oder dem Reittier-Knopf. Im Kampf und in Dungeons geht es nicht.' : 'Kaufe ein Reittier bei Stallmeisterin Orla oder erbeute eines von Bossen.';
  const order = { legendary: 0, epic: 1, rare: 2 };
  const rows = [...defs].sort((a, b) => m.owned.includes(b.id) - m.owned.includes(a.id) || order[a.rarity] - order[b.rarity]).map((d) => {
    const own = m.owned.includes(d.id), active = m.active === d.id;
    return h(`li.pg-mount-row${own ? '' : '.locked'}${active ? '.active' : ''}`,
      itemIconEl({ icon: `mount_${d.id}`, rarity: d.rarity }, 40),
      h('div.pg-mount-body',
        h(`b.r-${d.rarity}`, d.name),
        h('small', `${MOUNT_RARITY[d.rarity] ?? ''} · +${Math.round((d.speed ?? 0) * 100)} % Tempo`),
        own ? null : h('small.ef-note', d.source ?? '')),
      own ? (active ? h('span.pg-mount-on', 'Aktiv') : actionBtn('Wählen', () => commit(s, 'mount:select', { mountId: d.id }), { small: true })) : null);
  });
  return h('section', h('p.ef-note', status), h('p.pg-mount-count', `${m.owned.length} von ${defs.length} Reittieren`), h('ul.pg-mounts', rows));
}

// ---------------------------------------------------------------- Questlog
function questlogView(s) {
  let open = null, confirmAbandon = null;
  return (redraw) => {
    const st = s.state, c = s.content;
    const active = trackedQuests(st, c);
    const tracked = trackedQuestId(st, c);
    if (open == null && active.length) open = tracked ?? active[0].id;
    const available = c.all('quest').filter((q) => questStatus(st, c, q.id) === 'available')
      .sort((a, b) => !!a.repeatable - !!b.repeatable || (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.level - b.level);
    const done = st.slices.quests.completed.map((id) => c.find('quest', id)).filter(Boolean);

    const activeEls = active.map((q) => {
      const def = c.get('quest', q.id), isOpen = open === q.id, isTracked = q.id === tracked;
      const where = zoneName(c, def.objectives.find((o) => o.zone)?.zone);
      return h(`article.pg-quest${q.status === 'ready' ? '.ready' : ''}${isOpen ? '.open' : ''}${isTracked ? '.tracked' : ''}`,
        h('button.pg-quest-head', { type: 'button', 'aria-expanded': String(isOpen), onclick: () => { open = isOpen ? '' : q.id; confirmAbandon = null; redraw(); } },
          isTracked ? h('span.pg-track-mark', { title: 'Verfolgt – der Pfad am Boden führt dorthin' }, '➤') : null,
          h('span.pg-quest-title', q.title),
          q.main ? h('span.pg-tag.main', 'Haupt') : q.repeatable ? h('span.pg-tag.rep', 'Kopfgeld') : null,
          h('span.pg-quest-lvl', `Stufe ${q.level}`),
          q.status === 'ready' ? h('span.ef-badge.pg-ready', 'Abgeben') : null),
        isOpen ? h('div.pg-quest-body',
          h('p', q.summary),
          objectivesEl(q.objectives),
          q.hint ? h('p.pg-hint', q.hint) : h('p.ef-note', `Auftraggeber: ${npcName(c, def.giver)}${where ? ` · Ort: ${where}` : ''}`),
          rewardsEl(c, def.rewards, questRewardItems(st, c, q.id)),
          h('div.pg-actions',
            isTracked ? h('span.pg-tracked-note', '➤ Wird verfolgt') : actionBtn('Verfolgen', () => { commit(s, 'quest:track', { questId: q.id }); }, { primary: true }),
            confirmAbandon === q.id
              ? [h('span.ef-note', 'Wirklich aufgeben?'),
                actionBtn('Aufgeben', () => { commit(s, 'quest:abandon', { questId: q.id }); confirmAbandon = null; open = null; }, { danger: true }),
                actionBtn('Behalten', () => { confirmAbandon = null; redraw(); })]
              : actionBtn('Aufgeben', () => { confirmAbandon = q.id; redraw(); }))) : null);
    });

    return panelFrame(s, 'questlog', 'Quests',
      h('div.pg-scroll.pg-keep-scroll.pg-qlog',
        h('section', h('h3', `Aktiv (${active.length})`), active.length ? activeEls : h('p.ef-note', 'Keine aktiven Quests. Sprich mit Leuten, über denen ein ! schwebt.')),
        available.length ? h('section', h('h3', 'Verfügbar'), h('ul.pg-avail', available.map((q) => {
          const z = zoneName(c, c.find('npc', q.giver)?.zoneId);
          const on = st.slices.quests.guide === q.id;
          return h(`li${on ? '.guided' : ''}`, h(`span.pg-bang${q.repeatable ? '.rep' : ''}`, '!'),
            h('div.pg-avail-main', h('b', q.title), q.repeatable ? h('span.pg-tag.rep', 'Kopfgeld') : null,
              h('div.pg-avail-meta', `${npcShortName(c, q.giver)}${z ? `, ${z}` : ''} · Stufe ${q.level}`)),
            h(`button.pg-chip.pg-guide${on ? '.on' : ''}`, { type: 'button', title: 'Zeigt den Weg zum Questgeber auf dem Boden', onclick: () => { commit(s, 'quest:guide', { questId: on ? null : q.id }); redraw(); } }, on ? 'Weg wird gezeigt' : 'Hinführen'));
        }))) : null,
        done.length ? h('section', h('h3', `Abgeschlossen (${done.length})`), h('ul.pg-done', done.map((q) => h('li', '✓ ', q.title)))) : null));
  };
}

// ---------------------------------------------------------------- Questdialog
const TALK = '__talk';
function questDialogView(s, { npcId } = {}) {
  let selected = null, msg = '';
  return (redraw) => {
    const st = s.state, c = s.content;
    const list = questsForNpc(st, c, npcId);
    if (selected !== TALK && !list.some((e) => e.def.id === selected)) selected = list[0]?.def.id ?? null;
    const entry = list.find((e) => e.def.id === selected);
    const vendor = c.find('vendor', npcId);
    const name = npcName(c, npcId);
    const line = c.find('npcLine', npcId);
    const idle = npcIdleLine(s.state, c, npcId) ?? c.find('npc', npcId)?.greeting ?? 'Sei gegrüßt.';

    let body;
    if (!entry) {
      body = h('div.pg-dialog-text', h('p', `„${idle}“`));
    } else {
      const { def, status } = entry;
      const a = st.slices.quests.active[def.id];
      const objectives = trackedQuests(st, c).find((q) => q.id === def.id)?.objectives
        ?? def.objectives.map((o) => ({ ...o, current: 0, done: false }));
      const text = status === 'available' ? def.offer : status === 'ready' && turnInOf(def) === npcId ? def.completeText : def.progressText;
      const actions = [];
      if (status === 'available') {
        actions.push(actionBtn('Annehmen', () => { const r = commit(s, 'quest:accept', { questId: def.id }); msg = r.ok ? '' : 'Das geht gerade nicht.'; redraw(); }, { primary: true }));
      } else if (status === 'ready' && turnInOf(def) === npcId) {
        actions.push(actionBtn('Quest abschließen', () => {
          const r = commit(s, 'quest:turnIn', { questId: def.id });
          msg = r.ok ? '' : r.reason === 'full' ? `Du brauchst ${r.need} freie Plätze im Inventar.` : 'Noch nicht erfüllt.';
          redraw();
        }, { primary: true }));
      }
      body = h('div.pg-dialog-quest',
        h('div.pg-quest-title.big', def.title, h('span.pg-quest-lvl', ` · Stufe ${def.level ?? 1}`), def.repeatable ? h('span.pg-tag.rep', 'Kopfgeld') : null),
        h('p.pg-dialog-text', `„${text ?? def.summary}“`),
        def.objectives.length ? h('div', h('h3', 'Ziele'), objectivesEl(objectives)) : null,
        rewardsEl(c, def.rewards, questRewardItems(st, c, def.id)),
        a?.status === 'ready' && turnInOf(def) !== npcId ? h('p.pg-hint', `Abgeben bei ${npcShortName(c, turnInOf(def))}`) : null,
        msg ? h('p.pg-msg', msg) : null,
        actions.length ? h('div.pg-actions', actions) : null);
    }

    // Reiter: Quests des NPC und „Gespräch“ (Gesprächszeile nach Fortschritt, npcIdleLine)
    const tabs = list.length ? h('div.pg-dialog-tabs', list.map(({ def, status }) =>
      h(`button.pg-tab${def.id === selected ? '.selected' : ''}`, { type: 'button', onclick: () => { selected = def.id; msg = ''; redraw(); } },
        h(`span.pg-mark.m-${status}${def.repeatable ? '.rep' : ''}`, status === 'available' ? '!' : '?'), def.title)),
      h(`button.pg-tab.talk${selected === TALK ? '.selected' : ''}`, { type: 'button', onclick: () => { selected = TALK; msg = ''; redraw(); } }, 'Gespräch')) : null;

    return panelFrame(s, 'dialog', name,
      h('div.pg-scroll.pg-keep-scroll.pg-dialog', tabs, body),
      h('footer.pg-dialog-foot',
        vendor ? actionBtn('Handeln', () => s.panels.open('shop', { vendorId: npcId })) : null,
        vendor?.craft ? actionBtn('Schmiede', () => s.panels.open('craft', { vendorId: npcId })) : null,
        vendor?.craft && levelOf(s) >= 5 ? actionBtn('Verstärken', () => s.panels.open('smith', { vendorId: npcId })) : null,
        line?.appearance && s.panels.registry?.defs?.has('appearance') ? actionBtn('Rüstung färben', () => s.panels.open('appearance')) : null,
        line?.bank ? actionBtn('Lagerkiste', () => s.panels.open('bank')) : null,
        line?.trials && st.slices.quests.completed.includes('q_ignaroth') ? actionBtn('Glutprüfungen', () => s.panels.open('trials')) : null,
        h('span.pg-bye', actionBtn('Auf Wiedersehen', () => s.panels.close()))));
  };
}

// ---------------------------------------------------------------- Händler
function shopView(s, { vendorId } = {}) {
  let tab = 'buy', sel = null, msg = '', mine = true, last = null;
  const marked = new Set();
  return (redraw) => {
    const st = s.state, c = s.content, vendor = c.find('vendor', vendorId);
    const inv = st.slices.inventory, gold = st.slices.wallet.gold;
    const level = levelOf(s), classId = classOf(s);
    const fail = { gold: 'Nicht genug Gold.', full: 'Kein Platz im Inventar.', stock: 'Nicht im Sortiment.', unsellable: 'Das kauft hier niemand.', level: 'Deine Stufe ist zu niedrig.' };
    const detailOpts = { equipment: inv.equipment, level, classId };
    const buy = (id) => {
      const def = c.find('item', id), r = commit(s, 'shop:buy', { vendorId, itemId: id });
      const q = r.reason === 'quest' ? c.find('quest', r.questId) : null;
      msg = r.ok ? `${def.name} gekauft.` : q ? `Erst nach der Quest „${q.title}“.` : fail[r.reason] ?? '';
      redraw();
    };

    let main;
    if (tab === 'buy') {
      const all = vendorStock(c, vendorId);
      const ids = all.filter((id) => { const d = c.find('item', id); return !mine || !d.slot || canUseClass(d, classId); });
      if (sel && !ids.includes(sel)) sel = null;
      const rows = ids.map((id) => {
        const def = c.find('item', id), price = buyPrice(def);
        const up = def.slot && isUpgrade(st, c, id);
        const low = (def.reqLevel ?? 1) > level || questLocked(st, def);
        const row = h(`li.pg-stock-row${sel === id ? '.selected' : ''}${low ? '.low' : ''}`, { onclick: () => { sel = id; msg = ''; redraw(); } },
          itemIconEl({ ...def, name: null }, 36),
          h('div.pg-stock-name', h(`span.r-${def.rarity}`, def.name, up ? h('span.pg-up.inline', ' ▲') : null),
            h(def.type === 'mount' ? 'small.pg-wrap' : 'small', def.slot ? `${typeLabel(def)} · Stufe ${def.reqLevel}` : def.type === 'mount' ? mountLine(c, def, level, st) : def.desc ?? typeLabel(def))),
          goldEl(price, gold < price ? '.poor' : ''),
          actionBtn('Kaufen', (e) => { e.stopPropagation(); buy(id); }, { disabled: gold < price, small: true }));
        attachTip(row, () => itemDetail(c, id, { ...detailOpts, compact: true, price }));
        return row;
      });
      main = h('div.pg-shop-buy',
        h('label.pg-toggle', h('input', { type: 'checkbox', checked: mine, onchange: (e) => { mine = e.target.checked; redraw(); } }), ' Nur für meine Klasse'),
        h('ul.pg-stock.pg-keep-scroll', rows),
        sel ? h('div.pg-sheet.open',
          h('button.pg-sheet-close', { type: 'button', 'aria-label': 'Details schließen', onclick: () => { sel = null; redraw(); } }, '✕'),
          itemDetail(c, sel, { ...detailOpts, price: buyPrice(c.find('item', sel)), actions: [actionBtn('Kaufen', () => buy(sel), { primary: true, disabled: gold < buyPrice(c.find('item', sel)) })] })) : null);
    } else {
      // Antippen markiert (mehrere möglich), oben verkauft ein Knopf alles Markierte. Kein Scrollen zum Detail.
      for (const i of [...marked]) if (!inv.slots[i]) marked.delete(i);
      const list = [...marked];
      const junk = sellableSlots(st, c, 'common');
      const bag = inv.slots.map((it, i) => {
        const def = it && c.find('item', it.itemId);
        const sellable = !!def && def.type !== 'quest' && def.value > 0;
        const el = itemSlot(c, it, {
          index: i, selected: marked.has(i), dim: !!def && !sellable,
          onclick: () => { if (!sellable) return; if (marked.has(i)) marked.delete(i); else { marked.add(i); last = i; } msg = ''; redraw(); },
        });
        if (marked.has(i)) el.classList.add('marked');
        if (def) attachTip(el, () => itemDetail(c, it.itemId, { ...detailOpts, compact: true, sell: def.value * it.qty }));
        return el;
      });
      const lastDef = last != null && marked.has(last) && inv.slots[last] ? c.find('item', inv.slots[last].itemId) : null;
      const sellList = (slots) => { const r = commit(s, 'inventory:sell', { slots }); msg = r.ok ? `${r.count} Teile für ${fmt(r.gold)} Gold verkauft.` : fail[r.reason] ?? ''; if (r.ok) marked.clear(); redraw(); };
      main = h('div.pg-shop-sell',
        h('div.pg-quicksell',
          junk.length ? actionBtn(`Weiße verkaufen · ${junk.length} (+${sellValue(st, c, junk)})`, () => sellList(junk), { small: true })
            : h('span.pg-qs-info', 'Kein weißer Plunder'),
          actionBtn(list.length ? `Markierte verkaufen · ${list.length} (+${sellValue(st, c, list)})` : 'Teile antippen zum Markieren', () => sellList(list), { small: true, primary: !!list.length, disabled: !list.length })),
        lastDef ? h('p.pg-qs-last', h(`span.r-${lastDef.rarity}`, lastDef.name), ` · ${typeLabel(lastDef)}`) : null,
        h('div.pg-bag.small', bag));
    }

    return panelFrame(s, 'shop', vendor?.name ?? 'Händler',
      h('div.pg-tabs', { role: 'tablist' },
        [['buy', 'Kaufen'], ['sell', 'Verkaufen']].map(([id, label]) => h(`button.pg-tabbtn${tab === id ? '.on' : ''}`, {
          type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; sel = null; msg = ''; marked.clear(); redraw(); },
        }, label))),
      h('div.pg-scroll.pg-keep-scroll.pg-shop', main),
      h('footer.pg-dialog-foot', goldEl(gold), msg ? h('span.pg-msg', msg) : null,
        vendor?.craft ? actionBtn('Schmiede', () => s.panels.open('craft', { vendorId })) : null,
        actionBtn('Zurück', () => s.panels.open('questDialog', { npcId: vendorId }))));
  };
}

// ---------------------------------------------------------------- Schmiede
function craftView(s, { vendorId } = {}) {
  let group = 'all', msg = '', sel = null;
  return (redraw) => {
    const st = s.state, c = s.content, level = levelOf(s), gold = st.slices.wallet.gold, classId = classOf(s);
    const inv = st.slices.inventory;
    const recipes = c.all('recipe')
      .filter((r) => group === 'all' || r.group === group)
      .filter((r) => { const d = c.find('item', r.result); return !d?.slot || canUseClass(d, classId) || group !== 'all'; })
      // „Alle“ zeigt nur, was gerade zählt: keine veraltete Ausrüstung, nichts weit über der eigenen Stufe
      .filter((r) => group !== 'all' || r.group === 'shards' || (r.level <= level + 5 && r.level >= level - (c.find('item', r.result)?.slot ? 8 : 15)))
      .sort((a, b) => (a.level > level) - (b.level > level) || b.level - a.level);  // Neuestes zuerst
    const rows = recipes.map((r) => {
      const def = c.find('item', r.result);
      if (!def) return null;
      const locked = r.level > level;
      const mats = r.mats.map((m) => ({ ...m, have: countItem(st, m.itemId), def: c.find('item', m.itemId) }));
      const can = !locked && gold >= (r.gold ?? 0) && mats.every((m) => m.have >= m.qty);
      const row = h(`li.pg-recipe${locked ? '.locked' : ''}${can ? '.can' : ''}${sel === r.id ? '.selected' : ''}`, { onclick: () => { sel = sel === r.id ? null : r.id; redraw(); } },
        h('div.pg-recipe-out', itemIconEl({ ...def, name: null }, 40), r.qty > 1 ? h('span.pg-qty', String(r.qty)) : null),
        h('div.pg-recipe-body',
          h(`b.r-${def.rarity}`, def.name, def.slot && isUpgrade(st, c, def.id) ? h('span.pg-up.inline', ' ▲') : null),
          h('small.ef-note', locked ? `ab Stufe ${r.level}` : `${RECIPE_GROUPS[r.group] ?? ''}${def.slot ? ` · ${typeLabel(def)}` : ''}`),
          h('div.pg-mats', mats.map((m) => h(`span.pg-mat${m.have >= m.qty ? '.ok' : ''}`, { title: m.def?.name ?? m.itemId },
            m.def ? iconEl(m.def.icon, 16) : null, `${Math.min(m.have, 999)}/${m.qty}`)),
          r.gold ? h(`span.pg-mat${gold >= r.gold ? '.ok' : ''}`, iconEl('gold', 16), fmt(r.gold)) : null)),
        actionBtn('Herstellen', (e) => {
          e.stopPropagation();
          const res = commit(s, 'craft:make', { recipeId: r.id });
          msg = res.ok ? `${def.name}${r.qty > 1 ? ` ×${r.qty}` : ''} hergestellt.` : { level: 'Stufe zu niedrig.', gold: 'Nicht genug Gold.', mats: 'Es fehlen Materialien.', full: 'Kein Platz im Inventar.' }[res.reason] ?? '';
          redraw();
        }, { small: true, primary: can, disabled: !can }));
      attachTip(row, () => itemDetail(c, def.id, { equipment: inv.equipment, level, classId, compact: true }));
      return row;
    });
    const selRecipe = sel ? c.find('recipe', sel) : null;
    return panelFrame(s, 'craft', 'Schmiede',
      h('div.pg-tabs', { role: 'tablist' },
        [['all', 'Alle'], ...Object.entries(RECIPE_GROUPS)].map(([id, label]) => h(`button.pg-tabbtn${group === id ? '.on' : ''}`, {
          type: 'button', role: 'tab', 'aria-selected': String(group === id), onclick: () => { group = id; redraw(); },
        }, label))),
      h('div.pg-scroll.pg-keep-scroll.pg-craft',
        h('p.ef-note', 'Materialien fallen bei Gegnern. Geschmiedete Ausrüstung ist höchstens selten (blau) – Episches gibt es nur bei Elite und Bossen.'),
        h('ul.pg-recipes', rows),
        selRecipe ? h('div.pg-sheet.open',
          h('button.pg-sheet-close', { type: 'button', 'aria-label': 'Details schließen', onclick: () => { sel = null; redraw(); } }, '✕'),
          itemDetail(c, selRecipe.result, { equipment: inv.equipment, level, classId })) : null),
      h('footer.pg-dialog-foot', goldEl(gold), msg ? h('span.pg-msg', msg) : null,
        c.find('vendor', vendorId) ? actionBtn('Handeln', () => s.panels.open('shop', { vendorId })) : null,
        actionBtn('Zurück', () => s.panels.open('questDialog', { npcId: vendorId }))));
  };
}
