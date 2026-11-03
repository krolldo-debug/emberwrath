import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { iconEl, abilityIcon } from '../gfx/Icons.js';
import { TALENT_TIERS, PASSIVES, talentsFor, canLearn } from './talents.js';
import { computeStats } from './stats.js';
import { attachTip, hideTip } from '../progression/widgets.js';
import { fmtNum } from '../i18n/index.js';
import { pixelWindow } from '../ui/pixelFrame.js';

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
  let sel = null; // gewähltes Talent im Baum (Karte darunter)

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

    // Talentbaum (03.11.): sechs Stufen als Spalten von links nach rechts, je zwei Talente als Knoten, verbunden durch
    // eine Glutlinie, die bis zur höchsten offenen Stufe leuchtet. Darunter die Karte des gewählten Talents mit „Lernen“.
    const defs = talentsFor(cls.id);
    const ids = Object.keys(defs);
    if (!sel || !defs[sel]) {
      sel = ids.find((id) => !canLearn(cls.id, talents, level, id))
        ?? ids.find((id) => level >= TALENT_TIERS[defs[id].tier].level && (talents[id] ?? 0) < defs[id].max) ?? ids[0];
    }
    const learnOne = (id) => {
      const r = state.commit('character:learnTalent', { id });
      if (!r?.ok && r?.error) bus.emit(EV.UI_TOAST, { text: r.error, kind: 'warn' });
      else game.sfx?.play?.('ui');
    };
    const openTiers = TALENT_TIERS.filter((t) => level >= t.level).length;
    const cols = TALENT_TIERS.map((tier, ti) => {
      const open = level >= tier.level;
      const nodes = ids.filter((id) => defs[id].tier === ti).map((id) => {
        const d = defs[id], rank = talents[id] ?? 0;
        const can = !canLearn(cls.id, talents, level, id);
        const node = h(`button.tal-node${rank ? '.has' : ''}${rank >= d.max ? '.max' : ''}${can ? '.can' : ''}${sel === id ? '.sel' : ''}${open ? '' : '.locked'}`, {
          type: 'button', 'aria-label': d.name, 'aria-pressed': String(sel === id),
          onclick: () => { if (sel === id && can && !touch) { learnOne(id); return; } sel = id; render(); },
        }, iconEl(d.icon, 32), h('span.tal-rank', { 'aria-label': `Rang ${rank} von ${d.max}` }, `${rank}/${d.max}`));
        return attachTip(node, () => h('div.pg-detail.tal-tip', h('b', d.name), h('p', d.desc)));
      });
      return h(`div.tal-col${open ? '' : '.locked'}`, { title: tier.name },
        h('span.tal-lv', String(tier.level)), nodes);
    });
    const sd = defs[sel], srank = talents[sel] ?? 0, stier = TALENT_TIERS[sd.tier];
    const why = canLearn(cls.id, talents, level, sel);
    const card = h(`div.tal-card${srank ? '.has' : ''}${srank >= sd.max ? '.max' : ''}`,
      h('span.tal-card-icon', iconEl(sd.icon, 32)),
      h('div.tal-card-body',
        h('div.tal-card-head', h('b.tal-card-name', sd.name),
          h('span.tal-pips', { role: 'img', 'aria-label': `Rang ${srank} von ${sd.max}` },
            Array.from({ length: sd.max }, (_, i) => h(`span.tal-pip${i < srank ? '.on' : ''}`)))),
        h('p.tal-card-tier', h('span', stier.name), h('span', `ab Stufe ${stier.level}`)),
        h('p.tal-desc', sd.desc)),
      h('div.tal-card-act',
        why
          ? h('span.tal-why', why)
          : h('button.ef-btn.primary.tal-learn', { type: 'button', 'aria-label': `${sd.name} lernen`, onclick: () => learnOne(sel) }, 'Lernen')));
    const tree = h('div.tal-tree2',
      h('span.tal-line.l1', { 'aria-hidden': 'true' }, h('i')), h('span.tal-line.l2', { 'aria-hidden': 'true' }, h('i')),
      cols);
    tree.style.setProperty('--open', String(Math.max(0, openTiers - 1)));

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
        h('section.tal-tree', h('h3.tal-h', 'Talente'), tree, card)));
    pixelWindow(root, session.font, 'Fähigkeiten & Talente', root.querySelector('.tal-title'));
  };

  let queued = false;
  const off = bus.on(EV.STATE_CHANGED, () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; render(); }); } });
  render();
  return { root, dispose: () => { off(); hideTip(); } };
}
