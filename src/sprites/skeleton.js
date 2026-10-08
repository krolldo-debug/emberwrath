import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Skelettkrieger (rostiges Schwert, verbeulte Eisenkappe) und Skelettschütze
// (Bogen, zerschlissene Kapuze). Knochen in Elfenbein mit Licht von oben
// links, Brustkorb mit echten Lücken, Schädel mit tiefen Augenhöhlen,
// glimmenden Pupillen, Nasenloch, Zahnreihe und klappendem Unterkiefer.
const W = 44, H = 40, OX = 8, OY = 6;
const B = PAL.bone, R = PAL.rust, E = PAL.eye, St = PAL.steel;
const CLOTH = ['#1b1420', '#2a2032', '#3a2c44', '#4c3a58'];
const HOLE = '#140808';
const HOOD = ['#2a2032', '#4a3a5a', '#6e5a84', '#a08cb8'];

// Zweigliedriges Bein/Arm (Knie nach vorn = bend 1, Ellbogen nach hinten = -1).
function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { jx: ax + ux * a - uy * h * bend, jy: ay + uy * a + ux * h * bend, ex: ax + dx, ey: ay + dy };
}

// Röhrenknochen: 1 px Schaft, an der Lichtseite heller, Gelenkknubbel am Ende.
function bone(p, x0, y0, x1, y1, near) {
  p.line(x0, y0, x1, y1, near ? B[3] : B[1]);
  if (near) p.px((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5, B[4]);
}

function drawRustySword(p, hx, hy, a, len = 11) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; } // nx/ny zeigt zur Lichtseite
  // Griff mit Lederwicklung, Knauf
  p.line(hx - dx * 2, hy - dy * 2, hx, hy, PAL.leather[2]);
  p.px(hx - dx, hy - dy, PAL.leather[1]);
  p.px(hx - dx * 3, hy - dy * 3, R[2]);
  // Parierstange
  p.line(hx + dx + nx * 2, hy + dy + ny * 2, hx + dx - nx * 2, hy + dy - ny * 2, R[1]);
  p.px(hx + dx + nx * 2, hy + dy + ny * 2, R[3]);
  // Klinge: 2 px breit, helle Fase oben, dunkle Schneide, Rostflecken, Scharten
  const bx = hx + dx * 2, by = hy + dy * 2;
  for (let s = 0; s <= len; s += 0.5) {
    const x = bx + dx * s, y = by + dy * s;
    p.px(x, y, s > len - 1.5 ? St[3] : St[2]);
    if (s < len - 1) p.px(x + nx, y + ny, s % 3 < 1 ? St[4] : St[3]);
  }
  p.px(bx + dx * len + dx, by + dy * len + dy, St[4]);
  p.px(bx + dx * 2 + nx, by + dy * 2 + ny, St[5]);           // Glanzpunkt
  for (const s of [3.5, 7]) p.px(bx + dx * s, by + dy * s, R[2]);
  p.px(bx + dx * 5 + nx, by + dy * 5 + ny, R[3]);
  p.px(bx + dx * 8.5 - nx * 0.6, by + dy * 8.5 - ny * 0.6, HOLE); // Scharte
}

function drawBow(p, hx, hy, draw) {
  // Recurve-Bogen senkrecht vor dem Körper, Wicklung in der Mitte, Knochenspitzen
  for (let i = -7; i <= 7; i++) {
    const a = Math.abs(i);
    const x = hx + 2 - Math.round((i * i) / 16) + (a === 7 ? 1 : 0);
    const c = a >= 6 ? B[3] : a <= 1 ? CLOTH[3] : PAL.leather[3];
    p.px(x, hy + i, c);
    if (a > 1 && a < 6) p.px(x + 1, hy + i, PAL.leather[1]);
    if (a === 3) p.px(x, hy + i, '#86603f');
  }
  const sx = hx - 1 - draw;
  p.line(hx, hy - 7, sx, hy, B[2]);
  p.line(sx, hy, hx, hy + 7, B[2]);
  if (draw > 0) {
    p.line(sx, hy, hx + 8, hy, PAL.leather[3]);
    p.px(hx + 9, hy, St[5]); p.px(hx + 8, hy - 1, St[3]); p.px(hx + 8, hy + 1, St[3]);
    p.px(sx - 1, hy - 1, PAL.crimson[3]); p.px(sx - 1, hy + 1, PAL.crimson[2]);
  }
}

// Schädel im Dreiviertelprofil nach rechts. hx/hy = linke obere Ecke.
function drawSkull(p, hx, hy, { jaw = 0, eye = 1, hurt = false, weapon = 'sword' }) {
  // Hirnschale: abgerundet, Licht oben links
  p.rect(hx + 1, hy, 5, 1, B[3]);
  p.rect(hx, hy + 1, 7, 4, B[3]);
  p.rect(hx + 1, hy + 5, 6, 1, B[3]);
  p.rect(hx, hy + 1, 1, 3, B[2]);                       // Hinterkopf im Schatten
  p.rect(hx + 1, hy + 1, 3, 1, B[4]); p.px(hx + 2, hy, B[4]); p.px(hx + 1, hy + 2, B[4]);
  p.px(hx + 6, hy + 1, B[2]); p.px(hx + 1, hy + 4, B[2]); p.px(hx + 2, hy + 5, B[2]);
  // Schläfengrube + Jochbein
  p.px(hx + 3, hy + 3, B[2]); p.px(hx + 4, hy + 4, B[4]);
  // Augenhöhle (tief, 2×2) mit glimmender Pupille
  p.rect(hx + 4, hy + 2, 2, 2, HOLE); p.px(hx + 3, hy + 3, HOLE);
  p.rect(hx + 3, hy + 1, 3, 1, B[2]);                    // Brauenbogen-Schatten
  if (eye) {
    p.px(hx + 5, hy + 2, hurt ? '#ffffff' : E[0]);
    if (eye > 1) { p.px(hx + 4, hy + 2, E[1]); p.px(hx + 5, hy + 3, E[0]); }
  }
  // Nasenloch und Zahnreihe des Oberkiefers
  p.px(hx + 6, hy + 4, HOLE);
  p.px(hx + 7, hy + 4, B[2]);
  p.px(hx + 3, hy + 5, B[4]); p.px(hx + 4, hy + 5, B[2]); p.px(hx + 5, hy + 5, B[4]); p.px(hx + 6, hy + 5, B[2]);
  // Unterkiefer klappt nach unten
  const jy = hy + 6 + jaw;
  if (jaw) p.rect(hx + 3, hy + 6, 4, jaw, HOLE);
  p.rect(hx + 2, jy, 5, 1, B[2]);
  p.px(hx + 4, jy, B[3]); p.px(hx + 6, jy, B[3]);
  p.px(hx + 2, jy - 1, B[2]);                            // Kiefergelenk
  // Riss in der Hirnschale
  p.px(hx + 3, hy, B[1]); p.px(hx + 2, hy + 1, B[1]); p.px(hx + 2, hy + 2, B[2]);
  if (weapon === 'sword') {
    // Verbeulte Eisenkappe: heller Stahl mit Rostkante, deutliche Lichtkante oben
    // links, damit der Kopf auf dunklem Gruftboden nicht verschwindet
    p.rect(hx, hy - 1, 7, 2, St[3]);
    p.rect(hx + 1, hy - 2, 5, 1, St[4]);
    p.rect(hx + 1, hy - 2, 3, 1, St[5]); p.px(hx, hy - 1, St[4]); p.px(hx + 1, hy - 1, St[5]);
    p.px(hx + 5, hy - 1, St[2]); p.px(hx + 6, hy, St[2]); p.px(hx + 6, hy - 1, R[3]);
    p.rect(hx - 1, hy + 1, 9, 1, R[2]);                  // Krempe (rostig)
    p.px(hx - 1, hy + 1, R[3]); p.px(hx, hy + 1, R[3]); p.px(hx + 4, hy + 1, St[4]);
    p.px(hx + 3, hy, St[2]); p.px(hx + 4, hy - 1, St[4]);  // Delle
    p.px(hx - 1, hy + 2, R[1]); p.px(hx - 1, hy + 3, R[1]);  // Nackenschirm
  } else {
    // Zerschlissene Kapuze in verblichenem Violett, heller Saum oben links
    p.rect(hx, hy - 1, 6, 1, HOOD[2]); p.rect(hx - 1, hy, 4, 1, HOOD[2]);
    p.rect(hx + 1, hy - 1, 3, 1, HOOD[3]); p.px(hx, hy - 1, HOOD[3]); p.px(hx - 1, hy, HOOD[3]);
    p.px(hx + 4, hy - 1, HOOD[1]); p.px(hx + 5, hy - 1, HOOD[1]);
    p.rect(hx - 1, hy + 1, 1, 6, HOOD[1]); p.px(hx - 1, hy + 1, HOOD[2]);
    p.px(hx - 2, hy + 3, HOOD[1]); p.px(hx - 2, hy + 5, HOOD[0]);
    p.px(hx - 1, hy + 7, HOOD[0]); p.px(hx + 6, hy - 1, HOOD[1]);
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
  const hipY = ty + 6;

  // Hinteres Bein (Knie nach vorn)
  const kB = ik(tx + 2, hipY, tx + 2 + legB[0], fy - legB[1] - 1, 3.8, 3.8, -1);
  bone(p, tx + 2, hipY, kB.jx, kB.jy, false); bone(p, kB.jx, kB.jy, kB.ex, kB.ey, false);
  p.px(kB.jx, kB.jy, B[2]);
  p.rect(kB.ex, kB.ey, 3, 1, B[1]);
  // Hinterer Arm (hängt, Ellbogen nach hinten)
  const aB = weapon === 'bow' && bowDraw > 0
    ? ik(tx + 1, ty + 1, tx + 4 - bowDraw, ty + 3, 3.4, 3.4, -1)
    : ik(tx + 1, ty + 1, tx - 0.5 - lean * 0.3, ty + 7, 3.4, 3.4, -1);
  bone(p, tx + 1, ty + 1, aB.jx, aB.jy, false); bone(p, aB.jx, aB.jy, aB.ex, aB.ey, false);
  p.px(aB.ex, aB.ey + 1, B[1]);

  // Wirbelsäule (Wirbel abwechselnd hell/dunkel)
  for (let y = ty; y <= hipY; y++) p.px(tx + 2, y, (y & 1) ? B[2] : B[3]);
  // Brustkorb: drei gebogene Rippen mit dunklen Lücken dazwischen
  for (let r = 0; r < 3; r++) {
    const ry = ty + 1 + r * 2, w = 4 - r * 0.8;
    p.line(tx + 3, ry, tx + 2 + w, ry, r === 0 ? B[4] : B[3]);
    p.px(tx + 3 + w, ry + 1, B[2]);                       // Rippe biegt nach unten
  }
  // Schlüsselbein
  p.line(tx + 2, ty, tx + 6, ty, B[3]); p.px(tx + 3, ty, B[4]);
  // Becken (Schaufel mit Loch) und zerfetzter Lendenschurz
  p.rect(tx, hipY - 1, 6, 2, B[3]);
  p.rect(tx, hipY - 1, 2, 1, B[4]); p.px(tx + 3, hipY, HOLE); p.px(tx + 5, hipY, B[2]);
  p.rect(tx + 1, hipY + 1, 5, 2, CLOTH[1]);
  p.px(tx + 1, hipY + 1, CLOTH[3]); p.px(tx + 2, hipY + 1, CLOTH[2]);
  p.px(tx + 2, hipY + 3, CLOTH[1]); p.px(tx + 4, hipY + 3, CLOTH[0]); p.px(tx + 5, hipY + 2, CLOTH[0]);

  // Vorderes Bein
  const kF = ik(tx + 4, hipY, tx + 5 + legF[0], fy - legF[1] - 1, 3.8, 3.8, -1);
  bone(p, tx + 4, hipY + 1, kF.jx, kF.jy, true); bone(p, kF.jx, kF.jy, kF.ex, kF.ey, true);
  p.px(kF.jx + 1, kF.jy, B[4]); p.px(kF.jx, kF.jy, B[3]);  // Kniescheibe
  p.rect(kF.ex, kF.ey, 3, 1, B[2]); p.px(kF.ex + 3, kF.ey, B[3]); p.px(kF.ex, kF.ey - 1, B[3]);

  // Halswirbel + Schädel
  p.px(tx + 3, ty - 1, B[2]); p.px(tx + 3, ty - 2, B[3]);
  drawSkull(p, tx + 1, ty - 9, { jaw, eye, hurt, weapon });

  // Waffenarm
  const sx = tx + 5, sy = ty + 1;
  if (weapon === 'sword') {
    // Rostige Schulterplatte mit Riemen
    p.rect(sx - 1, sy - 2, 4, 2, R[2]); p.px(sx - 1, sy - 2, R[3]); p.px(sx, sy - 2, R[3]);
    p.px(sx + 2, sy - 1, R[1]); p.px(sx + 1, sy - 1, St[4]);
    const hxp = sx + Math.cos(arm) * 5, hyp = sy + Math.sin(arm) * 5 + 1;
    const ka = ik(sx, sy, hxp, hyp, 3, 3, Math.cos(arm) < -0.2 ? 1 : -1);
    bone(p, sx, sy, ka.jx, ka.jy, true); bone(p, ka.jx, ka.jy, ka.ex, ka.ey, true);
    p.px(ka.jx, ka.jy, B[4]);
    drawRustySword(p, hxp, hyp, arm);
    p.px(hxp, hyp, B[4]);
  } else if (weapon === 'bow') {
    // Köcherriemen quer über die Rippen, Köcher hinter der Schulter
    p.line(tx + 1, ty - 1, tx + 5, ty + 6, PAL.leather[2]);
    p.rect(tx - 2, ty - 3, 2, 6, PAL.leather[1]); p.px(tx - 2, ty - 4, PAL.crimson[3]); p.px(tx - 1, ty - 4, B[4]);
    bone(p, sx, sy, sx + 2, sy + 2, true); bone(p, sx + 2, sy + 2, sx + 4, sy + 2, true);
    drawBow(p, sx + 5, sy + 2, bowDraw);
    p.px(sx + 4, sy + 2, B[4]);
    if (bowDraw > 0) p.px(aB.ex, aB.ey, B[4]);
  }
  p.ctx.restore();
}

// Knochenhaufen (Todes-Endframe) – Teile werden über die Frames "abgelegt".
function drawCollapse(p, t, weapon) {
  p.ctx.save();
  p.ctx.translate(OX, OY);
  const fy = 29;
  const k = Math.min(1, t);
  if (weapon === 'sword') drawRustySword(p, 3, fy - 1, -0.12, 10);
  else drawBow(p, 4, fy - 4, 0);
  // Lange Knochen kreuz und quer
  p.line(7, fy - 1, 13, fy - 2, B[2]); p.px(7, fy - 2, B[3]); p.px(13, fy - 3, B[3]);
  p.line(15, fy, 21, fy - 1, B[3]); p.px(15, fy - 1, B[4]); p.px(21, fy - 2, B[4]);
  p.line(10, fy, 14, fy - 3, B[2]);
  // Becken und Brustkorb, zusammengesackt
  p.rect(11, fy - 3, 6, 2, B[3]); p.rect(11, fy - 3, 2, 1, B[4]); p.px(14, fy - 2, HOLE);
  for (let r = 0; r < 3; r++) { p.line(12 + r, fy - 4 - r, 16 - r * 0.5, fy - 4 - r, B[3]); p.px(12 + r, fy - 4 - r, B[4]); }
  p.rect(12, fy - 1, 5, 1, CLOTH[1]); p.px(13, fy - 1, CLOTH[2]);
  // Helm bzw. Kapuze rollt zur Seite
  if (weapon === 'sword') { p.rect(8, fy - 4, 4, 2, St[2]); p.px(8, fy - 4, St[4]); p.px(10, fy - 3, R[2]); }
  else { p.rect(8, fy - 3, 4, 2, CLOTH[2]); p.px(9, fy - 3, CLOTH[3]); }
  // Schädel rollt weg, Glut in der Augenhöhle erlischt
  const sx = Math.round(18 + k * 4), sy = fy - 5;
  p.rect(sx, sy, 5, 4, B[3]);
  p.rect(sx + 1, sy - 1, 3, 1, B[3]);
  p.px(sx + 1, sy, B[4]); p.px(sx, sy + 3, B[2]);
  p.rect(sx + 2, sy + 1, 2, 2, HOLE);
  if (k < 0.5) p.px(sx + 3, sy + 1, E[0]);
  p.px(sx + 4, sy + 3, B[2]); p.px(sx + 1, sy + 3, B[4]); p.px(sx + 3, sy + 3, B[4]);
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
      f({ arm: -1.8, lean: -1, jaw: 1, eye: 2, legF: [1, 0], crouch: 1 }),
      f({ arm: -2.3, lean: -2, jaw: 1, eye: 2, legF: [2, 0], legB: [-1, 0], crouch: 1 }),
    ], 8, false);
    anims.strike = new Animation([
      f({ arm: -0.2, lean: 1, jaw: 1, eye: 2, legF: [2, 0], legB: [-2, 0] }),
      f({ arm: 1.3, lean: 2, crouch: 2, jaw: 0, eye: 2, legF: [3, 0], legB: [-2, 0] }),
      f({ arm: 1.2, lean: 1, crouch: 1, legF: [2, 0], legB: [-2, 0] }),
    ], 14, false);
  } else {
    anims.windup = new Animation([0, 1, 2, 3].map((i) => f({ bowDraw: i, lean: -Math.min(i, 1), eye: 2 })), 6, false);
    anims.strike = new Animation([f({ bowDraw: 0, lean: -2, eye: 2, jaw: 1 }), f({ bowDraw: 0, lean: -1 })], 10, false);
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
