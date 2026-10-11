import { h } from '../core/dom.js';
import { CREATE_ART } from './createArt.js';

// Bühne der Charaktererstellung: der eigene Held steht groß auf der Lavakruste der Glutöde, hinten der Aschethron –
// dieselbe Szene wie das Titelbild der Website („Aufbruch zum Aschethron“, site/titel.js), nur mit dem neuen Helden.
// Eine Pixelgröße für alles: Szenenpixel = Feinpixel der Heldenframes (frame.res = 2), d Gerätepixel je Szenenpixel
// (ganzzahlig). Ebenen und Held werden 1:1 gezeichnet, Verschiebungen nur in ganzen Szenenpixeln, Licht in harten Stufen.
// Wo der Held steht und wie groß er ist, bestimmt das Platzhalter-Element (slot) aus dem CSS: Fußpunkt unten in der Mitte,
// die Vergrößerung hält den Aschethron im Bild. Seitliche Spalten (shade) werden in Stufen abgedunkelt.

const S = { W: 640, H: 272, FY: 212, HX: 330, LT: 143, LH: 4, LH2: 77, NT: 206 };
const FOOT_ROWS = 140;             // Fußpunkt höchstens so viele Szenenpixel unter dem oberen Bildrand (Aschethron im Bild)
const FIRE = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a'];
const RUNE = ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'];
const rnd = (a, b) => a + Math.random() * (b - a);
const stepped = (v, n) => Math.round(v * n) / n;
const SHADE = 'rgba(5,2,8,0.6)';

// Kurze Vorführungen: [Animation, Dauer, fps]
const MOMENTS = {
  class: [['atk1', 0.42, 13], ['atk2', 0.42, 13], ['atk3', 0.62, 11]],
  race: [['cast', 0.75, 9]],
  spin: [['spin', 0.5, 16], ['idle', 0.2, 6]],
};
const AMBIENT = ['class', 'race', 'spin'];

let images = null;   // einmal geladen, für jeden Besuch der Erstellung wiederverwendet
function loadImages() {
  images ??= Promise.all(Object.entries(CREATE_ART).map(([k, src]) => new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok([k, i]); i.onerror = () => ok([k, null]);
    i.src = src;
  }))).then((list) => Object.fromEntries(list));
  return images;
}

export class CreateStage {
  constructor({ slot, shade = [] }) {
    this.slot = slot; this.shade = shade;
    this.canvas = h('canvas.cc-stage', { 'aria-hidden': 'true' });
    this.ctx = this.canvas.getContext('2d');
    this.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.I = null;
    loadImages().then((I) => { this.I = I; });
    this.t = 0; this.anims = null; this.seq = null; this.seqT = 0; this.nextAmbient = 6;
    this.parts = []; this.ring = null; this.flash = 0; this.hitDone = true;
    this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
    this.onMove = (e) => { if (e.pointerType !== 'mouse') return; this.tmx = (e.clientX / innerWidth) * 2 - 1; this.tmy = (e.clientY / innerHeight) * 2 - 1; };
    addEventListener('pointermove', this.onMove, { passive: true });
    this.view = null;
  }

  destroy() { removeEventListener('pointermove', this.onMove); }

  setHero(anims) { this.anims = anims; }

  // Vorführung nach einer Auswahl: Klasse = Angriffsfolge, Volk = Glut steigt auf, Aussehen = kurzer Funkenring
  moment(kind) {
    if (kind !== 'look') { this.seq = MOMENTS[kind]; this.seqT = 0; this.hitDone = false; }
    this.ring = { t: 0 }; this.flash = 0.18;
    if (this.view && !this.reduced) {
      const { hx, hy } = this.view;
      for (let i = 0; i < (kind === 'look' ? 10 : 22); i++) this.#spark(hx + rnd(-24, 24), hy + rnd(-2, 2), { vy: -rnd(20, 60), vx: rnd(-8, 8), max: rnd(0.4, 1.1) });
    }
    this.nextAmbient = this.t + 8 + Math.random() * 3;
  }

  #spark(x, y, o = {}) {
    this.parts.push({ x, y, vx: o.vx ?? rnd(-6, 6), vy: o.vy ?? -rnd(18, 40), g: o.g ?? 0, wob: o.wob ?? 10, life: 0, max: o.max ?? rnd(0.35, 0.8), c: o.c ?? FIRE, seed: Math.random() * 9, rain: !!o.rain });
  }

  #ash() {
    const v = this.view, near = Math.random() < 0.35;
    this.#spark(v.camX + rnd(-20, v.vw + 20), v.camY - 2, { vx: rnd(3, 7), vy: near ? rnd(7, 11) : rnd(4, 6), wob: 3, max: rnd(8, 16), c: near ? ['#ffb648', '#e8641a'] : ['#a8300a', '#5a1206'], rain: true });
  }

  // Größe, Vergrößerung und Kamera aus Bildschirm und Platzhalter. Die Leinwand hat genau ein Pixel je Szenenpixel und
  // wird per CSS ganzzahlig vergrößert (image-rendering: pixelated): gezeichnet wird nur in Szenengröße, das spart auf
  // Handys mit hoher Pixeldichte fast die ganze Rechenzeit.
  #layout() {
    const cv = this.canvas, host = cv.parentElement, dpr = window.devicePixelRatio || 1;
    if (!host) return null;
    const box = host.getBoundingClientRect(), r = this.slot.getBoundingClientRect();
    const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
    if (!W || !H) return null;
    const key = `${W}x${H}|${dpr}|${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}|${box.left},${box.top}`;
    if (this.view?.key === key) return this.view;
    // So groß wie möglich, solange der Aschethron über dem Helden sichtbar bleibt (Fußpunkt höchstens FOOT_ROWS unter
    // dem oberen Rand); die Szene füllt die Leinwand immer ganz.
    const footDev = (r.top - box.top + r.height) * dpr;
    const d = Math.max(1, Math.ceil(footDev / FOOT_ROWS), Math.ceil(W / S.W), Math.ceil(H / S.H));
    const vw = Math.ceil(W / d), vh = Math.ceil(H / d);
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    cv.style.width = `${(vw * d) / dpr}px`; cv.style.height = `${(vh * d) / dpr}px`;
    // Fußpunkt des Helden in Szenenpixeln der Leinwand
    const fx = Math.round(((r.left - box.left + r.width / 2) * dpr) / d), fy = Math.round(((r.top - box.top + r.height) * dpr) / d) - 2;
    const camX = Math.max(0, Math.min(S.W - vw, S.HX - fx));
    const camY = Math.max(0, Math.min(S.H - vh, S.FY - fy));
    const shade = this.shade.map((el) => {
      const s = el.getBoundingClientRect();
      if (!s.width || !s.height) return null;
      return { x0: Math.floor(((s.left - box.left) * dpr) / d), x1: Math.ceil(((s.right - box.left) * dpr) / d), left: s.left + s.width / 2 < box.left + box.width / 2 };
    }).filter(Boolean);
    this.view = { key, W: vw, H: vh, d: 1, vw, vh, camX, camY, hx: camX + fx, hy: camY + fy, shade };
    return this.view;
  }

  update(dt) {
    this.t += dt;
    const v = this.#layout();
    if (!v) return;
    this.mx += (this.tmx - this.mx) * Math.min(1, dt * 2.5); this.my += (this.tmy - this.my) * Math.min(1, dt * 2.5);
    if (this.seq) {
      this.seqT += dt;
      const total = this.seq.reduce((s, x) => s + x[1], 0);
      // Schlag der Angriffsfolge: Funken vor der Klinge
      if (!this.hitDone && this.seq === MOMENTS.class && this.seqT > total - 0.42) { this.hitDone = true; this.#burst(v.hx + 16, v.hy - 22, 16); }
      if (!this.hitDone && this.seq === MOMENTS.race && this.seqT > 0.35) { this.hitDone = true; this.#burst(v.hx, v.hy - 40, 14, true); }
      if (this.seqT >= total) this.seq = null;
    } else if (!this.reduced && this.t >= this.nextAmbient) {
      this.seq = MOMENTS[AMBIENT[Math.floor(Math.random() * AMBIENT.length)]]; this.seqT = 0; this.hitDone = false;
      this.nextAmbient = this.t + 7 + Math.random() * 3;
    }
    if (this.ring) { this.ring.t += dt; if (this.ring.t > 0.5) this.ring = null; }
    this.flash = Math.max(0, this.flash - dt);
    if (!this.reduced) {
      if (Math.random() < dt * 2.2) this.#ash();
      if (Math.random() < dt * 3) this.#spark(v.hx + rnd(-20, 20), v.hy + rnd(-1, 1), { vy: -rnd(10, 26), vx: rnd(-3, 3), max: rnd(0.5, 1.2), wob: 6 });
    }
    for (const q of this.parts) {
      q.life += dt;
      if (q.wob) q.vx += Math.sin(q.life * 6 + q.seed) * q.wob * dt;
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
    this.parts = this.parts.filter((q) => q.life < q.max && (!q.rain || q.y < S.FY + 60));
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
    this.#draw(v);
  }

  #burst(x, y, n, up = false) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) this.#spark(x + rnd(-3, 3), y + rnd(-4, 4), up ? { vy: -rnd(30, 70), vx: rnd(-14, 14) } : { vx: rnd(10, 60), vy: -rnd(10, 50), g: 120, wob: 0, max: rnd(0.25, 0.55) });
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

  // Schachbrettmuster in Szenenpixeln (Dichte 1/2 oder 1/4) als Füllmuster, am Leinwand-Ursprung ausgerichtet
  #dither(d, density) {
    const key = `${d}|${density}`;
    this.dithers ??= new Map();
    let p = this.dithers.get(key);
    if (!p) {
      const n = density === 0.5 ? 2 : 4, c = document.createElement('canvas');
      c.width = c.height = n * d;
      const g = c.getContext('2d');
      g.fillStyle = SHADE;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (density === 0.5 ? (x + y) & 1 : (y & 1) || x !== (y % 4 ? 2 : 0)) continue;
        g.fillRect(x * d, y * d, d, d);
      }
      p = this.ctx.createPattern(c, 'repeat');
      this.dithers.set(key, p);
    }
    return p;
  }

  #draw(v) {
    const { ctx, I } = this, { d, camX, camY, W, H } = v;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#060309'; ctx.fillRect(0, 0, W, H);
    if (!I) return;
    const e = this.reduced ? 0 : Math.min(1, this.t / 3), t = this.t;
    const sx = e * 3 * Math.sin((t * Math.PI * 2) / 26) + this.mx * 3, sy = e * Math.sin((t * Math.PI * 2) / 19) + this.my;
    const off = (f) => [Math.round(sx * f), Math.round(sy * f)];
    const blit = (img, sx0, sy0, w, hh, x, y, f) => {
      if (!img) return;
      const [ox0, oy0] = off(f);
      const ox = (x - camX - ox0) * d, oy = (y - camY - oy0) * d;
      const x0 = Math.max(0, Math.floor(-ox / d)), x1 = Math.min(w, Math.ceil((W - ox) / d));
      const y0 = Math.max(0, Math.floor(-oy / d)), y1 = Math.min(hh, Math.ceil((H - oy) / d));
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(img, sx0 + x0, sy0 + y0, x1 - x0, y1 - y0, ox + x0 * d, oy + y0 * d, (x1 - x0) * d, (y1 - y0) * d);
    };
    const whole = (img, x, y, f) => img && blit(img, 0, 0, img.width, img.height, x, y, f);
    const px = (x, y, c, w = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect((Math.round(x) - camX) * d, (Math.round(y) - camY) * d, w * d, hh * d); };
    const pulse = this.reduced ? 1 : stepped(0.8 + 0.2 * Math.cos((t * Math.PI * 2) / 3.4), 3);

    // Ferne, Lavastrom, Ebene, Vordergrund (wie site/titel.js)
    whole(I.fern, 0, 0, 0.12);
    ctx.globalAlpha = this.reduced ? 1 : stepped(0.7 + 0.3 * Math.abs(Math.cos(t * 5.3) * Math.cos(t * 2.1)), 3);
    whole(I['fern-glut'], 0, 0, 0.12);
    ctx.globalAlpha = 1;
    const lf = this.reduced ? 0 : Math.floor(t * 2.5) % S.LH;
    blit(I.strom, 0, lf * S.LH2, S.W, S.LH2, 0, S.LT, 0.35);
    ctx.globalAlpha = pulse; blit(I['strom-glut'], 0, lf * S.LH2, S.W, S.LH2, 0, S.LT, 0.35); ctx.globalAlpha = 1;
    whole(I.mitte, 0, 0, 0.5);
    ctx.globalAlpha = this.reduced ? 1 : stepped(0.7 + 0.3 * Math.cos((t * Math.PI * 2) / 4.1), 3); whole(I['mitte-glut'], 0, 0, 0.5); ctx.globalAlpha = 1;
    whole(I.nah, 0, S.NT, 1);
    ctx.globalAlpha = pulse; whole(I['nah-glut'], 0, S.NT, 1); ctx.globalAlpha = 1;
    // Unterhalb der Szene (sehr hohe Fenster): Kruste dunkel fortsetzen
    const bottom = (S.H - camY) * d;
    if (bottom < H) { ctx.fillStyle = '#0a0506'; ctx.fillRect(0, bottom, W, H - bottom); }

    // Glutsiegel unter dem Helden: Runenring in harten Stufen, bei einer Auswahl hell, dazu eine Welle nach außen
    const { hx, hy } = v;
    const ring = (rx, ry, col, every = 1) => {
      const n = Math.round(rx * 4);
      for (let i = 0; i < n; i += every) {
        const a = (i / n) * Math.PI * 2;
        px(hx + Math.cos(a) * rx, hy + Math.sin(a) * ry, col);
      }
    };
    ctx.fillStyle = 'rgba(4,2,6,0.55)';
    for (let yy = -3; yy <= 3; yy++) { const w = Math.round(17 * Math.sqrt(1 - (yy / 4) ** 2)); px(hx - w, hy + yy, 'rgba(4,2,6,0.5)', w * 2 + 1, 1); }
    const glow = this.flash > 0 ? 5 : 2 + Math.round(pulse * 1.5);
    ring(26, 6, RUNE[Math.min(5, glow)]);
    ring(22, 5, RUNE[Math.max(1, glow - 2)], 3);
    for (let k = 0; k < 8; k++) {   // Runen: kurze Striche auf dem Ring
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const rx = hx + Math.cos(a) * 24, ry = hy + Math.sin(a) * 5.5;
      px(rx, ry - 1, RUNE[Math.min(5, glow + 1)], 1, 2);
    }
    if (this.ring) {
      const k = this.ring.t / 0.5, rx = 26 + k * 46, ry = 6 + k * 10;
      ring(rx, ry, FIRE[Math.min(3, Math.floor(k * 4))], k > 0.5 ? 2 : 1);
    }

    // Held 1:1 (Feinpixel = Szenenpixel)
    const f = this.#frame();
    if (f) {
      const x = (hx - camX) * d - f.ax * d, y = (hy - camY) * d - f.ay * d;
      ctx.drawImage(f.canvas, 0, 0, f.canvas.width, f.canvas.height, Math.round(x), Math.round(y), f.canvas.width * d, f.canvas.height * d);
      // Glutkante: Licht von Lava und Kruste auf der Rückseite und unten an der Figur, harte Pixel
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7;
      ctx.drawImage(rimOf(f.canvas), 0, 0, f.canvas.width, f.canvas.height, Math.round(x), Math.round(y), f.canvas.width * d, f.canvas.height * d);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.flash > 0.09) { ctx.globalAlpha = 0.6; ctx.drawImage(f.flash, 0, 0, f.canvas.width, f.canvas.height, Math.round(x), Math.round(y), f.canvas.width * d, f.canvas.height * d); ctx.globalAlpha = 1; }
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

    // Seitenspalten (Auswahl, Übersicht): abdunkeln, damit Schrift ruhig steht; Übergang im Schachbrettraster
    for (const s of v.shade) {
      const fill = (x0, x1, density) => {
        if (x1 <= x0) return;
        ctx.fillStyle = density >= 1 ? SHADE : this.#dither(d, density);
        ctx.fillRect(x0 * d, 0, (x1 - x0) * d, H);
      };
      const B = 4;
      if (s.left) { fill(0, s.x1, 1); fill(s.x1, s.x1 + B, 0.5); fill(s.x1 + B, s.x1 + 2 * B, 0.25); }
      else { fill(s.x0, Math.ceil(W / d), 1); fill(s.x0 - B, s.x0, 0.5); fill(s.x0 - 2 * B, s.x0 - B, 0.25); }
    }
  }
}

// Kleines Heldenbild für die Auswahlkacheln, 1:1 in Feinpixeln (frame.res 2), Anzeige ganzzahlig per CSS.
// crop 'bust' zeigt Kopf und Schultern, sonst die ganze Figur.
export class TilePortrait {
  constructor({ crop = 'full', scale = 1 }) {
    this.crop = crop; this.scale = scale;
    const [w, hh] = crop === 'bust' ? [36, 30] : [40, 66];
    this.canvas = h('canvas.cc-tile-art', { 'aria-hidden': 'true' });
    this.canvas.width = w; this.canvas.height = hh;
    this.canvas.style.width = `${w * scale}px`; this.canvas.style.height = `${hh * scale}px`;
    this.ctx = this.canvas.getContext('2d');
  }

  set(anims) {
    const f = anims.idle.frames[0], { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.crop === 'bust') {
      // Oberkante der Figur suchen, Kopf oben bündig mit 2 Pixeln Luft
      const top = topOf(f.canvas);
      ctx.drawImage(f.canvas, Math.round(canvas.width / 2 - f.ax + 2), 2 - top);
    } else {
      ctx.drawImage(f.canvas, Math.round(canvas.width / 2 - f.ax + 3), canvas.height - 2 - f.ay);
    }
  }
}

// Kantenlicht einer Figur: erster Pixel innerhalb der Kontur, links (Rückseite, der Held blickt nach rechts) und
// unten; zur Mitte der Figur hin dunkler, im oberen Drittel nur noch schwach. Einmal je Frame berechnet.
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

const tops = new WeakMap();
function topOf(cv) {
  if (tops.has(cv)) return tops.get(cv);
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let top = 0;
  search: for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 0) { top = y; break search; }
  tops.set(cv, top);
  return top;
}
