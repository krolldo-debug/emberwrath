import { logoCanvas } from '../gfx/Logo.js';

// Intro-Film „Die Stimme im Thron“: Malgareth spricht zum neuen Helden. Kein Gameplay, nur die Geschichte.
// Bild 1792 × 762 (Kinoformat 2,35:1). Die Szenen sind gemalte Standbilder (src/intro/media, Entstehung und Prompts in
// tools/intro/bilder.py); bewegt werden sie hier: Kamerafahrten, fliegende Glut, flackerndes Licht, Risse, Blitze.
// Zeiten in Sekunden. Die Tonspur (Stimme, Musik, Geräusche) ist je Sprache fertig gemischt (tools/intro/ton.py);
// ihre Sprechzeiten stehen im Block TIMING (vom Werkzeug geschrieben).
//
// Einstellungen: 1 Funke im Dunkel · 2 Thronsaal · 3 Aufwärts zum Gesicht · 4 Antlitz · 5 Erinnerung: die fünf Könige,
// an der Treppe, der Bann · 6 Das Siegel bricht · 7 Das Steingesicht erwacht · 8 Die Glutsenke · 9 Der Wanderer · 10 Titel
const W = 1792, H = 762;

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

// Feste Punkte der Tonspur (tools/intro/ton.py): Funke landet, Siegel bricht, Brüllen
const LAND = 3.35, BREAK = 37.9, ROAR = 43.3;

const SHOTS = [
  { t0: 0, t1: 3.4, draw: shotSpark },
  { t0: 3.4, t1: 8.2, draw: shotHall },
  { t0: 8.2, t1: 14.0, draw: shotRise },
  { t0: 14.0, t1: 18.4, draw: shotFace },
  { t0: 18.4, t1: 22.4, draw: shotKings },
  { t0: 22.4, t1: 25.1, draw: shotStairs },
  { t0: 25.1, t1: 31.8, draw: shotBind },
  { t0: 31.8, t1: 39.0, draw: shotSeal },
  { t0: 39.0, t1: ROAR - 0.1, draw: shotStone },
  { t0: ROAR - 0.1, t1: 49.8, draw: shotAwaken },
  { t0: 49.8, t1: 53.6, draw: shotHollow },
  { t0: 53.6, t1: 57.6, draw: shotWanderer },
  { t0: 57.6, t1: 62.0, draw: shotTitle },
];

const IMAGES = ['thron', 'antlitz', 'antlitz-stein', 'koenige', 'treppe', 'bann', 'siegel', 'erwachen', 'glutsenke', 'wanderer'];

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
    return { images, logo: logoCanvas(), vignette: vignette(), cracks: crackPaths() };
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

// Kamera über einem Standbild: Mittelpunkt (cx, cy) in Bildpixeln, z = Vergrößerung über „bildfüllend“.
// Der Ausschnitt bleibt immer im Bild. Gibt die Abbildung Bild → Leinwand zurück (für Lichter an Bildstellen).
function shot(g, img, a, b, k, sh = null) {
  const z = lerp(a.z, b.z, k);
  const s = Math.max(W / img.width, H / img.height) * z;
  const vw = W / s, vh = H / s;
  const cx = clamp(lerp(a.cx, b.cx, k), vw / 2, img.width - vw / 2);
  const cy = clamp(lerp(a.cy, b.cy, k), vh / 2, img.height - vh / 2);
  const x0 = cx - vw / 2 + (sh?.x ?? 0) / s, y0 = cy - vh / 2 + (sh?.y ?? 0) / s;
  g.drawImage(img, x0, y0, vw, vh, 0, 0, W, H);
  return { s, x0, y0, at: (x, y) => [(x - x0) * s, (y - y0) * s] };
}
// Erschütterung (klingt ab), als Versatz in Leinwandpixeln
function quake(t, at, dur, amp) {
  const k = t - at;
  if (k < 0 || k > dur) return null;
  const a = amp * (1 - k / dur) ** 2;
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
    const sz = Math.max(2, Math.round((2 + depth * 4) * big));
    const sp = rise * (0.5 + depth);
    const span = y1 - y0 + 40;
    let y = (hash(i, seed + 2) * span + dir * sp * t) % span; if (y < 0) y += span;
    const xw = x1 - x0;
    const x = x0 + (((hash(i, seed + 3) * xw + Math.sin(t * (0.6 + depth) + i) * drift * depth + t * drift * 0.5 * depth) % xw) + xw) % xw;
    const life = 0.5 + 0.5 * Math.sin(t * (2 + hash(i, seed + 4) * 3) + i * 7);
    g.globalAlpha = clamp(life * (0.35 + depth * 0.65));
    g.fillStyle = warm ? (hash(i, seed + 5) < 0.3 ? '#ffd27a' : hash(i, seed + 5) < 0.7 ? '#ff8a2a' : '#e04a12') : '#c8c0d8';
    g.fillRect(Math.round(x), Math.round(y0 - 20 + y), sz, sz);
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
    g.lineWidth = pass[0] * m.s * heat;
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

// ------------------------------------------------------------------------------------------------ Einstellungen
// 1 – Schwärze. Ein einzelner Funke sinkt und landet.
function shotSpark(g, t) {
  black(g);
  const k = clamp(t / LAND);
  const x = W * 0.5 + Math.sin(t * 2.2) * 26 * (1 - k), y = lerp(-20, H * 0.62, ease(k));
  const r = 3 + 2 * Math.sin(t * 13);
  const gr = g.createRadialGradient(x, y, 0, x, y, 60);
  gr.addColorStop(0, 'rgba(255,150,50,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - 60, y - 60, 120, 120);
  g.fillStyle = '#ffd27a'; g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), Math.round(r), Math.round(r));
}

// 2 – Der Thronsaal, aus der Dunkelheit. Langsam auf den Thron zu.
const THRON_LIGHTS = [[75, 455, 120], [272, 525, 90], [1745, 470, 120], [1515, 600, 80]];
function thronLights(g, m, t, a = 1) {
  THRON_LIGHTS.forEach(([x, y, r], i) => glow(g, m, x, y, r, 'rgba(255,120,40,0.9)', 0.35 * flick(t, i) * a));
  glow(g, m, 760, 170, 330, 'rgba(255,90,20,0.8)', (0.16 + 0.08 * Math.sin(t * 1.3)) * a);   // Siegel hinter dem Thron atmet
  glow(g, m, 897, 163, 16, 'rgba(255,170,60,1)', (0.3 + 0.12 * Math.sin(t * 2.1)) * a);      // Augen
}
function shotHall(g, t, dur, A) {
  const m = shot(g, A.images.thron, { cx: 896, cy: 430, z: 1.0 }, { cx: 880, cy: 360, z: 1.2 }, glide(t / dur));
  thronLights(g, m, t);
  embers(g, t, 46, 1, { rise: 40, drift: 24 });
  flash(g, t, 0, 0.5, '#ff9a40', 0.35);
  veil(g, '#000', 1 - ease((t - 0.1) / 2.2));
}

// 3 – Nah: vom Schwert auf seinen Knien hinauf zum Gesicht
function shotRise(g, t, dur, A) {
  const m = shot(g, A.images.thron, { cx: 900, cy: 470, z: 2.0 }, { cx: 875, cy: 230, z: 2.25 }, glide(t / dur));
  thronLights(g, m, t);
  dust(g, t, 26, 4);
  embers(g, t, 22, 5, { rise: 50, big: 1.3 });
}

// 4 – Antlitz: „Nicht sterben.“ Ganz langsam an die Augen heran.
const FACE_EYES = [[1152, 262], [1360, 262]];
function shotFace(g, t, dur, A) {
  const m = shot(g, A.images.antlitz, { cx: 1050, cy: 384, z: 1.0 }, { cx: 1240, cy: 300, z: 1.35 }, glide(t / dur));
  glow(g, m, 620, 230, 380, 'rgba(255,90,20,0.8)', 0.12 + 0.06 * Math.sin(t * 1.6));
  FACE_EYES.forEach(([x, y], i) => glow(g, m, x, y, 46, 'rgba(255,160,50,1)', 0.3 + 0.12 * Math.sin(t * 3 + i)));
  embers(g, t, 34, 6, { rise: 46, drift: 30, big: 1.2 });
}

// 5a – Erinnerung: die fünf Könige ziehen zur Zitadelle
function shotKings(g, t, dur, A) {
  const k = glide(t / dur);
  const m = shot(g, A.images.koenige, { cx: 780, cy: 400, z: 1.18 }, { cx: 1010, cy: 380, z: 1.08 }, k);
  glow(g, m, 1350, 230, 260, 'rgba(255,80,20,0.8)', 0.18 * flick(t, 3));
  embers(g, t, 60, 7, { rise: 70, drift: 60, big: 1.1 });
  veil(g, '#1a0804', 0.18);                                         // Erinnerung: leicht gedämpft und warm
  veil(g, '#000', 1 - ease(t / 0.45));
}

// 5b – An der Treppe: Malgareth über ihnen, Feuer in der Hand
function shotStairs(g, t, dur, A) {
  const m = shot(g, A.images.treppe, { cx: 896, cy: 430, z: 1.02 }, { cx: 900, cy: 300, z: 1.3 }, glide(t / dur), quake(t, 0, 0.6, 6));
  glow(g, m, 1030, 95, 120, 'rgba(255,140,40,1)', 0.45 * flick(t, 1));
  glow(g, m, 896, 200, 420, 'rgba(255,90,20,0.7)', 0.18 * flick(t, 2));
  embers(g, t, 70, 8, { rise: 90, drift: 40, big: 1.2 });
  veil(g, '#1a0804', 0.12);
  flash(g, t, 0, 0.35, '#ffb060', 0.5);
}

// 5c – Der Bann: Lichtschwerter, Malgareth wird zu Stein. Am Ende weißes Licht.
function shotBind(g, t, dur, A) {
  const m = shot(g, A.images.bann, { cx: 896, cy: 360, z: 1.32 }, { cx: 896, cy: 380, z: 1.04 }, glide(t / dur), quake(t, 0, 0.8, 5));
  const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
  glow(g, m, 905, 380, 300, 'rgba(255,230,160,1)', 0.18 + 0.14 * pulse);
  glow(g, m, 905, 640, 520, 'rgba(255,210,120,0.8)', 0.1 + 0.06 * pulse);
  dust(g, t, 40, 9, { rise: -10, drift: 30 });
  embers(g, t, 30, 10, { rise: 40, big: 0.9 });
  flash(g, t, 0, 0.4, '#fff4dc', 0.7);
  const end = dur - t;
  if (end < 1.2) veil(g, '#fff8e8', ease(1 - end / 1.2));
}

// 6 – Das Siegel. Tausend Jahre Staub, dann reißt es auf.
function shotSeal(g, t, dur, A, T) {
  const k = glide(t / dur);
  const m = shot(g, A.images.siegel, { cx: 896, cy: 380, z: 1.0 }, { cx: SEAL.x, cy: SEAL.y, z: 1.55 }, k, quake(T, BREAK - 0.5, 1.4, 14));
  dust(g, t, 50, 11, { x0: W * 0.55, rise: 4 });
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

// 7a – Stille. Das Gesicht aus Stein, dunkel. Dann glühen die Augen auf.
function shotStone(g, t, dur, A) {
  const m = shot(g, A.images['antlitz-stein'], { cx: 1255, cy: 310, z: 1.55 }, { cx: 1258, cy: 280, z: 1.8 }, glide(t / dur));
  dust(g, t, 30, 13, { rise: -8 });
  const lit = clamp((t - 2.4) / 1.2);
  FACE_EYES.forEach(([x, y]) => { glow(g, m, x, y, 34, 'rgba(255,190,80,1)', 0.95 * lit); glow(g, m, x, y, 120, 'rgba(255,90,20,1)', 0.4 * lit); });
  veil(g, '#000', 1 - ease(t / 0.9));
}

// 7b – Der Stein platzt. Brüllen, Erschütterung, Glut. Dann langsam heran: „Nur geduldig.“
const WAKE_EYES = [[765, 297], [1035, 297]];
function shotAwaken(g, t, dur, A, T) {
  const m = shot(g, A.images.erwachen, { cx: 896, cy: 384, z: 1.0 }, { cx: 892, cy: 300, z: 1.38 }, glide(t / dur), quake(T, ROAR, 1.6, 18));
  WAKE_EYES.forEach(([x, y], i) => glow(g, m, x, y, 70, 'rgba(255,170,60,1)', 0.45 + 0.2 * Math.sin(t * 4 + i)));
  glow(g, m, 896, 160, 500, 'rgba(255,90,20,0.8)', 0.1 + 0.25 * (1 - clamp((T - ROAR) / 2)));
  embers(g, t, 70, 14, { rise: 80 + 160 * (1 - clamp((T - ROAR) / 2.5)), drift: 70, big: 1.4 });
  flash(g, T, ROAR - 0.1, 0.6, '#ffe0b0', 0.95);
  if (dur - t < 0.5) veil(g, '#000', ease(1 - (dur - t) / 0.5));
}

// 8 – Die Glutsenke bei Nacht. Ein einsamer Wanderer auf dem Hügel.
function shotHollow(g, t, dur, A) {
  const m = shot(g, A.images.glutsenke, { cx: 760, cy: 400, z: 1.22 }, { cx: 1120, cy: 384, z: 1.1 }, glide(t / dur));
  glow(g, m, 1075, 215, 140, 'rgba(255,100,30,1)', 0.25 * flick(t, 5));
  glow(g, m, 980, 590, 160, 'rgba(255,90,20,0.9)', 0.15 * flick(t, 6));
  embers(g, t, 30, 15, { rise: 26, drift: 40, big: 0.9 });
  veil(g, '#000', 1 - ease(t / 1.0));
}

// 9 – Über die Schulter des Wanderers: die Zitadelle glüht.
function shotWanderer(g, t, dur, A) {
  const m = shot(g, A.images.wanderer, { cx: 760, cy: 400, z: 1.0 }, { cx: 1080, cy: 320, z: 1.28 }, glide(t / dur));
  glow(g, m, 1370, 230, 220, 'rgba(255,100,30,1)', 0.22 + 0.12 * Math.sin(t * 1.8));
  embers(g, t, 46, 16, { rise: 30, drift: 70, big: 1.3 });
  if (dur - t < 0.6) veil(g, '#000', ease(1 - (dur - t) / 0.6));
}

// 10 – Schriftzug EMBERWRATH, Glut steigt
function shotTitle(g, t, dur, A) {
  black(g);
  const L = A.logo, s = Math.floor((W * 0.5) / L.width);
  const w = L.width * s, h = L.height * s;
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2 - 24);
  g.imageSmoothingEnabled = false;
  g.globalAlpha = ease(t / 0.8);
  g.drawImage(L, x, y, w, h);
  g.globalAlpha = 1;
  const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.4);
  gr.addColorStop(0, 'rgba(224,74,18,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = ease(t / 1.2) * (0.8 + 0.2 * Math.sin(t * 2));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  embers(g, t, 50, 17, { rise: 50, drift: 20, x0: W * 0.2, x1: W * 0.8 });
  flash(g, t, 0, 0.4, '#ffb060', 0.5);
}
