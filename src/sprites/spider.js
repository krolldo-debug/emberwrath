import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Höhlenspinne: großer, glänzender Hinterleib mit roter Sanduhr-Zeichnung
// und Borsten, Kopfbruststück mit Augenkranz (zwei große Hauptaugen,
// vier Nebenaugen), kräftige Kieferklauen mit Giftfängen, acht gegliederte
// Beine mit hellen Gelenken. Licht von oben links, Chitin mit hartem Glanzpunkt.
const W = 46, H = 34, AX = 22, AY = 27;
const S = PAL.spider, M = PAL.spiderMark, E = PAL.eye;
const FANG = PAL.bone[3], VOID = '#0a0610';
const LX = -0.55, LY = -0.7, LZ = 0.45;

// Schattierte Ellipse mit harten Lichtstufen.
function vol(p, cx, cy, rx, ry, ramp, bias = 0) {
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d > 1) continue;
      const t = 0.3 + 0.62 * (u * LX + v * LY + Math.sqrt(1 - d) * LZ) + bias;
      p.px(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))]);
    }
  }
}

// Gegliedertes Bein: Hüfte → Knie (hoch über dem Körper) → Fußspitze.
function drawLeg(p, bx, by, dir, phase, lift, near, reach = 1) {
  const fx = bx + dir * (10 + Math.sin(phase) * 2.5) * reach;
  const fy = AY - Math.max(0, Math.cos(phase)) * lift;
  const kx = (bx + fx) / 2 + dir * 1;
  const ky = Math.min(by, fy) - 8 - lift * 0.4;
  const c0 = near ? S[3] : S[1], c1 = near ? S[2] : S[0], hi = near ? S[4] : S[2];
  // Oberschenkel: 2 px dick, Oberkante heller
  p.line(bx, by, kx, ky, c1);
  p.line(bx, by - 1, kx, ky - 1, c0);
  // Unterschenkel: dünner, läuft spitz aus
  const mx = kx + (fx - kx) * 0.5, my = ky + (fy - ky) * 0.5;
  p.line(kx, ky, mx, my, c0);
  p.line(kx + dir * 0.6, ky, mx + dir * 0.6, my, c1);
  p.line(mx, my, fx, fy, c1);
  // Gelenke und Borsten
  p.px(kx, ky - 1, hi);
  p.px(mx, my, hi);
  p.px(fx, fy, near ? S[1] : VOID);
  if (near) { p.px(kx - dir, ky - 2, S[2]); p.px(mx + dir, my - 1, S[2]); }
}

function drawSpider(p, o = {}) {
  const { t = 0, bob = 0, rear = 0, lunge = 0, fangs = 0, hurt = false, legAmp = 1 } = o;
  const cy = 20 + bob - rear;
  const ax = 16 - lunge, hx = 25 + lunge;
  // Beine hinten (dunkler)
  for (let i = 0; i < 4; i++) {
    const dir = i < 2 ? 1 : -1;
    const ph = t * TAU + i * 1.7 + Math.PI;
    drawLeg(p, 21 + i * 0.5, cy + 1, dir, ph * legAmp, 2 * legAmp, false, i === 0 ? 1.1 + rear * 0.08 : 1);
  }
  const nearLegs = (fwd) => {
    // Beine vorne (heller). nearPass: Rückwärtsbeine liegen unter dem Hinterleib,
    // Vorwärtsbeine unter dem Kopfbruststück – Augen und Zeichnung bleiben frei.
    for (let i = 0; i < 4; i++) {
      if ((i < 2) !== fwd) continue;
      const dir = i < 2 ? 1 : -1;
      const ph = t * TAU + i * 1.7;
      const isFront = i === 0;
      if (isFront && rear > 0) {
        // Vorderbeine drohend erhoben, Spitzen nach vorn gekrümmt
        p.line(hx - 1, cy, hx + 4, cy - 8 - rear, S[2]);
        p.line(hx - 1, cy - 1, hx + 4, cy - 9 - rear, S[3]);
        p.line(hx + 4, cy - 8 - rear, hx + 9 + lunge, cy - 4 - rear, S[3]);
        p.px(hx + 4, cy - 9 - rear, S[4]);
        p.px(hx + 10 + lunge, cy - 3 - rear, S[1]);
        continue;
      }
      drawLeg(p, 22 + i * 0.5, cy + 2, dir, ph * legAmp, 2.5 * legAmp, true, isFront ? 1.15 : 1);
    }
  };
  nearLegs(false);
  // Hinterleib: Chitinkugel mit Glanzpunkt
  vol(p, ax, cy - 2.5, 8, 6.5, [S[0], S[1], S[2], S[3], S[4]]);
  p.px(ax - 3, cy - 6, '#c8b4e4'); p.px(ax - 2, cy - 6, S[4]); p.px(ax - 3, cy - 5, S[4]); // Glanzpunkt
  // Segmentringe (Querrillen)
  for (const dx of [-4, 3]) for (let k = -2; k <= 2; k++) p.px(ax + dx + Math.abs(k) * 0.3 * Math.sign(dx), cy - 2.5 + k * 1.6, S[1]);
  // Rote Sanduhr-Zeichnung (oben breit, schmale Taille, unten breit)
  p.rect(ax - 1, cy - 5, 4, 1, M[1]); p.rect(ax, cy - 4, 2, 1, M[1]);
  p.px(ax, cy - 3, M[0]); p.px(ax + 1, cy - 3, M[1]);
  p.rect(ax, cy - 2, 2, 1, M[1]); p.rect(ax - 1, cy - 1, 4, 1, M[0]);
  p.px(ax - 1, cy - 5, '#e0504a');
  // Borsten auf der Silhouette
  for (const [bx, by, l] of [[-7, -5, 1], [-5, -8, 1], [-2, -9, 1], [2, -8.5, 1], [5, -6.5, 1], [-8, -1, 1]]) {
    p.line(ax + bx, cy + by, ax + bx - l, cy + by - 1, S[3]);
  }
  p.px(ax + 7, cy - 1, S[1]); p.px(ax - 6, cy + 2, S[0]); // Spinnwarzen-Schatten
  // Taille
  p.rect(ax + 7, cy - 1, 2, 2, S[1]);
  nearLegs(true);
  // Kopfbruststück
  const hy = cy + 0.5 - rear * 0.5;
  vol(p, hx, hy, 4.8, 3.6, [S[0], S[1], S[2], S[3], S[4]], 0.04);
  p.px(hx - 2, hy - 3, S[4]); p.px(hx - 1, hy - 3, '#c8b4e4');
  p.px(hx - 1, hy, S[1]); p.px(hx, hy + 1, S[1]);          // Rückengrube
  // Augenkranz: zwei Hauptaugen mit Lichtpunkt, vier kleine Nebenaugen
  const ey = cy - 1 - rear * 0.5;
  const ec = hurt ? '#ffffff' : E[0];
  p.rect(hx + 1, ey - 2, 5, 3, VOID);
  p.rect(hx + 3, ey - 1, 2, 2, ec); p.px(hx + 3, ey - 1, hurt ? '#ffffff' : E[1]);   // Hauptaugen
  p.px(hx + 1, ey - 1, M[1]); p.px(hx + 2, ey - 2, M[1]); p.px(hx + 4, ey - 2, M[1]); p.px(hx + 5, ey, M[1]); // Nebenaugen
  // Kieferklauen mit gekrümmten Giftfängen
  const fx = hx + 4, fy = cy + 3 - rear * 0.5;
  p.rect(fx - 1, fy - 1, 2, 2, S[2]); p.px(fx - 1, fy - 1, S[3]);
  p.rect(fx + 1, fy - 1, 1, 2, S[1]);
  p.px(fx + 1 + fangs, fy + 1, FANG); p.px(fx + fangs, fy + 2 + fangs, PAL.bone[2]);
  p.px(fx - 1 + fangs, fy + 1 + fangs, FANG); p.px(fx - 1, fy + 2 + fangs, PAL.bone[2]);
  if (fangs) p.px(fx + fangs, fy + 3 + fangs, '#9ad03a');        // Gifttropfen
  // Taster (Pedipalpen)
  p.line(hx + 4, hy + 1, hx + 6 + lunge * 0.3, hy + 2, S[3]); p.px(hx + 6 + lunge * 0.3, hy + 3, S[2]);
}

function drawDead(p, k) {
  const cy = 24;
  // eingerollte Beine (hinter dem Körper)
  for (let i = 0; i < 8; i++) {
    const bx = 15 + i * 1.6;
    const up = 4 + (i % 3) * 2 - k * 2;
    const tip = bx + (i % 2 ? 3 : -3);
    p.line(bx, cy - 2, bx + (i % 2 ? 2 : -2), cy - 2 - up, i % 2 ? S[3] : S[2]);
    p.line(bx + (i % 2 ? 2 : -2), cy - 2 - up, tip, cy - 1 - up + 2, S[1]);
    p.px(bx + (i % 2 ? 2 : -2), cy - 3 - up, S[4]);
  }
  // auf dem Rücken liegender Körper, Bauchseite matt
  vol(p, 18, cy, 7.5, 4, [S[0], S[1], S[2], S[3]]);
  p.ellipse(18, cy - 1, 5, 1.6, S[1]);
  vol(p, 26, cy + 1, 4, 2.5, [S[0], S[1], S[2], S[3]]);
  p.rect(16, cy + 1, 3, 1, M[0]);
  p.px(29, cy + 1, FANG); p.px(29, cy + 2, PAL.bone[2]);
  p.px(28, cy, k > 0.5 ? S[0] : '#301010');
}

export function createSpiderSprites() {
  const f = (o) => buildFrame(W, H, AX, AY, (p) => drawSpider(p, o));
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.06, bob: i === 2 ? 1 : 0, legAmp: 0.4, fangs: i === 3 ? 1 : 0 })), 6),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, bob: i % 2 })), 16),
    windup: new Animation([f({ rear: 2, fangs: 1 }), f({ rear: 4, fangs: 1 }), f({ rear: 5, fangs: 0, bob: 1 })], 10, false),
    strike: new Animation([f({ lunge: 3, fangs: 1, t: 0.2 }), f({ lunge: 2, fangs: 0, t: 0.4 })], 12, false),
    hurt: new Animation([f({ bob: 1, hurt: true, rear: 1 })], 1, false),
    death: new Animation([f({ rear: 3, hurt: true }), buildFrame(W, H, AX, AY, (p) => drawDead(p, 0)), buildFrame(W, H, AX, AY, (p) => drawDead(p, 1))], 8, false),
  };
}
