import { makeCanvas } from '../gfx/PixelCanvas.js';
import { PAL, hexToRgb } from '../gfx/Palette.js';
import { TAU } from '../core/math.js';
import { fineRes } from '../gfx/Fine.js';

// Schwerthieb-Bögen, pixelgenau für jede Richtung berechnet und gecacht.
// Farben laufen von heißem Weiß (Schneide) zu Glut-Orange (Schweif).
const DIRS = 32;
const FRAMES = 6;
const cache = new Map();

const HOT = ['#fff8e0', '#ffe8a0', '#ffc050', '#f07a1c', '#c8420c', '#7a2208'].map(hexToRgb);
// Skinset Mondsichel: kaltes Mondsilber zu Geisterlicht (harte Stufen, keine Transparenz)
const MOON = ['#ffffff', '#e9f7ff', '#a8f0ec', '#4ad8cc', '#1a8a8a'].map(hexToRgb);
// Schurke: Leerenviolett (Klassenfarbe), gleiche Stufung wie HOT
const VOID = ['#f8f0ff', '#e0ccff', '#b48ae8', '#8456c8', '#55309a', '#2c1856'].map(hexToRgb);
const RAMPS = { hot: HOT, void: VOID };
const COLD = ['#ffffff', '#e0ecff', '#a8c0f0', '#7088c8', '#48527a', '#2d3548'].map(hexToRgb);

// Feinraster (docs/STYLE.md „Feinraster“): res Texel je Weltpixel (fineRes, bei „Niedrig“ 1). Der Bogen besteht aus
// harten Farbbändern, Durchsicht nur in drei Stufen (1 / ⅔ / ⅓) – kein weicher Verlauf, kein Streumuster (Hiebbögen
// sollen dicht bleiben, sonst flimmern sie). Im Feinraster: Schneide als 1 Feinpixel heller Strich, Nachglühen innen
// als ein Feinpixel-Band. Liefert { canvas, ox, oy, res, size }: das Bild ist auf den gefüllten Bereich beschnitten,
// ox/oy = Lage im vollen Quadrat (Texel), size = Seitenlänge des vollen Quadrats in Weltpixeln.
const a3 = (v) => (v > 0.7 ? 255 : v > 0.4 ? 170 : v > 0.12 ? 85 : 0);
function buildSlashFrame({ radius, width, span, soft, hard, ramp: rk = 'hot' }, dirIndex, frame, reverse, res) {
  if (res > 1 && !hard) return buildDrawnSlash({ radius, width, span, soft, ramp: RAMPS[rk] }, dirIndex, frame, reverse, res);
  const R = radius + 3;
  const size = R * 2 + 1, S = size * res, e1 = 1 / res;   // e1 = ein Feinpixel in Weltpixeln
  const d = new Uint8ClampedArray(S * S * 4);
  const dir = (dirIndex / DIRS) * TAU;
  const prog = (frame + 1) / FRAMES;
  const head = Math.min(1, prog * 1.6);
  const tailLen = 0.75;
  const fade = prog > 0.6 ? 1 - (prog - 0.6) / 0.4 : 1;
  const ramp = RAMPS[rk];
  const set = (i, col, al) => { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = al; };
  for (let Y = 0; Y < S; Y++) {
    for (let X = 0; X < S; X++) {
      const dx = (X + 0.5) / res - (R + 0.5), dy = (Y + 0.5) / res - (R + 0.5);
      const r = Math.hypot(dx, dy);
      if (r > radius + 1.2 || r < radius - width - 3.5) continue;
      let a = Math.atan2(dy, dx) - dir;
      a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
      let u = (a + span / 2) / span;
      if (u < 0 || u > 1) continue;
      if (reverse) u = 1 - u;
      if (u > head) continue;
      const behind = (head - u) / tailLen;
      if (behind > 1) continue;
      // Feinraster: nie dünner als 1 Weltpixel (sonst zerfasert der Bogen auf dem Handy); deckend, ausgeblendet wird
      // über die dunkleren Rampenstufen (dim), nicht über Durchsichtigkeit oder Raster
      const thick = Math.max(res > 1 ? 1 : 0, width * (1 - behind) * (0.4 + 0.6 * fade));
      const inner = radius - thick;
      const i = (Y * S + X) * 4;
      const dim = fade < 0.34 ? 2 : fade < 0.67 ? 1 : 0;
      if (hard) {
        // Skinset: schmale Sichel aus deckenden Pixeln, Schneide außen weiß, zum Schweif hin Geisterlicht
        if (r > radius || r < inner) continue;
        const idx = Math.floor(((radius - r) / Math.max(thick, 0.001)) * 1.8 + behind * 2.6 + (1 - fade) * 2);
        if (idx >= MOON.length) continue;
        set(i, MOON[idx], 255);
        continue;
      }
      if (soft) {
        // Zweihänder: heller Rand auf der Spitzenbahn, darunter ein dünner Glutschleier in zwei Stufen
        if (r > radius || r < inner) continue;
        const e = (radius - r) / Math.max(thick, 0.001);
        const edge = radius - r < (res > 1 ? e1 * 2 : 1) || e < 0.22;
        const al = a3((edge ? 1 : 0.68 * (1 - e)) * (1 - behind * 0.8) * fade);
        if (res > 1) {
          // deckend: Kante voll, Schleier als Raster (statt halb durchsichtig)
          if (!al || (!edge && e > 0.6)) continue;
          set(i, ramp[Math.min(5, (edge ? (radius - r < e1 ? 0 : 1) : 4) + dim)], 255);
          continue;
        }
        if (al) set(i, edge ? ramp[1] : e < 0.6 ? ramp[2] : ramp[3], al);
        continue;
      }
      // Nachglühen innen: ein schmales, durchscheinendes Band in der dunklen Glutfarbe
      if (r < inner && r >= inner - (res > 1 ? 1.5 : 3) && behind < 0.8) {
        if (res > 1) { if (fade > 0.5 && r >= inner - e1) set(i, ramp[5], 255); continue; }   // eine Feinpixel-Linie, deckend
        const al = a3((1 - (inner - r) / 3) * 0.45 * (0.8 - behind) * 1.6 * fade);
        if (al) set(i, ramp[4], Math.min(al, 85));
        continue;
      }
      // Schneide: heller Saum außen an der Spitze (im Feinraster genau ein Feinpixel)
      if (r > radius && r <= radius + (res > 1 ? e1 : 1) && behind < 0.25) {
        if (res > 1) { if (!dim && behind < 0.2) set(i, [255, 255, 240], 255); continue; }
        set(i, [255, 255, 240], a3((1 - behind * 4) * fade * 0.9));
        continue;
      }
      if (r > radius || r < inner) continue;
      const edge = (radius - r) / Math.max(thick, 0.001); // 0 = Schneide außen
      let idx = Math.floor(edge * (res > 1 ? 2.6 : 2.2) + behind * 3.2 + (1 - fade) * 2);
      idx = Math.max(0, Math.min(ramp.length - 1, idx));
      // Feinraster: deckend, der Auslauf wird über die dunkleren Rampenstufen und das Raster leiser
      if (res > 1) { set(i, ramp[Math.min(ramp.length - 1, idx + dim)], 255); continue; }
      set(i, ramp[idx], a3(Math.min(1, (1.15 - behind) * fade + 0.1)));
    }
  }
  return cropFrame(d, S, res, size);
}

// Feinraster: gezeichnete Sichel statt glatter Ringbänder (die wirkten wie Vektor-Ellipsen). Eine durchgehende Sichel
// auf dem Weltpixel-Raster, die zur Spitze und zum Schweif spitz zuläuft, in drei harten Stufen: helle Schneide außen,
// Körper, dunkle Innenkante; zum Schweif und beim Ausklingen eine Stufe dunkler. Nur die Schneide an der Spitze ist ein
// Feinpixel heller Strich.
function buildDrawnSlash({ radius, width, span, soft, ramp }, dirIndex, frame, reverse, res) {
  const R = radius + 3;
  const size = R * 2 + 1, S = size * res, e1 = 1 / res;
  const d = new Uint8ClampedArray(S * S * 4);
  const dir = (dirIndex / DIRS) * TAU;
  const prog = (frame + 1) / FRAMES;
  const head = Math.min(1, prog * 1.6);
  const tailLen = 0.75;
  const fade = prog > 0.6 ? 1 - (prog - 0.6) / 0.4 : 1;
  const dim = fade < 0.5 ? 1 : 0;
  const arcPx = span * radius;
  const put = (X, Y, n, col) => { for (let y = Y; y < Y + n; y++) for (let x = X; x < X + n; x++) { const i = (y * S + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; } };
  // Lage auf dem Bogen: u (0 … 1 entlang der Schlagrichtung), behind (0 = Spitze, 1 = Schweifende)
  const where = (dx, dy) => {
    let a = Math.atan2(dy, dx) - dir;
    a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    let u = (a + span / 2) / span;
    if (u < 0 || u > 1) return null;
    if (reverse) u = 1 - u;
    if (u > head) return null;
    const behind = (head - u) / tailLen;
    return behind > 1 ? null : { u, behind };
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - (R + 0.5), dy = y + 0.5 - (R + 0.5);
      const r = Math.hypot(dx, dy), w = where(dx, dy);
      if (!w) continue;
      const { u, behind } = w;
      // Dicke: Sichelform (dick kurz hinter der Spitze, zum Schweif hin schmal), spitze Enden
      let T = width * (soft ? 0.7 : 1) * Math.pow(1 - behind, 1.2) * (0.5 + 0.5 * fade);
      const end = Math.min((head - u) * arcPx, u * arcPx);
      if (end < 6) T *= 0.2 + end / 7.5;
      if (T < 0.6) continue;
      T = Math.max(1, Math.round(T));
      const dd = radius - r;
      if (dd < 0 || dd >= T) continue;
      const band = Math.floor(dd);
      let idx = band < Math.max(1, Math.round(T * 0.35)) ? 1 : 2;   // Schneide außen, Körper
      if (T >= 3 && band === T - 1) idx = 4;                           // dunkle Innenkante
      if (behind > 0.55) idx++;
      put(x * res, y * res, res, ramp[Math.min(5, idx + dim)]);
    }
  }
  // Schneide: ein Feinpixel heller Strich außen an der Spitze
  if (!dim) for (let Y = 0; Y < S; Y++) for (let X = 0; X < S; X++) {
    const dx = (X + 0.5) / res - (R + 0.5), dy = (Y + 0.5) / res - (R + 0.5);
    const r = Math.hypot(dx, dy);
    if (r <= radius || r > radius + e1) continue;
    const w = where(dx, dy);
    if (w && w.behind < 0.3 && (head - w.u) * arcPx >= 1.5) put(X, Y, 1, ramp[0]);
  }
  return cropFrame(d, S, res, size);
}

// Leeren Rand abschneiden (spart Speicher: der Bogen füllt nur einen Teil des Quadrats)
function cropFrame(d, S, res, size) {
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const canvas = makeCanvas(w, h), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(d.subarray(((y + y0) * S + x0) * 4, ((y + y0) * S + x0 + w) * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  return { canvas, ox: x0, oy: y0, res, size };
}

export const SLASH_FRAMES = FRAMES;

export function getSlashFrame(style, angle, frame, reverse = false, res = fineRes()) {
  let di = Math.round((angle / TAU) * DIRS) % DIRS;
  if (di < 0) di += DIRS;
  const key = `${style.key}|${di}|${frame}|${reverse ? 1 : 0}|${res}`;
  let c = cache.get(key);
  if (!c) { c = buildSlashFrame(style, di, frame, reverse, res); cache.set(key, c); }
  return c;
}

export const SLASH_STYLES = {
  hero: { key: 'hero', radius: 21, width: 10, span: 2.6, heavy: false },
  heroHeavy: { key: 'heroHeavy', radius: 27, width: 13, span: 3.7, heavy: true },
  // Schurke: gleiche Sichel in Leerenviolett
  rogue: { key: 'rogue', radius: 21, width: 10, span: 2.6, heavy: false, ramp: 'void' },
  rogueHeavy: { key: 'rogueHeavy', radius: 27, width: 13, span: 3.7, heavy: true, ramp: 'void' },
  enemy: { key: 'enemy', radius: 17, width: 5, span: 2.0, heavy: false },
  // Zweihänder: Bogen an der Klingenspitze, schmaler und durchscheinend statt voller Sichel
  great: { key: 'great', radius: 25, width: 5.5, span: 2.6, heavy: false, soft: true },
  greatHeavy: { key: 'greatHeavy', radius: 28, width: 6.5, span: 3.7, heavy: true, soft: true },
  // Skinset Mondsichel (Schurke): kleine harte Sichel vor der Figur statt des großen Glutbogens; push = Abstand nach vorn
  mondsichel: { key: 'mondsichel', radius: 12, width: 3.2, span: 2.0, heavy: false, hard: true, push: 8 },
  mondsichelHeavy: { key: 'mondsichelHeavy', radius: 15, width: 4, span: 2.4, heavy: true, hard: true, push: 9 },
};

// Hiebstil für Held und Mitspieler: Zweihänder, Skinset-Sichel, Schurke violett, sonst Feuerhieb
export function heroSlashStyle({ great = false, own = null, rogue = false }, heavy) {
  if (great) return heavy ? SLASH_STYLES.greatHeavy : SLASH_STYLES.great;
  if (own) return SLASH_STYLES[heavy ? own + 'Heavy' : own];
  if (rogue) return heavy ? SLASH_STYLES.rogueHeavy : SLASH_STYLES.rogue;
  return heavy ? SLASH_STYLES.heroHeavy : SLASH_STYLES.hero;
}

// Enemy-Hiebe in kalter, fahler Farbe – visuell klar vom Helden getrennt.
export function getEnemySlashFrame(angle, frame, res = fineRes()) {
  let di = Math.round((angle / TAU) * DIRS) % DIRS;
  if (di < 0) di += DIRS;
  const key = `enemyc|${di}|${frame}|${res}`;
  let c = cache.get(key);
  if (!c) {
    c = buildSlashFrame(SLASH_STYLES.enemy, di, frame, false, res);
    const ctx = c.canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      if (!img.data[i + 3]) continue;
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 765;
      const idx = Math.max(0, Math.min(5, Math.round((1 - lum) * 5)));
      const col = COLD[idx];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
    }
    ctx.putImageData(img, 0, 0);
    cache.set(key, c);
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

// Gegnerpfeil 9 × 3 Weltpixel (Spitze rechts). res 2: Schaft mit Lichtkante oben, Stahlspitze mit Glanzpunkt,
// zweifarbige Federn (entities/Projectile.js Arrow zeichnet ihn gedreht in Weltgröße).
export function createArrowSprite(res = 1) {
  const c = makeCanvas(9 * res, 3 * res);
  const ctx = c.getContext('2d');
  if (res === 1) {
    ctx.fillStyle = PAL.leather[3]; ctx.fillRect(1, 1, 6, 1);
    ctx.fillStyle = PAL.steel[4]; ctx.fillRect(7, 1, 2, 1); ctx.fillRect(7, 0, 1, 3);
    ctx.fillStyle = PAL.crimson[3]; ctx.fillRect(0, 0, 2, 1); ctx.fillRect(0, 2, 2, 1);
    return c;
  }
  const S = res / 2;   // Raster unten in Feinpixeln (18 × 6), bei res 2 genau 1 Texel
  const r = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * S, y * S, w * S, h * S); };
  r(0, 0, 4, 1, PAL.crimson[4]); r(1, 1, 4, 1, PAL.crimson[3]); r(1, 4, 4, 1, PAL.crimson[2]); r(0, 5, 4, 1, PAL.crimson[1]);
  r(2, 2, 12, 1, '#8a6446'); r(2, 3, 12, 1, PAL.leather[2]);
  r(5, 2, 1, 2, PAL.leather[1]);   // Wicklung hinter den Federn
  r(14, 0, 1, 1, PAL.steel[3]); r(14, 1, 2, 1, PAL.steel[4]); r(14, 2, 3, 1, PAL.steel[5]); r(14, 3, 3, 1, PAL.steel[3]);
  r(14, 4, 2, 1, PAL.steel[2]); r(14, 5, 1, 1, PAL.steel[1]); r(17, 2, 1, 1, '#ffffff'); r(17, 3, 1, 1, PAL.steel[4]);
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
    const on = new Uint8Array(121);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const px = x + 0.5 - 5.5, py = (y + 0.5 - 5.5) * 2; // Boden-Perspektive: y gestaucht
      const u = px * ca + py * sa, v = -px * sa + py * ca;
      const chev = Math.abs(u + Math.abs(v) * 0.9 - 1) < 1.1 && Math.abs(v) < 4.2 && u > -4;
      if (!chev) continue;
      on[y * 11 + x] = 1;
      ctx.fillStyle = Math.abs(v) < 1 ? '#fff0b0' : Math.abs(v) < 2.5 ? '#ffb640' : '#f07a1c';
      ctx.fillRect(x, y, 1, 1);
    }
    // Harte 1-px-Kontur in Dunkelorange (transparenter Grund, kein Schein)
    ctx.fillStyle = '#8a2c06';
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      if (on[y * 11 + x]) continue;
      if ((x > 0 && on[y * 11 + x - 1]) || (x < 10 && on[y * 11 + x + 1]) || (y > 0 && on[(y - 1) * 11 + x]) || (y < 10 && on[(y + 1) * 11 + x])) ctx.fillRect(x, y, 1, 1);
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

// Lichtkreis am Boden für legendäre Waffen (entities/Hero.js): Pixelring statt weichem Schein. Außen ein geschlossener
// Ring in der Mittelfarbe mit umlaufenden hellen Strichen (Kopf fast weiß), darüber kleine Flammenzungen, die am Ring
// aufsteigen; innen ein zweiter, gestrichelter Ring und ein geditherter dritter; dazu vier pulsierende Knoten.
// Hinter den Beinen bleibt der Ring offen (wird im Leuchtpass über die Figur gelegt). Gezeichnet mit 'lighter':
// harte Pixel, die den Boden in der Elementfarbe aufhellen. colors = Elementrampe hell → dunkel (gfx/Particles.js).
// Liefert { canvas, w, h } in Weltpixeln; RING_FRAMES Bilder, nahtlos umlaufend. Legendär soll sich klar von Episch
// (nur Kante und Funken an der Waffe) abheben – der Ring ist das sichtbarste Zeichen dafür.
export const RING_FRAMES = 12;
const ringCache = new Map();
export function getRarityRing(colors, res, frame, rx = 11, ry = 4.5) {
  const key = `${colors.join()}|${res}|${frame}|${rx}|${ry}`;
  let c = ringCache.get(key);
  if (c) return c;
  if (res === 1) { c = rarityRingCoarse(colors, frame, rx, ry); ringCache.set(key, c); return c; }   // „Niedrig“: Ring wie vor dem Feinraster
  const top = 3;   // Platz über dem Ring für die Flammenzungen (Weltpixel)
  const W = Math.round((2 * rx + 2) * res), H = Math.round((2 * ry + 2 + 2 * top) * res);   // oben und unten gleich viel Rand: Hero.js zentriert das Bild am Fußpunkt
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const cx = W / 2, cy = H / 2;
  const inside = (x, y, a, b) => (((x + 0.5 - cx) / (a * res)) ** 2 + ((y + 0.5 - cy) / (b * res)) ** 2) <= 1;
  const edge = (x, y, a, b) => inside(x, y, a, b) && (!inside(x - 1, y, a, b) || !inside(x + 1, y, a, b) || !inside(x, y - 1, a, b) || !inside(x, y + 1, a, b));
  const rgb = colors.map(hexToRgb);
  const put = (x, y, col) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const DASH = 8, phase = frame / RING_FRAMES;
  const pulse = 0.5 + 0.5 * Math.cos((frame / RING_FRAMES) * TAU * 2);
  const open = (wx, wy) => wy < 0 && Math.abs(wx) < 6;   // hinter den Beinen offen
  const tongues = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = (x + 0.5 - cx) / res, wy = (y + 0.5 - cy) / res;
      if (open(wx, wy)) continue;
      const a = (Math.atan2(wy / ry, wx / rx) / TAU + 1) % 1;
      if (edge(x, y, rx, ry)) {
        const u = (a * DASH + phase) % 1;
        put(x, y, rgb[u > 0.82 ? 0 : u > 0.62 ? 1 : 2]);
        if (u > 0.82 && wy > -1 && (x + frame) % 3 === 0) tongues.push([x, y, u]);
        continue;
      }
      if (edge(x, y, rx - 2, ry - 1)) { const u = (a * DASH - phase * 2 + 0.5) % 1; if (u < 0.55) put(x, y, rgb[u < 0.15 ? 2 : 3]); continue; }
      if (res > 1 && edge(x, y, rx - 4, ry - 2) && (x + y) % 2 === 0) put(x, y, rgb[4]);
    }
  }
  // Flammenzungen: am Kopf jedes hellen Strichs steigt eine kurze Zunge auf (2–3 Feinpixel, oben dunkler)
  for (const [x, y, u] of tongues) {
    const n = res > 1 ? (u > 0.92 ? 3 : 2) : 1;
    for (let k = 1; k <= n; k++) put(x, y - k, rgb[Math.min(4, k)]);
  }
  // Knoten auf den Diagonalen: heller Kern, Kreuz in der Mittelfarbe (atmet in zwei Stufen)
  for (let k = 0; k < 4; k++) {
    const ang = ((k + 0.5) / 4) * TAU;
    const nx = Math.round(cx + Math.cos(ang) * rx * res - 0.5), ny = Math.round(cy + Math.sin(ang) * ry * res - 0.5);
    if (Math.sin(ang) < 0 && Math.abs(Math.cos(ang) * rx) < 6) continue;
    put(nx, ny, rgb[pulse > 0.5 ? 0 : 1]);
    if (pulse > 0.25) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(nx + ex, ny + ey, rgb[2]);
  }
  ctx.putImageData(img, 0, 0);
  c = { canvas, w: W / res, h: H / res };
  ringCache.set(key, c);
  return c;
}

// „Niedrig“ (res 1): der Ring vor dem Feinraster, unverändert (gestrichelter Außenring, gedünnter Innenring, Knoten)
function rarityRingCoarse(colors, frame, rx, ry) {
  const W = 2 * rx + 2, H = Math.round(2 * ry + 2);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const cx = W / 2, cy = H / 2;
  const inside = (x, y, a, b) => (((x + 0.5 - cx) / a) ** 2 + ((y + 0.5 - cy) / b) ** 2) <= 1;
  const edge = (x, y, a, b) => inside(x, y, a, b) && (!inside(x - 1, y, a, b) || !inside(x + 1, y, a, b) || !inside(x, y - 1, a, b) || !inside(x, y + 1, a, b));
  const rgb = colors.map(hexToRgb);
  const put = (x, y, col) => { const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  const DASH = 12, phase = frame / RING_FRAMES;
  const pulse = 0.5 + 0.5 * Math.cos((frame / RING_FRAMES) * TAU * 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x + 0.5 - cx, wy = y + 0.5 - cy;
      if (wy < 0 && Math.abs(wx) < 6) continue;   // hinter den Beinen offen
      const a = (Math.atan2(wy / ry, wx / rx) / TAU + 1) % 1;
      if (edge(x, y, rx, ry)) {
        const u = (a * DASH + phase) % 1;
        if (u < 0.62) put(x, y, rgb[u > 0.45 ? 3 : 4]);
        continue;
      }
      if (edge(x, y, rx - 2, ry - 1) && (x + y) % 2 === 0) put(x, y, rgb[4]);
    }
  }
  for (let k = 0; k < 4; k++) {
    const ang = ((k + 0.5) / 4) * TAU;
    const nx = Math.round(cx + Math.cos(ang) * rx - 0.5), ny = Math.round(cy + Math.sin(ang) * ry - 0.5);
    if (Math.sin(ang) < 0 && Math.abs(Math.cos(ang) * rx) < 6) continue;
    put(nx, ny, rgb[pulse > 0.5 ? 2 : 3]);
    if (pulse > 0.25) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (nx + ex >= 0 && nx + ex < W && ny + ey >= 0 && ny + ey < H) put(nx + ex, ny + ey, rgb[3]);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, w: W, h: H };
}
