import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Aschewolf (und Rudelführer): hageres Tier mit aschgrauem Fell, in dem
// Glut glimmt. Seitenansicht nach rechts, parametrisch gezeichnet.
const VARIANTS = {
  wolf: { s: 1, fur: ['#1e1a1d', '#322b2f', '#4b4247', '#675c61', '#877b80', '#aa9ea2'], mane: PAL.ember[3], belly: '#3a3236' },
  alpha: { s: 1.3, fur: ['#141013', '#241b1f', '#35292e', '#4b3b41', '#645157', '#806a70'], mane: PAL.ember[4], belly: '#2a2024' },
};

function drawWolf(p, v, o = {}) {
  const { t = 0, amp = 1, crouch = 0, leap = 0, headUp = 0, jaw = 0, hurt = false, lying = 0, bob = 0 } = o;
  const s = v.s, F = v.fur;
  const W = p.w, gy = p.h - 4; // Bodenlinie
  const ox = Math.round(W / 2 - 20 * s);
  const X = (x) => ox + x * s, Y = (y) => gy - (26 - y) * s;
  const by = 15 + crouch + bob + lying * 5;

  if (lying > 0) {
    // Liegend, Beine seitlich weggestreckt
    p.ellipse(X(20), Y(22), 11 * s, 3.5 * s, F[2]);
    p.ellipse(X(20), Y(21), 9 * s, 2.5 * s, F[3]);
    p.ellipse(X(31), Y(22), 4 * s, 3 * s, F[3]);
    p.rect(X(33), Y(22), 4 * s, 2 * s, F[2]);
    p.line(X(12), Y(23), X(6), Y(25), F[2]);
    for (const lx of [14, 18, 25, 28]) p.line(X(lx), Y(24), X(lx + 4), Y(26 - lying), F[1]);
    p.px(X(32), Y(21), '#1a0808');
    return;
  }

  const leg = (x0, phase, back, front) => {
    const sw = Math.sin(t * TAU + phase) * 3 * amp + (front ? leap * 4 : -leap * 4);
    const lift = Math.max(0, Math.cos(t * TAU + phase)) * 2 * amp;
    const hipY = by + 3;
    const kx = x0 + sw * 0.4 + (back ? -1.5 : 1), ky = hipY + 4 - lift * 0.3;
    const fx = x0 + sw, fy = 26 - lift - (leap > 0 ? 2 : 0);
    const c = back ? F[1] : F[3];
    p.line(X(x0), Y(hipY), X(kx), Y(ky), c);
    p.line(X(x0) + 1, Y(hipY), X(kx) + 1, Y(ky), back ? F[0] : F[2]);
    p.line(X(kx), Y(ky), X(fx), Y(fy), c);
    p.px(X(fx) + 1, Y(fy), F[back ? 0 : 1]);
  };
  // hintere Beine (weiter hinten im Bild)
  leg(12, Math.PI, true, false);
  leg(26, 0, true, true);
  // Schwanz
  const tw = Math.sin(t * TAU * (amp > 0.5 ? 1 : 0.5)) * 1.5;
  for (let i = 0; i < 6; i++) p.ellipse(X(9 - i * 1.2), Y(by - 1 + i * 0.9 + tw * (i / 6)), (2.2 - i * 0.2) * s, 1.6 * s, i < 2 ? F[2] : F[3]);
  p.px(X(3), Y(by + 5 + tw), F[4]);
  // Rumpf
  p.ellipse(X(14), Y(by + 1), 5 * s, 4 * s, F[2]);
  p.ellipse(X(20), Y(by), 8 * s, 4 * s, F[2]);
  p.ellipse(X(26 + leap), Y(by), 5 * s, 5 * s, F[3]);
  p.ellipse(X(20), Y(by - 1.5), 6 * s, 2 * s, F[3]);
  p.ellipse(X(20), Y(by + 3), 6 * s, 1.2 * s, v.belly);
  // Glimmende Mähne / Rückenlinie
  for (let x = 13; x < 28; x += 2) p.px(X(x), Y(by - 4 + Math.abs(x - 22) * 0.12), x % 4 ? F[4] : v.mane);
  p.px(X(24), Y(by - 4), F[5]);
  // Rippen
  p.px(X(19), Y(by + 1), F[1]); p.px(X(21), Y(by + 1), F[1]); p.px(X(20), Y(by + 2), F[1]);
  // vordere Beine
  leg(14, 0, false, false);
  leg(27, Math.PI, false, true);
  // Kopf
  const hx = 31 + leap * 1.5, hy = by - 4 - headUp * 3 + crouch * 0.6;
  p.line(X(27 + leap), Y(by - 2), X(hx), Y(hy + 1), F[3]);
  p.ellipse(X(hx), Y(hy), 3.5 * s, 3 * s, F[3]);
  p.ellipse(X(hx - 0.5), Y(hy - 1), 2.5 * s, 1.5 * s, F[4]);
  // Schnauze
  const sx = hx + 2, sy = hy + 0.5 - headUp * 1.5;
  p.rect(X(sx), Y(sy - 1), 4 * s, 2 * s, F[3]);
  p.px(X(sx + 4), Y(sy - 1), '#0a0608');
  p.rect(X(sx), Y(sy + 1 + jaw), 3.5 * s, 1, F[2]);
  if (jaw) { p.rect(X(sx), Y(sy + 1), 3 * s, jaw, '#2a0808'); p.px(X(sx + 1), Y(sy + 1), '#e6dcc0'); p.px(X(sx + 3), Y(sy + 1), '#e6dcc0'); }
  // Ohren
  p.line(X(hx - 1), Y(hy - 2), X(hx - 2), Y(hy - 5), F[4]);
  p.line(X(hx + 0.5), Y(hy - 2), X(hx), Y(hy - 5), F[3]);
  // Auge
  p.px(X(hx + 1), Y(hy - 0.5), hurt ? '#ffffff' : PAL.ember[4]);
}

export function createWolfSprites(kind = 'wolf') {
  const v = VARIANTS[kind];
  const W = Math.round(46 * v.s), H = Math.round(32 * v.s);
  const AX = Math.round(W / 2), AY = H - 5;
  const f = (o) => buildFrame(W, H, AX, AY, (p) => drawWolf(p, v, o));
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.05, amp: 0, bob: i === 2 ? 1 : 0 })), 4),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, amp: 1, bob: i % 3 === 0 ? 1 : 0 })), 13),
    windup: new Animation([f({ crouch: 1, jaw: 1 }), f({ crouch: 2, jaw: 2 }), f({ crouch: 3, jaw: 2, t: 0.25, amp: 0.3 })], 9, false),
    strike: new Animation([f({ leap: 1, jaw: 2, t: 0.25, amp: 0.4 }), f({ leap: 0.6, jaw: 1, t: 0.4, amp: 0.4 })], 10, false),
    hurt: new Animation([f({ crouch: 1, hurt: true, headUp: -0.5 })], 1, false),
    howl: new Animation([f({ headUp: 1, crouch: 1 }), f({ headUp: 2, jaw: 1 }), f({ headUp: 2.3, jaw: 2 })], 6, false),
    death: new Animation([f({ hurt: true, crouch: 2, headUp: 1 }), f({ lying: 0.5 }), f({ lying: 1 })], 8, false),
  };
}
