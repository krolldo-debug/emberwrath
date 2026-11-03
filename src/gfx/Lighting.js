import { makeCanvas } from './PixelCanvas.js';
import { CONFIG } from '../config.js';
import { getLightSprite } from '../sprites/effects.js';
import { fineRes } from './Fine.js';

// Punktlicht. Kann einer Entity folgen, flackern und zeitlich begrenzt sein.
export class Light {
  // shape (optional): { cone: { len, spread } } = Lichtkegel nach unten (Wandfackel, Spitze am Licht), sonst rund;
  // in Dungeons legt LightingSystem.flatten runde Lichter als flache Ellipse auf den Boden (3/4-Ansicht).
  constructor({ x = 0, y = 0, radius = 60, color = [255, 180, 110], intensity = 1, flicker = 0, follow = null, offsetX = 0, offsetY = 0, ttl = Infinity, bloom = 0.25, shape = null }) {
    Object.assign(this, { x, y, radius, color, intensity, flicker, follow, offsetX, offsetY, ttl, bloom, shape });
    this.maxTtl = ttl;
    this.seed = Math.random() * 100;
    this.value = intensity;
    this.dead = false;
  }
  update(dt, t) {
    if (this.follow) {
      if (this.follow.removed) { this.dead = true; return; }
      this.x = this.follow.x + this.offsetX * (this.follow.facing ?? 1);
      this.y = this.follow.y + this.offsetY;
    }
    if (this.ttl !== Infinity) {
      this.ttl -= dt;
      if (this.ttl <= 0) { this.dead = true; return; }
    }
    const fade = this.ttl === Infinity ? 1 : this.ttl / this.maxTtl;
    const s = this.seed;
    const n = Math.sin(t * 9.1 + s) * 0.5 + Math.sin(t * 23.7 + s * 1.7) * 0.3 + Math.sin(t * 3.3 + s * 3.1) * 0.2;
    this.value = this.intensity * fade * (1 - this.flicker * (0.5 + 0.5 * n));
  }
}

// Lightmap-Verfahren: Umgebungsdunkel + additive Lichter, dann per
// "multiply" über die Szene. Danach optional additiver Bloom-Schimmer.
// Die Lightmap hat halbe Auflösung: Füllen und Mischen kosten ein Viertel (Handy, große Außenkarten).
// Feinraster (docs/STYLE.md): Licht in feinen harten, runden Stufen, je Radius als Pixelkreis genau in Lightmap-Größe
// gezeichnet (nicht skaliert – skalierte Stufen-Sprites ergaben eckige Scheiben) und auf das Lightmap-Raster gesetzt.
// Bei „Niedrig“ der weiche Verlauf. Leere (Mauerkronen, Dungeon.voidTiles) bleibt dunkel: kein Schein über die Raumwand.
const LM = 0.5;
const lmSize = (v) => Math.max(1, Math.ceil(v * LM));
export class LightingSystem {
  constructor(w, h, ambient) {
    this.w = w; this.h = h;
    this.canvas = makeCanvas(lmSize(w), lmSize(h));
    this.ctx = this.canvas.getContext('2d');
    this.ambient = ambient;
    this.ambientBoost = 0; // für Blitz-Effekte (z. B. Kills)
    this.voidMask = null;   // 1 Pixel je Kachel, deckend = Leere (kein Licht)
    this.dodge = 0;         // Dungeon: Stärke des Glanzes (color-dodge der Lichter, 0 = aus)
    this.flatten = 1;       // Dungeon: < 1 = runde Lichter als Ellipse (Höhe × flatten), Boden in der 3/4-Ansicht
  }

  // Leere der Karte (Uint8Array je Kachel, 1 = Leere) als Maske; null = keine
  setVoid(tiles, tw, th) {
    if (!tiles) { this.voidMask = null; return; }
    const c = makeCanvas(tw, th), x = c.getContext('2d'), img = x.createImageData(tw, th);
    for (let i = 0; i < tiles.length; i++) if (tiles[i]) img.data[i * 4 + 3] = 255;
    x.putImageData(img, 0, 0);
    this.voidMask = c;
  }

  // Passt die Lightmap an eine geänderte Bildgröße an (Hochformat auf dem Handy).
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas = makeCanvas(lmSize(w), lmSize(h));
    this.ctx = this.canvas.getContext('2d');
  }

  // figure (optional): { color, intensity, paint(g) } – paint zeichnet Figuren (Held, Mitspieler) in Kamerakoordinaten;
  // ihre Umrisse werden als Licht in die Lightmap gelegt: die Figur wird hell, der Boden daneben nicht.
  apply(ctx, camX, camY, lights, figure = null) {
    // Weltpixel, nicht ctx.canvas: das Spielbild ist überabgetastet (CONFIG.renderScale).
    if (CONFIG.viewWidth !== this.w || CONFIG.viewHeight !== this.h) this.resize(CONFIG.viewWidth, CONFIG.viewHeight);
    const l = this.ctx;
    const [ar, ag, ab] = this.ambient;
    const k = this.ambientBoost;
    l.setTransform(LM, 0, 0, LM, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${Math.min(255, ar + k * 60)},${Math.min(255, ag + k * 40)},${Math.min(255, ab + k * 30)})`;
    l.fillRect(0, 0, this.w, this.h);
    l.globalCompositeOperation = 'lighter';
    const stepped = fineRes() > 1;
    l.imageSmoothingEnabled = !stepped;
    const flat = this.flatten;
    // Glanz (Dungeon, this.dodge > 0): dieselben Lichter ohne Umgebungsdunkel auf eigener Fläche; per „color-dodge“
    // über die Szene hellt das Licht den Boden über seine Grundfarbe hinaus auf (Textur bleibt), das Dunkle bleibt dunkel
    const dodge = this.dodge > 0 && this.bloomScale !== 0;
    let gl = null;
    if (dodge) {
      if (!this.glowCanvas || this.glowCanvas.width !== this.canvas.width || this.glowCanvas.height !== this.canvas.height) this.glowCanvas = makeCanvas(this.canvas.width, this.canvas.height);
      gl = this.glowCanvas.getContext('2d');
      gl.setTransform(1, 0, 0, 1, 0, 0);
      gl.globalCompositeOperation = 'source-over';
      gl.globalAlpha = 1;
      gl.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
      gl.setTransform(LM, 0, 0, LM, 0, 0);
      gl.globalCompositeOperation = 'lighter';
      gl.imageSmoothingEnabled = !stepped;
    }
    for (const li of lights) {
      const r = stepped ? Math.max(4, Math.round(li.radius / 4) * 4) : li.radius;
      const sx = li.x - camX, sy = li.y - camY;
      if (sx + r < 0 || sy + r < 0 || sx - r > this.w || sy - r > this.h) continue;
      const a = Math.max(0, Math.min(1, li.value));
      let img, x, y, w, h;
      if (li.shape?.cone || flat < 1) {
        // Kegel bzw. flache Lichtteiche: eigene Stufenform (auch bei „Niedrig“, Größe in Lightmap-Pixeln)
        img = shapedLight(li.shape?.cone ? li.shape : { ry: flat }, r, li.color);
        x = Math.round((sx - img.ax) * LM) / LM; y = Math.round((sy - img.ay) * LM) / LM; w = img.width / LM; h = img.height / LM;
      } else if (stepped) { img = steppedLight(r, li.color); x = Math.round((sx - r) * LM) / LM; y = Math.round((sy - r) * LM) / LM; w = h = r * 2; }
      else { img = getLightSprite(64, li.color); x = sx - r; y = sy - r; w = h = r * 2; }
      l.globalAlpha = a;
      l.drawImage(img, x, y, w, h);
      if (gl && !li.follow) { gl.globalAlpha = a * this.dodge; gl.drawImage(img, x, y, w, h); }
    }
    l.globalAlpha = 1;
    if (figure) this.#figureLight(figure);
    if (this.voidMask) {
      // Leere: Licht dort wieder entfernen und mit dem Umgebungsdunkel füllen
      l.imageSmoothingEnabled = false;
      l.globalCompositeOperation = 'destination-out';
      l.drawImage(this.voidMask, camX / 16, camY / 16, this.w / 16, this.h / 16, 0, 0, this.w, this.h);
      l.globalCompositeOperation = 'destination-over';
      l.fillRect(0, 0, this.w, this.h);
    }
    ctx.globalCompositeOperation = 'multiply';
    // ungeglättet vergrößert: der weiche Verlauf in 2-Weltpixel-Schritten liest sich als Pixel-Licht und spart
    // das Filtern der ganzen Bildfläche (Handy)
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.canvas.width / LM, this.canvas.height / LM);
    if (gl) {
      if (this.voidMask) {
        gl.imageSmoothingEnabled = false;
        gl.globalAlpha = 1;
        gl.globalCompositeOperation = 'destination-out';
        gl.drawImage(this.voidMask, camX / 16, camY / 16, this.w / 16, this.h / 16, 0, 0, this.w, this.h);
      }
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.drawImage(this.glowCanvas, 0, 0, this.glowCanvas.width / LM, this.glowCanvas.height / LM);
    }
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalCompositeOperation = 'source-over';
  }

  #figureLight({ color, intensity, paint }) {
    if (!this.figCanvas || this.figCanvas.width !== this.canvas.width || this.figCanvas.height !== this.canvas.height) {
      this.figCanvas = makeCanvas(this.canvas.width, this.canvas.height);
    }
    const g = this.figCanvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, this.figCanvas.width, this.figCanvas.height);
    g.setTransform(LM, 0, 0, LM, 0, 0);
    g.imageSmoothingEnabled = true;   // Randpixel der halben Auflösung nur anteilig hell: kein Saum neben der Figur
    paint(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    g.fillRect(0, 0, this.figCanvas.width, this.figCanvas.height);
    const l = this.ctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'lighter';
    l.globalAlpha = intensity;
    l.drawImage(this.figCanvas, 0, 0);
    l.globalAlpha = 1;
    l.setTransform(LM, 0, 0, LM, 0, 0);
  }

  bloom(ctx, camX, camY, lights) {
    if (this.bloomScale === 0) return; // Qualität „Niedrig“: kein Leuchten-Pass
    const fine = fineRes() > 1;
    // Feinraster: Schimmer ebenfalls in harten Stufen; mit Leere-Maske erst auf eine eigene Lightmap-große Fläche,
    // dort die Leere ausstanzen, dann additiv drüber (kein Schein über die Raumwand ins Schwarze)
    const masked = fine && this.voidMask;
    let g = ctx;
    if (masked) {
      if (!this.bloomCanvas || this.bloomCanvas.width !== this.canvas.width || this.bloomCanvas.height !== this.canvas.height) {
        this.bloomCanvas = makeCanvas(this.canvas.width, this.canvas.height);
      }
      g = this.bloomCanvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, this.bloomCanvas.width, this.bloomCanvas.height);
      g.setTransform(LM, 0, 0, LM, 0, 0);
    }
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = !fine;
    let any = false;
    for (const li of lights) {
      if (li.shape?.cone) {
        // Lichtkegel als sichtbarer Schein in der Luft (Staub im Licht): dieselbe Stufenform, schwach additiv
        const sx = li.x - camX, sy = li.y - camY, s = shapedLight(li.shape, li.radius, li.color);
        if (sx + s.ax < 0 || sx - s.ax > this.w || sy > this.h || sy + s.height / LM < 0) continue;
        g.globalAlpha = Math.max(0, Math.min(1, li.value * (li.shape.haze ?? 0.09)));
        g.drawImage(s, Math.round((sx - s.ax) * LM) / LM, Math.round((sy - s.ay) * LM) / LM, s.width / LM, s.height / LM);
        any = true;
        continue;
      }
      if (!li.bloom) continue;
      const r = fine ? Math.max(4, Math.round(li.radius * 0.45 / 4) * 4) : li.radius * 0.45;
      const sx = li.x - camX, sy = li.y - camY;
      if (sx + r < 0 || sy + r < 0 || sx - r > this.w || sy - r > this.h) continue;
      // Feinraster: violette (Schatten-/Fluch-)Lichter kaum überstrahlen, sonst hellt der Schein den dunklen Kern
      // der Leerenpfütze (entities/Effects.js voidPool) wieder auf
      const [cr, cg, cb] = li.color, voidish = fine && cb >= cr && cg < cb * 0.6;
      g.globalAlpha = Math.max(0, Math.min(1, li.value * li.bloom * (this.bloomScale ?? 1) * (voidish ? 0.3 : 1)));
      if (fine) g.drawImage(steppedLight(r, li.color, GLOW_STEPS), Math.round((sx - r) * LM) / LM, Math.round((sy - r) * LM) / LM, r * 2, r * 2);
      else g.drawImage(getLightSprite(32, li.color), sx - r, sy - r, r * 2, r * 2);
      any = true;
    }
    g.globalAlpha = 1;
    if (masked && any) {
      g.imageSmoothingEnabled = false;
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(this.voidMask, camX / 16, camY / 16, this.w / 16, this.h / 16, 0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'lighter';
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.bloomCanvas, 0, 0, this.bloomCanvas.width / LM, this.bloomCanvas.height / LM);
      ctx.imageSmoothingEnabled = smooth;
    }
    g.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Stufenlicht als Pixelkreise in Lightmap-Größe (Radius r Weltpixel, r · LM Pixel). Der weiche Verlauf (getLightSprite)
// wird in Zwölftel-Helligkeitsstufen gerastert: harte Pixelkanten, aber jede Kante nur ein kleiner Sprung. Früher drei
// große Stufen (0,92 / 0,5 / 0,15) – die lasen sich als heller Kreis um Held, Laternen und Feuer.
function quantized(curve, scale, levels) {
  const at = (t) => {
    for (let i = 1; i < curve.length; i++) if (t <= curve[i][0]) {
      const [t0, a0] = curve[i - 1], [t1, a1] = curve[i];
      return a0 + (a1 - a0) * (t - t0) / (t1 - t0);
    }
    return 0;
  };
  const out = [];
  for (let k = 1; k <= 64; k++) {
    const t = k / 64, a = Math.round(at(t - 1 / 128) * scale * levels) / levels;
    if (a <= 0) break;
    if (out.length && out[out.length - 1][1] === a) out[out.length - 1][0] = t;
    else out.push([t, a]);
  }
  return out;
}
const SOFT = [[0, 1], [0.12, 0.92], [0.3, 0.66], [0.5, 0.36], [0.7, 0.15], [0.86, 0.05], [1, 0]];
const STEPS = quantized(SOFT, 1, 12);
// Schimmer: flacher, sonst stapeln sich helle Scheiben über dem Stufenlicht
const GLOW_STEPS = quantized(SOFT, 0.85, 16);
const stepCache = new Map();
function steppedLight(r, rgb, steps = STEPS) {
  const key = `${r}|${rgb.join(',')}|${steps === GLOW_STEPS ? 'g' : 's'}`;
  let c = stepCache.get(key);
  if (c) return c;
  const R = Math.round(r * LM), n = R * 2;
  c = makeCanvas(n, n);
  const x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data, [cr, cg, cb] = rgb;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) {
    const q = Math.hypot(i + 0.5 - R, y + 0.5 - R) / R, st = steps.find(([t]) => q <= t);
    if (!st) continue;
    const o = (y * n + i) * 4;
    d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = Math.round(st[1] * 255);
  }
  x.putImageData(img, 0, 0);
  stepCache.set(key, c);
  if (stepCache.size > 64) stepCache.delete(stepCache.keys().next().value);
  return c;
}

// Geformtes Stufenlicht (Lightmap-Pixel, Anker ax/ay in Weltpixeln): Ellipse ({ ry }) oder Kegel nach unten
// ({ cone: { len, spread } }, Spitze am Licht, spread = halber Öffnungswinkel im Bogenmaß). Helligkeit wie STEPS
// (weicher Abfall, in Zwölfteln gerastert) – harte Pixelkanten, kleine Sprünge.
const shapeCache = new Map();
const softAt = (q) => {
  if (q >= 1) return 0;
  for (let i = 1; i < SOFT.length; i++) if (q <= SOFT[i][0]) {
    const [t0, a0] = SOFT[i - 1], [t1, a1] = SOFT[i];
    return a0 + (a1 - a0) * (q - t0) / (t1 - t0);
  }
  return 0;
};
function shapedLight(shape, r, rgb) {
  const cone = shape.cone;
  const key = cone ? `c${cone.len}|${cone.spread}|${rgb.join(',')}` : `e${r}|${shape.ry}|${rgb.join(',')}`;
  let c = shapeCache.get(key);
  if (c) return c;
  let w, h, ax, ay, f;
  if (cone) {
    // Kegel als Trapez: gedachte Spitze `top` Weltpixel über dem Licht, oben schmal abgeschnitten; fast gleichmäßig
    // hell über die Breite, nach unten weich auslaufend, Flanken in 2–3 Stufen (keine Lichtspitze an der Wand)
    const L = cone.len, sp = cone.spread, top = cone.top ?? 14, half = Math.ceil(Math.tan(sp) * (L + top));
    w = Math.ceil(half * 2 * LM); h = Math.ceil(L * LM); ax = half; ay = 0;
    f = (x, y) => {
      if (y <= 0) return 0;
      const yy = y + top, ang = Math.atan2(Math.abs(x), yy), d = y / L;
      const edge = Math.max(0, Math.min(1, (sp - ang) / (sp * 0.5)));
      const fall = d < 0.25 ? 0.55 + d * 1.8 : Math.max(0, 1 - (d - 0.25) / 0.75) ** 1.4;
      return 0.85 * fall * edge;
    };
  } else {
    const ry = shape.ry;
    w = Math.ceil(r * 2 * LM); h = Math.ceil(r * 2 * ry * LM); ax = r; ay = r * ry;
    f = (x, y) => softAt(Math.hypot(x, y / ry) / r);
  }
  c = makeCanvas(Math.max(1, w), Math.max(1, h));
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data, [cr, cg, cb] = rgb;
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const a = Math.round(f((i + 0.5) / LM - ax, (j + 0.5) / LM - ay) * 12) / 12;
    if (a <= 0) continue;
    const o = (j * c.width + i) * 4;
    d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  c.ax = ax; c.ay = ay;
  shapeCache.set(key, c);
  if (shapeCache.size > 96) shapeCache.delete(shapeCache.keys().next().value);
  return c;
}
