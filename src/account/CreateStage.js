import { h } from '../core/dom.js';
import { CREATE_ART } from './createArt.js';
import { getHeroSprites, setHeroRes } from '../sprites/hero.js';

// Bühne der Charaktererstellung: der eigene Held steht groß auf der Lavakruste der Glutöde, hinten der Aschethron –
// dieselbe Szene wie das Titelbild der Website („Aufbruch zum Aschethron“, site/titel.js), nur mit dem neuen Helden.
// Eine Pixelgröße für alles: Szenenpixel = Feinpixel des Helden (Vorführstufe frame.res = 3), d Gerätepixel je
// Szenenpixel (ganzzahlig). Die Leinwand hat ein Pixel je Szenenpixel und wird per CSS vergrößert (pixelated).
// Licht nur in harten Stufen: unregelmäßige Glutwolke hinter dem Helden, Lichtfleck am Boden als geordnetes Raster
// (Bayer), Glutkante an der Figur, Runenring unter den Füßen.
// Wo der Held steht, bestimmt das Platzhalter-Element (slot) aus dem CSS: Fußpunkt unten in der Mitte. Die Vergrößerung
// richtet sich nach der Höhe bis zum Fußpunkt, damit der Aschethron neben dem Kopf im Bild bleibt.
// Der Held steht etwas weiter hinten als der Held des Titelbilds (STAND statt FY): so läuft der Lavastrom hinter ihm
// auf Hüfthöhe und nicht durch den Kopf.

const S = { W: 640, H: 272, FY: 212, STAND: 176, HX: 255, LT: 143, LH: 4, LH2: 77, NT: 206 };
const FOOT_ROWS = 128;             // Szenenpixel vom oberen Bildrand bis zum Fußpunkt (Aschethron samt Spitze im Bild)
export const STAGE_RES = 3;        // Feinpixel je Weltpixel des Helden auf der Bühne (im Spiel 2)
const FIRE = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a'];
const RUNE = ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rnd = (a, b) => a + Math.random() * (b - a);
const stepped = (v, n) => Math.round(v * n) / n;

// Kurze Vorführungen: [Animation, Dauer, fps]
const MOMENTS = {
  class: [['atk1', 0.42, 13], ['atk2', 0.42, 13], ['atk3', 0.62, 11]],
  race: [['cast', 0.75, 9]],
  spin: [['spin', 0.5, 16], ['idle', 0.2, 6]],
};
const AMBIENT = ['class', 'race', 'spin'];

// Heldensatz in Vorführstufe (sprites/hero.js begrenzt sonst auf die Spielstufe 2). Die Stufe steckt im Satz selbst,
// auch später nachgebaute Animationen behalten sie.
export function stageHero(raceId, classId, variant, style) {
  setHeroRes(STAGE_RES);
  try { return getHeroSprites(raceId, classId, variant, null, style, STAGE_RES); } finally { setHeroRes(null); }
}

// Leuchtaugen im Vordergrund des Titelbilds: auf der Bühne wirken sie wie verirrte Pixel, daher übermalt (Farbe daneben)
const RETOUCH = { nah: [[168, 7], [170, 7], [500, 11], [502, 11]] };

let images = null;   // einmal geladen, für jeden Besuch der Erstellung wiederverwendet
function loadImages() {
  images ??= Promise.all(Object.entries(CREATE_ART).map(([k, src]) => new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok([k, RETOUCH[k] ? retouch(i, RETOUCH[k]) : i]); i.onerror = () => ok([k, null]);
    i.src = src;
  }))).then((list) => Object.fromEntries(list));
  return images;
}
function retouch(img, spots) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  for (const [x, y] of spots) g.drawImage(c, x + 1, y, 1, 1, x, y, 1, 1);
  return c;
}

// Glut in harten Farbbändern (Pixel-Art-Licht): shape(x, y) liefert die Stärke 0..1 relativ zur Mitte, jedes Band hat
// eine Farbe, nur am äußeren Rand eines Bandes mischt ein geordnetes Raster (Bayer) die Nachbarfarbe ein.
// Ergebnis wird additiv gezeichnet.
function ditherGlow(w, hh, shape, cols) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const g = c.getContext('2d'), n = cols.length;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const v = Math.min(1, shape(x - w / 2 + 0.5, y - hh / 2 + 0.5)) * n;
    if (v <= 0) continue;
    let b = Math.floor(v);
    const frac = v - b;
    if (frac > 0.55 && (frac - 0.55) / 0.45 * 16 > BAYER[(y & 3) * 4 + (x & 3)]) b++;
    if (b <= 0) continue;
    g.fillStyle = cols[Math.min(n, b) - 1];
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
// Glatte Rauschfunktion (Wertrauschen) für die Glutwolke
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
  const hh = (a, b) => { let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
// Glutwolke hinter dem Helden: unregelmäßiger Rand, harte Farbstufen ohne Raster. Bild k von n wandert auf einem
// kleinen Kreis durch das Rauschen, die Wolke wogt dadurch nahtlos in einer Schleife.
const CLOUD = { w: 176, h: 176, n: 8, fps: 3, cols: ['#2e0a04', '#4e1206', '#782008', '#a2340c'] };
function cloudFrame(k) {
  const { w, h: hh, n, cols } = CLOUD, a = (k / n) * Math.PI * 2, ox = Math.cos(a) * 1.3, oy = Math.sin(a) * 1.3;
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const g = c.getContext('2d');
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / 80, dy = (y - hh * 0.54) / 82;
    const base = 1 - Math.hypot(dx * (1 - dy * 0.18), dy);
    if (base < -0.3) continue;
    const f = noise(x / 15 + ox, y / 15 + oy - k * 0.04) * 0.65 + noise(x / 6 - oy * 1.6, y / 6 + ox * 1.6) * 0.35;
    const v = base * 1.25 + (f - 0.5) * 0.95;
    const b = v > 0.78 ? 4 : v > 0.55 ? 3 : v > 0.32 ? 2 : v > 0.1 ? 1 : 0;
    if (!b) continue;
    g.fillStyle = cols[b - 1];
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
let glows = null;
function glowArt() {
  return (glows ??= {
    cloud: [],   // entsteht Bild für Bild während der ersten Bilder der Bühne (update), damit der Einstieg nicht stockt
    // Lichtfleck am Boden
    pool: ditherGlow(140, 30, (x, y) => 1 - Math.hypot(x / 70, y / 15), ['#2a0a04', '#4a1206', '#7a2008']),
  });
}

export class CreateStage {
  constructor({ slot }) {
    this.slot = slot;
    this.canvas = h('canvas.cc-stage', { 'aria-hidden': 'true' });
    this.ctx = this.canvas.getContext('2d');
    this.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.I = null;
    loadImages().then((I) => { this.I = I; });
    this.t = 0; this.anims = null; this.seq = null; this.pending = null; this.seqT = 0; this.nextAmbient = 6;
    this.parts = []; this.ring = null; this.flash = 0; this.hitDone = true;
    this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
    this.onMove = (e) => { if (e.pointerType !== 'mouse') return; this.tmx = (e.clientX / innerWidth) * 2 - 1; this.tmy = (e.clientY / innerHeight) * 2 - 1; };
    addEventListener('pointermove', this.onMove, { passive: true });
    this.view = null;
  }

  destroy() { removeEventListener('pointermove', this.onMove); }

  setHero(anims) { this.anims = anims; this.seq = null; void anims.idle; }

  // Vorführung nach einer Auswahl: Klasse = Angriffsfolge, Volk = Zauberpose mit aufsteigender Glut, Aussehen = Funkenring.
  // Die Bilder der Vorführung entstehen vorher Bild für Bild (eine Animation je Bild), damit nichts ruckelt.
  moment(kind) {
    if (kind !== 'look' && !this.reduced) this.pending = MOMENTS[kind];
    this.ring = { t: 0 }; this.flash = 0.18;
    if (this.view && !this.reduced) {
      const { hx, hy } = this.view;
      for (let i = 0; i < (kind === 'look' ? 12 : 26); i++) this.#spark(hx + rnd(-30, 30), hy + rnd(-2, 2), { vy: -rnd(24, 70), vx: rnd(-8, 8), max: rnd(0.5, 1.2) });
    }
    this.nextAmbient = this.t + 8 + Math.random() * 3;
  }

  #spark(x, y, o = {}) {
    this.parts.push({ x, y, vx: o.vx ?? rnd(-6, 6), vy: o.vy ?? -rnd(18, 40), g: o.g ?? 0, wob: o.wob ?? 10, life: 0, max: o.max ?? rnd(0.35, 0.8), c: o.c ?? FIRE, seed: Math.random() * 9, rain: !!o.rain });
  }

  #ash() {
    const v = this.view, near = Math.random() < 0.35;
    this.#spark(v.camX + rnd(-20, v.vw + 20), v.camY - 2, { vx: rnd(3, 7), vy: near ? rnd(7, 11) : rnd(4, 6), wob: 3, max: rnd(10, 20), c: near ? ['#ffb648', '#e8641a'] : ['#a8300a', '#5a1206'], rain: true });
  }

  // Größe, Vergrößerung und Kamera aus Bildschirm und Platzhalter. Gezeichnet wird nur in Szenengröße, das spart auf
  // Handys mit hoher Pixeldichte fast die ganze Rechenzeit.
  #layout() {
    const cv = this.canvas, host = cv.parentElement, dpr = window.devicePixelRatio || 1;
    if (!host) return null;
    const box = host.getBoundingClientRect(), r = this.slot.getBoundingClientRect();
    const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
    if (!W || !H) return null;
    const key = `${W}x${H}|${dpr}|${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${box.left},${box.top}`;
    if (this.view?.key === key) return this.view;
    const footDev = (r.top - box.top + r.height) * dpr;
    const d = Math.max(1, Math.round(footDev / FOOT_ROWS), Math.ceil(W / S.W));
    const vw = Math.ceil(W / d), vh = Math.ceil(H / d);
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    cv.style.width = `${(vw * d) / dpr}px`; cv.style.height = `${(vh * d) / dpr}px`;
    // Fußpunkt des Helden in Szenenpixeln der Leinwand; unterhalb der Szene geht der Boden dunkel weiter
    const fx = Math.round(((r.left - box.left + r.width / 2) * dpr) / d), fy = Math.round(footDev / d) - 2;
    const camX = Math.max(0, Math.min(S.W - vw, S.HX - fx));
    const camY = Math.max(0, S.STAND - fy);
    this.view = { key, W: vw, H: vh, vw, vh, camX, camY, hx: camX + fx, hy: camY + fy };
    return this.view;
  }

  update(dt) {
    this.t += dt;
    const v = this.#layout();
    if (!v) return;
    this.mx += (this.tmx - this.mx) * Math.min(1, dt * 2.5); this.my += (this.tmy - this.my) * Math.min(1, dt * 2.5);
    const G = glowArt();
    if (G.cloud.length < (this.reduced ? 1 : CLOUD.n)) G.cloud.push(cloudFrame(G.cloud.length));
    const A = this.anims;
    if (this.pending && A) {
      const todo = this.pending.find(([name]) => Object.getOwnPropertyDescriptor(A, name)?.get);
      if (todo) void A[todo[0]];
      else { this.seq = this.pending; this.pending = null; this.seqT = 0; this.hitDone = false; }
    } else if (this.seq) {
      this.seqT += dt;
      const total = this.seq.reduce((s, x) => s + x[1], 0);
      const K = STAGE_RES / 2;
      // Höhepunkt der Vorführung: Funken vor der Klinge bzw. über dem Kopf
      if (!this.hitDone && this.seq === MOMENTS.class && this.seqT > total - 0.42) { this.hitDone = true; this.#burst(v.hx + 24 * K, v.hy - 22 * K, 20); }
      if (!this.hitDone && this.seq === MOMENTS.race && this.seqT > 0.35) { this.hitDone = true; this.#burst(v.hx, v.hy - 44 * K, 18, true); }
      if (this.seqT >= total) this.seq = null;
    } else if (!this.reduced && this.t >= this.nextAmbient) {
      this.pending = MOMENTS[AMBIENT[Math.floor(Math.random() * AMBIENT.length)]];
      this.nextAmbient = this.t + 7 + Math.random() * 3;
    }
    if (this.ring) { this.ring.t += dt; if (this.ring.t > 0.5) this.ring = null; }
    this.flash = Math.max(0, this.flash - dt);
    if (!this.reduced && Math.random() < dt * 2.4) this.#ash();
    for (const q of this.parts) {
      q.life += dt;
      if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
    this.parts = this.parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.FY + 60));
    if (this.parts.length > 300) this.parts.splice(0, this.parts.length - 300);
    this.#draw(v);
  }

  #burst(x, y, n, up = false) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) this.#spark(x + rnd(-4, 4), y + rnd(-5, 5), up ? { vy: -rnd(30, 80), vx: rnd(-16, 16) } : { vx: rnd(10, 70), vy: -rnd(10, 60), g: 140, wob: 0, max: rnd(0.25, 0.6) });
  }

  #frame() {
    const A = this.anims;
    if (!A) return null;
    if (this.seq) {
      let t = this.seqT;
      for (const [name, dur, fps] of this.seq) {
        if (t < dur) { const a = A[name]; const n = a.frames.length; return a.frames[Math.min(n - 1, Math.floor(t * fps)) % n]; }
        t -= dur;
      }
    }
    const a = A.idle;
    return a.frames[Math.floor(this.t * 6) % a.frames.length];
  }

  #draw(v) {
    const { ctx, I } = this, { camX, camY, W, H } = v;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#060309'; ctx.fillRect(0, 0, W, H);
    if (!I) return;
    const e = this.reduced ? 0 : Math.min(1, this.t / 3), t = this.t;
    const sx = e * 3 * Math.sin((t * Math.PI * 2) / 26) + this.mx * 3, sy = e * Math.sin((t * Math.PI * 2) / 19) + this.my;
    const off = (f) => [Math.round(sx * f), Math.round(sy * f)];
    const draw = (img, x, y, f, sx0 = 0, sy0 = 0, w = img?.width, hh = img?.height) => {
      if (!img) return;
      const [ox, oy] = off(f);
      ctx.drawImage(img, sx0, sy0, w, hh, x - camX - ox, y - camY - oy, w, hh);
    };
    const px = (x, y, c, w = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x) - camX, Math.round(y) - camY, w, hh); };
    const pulse = this.reduced ? 1 : stepped(0.8 + 0.2 * Math.cos((t * Math.PI * 2) / 3.4), 3);
    const { hx, hy } = v, K = STAGE_RES / 2;

    // Ferne, Lavastrom, Ebene, Vordergrund (wie site/titel.js)
    draw(I.fern, 0, 0, 0.12);
    ctx.globalAlpha = this.reduced ? 1 : stepped(0.7 + 0.3 * Math.abs(Math.cos(t * 5.3) * Math.cos(t * 2.1)), 3);
    draw(I['fern-glut'], 0, 0, 0.12);
    ctx.globalAlpha = 1;
    const lf = this.reduced ? 0 : Math.floor(t * 2.5) % S.LH;
    draw(I.strom, 0, S.LT, 0.35, 0, lf * S.LH2, S.W, S.LH2);
    ctx.globalAlpha = pulse; draw(I['strom-glut'], 0, S.LT, 0.35, 0, lf * S.LH2, S.W, S.LH2); ctx.globalAlpha = 1;
    draw(I.mitte, 0, 0, 0.5);
    ctx.globalAlpha = this.reduced ? 1 : stepped(0.7 + 0.3 * Math.cos((t * Math.PI * 2) / 4.1), 3); draw(I['mitte-glut'], 0, 0, 0.5); ctx.globalAlpha = 1;
    draw(I.nah, 0, S.NT, 1);
    ctx.globalAlpha = pulse; draw(I['nah-glut'], 0, S.NT, 1); ctx.globalAlpha = 1;
    // Unterhalb der Szene (Hochformat): Boden dunkel, Übergang im Schachbrett
    const bottom = S.H - camY;
    if (bottom < H) {
      ctx.fillStyle = '#0a0506';
      ctx.fillRect(0, bottom + 2, W, H - bottom - 2);
      for (let y = 0; y < 2; y++) for (let x = y & 1; x < W; x += 2 - y) ctx.fillRect(x, bottom + y, 1, 1);
    }

    // Glutwolke hinter dem Helden und Lichtfleck am Boden (additiv, harte Pixel); bei einer Auswahl kurz stärker
    const G = glowArt();
    ctx.globalCompositeOperation = 'lighter';
    const cloud = G.cloud[Math.floor(t * CLOUD.fps) % G.cloud.length];
    if (cloud) {
      const cx = Math.round(hx - CLOUD.w / 2), cy = Math.round(hy - 44 * K - CLOUD.h / 2);
      draw(cloud, cx, cy, 1);
      if (this.flash > 0) { ctx.globalAlpha = 0.5; draw(cloud, cx, cy, 1); ctx.globalAlpha = 1; }
    }
    draw(G.pool, Math.round(hx - G.pool.width / 2), Math.round(hy - G.pool.height / 2 + 2), 1);
    ctx.globalCompositeOperation = 'source-over';

    // Runenring unter dem Helden, bei einer Auswahl hell, dazu eine Welle nach außen
    const ring = (rx, ry, col, every = 1) => {
      const n = Math.round(rx * 4);
      for (let i = 0; i < n; i += every) {
        const a = (i / n) * Math.PI * 2;
        px(hx + Math.cos(a) * rx, hy + Math.sin(a) * ry, col);
      }
    };
    for (let yy = -4; yy <= 4; yy++) { const w = Math.round(24 * Math.sqrt(1 - (yy / 5) ** 2)); px(hx - w, hy + yy, 'rgba(4,2,6,0.55)', w * 2 + 1, 1); }
    const glow = this.flash > 0 ? 5 : 2 + Math.round(pulse * 1.5);
    ring(38, 8, RUNE[Math.min(5, glow)]);
    ring(32, 6.5, RUNE[Math.max(1, glow - 2)], 3);
    for (let k = 0; k < 10; k++) {   // Runen: kurze Striche auf dem Ring
      const a = (k / 10) * Math.PI * 2 + 0.2;
      px(hx + Math.cos(a) * 35, hy + Math.sin(a) * 7.3 - 1, RUNE[Math.min(5, glow + 1)], 1, 2);
    }
    if (this.ring) {
      const k = this.ring.t / 0.5;
      ring(38 + k * 60, 8 + k * 13, FIRE[Math.min(3, Math.floor(k * 4))], k > 0.5 ? 2 : 1);
    }

    // Held 1:1 (Feinpixel = Szenenpixel) mit Glutkante
    const f = this.#frame();
    if (f) {
      const x = hx - camX - f.ax, y = hy - camY - f.ay;
      ctx.drawImage(f.canvas, x, y);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75;
      ctx.drawImage(rimOf(f.canvas), x, y);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.flash > 0.09) { ctx.globalAlpha = 0.6; ctx.drawImage(f.flash, x, y); ctx.globalAlpha = 1; }
      // Leuchtende Stellen (Stabspitze, Glutadern) als aufsteigende Funken statt eines weichen Scheins
      if (f.glows && !this.reduced) {
        const r0 = f.res ?? 1;
        for (const gl of f.glows) if (Math.random() < 0.08) this.#spark(hx + gl.x * r0 + rnd(-1, 1), hy + gl.y * r0, { vy: -rnd(10, 24), vx: rnd(-3, 3), max: rnd(0.3, 0.7), wob: 8 });
      }
    }

    // Funken und Ascheregen: einzelne Pixel, Farbe in Stufen nach Lebensalter
    for (const q of this.parts) {
      const k = q.life / q.max;
      px(q.x, q.y, q.c[Math.min(q.c.length - 1, Math.floor(k * q.c.length))]);
    }
  }
}

// Kantenlicht einer Figur: erster Pixel innerhalb der Kontur, links (Rückseite, der Held blickt nach rechts) und
// unten; zur Mitte der Figur hin dunkler, im oberen Drittel keins. Einmal je Frame berechnet.
const rims = new WeakMap();
function rimOf(cv) {
  let c = rims.get(cv);
  if (c) return c;
  const w = cv.width, hh = cv.height, src = cv.getContext('2d').getImageData(0, 0, w, hh).data;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && src[(y * w + x) * 4 + 3] > 0;
  let top = hh, bot = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (A(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d');
  for (let y = top; y <= bot; y++) {
    const k = (y - top) / Math.max(1, bot - top);
    if (k < 0.3) continue;
    const col = k > 0.75 ? '#c8501a' : k > 0.5 ? '#963410' : '#5a1e08';
    for (let x = 0; x < w; x++) {
      if (!A(x, y)) continue;
      const left = A(x - 1, y) && !A(x - 2, y), under = A(x, y + 1) && !A(x, y + 2);
      if (left || under) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  rims.set(cv, c);
  return c;
}

// Kleines Heldenbild für die Auswahlkacheln: Kopf und Schultern, 1:1 in Feinpixeln (frame.res 2).
// Die Anzeigegröße setzt das CSS ganzzahlig über --w/--h (Feinpixel).
export class TilePortrait {
  constructor() {
    const [w, hh] = [36, 30];
    this.canvas = h('canvas.cc-tile-art', { 'aria-hidden': 'true' });
    this.canvas.width = w; this.canvas.height = hh;
    this.canvas.style.setProperty('--w', w); this.canvas.style.setProperty('--h', hh);
    this.ctx = this.canvas.getContext('2d');
  }

  set(anims) {
    const f = anims.idle.frames[0], { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Oberkante der Figur suchen, Kopf oben bündig mit 2 Pixeln Luft
    ctx.drawImage(f.canvas, Math.round(canvas.width / 2 - f.ax + 2), 2 - topOf(f.canvas));
  }
}

const tops = new WeakMap();
function topOf(cv) {
  if (tops.has(cv)) return tops.get(cv);
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let top = 0;
  search: for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 0) { top = y; break search; }
  tops.set(cv, top);
  return top;
}

// Farbstein für die Aussehen-Wahl: 12 × 12 Feinpixel, achteckig geschliffen, oben links Licht, unten rechts Schatten,
// gefärbt mit den vier Haartönen der Variante; bei Glutgeborenen läuft eine Glutader in der Akzentfarbe hindurch.
const GEM = [
  '...oooooo...',
  '..oLLLLHHo..',
  '.oLLLHHHHMo.',
  'oLLHHHHHMMMo',
  'oLHHHHHMMMMo',
  'oLHHHHMMMMDo',
  'oHHHHMMMMMDo',
  'oHHHMMMMMDDo',
  'oHHMMMMMDDDo',
  '.oMMMMMDDDo.',
  '..oMMDDDDo..',
  '...oooooo...',
];
export function swatchArt(v) {
  const c = h('canvas.cc-swatch-art', { 'aria-hidden': 'true' });
  c.width = 12; c.height = 12;
  const g = c.getContext('2d'), [d, m, hi, li] = v.hair;
  const col = { o: '#0b0508', D: d, M: m, H: hi, L: li };
  GEM.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } }));
  g.fillStyle = '#fff4e0'; g.fillRect(3, 3, 1, 1); g.fillRect(4, 2, 1, 1);   // Glanzlicht
  if (v.accent) {
    const a = v.accent;
    g.fillStyle = a[2]; for (const [x, y] of [[8, 3], [7, 4], [7, 5], [6, 6], [5, 7], [5, 8], [4, 9]]) g.fillRect(x, y, 1, 1);
    g.fillStyle = a[4] ?? a[3]; g.fillRect(7, 5, 1, 1); g.fillRect(6, 6, 1, 1);
  }
  return c;
}
