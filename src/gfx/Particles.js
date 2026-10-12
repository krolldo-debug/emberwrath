import { rand, pick } from '../core/math.js';
import { fineRes } from './Fine.js';

// Partikelsystem mit Pool und Pseudo-Höhe (z): Splitter fliegen hoch,
// fallen zurück, prallen ab und können als Dekal liegen bleiben.
// "emissive" Partikel werden nach der Beleuchtung gezeichnet (leuchten).
// Farbrampen je Element (hell -> dunkel) für Zauber, Einschläge und Auren.
// light: Lichtfarbe (RGB), sound: Sfx-Name. Von Feedback und Effekten genutzt.
export const ELEMENTS = {
  fire: { colors: ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'], light: [255, 150, 60], sound: 'fire', pitch: 1, rise: 20 },
  // Frost und Schatten (11.10., Grafikupdate): dunkle Stufen heller und satter, sonst verschwinden sie auf dunklem Boden
  frost: { colors: ['#ffffff', '#ccf2ff', '#86d0ff', '#4c9cf0', '#2a5cc8'], light: [140, 200, 255], sound: 'frost', pitch: 1, rise: -4 },
  holy: { colors: ['#ffffff', '#fff0b0', '#ffd66a', '#e8a830', '#8a5a18'], light: [255, 220, 140], sound: 'magic', pitch: 1.3, rise: 26 },
  shadow: { colors: ['#f4e2ff', '#c890ff', '#9a52f4', '#6c2ad0', '#43168c'], light: [150, 80, 255], sound: 'magic', pitch: 0.6, rise: 10 },
  arcane: { colors: ['#ffffff', '#e0b8ff', '#c07aff', '#8a4ae0', '#4a1a90'], light: [190, 130, 255], sound: 'magic', pitch: 1, rise: 14 },
  poison: { colors: ['#e8ffb0', '#a8e05a', '#6aa02a', '#3a6a18', '#1a300a'], light: [150, 230, 90], sound: 'poison', pitch: 1, rise: 8 },
  nature: { colors: ['#f0ffe0', '#b0f080', '#60c050', '#2e8038', '#12401a'], light: [150, 240, 140], sound: 'magic', pitch: 1.1, rise: 12 },
  spore: { colors: ['#f4e0ff', '#e0b8ff', '#a070d8', '#6a4aa0', '#3a2458'], light: [180, 120, 230], sound: 'gas', pitch: 0.9, rise: 6 },
  water: { colors: ['#ffffff', '#c6eaf6', '#76bcdc', '#3886b2', '#1c5882'], light: [90, 190, 255], sound: 'splash', pitch: 0.8, rise: -6 },
  physical: { colors: ['#ffffff', '#ffe8a0', '#ffc050', '#f07a1c', '#7a2208'], light: [255, 200, 130], sound: 'hit', pitch: 1, rise: 0 },
};

// Ausblenden in drei harten Stufen (1 / ⅔ / ⅓), kein weicher Verlauf
const step3 = (v) => (v > 0.66 ? 1 : v > 0.33 ? 0.66 : 0.33);

class Particle {
  reset(o) {
    this.x = o.x; this.y = o.y; this.z = o.z ?? 0;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0; this.vz = o.vz ?? 0;
    this.gravity = o.gravity ?? 0;
    this.drag = o.drag ?? 0;
    this.life = this.maxLife = o.life ?? 0.5;
    this.colors = o.colors ?? ['#ffffff'];
    this.size = o.size ?? 1;
    this.shrink = o.shrink ?? false;
    this.emissive = o.emissive ?? false;
    this.streak = o.streak ?? false;
    this.bounce = o.bounce ?? 0;
    this.decal = o.decal ?? null; // Farbe, die beim Liegenbleiben gestempelt wird
    this.rise = o.rise ?? 0;
    this.wobble = o.wobble ?? 0;
    this.alpha = o.alpha ?? 1;
    this.fade = o.fade ?? true;
    // Feinraster (gfx/Fine.js): fine = true → Größe in Feinpixeln, Lage auf das Feinraster gerundet (0,5 Weltpixel);
    // ohne fade verlischt das Teilchen hart: Farbstufen über colors, im letzten Viertel blinkend statt durchscheinend
    this.fine = o.fine ?? false;
    this.seed = Math.random() * 10;
    this.landed = false;
    this.alive = true;
    return this;
  }
}

export class ParticleSystem {
  constructor(decals) {
    this.pool = [];
    this.active = [];
    this.decals = decals;
    this.max = 1400;   // hartes Budget (Qualitätsstufe, ui/Quality.js)
    this.density = 1;  // Anteil der Effekt-Partikel, die tatsächlich entstehen (0..1)
  }
  spawn(o) {
    if (this.active.length >= this.max) return null;
    // weiches Budget: ab halber Füllung und bei geringerer Dichte werden Effekt-Partikel ausgedünnt
    const fill = this.active.length / this.max;
    if ((this.density < 1 || fill > 0.5) && Math.random() > this.density * (fill > 0.5 ? 1.5 - fill : 1)) return null;
    const p = (this.pool.pop() ?? new Particle()).reset(o);
    this.active.push(p);
    return p;
  }
  update(dt) {
    const list = this.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.decal && this.decals) this.decals.pixel(p.x, p.y, p.decal);
        list[i] = list[list.length - 1]; list.pop(); this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.wobble) p.vx += Math.sin((p.maxLife - p.life) * 6 + p.seed) * p.wobble * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.y -= p.rise * dt;
      if (p.gravity) {
        p.vz -= p.gravity * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.bounce && Math.abs(p.vz) > 20) { p.vz = -p.vz * p.bounce; p.vx *= 0.6; p.vy *= 0.6; }
          else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; if (!p.landed) { p.landed = true; if (p.decal && this.decals) { this.decals.pixel(p.x, p.y, p.decal); p.life = Math.min(p.life, 0.05); } } }
        }
      }
    }
  }
  // Feinraster (docs/STYLE.md „Feinraster“ §5): Lage auf Feinpixel gerundet, Ausblenden in höchstens drei harten
  // Alpha-Stufen statt weich. Im Feinraster bekommen Teilchen eine Form: 1 Weltpixel = 2×2 Feinpixel mit heißem
  // Feinpixel oben links (Licht von oben links, eine Rampenstufe heller), ab 2 Weltpixeln abgerundete Ecken und
  // heißer Kern, Funkenschweife als feine Linie mit hellem Kopf. Bei „Niedrig“ (fineRes 1) wie früher in Weltpixeln.
  #draw(ctx, camX, camY, emissive) {
    const q = fineRes(), P = 1 / q, fine = q > 1;
    for (const p of this.active) {
      if (p.emissive !== emissive) continue;
      const t = 1 - p.life / p.maxLife, cols = p.colors, n = cols.length;
      const ci = Math.min(n - 1, Math.floor(t * n)), color = cols[ci];
      if (p.fine) {
        if (!p.fade && t > 0.75 && Math.floor(p.life * 24 + p.seed) % 2) continue;
        const s = Math.max(1, Math.round(p.shrink ? p.size * (1 - t) : p.size)) * P;
        ctx.globalAlpha = p.fade ? p.alpha * Math.min(1, (p.life / p.maxLife) * 2.5) : p.alpha;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round((p.x - camX) * q) * P, Math.round((p.y - p.z - camY) * q) * P, s, s);
        continue;
      }
      const s = p.shrink ? Math.max(1, Math.round(p.size * (1 - t))) : p.size;
      const x = Math.round((p.x - camX - s / 2) * q) * P, y = Math.round((p.y - p.z - camY - s / 2) * q) * P;
      ctx.globalAlpha = p.fade ? p.alpha * step3(Math.min(1, (p.life / p.maxLife) * 2.5)) : p.alpha;
      ctx.fillStyle = color;
      if (p.streak) {
        const v = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / v, ny = p.vy / v;
        const len = Math.min(4, v * 0.02);
        if (!fine) { for (let k = 0; k <= len; k++) ctx.fillRect(Math.round(x - nx * k), Math.round(y - ny * k), 1, 1); continue; }
        // Schweif in Feinpixeln (hinten eine Stufe dunkler), Kopf 1 Weltpixel mit heißem Feinpixel
        const tail = cols[Math.min(n - 1, ci + 1)];
        for (let k = 2, m = Math.round(len * q) + 1; k <= m; k++) {
          if (k > m / 2 + 1) ctx.fillStyle = tail;
          ctx.fillRect(Math.round((x - nx * k * P) * q) * P, Math.round((y - ny * k * P) * q) * P, P, P);
        }
        ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = cols[Math.max(0, ci - 1)]; ctx.fillRect(x + (nx < 0 ? 0 : P), y + (ny < 0 ? 0 : P), P, P);
        continue;
      }
      if (!fine) { ctx.fillRect(x, y, s, s); continue; }
      if (s >= 2) {
        ctx.fillRect(x + P, y, s - 2 * P, s); ctx.fillRect(x, y + P, s, s - 2 * P);
        if (n > 1) { ctx.fillStyle = cols[Math.max(0, ci - 1)]; ctx.fillRect(x + P, y + P, s / 2, s / 2); }
      } else {
        ctx.fillRect(x, y, s, s);
        if (ci > 0) { ctx.fillStyle = cols[ci - 1]; ctx.fillRect(x, y, P, P); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // Schatten der fliegenden Splitter (verankert sie optisch am Boden)
  drawShadows(ctx, camX, camY) {
    const q = fineRes(), P = 1 / q;
    ctx.fillStyle = 'rgba(5,3,10,0.4)';
    for (const p of this.active) if (p.gravity && p.z > 1 && !p.emissive) ctx.fillRect(Math.round((p.x - camX - 0.5) * q) * P, Math.round((p.y - camY) * q) * P, 1, P);
  }
  drawLit(ctx, camX, camY) { this.#draw(ctx, camX, camY, false); }
  drawEmissive(ctx, camX, camY) { this.#draw(ctx, camX, camY, true); }

  // ---- Vorgefertigte Effekte --------------------------------------------
  burst(x, y, { count = 10, speed = [40, 120], angle = 0, spread = Math.PI * 2, ...rest }) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const s = rand(speed[0], speed[1]);
      this.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, ...rest, life: Array.isArray(rest.life) ? rand(rest.life[0], rest.life[1]) : rest.life });
    }
  }
  sparks(x, y, angle, count = 8, colors = ['#ffffff', '#ffe8a0', '#ffc050', '#f07a1c']) {
    this.burst(x, y, { count, angle, spread: 1.6, speed: [80, 220], life: [0.12, 0.3], colors, emissive: true, streak: true, drag: 6 });
  }
  gore(x, y, z, angle, count, palette, decal = true) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.9, 0.9);
      const s = rand(30, 110);
      this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(30, 110), gravity: 380, life: rand(0.6, 1.2), colors: [pick(palette)], size: pick([1, 1, 2]), decal: decal ? pick(palette) : null, drag: 1.5 });
    }
  }
  bones(x, y, z, angle, count, palette) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-1.3, 1.3);
      const s = rand(30, 130);
      this.spawn({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(50, 150), gravity: 420, bounce: 0.45, life: rand(0.9, 1.6), colors: [pick(palette)], size: pick([1, 2, 2]), decal: pick(palette), drag: 1.2 });
    }
  }
  dust(x, y, count = 4, color = '#4d4459') {
    this.burst(x, y, { count, speed: [8, 30], life: [0.3, 0.6], colors: [color, '#3e364b', '#312a3d'], size: 2, shrink: true, drag: 4, alpha: 0.7, rise: 6 });
  }
  embers(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      this.spawn({ x: x + rand(-2, 2), y, vx: rand(-6, 6), vy: 0, rise: rand(12, 26), wobble: 30, life: rand(0.8, 1.8), colors: ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'], emissive: true });
    }
  }
  magic(x, y, count = 12, radius = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, radius);
      this.spawn({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, vx: 0, vy: 0, rise: rand(15, 40), wobble: 20, life: rand(0.4, 1), colors: ['#ffffff', '#e0b8ff', '#a060f0', '#6a2cb0'], emissive: true });
    }
  }
  // Elementare Funken: Glühende Partikel, die je nach Element steigen oder fallen.
  element(x, y, kind, count = 12, radius = 6) {
    const el = ELEMENTS[kind] ?? ELEMENTS.arcane;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, radius), s = rand(10, 60);
      this.spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, drag: 4,
        rise: el.rise * rand(0.5, 1.5), wobble: kind === 'fire' || kind === 'shadow' ? 25 : 8,
        life: rand(0.35, 0.9), colors: el.colors, emissive: true, size: Math.random() < 0.25 ? 2 : 1, shrink: true,
      });
    }
  }

  ring(x, y, radius, count, colors, speed = 60) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.spawn({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius * 0.6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.6, drag: 5, life: rand(0.25, 0.45), colors, emissive: true });
    }
  }
}
