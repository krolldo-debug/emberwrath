// Intro-Film „Die Stimme im Thron“: Malgareth spricht zum neuen Helden. Kein Gameplay, nur die Geschichte.
// Kinoformat 2,35:1. Die Szenen sind gemalte Standbilder (src/intro/media, Entstehung und Prompts in
// tools/intro/bilder.py); bewegt werden sie hier: Kamerafahrten, ziehender Rauch, Glut, Feuer,
// Blitze, ein kreisender Runenring, wachsende Risse, ein Vulkanausbruch. Personen nur von hinten oder klein im Bild:
// Standbilder von Gesichtern wirken tot.
// Zeiten in Sekunden. Die Tonspur (Stimme, Musik, Geräusche) ist je Sprache fertig gemischt (tools/intro/ton.py);
// ihre Sprechzeiten stehen im Block TIMING (vom Werkzeug geschrieben).
//
// Einstellungen: 1 Funke im Dunkel · 2 Die Zitadelle · 3 Der Thronsaal · 4 Der König auf dem Balkon · 5 Die fünf Könige ·
// 6 Vor dem Tor · 7 Die Lichtsäule (der Bann) · 8 Das Siegel bricht · 9 Die Halle nach tausend Jahren · 10 Der Ausbruch ·
// 11 Die Glutsenke · 12 Der Wanderer · 13 Titel
// Gerendert wird in kleiner Auflösung (600 × 256) und pixelgenau hochskaliert: so liegt alles – Bilder, Glut, Licht,
// Schrift – auf demselben festen Pixelraster wie das Spiel. Maße in Bildpunkten der Vorlagen (1792 breit) rechnet
// die Kamera um; feste Leinwandmaße (Glutgröße, Geschwindigkeiten, Erschütterung) sind für 1792 gedacht und mit K skaliert.
const W = 600, H = 256, K = W / 1792;

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

// Feste Punkte der Tonspur (tools/intro/ton.py): Funke landet, Siegel bricht, Ausbruch (Brüllen)
const LAND = 3.35, BREAK = 37.9, ROAR = 43.3;

const SHOTS = [
  { t0: 0, t1: 3.4, draw: shotSpark },
  { t0: 3.4, t1: 8.2, draw: shotCitadel },
  { t0: 8.2, t1: 14.0, draw: shotHall },
  { t0: 14.0, t1: 18.4, draw: shotBalcony },
  { t0: 18.4, t1: 22.4, draw: shotKings },
  { t0: 22.4, t1: 25.1, draw: shotGate },
  { t0: 25.1, t1: 31.8, draw: shotPillar },
  { t0: 31.8, t1: 39.0, draw: shotSeal },
  { t0: 39.0, t1: ROAR - 0.15, draw: shotDust },
  { t0: ROAR - 0.15, t1: 49.8, draw: shotEruption },
  { t0: 49.8, t1: 53.6, draw: shotHollow },
  { t0: 53.6, t1: 57.6, draw: shotWanderer },
  { t0: 57.6, t1: 62.0, draw: shotTitle },
];

const IMAGES = ['zitadelle', 'halle', 'balkon', 'koenige', 'tor', 'lichtsaeule', 'siegel', 'halle-staub', 'glutsenke', 'wanderer'];

export const FILM = {
  width: W, height: H, duration: 62.0,
  audio: (lang) => `ton-${lang}.mp3`,
  // Untertitel je Sprache: Beginn fest, Dauer aus der Tonspur (sonst nach Textlänge geschätzt)
  timing(lang) {
    const d = TIMING[lang] ?? TIMING.de ?? [];
    return LINES.map((l, i) => ({ who: WHO, text: l.text, t0: l.t - 0.1, t1: l.t + (d[i] ?? 0.9 + l.text.length * 0.065) + 0.35 }));
  },
  async load(base) {
    const img = (n) => new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok([n, i]); i.onerror = () => bad(new Error(`Intro-Bild fehlt: ${n}`));
      i.src = new URL(`${n}.webp`, base).href;
    });
    const images = Object.fromEntries(await Promise.all(IMAGES.map(img)));
    // Bilder vorab dekodieren, damit der erste Schnitt auf ein Bild nicht ruckelt
    await Promise.all(Object.values(images).map((i) => i.decode?.().catch(() => {})));
    return { images, font: await titleFont(), vignette: vignette(), cracks: crackPaths(), fog: fogTexture() };
  },
  prepareAll() {},
  draw(g, t, A) {
    const shot = SHOTS.find((s) => t < s.t1) ?? SHOTS[SHOTS.length - 1];
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    shot.draw(g, t - shot.t0, shot.t1 - shot.t0, A, t);
    g.restore();
    g.drawImage(A.vignette, 0, 0);
  },
};

// ------------------------------------------------------------------------------------------------ Zeichenhilfen
const hash = (i, s = 0) => { let n = (i * 374761393 + s * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
// Langsames Gleiten: fast linear, nur sanft an den Enden (wirkt wie eine Kamerafahrt, nicht wie ein Zoom-Effekt)
const glide = (k) => { k = clamp(k); return 0.15 * ease(k) + 0.85 * k; };

function black(g) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
function veil(g, col, a) {
  a = clamp(a);
  if (a <= 0) return;
  g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
}
const flash = (g, t, at, dur, col = '#fff4dc', peak = 1) => { const k = t - at; if (k >= 0 && k < dur) veil(g, col, peak * (1 - k / dur) ** 1.5); };

// Kamera über einem Standbild: Mittelpunkt (cx, cy) in Bildpixeln der Vorlage (1792 breit), z = Vergrößerung über „bildfüllend“.
// Der Ausschnitt bleibt immer im Bild. Gibt die Abbildung Bild → Leinwand zurück (für Lichter an Bildstellen).
function shot(g, img, a, b, k, sh = null) {
  const f = img.width / 1792;                                       // Bilder liegen kleiner vor als die Vorlagen
  const z = lerp(a.z, b.z, k);
  const s = Math.max(W / img.width, H / img.height) * z;
  const vw = W / s, vh = H / s;
  const cx = clamp(lerp(a.cx, b.cx, k) * f, vw / 2, img.width - vw / 2);
  const cy = clamp(lerp(a.cy, b.cy, k) * f, vh / 2, img.height - vh / 2);
  const x0 = cx - vw / 2 + (sh?.x ?? 0) / s, y0 = cy - vh / 2 + (sh?.y ?? 0) / s;
  g.drawImage(img, x0, y0, vw, vh, 0, 0, W, H);
  return { s: s * f, x0, y0, at: (x, y) => [(x * f - x0) * s, (y * f - y0) * s] };
}
// Erschütterung (klingt ab), als Versatz in Leinwandpixeln
function quake(t, at, dur, amp) {
  const k = t - at;
  if (k < 0 || k > dur) return null;
  const a = amp * K * (1 - k / dur) ** 2;
  return { x: (hash(Math.floor(t * 45), 7) - 0.5) * 2 * a, y: (hash(Math.floor(t * 45), 8) - 0.5) * 2 * a };
}
// Lichtschein (additiv) an einer Bildstelle
function glow(g, m, x, y, r, col, a) {
  if (a <= 0) return;
  const [px, py] = m.at(x, y), pr = r * m.s;
  const gr = g.createRadialGradient(px, py, 0, px, py, pr);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = clamp(a);
  g.fillStyle = gr; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
// Feuerflackern 0..1 (mehrere Frequenzen, je Lichtquelle eigener Takt)
const flick = (t, s = 0) => 0.62 + 0.2 * Math.sin(t * 9.1 + s * 2.3) + 0.12 * Math.sin(t * 23.7 + s * 5.1) + 0.06 * Math.sin(t * 41 + s);

// Glut: zustandslos aus der Zeit berechnet. Kleine harte Quadrate (Pixelstil), additiv, mit Tiefe (nah = größer, schneller)
function embers(g, t, n, seed, { rise = 60, drift = 30, x0 = 0, x1 = W, y0 = 0, y1 = H, big = 1, warm = 1, dir = -1 } = {}) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const depth = 0.35 + hash(i, seed) * 0.65;
    const sz = Math.max(1, Math.round((2 + depth * 4) * big * K * 1.2));
    const sp = rise * K * (0.5 + depth);
    const span = y1 - y0 + 40 * K;
    let y = (hash(i, seed + 2) * span + dir * sp * t) % span; if (y < 0) y += span;
    const xw = x1 - x0;
    const x = x0 + (((hash(i, seed + 3) * xw + Math.sin(t * (0.6 + depth) + i) * drift * K * depth + t * drift * K * 0.5 * depth) % xw) + xw) % xw;
    const life = 0.5 + 0.5 * Math.sin(t * (2 + hash(i, seed + 4) * 3) + i * 7);
    g.globalAlpha = clamp(life * (0.35 + depth * 0.65));
    g.fillStyle = warm ? (hash(i, seed + 5) < 0.3 ? '#ffd27a' : hash(i, seed + 5) < 0.7 ? '#ff8a2a' : '#e04a12') : '#c8c0d8';
    g.fillRect(Math.round(x), Math.round(y0 - 20 * K + y), sz, sz);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
// Staub im Lichtstrahl: langsam, kühl, schwebend
const dust = (g, t, n, seed, o = {}) => embers(g, t, n, seed, { rise: 6, drift: 14, big: 0.6, warm: 0, ...o });

// Vignette einmal vorberechnet (Kinobild: Ränder dunkler)
function vignette() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
}

// Risse im Siegel: verzweigte Pfade vom Mittelpunkt aus (fest gewürfelt), jeder mit Länge 0..1 entlang der Zeit
const SEAL = { x: 893, y: 410 };
function crackPaths() {
  const paths = [];
  const grow = (x, y, ang, len, depth, seed, start) => {
    const pts = [[x, y]];
    for (let i = 0; i < len; i++) {
      ang += (hash(i, seed) - 0.5) * 0.85;
      const st = 7 + hash(i, seed + 1) * 11;
      x += Math.cos(ang) * st; y += Math.sin(ang) * st * 0.62;   // Siegel liegt flach: senkrecht gestaucht
      pts.push([x, y]);
      if (depth < 1 && hash(i, seed + 2) < 0.12) grow(x, y, ang + (hash(i, seed + 3) < 0.5 ? -0.8 : 0.8), Math.floor(len * 0.5), depth + 1, seed * 7 + i, start + i / len * 0.6);
    }
    paths.push({ pts, start });
  };
  for (let k = 0; k < 6; k++) grow(SEAL.x, SEAL.y, (k / 6) * Math.PI * 2 + hash(k, 3), 20 + Math.floor(hash(k, 4) * 10), 0, 100 + k * 13, hash(k, 9) * 0.3);
  return paths;
}
function drawCracks(g, m, paths, k, heat) {
  if (k <= 0) return;
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [[6, 'rgba(224,74,18,0.18)'], [2.2, 'rgba(255,128,36,0.8)'], [0.9, 'rgba(255,226,170,0.95)']]) {
    g.lineWidth = Math.max(pass[0] < 2 ? 1 : 1.5, pass[0] * m.s * heat);
    g.strokeStyle = pass[1];
    for (const p of paths) {
      const local = clamp((k - p.start) / (1 - p.start));
      const n = Math.floor(local * (p.pts.length - 1));
      if (n < 1) continue;
      g.beginPath();
      p.pts.slice(0, n + 1).forEach(([x, y], i) => { const [px, py] = m.at(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';
}

// Ziehender Rauch/Nebel: eine weiche Rauschtextur (einmal berechnet), die langsam durchs Bild treibt
function fogTexture() {
  const w = 320, h = 136, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  const grid = (s, seed) => (x, y) => {
    const xi = Math.floor(x / s), yi = Math.floor(y / s), fx = x / s - xi, fy = y / s - yi;
    const cols = Math.ceil(w / s);
    const v = (a, b) => hash(((a % cols) + cols) % cols + b * 977, seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), sx), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), sx), sy);
  };
  const oct = [[40, 0.5], [20, 0.27], [10, 0.15], [5, 0.08]].map(([s, a], i) => [grid(s, 50 + i), a]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (const [f, a] of oct) v += f(x, y) * a;
    v = clamp((v - 0.42) * 2.4);
    const o = (y * w + x) * 4;
    img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = Math.round(v * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Nebel in einer Farbe: zwei Lagen, verschieden schnell (Tiefe). y0..y1 = Band im Bild, a = Deckkraft
function fog(g, A, t, { col = '#8a7a9a', a = 0.18, speed = 18, y0 = 0, y1 = H, mode = 'source-over' } = {}) {
  const c = A.fogTint ??= new Map();
  let tex = c.get(col);
  if (!tex) {
    tex = document.createElement('canvas'); tex.width = A.fog.width; tex.height = A.fog.height;
    const tg = tex.getContext('2d');
    tg.drawImage(A.fog, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, tex.width, tex.height);
    c.set(col, tex);
  }
  g.globalCompositeOperation = mode;
  for (const [k, sp, al] of [[1.0, speed, a], [1.6, speed * 1.8, a * 0.7]]) {
    const tw = W * 1.2 * k, th = (y1 - y0) * k;
    let x = -((t * sp * K) % tw);
    g.globalAlpha = al;
    for (; x < W; x += tw) g.drawImage(tex, x, y0 - (th - (y1 - y0)) / 2, tw + 1, th);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
// Lichtschein an einer Leinwandstelle
function glowAt(g, x, y, r, col, a) {
  if (a <= 0 || r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(a);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
// Blitz im Gewölk: kurzes doppeltes Aufleuchten
function lightning(g, m, t, at, x, y) {
  const k = t - at;
  if (k < 0 || k > 0.5) return;
  const a = (k < 0.08 ? 1 : k < 0.16 ? 0.25 : k < 0.24 ? 0.8 : 1 - (k - 0.24) / 0.26) * 0.9;
  glow(g, m, x, y, 520, 'rgba(190,200,255,1)', a * 0.55);
  veil(g, '#c8d0ff', a * 0.1);
}

// ------------------------------------------------------------------------------------------------ Einstellungen
// 1 – Schwärze. Ein einzelner Funke sinkt und landet.
function shotSpark(g, t) {
  black(g);
  const k = clamp(t / LAND);
  const x = W * 0.5 + Math.sin(t * 2.2) * 26 * K * (1 - k), y = lerp(-6, H * 0.62, ease(k));
  const r = 3 + 2 * Math.sin(t * 13);
  glowAt(g, x, y, 60 * K, 'rgba(255,150,50,1)', 0.55);
  g.fillStyle = '#ffd27a'; g.fillRect(Math.round(x - 1), Math.round(y - 1), r > 3.5 ? 3 : 2, r > 3.5 ? 3 : 2);
}

// 2 – Die Zitadelle auf dem Vulkan, Sturm darüber. Langsam heran. „Man nennt mich ein Ungeheuer.“
const PEAK = [940, 120];
function citadelLife(g, m, t, A, boost = 0) {
  glow(g, m, PEAK[0], PEAK[1] + 100, 260, 'rgba(255,90,20,1)', (0.22 + boost) * flick(t, 1));
  glow(g, m, 960, 540, 260, 'rgba(255,90,20,1)', (0.16 + boost * 0.5) * flick(t, 2));
  glow(g, m, 1040, 470, 120, 'rgba(255,120,30,1)', 0.2 * flick(t, 3));
}
function shotCitadel(g, t, dur, A, T) {
  const m = shot(g, A.images.zitadelle, { cx: 896, cy: 400, z: 1.0 }, { cx: 930, cy: 330, z: 1.22 }, glide(t / dur));
  citadelLife(g, m, t, A);
  fog(g, A, t, { col: '#5a3a3a', a: 0.22, speed: 30, y0: 0, y1: H * 0.45 });
  fog(g, A, t + 9, { col: '#2a2232', a: 0.3, speed: 55, y0: H * 0.55, y1: H });
  lightning(g, m, t, 2.6, 1500, 120);
  embers(g, t, 40, 20, { rise: 40, drift: 70, big: 1.0 });
  flash(g, t, 0, 0.5, '#ff9a40', 0.3);
  veil(g, '#000', 1 - ease((t - 0.1) / 2.0));
}

// 3 – Der Thronsaal, vom Eingang aus. Feuer in allen Schalen, ganz hinten eine kleine Gestalt auf dem Thron.
const HALL_FIRES = [[170, 330, 150], [445, 440, 110], [1615, 330, 150], [1340, 440, 110], [600, 485, 80], [1190, 485, 80],
  [680, 505, 60], [1110, 505, 60], [780, 425, 50], [1012, 425, 50], [20, 480, 90], [1772, 480, 90]];
function shotHall(g, t, dur, A) {
  const m = shot(g, A.images.halle, { cx: 896, cy: 384, z: 1.0 }, { cx: 896, cy: 380, z: 1.55 }, glide(t / dur));
  HALL_FIRES.forEach(([x, y, r], i) => glow(g, m, x, y - 20, r, 'rgba(255,130,40,1)', 0.38 * flick(t, i)));
  glow(g, m, 896, 195, 200, 'rgba(255,120,30,1)', 0.18 + 0.1 * Math.sin(t * 1.4));      // Rundfenster atmet
  glow(g, m, 896, 680, 240, 'rgba(255,110,30,1)', 0.12 * flick(t, 9));                 // Spiegelung im Boden
  fog(g, A, t, { col: '#ff7a30', a: 0.08, speed: 16, y0: H * 0.2, y1: H * 0.8, mode: 'lighter' });
  fog(g, A, t + 5, { col: '#2a1414', a: 0.16, speed: 10, y0: H * 0.3, y1: H * 0.75 });
  embers(g, t, 60, 21, { rise: 50, drift: 20, big: 0.9 });
}

// 4 – Malgareth auf dem Balkon seiner Zitadelle, von hinten, über seinem Land. „Nicht sterben.“
function shotBalcony(g, t, dur, A) {
  const m = shot(g, A.images.balkon, { cx: 820, cy: 400, z: 1.0 }, { cx: 760, cy: 380, z: 1.18 }, glide(t / dur));
  glow(g, m, 20, 330, 90, 'rgba(255,130,40,1)', 0.4 * flick(t, 1));
  glow(g, m, 245, 315, 60, 'rgba(255,130,40,1)', 0.35 * flick(t, 2));
  glow(g, m, 1250, 560, 300, 'rgba(255,90,20,1)', 0.12 * flick(t, 3));
  fog(g, A, t, { col: '#454a6e', a: 0.2, speed: 34, y0: H * 0.45, y1: H });
  fog(g, A, t + 6, { col: '#6a3a2a', a: 0.1, speed: 20, y0: H * 0.15, y1: H * 0.45 });
  embers(g, t, 34, 22, { rise: 30, drift: 90, big: 1.1 });
  veil(g, '#000', 1 - ease(t / 0.5));
}

// 5 – Erinnerung: die fünf Könige ziehen zur Zitadelle
function shotKings(g, t, dur, A) {
  const m = shot(g, A.images.koenige, { cx: 780, cy: 400, z: 1.18 }, { cx: 1010, cy: 380, z: 1.08 }, glide(t / dur));
  glow(g, m, 1350, 230, 260, 'rgba(255,80,20,0.8)', 0.18 * flick(t, 3));
  glow(g, m, 900, 560, 700, 'rgba(255,80,20,0.8)', 0.08 * flick(t, 7));
  fog(g, A, t, { col: '#3a2626', a: 0.22, speed: 70, y0: H * 0.55, y1: H });
  embers(g, t, 60, 7, { rise: 70, drift: 60, big: 1.1 });
  veil(g, '#1a0804', 0.14);                                         // Erinnerung: leicht gedämpft und warm
  veil(g, '#000', 1 - ease(t / 0.45));
}

// 6 – Die fünf Könige vor dem Tor der Zitadelle. Hinter dem Spalt glüht es, die Glut drückt nach außen.
function shotGate(g, t, dur, A) {
  const m = shot(g, A.images.tor, { cx: 896, cy: 430, z: 1.02 }, { cx: 896, cy: 380, z: 1.22 }, glide(t / dur), quake(t, 1.9, 0.6, 5));
  const surge = 0.5 + 0.5 * Math.sin(t * 3.2);
  glow(g, m, 893, 250, 60, 'rgba(255,150,50,1)', 0.3 + 0.25 * surge);
  glow(g, m, 893, 80, 60, 'rgba(255,150,50,1)', 0.2 + 0.2 * surge);
  [[318, 470], [578, 300], [1212, 300], [1478, 470]].forEach(([x, y], i) => glow(g, m, x, y, 70, 'rgba(255,130,40,1)', 0.35 * flick(t, i)));
  fog(g, A, t, { col: '#3a3e5a', a: 0.22, speed: 26, y0: H * 0.55, y1: H });
  embers(g, t, 36, 24, { rise: -24, drift: 30, big: 0.8, warm: 0 });   // Asche fällt
  embers(g, t, 20, 29, { rise: 40, drift: 20, big: 0.9 });
  veil(g, '#1a0804', 0.08);
  flash(g, t, 1.9, 0.25, '#ffb060', 0.25);
}

// 7 – Der Bann: eine Säule aus Licht schießt aus der Zitadelle, ein Runenring kreist am Himmel. Am Ende weiß.
const RING = { x: 895, y: 122, rx: 375, ry: 104 };
function runeRing(g, m, t, a) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * Math.PI * 2 + t * 0.35;
    const [x, y] = m.at(RING.x + Math.cos(ang) * RING.rx, RING.y + Math.sin(ang) * RING.ry);
    const front = 0.55 + 0.45 * Math.sin(ang);                     // vordere Hälfte heller
    g.globalAlpha = clamp(a * front * (0.5 + 0.5 * Math.sin(t * 6 + i)));
    g.fillStyle = i % 4 ? '#ffd890' : '#fff6dc';
    const s = Math.max(1, Math.round((i % 4 ? 4 : 7) * m.s));
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function shotPillar(g, t, dur, A) {
  const m = shot(g, A.images.lichtsaeule, { cx: 896, cy: 470, z: 1.3 }, { cx: 896, cy: 384, z: 1.02 }, glide(t / dur), quake(t, 0, 1.0, 8));
  const grow = ease(t / 1.6), pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
  glow(g, m, 896, 200, 280, 'rgba(255,240,190,1)', (0.25 + 0.15 * pulse) * grow);
  glow(g, m, 896, 60, 520, 'rgba(255,220,140,1)', (0.12 + 0.06 * pulse) * grow);
  runeRing(g, m, t, 0.7 * grow);
  fog(g, A, t, { col: '#ffe6b0', a: 0.1 * grow, speed: 40, y0: 0, y1: H * 0.5, mode: 'lighter' });
  embers(g, t, 50, 25, { rise: 110, drift: 30, big: 1.0 });
  flash(g, t, 0, 0.5, '#fff4dc', 0.85);
  const end = dur - t;
  if (end < 1.3) veil(g, '#fff8e8', ease(1 - end / 1.3));
}

// 8 – Das Siegel. Tausend Jahre Staub, dann reißt es auf.
function shotSeal(g, t, dur, A, T) {
  const k = glide(t / dur);
  const m = shot(g, A.images.siegel, { cx: 896, cy: 380, z: 1.0 }, { cx: SEAL.x, cy: SEAL.y, z: 1.55 }, k, quake(T, BREAK - 0.5, 1.4, 14));
  glow(g, m, 1330, 40, 360, 'rgba(150,160,230,1)', 0.1 + 0.04 * Math.sin(t * 0.9));     // Lichtspalt in der Decke
  fog(g, A, t, { col: '#6a6a90', a: 0.1, speed: 8, y0: H * 0.1, y1: H * 0.9 });
  dust(g, t, 60, 11, { x0: W * 0.5, rise: 4 });
  const crack = clamp((T - (BREAK - 3.2)) / 3.2);
  const heat = 1 + clamp((T - BREAK) / 0.4) * 0.6;
  glow(g, m, SEAL.x, SEAL.y, 100 + 300 * crack, 'rgba(255,110,30,1)', 0.1 + 0.3 * crack ** 2);
  drawCracks(g, m, A.cracks, crack, heat);
  if (T >= BREAK) {
    glow(g, m, SEAL.x, SEAL.y, 700, 'rgba(255,150,60,1)', 0.4 * (1 - clamp((T - BREAK) / 1.1)));
    embers(g, T - BREAK, 90, 12, { rise: 320, drift: 80, big: 1.6, y0: H * 0.2 });
  }
  veil(g, '#000', 1 - ease((t - 0.1) / 1.4));
  flash(g, T, BREAK, 0.5, '#ffd8a0', 0.9);
  if (dur - t < 0.45) veil(g, '#000', ease(1 - (dur - t) / 0.45));
}

// 9 – Die Halle nach tausend Jahren: kalt, verstaubt, Mondlicht auf der steinernen Gestalt. „Ich bin nicht zornig.“
// Dann glimmt es in den Bodenrissen und in den Augen der Statue.
function shotDust(g, t, dur, A) {
  const m = shot(g, A.images['halle-staub'], { cx: 896, cy: 400, z: 1.05 }, { cx: 898, cy: 420, z: 1.6 }, glide(t / dur));
  glow(g, m, 900, 250, 260, 'rgba(170,185,255,1)', 0.14 + 0.04 * Math.sin(t * 1.1));      // Mondstrahl
  dust(g, t, 70, 26, { x0: W * 0.36, x1: W * 0.64, rise: -5, drift: 10 });
  fog(g, A, t, { col: '#7a80a8', a: 0.1, speed: 6, y0: H * 0.45, y1: H });
  const wake = clamp((t - 2.0) / 1.6);
  [[1060, 650], [1240, 730], [760, 700]].forEach(([x, y], i) => glow(g, m, x, y, 90, 'rgba(255,90,20,1)', wake * 0.5 * flick(t, i)));
  [[892, 412], [904, 412]].forEach(([x, y]) => glow(g, m, x, y, 5, 'rgba(255,170,60,1)', wake * 0.8));
  veil(g, '#000', 1 - ease(t / 0.9));
}

// 10 – Der Ausbruch: zurück bei der Zitadelle. Der Berg reißt auf, Glut schießt in den Himmel. „Nur geduldig.“
function shotEruption(g, t, dur, A, T) {
  const m = shot(g, A.images.zitadelle, { cx: 930, cy: 330, z: 1.4 }, { cx: 920, cy: 300, z: 1.15 }, glide(t / dur), quake(T, ROAR, 2.2, 22));
  const burst = 1 - clamp((T - ROAR) / 3.5);
  citadelLife(g, m, t, A, 0.1 + 0.2 * burst);
  glow(g, m, PEAK[0], PEAK[1], 200 + 160 * burst, 'rgba(255,150,50,1)', 0.2 + 0.3 * burst);
  glow(g, m, PEAK[0], PEAK[1] - 30, 70, 'rgba(255,230,160,1)', 0.5 * burst + 0.15);
  fog(g, A, t, { col: '#ff6a20', a: 0.06, speed: 45, y0: 0, y1: H * 0.45, mode: 'lighter' });
  fog(g, A, t + 3, { col: '#1a1218', a: 0.28, speed: 70, y0: 0, y1: H * 0.4 });
  const [px, py] = m.at(PEAK[0], PEAK[1]);
  embers(g, T - ROAR + 3, 140, 27, { rise: 300 * (0.4 + burst), drift: 90, big: 1.5, x0: px - 260 * K, x1: px + 260 * K, y1: py + 80 * K });
  embers(g, t, 40, 28, { rise: 60, drift: 60, big: 1.0 });
  lightning(g, m, t, 2.4, 1450, 140);
  lightning(g, m, t, 4.6, 330, 100);
  flash(g, T, ROAR - 0.15, 0.7, '#ffe0b0', 0.95);
  if (dur - t < 0.5) veil(g, '#000', ease(1 - (dur - t) / 0.5));
}

// 11 – Die Glutsenke bei Nacht. Ein einsamer Wanderer auf dem Hügel.
function shotHollow(g, t, dur, A) {
  const m = shot(g, A.images.glutsenke, { cx: 760, cy: 400, z: 1.22 }, { cx: 1120, cy: 384, z: 1.1 }, glide(t / dur));
  glow(g, m, 1075, 215, 140, 'rgba(255,100,30,1)', 0.25 * flick(t, 5));
  glow(g, m, 980, 590, 160, 'rgba(255,90,20,0.9)', 0.15 * flick(t, 6));
  fog(g, A, t, { col: '#46506e', a: 0.16, speed: 22, y0: H * 0.35, y1: H * 0.8 });
  embers(g, t, 30, 15, { rise: 26, drift: 40, big: 0.9 });
  veil(g, '#000', 1 - ease(t / 1.0));
}

// 12 – Über die Schulter des Wanderers: die Zitadelle glüht.
function shotWanderer(g, t, dur, A) {
  const m = shot(g, A.images.wanderer, { cx: 760, cy: 400, z: 1.0 }, { cx: 1080, cy: 320, z: 1.28 }, glide(t / dur));
  glow(g, m, 1370, 230, 220, 'rgba(255,100,30,1)', 0.22 + 0.12 * Math.sin(t * 1.8));
  fog(g, A, t, { col: '#3a3e5e', a: 0.18, speed: 28, y0: H * 0.4, y1: H * 0.85 });
  fog(g, A, t + 4, { col: '#5a2a1a', a: 0.14, speed: 14, y0: 0, y1: H * 0.35 });
  embers(g, t, 46, 16, { rise: 30, drift: 70, big: 1.3 });
  if (dur - t < 0.6) veil(g, '#000', ease(1 - (dur - t) / 0.6));
}

// Titelschrift (Cinzel, wie auf der Website). Fehlt sie, eine Serifenschrift des Systems.
async function titleFont() {
  for (const u of ['/fonts/cinzel-latin-700-normal.woff2', '/site/fonts/cinzel-latin-700-normal.woff2']) {
    try {
      const f = new FontFace('IntroTitel', `url(${new URL(u, location.href).href})`, { weight: '700' });
      await f.load();
      document.fonts.add(f);
      return '"IntroTitel"';
    } catch { /* nächster Ort */ }
  }
  return 'Georgia, "Times New Roman", serif';
}

// 13 – Titel: EMBERWRATH über der dunklen Zitadelle. Ein Lichtstreif läuft über die Buchstaben, Glut steigt.
function shotTitle(g, t, dur, A) {
  const m = shot(g, A.images.zitadelle, { cx: 930, cy: 300, z: 1.25 }, { cx: 930, cy: 290, z: 1.32 }, t / dur);
  citadelLife(g, m, t, A);
  veil(g, '#000', 0.72);
  fog(g, A, t, { col: '#2a1c22', a: 0.35, speed: 30, y0: H * 0.3, y1: H });
  const text = 'EMBERWRATH', size = Math.round(W * 0.072), track = size * 0.16;
  g.font = `700 ${size}px ${A.font}`;
  g.textBaseline = 'middle';
  const widths = [...text].map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (text.length - 1);
  const x0 = (W - total) / 2, y = H * 0.46;
  const show = ease(t / 1.4);
  // Schrift: Verlauf von hellem Gold zu Glut, weicher Glutschein dahinter
  const grad = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  grad.addColorStop(0, '#fff0c8'); grad.addColorStop(0.45, '#ffb04a'); grad.addColorStop(1, '#c2410e');
  g.save();
  g.globalAlpha = show;
  g.shadowColor = 'rgba(255,100,20,0.85)'; g.shadowBlur = size * 0.35;
  g.fillStyle = grad;
  let x = x0;
  [...text].forEach((c, i) => { g.fillText(c, x, y); x += widths[i] + track; });
  g.restore();
  // Lichtstreif von links nach rechts
  const sweep = lerp(x0 - 200 * K, x0 + total + 200 * K, clamp((t - 0.6) / 1.6));
  g.save();
  g.globalCompositeOperation = 'lighter';
  const sg = g.createLinearGradient(sweep - 140 * K, 0, sweep + 140 * K, 0);
  sg.addColorStop(0, 'rgba(255,220,160,0)'); sg.addColorStop(0.5, 'rgba(255,236,200,0.85)'); sg.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = sg;
  x = x0;
  [...text].forEach((c, i) => { g.fillText(c, x, y); x += widths[i] + track; });
  g.restore();
  // Zierlinie, wächst aus der Mitte
  const line = ease((t - 1.0) / 1.2) * total * 0.5;
  if (line > 0) {
    const ly = y + size * 0.62;
    const lg = g.createLinearGradient(W / 2 - line, 0, W / 2 + line, 0);
    lg.addColorStop(0, 'rgba(232,120,42,0)'); lg.addColorStop(0.5, 'rgba(255,190,110,0.9)'); lg.addColorStop(1, 'rgba(232,120,42,0)');
    g.fillStyle = lg; g.fillRect(Math.round(W / 2 - line), Math.round(ly), Math.round(line * 2), 1);
    g.fillStyle = '#ffd890'; g.fillRect(Math.round(W / 2 - 1), Math.round(ly - 1), 3, 3);
  }
  embers(g, t, 60, 17, { rise: 50, drift: 30 });
  flash(g, t, 0, 0.5, '#ff9a40', 0.3);
  veil(g, '#000', 1 - ease(t / 0.6));
}
