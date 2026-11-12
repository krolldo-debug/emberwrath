// Intro-Film „Die Stimme im Thron“: Malgareth spricht zum neuen Helden. Kein Gameplay, nur die Geschichte.
// Kinoformat 7:3. Die Szenen sind Pixelbilder im festen Raster 672 × 288 (src/intro/media, Entstehung und Prompts in
// tools/intro/bilder.py); bewegt werden sie hier: Kamerafahrten, ziehender Rauch, Glut, brennende Feuer, pulsierende
// Lava, funkelnde Sterne, Blitze, ein kreisender Runenring, wachsende Risse, ein Vulkanausbruch. Personen nur von
// hinten oder klein im Bild: Standbilder von Gesichtern wirken tot.
// Zeiten in Sekunden. Die Tonspur (Stimme, Musik, Geräusche) ist je Sprache fertig gemischt (tools/intro/ton.py);
// ihre Sprechzeiten stehen im Block TIMING (vom Werkzeug geschrieben).
//
// Einstellungen: 1 Funke im Dunkel · 2 Die Zitadelle · 3 Der Thronsaal · 4 Der König auf dem Balkon · 5 Die fünf Könige ·
// 6 Vor dem Tor · 7 Die Lichtsäule (der Bann) · 8 Das Siegel bricht · 9 Die Halle nach tausend Jahren · 10 Der Ausbruch ·
// 11 Die Glutsenke · 12 Der Wanderer · 13 Titel
//
// So entsteht ein Bild (Klasse Stage): Jede Szene wird in Kunstpixeln auf eine kleine Weltfläche (672 × 288) gezeichnet,
// Bild, Licht, Rauch und Glut auf demselben Raster wie im Spiel. Erst die fertige Fläche bringt die Kamera auf die
// Ausgabe: Ausschnitt und Vergrößerung frei, aber pixelscharf. So bleiben die Bildpunkte harte Quadrate, und die
// Fahrten laufen trotzdem weich. Bildstellen und Kameraorte sind in Pixeln der Vorlagen angegeben (1792 breit, F rechnet um).
const AW = 672, AH = 288, F = AW / 1792;

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

// Feste Punkte der Tonspur (tools/intro/ton.py): Funke landet, Siegel bricht, Ausbruch
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

// Bilder mit „-v“ sind Vordergrund-Ebenen (freigestellt, durchsichtig): Das Bild ohne „-v“ ist dann der Hintergrund dahinter
const IMAGES = ['zitadelle', 'halle', 'balkon', 'balkon-v', 'koenige', 'tor', 'lichtsaeule', 'siegel', 'halle-staub', 'glutsenke', 'wanderer', 'wanderer-v'];
// Was in einem Bild glüht (Glutkarte, siehe analyse): warm = Feuer und Lava, gold = das Licht des Banns
const GLOW_KIND = { lichtsaeule: 'gold', siegel: null, 'halle-staub': null };
// Bis zu dieser Höhe (Vorlagenpixel) ist Sternenhimmel
const SKY = { balkon: 300, glutsenke: 250, wanderer: 250 };

export const FILM = {
  // Seitenverhältnis und kleinste sinnvolle Größe der Zeichenfläche; gezeichnet wird in jeder Größe (je größer, desto
  // schärfer die Kanten der Bildpunkte). IntroPlayer nimmt die Gerätepixel des Bildschirms.
  width: AW, height: AH, duration: 62.0,
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
    const glut = {}, stars = {}, px = {};
    for (const n of IMAGES) {
      // Ohne Zugriff auf die Bildpunkte (fremde Herkunft) läuft der Film ohne Glutpuls, Sternfunkeln und bewegte Flammen
      try { ({ glut: glut[n], stars: stars[n], px: px[n] } = analyse(images[n], n)); } catch { glut[n] = null; stars[n] = []; px[n] = null; }
    }
    return { images, glut, stars, px, stage: new Stage(), title: titleArt(await titleFont()), cracks: crackPaths(), fog: fogTexture(), pulse: pulseTexture() };
  },
  prepareAll() {},
  // Zeichnet das Bild zur Zeit t bildfüllend auf g (beliebige Größe im Seitenverhältnis des Films)
  draw(g, t, A) {
    const shot = SHOTS.find((s) => t < s.t1) ?? SHOTS[SHOTS.length - 1];
    const st = A.stage;
    st.begin(g);
    shot.draw(st, t - shot.t0, shot.t1 - shot.t0, A, t);
    st.vignette();
  },
};

// ------------------------------------------------------------------------------------------------ Rechenhilfen
const hash = (i, s = 0) => { let n = (i * 374761393 + s * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
// Langsames Gleiten: fast linear, nur sanft an den Enden (wirkt wie eine Kamerafahrt, nicht wie ein Zoom-Effekt)
const glide = (k) => { k = clamp(k); return 0.15 * ease(k) + 0.85 * k; };
// Feuerflackern 0..1 (mehrere Frequenzen, je Lichtquelle eigener Takt)
const flick = (t, s = 0) => 0.62 + 0.2 * Math.sin(t * 9.1 + s * 2.3) + 0.12 * Math.sin(t * 23.7 + s * 5.1) + 0.06 * Math.sin(t * 41 + s);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Kachelbares Rauschen 0..1: Gitterrauschen in mehreren Oktaven (Zellgrößen teilen Breite und Höhe)
function noise(w, h, octaves, seed) {
  const out = new Float32Array(w * h);
  octaves.forEach(([s, amp], o) => {
    const cols = w / s, rows = h / s;
    const v = (a, b) => hash((((a % cols) + cols) % cols) + (((b % rows) + rows) % rows) * 977, seed + o);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xi = Math.floor(x / s), yi = Math.floor(y / s), fx = x / s - xi, fy = y / s - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      out[y * w + x] += amp * lerp(lerp(v(xi, yi), v(xi + 1, yi), sx), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), sx), sy);
    }
  });
  return out;
}
function alphaTexture(w, h, alpha) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { img.data.fill(255, i * 4, i * 4 + 3); img.data[i * 4 + 3] = Math.round(clamp(alpha(i % w, Math.floor(i / w), i)) * 255); }
  g.putImageData(img, 0, 0);
  return c;
}
// Rauch/Nebel: weiche Schwaden, nach oben und unten auslaufend (das Band hat keine harte Kante)
function fogTexture() {
  const w = 256, h = 128, n = noise(w, h, [[64, 0.5], [32, 0.27], [16, 0.15], [8, 0.08]], 50);
  return alphaTexture(w, h, (x, y, i) => clamp((n[i] - 0.42) * 2.4) * Math.min(1, Math.sin(Math.PI * (y + 0.5) / h) * 2.4));
}
// Glutpuls: wandernde Flecken in vier harten Stufen (wie ein Farbwechsel der Palette), kachelbar
function pulseTexture() {
  const s = 128, n = noise(s, s, [[32, 0.55], [16, 0.3], [8, 0.15]], 70);
  return alphaTexture(s, s, (x, y, i) => Math.round(clamp((n[i] - 0.34) * 2.8) * 3) / 3);
}

// Bild beim Laden auswerten: Glutkarte (was leuchtet: Farbe des Bildpunkts, Deckkraft = wie heiß), Sterne
// (einzelne helle, kühle Bildpunkte im dunklen Himmel, mit der Himmelsfarbe daneben zum Verlöschen) und die
// Bildpunkte selbst (px, für warp)
function analyse(img, name) {
  const cv = canvas(AW, AH), g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, AW, AH);
  const d = g.getImageData(0, 0, AW, AH), p = d.data, px = new Uint8ClampedArray(p);
  const lum = (i) => p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
  const stars = [], sky = Math.min(AH - 1, Math.round((SKY[name] ?? 0) * F));
  for (let y = 1; y < sky; y++) for (let x = 1; x < AW - 1; x++) {
    const i = (y * AW + x) * 4, l = lum(i);
    if (l < 90 || p[i + 2] < p[i] * 0.9) continue;
    const around = [i - 4, i + 4, i - AW * 4, i + AW * 4];
    if (around.some((k) => lum(k) > l - 34)) continue;
    stars.push([x, y, `rgb(${p[i - 4]},${p[i - 3]},${p[i - 2]})`]);
  }
  const kind = name in GLOW_KIND ? GLOW_KIND[name] : 'warm';
  if (!kind) return { glut: null, stars, px };
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gr = p[i + 1], b = p[i + 2];
    const hot = kind === 'gold' ? clamp((r - 170) / 70) * clamp((gr - 130) / 80)
      : clamp((r - 140) / 90) * clamp((r - b - 60) / 80) * clamp((gr - 45) / 50);
    p[i + 3] = Math.round(hot * 255);
  }
  g.putImageData(d, 0, 0);
  return { glut: cv, stars, px };
}

// ------------------------------------------------------------------------------------------------ Bühne und Kamera
// Kamera über der Weltfläche: Mittelpunkt (cx, cy) in Vorlagenpixeln, z = Vergrößerung über „ganzes Bild“, zwischen
// Anfang a und Ende b bei k. Der Ausschnitt (Kunstpixel, auch Bruchteile) bleibt immer im Bild. sh = Erschütterung.
function camera(a, b, k, sh = null) {
  const z = lerp(a.z, b.z, k), vw = AW / z, vh = AH / z;
  const x0 = clamp(lerp(a.cx, b.cx, k) * F - vw / 2 + (sh?.x ?? 0), 0, AW - vw);
  const y0 = clamp(lerp(a.cy, b.cy, k) * F - vh / 2 + (sh?.y ?? 0), 0, AH - vh);
  return { x0, y0, vw, vh };
}
const FULL = { x0: 0, y0: 0, vw: AW, vh: AH };
// Kamera für eine nähere Ebene (Tiefenwirkung): In der Ruhelage rest deckt sich die Ebene mit dem gemalten Bild; von
// dort fährt und vergrößert sie um den Faktor p stärker als die Hauptkamera cam (p > 1). Ohne Begrenzung aufs Bild:
// die Ebene ist außen durchsichtig.
function nearer(cam, rest, p) {
  const vw = rest.vw * (cam.vw / rest.vw) ** p, vh = vw * AH / AW;
  const cx = rest.x0 + rest.vw / 2 + (cam.x0 + cam.vw / 2 - rest.x0 - rest.vw / 2) * p;
  const cy = rest.y0 + rest.vh / 2 + (cam.y0 + cam.vh / 2 - rest.y0 - rest.vh / 2) * p;
  return { x0: cx - vw / 2, y0: cy - vh / 2, vw, vh };
}
// Erschütterung (klingt ab), als Versatz in Kunstpixeln
function quake(t, at, dur, amp) {
  const k = t - at;
  if (k < 0 || k > dur) return null;
  const a = amp * F * (1 - k / dur) ** 2;
  return { x: (hash(Math.floor(t * 45), 7) - 0.5) * 2 * a, y: (hash(Math.floor(t * 45), 8) - 0.5) * 2 * a };
}

class Stage {
  constructor() {
    this.world = canvas(AW, AH); this.c = this.world.getContext('2d');       // Weltfläche: hier zeichnen die Einstellungen
    this.tmp = canvas(AW, AH); this.tg = this.tmp.getContext('2d');          // Zwischenfläche für maskierte Effekte
    this.up = canvas(AW, AH); this.ug = this.up.getContext('2d');            // ganzzahlig vergrößerter Ausschnitt
    this.g = null; this.OW = 0; this.OH = 0; this.vig = null;
  }
  begin(g) {
    this.g = g; this.OW = g.canvas.width; this.OH = g.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    this.clear();
  }
  // Weltfläche leeren (auch zwischen zwei Ebenen einer Einstellung)
  clear() {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, AW, AH);
  }
  // Ausschnitt der Weltfläche bildfüllend auf die Ausgabe: erst ganzzahlig und ungeglättet vergrößern, dann auf die
  // Zielgröße bringen. Jeder Bildpunkt bleibt ein hartes Quadrat (höchstens ein Ausgabepixel Übergang an der Kante),
  // auch wenn die Kamera um Bruchteile eines Bildpunkts fährt oder die Vergrößerung keine ganze Zahl ist.
  show(cam, src = this.world) {
    const { g, OW, OH, up } = this;
    const ix0 = Math.max(0, Math.floor(cam.x0)), iy0 = Math.max(0, Math.floor(cam.y0));
    const cw = Math.min(AW, Math.ceil(cam.x0 + cam.vw)) - ix0, ch = Math.min(AH, Math.ceil(cam.y0 + cam.vh)) - iy0;
    if (cw < 1 || ch < 1) return;
    const n = Math.max(1, Math.ceil(OW / cam.vw - 1e-3)), s = OW / cam.vw;                    // s = Ausgabepixel je Kunstpixel
    if (up.width < cw * n || up.height < ch * n) { up.width = Math.max(up.width, cw * n); up.height = Math.max(up.height, ch * n); }
    const ug = this.ug;
    ug.imageSmoothingEnabled = false;
    ug.globalCompositeOperation = 'copy';
    ug.drawImage(src, ix0, iy0, cw, ch, 0, 0, cw * n, ch * n);
    // Sichtbarer Teil des vergrößerten Ausschnitts (ragt die Kamera über die Weltfläche hinaus, bleibt der Rest frei)
    const sx = Math.max(cam.x0, ix0), sy = Math.max(cam.y0, iy0), ex = Math.min(cam.x0 + cam.vw, ix0 + cw), ey = Math.min(cam.y0 + cam.vh, iy0 + ch);
    g.imageSmoothingEnabled = true;
    g.drawImage(up, (sx - ix0) * n, (sy - iy0) * n, (ex - sx) * n, (ey - sy) * n, (sx - cam.x0) * s, (sy - cam.y0) * s, (ex - sx) * s, (ey - sy) * s);
  }
  // Über dem fertigen Bild (ohne Raster): Abblenden, Aufblitzen, dunkle Bildränder
  veil(col, a) {
    a = clamp(a);
    if (a <= 0) return;
    const g = this.g;
    g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, this.OW, this.OH); g.globalAlpha = 1;
  }
  flash(t, at, dur, col = '#fff4dc', peak = 1) { const k = t - at; if (k >= 0 && k < dur) this.veil(col, peak * (1 - k / dur) ** 1.5); }
  vignette() {
    const { g, OW, OH } = this;
    if (this.vig?.w !== OW || this.vig.h !== OH) {
      const gr = g.createRadialGradient(OW / 2, OH / 2, OH * 0.45, OW / 2, OH / 2, OW * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vig = { w: OW, h: OH, gr };
    }
    g.fillStyle = this.vig.gr; g.fillRect(0, 0, OW, OH);
  }
}

// ------------------------------------------------------------------------------------------------ Zeichnen auf der Weltfläche
// Alles hier zeichnet in Kunstpixeln auf c (Weltfläche). Bildstellen, Radien und Geschwindigkeiten kommen in
// Vorlagenpixeln (1792 breit), außer wo „Kunstpixel“ steht.
function black(c) { c.fillStyle = '#000'; c.fillRect(0, 0, AW, AH); }
function veil(c, col, a) {
  a = clamp(a);
  if (a <= 0) return;
  c.globalAlpha = a; c.fillStyle = col; c.fillRect(0, 0, AW, AH); c.globalAlpha = 1;
}
// Lichtschein (additiv) an einer Bildstelle
const glow = (c, x, y, r, col, a) => glowW(c, x * F, y * F, r * F, col, a);
function glowW(c, x, y, r, col, a) {                                  // … in Kunstpixeln
  if (a <= 0 || r <= 0) return;
  const gr = c.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a);
  c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

// Glut: zustandslos aus der Zeit berechnet. Einzelne harte Bildpunkte (nahe: 2 × 2), additiv, mit Tiefe (nah = schneller).
// Bereich x0..x1, y0..y1 in Vorlagenpixeln (Standard: ganzes Bild)
function embers(c, t, n, seed, { rise = 60, drift = 30, x0 = 0, x1 = 1792, y0 = 0, y1 = 768, big = 1, warm = 1, dir = -1 } = {}) {
  const X0 = x0 * F, xw = (x1 - x0) * F, Y0 = y0 * F, span = (y1 - y0) * F + 15;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const depth = 0.35 + hash(i, seed) * 0.65;
    const sz = depth * big > 1.05 ? 2 : 1;
    const sp = rise * F * (0.5 + depth);
    let y = (hash(i, seed + 2) * span + dir * sp * t) % span; if (y < 0) y += span;
    const x = X0 + (((hash(i, seed + 3) * xw + Math.sin(t * (0.6 + depth) + i) * drift * F * depth + t * drift * F * 0.5 * depth) % xw) + xw) % xw;
    const life = 0.5 + 0.5 * Math.sin(t * (2 + hash(i, seed + 4) * 3) + i * 7);
    c.globalAlpha = clamp(life * (0.35 + depth * 0.65));
    c.fillStyle = warm ? (hash(i, seed + 5) < 0.3 ? '#ffd27a' : hash(i, seed + 5) < 0.7 ? '#ff8a2a' : '#e04a12') : '#c8c0d8';
    c.fillRect(Math.round(x), Math.round(Y0 - 8 + y), sz, sz);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}
// Staub im Lichtstrahl: langsam, kühl, schwebend
const dust = (c, t, n, seed, o = {}) => embers(c, t, n, seed, { rise: 6, drift: 14, big: 0.6, warm: 0, ...o });

// Ziehender Rauch/Nebel in einer Farbe: zwei Lagen, verschieden schnell (Tiefe). y0..y1 = Band im Bild, a = Deckkraft
function fog(c, A, t, { col = '#8a7a9a', a = 0.18, speed = 18, y0 = 0, y1 = 768, mode = 'source-over' } = {}) {
  const cache = A.fogTint ??= new Map();
  let tex = cache.get(col);
  if (!tex) {
    tex = canvas(A.fog.width, A.fog.height);
    const tg = tex.getContext('2d');
    tg.drawImage(A.fog, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, tex.width, tex.height);
    cache.set(col, tex);
  }
  const Y0 = y0 * F, h = (y1 - y0) * F;
  c.imageSmoothingEnabled = true;
  c.globalCompositeOperation = mode;
  for (const [k, sp, al] of [[1.0, speed, a], [1.6, speed * 1.8, a * 0.7]]) {
    const tw = AW * 1.2 * k, th = h * k;
    c.globalAlpha = al;
    for (let x = -((t * sp * F) % tw); x < AW; x += tw) c.drawImage(tex, x, Y0 - (th - h) / 2, tw + 1, th);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = false;
}

// Glutpuls: Was im Bild glüht (Glutkarte), leuchtet in wandernden Flecken auf – Lava scheint zu fließen, Feuerschein
// zu wabern. vx, vy = Wanderung der Flecken in Kunstpixeln je Sekunde (Lava: bergab), a = Stärke
function emissive(st, A, name, t, a, { vx = 0, vy = 8 } = {}) {
  const em = A.glut[name];
  if (!em || a <= 0) return;
  const tg = st.tg, tex = A.pulse, s = tex.width;
  tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1;
  tg.clearRect(0, 0, AW, AH);
  const ox = ((Math.round(t * vx) % s) + s) % s, oy = ((Math.round(t * vy) % s) + s) % s;
  for (let y = oy - s; y < AH; y += s) for (let x = ox - s; x < AW; x += s) tg.drawImage(tex, x, y);
  tg.globalCompositeOperation = 'source-in';
  tg.drawImage(em, 0, 0);
  const c = st.c;
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a);
  c.drawImage(st.tmp, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

// Sterne funkeln: verlöschen kurz oder blitzen als kleines Kreuz auf
function twinkle(c, stars, t) {
  for (let i = 0; i < stars.length; i++) {
    const [x, y, bg] = stars[i];
    const ph = (t / (2.2 + hash(i, 61) * 3.5) + hash(i, 62)) % 1;
    if (ph < 0.16) { c.fillStyle = bg; c.fillRect(x, y, 1, 1); }
    else if (ph > 0.5 && ph < 0.57 && hash(i, 63) < 0.4) {
      c.globalAlpha = 0.45; c.fillStyle = '#dfe6ff'; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); c.globalAlpha = 1;
    }
  }
}

// Bildteil verziehen: Jeder Bildpunkt des Rechtecks (x, y, w, h in Kunstpixeln) wird aus dem Originalbild (px) von einer
// um ganze Bildpunkte versetzten Stelle geholt; fn(u, v) liefert den Versatz [dx, dy] für die Stelle u, v (0..1 im
// Rechteck). So bewegen sich gemalte Flammen, Stoffe oder Rauch, ohne dass eine neue Farbe entsteht. Der Versatz
// muss am Rand des Rechtecks auf null auslaufen, sonst reißt das Bild dort.
function warp(c, px, x, y, w, h, fn) {
  if (!px) return;
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.min(AW - x, Math.round(w)); h = Math.min(AH - y, Math.round(h));
  if (w < 1 || h < 1) return;
  const img = c.createImageData(w, h), o = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [dx, dy] = fn((i + 0.5) / w, (j + 0.5) / h);
    const sx = clamp(x + i - Math.round(dx), 0, AW - 1), sy = clamp(y + j - Math.round(dy), 0, AH - 1), k = (sy * AW + sx) * 4, q = (j * w + i) * 4;
    o[q] = px[k]; o[q + 1] = px[k + 1]; o[q + 2] = px[k + 2]; o[q + 3] = px[k + 3];
  }
  c.putImageData(img, x, y);
}
// Feuer brennt: Die gemalte Flamme jeder Feuerstelle [x Mitte, y Fuß, Breite, Höhe] züngelt (seitlich, nach oben
// stärker) und reckt sich; darüber lösen sich einzelne Funken. 12 Bilder je Sekunde, wie von Hand animiert.
// Direkt nach dem Bild aufrufen (überschreibt Bildpunkte).
const SPARK = ['#ffd868', '#ff9c22', '#f05c10'];
function flames(c, px, t, fires, seed = 0) {
  const tt = Math.floor(t * 12) / 12;
  fires.forEach(([fx, fy, fw, fh], f) => {
    const w = Math.max(6, fw * F * 1.5), h = fh * F * 1.5, yb = Math.round(fy * F), amp = clamp(fh * F / 13, 0.8, 2.6);
    warp(c, px, fx * F - w / 2, yb - h, w, h, (u, v) => {
      const up = 1 - v, side = 1 - Math.abs(2 * u - 1) ** 3, top = Math.min(1, v * 6);              // up: 0 am Fuß, 1 oben
      const dx = amp * up ** 0.8 * side * top * (Math.sin(tt * 10.5 - up * 5 + f * 2) + 0.6 * Math.sin(tt * 17 + up * 9 + u * 4 + f));
      const dy = amp * 0.9 * Math.sin(Math.PI * up) * side * Math.sin(tt * 13 + u * 7 + f * 3);       // recken und ducken
      return [dx, dy];
    });
    for (let i = 0; i < Math.ceil(w / 5); i++) {                                             // Funken lösen sich
      const P = 0.5 + hash(i, seed + f + 9) * 0.6, ph = t / P + hash(i, seed + f + 10), k = ph % 1, cyc = Math.floor(ph);
      const sx = fx * F + (hash(i + cyc * 13, seed + f + 11) - 0.5) * w * 0.5 + Math.sin(t * 6 + i) * k * 2;
      c.globalAlpha = 1 - k; c.fillStyle = SPARK[k < 0.3 ? 0 : k < 0.65 ? 1 : 2];
      c.fillRect(Math.round(sx), Math.round(yb - h * (0.35 + 0.75 * k)), 1, 1);
    }
    c.globalAlpha = 1;
  });
}

// Harte Pixellinie (Bresenham) in Kunstpixeln, w = Strichstärke
function pixelLine(c, x0, y0, x1, y1, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  for (let e = dx + dy, i = 0; i < 4000; i++) {
    c.fillRect(x0, y0, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// Risse im Siegel: verzweigte, kantige Pfade vom Mittelpunkt aus (fest gewürfelt, in Kunstpixeln), jeder mit Länge
// 0..1 entlang der Zeit
const SEAL = { x: 893, y: 410 };
function crackPaths() {
  const paths = [];
  const grow = (x, y, ang, len, depth, seed, start) => {
    const pts = [[x, y]];
    for (let i = 0; i < len; i++) {
      ang += (hash(i, seed) - 0.5) * 0.3;                              // Grundrichtung wandert kaum …
      const dir = ang + (hash(i, seed + 5) - 0.5) * 1.7;               // … jedes Stück knickt hart davon ab (Zickzack)
      const stp = (9 + hash(i, seed + 1) * 20) * F;
      x += Math.cos(dir) * stp; y += Math.sin(dir) * stp * 0.62;       // Siegel liegt flach: senkrecht gestaucht
      pts.push([x, y]);
      if (depth < 1 && hash(i, seed + 2) < 0.22) grow(x, y, ang + (hash(i, seed + 3) < 0.5 ? -1 : 1), Math.max(3, Math.floor(len * 0.45)), depth + 1, seed * 7 + i, start + (i / len) * 0.6);
    }
    paths.push({ pts, start });
  };
  for (let k = 0; k < 6; k++) grow(SEAL.x * F, SEAL.y * F, (k / 6) * Math.PI * 2 + hash(k, 3), 14 + Math.floor(hash(k, 4) * 7), 0, 100 + k * 13, hash(k, 9) * 0.3);
  return paths;
}
// k = wie weit die Risse gewachsen sind (0..1), heat > 1 = aufgebrochen (breiter, heller)
function drawCracks(c, paths, k, heat) {
  if (k <= 0) return;
  const open = heat > 1.25;
  const ends = paths.map((p) => {                                       // je Pfad: fertige Stücke und die wachsende Spitze
    const pos = clamp((k - p.start) / (1 - p.start)) * (p.pts.length - 1), n = Math.min(p.pts.length - 2, Math.floor(pos));
    return pos <= 0 ? null : { n, f: Math.min(1, pos - n) };
  });
  // Glutschein um die Risse (weich)
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = 3.5 * heat; c.strokeStyle = 'rgba(224,74,18,0.26)';
  paths.forEach((p, pi) => {
    const e = ends[pi]; if (!e) return;
    c.beginPath(); c.moveTo(p.pts[0][0], p.pts[0][1]);
    for (let i = 1; i <= e.n; i++) c.lineTo(p.pts[i][0], p.pts[i][1]);
    c.lineTo(lerp(p.pts[e.n][0], p.pts[e.n + 1][0], e.f), lerp(p.pts[e.n][1], p.pts[e.n + 1][1], e.f));
    c.stroke();
  });
  c.globalCompositeOperation = 'source-over';
  // Der Riss selbst: harte Pixellinie, an der wachsenden Spitze am hellsten
  paths.forEach((p, pi) => {
    const e = ends[pi]; if (!e) return;
    for (let i = 0; i <= e.n; i++) {
      const tip = i >= e.n - 1, [ax, ay] = p.pts[i];
      const bx = i < e.n ? p.pts[i + 1][0] : lerp(ax, p.pts[i + 1][0], e.f), by = i < e.n ? p.pts[i + 1][1] : lerp(ay, p.pts[i + 1][1], e.f);
      if (open) { c.fillStyle = '#ff9a3a'; pixelLine(c, ax, ay, bx, by, 2); }
      c.fillStyle = open || tip ? '#fff0c8' : '#ffb04a';
      pixelLine(c, ax, ay, bx, by, 1);
    }
  });
}

// Feuerstrahl: dichte, helle Funken schießen senkrecht hoch und fächern nach oben auf (zustandslos aus der Zeit).
// Kern weißgelb, außen orange; kurze senkrechte Striche statt Punkte, das liest sich als Tempo. Ort in Kunstpixeln.
function jet(c, tt, ox, oy, n, seed, power) {
  if (tt < 0 || power <= 0) return;
  c.save();                                                            // Schein des Strahls (hochkant gestreckt)
  c.translate(ox, oy); c.scale(1, 5.5);
  glowW(c, 0, -9, 13, 'rgba(255,200,110,1)', 0.55 * power);
  c.restore();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    if (hash(i, seed + 6) > power) continue;
    const P = 0.45 + hash(i, seed) * 0.5, ph = tt / P + hash(i, seed + 1), k = ph % 1, a = k * P;
    if (a > tt) continue;                                            // noch nicht gestartet
    const cyc = Math.floor(ph), side = hash(i + cyc * 77, seed + 2) - 0.5, v = 150 + hash(i + cyc * 77, seed + 3) * 150;
    c.globalAlpha = clamp(1.25 - k);
    c.fillStyle = Math.abs(side) < 0.18 && k < 0.5 ? '#fff4d0' : k < 0.55 ? '#ffc04a' : '#ff7a1c';
    c.fillRect(Math.round(ox + side * (3 + 28 * k)), Math.round(oy - v * a + 40 * a * a), 1, k < 0.35 ? 3 : 2);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}
// Lavafontäne: Funken werden vom Gipfel hochgeschleudert und fallen im Bogen zurück (zustandslos aus der Zeit).
// Jeder Funke ist ein Bildpunkt mit kurzem Schweif, kühlt von Hellgelb über Orange zu Dunkelrot ab. Ort in Kunstpixeln,
// scale = Wurfweite (kleine Spalten im Hang: unter 1). lava = deckend in Glutfarben statt additiv: vor dem hellen
// Hang brennt so nichts zu Weiß aus.
const FOUNT = ['#ffe9b0', '#ff9a3a', '#c2410e'], LAVA = ['#ffc452', '#f47a1e', '#b4380e'];
function fountain(c, tt, ox, oy, n, seed, power, scale = 1, lava = false) {
  if (tt < 0) return;
  const G = 105, cols = lava ? LAVA : FOUNT;
  c.globalCompositeOperation = lava ? 'source-over' : 'lighter';
  for (let i = 0; i < n; i++) {
    if (hash(i, seed + 6) > power) continue;
    const P = 1.4 + hash(i, seed) * 1.6, ph = tt + hash(i, seed + 1) * P, age = ph % P;
    if (age > tt) continue;                                          // noch nicht gestartet
    const cyc = Math.floor(ph / P);
    const ang = (hash(i + cyc * 131, seed + 2) - 0.5) * 1.0, v = (60 + hash(i + cyc * 131, seed + 3) * 105) * (0.55 + 0.45 * power) * scale;
    const vx = Math.sin(ang) * v * 0.55, vy = -Math.cos(ang) * v;
    const k = age / P;
    c.fillStyle = cols[k < 0.25 ? 0 : k < 0.6 ? 1 : 2];
    for (let j = 0; j < 4; j++) {
      const a = age - j * 0.03;
      if (a < 0) break;
      c.globalAlpha = clamp((1 - k) * (1 - j * 0.27));
      c.fillRect(Math.round(ox + vx * a), Math.round(oy + vy * a + 0.5 * G * a * a), 1, 1);
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}
// Lavabrocken: wenige große Funken auf weiten Bögen mit Leuchtspur; sie schlagen auf dem Hang auf und verglühen.
// ground(x) = Höhe des Hangs an der Stelle x (Kunstpixel)
function bombs(c, tt, ox, oy, n, seed, ground) {
  const G = 62, TRAIL = 48;                                            // Spur: 48 Schritte von 6 ms
  for (let i = 0; i < n; i++) {
    const a = tt - hash(i, seed) * 2.8;
    if (a < 0) continue;
    const dir = hash(i, seed + 1) < 0.5 ? -1 : 1;
    const vx = dir * (30 + hash(i, seed + 2) * 70), vy = -(62 + hash(i, seed + 3) * 62);
    const pos = (s) => [ox + vx * s, oy + vy * s + 0.5 * G * s * s];
    // Aufschlag suchen (der Bogen steigt erst, also ab dem Scheitel prüfen)
    let land = -vy / G;
    for (; land < 9; land += 0.04) { const [x, y] = pos(land); if (y >= ground(x)) break; }
    if (a < land) {
      c.globalCompositeOperation = 'lighter';
      let lx = -1, ly = -1;
      for (let j = TRAIL; j >= 1; j--) {                               // geschlossene Leuchtspur (Bildpunkt an Bildpunkt), der Kopf nur zwei Bildpunkte
        const s = a - j * 0.006; if (s < 0) continue;
        const [x, y] = pos(s), rx = Math.round(x), ry = Math.round(y);
        if (rx === lx && ry === ly) continue;
        lx = rx; ly = ry;
        const q = j / TRAIL;
        c.globalAlpha = 0.9 * (1 - q) ** 1.4; c.fillStyle = q < 0.22 ? '#ffb04a' : q < 0.55 ? '#ff7a1c' : '#c2410e';
        c.fillRect(rx, ry, 1, 1);
      }
      c.globalAlpha = 1;
      const [x, y] = pos(a);
      c.fillStyle = '#fff0c8'; c.fillRect(Math.round(x), Math.round(y), 1, 2);
      c.globalCompositeOperation = 'source-over';
    } else {
      const [x, y] = pos(land), d = a - land;
      glowW(c, x, y, 14 - 6 * clamp(d / 1.6), 'rgba(255,140,50,1)', 0.75 * (1 - clamp(d / 1.6)));
      if (d < 0.5) {                                                   // Spritzer
        c.fillStyle = d < 0.2 ? '#fff0c8' : '#ff9a3a';
        for (let j = 0; j < 5; j++) {
          const ang = -0.4 - hash(i * 9 + j, seed + 4) * 2.3, sp = 16 + hash(i * 9 + j, seed + 5) * 22;
          c.fillRect(Math.round(x + Math.cos(ang) * sp * d), Math.round(y + Math.sin(ang) * sp * d + 40 * d * d), 1, 1);
        }
      }
    }
  }
}

// Blitz im Gewölk: kurzes doppeltes Aufleuchten
function lightning(c, t, at, x, y) {
  const k = t - at;
  if (k < 0 || k > 0.5) return;
  const a = (k < 0.08 ? 1 : k < 0.16 ? 0.25 : k < 0.24 ? 0.8 : 1 - (k - 0.24) / 0.26) * 0.9;
  glow(c, x, y, 520, 'rgba(190,200,255,1)', a * 0.55);
  veil(c, '#c8d0ff', a * 0.1);
}

// ------------------------------------------------------------------------------------------------ Einstellungen
// Jede Einstellung zeichnet ihre Szene auf die Weltfläche (st.c), zeigt sie durch die Kamera (st.show) und legt
// danach Blenden über das fertige Bild. t = Zeit in der Einstellung, T = Zeit im Film.

// 1 – Schwärze. Ein einzelner Funke sinkt und landet.
function shotSpark(st, t) {
  const c = st.c;
  black(c);
  const at = (s) => { const k = clamp(s / LAND); return [AW * 0.5 + Math.sin(s * 2.2) * 26 * F * (1 - k), lerp(-6, AH * 0.62, ease(k))]; };
  const [x, y] = at(t);
  glowW(c, x, y, 24, 'rgba(255,150,50,1)', 0.5 + 0.08 * Math.sin(t * 13));
  for (let j = 4; j >= 1; j--) {                                       // Leuchtspur
    const [tx, ty] = at(t - j * 0.07);
    c.globalAlpha = 0.6 * (1 - j / 5); c.fillStyle = j < 3 ? '#ff8a2a' : '#c2410e';
    c.fillRect(Math.round(tx), Math.round(ty), 1, 1);
  }
  c.globalAlpha = 1;
  c.fillStyle = '#ffd27a'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  c.fillStyle = '#fff6dc'; c.fillRect(Math.round(x) - (Math.sin(t * 13) > 0 ? 1 : 0), Math.round(y) - 1, 1, 1);
  st.show(FULL);
}

// 2 – Die Zitadelle auf dem Vulkan, Sturm darüber. Langsam heran. „Man nennt mich ein Ungeheuer.“
const PEAK = [940, 120];
const TIP = [352, 31];                 // Spitze des Hauptturms (Kunstpixel): hier bricht die Glut hervor
// Spalten im Hang entlang der Lavaadern [x, y in Kunstpixeln, Beginn in s nach dem Ausbruch]: der Berg reißt auf
const VENTS = [[352, 124, 0.2], [322, 150, 0.55], [386, 158, 0.85], [290, 172, 1.25], [424, 186, 1.55]];
function citadelLife(c, t, boost = 0) {
  glow(c, PEAK[0], PEAK[1] + 100, 260, 'rgba(255,90,20,1)', (0.22 + boost) * flick(t, 1));
  glow(c, 960, 540, 260, 'rgba(255,90,20,1)', (0.16 + boost * 0.5) * flick(t, 2));
  glow(c, 1040, 470, 120, 'rgba(255,120,30,1)', 0.2 * flick(t, 3));
}
function shotCitadel(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.zitadelle, 0, 0, AW, AH);
  emissive(st, A, 'zitadelle', t, 0.45);
  citadelLife(c, t);
  fog(c, A, t, { col: '#5a3a3a', a: 0.22, speed: 30, y0: 0, y1: 340 });
  fog(c, A, t + 9, { col: '#2a2232', a: 0.3, speed: 55, y0: 400, y1: 768 });
  lightning(c, t, 2.6, 1500, 120);
  embers(c, t, 60, 20, { rise: 40, drift: 70 });
  st.show(camera({ cx: 896, cy: 400, z: 1.0 }, { cx: 930, cy: 330, z: 1.22 }, glide(t / dur)));
  st.flash(t, 0, 0.5, '#ff9a40', 0.3);
  st.veil('#000', 1 - ease((t - 0.1) / 2.0));
}

// 3 – Der Thronsaal, vom Eingang aus. Feuer in allen Schalen, ganz hinten eine kleine Gestalt auf dem Thron.
// Feuerstellen: [x Mitte, y Fuß der Flamme, Breite, Höhe]
const HALL_FIRES = [[192, 355, 80, 90], [1600, 355, 80, 90], [460, 437, 48, 58], [1333, 437, 48, 58], [596, 483, 27, 32], [1200, 483, 27, 32],
  [679, 515, 21, 24], [1111, 515, 21, 24], [19, 496, 35, 43], [1771, 496, 37, 53], [291, 525, 21, 24], [1496, 528, 21, 24]];
function shotHall(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.halle, 0, 0, AW, AH);
  flames(c, A.px.halle, t, HALL_FIRES, 40);
  emissive(st, A, 'halle', t, 0.3, { vy: -7 });                                        // Feuerschein wabert nach oben
  HALL_FIRES.forEach(([x, y, w], i) => glow(c, x, y - 30, w * 1.9, 'rgba(255,130,40,1)', 0.38 * flick(t, i)));
  glow(c, 896, 195, 200, 'rgba(255,120,30,1)', 0.18 + 0.1 * Math.sin(t * 1.4));      // Rundfenster atmet
  glow(c, 896, 680, 240, 'rgba(255,110,30,1)', 0.12 * flick(t, 9));                 // Spiegelung im Boden
  fog(c, A, t, { col: '#ff7a30', a: 0.08, speed: 16, y0: 180, y1: 600, mode: 'lighter' });
  fog(c, A, t + 5, { col: '#2a1414', a: 0.16, speed: 10, y0: 260, y1: 540 });
  embers(c, t, 80, 21, { rise: 50, drift: 20, big: 0.9 });
  st.show(camera({ cx: 896, cy: 384, z: 1.0 }, { cx: 896, cy: 380, z: 1.45 }, glide(t / dur)));
}

// 4 – Malgareth auf dem Balkon seiner Zitadelle, von hinten, über seinem Land. „Nicht sterben.“
// Zwei Ebenen: Himmel und Land hinten, König, Brüstung und Mauer vorn; die vordere fährt stärker mit (Tiefe).
const BALCONY_FIRES = [[27, 347, 22, 28]];
function shotBalcony(st, t, dur, A) {
  const c = st.c, a = { cx: 820, cy: 400, z: 1.0 }, b = { cx: 760, cy: 380, z: 1.18 };
  const cam = camera(a, b, glide(t / dur));
  c.drawImage(A.images.balkon, 0, 0, AW, AH);
  twinkle(c, A.stars.balkon, t);
  emissive(st, A, 'balkon', t, 0.5, { vx: 2, vy: 5 });
  glow(c, 1250, 560, 300, 'rgba(255,90,20,1)', 0.12 * flick(t, 3));
  fog(c, A, t, { col: '#454a6e', a: 0.2, speed: 34, y0: 340, y1: 768 });
  fog(c, A, t + 6, { col: '#6a3a2a', a: 0.1, speed: 20, y0: 130, y1: 360 });
  embers(c, t, 30, 22, { rise: 30, drift: 90 });
  st.show(cam);
  st.clear();
  c.drawImage(A.images['balkon-v'], 0, 0, AW, AH);
  flames(c, A.px['balkon-v'], t, BALCONY_FIRES, 41);
  emissive(st, A, 'balkon-v', t, 0.4);
  fog(c, A, t + 3, { col: '#454a6e', a: 0.12, speed: 34, y0: 380, y1: 768, mode: 'source-atop' });      // Dunst nur auf dem Vordergrund
  glow(c, 27, 330, 90, 'rgba(255,130,40,1)', 0.4 * flick(t, 1));
  glow(c, 248, 318, 60, 'rgba(255,130,40,1)', 0.35 * flick(t, 2));
  embers(c, t, 22, 23, { rise: 30, drift: 90, big: 1.2 });
  st.show(nearer(cam, camera(a, b, 0), 1.3));
  st.veil('#000', 1 - ease(t / 0.5));
}

// 5 – Erinnerung: die fünf Könige ziehen zur Zitadelle
function shotKings(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.koenige, 0, 0, AW, AH);
  emissive(st, A, 'koenige', t, 0.45, { vy: 6 });
  glow(c, 1350, 230, 260, 'rgba(255,80,20,0.8)', 0.18 * flick(t, 3));
  glow(c, 900, 560, 700, 'rgba(255,80,20,0.8)', 0.08 * flick(t, 7));
  fog(c, A, t, { col: '#3a2626', a: 0.22, speed: 70, y0: 420, y1: 768 });
  embers(c, t, 90, 7, { rise: 70, drift: 60, big: 1.1 });
  veil(c, '#1a0804', 0.14);                                         // Erinnerung: leicht gedämpft und warm
  st.show(camera({ cx: 780, cy: 400, z: 1.18 }, { cx: 1010, cy: 380, z: 1.08 }, glide(t / dur)));
  st.veil('#000', 1 - ease(t / 0.45));
}

// 6 – Die fünf Könige vor dem Tor der Zitadelle. Hinter dem Spalt glüht es, die Glut drückt nach außen.
const GATE_FIRES = [[312, 488, 28, 42], [1480, 488, 28, 42], [579, 325, 14, 20], [1213, 325, 14, 20]];
function shotGate(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.tor, 0, 0, AW, AH);
  flames(c, A.px.tor, t, GATE_FIRES, 42);
  emissive(st, A, 'tor', t, 0.5, { vy: -6 });
  const surge = 0.5 + 0.5 * Math.sin(t * 3.2);
  glow(c, 893, 250, 60, 'rgba(255,150,50,1)', 0.3 + 0.25 * surge);
  glow(c, 893, 80, 60, 'rgba(255,150,50,1)', 0.2 + 0.2 * surge);
  GATE_FIRES.forEach(([x, y], i) => glow(c, x, y - 18, 70, 'rgba(255,130,40,1)', 0.35 * flick(t, i)));
  fog(c, A, t, { col: '#3a3e5a', a: 0.22, speed: 26, y0: 430, y1: 768 });
  embers(c, t, 50, 24, { rise: -24, drift: 30, big: 0.8, warm: 0 });   // Asche fällt
  embers(c, t, 26, 29, { rise: 40, drift: 20, big: 0.9 });
  veil(c, '#1a0804', 0.08);
  st.show(camera({ cx: 896, cy: 430, z: 1.02 }, { cx: 896, cy: 380, z: 1.22 }, glide(t / dur), quake(t, 1.9, 0.6, 5)));
  st.flash(t, 1.9, 0.25, '#ffb060', 0.25);
}

// 7 – Der Bann: eine Säule aus Licht schießt aus der Zitadelle, ein Runenring kreist am Himmel. Am Ende weiß.
const RING = { x: 895, y: 122, rx: 375, ry: 104 };
function runeRing(c, t, a) {
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * Math.PI * 2 + t * 0.35;
    const x = (RING.x + Math.cos(ang) * RING.rx) * F, y = (RING.y + Math.sin(ang) * RING.ry) * F;
    const front = 0.55 + 0.45 * Math.sin(ang);                     // vordere Hälfte heller
    c.globalAlpha = clamp(a * front * (0.5 + 0.5 * Math.sin(t * 6 + i)));
    c.fillStyle = i % 4 ? '#ffd890' : '#fff6dc';
    const s = i % 4 ? 1 : 2;
    c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function shotPillar(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.lichtsaeule, 0, 0, AW, AH);
  const grow = ease(t / 1.6), pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
  emissive(st, A, 'lichtsaeule', t, 0.4 * grow, { vy: -14 });                           // das Licht strömt nach oben
  glow(c, 896, 200, 280, 'rgba(255,240,190,1)', (0.25 + 0.15 * pulse) * grow);
  glow(c, 896, 60, 520, 'rgba(255,220,140,1)', (0.12 + 0.06 * pulse) * grow);
  runeRing(c, t, 0.7 * grow);
  fog(c, A, t, { col: '#ffe6b0', a: 0.1 * grow, speed: 40, y0: 60, y1: 430, mode: 'lighter' });
  embers(c, t, 70, 25, { rise: 110, drift: 30 });
  st.show(camera({ cx: 896, cy: 470, z: 1.3 }, { cx: 896, cy: 384, z: 1.02 }, glide(t / dur), quake(t, 0, 1.0, 8)));
  st.flash(t, 0, 0.5, '#fff4dc', 0.85);
  const end = dur - t;
  if (end < 1.3) st.veil('#fff8e8', ease(1 - end / 1.3));
}

// 8 – Das Siegel. Tausend Jahre Staub, dann reißt es auf.
function shotSeal(st, t, dur, A, T) {
  const c = st.c;
  c.drawImage(A.images.siegel, 0, 0, AW, AH);
  glow(c, 1330, 40, 360, 'rgba(150,160,230,1)', 0.1 + 0.04 * Math.sin(t * 0.9));     // Lichtspalt in der Decke
  fog(c, A, t, { col: '#6a6a90', a: 0.1, speed: 8, y0: 60, y1: 700 });
  dust(c, t, 70, 11, { x0: 950, rise: 4 });
  const crack = clamp((T - (BREAK - 3.2)) / 3.2);
  const heat = 1 + clamp((T - BREAK) / 0.4) * 0.6;
  glow(c, SEAL.x, SEAL.y, 100 + 300 * crack, 'rgba(255,110,30,1)', 0.1 + 0.3 * crack ** 2);
  drawCracks(c, A.cracks, crack, heat);
  if (T >= BREAK) {
    glow(c, SEAL.x, SEAL.y, 700, 'rgba(255,150,60,1)', 0.4 * (1 - clamp((T - BREAK) / 1.1)));
    embers(c, T - BREAK, 110, 12, { rise: 320, drift: 80, big: 1.6, y0: 100 });
  }
  st.show(camera({ cx: 896, cy: 380, z: 1.0 }, { cx: SEAL.x, cy: SEAL.y, z: 1.5 }, glide(t / dur), quake(T, BREAK - 0.5, 1.4, 14)));
  st.veil('#000', 1 - ease((t - 0.1) / 1.4));
  st.flash(T, BREAK, 0.5, '#ffd8a0', 0.9);
  if (dur - t < 0.45) st.veil('#000', ease(1 - (dur - t) / 0.45));
}

// 9 – Die Halle nach tausend Jahren: kalt, verstaubt, Mondlicht auf der steinernen Gestalt. „Ich bin nicht zornig.“
// Dann glimmt es in den Bodenrissen und in den Augen der Statue (zwei Bildpunkte, Kunstpixel).
const EYES = [[336, 154], [338, 154]];
function shotDust(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images['halle-staub'], 0, 0, AW, AH);
  glow(c, 900, 250, 260, 'rgba(170,185,255,1)', 0.14 + 0.04 * Math.sin(t * 1.1));      // Mondstrahl
  dust(c, t, 80, 26, { x0: 640, x1: 1150, rise: -5, drift: 10 });
  fog(c, A, t, { col: '#7a80a8', a: 0.1, speed: 6, y0: 380, y1: 768 });
  const wake = clamp((t - 2.0) / 1.6);
  [[1060, 650], [1240, 730], [760, 700]].forEach(([x, y], i) => glow(c, x, y, 90, 'rgba(255,90,20,1)', wake * 0.5 * flick(t, i)));
  if (wake > 0) {
    glowW(c, (EYES[0][0] + EYES[1][0]) / 2 + 0.5, EYES[0][1] + 0.5, 6, 'rgba(255,120,40,1)', 0.55 * wake);
    c.globalAlpha = wake; c.fillStyle = '#ffc060';
    EYES.forEach(([x, y]) => c.fillRect(x, y, 1, 1));
    c.globalAlpha = 1;
  }
  st.show(camera({ cx: 896, cy: 400, z: 1.05 }, { cx: 898, cy: 420, z: 1.5 }, glide(t / dur)));
  st.veil('#000', 1 - ease(t / 0.9));
}

// 10 – Der Ausbruch: zurück bei der Zitadelle. Der Berg reißt auf, Glut schießt in den Himmel, Lavabrocken fliegen
// in weiten Bögen, die Lavaadern leuchten auf. „Nur geduldig.“
function shotEruption(st, t, dur, A, T) {
  const c = st.c, e = T - ROAR, burst = 1 - clamp(e / 3.5);
  c.drawImage(A.images.zitadelle, 0, 0, AW, AH);
  emissive(st, A, 'zitadelle', t, 0.5 + 0.5 * burst, { vy: 14 });
  citadelLife(c, t, 0.1 + 0.2 * burst);
  glow(c, PEAK[0], PEAK[1], 200 + 160 * burst, 'rgba(255,150,50,1)', 0.2 + 0.3 * burst);
  glow(c, PEAK[0], PEAK[1] - 30, 70, 'rgba(255,230,160,1)', 0.5 * burst + 0.15);
  fog(c, A, t, { col: '#ff6a20', a: 0.06, speed: 45, y0: 0, y1: 300, mode: 'lighter' });
  fog(c, A, t + 3, { col: '#1a1218', a: 0.28, speed: 70, y0: 0, y1: 270 });
  const [px, py] = TIP;
  jet(c, e, px, py, 230, 36, 0.3 + 0.7 * burst);
  fountain(c, e, px, py, 260, 30, 0.35 + 0.65 * burst);
  VENTS.forEach(([x, y, at], i) => {
    const k = e - at;
    if (k < 0) return;
    const pw = clamp(k / 0.25) * (1 - 0.7 * clamp((k - 1.2) / 3.2));
    glowW(c, x, y, 15, 'rgba(255,150,50,1)', 0.6 * pw * flick(t, i + 4));
    fountain(c, k, x, y, 70, 50 + i * 7, pw, 0.55, true);
  });
  bombs(c, e, px, py, 16, 33, (x) => { const d = Math.abs(x - px); return d < 55 ? 118 : Math.min(118 + (d - 55) * 0.45, 200); });
  embers(c, t, 60, 28, { rise: 60, drift: 60 });
  lightning(c, t, 2.4, 1450, 140);
  lightning(c, t, 4.6, 330, 100);
  st.show(camera({ cx: 930, cy: 275, z: 1.4 }, { cx: 920, cy: 300, z: 1.15 }, glide(t / dur), quake(T, ROAR, 2.2, 22)));
  st.flash(T, ROAR - 0.15, 0.7, '#ffe0b0', 0.95);
  if (dur - t < 0.5) st.veil('#000', ease(1 - (dur - t) / 0.5));
}

// 11 – Die Glutsenke bei Nacht. Ein einsamer Wanderer auf dem Hügel.
function shotHollow(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.glutsenke, 0, 0, AW, AH);
  twinkle(c, A.stars.glutsenke, t);
  emissive(st, A, 'glutsenke', t, 0.55, { vx: 3, vy: 5 });
  glow(c, 1075, 215, 140, 'rgba(255,100,30,1)', 0.25 * flick(t, 5));
  glow(c, 980, 590, 160, 'rgba(255,90,20,0.9)', 0.15 * flick(t, 6));
  fog(c, A, t, { col: '#46506e', a: 0.16, speed: 22, y0: 290, y1: 600 });
  embers(c, t, 44, 15, { rise: 26, drift: 40, big: 0.9 });
  st.show(camera({ cx: 760, cy: 400, z: 1.22 }, { cx: 1120, cy: 384, z: 1.1 }, glide(t / dur)));
  st.veil('#000', 1 - ease(t / 1.0));
}

// 12 – Über die Schulter des Wanderers: die Zitadelle glüht. Zwei Ebenen: das Tal hinten, der Wanderer vorn.
function shotWanderer(st, t, dur, A) {
  const c = st.c, a = { cx: 760, cy: 400, z: 1.0 }, b = { cx: 1080, cy: 320, z: 1.28 };
  const cam = camera(a, b, glide(t / dur));
  c.drawImage(A.images.wanderer, 0, 0, AW, AH);
  twinkle(c, A.stars.wanderer, t);
  emissive(st, A, 'wanderer', t, 0.5, { vy: 7 });
  glow(c, 1370, 230, 220, 'rgba(255,100,30,1)', 0.22 + 0.12 * Math.sin(t * 1.8));
  fog(c, A, t, { col: '#3a3e5e', a: 0.18, speed: 28, y0: 290, y1: 610 });
  fog(c, A, t + 4, { col: '#5a2a1a', a: 0.14, speed: 14, y0: 0, y1: 270 });
  embers(c, t, 40, 16, { rise: 30, drift: 70 });
  st.show(cam);
  st.clear();
  c.drawImage(A.images['wanderer-v'], 0, 0, AW, AH);
  emissive(st, A, 'wanderer-v', t, 0.4, { vx: 4, vy: -3 });                              // der Glutschein auf dem Umhang lebt
  embers(c, t, 26, 18, { rise: 30, drift: 70, big: 1.3 });
  st.show(nearer(cam, camera(a, b, 0), 1.15));
  if (dur - t < 0.6) st.veil('#000', ease(1 - (dur - t) / 0.6));
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
// Schriftzug als Pixelgrafik im Stil des Spiel-Logos (src/gfx/Logo.js): die Buchstabenformen der Titelschrift hart
// gerastert, Glutverlauf von Weißgelb nach Tiefrot, Lichtkante oben, dunkle Kontur, Schlagschatten.
// width = Breite der Schrift in Kunstpixeln. Liefert das Bild, die reine Buchstabenfläche (für den Lichtstreif) und Maße.
const RAMP = ['#fff8d8', '#ffeaa0', '#ffd46a', '#ffbc48', '#ffa030', '#f78424', '#ef6a1c', '#dc5016', '#c83c12', '#b02e10', '#94220e', '#7a180c'];
function titleArt(font, text = 'EMBERWRATH', width = 320) {
  const SS = 4, m = canvas(4, 4).getContext('2d');
  m.font = `700 100px ${font}`;
  const adv = [...text].map((ch) => m.measureText(ch).width), track = 14;
  const size = (100 * width) / (adv.reduce((a, b) => a + b, 0) + track * (text.length - 1));
  const pad = 5, w = width + pad * 2, h = Math.ceil(size) + pad * 2;
  const big = canvas(w * SS, h * SS), bg = big.getContext('2d', { willReadFrequently: true });
  bg.font = `700 ${size * SS}px ${font}`; bg.textBaseline = 'alphabetic'; bg.fillStyle = '#fff';
  let x = pad * SS;
  [...text].forEach((ch, i) => { bg.fillText(ch, x, (pad + size * 0.86) * SS); x += ((adv[i] + track) * size / 100) * SS; });
  // Deckung je Kunstpixel → harte Buchstabenfläche
  const src = bg.getImageData(0, 0, w * SS, h * SS).data, mask = new Uint8Array(w * h);
  let top = h, bottom = 0;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    let s = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += src[((y * SS + j) * w * SS + xx * SS + i) * 4 + 3];
    if (s >= 255 * SS * SS * 0.45) { mask[y * w + xx] = 1; top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const at = (xx, y) => (xx >= 0 && y >= 0 && xx < w && y < h ? mask[y * w + xx] : 0);
  const cv = canvas(w, h), g = cv.getContext('2d'), mk = canvas(w, h), mg = mk.getContext('2d');
  const px = (xx, y, col) => { g.fillStyle = col; g.fillRect(xx, y, 1, 1); };
  mg.fillStyle = '#fff';
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    if (at(xx, y)) {
      mg.fillRect(xx, y, 1, 1);
      const row = Math.min(RAMP.length - 1, Math.floor(((y - top) / (bottom - top + 1)) * RAMP.length));
      let col = RAMP[row];
      if (!at(xx, y - 1)) col = '#fffcec';                                              // Oberkante: Licht
      else if (!at(xx - 1, y) && row < 8) col = RAMP[Math.max(0, row - 3)];             // linke Fase heller
      else if (!at(xx + 1, y) || !at(xx, y + 1)) col = '#5a1008';                       // rechte/untere Fase dunkel
      px(xx, y, col);
    } else if (at(xx + 1, y) || at(xx - 1, y) || at(xx, y + 1) || at(xx, y - 1)) px(xx, y, '#1a0604');   // Kontur
    else if (at(xx - 1, y - 2) || at(xx - 1, y - 1)) px(xx, y, 'rgba(10,2,4,0.8)');                       // Schlagschatten
  }
  return { cv, mask: mk, w, h, top, bottom };
}

// 13 – Titel: EMBERWRATH über der dunklen Zitadelle. Ein Lichtstreif läuft über die Buchstaben, Glut steigt.
function shotTitle(st, t, dur, A) {
  const c = st.c, T = A.title;
  c.drawImage(A.images.zitadelle, 0, 0, AW, AH);
  emissive(st, A, 'zitadelle', t, 0.4);
  citadelLife(c, t);
  veil(c, '#000', 0.74);
  fog(c, A, t, { col: '#2a1c22', a: 0.35, speed: 30, y0: 230, y1: 768 });
  const x0 = Math.round(930 * F - T.w / 2), y0 = Math.round(268 * F - T.h / 2);
  const mx = Math.round(x0 + T.w / 2), my = y0 + (T.top + T.bottom) / 2, show = ease(t / 1.4);
  glowW(c, mx, my, T.w * 0.62, 'rgba(224,74,18,1)', 0.22 * show * (0.85 + 0.15 * Math.sin(t * 2)));     // Glutschein dahinter
  c.globalAlpha = show; c.drawImage(T.cv, x0, y0); c.globalAlpha = 1;
  // Lichtstreif von links nach rechts, nur auf den Buchstaben
  const sweep = lerp(-40, T.w + 40, clamp((t - 0.7) / 1.5));
  if (sweep > -40 && sweep < T.w + 40) {
    const tg = st.tg;
    tg.globalCompositeOperation = 'source-over'; tg.globalAlpha = 1;
    tg.clearRect(0, 0, AW, AH);
    tg.drawImage(T.mask, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    const sg = tg.createLinearGradient(sweep - 26, 0, sweep + 26, 0);
    sg.addColorStop(0, 'rgba(255,236,200,0)'); sg.addColorStop(0.5, 'rgba(255,240,210,0.9)'); sg.addColorStop(1, 'rgba(255,236,200,0)');
    tg.fillStyle = sg; tg.fillRect(0, 0, T.w, T.h);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(st.tmp, 0, 0, T.w, T.h, x0, y0, T.w, T.h);
    c.globalCompositeOperation = 'source-over';
  }
  // Zierlinie mit Raute (wie im Logo), wächst aus der Mitte
  const reach = T.w * 0.42, half = Math.round(ease((t - 1.0) / 1.2) * reach), ly = y0 + T.bottom + 9;
  for (let d = 5; d < half; d++) {
    c.globalAlpha = 0.2 + 0.8 * (1 - d / reach);
    c.fillStyle = '#e8b45a'; c.fillRect(mx + d, ly, 1, 1); c.fillRect(mx - d, ly, 1, 1);
  }
  c.globalAlpha = ease((t - 0.9) / 0.4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > 2) continue;
    c.fillStyle = d === 2 ? '#1a0604' : d === 0 ? '#fff8d8' : dy < 0 || (dy === 0 && dx < 0) ? '#ffe08a' : '#c87a20';
    c.fillRect(mx + dx, ly + dy, 1, 1);
  }
  c.globalAlpha = 1;
  embers(c, t, 80, 17, { rise: 50, drift: 30 });
  st.show(camera({ cx: 930, cy: 300, z: 1.25 }, { cx: 930, cy: 290, z: 1.32 }, t / dur));
  st.flash(t, 0, 0.5, '#ff9a40', 0.3);
  st.veil('#000', 1 - ease(t / 0.6));
}
