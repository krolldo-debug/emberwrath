import { SpriteFrame, Animation, LazyFrame } from '../gfx/Sprite.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Umgefärbte Figurensätze (Gegner der Sternenscherben, solange eigene Figuren fehlen): jeder Pixel bekommt nach
// seiner Helligkeit eine Stufe der Zielrampe (harte Stufen, keine Mischfarben); Umriss und tiefe Schatten bleiben.
// Kräftige Farben (Augen, Glut, Runen) wandern in die Akzentrampe. Gilt rekursiv für alle Frames eines Satzes.
// spec: { ramp: [hex dunkel → hell], accent?: { ramp: [hex] }, gamma?: < 1 hellt dunkle Vorbilder auf,
//         infest?: Leerenbefall (Stil der Sternenglut-Gegner, s. infestFrame) }

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function recolorCanvas(src, R, A, gamma = 1) {
  const w = src.width, h = src.height, c = makeCanvas(w, h), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  // Helligkeitsumfang des Bildes, damit die ganze Rampe genutzt wird
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const L = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    if (L < 14) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (A && mx > 150 && (mx - mn) / mx > 0.55) continue;      // Akzente zählen nicht zum Umfang
    if (L < lo) lo = L; if (L > hi) hi = L;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2], L = r * 0.3 + gg * 0.59 + b * 0.11;
    if (L < 14) continue;                                     // Umriss
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
    const accent = A && sat > 0.55 && mx > 150;
    const ramp = accent ? A : R;
    const t = accent ? Math.min(1, (mx - 150) / 105) : Math.pow(Math.max(0, (L - lo) / span), gamma);
    const k = Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))));
    const [nr, ng, nb] = ramp[k];
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const isCanvas = (v) => (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas);
// Bild- und Audio-Objekte, Maps usw. bleiben, wie sie sind
const meta = (v) => v instanceof Map || v instanceof Set || ArrayBuffer.isView(v) || (typeof ImageData !== 'undefined' && v instanceof ImageData);

export function recolorSet(set, spec) {
  const R = spec.ramp.map(rgb), A = spec.accent ? spec.accent.ramp.map(rgb) : null, G = spec.gamma ?? 1;
  const seen = new Map();
  // Leuchtebene eines Frames: nur umfärben, kein eigener Befall (der kommt vom Frame selbst)
  const walkGlow = (x) => { if (seen.has(x)) return seen.get(x); const o = new SpriteFrame(recolorCanvas(x.canvas, R, A, G), x.ax, x.ay, x.res); o.isGlow = true; seen.set(x, o); return o; };
  const walk = (v) => {
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return seen.get(v);
    let out;
    if (v instanceof SpriteFrame) {
      // Frame neu (eigene Spiegel-/Blitzbilder), Zusatzfelder (glow, meta, fx) übernehmen, glow mit umfärben
      out = new SpriteFrame(recolorCanvas(v.canvas, R, A, G), v.ax, v.ay, v.res);
      for (const [k, x] of Object.entries(v)) if (!(k in out)) out[k] = isCanvas(x) ? recolorCanvas(x, R, A, G) : x instanceof SpriteFrame ? walkGlow(x) : x;
      if (spec.infest && !v.isGlow) infestFrame(out, spec.infest);
    } else if (v instanceof Animation) {
      // aufgeschoben: jeder Frame wird erst beim ersten Zeigen umgefärbt (wie die Vorbilder, Handy)
      const frames = [];
      for (let i = 0; i < v.frames.length; i++) frames.push(new LazyFrame(() => walk(v.frameAt(i / v.fps + 1e-6))));
      out = new Animation(frames, v.fps, v.loop);
      for (const [k, x] of Object.entries(v)) if (!(k in out)) out[k] = x;
    } else if (isCanvas(v)) out = recolorCanvas(v, R, A, G);
    else if (Array.isArray(v)) out = v.map(walk);
    else if (meta(v)) return v;
    else {
      // Satz, Animation u. Ä.: Kopie mit gleichem Prototyp, Felder rekursiv
      out = Object.create(Object.getPrototypeOf(v)); seen.set(v, out);
      for (const [k, x] of Object.entries(v)) out[k] = k === 'meta' || k === 'fx' ? x : walk(x);
      return out;
    }
    seen.set(v, out);
    return out;
  };
  return walk(set);
}

// ---------------------------------------------------------------- Leerenbefall (Sternenglut, Stil B)
// Violette Leerenkristalle brechen aus der Oberkante der Figur, magentafarbene Risse glimmen im Körper.
// Die Kristalle sitzen an festen Anteilen der Figurenbreite (spec.at) auf der Oberkante, darum wandern sie mit
// jeder Pose mit, ohne zu springen. Gezeichnet in Texeln mit harten Kanten (Feinraster), Leuchten auf frame.glow.
// spec: { at: [[Anteil 0..1, Länge, Breite, Neigung]], veins: [[x0, y0, x1, y1] als Anteile], span?: [a, b] (Spaltenbereich),
//         dir?: 1 | -1 (Blickrichtung des Vorbilds, Standard rechts) }
const CRYS = ['#0e0818', '#2a1a4e', '#4a2e86', '#7454c4', '#a68ae8', '#ecdcff', '#ffffff'].map(rgb);
const CRYS_G = ['#4a1a80', '#8a4ad8', '#c890ff', '#ffffff'].map(rgb);
const VEIN = ['#6a1a7a', '#c050e0', '#f4a8ff'].map(rgb);

function infestFrame(f, spec) {
  const c = f.canvas, W = c.width, H = c.height, r = f.res ?? 1;
  if (W < 4 || H < 4) return;
  const g = c.getContext('2d'), img = g.getImageData(0, 0, W, H), d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 128;
  // Umriss der Figur: Spalten mit Pixeln, Oberkante je Spalte
  let x0 = W, x1 = -1;
  const top = new Int32Array(W).fill(-1);
  // spec.ceil: Körperhöhe in Weltpixeln über dem Anker; darüber (erhobene Waffen, Hiebbögen) bleibt alles frei
  const yc = spec.ceil ? Math.max(0, Math.round(f.ay - spec.ceil * r)) : 0;
  for (let x = 0; x < W; x++) for (let y = yc; y < H; y++) if (solid(x, y)) { top[x] = y; if (x < x0) x0 = x; x1 = x; break; }
  if (x1 < 0) return;
  // eigene Leuchtebene in Framegröße (gleicher Anker), vorhandene wird übernommen
  const gc = makeCanvas(W, H), gx = gc.getContext('2d');
  if (f.glow?.canvas) {
    const o = f.glow, sc = r / (o.res ?? 1);
    gx.drawImage(o.canvas, Math.round(f.ax - o.ax * sc), Math.round(f.ay - o.ay * sc), o.canvas.width * sc, o.canvas.height * sc);
  }
  const gi = gx.getImageData(0, 0, W, H), gd = gi.data;
  const put = (x, y, col, glow) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    if (glow) { gd[i] = glow[0]; gd[i + 1] = glow[1]; gd[i + 2] = glow[2]; gd[i + 3] = 255; }
  };
  const dir = spec.dir ?? 1, span = spec.span ?? [0, 1], bw = x1 - x0;
  // Risse zuerst (liegen unter den Kristallen)
  for (const [a0, b0, a1, b1] of spec.veins ?? []) {
    const X0 = x0 + bw * (dir > 0 ? a0 : 1 - a0), X1 = x0 + bw * (dir > 0 ? a1 : 1 - a1);
    const n = Math.max(2, Math.round(Math.hypot(X1 - X0, (b1 - b0) * H)));
    for (let k = 0; k <= n; k++) {
      const t = k / n, X = X0 + (X1 - X0) * t;
      const col = Math.round(X), tp = top[col];
      if (tp < 0) continue;
      // Höhe relativ zur Oberkante dieser Spalte: bleibt beim Atmen und Laufen auf dem Körper
      const Y = tp + (b0 + (b1 - b0) * t) * H * 0.5 + Math.sin(k * 1.7) * r * 0.5;
      if (!solid(Math.round(X), Math.round(Y)) || !solid(Math.round(X), Math.round(Y) + r) || !solid(Math.round(X), Math.round(Y) - r)) continue;
      put(X, Y, k % 3 ? VEIN[1] : VEIN[2], CRYS_G[k % 3 ? 1 : 2]);
      put(X, Y + 1, VEIN[0], null);
    }
  }
  // Kristalle: Basis etwas unter der Oberkante, Spitze schräg nach oben (Neigung gegen die Blickrichtung)
  for (const [frac, len, wid, lean = 0.35] of spec.at ?? []) {
    const fx = span[0] + (span[1] - span[0]) * frac;
    const bx = Math.round(x0 + bw * (dir > 0 ? fx : 1 - fx));
    if (top[bx] < 0) continue;
    // Körper statt Waffe oder Hiebbogen: erste Stelle von oben mit mindestens 5 Weltpixeln durchgehender Figur
    let ty = -1;
    for (let y = top[bx], run = 0; y < H; y++) {
      run = solid(bx, y) ? run + 1 : 0;
      if (run >= 5 * r) { ty = y - run + 1; break; }
    }
    if (ty < 0) continue;
    const L = len * r, w = wid * r, by = ty + Math.round(r * 1.5);
    const ux = -lean * dir, uy = -1, ul = Math.hypot(ux, uy), ax = ux / ul, ay = uy / ul, nx = -ay, ny = ax;
    // Umriss, dann Flächen (Lichtseite links oben hell), Grat, Spitze
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t <= L; t += 0.5) {
        const hw = w * (1 - t / L) + (pass ? 0 : 1);
        for (let k = -hw; k <= hw; k += 0.5) {
          const X = bx + ax * t + nx * k, Y = by + ay * t + ny * k;
          if (!pass) { put(X, Y, CRYS[0], null); continue; }
          const lit = (k * nx) < 0 || (k < 0 && nx === 0);
          const rim = Math.abs(k) > hw - 1;
          const ridge = Math.abs(k) < 0.6;
          const col = ridge ? (t > L * 0.6 ? CRYS[6] : CRYS[5]) : rim ? (lit ? CRYS[5] : CRYS[1]) : lit ? CRYS[4] : (t > L * 0.5 ? CRYS[3] : CRYS[2]);
          put(X, Y, col, ridge && t > L * 0.3 ? CRYS_G[t > L * 0.75 ? 3 : 2] : (lit && t > L * 0.5 ? CRYS_G[0] : null));
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  gx.putImageData(gi, 0, 0);
  const glow = new SpriteFrame(gc, f.ax, f.ay, r);
  glow.isGlow = true;
  f.glow = glow;
}
