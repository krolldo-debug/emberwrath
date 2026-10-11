import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, abilityIcon } from '../gfx/Icons.js';
import { TALENT_TIERS, PASSIVES, talentsFor, canLearn } from './talents.js';
import { computeStats } from './stats.js';
import { attachTip, hideTip } from '../progression/widgets.js';
import { fmtNum } from '../i18n/index.js';

// Panel 'talents' (Thread A): Fähigkeiten mit Freischaltstufe, Passive und Talentbaum.
// Öffnen: Aktion 'talents' oder bus.emit(EV.UI_OPEN_PANEL, { id: 'talents' }).
// Lernen/Zurücksetzen nur über Commands (character:learnTalent, character:resetTalents).
const KEYS = ['Q', 'R', 'T', 'G'];

export function registerTalentPanel(game) {
  game.panels.register('talents', (session) => talentPanel(session, game), { action: 'talents', title: 'Talente' });
}

// Aufgeräumt (11.10.): Fähigkeiten als schlanke Zeilen (Beschreibung beim Überfahren, auf dem Handy beim
// Antippen), Talente als Raster mit einer Zeile je Stufe. „+“ nur, wo gerade ein Punkt gesetzt werden kann.
function talentPanel(session, game) {
  const { state, content, bus } = session;
  const root = h('div.ef-panel.tal-panel', { role: 'dialog', 'aria-label': 'Fähigkeiten und Talente' });
  let armedReset = false;
  let opened = null; // Touch: aufgeklappte Fähigkeit

  const render = () => {
    const ch = state.slices.character;
    const level = state.slices.progress?.level ?? 1;
    const cls = content.get('class', ch.classId);
    const stats = computeStats(state, content);
    const pts = stats.talentPoints;
    const talents = stats.talents;
    const touch = document.documentElement.classList.contains('ef-touch');

    // Eine Zeile je Fähigkeit/Passive: Symbol, Name, Kurzwerte; Beschreibung im Tooltip bzw. aufgeklappt
    const skillRow = (id, icon, name, tags, parts, desc, lock) => {
      const meta = parts.filter(Boolean).flatMap((x, i) => (i ? [h('span.tal-sep', ' · '), x] : [x]));
      const open = touch && opened === id;
      const el = h(`div.tal-ability${lock ? '.locked' : ''}${open ? '.open' : ''}`, {
        onclick: touch ? () => { opened = open ? null : id; render(); } : null,
      },
      h('span.tal-icon', iconEl(icon, 32)),
      h('div.tal-body',
        h('div.tal-name', name, tags),
        h('p.tal-meta', meta),
        open ? h('p.tal-desc', desc) : null));
      attachTip(el, () => h('div.pg-detail.tal-tip', h('b', name), h('p', desc)));
      return el;
    };

    const abilities = cls.abilities.map((id, i) => {
      const a = content.get('ability', id);
      const lock = level < (a.level ?? 1);
      const cd = Math.round(a.cooldown * stats.cooldownMult * 10) / 10;
      const bonus = stats.abilityMods?.[id] ?? 0;
      const parts = lock ? [`ab Stufe ${a.level}`] : [a.cost ? `${a.cost} ${stats.resourceName}` : 'Keine Kosten', `${fmtNum(cd)} s`, bonus ? h('span.tal-bonus', `+${Math.round(bonus * 100)} % Schaden`) : null];
      return skillRow(id, abilityIcon(id, a), a.name, touch ? null : h('kbd.tal-key', KEYS[i]), parts, a.desc, lock);
    });

    const passives = (PASSIVES[cls.id] ?? []).map((p) => {
      const lock = level < p.level;
      return skillRow(p.id, p.icon, p.name, null, ['Passiv', lock ? `ab Stufe ${p.level}` : null], p.desc, lock);
    });

    const defs = talentsFor(cls.id);
    const tiers = TALENT_TIERS.map((tier, ti) => {
      const open = level >= tier.level;
      const cards = Object.entries(defs).filter(([, d]) => d.tier === ti).map(([id, d]) => {
        const rank = talents[id] ?? 0;
        const err = canLearn(cls.id, talents, level, id);
        const learn = err ? null : h('button.ef-btn.tal-learn', {
          type: 'button', title: `${d.name} lernen`, 'aria-label': `${d.name} lernen`,
          onclick: () => {
            const r = state.commit('character:learnTalent', { id });
            if (!r?.ok && r?.error) bus.emit(EV.UI_TOAST, { text: r.error, kind: 'warn' });
          },
        }, '+');
        const tOpen = touch && opened === id;
        const tile = h(`div.tal-talent${rank ? '.has' : ''}${rank >= d.max ? '.max' : ''}${learn ? '.can' : ''}${tOpen ? '.open' : ''}`, {
          onclick: touch ? (e) => { if (e.target.closest('.tal-learn')) return; opened = tOpen ? null : id; render(); } : null,
        },
          h('span.tal-icon.small', iconEl(d.icon, 28)),
          h('div.tal-body',
            h('div.tal-name', h('span.tal-tname', d.name)),
            h('p.tal-desc', d.desc)),
          h('div.tal-side',
            h('span.tal-pips', { role: 'img', 'aria-label': `Rang ${rank} von ${d.max}` },
              Array.from({ length: d.max }, (_, i) => h(`span.tal-pip${i < rank ? '.on' : ''}`))),
            learn));
        return attachTip(tile, () => h('div.pg-detail.tal-tip', h('b', d.name), h('p', d.desc)));
      });
      return h(`section.tal-tier${open ? '' : '.locked'}`,
        h('div.tal-tierlabel', h('b', tier.name), h('span', `Stufe ${tier.level}`)),
        cards);
    });

    const reset = h('button.tal-reset', {
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
        reset,
        h('div.tal-points', { class: `tal-points${pts.free > 0 ? ' free' : ''}`, title: pts.total ? `${pts.spent} von ${pts.total} Talentpunkten verteilt. Jede neue Stufe bringt einen weiteren, Zurücksetzen ist jederzeit kostenlos.` : 'Ab Stufe 2 bringt jede neue Stufe einen Talentpunkt. Zurücksetzen ist jederzeit kostenlos.' },
          h('strong', String(pts.free)), h('span', pts.free === 1 ? 'Talentpunkt frei' : 'Talentpunkte frei')),
        h('button.tal-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×')),
      h('div.tal-scroll',
        h('section.tal-abilities', h('h3.tal-h', 'Fähigkeiten'), h('div.tal-list', abilities, passives)),
        h('section.tal-tree', h('h3.tal-h', 'Talente'), tiers)));
  };

  let queued = false;
  const off = bus.on(EV.STATE_CHANGED, () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; render(); }); } });
  render();
  return { root, dispose: () => { off(); hideTip(); } };
}
