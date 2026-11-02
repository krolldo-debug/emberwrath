import { Animation } from '../gfx/Sprite.js';
import { FROST_KIT } from './foes_frost.js';

// Eigene Gegner der Sternenscherben (Erweiterung „Sternenglut“, Teil 1). Sie stehen auf den Rigs ihrer Vorbilder
// (gleiche Posen, Frames, Anker und Metadaten wie in defs_stars.js abgeleitet), haben aber eigene Körper,
// Silhouetten und Farben. Blickrichtung rechts, Anker = Bodenkontakt, fein gezeichnet wie foes_frost.js.
const { TAU, ik, ell, fd, fl, shard, limb, makeFrame, track, qLeg, dirOf, hash2 } = FROST_KIT;

// Stil „Leerenbefall“: helles Gartentier, aus dem violette Leerenkristalle brechen. Die übrigen Sternenglut-Gegner
// bekommen denselben Stil über recolor.infest (defs_stars.js).
const S = {
  fur: ['#221c2a', '#3a3042', '#5a4c60', '#80707e', '#a8969c', '#ccbcb8', '#e8dcd2', '#fbf4ea'],
  eye: ['#3a0a3a', '#a02aa8', '#f07aff', '#ffe6ff'], eyeG: ['#4a0a5a', '#b02ad0', '#f08aff', '#ffffff'],
  crys: ['#0e0818', '#1e1234', '#3a2468', '#6a46b4', '#a68ae8', '#ecdcff'], crysG: ['#1a0a30', '#4a1a80', '#7a3ac8', '#b070ff', '#e8c8ff', '#ffffff'],
  vein: ['#7a2a8a', '#d070f0'], mote: ['#7454b4', '#c8a8ff'], moteG: ['#4a1a80', '#b070ff'],
};

// Schwebender Leerenstaub statt Frostatem
function motes(p, g, x, y, ph, S, dir = 1, n = 3, calm = false) {
  for (let i = 0; i < n; i++) {
    const f = (ph + i / n) % 1;
    if (f > 0.75 || (calm && i > 0)) continue;
    const X = p.snap(x + dir * (1 + f * 4) + Math.sin((f + i) * TAU) * 0.8), Y = p.snap(y - f * 4 + (i - 1) * 0.6);
    fd(p, X, Y, f < 0.4 ? S.mote[1] : S.mote[0]);
    fd(g, X, Y, f < 0.4 ? S.moteG[1] : S.moteG[0]);
  }
}

// ================================================================ Blütenpirscher (Rig: Frostwolf)

const FW = 64, FH = 44, FAX = 29, FAY = 39;
const W_REST = { t: 0, amp: 0, gallop: 0, crouch: 0, leap: 0, bob: 0, ha: 0.12, jaw: 0, lie: 0, side: 0, eye: 1, br: 0, tail: 0, lunge: 0, pitch: 0, ear: 0, frost: 1 };
const wpose = (o = {}) => ({ ...W_REST, ...o });

function drawStalker(p, g, P, X) {
  const WF = S.fur;
  const gy = FAY, ox = FAX - 15 + P.lunge;
  const meta = {};
  const lie = P.lie, side = P.side;
  const by = gy - 15.5 + P.crouch + P.bob - P.leap * 4 + lie * 9;
  const Y = (x, y) => y + (x - 13) * P.pitch * 0.14;
  const farR = [WF[0], WF[1], WF[2], WF[3]], nearR = [WF[2], WF[3], WF[4], WF[5]];
  const lit = P.frost > 0.3;

  const leg = (xh, ph, near, front) => {
    const hx = ox + xh, hy = Y(xh, by + (front ? 1 : 0));
    const col = near ? nearR : farR;
    if (side > 0.5) {
      const ly = gy - 2 - (near ? 0 : 2);
      limb(p, hx, hy + 1, hx + 6, ly, 3, 2, col); p.rect(hx + 6, ly - 1, 2, 1, WF[0]);
      return;
    }
    const a = P.t * TAU + ph;
    let fx = hx + Math.sin(a) * 4 * P.amp + (front ? 1 : -1), fy = gy - Math.max(0, Math.cos(a)) * 3 * P.amp;
    if (P.leap > 0) {
      const lp = P.leap;
      fx += ((hx + (front ? 13 : -13)) - fx) * lp; fy += (Y(xh, by + (front ? 4 : 6)) - fy) * lp;
    }
    if (lie > 0) { fx = hx + (front ? 5 : -4) * lie + (fx - hx) * (1 - lie); fy = Math.min(gy, fy); }
    const L = qLeg(p, hx, hy - 1, fx, fy, front ? 7.5 : 8, front ? 7.5 : 9, front, near ? 2.8 : 2.4, col, 3);
    if (!front) ell(p, hx - 0.5, hy + 1.5, near ? 3 : 2.5, near ? 3.5 : 3, col[1]);
  };
  const run = P.gallop > 0.5;
  leg(6, 0, false, false);
  leg(20, run ? Math.PI * 0.2 : Math.PI, false, true);

  // --- buschige Rute (wie der Wolf), Spitze je Stil
  const ts = Math.sin(P.t * TAU * 2) * P.amp * 0.8;
  const tailA = 2.3 - P.tail * 0.9 - P.amp * 0.35 - P.leap * 0.6;
  let tx = ox + 1, ty = Y(1, by - 2);
  for (let i = 0; i < 9; i++) {
    const a = tailA + i * 0.05 + ts * 0.05;
    tx += Math.cos(a) * 1.2; ty += Math.sin(a) * 1.2;
    const r = 1.1 + Math.sin(i / 8 * Math.PI) * 1.0;
    ell(p, tx, ty, r, r, WF[4]);
    fl(p, tx - 0.3, ty - r + 0.6, tx - 0.3 + Math.cos(a) * 1.3, ty - r + 1 + Math.sin(a) * 1.3, WF[6]);
    fl(p, tx + 0.6, ty + r - 0.2, tx + 0.6 + Math.cos(a) * 1.2, ty + r - 0.2 + Math.sin(a) * 1.2, WF[2]);
  }
  shard(p, lit ? g : null, tx, ty + 0.5, tx - 1.5, ty - 3.5, 1.4, 0.3, S.crys, S.crysG);

  // --- Rumpf (Maße des Wolfs)
  const flat = 1 - side * 0.25;
  ell(p, ox + 7, Y(7, by), 6, 4.8 * flat, WF[4]);
  ell(p, ox + 13, Y(13, by + 0.3), 7.5, 4.2 * flat, WF[4]);
  ell(p, ox + 20, Y(20, by - 0.5), 5.5, 5.3 * flat, WF[4]);
  ell(p, ox + 13, Y(13, by + 3.4), 6.5, 1.3, WF[2]);
  ell(p, ox + 8, Y(8, by + 3.5), 4, 1.5, WF[3]);
  ell(p, ox + 12, Y(12, by - 3), 9, 2.2 * flat, WF[5]);
  ell(p, ox + 12, Y(12, by - 4), 7, 1.2, WF[6]);
  ell(p, ox + 5, Y(5, by + 1), 3.5, 3.5, WF[3]); ell(p, ox + 4.5, Y(4.5, by), 2.5, 2.5, WF[5]);
  for (let i = 0; i < 40; i++) {
    const x = 3 + hash2(i, 1, 152) * 19.5, y = -3 + hash2(i, 2, 152) * 6.8;
    const c = y < -1 ? (i % 3 ? WF[6] : WF[7]) : y < 1.5 ? (i % 2 ? WF[3] : WF[5]) : WF[2];
    fl(p, ox + x, Y(x, by + y), ox + x - 1.4, Y(x - 1.4, by + y + 0.9), c);
  }
  const backY = (x) => Y(x, by - 4 - (x > 15 ? (x - 15) * 0.2 : 0));
  {
    // Leerenkristalle brechen schräg aus Rücken und Flanke, dazwischen leuchtende Risse
    if (side < 0.5) for (const [x, h, lean] of [[5, 4, 0.3], [9, 7, 0.55], [13, 9, 0.25], [17, 6, -0.1], [20, 4, 0.4]]) {
      const hh = Math.round(h * (1 - lie * 0.4) * (0.7 + 0.3 * Math.min(1, P.frost)));
      shard(p, lit ? g : null, ox + x, backY(x) + 0.5, ox + x - lean * hh, backY(x) - hh, x === 13 ? 2.4 : 1.8, 0.3, S.crys, S.crysG);
    }
    const crack = [[4, 0], [6, 1.5], [8.5, 0.5], [10, 2], [12.5, 1]], crack2 = [[15, -1], [17, 0.8], [19.5, 0]];
    for (const c of [crack, crack2]) for (let i = 0; i < c.length - 1; i++) {
      const [x0, y0] = c[i], [x1, y1] = c[i + 1];
      fl(p, ox + x0, Y(x0, by + y0), ox + x1, Y(x1, by + y1), S.vein[0]);
      fl(p, ox + x0, Y(x0, by + y0) - 0.5, ox + x1, Y(x1, by + y1) - 0.5, S.vein[1]);
      if (lit) fl(g, ox + x0, Y(x0, by + y0) - 0.5, ox + x1, Y(x1, by + y1) - 0.5, S.crysG[3]);
    }
  }

  // --- nahe Beine
  leg(8, run ? 0.5 : Math.PI, true, false);
  leg(22, run ? Math.PI * 1.1 : 0, true, true);

  // --- Hals (schräg nach oben, wie der Wolf)
  const hx = ox + 27 + P.leap * 2, hy = Y(27, by - 8.5) + lie * 5 + Math.max(0, P.ha) * 3;
  limb(p, ox + 20, Y(20, by - 1), hx - 1.5, hy + 1, 7, 5, [WF[3], WF[4], WF[5], WF[6]]);
  const nx = ox + 23, ny = Y(23, by - 4);
  // Halsschmuck je Stil
  {
    ell(p, nx, ny + 1, 3.5, 4.5, WF[5]);
    for (let i = 0; i < 10; i++) {
      const a = -2.4 + i * 0.38, r = 4.2 + (i % 2) * 0.6;
      const x = nx + Math.cos(a) * r - 1, y = ny + 1 + Math.sin(a) * r * 1.1;
      fl(p, x - Math.cos(a) * 2, y - Math.sin(a) * 2, x, y, i % 3 === 0 ? WF[4] : WF[6]);
    }
    if (side < 0.5) for (const [a0, l] of [[-2.4, 5], [-1.9, 6.5], [-2.9, 4]]) {
      const ax = Math.cos(a0), ay = Math.sin(a0);
      shard(p, lit ? g : null, nx - 1 + ax * 3, ny + ay * 3, nx - 1 + ax * (3 + l), ny + ay * (3 + l), 1.2, 0.4, S.crys, S.crysG);
    }
  }

  // --- Kopf (wie der Wolf), längere Ohren
  const ha = P.ha, d = dirOf(ha);
  ell(p, hx, hy + 0.3, 4.1, 3.5, WF[3]);
  ell(p, hx - 0.2, hy - 0.3, 3.7, 3, WF[4]);
  ell(p, hx - 0.5, hy - 1.2, 3, 1.8, WF[6]);
  const earBack = P.ear;
  const ear = (ex, ey, near) => {
    const tipx = ex - 1.5 - earBack * 3 + d.y * 1.5, tipy = ey - 5 + earBack * 2.2;
    shard(p, null, ex + 0.5, ey + 0.3, tipx, tipy, 1.3, null, near ? [WF[1], WF[2], WF[3], WF[4], WF[5], WF[7]] : [WF[0], WF[1], WF[2], WF[3], WF[3], WF[4]]);
    if (near) fl(p, ex + 0.6, ey - 0.4, ex + 0.2 + (tipx - ex) * 0.5, ey + (tipy - ey) * 0.5, S.vein[0]);
  };
  ear(hx - 2, hy - 2, false); ear(hx, hy - 2.5, true);
  // Schnauze schmal und spitz
  const sx0 = hx + d.x * 1.5, sy0 = hy + d.y * 1.5;
  const tipX = hx + d.x * 7.5, tipY = hy + d.y * 7.5 + 0.8;
  limb(p, sx0, sy0, tipX, tipY, 3.6, 2.2, [WF[3], WF[4], WF[5], WF[6]]);
  const ja = ha + P.jaw * 0.45, jd = dirOf(ja);
  const jx = hx + jd.x * 6.2, jy = hy + 1.8 + jd.y * 6.2;
  p.line(hx + 1, hy + 2, jx, jy, WF[3]);
  const fang = (x, y, up) => { x = p.snap(x); y = p.snap(y); fd(p, x, y, '#f4f4ec'); fd(p, x, y + (up ? -0.5 : 0.5), '#d8d0c4'); };
  if (P.jaw > 0.2) {
    fl(p, hx + 1.5, hy + 1, tipX - d.x, tipY + 0.5 - d.y, '#1a0c14', 1);
    fl(p, hx + 2, hy + 1.25, jx - jd.x * 1.7, jy - 1.25, '#6a2a8a');
    fang(tipX - d.x * 1.5, tipY + 1, false); fang(jx - jd.x * 1.5, jy - 1, true); fang(hx + d.x * 3, hy + d.y * 3 + 1.5, false);
  } else {
    fl(p, hx + 1.5, hy + 1.4, tipX - d.x * 1.2, tipY + 0.3, WF[0]);
    fang(hx + d.x * 4, hy + d.y * 4 + 2, false);
  }
  fl(p, sx0 + 0.5, sy0 - 1.1, tipX - d.x * 1.5, tipY - 1.5 - d.y, WF[6], 0.5);
  { const X0 = Math.round(tipX - 1), Y0 = Math.round(tipY - 1);
    const NOSE = [[WF[2], WF[4], '#1a1e28', null], ['#1a1e28', '#0c0e14', '#0c0e14', '#0c0e14'], ['#0c0e14', '#0c0e14', '#030406', '#0c0e14'], [null, '#1a1e28', '#0c0e14', '#1a1e28']];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (NOSE[j][i]) fd(p, X0 + i * 0.5, Y0 + j * 0.5, NOSE[j][i]); }
  // Auge: mandelförmig, leuchtend in der Stilfarbe
  const ex = hx + 1 + d.x, ey = hy - 1 + d.y * 0.5;
  p.line(ex - 3, ey - 1, ex - 1.5, ey, WF[2]);
  const Xe = Math.round(ex), Ye = Math.round(ey);
  fd(p, Xe - 1, Ye - 0.5, WF[0]); fd(p, Xe - 0.5, Ye - 0.5, WF[0]); fd(p, Xe, Ye - 0.5, WF[0]); fd(p, Xe + 0.5, Ye - 0.5, WF[1]);
  if (P.eye > 0.3) {
    fd(p, Xe - 1, Ye, S.eye[1]); fd(p, Xe - 0.5, Ye, S.eye[2]); fd(p, Xe, Ye, S.eye[3]); fd(p, Xe + 0.5, Ye, S.eye[1]);
    for (const [o, q, c] of [[0, 0, S.eyeG[3]], [-0.5, 0, S.eyeG[2]], [0.5, 0, S.eyeG[2]], [-1, 0, S.eyeG[1]], [1, 0, S.eyeG[1]], [0, -0.5, S.eyeG[1]], [0, 0.5, S.eyeG[1]]]) fd(g, Xe + o, Ye + q, c);
  } else { fd(p, Xe - 0.5, Ye, WF[1]); fd(p, Xe, Ye, WF[1]); }
  meta.eye = { x: ex, y: ey };
  meta.mouth = { x: tipX, y: tipY + 1 };
  meta.head = { x: hx, y: hy - 7 };
  if (P.br >= 0) motes(p, g, tipX, tipY, P.br, S, d.x >= 0 ? 1 : -1, X.bigBreath ? 5 : 3, X.calm);
  return meta;
}

function stalkerAnims() {
  const mk = (P, X = {}) => makeFrame(FW, FH, FAX, FAY, drawStalker, P, X);
  const idle = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, k = (1 - Math.cos(t * TAU)) / 2;
    idle.push(mk(wpose({ bob: k > 0.5 ? 1 : 0, ha: 0.08 + k * 0.08, br: t, tail: k * 0.3, frost: i % 3 === 0 ? 1.2 : 1 }), { calm: true }));
  }
  const walk = [];
  for (let i = 0; i < 6; i++) walk.push(mk(wpose({ t: i / 6, amp: 1, bob: i % 3 === 1 ? 1 : 0, ha: 0.16, br: i / 6, tail: 0.4 }), { fx: i % 3 === 0 ? 'step' : null }));
  const windup = track(mk, [[0, wpose()], [0.5, wpose({ crouch: 2, ha: 0.3, jaw: 0.8, ear: 1, br: -1, tail: -0.3 })], [1, wpose({ crouch: 3.5, ha: 0.25, jaw: 1, ear: 1, lunge: -1.5, br: -1, t: 0.25, amp: 0.3, pitch: 0.25 })]], 4);
  const strike = [
    mk(wpose({ leap: 1, jaw: 1.2, ha: 0.05, lunge: 3, ear: 1, br: -1, pitch: -0.15, tail: 0.7 }), { fx: 'impact' }),
    mk(wpose({ leap: 0.9, jaw: 0.6, ha: 0.25, lunge: 3, ear: 0.6, br: -1, pitch: 0.1, tail: 0.6 })),
    mk(wpose({ leap: 0.3, jaw: 0.3, ha: 0.25, lunge: 1.5, crouch: 1.5, br: 0.2, t: 0.25, amp: 0.4 })),
  ];
  const hurt = [mk(wpose({ crouch: 2, ha: -0.35, jaw: 0.8, ear: 1, lunge: -1.5, pitch: -0.2, br: -1 })), mk(wpose({ crouch: 1, ha: 0, lunge: -0.5, br: -1 }))];
  const howl = track(mk, [[0, wpose()], [0.35, wpose({ crouch: 1.5, ha: -0.5, jaw: 0.3, br: -1 })], [0.6, wpose({ crouch: 1.5, ha: -1.15, jaw: 1, pitch: -0.25, br: 0, tail: -0.2 })], [1, wpose({ crouch: 1.5, ha: -1.2, jaw: 1, pitch: -0.25, br: 0.7, tail: -0.2 })]], 6, {
    extras: { 3: { fx: 'roar', bigBreath: true }, 4: { bigBreath: true }, 5: { bigBreath: true } },
  });
  const death = [
    mk(wpose({ crouch: 2, ha: -0.4, jaw: 1, ear: 1, lunge: -1.5, pitch: -0.2, br: -1 })),
    mk(wpose({ crouch: 3, ha: 0.5, lie: 0.4, jaw: 0.6, eye: 0.6, br: -1 })),
    mk(wpose({ ha: 0.7, lie: 0.8, jaw: 0.4, eye: 0.4, br: -1, frost: 0.6 }), { fx: 'impact' }),
    mk(wpose({ ha: 0.6, lie: 1, side: 1, jaw: 0.3, eye: 0, br: -1, frost: 0.3 })),
    mk(wpose({ ha: 0.6, lie: 1, side: 1, jaw: 0.3, eye: 0, br: -1, frost: 0 })),
  ];
  return {
    idle: new Animation(idle, 5),
    walk: new Animation(walk, 12),
    windup: new Animation(windup, 9, false),
    strike: new Animation(strike, 10, false),
    hurt: new Animation(hurt, 10, false),
    howl: new Animation(howl, 7, false),
    death: new Animation(death, 8, false),
  };
}

// ================================================================ Export

export function createStarFoes() {
  return {
    bloom_stalker: stalkerAnims(),
  };
}
