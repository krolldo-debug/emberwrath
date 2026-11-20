// Werbe-Trailer im Stil des Intro-Films (src/intro/film.js), Hochformat 9:16 für TikTok, Instagram Reels und YouTube Shorts.
// Malgareth spricht: kein Gameplay, gemalte Szenen im festen Pixelraster 360 × 640 (× 3 = 1080 × 1920), bewegt durch
// Kamerafahrten, Rauch, Glut, Flammen, Lava, Sterne. Die Bilder entstehen mit tools/trailer/bilder.py, der Ton mit
// tools/trailer/ton.py, das Video mit tools/trailer/render.mjs. Die Zeichenhilfen sind aus dem Intro übernommen.
// Bildstellen und Kameraorte sind in Pixeln der KI-Vorlagen angegeben (864 × 1536, F rechnet um).
const AW = 360, AH = 640, SW = 864, SH = 1536, F = AW / SW;

// Sprechtexte je Film (Schlüssel = deutscher Text). Dauern: von tools/trailer/ton.py gemessen.
const T1_LINES = [
  { t: 0.6, text: 'Tausend Jahre lag ich unter dem Stein.' },
  { t: 6.05, text: 'Jetzt brennt die Welt wieder.' },
  { t: 9.7, text: 'In jeder Tiefe wartet einer meiner Diener.' },
  { t: 14.4, text: 'Ihr kommt zu dritt.' },
  { t: 16.8, text: 'Ihr kommt beritten.' },
  { t: 20, text: 'Ihr reißt sogar den Himmel auf.' },
  { t: 25.1, text: 'Doch auch über den Wolken warte ich.' },
  { t: 28.9, text: 'Komm, Wanderer.' },
  { t: 30.6, text: 'Zeig mir, wie lange du brennst.' },
];
// Kurzfassung für Anzeigen (15 s): dieselbe Stimme, vier Sätze (v = Nummer der Aufnahme aus Film 1)
const T2_LINES = [
  { t: 0.5, text: 'Jetzt brennt die Welt wieder.', v: 1 },
  { t: 3.75, text: 'Ihr kommt zu dritt.', v: 3 },
  { t: 5.9, text: 'Ihr kommt beritten.', v: 4 },
  { t: 9.9, text: 'Komm, Wanderer.', v: 7 },
];
// Trailer 3 „Niemand außer dir“: ein Erzähler statt Malgareth, neue Szenen
const T3_LINES = [
  { t: 0.6, text: 'Fünf Könige haben ihn einst gebannt.' },
  { t: 4.9, text: 'Ihr Siegel ist gebrochen.' },
  { t: 7.2, text: 'Niemand ist mehr da, der ihn aufhält.' },
  { t: 10.8, text: 'Niemand außer dir.' },
  { t: 13.9, text: 'Steig hinab in die Tiefe.' },
  { t: 17.5, text: 'Erklimme die Frostzinnen.' },
  { t: 21.9, text: 'Reise über die Wolken.' },
  { t: 25.3, text: 'Und stürze den Aschenfürsten.' },
];
// <ton> – von tools/trailer/ton.py geschrieben
const TIMING = {"t1": [4.54, 3.4, 4.53, 1.98, 2.15, 4.31, 2.98, 1.35, 3.47], "t2": [3.4, 1.98, 2.15, 1.35], "t3": [3.75, 1.72, 3.24, 2.27, 1.89, 2.38, 1.71, 2.13]};
// </ton>

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
      const gr = g.createRadialGradient(OW / 2, OH / 2, Math.min(OW, OH) * 0.5, OW / 2, OH / 2, Math.max(OW, OH) * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vig = { w: OW, h: OH, gr };
    }
    g.fillStyle = this.vig.gr; g.fillRect(0, 0, OW, OH);
  }
}

// ------------------------------------------------------------------------------------------------ Zeichnen auf der Weltfläche
// Alles hier zeichnet in Kunstpixeln auf c (Weltfläche). Bildstellen, Radien und Geschwindigkeiten kommen in
// Vorlagenpixeln (864 breit), außer wo „Kunstpixel“ steht.
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
function embers(c, t, n, seed, { rise = 60, drift = 30, x0 = 0, x1 = SW, y0 = 0, y1 = SH, big = 1, warm = 1, dir = -1 } = {}) {
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
function fog(c, A, t, { col = '#8a7a9a', a = 0.18, speed = 18, y0 = 0, y1 = SH, mode = 'source-over' } = {}) {
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

// Titelschrift (Cinzel, wie auf der Website). Fehlt sie, eine Serifenschrift des Systems.
async function titleFont() {
  for (const u of ['/fonts/cinzel-latin-700-normal.woff2', '/site/fonts/cinzel-latin-700-normal.woff2']) {
    try {
      const f = new FontFace('TrailerTitel', `url(${new URL(u, location.href).href})`, { weight: '700' });
      await f.load();
      document.fonts.add(f);
      return '"TrailerTitel"';
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


// ------------------------------------------------------------------------------------------------ Einstellungen
const SKY = { riss: 1000, inseln: 330, zitadelle: 0, koenige: 300, dorf: 240 };
const GLOW_KIND = { inseln: null };
const IMAGES = ['zitadelle', 'boss', 'reiter', 'riss', 'inseln', 'thron', 'koenige', 'frost', 'dorf'];
// Ein Film: Einstellungen (o = Zeitpunkte in der Einstellung), Sprechtexte, Endkarte = letzte Einstellung
function makeFilm(id, who, lines, shots) {
  const duration = shots.at(-1).t1, card = shots.at(-1).t0;
  return {
    id, width: AW, height: AH, duration, card, lines, who,
    timing() {
      const d = TIMING[id] ?? [];
      return lines.map((l, i) => ({ who, text: l.text, t0: l.t - 0.1, t1: l.t + (d[i] ?? 0.9 + l.text.length * 0.065) + 0.3 }));
    },
    // Bild zur Zeit t bildfüllend auf g (beliebige Größe im Seitenverhältnis 9:16)
    draw(g, t, A) {
      const shot = shots.find((s) => t < s.t1) ?? shots.at(-1);
      const st = A.stage;
      st.begin(g);
      shot.draw(st, t - shot.t0, shot.t1 - shot.t0, A, t, shot.o);
      st.vignette();
    },
    overlay(g, t, A, tr) { endCard(g, t - card, duration - card, A, tr); },
  };
}
export const FILMS = {
  // Trailer 1 „Malgareth spricht“ (41,8 s)
  t1: makeFilm('t1', 'Malgareth', T1_LINES, [
    { t0: 0, t1: 9.3, draw: shotCitadel },
    { t0: 9.3, t1: 16.5, draw: shotBoss },
    { t0: 16.5, t1: 19.7, draw: shotRider },
    { t0: 19.7, t1: 24.8, draw: shotRift },
    { t0: 24.8, t1: 28.6, draw: shotIslands },
    { t0: 28.6, t1: 34.3, draw: shotThrone },
    { t0: 34.3, t1: 37.8, draw: shotTitle },
    { t0: 37.8, t1: 41.8, draw: shotEnd },
  ]),
  // Trailer 2: Kurzfassung für Anzeigen (15 s), schnelle Schnitte
  t2: makeFilm('t2', 'Malgareth', T2_LINES, [
    { t0: 0, t1: 2.8, draw: shotCitadel, o: { erupt: 0.3, zoom: [1.12, 1.4] } },
    { t0: 2.8, t1: 5.6, draw: shotBoss, o: { flare: 0.35, fast: true } },
    { t0: 5.6, t1: 7.8, draw: shotRider, o: { hold: 1.5 } },
    { t0: 7.8, t1: 9.8, draw: shotRift, o: { tear: 0.45 } },
    { t0: 9.8, t1: 11.6, draw: shotThrone, o: { gaze: 0.9 } },
    { t0: 11.6, t1: 13.0, draw: shotTitle },
    { t0: 13.0, t1: 15.0, draw: shotEnd },
  ]),
  // Trailer 3 „Niemand außer dir“ (36,3 s): Erzähler, der Weg des Helden
  t3: makeFilm('t3', '', T3_LINES, [
    { t0: 0, t1: 6.9, draw: shotKings, o: { crack: 4.5 } },
    { t0: 6.9, t1: 13.3, draw: shotVillage },
    { t0: 13.3, t1: 17.0, draw: shotBoss, o: { flare: 0.5, fast: true } },
    { t0: 17.0, t1: 21.4, draw: shotFrost, o: { roar: 3.0 } },
    { t0: 21.4, t1: 24.6, draw: shotIslands },
    { t0: 24.6, t1: 28.9, draw: shotThrone, o: { gaze: 2.9 } },
    { t0: 28.9, t1: 32.3, draw: shotTitle },
    { t0: 32.3, t1: 36.3, draw: shotEnd },
  ]),
};
export async function load(base) {
  const img = (n, ext = 'png') => new Promise((ok, bad) => {
    const i = new Image();
    i.onload = () => ok([n, i]); i.onerror = () => bad(new Error(`Bild fehlt: ${n}`));
    i.src = new URL(`${n}.${ext}`, base).href;
  });
  const images = Object.fromEntries(await Promise.all(IMAGES.map((n) => img(n))));
  await Promise.all(Object.values(images).map((i) => i.decode?.().catch(() => {})));
  const glut = {}, stars = {}, px = {};
  for (const n of IMAGES) ({ glut: glut[n], stars: stars[n], px: px[n] } = analyse(images[n], n));
  const font = await titleFont();
  const [, badge] = await img('badge-appstore-de');
  return { images, glut, stars, px, badge, stage: new Stage(), title: titleArt(font), small: titleArt(font, 'EMBERWRATH', 210), fog: fogTexture(), pulse: pulseTexture() };
}

// Gemeinsam: Kamera mit Erschütterung über Vorlagenpixel
const cam2 = (a, b, k, sh) => camera(a, b, k, sh);
const bell = (u, v) => Math.sin(Math.PI * clamp(u)) * Math.sin(Math.PI * clamp(v));

// 1 – Die Zitadelle auf dem Vulkan, sofort im Bild (kein schwarzer Anfang: in einem Feed zählt die erste Sekunde).
// „Tausend Jahre …“ – vor „Jetzt brennt die Welt wieder“ bricht der Berg aus.
const TIP = [443, 300], CASTLE = [440, 560];
// Ausbruch (Kunstpixel): die Glut bricht hinter dem Hauptturm hervor; Spalten entlang der Lavaadern [x, y, Beginn in s]
const CRATER = [184, 178];
const VENTS = [[179, 268, 0.15], [160, 352, 0.5], [118, 322, 0.8], [250, 318, 1.1], [286, 380, 1.4], [84, 392, 1.7]];
function shotCitadel(st, t, dur, A, T, o = {}) {
  const ERUPT = o.erupt ?? 5.25, zoom = o.zoom ?? [1.0, 1.3];
  const c = st.c, e = t - ERUPT, burst = e < 0 ? 0 : 1 - clamp(e / 3.2), after = e < 0 ? 0 : 1;
  c.drawImage(A.images.zitadelle, 0, 0, AW, AH);
  emissive(st, A, 'zitadelle', t, 0.45 + 0.45 * burst + 0.15 * after, { vy: 12 });
  glow(c, CASTLE[0], CASTLE[1], 300, 'rgba(255,90,20,1)', (0.2 + 0.25 * burst + 0.08 * after) * flick(t, 1));
  glow(c, TIP[0], TIP[1] + 40, 120, 'rgba(255,140,40,1)', (0.18 + 0.4 * burst) * flick(t, 2));
  fog(c, A, t, { col: '#3a2430', a: 0.24, speed: 22, y0: 0, y1: 720 });
  fog(c, A, t + 7, { col: '#1e1820', a: 0.3, speed: 40, y0: 1020, y1: 1536 });
  lightning(c, t, o.erupt === undefined ? 1.9 : -9, 700, 260);
  const [px, py] = [TIP[0] * F, TIP[1] * F];
  if (e >= 0) {
    // Der Berg reißt auf: Glut schießt hinter der Zitadelle hoch, entlang der Lavaadern brechen Spalten auf
    glowW(c, CRATER[0], CRATER[1], 70 + 50 * burst, 'rgba(255,170,70,1)', 0.25 + 0.5 * burst);
    jet(c, e, CRATER[0], CRATER[1], 320, 36, 0.35 + 0.65 * burst);
    fountain(c, e, CRATER[0], CRATER[1], 420, 30, 0.4 + 0.6 * burst, 1.25);
    VENTS.forEach(([x, y, at], i) => {
      const k = e - at;
      if (k < 0) return;
      const pw = clamp(k / 0.25) * (1 - 0.6 * clamp((k - 1.2) / 2.6));
      glowW(c, x, y, 16, 'rgba(255,150,50,1)', 0.6 * pw * flick(t, i + 4));
      fountain(c, k, x, y, 80, 50 + i * 7, pw, 0.6, true);
    });
    bombs(c, e, CRATER[0], CRATER[1], 16, 33, (x) => Math.min(250 + Math.abs(x - 183) * 0.8, 450));
    lightning(c, t, ERUPT + 1.6, 160, 380);
  }
  embers(c, t, 70 + 60 * after, 20, { rise: 40, drift: 50, y0: 300, y1: SH });
  st.show(cam2({ cx: 432, cy: 860, z: zoom[0] }, { cx: 440, cy: 660, z: zoom[1] }, glide(t / dur), quake(t, ERUPT, 1.8, 18)));
  st.flash(t, 0.0, 0.7, '#ff9a40', 0.45);
  st.flash(t, ERUPT, 0.7, '#ffe0b0', 0.85);
  if (dur - t < 0.35) st.veil('#000', ease(1 - (dur - t) / 0.35));
}

// 3 – Der Dämon in der Tiefe, darunter drei Helden. Von seinen Augen hinab zur Gruppe. „Ihr kommt zu dritt.“
const EYES = [[425, 262], [478, 262]], STAFF = [608, 1185];
function shotBoss(st, t, dur, A, T, o = {}) {
  const F0 = o.flare ?? 0.9;
  const c = st.c, flare = clamp((t - F0) / 0.25) * (1 - clamp((t - F0 - 0.7) / 1.5));
  c.drawImage(A.images.boss, 0, 0, AW, AH);
  emissive(st, A, 'boss', t, 0.55 + 0.25 * Math.sin(t * 1.7), { vx: 1, vy: -5 });
  EYES.forEach(([x, y], i) => {
    glow(c, x, y, 40 + 60 * flare, 'rgba(255,110,30,1)', 0.45 + 0.5 * flare + 0.08 * Math.sin(t * 5 + i));
    glow(c, x, y, 12, 'rgba(255,230,170,1)', 0.5 + 0.5 * flare);
  });
  glow(c, 430, 520, 260, 'rgba(255,80,20,1)', 0.1 + 0.15 * flare);
  glow(c, STAFF[0], STAFF[1], 46, 'rgba(120,160,255,1)', 0.5 * (0.7 + 0.3 * Math.sin(t * 7)));
  glow(c, 120, 1270, 180, 'rgba(255,100,30,1)', 0.18 * flick(t, 4));
  glow(c, 740, 1290, 180, 'rgba(255,100,30,1)', 0.18 * flick(t, 5));
  fog(c, A, t, { col: '#3c3444', a: 0.22, speed: 14, y0: 700, y1: 1200 });
  fog(c, A, t + 4, { col: '#ff6a20', a: 0.05, speed: 20, y0: 200, y1: 1000, mode: 'lighter' });
  embers(c, t, 90, 24, { rise: 34, drift: 30, y0: 200, y1: SH });
  const k = o.fast ? ease(clamp((t - F0 - 0.3) / (dur - F0 - 0.6))) : glide(clamp(t / (dur * 0.72)));
  st.show(cam2({ cx: 450, cy: 400, z: 1.75 }, { cx: 432, cy: 768, z: 1.0 }, k, quake(t, F0 + 0.05, 1.0, 10)));
  st.veil('#000', 1 - ease(t / 0.4));
  if (dur - t < 0.25) st.veil('#000', ease(1 - (dur - t) / 0.25));
}

// 4 – Ein Reiter im Galopp über die Aschenebene, auf die Zitadelle zu. „Ihr kommt beritten.“
function shotRider(st, t, dur, A, T, o = {}) {
  const HOLD = o.hold ?? 2.5;
  const c = st.c, ph = t * 2.6 * Math.PI * 2;
  c.drawImage(A.images.reiter, 0, 0, AW, AH);
  emissive(st, A, 'reiter', t, 0.45, { vx: 3, vy: 4 });
  // Galopp: Pferd und Reiter heben und senken sich, Umhang und Mähne wehen (Bildpunkte versetzt, keine neuen Farben)
  const R = [240 * F, 890 * F, 290 * F, 390 * F];
  warp(c, A.px.reiter, R[0], R[1], R[2], R[3], (u, v) => {
    const b = bell(u, v) ** 0.6, bob = Math.abs(Math.sin(ph / 2)) * 2.2 - 1.1;
    const cloak = u < 0.55 && v < 0.45 ? 1.6 * Math.sin(ph * 0.9 + u * 9) * (1 - u / 0.55) : 0;
    return [cloak * b, bob * b];
  });
  // Staub hinter den Hufen: Bildpunkte fliegen nach links weg und vergehen
  const [hx, hy] = [370 * F, 1245 * F];
  for (let i = 0; i < 90; i++) {
    const P = 0.7 + hash(i, 91) * 0.6, k = (t / P + hash(i, 92)) % 1, cyc = Math.floor(t / P + hash(i, 92));
    const sp = 40 + hash(i + cyc * 7, 93) * 70;
    const x = hx - sp * k - hash(i + cyc * 7, 94) * 8, y = hy + (hash(i + cyc * 7, 95) - 0.5) * 12 - 18 * k * hash(i, 96);
    c.globalAlpha = 0.55 * (1 - k); c.fillStyle = hash(i, 97) < 0.5 ? '#b8a08a' : '#8a7462';
    const s = k < 0.4 ? 2 : 1; c.fillRect(Math.round(x), Math.round(y), s, s);
  }
  c.globalAlpha = 1;
  glow(c, 640, 520, 160, 'rgba(255,110,30,1)', 0.25 * flick(t, 3));
  fog(c, A, t, { col: '#5a3a5a', a: 0.14, speed: 40, y0: 100, y1: 700 });
  fog(c, A, t + 3, { col: '#9a8a9a', a: 0.1, speed: 70, y0: 1150, y1: 1500 });
  embers(c, t, 30, 25, { rise: 20, drift: -60, y0: 700, y1: SH });
  const sh = { x: 0, y: Math.sin(ph) * 0.35 };
  const near = camera({ cx: 380, cy: 1100, z: 2.0 }, { cx: 400, cy: 1090, z: 1.86 }, glide(t / HOLD)), far = camera({ cx: 400, cy: 1090, z: 1.86 }, { cx: 470, cy: 860, z: 1.2 }, ease((t - HOLD) / (dur - HOLD)), sh);
  st.show(t < HOLD ? { ...near, y0: near.y0 + sh.y } : far);
  st.veil('#000', 1 - ease(t / 0.25));
  if (dur - t < 0.3) st.veil('#fff4dc', ease(1 - (dur - t) / 0.3) * 0.6);
}

// 5 – Der Himmel reißt auf: Sternenlicht stürzt aus dem Riss, unten der Wanderer. Von ihm hinauf zum Riss.
const RIFT = [[470, 60], [455, 260], [440, 470], [438, 650], [436, 850]];
function starfall(c, t, n, seed, a) {
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const P = 1.6 + hash(i, seed) * 2.2, k = (t / P + hash(i, seed + 1)) % 1;
    const y0 = 40 + hash(i, seed + 2) * 520, x0 = 440 + (hash(i, seed + 3) - 0.5) * (220 - y0 * 0.25);
    const x = x0 * F + (hash(i, seed + 4) - 0.5) * 30 * k, y = (y0 + k * 700) * F;
    c.globalAlpha = a * (1 - k) * (0.4 + 0.6 * hash(i, seed + 5));
    c.fillStyle = hash(i, seed + 6) < 0.3 ? '#fffbe8' : hash(i, seed + 6) < 0.7 ? '#ffe6a0' : '#c8c8ff';
    c.fillRect(Math.round(x), Math.round(y), 1, hash(i, seed + 7) < 0.3 ? 3 : 2);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function shotRift(st, t, dur, A, T, o = {}) {
  const TEAR = o.tear ?? 1.0;
  const c = st.c, open = ease(t / (TEAR + 0.4)), tear = clamp((t - TEAR) / 0.2) * (1 - clamp((t - TEAR - 0.3) / 1.6));
  c.drawImage(A.images.riss, 0, 0, AW, AH);
  twinkle(c, A.stars.riss, t);
  emissive(st, A, 'riss', t, 0.45, { vx: 2, vy: 4 });
  RIFT.forEach(([x, y], i) => glow(c, x, y, 150 - i * 12, 'rgba(255,220,150,1)', (0.12 + 0.22 * open + 0.4 * tear) * (0.85 + 0.15 * Math.sin(t * 2 + i))));
  starfall(c, t, 140, 70, 0.4 + 0.6 * open);
  fog(c, A, t, { col: '#3a3e66', a: 0.14, speed: 16, y0: 1050, y1: 1400 });
  embers(c, t, 24, 26, { rise: 20, drift: 30, y0: 1100, y1: SH });
  const k = glide(clamp((t - 0.2) / (dur - 0.6)));
  st.show(cam2({ cx: 300, cy: 1260, z: 1.7 }, { cx: 432, cy: 640, z: 1.05 }, k, quake(t, TEAR, 1.1, 8)));
  const quick = o.tear !== undefined;                      // Kurzfassung: weniger Blenden, sonst sieht man vom Bild zu wenig
  st.flash(t, TEAR, quick ? 0.5 : 0.8, '#fff0c8', quick ? 0.4 : 0.55);
  st.veil('#fff4dc', (quick ? 0.25 : 0.6) * (1 - ease(t / 0.35)));
  const out = quick ? 0.2 : 0.45;
  if (dur - t < out) st.veil('#fff6e6', ease(1 - (dur - t) / out) * 0.8);
}

// 6 – Über den Wolken: schwebende Inseln, die Stadt. Wasserfälle stürzen, Wolken ziehen. „Doch auch über den Wolken warte ich.“
const FALLS = [[158, 290, 560, 10], [240, 690, 1060, 14], [415, 760, 1110, 10], [548, 740, 1200, 18], [790, 240, 360, 8], [810, 930, 1100, 8]];
function shotIslands(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.inseln, 0, 0, AW, AH);
  twinkle(c, A.stars.inseln, t);
  FALLS.forEach(([x, y0, y1, w], f) => {                 // Wasser stürzt: helle Bildpunkte laufen die Fälle hinab
    const len = (y1 - y0) * F;
    for (let i = 0; i < Math.round(len * w * F * 0.35); i++) {
      const P = 0.8 + hash(i, f + 40) * 0.5, k = (t / P + hash(i, f + 41)) % 1;
      c.globalAlpha = 0.75 * (1 - k * 0.6); c.fillStyle = hash(i, f + 42) < 0.5 ? '#ffffff' : '#d8e4f4';
      c.fillRect(Math.round((x + (hash(i, f + 43) - 0.5) * w) * F), Math.round(y0 * F + k * len), 1, 2);
    }
  });
  c.globalAlpha = 1;
  glow(c, 735, 540, 220, 'rgba(255,220,160,1)', 0.25 + 0.05 * Math.sin(t * 1.3));
  fog(c, A, t, { col: '#f6e2ee', a: 0.22, speed: 12, y0: 1000, y1: 1536 });
  fog(c, A, t + 5, { col: '#e8d4f0', a: 0.14, speed: 20, y0: 400, y1: 900 });
  dust(c, t, 40, 27, { y0: 200, y1: 1300 });
  st.show(cam2({ cx: 432, cy: 1080, z: 1.3 }, { cx: 432, cy: 700, z: 1.12 }, glide(t / dur)));
  st.veil('#fff6e6', 0.8 * (1 - ease(t / 0.6)));
  if (dur - t < 0.3) st.veil('#000', ease(1 - (dur - t) / 0.3));
}

// 7 – Der Thronsaal. Die Kamera geht langsam auf den Thron zu, die Augen glimmen auf. „Komm, Wanderer …“
const THRONE_FIRES = [[55, 870, 90, 80], [810, 870, 90, 80], [197, 975, 50, 50], [665, 975, 50, 50], [268, 1018, 30, 30], [596, 1018, 30, 30],
  [307, 1047, 20, 22], [555, 1047, 20, 22], [333, 1062, 14, 16], [528, 1062, 14, 16]];
function shotThrone(st, t, dur, A, T, o = {}) {
  const c = st.c, gaze = clamp((t - (o.gaze ?? 4.0)) / 0.4);
  c.drawImage(A.images.thron, 0, 0, AW, AH);
  flames(c, A.px.thron, t, THRONE_FIRES, 40);
  emissive(st, A, 'thron', t, 0.3, { vy: -7 });
  THRONE_FIRES.forEach(([x, y, w], i) => glow(c, x, y - 30, w * 1.9, 'rgba(255,130,40,1)', 0.35 * flick(t, i)));
  glow(c, 432, 565, 200, 'rgba(255,120,30,1)', 0.16 + 0.1 * Math.sin(t * 1.4) + 0.25 * gaze);
  glow(c, 432, 1330, 260, 'rgba(255,110,30,1)', 0.12 * flick(t, 9));
  if (gaze > 0) [[427, 722], [437, 722]].forEach(([x, y]) => {          // die Augen auf dem Thron
    glow(c, x, y, 10, 'rgba(255,90,30,1)', gaze);
    c.globalAlpha = gaze; c.fillStyle = '#ffd27a'; c.fillRect(Math.round(x * F), Math.round(y * F), 1, 1); c.globalAlpha = 1;
  });
  fog(c, A, t, { col: '#ff7a30', a: 0.07, speed: 14, y0: 500, y1: 1150, mode: 'lighter' });
  fog(c, A, t + 5, { col: '#2a1414', a: 0.16, speed: 9, y0: 900, y1: 1200 });
  embers(c, t, 80, 21, { rise: 40, drift: 18, big: 0.9, y0: 500, y1: SH });
  st.show(cam2({ cx: 432, cy: 860, z: 1.0 }, { cx: 432, cy: 735, z: 2.3 }, glide(t / dur)));
  st.veil('#000', 1 - ease(t / 0.5));
  if (dur - t < 0.12) st.veil('#ffe0b0', 0.9);
}

// 8 – Titel über der dunklen Zitadelle
function titleBlock(st, A, T, t, cx, cy, sweepAt = 0.7) {
  const c = st.c, x0 = Math.round(cx - T.w / 2), y0 = Math.round(cy - T.h / 2), mx = Math.round(x0 + T.w / 2), my = y0 + (T.top + T.bottom) / 2, show = ease(t / 0.9);
  glowW(c, mx, my, T.w * 0.62, 'rgba(224,74,18,1)', 0.24 * show * (0.85 + 0.15 * Math.sin(t * 2)));
  c.globalAlpha = show; c.drawImage(T.cv, x0, y0); c.globalAlpha = 1;
  const sweep = lerp(-40, T.w + 40, clamp((t - sweepAt) / 1.3));
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
  const reach = T.w * 0.42, half = Math.round(ease((t - 0.8) / 1.0) * reach), ly = y0 + T.bottom + 8;
  for (let d = 5; d < half; d++) {
    c.globalAlpha = 0.2 + 0.8 * (1 - d / reach);
    c.fillStyle = '#e8b45a'; c.fillRect(mx + d, ly, 1, 1); c.fillRect(mx - d, ly, 1, 1);
  }
  c.globalAlpha = ease((t - 0.7) / 0.4);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > 2) continue;
    c.fillStyle = d === 2 ? '#1a0604' : d === 0 ? '#fff8d8' : dy < 0 || (dy === 0 && dx < 0) ? '#ffe08a' : '#c87a20';
    c.fillRect(mx + dx, ly + dy, 1, 1);
  }
  c.globalAlpha = 1;
}
function darkCitadel(st, A, t, dim) {
  const c = st.c;
  c.drawImage(A.images.zitadelle, 0, 0, AW, AH);
  emissive(st, A, 'zitadelle', t, 0.5, { vy: 12 });
  glow(c, CASTLE[0], CASTLE[1], 300, 'rgba(255,90,20,1)', 0.25 * flick(t, 1));
  veil(c, '#000', dim);
  fog(c, A, t, { col: '#2a1c22', a: 0.35, speed: 26, y0: 700, y1: SH });
}
function shotTitle(st, t, dur, A, T, o = {}) {
  const c = st.c;
  darkCitadel(st, A, t + 30, 0.72);
  titleBlock(st, A, A.title, t, AW / 2, AH * 0.42);
  embers(c, t, 90, 17, { rise: 45, drift: 30 });
  st.show(cam2({ cx: 432, cy: 768, z: 1.04 }, { cx: 432, cy: 768, z: 1.1 }, t / dur));
  st.flash(t, 0, 0.6, '#ffe0b0', 0.8);
}
// 9 – Endkarte: kleiner Schriftzug oben, darunter Aufruf, App-Store-Abzeichen und Adresse (endCard, scharf)
function shotEnd(st, t, dur, A, T, o = {}) {
  const c = st.c;
  darkCitadel(st, A, t + 33.5, 0.84);
  titleBlock(st, A, A.small, t + 3, AW / 2, AH * 0.3, -9);
  embers(c, t, 70, 17, { rise: 45, drift: 30 });
  st.show(FULL);
  st.veil('#000', 1 - ease(t / 0.4));
  if (dur - t < 0.6) st.veil('#000', ease(1 - (dur - t) / 0.6));
}

// Über dem fertigen Bild, in Ausgabepixeln: der Text der Endkarte (Schlüssel = deutscher Text)
export const END_TEXT = ['Kostenlos spielen', 'Im Browser und im App Store', 'www.emberwrath.com'];
function endCard(g, e, len, A, tr = (s) => s) {
  if (e < 0) return;
  const OW = g.canvas.width, K = OW / 1080, a = ease((e - 0.2) / 0.4) * (1 - ease((e - (len - 0.5)) / 0.5));
  g.save(); g.globalAlpha = a; g.textAlign = 'center';
  g.font = `600 ${Math.round(68 * K)}px "TrailerTitel", Georgia, serif`; g.fillStyle = '#f6e6c8';
  g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 18 * K;
  g.fillText(tr(END_TEXT[0]), OW / 2, 860 * K);
  g.font = `500 ${Math.round(38 * K)}px "TrailerText", sans-serif`; g.fillStyle = '#d8c4a8';
  g.fillText(tr(END_TEXT[1]), OW / 2, 930 * K);
  g.shadowBlur = 0;
  const bw = 400 * K, bh = bw * A.badge.naturalHeight / A.badge.naturalWidth;
  g.drawImage(A.badge, OW / 2 - bw / 2, 1010 * K, bw, bh);
  g.font = `600 ${Math.round(40 * K)}px "TrailerText", sans-serif`; g.fillStyle = '#ffb35a';
  g.fillText(tr(END_TEXT[2]), OW / 2, 1010 * K + bh + 80 * K);
  g.restore();
}

// ------------------------------------------------------------------------------------------------ Trailer 3
// Die fünf Könige aus Stein, davor das gebrochene Siegel. Von den Helmen hinab zum Wanderer; dann reißt der Spalt auf.
const SEAL3 = [[420, 925], [445, 975], [428, 1030], [440, 1085], [455, 1130]];
function shotKings(st, t, dur, A, T, o = {}) {
  const c = st.c, at = o.crack ?? 4.5, e = t - at, burst = e < 0 ? 0 : 1 - clamp(e / 2.2), heat = e < 0 ? 0.25 + 0.2 * clamp(t / at) : 0.6 + 0.4 * burst;
  c.drawImage(A.images.koenige, 0, 0, AW, AH);
  twinkle(c, A.stars.koenige, t);
  emissive(st, A, 'koenige', t, 0.4 + 0.6 * heat, { vy: -6 });
  SEAL3.forEach(([x, y], i) => glow(c, x, y, 60 + 90 * burst, 'rgba(255,120,40,1)', (0.12 + 0.5 * burst + 0.1 * heat) * flick(t, i)));
  glow(c, 560, 640, 200, 'rgba(255,110,50,1)', 0.1 + 0.03 * Math.sin(t * 1.1));
  if (e >= 0) {                                                        // Glut bricht aus dem Spalt
    SEAL3.forEach(([x, y], i) => fountain(c, e - i * 0.06, x * F, y * F, 46, 60 + i * 5, 0.35 + 0.65 * burst, 0.5));
    lightning(c, e, 0.05, 430, 300);
  }
  fog(c, A, t, { col: '#4a4660', a: 0.2, speed: 16, y0: 700, y1: 1000 });
  fog(c, A, t + 6, { col: '#2a2434', a: 0.2, speed: 10, y0: 1150, y1: 1536 });
  embers(c, t, 50, 31, { rise: 14, drift: 30, dir: 1, warm: 0, big: 0.8 });                 // Asche fällt
  embers(c, t, 26 + 60 * (e >= 0 ? 1 : 0), 32, { rise: 40, drift: 20, x0: 250, x1: 620, y0: 700, y1: 1300 });
  st.show(camera({ cx: 432, cy: 470, z: 1.5 }, { cx: 432, cy: 980, z: 1.2 }, glide(t / dur), quake(t, at, 1.6, 14)));
  st.flash(t, at, 0.6, '#ffd9a0', 0.55);
  st.flash(t, 0, 0.6, '#b0a8ff', 0.25);
  if (dur - t < 0.3) st.veil('#000', ease(1 - (dur - t) / 0.3));
}

// Das Dorf am Rand des Aschenwalds vor dem ersten Licht: vom Vulkan hinab zum Helden, der zum Tor hinausgeht.
const LAMPS = [[300, 925, 70], [600, 930, 70], [712, 645, 50]];
function shotVillage(st, t, dur, A) {
  const c = st.c;
  c.drawImage(A.images.dorf, 0, 0, AW, AH);
  twinkle(c, A.stars.dorf, t);
  emissive(st, A, 'dorf', t, 0.45, { vx: 1, vy: -3 });
  LAMPS.forEach(([x, y, r], i) => glow(c, x, y, r * (1.6 + 0.1 * Math.sin(t * 3 + i)), 'rgba(255,170,70,1)', 0.4 * flick(t, i)));
  glow(c, 640, 165, 120, 'rgba(255,90,30,1)', 0.3 * flick(t * 0.4, 7));
  glow(c, 425, 1200, 170, 'rgba(255,170,80,1)', 0.08);
  fog(c, A, t, { col: '#8a8494', a: 0.16, speed: 9, y0: 420, y1: 640 });                    // Rauch der Kamine
  fog(c, A, t + 4, { col: '#3a4060', a: 0.18, speed: 14, y0: 300, y1: 520 });               // Dunst über dem Wald
  fog(c, A, t + 9, { col: '#2a2630', a: 0.16, speed: 12, y0: 1250, y1: 1536 });
  dust(c, t, 36, 33, { y0: 700, y1: 1400 });
  const k = glide(t / dur);
  st.show(camera({ cx: 520, cy: 430, z: 1.4 }, { cx: 432, cy: 1170, z: 2.05 }, ease(clamp(t / (dur * 0.62)))));
  st.veil('#000', 1 - ease(t / 0.5));
  if (dur - t < 0.3) st.veil('#000', ease(1 - (dur - t) / 0.3));
}

// Die Frostzinnen: Schnee treibt, das Nordlicht wabert. Vom Wanderer mit der Fackel hinauf zum Frostwyrm vor dem Mond.
function snow(c, t, n, seed) {
  for (let i = 0; i < n; i++) {
    const depth = 0.3 + hash(i, seed) * 0.7, sp = 50 + 90 * depth;
    let y = (hash(i, seed + 1) * AH + t * sp) % AH, x = (hash(i, seed + 2) * AW - t * sp * 0.55 + Math.sin(t * 1.3 + i) * 4) % AW;
    if (x < 0) x += AW;
    c.globalAlpha = 0.35 + 0.6 * depth; c.fillStyle = depth > 0.75 ? '#ffffff' : '#c8d4f0';
    const s = depth > 0.82 ? 2 : 1; c.fillRect(Math.round(x), Math.round(y), s, s);
  }
  c.globalAlpha = 1;
}
const WYRM_EYE = [548, 186], TORCH = [422, 1150];
function shotFrost(st, t, dur, A, T, o = {}) {
  const c = st.c, at = o.roar ?? 3.0, e = t - at, flare = e < 0 ? 0 : clamp(e / 0.15) * (1 - clamp((e - 0.5) / 1.2));
  c.drawImage(A.images.frost, 0, 0, AW, AH);
  glow(c, 460, 185, 300, 'rgba(190,210,255,1)', 0.16 + 0.04 * Math.sin(t * 0.9) + 0.25 * flare);
  fog(c, A, t, { col: '#40e0c0', a: 0.07, speed: 8, y0: 60, y1: 560, mode: 'lighter' });    // Nordlicht
  glow(c, WYRM_EYE[0], WYRM_EYE[1], 16 + 50 * flare, 'rgba(170,220,255,1)', 0.6 + 0.4 * flare);
  glow(c, TORCH[0], TORCH[1], 60, 'rgba(255,150,60,1)', 0.5 * flick(t, 2));
  glow(c, TORCH[0], TORCH[1] + 60, 110, 'rgba(255,140,60,1)', 0.14 * flick(t, 3));
  fog(c, A, t, { col: '#9aa8d8', a: 0.2, speed: 34, y0: 620, y1: 1000 });
  fog(c, A, t + 5, { col: '#c8d4f4', a: 0.14, speed: 60, y0: 1050, y1: 1536 });
  snow(c, t, 220, 80);
  const k = ease(clamp((t - 0.5) / (dur - 1.4)));
  st.show(camera({ cx: 400, cy: 1300, z: 2.0 }, { cx: 440, cy: 500, z: 1.12 }, k, quake(t, at, 1.2, 12)));
  st.flash(t, at, 0.5, '#d8e8ff', 0.4);
  st.veil('#000', 1 - ease(t / 0.3));
  if (dur - t < 0.35) st.veil('#f4f6ff', ease(1 - (dur - t) / 0.35) * 0.85);
}
