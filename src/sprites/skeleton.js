import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Skelettkrieger (rostiges Schwert) und Skelettschütze (Bogen).
const W = 44, H = 40, OX = 8, OY = 6;
const B = PAL.bone, R = PAL.rust, E = PAL.eye;
const CLOTH = ['#1b1420', '#2a2032', '#3a2c44'];

function drawRustySword(p, hx, hy, a, len = 10) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  p.line(hx - dx * 2, hy - dy * 2, hx, hy, PAL.leather[1]);
  p.line(hx + dx + nx * 1.5, hy + dy + ny * 1.5, hx + dx - nx * 1.5, hy + dy - ny * 1.5, R[1]);
  const bx = hx + dx * 2, by = hy + dy * 2;
  p.line(bx, by, bx + dx * len, by + dy * len, R[3]);
  p.line(bx + nx * 0.8, by + ny * 0.8, bx + dx * (len - 2) + nx * 0.8, by + dy * (len - 2) + ny * 0.8, R[2]);
  p.px(bx + dx * 4, by + dy * 4, B[2]); // Scharte
}

function drawBow(p, hx, hy, draw) {
  // Bogen senkrecht vor dem Körper, Sehne je nach Spannung
  for (let i = -6; i <= 6; i++) {
    const x = hx + 2 - Math.round((i * i) / 14);
    p.px(x, hy + i, i === -6 || i === 6 ? B[3] : PAL.leather[3]);
    if (Math.abs(i) < 5) p.px(x + 1, hy + i, PAL.leather[2]);
  }
  const sx = hx - 1 - draw;
  p.line(hx - 1, hy - 6, sx, hy, B[4]);
  p.line(sx, hy, hx - 1, hy + 6, B[4]);
  if (draw > 0) {
    p.line(sx, hy, hx + 7, hy, PAL.leather[3]);
    p.px(hx + 8, hy, PAL.steel[4]);
    p.px(sx - 1, hy, PAL.crimson[3]);
  }
}

function drawSkeleton(p, o = {}) {
  const {
    bob = 0, crouch = 0, lean = 0, legF = [0, 0], legB = [0, 0],
    arm = 0.9, jaw = 0, weapon = 'sword', bowDraw = 0, eye = 1, hurt = false,
  } = o;
  p.ctx.save();
  p.ctx.translate(OX, OY);
  const fy = 29, ty = 15 + bob + crouch, tx = 12 + lean;

  // Hinteres Bein
  p.line(tx + 2, ty + 9, tx + 2 + legB[0], fy - legB[1] - 1, B[1]);
  p.rect(tx + 2 + legB[0], fy - legB[1] - 1, 2, 1, B[1]);
  // Hinterer Arm
  p.line(tx + 1, ty + 1, tx - 1, ty + 6, B[1]);
  p.px(tx - 1, ty + 7, B[1]);

  // Wirbelsäule + Rippen
  p.line(tx + 2, ty, tx + 2, ty + 8, B[2]);
  for (let r = 0; r < 3; r++) {
    const ry = ty + 1 + r * 2;
    const w = 6 - r;
    p.rect(tx + 2, ry, w, 1, B[3]);
    p.px(tx + 1 + w, ry, B[4]);
  }
  // Zerfetzter Lendenschurz + Becken
  p.rect(tx, ty + 7, 7, 2, B[2]);
  p.rect(tx + 1, ty + 8, 5, 3, CLOTH[1]);
  p.px(tx + 2, ty + 11, CLOTH[0]); p.px(tx + 4, ty + 11, CLOTH[1]);
  p.px(tx + 1, ty + 8, CLOTH[2]);
  // Vorderes Bein
  p.line(tx + 5, ty + 9, tx + 5 + legF[0], fy - legF[1] - 1, B[3]);
  p.px(tx + 5 + Math.round(legF[0] / 2), ty + 12, B[4]);
  p.rect(tx + 5 + legF[0], fy - legF[1] - 1, 3, 1, B[2]);

  // Rostige Schulterplatte
  p.rect(tx + 4, ty - 1, 4, 2, R[2]);
  p.px(tx + 4, ty - 1, R[3]);
  p.px(tx + 7, ty, R[1]);

  // Schädel
  const hx = tx + 1, hy = ty - 8;
  p.rect(hx, hy + 1, 7, 5, B[3]);
  p.rect(hx + 1, hy, 5, 1, B[3]);
  p.rect(hx, hy + 1, 1, 5, B[2]);
  p.rect(hx + 2, hy + 1, 3, 1, B[4]);
  p.px(hx + 1, hy + 2, B[4]);
  p.rect(hx + 4, hy + 2, 2, 2, '#140808');
  if (eye) { p.px(hx + 5, hy + 2, hurt ? '#ffffff' : E[0]); if (eye > 1) p.px(hx + 4, hy + 2, E[1]); }
  p.px(hx + 6, hy + 4, '#1a1010');
  p.rect(hx + 1, hy + 6 + jaw, 6, 1, B[2]);
  p.px(hx + 3, hy + 6 + jaw, B[4]); p.px(hx + 5, hy + 6 + jaw, B[4]);
  if (jaw) p.rect(hx + 2, hy + 6, 4, 1, '#140808');
  // Riss im Schädel
  p.px(hx + 3, hy, B[1]); p.px(hx + 2, hy + 1, B[1]);

  // Waffenarm
  const sx = tx + 6, sy = ty + 1;
  if (weapon === 'sword') {
    const hxp = sx + Math.cos(arm) * 4, hyp = sy + Math.sin(arm) * 4 + 1;
    p.line(sx, sy, hxp, hyp, B[3]);
    drawRustySword(p, hxp, hyp, arm);
    p.px(hxp, hyp, B[4]);
  } else if (weapon === 'bow') {
    p.line(sx, sy, sx + 4, sy + 2, B[3]);
    drawBow(p, sx + 5, sy + 2, bowDraw);
  }
  p.ctx.restore();
}

// Knochenhaufen (Todes-Endframe) – Teile werden über die Frames "abgelegt".
function drawCollapse(p, t, weapon) {
  p.ctx.save();
  p.ctx.translate(OX, OY);
  const fy = 29;
  const k = Math.min(1, t);
  // Knochen
  p.line(8, fy - 1, 14, fy - 2, B[2]);
  p.line(16, fy, 22, fy - 1, B[3]);
  p.rect(11, fy - 3, 7, 2, B[2]);
  for (let r = 0; r < 3; r++) p.rect(12 + r, fy - 4 - r, 5 - r, 1, B[3]);
  p.px(9, fy - 2, B[4]); p.px(21, fy - 2, B[4]);
  p.rect(12, fy - 2, 5, 2, CLOTH[1]);
  // Schädel rollt zur Seite
  const sx = Math.round(18 + k * 4), sy = fy - 5;
  p.rect(sx, sy, 5, 4, B[3]);
  p.rect(sx + 1, sy - 1, 3, 1, B[3]);
  p.rect(sx + 1, sy + 1, 2, 1, '#140808');
  p.px(sx + 1, sy, B[4]);
  if (weapon === 'sword') drawRustySword(p, 4, fy, -0.12, 9);
  else drawBow(p, 4, fy - 3, 0);
  p.ctx.restore();
}

export function createSkeletonSprites(weapon = 'sword') {
  const f = (o) => buildFrame(W, H, 15 + OX, 29 + OY, (p) => drawSkeleton(p, { weapon, ...o }));
  const baseArm = weapon === 'sword' ? 0.9 : 0;

  const idle = [0, 1, 2, 3].map((i) => f({ bob: i === 2 ? 1 : 0, jaw: i === 1 ? 1 : 0, arm: baseArm + (i % 2) * 0.08, eye: i === 3 ? 2 : 1 }));
  const walk = [0, 1, 2, 3, 4, 5].map((i) => {
    const s = Math.sin((i / 6) * TAU);
    return f({ bob: i % 3 === 0 ? 1 : 0, lean: 1, legF: [Math.round(s * 2.5), s > 0.3 ? 1 : 0], legB: [Math.round(-s * 2.5), s < -0.3 ? 1 : 0], arm: baseArm + s * 0.15, jaw: i === 2 ? 1 : 0 });
  });
  const anims = {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 9),
    hurt: new Animation([f({ lean: -2, arm: baseArm - 1.2, jaw: 1, hurt: true, legF: [1, 0], legB: [-1, 0] })], 1, false),
  };

  if (weapon === 'sword') {
    anims.windup = new Animation([
      f({ arm: -0.8, lean: -1, jaw: 1, eye: 2 }),
      f({ arm: -1.8, lean: -1, jaw: 1, eye: 2, legF: [1, 0] }),
      f({ arm: -2.3, lean: -2, jaw: 1, eye: 2, legF: [2, 0], legB: [-1, 0] }),
    ], 8, false);
    anims.strike = new Animation([
      f({ arm: -0.2, lean: 1, jaw: 1, eye: 2, legF: [2, 0], legB: [-2, 0] }),
      f({ arm: 1.3, lean: 2, crouch: 1, jaw: 0, eye: 2, legF: [3, 0], legB: [-2, 0] }),
      f({ arm: 1.2, lean: 1, crouch: 1, legF: [2, 0], legB: [-2, 0] }),
    ], 14, false);
  } else {
    anims.windup = new Animation([0, 1, 2, 3].map((i) => f({ bowDraw: i, lean: -Math.min(i, 1), eye: 2 })), 6, false);
    anims.strike = new Animation([f({ bowDraw: 0, lean: -2, eye: 2 }), f({ bowDraw: 0, lean: -1 })], 10, false);
  }

  const death = [
    f({ lean: -2, arm: baseArm - 1.2, jaw: 1, hurt: true }),
    f({ crouch: 3, lean: -1, arm: baseArm + 0.8, jaw: 1, eye: 0, legF: [2, 0], legB: [-2, 0] }),
    f({ crouch: 6, lean: 0, arm: baseArm + 1.4, jaw: 1, eye: 0, legF: [4, 0], legB: [-4, 0] }),
    ...[0.2, 0.6, 1].map((t) => buildFrame(W, H, 15 + OX, 29 + OY, (p) => drawCollapse(p, t, weapon))),
  ];
  anims.death = new Animation(death, 12, false);
  return anims;
}
