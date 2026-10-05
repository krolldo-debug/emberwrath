import { h } from '../core/dom.js';
import { EV } from '../core/events.js';
import { RACE_LOOK } from '../sprites/hero.js';
import { HeroPortrait } from '../account/ui.js';
import { resolveGear } from './gearLook.js';
import { DYES, HAIR_STYLES, HAIR_PRICE, HAIR_COLOR_PRICE, hairStylesFor, restylePrice, spriteStyle, ownsDesign, sameLook } from './cosmetics.js';

const fmt = (n) => Number(n).toLocaleString('de-DE');

// Panel 'appearance' (Thread A): Färben und Aussehen ändern gegen Gold.
// Geöffnet vom Spiegel im Dorf: bus.emit(EV.UI_OPEN_PANEL, { id: 'appearance' }).
// Auswahl wird zuerst nur in der Vorschau gezeigt; bezahlt wird mit „Übernehmen“ (character:restyle).
export function registerAppearancePanel(game) {
  game.panels.register('appearance', (session) => appearancePanel(session), { title: 'Aussehen' });
}

function appearancePanel(session) {
  const { state, content, bus } = session;
  const root = h('div.ef-panel.tal-panel.app-panel', { role: 'dialog', 'aria-label': 'Aussehen ändern' });
  const ch0 = state.slices.character;
  let pick = { ...ch0.appearance };
  const portrait = new HeroPortrait({ raceId: ch0.raceId, classId: ch0.classId, mode: 'showcase', scale: 3, backdrop: true });
  const note = h('p.app-note', { role: 'status' });

  const refreshPortrait = () => {
    const ch = state.slices.character;
    portrait.set(ch.raceId, ch.classId, pick.variant, resolveGear(state.slices.inventory?.equipment, content), spriteStyle(pick));
  };

  const render = () => {
    const ch = state.slices.character;
    const cur = ch.appearance;
    const level = state.slices.progress?.level ?? 1;
    const gold = state.slices.wallet?.gold ?? 0;
    const price = restylePrice(cur, pick);
    const race = RACE_LOOK[ch.raceId] ?? RACE_LOOK.human;
    const styles = hairStylesFor(ch.raceId);

    const swatch = (ramp) => h('span.app-swatch', { style: { background: `linear-gradient(135deg, ${ramp[3]} 0%, ${ramp[2]} 45%, ${ramp[1]} 100%)` } });
    const choice = (selected, locked, label, sub, visual, onPick) => h(`button.app-choice${selected ? '.on' : ''}`, {
      type: 'button', disabled: locked, 'aria-pressed': selected ? 'true' : 'false',
      onclick: () => { onPick(); note.textContent = ''; refreshPortrait(); render(); },
    }, visual, h('span.app-choice-name', label), sub ? h('span.app-choice-sub', sub) : null);

    const dyes = [
      choice(!pick.dye, false, 'Klassenfarbe', cur.dye ? '25 Gold' : 'aktuell', swatch(defaultRamp(ch.classId)), () => { pick.dye = null; }),
      ...Object.entries(DYES).map(([id, d]) => {
        const shopOnly = d.exclusive && !ownsDesign(state.slices, `dye:${id}`);
        const locked = level < (d.level ?? 1) || shopOnly;
        const sub = cur.dye === id ? 'aktuell' : shopOnly ? 'im Shop' : d.exclusive ? 'Exklusiv' : locked ? `ab Stufe ${d.level}` : `${fmt(d.price)} Gold`;
        return choice(pick.dye === id, locked, d.name, sub, swatch(d.ramp), () => { pick.dye = id; });
      }),
    ];
    const hair = styles.map((id, i) => {
      const val = i === 0 ? null : id;
      const now = (cur.hairStyle ?? null) === val;
      return choice((pick.hairStyle ?? null) === val, false, HAIR_STYLES[id], now ? 'aktuell' : `${fmt(HAIR_PRICE)} Gold`, null, () => { pick.hairStyle = val; });
    });
    const colors = race.variants.map((v, i) => choice((pick.variant | 0) === i, false, v.label, (cur.variant | 0) === i ? 'aktuell' : `${fmt(HAIR_COLOR_PRICE)} Gold`, swatch([v.hair[0], v.hair[1], v.hair[2], v.hair[3]]), () => { pick.variant = i; }));

    const buy = h('button.ef-btn.primary.app-buy', {
      type: 'button', disabled: (price === 0 && sameLook(pick, cur)) || gold < price,
      onclick: () => {
        const r = state.commit('character:restyle', { ...pick });
        if (r?.ok) {
          note.textContent = `Neues Aussehen übernommen (${fmt(r.price)} Gold).`;
          bus.emit(EV.UI_TOAST, { text: 'Neues Aussehen übernommen', kind: 'info' });
          pick = { ...state.slices.character.appearance };
        } else if (r?.error) note.textContent = r.error;
      },
    }, price ? `Übernehmen für ${fmt(price)} Gold` : 'Übernehmen');

    root.replaceChildren(
      h('header.tal-head',
        h('div', h('h2.ef-sub.tal-title', 'Aussehen ändern'),
          h('p.tal-step', 'Färbt Umhang, Kapuze und Stoffrüstung. Metall und Leder behalten ihre Farbe.')),
        h('div.tal-points', h('strong', fmt(gold)), h('span', 'Gold')),
        h('button.tal-close', { type: 'button', 'aria-label': 'Schließen', onclick: () => session.panels.close() }, '×')),
      h('div.app-body',
        h('div.app-stage', portrait.canvas,
          h('div.app-total',
            h('span', price ? `Kosten: ${fmt(price)} Gold` : 'Keine Änderung'),
            gold < price ? h('span.app-short', `Es fehlen ${fmt(price - gold)} Gold`) : null),
          h('div.app-actions',
            h('button.ef-btn.app-undo', { type: 'button', disabled: price === 0, onclick: () => { pick = { ...state.slices.character.appearance }; refreshPortrait(); render(); } }, 'Zurücksetzen'),
            buy),
          note),
        h('div.app-options',
          h('section', h('h3.tal-h', 'Färbung'), h('div.app-grid', dyes)),
          h('section', h('h3.tal-h', 'Frisur'), h('div.app-grid', hair)),
          h('section', h('h3.tal-h', 'Haarfarbe'), h('div.app-grid', colors)))));
  };

  let queued = false;
  const off = bus.on(EV.STATE_CHANGED, () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; render(); }); } });
  refreshPortrait();
  render();
  return { root, update: (dt) => portrait.update(dt), dispose: off };
}

// Standard-Stofffarbe der Klasse für das Farbfeld „Klassenfarbe“
function defaultRamp(classId) {
  return {
    warrior: ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a'],
    rogue: ['#140e1c', '#221832', '#34264a', '#4a3866'],
    ranger: ['#101a10', '#1a2a1a', '#284026', '#3a5634'],
    mage: ['#2a1450', '#4a2a80', '#7a4ab0', '#a878e0'],
  }[classId] ?? ['#222', '#444', '#666', '#888'];
}
