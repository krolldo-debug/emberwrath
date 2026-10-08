// Panel „Auftragsbrett“ (Thread C). Öffnet sich über 'board:open' (B: Objekt quest_board in den Städten).
import { h } from '../core/dom.js';
import { BOARD_OFFERS, WEEK_GOAL, boardOffers, offerRewards, offerText, weekChest, msUntilNextDay, boardRegion } from './board.js';
import { panelFrame, actionBtn, barEl, rewardsEl } from './widgets.js';
import { fmtNum } from '../i18n/index.js';

const commit = (s, type, payload) => s.state.commit(type, payload);
function untilText(ms) {
  const m = Math.ceil(ms / 60000), hh = Math.floor(m / 60);
  return hh ? `Neue Aufträge in ${hh} h ${m % 60} min.` : `Neue Aufträge in ${m} min.`;
}

export function boardView(s) {
  let msg = '';
  return (redraw) => {
    const st = s.state, c = s.content, b = st.slices.board, level = st.slices.progress.level;
    const now = Date.now();
    const offers = boardOffers(b.day, b.level);
    const region = boardRegion(b.level);
    const rows = offers.map((o) => {
      const t = offerText(o, c), r = offerRewards(o, level);
      const done = b.done.includes(o.id), taken = b.taken[o.id];
      const ready = taken != null && taken >= o.count;
      const act = done ? h('span.pg-tag', 'Erledigt')
        : ready ? actionBtn('Belohnung holen', () => { const x = commit(s, 'board:claim', { offerId: o.id, now: Date.now() }); msg = x?.ok ? '' : 'Das geht gerade nicht.'; redraw(); }, { primary: true, small: true })
          : taken != null ? barEl(taken / o.count, `${taken}/${o.count}`)
            : actionBtn('Annehmen', () => { commit(s, 'board:accept', { offerId: o.id, now: Date.now() }); redraw(); }, { small: true });
      return h(`li.pg-board-offer${done ? '.done' : ready ? '.ready' : ''}`,
        h('div.pg-board-main', h('b', t.title), h('p', h('span', t.text), t.note ? ' ' : null, t.note ? h('span', t.note) : null), rewardsEl(c, r, r.items)),
        h('div.pg-board-act', act));
    });
    const chest = weekChest(level);
    const weekReady = b.weekDone >= WEEK_GOAL && !b.weekClaimed;
    return panelFrame(s, 'board', 'Auftragsbrett',
      h('div.pg-scroll.pg-keep-scroll.pg-board',
        h('p.pg-dialog-text', `„Jeden Tag neue Arbeit. Wer zehnmal in einer Woche liefert, bekommt die Truhe der Wache.“`),
        h('p.pg-hint', h('span', `${BOARD_OFFERS} Aufträge für die Region ${region.name}.`), ' ', h('span', untilText(msUntilNextDay(now)))),
        h('ul.pg-board-list', rows),
        h('section.pg-board-week',
          h('h3', 'Wochentruhe'),
          barEl(Math.min(1, b.weekDone / WEEK_GOAL), `${Math.min(b.weekDone, WEEK_GOAL)}/${WEEK_GOAL} Aufträge diese Woche`),
          b.weekClaimed ? h('p.ef-note', 'Diese Woche schon geöffnet. Am Montag steht eine neue Truhe bereit.')
            : weekReady ? actionBtn('Truhe öffnen', () => { const x = commit(s, 'board:claimWeek', { now: Date.now() }); msg = x?.ok ? '' : 'Das geht gerade nicht.'; redraw(); }, { primary: true })
              : h('p.ef-note', `Inhalt: ${fmtNum(chest.gold)} Gold, Material der Region und ein Ausrüstungsteil (grün oder blau).`)),
        msg ? h('p.pg-msg', msg) : null));
  };
}
