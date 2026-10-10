import { h } from '../core/dom.js';
import { iconEl, itemIconEl } from '../gfx/Icons.js';
import { fmtNum } from '../i18n/index.js';
import { HeroPortrait } from '../account/ui.js';
import { resolveGear, shownEquipment } from '../character/gearLook.js';
import { DYES, spriteStyle } from '../character/cosmetics.js';
import { CLASSES } from '../character/classes.js';
import { RARITIES, EQUIP_SLOT_NAMES } from './items.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, REWARD_ACHIEVEMENTS, rewardItemId } from './achievements.js';
import { panelFrame, reactive } from './widgets.js';

// Panel 'achievements' (Runde 10.10.): Erfolge und Titel.
// Oben die Belohnungen schwerer Erfolge als Vitrine mit Vorschau (eigener Held mit Färbung/Aussehen, auf dem
// Reittier, Gegenstand); ein Tipp öffnet die Karte mit Fortschritt und – wenn errungen – Anlegen/Auswählen.
// Darunter die Liste nach Gruppen. Die Vorschau-Leinwände bleiben über Neuzeichnungen erhalten (reactive).
export function achievementsPanel(s) {
  const st = s.state;
  let group = 'all', open = null, redraw = () => {};
  const stages = new Map();   // Belohnungs-ID -> HeroPortrait (bleibt erhalten, wird nur umgehängt)
  const ch = () => st.slices.character ?? {};
  const value = (d) => { try { return d.value(st) ?? 0; } catch { return 0; } };

  // ---------------------------------------------------------------- Belohnung: Daten und Vorschau
  const info = (id) => {
    const d = ACHIEVEMENTS[id], r = d.reward, c = s.content;
    if (r.kind === 'dye') return { name: DYES[r.id].name, short: DYES[r.id].name, kind: 'Färbung', note: 'Färbt Umhang, Kapuze und Stoffrüstung.' };
    if (r.kind === 'mount') {
      const m = c.find('mount', r.id);
      return { name: m.name, short: m.name, kind: `Reittier · +${Math.round(m.speed * 100)} % Tempo`, note: m.desc };
    }
    const itemId = r.kind === 'item' ? rewardItemId(r, CLASSES[ch().classId]?.primary) : r.id;
    const it = c.find('item', itemId);
    if (r.kind === 'look') return { name: it.name, short: it.name.split(' ')[0], kind: `Aussehen · ${EQUIP_SLOT_NAMES[it.slot]}`, note: it.desc, item: it };
    return { name: it.name, short: EQUIP_SLOT_NAMES[it.slot], kind: `${EQUIP_SLOT_NAMES[it.slot]} · ${RARITIES[it.rarity].name}`, note: it.desc, item: it };
  };
  const heroGear = (over = {}) => resolveGear({ ...shownEquipment(st.slices, s.content), ...over }, s.content);
  // Größen ganzzahlig (Leinwand intern 3-fach): Vitrine 3× bzw. am Handy 2×, Karte 5× bzw. 4×; Krone als Kopfbild doppelt so groß
  const compact = () => !!window.matchMedia?.('(max-height: 520px)').matches;
  // Umriss der Figur über alle Bilder der Animation (Weltpixel); head: nur Kopf und Krone
  const bounds = (p, head = false) => {
    const cv = p.canvas, g = cv.getContext('2d'), W = cv.width, H = cv.height, R = W / 72;
    const n = Math.max(1, p.anims.idle?.frames?.length ?? 1);
    const on = new Uint8Array(W * H);
    for (let i = 0; i < n; i++) {
      p.t = (i + 0.5) / 6; p.draw();
      const d = g.getImageData(0, 0, W, H).data;
      for (let k = 0; k < W * H; k++) if (d[k * 4 + 3]) on[k] = 1;
    }
    p.t = 0; p.draw();
    let y0 = H, y1 = -1;
    for (let k = 0; k < W * H; k++) if (on[k]) { const y = (k / W) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (y1 < 0) return { x: 0, y: 0, w: 72, h: 56 };
    if (head) y1 = Math.min(y1, y0 + 13 * R);
    // Breite: beim Kopfbild nur aus Krone und Kopf (oberste Reihen), damit die Waffe draußen bleibt
    const xRows = head ? Math.min(y1, y0 + 6 * R) : y1;
    let x0 = W, x1 = -1;
    for (let y = y0; y <= xRows; y++) for (let x = 0; x < W; x++) if (on[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const m = head ? 2 : 1;
    const bx = Math.max(0, Math.floor(x0 / R) - m), by = Math.max(0, Math.floor(y0 / R) - 1);
    return { x: bx, y: by, w: Math.min(72, Math.ceil((x1 + 1) / R) + (head ? 0 : 1)) - bx, h: Math.min(56, Math.ceil((y1 + 1) / R) + (head ? 1 : 0)) - by };
  };
  // Held/Reittier als zugeschnittenes Bild: nur die Figur, ganzzahlig skaliert
  const figure = ({ gear, style, mountId = null, scale, head = false }) => {
    const c = ch(), ap = c.appearance ?? {};
    const p = new HeroPortrait({ raceId: c.raceId, classId: c.classId, variant: ap.variant ?? 0, gear, style, scale, backdrop: false, glow: false });   // ohne weichen Schein: nur harte Pixel
    if (mountId) {
      const anims = s.game.character?.animsForLook?.({ raceId: c.raceId, classId: c.classId, appearance: ap, gear, mountId }, 3);
      if (anims?.ride) { p.anims = { idle: anims.ride }; p.draw(); }
    }
    const b = bounds(p, head);
    p.canvas.style.left = `${-b.x * scale}px`; p.canvas.style.top = `${-b.y * scale}px`;
    const el = h(`span.ach-fit${head ? '.ach-head' : ''}`, { style: { width: `${b.w * scale}px`, height: `${b.h * scale}px` } }, p.canvas);
    el.portraits = [p];
    return el;
  };
  const stage = (id, big = false) => {
    const small = compact();
    const key = `${id}|${big ? 'card' : 'tile'}|${small ? 's' : 'm'}`;
    if (stages.has(key)) return stages.get(key);
    const r = ACHIEVEMENTS[id].reward, ap = ch().appearance ?? {};
    const scale = big ? (small ? 4 : 5) : small ? 2 : 3;
    let el;
    if (r.kind === 'item') {
      el = h('div.ach-stage-item', itemIconEl(info(id).item, big ? (small ? 104 : 130) : small ? 52 : 78));
    } else if (r.kind === 'look') {
      // Krone: Kopfbild ohne Waffe; auf der Karte zusätzlich der ganze Held
      const slot = s.content.find('item', r.id).slot, style = spriteStyle(ap);
      const headEl = figure({ gear: heroGear({ [slot]: r.id, weapon: null }), style, scale: scale * 2, head: true });
      el = headEl;
      if (big) {
        const full = figure({ gear: heroGear({ [slot]: r.id }), style, scale: scale - 1 });
        el = h('div.ach-pair', full, headEl);
        el.portraits = [...full.portraits, ...headEl.portraits];
      }
    } else {
      // Färbung: ohne Brust und Kopf, damit Umhang und Stoff zu sehen sind; das Tuch in ihren Farben hängt direkt dahinter
      const dye = r.kind === 'dye';
      const fig = figure({ gear: dye ? heroGear({ chest: null, head: null }) : heroGear(), style: spriteStyle(dye ? { ...ap, dye: r.id } : ap), mountId: r.kind === 'mount' ? r.id : null, scale });
      el = dye ? h('div.ach-stage-dye', iconEl(`dye_${r.id}`, 26 * (scale + (big ? 2 : 1))), fig) : fig;
      el.portraits = fig.portraits;
    }
    el.classList.add('ach-stage');
    stages.set(key, el);
    return el;
  };

  // Anlegen/Auswählen, wenn errungen (Garderobe, Reittier, Färbung ohne Goldpreis)
  const action = (id) => {
    const r = ACHIEVEMENTS[id].reward, c = ch();
    if (!st.slices.achievements.unlocked[id]) return null;
    const btn = (label, fn, on = false) => h(`button.ef-btn.ach-act${on ? '' : '.primary'}`, { type: 'button', onclick: fn }, label);
    if (r.kind === 'dye') {
      const on = c.appearance?.dye === r.id;
      return btn(on ? 'Ablegen' : 'Anlegen', () => st.commit('character:restyle', { dye: on ? null : r.id }), on);
    }
    if (r.kind === 'look') {
      const slot = s.content.find('item', r.id).slot, on = c.wardrobe?.shown?.[slot] === r.id;
      if (!st.slices.inventory?.equipment?.[slot] && !on) return h('span.ach-hint', 'Lege zuerst ein Teil an diesem Platz an.');
      return btn(on ? 'Ablegen' : 'Anlegen', () => st.commit('wardrobe:show', { slot, itemId: on ? null : r.id }), on);
    }
    if (r.kind === 'mount') {
      const on = c.mounts?.active === r.id;
      return on ? h('span.ach-hint', 'Aktives Reittier') : btn('Auswählen', () => st.commit('mount:select', { mountId: r.id }));
    }
    return h('span.ach-hint', 'Liegt in deiner Tasche.');
  };

  // ---------------------------------------------------------------- Teile
  const bar = (frac) => h('span.ach-bar', h('span', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } }));
  const count = (v, d) => `${fmtNum(Math.min(v, d.goal))} / ${fmtNum(d.goal)}`;

  const trophy = (id) => {
    const d = ACHIEVEMENTS[id], got = !!st.slices.achievements.unlocked[id], v = value(d), inf = info(id);
    return h(`button.ach-trophy${got ? '.got' : ''}${open === id ? '.sel' : ''}`, {
      type: 'button', 'aria-pressed': String(open === id), 'aria-label': `${inf.name}: ${d.name}`,
      onclick: () => { open = open === id ? null : id; redraw(); },
    },
    h('span.ach-pedestal', stage(id), got ? null : h('span.ach-lock', { 'aria-hidden': 'true' })),
    h('span.ach-trophy-name', h('span.ach-long', inf.name), h('span.ach-short', inf.short)),
    got ? h('span.ach-trophy-got', 'Errungen') : h('span.ach-trophy-prog', bar(v / d.goal)));
  };

  const card = (id) => {
    const d = ACHIEVEMENTS[id], got = !!st.slices.achievements.unlocked[id], v = value(d), inf = info(id);
    return h('div.ach-card', { role: 'region', 'aria-label': inf.name },
      h('button.ach-card-x', { type: 'button', onclick: () => { open = null; redraw(); } }, 'Zurück'),
      h('div.ach-card-stage', stage(id, true)),
      h('div.ach-card-body',
        h('span.ach-kind', inf.kind),
        h('h3.ach-card-name', inf.name),
        h('p.ach-card-note', inf.note),
        h('div.ach-card-req',
          h('span.ach-req-icon', iconEl(d.icon, 20)),
          h('span.ach-req-text', h('b', d.name), h('small', d.desc))),
        got ? h('div.ach-card-foot', h('span.ach-done', 'Errungen'), action(id))
          : h('div.ach-card-foot', bar(v / d.goal), h('span.ach-count', count(v, d)))));
  };

  const row = (id, d, v) => h(`li.ach-row${d.reward ? '.rw' : ''}`, { title: d.reward ? `Belohnung: ${info(id).name}` : null },
    h('span.ach-medal', iconEl(d.icon, 24)),
    h('span.ach-row-main',
      h('span.ach-row-name', d.name, d.title && d.title !== d.name ? h('span.ach-tag', `„${d.title}“`) : null),
      h('small', d.desc)),
    d.goal > 1 ? h('span.ach-count', count(v, d)) : null,
    h('span.ach-pts', fmtNum(d.points)),
    d.goal > 1 ? bar(v / d.goal) : null);

  const tile = (id, d) => h(`li.ach-tile${d.reward ? '.rw' : ''}`, { title: d.desc },
    h('span.ach-medal', iconEl(d.icon, 20)),
    h('span.ach-row-name', d.name),
    h('span.ach-pts', fmtNum(d.points)));

  // ---------------------------------------------------------------- Ganzes Fenster
  function render(again) {
    redraw = again;
    const a = st.slices.achievements;
    const all = Object.entries(ACHIEVEMENTS);
    const done = all.filter(([id]) => a.unlocked[id]).length;
    const points = all.reduce((n, [id, d]) => n + (a.unlocked[id] ? d.points : 0), 0);
    const rewards = REWARD_ACHIEVEMENTS;
    const rewardsGot = rewards.filter((id) => a.unlocked[id]).length;
    const titles = all.filter(([id, d]) => d.title && a.unlocked[id]);
    const shown = all.filter(([, d]) => group === 'all' || d.group === group);
    const openList = shown.filter(([id]) => !a.unlocked[id]).map(([id, d]) => [id, d, value(d)])
      .sort((x, y) => y[2] / (y[1].goal || 1) - x[2] / (x[1].goal || 1));
    const got = shown.filter(([id]) => a.unlocked[id]);
    return panelFrame(s, 'achievements', 'Erfolge',
      h('section.ach-top', { 'aria-label': 'Belohnungen' },
        h('header.ach-sec', h('span', 'Belohnungen'), h('b', `${fmtNum(rewardsGot)} / ${fmtNum(rewards.length)}`)),
        h('div.ach-trophies', rewards.map(trophy))),
      h('div.ach-sum',
        h('span.ach-score', h('b', fmtNum(points)), h('span', ' Punkte')),
        h('span.ach-score.dim', h('b', `${fmtNum(done)} / ${fmtNum(all.length)}`), h('span', ' Erfolge')),
        titles.length ? h('label.ach-title',
          h('span', 'Titel'),
          h('span.pg-select-wrap', h('select.pg-select', { onchange: (e) => st.commit('achievement:title', { id: e.target.value || null }) },
            h('option', { value: '', selected: !a.title }, 'Kein Titel'),
            titles.map(([id, d]) => h('option', { value: id, selected: a.title === id }, d.title))))) : null),
      h('div.ach-tabs', { role: 'tablist' }, [['all', 'Alle'], ...Object.entries(ACHIEVEMENT_GROUPS)].map(([gid, label]) => [gid, gid === 'trial' && compact() ? 'Prüfungen' : label]).map(([gid, label]) => h(`button.ach-tab${group === gid ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(group === gid), onclick: () => { group = gid; redraw(); },
      }, label))),
      h('div.pg-scroll.pg-keep-scroll.ach-list',
        openList.length ? h('ul.ach-rows', openList.map(([id, d, v]) => row(id, d, v))) : null,
        got.length ? h('h3.ach-sub', `Errungen · ${fmtNum(got.length)}`) : null,
        got.length ? h('ul.ach-tiles', got.map(([id, d]) => tile(id, d))) : null),
      open ? card(open) : null);
  }

  const view = reactive(s, (redraw) => render(redraw));
  return {
    root: view.root,
    update: (dt) => { for (const el of stages.values()) if (el.isConnected) for (const p of el.portraits ?? []) p.update(dt); },
    dispose: view.dispose,
  };
}
