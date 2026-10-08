import { h } from '../core/dom.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { EQUIP_SLOTS, EQUIP_SLOT_NAMES, formatStat } from './items.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from './achievements.js';
import { UPGRADE_MAX, upgradeCost, ENCHANTS, slotBonus, activeSets } from './smithing.js';
import { TRIAL_REQUIRES, TRIAL_MAX_TIER, TRIAL_AFFIXES, trialSpec, trialChances, trialRewards } from './trials.js';
import { BANK_SIZES, BANK_COSTS } from './endgame.js';
import { countItem } from './selectors.js';
import { panelFrame, goldEl, itemSlot, itemDetail, actionBtn, barEl, attachTip, reactive, tapper, setInfoEl } from './widgets.js';

// Endgame-Panels von Thread C:
//   bank          Lagerkiste (object:interact kind 'bank', Rückfall: Knopf bei Maren/Dunn)
//   achievements  Erfolge und Titel (aus dem Charakter-Panel)
//   smith         Verstärken und Verzaubern (Brom, Dunn)
//   trials        Glutprüfungen: Stufe wählen und starten (object:interact kind 'trial', Rückfall: Maren)
export function registerEndgamePanels(game) {
  const P = game.panels;
  P.register('bank', (s) => reactive(s, bankView(s)), { title: 'Lagerkiste' });
  P.register('achievements', (s) => reactive(s, achievementsView(s)), { title: 'Erfolge' });
  P.register('smith', (s, p) => reactive(s, smithView(s, p)), { title: 'Verstärken' });
  P.register('trials', (s) => reactive(s, trialsView(s)), { title: 'Glutprüfungen' });
}

const commit = (s, type, payload) => s.state.commit(type, payload);
const statsText = (stats) => Object.entries(stats ?? {}).map(([k, v]) => formatStat(k, v)).join(', ');
const REASONS = { gold: 'Nicht genug Gold.', mats: 'Es fehlen Materialien.', level: 'Deine Stufe ist zu niedrig.', full: 'Kein Platz.', quest: 'Questgegenstände bleiben bei dir.', max: 'Höchststufe erreicht.', same: 'Diese Verzauberung liegt schon darauf.', locked: 'Noch nicht freigeschaltet.', tier: 'Diese Stufe ist noch gesperrt.' };
const matChips = (s, mats) => mats.map((m) => {
  const def = s.content.find('item', m.itemId), have = countItem(s.state, m.itemId);
  return h(`span.pg-mat${have >= m.qty ? '.ok' : ''}`, { title: def?.name ?? m.itemId }, def ? iconEl(def.icon, 16) : null, `${have}/${m.qty}`);
});
const tabs = (list, cur, set) => h('div.pg-tabs', { role: 'tablist' }, list.map(([id, label]) => h(`button.pg-tabbtn${cur === id ? '.on' : ''}`, {
  type: 'button', role: 'tab', 'aria-selected': String(cur === id), onclick: () => set(id),
}, label)));

// ---------------------------------------------------------------- Bank
function bankView(s) {
  let sel = null, msg = '';
  const dbl = tapper();
  return (redraw) => {
    const st = s.state, c = s.content, inv = st.slices.inventory, bank = st.slices.bank;
    const opts = { equipment: inv.equipment, level: st.slices.progress.level, classId: st.slices.character?.classId };
    const act = (type, payload) => { const r = commit(s, type, payload); msg = r?.ok === false ? REASONS[r.reason] ?? '' : ''; if (r?.ok) sel = null; redraw(); return r; };
    const grid = (where, slots) => slots.map((it, i) => {
      const el = itemSlot(c, it, {
        index: i, selected: sel?.where === where && sel.i === i, size: 38,
        onclick: () => {
          if (!it) { sel = null; redraw(); return; }
          if (dbl(`${where}${i}`)) { act(where === 'bag' ? 'bank:deposit' : 'bank:withdraw', { slot: i }); return; }
          sel = { where, i }; msg = ''; redraw();
        },
      });
      if (it) attachTip(el, () => itemDetail(c, it.itemId, { ...opts, compact: true }));
      return el;
    });
    const selIt = sel ? (sel.where === 'bag' ? inv.slots : bank.slots)[sel.i] : null;
    if (sel && !selIt) sel = null;
    const step = BANK_SIZES.indexOf(bank.size), cost = BANK_COSTS[step];
    return panelFrame(s, 'bank', 'Lagerkiste',
      h('div.pg-scroll.pg-keep-scroll.pg-bankp',
        h('p.ef-note', 'Doppeltippen verschiebt zwischen Tasche und Kiste. Die Kiste ist in jeder Lagerkiste dieselbe.'),
        h('div.pg-bank-cols',
          h('section', h('h3', `Kiste (${bank.slots.filter(Boolean).length}/${bank.size})`), h('div.pg-bag.small', grid('bank', bank.slots)),
            h('div.pg-actions',
              actionBtn('Sortieren', () => act('bank:sort', {}), { small: true }),
              cost != null ? actionBtn(`Erweitern (+8) – ${cost.toLocaleString('de-DE')} Gold`, () => act('bank:expand', {}), { small: true, disabled: st.slices.wallet.gold < cost }) : h('span.ef-note', 'Größte Kiste'))),
          h('section', h('h3', 'Tasche'), h('div.pg-bag.small', grid('bag', inv.slots)),
            h('div.pg-actions', actionBtn('Alle Materialien einlagern', () => {
              const r = commit(s, 'bank:depositMaterials', {}); msg = r.ok ? `${r.count} Materialien eingelagert.` : 'Keine Materialien in der Tasche.'; redraw();
            }, { small: true })))),
        selIt ? h('div.pg-sheet.open',
          h('button.pg-sheet-close', { type: 'button', 'aria-label': 'Details schließen', onclick: () => { sel = null; redraw(); } }, '✕'),
          itemDetail(c, selIt.itemId, { ...opts, compact: true, actions: [sel.where === 'bag'
            ? actionBtn('Einlagern', () => act('bank:deposit', { slot: sel.i }), { primary: true })
            : actionBtn('Entnehmen', () => act('bank:withdraw', { slot: sel.i }), { primary: true })] })) : null),
      h('footer.pg-dialog-foot', goldEl(st.slices.wallet.gold), msg ? h('span.pg-msg', msg) : null, actionBtn('Schließen', () => s.panels.close())));
  };
}

// ---------------------------------------------------------------- Erfolge
function achievementsView(s) {
  let group = 'all';
  return (redraw) => {
    const st = s.state, a = st.slices.achievements;
    const all = Object.entries(ACHIEVEMENTS);
    const done = Object.keys(a.unlocked).length;
    const points = all.reduce((n, [id, d]) => n + (a.unlocked[id] ? d.points : 0), 0);
    const maxPoints = all.reduce((n, [, d]) => n + d.points, 0);
    const titles = all.filter(([id, d]) => d.title && a.unlocked[id]);
    const shown = all.filter(([, d]) => group === 'all' || d.group === group);
    const progress = (id, d) => { let v = 0; try { v = d.value(st); } catch { v = 0; } return v; };
    // Offen: nach Fortschritt sortiert (was bald fällig ist, steht oben)
    const open = shown.filter(([id]) => !a.unlocked[id])
      .map(([id, d]) => [id, d, progress(id, d)])
      .sort((x, y) => y[2] / (y[1].goal || 1) - x[2] / (x[1].goal || 1));
    const got = shown.filter(([id]) => a.unlocked[id]);
    const openRows = open.map(([id, d, v]) => h('li.pg-ach',
      h('span.pg-ach-icon', iconEl(d.icon, 24)),
      h('div.pg-ach-body',
        h('div.pg-ach-name', d.name, d.title ? h('span.pg-tag.title', 'Titel') : null),
        h('small', d.desc),
        d.goal > 1 && v > 0 ? barEl(v / d.goal, `${Math.min(v, d.goal).toLocaleString()} / ${d.goal.toLocaleString()}`, '.pg-achbar') : null),
      h('span.pg-ach-pts', String(d.points))));
    // Erreicht: kompakte Kacheln, Beschreibung als Hinweis beim Darüberfahren
    const gotRows = got.map(([id, d]) => h('li.pg-ach.got.mini', { title: d.desc },
      h('span.pg-ach-icon', iconEl(d.icon, 20)),
      h('span.pg-ach-name', d.name),
      h('span.pg-ach-pts', String(d.points))));
    const titleSel = titles.length ? h('label.pg-titlesel', h('span.ef-note', 'Titel'),
      h('select.pg-select', { onchange: (e) => commit(s, 'achievement:title', { id: e.target.value || null }) },
        h('option', { value: '', selected: !a.title }, 'Kein Titel'),
        titles.map(([id, d]) => h('option', { value: id, selected: a.title === id }, d.title)))) : null;
    return panelFrame(s, 'achievements', 'Erfolge',
      tabs([['all', 'Alle'], ...Object.entries(ACHIEVEMENT_GROUPS)], group, (g) => { group = g; redraw(); }),
      h('div.pg-scroll.pg-keep-scroll.pg-achp',
        h('div.pg-ach-head',
          h('div.pg-ach-sum', h('b', `${done} / ${all.length}`), h('span.ef-note', ' Erfolge'), h('span.pg-ach-dot', '·'), h('b', `${points} / ${maxPoints}`), h('span.ef-note', ' Punkte')),
          titleSel),
        barEl(done / all.length, '', '.pg-achtotal'),
        open.length ? h('h3.pg-ach-sec', `Offen (${open.length})`) : null,
        open.length ? h('ul.pg-achs', openRows) : null,
        got.length ? h('h3.pg-ach-sec', `Erreicht (${got.length})`) : null,
        got.length ? h('ul.pg-achs.grid', gotRows) : null,
        !open.length && !got.length ? h('p.ef-note', 'Hier gibt es noch keine Erfolge.') : null));
  };
}

// ---------------------------------------------------------------- Verstärken / Verzaubern
function smithView(s, { vendorId } = {}) {
  let tab = 'upgrade', slot = 'weapon', msg = '';
  return (redraw) => {
    const st = s.state, c = s.content, inv = st.slices.inventory, gold = st.slices.wallet.gold, level = st.slices.progress.level;
    const act = (type, payload, ok) => { const r = commit(s, type, payload); msg = r?.ok ? ok : REASONS[r?.reason] ?? ''; redraw(); };
    let body;
    if (tab === 'upgrade') {
      body = h('ul.pg-recipes', EQUIP_SLOTS.map((k) => {
        const lvl = inv.upgrades[k] ?? 0, def = inv.equipment[k] ? c.find('item', inv.equipment[k]) : null;
        const cost = lvl < UPGRADE_MAX ? upgradeCost(lvl) : null;
        const can = cost && level >= cost.reqLevel && gold >= cost.gold && cost.mats.every((m) => countItem(st, m.itemId) >= m.qty);
        const bonus = statsText(slotBonus({ ...inv, enchants: {} }, k));
        return h(`li.pg-recipe${can ? '.can' : ''}`,
          h('div.pg-recipe-out', def ? itemIconEl({ ...def, name: null }, 40) : h('span.pg-mini.big', iconEl('bag', 24)), lvl ? h('span.pg-qty.plus', `+${lvl}`) : null),
          h('div.pg-recipe-body',
            h('b', `${EQUIP_SLOT_NAMES[k]} +${lvl}`, def ? h(`span.ef-note.r-${def.rarity}`, ` · ${def.name}`) : h('span.ef-note', ' · leer')),
            h('small.ef-note', bonus ? `Bonus: ${bonus}` : 'Noch kein Bonus'),
            cost ? h('div.pg-mats', matChips(s, cost.mats), h(`span.pg-mat${gold >= cost.gold ? '.ok' : ''}`, iconEl('gold', 16), cost.gold.toLocaleString('de-DE')),
              level < cost.reqLevel ? h('span.pg-mat', `ab Stufe ${cost.reqLevel}`) : null) : h('small', 'Höchststufe')),
          cost ? actionBtn(`+${lvl + 1}`, () => act('smith:upgrade', { slot: k }, `${EQUIP_SLOT_NAMES[k]} auf +${lvl + 1} verstärkt.`), { small: true, primary: can, disabled: !can }) : null);
      }));
    } else {
      const list = Object.entries(ENCHANTS).filter(([, e]) => e.slots.includes(slot));
      const cur = inv.enchants[slot];
      body = h('div',
        h('div.pg-filters', EQUIP_SLOTS.map((k) => h(`button.pg-chip${slot === k ? '.on' : ''}`, { type: 'button', onclick: () => { slot = k; msg = ''; redraw(); } },
          EQUIP_SLOT_NAMES[k], inv.enchants[k] ? ' ✦' : ''))),
        h('p.ef-note', cur ? `Aktiv: ${ENCHANTS[cur].name} (${statsText(ENCHANTS[cur].stats)}). Neu verzaubern ersetzt sie.` : 'Dieser Platz ist nicht verzaubert.'),
        h('ul.pg-recipes', list.map(([id, e]) => {
          const can = cur !== id && level >= e.level && gold >= e.gold && e.mats.every((m) => countItem(st, m.itemId) >= m.qty);
          return h(`li.pg-recipe${can ? '.can' : ''}${cur === id ? '.selected' : ''}${level < e.level ? '.locked' : ''}`,
            h('span.pg-mini.big', iconEl('essence_shadow', 24)),
            h('div.pg-recipe-body', h('b', e.name, cur === id ? h('span.pg-tag.main', 'aktiv') : null), h('small', statsText(e.stats)),
              h('div.pg-mats', matChips(s, e.mats), h(`span.pg-mat${gold >= e.gold ? '.ok' : ''}`, iconEl('gold', 16), e.gold.toLocaleString('de-DE')),
                level < e.level ? h('span.pg-mat', `ab Stufe ${e.level}`) : null)),
            actionBtn('Verzaubern', () => act('smith:enchant', { slot, enchantId: id }, `${EQUIP_SLOT_NAMES[slot]}: ${e.name}.`), { small: true, primary: can, disabled: !can }));
        })));
    }
    return panelFrame(s, 'craft', 'Verstärken',
      tabs([['upgrade', 'Verstärken'], ['enchant', 'Verzaubern']], tab, (t) => { tab = t; msg = ''; redraw(); }),
      h('div.pg-scroll.pg-keep-scroll.pg-craft',
        h('p.ef-note', 'Verstärkung und Verzauberung gelten für den Ausrüstungsplatz – wechselst du ein Teil, bleiben sie erhalten.'),
        body),
      h('footer.pg-dialog-foot', goldEl(gold), msg ? h('span.pg-msg', msg) : null,
        vendorId ? actionBtn('Zurück', () => s.panels.open('questDialog', { npcId: vendorId })) : actionBtn('Schließen', () => s.panels.close())));
  };
}

// ---------------------------------------------------------------- Glutprüfungen
function trialsView(s) {
  let tier = null, msg = '';
  return (redraw) => {
    const st = s.state, c = s.content, tr = st.slices.trials;
    const unlocked = st.slices.progress.level >= TRIAL_REQUIRES.level && st.slices.quests.completed.includes(TRIAL_REQUIRES.quest);
    const maxTier = Math.min(TRIAL_MAX_TIER, tr.best + 1);
    if (tier == null || tier > maxTier) tier = maxTier;
    const lvl = st.slices.progress.level;
    const spec = trialSpec(tier, 1, lvl, st.slices.quests.completed), ch = trialChances(tier), rw = trialRewards(tier, { rng: () => 0.99, firstClear: !tr.cleared[tier], level: lvl });
    const run = tr.run;
    const last = run && (run.phase === 'done' || run.phase === 'failed') ? run : tr.last ?? null;
    const pct = (v) => `${(Math.round(v * 1000) / 10).toLocaleString('de-DE')}\u00a0%`;  // Zahl und % nie getrennt
    return panelFrame(s, 'trials', 'Glutprüfungen',
      h('div.pg-scroll.pg-keep-scroll.pg-trials',
        h('p.pg-dialog-text', '„In der Esse unter dem Berg glimmt noch Ignaroths Wille. Wer ihn bezwingt, wird stärker – und die Glut antwortet mit jeder Stufe härter.“'),
        !unlocked ? h('p.pg-hint', `Freigeschaltet ab Stufe ${TRIAL_REQUIRES.level}, nachdem Ignaroth gefallen ist.`) : null,
        last ? h(`div.pg-trial-result${last.phase === 'done' ? '.won' : '.lost'}`,
          last.phase === 'done'
            ? [h('b', `Stufe ${last.tier} bestanden in ${Math.floor(last.time / 60)}:${String(last.time % 60).padStart(2, '0')}`),
              h('div.pg-rewards-items', (last.rewards?.items ?? []).map((it) => { const d = c.find('item', it.itemId); return d ? h(`span.pg-reward-item.rb-${d.rarity}`, itemIconEl({ ...d, name: null }, 28), h(`b.r-${d.rarity}`, `${d.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`)) : null; }))]
            : h('b', `Stufe ${last.tier} gescheitert (${last.failReason === 'death' ? 'gefallen' : last.failReason === 'time' ? 'Zeit abgelaufen' : 'verlassen'})`)) : null,
        h('div.pg-trial-pick',
          actionBtn('−', () => { tier = Math.max(1, tier - 1); redraw(); }, { disabled: tier <= 1 }),
          h('div.pg-trial-tier', h('span.ef-note', 'Stufe'), h('b', String(tier)), tr.cleared[tier] ? h('small.ef-note', `Bestzeit ${Math.floor(tr.cleared[tier] / 60)}:${String(tr.cleared[tier] % 60).padStart(2, '0')}`) : h('small.ef-note', 'noch nicht bestanden')),
          actionBtn('+', () => { tier = Math.min(maxTier, tier + 1); redraw(); }, { disabled: tier >= maxTier })),
        h('dl.pg-kvs',
          h('div.pg-kv', h('dt', 'Gegner'), h('dd', `Stufe ${spec.level ?? lvl} · Leben ×${spec.hpMult} · Schaden ×${spec.dmgMult}`)),
          h('div.pg-kv', h('dt', 'Ablauf'), h('dd', `${spec.target} Punkte (Elite 4), dann ein Boss · ${spec.timeLimit / 60}\u00a0min`)),
          h('div.pg-kv', h('dt', 'Affixe'), h('dd', tier >= 8 ? '2 zufällige' : tier >= 3 ? '1 zufälliges' : 'keine')),
          h('div.pg-kv', h('dt', 'Belohnung'), h('dd', `${rw.gold.toLocaleString('de-DE')} Gold · ${rw.shards} Glutsplitter · ${tier >= 5 ? "2 Teile" : "1 Teil"} Stufe ${rw.level ?? lvl}`)),
          h('div.pg-kv', h('dt', 'Chancen je Teil'), h('dd', h('span.r-epic.pg-nowrap', `Episch ${pct(ch.epic)}`), ' · ', h('span.r-legendary.pg-nowrap', `Legendär ${pct(ch.legendary)}`)))),
        h('p.ef-note', `Mögliche Affixe: ${Object.values(TRIAL_AFFIXES).join(' · ')}.`),
        h('p.ef-note', `Beste Stufe: ${tr.best} · Versuche bestanden: ${tr.runs}. Glutsplitter tauschst du in der Schmiede gegen Wächter-Ausrüstung.`)),
      h('footer.pg-dialog-foot', msg ? h('span.pg-msg', msg) : null,
        actionBtn(`Stufe ${tier} betreten`, () => {
          const r = commit(s, 'trial:start', { tier });
          msg = r.ok ? '' : REASONS[r.reason] ?? 'Das geht gerade nicht.';
          if (r.ok) s.panels.close(); else redraw();
        }, { primary: true, disabled: !unlocked }),
        actionBtn('Schließen', () => s.panels.close())));
  };
}

// Setboni und Schmiede-Zusatzwerte für das Charakter-Panel
export function bonusSectionEl(st) {
  const inv = st.slices.inventory;
  const sets = activeSets(inv.equipment);
  const bonus = statsText(inv.bonus);
  if (!sets.length && !bonus) return null;
  return h('section', h('h3', 'Setboni und Schmiede'),
    sets.map((x) => setInfoEl(x.setId, inv.equipment)),
    bonus ? h('p.pg-bonus-sum', `Zusatzwerte gesamt: ${bonus}`) : null);
}
