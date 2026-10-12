import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Skelettkrieger (rostiges Schwert, verbeulte Eisenkappe) und Skelettschütze
// (Bogen, zerschlissene Kapuze). Knochen in Elfenbein mit Licht von oben
// links, Brustkorb mit echten Lücken, Schädel mit tiefen Augenhöhlen,
// glimmenden Pupillen, Nasenloch, Zahnreihe und klappendem Unterkiefer.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln, verschoben mit
// p.translate. Bei p.fine: Knochen zweifarbig mit Lichtkante, Schädel fein (gerundete Hirnschale, Brauenkante,
// tiefe Augenhöhle mit Glutpupille, Zähne einzeln), Schwert mit 5 Stahlstufen, Glanzlinie, Rost und echter Scharte,
// Bogen mit feiner Sehne, Kapuze mit zweifarbigen Falten.
const W = 44, H = 40, OX = 8, OY = 6;
const B = PAL.bone, R = PAL.rust, E = PAL.eye, St = PAL.steel, LE = PAL.leather;
const LX = -0.55, LY = -0.7, LZ = 0.45;
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

// Schattierte Ellipse (nur fein): harte Lichtstufen aus einer Rampe, cut(x, y) schneidet aus.
function vol(p, cx, cy, rx, ry, ramp, bias = 0, cut = null) {
  p.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1 || (cut && cut(x, y))) return null;
    const t = 0.3 + 0.62 * (u * LX + v * LY + Math.sqrt(1 - d) * LZ) + bias;
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
  });
}

// Röhrenknochen: 1 px Schaft, an der Lichtseite heller, Gelenkknubbel am Ende.
// Fein: Schaft aus zwei Feinpixel-Linien (Lichtseite oben/links, Schattenseite unten/rechts), Lichtkante in der Mitte.
function bone(p, x0, y0, x1, y1, near) {
  if (p.fine) {
    const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0), ox = horiz ? 0 : 0.5, oy = horiz ? 0.5 : 0;
    p.fline(x0 + ox, y0 + oy, x1 + ox, y1 + oy, near ? B[2] : B[0]);
    p.fline(x0, y0, x1, y1, near ? B[3] : B[1]);
    const ax = x0 + (x1 - x0) * 0.3, ay = y0 + (y1 - y0) * 0.3, bx = x0 + (x1 - x0) * 0.65, by = y0 + (y1 - y0) * 0.65;
    p.fline(ax, ay, bx, by, near ? B[4] : B[2]);
    return;
  }
  p.line(x0, y0, x1, y1, near ? B[3] : B[1]);
  if (near) p.px((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5, B[4]);
}

function drawRustySword(p, hx, hy, a, len = 11) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let nx = -dy, ny = dx; if (nx + ny > 0) { nx = -nx; ny = -ny; } // nx/ny zeigt zur Lichtseite
  if (p.fine) { fineSword(p, hx, hy, dx, dy, nx, ny, len); return; }
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

// Fein: Klinge in Feinpixeln über 5 Stahlstufen (Schneide dunkel → Fase mit Glanzlinie), Rostfraß in Flecken,
// echte Scharte in der Schneide, Griff mit Lederwicklung, Knauf und Parierstange mit Lichtkante.
function fineSword(p, hx, hy, dx, dy, nx, ny, len) {
  const at = (s, k) => [hx + dx * s + nx * k, hy + dy * s + ny * k];
  // Griff: Wicklung als Streifen, Knauf rund
  p.fline(hx - dx * 2, hy - dy * 2, hx, hy, LE[1], 1);
  for (let s = 0.25; s <= 2; s += 0.5) { const [x, y] = at(-s, 0.25); p.dot(x, y, LE[3]); }
  { const [x, y] = at(-3, 0); p.rect(p.snap(x) - 0.5, p.snap(y) - 0.5, 1, 1, R[2]); p.dot(p.snap(x) - 0.5, p.snap(y) - 0.5, R[3]); p.dot(p.snap(x), p.snap(y), R[1]); }
  // Parierstange: dunkler Körper, Lichtkante, Enden rostig
  const [g0x, g0y] = at(1, 2), [g1x, g1y] = at(1, -2);
  p.fline(g0x, g0y, g1x, g1y, R[1], 1);
  p.fline(g0x, g0y, g1x, g1y, R[3]);
  p.dot(g0x, g0y, R[3]); p.dot(g1x, g1y, R[0]);
  // Klinge: s längs, k quer (k > 0 = Lichtseite); deckt dieselben Weltpixel wie die grobe Klinge
  const bx = hx + dx * 2, by = hy + dy * 2;
  for (let s = -0.25; s <= len + 1; s += 0.25) {
    const kmax = s < len - 1 ? 1.375 : 1.375 - (s - (len - 1)) * 0.75, kmin = s < len ? -0.375 : -0.375 + (s - len) * 0.5;
    for (let k = kmin; k <= kmax; k += 0.25) {
      if (s > 8 && s < 8.9 && k < 0.15) continue;                 // Scharte (echte Kerbe in der Silhouette)
      if (s > 5.4 && s < 5.8 && k < -0.1) continue;
      const c = k > 1 ? (s > 1 && s < len - 2 && !(s > 4.6 && s < 5.6) ? St[5] : St[4]) : k > 0.5 ? St[4] : k > 0 ? (s > 1.5 && s < len - 2.5 ? St[2] : St[3]) : k > -0.25 ? St[3] : St[1];
      p.dot(bx + dx * s + nx * k, by + dy * s + ny * k, c);
    }
  }
  const dot = (s, k, c) => p.dot(bx + dx * s + nx * k, by + dy * s + ny * k, c);
  dot(2, 1.25, '#ffffff'); dot(2.25, 1.25, St[5]);                         // Glanzpunkt
  // Rostfraß: Flecken aus 3–4 Feinpixeln, dunkler Kern, helle Kante zum Licht
  for (const [s, k] of [[3.5, 0], [7, 0.25], [5, 1]]) {
    dot(s, k, R[2]); dot(s + 0.25, k - 0.25, R[1]); dot(s - 0.25, k + 0.25, R[3]); dot(s + 0.5, k, R[2]);
  }
  for (const s of [0.25, 0.75, 9.5]) dot(s, -0.25, R[1]);
  dot(8.9, 0.25, R[1]); dot(7.9, 0.25, R[2]);                              // Rost an der Scharte
}

function drawBow(p, hx, hy, draw) {
  if (p.fine) {
    // Fein: Wurfarme zweifarbig mit Glanz, Wicklung gestreift, Knochenspitzen, Sehne 1 Feinpixel
    for (let i = -7; i <= 7.5; i += 0.5) {
      const a = Math.abs(i - (i > 0 ? 0.5 : 0)), x = hx + 2 - (i * i) / 16 + (a >= 6.5 ? (a - 6.5) * 2 : 0);
      const tip = a >= 6, grip = a <= 1.5;
      const c0 = tip ? B[4] : grip ? ((i * 2) & 1 ? CLOTH[2] : CLOTH[3]) : a >= 2.5 && a <= 3.5 ? '#86603f' : LE[3];
      const c1 = tip ? B[2] : grip ? CLOTH[1] : LE[2];
      p.dot(x, hy + i, c0); p.dot(x + 0.5, hy + i, c1);
      if (a > 1.5 && a < 6) p.dot(x + 1, hy + i, LE[1]);
    }
    const sx = hx - 1 - draw;
    p.fline(hx, hy - 7, sx, hy, B[2]);
    p.fline(sx, hy, hx, hy + 7.5, B[2]);
    if (draw > 0) {
      p.fline(sx, hy, hx + 8.5, hy, LE[3]);
      for (const [x, y, c] of [[9.5, 0, St[5]], [9, 0, St[4]], [9, -0.5, St[4]], [9, 0.5, St[2]], [8.5, -0.5, St[3]], [8.5, 0.5, St[2]], [8.5, -1, St[4]], [8.5, 1, St[1]]]) p.dot(hx + x, hy + y, c);
      p.fline(sx - 0.5, hy - 0.5, sx - 1.5, hy - 1, PAL.crimson[3]); p.fline(sx - 0.5, hy + 0.5, sx - 1.5, hy + 1, PAL.crimson[2]);
      p.dot(sx - 1, hy - 0.5, PAL.crimson[4]); p.dot(sx, hy, B[3]);                                  // Federn, Nocke
    }
    return;
  }
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
  if (p.fine) { fineSkull(p, hx, hy, { jaw, eye, hurt, weapon }); return; }
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

// Fein: Schädel im Dreiviertelprofil (gleiche Weltpixel wie grob). Hirnschale gerundet und schattiert, Riss mit
// Lichtkante, Brauenkante, tiefe Augenhöhle mit Glutpupille und Glanz, Nasenhöhle, Zähne einzeln, Kiefer zweistufig.
function fineSkull(p, hx, hy, { jaw, eye, hurt, weapon }) {
  const BR = [B[2], B[3], B[3], B[4]];
  vol(p, hx + 3.5, hy + 2.9, 3.6, 3.05, BR, 0.02);
  p.rect(hx + 3, hy + 4, 4, 2, B[3]); p.rect(hx + 1, hy + 5, 2, 1, B[2]); p.dot(hx + 2, hy + 5, B[3]);
  p.dot(hx + 7, hy + 4, B[3]); p.dot(hx + 7, hy + 4.5, B[2]);                     // Nasenbein-Spitze
  // Riss in der Hirnschale (dunkel, helle Kante links)
  p.fline(hx + 3, hy, hx + 2.5, hy + 1, B[1]); p.fline(hx + 2.5, hy + 1, hx + 3, hy + 1.5, B[1]); p.fline(hx + 3, hy + 1.5, hx + 2.5, hy + 2.5, B[1]);
  p.dot(hx + 2, hy + 1, B[4]); p.dot(hx + 2, hy + 2, B[4]);
  // Schläfengrube und Jochbein
  p.dot(hx + 2.5, hy + 3.5, B[2]); p.dot(hx + 3, hy + 3.5, B[2]); p.dot(hx + 3, hy + 4, B[2]);
  p.dot(hx + 4, hy + 4, B[4]); p.dot(hx + 4.5, hy + 4, B[4]); p.dot(hx + 4, hy + 4.5, B[2]);
  // Brauenkante im Licht, darunter die tiefe Augenhöhle (gerundet)
  p.fline(hx + 3.5, hy + 1.5, hx + 6, hy + 1.5, B[4]); p.dot(hx + 6.5, hy + 1.5, B[3]);
  p.rect(hx + 4, hy + 2, 2, 2, '#140808'); p.dot(hx + 3.5, hy + 2.5, HOLE); p.dot(hx + 3.5, hy + 3, HOLE);
  p.dot(hx + 5.5, hy + 3.5, B[2]); p.dot(hx + 4, hy + 3.5, B[1]);                  // Innenwand im Licht unten rechts
  if (eye) {
    const big = eye > 1;
    p.dot(hx + 4.5, hy + 2.5, hurt ? '#ffffff' : E[0]); p.dot(hx + 5, hy + 3, hurt ? '#ffffff' : '#a01a12');
    p.dot(hx + 5, hy + 2.5, hurt ? '#ffffff' : E[1]);                                // glimmender Kern
    if (big) { p.dot(hx + 5.5, hy + 2.5, E[0]); p.dot(hx + 4.5, hy + 3, E[0]); p.dot(hx + 5, hy + 2, hurt ? '#ffffff' : '#ffe0b0'); }
  }
  // Nasenhöhle (umgekehrtes Herz)
  p.dot(hx + 6, hy + 4, HOLE); p.dot(hx + 6.5, hy + 4, HOLE); p.dot(hx + 6, hy + 4.5, HOLE); p.dot(hx + 6.5, hy + 3.5, B[2]);
  // Obere Zahnreihe: Zähne einzeln, Lücken dunkel, Kante zum Licht hell
  for (let k = 0; k < 8; k++) {
    const x = hx + 3 + k * 0.5, tooth = !(k & 1);
    p.dot(x, hy + 5, tooth ? B[4] : B[2]); p.dot(x, hy + 5.5, tooth ? B[3] : HOLE);
  }
  // Unterkiefer klappt nach unten
  const jy = hy + 6 + jaw;
  if (jaw) p.rect(hx + 3, hy + 6, 4, jaw, HOLE);
  for (let k = 0; k < 10; k++) {
    const x = hx + 2 + k * 0.5, front = k >= 3;
    p.dot(x, jy, front ? (k & 1 ? B[1] : B[4]) : B[2]); p.dot(x, jy + 0.5, k === 9 ? B[3] : B[2]);
  }
  p.dot(hx + 6.5, jy + 0.5, B[3]); p.dot(hx + 2, jy - 1, B[2]); p.dot(hx + 2.5, jy - 1, B[3]); p.dot(hx + 2, jy - 0.5, B[1]);   // Kinn, Kiefergelenk
  if (weapon === 'sword') {
    // Verbeulte Eisenkappe: Kuppel in 5 Stahlstufen, Glanzlinie und Glanzpunkt oben links, Delle, Rostfraß;
    // rostige Krempe mit Nieten, Nackenschirm
    vol(p, hx + 3.5, hy + 1.1, 4, 3.25, [St[1], St[2], St[3], St[4], St[5]], 0.08, (x, y) => y > hy + 1);
    for (let a = 3.5; a <= 4.6; a += 0.12) p.dot(hx + 3.5 + Math.cos(a) * 3.1, hy + 1.1 + Math.sin(a) * 2.45, St[5]);
    p.dot(hx + 1.5, hy - 1, '#ffffff');
    p.dot(hx + 3.5, hy - 0.5, St[1]); p.dot(hx + 4, hy - 0.5, St[2]); p.dot(hx + 3.5, hy, St[5]);       // Delle
    for (const [x, y, c] of [[6, 0, R[2]], [6.5, 0, R[3]], [6, 0.5, R[1]], [5, -1.5, R[2]], [5.5, -1.5, R[1]]]) p.dot(hx + x, hy + y, c);
    p.rect(hx - 1, hy + 1, 9, 1, R[2]);
    p.fline(hx - 1, hy + 1, hx + 4, hy + 1, R[3]); p.fline(hx - 1, hy + 1.5, hx + 7.5, hy + 1.5, R[1]);
    for (const x of [0.5, 3.5, 6.5]) { p.dot(hx + x, hy + 1, St[4]); p.dot(hx + x + 0.5, hy + 1.5, R[0]); }
    p.rect(hx - 1, hy + 2, 1, 2, R[1]); p.dot(hx - 1, hy + 2, R[2]); p.dot(hx - 1, hy + 2.5, R[2]); p.dot(hx - 0.5, hy + 3.5, R[0]);
  } else {
    // Zerschlissene Kapuze: Grundform wie grob, darüber zweifarbige Falten (Grat hell, Kerbe dunkel), heller Saum
    // oben links, ausgefranstes Ende im Nacken
    p.rect(hx, hy - 1, 6, 1, HOOD[2]); p.rect(hx - 1, hy, 4, 1, HOOD[2]);
    p.rect(hx - 1, hy + 1, 1, 6, HOOD[1]);
    p.dot(hx + 6, hy - 1, HOOD[1]); p.dot(hx + 6, hy - 0.5, HOOD[0]);
    p.fline(hx, hy - 1, hx + 4, hy - 1, HOOD[3]); p.fline(hx - 1, hy, hx - 1, hy + 1, HOOD[3]);   // Saum im Licht
    p.fline(hx + 2, hy - 0.5, hx + 0.5, hy + 0.5, HOOD[0]); p.fline(hx + 2.5, hy - 0.5, hx + 1, hy + 0.5, HOOD[3]);
    p.fline(hx + 4.5, hy - 0.5, hx + 5.5, hy - 0.5, HOOD[1]);
    p.fline(hx - 0.5, hy + 1.5, hx - 0.5, hy + 6, HOOD[0]); p.fline(hx - 1, hy + 2, hx - 1, hy + 5, HOOD[2]);
    p.dot(hx - 2, hy + 3, HOOD[1]); p.dot(hx - 1.5, hy + 3.5, HOOD[0]); p.dot(hx - 2, hy + 5, HOOD[0]);
    p.dot(hx - 1, hy + 7, HOOD[0]); p.dot(hx - 0.5, hy + 7, HOOD[1]); p.dot(hx - 1.5, hy + 6.5, HOOD[1]);
  }
}

// Fein: Silhouette um 1 Feinpixel wachsen lassen (Materialfarbe des Nachbarn). Der Feinumriss ist nur 1 Feinpixel
// statt 1 Weltpixel dick; so bleiben Fläche und Gewicht der Figur wie vorher. Nur Pixel mit mindestens G deckenden
// Nachbarn geben Farbe ab: Flächen, Glieder und gerade Linien wachsen, schräge Einzelstriche und Spitzen bleiben fein.
function grow(p, G = 2) {
  if (!p.fine || p._canvas) return;
  // Maske mit 2 Pixeln Rand (keine Bereichsprüfungen), nur im Rahmen der deckenden Pixel gerechnet
  const { W, H } = p, b = new Int32Array(p.buf.buffer, p.buf.byteOffset, W * H), P = W + 4, L = P * (H + 4);   // Int32: ohne Zahl-Boxing
  if (GM.length < L) { GM = new Uint8Array(L); GN = new Uint8Array(L); }
  const m = GM, n = GN;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0, i = y * W; x < W; x++, i++) {
      if (!b[i]) continue;
      m[(y + 2) * P + x + 2] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y;
    }
  }
  if (x1 < 0) return;
  for (let y = y0; y <= y1; y++) for (let x = x0, q = (y + 2) * P + x0 + 2; x <= x1; x++, q++) if (m[q]) n[q] = m[q - P] + m[q + P] + m[q - 1] + m[q + 1];
  const xa = Math.max(0, x0 - 1), xb = Math.min(W - 1, x1 + 1), ya = Math.max(0, y0 - 1), yb = Math.min(H - 1, y1 + 1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa, q = (y + 2) * P + xa + 2, i = y * W + xa; x <= xb; x++, q++, i++) {
      if (m[q]) continue;
      // Reihenfolge: unten (Oberkante wächst mit Lichtfarbe), oben, links, rechts
      const d = n[q + P] >= G ? P : n[q - P] >= G ? -P : n[q - 1] >= G ? -1 : n[q + 1] >= G ? 1 : 0;
      // schmale Lücken (bis 2 Feinpixel, z. B. zwischen Rippen) bleiben offen: dort zeichnet der Umriss die dunkle Fuge
      if (!d || m[q - d] || m[q - 2 * d]) continue;
      b[i] = b[d === P ? i + W : d === -P ? i - W : i + d];   // Quelle war schon deckend, bleibt unverändert
    }
  }
  m.fill(0, 0, L); n.fill(0, 0, L);
  p.dirty = true;
}
let GM = new Uint8Array(0), GN = GM;   // Arbeitsmasken von grow (wiederverwendet)

function drawSkeleton(p, o = {}) {
  const {
    bob = 0, crouch = 0, lean = 0, legF = [0, 0], legB = [0, 0],
    arm = 0.9, jaw = 0, weapon = 'sword', bowDraw = 0, eye = 1, hurt = false,
  } = o;
  p.translate(OX, OY);
  const fy = 29, ty = 15 + bob + crouch, tx = 12 + lean;
  const hipY = ty + 6;

  // Hinteres Bein (Knie nach vorn)
  const kB = ik(tx + 2, hipY, tx + 2 + legB[0], fy - legB[1] - 1, 3.8, 3.8, -1);
  bone(p, tx + 2, hipY, kB.jx, kB.jy, false); bone(p, kB.jx, kB.jy, kB.ex, kB.ey, false);
  p.px(kB.jx, kB.jy, B[2]);
  p.rect(kB.ex, kB.ey, 3, 1, B[1]);
  if (p.fine) foot(p, kB.ex, kB.ey, false);
  // Hinterer Arm (hängt, Ellbogen nach hinten)
  const aB = weapon === 'bow' && bowDraw > 0
    ? ik(tx + 1, ty + 1, tx + 4 - bowDraw, ty + 3, 3.4, 3.4, -1)
    : ik(tx + 1, ty + 1, tx - 0.5 - lean * 0.3, ty + 7, 3.4, 3.4, -1);
  bone(p, tx + 1, ty + 1, aB.jx, aB.jy, false); bone(p, aB.jx, aB.jy, aB.ex, aB.ey, false);
  p.px(aB.ex, aB.ey + 1, B[1]);

  if (p.fine) fineTorso(p, tx, ty, hipY);
  else {
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
  }

  // Vorderes Bein
  const kF = ik(tx + 4, hipY, tx + 5 + legF[0], fy - legF[1] - 1, 3.8, 3.8, -1);
  bone(p, tx + 4, hipY + 1, kF.jx, kF.jy, true); bone(p, kF.jx, kF.jy, kF.ex, kF.ey, true);
  p.px(kF.jx + 1, kF.jy, B[4]); p.px(kF.jx, kF.jy, B[3]);  // Kniescheibe
  p.rect(kF.ex, kF.ey, 3, 1, B[2]); p.px(kF.ex + 3, kF.ey, B[3]); p.px(kF.ex, kF.ey - 1, B[3]);
  if (p.fine) { foot(p, kF.ex, kF.ey, true); p.dot(kF.jx + 1, kF.jy, '#fffbef'); p.dot(kF.jx + 1.5, kF.jy + 0.5, B[2]); }

  // Halswirbel + Schädel
  p.px(tx + 3, ty - 1, B[2]); p.px(tx + 3, ty - 2, B[3]);
  if (p.fine) { p.dot(tx + 3, ty - 2, B[4]); p.dot(tx + 3.5, ty - 1.5, B[1]); p.dot(tx + 3, ty - 1, B[3]); p.dot(tx + 3.5, ty - 0.5, B[1]); }
  drawSkull(p, tx + 1, ty - 9, { jaw, eye, hurt, weapon });

  // Waffenarm
  const sx = tx + 5, sy = ty + 1;
  if (weapon === 'sword') {
    // Rostige Schulterplatte mit Riemen
    p.rect(sx - 1, sy - 2, 4, 2, R[2]);
    if (p.fine) {
      // fein: Lichtkante oben, Niete mit Glanz, Rostnarben, Riemen mit Stichen
      p.fline(sx - 1, sy - 2, sx + 1.5, sy - 2, R[3]); p.dot(sx - 1, sy - 1.5, R[3]);
      p.fline(sx - 0.5, sy - 0.5, sx + 2.5, sy - 0.5, R[1]); p.dot(sx + 2.5, sy - 1.5, R[1]); p.dot(sx + 2.5, sy - 1, R[0]);
      p.dot(sx + 1, sy - 1.5, St[5]); p.dot(sx + 1.5, sy - 1, St[2]); p.dot(sx + 1, sy - 1, St[4]);
      p.dot(sx, sy - 1, R[1]); p.dot(sx - 0.5, sy - 1, R[1]); p.dot(sx + 2, sy - 2, R[1]);
    } else { p.px(sx - 1, sy - 2, R[3]); p.px(sx, sy - 2, R[3]); p.px(sx + 2, sy - 1, R[1]); p.px(sx + 1, sy - 1, St[4]); }
    const hxp = sx + Math.cos(arm) * 5, hyp = sy + Math.sin(arm) * 5 + 1;
    const ka = ik(sx, sy, hxp, hyp, 3, 3, Math.cos(arm) < -0.2 ? 1 : -1);
    bone(p, sx, sy, ka.jx, ka.jy, true); bone(p, ka.jx, ka.jy, ka.ex, ka.ey, true);
    p.px(ka.jx, ka.jy, B[4]);
    if (p.fine) { p.dot(ka.jx + 0.5, ka.jy + 0.5, B[2]); p.dot(ka.jx, ka.jy, '#fffbef'); }
    drawRustySword(p, hxp, hyp, arm);
    p.px(hxp, hyp, B[4]);
    if (p.fine) { p.dot(hxp + 0.5, hyp + 0.5, B[2]); p.dot(hxp, hyp + 0.5, B[3]); }   // Fingerknöchel
  } else if (weapon === 'bow') {
    // Köcherriemen quer über die Rippen, Köcher hinter der Schulter
    p.line(tx + 1, ty - 1, tx + 5, ty + 6, PAL.leather[2]);
    p.rect(tx - 2, ty - 3, 2, 6, PAL.leather[1]); p.px(tx - 2, ty - 4, PAL.crimson[3]); p.px(tx - 1, ty - 4, B[4]);
    if (p.fine) {
      // fein: Riemen mit Lichtkante und Schnalle, Köcher mit Naht als Punktlinie und Kratzern, Federn und Nocken
      p.fline(tx + 1, ty - 1, tx + 5, ty + 6, LE[3]); p.dot(tx + 3, ty + 2.5, St[4]); p.dot(tx + 3.5, ty + 3, St[2]);
      p.fline(tx - 2, ty - 3, tx - 2, ty + 2.5, LE[2]);
      for (let y = ty - 2.5; y <= ty + 2.5; y += 1) p.dot(tx - 1, y, LE[3]);
      p.dot(tx - 0.5, ty - 1, LE[0]); p.dot(tx - 1.5, ty + 1, LE[0]); p.fline(tx - 2, ty + 2.5, tx - 0.5, ty + 2.5, LE[0]);
      p.dot(tx - 1.5, ty - 4.5, PAL.crimson[2]); p.dot(tx - 2, ty - 4, PAL.crimson[4]);
      p.dot(tx - 0.5, ty - 4.5, PAL.crimson[3]); p.dot(tx - 1, ty - 3.5, B[2]);
    }
    bone(p, sx, sy, sx + 2, sy + 2, true); bone(p, sx + 2, sy + 2, sx + 4, sy + 2, true);
    drawBow(p, sx + 5, sy + 2, bowDraw);
    p.px(sx + 4, sy + 2, B[4]);
    if (bowDraw > 0) p.px(aB.ex, aB.ey, B[4]);
  }
  p.resetTranslate();
}

// Fein: Wirbelsäule (Wirbelkörper hell, Bandscheiben dunkel), Rippen zweifarbig mit Lichtkante oben und nach unten
// gebogenen Enden, Schlüsselbein, Becken mit Loch und Kante, Lendenschurz mit zweifarbigen Falten und Fransen.
function fineTorso(p, tx, ty, hipY) {
  for (let y = ty; y <= hipY; y++) {
    p.dot(tx + 2, y, B[4]); p.dot(tx + 2.5, y, B[3]);
    p.dot(tx + 2, y + 0.5, B[2]); p.dot(tx + 2.5, y + 0.5, B[1]);
  }
  for (let r = 0; r < 3; r++) {
    const ry = ty + 1 + r * 2, w = 4 - r * 0.8, e = tx + 2.5 + w;
    p.fline(tx + 3, ry, e, ry, r === 0 ? B[4] : B[3]);
    p.fline(tx + 3, ry + 0.5, e - 0.5, ry + 0.5, B[2]);
    p.dot(e + 0.5, ry + 0.5, B[3]); p.dot(e + 0.5, ry + 1, B[2]); p.dot(e, ry + 1.5, B[1]);   // Rippe biegt nach unten
  }
  p.fline(tx + 2, ty, tx + 6, ty, B[3]); p.fline(tx + 2.5, ty + 0.5, tx + 6, ty + 0.5, B[2]); p.fline(tx + 3, ty, tx + 4, ty, B[4]);
  // Becken
  p.rect(tx, hipY - 1, 6, 2, B[3]);
  p.fline(tx, hipY - 1, tx + 3, hipY - 1, '#fffbef'); p.fline(tx, hipY - 0.5, tx + 1.5, hipY - 0.5, B[4]);
  p.fline(tx + 0.5, hipY + 0.5, tx + 5.5, hipY + 0.5, B[2]); p.dot(tx + 5.5, hipY, B[2]);
  p.rect(tx + 3, hipY, 1, 0.5, HOLE); p.dot(tx + 3.5, hipY - 0.5, HOLE); p.dot(tx + 2.5, hipY, B[2]);
  // Lendenschurz
  p.rect(tx + 1, hipY + 1, 5, 2, CLOTH[1]);
  for (const x of [1, 3, 4.5]) { p.fline(tx + x, hipY + 1, tx + x + 0.5, hipY + 3, CLOTH[3]); p.fline(tx + x + 0.5, hipY + 1, tx + x + 1, hipY + 3, CLOTH[0]); }
  p.fline(tx + 1, hipY + 1, tx + 3, hipY + 1, CLOTH[2]);
  p.dot(tx + 2, hipY + 3, CLOTH[1]); p.dot(tx + 2.5, hipY + 3.5, CLOTH[0]); p.dot(tx + 4, hipY + 3, CLOTH[0]); p.dot(tx + 5.5, hipY + 3, CLOTH[1]);
}

// Fein: Fußknochen mit einzelnen Zehen (Glieder hell, Lücken dunkel), Ferse im Schatten.
function foot(p, x, y, near) {
  const hi = near ? B[4] : B[2], mid = near ? B[3] : B[1], lo = near ? B[1] : B[0];
  for (let k = 0; k < 6; k++) { p.dot(x + k * 0.5, y, k & 1 ? mid : hi); p.dot(x + k * 0.5, y + 0.5, k & 1 ? lo : mid); }
  p.dot(x, y + 0.5, lo);
}

// Knochenhaufen (Todes-Endframe) – Teile werden über die Frames "abgelegt".
function drawCollapse(p, t, weapon) {
  p.translate(OX, OY);
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
  if (p.fine) {
    // fein: Lichtkanten auf den Knochen, Rippen zweifarbig, Schädel mit gerundeter Höhle, Riss und einzelnen Zähnen
    for (const [x0, y0, x1, y1] of [[7, fy - 1, 13, fy - 2], [15, fy, 21, fy - 1], [10, fy, 14, fy - 3]]) {
      p.fline(x0, y0 + 0.5, x1, y1 + 0.5, B[1]); p.fline(x0 + 1, y0, x1 - 1, y1, B[4]);
    }
    p.fline(11, fy - 3, 14, fy - 3, '#fffbef'); p.fline(11.5, fy - 1.5, 16.5, fy - 1.5, B[2]);
    for (let r = 0; r < 3; r++) p.fline(12.5 + r, fy - 3.5 - r, 16 - r * 0.5, fy - 3.5 - r, B[2]);
    p.fline(12, fy - 1, 16.5, fy - 1, CLOTH[2]); p.dot(13, fy - 0.5, CLOTH[0]); p.dot(15, fy - 0.5, CLOTH[0]);
    if (weapon === 'sword') { p.fline(8, fy - 4, 11, fy - 4, St[4]); p.dot(8.5, fy - 4, '#ffffff'); p.dot(10.5, fy - 3, R[1]); p.dot(11, fy - 3.5, R[3]); }
    else { p.fline(8, fy - 3, 11, fy - 3, CLOTH[3]); p.fline(9.5, fy - 2.5, 10.5, fy - 1.5, CLOTH[0]); }
    p.fline(sx + 1, sy - 1, sx + 3.5, sy - 1, B[4]); p.dot(sx, sy, B[4]);
    p.dot(sx + 1.5, sy + 1, HOLE); p.dot(sx + 2, sy + 2.5, B[2]); p.dot(sx + 3.5, sy + 2.5, B[1]);
    p.fline(sx + 0.5, sy + 0.5, sx + 1, sy + 1.5, B[1]);
    for (let q = 0; q < 6; q++) p.dot(sx + 1.5 + q * 0.5, sy + 3.5, q & 1 ? HOLE : B[4]);
    if (k < 0.5) { p.dot(sx + 3, sy + 1, E[0]); p.dot(sx + 3.5, sy + 1, E[1]); }
    else p.dot(sx + 3, sy + 1.5, '#3a1010');
  }
  p.resetTranslate();
}

export function createSkeletonSprites(weapon = 'sword') {
  const f = (o) => buildFrame(W, H, 15 + OX, 29 + OY, (p) => { drawSkeleton(p, { weapon, ...o }); grow(p); }, { fine: true });
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
    ...[0.2, 0.6, 1].map((t) => buildFrame(W, H, 15 + OX, 29 + OY, (p) => { drawCollapse(p, t, weapon); grow(p); }, { fine: true })),
  ];
  anims.death = new Animation(death, 12, false);
  return anims;
}
