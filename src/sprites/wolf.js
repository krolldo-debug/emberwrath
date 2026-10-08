import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Aschewolf (und Rudelführer): hageres Tier mit aschgrauem Fell, in dem
// Glut glimmt. Seitenansicht nach rechts, parametrisch gezeichnet.
// Körperteile sind schattierte Volumen (Licht von oben links, 4–5 harte
// Stufen), darüber liegen Fellsträhnen, Halskrause und ein keilförmiger Kopf
// mit Brauenwulst, Glutauge, Nasenspiegel und Fängen.
const VARIANTS = {
  wolf: {
    s: 1, scar: false,
    fur: ['#1e1a1d', '#322b2f', '#4b4247', '#675c61', '#877b80', '#aa9ea2'],
    mane: PAL.ember[3], ember: PAL.ember[4], belly: '#3a3236', eye: PAL.ember[4],
  },
  alpha: {
    s: 1.3, scar: true,
    fur: ['#141013', '#241b1f', '#35292e', '#4b3b41', '#645157', '#806a70'],
    mane: PAL.ember[4], ember: PAL.ember[5], belly: '#2a2024', eye: PAL.ember[5],
  },
};
const MOUTH = '#2a0808', NOSE = '#0a0608', TOOTH = PAL.bone[3], TONGUE = '#8a2a2a';
const LX = -0.55, LY = -0.68, LZ = 0.48; // Lichtrichtung (oben links, leicht nach vorn)

// Schattierte Ellipse: harte Lichtstufen aus einer Rampe (dunkel → hell).
function vol(p, cx, cy, rx, ry, ramp, bias = 0) {
  const R = Math.ceil(Math.max(rx, ry)) + 1;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) {
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d > 1) continue;
      const t = 0.32 + 0.6 * (u * LX + v * LY + Math.sqrt(1 - d) * LZ) + bias;
      p.px(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))]);
    }
  }
}
// Schattierte Kapsel (Glieder, Hals, Schwanz): Radius r0 → r1.
function capsule(p, x0, y0, x1, y1, r0, r1, ramp, bias = 0) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.001;
  const R = Math.ceil(Math.max(r0, r1)) + 1;
  for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.max(y0, y1) + R; y++) {
    for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.max(x0, x1) + R; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
      const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), r = r0 + (r1 - r0) * t, d = Math.hypot(ex, ey);
      if (d > r) continue;
      const nx = ex / r, ny = ey / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const k = 0.32 + 0.6 * (nx * LX + ny * LY + nz * LZ) + bias;
      p.px(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(k * ramp.length)))]);
    }
  }
}
// Gefülltes Polygon (Scanline, ohne Kantenglättung).
function poly(p, pts, c) {
  let y0 = Infinity, y1 = -Infinity;
  for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k]), b = Math.round(xs[k + 1]);
      if (b > a) p.rect(a, y, b - a, 1, c);
    }
  }
}

function drawWolf(p, v, o = {}) {
  const { t = 0, amp = 1, crouch = 0, leap = 0, headUp = 0, jaw = 0, hurt = false, lying = 0, bob = 0 } = o;
  const s = v.s, F = v.fur;
  const W = p.w, gy = p.h - 4; // Bodenlinie
  const ox = Math.round(W / 2 - 20 * s);
  const X = (x) => ox + x * s, Y = (y) => gy - (26 - y) * s;
  const by = 15 + crouch + bob + lying * 5;
  const BODY = [F[1], F[2], F[3], F[4]], NEAR = [F[1], F[2], F[3], F[4], F[5]], FAR = [F[0], F[1], F[2], F[2]];

  if (lying > 0) {
    // Liegend auf der Seite: Beine steif weggestreckt, Kopf am Boden, Auge zu
    for (const [lx, k] of [[13, 0], [16, 1], [26, 0], [29, 1]]) {
      capsule(p, X(lx), Y(22), X(lx + 4 + k), Y(26 - lying * (1 - k * 0.3)), 1.3 * s, 0.9 * s, k ? FAR : NEAR);
    }
    vol(p, X(20), Y(21.5), 11 * s, 3.6 * s, BODY);
    vol(p, X(14), Y(21.5), 5 * s, 3 * s, BODY, -0.05);
    capsule(p, X(9), Y(22), X(3), Y(24.5), 2.2 * s, 1.4 * s, BODY);
    p.px(X(2.5), Y(24.5), F[5]);
    // Halskrause und Kopf
    for (let i = 0; i < 4; i++) p.line(X(27 + i), Y(19), X(26 + i), Y(17.5), i % 2 ? F[3] : F[4]);
    vol(p, X(32), Y(22), 4 * s, 2.8 * s, NEAR);
    poly(p, [[X(34), Y(20.5)], [X(39), Y(22)], [X(39), Y(23.5)], [X(34), Y(24)]], F[3]);
    p.line(X(34), Y(21), X(38.5), Y(22), F[4]);
    p.px(X(39), Y(22.5), NOSE);
    p.line(X(32), Y(21), X(33.5), Y(21), F[0]); // geschlossenes Auge
    if (lying > 0.7) { p.px(X(37), Y(24), TONGUE); p.px(X(37), Y(24) + 1, TONGUE); }
    p.px(X(30), Y(18.5), F[4]); p.line(X(30), Y(19), X(29), Y(16.8), F[3]); // Ohr
    // erkaltende Glut im Fell
    p.px(X(18), Y(19), lying > 0.9 ? F[1] : v.mane); p.px(X(23), Y(19), PAL.ember[1]);
    return;
  }

  const leg = (x0, phase, back, front) => {
    const sw = Math.sin(t * TAU + phase) * 3 * amp + (front ? leap * 4 : -leap * 4);
    const lift = Math.max(0, Math.cos(t * TAU + phase)) * 2 * amp;
    const hipY = by + 2;
    const ramp = back ? FAR : NEAR;
    const fx = x0 + sw + (front ? 0.5 : -0.5), fy = 26 - lift - (leap > 0 ? 2 : 0);
    if (front) {
      // Vorderlauf: Schulter → Ellbogen → gerader Unterarm
      const ex = x0 + sw * 0.35 + 0.5, ey = hipY + 4.5 - lift * 0.3;
      capsule(p, X(x0), Y(hipY), X(ex), Y(ey), 2.2 * s, 1.4 * s, ramp);
      capsule(p, X(ex), Y(ey), X(fx), Y(fy - 0.8), 1.1 * s, 0.9 * s, ramp);
    } else {
      // Hinterlauf: Keule → Sprunggelenk (nach hinten) → Mittelfuß
      const kx = x0 + sw * 0.4 + 1.5, ky = hipY + 3.5;
      const hx = x0 + sw * 0.6 - 1.5, hy = 23 - lift * 0.6;
      capsule(p, X(x0), Y(hipY - 0.5), X(kx), Y(ky), 3 * s, 1.6 * s, ramp);
      capsule(p, X(kx), Y(ky), X(hx), Y(hy), 1.3 * s, 0.9 * s, ramp);
      capsule(p, X(hx), Y(hy), X(fx), Y(fy - 0.8), 0.9 * s, 0.9 * s, ramp);
    }
    // Pfote mit hellem Zehenrand
    p.rect(X(fx) - 1, Y(fy) - 1, Math.round(2.5 * s), 1, back ? F[0] : F[2]);
    p.px(X(fx) + Math.round(1.5 * s), Y(fy) - 1, back ? F[1] : F[3]);
  };
  // hintere Beine (weiter hinten im Bild)
  leg(12, Math.PI, true, false);
  leg(26, 0, true, true);

  // Buschiger Schwanz: Kapselkette, Spitze hell, Strähnen
  const tw = Math.sin(t * TAU * (amp > 0.5 ? 1 : 0.5)) * 1.5;
  const tail = [[10, by - 1.5]];
  for (let i = 1; i <= 4; i++) tail.push([10 - i * 2, by - 1.5 + i * 1.6 + tw * (i / 4) - (headUp > 1.5 ? i * 0.6 : 0)]);
  for (let i = 0; i < 4; i++) capsule(p, X(tail[i][0]), Y(tail[i][1]), X(tail[i + 1][0]), Y(tail[i + 1][1]), (2.4 - i * 0.25) * s, (2.2 - i * 0.3) * s, BODY);
  const te = tail[4];
  p.px(X(te[0]) - 1, Y(te[1]) + 1, F[5]); p.px(X(te[0]), Y(te[1]) + 2, F[4]);
  for (let i = 1; i < 4; i++) p.px(X(tail[i][0]) + 1, Y(tail[i][1]) + Math.round(1.6 * s), F[1]);

  // Rumpf: Keule, schmale Taille, hoher Widerrist, tiefe Brust
  vol(p, X(13), Y(by), 5.5 * s, 4.2 * s, BODY);
  vol(p, X(19), Y(by + 0.3), 6 * s, 3.4 * s, BODY);
  vol(p, X(25 + leap), Y(by - 0.6), 5.2 * s, 5.4 * s, BODY, 0.04);
  // Bauchlinie (hochgezogen, hager) und Rippenschatten
  p.line(X(15), Y(by + 3.4), X(21), Y(by + 2.8), v.belly);
  p.line(X(20), Y(by + 0.5), X(21), Y(by + 2.5), F[1]); p.line(X(22), Y(by + 0.2), X(23), Y(by + 2.6), F[1]);
  // Fellsträhnen: wenige längere Striche, nach hinten unten gekämmt
  for (const [x, y, l] of [[11, -1.5, 3], [14, -0.5, 3], [12, 1.5, 2], [24, 1, 3], [27, 0, 3], [26, 2.5, 2]]) {
    p.line(X(x), Y(by + y), X(x - l * 0.6), Y(by + y + l * 0.6), F[1]);
    p.px(X(x) + 1, Y(by + y), F[4]);
  }
  // helle Strähnen an der Rückenlinie
  for (let x = 10; x <= 24; x += 3) p.line(X(x + 1), Y(by - 3.6 - (x > 20 ? 0.8 : 0)), X(x - 0.5), Y(by - 3 - (x > 20 ? 0.8 : 0)), F[5]);
  // Glut glimmt in Rissen im Fell (Schulter und Flanke)
  p.line(X(16), Y(by - 2.5), X(18), Y(by - 1.5), PAL.ember[2]); p.px(X(17), Y(by - 2), v.mane);
  p.line(X(23), Y(by - 3.5), X(24.5), Y(by - 2), PAL.ember[2]); p.px(X(23.5), Y(by - 3), v.ember);

  // vordere Beine
  leg(14, 0, false, false);
  leg(27, Math.PI, false, true);

  // Halskrause: gezackte Strähnen um den Hals
  const hx = 31 + leap * 1.5, hy = by - 4 - headUp * 3 + crouch * 0.6;
  capsule(p, X(27 + leap), Y(by - 1), X(hx - 1), Y(hy + 1), 3.6 * s, 2.6 * s, BODY, 0.05);
  for (let i = 0; i < 6; i++) {
    const a = 1.9 + i * 0.32, r = 4.2;
    const bx = (27 + leap + hx) / 2 - 0.5, byy = (by - 1 + hy) / 2 + 1;
    const x0 = bx + Math.cos(a) * r * 0.6, y0 = byy + Math.sin(a) * r * 0.6;
    p.line(X(x0), Y(y0), X(x0 - 1.2), Y(y0 + 1.6), i % 2 ? F[3] : F[2]);
    p.px(X(x0 - 1.2), Y(y0 + 1.6), i === 2 || i === 4 ? v.mane : F[1]);
  }

  // Kopf: Schädel, keilförmige Schnauze, Unterkiefer
  const up = headUp * 0.55;
  vol(p, X(hx), Y(hy), 3.6 * s, 3 * s, NEAR);
  const sx = hx + 2, sy = hy + 0.5 - up * 2.2; // Schnauzenansatz
  const tipX = sx + 4.5, tipY = sy - 0.2 - up * 0.8;
  poly(p, [[X(sx - 1), Y(sy - 2.2)], [X(tipX), Y(tipY - 1)], [X(tipX + 0.5), Y(tipY + 0.6)], [X(sx - 1), Y(sy + 1.2)]], F[3]);
  p.line(X(sx - 0.5), Y(sy - 2), X(tipX - 0.5), Y(tipY - 1), F[5]);          // Nasenrücken (Licht)
  p.line(X(sx), Y(sy + 0.8), X(tipX - 0.5), Y(tipY + 0.4), F[2]);            // Lefzenschatten
  p.px(X(tipX) + 1, Y(tipY - 1), NOSE); p.px(X(tipX) + 1, Y(tipY), NOSE);   // Nasenspiegel
  p.px(X(tipX), Y(tipY - 1) - 1, F[4]);
  // Maul: Unterkiefer klappt als Keil auf, Fänge oben und unten
  const jo = jaw * 1.3;
  const j0x = sx - 0.8, j0y = sy + 1.2, jtx = tipX - 0.6, jty = tipY + 0.8 + jo;
  if (jaw > 0) {
    poly(p, [[X(j0x), Y(j0y)], [X(tipX), Y(tipY + 0.4)], [X(jtx), Y(jty)]], MOUTH);
    p.line(X(j0x + 1), Y(j0y + jo * 0.4), X(jtx - 1.5), Y(jty - 0.6), TONGUE);
    p.px(X(tipX) - 1, Y(tipY + 0.6), TOOTH); p.px(X(tipX) - 1, Y(tipY + 0.6) + 1, PAL.bone[4]); // oberer Fang
    p.px(X(jtx) - 1, Y(jty) - 1, TOOTH);                                                        // unterer Fang
    if (jaw > 1.5) p.px(X(sx + 1.5), Y(sy + 1), TOOTH);
  }
  p.line(X(j0x), Y(j0y + 0.6), X(jtx), Y(jty), F[2]);           // Unterkiefer
  p.line(X(j0x), Y(j0y + 1.4), X(jtx - 1), Y(jty + 0.6), F[1]);
  // Backenbart: helle Strähnen nach hinten
  p.line(X(hx - 1), Y(hy + 2), X(hx - 3), Y(hy + 3.5), F[4]); p.px(X(hx - 3.5), Y(hy + 4), F[3]);
  // Ohren: zwei spitze Dreiecke, inneres Ohr dunkel
  const ea = headUp * 0.3;
  poly(p, [[X(hx - 3), Y(hy - 1.5)], [X(hx - 3.6 - ea), Y(hy - 7)], [X(hx - 0.8), Y(hy - 2.4)]], F[2]);
  poly(p, [[X(hx - 1.6), Y(hy - 1.8)], [X(hx - 1.2 - ea), Y(hy - 7.4)], [X(hx + 1.4), Y(hy - 2.4)]], F[4]);
  p.line(X(hx - 0.8), Y(hy - 2.6), X(hx - 1 - ea), Y(hy - 5.4), F[1]);
  p.line(X(hx - 1.6), Y(hy - 2.4), X(hx - 1.3 - ea), Y(hy - 6.6), F[5]);
  // Brauenwulst + Glutauge (2 px, heller Kern vorn)
  const ex = X(hx + 1), ey = Y(hy - 0.5);
  p.line(ex - 1, ey - 1, ex + Math.round(1.5 * s), ey - 1, F[1]);
  p.px(ex - 1, ey, F[0]);
  p.px(ex, ey, hurt ? '#ffffff' : v.eye); p.px(ex + 1, ey, hurt ? '#ffffff' : PAL.ember[3]);
  if (!hurt) p.px(ex, ey, PAL.ember[5]);
  if (v.scar) { p.px(ex, ey - 2, '#7a3a3a'); p.px(ex + 1, ey + 1, '#7a3a3a'); p.px(ex + 1, ey - 1, '#a04848'); }
}

export function createWolfSprites(kind = 'wolf') {
  const v = VARIANTS[kind];
  const W = Math.round(46 * v.s), H = Math.round(32 * v.s);
  const AX = Math.round(W / 2), AY = H - 5;
  const f = (o) => buildFrame(W, H, AX, AY, (p) => drawWolf(p, v, o));
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.05, amp: 0, bob: i === 2 ? 1 : 0, jaw: i === 3 ? 0.6 : 0 })), 4),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, amp: 1, bob: i % 3 === 0 ? 1 : 0 })), 13),
    windup: new Animation([f({ crouch: 1, jaw: 1, headUp: -0.3 }), f({ crouch: 2, jaw: 2, headUp: -0.5 }), f({ crouch: 3, jaw: 2, t: 0.25, amp: 0.3, headUp: -0.6 })], 9, false),
    strike: new Animation([f({ leap: 1, jaw: 3, t: 0.25, amp: 0.4, headUp: 0.2 }), f({ leap: 0.6, jaw: 1, t: 0.4, amp: 0.4 })], 10, false),
    hurt: new Animation([f({ crouch: 1, hurt: true, headUp: -0.5, jaw: 1 })], 1, false),
    howl: new Animation([f({ headUp: 1, crouch: 1 }), f({ headUp: 2, jaw: 1 }), f({ headUp: 2.3, jaw: 2 })], 6, false),
    death: new Animation([f({ hurt: true, crouch: 2, headUp: 1, jaw: 2 }), f({ lying: 0.5 }), f({ lying: 1 })], 8, false),
  };
}
