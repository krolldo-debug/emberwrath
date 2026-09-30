import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, abilityIcon } from '../gfx/Icons.js';
import { TALENT_TIERS, PASSIVES, talentsFor, canLearn } from './talents.js';
import { computeStats } from './stats.js';

// Panel 'talents' (Thread A): Fähigkeiten mit Freischaltstufe, Passive und Talentbaum.
// Öffnen: Aktion 'talents' oder bus.emit(EV.UI_OPEN_PANEL, { id: 'talents' }).
// Lernen/Zurücksetzen nur über Commands (character:learnTalent, character:resetTalents).
const KEYS = ['Q', 'R', 'T', 'G'];

export function registerTalentPanel(game) {
  game.panels.register('talents', (session) => talentPanel(session, game), { action: 'talents', title: 'Talente' });
}

function talentPanel(session, game) {
  const { state, content, bus } = session;
  const root = h('div.ef-panel.tal-panel', { role: 'dialog', 'aria-label': 'Fähigkeiten und Talente' });
  let armedReset = false;

  const render = () => {
    const ch = state.slices.character;
    const level = state.slices.progress?.level ?? 1;
    const cls = content.get('class', ch.classId);
    const stats = computeStats(state, content);
    const pts = stats.talentPoints;
    const talents = stats.talents;
    const touch = document.documentElement.classList.contains('ef-touch');

    const abilities = cls.abilities.map((id, i) => {
      const a = content.get('ability', id);
      const lock = level < (a.level ?? 1);
      const cd = Math.round(a.cooldown * stats.cooldownMult * 10) / 10;
      const bonus = stats.abilityMods?.[id] ?? 0;
      return h(`div.tal-ability${lock ? '.locked' : ''}`,
        h('span.tal-icon', iconEl(abilityIcon(id, a), 36)),
        h('div.tal-body',
          h('div.tal-name', a.name, touch ? null : h('kbd.tal-key', KEYS[i]),
            lock ? h('span.tal-lock', `ab Stufe ${a.level}`) : null),
          h('p.tal-desc', a.desc),
          h('p.tal-meta', [a.cost ? `${a.cost} ${stats.resourceName}` : 'Keine Kosten', `${cd} s Abklingzeit`, bonus ? `+${Math.round(bonus * 100)} % Schaden (Talente)` : null].filter(Boolean).join(' · '))));
    });

    const passives = (PASSIVES[cls.id] ?? []).map((p) => {
      const lock = level < p.level;
      return h(`div.tal-ability.passive${lock ? '.locked' : ''}`,
        h('span.tal-icon', iconEl(p.icon, 36)),
        h('div.tal-body',
          h('div.tal-name', p.name, h('span.tal-tag', 'Passiv'), lock ? h('span.tal-lock', `ab Stufe ${p.level}`) : null),
          h('p.tal-desc', p.desc)));
    });

    const defs = talentsFor(cls.id);
    const tiers = TALENT_TIERS.map((tier, ti) => {
      const open = level >= tier.level;
      const cards = Object.entries(defs).filter(([, d]) => d.tier === ti).map(([id, d]) => {
        const rank = talents[id] ?? 0;
        const err = canLearn(cls.id, talents, level, id);
        const learn = h('button.ef-btn.tal-learn', {
          type: 'button', disabled: !!err, title: err ?? `${d.name} lernen`, 'aria-label': `${d.name} lernen`,
          onclick: () => {
            const r = state.commit('character:learnTalent', { id });
            if (!r?.ok && r?.error) bus.emit(EV.UI_TOAST, { text: r.error, kind: 'warn' });
          },
        }, '+');
        return h(`div.tal-talent${rank ? '.has' : ''}${open ? '' : '.locked'}`,
          h('span.tal-icon.small', iconEl(d.icon, 28)),
          h('div.tal-body',
            h('div.tal-name', d.name),
            h('p.tal-desc', d.desc),
            h('div.tal-pips', { 'aria-label': `Rang ${rank} von ${d.max}` },
              Array.from({ length: d.max }, (_, i) => h(`span.tal-pip${i < rank ? '.on' : ''}`)),
              h('span.tal-rank', `${rank}/${d.max}`))),
          learn);
      });
      return h(`section.tal-tier${open ? '' : '.locked'}`,
        h('h3.tal-h', tier.name, h('span.tal-sub', open ? `ab Stufe ${tier.level}` : `wird auf Stufe ${tier.level} freigeschaltet`)),
        h('div.tal-grid', cards));
    });

    const reset = h('button.ef-btn.tal-reset', {
      type: 'button', disabled: pts.spent === 0,
      onclick: () => {
        if (!armedReset) { armedReset = true; reset.textContent = 'Wirklich zurücksetzen?'; setTimeout(() => { armedReset = false; render(); }, 3000); return; }
        armedReset = false;
        state.commit('character:resetTalents', {});
      },
    }, armedReset ? 'Wirklich zurücksetzen?' : 'Zurücksetzen');

    root.replaceChildren(
      h('header.tal-head',
        h('div', h('h2.ef-sub.tal-title', 'Fähigkeiten & Talente'),
          h('p.tal-step', [ch.name, game.progression?.title?.(), cls.name, `Stufe ${level}`].filter(Boolean).join(' · '))),
        h('div.tal-points', { class: `tal-points${pts.free > 0 ? ' free' : ''}` },
          h('strong', String(pts.free)), h('span', pts.free === 1 ? 'Talentpunkt frei' : 'Talentpunkte frei')),
        h('button.tal-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×')),
      h('div.tal-scroll',
        h('section.tal-abilities', h('h3.tal-h', 'Fähigkeiten'), h('div.tal-list', abilities, passives)),
        h('div.tal-tree',
          h('p.tal-hint', `Pro Stufe ab Stufe 2 gibt es einen Talentpunkt (${pts.spent} von ${pts.total} verteilt). Zurücksetzen ist jederzeit kostenlos.`),
          tiers,
          h('div.tal-foot', reset))));
  };

  let queued = false;
  const off = bus.on(EV.STATE_CHANGED, () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; render(); }); } });
  render();
  return { root, dispose: off };
}
