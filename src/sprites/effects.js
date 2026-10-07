import { makeCanvas } from '../gfx/PixelCanvas.js';
import { PAL, hexToRgb } from '../gfx/Palette.js';
import { TAU } from '../core/math.js';

// Schwerthieb-Bögen, pixelgenau für jede Richtung berechnet und gecacht.
// Farben laufen von heißem Weiß (Schneide) zu Glut-Orange (Schweif).
const DIRS = 32;
const FRAMES = 6;
const cache = new Map();

const HOT = ['#fff8e0', '#ffe8a0', '#ffc050', '#f07a1c', '#c8420c', '#7a2208'].map(hexToRgb);
const COLD = ['#ffffff', '#e0ecff', '#a8c0f0', '#7088c8', '#48527a', '#2d3548'].map(hexToRgb);

function buildSlashFrame({ radius, width, span, heavy, soft }, dirIndex, frame, reverse) {
  const R = radius + 3;
  const size = R * 2 + 1;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const dir = (dirIndex / DIRS) * TAU;
  const prog = (frame + 1) / FRAMES;
  const head = Math.min(1, prog * 1.6);
  const tailLen = 0.75;
  const fade = prog > 0.6 ? 1 - (prog - 0.6) / 0.4 : 1;
  const ramp = heavy ? HOT : HOT;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - R, dy = y - R;
      const r = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx) - dir;
      a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
      let u = (a + span / 2) / span;
      if (u < 0 || u > 1) continue;
      if (reverse) u = 1 - u;
      if (u > head) continue;
      const behind = (head - u) / tailLen;
      if (behind > 1) continue;
      const thick = width * (1 - behind) * (0.4 + 0.6 * fade);
      const inner = radius - thick;
      if (soft) {
        // Zweihänder: wie der Bogen am Helden – heller Rand auf der Spitzenbahn, darunter ein dünner, durchscheinender Glutschleier
        if (r > radius || r < inner) continue;
        const i4s = (y * size + x) * 4, e = (radius - r) / Math.max(thick, 0.001);
        const col = e < 0.22 ? ramp[1] : e < 0.6 ? ramp[2] : ramp[3];
        const al = (e < 0.22 ? 0.9 : 0.55 * (1 - e)) * (1 - behind * 0.85) * fade;
        d[i4s] = col[0]; d[i4s + 1] = col[1]; d[i4s + 2] = col[2]; d[i4s + 3] = Math.round(255 * Math.min(1, al));
        continue;
      }
      const i4 = (y * size + x) * 4;
      // Nachglühen: weicher Saum innen, heller 1-px-Rand außen an der Spitze
      if (r < inner && r >= inner - 3 && behind < 0.8) {
        const col = ramp[4]; const a = (1 - (inner - r) / 3) * (0.8 - behind) * 0.45 * fade;
        d[i4] = col[0]; d[i4 + 1] = col[1]; d[i4 + 2] = col[2]; d[i4 + 3] = Math.round(255 * a);
        continue;
      }
      if (r > radius && r <= radius + 1 && behind < 0.25) {
        d[i4] = 255; d[i4 + 1] = 255; d[i4 + 2] = 240; d[i4 + 3] = Math.round(255 * (1 - behind * 4) * fade * 0.8);
        continue;
      }
      if (r > radius || r < inner) continue;
      const edge = (radius - r) / Math.max(thick, 0.001); // 0 = Schneide außen
      let idx = Math.floor(edge * 2.2 + behind * 3.2 + (1 - fade) * 2);
      idx = Math.max(0, Math.min(ramp.length - 1, idx));
      const col = ramp[soft ? Math.min(idx, 2) : idx];
      const i = (y * size + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      // soft (Zweihänder): durchscheinender Schleier, nach innen und zum Schweif hin ausblendend
      const body = soft ? (edge < 0.18 ? 0.95 : 0.62 * (1 - edge) ** 1.3) * (1 - behind) * fade : Math.min(1, (1.15 - behind) * fade + 0.1);
      d[i + 3] = Math.round(255 * body);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const SLASH_FRAMES = FRAMES;

export function getSlashFrame(style, angle, frame, reverse = false) {
  let di = Math.round((angle / TAU) * DIRS) % DIRS;
  if (di < 0) di += DIRS;
  const key = `${style.key}|${di}|${frame}|${reverse ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) { c = buildSlashFrame(style, di, frame, reverse); cache.set(key, c); }
  return c;
}

export const SLASH_STYLES = {
  hero: { key: 'hero', radius: 21, width: 10, span: 2.6, heavy: false },
  heroHeavy: { key: 'heroHeavy', radius: 27, width: 13, span: 3.7, heavy: true },
  enemy: { key: 'enemy', radius: 17, width: 5, span: 2.0, heavy: false },
  // Zweihänder: Bogen an der Klingenspitze, schmaler und durchscheinend statt voller Sichel
  great: { key: 'great', radius: 25, width: 4.5, span: 2.6, heavy: false, soft: true },
  greatHeavy: { key: 'greatHeavy', radius: 28, width: 5.5, span: 3.7, heavy: true, soft: true },
};

// Enemy-Hiebe in kalter, fahler Farbe – visuell klar vom Helden getrennt.
export function getEnemySlashFrame(angle, frame) {
  let di = Math.round((angle / TAU) * DIRS) % DIRS;
  if (di < 0) di += DIRS;
  const key = `enemyc|${di}|${frame}`;
  let c = cache.get(key);
  if (!c) {
    const src = buildSlashFrame(SLASH_STYLES.enemy, di, frame, false);
    const ctx = src.getContext('2d');
    const img = ctx.getImageData(0, 0, src.width, src.height);
    for (let i = 0; i < img.data.length; i += 4) {
      if (!img.data[i + 3]) continue;
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 765;
      const idx = Math.max(0, Math.min(5, Math.round((1 - lum) * 5)));
      const col = COLD[idx];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
    }
    ctx.putImageData(img, 0, 0);
    c = src; cache.set(key, c);
  }
  return c;
}

// Radiale Licht-Sprites (vorgerendert statt pro Frame Gradienten zu bauen).
const lightCache = new Map();
export function getLightSprite(radius, rgb) {
  const r = Math.max(4, Math.round(radius / 4) * 4);
  const key = `${r}|${rgb.join(',')}`;
  let c = lightCache.get(key);
  if (c) return c;
  c = makeCanvas(r * 2, r * 2);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const [cr, cg, cb] = rgb;
  // Weicher, annähernd quadratischer Abfall: heller Kern, langer warmer Saum
  [[0, 1], [0.12, 0.92], [0.3, 0.66], [0.5, 0.36], [0.7, 0.15], [0.86, 0.05], [1, 0]]
    .forEach(([t, a]) => g.addColorStop(t, `rgba(${cr},${cg},${cb},${a})`));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
  lightCache.set(key, c);
  return c;
}

export function createArrowSprite() {
  const c = makeCanvas(9, 3);
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAL.leather[3]; ctx.fillRect(1, 1, 6, 1);
  ctx.fillStyle = PAL.steel[4]; ctx.fillRect(7, 1, 2, 1); ctx.fillRect(7, 0, 1, 3);
  ctx.fillStyle = PAL.crimson[3]; ctx.fillRect(0, 0, 2, 1); ctx.fillRect(0, 2, 2, 1);
  return c;
}

// Questpfad-Sprite (INTEGRATION.md §11.6, von B am Boden gezeichnet, emissiv):
//   guide.frames  – 4 Frames eines flachen Glutflecks mit Rune (11 × 6), pulsierend
//   guide.arrow(angle) – Glut-Chevron (11 × 11) in Laufrichtung, 16 Richtungen gecacht
//   guide.end     – Zielmarke (15 × 8): Ring mit Kern
export function createGuideSprites() {
  const RAMP = ['#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const c = makeCanvas(11, 6), ctx = c.getContext('2d');
    const glow = 0.55 + 0.45 * Math.sin((f / 4) * TAU);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 11; x++) {
      const dx = (x + 0.5 - 5.5) / 5.5, dy = (y + 0.5 - 3) / 3;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const k = Math.min(4, Math.floor((1 - d) * 5 * (0.6 + glow * 0.5)));
      ctx.fillStyle = RAMP[k];
      ctx.globalAlpha = d > 0.8 ? 0.45 : 0.9;
      ctx.fillRect(x, y, 1, 1);
    }
    // Rune: kleines Kreuz mit Punkt
    ctx.globalAlpha = 1;
    ctx.fillStyle = f % 2 ? '#fff0b0' : '#ffd66a';
    ctx.fillRect(5, 1, 1, 4); ctx.fillRect(3, 3, 5, 1);
    frames.push(c);
  }
  const arrows = new Map();
  const arrow = (angle) => {
    let di = Math.round((angle / TAU) * 16) % 16; if (di < 0) di += 16;
    let c = arrows.get(di);
    if (c) return c;
    c = makeCanvas(11, 11);
    const ctx = c.getContext('2d');
    const a = (di / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const px = x + 0.5 - 5.5, py = (y + 0.5 - 5.5) * 2; // Boden-Perspektive: y gestaucht
      const u = px * ca + py * sa, v = -px * sa + py * ca;
      const chev = Math.abs(u + Math.abs(v) * 0.9 - 1) < 1.1 && Math.abs(v) < 4.2 && u > -4;
      if (!chev) continue;
      ctx.fillStyle = Math.abs(v) < 1 ? '#fff0b0' : Math.abs(v) < 2.5 ? '#ffb640' : '#f07a1c';
      ctx.fillRect(x, y, 1, 1);
    }
    arrows.set(di, c);
    return c;
  };
  const end = makeCanvas(15, 8);
  {
    const ctx = end.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 15; x++) {
      const d = Math.hypot((x + 0.5 - 7.5) / 7.5, (y + 0.5 - 4) / 4);
      if (d > 1) continue;
      if (d > 0.72) { ctx.fillStyle = '#ffd66a'; ctx.fillRect(x, y, 1, 1); }
      else if (d < 0.3) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, y, 1, 1); }
      else if (d < 0.45) { ctx.fillStyle = 'rgba(240,122,28,0.6)'; ctx.fillRect(x, y, 1, 1); }
    }
  }
  return { frames, arrow, end };
}
