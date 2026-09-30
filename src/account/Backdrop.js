import { CONFIG } from '../config.js';
import { rand } from '../core/math.js';

// Animierter Hintergrund der Menü-Bildschirme im internen Pixel-Canvas:
// Gewölbe der Katakomben im Gegenlicht, zwei Fackeln, aufsteigende Glut.
// Optional steht eine Figur (Frame-Quelle) auf dem Podest in der Mitte.
const W = CONFIG.viewWidth, H = CONFIG.viewHeight;

export class Backdrop {
  constructor() {
    this.t = 0;
    this.embers = Array.from({ length: 70 }, () => this.#ember(true));
    this.dust = Array.from({ length: 40 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(2, 6), a: rand(0.15, 0.4) }));
    this.figure = null; // { anims, x } – Held auf dem Podest
    this.figureTime = 0;
    this.static = Backdrop.#buildStatic();
  }

  #ember(initial = false) {
    return { x: rand(W * 0.2, W * 0.8), y: initial ? rand(0, H) : H + rand(0, 20), vy: rand(10, 28), wob: rand(0, 6), life: rand(0.6, 1), size: Math.random() < 0.2 ? 2 : 1 };
  }

  // Gewölbe, Säulen, Boden: einmal vorberechnet
  static #buildStatic() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05020a'); bg.addColorStop(0.55, '#0e0616'); bg.addColorStop(1, '#1a0a12');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // Ferne Bögen (drei Ebenen, von hinten nach vorne dunkler/größer)
    const layers = [
      { n: 7, w: 44, top: 70, col: '#130a1c', pill: 10 },
      { n: 5, w: 70, top: 48, col: '#0d0614', pill: 14 },
      { n: 3, w: 130, top: 20, col: '#07030c', pill: 22 },
    ];
    for (const L of layers) {
      const span = W / L.n;
      for (let i = 0; i <= L.n; i++) {
        const cx = i * span;
        g.fillStyle = L.col;
        g.fillRect(Math.round(cx - L.pill / 2), L.top, L.pill, H - L.top);
        // Bogen zum Nachbarn
        g.beginPath();
        g.moveTo(cx, L.top + 30);
        g.quadraticCurveTo(cx + span / 2, L.top - 18, cx + span, L.top + 30);
        g.lineTo(cx + span, L.top - 10); g.lineTo(cx, L.top - 10); g.closePath();
        g.fill();
        // Steinfugen auf den Säulen
        g.fillStyle = 'rgba(255,255,255,0.025)';
        for (let y = L.top + 6; y < H; y += 9) g.fillRect(Math.round(cx - L.pill / 2), y, L.pill, 1);
      }
    }
    g.fillStyle = '#07030c'; g.fillRect(0, 0, W, 14);
    // Boden mit Platten
    const fy = H - 46;
    const fl = g.createLinearGradient(0, fy, 0, H);
    fl.addColorStop(0, '#120a16'); fl.addColorStop(1, '#0a050c');
    g.fillStyle = fl; g.fillRect(0, fy, W, H - fy);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = fy + 6, k = 0; y < H; y += 8 + k * 2, k++) g.fillRect(0, y, W, 1);
    for (let x = -20; x < W + 20; x += 26) g.fillRect(Math.round(W / 2 + (x - W / 2) * 1.6), fy, 1, H - fy);
    return c;
  }

  update(dt) {
    this.t += dt;
    this.figureTime += dt;
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      e.y -= e.vy * dt;
      e.x += Math.sin(this.t * 1.7 + e.wob) * 6 * dt;
      e.life -= dt * 0.12;
      if (e.y < -4 || e.life <= 0) this.embers[i] = this.#ember();
    }
    for (const d of this.dust) { d.x += d.v * dt; if (d.x > W) d.x = 0; }
  }

  #torch(ctx, x, y) {
    const f = 0.85 + Math.sin(this.t * 11 + x) * 0.08 + Math.sin(this.t * 23 + x * 2) * 0.05;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 70 * f);
    g.addColorStop(0, 'rgba(255,170,80,0.42)');
    g.addColorStop(0.4, 'rgba(220,90,30,0.14)');
    g.addColorStop(1, 'rgba(120,30,10,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 80, y - 80, 160, 160);
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 1, y + 2, 3, 9);
    ctx.fillStyle = '#4a2e1c'; ctx.fillRect(x - 2, y + 1, 5, 2);
    ctx.fillStyle = '#f07a1c'; ctx.fillRect(x - 1, y - 3, 3, 4);
    ctx.fillStyle = '#ffb640'; ctx.fillRect(x, y - 4 - Math.round(f * 2), 1, 5);
    ctx.fillStyle = '#fff0b0'; ctx.fillRect(x, y - 1, 1, 2);
  }

  render(ctx) {
    ctx.drawImage(this.static, 0, 0);
    // Glutschein aus der Tiefe
    const pulse = 0.8 + Math.sin(this.t * 0.9) * 0.2;
    const g = ctx.createRadialGradient(W / 2, H + 30, 10, W / 2, H + 30, 230);
    g.addColorStop(0, `rgba(255,110,30,${0.34 * pulse})`);
    g.addColorStop(0.5, `rgba(160,40,20,${0.12 * pulse})`);
    g.addColorStop(1, 'rgba(60,10,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.#torch(ctx, 70, 120);
    this.#torch(ctx, W - 70, 120);

    if (this.figure) {
      const fx = Math.round(this.figure.x ?? W / 2), fy = H - 32;
      // Podest
      ctx.fillStyle = '#1e1422'; ctx.fillRect(fx - 26, fy + 1, 52, 5);
      ctx.fillStyle = '#2e2232'; ctx.fillRect(fx - 26, fy + 1, 52, 1);
      ctx.fillStyle = '#150d18'; ctx.fillRect(fx - 32, fy + 6, 64, 5);
      ctx.fillStyle = '#281c2c'; ctx.fillRect(fx - 32, fy + 6, 64, 1);
      const lg = ctx.createRadialGradient(fx, fy - 12, 2, fx, fy - 12, 50);
      lg.addColorStop(0, 'rgba(255,170,90,0.22)'); lg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = lg; ctx.fillRect(fx - 50, fy - 62, 100, 100);
      const f = this.figure.anims.idle.frameAt(this.figureTime);
      ctx.fillStyle = 'rgba(4,2,8,0.5)';
      ctx.beginPath(); ctx.ellipse(fx, fy, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
      f.draw(ctx, fx, fy);
    }

    for (const d of this.dust) { ctx.fillStyle = `rgba(160,140,190,${d.a})`; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); }
    for (const e of this.embers) {
      const k = e.life;
      ctx.fillStyle = k > 0.7 ? '#fff0b0' : k > 0.45 ? '#ffb640' : k > 0.25 ? '#f07a1c' : '#7a2208';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
    }
    // Vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
}

// Ein Hintergrund für alle Menü-Szenen, damit er beim Wechsel nicht springt.
let shared = null;
export function sharedBackdrop() { return (shared ??= new Backdrop()); }
