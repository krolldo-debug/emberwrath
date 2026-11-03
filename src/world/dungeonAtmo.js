import { CONFIG } from '../config.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { hash2, rand } from '../core/math.js';

// Dungeon-Atmosphäre (Grafik-Patch Nov.): Tiefe der Mauern, Bodendetails, Bodennebel und Staub im Licht.
// Alles in Weltpixeln auf ganzzahligem Raster (Feinpixel u = 1/res nur für Kanten), harte Kanten, wenige Töne.
// Gebacken wird in Dungeon.renderBackground (kostet nur beim Betreten), Nebel/Staub laufen je Bild (World.render).
const T = CONFIG.tileSize;

// Biomstimmung: Nebelfarbe, Akzente am Boden (Farben je Biom, null = keine)
const MOOD = {
  null: { fog: [120, 104, 140], accent: ['#9a8c70', '#6e6450'], kind: 'bone' },        // Katakomben
  temple: { fog: [96, 150, 146], accent: ['#3e5a36', '#58783e'], kind: 'moss' },
  forge: { fog: [150, 96, 70], accent: ['#1a1414', '#2a2020'], kind: 'soot' },
  barrow: { fog: [120, 160, 156], accent: ['#4a3a2a', '#5e4a34'], kind: 'roots', lift: 0.26 },
  spore: { fog: [120, 150, 100], accent: ['#7a4e92', '#5e8a44'], kind: 'spore', lift: 0.1 },
  rime: { fog: [150, 176, 210], accent: ['#cfe4f4', '#8eb0cc'], kind: 'frost' },
  throne: { fog: [150, 116, 96], accent: ['#1c1616', '#2c2422'], kind: 'soot' },
  thorn: { fog: [140, 116, 160], accent: ['#4c6a3e', '#6a8a48'], kind: 'moss' },
  glass: { fog: [140, 176, 220], accent: ['#c8d4ff', '#7e90c8'], kind: 'star' },
  vault: { fog: [140, 140, 200], accent: ['#ffe2a0', '#9ea8e0'], kind: 'star' },
};
export const moodOf = (biomeKey) => MOOD[biomeKey] ?? MOOD.null;

// Dungeons waren zu dunkel: Grundhelligkeit leicht anheben (Kontrast der Lichtinseln bleibt); lichtarme Biome mehr
export function liftAmbient(a, biomeKey = null) {
  const k = 0.07 + (moodOf(biomeKey).lift ?? 0);
  return a.map((v) => Math.min(255, Math.round(v + (255 - v) * k + 6)));
}

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Mittlere Bodenfarbe einer (Makro-)Kachel, daraus Dunkel-/Hellton für Risse und Steinchen
function floorTones(tile) {
  const w = tile.width, h = tile.height;
  const c = makeCanvas(w, h, { willReadFrequently: true }), g = c.getContext('2d');
  g.drawImage(tile, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 3) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  const avg = n ? [r / n, gg / n, b / n] : [60, 50, 70];
  return { dark: rgb(avg.map((v) => v * 0.45)), mid: rgb(avg.map((v) => v * 0.72)), hi: rgb(avg.map((v) => Math.min(255, v * 1.4 + 12))) };
}

// Mauertiefe: Mauerkrone mit Lichtkante und Unterschnitt, Überhangschatten oben an der Front, Sockelleiste unten,
// helle/dunkle Mauerecken (Licht von oben links), Schlagschatten nach rechts unten. Ersetzt die alten 1–2-px-Kanten.
export function paintWallDepth(ctx, map, biome, r) {
  const u = 1 / r;
  const edge = hex(biome?.topEdge ?? '#3a3346'), light = hex(biome?.topEdgeLight ?? '#4b4259');
  const lipHi = rgb(mix(light, [255, 236, 200], 0.18)), lipMid = rgb(mix(edge, light, 0.55)), lipLo = rgb(edge), lipDark = rgb(edge.map((v) => v * 0.45));
  const organic = !!biome?.liquid?.tile;
  const K = (x, y) => map.wallKind(x, y);
  const open = (x, y) => { const k = K(x, y); return k === 'floor' || k === 'faceLower' || k === 'faceUpper' || k === 'liquid'; };
  const face = (x, y) => { const k = K(x, y); return k === 'faceLower' || k === 'faceUpper'; };
  const hw = (x, y) => map.isWall(x, y) && !(organic && map.isLiquid(x, y));
  const dark = (a) => `rgba(6,4,12,${a})`;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const px = x * T, py = y * T, k = K(x, y);
      if (k === 'top') {
        // Seitenkanten der Krone (Mauer läuft nach unten): links hell (Licht), rechts dunkel
        if (open(x - 1, y)) { ctx.fillStyle = lipLo; ctx.fillRect(px, py, 2, T); ctx.fillStyle = lipHi; ctx.fillRect(px, py, u, T); }
        if (open(x + 1, y)) { ctx.fillStyle = lipDark; ctx.fillRect(px + T - 2, py, 2, T); ctx.fillStyle = lipLo; ctx.fillRect(px + T - 2, py, u, T); }
        if (open(x, y - 1)) { ctx.fillStyle = lipLo; ctx.fillRect(px, py, T, 1); }
        if (open(x, y + 1)) {
          // Lippe der Krone über der Front: 4 Weltpixel, oben Lichtkante, unten Unterschnitt
          ctx.fillStyle = lipMid; ctx.fillRect(px, py + T - 4, T, 3);
          ctx.fillStyle = lipHi; ctx.fillRect(px, py + T - 4, T, u);
          ctx.fillStyle = lipLo; ctx.fillRect(px, py + T - 2, T, 1);
          ctx.fillStyle = lipDark; ctx.fillRect(px, py + T - 1, T, 1);
          // Steinfugen in der Lippe
          for (let i = Math.floor(hash2(x, y, 41) * 6); i < T; i += 6 + Math.floor(hash2(x + i, y, 43) * 4)) { ctx.fillStyle = lipLo; ctx.fillRect(px + i, py + T - 4, u, 2); }
        }
        continue;
      }
      if (k === 'faceUpper' || k === 'faceLower') {
        const topRow = k === 'faceUpper' || !face(x, y - 1);
        if (topRow) {
          // Überhangschatten unter der Krone, in harten Bändern
          [0.55, 0.38, 0.24, 0.12].forEach((a, i) => { ctx.fillStyle = dark(a); ctx.fillRect(px, py + i, T, 1); });
        }
        if (k === 'faceLower') {
          // Sockel: Lichtkante, dann dunkler Fuß zur Bodenfuge
          ctx.fillStyle = `rgba(${light.join(',')},0.55)`; ctx.fillRect(px, py + T - 4, T, u);
          ctx.fillStyle = dark(0.28); ctx.fillRect(px, py + T - 4 + u, T, 2);
          ctx.fillStyle = dark(0.5); ctx.fillRect(px, py + T - 2 + u, T, 2 - u);
        }
        // Mauerenden: linke Ecke im Licht, rechte im Schatten
        if (!map.isWall(x - 1, y) || map.isLiquid(x - 1, y)) { ctx.fillStyle = `rgba(${light.join(',')},0.5)`; ctx.fillRect(px, py, 1, T); }
        if (!map.isWall(x + 1, y) || map.isLiquid(x + 1, y)) { ctx.fillStyle = dark(0.5); ctx.fillRect(px + T - 2, py, 2, T); }
        continue;
      }
      if (k !== 'floor') continue;
      // Schlagschatten der Mauern (Licht oben links: nach rechts/unten länger)
      if (hw(x, y - 1)) [0.62, 0.5, 0.4, 0.3, 0.2, 0.12, 0.06].forEach((a, i) => { ctx.fillStyle = dark(a); ctx.fillRect(px, py + i, T, 1); });
      if (hw(x - 1, y)) { ctx.fillStyle = dark(0.5); ctx.fillRect(px, py, 3, T); ctx.fillStyle = dark(0.3); ctx.fillRect(px + 3, py, 3, T); ctx.fillStyle = dark(0.14); ctx.fillRect(px + 6, py, 2, T); }
      if (hw(x + 1, y)) { ctx.fillStyle = dark(0.4); ctx.fillRect(px + T - 2, py, 2, T); ctx.fillStyle = dark(0.16); ctx.fillRect(px + T - 3, py, 1, T); }
      if (hw(x, y + 1)) { ctx.fillStyle = dark(0.3); ctx.fillRect(px, py + T - 2, T, 2); }
      // Innenecke oben links: Schatten fortsetzen
      if (!hw(x - 1, y) && !hw(x, y - 1) && hw(x - 1, y - 1)) { ctx.fillStyle = dark(0.35); ctx.fillRect(px, py, 4, 4); }
    }
  }
}

// Bodendetails: Geröll am Mauerfuß, Risse über Plattengrenzen, Steinchen, Biom-Akzente (Moos, Ruß, Reif, Sporen …).
// Sparsam: höchstens jede ~6. Kachel, Mauerfuß häufiger (dort entsteht die Tiefe).
export function paintFloorDetail(ctx, map, biome, floorTile, r) {
  const u = 1 / r, tn = floorTones(floorTile), mood = moodOf(map.biomeKey);
  const [ac1, ac2] = mood.accent;
  const isFloor = (x, y) => map.wallKind(x, y) === 'floor';
  const pebble = (x, y, big) => {
    ctx.fillStyle = tn.dark; ctx.fillRect(x + u, y + u, big ? 2 : 1, big ? 2 : 1);   // Schatten unten rechts
    ctx.fillStyle = tn.hi; ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
    if (big) { ctx.fillStyle = tn.mid; ctx.fillRect(x + 1, y + 1, 1, 1); }
  };
  for (let y = 1; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (!isFloor(x, y)) continue;
      const px = x * T, py = y * T, h = hash2(x, y, 71);
      const wallAbove = map.isWall(x, y - 1) && !map.isLiquid(x, y - 1);
      // Geröll am Mauerfuß
      if (wallAbove && h < 0.3) {
        const n = 3 + Math.floor(hash2(x, y, 72) * 4), cx = px + 2 + hash2(x, y, 73) * 9;
        for (let i = 0; i < n; i++) pebble(Math.round(cx + hash2(x, y, 80 + i) * 6), py + 1 + Math.round(hash2(x, y, 90 + i) * 4), i < 2);
        continue;
      }
      // Riss: Zufallsweg in Feinpixeln mit heller Unterkante
      if (h > 0.93) {
        let cx = px + 3 + hash2(x, y, 74) * 10, cy = py + 3 + hash2(x, y, 75) * 10;
        const len = 8 + Math.floor(hash2(x, y, 76) * 10), dx = hash2(x, y, 77) < 0.5 ? -1 : 1;
        for (let i = 0; i < len; i++) {
          const sx = Math.round(cx * r) / r, sy = Math.round(cy * r) / r;
          ctx.fillStyle = tn.hi; ctx.fillRect(sx, sy + u, u, u);
          ctx.fillStyle = tn.dark; ctx.fillRect(sx, sy, u, u);
          const q = hash2(x * 31 + i, y, 78);
          if (q < 0.55) cx += dx * u; else if (q < 0.85) cy += u; else { cx += dx * u; cy -= u; }
        }
        continue;
      }
      // Steinchen
      if (h > 0.84) { pebble(px + 2 + Math.round(hash2(x, y, 79) * 11), py + 2 + Math.round(hash2(x, y, 81) * 11), hash2(x, y, 82) < 0.3); continue; }
      // Biom-Akzent (eher an Wänden und Rändern)
      const nearWall = map.isWall(x - 1, y) || map.isWall(x + 1, y) || wallAbove;
      if (h < (nearWall ? 0.5 : 0.38) && h > (nearWall ? 0.3 : 0.32)) accent(ctx, mood.kind, px, py, x, y, ac1, ac2, u, tn);
    }
  }
}

function accent(ctx, kind, px, py, x, y, c1, c2, u, tn) {
  const H = (s) => hash2(x, y, s);
  const ox = px + 2 + Math.round(H(101) * 10), oy = py + 2 + Math.round(H(102) * 10);
  switch (kind) {
    case 'moss': // Moosbüschel: dunkler Grund, helle Spitzen
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 4 ? c1 : c2; ctx.fillRect(ox + Math.round((H(110 + i) - 0.5) * 6), oy + Math.round((H(120 + i) - 0.5) * 3), i < 4 ? 2 : 1, 1); }
      break;
    case 'soot': // Rußfleck: unregelmäßige dunkle Fläche aus Weltpixeln
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i & 1 ? c1 : c2; ctx.fillRect(ox + Math.round((H(110 + i) - 0.5) * 8), oy + Math.round((H(120 + i) - 0.5) * 4), 2, 1); }
      break;
    case 'roots': // Wurzelstrang
      for (let i = 0; i < 7; i++) { ctx.fillStyle = c1; ctx.fillRect(ox + i, oy + Math.round(Math.sin(i * 0.9 + H(103) * 6) * 1.5), 1, 1); if (i % 3 === 1) { ctx.fillStyle = c2; ctx.fillRect(ox + i, oy - 1 + Math.round(Math.sin(i * 0.9 + H(103) * 6) * 1.5), 1, u); } }
      break;
    case 'spore': // Sporenkränzchen
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i ? c2 : c1; ctx.fillRect(ox + Math.round((H(110 + i) - 0.5) * 7), oy + Math.round((H(120 + i) - 0.5) * 4), 1, 1); }
      break;
    case 'frost': // Reif: kleine Kristallsterne
      for (let i = 0; i < 3; i++) {
        const sx = ox + Math.round((H(110 + i) - 0.5) * 8), sy = oy + Math.round((H(120 + i) - 0.5) * 4);
        ctx.fillStyle = c2; ctx.fillRect(sx - 1, sy, 3, u); ctx.fillRect(sx, sy - u * 2, u, 1 + u * 2);
        ctx.fillStyle = c1; ctx.fillRect(sx, sy, u, u);
      }
      break;
    case 'star': // Sternenstaub: einzelne Feinpixel
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i ? c2 : c1; ctx.fillRect(ox + Math.round((H(110 + i) - 0.5) * 10 * 2) / 2, oy + Math.round((H(120 + i) - 0.5) * 6 * 2) / 2, u, u); }
      break;
    default: // Knochensplitter
      ctx.fillStyle = tn.dark; ctx.fillRect(ox + u, oy + u, 3, 1);
      ctx.fillStyle = c1; ctx.fillRect(ox, oy, 3, 1); ctx.fillStyle = c2; ctx.fillRect(ox + 2, oy, 1, 1);
  }
}

// Bodennebel: kachelbare Rauschfläche in 3 harten Dichtestufen, zwei langsam gegenläufige Lagen.
// Sichtbar nur im Licht (Ausstanzen mit dem Glanz der Lichter), bei „Niedrig“ aus.
const FOG_N = 64;   // Texel = 2 Weltpixel (Lightmap-Raster)
function fogTexture(color, seed) {
  const c = makeCanvas(FOG_N, FOG_N), g = c.getContext('2d'), img = g.createImageData(FOG_N, FOG_N), d = img.data;
  // periodisches Wertrauschen (Gitter 8 und 4 Zellen), damit die Fläche nahtlos kachelt
  const lat = (n, s) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = hash2(i % n, Math.floor(i / n), s); return a; };
  const L1 = lat(4, seed), L2 = lat(8, seed + 7);
  const smp = (L, n, x, y) => {
    const fx = x / FOG_N * n, fy = y / FOG_N * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (i, j) => L[((j % n) + n) % n * n + ((i % n) + n) % n];
    return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
  };
  const [cr, cg, cb] = color;
  for (let y = 0; y < FOG_N; y++) for (let x = 0; x < FOG_N; x++) {
    const v = smp(L1, 4, x, y) * 0.68 + smp(L2, 8, x, y) * 0.32;
    const a = v > 0.64 ? 1 : v > 0.54 ? 0.62 : v > 0.44 ? 0.3 : 0.1;
    if (!a) continue;
    const o = (y * FOG_N + x) * 4;
    d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class DungeonAtmo {
  constructor(world, biomeKey) {
    this.world = world;
    const m = moodOf(biomeKey);
    this.fogA = fogTexture(m.fog, 17);
    this.fogB = fogTexture(m.fog.map((v) => Math.min(255, v + 20)), 53);
    this.statics = world.lights.filter((l) => !l.follow && l.ttl === Infinity);
  }

  get on() { return document.documentElement.dataset.quality !== 'low'; }

  // Staub, der im Licht schwebt: Fleckchen in Lichtkegeln/-teichen sichtbarer Lichter
  update(dt) {
    const w = this.world, v = w.view, W = CONFIG.viewWidth, H = CONFIG.viewHeight;
    const near = this.statics.filter((l) => l.x > v.x - 40 && l.x < v.x + W + 40 && l.y > v.y - 40 && l.y < v.y + H + 60);
    if (!near.length || Math.random() > dt * Math.min(16, 3 + near.length * 2.5)) return;
    const l = near[Math.floor(Math.random() * near.length)];
    let x, y;
    if (l.shape?.cone) { const t = Math.sqrt(Math.random()), L = l.shape.cone.len * 0.75; y = l.y + 6 + t * L; x = l.x + (Math.random() * 2 - 1) * Math.tan(l.shape.cone.spread) * t * L * 0.8; }
    else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * l.radius * 0.55; x = l.x + Math.cos(a) * d; y = l.y + Math.sin(a) * d * 0.7; }
    const [r, g, b] = l.color, c = `rgb(${Math.min(255, r * 0.55 + 110) | 0},${Math.min(255, g * 0.55 + 100) | 0},${Math.min(255, b * 0.55 + 90) | 0})`;
    w.particles.spawn({ x, y, vx: rand(-3, 3), vy: rand(-1.5, 1.5), rise: rand(0.5, 3), wobble: 5, life: rand(2.5, 5), colors: [c], alpha: 0.55, emissive: true });
  }

  // Dunst nach dem Lichtpass: Nebelfläche in Lightmap-Auflösung (1 Texel = 2 Weltpixel), ausgestanzt mit dem Glanz
  // der Lichter (lighting.glowCanvas, ohne Umgebungsdunkel, Leere schon entfernt) – Nebel nur im Licht, additiv.
  render(ctx, cx, cy, time, lighting) {
    const glow = lighting?.glowCanvas;
    if (!this.on || !glow || !(lighting.dodge > 0) || lighting.bloomScale === 0) return;
    const W = glow.width, H = glow.height;
    if (!this.buf || this.buf.width !== W || this.buf.height !== H) this.buf = makeCanvas(W, H);
    const g = this.buf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    const layer = (img, sx, sy, a) => {
      const ox = ((Math.round(cx * 0.45 + sx) % FOG_N) + FOG_N) % FOG_N, oy = ((Math.round(cy * 0.45 + sy) % FOG_N) + FOG_N) % FOG_N;
      g.globalAlpha = a;
      for (let y = -oy; y < H; y += FOG_N) for (let x = -ox; x < W; x += FOG_N) g.drawImage(img, x, y);
    };
    layer(this.fogA, time * 1.6, time * 0.4, 1);
    layer(this.fogB, -time * 1.1, time * 0.7, 0.7);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(glow, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, CONFIG.viewWidth, CONFIG.viewHeight);
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalCompositeOperation = 'source-over';
  }
}
