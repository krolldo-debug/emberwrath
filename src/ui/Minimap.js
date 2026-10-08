import { h } from '../core/dom.js';
import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { renderZoneMap, renderLabels } from './MapArt.js';

// Minimap (HUD) und Zonenkarte (Panel 'map') – Thread D.
// Liest nur: session.world (Hintergrund, Raster, NPCs, Portale, Gegner), session.zone,
// game.progression (questTarget, npcMarker). Nichts wird geschrieben.
// Das Bild der Zone ist eine gezeichnete Pergamentkarte (MapArt.js).
const T = CONFIG.tileSize;
const MM = 56;            // interne Pixel der Minimap (quadratisch)
const MM_SCALE = 2;       // Kartenpixel je Tile in der Minimap
// Zonenkarte: Kartenpixel je Tile (3–8) und Bildschirmzoom werden passend zum Rahmen gewählt

// Farben für Pergament: Tusche, Siegelrot, Gold mit dunklem Rand
const C = {
  hero: '#ffffff', heroEdge: '#1a1020',
  portal: '#8a4ad8', portalCore: '#f0e0ff',
  npc: '#3a2818', offer: '#ffd84a', ready: '#ffd84a', active: '#a8a8a8',
  enemy: '#b01818', elite: '#e06010', boss: '#a01010',
  target: '#b81414', path: 'rgba(184,20,20,0.55)',
};

// ------------------------------------------------------------------ Kartenbild
// Gezeichnete Pergamentkarte aus MapArt.js (Zonenkarte mit Symbolen und Rahmen, Minimap schlicht).
export function zoneBaseImage(world, scale) { return renderZoneMap(world, scale, { detail: scale >= 3 }); }

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

function glyph(ctx, x, y, kind, t, big = false) {
  x = Math.round(x); y = Math.round(y);
  const o = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); };
  const ink = '#1a1020';
  switch (kind) {
    case 'portal': {
      const p = Math.sin(t * 4) > 0;
      if (big) {
        // Wirbel: dunkler Ring, violette Spirale, heller Kern
        for (const [dx, dy] of [[-1, -3], [0, -3], [1, -3], [-2, -2], [2, -2], [-3, -1], [3, -1], [-3, 0], [3, 0], [-3, 1], [3, 1], [-2, 2], [2, 2], [-1, 3], [0, 3], [1, 3]]) o(dx, dy, ink);
        for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]]) o(dx, dy, C.portal);
        for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) o(dx, dy, '#c8a0ff');
        o(p ? 1 : -1, p ? -1 : 1, C.portal);
        o(0, 0, C.portalCore);
        break;
      }
      for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) o(dx, dy, '#2a1040');
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) o(dx, dy, C.portal);
      o(0, 0, p ? C.portalCore : C.portal);
      break;
    }
    case 'offer': case 'ready': {
      if (big) {
        // Goldenes Siegel mit Ausrufe- bzw. Fragezeichen
        const bob = Math.sin(t * 3) > 0.6 ? -1 : 0; y += bob;
        ctx.fillStyle = ink; ctx.fillRect(x - 3, y - 6, 7, 9); ctx.fillRect(x - 4, y - 5, 9, 7);
        ctx.fillStyle = '#8a5a10'; ctx.fillRect(x - 2, y - 5, 5, 7); ctx.fillRect(x - 3, y - 4, 7, 5);
        ctx.fillStyle = C.offer; ctx.fillRect(x - 2, y - 5, 4, 6); ctx.fillRect(x - 3, y - 4, 1, 4);
        ctx.fillStyle = ink;
        if (kind === 'offer') { ctx.fillRect(x, y - 4, 1, 3); ctx.fillRect(x, y, 1, 1); }
        else { ctx.fillRect(x - 1, y - 4, 2, 1); ctx.fillRect(x + 1, y - 3, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y, 1, 1); }
        break;
      }
      // Ausrufe-/Fragezeichen mit dunklem Rand
      ctx.fillStyle = ink; ctx.fillRect(x - 1, y - 4, 3, 7);
      ctx.fillStyle = C.offer;
      if (kind === 'offer') { ctx.fillRect(x, y - 3, 1, 3); ctx.fillRect(x, y + 1, 1, 1); }
      else { ctx.fillRect(x - 1, y - 3, 2, 1); ctx.fillRect(x + 1, y - 2, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); ctx.fillStyle = ink; ctx.fillRect(x - 2, y - 3, 1, 1); }
      break;
    }
    case 'npc':
      if (big) { o(0, -1, C.npc); o(-1, 0, C.npc); o(0, 0, '#e8d8b0'); o(1, 0, C.npc); o(0, 1, C.npc); }
      else { o(0, 0, C.npc); o(0, -1, C.npc); }
      break;
    case 'boss': {
      if (big) {
        // Totenschädel in Siegelrot
        ctx.fillStyle = ink; ctx.fillRect(x - 3, y - 4, 7, 6); ctx.fillRect(x - 2, y + 2, 5, 2);
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x - 2, y - 3, 5, 4); ctx.fillRect(x - 1, y + 1, 3, 2);
        ctx.fillStyle = C.boss; ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2);
        ctx.fillStyle = ink; ctx.fillRect(x, y + 1, 1, 1); ctx.fillRect(x - 1, y + 2, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1);
        break;
      }
      ctx.fillStyle = '#1a0408'; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = C.boss; ctx.fillRect(x - 1, y - 1, 3, 2); ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1);
      o(0, 0, '#1a0408');
      break;
    }
    default: break;
  }
}

// Questziel: rotes Kreuz im pulsierenden Ring (wie auf einer Schatzkarte)
function drawTarget(ctx, x, y, t, big = false) {
  x = Math.round(x); y = Math.round(y);
  const r = (big ? 6 : 3) + (Math.sin(t * 5) > 0 ? 1 : 0);
  for (let a = 0; a < (big ? 28 : 14); a++) {
    const an = (a / (big ? 28 : 14)) * Math.PI * 2;
    const px = Math.round(x + Math.cos(an) * r), py = Math.round(y + Math.sin(an) * r);
    ctx.fillStyle = '#fff0d0'; ctx.fillRect(px + 1, py + 1, 1, 1);
    ctx.fillStyle = C.target; ctx.fillRect(px, py, 1, 1);
  }
  const k = big ? 3 : 1;
  ctx.fillStyle = '#fff0d0';
  for (let i = -k; i <= k; i++) { ctx.fillRect(x + i + 1, y + i, 1, 1); ctx.fillRect(x + i + 1, y - i, 1, 1); }
  ctx.fillStyle = C.target;
  for (let i = -k; i <= k; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); if (big) { ctx.fillRect(x + i + 1, y + i, 1, 1); ctx.fillRect(x + i + 1, y - i, 1, 1); } }
}

// Held als Pfeil in Blickrichtung
function drawHero(ctx, x, y, ang, big = false) {
  const c = Math.cos(ang), s = Math.sin(ang), m = big ? 2 : 1;
  const pts = [[2.6 * m, 0], [-1.6 * m, -1.8 * m], [-0.6 * m, 0], [-1.6 * m, 1.8 * m]];
  ctx.fillStyle = C.heroEdge;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let u = -2 * m; u <= 3 * m; u += 0.5) for (let v = -2 * m; v <= 2 * m; v += 0.5) if (inTri(u, v, pts)) ctx.fillRect(Math.round(x + u * c - v * s) + dx, Math.round(y + u * s + v * c) + dy, 1, 1);
  }
  ctx.fillStyle = C.hero;
  for (let u = -2 * m; u <= 3 * m; u += 0.5) for (let v = -2 * m; v <= 2 * m; v += 0.5) if (inTri(u, v, pts)) ctx.fillRect(Math.round(x + u * c - v * s), Math.round(y + u * s + v * c), 1, 1);
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
function drawMarkers(ctx, session, map, t, { clipRect = null, enemies = true, big = false, clamp = null } = {}) {
  const cl = (p) => (clamp ? [Math.min(clamp[2], Math.max(clamp[0], p[0])), Math.min(clamp[3], Math.max(clamp[1], p[1]))] : p);
  const w = session.world, prog = session.game?.progression ?? session.progression;
  const inside = (p) => !clipRect || (p[0] >= clipRect[0] && p[1] >= clipRect[1] && p[0] < clipRect[2] && p[1] < clipRect[3]);
  // Portale
  for (const e of w.entities) if (e.to?.zoneId) { const p = cl(map(e.x, e.y)); if (inside(p)) glyph(ctx, p[0], p[1], 'portal', t, big); }
  // Gegner
  if (enemies) for (const e of w.enemies) {
    if (e.dead || e.rise < 1) continue;
    const p = map(e.x, e.y); if (!inside(p)) continue;
    if (e.def?.boss || e.boss || e === w.boss) glyph(ctx, p[0], p[1], 'boss', t, big);
    else if (big) { const el = e.def?.elite || e.elite || e.champion; dot(ctx, p[0], p[1], '#1a0408', el ? 7 : 5); dot(ctx, p[0], p[1], '#f4e6c4', el ? 5 : 4); dot(ctx, p[0], p[1], el ? C.elite : '#d02020', el ? 3 : 2); }
    else dot(ctx, p[0], p[1], e.def?.elite || e.elite ? C.elite : C.enemy, e.def?.elite || e.elite ? 2 : 1);
  }
  // NPCs mit Questmarkierung
  for (const n of w.npcs) {
    const p = map(n.x, n.y); if (!inside(p)) continue;
    const m = prog?.npcMarker?.(n.npcId);
    glyph(ctx, p[0], p[1], m === 'available' || m === 'repeatable' ? 'offer' : m === 'ready' ? 'ready' : 'npc', t, big);
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
    ctx.fillStyle = '#2a2016'; ctx.fillRect(0, 0, MM, MM);
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
  const w = session.world, content = session.content, d = w.dungeon;
  const zoneDef = session.zone?.def ?? content.find('zone', session.state.slices.world?.zoneId);
  const canvas = h('canvas.map-canvas', { width: 1, height: 1 });
  const ctx = canvas.getContext('2d');
  const sheet = h('div.map-sheet', canvas);
  const tgtInfo = h('div.map-target');
  const legend = h('ul.map-legend',
    legendItem('hero', 'Du'), legendItem('target', 'Questziel'), legendItem('offer', 'Quest'),
    legendItem('portal', 'Portal'), legendItem('boss', 'Boss'));
  const frameEl = h('div.map-frame', sheet);
  const root = h('div.ef-panel.map-panel', { role: 'dialog', 'aria-label': 'Zonenkarte' },
    h('header.map-head',
      h('div', h('h2.map-title', zoneDef?.name ?? 'Karte'), h('div.map-sub', [zoneDef?.subtitle, zoneDef?.recommendedLevel ? `Stufe ${zoneDef.recommendedLevel}` : null].filter(Boolean).join(' · '))),
      h('button.pg-close.map-close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (M)', onclick: () => session.panels?.close?.() }, '✕')),
    frameEl,
    h('footer.map-foot', tgtInfo, legend),
  );
  // Maßstab: Kartenpixel je Tile (3–8) × ganzzahliger Zoom, so groß wie der Rahmen erlaubt – alles im selben
  // Pixelraster. Ist die Karte dann deutlich schmaler als der Rahmen (Handy quer), füllt sie die Breite und
  // lässt sich senkrecht verschieben; sie startet auf dem Helden.
  let scale = 0, zoom = 1, base = null, labels = null, k = 1, centered = false;
  const choose = (aw, ah, widthOnly) => {
    let best = null;
    for (let z = 1; z <= 4; z++) {
      const sc = Math.min(8, Math.floor(widthOnly ? aw / (d.w * z) : Math.min(aw / (d.w * z), ah / (d.h * z))));
      if (sc < 3) continue;
      if (!best || sc * z > best.s * best.z || (sc * z === best.s * best.z && sc > best.s)) best = { s: sc, z };
    }
    return best;
  };
  const fit = () => {
    const aw = (frameEl.clientWidth || window.innerWidth * 0.9) - 8, ah = (frameEl.clientHeight || window.innerHeight * 0.6) - 8;
    let best = choose(aw, ah, false), scroll = false;
    if (!best || (ah < 380 && best.s * best.z * d.w < aw * 0.7)) { const wide = choose(aw, ah, true); if (wide) { best = wide; scroll = best.s * best.z * d.h > ah; } }
    best ??= { s: 3, z: 1 };
    if (best.s !== scale || best.z !== zoom) {
      scale = best.s; zoom = best.z; k = scale / T;
      base = zoneBaseImage(w, scale);
      const T0 = T, avoid = [];
      for (const n of w.npcs) avoid.push([(n.x / T0) * scale, (n.y / T0) * scale - 3, 6]);
      avoid.push([(w.hero.x / T0) * scale, (w.hero.y / T0) * scale, 14]);
      for (const e of w.entities) if (e.to?.zoneId) avoid.push([(e.x / T0) * scale, (e.y / T0) * scale, 6]);
      labels = renderLabels(w, content, scale, zoom, avoid);
      canvas.width = base.width; canvas.height = base.height;
      acc = 1;
    }
    sheet.style.width = `${base.width * zoom}px`; sheet.style.height = `${base.height * zoom}px`;
    frameEl.classList.toggle('scroll', scroll);
    if (scroll && !centered) {
      centered = true;
      requestAnimationFrame(() => { frameEl.scrollTop = Math.max(0, w.hero.y * k * zoom - frameEl.clientHeight / 2); });
    }
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(frameEl);
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);
  let t = 0, acc = 1, lastTarget = '';
  const map = (x, y) => [x * k, y * k];
  return {
    root,
    dispose() { window.removeEventListener('resize', fit); ro?.disconnect(); },
    update(dt) {
      t += dt; acc += dt;
      if (!base) { fit(); if (!base) return; }
      if (acc < 1 / 15) return;
      acc = 0;
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(labels, 0, 0);
      const W = base.width, H = base.height;
      drawMarkers(ctx, session, map, t, { enemies: true, big: true, clamp: [6, 6, W - 6, H - 6] });
      const target = session.game?.progression?.questTarget?.() ?? null;
      const tgt = resolveTarget(session, target);
      if (tgt) { const [px, py] = map(tgt.x, tgt.y); drawTarget(ctx, Math.min(W - 9, Math.max(9, px)), Math.min(H - 9, Math.max(9, py)), t, true); }
      const hero = w.hero, hp = map(hero.x, hero.y);
      heroPulse(ctx, hp[0], hp[1], t);
      drawHero(ctx, hp[0], hp[1], heroAngle(hero), true);
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

// Pulsierender Ring um den Helden (dunkel mit hellem Kern), damit er auf jeder Fläche sofort auffällt
function heroPulse(ctx, x, y, t) {
  // fester Ring: dunkel außen, hell innen
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ctx.fillStyle = '#1a1020'; ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y + Math.sin(a) * 8), 1, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(y + Math.sin(a) * 7), 1, 1);
  }
  const p = (t * 1.2) % 1, r = 8 + p * 7;
  const n = Math.round(r * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
    ctx.fillStyle = p < 0.6 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)'; ctx.fillRect(px, py, 1, 1);
    ctx.fillStyle = 'rgba(26,16,32,0.6)'; ctx.fillRect(px, py + 1, 1, 1);
  }
}

function legendItem(kind, text) {
  const c = makeCanvas(15, 15), ctx = c.getContext('2d');
  if (kind === 'hero') drawHero(ctx, 7, 7, -Math.PI / 2, true);
  else if (kind === 'target') drawTarget(ctx, 7, 7, 0, true);
  else if (kind === 'enemy') dot(ctx, 7, 7, C.enemy, 3);
  else glyph(ctx, 7, kind === 'offer' ? 9 : 7, kind, 0, true);
  return h('li', h('img.map-legend-icon', { src: c.toDataURL(), alt: '' }), h('span', text));
}
