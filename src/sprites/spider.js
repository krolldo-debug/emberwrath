import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Höhlenspinne: großer Hinterleib mit roter Zeichnung, acht animierte Beine.
const W = 46, H = 34, AX = 22, AY = 27;
const S = PAL.spider, M = PAL.spiderMark, E = PAL.eye;

function drawLeg(p, bx, by, dir, phase, lift, color, knee, reach = 1) {
  const fx = bx + dir * (9 + Math.sin(phase) * 2.5) * reach;
  const fy = AY - Math.max(0, Math.cos(phase)) * lift;
  const kx = (bx + fx) / 2 + dir * 1;
  const ky = Math.min(by, fy) - 7 - lift * 0.4;
  p.line(bx, by, kx, ky, color);
  p.line(kx, ky, fx, fy, color);
  p.px(kx, ky, knee);
}

function drawSpider(p, o = {}) {
  const { t = 0, bob = 0, rear = 0, lunge = 0, fangs = 0, hurt = false, legAmp = 1 } = o;
  const cy = 20 + bob - rear;
  const ax = 16 - lunge, hx = 25 + lunge;
  // Beine hinten (dunkler)
  for (let i = 0; i < 4; i++) {
    const dir = i < 2 ? 1 : -1;
    const ph = t * TAU + i * 1.7 + Math.PI;
    drawLeg(p, 21 + i * 0.5, cy + 1, dir, ph * legAmp, 2 * legAmp, S[1], S[2], i === 0 ? 1.1 + rear * 0.08 : 1);
  }
  // Hinterleib
  p.ellipse(ax, cy - 2, 7.5, 6, S[2]);
  p.ellipse(ax + 1, cy - 3, 6, 4.5, S[3]);
  p.ellipse(ax + 2, cy - 5, 3, 1.5, S[4]);
  p.ellipse(ax, cy + 2, 6, 1.5, S[1]);
  // Rote Sanduhr-Zeichnung
  p.rect(ax - 2, cy - 4, 3, 1, M[1]);
  p.rect(ax - 1, cy - 3, 1, 2, M[0]);
  p.rect(ax - 2, cy - 1, 3, 1, M[1]);
  // Borsten
  p.px(ax - 6, cy - 5, S[4]); p.px(ax - 4, cy - 7, S[4]); p.px(ax + 4, cy - 7, S[3]);
  // Kopfbruststück
  p.ellipse(hx, cy + 1 - rear * 0.5, 4.5, 3.5, S[2]);
  p.ellipse(hx + 1, cy - rear * 0.5, 3, 2, S[3]);
  // Augen
  const ey = cy - 1 - rear * 0.5;
  const ec = hurt ? '#ffffff' : E[0];
  p.px(hx + 3, ey, ec); p.px(hx + 2, ey - 1, ec); p.px(hx + 4, ey + 1, E[1]); p.px(hx + 1, ey, E[1]);
  // Kieferklauen
  const fx = hx + 4, fy = cy + 3 - rear * 0.5;
  p.px(fx, fy, S[4]); p.px(fx + 1, fy + 1 + fangs, '#d8d0c0');
  p.px(fx - 1, fy + 1, S[4]); p.px(fx - 1 + fangs, fy + 2 + fangs, '#d8d0c0');
  // Beine vorne (heller)
  for (let i = 0; i < 4; i++) {
    const dir = i < 2 ? 1 : -1;
    const ph = t * TAU + i * 1.7;
    const isFront = i === 0;
    if (isFront && rear > 0) {
      // Vorderbeine drohend erhoben
      p.line(hx - 1, cy, hx + 4, cy - 8 - rear, S[3]);
      p.line(hx + 4, cy - 8 - rear, hx + 9 + lunge, cy - 4 - rear, S[3]);
      p.px(hx + 4, cy - 8 - rear, S[4]);
      continue;
    }
    drawLeg(p, 22 + i * 0.5, cy + 2, dir, ph * legAmp, 2.5 * legAmp, S[3], S[4], isFront ? 1.15 : 1);
  }
}

function drawDead(p, k) {
  const cy = 24;
  p.ellipse(18, cy, 7.5, 4, S[2]);
  p.ellipse(18, cy - 1, 6, 2.5, S[1]);
  p.ellipse(26, cy + 1, 4, 2.5, S[2]);
  // eingerollte Beine
  for (let i = 0; i < 8; i++) {
    const bx = 15 + i * 1.6;
    const up = 4 + (i % 3) * 2 - k * 2;
    p.line(bx, cy - 2, bx + (i % 2 ? 2 : -2), cy - 2 - up, S[3]);
    p.px(bx + (i % 2 ? 3 : -3), cy - 1 - up, S[3]);
  }
  p.px(28, cy, '#301010');
}

export function createSpiderSprites() {
  const f = (o) => buildFrame(W, H, AX, AY, (p) => drawSpider(p, o));
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.06, bob: i === 2 ? 1 : 0, legAmp: 0.4 })), 6),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, bob: i % 2 })), 16),
    windup: new Animation([f({ rear: 2, fangs: 1 }), f({ rear: 4, fangs: 1 }), f({ rear: 5, fangs: 0, bob: 1 })], 10, false),
    strike: new Animation([f({ lunge: 3, fangs: 1, t: 0.2 }), f({ lunge: 2, fangs: 0, t: 0.4 })], 12, false),
    hurt: new Animation([f({ bob: 1, hurt: true, rear: 1 })], 1, false),
    death: new Animation([f({ rear: 3, hurt: true }), buildFrame(W, H, AX, AY, (p) => drawDead(p, 0)), buildFrame(W, H, AX, AY, (p) => drawDead(p, 1))], 8, false),
  };
}
