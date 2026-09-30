import { h } from '../core/dom.js';
import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Minimap (HUD) und Zonenkarte (Panel 'map') – Thread D.
// Liest nur: session.world (Hintergrund, Raster, NPCs, Portale, Gegner), session.zone,
// game.progression (questTarget, npcMarker). Nichts wird geschrieben.
// Das Bild der Zone entsteht aus dem vorgerenderten Welt-Hintergrund (verkleinert),
// Wände werden abgedunkelt, begehbarer Boden leicht aufgehellt.
const T = CONFIG.tileSize;
const MM = 56;            // interne Pixel der Minimap (quadratisch)
const MM_SCALE = 2;       // Kartenpixel je Tile in der Minimap
const MAP_SCALE = 4;      // Kartenpixel je Tile in der Zonenkarte

const C = {
  hero: '#ffffff', heroEdge: '#1a1020',
  portal: '#b884ff', portalCore: '#f0e0ff',
  npc: '#d8c8a8', offer: '#ffd84a', ready: '#ffd84a', active: '#a8a8a8',
  enemy: '#e04040', elite: '#ff9a2a', boss: '#ff3030',
  target: '#ffe070', path: 'rgba(255,224,112,0.55)',
};

// ------------------------------------------------------------------ Kartenbild
const baseCache = new WeakMap(); // world -> { [scale]: canvas }

// Kartenfarben je Zone: Bodenaufhellung (mul/add), Wandkante, Wandtönung. Helle Gebiete (Schnee) werden
// weniger aufgehellt, damit Wege und Wände lesbar bleiben (Stufe 20–40, §12.2).
const MAP_STYLE = {
  default: { mul: 1.22, add: [14, 12, 18], edge: [92, 80, 104], wall: [8, 5, 14] },
  ashen_steppe: { mul: 1.12, add: [14, 10, 6], edge: [150, 112, 70], wall: [16, 10, 6] },
  howling_barrow: { mul: 1.3, add: [12, 14, 20], edge: [110, 120, 150], wall: [6, 6, 14] },
  blighted_marsh: { mul: 1.18, add: [8, 16, 8], edge: [96, 140, 80], wall: [4, 12, 6] },
  spore_hollow: { mul: 1.25, add: [10, 20, 8], edge: [140, 200, 90], wall: [6, 14, 6] },
  frostspire: { mul: 0.82, add: [0, 6, 16], edge: [70, 110, 170], wall: [10, 18, 36] },
  rime_caverns: { mul: 1.05, add: [6, 14, 28], edge: [120, 180, 240], wall: [6, 12, 28] },
  ember_wastes: { mul: 1.15, add: [20, 8, 4], edge: [200, 110, 50], wall: [18, 6, 4] },
  ashen_throne: { mul: 1.2, add: [22, 8, 6], edge: [230, 120, 60], wall: [20, 4, 6] },
};

export function zoneBaseImage(world, scale) {
  let entry = baseCache.get(world);
  if (!entry) { entry = {}; baseCache.set(world, entry); }
  if (entry[scale]) return entry[scale];
  const d = world.dungeon;
  const c = makeCanvas(d.w * scale, d.h * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (world.background) ctx.drawImage(world.background, 0, 0, d.pixelW, d.pixelH, 0, 0, c.width, c.height);
  // Lesbarkeit: Wände dunkel, Boden etwas heller und kühler
  const img = ctx.getImageData(0, 0, c.width, c.height), px = img.data;
  const st = MAP_STYLE[world.zone?.id ?? world.zoneId] ?? MAP_STYLE.default, [ar, ag, ab] = st.add, [wr, wg, wb] = st.wall;
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    const wall = d.solid[ty * d.w + tx] === 1;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = ((ty * scale + y) * c.width + tx * scale + x) * 4;
      if (wall) { px[i] = px[i] * 0.28 + wr; px[i + 1] = px[i + 1] * 0.25 + wg; px[i + 2] = px[i + 2] * 0.3 + wb; }
      else { px[i] = Math.min(255, px[i] * st.mul + ar); px[i + 1] = Math.min(255, px[i + 1] * st.mul + ag); px[i + 2] = Math.min(255, px[i + 2] * st.mul + ab); }
    }
  }
  // Wandkanten (Boden neben Wand) als helle Linie – macht Räume und Wege klar
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    if (d.solid[ty * d.w + tx] !== 1) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = tx + dx, y = ty + dy; return x >= 0 && y >= 0 && x < d.w && y < d.h && d.solid[y * d.w + x] === 0; });
    if (!open) continue;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = ((ty * scale + y) * c.width + tx * scale + x) * 4;
      px[i] = st.edge[0]; px[i + 1] = st.edge[1]; px[i + 2] = st.edge[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  entry[scale] = c;
  return c;
}

// ------------------------------------------------------------------ Questziel -> Weltposition
// target = game.progression.questTarget(): { kind, id, ids?, zoneId? }
// Rückgabe { x, y, via?: 'portal', label } in Weltpixeln der aktuellen Zone oder null.
export function resolveTarget(session, target) {
  if (!target) return null;
  const w = session.world, content = session.content;
  const here = session.zone?.def?.id ?? session.state.slices.world?.zoneId;
  const hero = w.hero;
  const dist = (o) => Math.hypot(o.x - hero.x, o.y - hero.y);
  const nearest = (list) => list.reduce((b, o) => (!b || dist(o) < dist(b) ? o : b), null);

  if (target.zoneId && target.zoneId !== here) {
    const p = portalToward(session, here, target.zoneId);
    return p ? { x: p.x, y: p.y, via: 'portal', label: p.label } : null;
  }
  const ids = target.ids?.length ? target.ids : [target.id];
  switch (target.kind) {
    case 'npc': {
      const n = w.npcs.find((x) => x.npcId === target.id);
      return n ? { x: n.x, y: n.y } : null;
    }
    case 'area': {
      const a = w.entities.find((e) => e.areaId === target.id);
      return a ? { x: (a.rect.x0 + a.rect.x1) / 2, y: (a.rect.y0 + a.rect.y1) / 2 } : null;
    }
    case 'enemy': {
      const live = nearest(w.enemies.filter((e) => !e.dead && ids.includes(e.type)));
      if (live) return { x: live.x, y: live.y };
      const mark = nearest(w.dungeon.enemyMarks.filter((m) => ids.includes(m.type)));
      if (mark) return { x: mark.x, y: mark.y };
      return otherZone(session, here, ids, 'enemy');
    }
    case 'object': {
      const o = nearest(w.entities.filter((e) => ids.includes(e.objectId ?? e.id)));
      return o ? { x: o.x, y: o.y } : null;
    }
    case 'boss': {
      const b = w.boss && !w.boss.dead ? w.boss : w.enemies.find((e) => !e.dead && (e.bossId === target.id || e.type === target.id));
      if (b) return { x: b.x, y: b.y };
      if (w.arena) return { x: (w.arena.x0 + w.arena.x1) / 2, y: (w.arena.y0 + w.arena.y1) / 2 };
      const z = content.all('zone').find((zz) => zz.bossId === target.id);
      if (z && z.id !== here) { const p = portalToward(session, here, z.id); if (p) return { x: p.x, y: p.y, via: 'portal', label: p.label }; }
      return null;
    }
    case 'zone': {
      const p = portalToward(session, here, target.id);
      return p ? { x: p.x, y: p.y, via: 'portal', label: p.label } : null;
    }
    default: return null;
  }
}

// Gegner nicht in dieser Zone: Zone suchen, deren Level den Typ enthält, und dorthin führen.
function otherZone(session, here, ids, kind) {
  const content = session.content;
  for (const z of content.all('zone')) {
    if (z.id === here) continue;
    const L = content.find('level', z.level);
    const has = L && Object.values(L.enemies ?? {}).some((e) => ids.includes(e.type));
    if (has) { const p = portalToward(session, here, z.id); if (p) return { x: p.x, y: p.y, via: 'portal', label: p.label }; }
  }
  return null;
}

// Portal in der aktuellen Zone, das (über Zonen-Links) Richtung Zielzone führt.
function portalToward(session, from, to) {
  const w = session.world, content = session.content;
  const portals = w.entities.filter((e) => e.to?.zoneId);
  const direct = portals.find((p) => p.to.zoneId === to);
  if (direct) return { x: direct.x, y: direct.y, label: direct.promptText };
  // Breitensuche über zone.links (INTEGRATION.md §11.6)
  const links = (id) => content.find('zone', id)?.links ?? [];
  const prev = new Map([[to, null]]);
  const queue = [to];
  while (queue.length) {
    const z = queue.shift();
    for (const n of [...links(z), ...content.all('zone').filter((zz) => (zz.links ?? []).includes(z)).map((zz) => zz.id)]) {
      if (prev.has(n)) continue;
      prev.set(n, z);
      const p = portals.find((pp) => pp.to.zoneId === n);
      if (p) return { x: p.x, y: p.y, label: p.promptText };
      queue.push(n);
    }
  }
  return null;
}

// ------------------------------------------------------------------ Marker zeichnen
function dot(ctx, x, y, col, s = 1) { ctx.fillStyle = col; ctx.fillRect(Math.round(x - (s - 1) / 2), Math.round(y - (s - 1) / 2), s, s); }

function glyph(ctx, x, y, kind, t) {
  x = Math.round(x); y = Math.round(y);
  const o = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); };
  switch (kind) {
    case 'portal': {
      const p = Math.sin(t * 4) > 0;
      for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) o(dx, dy, '#2a1040');
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) o(dx, dy, C.portal);
      o(0, 0, p ? C.portalCore : C.portal);
      break;
    }
    case 'offer': case 'ready': {
      // Ausrufe-/Fragezeichen mit dunklem Rand
      ctx.fillStyle = '#1a1020'; ctx.fillRect(x - 1, y - 4, 3, 7);
      ctx.fillStyle = C.offer;
      if (kind === 'offer') { ctx.fillRect(x, y - 3, 1, 3); ctx.fillRect(x, y + 1, 1, 1); }
      else { ctx.fillRect(x - 1, y - 3, 2, 1); ctx.fillRect(x + 1, y - 2, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); ctx.fillStyle = '#1a1020'; ctx.fillRect(x - 2, y - 3, 1, 1); }
      break;
    }
    case 'npc': o(0, 0, C.npc); o(0, -1, C.npc); break;
    case 'boss': {
      ctx.fillStyle = '#1a0408'; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = C.boss; ctx.fillRect(x - 1, y - 1, 3, 2); ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1);
      o(0, 0, '#1a0408');
      break;
    }
    default: break;
  }
}

function drawTarget(ctx, x, y, t, big = false) {
  const r = (big ? 4 : 3) + (Math.sin(t * 5) > 0 ? 1 : 0);
  ctx.fillStyle = C.target;
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(an) * r), Math.round(y + Math.sin(an) * r), 1, 1); }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// Held als Pfeil in Blickrichtung
function drawHero(ctx, x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [[2.6, 0], [-1.6, -1.8], [-0.6, 0], [-1.6, 1.8]];
  ctx.fillStyle = C.heroEdge;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let u = -2; u <= 3; u += 0.5) for (let v = -2; v <= 2; v += 0.5) if (inTri(u, v, pts)) ctx.fillRect(Math.round(x + u * c - v * s) + dx, Math.round(y + u * s + v * c) + dy, 1, 1);
  }
  ctx.fillStyle = C.hero;
  for (let u = -2; u <= 3; u += 0.5) for (let v = -2; v <= 2; v += 0.5) if (inTri(u, v, pts)) ctx.fillRect(Math.round(x + u * c - v * s), Math.round(y + u * s + v * c), 1, 1);
}
function inTri(u, v, [a, b, m, d]) {
  // Pfeilform: zwei Dreiecke (Spitze a, Flügel b/d, Kerbe m)
  const tri = (p, q, r) => { const s1 = (q[0] - p[0]) * (v - p[1]) - (q[1] - p[1]) * (u - p[0]); const s2 = (r[0] - q[0]) * (v - q[1]) - (r[1] - q[1]) * (u - q[0]); const s3 = (p[0] - r[0]) * (v - r[1]) - (p[1] - r[1]) * (u - r[0]); return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); };
  return tri(a, b, m) || tri(a, m, d);
}

function heroAngle(hero) {
  if (Math.hypot(hero.vx ?? 0, hero.vy ?? 0) > 8) return Math.atan2(hero.vy, hero.vx);
  return hero.aimAngle ?? ((hero.facing ?? 1) < 0 ? Math.PI : 0);
}

// Alle Marker einer Zone in Kartenkoordinaten: map(x,y) -> [px,py]
function drawMarkers(ctx, session, map, t, { clipRect = null, enemies = true } = {}) {
  const w = session.world, prog = session.game?.progression ?? session.progression;
  const inside = (p) => !clipRect || (p[0] >= clipRect[0] && p[1] >= clipRect[1] && p[0] < clipRect[2] && p[1] < clipRect[3]);
  // Portale
  for (const e of w.entities) if (e.to?.zoneId) { const p = map(e.x, e.y); if (inside(p)) glyph(ctx, p[0], p[1], 'portal', t); }
  // Gegner
  if (enemies) for (const e of w.enemies) {
    if (e.dead || e.rise < 1) continue;
    const p = map(e.x, e.y); if (!inside(p)) continue;
    if (e.def?.boss || e.boss || e === w.boss) glyph(ctx, p[0], p[1], 'boss', t);
    else dot(ctx, p[0], p[1], e.def?.elite || e.elite ? C.elite : C.enemy, e.def?.elite || e.elite ? 2 : 1);
  }
  // NPCs mit Questmarkierung
  for (const n of w.npcs) {
    const p = map(n.x, n.y); if (!inside(p)) continue;
    const m = prog?.npcMarker?.(n.npcId);
    glyph(ctx, p[0], p[1], m === 'available' || m === 'repeatable' ? 'offer' : m === 'ready' ? 'ready' : 'npc', t);
  }
}

// ------------------------------------------------------------------ Minimap im HUD
export class Minimap {
  constructor(session, parent) {
    this.s = session;
    this.canvas = h('canvas.hud-minimap-canvas', { width: MM, height: MM, 'aria-hidden': 'true' });
    this.ctx = this.canvas.getContext('2d');
    this.hint = h('span.hud-minimap-hint', 'Karte');
    this.el = h('button.hud-minimap', {
      type: 'button', title: 'Zonenkarte öffnen (M)', 'aria-label': 'Zonenkarte öffnen',
      onclick: (e) => { e.stopPropagation(); session.sfx?.play?.('ui'); session.panels?.toggle?.('map'); },
    }, this.canvas, h('span.hud-minimap-n', 'N'), this.hint);
    parent.append(this.el);
    this.t = 0; this.acc = 1;
    this.onKey = (e) => {
      if (e.code !== 'KeyM' || e.repeat) return;
      const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const p = session.panels; if (!p) return;
      if (p.openId && p.openId !== 'map') return;
      p.toggle('map');
    };
    document.addEventListener('keydown', this.onKey);
  }

  update(dt) {
    this.t += dt; this.acc += dt;
    if (this.acc < 1 / 20) return; // 20 Bilder/s reichen
    this.acc = 0;
    const s = this.s, w = s.world;
    if (!w?.hero || !w.dungeon) return;
    const base = zoneBaseImage(w, MM_SCALE);
    const ctx = this.ctx, hero = w.hero;
    const k = MM_SCALE / T;
    const cx = hero.x * k - MM / 2, cy = hero.y * k - MM / 2;
    ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 0, MM, MM);
    ctx.drawImage(base, Math.round(cx), Math.round(cy), MM, MM, 0, 0, MM, MM);
    const map = (x, y) => [x * k - Math.round(cx), y * k - Math.round(cy)];
    drawMarkers(ctx, s, map, this.t, { clipRect: [1, 1, MM - 1, MM - 1] });
    // Questziel: im Bild als Ring, sonst Pfeil am Rand
    const tgt = resolveTarget(s, s.game?.progression?.questTarget?.() ?? null);
    if (tgt) {
      const [px, py] = map(tgt.x, tgt.y);
      if (px >= 3 && py >= 3 && px < MM - 3 && py < MM - 3) drawTarget(ctx, px, py, this.t);
      else edgeArrow(ctx, MM / 2, MM / 2, px, py, this.t);
    }
    drawHero(ctx, MM / 2, MM / 2, heroAngle(hero));
  }

  dispose() { document.removeEventListener('keydown', this.onKey); this.el.remove(); }
}

function edgeArrow(ctx, cx, cy, tx, ty, t) {
  const ang = Math.atan2(ty - cy, tx - cx);
  const r = MM / 2 - 4;
  const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
  const c = Math.cos(ang), s = Math.sin(ang);
  const pulse = Math.sin(t * 5) > 0;
  for (let u = -2; u <= 2; u++) for (let v = -2; v <= 2; v++) {
    if (u < -Math.abs(v) * 1.2 + 0.2 - 1 || u > 2 - Math.abs(v)) continue;
    ctx.fillStyle = Math.abs(v) === 2 || u === -2 ? '#1a1020' : pulse ? '#ffffff' : C.target;
    ctx.fillRect(Math.round(x + u * c - v * s), Math.round(y + u * s + v * c), 1, 1);
  }
}

// ------------------------------------------------------------------ Zonenkarte (Panel)
export function createMapPanel(session) {
  const w = session.world, content = session.content;
  const zoneDef = session.zone?.def ?? content.find('zone', session.state.slices.world?.zoneId);
  const base = zoneBaseImage(w, MAP_SCALE);
  const canvas = h('canvas.map-canvas', { width: base.width, height: base.height });
  const ctx = canvas.getContext('2d');
  const tgtInfo = h('div.map-target');
  const legend = h('ul.map-legend',
    legendItem('hero', 'Du'), legendItem('target', 'Questziel'), legendItem('offer', 'Neue Quest / Abgabe'),
    legendItem('portal', 'Portal'), legendItem('enemy', 'Gegner'), legendItem('boss', 'Boss'));
  const root = h('div.ef-panel.map-panel', { role: 'dialog', 'aria-label': 'Zonenkarte' },
    h('header.map-head',
      h('div', h('h2.map-title', zoneDef?.name ?? 'Karte'), h('div.map-sub', [zoneDef?.subtitle, zoneDef?.recommendedLevel ? `Stufe ${zoneDef.recommendedLevel}` : null].filter(Boolean).join(' · '))),
      h('button.ef-btn.map-close', { type: 'button', onclick: () => session.panels?.close?.() }, 'Schließen')),
    h('div.map-frame', canvas),
    h('footer.map-foot', tgtInfo, legend,
      h('p.map-note', 'Karte dieser Zone. Taste M oder Tippen auf die Minimap öffnet sie.')),
  );
  // Ganzzahlig hochskalieren, bis die Karte den Rahmen füllt (scharfe Pixel)
  const fit = () => {
    const maxW = Math.min(window.innerWidth * 0.92, 900) - 44, maxH = window.innerHeight * (window.innerHeight > window.innerWidth ? 0.52 : 0.6);
    const z = Math.max(1, Math.floor(Math.min(maxW / base.width, maxH / base.height) * 2) / 2);
    canvas.style.width = `${Math.round(base.width * z)}px`; canvas.style.height = `${Math.round(base.height * z)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  let t = 0, acc = 1, lastTarget = '';
  const k = MAP_SCALE / T;
  const map = (x, y) => [x * k, y * k];
  return {
    root,
    dispose() { window.removeEventListener('resize', fit); },
    update(dt) {
      t += dt; acc += dt;
      if (acc < 1 / 15) return;
      acc = 0;
      ctx.drawImage(base, 0, 0);
      drawMarkers(ctx, session, map, t, { enemies: true });
      const target = session.game?.progression?.questTarget?.() ?? null;
      const tgt = resolveTarget(session, target);
      if (tgt) { const [px, py] = map(tgt.x, tgt.y); drawTarget(ctx, px, py, t, true); }
      const hero = w.hero, hp = map(hero.x, hero.y);
      drawHero(ctx, hp[0], hp[1], heroAngle(hero));
      const key = target ? `${target.title}|${target.text}|${tgt?.via ?? ''}` : '';
      if (key !== lastTarget) {
        lastTarget = key;
        tgtInfo.replaceChildren(...(target
          ? [h('span.map-target-title', target.title ?? 'Quest'), h('span.map-target-text', tgt?.via ? `${target.text} – Weg über: ${tgt.label ?? 'Portal'}` : target.text ?? '')]
          : [h('span.map-target-text', 'Keine verfolgte Quest')]));
      }
    },
  };
}

function legendItem(kind, text) {
  const c = makeCanvas(9, 9), ctx = c.getContext('2d');
  if (kind === 'hero') drawHero(ctx, 4, 4, -Math.PI / 2);
  else if (kind === 'target') drawTarget(ctx, 4, 4, 0);
  else if (kind === 'enemy') dot(ctx, 4, 4, C.enemy, 2);
  else glyph(ctx, 4, 5, kind, 0);
  return h('li', h('img.map-legend-icon', { src: c.toDataURL(), alt: '' }), h('span', text));
}
