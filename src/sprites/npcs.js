import { PAL } from '../gfx/Palette.js';
import { Animation, lazyFrame } from '../gfx/Sprite.js';
import { buildFine, fmap, band, fold, stitch, tone } from './npcFine.js';

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
  if (p.fine) robeFine(p, tx, ty, fy);
  else for (let y = ty; y <= fy; y++) {
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
  if (!p.fine) { p.line(tx + 1, ty + 6, tx, fy - 1, ROBE[1]); p.line(tx + 5, ty + 7, tx + 6, fy - 1, ROBE[1]); }
  // Gürtel mit Kräuterbeutel
  p.rect(tx - 1, ty + 7, 9, 1, L[1]); p.rect(tx + 5, ty + 8, 3, 3, L[2]); p.px(tx + 6, ty + 8, L[3]);
  // Kopf mit Kapuze
  const hx = tx, hy = ty - 8;
  p.rect(hx, hy, 7, 8, ROBE[2]); p.rect(hx + 1, hy - 1, 5, 1, ROBE[3]); p.rect(hx, hy, 2, 8, ROBE[3]);
  if (p.fine) marenFaceFine(p, hx, hy, talk);
  else {
    p.rect(hx + 3, hy + 2, 4, 5, SKIN[2]); p.rect(hx + 3, hy + 2, 4, 1, HAIR[1]);
    p.px(hx + 3, hy + 3, HAIR[2]); p.px(hx + 3, hy + 4, HAIR[1]); p.px(hx + 3, hy + 5, HAIR[1]);
    p.px(hx + 5, hy + 4, '#1a1014'); p.px(hx + 6, hy + 5, SKIN[1]);
    p.px(hx + 5, hy + 6, talk ? '#2a1010' : SKIN[1]);
    p.px(hx + 6, hy + 3, SKIN[3]);
    p.px(hx + 5, hy + 3, HAIR[0]); p.px(hx + 4, hy + 5, SKIN[3]); p.px(hx + 4, hy + 6, SKIN[1]); // Braue, Wangenlicht, Falte
  }
  // Arm + Stab mit Laterne
  const sx = tx + 9 + sway * 0.3;
  p.rect(tx + 5, ty + 2, 3, 5, ROBE[3]); p.rect(tx + 7, ty + 6, 2, 2, SKIN[2]);
  p.line(sx, ty - 12, sx, fy, L[2]); p.line(sx + 1, ty - 12, sx + 1, fy, L[1]);
  p.rect(sx - 2, ty - 14, 6, 2, St[2]);
  const lx = sx + 1 + Math.round(sway), ly = ty - 11;
  p.px(lx, ly - 1, St[3]); p.rect(lx - 2, ly, 5, 6, St[1]); p.rect(lx - 1, ly + 1, 3, 4, E[3]); p.px(lx, ly + 2, E[5]);
  if (p.fine) {
    // Kapuze: Saumkante zum Licht, Schatten über der Stirn, Gürtelnaht, Beutelklappe
    p.rect(hx + 0.5, hy - 0.5, 4.5, 0.5, ROBE[4]); p.rect(hx, hy + 0.5, 0.5, 7, ROBE[4]);
    p.rect(hx + 2.5, hy + 1.5, 0.5, 6, ROBE[1]); p.rect(hx + 3, hy + 1.5, 4, 0.5, ROBE[1]);
    stitch(p, tx - 0.5, ty + 7.5, tx + 7.5, ty + 7.5, L[2]);
    fmap(p, tx + 5, ty + 8, ['3332.', '23221', '22211', '12211', '.111.'], { 3: L[3], 2: L[2], 1: L[1] });
    p.dot(tx + 6, ty + 8.5, PAL.gold[3]);
    // Hand am Stab: Finger und Knöchellicht
    fmap(p, tx + 7, ty + 6, ['3321', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
    // Stab: Maserung (dunkle Feinstriche), Eisenring mit Glanz
    for (let y = ty - 11; y < fy; y += 3) p.dot(sx + 0.5, y + (Math.round(y) % 2) * 0.5, L[1]);
    p.rect(sx - 2, ty - 14, 6, 0.5, St[4]); p.dot(sx - 1.5, ty - 14, St[5]); p.rect(sx - 2, ty - 12.5, 6, 0.5, St[0]);
    // Laterne: Rahmenstreben, Glasglanz, heißer Kern
    p.rect(lx - 2, ly, 5, 0.5, St[3]); p.rect(lx - 2, ly + 5.5, 5, 0.5, St[0]);
    p.rect(lx - 0.5, ly + 1, 0.5, 4, St[1]); p.rect(lx + 1, ly + 1, 0.5, 4, St[1]);
    fmap(p, lx - 1, ly + 1.5, ['.44.', '4554', '4554', '.33.'], { 5: E[5], 4: E[4], 3: E[3] });
    p.dot(lx - 1, ly + 1, '#fff6d8'); p.dot(lx + 0.5, ly - 1, St[5]);
  }
}

// Umhang fein: Glockenkante glatt, Lichtseite links, zwei Falten (Tal dunkel, Grat hell), Saum unten
function robeFine(p, tx, ty, fy) {
  const c = tx + 3.5;
  p.each(c - 10, ty, c + 10, fy + 0.99, (x, y) => {
    const k = (y - ty) / (fy - ty), hw = 4.5 + k * 4.5;
    if (Math.abs(x - c) > hw) return null;
    const rel = (x - c) / hw;
    let i = rel < -0.55 ? 3 : rel > 0.55 ? 1 : 2;
    if (rel < -0.86 && y < fy - 1) i = 4;
    if (y >= fy) return ROBE[0];
    for (const [x0, x1, y0] of [[tx + 1.2, tx - 0.2, ty + 6], [tx + 5.6, tx + 6.4, ty + 7]]) {
      if (y < y0) continue;
      const xf = x0 + (x1 - x0) * (y - y0) / (fy - y0);
      if (Math.abs(x - xf) < 0.26) i = Math.max(0, i - 1);
      else if (x < xf && x > xf - 0.76) i = Math.min(4, i + 1);
    }
    if (y >= fy - 0.5) i = Math.max(0, i - 1);
    return ROBE[i];
  });
}

// Gesicht unter der Kapuze: graue Strähnen, Augenweiß/Pupille/Glanz, Krähenfüße, Nasenrücken, schmale Lippen
const MAREN_FACE = [
  'bccbbcbb.',
  'bcb2bb23.',
  'cb22a333.',
  'bb2kkk32.',
  'cb2wgk333',
  'bb31ik232',
  'b13223221',
  'b2131221.',
  '.112lll1.',
  '..11111..',
];
function marenFaceFine(p, hx, hy, talk) {
  const rows = talk ? MAREN_FACE.map((r, i) => (i === 8 ? '.112mmm1.' : i === 9 ? '..11mm1..' : r)) : MAREN_FACE;
  fmap(p, hx + 3, hy + 2, rows, {
    a: HAIR[0], b: HAIR[1], c: HAIR[2], 1: SKIN[1], 2: SKIN[2], 3: SKIN[3],
    k: '#1a1014', w: '#d0c6bc', g: '#ffffff', i: '#4a5a6a', l: '#6a3a30', m: '#2a1010',
  });
  p.dot(hx + 6, hy + 4.5, SKIN[1]); p.dot(hx + 6.5, hy + 4.5, SKIN[2]);   // Krähenfuß
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
  if (p.fine) {
    // Glatze mit Glanzbogen, buschige Braue, Auge mit Glanz, Nase, Bart in Strähnen, Ohr
    p.fline(hx + 1.5, hy + 0.5, hx + 4, hy, tone(SKIN[3], 0.3)); p.dot(hx + 2, hy + 1, tone(SKIN[3], 0.45));
    fmap(p, hx + 4.5, hy + 2, [
      'cbbbbb..',
      '2bbbbbb.',
      '22kkk32.',
      '22wgk333',
      '231ik332',
      '22322221',
    ], { b: BEARD[0], c: BEARD[2], k: '#1a1014', w: '#d6cabc', g: '#ffffff', i: '#3a2418', 1: SKIN[1], 2: SKIN[2], 3: SKIN[3] });
    fmap(p, hx + 0.5, hy + 3, ['21', '10', '21'], { 2: SKIN[2], 1: SKIN[1], 0: SKIN[0] });
    // Bart: wellige Strähnen, oben im Licht, Spitzen unregelmäßig
    p.each(hx + 2, hy + 5, hx + 9, hy + 12, (x, y) => {
      const rx = x - hx, ry = y - hy;
      const inside = (ry >= 5 && ry < 10 && rx >= 2 && rx < 9) || (ry >= 9 && ry < 11 && rx >= 3 && rx < 8) || (ry >= 11 && ry < 12 + Math.sin(rx * 3.1) * 0.6 && rx >= 3.5 && rx < 7.5);
      if (!inside) return null;
      const s = ((Math.floor((rx + Math.sin(ry * 1.7) * 0.45) * 2) % 4) + 4) % 4;
      if (s === 3) return BEARD[0];
      if (s === 0) return ry < 8.5 || rx > 6.5 ? BEARD[2] : BEARD[1];
      return BEARD[1];
    });
    p.dot(hx + 4, hy + 10, PAL.gold[3]); p.dot(hx + 4.5, hy + 10, PAL.gold[2]);   // Bartring
    p.rect(hx + 5, hy + 5.5, 3, 0.5, BEARD[2]); p.dot(hx + 7.5, hy + 6.5, talk ? '#1a0808' : '#2a1208'); p.dot(hx + 7, hy + 6.5, talk ? '#1a0808' : BEARD[0]);
    // Schürze: Lederglanz, Naht als Punktlinie, Tasche mit Niete
    p.rect(tx + 2, ty + 3.5, 0.5, 11, tone(APRON[2], 0.25));
    stitch(p, tx + 2.5, ty + 4, tx + 9.5, ty + 4, APRON[0]);
    stitch(p, tx + 9.5, ty + 4.5, tx + 9.5, ty + 14.5, tone(APRON[2], 0.15));
    p.dot(tx + 4, ty + 7, '#b8a080'); p.dot(tx + 7.5, ty + 7, '#b8a080');
    fold(p, tx + 6, ty + 8, ty + 14.5, APRON[0], APRON[2]);
    // Hemd: Ärmelfalten, hinterer Arm mit Unterarmlicht
    fold(p, tx + 1, ty + 2, ty + 11, SHIRT[0], SHIRT[2]);
    p.rect(tx - 1, ty + 1, 0.5, 8, SKIN[2]);
    // Hammer: Stiel gemasert, Kopf mit Glanzlinie, Glanzpunkt und dunkler Schlagfläche
    p.fline(hxp + hdx * 2, hyp + hdy * 2, hxp + hdx * 6, hyp + hdy * 6, L[3]);
    p.rect(kx - 2, ky - 2, 5, 0.5, St[5]); p.dot(kx - 1.5, ky - 1.5, '#ffffff'); p.rect(kx - 2, ky + 1.5, 5, 0.5, St[0]);
    p.rect(kx + 2.5, ky - 1.5, 0.5, 3, St[1]);
  }
}

function drawAnvil(p, x, y) {
  p.rect(x, y - 6, 12, 3, St[2]); p.rect(x, y - 6, 12, 1, St[4]); p.rect(x - 3, y - 5, 3, 1, St[2]);
  p.rect(x + 3, y - 3, 6, 2, St[1]); p.rect(x + 1, y - 1, 10, 2, St[1]);
  if (p.fine) {
    // Amboss: Bahn mit Glanzlinie und -punkt, Horn spitz zulaufend, Kanten 5-stufig, glühender Zunder
    p.rect(x, y - 6, 12, 0.5, St[5]); p.rect(x + 0.5, y - 5.5, 11, 0.5, St[4]); p.rect(x, y - 3.5, 12, 0.5, St[0]);
    p.dot(x + 2, y - 6, '#ffffff'); p.dot(x + 8, y - 5.5, St[5]);
    fmap(p, x - 3, y - 5.5, ['..344', '.3332', '2221.'], { 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    p.rect(x + 3, y - 3, 0.5, 2, St[3]); p.rect(x + 8.5, y - 3, 0.5, 2, St[0]);
    p.rect(x + 1, y - 1, 10, 0.5, St[2]); p.rect(x + 1.5, y - 0.5, 0.5, 1.5, St[3]); p.rect(x + 10.5, y - 0.5, 0.5, 1.5, St[0]);
    p.dot(x + 5, y - 6.5, E[4]); p.dot(x + 6.5, y - 6.5, E[3]);
  }
}

export function createNpcSprites() {
  // Frames aufgeschoben (gfx/Sprite.js LazyFrame): gebaut, wenn sie gezeigt werden oder die Vorbereitung dran ist
  const fm = (o) => lazyFrame(() => buildFine(W, H, AX, AY, (p) => drawMaren(p, o)));
  const maren = {
    idle: new Animation([0, 1, 2, 3].map((i) => fm({ bob: i === 2 ? 1 : 0, sway: [0, 0.5, 1, 0.5][i] })), 3),
    talk: new Animation([fm({ talk: 1 }), fm({ talk: 0, sway: 0.5 })], 5),
  };
  const BW = 48, BAX = 17;
  const fb = (o) => lazyFrame(() => buildFine(BW, H, BAX, AY, (p) => { drawBrom(p, o); drawAnvil(p, 28, AY + 1); }));
  const brom = {
    // Hämmern: ausholen – zuschlagen (Frame 3 = Aufprall)
    idle: new Animation([fb({ arm: -1.2 }), fb({ arm: -1.6, bob: 0 }), fb({ arm: -0.4 }), fb({ arm: 0.55, bob: 1 }), fb({ arm: 0.5, bob: 1 }), fb({ arm: 0 })], 6),
    talk: new Animation([fb({ arm: 0.9, talk: 1 }), fb({ arm: 0.9 })], 5),
  };
  return { elder_maren: maren, smith_brom: brom };
}
