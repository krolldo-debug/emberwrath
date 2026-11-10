import { createMalgarethSprites } from '../sprites/ash_sovereign.js';
import { getHeroSprites } from '../sprites/hero.js';
import { createUlgrimSprites } from '../sprites/barrow_king.js';
import { createKaldrisSprites, createYsmeineSprites } from '../sprites/star_bosses.js';
import { logoCanvas } from '../gfx/Logo.js';

// Intro-Film „Die Stimme im Thron“: Malgareth spricht zum neuen Helden. Kein Gameplay, nur die Geschichte.
// Bild 1280 × 544 im Feinraster (Kinoformat 2,35:1). Hintergründe sind Szenenpixel (640 breit, ×2 gezeichnet,
// erzeugt mit tools/intro/szenen.py), die Figuren kommen aus dem Spiel: Malgareth (Ruhe- und Erwach-Animation des
// Bosses), die fünf Könige als Schattenrisse, am Ende der eigene Held des Spielers.
// Zeiten in Sekunden. Die Tonspur (Stimme, Musik, Geräusche) ist je Sprache fertig gemischt (tools/intro/ton.mjs);
// ihre Sprechzeiten stehen im Block TIMING (vom Werkzeug geschrieben).
//
// Einstellungen: 1 Funke im Dunkel · 2 Halle weit · 3 Aufwärts zur Krone · 4 Krone ganz nah · 5 Erinnerung: Sturm der
// Könige, nah an der Treppe, der Bann · 6 Das Siegel bricht · 7 Malgareth erwacht · 8 Die Glutsenke, der Held · 9 Schriftzug
const W = 1280, H = 544, Q = 2;

// Sprechtexte: Schlüssel = deutscher Text (Übersetzung über die Wörterbücher, src/i18n)
const WHO = 'Malgareth';
const LINES = [
  { t: 4.6, text: 'Man nennt mich ein Ungeheuer.' },
  { t: 8.4, text: 'Dabei wollte ich nur, was jeder will.' },
  { t: 14.6, text: 'Nicht sterben.' },
  { t: 18.8, text: 'Fünf Könige kamen mit Stahl und Schwüren.' },
  { t: 25.1, text: 'Töten konnten sie mich nicht. Also sperrten sie mich ein.' },
  { t: 32.0, text: 'Tausend Jahre lang hielt der Stein.' },
  { t: 39.4, text: 'Ich bin nicht zornig.' },
  { t: 45.4, text: 'Nur geduldig.' },
  { t: 50.5, text: 'Und du, Wanderer …' },
  { t: 53.7, text: 'Komm zu mir. Ich warte.' },
];
// <ton.mjs> – von tools/intro/ton.py geschrieben, nicht von Hand ändern
const TIMING = {"de": [2.88, 4.55, 1.54, 5.69, 6.74, 4.21, 1.95, 1.52, 2.68, 3.14], "en": [1.87, 4.56, 1.38, 3.96, 4.46, 4.31, 1.8, 1.62, 1.83, 3.16], "es": [2.25, 4.12, 1.15, 6.09, 5.68, 5.45, 2.09, 1.56, 2.25, 2.87], "fr": [1.75, 5.25, 1.99, 4.25, 5.36, 4.12, 2.17, 1.83, 2.46, 2.37]};
// </ton.mjs>

const SHOTS = [
  { t0: 0, t1: 4.0, draw: shotSpark },
  { t0: 4.0, t1: 9.0, draw: shotHall },
  { t0: 9.0, t1: 14.0, draw: shotRise },
  { t0: 14.0, t1: 18.4, draw: shotCrown },
  { t0: 18.4, t1: 22.4, draw: shotMemoryRun },
  { t0: 22.4, t1: 25.1, draw: shotMemoryClose },
  { t0: 25.1, t1: 31.8, draw: shotMemoryBind },
  { t0: 31.8, t1: 39.0, draw: shotSeal },
  { t0: 39.0, t1: 49.8, draw: shotAwaken },
  { t0: 49.8, t1: 53.6, draw: shotHollowWide },
  { t0: 53.6, t1: 57.6, draw: shotHollowClose },
  { t0: 57.6, t1: 62.0, draw: shotTitle },
];

const IMAGES = ['halle-0', 'halle-1', 'halle-2', 'nah-ruhe', 'nah-wach', 'erinnerung', 'glutsenke',
  'siegel-0', 'siegel-1', 'siegel-2', 'siegel-3', 'siegel-4', 'siegel-5', 'siegel-6', 'siegel-7'];

export const FILM = {
  width: W, height: H, duration: 62.0,
  audio: (lang) => `ton-${lang}.mp3`,
  // Untertitel je Sprache: Beginn fest, Dauer aus der Tonspur (sonst nach Textlänge geschätzt)
  timing(lang) {
    const d = TIMING[lang] ?? TIMING.de ?? [];
    return LINES.map((l, i) => ({ who: WHO, text: l.text, t0: l.t - 0.1, t1: l.t + (d[i] ?? 0.9 + l.text.length * 0.065) + 0.35 }));
  },
  async load(base, session) {
    const img = (n) => new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok([n, i]); i.onerror = () => bad(new Error(`Intro-Bild fehlt: ${n}`));
      i.src = new URL(`${n}.webp`, base).href;
    });
    const images = Object.fromEntries(await Promise.all(IMAGES.map(img)));
    // Figuren nach den Bildern bauen (kurz, aber spürbar): ein Bild Luft, damit der Funke schon fällt
    await new Promise((ok) => setTimeout(ok, 0));
    return { images, ...figures(session) };
  },
  // Alles sofort fertig bauen (Werkzeuge, Standbilder)
  prepareAll(A) { while (A.pending?.length) work(A); },
  draw(g, t, A) {
    work(A);
    const shot = SHOTS.find((s) => t < s.t1) ?? SHOTS[SHOTS.length - 1];
    g.save();
    shot.draw(g, t - shot.t0, shot.t1 - shot.t0, A, t);
    g.restore();
  },
};

// ------------------------------------------------------------------------------------------------ Figuren vorbereiten
// Sofort (vor dem ersten Bild): Malgareth schlafend. Der Rest entsteht Stück für Stück, während Funke und Halle laufen
// (je Bild ein paar Frames, damit nichts ruckelt); was noch fehlt, wird bis dahin einfach ausgelassen.
const lightMalg = (f) => bands(f, [[0.3, 0.86], [0.5, 0.7], [0.7, 0.52], [0.86, 0.4]], '#c8460e');
function figures(session) {
  const M = createMalgarethSprites();
  const A = { malg: { dormant: [...M.dormant.frames].map(lightMalg), awaken: [], shadow: null }, kings: [], hero: [], heroFps: 4, logo: logoCanvas() };
  const jobs = [];
  jobs.push(() => { A.malg.shadow = shadowOf(M.dormant.frames[0], '#0c0206', '#ffa040', '#b0300c'); });
  jobs.push(() => { A.malg.stone = shadowOf(M.dormant.frames[0], '#2a1416', '#ffe0a0', '#8a4a3a'); });
  for (let i = 0; i < M.awaken.frames.length; i++) jobs.push(() => { A.malg.awaken[i] = lightMalg(M.awaken.frames[i]); });
  // Der eigene Held (wie er gerade aussieht); fehlt er, ein Krieger
  const own = session?.world?.hero?.animator?.anims?.idle ?? getHeroSprites('human', 'warrior', 0).idle;
  A.heroFps = own.fps ?? 4;
  for (let i = 0; i < own.frames.length; i++) jobs.push(() => { A.hero[i] = rimLeft(bands(own.frames[i], [[0.0, 0.78], [0.6, 0.62]], '#7a2a10', 0.12), '#f07a1c'); });
  // Die Könige des Bundes als Schattenrisse: Ulgrim, Aurel (Gestalt des Kaldris), Ysmeine; dahinter zwei weitere
  const KINGS = [
    { make: createUlgrimSprites, row: 0, x0: -60, x1: 262 },
    { make: createKaldrisSprites, row: 0, x0: -150, x1: 340 },
    { make: createYsmeineSprites, row: 0, x0: -250, x1: 412 },
    { make: createKaldrisSprites, row: 1, x0: -110, x1: 300 },
    { make: createUlgrimSprites, row: 1, x0: -200, x1: 376 },
  ];
  const made = new Map();
  KINGS.forEach((k, i) => {
    const K = { ...k, walk: [], idle: null };
    A.kings.push(K);
    const cols = k.row ? ['#0a0206', '#b0300c', '#5a1408'] : ['#14040a', '#ffa040', '#b0300c'];
    jobs.push(() => { if (!made.has(k.make)) made.set(k.make, k.make()); });
    jobs.push(() => { const S = made.get(k.make); K.idle = shadowOf(S.idle.frames[0], ...cols); });
    jobs.push(() => {
      const S = made.get(k.make), wk = S.walk ?? S.idle, tmp = [];
      const n = Math.min(10, wk.frames.length);
      jobs.splice(0, 0, ...Array.from({ length: n }, (_, j) => () => { tmp[j] = shadowOf(wk.frames[j], ...cols); }), () => { K.walk = tmp; });
    });
  });
  A.pending = jobs;
  return A;
}

// Ein Stück Vorbereitung je Aufruf (aus draw), höchstens ~6 ms
function work(A) {
  const jobs = A.pending;
  if (!jobs?.length) return;
  const end = performance.now() + 6;
  while (jobs.length && performance.now() < end) {
    try { jobs.shift()(); } catch (err) { console.error('Intro-Figur', err); }
  }
}

// Frame -> { c (Canvas), ax, ay, res }
const pack = (f, c) => ({ c, ax: f.ax, ay: f.ay, res: f.res ?? 1 });
function canvasOf(f) {
  const c = document.createElement('canvas');
  c.width = f.canvas.width; c.height = f.canvas.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(f.canvas, 0, 0);
  return [c, x];
}
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Stufiges Abdunkeln nach unten (bands: [Anteil der Höhe, Faktor]), Übergänge gerastert; warm = Farbe des Bodenlichts
function bands(f, list, warm, warmK = 0.18) {
  const [c, x] = canvasOf(f);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data, w = c.width, h = c.height;
  const wc = rgb(warm);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = (y * w + xx) * 4;
    if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const b = BAY[(y & 3) * 4 + (xx & 3)];
    let k = 1, warmOn = false;
    for (const [at, fk] of list) if (y / h + (b - 0.5) * 0.04 > at) k = fk;
    if (y / h + (b - 0.5) * 0.04 > 0.9) warmOn = true;
    for (let ch = 0; ch < 3; ch++) {
      let v = d[i + ch] * k;
      if (warmOn) v = v * (1 - warmK) + wc[ch] * warmK;
      d[i + ch] = Math.min(255, Math.round(v));
    }
  }
  x.putImageData(id, 0, 0);
  return pack(f, c);
}

// Schattenriss: Fläche base, Kante zur Lichtseite (rechts oben) rim, zweite Kante rim2 gerastert
function shadowOf(f, base, rim, rim2) {
  const [c, x] = canvasOf(f);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data, w = c.width, h = c.height;
  const on = (xx, y) => xx >= 0 && y >= 0 && xx < w && y < h && d[(y * w + xx) * 4 + 3] >= 128;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) mask[y * w + xx] = on(xx, y) ? 1 : 0;
  const A = rgb(base), R = rgb(rim), R2 = rgb(rim2);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = (y * w + xx) * 4, m = mask[y * w + xx];
    if (!m) { d[i + 3] = 0; continue; }
    const at = (a, b) => a >= 0 && b >= 0 && a < w && b < h && mask[b * w + a];
    let col = A;
    if (!at(xx + 1, y) || !at(xx, y - 1)) col = R;
    else if ((!at(xx + 2, y) || !at(xx + 1, y - 1)) && BAY[(y & 3) * 4 + (xx & 3)] < 0.6) col = R2;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return pack(f, c);
}

// Glutkante links (Licht vom Aschegrat): Kantenpixel zur linken Seite in Glutfarbe
function rimLeft(p, col) {
  const c = p.c, x = c.getContext('2d', { willReadFrequently: true }), w = c.width, h = c.height;
  const id = x.getImageData(0, 0, w, h), d = id.data, R = rgb(col);
  const on = (a, b) => a >= 0 && a < w && b >= 0 && b < h && d[(b * w + a) * 4 + 3] >= 128;
  const edge = [];
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (on(xx, y) && !on(xx - 1, y)) edge.push((y * w + xx) * 4);
  for (const i of edge) { d[i] = R[0]; d[i + 1] = R[1]; d[i + 2] = R[2]; }
  x.putImageData(id, 0, 0);
  return p;
}

// ------------------------------------------------------------------------------------------------ Zeichenhilfen
const hash = (i, s = 0) => { let n = (i * 374761393 + s * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const step = (v, n) => Math.floor(v * n) / n;

function black(g) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
// Hintergrund in Szenenpixeln, Ausschnitt ab (sx, sy) Szenenpixeln, ×2
function bg(g, img, sx = 0, sy = 0) {
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round(sx), Math.round(sy), W / Q, H / Q, 0, 0, W, H);
}
// Figur (pack) mit Fußpunkt (x, y) in Feinpixeln, k = Feinpixel je Texel bei res 2
function fig(g, p, x, y, k = 1, flip = false) {
  const s = (k * 2) / p.res;
  const ax = flip ? p.c.width - p.ax : p.ax;
  const dx = Math.round(x - ax * s), dy = Math.round(y - p.ay * s);
  g.imageSmoothingEnabled = false;
  if (flip) { g.save(); g.translate(dx + p.c.width * s, dy); g.scale(-1, 1); g.drawImage(p.c, 0, 0, p.c.width * s, p.c.height * s); g.restore(); } else g.drawImage(p.c, dx, dy, p.c.width * s, p.c.height * s);
}
// Fläche in harten Deckstufen (kein weicher Übergang): k 0..1 → 0, ¼, ½, ¾, 1
function veil(g, col, k) {
  const a = step(Math.max(0, Math.min(1, k)), 4);
  if (a <= 0) return;
  g.fillStyle = col; g.globalAlpha = a; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
}
// Glutflocken/Asche: zustandslos aus der Zeit berechnet (Sprünge und Ruckler egal). dir -1 steigt, +1 fällt
function motes(g, t, n, seed, cols, { dir = -1, speed = 18, drift = 6, size = 2, y0 = 0, y1 = H, x0 = 0, x1 = W } = {}) {
  for (let i = 0; i < n; i++) {
    const sp = speed * (0.5 + hash(i, seed + 1));
    const span = y1 - y0;
    let y = (hash(i, seed + 2) * span + dir * sp * t) % span; if (y < 0) y += span;
    const x = x0 + ((hash(i, seed) * (x1 - x0) + Math.sin(t * 0.7 + i) * drift + t * drift * 0.4) % (x1 - x0) + (x1 - x0)) % (x1 - x0);
    const tw = hash(i + Math.floor(t * 6), seed + 3);
    g.fillStyle = cols[Math.floor(hash(i, seed + 4) * cols.length)];
    if (tw < 0.08) continue;
    g.fillRect(Math.round(x / size) * size, Math.round((y0 + y) / size) * size, size, size);
  }
}
// Erschütterung: ganze Feinpixel, klingt ab
function shake(g, t, at, dur, amp) {
  const k = t - at;
  if (k < 0 || k > dur) return;
  const a = Math.round(amp * (1 - k / dur));
  g.translate(Math.round((hash(Math.floor(t * 40), 7) - 0.5) * 2 * a), Math.round((hash(Math.floor(t * 40), 8) - 0.5) * 2 * a));
}
const flash = (g, t, at, dur, col = '#fff6e0') => { const k = t - at; if (k >= 0 && k < dur) veil(g, col, 1 - k / dur); };

// Kamera: z = Vergrößerung (1: Szenenpixel ×2, 2: ×4), (x0, y0) = linke obere Ecke in Szenenpixeln. Hintergrund und
// Figuren skalieren gemeinsam, so bleibt ein Texel der Figur so groß wie ein Pixel des Hintergrunds.
const cam = (z, x0, y0) => ({ z, x0: Math.round(x0), y0: Math.round(y0) });
function view(g, img, c) {
  const s = Q * c.z;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, c.x0, c.y0, W / s, H / s, 0, 0, W, H);
}
const put = (g, p, c, x, y, k = 1, flip = false) => { if (p) fig(g, p, (x - c.x0) * Q * c.z, (y - c.y0) * Q * c.z, k * c.z, flip); };
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const dormantAt = (A, t) => A.malg.dormant[Math.floor(t * 3) % A.malg.dormant.length];
const flicker = (t) => [0, 1, 2, 1, 2, 2, 1, 0, 1, 2][Math.floor(hash(Math.floor(t * 7), 11) * 10)];

// ------------------------------------------------------------------------------------------------ Einstellungen
// 1 – Ein einzelner Funke fällt durch die Schwärze und landet auf dem Siegel.
function shotSpark(g, t) {
  black(g);
  const land = 3.5, x = 640, yEnd = 452;
  if (t < land) {
    const k = t / land, y = 40 + (yEnd - 40) * k * k;
    const sx = Math.round(x + Math.sin(t * 2.2) * 14) & ~1, sy = Math.round(y) & ~1;
    g.fillStyle = '#3a1410'; g.fillRect(sx - 8, sy - 8, 16, 16);
    g.fillStyle = '#7a2a0e'; g.fillRect(sx - 6, sy - 6, 12, 12);
    for (let i = 1; i < 7; i++) { g.fillStyle = ['#fff0b0', '#ffb640', '#f07a1c', '#c8460e', '#7a2a0e', '#3a1410', '#2a100e'][i]; g.fillRect(sx - 2, sy - 4 - i * 8, 4, 6); }
    g.fillStyle = '#ffb640'; g.fillRect(sx - 4, sy - 4, 8, 8);
    g.fillStyle = '#fff0b0'; g.fillRect(sx - 2, sy - 2, 4, 4);
  } else {
    const k = (t - land) / (4 - land);
    const r = Math.round(8 + k * 60);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, d = r * (0.6 + hash(i, 3) * 0.6);
      g.fillStyle = i % 3 ? '#f07a1c' : '#ffd070';
      g.fillRect(Math.round(x + Math.cos(a) * d) & ~1, Math.round(yEnd + Math.sin(a) * d * 0.25) & ~1, 2, 2);
    }
    g.fillStyle = '#ffb640'; g.fillRect(x - 6, yEnd - 2, 12, 4);
    g.fillStyle = '#c8460e'; g.fillRect(x - 40, yEnd, 80, 2);
  }
}

// 2 – Die Halle weit: Malgareth schläft im Siegel, Ketten, die Krone flackert. Langsamer Schwenk.
function shotHall(g, t, dur, A) {
  const c = cam(1, 80 - ease(t / dur) * 50, 0);
  view(g, A.images[`halle-${flicker(t)}`], c);
  put(g, dormantAt(A, t), c, 360, 226, 1);
  motes(g, t, 26, 3, ['#7a2a10', '#c8460e', '#3a1a14'], { speed: 10, drift: 8, size: 2 });
  flash(g, t, 0, 0.35, '#ffd070');
}

// 3 – Näher: die Kamera hebt sich am Schlafenden empor bis zur Krone.
function shotRise(g, t, dur, A) {
  const c = cam(1, 80, 88 - ease(t / dur) * 48);
  view(g, A.images['nah-ruhe'], c);
  put(g, dormantAt(A, t), c, 400, 384, 2);
  motes(g, t, 30, 5, ['#c8460e', '#ffb640', '#7a2a10'], { speed: 14, drift: 10, size: 2, x0: 400, x1: 1000 });
}

// 4 – Ganz nah an der Krone: „Nicht sterben.“
function shotCrown(g, t, dur, A) {
  const c = cam(2, 240, 140 - ease(t / dur) * 6);
  view(g, A.images['nah-ruhe'], c);
  put(g, dormantAt(A, t), c, 400, 384, 2);
  motes(g, t, 36, 5, ['#c8460e', '#ffb640', '#fff0b0', '#7a2a10'], { speed: 22, drift: 14, size: 4 });
}

// 5 – Erinnerung im Feuer: die Könige des Bundes stürmen den Aschethron (Kamera folgt), nah an der Treppe,
// dann schließt sich das Siegel um Malgareth und er erstarrt zu Stein.
const RUN = 4.0, BIND = 6.7;   // Sekunden ab Beginn: Lauf bis zur Treppe, Bann ab „Töten konnten sie mich nicht …“
function kingsAt(g, A, c, t) {
  const order = A.kings.map((k, i) => i).sort((a, b) => A.kings[b].row - A.kings[a].row);
  for (const i of order) {
    const k = A.kings[i];
    const x = k.x0 + (k.x1 - k.x0) * (1 - (1 - Math.min(t, RUN) / RUN) ** 1.5);
    const y = (k.row ? 236 : 268) + (t < RUN ? -Math.round(Math.abs(Math.sin(t * 9 + i))) : 0);
    const p = t < RUN && k.walk.length ? k.walk[Math.floor(t * 9 + i * 3) % k.walk.length] : k.idle;
    put(g, p, c, x, y, 1);
  }
}
function throneShadow(g, A, c, t) {
  const stone = t > BIND + 2.6;
  const p = stone ? A.malg.stone : A.malg.shadow;
  put(g, p ?? A.malg.shadow, c, 470, 120, 1);
}
function shotMemoryRun(g, t, dur, A) {
  const c = cam(1, ease(t / dur) * 120, 0);
  view(g, A.images.erinnerung, c);
  throneShadow(g, A, c, t);
  kingsAt(g, A, c, t);
  motes(g, t, 40, 9, ['#e05a14', '#ffa040', '#7a1a0a'], { speed: 24, drift: 14, size: 2 });
  if (t < 0.25) veil(g, '#ffe0a0', 1 - t / 0.25);
}
function shotMemoryClose(g, t, dur, A) {
  const T = t + 4.0;
  const c = cam(2, 300 + ease(t / dur) * 10, 112 - ease(t / dur) * 108);   // von den Kronen der Könige hinauf zu ihm
  view(g, A.images.erinnerung, c);
  throneShadow(g, A, c, T);
  kingsAt(g, A, c, T);
  motes(g, t, 30, 10, ['#e05a14', '#ffa040'], { speed: 30, drift: 14, size: 4 });
}
function shotMemoryBind(g, t, dur, A) {
  const T = t + BIND, c = cam(1, 120, 0);
  shake(g, t, 2.4, 0.6, 6);
  view(g, A.images.erinnerung, c);
  throneShadow(g, A, c, T);
  kingsAt(g, A, c, T);
  // Runenring um den Thron entsteht Zeichen für Zeichen
  const k = Math.min(1, t / 2.4), n = 28, on = Math.floor(n * k);
  for (let i = 0; i < on; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const x = (470 - c.x0 + Math.cos(a) * 92) * Q, y = (126 + Math.sin(a) * 14) * Q;
    g.fillStyle = i === on - 1 ? '#fff0b0' : '#ffa040';
    g.fillRect(Math.round(x) & ~1, Math.round(y) & ~1, 4, 4);
  }
  flash(g, t, 2.4, 0.3, '#ffe0a0');
  motes(g, t, 40, 9, ['#e05a14', '#ffa040', '#7a1a0a'], { speed: 24, drift: 14, size: 2 });
  flash(g, t, dur - 0.5, 0.5, '#ffe0a0');
}

// 6 – Das Siegel von oben: die Runen erlöschen, Risse laufen durch den Stein, dann bricht Licht hervor.
function shotSeal(g, t, dur, A) {
  const brk = 6.1;   // nach der Zeile „Tausend Jahre lang hielt der Stein.“
  shake(g, t, brk, 1.1, 10);
  const f = t < brk ? Math.min(5, Math.floor((t / brk) * 6)) : t < brk + 0.5 ? 6 : 7;
  bg(g, A.images[`siegel-${f}`], 0, 0);
  motes(g, t, 30, 13, ['#7a2a10', '#c8460e'], { speed: 12, drift: 6, size: 2 });
  flash(g, t, brk, 0.25, '#ffd070');
  flash(g, t, dur - 0.6, 0.6, '#fff6e0');
}

// 7 – Malgareth erwacht: die Augen glühen auf, er hebt den Kopf, zieht das Schwert. Beim Schrei ein Schnitt ganz nah
// ans Gesicht, dann wieder halbnah: er zeigt mit dem Schwert auf den Helden.
function shotAwaken(g, t, dur, A) {
  const start = 3.2, fps = 9;   // Erwachen nach „Ich bin nicht zornig.“
  const i = Math.floor((t - start) * fps);
  const awake = i >= 2, roar = start + 10 / fps;
  const close = t >= roar && t < roar + 1.3;
  shake(g, t, roar, 1.2, close ? 12 : 8);
  const c = close ? cam(2, 236, 132) : cam(1, 80, 88 - ease((t - roar - 1.3) / 5) * 16);
  view(g, A.images[awake ? 'nah-wach' : 'nah-ruhe'], c);
  const fr = t < start || !A.malg.awaken.length ? dormantAt(A, t) : A.malg.awaken[Math.min(A.malg.awaken.length - 1, i)] ?? A.malg.awaken[A.malg.awaken.length - 1];
  put(g, fr, c, 400, 384, 2);
  motes(g, t, awake ? 70 : 24, 17, awake ? ['#f07a1c', '#ffb640', '#c8460e', '#fff0b0'] : ['#7a2a10', '#c8460e'], { speed: awake ? 40 : 10, drift: 12, size: close ? 4 : 2 });
  flash(g, t, start + 2 / fps, 0.3, '#ffb640');
  flash(g, t, roar, 0.4, '#fff0c0');
  if (t > dur - 0.12) veil(g, '#000', 1);
}

// 8 – Harter Schnitt: die Glutsenke bei Nacht, Asche fällt. Der eigene Held auf der Anhöhe, dann nah: er schaut
// zum glühenden Aschegrat.
const HERO_X = 390, HERO_Y = 188;
function ashfall(g, t, size) { motes(g, t, 90, 21, ['#5a4a48', '#7a6a66', '#3a302e', '#c8763a'], { dir: 1, speed: 16, drift: 18, size }); }
function shotHollowWide(g, t, dur, A) {
  const c = cam(1, 80 - ease(t / dur) * 40, 0);
  view(g, A.images.glutsenke, c);
  put(g, A.hero[Math.floor(t * A.heroFps) % Math.max(1, A.hero.length)], c, HERO_X, HERO_Y, 2, true);
  ashfall(g, t, 2);
  if (Math.sin(t * 2.4) > 0.6) { g.fillStyle = '#f07a1c'; g.fillRect((170 - c.x0) * Q - 8, 62 * Q, 16, 6); }
}
function shotHollowClose(g, t, dur, A) {
  const c = cam(2, HERO_X - 200 + ease(t / dur) * 6, HERO_Y - 118);
  view(g, A.images.glutsenke, c);
  put(g, A.hero[Math.floor((t + 3.8) * A.heroFps) % Math.max(1, A.hero.length)], c, HERO_X, HERO_Y, 2, true);
  ashfall(g, t + 3.8, 4);
  if (t > dur - 1.4) veil(g, '#7a1a0a', ((t - (dur - 1.4)) / 1.4) * 0.5);
}

// 9 – Schriftzug EMBERWRATH, Glut steigt
function shotTitle(g, t, dur, A) {
  black(g);
  const L = A.logo, s = 6;
  const show = Math.min(1, t / 0.5);
  const w = L.width * s, h = L.height * s;
  g.imageSmoothingEnabled = false;
  g.globalAlpha = step(show, 4);
  g.drawImage(L, Math.round((W - w) / 2), Math.round((H - h) / 2 - 20), w, h);
  g.globalAlpha = 1;
  motes(g, t, 40, 23, ['#c8460e', '#f07a1c', '#ffb640'], { speed: 30, drift: 10, size: 2, y0: 150, y1: 420, x0: 260, x1: 1020 });
}
