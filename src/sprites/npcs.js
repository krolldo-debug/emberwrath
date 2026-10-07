import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';

// Dorfbewohner der Glutsenke. Blickrichtung rechts, Anker = Fußpunkt.
const W = 34, H = 40, AX = 15, AY = 35;
const L = PAL.leather, St = PAL.steel, E = PAL.ember;
const ROBE = ['#101712', '#18241b', '#223326', '#2e4432', '#3d5a40'];
const HAIR = ['#6e6878', '#9a94a4', '#c8c2d0'];
const SKIN = ['#4a2e28', '#7a5040', '#a8765a', '#c89878'];
const APRON = ['#1c120e', '#2c1c14', '#3e281c'];
const SHIRT = ['#2a1a1c', '#3e2428', '#553238'];
const BEARD = ['#2a160e', '#4a2616', '#6a3a20'];

// Dorfälteste Maren: Kapuzenumhang, graues Haar, Stab mit Laterne.
function drawMaren(p, { bob = 0, sway = 0, talk = 0 } = {}) {
  const fy = AY, ty = 17 + bob, tx = 12;
  // Umhang (Glockenform bis zum Boden)
  for (let y = ty; y <= fy; y++) {
    const k = (y - ty) / (fy - ty);
    const hw = 4 + k * 4.5;
    for (let x = Math.round(tx + 3 - hw); x <= Math.round(tx + 3 + hw); x++) {
      const rel = (x - (tx + 3)) / hw;
      let i = rel < -0.5 ? 3 : rel > 0.55 ? 1 : 2;
      if (y === fy) i = 0;
      p.px(x, y, ROBE[i]);
    }
  }
  // Falten
  p.line(tx + 1, ty + 6, tx, fy - 1, ROBE[1]); p.line(tx + 5, ty + 7, tx + 6, fy - 1, ROBE[1]);
  // Gürtel mit Kräuterbeutel
  p.rect(tx - 1, ty + 7, 9, 1, L[1]); p.rect(tx + 5, ty + 8, 3, 3, L[2]); p.px(tx + 6, ty + 8, L[3]);
  // Kopf mit Kapuze
  const hx = tx, hy = ty - 8;
  p.rect(hx, hy, 7, 8, ROBE[2]); p.rect(hx + 1, hy - 1, 5, 1, ROBE[3]); p.rect(hx, hy, 2, 8, ROBE[3]);
  p.rect(hx + 3, hy + 2, 4, 5, SKIN[2]); p.rect(hx + 3, hy + 2, 4, 1, HAIR[1]);
  p.px(hx + 3, hy + 3, HAIR[2]); p.px(hx + 3, hy + 4, HAIR[1]); p.px(hx + 3, hy + 5, HAIR[1]);
  p.px(hx + 5, hy + 4, '#1a1014'); p.px(hx + 6, hy + 5, SKIN[1]);
  p.px(hx + 5, hy + 6, talk ? '#2a1010' : SKIN[1]);
  p.px(hx + 6, hy + 3, SKIN[3]);
  p.px(hx + 5, hy + 3, HAIR[0]); p.px(hx + 4, hy + 5, SKIN[3]); p.px(hx + 4, hy + 6, SKIN[1]); // Braue, Wangenlicht, Falte
  // Arm + Stab mit Laterne
  const sx = tx + 9 + sway * 0.3;
  p.rect(tx + 5, ty + 2, 3, 5, ROBE[3]); p.rect(tx + 7, ty + 6, 2, 2, SKIN[2]);
  p.line(sx, ty - 12, sx, fy, L[2]); p.line(sx + 1, ty - 12, sx + 1, fy, L[1]);
  p.rect(sx - 2, ty - 14, 6, 2, St[2]);
  const lx = sx + 1 + Math.round(sway), ly = ty - 11;
  p.px(lx, ly - 1, St[3]); p.rect(lx - 2, ly, 5, 6, St[1]); p.rect(lx - 1, ly + 1, 3, 4, E[3]); p.px(lx, ly + 2, E[5]);
}

// Schmied Brom: breit, Bart, Lederschürze, Hammer.
function drawBrom(p, { bob = 0, arm = 0.6, talk = 0 } = {}) {
  const fy = AY, ty = 16 + bob, tx = 10;
  // Beine
  p.rect(tx + 2, ty + 11, 3, fy - ty - 11, L[1]); p.rect(tx + 7, ty + 11, 3, fy - ty - 11, L[0]);
  p.rect(tx + 1, fy - 1, 4, 2, L[0]); p.rect(tx + 7, fy - 1, 4, 2, '#140c0a');
  // Torso (breit)
  p.rect(tx, ty, 12, 12, SHIRT[1]); p.rect(tx, ty, 3, 12, SHIRT[2]); p.rect(tx + 10, ty, 2, 12, SHIRT[0]);
  // Schürze
  p.rect(tx + 2, ty + 3, 8, 12, APRON[1]); p.rect(tx + 2, ty + 3, 2, 12, APRON[2]); p.rect(tx + 2, ty + 3, 8, 1, APRON[2]);
  p.rect(tx + 4, ty + 7, 4, 1, APRON[0]);
  // Kopf mit Glatze und Bart
  const hx = tx + 2, hy = ty - 8;
  p.rect(hx, hy, 8, 8, SKIN[2]); p.rect(hx, hy, 8, 2, SKIN[3]); p.rect(hx, hy + 2, 2, 5, SKIN[1]);
  p.px(hx + 6, hy + 3, '#1a1014'); p.rect(hx + 5, hy + 2, 3, 1, BEARD[0]);
  p.rect(hx + 2, hy + 5, 7, 5, BEARD[1]); p.rect(hx + 3, hy + 9, 5, 2, BEARD[1]); p.px(hx + 7, hy + 6, BEARD[2]);
  p.px(hx + 7, hy + 7, talk ? '#1a0808' : BEARD[0]);
  // Hinterer Arm
  p.rect(tx - 1, ty + 1, 3, 8, SKIN[1]);
  // Hammerarm
  const sx = tx + 10, sy = ty + 2;
  const hxp = sx + Math.cos(arm) * 6, hyp = sy + Math.sin(arm) * 6;
  p.line(sx, sy, hxp, hyp, SKIN[2]); p.line(sx, sy + 1, hxp, hyp + 1, SKIN[1]);
  const hdx = Math.cos(arm - 1.57), hdy = Math.sin(arm - 1.57);
  p.line(hxp, hyp, hxp + hdx * 7, hyp + hdy * 7, L[2]);
  const kx = hxp + hdx * 7, ky = hyp + hdy * 7;
  p.rect(kx - 2, ky - 2, 5, 4, St[2]); p.rect(kx - 2, ky - 2, 5, 1, St[4]);
}

function drawAnvil(p, x, y) {
  p.rect(x, y - 6, 12, 3, St[2]); p.rect(x, y - 6, 12, 1, St[4]); p.rect(x - 3, y - 5, 3, 1, St[2]);
  p.rect(x + 3, y - 3, 6, 2, St[1]); p.rect(x + 1, y - 1, 10, 2, St[1]);
}

export function createNpcSprites() {
  const fm = (o) => buildFrame(W, H, AX, AY, (p) => drawMaren(p, o));
  const maren = {
    idle: new Animation([0, 1, 2, 3].map((i) => fm({ bob: i === 2 ? 1 : 0, sway: [0, 0.5, 1, 0.5][i] })), 3),
    talk: new Animation([fm({ talk: 1 }), fm({ talk: 0, sway: 0.5 })], 5),
  };
  const BW = 48, BAX = 17;
  const fb = (o) => buildFrame(BW, H, BAX, AY, (p) => { drawBrom(p, o); drawAnvil(p, 28, AY + 1); });
  const brom = {
    // Hämmern: ausholen – zuschlagen (Frame 3 = Aufprall)
    idle: new Animation([fb({ arm: -1.2 }), fb({ arm: -1.6, bob: 0 }), fb({ arm: -0.4 }), fb({ arm: 0.55, bob: 1 }), fb({ arm: 0.5, bob: 1 }), fb({ arm: 0 })], 6),
    talk: new Animation([fb({ arm: 0.9, talk: 1 }), fb({ arm: 0.9 })], 5),
  };
  return { elder_maren: maren, smith_brom: brom };
}
