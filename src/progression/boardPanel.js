// Panel „Auftragsbrett“ (Thread C). Öffnet sich über 'board:open' (B: Objekt quest_board in den Städten).
// Aufbau (Runde 10.10., „übersichtlicher“): drei ruhige Abschnitte – Tagesbelohnung, Aufträge, Diese Woche.
// Jede Zeile gleich gebaut: Titel + ein kurzer Satz links, Belohnung als kleine Symbole, Knopf rechts. Keine Kästen in Kästen.
import { h } from '../core/dom.js';
import { WEEK_GOAL, boardOffers, offerRewards, offerText, weekChest, msUntilNextDay, boardDay } from './board.js';
import { STREAK_DAYS, loginReward, firstWinReward, challengeReward, challengeText } from './daily.js';
import { panelFrame, actionBtn, goldEl, attachTip, itemDetail } from './widgets.js';
import { iconEl } from '../gfx/Icons.js';
import { RARITIES } from './items.js';
import { serverNow } from './clock.js';
import { fmtNum } from '../i18n/index.js';

const commit = (s, type, payload) => s.state.commit(type, payload);

// ---------------------------------------------------------------- Bausteine
function dayIcon(c, r, n) {
  if (r.icon === 'potion') return iconEl(c.find('item', r.items[0]?.itemId)?.icon ?? 'potion', 24);
  if (r.icon === 'mat') { const el = iconEl('bag', 24); el.classList.add('pg-bright'); return el; }   // Materialbeutel: gleich groß wie die anderen Symbole, Inhalt per Tooltip/Antippen
  return iconEl(r.icon === 'chest' ? 'helm_horned' : n >= 3 ? 'gold_pile' : 'gold', 24);
}
function dayTip(c, r) {
  const lines = [];
  if (r.gold) lines.push(h('div', `${fmtNum(r.gold)} Gold`));
  for (const it of r.items) lines.push(h('div', `${it.qty}× ${c.find('item', it.itemId)?.name ?? it.itemId}`));
  if (r.gear) lines.push(h('div.r-rare', 'Ein blaues Ausrüstungsteil'));
  return h('div.pg-daily-tip', lines);
}

// Belohnung als eine Zeile kleiner Symbole: Gegenstände (Seltenheitsrahmen), dann EP und Gold ganz rechts (Gold steht so untereinander).
// Maus: Tooltip. Antippen (auch Handy): Inhalt als Zeile unter der Auftragszeile (view.info).
function rewardLine(c, { xp = 0, gold = 0, items = [], gear = null }, view, key) {
  const pickable = (el, text) => {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.onclick = () => { view.info = view.info?.key === key && view.info.text === text ? null : { key, text }; view.redraw(); };
    return el;
  };
  const icons = items.map((it) => {
    const def = c.find('item', it.itemId);
    if (!def) return null;
    const el = h(`span.pg-rw-icon.rb-${def.rarity}${def.type === 'material' ? '.mat' : ''}`, iconEl(def.icon, 24), it.qty > 1 ? h('small', `${it.qty}`) : null);
    el.title = def.name;
    return pickable(attachTip(el, () => itemDetail(c, it.itemId, { compact: true, compare: false })), `${it.qty}× ${def.name}`);
  });
  if (gear) {
    const text = `Ausrüstungsteil (${RARITIES[gear].name})`;
    const el = h(`span.pg-rw-icon.rb-${gear}`, iconEl('helm_horned', 24));
    el.title = text;
    icons.push(pickable(el, text));
  }
  return h('span.pg-rw', ...icons, xp ? h('span.pg-xp', `${fmtNum(xp)} EP`) : null, gold ? goldEl(gold) : null);
}

// Eine Zeile: Titel, kurzer Satz, Belohnung, Knopf/Status; darunter ggf. der angetippte Inhalt
function row(title, sub, rewards, act, state = '', info = null) {
  return h(`li.pg-brow${state ? `.${state}` : ''}`,
    h('div.pg-brow-main', h('b', title), sub ? h('span', sub) : null),
    rewards,
    h('div.pg-brow-act', act ?? null),
    info ? h('div.pg-brow-info', info) : null);
}
const doneTag = () => h('span.pg-tag', 'Erledigt');
const progressEl = (cur, max) => h('span.pg-brow-prog', h('i', { style: { width: `${Math.round(Math.min(1, cur / max) * 100)}%` } }), h('b', `${cur}/${max}`));

function section(title, meta, ...body) {
  return h('section.pg-bsec', h('header.pg-bsec-head', h('h3', title), meta ? h('span', meta) : null), ...body);
}

// ---------------------------------------------------------------- Abschnitte
function dailySection(s, today, view) {
  const c = s.content, d = s.state.slices.daily, level = s.state.slices.progress.level;
  if (!d) return null;
  const gotToday = d.day === today && d.streak > 0;
  const days = Array.from({ length: STREAK_DAYS }, (_, i) => {
    const n = i + 1, r = loginReward(n, level);
    const now_ = gotToday && n === d.streak;
    const el = h(`li.pg-daily-day${n <= d.streak && !now_ ? '.got' : ''}${now_ ? '.today' : ''}${view.day === n ? '.sel' : ''}`,
      { 'aria-label': `Tag ${n}`, role: 'button', tabindex: '0', onclick: () => { view.day = view.day === n ? 0 : n; view.redraw(); } },
      dayIcon(c, r, n), h('span.pg-daily-n', String(n)));
    return attachTip(el, () => dayTip(c, r));
  });
  // Antippen (Handy) zeigt den Inhalt eines Tages unter der Leiste; Maus hat den Tooltip
  const pick = view.day ? h('div.pg-daily-pick', h('b', `Tag ${view.day}`), dayTip(c, loginReward(view.day, level))) : null;
  const win = firstWinReward(level), winDone = d.winDay === today;
  return section('Tagesbelohnung', d.streak ? `Tag ${d.streak} von ${STREAK_DAYS}` : 'Ab morgen',
    h('ol.pg-daily-days', days),
    pick,
    h('ul.pg-blist.pg-blist-win', row('Erster Sieg des Tages', null, winDone ? null : rewardLine(c, win, view, 'win'), winDone ? doneTag() : null, winDone ? 'done' : '')));
}

function untilText(ms) {
  const m = Math.ceil(ms / 60000), hh = Math.floor(m / 60);
  return hh ? `Neu in ${hh} h ${m % 60} min` : `Neu in ${m} min`;
}

export function boardView(s) {
  let msg = '';
  const view = { day: 0, info: null, redraw: null };
  const infoFor = (key) => (view.info?.key === key ? view.info.text : null);
  const tryCommit = (type, payload, redraw) => { const x = commit(s, type, payload); msg = x?.ok ? '' : 'Das geht gerade nicht.'; redraw(); };
  return (redraw) => {
    view.redraw = redraw;
    const st = s.state, c = s.content, b = st.slices.board, d = st.slices.daily, level = st.slices.progress.level;
    const now = serverNow(), today = boardDay(now);

    const offers = boardOffers(b.day, b.level).map((o) => {
      const t = offerText(o, c), r = offerRewards(o, level);
      const done = b.done.includes(o.id), taken = b.taken[o.id];
      const ready = taken != null && taken >= o.count;
      const act = done ? doneTag()
        : ready ? actionBtn('Abholen', () => tryCommit('board:claim', { offerId: o.id, now: serverNow() }, redraw), { primary: true, small: true })
          : taken != null ? progressEl(taken, o.count)
            : actionBtn('Annehmen', () => { commit(s, 'board:accept', { offerId: o.id, now: serverNow() }); redraw(); }, { small: true });
      // Titel nennt das Ziel schon: bei Elite und Boss steht darunter der Hinweis statt „Ziel: …“
      return row(t.title, (o.kind === 'elite' || o.kind === 'boss') && t.note ? t.note : t.text, rewardLine(c, r, view, o.id), act, done ? 'done' : ready ? 'ready' : '', infoFor(o.id));
    });

    const week = [];
    if (d?.challenge) {
      const t = challengeText(d.challenge, c), r = challengeReward(level);
      const act = d.cClaimed ? doneTag()
        : d.cDone ? actionBtn('Abholen', () => tryCommit('daily:claimChallenge', { now: serverNow() }, redraw), { primary: true, small: true }) : null;
      week.push(row(t.title, t.rule, rewardLine(c, { gold: r.gold, items: r.items, gear: 'rare' }, view, 'challenge'), act, d.cClaimed ? 'done' : d.cDone ? 'ready' : '', infoFor('challenge')));
    }
    const chest = weekChest(level), weekReady = b.weekDone >= WEEK_GOAL && !b.weekClaimed;
    const chestAct = b.weekClaimed ? doneTag()
      : weekReady ? actionBtn('Truhe öffnen', () => tryCommit('board:claimWeek', { now: serverNow() }, redraw), { primary: true, small: true })
        : progressEl(Math.min(b.weekDone, WEEK_GOAL), WEEK_GOAL);
    week.push(row('Wochentruhe', `${WEEK_GOAL} Aufträge in einer Woche.`,
      rewardLine(c, { gold: chest.gold, items: chest.mats, gear: 'uncommon' }, view, 'chest'), chestAct, b.weekClaimed ? 'done' : weekReady ? 'ready' : '', infoFor('chest')));

    return panelFrame(s, 'board', 'Auftragsbrett',
      h('div.pg-scroll.pg-keep-scroll.pg-board',
        dailySection(s, today, view),
        section('Aufträge', untilText(msUntilNextDay(now)), h('ul.pg-blist', offers)),
        section('Diese Woche', null, h('ul.pg-blist', week)),
        msg ? h('p.pg-msg', msg) : null));
  };
}
