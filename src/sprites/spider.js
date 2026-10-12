import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

// Höhlenspinne: großer, glänzender Hinterleib mit roter Sanduhr-Zeichnung
// und Borsten, Kopfbruststück mit Augenkranz (zwei große Hauptaugen,
// vier Nebenaugen), kräftige Kieferklauen mit Giftfängen, acht gegliederte
// Beine mit hellen Gelenken. Licht von oben links, Chitin mit hartem Glanzpunkt.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln; vol tastet
// Feinpixel ab. Bei p.fine kommen Beinglieder als schattierte Kapseln mit Glanzkante und feinen Borsten,
// Chitin-Glanzkanten, Augenkranz mit Glanzpunkten und die Sanduhr in Feinpixeln dazu.
const W = 46, H = 34, AX = 22, AY = 27;
const S = PAL.spider, M = PAL.spiderMark, E = PAL.eye;
const FANG = PAL.bone[3], VOID = '#0a0610';
const LX = -0.55, LY = -0.7, LZ = 0.45;
const RAMP = [S[0], S[1], S[2], S[3], S[4]], FAR = [VOID, S[0], S[1], S[2]];
const GLINT = '#c8b4e4', SHINE = '#f2ecff', VENOM = ['#4a7a1a', '#9ad03a', '#dcf8a0'];

// Schattierte Ellipse mit harten Lichtstufen.
function vol(p, cx, cy, rx, ry, ramp, bias = 0) {
  // Rahmen = Halbachsen: jede Feinpixelmitte innerhalb der Ellipse liegt darin
  p.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) return null;
    const t = 0.3 + 0.62 * (u * LX + v * LY + Math.sqrt(1 - d) * LZ) + bias;
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
  });
}
// Flache Ellipse: bei res 1 genau wie PixelCanvas.ellipse, fein abgetastet über p.ellipse.
function flat(p, cx, cy, rx, ry, c) {
  if (p.fine) { p.ellipse(cx + 0.5, cy + 0.5, rx + 0.4, ry + 0.4, c); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// ---------------------------------------------------------------- feine Glieder (nur p.fine)
// Normale zur Lichtseite (oben links) einer Strecke.
function lightN(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}
// Chitin-Glied: schattierte Kapsel r0 → r1, dazu Glanzkante (1 Feinpixel) auf der Lichtseite.
function seg(p, x0, y0, x1, y1, r0, r1, ramp, hi) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 0.001;
  const R = Math.max(r0, r1);
  const shade = (px, py) => {
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), r = r0 + (r1 - r0) * t, d2 = ex * ex + ey * ey;
    if (d2 > r * r) return null;
    const nx = ex / r, ny = ey / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const k = 0.3 + 0.62 * (nx * LX + ny * LY + nz * LZ);
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(k * ramp.length)))];
  };
  // Schräge Glieder in Stücken abtasten (enge Rahmen statt eines großen Rechtecks; Schattierung bleibt die des ganzen Glieds)
  const n = Math.max(1, Math.ceil(Math.sqrt(l2) / 2));
  for (let i = 0; i < n; i++) {
    const ax = x0 + dx * i / n, ay = y0 + dy * i / n, bx = x0 + dx * (i + 1) / n, by = y0 + dy * (i + 1) / n;
    p.each(Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, shade);
  }
  if (hi && r0 > 0.55) {
    const [nx, ny] = lightN(dx, dy), o = r0 * 0.55;
    p.fline(x0 + dx * 0.25 + nx * o, y0 + dy * 0.25 + ny * o, x0 + dx * 0.7 + nx * o, y0 + dy * 0.7 + ny * o, hi);
  }
}
// Feine Borsten: kurze Striche auf der Schattenseite eines Glieds, je Weltpixel einer.
function bristles(p, x0, y0, x1, y1, r, c, n = 3) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const [nx, ny] = lightN(dx, dy);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), x = x0 + dx * t - nx * r, y = y0 + dy * t - ny * r;
    p.fline(x, y, x - nx * 0.75 + dx / l * 0.5, y - ny * 0.75 + dy / l * 0.5, c);
  }
}

// Gegliedertes Bein: Hüfte → Knie (hoch über dem Körper) → Fußspitze.
function drawLeg(p, bx, by, dir, phase, lift, near, reach = 1) {
  const fx = bx + dir * (10 + Math.sin(phase) * 2.5) * reach;
  const fy = AY - Math.max(0, Math.cos(phase)) * lift;
  const kx = (bx + fx) / 2 + dir * 1;
  const ky = Math.min(by, fy) - 8 - lift * 0.4;
  const c0 = near ? S[3] : S[1], c1 = near ? S[2] : S[0], hi = near ? S[4] : S[2];
  const mx = kx + (fx - kx) * 0.5, my = ky + (fy - ky) * 0.5;
  if (p.fine) {
    // Handfein: Schenkel als Chitinkapseln (dick → spitz), Glanzkante oben, helle Gelenkringe, feine Borsten
    if (near) {
      seg(p, bx, by - 0.5, kx, ky - 0.5, 0.95, 0.75, RAMP, GLINT);
      seg(p, kx, ky - 0.5, mx, my, 0.7, 0.5, RAMP, S[4]);
      seg(p, mx, my, fx, fy + 0.25, 0.5, 0.3, RAMP, null);
    } else {
      // hintere Beine liegen im Schatten: kräftige dunkle Striche mit 1 Feinpixel Licht oben links genügen
      p.fline(bx, by - 0.5, kx, ky - 0.5, S[0], 1.5); p.fline(bx - 0.5, by - 1, kx - 0.5, ky - 1, S[1]);
      p.fline(kx, ky - 0.5, mx, my, S[0], 1); p.fline(kx - 0.5, ky - 0.5, mx - 0.5, my, S[1]);
      p.fline(mx, my, fx, fy + 0.25, S[0]);
    }
    bristles(p, kx, ky, mx, my, 0.5, near ? S[2] : S[0], 2);
    bristles(p, mx, my, fx, fy, 0.35, near ? S[1] : S[0], 2);
    p.dot(kx - 0.25, ky - 1, hi); p.dot(kx + 0.25, ky - 1, near ? GLINT : hi);   // Kniegelenk
    p.dot(mx, my - 0.25, hi);
    p.dot(fx, fy + 0.5, near ? S[1] : VOID); p.dot(fx + dir * 0.5, fy + 0.5, VOID);   // Kralle
    return;
  }
  // Oberschenkel: 2 px dick, Oberkante heller
  p.line(bx, by, kx, ky, c1);
  p.line(bx, by - 1, kx, ky - 1, c0);
  // Unterschenkel: dünner, läuft spitz aus
  p.line(kx, ky, mx, my, c0);
  p.line(kx + dir * 0.6, ky, mx + dir * 0.6, my, c1);
  p.line(mx, my, fx, fy, c1);
  // Gelenke und Borsten
  p.px(kx, ky - 1, hi);
  p.px(mx, my, hi);
  p.px(fx, fy, near ? S[1] : VOID);
  if (near) { p.px(kx - dir, ky - 2, S[2]); p.px(mx + dir, my - 1, S[2]); }
}

// Fein: Glanzkante als Bogen (1 Feinpixel) am oberen linken Rand einer Chitinkugel.
function rimArc(p, cx, cy, rx, ry, a0, a1, c, k = 0.84) {
  const n = Math.ceil((a1 - a0) * Math.max(rx, ry) * 2.2);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    p.dot(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, c);
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
        if (p.fine) {
          const kx = hx + 4, ky = cy - 8.5 - rear, tx = hx + 9.5 + lunge, ty = cy - 3.5 - rear;
          seg(p, hx - 1, cy - 0.5, kx, ky, 0.95, 0.7, RAMP, GLINT);
          seg(p, kx, ky, tx, ty, 0.6, 0.3, RAMP, null);
          bristles(p, kx, ky, tx, ty, 0.45, S[2], 3);
          p.dot(kx - 0.25, ky - 0.75, S[4]); p.dot(kx + 0.25, ky - 0.75, GLINT);
          p.dot(tx + 0.5, ty + 0.5, S[1]); p.dot(tx + 0.5, ty + 1, VOID);   // Kralle zeigt nach vorn unten
          continue;
        }
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
  const ay = cy - 2.5;
  vol(p, ax, ay, 8, 6.5, RAMP);
  if (p.fine) {
    // Handfein: Glanzkante oben links, harter Glanzpunkt mit weißem Kern
    rimArc(p, ax, ay, 8, 6.5, 3.55, 4.35, GLINT, 0.86);
    rimArc(p, ax, ay, 8, 6.5, 3.35, 4.6, S[4], 0.93);
    p.rect(ax - 3.5, cy - 6, 1, 0.5, GLINT); p.dot(ax - 3.5, cy - 5.5, S[4]); p.dot(ax - 3, cy - 6, SHINE);
    p.dot(ax - 2, cy - 6.5, S[4]); p.dot(ax - 4, cy - 5, S[4]);
    // Segmentrillen: zweifarbig (Rille dunkel, Wulst davor hell)
    for (const dx of [-4, 3]) {
      for (let k = -2; k < 2; k += 0.5) {
        const xa = ax + dx + Math.abs(k) * 0.3 * Math.sign(dx), ya = ay + k * 1.6;
        const xb = ax + dx + Math.abs(k + 0.5) * 0.3 * Math.sign(dx), yb = ay + (k + 0.5) * 1.6;
        p.fline(xa, ya, xb, yb, S[1]);
        p.dot(xa - 0.5, ya, k < 0 ? S[4] : S[3]);
      }
    }
  } else {
    p.px(ax - 3, cy - 6, '#c8b4e4'); p.px(ax - 2, cy - 6, S[4]); p.px(ax - 3, cy - 5, S[4]); // Glanzpunkt
    // Segmentringe (Querrillen)
    for (const dx of [-4, 3]) for (let k = -2; k <= 2; k++) p.px(ax + dx + Math.abs(k) * 0.3 * Math.sign(dx), cy - 2.5 + k * 1.6, S[1]);
  }
  // Rote Sanduhr-Zeichnung (oben breit, schmale Taille, unten breit)
  if (p.fine) {
    // fein: zwei Keile mit schmaler Taille, Lichtkante oben links, Schatten unten rechts
    const x0 = ax - 1, x1 = ax + 3, mxw = ax + 1;
    p.each(x0, cy - 5, x1, cy, (x, y) => {
      const f = Math.abs(y - (cy - 2.75)) / 2.25, hw = 0.35 + f * 1.65;
      if (y < cy - 5 || y > cy || Math.abs(x - mxw) > hw) return null;
      const edgeR = x - mxw > hw - 0.5, edgeL = mxw - x > hw - 0.5;
      if (y < cy - 4.5) return edgeR ? M[1] : '#e0504a';
      if (y > cy - 0.5) return M[0];
      return edgeR ? M[0] : edgeL && y < cy - 2.75 ? '#e0504a' : M[1];
    });
    p.dot(ax - 0.75, cy - 4.75, '#ff8a70');
    p.dot(ax + 0.75, cy - 3.25, M[0]);
  } else {
    p.rect(ax - 1, cy - 5, 4, 1, M[1]); p.rect(ax, cy - 4, 2, 1, M[1]);
    p.px(ax, cy - 3, M[0]); p.px(ax + 1, cy - 3, M[1]);
    p.rect(ax, cy - 2, 2, 1, M[1]); p.rect(ax - 1, cy - 1, 4, 1, M[0]);
    p.px(ax - 1, cy - 5, '#e0504a');
  }
  // Borsten auf der Silhouette
  if (p.fine) {
    // fein: viele dünne Borsten rund um die Oberseite, nach hinten gekämmt, Spitze hell
    for (let i = 0; i < 13; i++) {
      const a = 2.75 + i * 0.25, l = i % 3 === 1 ? 1.5 : 1;
      const x = ax + Math.cos(a) * 7.7, y = ay + Math.sin(a) * 6.2;
      const ox = Math.cos(a) * 0.6 - 0.45, oy = Math.sin(a) * 0.75 - 0.2;
      p.fline(x, y, x + ox * l, y + oy * l, i % 2 ? S[2] : S[3]);
      p.dot(x + ox * l, y + oy * l, i % 3 === 1 ? S[4] : S[3]);
    }
    p.dot(ax - 8.25, cy - 1.5, S[2]); p.dot(ax - 8.25, cy - 1, S[1]); p.dot(ax - 8.25, cy - 0.5, S[0]);   // Spinnwarzen
  } else {
    for (const [bx, by, l] of [[-7, -5, 1], [-5, -8, 1], [-2, -9, 1], [2, -8.5, 1], [5, -6.5, 1], [-8, -1, 1]]) {
      p.line(ax + bx, cy + by, ax + bx - l, cy + by - 1, S[3]);
    }
  }
  p.px(ax + 7, cy - 1, S[1]); p.px(ax - 6, cy + 2, S[0]); // Spinnwarzen-Schatten
  // Taille
  p.rect(ax + 7, cy - 1, 2, 2, S[1]);
  if (p.fine) { p.dot(ax + 7.25, cy - 1, S[2]); p.dot(ax + 7.75, cy - 1, S[3]); p.dot(ax + 8.5, cy + 0.5, S[0]); }
  nearLegs(true);
  // Kopfbruststück
  const hy = cy + 0.5 - rear * 0.5;
  vol(p, hx, hy, 4.8, 3.6, RAMP, 0.04);
  if (p.fine) {
    // Handfein: Glanzkante, Glanzpunkt, Rückengrube mit Strahlenfurchen
    rimArc(p, hx, hy, 4.8, 3.6, 3.5, 4.5, GLINT, 0.82);
    p.dot(hx - 2, hy - 2.5, S[4]); p.dot(hx - 1.5, hy - 2.5, SHINE); p.dot(hx - 1, hy - 2.5, GLINT);
    p.fline(hx - 1.5, hy - 0.5, hx - 0.5, hy + 0.5, S[1]); p.dot(hx - 2, hy - 0.5, S[3]);
    p.fline(hx - 2, hy, hx - 3.5, hy + 0.5, S[1]); p.fline(hx - 1, hy + 0.5, hx - 1.5, hy + 2, S[1]);
    p.fline(hx - 1.5, hy - 1, hx - 3, hy - 2, S[2]);
  } else {
    p.px(hx - 2, hy - 3, S[4]); p.px(hx - 1, hy - 3, '#c8b4e4');
    p.px(hx - 1, hy, S[1]); p.px(hx, hy + 1, S[1]);          // Rückengrube
  }
  // Augenkranz: zwei Hauptaugen mit Lichtpunkt, vier kleine Nebenaugen
  const ey = cy - 1 - rear * 0.5;
  const ec = hurt ? '#ffffff' : E[0];
  if (p.fine) {
    // fein: gerundeter dunkler Kranz, Hauptaugen rund (3×3 Feinpixel) mit Glanzpunkt und dunklem Unterrand,
    // Nebenaugen als glimmende Punkte mit hellem Kern
    p.rect(hx + 1.5, ey - 2, 4, 3, VOID); p.rect(hx + 1, ey - 1.5, 5, 2, VOID);
    const eye = (x, y) => {
      p.rect(x, y, 1.5, 1.5, ec);
      p.dot(x + 1, y + 1, hurt ? '#ffffff' : '#a01818'); p.dot(x + 0.5, y + 1, hurt ? '#ffffff' : '#d02a20');
      p.dot(x + 0.5, y, hurt ? '#ffffff' : E[1]); p.dot(x, y, hurt ? '#ffffff' : '#ffe8d0');
    };
    eye(hx + 2.5, ey - 1.5); eye(hx + 4.5, ey - 1);
    for (const [x, y] of [[hx + 1.5, ey - 1], [hx + 2.5, ey - 2], [hx + 4.5, ey - 2], [hx + 5.5, ey + 0.5]]) {
      p.dot(x, y, M[1]); p.dot(x + 0.5, y, hurt ? '#ffffff' : '#ff6a50');
    }
  } else {
    p.rect(hx + 1, ey - 2, 5, 3, VOID);
    p.rect(hx + 3, ey - 1, 2, 2, ec); p.px(hx + 3, ey - 1, hurt ? '#ffffff' : E[1]);   // Hauptaugen
    p.px(hx + 1, ey - 1, M[1]); p.px(hx + 2, ey - 2, M[1]); p.px(hx + 4, ey - 2, M[1]); p.px(hx + 5, ey, M[1]); // Nebenaugen
  }
  // Kieferklauen mit gekrümmten Giftfängen
  const fx = hx + 4, fy = cy + 3 - rear * 0.5;
  if (p.fine) {
    // fein: zwei gewölbte Klauen mit Glanzpunkt, Fänge als gebogene Elfenbeinhaken (Licht links, dunkle Spitze)
    vol(p, fx - 0.25, fy, 1.4, 1.15, RAMP, 0.05);
    vol(p, fx + 1.25, fy, 0.8, 1.05, FAR, 0.05);
    p.fline(fx + 0.75, fy - 0.75, fx + 0.75, fy + 0.75, S[0]);
    p.dot(fx - 0.75, fy - 0.75, S[4]); p.dot(fx - 0.25, fy - 0.75, GLINT);
    const fang = (x, y, l) => {
      p.dot(x, y, PAL.bone[4]); p.dot(x + 0.5, y, PAL.bone[2]);
      p.dot(x, y + 0.5, FANG); p.dot(x + 0.5, y + 0.5, PAL.bone[2]);
      for (let k = 1; k <= l; k++) p.dot(x - (k > 1 ? 0.5 : 0), y + 0.5 + k * 0.5, k === l ? PAL.bone[1] : FANG);
    };
    fang(fx + 1 + fangs, fy + 1, 2 + fangs);
    fang(fx - 1 + fangs * 0.5, fy + 1 + fangs * 0.5, 2 + fangs);
    if (fangs) {
      const dx = fx + fangs + 0.5, dy = fy + 3.5 + fangs;   // Gifttropfen am Fang
      p.dot(dx, dy, VENOM[1]); p.dot(dx, dy + 0.5, VENOM[0]); p.dot(dx - 0.5, dy, VENOM[2]);
    }
  } else {
    p.rect(fx - 1, fy - 1, 2, 2, S[2]); p.px(fx - 1, fy - 1, S[3]);
    p.rect(fx + 1, fy - 1, 1, 2, S[1]);
    p.px(fx + 1 + fangs, fy + 1, FANG); p.px(fx + fangs, fy + 2 + fangs, PAL.bone[2]);
    p.px(fx - 1 + fangs, fy + 1 + fangs, FANG); p.px(fx - 1, fy + 2 + fangs, PAL.bone[2]);
    if (fangs) p.px(fx + fangs, fy + 3 + fangs, '#9ad03a');        // Gifttropfen
  }
  // Taster (Pedipalpen)
  if (p.fine) {
    const tx = hx + 6 + lunge * 0.3;
    seg(p, hx + 3.5, hy + 1, tx, hy + 2, 0.55, 0.45, RAMP, null);
    seg(p, tx, hy + 2, tx + 0.25, hy + 3.25, 0.45, 0.4, RAMP, null);
    p.dot(hx + 4.5, hy + 0.75, S[4]); p.dot(tx - 0.25, hy + 1.75, GLINT); p.dot(tx + 0.25, hy + 3.5, S[1]);
  } else {
    p.line(hx + 4, hy + 1, hx + 6 + lunge * 0.3, hy + 2, S[3]); p.px(hx + 6 + lunge * 0.3, hy + 3, S[2]);
  }
}

function drawDead(p, k) {
  const cy = 24;
  // eingerollte Beine (hinter dem Körper)
  for (let i = 0; i < 8; i++) {
    const bx = 15 + i * 1.6;
    const up = 4 + (i % 3) * 2 - k * 2;
    const tip = bx + (i % 2 ? 3 : -3);
    const jx = bx + (i % 2 ? 2 : -2), jy = cy - 2 - up;
    if (p.fine) {
      // fein: eingekrümmte Glieder mit Gelenkring und Borsten
      seg(p, bx, cy - 2, jx, jy, 0.7, 0.55, i % 2 ? RAMP : FAR, i % 2 ? S[4] : null);
      seg(p, jx, jy, tip, cy - 1 - up + 2, 0.5, 0.3, FAR, null);
      bristles(p, jx, jy, tip, cy + 1 - up, 0.35, S[0], 1);
      p.dot(jx, jy - 0.75, S[4]); p.dot(jx + 0.5, jy - 0.75, i % 2 ? GLINT : S[3]);
      continue;
    }
    p.line(bx, cy - 2, jx, jy, i % 2 ? S[3] : S[2]);
    p.line(jx, jy, tip, cy - 1 - up + 2, S[1]);
    p.px(jx, cy - 3 - up, S[4]);
  }
  // auf dem Rücken liegender Körper, Bauchseite matt
  vol(p, 18, cy, 7.5, 4, [S[0], S[1], S[2], S[3]]);
  flat(p, 18, cy - 1, 5, 1.6, S[1]);
  vol(p, 26, cy + 1, 4, 2.5, [S[0], S[1], S[2], S[3]]);
  p.rect(16, cy + 1, 3, 1, M[0]);
  p.px(29, cy + 1, FANG); p.px(29, cy + 2, PAL.bone[2]);
  p.px(28, cy, k > 0.5 ? S[0] : '#301010');
  if (p.fine) {
    // fein: Bauchschuppen als Querrillen, Glanzkante auf dem Panzer, Fang mit Lichtkante, erlöschendes Auge
    for (let x = 14.5; x <= 21; x += 1.5) p.fline(x, cy - 1.5, x + 0.5, cy + 0.5, S[0]);
    rimArc(p, 18, cy, 7.5, 4, 3.4, 4.4, S[3], 0.9);
    p.dot(15.5, cy + 1.5, M[1]); p.dot(16, cy + 1, '#e0504a');
    p.dot(29, cy + 1, PAL.bone[4]); p.dot(29.5, cy + 2.5, PAL.bone[1]);
    if (k <= 0.5) p.dot(28, cy, E[0]);
  }
}

export function createSpiderSprites() {
  const fine = { fine: true };
  const f = (o) => buildFrame(W, H, AX, AY, (p) => { drawSpider(p, o); grow(p); }, fine);
  return {
    idle: new Animation([0, 1, 2, 3].map((i) => f({ t: i * 0.06, bob: i === 2 ? 1 : 0, legAmp: 0.4, fangs: i === 3 ? 1 : 0 })), 6),
    walk: new Animation([0, 1, 2, 3, 4, 5].map((i) => f({ t: i / 6, bob: i % 2 })), 16),
    windup: new Animation([f({ rear: 2, fangs: 1 }), f({ rear: 4, fangs: 1 }), f({ rear: 5, fangs: 0, bob: 1 })], 10, false),
    strike: new Animation([f({ lunge: 3, fangs: 1, t: 0.2 }), f({ lunge: 2, fangs: 0, t: 0.4 })], 12, false),
    hurt: new Animation([f({ bob: 1, hurt: true, rear: 1 })], 1, false),
    death: new Animation([f({ rear: 3, hurt: true }), buildFrame(W, H, AX, AY, (p) => { drawDead(p, 0); grow(p); }, fine), buildFrame(W, H, AX, AY, (p) => { drawDead(p, 1); grow(p); }, fine)], 8, false),
  };
}
