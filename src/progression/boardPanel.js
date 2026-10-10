// Panel „Auftragsbrett“ (Thread C). Öffnet sich über 'board:open' (B: Objekt quest_board in den Städten).
import { h } from '../core/dom.js';
import { BOARD_OFFERS, WEEK_GOAL, boardOffers, offerRewards, offerText, weekChest, msUntilNextDay, boardRegion, boardDay } from './board.js';
import { STREAK_DAYS, loginReward, firstWinReward, challengeReward, challengeText } from './daily.js';
import { panelFrame, actionBtn, barEl, rewardsEl, goldEl, attachTip } from './widgets.js';
import { iconEl } from '../gfx/Icons.js';
import { RARITIES } from './items.js';
import { serverNow } from './clock.js';
import { fmtNum } from '../i18n/index.js';

const commit = (s, type, payload) => s.state.commit(type, payload);
// Tagesbelohnung: 7 Felder, abgeholte gedimmt, die heutige gerahmt. Tooltip (Maus) nennt den Inhalt.
function dayIcon(c, r, n) {
  if (r.icon === 'potion') return iconEl(c.find('item', r.items[0]?.itemId)?.icon ?? 'potion', 24);
  // Material der Region: Symbol des ersten Materials, doppelt groß (ganzzahlig) und aufgehellt, damit es so groß wirkt wie die anderen
  if (r.icon === 'mat') { const el = iconEl(c.find('item', r.items[0]?.itemId)?.icon ?? 'ore', 48); el.classList.add('pg-daily-mat'); return el; }
  return iconEl(r.icon === 'chest' ? 'helm_horned' : n >= 3 ? 'gold_pile' : 'gold', 24);
}
function dayTip(c, r) {
  const lines = [];
  if (r.gold) lines.push(h('div', `${fmtNum(r.gold)} Gold`));
  for (const it of r.items) lines.push(h('div', `${it.qty}× ${c.find('item', it.itemId)?.name ?? it.itemId}`));
  if (r.gear) lines.push(h('div.r-rare', 'Ein blaues Ausrüstungsteil'));
  return h('div.pg-daily-tip', lines);
}
function dailyEl(s, today, view) {
  const c = s.content, d = s.state.slices.daily, level = s.state.slices.progress.level;
  if (!d) return null;
  const gotToday = d.day === today && d.streak > 0;
  const days = Array.from({ length: STREAK_DAYS }, (_, i) => {
    const n = i + 1, r = loginReward(n, level);
    const today_ = gotToday && n === d.streak;
    const el = h(`li.pg-daily-day${n <= d.streak && !today_ ? '.got' : ''}${today_ ? '.today' : ''}${view.day === n ? '.sel' : ''}`,
      { 'aria-label': `Tag ${n}`, role: 'button', tabindex: '0', onclick: () => { view.day = view.day === n ? 0 : n; view.redraw(); } },
      dayIcon(c, r, n), h('span.pg-daily-n', String(n)));
    return attachTip(el, () => dayTip(c, r));
  });
  // Antippen (Handy) zeigt den Inhalt eines Tages unter der Leiste; Maus hat den Tooltip
  const pick = view.day ? h('div.pg-daily-pick', h('b', `Tag ${view.day}`), dayTip(c, loginReward(view.day, level))) : null;
  const win = firstWinReward(level), winDone = d.winDay === today;
  return h('section.pg-daily',
    h('div.pg-daily-head', h('h3', 'Tagesbelohnung'), h('span.pg-daily-count', d.streak ? `Tag ${d.streak} von ${STREAK_DAYS}` : 'Ab morgen')),
    h('ol.pg-daily-days', days),
    pick,
    h(`div.pg-daily-win${winDone ? '.done' : ''}`,
      h('span.pg-daily-win-label', 'Erster Sieg des Tages'),
      winDone ? h('span.pg-tag', 'Erledigt') : h('span.pg-daily-win-reward', win.xp ? h('span.pg-xp', `${fmtNum(win.xp)} EP`) : null, goldEl(win.gold))));
}

// Wochenherausforderung: Ziel, Regel, Belohnung, Abholen
function challengeEl(s, redraw, setMsg) {
  const c = s.content, d = s.state.slices.daily, level = s.state.slices.progress.level;
  if (!d?.challenge) return null;
  const t = challengeText(d.challenge, c), r = challengeReward(level);
  const gear = h('div.pg-reward-item.rb-rare', iconEl('helm_horned', 24), h('span.pg-reward-text', h('b.r-rare', 'Ausrüstungsteil'), h('small', `${RARITIES.rare.name} oder ${RARITIES.epic.name}`)));
  const act = d.cClaimed ? h('span.pg-tag', 'Erledigt')
    : d.cDone ? actionBtn('Belohnung holen', () => { const x = commit(s, 'daily:claimChallenge', { now: serverNow() }); setMsg(x?.ok ? '' : 'Das geht gerade nicht.'); redraw(); }, { primary: true, small: true })
      : null;
  const rewards = rewardsEl(c, { gold: r.gold }, r.items);
  const list = rewards.querySelector('.pg-rewards-items');
  if (list) list.append(gear); else rewards.append(h('div.pg-rewards-items', gear));
  return h('section.pg-board-week.pg-challenge',
    h('h3', 'Wochenherausforderung'),
    h(`div.pg-board-offer${d.cClaimed ? '.done' : d.cDone ? '.ready' : ''}`,
      h('div.pg-board-main', h('b', t.title), h('p', t.rule), rewards),
      act ? h('div.pg-board-act', act) : null));
}

function untilText(ms) {
  const m = Math.ceil(ms / 60000), hh = Math.floor(m / 60);
  return hh ? `Neue Aufträge in ${hh} h ${m % 60} min.` : `Neue Aufträge in ${m} min.`;
}

export function boardView(s) {
  let msg = '';
  const view = { day: 0, redraw: null };
  return (redraw) => {
    view.redraw = redraw;
    const st = s.state, c = s.content, b = st.slices.board, level = st.slices.progress.level;
    const now = serverNow(), today = boardDay(now);
    const offers = boardOffers(b.day, b.level);
    const region = boardRegion(b.level);
    const rows = offers.map((o) => {
      const t = offerText(o, c), r = offerRewards(o, level);
      const done = b.done.includes(o.id), taken = b.taken[o.id];
      const ready = taken != null && taken >= o.count;
      const act = done ? h('span.pg-tag', 'Erledigt')
        : ready ? actionBtn('Belohnung holen', () => { const x = commit(s, 'board:claim', { offerId: o.id, now: serverNow() }); msg = x?.ok ? '' : 'Das geht gerade nicht.'; redraw(); }, { primary: true, small: true })
          : taken != null ? barEl(taken / o.count, `${taken}/${o.count}`)
            : actionBtn('Annehmen', () => { commit(s, 'board:accept', { offerId: o.id, now: serverNow() }); redraw(); }, { small: true });
      return h(`li.pg-board-offer${done ? '.done' : ready ? '.ready' : ''}`,
        h('div.pg-board-main', h('b', t.title), h('p', h('span', t.text), t.note ? ' ' : null, t.note ? h('span', t.note) : null), rewardsEl(c, r, r.items)),
        h('div.pg-board-act', act));
    });
    const chest = weekChest(level);
    const weekReady = b.weekDone >= WEEK_GOAL && !b.weekClaimed;
    return panelFrame(s, 'board', 'Auftragsbrett',
      h('div.pg-scroll.pg-keep-scroll.pg-board',
        dailyEl(s, today, view),
        h('p.pg-hint', h('span', `${BOARD_OFFERS} Aufträge für die Region ${region.name}.`), ' ', h('span', untilText(msUntilNextDay(now)))),
        h('ul.pg-board-list', rows),
        challengeEl(s, redraw, (m) => { msg = m; }),
        h('section.pg-board-week',
          h('h3', 'Wochentruhe'),
          barEl(Math.min(1, b.weekDone / WEEK_GOAL), `${Math.min(b.weekDone, WEEK_GOAL)}/${WEEK_GOAL} Aufträge diese Woche`),
          b.weekClaimed ? h('p.ef-note', 'Diese Woche schon geöffnet. Am Montag steht eine neue Truhe bereit.')
            : weekReady ? actionBtn('Truhe öffnen', () => { const x = commit(s, 'board:claimWeek', { now: serverNow() }); msg = x?.ok ? '' : 'Das geht gerade nicht.'; redraw(); }, { primary: true })
              : h('p.ef-note', `Inhalt: ${fmtNum(chest.gold)} Gold, Material der Region und ein Ausrüstungsteil (grün oder blau).`)),
        msg ? h('p.pg-msg', msg) : null));
  };
}
