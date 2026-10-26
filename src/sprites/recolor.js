import { SpriteFrame, Animation, LazyFrame } from '../gfx/Sprite.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';

// Umgefärbte Figurensätze (Gegner der Sternenscherben, solange eigene Figuren fehlen): jeder Pixel bekommt nach
// seiner Helligkeit eine Stufe der Zielrampe (harte Stufen, keine Mischfarben); Umriss und tiefe Schatten bleiben.
// Kräftige Farben (Augen, Glut, Runen) wandern in die Akzentrampe. Gilt rekursiv für alle Frames eines Satzes.
// spec: { ramp: [hex dunkel → hell], accent?: { ramp: [hex] }, gamma?: < 1 hellt dunkle Vorbilder auf }

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
  const walk = (v) => {
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return seen.get(v);
    let out;
    if (v instanceof SpriteFrame) {
      // Frame neu (eigene Spiegel-/Blitzbilder), Zusatzfelder (glow, meta, fx) übernehmen, glow mit umfärben
      out = new SpriteFrame(recolorCanvas(v.canvas, R, A, G), v.ax, v.ay, v.res);
      for (const [k, x] of Object.entries(v)) if (!(k in out)) out[k] = isCanvas(x) ? recolorCanvas(x, R, A, G) : x instanceof SpriteFrame ? walk(x) : x;
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
