import { PAL } from '../gfx/Palette.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { fineRes, pixelsToCanvas } from '../gfx/Fine.js';
import { TAU } from '../core/math.js';
import { buildFine, glowCanvas, fmap, band, stitch, fold, grain, tone as toneRaw, headFine, legsFine, armFine, torsoFine, skirtFine } from './npcFine.js';

// Feinlichter/-schatten (tone) werden in Schleifen oft gebraucht: zwischengespeichert
const TONES = new Map();
const tone = (c, k) => { const key = c + k; let v = TONES.get(key); if (v === undefined) TONES.set(key, v = toneRaw(c, k)); return v; };

// NPCs der Runde 3: Aschensteppe, Faulmarsch, Frostzinnen, Glutöde.
// Format wie createNpcSprites2(): Blickrichtung rechts, Anker = Fußpunkt,
// Leuchtendes zusätzlich auf frame.glow (SpriteFrame ohne Umriss, gleicher Anker).
const W = 40, H = 42, AX = 18, AY = 37;
const L = PAL.leather, St = PAL.steel, E = PAL.ember, G = PAL.gold, CR = PAL.crimson, BN = PAL.bone;
const SKIN = ['#4a2e28', '#7a5040', '#a8765a', '#c89878'];
const SKIN_TAN = ['#3e2418', '#6a3e28', '#94603e', '#b8845a'];
const SKIN_OLD = ['#4a3430', '#7a5a4c', '#a07e6a', '#bc9c86'];
const SKIN_PALE = ['#4e3a44', '#8a6a72', '#b8969a', '#d8bcb8'];
const SKIN_COLD = ['#4a3440', '#86606a', '#b88c8c', '#dcb4ac'];
const EYE = '#150c12';
const MOUTH = '#2a0e10';
// Steppe
const OCHRE = ['#2a1c10', '#4a321c', '#6e4c2a', '#96703c', '#bc9456'];
const BRZ = ['#3a2410', '#6a4418', '#9a6a28', '#c8963e', '#ecc66a'];
const RUST = ['#34120c', '#5a2016', '#84321e', '#a84a2a'];
const INDIGO = ['#10122a', '#1a1e40', '#28305a', '#3a4478'];
const FUR = ['#241a14', '#3e3024', '#5e4a36', '#7e6a50', '#a08c6c'];
const TEAL = ['#0e2224', '#16363a', '#1f4e52', '#2e6c6e'];
const WOOD = ['#241810', '#3a2818', '#543a22', '#70502e'];
const BLACKH = ['#120c0e', '#221818', '#34262a'];
const WHITEH = ['#6a6470', '#9a94a0', '#cac4cc', '#eeeaf0'];
// Moor
const MOSS = ['#10160f', '#182418', '#223420', '#2e4628', '#3e5a32'];
const MUD = ['#1a1610', '#2a2418', '#3c3422', '#50462e'];
const WADER = ['#12160e', '#1c2416', '#28341e', '#384828'];
const TOX = ['#1e4a14', '#3a8a22', '#6ad03a', '#aaff6a', '#e8ffc0'];
const BRASS = ['#3a2a10', '#6a4e1c', '#a07a30', '#d0aa50', '#f4e090'];
const GLASS = ['#1a2a2a', '#2a4442', '#46706a'];
const OLIVE = ['#1e1e10', '#2e2e18', '#424222', '#58582e'];
// Frost
const WFUR = ['#5a6270', '#8a94a2', '#b8c2cc', '#dfe6ec', '#f8fbff'];
const FROSTB = ['#0e1628', '#162440', '#20365a', '#2e4c7a'];
const GREYF = ['#1e1c1c', '#34302e', '#4e4842', '#6c645a', '#8e8474'];
const BLOND = ['#5a3e18', '#8a6428', '#b8903e', '#e0c070'];
const REDB = ['#3a140a', '#5e2410', '#84381a', '#a8522a'];
const PELTS = [['#3a2a1c', '#5a4430', '#7a6044'], ['#4a4644', '#6e6a66', '#949088'], ['#5a2e16', '#84461e', '#aa6430']];
// Glutöde
const ROBE = ['#1c1814', '#2c2620', '#3e362c', '#54493a', '#6a5e4a'];
const ASHC = ['#1a1a1e', '#26262c', '#36363e', '#484852'];
const PAPER = ['#8a8070', '#bcb09a', '#e0d6bc'];

// ------------------------------------------------------------ Bausteine
// Kopf im 3/4-Profil nach rechts. hx = linke Kante, hy = Oberkante (8 hoch).
function head(p, hx, hy, o) {
  const S = o.skin;
  if (p.fine) { headFine(p, hx, hy, { skin: S, talk: o.talk, brow: o.brow, noEye: o.noEye, eye: EYE, iris: o.iris, old: o.old, lash: o.lash }); return; }
  p.rect(hx + 1, hy + 1, 6, 6, S[2]);
  p.rect(hx + 2, hy + 7, 4, 1, S[1]);
  p.rect(hx + 5, hy + 2, 2, 1, S[3]);
  p.px(hx + 7, hy + 4, S[2]);
  p.px(hx + 7, hy + 5, S[1]);
  if (!o.noEye) p.px(hx + 5, hy + 4, EYE);
  p.px(hx + 4, hy + 3, o.brow ?? S[1]);
  p.px(hx + 5, hy + 3, o.brow ?? S[1]);
  p.px(hx + 6, hy + 6, o.talk ? MOUTH : S[1]);
  if (o.talk) p.px(hx + 5, hy + 6, MOUTH);
  p.px(hx + 3, hy + 4, S[1]); p.px(hx + 3, hy + 5, S[0]);
  p.px(hx + 6, hy + 5, S[3]);
  // Volumen: Wangenlicht, Kieferschatten, Lidschatten über dem Auge
  p.px(hx + 1, hy + 5, S[1]); p.px(hx + 1, hy + 6, S[1]); p.px(hx + 2, hy + 6, S[1]);
  p.px(hx + 6, hy + 3, S[3]); p.px(hx + 4, hy + 5, S[3]);
  if (!o.noEye) p.px(hx + 5, hy + 5, S[1]);
}

function legs(p, cx, fy, top, pants, boots, step = 0) {
  p.rect(cx - 3, top, 3, fy - top - 2, pants[0]);
  p.rect(cx - 3, fy - 3, 3, 3, boots[0]); p.px(cx, fy, boots[0]);
  p.rect(cx + 1 + step, top, 3, fy - top - 2, pants[1]); p.px(cx + 1 + step, top, pants[2]);
  p.rect(cx + 1 + step, fy - 3, 3, 3, boots[1]); p.rect(cx + 1 + step, fy - 3, 3, 1, boots[2]); p.px(cx + 4 + step, fy, boots[1]);
  if (p.fine) legsFine(p, cx, fy, top, pants, boots, step);
}

function arm(p, x0, y0, x1, y1, c0, c1, hand) {
  if (p.fine) { armFine(p, x0, y0, x1, y1, c0, c1, hand); return; }
  p.line(x0, y0, x1, y1, c0); p.line(x0 + 1, y0, x1 + 1, y1, c1);
  if (hand) { p.px(x1, y1 + 1, hand); p.px(x1 + 1, y1 + 1, hand); }
}

// Rumpfblock mit Licht links, Schatten rechts (R: Rampe, m: Mittelstufe)
function torso(p, x, y, w, h, R, m = 2) {
  p.rect(x, y, w, h, R[m]); p.rect(x, y, 2, h, R[m + 1]); p.rect(x + w - 1, y, 1, h, R[m - 1]);
  if (p.fine) torsoFine(p, x, y, w, h, R, m);
}

// Glockenförmiger Rock/Robe von y0 bis fy; hw0 → hw1 halbe Breite, sh = Saumschwung
function skirt(p, cx, y0, fy, hw0, hw1, R, sh = 0, fold = 3, ragged = false) {
  if (p.fine) { skirtFine(p, cx, y0, fy, hw0, hw1, R, sh, fold, ragged); return; }
  for (let y = y0; y <= fy; y++) {
    const k = (y - y0) / Math.max(1, fy - y0), hw = hw0 + k * (hw1 - hw0), s = Math.round(sh * k);
    for (let x = Math.round(cx - hw) + s; x <= Math.round(cx + 1 + hw) + s; x++) {
      const rel = (x - s - (cx - hw)) / (2 * hw + 1);
      let i = rel < 0.25 ? 3 : rel < 0.65 ? 2 : 1;
      if (y === fy) i = 0;
      if ((x - s) % fold === 0 && k > 0.3) i = Math.max(0, i - 1);
      if (ragged && y >= fy - 1 && ((x * 7 + y * 3) % 5 === 0)) continue;
      p.px(x, y, R[i]);
    }
  }
}

// ------------------------------------------------------------ Feinwerkzeuge (nur im feinen Durchgang)
// Fell/Haar in Strähnen: Rechteck mit welligen, senkrechten Strähnen; oben im Licht, unten im Schatten, Unterkante
// gezackt (Spitzen dunkel). F: Rampe dunkel → hell (≥ 3 Stufen), ph: Phase (Wind), lean: Neigung der Strähnen.
function fur(p, x, y, w, h, F, ph = 0, lean = 0, horiz = false) {
  const n = F.length;
  p.each(x, y, x + w, y + h + 0.5, (X, Y) => {
    const dx = X - x, dy = Y - y;
    if (dx < 0 || dx >= w || dy < 0 || dy >= h + 0.5) return null;
    // Strähne = Feinspalte, die langsam wandert (lange, zusammenhängende Striche statt Flecken)
    const u = horiz ? dy : dx, v = horiz ? dx : dy;
    const s = u * 2 + Math.sin(v * 1.1 + u * 0.7 + ph) * 0.7 - v * lean * 2;
    const f = ((Math.floor(s) % 3) + 3) % 3;
    if (dy >= h && (horiz || f !== 1)) return null;                     // Spitzen hängen über die Unterkante
    const k = dy / h;                                                   // Licht von oben
    let i = k < 0.4 ? n - 1 : k < 0.75 ? n - 2 : n - 3;
    if (f === 0) i -= 1; else if (f === 2 && k < 0.4) i += 1;
    if (dy >= h - 0.5) i = Math.min(i, n - 3);
    return F[Math.max(0, Math.min(n - 1, i))];
  });
}
// Metallkuppel (Helm, Schulterplatte): 5 Stufen nach Lichtrichtung oben links, Glanzlinie, Glanzpunkt.
// R: Rampe dunkel → hell (≥ 5), y-Bereich bis yMax (Unterkante gerade).
function dome(p, cx, cy, rx, ry, R, yMax = cy + ry, glint = '#ffffff') {
  const n = R.length;
  p.each(cx - rx, cy - ry, cx + rx, Math.min(yMax, cy + ry), (x, y) => {
    if (y > yMax) return null;
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) return null;
    const l = nx * 0.7 + ny * 0.7;
    if (Math.abs(d - 0.42) < 0.09 && nx < -0.1 && ny < -0.05) return R[n - 1];   // Glanzlinie
    const i = l < -0.62 ? n - 2 : l < -0.2 ? n - 3 : l < 0.3 ? n - 4 : n - 5;
    return R[Math.max(0, d > 0.8 && l > 0 ? i - 1 : i)];
  });
  p.dot(cx - rx * 0.45, cy - ry * 0.5, glint);
}
// Holzschaft senkrecht, 2 Weltpixel breit (wie die alten Doppellinien): Lichtkante, Glanz, Kern, Schatten, Maserstriche
function shaft(p, x, y0, y1, R, seed = 0) {
  const lit = tone(R[3], 0.18);
  p.rect(x, y0, 0.5, y1 - y0, R[3]); p.rect(x + 0.5, y0, 0.5, y1 - y0, lit);
  p.rect(x + 1, y0, 0.5, y1 - y0, R[2]); p.rect(x + 1.5, y0, 0.5, y1 - y0, R[1]);
  for (let y = y0 + 1 + (seed % 3) * 0.5; y < y1 - 1; y += 2.5) { p.dot(x + 1, y, R[1]); p.dot(x + 1, y + 0.5, R[1]); p.dot(x + 0.5, y + 1.5, R[2]); }
}
// Faust/Hand in Feinpixeln: 'w' = 2 Weltpixel breit (3 Zeilen), sonst 3 Weltpixel (4 Zeilen, wie Ilsa)
function fist(p, x, y, S, small = false) {
  fmap(p, x, y, small ? ['3321', '2211', '.11.'] : ['.3332.', '232221', '121111', '.2221.'], { 3: S[3], 2: S[2], 1: S[1] });
}
// Glas/Edelstein-Funkeln: weißer Feinpixel mit hellem Nachbarn
function sparkle(p, x, y, c = '#ffffff', c2) { p.dot(x, y, c); if (c2) p.dot(x + 0.5, y + 0.5, c2); }

// Stufe B: buildFine zeichnet grob (pass 0) und fein (pass 1, p.fine). Die Leuchtebene wird nur im letzten Durchgang
// beschrieben (bei fineRes() 1 gibt es nur den groben), fein auf glowCanvas.
const SINK = new Proxy({}, { get: () => () => {} });
const DRAW = new Set(['px', 'rect', 'line', 'ellipse', 'ellipseFine', 'dot', 'fline', 'each']);
function mkFrame(draw) {
  const res = fineRes(), gc = glowCanvas(W, H);
  let used = false;
  const g = new Proxy(gc, { get(t, k) { if (DRAW.has(k)) used = true; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const f = buildFine(W, H, AX, AY, (p, pass) => draw(p, res > 1 && pass === 0 ? SINK : g));
  // fein: Leinwand direkt aus dem Pixelpuffer (spart Leinwand-Kontext und getImageData je Frame)
  if (used) f.glow = res > 1 ? new SpriteFrame(pixelsToCanvas(gc.buf, gc.W, gc.H), AX * res, AY * res, res) : new SpriteFrame(gc.canvas, AX, AY);
  return f;
}

const phases = (n) => [...Array(n)].map((_, i) => i / n);
const breath = (t) => (Math.sin(t * TAU) > 0.2 ? 1 : 0);

// ============================================================ ASCHENSTEPPE
// ------------------------------------------------------------ Hauptfrau Varra
function drawVarra(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Rundschild auf dem Rücken
  const sx = cx - 6, sy = ty + 4;
  if (p.fine) {
    // Leder über Holz: Rand mit Lichtkante, eingeprägter Ring, Buckel aus Bronze mit Glanz, Nieten
    p.ellipseFine(sx + 0.5, sy + 0.5, 5.35, 6.4, (nx, ny, d) => {
      const l = nx * 0.6 + ny * 0.8;
      if (d > 0.74) return l < -0.45 ? OCHRE[2] : OCHRE[1];
      if (d > 0.56 && d < 0.64) return l < -0.3 ? OCHRE[4] : OCHRE[1];
      return l < -0.5 ? OCHRE[3] : l > 0.55 ? OCHRE[1] : OCHRE[2];
    });
    for (let a = 0; a < 8; a++) {
      const rx = sx + 0.5 + Math.cos(a * TAU / 8) * 4.4, ry = sy + 0.5 + Math.sin(a * TAU / 8) * 5.4;
      p.dot(rx, ry, BRZ[3]); p.dot(rx + 0.5, ry + 0.5, BRZ[1]);
    }
    p.fline(sx - 2, sy + 2.5, sx - 0.5, sy + 4, OCHRE[1]); p.dot(sx + 2.5, sy - 2.5, OCHRE[1]);   // Kerben
    dome(p, sx + 0.5, sy + 0.5, 1.9, 1.9, BRZ, sy + 2.5, '#fff4c8');
  } else {
    p.ellipse(sx, sy, 5, 6, OCHRE[1]); p.ellipse(sx, sy, 4, 5, OCHRE[2]);
    p.ellipse(sx - 1, sy - 1, 2, 3, OCHRE[3]);
    p.ellipse(sx, sy, 1.5, 1.5, BRZ[3]); p.px(sx - 1, sy - 1, BRZ[4]);
    for (let a = 0; a < 8; a++) p.px(Math.round(sx + Math.cos(a * TAU / 8) * 4), Math.round(sy + Math.sin(a * TAU / 8) * 5), BRZ[2]);
  }
  // Fellwickel + Stiefel
  legs(p, cx, fy, 29, OCHRE, ['#1a120c', '#2a1c12', '#443020']);
  if (p.fine) {
    fmap(p, cx + 1, 31, ['443443', '343234', '332232', '2.2.22'], { 4: FUR[4], 3: FUR[3], 2: FUR[2] });
    fmap(p, cx - 3, 31, ['221221', '121012', '110110'], { 2: FUR[2], 1: FUR[1], 0: FUR[0] });
    p.fline(cx + 1, 32.5, cx + 3.5, 31, L[1]); p.fline(cx - 3, 32.5, cx - 0.5, 31, L[0]);   // Schnürung
  } else { p.rect(cx + 1, 31, 3, 2, FUR[3]); p.px(cx + 1, 31, FUR[4]); p.rect(cx - 3, 31, 3, 2, FUR[1]); }
  // Lamellenpanzer (Leder mit Bronzeschuppen)
  torso(p, cx - 3, ty, 7, 10, OCHRE);
  if (p.fine) {
    // Schuppen: Reihen versetzt, jede mit Lichtkante oben und Schattenkante unten, rechts dunkler
    for (let r = 0; r < 4; r++) {
      const y = ty + 0.5 + r * 1.5;
      for (let x = cx - 3 + (r & 1); x < cx + 4; x += 2) {
        const k = x > cx + 1 ? 1 : 0;
        const w = Math.min(4, (cx + 4 - x) * 2);
        fmap(p, x, y, ['4332', '3221', '.11.'].map((s) => s.slice(0, w)), { 4: BRZ[4 - k], 3: BRZ[3 - k], 2: BRZ[2 - k], 1: BRZ[1 - k] });
      }
    }
  } else for (let y = ty + 1; y < ty + 6; y += 2) for (let x = cx - 2 + ((y >> 1) & 1); x < cx + 4; x += 2) p.px(x, y, y < ty + 3 ? BRZ[3] : BRZ[2]);
  p.rect(cx - 3, ty + 6, 7, 1, RUST[1]); p.px(cx + 1, ty + 6, BRZ[4]); // Gürtel
  if (p.fine) { p.rect(cx - 3, ty + 6, 7, 0.5, RUST[2]); fmap(p, cx + 0.5, ty + 6, ['432', '3.1'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] }); }
  // Schärpe/Rockschoß in Rostrot, weht leicht
  p.rect(cx - 3, ty + 7, 7, 4, RUST[2]); p.rect(cx - 3, ty + 7, 2, 4, RUST[3]); p.rect(cx + 3, ty + 7, 1, 4, RUST[1]);
  if (p.fine) {
    fold(p, cx, ty + 7.5, ty + 11, RUST[1], RUST[3]); fold(p, cx + 2.5, ty + 8, ty + 11, RUST[1], RUST[3]);
    p.rect(cx - 3, ty + 7, 7, 0.5, RUST[1]);
    const s0 = sw * 0.6, s1 = sw;
    fmap(p, cx - 4.5 - s0, ty + 8, ['.32', '321'], { 3: RUST[3], 2: RUST[2], 1: RUST[1] });
    fmap(p, cx - 5.5 - s1, ty + 9, ['.32', '321', '21.', '1..'], { 3: RUST[3], 2: RUST[2], 1: RUST[1] });
    for (let x = cx - 3; x <= cx + 3; x += 1) { p.dot(x + 0.25, ty + 11, RUST[(x & 1) ? 2 : 1]); if (x & 1) p.dot(x + 0.25, ty + 11.5, RUST[1]); }
  } else {
    p.px(cx - 4 - Math.round(sw * 0.6), ty + 8, RUST[2]); p.px(cx - 5 - Math.round(sw), ty + 9, RUST[1]); p.px(cx - 5 - Math.round(sw), ty + 10, RUST[2]);
    for (let x = cx - 3; x <= cx + 3; x += 2) p.px(x, ty + 11, RUST[1]);
  }
  // Fellkragen
  if (p.fine) fur(p, cx - 4, ty - 1, 9, 2.5, FUR, sw * 0.4);
  else { p.rect(cx - 4, ty - 1, 9, 3, FUR[3]); p.rect(cx - 4, ty - 1, 9, 1, FUR[4]); p.px(cx - 4, ty + 1, FUR[2]); p.px(cx + 4, ty + 1, FUR[2]); }
  // Kopf mit Bronzehelm (Nasal) + Federbusch
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_TAN, talk });
  if (p.fine) {
    // Kriegsbemalung: zwei feine Striche unter dem Auge, Haar in Strähnen, Zopf mit Band
    p.rect(hx + 4.5, hy + 5, 1.5, 0.5, '#c05a3a'); p.rect(hx + 5, hy + 5.5, 1, 0.5, '#8a3a26');
    fur(p, hx + 1, hy + 2, 2, 4.5, [BLACKH[0], BLACKH[1], BLACKH[2], tone(BLACKH[2], 0.2)], 0.5);
    fmap(p, hx - 1, hy + 6, ['..21', '.21.', '21..', 'r...'], { 2: BLACKH[2], 1: BLACKH[1], r: RUST[3] });
  } else {
    p.px(hx + 6, hy + 5, '#c05a3a'); p.px(hx + 4, hy + 5, '#c05a3a'); // Kriegsbemalung
    p.rect(hx + 1, hy + 2, 2, 5, BLACKH[1]); p.px(hx, hy + 6, BLACKH[1]); p.px(hx - 1, hy + 7, BLACKH[2]); // Haar/Zopf
  }
  if (p.fine) {
    dome(p, hx + 3.5, hy + 1.6, 3.6, 3.6, BRZ, hy + 1, '#fff4c8');
    p.rect(hx, hy + 1, 8, 1, BRZ[1]); p.rect(hx, hy + 1, 7.5, 0.5, BRZ[3]); p.rect(hx, hy + 1, 1, 0.5, BRZ[4]);
    for (let x = hx + 1; x < hx + 8; x += 2) p.dot(x, hy + 1.5, BRZ[4]);
    fmap(p, hx + 6, hy + 2, ['43', '32', '32', '21'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });   // Nasal
    fmap(p, hx + 3, hy - 4, ['32', '32', '21'], { 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });   // Federhalter
  } else {
    p.rect(hx, hy - 1, 7, 3, BRZ[2]); p.rect(hx + 1, hy - 2, 5, 1, BRZ[3]); p.rect(hx, hy - 1, 2, 3, BRZ[3]);
    p.px(hx + 2, hy - 2, BRZ[4]); p.px(hx + 1, hy - 1, BRZ[4]); p.rect(hx, hy + 1, 8, 1, BRZ[1]);
    p.px(hx + 6, hy + 2, BRZ[2]); p.px(hx + 6, hy + 3, BRZ[3]); // Nasal
    p.px(hx + 3, hy - 3, BRZ[3]); p.px(hx + 3, hy - 4, BRZ[2]); // Federhalter
  }
  // Federn (drei lange, schwingen nach hinten)
  const fs = [[0, BN[3], BN[4]], [1, RUST[3], '#d06a3a'], [2, BN[2], BN[3]]];
  for (const [i, c0, c1] of fs) {
    if (p.fine) {
      // Kiel als Feinlinie, Fahne darunter, Spitze hell, Fahnenrand gezackt
      for (let s = 0; s <= 6.01; s += 0.5) {
        const k = s / 6, x = hx + 3 - s - k * i * 0.6 - sw * k * 1.2, y = hy - 4 - i + k * (2 + i * 1.3) + Math.sin(k * 3) * -1.2;
        p.dot(x, y, s < 2.5 ? c1 : c0);
        p.dot(x, y + 0.5, s < 1 ? c1 : tone(c0, -0.22));
        if (s > 4.5) p.dot(x, y + 1, tone(c0, -0.4));
      }
    } else {
      for (let s = 0; s < 7; s++) {
        const k = s / 6, x = Math.round(hx + 3 - s - k * i * 0.6 - sw * k * 1.2), y = Math.round(hy - 4 - i + k * (2 + i * 1.3) + Math.sin(k * 3) * -1.2);
        p.px(x, y, s < 3 ? c1 : c0);
      }
    }
  }
  // hinterer Arm
  if (gest) {
    arm(p, cx - 1, ty + 1, cx + 6, ty + 1 - gest, OCHRE[1], OCHRE[2], null);
    if (p.fine) fmap(p, cx + 6, ty - gest, ['.332', '23321', '22211', '.11.'], { 3: SKIN_TAN[3], 2: SKIN_TAN[2], 1: SKIN_TAN[1] });
    else { p.rect(cx + 6, ty - gest, 2, 2, SKIN_TAN[2]); p.px(cx + 8, ty - gest, SKIN_TAN[3]); }
  } else arm(p, cx - 3, ty + 1, cx - 3, ty + 7, OCHRE[1], OCHRE[2], SKIN_TAN[1]);
  // Speer mit langer Bronzeklinge und Rosshaarquaste
  const spx = cx + 6;
  if (p.fine) {
    shaft(p, spx, 6 - b, fy, WOOD, 1);
    fmap(p, spx, -b, ['.w..', '.43.', '4431', '4531', '4532', '3531', '3521', '3521', '3421', '2321'], { w: '#fff4c8', 5: BRZ[4], 4: BRZ[3], 3: BRZ[2], 2: BRZ[1], 1: BRZ[0] });
    fmap(p, spx - 1, 5 - b, ['34443321', '12221110'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1], 0: BRZ[0] });
    // Rosshaar: Feinsträhnen, schwingen
    const hs = sw;
    p.fline(spx - 0.5, 6 - b, spx - 1 - hs * 0.5, 8 - b, '#3e2418'); p.fline(spx - 1, 6 - b, spx - 2 - hs, 8.5 - b, '#2a1810');
    p.fline(spx - 1, 6.5 - b, spx - 1.5 - hs * 0.8, 9 - b, '#4e3020'); p.dot(spx + 2, 6 - b, '#3e2418'); p.dot(spx + 2, 6.5 - b, '#2a1810');
  } else {
    p.line(spx, 6 - b, spx, fy, WOOD[3]); p.line(spx + 1, 6 - b, spx + 1, fy, WOOD[1]);
    p.rect(spx, 2 - b, 2, 4, BRZ[3]); p.px(spx, 1 - b, BRZ[4]); p.px(spx + 1, 1 - b, BRZ[2]); p.px(spx, 0 - b, BRZ[4]); p.px(spx + 1, 5 - b, BRZ[1]); p.px(spx, 3 - b, BRZ[4]);
    p.rect(spx - 1, 5 - b, 4, 1, BRZ[2]);
    p.px(spx - 1, 6 - b, '#2a1810'); p.px(spx - 1 - Math.round(sw * 0.5), 7 - b, '#3e2418'); p.px(spx - 2 - Math.round(sw), 8 - b, '#2a1810'); p.px(spx + 2, 6 - b, '#3e2418');
  }
  arm(p, cx + 3, ty + 1, spx - 1, ty + 5, OCHRE[3], OCHRE[2], null);
  if (p.fine) fist(p, spx - 1, ty + 5, SKIN_TAN);
  else p.rect(spx - 1, ty + 5, 3, 2, SKIN_TAN[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Stallmeisterin Orla
const LINEN = ['#3a3226', '#5a4e3a', '#7a6c52', '#9a8a6a'];
function drawOrla(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // kräftige Beine, hohe Reitstiefel
  p.rect(cx - 4, 30, 4, 5, OCHRE[1]); p.rect(cx + 1, 30, 4, 5, OCHRE[2]); p.px(cx + 1, 30, OCHRE[3]);
  p.rect(cx - 5, fy - 3, 5, 4, '#1a120c'); p.rect(cx + 1, fy - 4, 5, 5, L[1]); p.rect(cx + 1, fy - 4, 5, 1, L[3]); p.px(cx + 6, fy, L[1]);
  if (p.fine) {
    p.rect(cx + 1, 30, 0.5, 2, OCHRE[3]); p.rect(cx - 4, 30, 0.5, 2.5, OCHRE[2]); p.rect(cx + 4.5, 30, 0.5, 2, OCHRE[1]);
    // Reitstiefel: Stulpe mit Umschlag, Glanzkante, Naht, Sohle, Zehenlicht
    p.rect(cx + 1, fy - 4, 5, 0.5, tone(L[3], 0.2)); p.rect(cx + 1, fy - 3.5, 5, 0.5, L[2]);
    p.rect(cx + 1.5, fy - 3, 0.5, 3, L[2]); stitch(p, cx + 5, fy - 3, cx + 5, fy - 1, L[3]);
    p.rect(cx + 1, fy + 0.5, 6, 0.5, '#100a08'); p.dot(cx + 5.5, fy - 0.5, L[3]); p.dot(cx + 6, fy, L[2]);
    p.rect(cx - 5, fy - 3, 5, 0.5, '#2c1e16'); p.rect(cx - 5, fy + 0.5, 5, 0.5, '#0c0806');
  }
  // breiter Rumpf, hochgekrempelte Leinenärmel
  torso(p, cx - 5, ty, 11, 11, LINEN);
  // Lederschürze
  p.rect(cx - 2, ty + 3, 8, 12, L[2]); p.rect(cx - 2, ty + 3, 2, 12, L[3]); p.rect(cx + 5, ty + 3, 1, 12, L[1]);
  p.px(cx - 2, ty + 15, L[1]); p.px(cx + 5, ty + 15, L[0]);
  p.rect(cx, ty + 9, 4, 2, L[1]); p.px(cx, ty + 9, L[3]); // Tasche
  p.px(cx + 1, ty + 8, BRZ[3]); p.px(cx + 2, ty + 8, BRZ[2]); // Hufkratzer
  p.px(cx - 1, ty + 4, BRZ[3]); p.px(cx + 4, ty + 4, BRZ[3]); // Nieten
  if (p.fine) {
    // Schürze: Lederglanz, Randnaht als Punktlinie, Falte, Kratzer, Tasche mit Naht, Nieten mit Glanz
    p.rect(cx - 2, ty + 3.5, 0.5, 11, tone(L[3], 0.25));
    stitch(p, cx - 1, ty + 3.5, cx + 4.5, ty + 3.5, L[1]); stitch(p, cx + 4.5, ty + 4, cx + 4.5, ty + 14.5, L[1]);
    fold(p, cx + 2.5, ty + 11, ty + 15, L[1], L[3]);
    p.fline(cx + 3, ty + 5, cx + 3.5, ty + 6, L[3]); p.fline(cx - 0.5, ty + 12, cx + 0.5, ty + 13, L[1]);
    p.rect(cx, ty + 9, 4, 0.5, L[2]); stitch(p, cx + 0.5, ty + 9.5, cx + 3.5, ty + 9.5, L[3]); p.rect(cx, ty + 10.5, 4, 0.5, L[0]);
    fmap(p, cx + 1, ty + 7.5, ['..4', '.3.', '32.', '2..'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2] });
    for (const x of [cx - 1, cx + 4]) { p.dot(x, ty + 4, BRZ[4]); p.dot(x + 0.5, ty + 4.5, BRZ[1]); p.dot(x + 0.5, ty + 4, BRZ[2]); }
    p.dot(cx - 2, ty + 15, L[2]); p.dot(cx + 5.5, ty + 15, L[0]);
  }
  p.rect(cx - 5, ty + 6, 11, 1, L[0]); p.px(cx - 3, ty + 6, BRZ[3]);
  if (p.fine) { p.rect(cx - 5, ty + 6, 11, 0.5, L[1]); fmap(p, cx - 3.5, ty + 6, ['433', '3.1'], { 4: BRZ[4], 3: BRZ[3], 1: BRZ[1] }); }
  // Zaumzeug über der Schulter: Riemen, Trensenring, Kopfstück hängt hinten
  p.line(cx + 3, ty - 1, cx - 4, ty + 8, L[3]); p.line(cx + 4, ty - 1, cx - 3, ty + 8, L[1]);
  if (p.fine) { p.fline(cx + 3, ty - 1, cx - 4, ty + 8, tone(L[3], 0.3)); stitch(p, cx + 3.5, ty, cx - 2.5, ty + 7.5, L[2], 3); }
  const zx = cx - 6, zy = ty + 5 + (b ? 0 : 1);
  p.line(cx - 4, ty + 1, zx, zy, L[2]); p.line(zx, zy, zx + 1, zy + 6, L[3]); p.line(zx - 1, zy + 1, zx - 1, zy + 5, L[1]);
  if (p.fine) {
    // Trensenring: Ring mit Glanz oben links, Loch dunkel
    p.ellipseFine(zx + 0.5, zy + 7.5, 1.85, 1.9, (nx, ny, d) => (d < 0.3 ? null : nx + ny < -0.4 ? BRZ[4] : nx + ny < 0.4 ? BRZ[3] : BRZ[1]));
    p.dot(zx, zy + 6.5, '#fff4c8');
    p.dot(zx - 1, zy + 2, BRZ[3]); p.dot(zx + 0.5, zy + 3, BRZ[3]);   // Nieten am Kopfstück
  } else { p.ellipse(zx, zy + 7, 1.5, 1.5, BRZ[3]); p.px(zx, zy + 7, L[0]); p.px(zx - 1, zy + 6, BRZ[4]); }
  p.px(cx - 4, ty + 8, BRZ[3]); p.px(cx - 5, ty + 9, BRZ[4]); p.px(cx - 3, ty + 9, BRZ[2]);
  if (p.fine) fmap(p, cx - 5, ty + 8, ['..43..', '.4..3.', '43..21', '3....1'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });   // Trense
  // Kopf: breites Gesicht, dunkles Haar zum Knoten, Stirnband
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_TAN, talk });
  p.px(hx + 1, hy + 7, SKIN_TAN[2]); p.px(hx + 6, hy + 7, SKIN_TAN[1]);
  if (p.fine) {
    // Haar in Strähnen nach hinten gekämmt, Stirnband mit Knotenfalte, Knoten gewickelt, Bandende weht
    fmap(p, hx + 1, hy, ['.22212211...', '211211211121'], { 2: BLACKH[2], 1: BLACKH[1] });
    fmap(p, hx + 1, hy + 2, ['2111', '1211', '1121', '0121', '0111', '.01.', '..0.'], { 2: BLACKH[2], 1: BLACKH[1], 0: BLACKH[0] });
    p.rect(hx + 1, hy + 1, 6, 1, RUST[2]); p.rect(hx + 1, hy + 1, 6, 0.5, RUST[3]); p.dot(hx + 3, hy + 1.5, RUST[1]); p.dot(hx + 5, hy + 1.5, RUST[1]);
    fmap(p, hx, hy + 1, ['32', '21'], { 3: '#c86a40', 2: RUST[3], 1: RUST[1] });
    fmap(p, hx - 2, hy - 1, ['.221.', '22112', '21121', '12111', '.111.'], { 2: BLACKH[2], 1: BLACKH[1] });
    p.fline(hx - 2, hy, hx - 0.5, hy + 0.5, BLACKH[0]);
    const be = Math.round(sw * 0.5);
    fmap(p, hx - 3, hy + 1.5 + be * 0.5, ['.3', '32', '2.', '1.'], { 3: RUST[3], 2: RUST[2], 1: RUST[1] });
  } else {
    p.rect(hx + 1, hy, 6, 2, BLACKH[1]); p.rect(hx + 1, hy + 2, 2, 4, BLACKH[1]); p.px(hx + 3, hy, BLACKH[2]);
    p.rect(hx + 1, hy + 1, 6, 1, RUST[2]); p.px(hx, hy + 1, RUST[3]); // Stirnband
    p.rect(hx - 2, hy - 1, 3, 3, BLACKH[1]); p.px(hx - 2, hy - 1, BLACKH[2]); p.px(hx - 3, hy + 2 + Math.round(sw * 0.5), RUST[2]); // Knoten + Bandende
  }
  // hinterer Arm (nackter Unterarm, Faust in die Hüfte)
  p.rect(cx - 6, ty + 1, 2, 3, LINEN[2]);
  p.line(cx - 6, ty + 4, cx - 5, ty + 7, SKIN_TAN[1]); p.line(cx - 5, ty + 4, cx - 4, ty + 7, SKIN_TAN[2]);
  if (p.fine) {
    p.rect(cx - 6, ty + 1, 0.5, 3, LINEN[3]); p.rect(cx - 6, ty + 3.5, 2, 0.5, LINEN[1]); p.rect(cx - 6, ty + 3, 2, 0.5, LINEN[3]);   // Ärmelumschlag
    p.fline(cx - 5.5, ty + 4.5, cx - 4.5, ty + 6.5, SKIN_TAN[3]);
  }
  // vorderer Arm mit Peitsche
  const hxp = cx + 7, hyp = ty + 6 - (gest ? 4 + gest : 0);
  p.rect(cx + 4, ty, 3, 3, LINEN[3]); p.px(cx + 6, ty + 2, LINEN[2]);
  if (p.fine) { p.rect(cx + 4, ty + 2, 3, 0.5, LINEN[2]); p.rect(cx + 4, ty + 2.5, 2.5, 0.5, LINEN[1]); p.dot(cx + 4.5, ty + 0.5, tone(LINEN[3], 0.3)); }
  arm(p, cx + 5, ty + 3, hxp - 1, hyp - 1, SKIN_TAN[2], SKIN_TAN[1], null);
  if (p.fine) fist(p, hxp - 1, hyp - 1.5, SKIN_TAN);
  else { p.rect(hxp - 1, hyp - 1, 3, 2, SKIN_TAN[2]); p.px(hxp, hyp - 1, SKIN_TAN[3]); }
  // Peitschengriff + Schnur
  if (gest) { p.line(hxp, hyp - 1, hxp + 2, hyp - 4, L[1]); p.px(hxp + 2, hyp - 5, BRZ[3]); }
  else { p.line(hxp + 1, hyp, hxp + 3, hyp + 2, L[1]); p.px(hxp, hyp - 2, BRZ[3]); }
  if (p.fine) {
    if (gest) { p.fline(hxp - 0.5, hyp - 1.5, hxp + 1.5, hyp - 4.5, L[3]); p.dot(hxp + 2, hyp - 5, BRZ[4]); }
    else { p.fline(hxp + 1, hyp - 0.5, hxp + 3, hyp + 1.5, L[3]); p.dot(hxp, hyp - 2, BRZ[4]); }
  }
  if (gest) {
    // Schnur schwingt im Bogen nach oben/hinten (fein: wird zur Spitze dünner)
    let px0 = hxp + 2, py0 = hyp - 5;
    for (let s = 1; s <= 12; s++) {
      const k = s / 12, x = Math.round(hxp + 2 + Math.sin(k * 2.6 + gest) * (4 + k * 5) - k * 6), y = Math.round(hyp - 5 - k * 6 + Math.cos(k * 3) * 2);
      if (p.fine) { p.fline(px0, py0, x, y, s < 6 ? L[2] : L[3], s < 5 ? 0.5 : 0); if (s < 7) p.fline(px0, py0 - 0.5, x, y - 0.5, L[3]); }
      else p.line(px0, py0, x, y, s < 6 ? L[2] : L[3]);
      px0 = x; py0 = y;
    }
  } else {
    // aufgerollte Schnur hängt vom Griff, Ende pendelt
    const rx = hxp + 3, ry = hyp + 2;
    const ex = rx + 1 + Math.round(sw * 1.2);
    if (p.fine) {
      // zwei Windungen: Ringe mit Licht oben links, Schatten unten rechts
      p.ellipseFine(rx + 0.5, ry + 2.5, 2.85, 3.4, (nx, ny, d) => {
        if (d < 0.4) return d < 0.18 ? L[1] : L[2];
        const l = nx * 0.6 + ny * 0.8;
        if (Math.abs(d - 0.7) < 0.08) return L[1];
        return l < -0.3 ? L[3] : l < 0.4 ? L[2] : L[1];
      });
      p.dot(rx - 1, ry + 1, tone(L[3], 0.3));
      p.fline(rx + 1, ry + 5, ex, ry + 9, L[2]); p.fline(rx + 1.5, ry + 5, ex + 0.5, ry + 9, L[1]); p.dot(ex, ry + 10, L[1]);
    } else {
      p.ellipse(rx, ry + 2, 2.5, 3, L[3]); p.ellipse(rx, ry + 2, 1.5, 2, 'rgba(0,0,0,0)');
      p.px(rx, ry + 2, L[1]); p.px(rx - 1, ry + 1, L[1]); p.px(rx + 1, ry + 3, L[1]); p.px(rx, ry, L[1]); p.px(rx - 2, ry + 3, L[2]); p.px(rx + 2, ry + 1, L[2]);
      p.line(rx + 1, ry + 5, ex, ry + 9, L[2]); p.px(ex, ry + 10, L[1]);
    }
  }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: hxp - AX, dy: hyp - 1 - AY } };
}

// ------------------------------------------------------------ Nomade Kesh
function drawKesh(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // langer Umhang (Indigo) hinten
  if (p.fine) {
    // Kante glatt, Lichtsaum links, zwei Falten laufen auseinander, Saum dunkel
    const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 4 - (2 + k * 3 + sw * k); };
    const FK = [0.35, ty + 3, 0.75, ty + 6];   // Falten (Anteil, Startzeile)
    p.each(cx - 12, ty, cx - 0.01, fy - 0.01, (x, y) => {
      const xl = left(y);
      if (x < xl - 0.25) return null;
      if (y > fy - 1.5) return INDIGO[1];
      let i = x < xl + 0.75 ? 3 : 2;
      for (let q = 0; q < 4; q += 2) {
        const f = FK[q], y0 = FK[q + 1];
        if (y < y0) continue;
        const xf = xl + (cx - 1 - xl) * f;
        if (Math.abs(x - xf) < 0.26) i = 1;
        else if (x < xf && x > xf - 0.76) i = 3;
      }
      return INDIGO[i];
    });
  } else for (let y = ty; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(2 + k * 3 + sw * k);
    for (let x = cx - 4 - back; x <= cx - 1; x++) p.px(x, y, INDIGO[x < cx - 3 - back ? 3 : 2]);
  }
  // Robe (staubiges Ocker), Saum mit Borte
  skirt(p, cx, ty + 4, fy, 3.5, 5.5, OCHRE, sw * 0.6, 3);
  if (p.fine) {
    // Borte: Rautenmuster in Rost mit Bronzefaden
    const s = sw * 0.6;
    for (let x = cx - 5; x <= cx + 6.5; x += 1) {
      fmap(p, x + s, fy - 1.5, ['.3', '32', '2.'], { 3: RUST[3], 2: RUST[2] });
    }
    p.rect(cx - 5 + s, fy - 1.5, 12, 0.5, RUST[1]);
  } else for (let x = cx - 5; x <= cx + 6; x++) if (x % 2 === 0) p.px(x + Math.round(sw * 0.6), fy - 1, RUST[2]);
  p.px(cx + 4, fy, L[1]); p.px(cx + 5, fy, L[0]); // Sandalen
  if (p.fine) { p.dot(cx + 4, fy, L[3]); p.dot(cx + 5.5, fy + 0.5, SKIN_OLD[1]); }
  // Oberkörper gebeugt
  torso(p, cx - 4, ty, 8, 6, OCHRE);
  p.line(cx - 3, ty, cx + 2, ty + 5, INDIGO[3]); p.line(cx - 2, ty, cx + 3, ty + 5, INDIGO[2]); // Schärpe
  p.rect(cx - 4, ty + 5, 9, 1, RUST[1]); p.px(cx - 2, ty + 5, BRZ[3]);
  if (p.fine) {
    p.fline(cx - 3, ty, cx + 2, ty + 5, tone(INDIGO[3], 0.25)); p.fline(cx - 1.5, ty, cx + 3.5, ty + 5, INDIGO[1]);
    p.rect(cx - 4, ty + 5, 9, 0.5, RUST[2]); fmap(p, cx - 2.5, ty + 5, ['43', '21'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });
  }
  // Amulette/Beutel
  p.px(cx - 3, ty + 6, L[3]); p.rect(cx - 4, ty + 7, 2, 2, L[2]);
  if (p.fine) fmap(p, cx - 4, ty + 6, ['..3.', '.33.', '3332', '2321', '2221', '.11.'], { 3: L[3], 2: L[2], 1: L[1] });
  // Kopf mit Turban und langem Bart
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk, brow: WHITEH[2], old: true });
  if (p.fine) {
    // Bart in welligen Strähnen, spitz zulaufend; Schnurrbart über dem Mund, Mund sichtbar
    p.each(hx + 2.5, hy + 5.5, hx + 8.5, hy + 12.5, (x, y) => {
      const rx = x - hx, ry = y - hy;
      if (ry < 6) return null;
      const half = ry < 8.5 ? 2.5 : 2.5 - (ry - 8.5) * 0.62;
      if (Math.abs(rx - 5.5) > half) return null;
      const s = ((Math.floor((rx + Math.sin(ry * 1.6) * 0.45) * 2) % 3) + 3) % 3;
      if (s === 0) return WHITEH[1];
      if (s === 2) return ry < 8.5 || rx < 5 ? WHITEH[3] : WHITEH[2];
      return WHITEH[2];
    });
    fmap(p, hx + 4.5, hy + 5.5, ['.2333.', '233332', '1....1'], { 3: WHITEH[3], 2: WHITEH[2], 1: WHITEH[1] });
    if (talk) fmap(p, hx + 5.5, hy + 6.5, ['mmm', '.m.'], { m: MOUTH }); else p.rect(hx + 5.5, hy + 6.5, 1.5, 0.5, SKIN_OLD[0]);
    fur(p, hx + 1, hy + 2, 2, 2.5, WHITEH, 0.3);
  } else {
    p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.px(hx + 6, hy + 3, SKIN_OLD[1]);
    p.rect(hx + 3, hy + 6, 5, 3, WHITEH[2]); p.rect(hx + 4, hy + 9, 3, 2, WHITEH[1]); p.px(hx + 5, hy + 11, WHITEH[1]);
    p.px(hx + 6, hy + 6, WHITEH[3]); p.px(hx + 4, hy + 8, WHITEH[3]); p.px(hx + 5, hy + 10, WHITEH[2]);
    p.px(hx + 6, hy + 7, talk ? MOUTH : WHITEH[1]);
    p.rect(hx + 1, hy + 2, 2, 3, WHITEH[1]);
  }
  // Turban: gewickelt, Tuchende hinten
  if (p.fine) {
    // gerundet, Wicklungen schräg (Tal dunkel, Grat hell), Lichtseite links, Ockerband mit Glanz, Edelstein
    p.each(hx, hy - 3, hx + 8, hy + 2, (x, y) => {
      const u = x - hx, v = y - (hy - 3);
      if (u < 0 || u >= 8 || v < 0 || v >= 5) return null;
      if (v < 1 && (u < 1 || u >= 7)) return null;
      if (v < 0.5 && (u < 1.5 || u >= 6.5)) return null;
      const w = (v + u * 0.32) % 1.5;
      let i = u < 2 ? 3 : u > 6.5 ? 1 : 2;
      if (w < 0.5) i = Math.max(0, i - 1); else if (w < 1) i = Math.min(3, i + (u < 5 ? 1 : 0));
      return INDIGO[i];
    });
    p.line(hx, hy, hx + 7, hy - 2, OCHRE[4]); p.line(hx, hy + 1, hx + 7, hy - 1, OCHRE[3]);
    p.fline(hx + 0.5, hy - 0.5, hx + 6.5, hy - 2.5, tone(OCHRE[4], 0.3));
    p.fline(hx + 0.5, hy + 1.5, hx + 7, hy - 0.5, OCHRE[2]);
    fmap(p, hx + 3.5, hy - 3.5, ['.4.', '434', '.2.'], { 4: '#ffe6a0', 3: BRZ[4], 2: BRZ[2] });
    p.dot(hx + 7.5, hy + 1, INDIGO[1]);
    const s0 = sw * 0.6, s1 = sw;
    fmap(p, hx - 1, hy + 1, ['3322', '3221', '3221', '2211', '2211', '.11.'], { 3: INDIGO[3], 2: INDIGO[2], 1: INDIGO[1] });
    fmap(p, hx - 2 - s0, hy + 4, ['332', '221'], { 3: INDIGO[3], 2: INDIGO[2], 1: INDIGO[1] });
    fmap(p, hx - 2 - s1, hy + 5, ['32.', '21.', '1..'], { 3: INDIGO[3], 2: INDIGO[2], 1: INDIGO[1] });
    fmap(p, hx - 3 - s1, hy + 6, ['.2', '21', '1.'], { 2: INDIGO[2], 1: INDIGO[1] });
  } else {
    p.rect(hx, hy - 2, 8, 4, INDIGO[2]); p.rect(hx + 1, hy - 3, 6, 1, INDIGO[3]); p.rect(hx, hy - 2, 2, 4, INDIGO[3]);
    p.line(hx, hy, hx + 7, hy - 2, OCHRE[4]); p.line(hx, hy + 1, hx + 7, hy - 1, OCHRE[3]);
    p.px(hx + 7, hy + 1, INDIGO[1]); p.px(hx + 4, hy - 3, BRZ[4]);
    p.rect(hx - 1, hy + 1, 2, 3, INDIGO[2]); p.px(hx - 2 - Math.round(sw * 0.6), hy + 4, INDIGO[3]); p.px(hx - 2 - Math.round(sw), hy + 5, INDIGO[2]); p.px(hx - 3 - Math.round(sw), hy + 6, INDIGO[1]);
  }
  // Stab mit Krücke und Glöckchen
  const stx = cx + 8 + (gest ? 1 : 0), top = 8 - b - (gest ? 2 : 0);
  if (p.fine) {
    shaft(p, stx, top + 2, fy, WOOD, 2);
    fmap(p, stx - 3, top, ['..3332..', '.332221.', '32...12.', '21....1.', '21......', '1.......'], { 3: WOOD[3], 2: WOOD[2], 1: WOOD[1] });
  } else {
    p.line(stx, top + 2, stx, fy, WOOD[3]); p.line(stx + 1, top + 2, stx + 1, fy, WOOD[1]);
    p.px(stx, top + 1, WOOD[3]); p.px(stx - 1, top, WOOD[3]); p.px(stx - 2, top, WOOD[2]); p.px(stx - 3, top + 1, WOOD[2]); p.px(stx - 3, top + 2, WOOD[1]);
    p.px(stx + 1, top + 1, WOOD[2]);
  }
  // Glöckchen schwingen (Pendel)
  const ring = talk || gest ? 1.6 : 0.8;
  const bells = [[stx - 3, top + 3, 3, 0], [stx - 1, top + 2, 5, 1.3], [stx + 2, top + 3, 4, 2.6]];
  for (const [bx0, by0, len, ph] of bells) {
    const a = Math.sin(t * TAU * 2 + ph) * 0.35 * ring;
    const bx = Math.round(bx0 + Math.sin(a) * len), by = Math.round(by0 + Math.cos(a) * len);
    if (p.fine) {
      p.fline(bx0 + 0.25, by0 + 0.25, bx + 0.25, by - 0.75, '#8a7a60');
      fmap(p, bx - 1, by - 0.5, ['..43..', '.4321.', '.4321.', '443221', '.2..1.'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });
      p.dot(bx - 0.5, by, '#fff4c8');
      if (ring > 1) { g.dot(bx - 0.5, by, '#fff0b0'); g.dot(bx, by + 0.5, '#a08040'); }
    } else {
      p.line(bx0, by0, bx, by - 1, '#8a7a60');
      p.rect(bx - 1, by, 3, 2, BRZ[2]); p.px(bx - 1, by, BRZ[4]); p.px(bx, by - 1, BRZ[3]); p.px(bx, by + 2, BRZ[1]);
      if (ring > 1) g.px(bx - 1, by, '#fff0b0');
    }
  }
  // Bänder am Stab
  p.px(stx + 2, top + 6, RUST[3]); p.px(stx + 3, top + 7 + Math.round(sw * 0.5), RUST[2]);
  if (p.fine) { p.rect(stx, top + 5.5, 2, 0.5, RUST[3]); p.dot(stx + 2.5, top + 6.5, RUST[1]); p.dot(stx + 3.5, top + 8 + Math.round(sw * 0.5), RUST[1]); }
  arm(p, cx + 1, ty + 1, stx - 2, ty + 4, OCHRE[3], OCHRE[2], null);
  if (p.fine) fist(p, stx - 1, ty + 3, SKIN_OLD);
  else { p.rect(stx - 1, ty + 3, 3, 2, SKIN_OLD[2]); p.px(stx - 1, ty + 3, SKIN_OLD[3]); }
  // hinterer Arm: hält Robe / Geste mit offener Hand
  if (gest) {
    arm(p, cx - 2, ty + 1, cx + 3, ty - 1 - gest, OCHRE[2], OCHRE[3], null);
    if (p.fine) fmap(p, cx + 3.5, ty - 2.5 - gest, ['.3.', '332', '322', '21.'], { 3: SKIN_OLD[3], 2: SKIN_OLD[2], 1: SKIN_OLD[1] });
    else { p.px(cx + 4, ty - 1 - gest, SKIN_OLD[3]); p.px(cx + 4, ty - 2 - gest, SKIN_OLD[2]); }
  } else arm(p, cx - 3, ty + 1, cx - 1, ty + 7, OCHRE[2], OCHRE[1], SKIN_OLD[1]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Händlerin Imra
function drawImra(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 21, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Kraxe: Holzgestell hinter dem Körper
  const kx = cx - 14, ky = ty - 12 + (b ? 0 : 1);
  p.rect(kx, ky, 2, 30, WOOD[3]); p.rect(kx + 10, ky + 2, 2, 28, WOOD[1]); p.px(kx, ky, WOOD[2]);
  if (p.fine) { shaft(p, kx, ky + 0.5, ky + 30, WOOD, 0); p.rect(kx + 10, ky + 2, 0.5, 28, WOOD[2]); grain(p, kx + 10.5, ky + 2, 1.5, 28, WOOD[0], null, 3); }
  for (const yy of [ky + 10, ky + 20, ky + 27]) {
    p.rect(kx, yy, 12, 1, WOOD[2]); p.px(kx + 1, yy, WOOD[3]);
    if (p.fine) { p.rect(kx, yy, 12, 0.5, WOOD[3]); p.rect(kx + 2, yy + 0.5, 8, 0.5, WOOD[1]); p.dot(kx + 0.5, yy + 0.5, St[3]); p.dot(kx + 10.5, yy + 0.5, St[2]); }
  }
  // aufgeschnürte Waren
  p.rect(kx - 1, ky + 1, 13, 5, TEAL[2]); p.rect(kx - 1, ky + 1, 13, 1, TEAL[3]); p.rect(kx - 1, ky + 5, 13, 1, TEAL[1]); // Teppichrolle
  if (p.fine) {
    // Teppich: Webmuster (Zickzack in Bronze und Rost), Rolle mit Spiralende
    for (let x = kx; x < kx + 12; x += 1.5) {
      fmap(p, x, ky + 2.5, ['2..', '.2.', '..2'].map((r, i) => (Math.round(x * 2) % 2 ? r : r.split('').reverse().join(''))), { 2: BRZ[3] });
      p.dot(x + 0.5, ky + 4, RUST[3]);
    }
    p.rect(kx - 1, ky + 1.5, 13, 0.5, TEAL[2]); p.rect(kx - 1, ky + 4.5, 13, 0.5, TEAL[1]);
    p.ellipseFine(kx - 0.5, ky + 3.5, 1.4, 2.4, (nx, ny, d) => (d < 0.25 ? RUST[3] : Math.abs(d - 0.6) < 0.14 ? TEAL[1] : nx + ny < 0 ? TEAL[3] : TEAL[2]));
    p.fline(kx + 2, ky + 1, kx + 2, ky + 5.5, L[1]); p.fline(kx + 8, ky + 1, kx + 8, ky + 5.5, L[1]);   // Schnüre
  } else {
    for (let x = kx; x < kx + 12; x += 3) p.px(x, ky + 3, BRZ[3]);
    p.ellipse(kx - 1, ky + 3, 1, 2, TEAL[3]); p.px(kx - 1, ky + 3, RUST[3]);
  }
  p.rect(kx + 1, ky + 6, 5, 4, '#7a4228'); p.rect(kx + 2, ky + 5, 3, 1, '#9a5a34'); p.px(kx + 1, ky + 6, '#9a5a34'); p.rect(kx + 1, ky + 8, 5, 1, '#4e2818'); // Tonkrug
  p.rect(kx + 6, ky + 6, 5, 4, RUST[2]); p.rect(kx + 6, ky + 6, 5, 1, RUST[3]); p.px(kx + 8, ky + 7, BRZ[3]); // Stoffballen
  if (p.fine) {
    fmap(p, kx + 1, ky + 5, [
      '..cbbbc...',
      '.c2baa2c..',
      'c2233222..',
      'b2233221..',
      'b2222211..',
      '0000000000',
      '.2222111..',
      '..21111...',
    ], { c: '#b87040', b: '#9a5a34', a: '#4e2818', 3: '#a86a44', 2: '#7a4228', 1: '#5e3220', 0: '#4e2818' });
    p.dot(kx + 1.5, ky + 6.5, '#e0a070');
    fold(p, kx + 8.5, ky + 7, ky + 10, RUST[1], RUST[3]); p.rect(kx + 6, ky + 8, 5, 0.5, RUST[1]);
    p.dot(kx + 8, ky + 7, BRZ[4]);
  }
  p.rect(kx + 1, ky + 11, 9, 8, '#6a5a3a'); p.rect(kx + 1, ky + 11, 3, 8, '#86744c'); p.rect(kx + 9, ky + 11, 1, 8, '#4a3e28'); // Sack
  p.rect(kx + 3, ky + 13, 5, 1, '#4a3e28'); p.px(kx + 5, ky + 12, '#a8966a');
  if (p.fine) {
    // Sack: Bindung mit Zipfel, Falten, Flicken mit Naht
    fmap(p, kx + 4, ky + 11, ['.ab.a', 'abba.', 'cccc.', '.cc..'], { a: '#a8966a', b: '#86744c', c: '#4a3e28' });
    fold(p, kx + 3, ky + 14, ky + 19, '#4a3e28', '#86744c'); fold(p, kx + 7, ky + 14.5, ky + 19, '#4a3e28', '#86744c');
    p.rect(kx + 5, ky + 15.5, 2, 2, '#5a6a4a'); stitch(p, kx + 5, ky + 15.5, kx + 6.5, ky + 15.5, '#a8966a'); stitch(p, kx + 5, ky + 17, kx + 6.5, ky + 17, '#3a4a30');
    p.rect(kx + 1, ky + 11, 0.5, 8, '#a8966a');
  }
  // hängende Waren: Messinglampe, Kupferkessel, Fellbündel
  const lx = kx - 2 + Math.round(sw * 0.8), ly = ky + 13;
  p.line(kx, ky + 10, lx, ly, '#6a5a40'); p.rect(lx - 1, ly + 1, 3, 3, BRASS[2]); p.px(lx - 1, ly + 1, BRASS[4]); p.px(lx + 1, ly + 3, BRASS[1]); p.px(lx, ly + 4, BRASS[1]);
  if (p.fine) {
    p.fline(kx + 0.25, ky + 10.25, lx + 0.25, ly + 0.25, '#6a5a40');
    fmap(p, lx - 1, ly + 1, ['.43..', '44332', '43321', '33221', '.221.', '..1..'], { 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1] });
    p.dot(lx - 0.5, ly + 1.5, '#ffffff');
  }
  p.ellipse(kx + 5, ky + 22, 3, 2, '#8a4a2a'); p.rect(kx + 3, ky + 21, 5, 1, '#b8683a'); p.px(kx + 3, ky + 22, '#c8784a'); // Kessel
  if (p.fine) {
    p.ellipseFine(kx + 5.5, ky + 22.5, 3.35, 2.4, (nx, ny, d) => {
      const l = nx * 0.7 + ny * 0.7;
      if (Math.abs(d - 0.45) < 0.08 && nx < 0 && ny < 0.3) return '#f0a070';
      return l < -0.4 ? '#c8784a' : l < 0.2 ? '#a85a34' : l < 0.6 ? '#8a4a2a' : '#5e2e1a';
    });
    p.rect(kx + 3, ky + 21, 5, 0.5, '#e0905a'); p.rect(kx + 3, ky + 21.5, 5, 0.5, '#8a4a2a'); p.dot(kx + 3.5, ky + 22.5, '#ffffff');
  }
  p.rect(kx + 1, ky + 24, 3, 3, FUR[3]); p.px(kx + 1, ky + 24, FUR[4]); p.px(kx + 2, ky + 27, FUR[2]);
  if (p.fine) { fur(p, kx + 1, ky + 24, 3, 3, FUR, sw); p.rect(kx + 1, ky + 25, 3, 0.5, L[1]); }
  // Beine unter Rock
  skirt(p, cx, ty + 7, fy - 1, 3.5, 5, RUST, sw * 0.5, 3);
  p.rect(cx - 3, fy - 1, 3, 2, L[0]); p.rect(cx + 1, fy - 1, 4, 2, L[1]); p.px(cx + 1, fy - 1, L[3]);
  if (p.fine) { p.rect(cx + 1, fy - 1, 4, 0.5, L[2]); p.dot(cx + 1, fy - 1, L[3]); p.dot(cx + 4, fy - 0.5, L[3]); p.rect(cx + 1, fy + 0.5, 4, 0.5, '#0e0806'); p.rect(cx - 3, fy - 1, 3, 0.5, L[1]); }
  // Mieder/Weste
  torso(p, cx - 3, ty, 7, 8, OCHRE);
  p.rect(cx - 1, ty + 1, 3, 5, TEAL[2]); p.px(cx, ty + 2, BRZ[4]); p.px(cx, ty + 4, BRZ[3]);
  if (p.fine) {
    // Miedereinsatz mit Schnürung (Kreuze), Ösen in Bronze
    p.rect(cx - 1, ty + 1, 0.5, 5, TEAL[3]); p.rect(cx + 1.5, ty + 1, 0.5, 5, TEAL[1]);
    for (let y = ty + 1.5; y < ty + 5.5; y += 1) { p.dot(cx, y, BN[3]); p.dot(cx + 1, y, BN[2]); p.dot(cx + 0.5, y + 0.5, BN[3]); }
    for (let y = ty + 1.5; y < ty + 6; y += 1) { p.dot(cx - 0.5, y, BRZ[4]); p.dot(cx + 1.5, y, BRZ[2]); }
  }
  p.rect(cx - 3, ty + 6, 7, 1, TEAL[1]); p.px(cx - 3, ty + 7, TEAL[3]); p.px(cx - 4, ty + 8 + Math.round(sw * 0.5), TEAL[2]);
  if (p.fine) { p.rect(cx - 3, ty + 6, 7, 0.5, TEAL[2]); stitch(p, cx - 2.5, ty + 6.5, cx + 3.5, ty + 6.5, TEAL[3], 3); p.dot(cx - 3.5, ty + 7.5, TEAL[2]); p.dot(cx - 4, ty + 8.5 + Math.round(sw * 0.5), TEAL[1]); }
  // Tragriemen
  p.line(cx - 2, ty - 1, cx - 2, ty + 7, L[3]); p.px(cx - 1, ty, L[2]);
  if (p.fine) { p.rect(cx - 2, ty - 1, 0.5, 8, tone(L[3], 0.25)); stitch(p, cx - 1.5, ty - 0.5, cx - 1.5, ty + 6.5, L[1]); }
  // Kopf mit Kopftuch und Ohrringen
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_TAN, talk, lash: true });
  if (p.fine) {
    // Kopftuch: Falten zum Knoten, Lichtkante, Zipfel weht; Münzborte; Ohrring; Stirnhaar ohne die Braue zu verdecken
    p.rect(hx, hy - 1, 7, 3, TEAL[2]); p.rect(hx + 1, hy - 2, 5, 1, TEAL[3]); p.rect(hx, hy - 1, 2, 3, TEAL[3]);
    p.rect(hx + 1, hy - 2, 4, 0.5, tone(TEAL[3], 0.25)); p.rect(hx, hy - 1, 0.5, 2.5, tone(TEAL[3], 0.25));
    p.fline(hx + 2, hy - 1, hx + 5.5, hy + 0.5, TEAL[1]); p.fline(hx + 2, hy - 1.5, hx + 5.5, hy, TEAL[3]);
    p.rect(hx - 1, hy + 1, 3, 6, TEAL[2]); p.rect(hx - 1, hy + 1, 0.5, 5, TEAL[3]); fold(p, hx + 0.5, hy + 2, hy + 6.5, TEAL[1], TEAL[3]);
    fmap(p, hx - 2 - sw * 0.6, hy + 6, ['.22', '221', '21.', '1..'], { 2: TEAL[2], 1: TEAL[1] });
    for (let x = hx + 1; x <= hx + 6; x += 1) { p.dot(x, hy + 1.5, (x - hx) % 2 ? BRZ[4] : BRZ[2]); p.dot(x + 0.5, hy + 1.5, TEAL[1]); }
    fmap(p, hx + 3, hy + 6, ['3.', '43', '.2'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2] });
    fmap(p, hx + 4.5, hy + 2, ['.1211'], { 2: BLACKH[2], 1: BLACKH[1] });
  } else {
    p.rect(hx, hy - 1, 7, 3, TEAL[2]); p.rect(hx + 1, hy - 2, 5, 1, TEAL[3]); p.rect(hx, hy - 1, 2, 3, TEAL[3]);
    p.rect(hx - 1, hy + 1, 3, 6, TEAL[2]); p.px(hx - 1, hy + 1, TEAL[3]); p.px(hx - 2, hy + 6, TEAL[1]); p.px(hx - 2 - Math.round(sw * 0.6), hy + 7, TEAL[2]);
    for (let x = hx + 1; x <= hx + 6; x += 2) p.px(x, hy + 1, BRZ[3]); // Münzborte
    p.px(hx + 3, hy + 6, BRZ[4]); p.px(hx + 3, hy + 7, BRZ[3]); // Ohrring
    p.px(hx + 6, hy + 2, BLACKH[1]); p.px(hx + 5, hy + 2, BLACKH[2]);
  }
  // Arme
  arm(p, cx - 3, ty + 1, cx - 2, ty + 7, OCHRE[2], OCHRE[1], SKIN_TAN[1]);
  if (gest) {
    // hält einen Stoffstreifen/Schal zur Ansicht hoch
    const hx2 = cx + 7, hy2 = ty - 1 - gest;
    arm(p, cx + 3, ty + 1, hx2 - 1, hy2 + 1, OCHRE[3], OCHRE[2], null);
    if (p.fine) {
      fist(p, hx2 - 1, hy2, SKIN_TAN, true);
      // Schal: wellig, Licht/Schatten je Welle, Fransen, Goldfaden
      for (let s = 0; s < 8; s += 0.5) {
        const x = hx2 + 1 + Math.sin(s * 0.9 + gest), y = hy2 + s, lit = Math.cos(s * 0.9 + gest) > 0;
        p.dot(x, y, lit ? '#d070aa' : '#b04a8a'); p.dot(x + 0.5, y, '#b04a8a'); p.dot(x + 1, y, lit ? '#b04a8a' : '#7a2a60'); p.dot(x + 1.5, y, '#7a2a60');
        if (Math.round(s * 2) % 6 === 0) { p.dot(x + 0.5, y, BRZ[4]); p.dot(x + 1, y, BRZ[3]); }
      }
      const xe = hx2 + 1 + Math.sin(8 * 0.9 + gest);
      p.dot(xe, hy2 + 8, '#7a2a60'); p.dot(xe + 1, hy2 + 8, '#b04a8a'); p.dot(xe + 0.5, hy2 + 8.5, '#7a2a60');
    } else {
      p.rect(hx2 - 1, hy2, 2, 2, SKIN_TAN[2]);
      for (let s = 0; s < 8; s++) { const x = hx2 + 1 + Math.round(Math.sin(s * 0.9 + gest) * 1), y = hy2 + s; p.px(x, y, s % 3 === 0 ? BRZ[3] : '#b04a8a'); p.px(x + 1, y, '#7a2a60'); }
    }
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 6, OCHRE[3], OCHRE[2], SKIN_TAN[2]);
    // Armreifen
    p.px(cx + 5, ty + 5, BRZ[4]); p.px(cx + 6, ty + 5, BRZ[3]);
    if (p.fine) { fmap(p, cx + 5, ty + 4.5, ['4433', '3221'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] }); p.dot(cx + 5, ty + 4.5, '#fff4c8'); }
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ FAULMARSCH
// ------------------------------------------------------------ Moorwächter Thane
const CLOTH = ['#4a4a36', '#5a5a42', '#6a6a4e', '#8a8a66'];
function drawThane(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Umhang hinten (fransig, feucht)
  if (p.fine) {
    // glatte Kante, Falten, nasse Glanzstreifen, Fransen in Zungen
    const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 3 - (3 + k * 3 + sw * k * 1.2); };
    const FK = [0.4, ty + 2, 0.78, ty + 6];   // Falten (Anteil, Startzeile)
    p.each(cx - 12, ty - 1, cx + 1.99, fy - 0.01, (x, y) => {
      const xl = left(y);
      if (x < xl - 0.25) return null;
      if (y > fy - 2 && y > fy - 1.5 + Math.cos(x * 5.1) * 0.5 && Math.sin(x * 3.3 + sw) > 0.1) return null;   // Fransen
      let i = x < xl + 0.75 ? 3 : x > cx - 1 ? 1 : 2;
      for (let q = 0; q < 4; q += 2) {
        const f = FK[q], y0 = FK[q + 1];
        if (y < y0) continue;
        const xf = xl + (cx - 2 - xl) * f;
        if (Math.abs(x - xf) < 0.26) i = 1;
        else if (x < xf && x > xf - 0.76) i = Math.max(i, 3);
      }
      if (y > fy - 3) i = Math.max(1, i - 1);
      return MOSS[i];
    });
    const xl = left(ty + 8);
    p.fline(xl + 1, ty + 7, xl + 1, ty + 10, MOSS[4]); p.fline(xl + 2.5, ty + 12, xl + 2.5, ty + 13.5, MOSS[4]);
  } else for (let y = ty - 1; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(3 + k * 3 + sw * k * 1.2);
    for (let x = cx - 3 - back; x <= cx + 1; x++) {
      if (y >= fy - 2 && (x * 5 + y) % 3 === 0) continue;
      p.px(x, y, MOSS[x < cx - 2 - back ? 3 : x > cx - 1 ? 1 : 2]);
    }
  }
  // Watbeinlinge
  legs(p, cx, fy, 28, WADER, [WADER[0], WADER[1], WADER[2]]);
  if (p.fine) {
    // Schlammrand wellig, Spritzer als kleine Tropfen, Gummiglanz
    for (let x = cx - 3; x < cx + 4; x += 0.5) { if (x >= cx && x < cx + 1) continue; const yy = 32 + (Math.sin(x * 2.7) > 0.3 ? 0.5 : 0); p.dot(x, yy, MUD[3]); p.dot(x, yy + 0.5, MUD[2]); }
    p.dot(cx + 2, 34, MUD[2]); p.dot(cx + 2.5, 34.5, MUD[3]); p.dot(cx - 2, 33.5, MUD[2]);
    p.rect(cx + 1.5, 28.5, 0.5, 3, WADER[3]); p.dot(cx + 1.5, 33, WADER[3]);
  } else { p.rect(cx - 3, 32, 3, 1, MUD[3]); p.rect(cx + 1, 32, 3, 1, MUD[3]); p.px(cx + 2, 34, MUD[2]); }
  // Wams + Gurtzeug
  torso(p, cx - 3, ty, 7, 10, MUD);
  p.rect(cx - 3, ty + 6, 7, 1, L[0]); p.px(cx, ty + 6, BRASS[3]);
  p.line(cx + 3, ty, cx - 3, ty + 6, L[2]);
  if (p.fine) {
    p.rect(cx - 3, ty + 6, 7, 0.5, L[1]); fmap(p, cx - 0.5, ty + 6, ['443', '3.1'], { 4: BRASS[4], 3: BRASS[3], 1: BRASS[1] });
    p.fline(cx + 3, ty - 0.5, cx - 3, ty + 5.5, L[3]); stitch(p, cx + 2.5, ty + 1, cx - 2, ty + 5.5, L[1], 3);
  }
  p.rect(cx - 3, ty + 7, 7, 3, MOSS[2]); p.rect(cx - 3, ty + 7, 2, 3, MOSS[3]);
  if (p.fine) { fold(p, cx, ty + 7.5, ty + 10, MOSS[1], MOSS[3]); fold(p, cx + 2.5, ty + 7.5, ty + 10, MOSS[1], MOSS[3]); p.rect(cx - 3, ty + 9.5, 7, 0.5, MOSS[1]); }
  // Pfeife/Horn am Gürtel
  if (p.fine) fmap(p, cx - 4.5, ty + 6.5, ['.44', '434', '33.', '32.', '.21', '..1'], { 4: BN[4], 3: BN[3], 2: BN[2], 1: BN[1] });
  else { p.px(cx - 4, ty + 7, BN[3]); p.px(cx - 4, ty + 8, BN[2]); p.px(cx - 3, ty + 9, BN[1]); }
  // Kapuzenmantel über Schultern
  p.rect(cx - 4, ty - 1, 8, 4, MOSS[3]); p.rect(cx - 4, ty - 1, 8, 1, MOSS[4]); p.px(cx + 3, ty + 2, MOSS[2]);
  if (p.fine) {
    p.rect(cx - 4, ty - 1, 8, 0.5, tone(MOSS[4], 0.15)); p.rect(cx - 4, ty - 0.5, 8, 0.5, MOSS[4]);
    fold(p, cx - 1, ty + 0.5, ty + 3, MOSS[2], MOSS[4]); fold(p, cx + 2, ty + 0.5, ty + 3, MOSS[2], MOSS[4]);
    for (let x = cx - 4; x < cx + 4; x += 1) p.dot(x + 0.5, ty + 3, MOSS[2]);
  }
  // Kopf: Atemschutztuch, tiefe Kapuze
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_PALE, talk: 0 });
  if (p.fine) {
    // Tuch über Mund/Nase mit Falten und Nasenwölbung; Auge darüber fein (Lid, Weiß, Pupille, Glanz)
    fmap(p, hx + 3, hy + 4, [
      '3333333333',
      '2223332233',
      '2122222322',
      '2221222211',
      '1222122222',
      '2122221221',
      '.212222111',
      '..11111...',
    ], { 3: CLOTH[3], 2: CLOTH[2], 1: CLOTH[1] });
    if (talk) { p.dot(hx + 6, hy + 6.5, CLOTH[0]); p.dot(hx + 6.5, hy + 6.5, CLOTH[0]); p.dot(hx + 6, hy + 6, CLOTH[1]); }
    fmap(p, hx + 4, hy + 2, ['.bb1', '.kkk', '1wgk', '12k1'], { b: SKIN_PALE[0], k: EYE, w: '#c8c0b0', g: '#ffffff', 1: SKIN_PALE[1], 2: SKIN_PALE[2] });
    fmap(p, hx + 3, hy + 8, ['22.', '.12', '..1'], { 2: CLOTH[2], 1: CLOTH[1] });
  } else {
    p.rect(hx + 3, hy + 4, 5, 4, CLOTH[2]); p.rect(hx + 3, hy + 4, 5, 1, CLOTH[3]); p.px(hx + 7, hy + 6, CLOTH[0]); // Tuch über Mund/Nase
    p.px(hx + 7, hy + 4, CLOTH[3]);
    if (talk) p.px(hx + 6, hy + 6, CLOTH[0]);
    p.px(hx + 5, hy + 3, EYE); p.px(hx + 4, hy + 2, SKIN_PALE[1]);
    p.px(hx + 3, hy + 8, CLOTH[2]); p.px(hx + 2, hy + 9, CLOTH[1]); // Tuchzipfel
  }
  p.rect(hx, hy - 1, 7, 3, MOSS[3]); p.rect(hx - 1, hy + 1, 4, 7, MOSS[3]); p.rect(hx + 1, hy - 2, 5, 1, MOSS[4]);
  p.px(hx + 7, hy, MOSS[3]); p.px(hx + 7, hy + 1, MOSS[2]); p.px(hx + 7, hy + 2, MOSS[2]); p.px(hx - 1, hy + 1, MOSS[4]);
  p.px(hx + 6, hy + 1, MOSS[1]); p.px(hx + 6, hy + 2, MOSS[1]); // Schatten unter Kapuze
  if (p.fine) {
    // Kapuze: Saumkante zum Licht, Schatten über dem Gesicht, Falten am Hinterkopf
    p.rect(hx + 1, hy - 2, 4.5, 0.5, tone(MOSS[4], 0.15)); p.rect(hx - 1, hy + 1, 0.5, 6.5, MOSS[4]);
    p.rect(hx + 3, hy + 1.5, 3.5, 0.5, MOSS[1]); p.rect(hx + 2.5, hy + 1.5, 0.5, 6.5, MOSS[2]);
    fold(p, hx + 1, hy, hy + 7.5, MOSS[2], MOSS[4]); p.fline(hx + 3, hy - 1, hx + 6, hy, MOSS[2]);
    p.rect(hx + 6.5, hy + 1, 0.5, 2, MOSS[3]);
  }
  g.px(hx + 5, hy + 3, '#1a3a10');
  // hinterer Arm (Geste: warnend erhoben)
  if (gest) {
    arm(p, cx - 1, ty + 1, cx + 3, ty - 2 - gest, MOSS[2], MOSS[3], null);
    if (p.fine) fmap(p, cx + 3, ty - 3.5 - gest, ['3.3.', '3232', '2221', '2211', '.11.'], { 3: SKIN_PALE[3], 2: SKIN_PALE[2], 1: SKIN_PALE[1] });
    else p.rect(cx + 3, ty - 3 - gest, 2, 2, SKIN_PALE[2]);
  } else arm(p, cx - 3, ty + 1, cx - 3, ty + 8, MOSS[1], MOSS[2], SKIN_PALE[1]);
  // Laterne mit grünem Licht in der vorderen Hand (Licht bei dx 6, dy -14)
  const lx = AX + 5, ly = AY - 17 + Math.round(sw * 0.4) - (gest ? 1 : 0);
  arm(p, cx + 3, ty + 1, lx, ly - 3, MOSS[3], MOSS[2], null);
  const fl = Math.sin(t * TAU * 3) > 0 ? 1 : 0;
  if (p.fine) {
    // Laterne: Bügel, Dach mit Glanzkante, Gitterstreben, Glas mit Spiegelung, giftgrüne Flamme mit hellem Kern
    fist(p, lx - 1, ly - 3.5, SKIN_PALE);
    fmap(p, lx - 2, ly - 1, ['...43...', '.443322.', '44333221'], { 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    p.rect(lx - 2, ly + 1, 6, 5, '#10200c');
    p.rect(lx - 1, ly + 2, 4, 3, TOX[2]); p.rect(lx - 1, ly + 2, 0.5, 3, TOX[1]); p.rect(lx + 2.5, ly + 2, 0.5, 3, TOX[1]);
    fmap(p, lx - 0.5, ly + 2 + fl * 0.5, ['.4.', '454', '343', '.3.'], { 5: TOX[4], 4: TOX[3], 3: TOX[2] });
    p.dot(lx, ly + 2.5 + fl * 0.5, '#ffffff');
    p.rect(lx - 2, ly + 1, 0.5, 5, St[3]); p.rect(lx - 1.5, ly + 1, 0.5, 5, St[2]); p.rect(lx + 3, ly + 1, 1, 5, St[1]);
    p.rect(lx + 1, ly + 1, 0.5, 5, St[1]); p.rect(lx - 2, ly + 3.5, 6, 0.5, St[1]);
    p.dot(lx - 1, ly + 1.5, '#c8f0b0'); p.dot(lx - 1, ly + 2, '#8ac070');
    p.rect(lx - 2, ly + 6, 6, 1, St[1]); p.rect(lx - 2, ly + 6, 6, 0.5, St[2]); p.rect(lx - 1.5, ly + 6.5, 5, 0.5, St[0]);
    // Leuchtebene fein: Saum, Glas, heißer Kern
    g.rect(lx - 2, ly + 1, 6, 5, '#1e5a14'); g.rect(lx - 1, ly + 2, 4, 3, TOX[1]);
    g.rect(lx - 0.5, ly + 2 + fl * 0.5, 1.5, 2, TOX[2]); g.dot(lx, ly + 2.5 + fl * 0.5, TOX[4]); g.dot(lx + 0.5, ly + 3 + fl * 0.5, TOX[3]);
  } else {
    p.rect(lx - 1, ly - 3, 3, 2, SKIN_PALE[2]);
    p.px(lx, ly - 2, St[2]); p.rect(lx - 1, ly - 1, 4, 1, St[2]); p.rect(lx - 2, ly, 6, 1, St[3]);
    p.rect(lx - 2, ly + 1, 6, 5, '#10200c'); p.rect(lx - 2, ly + 1, 1, 5, St[2]); p.rect(lx + 3, ly + 1, 1, 5, St[1]); p.px(lx + 1, ly + 1, St[1]); p.px(lx + 1, ly + 4, St[1]);
    p.rect(lx - 2, ly + 6, 6, 1, St[1]);
    p.rect(lx - 1, ly + 2, 4, 3, TOX[2]); p.px(lx, ly + 2 + fl, TOX[4]); p.px(lx + 1, ly + 3, TOX[3]);
    g.rect(lx - 2, ly + 1, 6, 5, '#1e5a14'); g.rect(lx - 1, ly + 2, 4, 3, TOX[2]); g.px(lx, ly + 2 + fl, TOX[4]); g.px(lx + 1, ly + 3, TOX[3]);
  }
  // Glühfünkchen über der Laterne
  const sp = (t * 3) % 1;
  if (p.fine) { const x = lx + Math.sin(t * TAU), y = ly - 2 - sp * 4; g.dot(x, y, TOX[4]); g.dot(x + 0.5, y, TOX[2]); g.dot(x, y + 0.5, TOX[2]); }
  else g.px(lx + Math.round(Math.sin(t * TAU) * 1), ly - 2 - Math.round(sp * 4), TOX[3]);
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: lx - AX, dy: ly + 3 - AY } };
}

// ------------------------------------------------------------ Alchemistin Brisa
const APR = ['#4a4638', '#6a6450', '#827a62'];
const CURL = ['#5e2414', '#86381c', '#a8522a', '#c46a3a'];
function drawBrisa(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 19, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Glastank auf dem Rücken (Licht bei dx -6, dy -12)
  const tx = cx - 10, tyy = ty - 3 + (b ? 0 : 1);
  const lvl = 3 + Math.round(sw * 0.5);
  if (p.fine) {
    // Messingrahmen 5-stufig mit Nieten, Glas mit senkrechtem Glanzstreifen, Flüssigkeit mit Meniskus und hellem Kern
    p.rect(tx, tyy, 7, 13, BRASS[1]); p.rect(tx, tyy, 0.5, 13, BRASS[3]); p.rect(tx + 6.5, tyy, 0.5, 13, BRASS[0]);
    p.rect(tx + 1, tyy + 1, 5, 11, GLASS[0]);
    p.rect(tx + 1, tyy + lvl, 5, 12 - lvl, TOX[1]); p.rect(tx + 1, tyy + lvl + 0.5, 1, 11.5 - lvl, TOX[2]);
    p.rect(tx + 2.5, tyy + lvl + 1, 1, 10 - lvl, TOX[2]); p.rect(tx + 2.5, tyy + lvl + 2, 0.5, 8 - lvl, TOX[3]);
    p.rect(tx + 1, tyy + lvl, 5, 0.5, TOX[4]); p.rect(tx + 1, tyy + lvl + 0.5, 5, 0.5, TOX[3]); p.dot(tx + 1, tyy + lvl - 0.5, TOX[3]); p.dot(tx + 5.5, tyy + lvl - 0.5, TOX[3]);
    p.rect(tx + 5, tyy + 1.5, 0.5, 9, GLASS[2]); p.rect(tx + 5, tyy + 2, 0.5, 2, '#c8e8e0'); p.dot(tx + 5, tyy + 5, '#e8fff8');
    p.rect(tx, tyy, 7, 1, BRASS[3]); p.rect(tx, tyy, 7, 0.5, BRASS[4]); p.rect(tx + 0.5, tyy + 0.5, 6, 0.5, BRASS[2]);
    p.rect(tx, tyy + 12, 7, 1, BRASS[2]); p.rect(tx, tyy + 12, 7, 0.5, BRASS[3]); p.rect(tx, tyy + 12.5, 7, 0.5, BRASS[1]);
    p.rect(tx, tyy + 6, 7, 0.5, BRASS[3]); p.rect(tx, tyy + 6.5, 7, 0.5, BRASS[1]);
    for (const y of [tyy + 0.5, tyy + 6, tyy + 12.5]) { p.dot(tx + 0.5, y, '#fff6c0'); p.dot(tx + 6, y, BRASS[2]); }
    p.dot(tx, tyy, '#ffffff');
    // Leuchtebene: Flüssigkeit, heller Kern innen
    g.rect(tx + 1, tyy + lvl, 5, 12 - lvl, '#10300a'); g.rect(tx + 2, tyy + lvl + 1, 3, 10 - lvl, '#1e5012');
    g.rect(tx + 2.5, tyy + lvl + 2, 1, 8 - lvl, '#2a6a1a'); g.rect(tx + 1, tyy + lvl, 5, 0.5, TOX[3]);
  } else {
    p.rect(tx, tyy, 7, 13, BRASS[1]); p.rect(tx + 1, tyy + 1, 5, 11, GLASS[0]);
    p.rect(tx, tyy, 7, 1, BRASS[3]); p.rect(tx, tyy + 12, 7, 1, BRASS[2]); p.px(tx, tyy, BRASS[4]);
    p.rect(tx + 1, tyy + lvl, 5, 12 - lvl, TOX[1]); p.rect(tx + 1, tyy + lvl, 5, 1, TOX[3]); p.rect(tx + 1, tyy + lvl + 1, 1, 10 - lvl, TOX[2]);
    g.rect(tx + 1, tyy + lvl, 5, 12 - lvl, '#10300a'); g.rect(tx + 1, tyy + lvl, 5, 1, TOX[3]); g.rect(tx + 2, tyy + lvl + 2, 1, 6, '#2a6a1a');
  }
  // Blasen steigen
  for (let i = 0; i < 3; i++) {
    const k = (t * 2 + i / 3) % 1, bx = tx + 2 + ((i * 2) % 4);
    if (p.fine) {
      const by = tyy + 11 - k * (11 - lvl);
      if (by > tyy + lvl + 0.5) { fmap(p, bx, by, ['.4', '43'], { 4: TOX[4], 3: TOX[3] }); g.dot(bx, by + 0.5, TOX[4]); g.dot(bx + 0.5, by, TOX[4]); }
    } else {
      const by = Math.round(tyy + 11 - k * (11 - lvl));
      if (by > tyy + lvl) { p.px(bx, by, TOX[4]); g.px(bx, by, TOX[4]); }
    }
  }
  if (!p.fine) { p.px(tx + 5, tyy + 2, '#c8e8e0'); p.px(tx + 5, tyy + 3, '#8ab0a8'); } // Glanz
  p.rect(tx + 2, tyy - 2, 3, 2, BRASS[2]); p.px(tx + 2, tyy - 2, BRASS[4]); // Deckel
  if (p.fine) fmap(p, tx + 2, tyy - 2, ['w43321', '433221', '322211', '.2111.'].map((r) => r.slice(0, 6)), { w: '#ffffff', 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1] });
  // Schlauch vom Tank zur Schulter
  p.line(tx + 4, tyy - 2, tx + 6, tyy - 4, '#3a3226'); p.line(tx + 6, tyy - 4, cx - 1, ty - 1, '#3a3226'); p.line(tx + 5, tyy - 2, tx + 7, tyy - 4, '#54483a');
  if (p.fine) {
    // Rippen am Schlauch
    p.fline(tx + 4.5, tyy - 2.5, tx + 6.5, tyy - 4.5, '#6a5c4a');
    for (let k = 0.15; k < 1; k += 0.2) { const x = tx + 6 + (cx - 1 - tx - 6) * k, y = tyy - 4 + (ty - 1 - tyy + 4) * k; p.dot(x + 0.5, y + 0.5, '#241e16'); }
  }
  // Beine + Schnallenstiefel
  legs(p, cx, fy, 29, ['#1e1a22', '#2a2530', '#3a3440'], ['#140e0c', '#241814', '#3a2a20']);
  p.px(cx + 2, fy - 2, BRASS[3]);
  if (p.fine) { fmap(p, cx + 1.5, fy - 2, ['443', '3.2', '321'], { 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1] }); p.rect(cx + 1, fy - 1.5, 0.5, 0.5, '#3a2a20'); }
  // Mantel/Schürze (gefleckt)
  torso(p, cx - 3, ty, 7, 10, OLIVE);
  p.rect(cx - 1, ty + 2, 5, 11, APR[1]); p.rect(cx - 1, ty + 2, 1, 11, APR[2]); p.rect(cx + 3, ty + 2, 1, 11, APR[0]);
  if (p.fine) {
    // Schürze: Saum, Falten, Flecken als kleine unregelmäßige Kleckse mit hellem Rand, Brandloch
    p.rect(cx - 1, ty + 2, 0.5, 11, tone(APR[2], 0.2)); fold(p, cx + 1.5, ty + 7, ty + 13, APR[0], APR[2]);
    stitch(p, cx - 0.5, ty + 2.5, cx + 3, ty + 2.5, APR[0]); p.rect(cx - 1, ty + 12.5, 5, 0.5, APR[0]);
    fmap(p, cx + 0.5, ty + 6.5, ['.11.', '1221', '.12.'], { 1: TOX[0], 2: TOX[1] });
    fmap(p, cx + 2, ty + 10, ['33.', '322', '.2.'], { 3: '#7a5a8a', 2: '#5a3a6a' });
    fmap(p, cx - 0.5, ty + 11.5, ['0.', '00'], { 0: '#2a2a1a' });
  } else { p.px(cx + 1, ty + 7, TOX[1]); p.px(cx + 2, ty + 10, '#5a3a6a'); p.px(cx, ty + 12, TOX[0]); } // Flecken
  // Phiolengürtel
  p.rect(cx - 3, ty + 6, 7, 1, L[0]);
  if (p.fine) { p.rect(cx - 3, ty + 6, 7, 0.5, L[1]); }
  const vials = [[cx - 3, TOX[2], TOX[4]], [cx - 1, '#a050d0', '#e0a0ff'], [cx + 1, '#d06a20', '#ffc070'], [cx + 3, TOX[2], TOX[4]]];
  for (const [vx, c0, c1] of vials) {
    if (p.fine) {
      // Phiole: Korken, Glas mit Glanz, Flüssigkeit mit hellem Kern, Leuchtebene fein
      fmap(p, vx, ty + 5, ['43', '21', 'wg', 'g1', '01', '01', '.0'], { 4: BN[3], 3: BN[2], 2: BN[2], 1: BN[1], w: '#ffffff', g: '#c8d8d0', 0: c0 });
      p.dot(vx, ty + 7, c1); p.dot(vx + 0.5, ty + 7, c0); p.dot(vx, ty + 7.5, tone(c1, -0.2)); p.dot(vx + 0.5, ty + 8, tone(c0, -0.3));
      g.dot(vx, ty + 7, c1); g.dot(vx + 0.5, ty + 7, c0); g.dot(vx, ty + 7.5, c0); g.dot(vx, ty + 8, tone(c0, -0.3));
    } else {
      p.px(vx, ty + 5, BN[2]); p.px(vx, ty + 7, c0); p.px(vx, ty + 8, c0); p.px(vx, ty + 6, '#c8d8d0');
      g.px(vx, ty + 7, c1); g.px(vx, ty + 8, c0);
    }
  }
  p.rect(cx - 4, ty - 1, 9, 2, OLIVE[3]); p.px(cx - 4, ty - 1, '#6e6e3a'); // Kragen
  if (p.fine) { p.rect(cx - 4, ty - 1, 9, 0.5, '#6e6e3a'); p.rect(cx - 3, ty + 0.5, 7, 0.5, OLIVE[2]); p.dot(cx + 1, ty, OLIVE[1]); p.dot(cx + 1.5, ty + 0.5, OLIVE[1]); }
  // Kopf: rote Locken, Schutzbrille mit grünen Gläsern
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk, noEye: true });
  if (p.fine) {
    // Locken: kleine Bögen (Licht oben links), Strähnen fallen über die Schulter
    fmap(p, hx - 1, hy - 1, [
      '...3233232332..',
      '..3221221122213',
      '.32212.3...1...',
      '3221..',
      '2312..',
      '13221.',
      '2312..',
      '1221..',
      '.3122.',
      '2121..',
      '.1121.',
      '.21.1.',
      '..1...',
      '.21...',
    ], { 3: CURL[3], 2: CURL[2], 1: CURL[1], 0: CURL[0] });
    p.dot(hx - 1, hy + 6 + Math.round(sw * 0.4), CURL[1]); p.dot(hx - 1, hy + 6.5 + Math.round(sw * 0.4), CURL[0]);
    // Brillenband mit Naht, Messingfassung, grünes Glas mit Glanzpunkt
    p.rect(hx + 2, hy + 3, 6, 1, L[0]); p.rect(hx + 2, hy + 3, 2, 0.5, L[1]);
    fmap(p, hx + 4, hy + 2, ['.443.', '4gwi2', '3iii1', '3iik1', '.211.', '......'], { 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1], w: '#ffffff', g: TOX[4], i: TOX[2], k: TOX[1] });
    g.dot(hx + 4.5, hy + 2.5, TOX[4]); g.dot(hx + 5, hy + 2.5, TOX[3]); g.rect(hx + 4.5, hy + 3, 1.5, 1, TOX[1]);
  } else {
    p.rect(hx + 1, hy - 1, 6, 2, '#86381c'); p.rect(hx, hy, 3, 6, '#86381c'); p.px(hx + 2, hy - 1, '#a8522a'); p.px(hx, hy + 1, '#a8522a');
    p.px(hx - 1, hy + 2, '#5e2414'); p.px(hx - 1, hy + 4, '#86381c'); p.px(hx, hy + 6, '#5e2414'); p.px(hx - 1, hy + 6 + Math.round(sw * 0.4), '#86381c');
    p.rect(hx + 2, hy + 3, 6, 1, L[0]); // Brillenband
    p.rect(hx + 4, hy + 2, 3, 3, BRASS[2]); p.px(hx + 4, hy + 2, BRASS[4]);
    p.px(hx + 5, hy + 3, TOX[3]); p.px(hx + 6, hy + 3, TOX[2]);
    g.px(hx + 5, hy + 3, TOX[4]); g.px(hx + 6, hy + 3, TOX[2]);
  }
  // Arme: hinten zum Tankgurt, vorn schwenkt eine Phiole
  arm(p, cx - 3, ty + 1, cx - 3, ty + 7, OLIVE[1], OLIVE[2], SKIN[1]);
  const fx = cx + 6, fyv = ty + 3 - (gest ? 3 + gest : 0) + (gest ? 0 : Math.round(sw * 0.5));
  arm(p, cx + 3, ty + 1, fx - 1, fyv + 2, OLIVE[3], OLIVE[2], null);
  const tilt = gest ? (gest === 1 ? -1 : 1) : 0;
  if (p.fine) {
    fist(p, fx - 1, fyv + 2, SKIN, true);
    // Kolben: Hals mit Korken, Glas rund mit Lichtkante, Flüssigkeit, heißer Kern; Leuchtebene mit Kern
    p.fline(fx + 1 + tilt, fyv - 2.5, fx + 1, fyv - 0.5, '#b8d0c8'); p.dot(fx + 1 + tilt, fyv - 3, BN[3]); p.dot(fx + 1.5 + tilt, fyv - 3, BN[2]);
    p.ellipseFine(fx + 1.5, fyv + 1.5, 2.35, 2.4, (nx, ny, d) => {
      if (d > 0.7) return nx + ny < -0.3 ? '#a8d0c8' : GLASS[2];
      if (ny < -0.35) return GLASS[1];
      return d < 0.18 ? TOX[4] : nx + ny < 0 ? TOX[3] : TOX[2];
    });
    p.dot(fx + 0.5, fyv + 0.5, '#ffffff'); p.dot(fx, fyv + 1, '#e8fff0');
    g.ellipseFine(fx + 1.5, fyv + 1.5, 2.35, 2.4, (nx, ny, d) => (d < 0.2 ? TOX[4] : d < 0.55 ? TOX[2] : TOX[1]));
    if (gest) { g.dot(fx + 2, fyv - 4 - gest, TOX[4]); g.dot(fx + 2.5, fyv - 4 - gest, TOX[2]); g.dot(fx + 1, fyv - 6 - gest, TOX[3]); p.dot(fx + 2, fyv - 4 - gest, TOX[4]); p.dot(fx + 2.5, fyv - 4 - gest, TOX[3]); p.dot(fx + 1, fyv - 6 - gest, TOX[3]); }
  } else {
    p.rect(fx - 1, fyv + 2, 2, 2, SKIN[2]);
    p.px(fx + 1 + tilt, fyv - 3, BN[3]); p.px(fx + 1 + tilt, fyv - 2, '#b8d0c8');
    p.ellipse(fx + 1, fyv + 1, 2, 2, GLASS[2]); p.ellipse(fx + 1, fyv + 1, 1.5, 1.5, TOX[2]); p.px(fx, fyv, '#e8fff0');
    g.ellipse(fx + 1, fyv + 1, 2, 2, TOX[1]); g.px(fx + 1, fyv + 1, TOX[4]);
    if (gest) { g.px(fx + 2, fyv - 4 - gest, TOX[3]); g.px(fx + 1, fyv - 6 - gest, TOX[2]); p.px(fx + 2, fyv - 4 - gest, TOX[3]); }
  }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: fx + 1 - AX, dy: fyv + 1 - AY } };
}

// ------------------------------------------------------------ Händler Moll
const MESH = '#403825';   // Netzfaden im Schatten (MUD[3] dunkler)
const MSHIRT = ['#3a3020', '#5a4c34', '#76664a', '#928262'];
const OILH = ['#34401e', '#4a5a2a', '#6a7a3a', '#8a9a50'];
function drawMoll(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 20 - b, hy = 12 - b;
  // Reusen-/Netzbündel auf dem Rücken
  const nx = cx - 12, ny = ty - 3 + (b ? 0 : 1);
  if (p.fine) {
    // Netz: Rautenmaschen aus Feinlinien mit Knoten, dahinter dunkles Bündel; Rand mit Lichtkante
    p.ellipseFine(nx + 4.5, ny + 6.5, 4.35, 7.4, (ex, ey, d) => {
      const u = (ex * 4 + 4) * 2, v = (ey * 7 + 7) * 2;   // Feinpixel im Bündel
      const a = ((Math.floor(u + v * 0.8) % 6) + 6) % 6, c = ((Math.floor(u - v * 0.8) % 6) + 6) % 6;
      const lit = ex + ey < -0.3;
      if (a === 0 && c === 0) return lit ? '#7e6e4a' : MUD[3];
      if (a === 0 || c === 0) return lit ? MUD[3] : MESH;
      if (d > 0.82) return lit ? MUD[2] : MUD[1];
      return d < 0.5 ? MUD[0] : MUD[1];
    });
    p.rect(nx + 2, ny - 1, 5, 1, L[2]); p.rect(nx + 2, ny - 1, 5, 0.5, L[3]); p.dot(nx + 4, ny - 0.5, L[0]);
  } else {
    p.ellipse(nx + 4, ny + 6, 4, 7, MUD[2]); p.ellipse(nx + 4, ny + 6, 3, 6, MUD[1]);
    for (let y = ny; y <= ny + 12; y += 2) p.line(nx + 1, y, nx + 7, y + 1, MUD[3]);
    for (let x = nx + 1; x <= nx + 7; x += 2) p.line(x, ny, x, ny + 12, MUD[3]);
    p.rect(nx + 2, ny - 1, 5, 1, L[2]);
  }
  // Aal an der Schnur
  const ex = nx + 1 + Math.round(sw * 0.6);
  p.line(nx + 2, ny + 9, ex, ny + 12, '#6a5a40');
  if (p.fine) {
    p.fline(nx + 2.25, ny + 9.25, ex + 0.25, ny + 12.25, '#8a7a58');
    for (let s = 0; s < 6; s += 0.5) {
      const x = ex + Math.sin(s * 1.1 + t * TAU), y = ny + 13 + s;
      p.dot(x, y, '#2a3a2e'); p.dot(x + 0.5, y, '#4a5a44'); p.dot(x + 1, y, '#6a7a5a'); p.dot(x + 1.5, y, '#8a9070');
    }
    const x0 = ex + Math.sin(t * TAU);
    p.dot(x0 + 1, ny + 13, '#e0e0c0'); p.dot(x0 + 0.5, ny + 13.5, '#1a1a14');   // Auge
  } else for (let s = 0; s < 6; s++) { const x = ex + Math.round(Math.sin(s * 1.1 + t * TAU) * 1), y = ny + 13 + s; p.px(x, y, '#3a4a3a'); p.px(x + 1, y, '#5a6a50'); }
  // Watstiefel bis über die Knie
  p.rect(cx - 4, 27, 4, 8, WADER[1]); p.rect(cx - 4, 27, 4, 1, WADER[3]);
  p.rect(cx + 1, 27, 4, 8, WADER[2]); p.rect(cx + 1, 27, 4, 1, WADER[3]); p.rect(cx + 1, 27, 1, 8, WADER[3]);
  p.rect(cx - 5, fy - 2, 5, 3, WADER[0]); p.rect(cx + 1, fy - 2, 6, 3, WADER[1]); p.rect(cx + 5, fy - 1, 2, 1, WADER[2]);
  if (p.fine) {
    // Gummi: Stulpe mit Wulst, Glanzstreifen, Kniefalte, Schlammkante wellig, Sohle
    p.rect(cx + 1, 27, 4, 0.5, tone(WADER[3], 0.25)); p.rect(cx + 1, 27.5, 4, 0.5, WADER[1]); p.rect(cx - 4, 27.5, 4, 0.5, WADER[0]);
    p.rect(cx + 1.5, 28, 0.5, 6, tone(WADER[3], 0.2)); p.fline(cx + 2.5, 30.5, cx + 4, 30, WADER[1]); p.fline(cx - 3, 30.5, cx - 1.5, 30, WADER[0]);
    for (let x = cx - 5; x < cx + 7; x += 0.5) { if (x >= cx && x < cx + 1) continue; p.dot(x, fy - 1.5 - (Math.sin(x * 2.3) > 0.4 ? 0.5 : 0), MUD[2]); }
    p.rect(cx + 1, fy + 0.5, 6, 0.5, '#0a0c08'); p.dot(cx + 6, fy - 1, WADER[3]);
    p.dot(cx + 2, 31, MUD[3]); p.dot(cx + 2.5, 31.5, MUD[2]); p.dot(cx + 3, 33, MUD[2]); p.dot(cx - 2, 32, MUD[3]);
    p.rect(cx - 5, fy, 5, 1, MUD[1]); p.rect(cx - 5, fy, 5, 0.5, MUD[2]);
  } else { p.px(cx + 2, 31, MUD[3]); p.px(cx + 3, 33, MUD[2]); p.px(cx - 2, 32, MUD[3]); p.rect(cx - 5, fy, 5, 1, MUD[1]); }
  // dicker Bauch in Hemd, Hosenträger
  if (p.fine) {
    // Bauch rund (fein abgetastet), Licht links, Unterwölbung dunkel, Knopfleiste mit Knöpfen
    p.each(cx - 5, ty, cx + 8, ty + 9.99, (x, y) => {
      const k = (y - ty) / 9, bulge = Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * 3;
      if (x < cx - 5 || x > cx + 5 + bulge) return null;
      let i = x < cx - 3 ? 3 : x > cx + 3.5 + bulge ? 0 : x > cx + 1 + bulge ? 1 : 2;
      if (k > 0.72 && x > cx - 1) i = Math.max(0, i - 1);
      if (x < cx - 4.5) i = 3;
      return MSHIRT[i];
    });
    for (let y = ty + 1; y < ty + 9; y += 2) { const bx = cx + 1 + Math.sin((y - ty) / 9 * Math.PI) * 2; p.dot(bx, y, BN[2]); p.dot(bx + 0.5, y + 0.5, MSHIRT[0]); }
    p.fline(cx - 2, ty + 3, cx - 3, ty + 7, MSHIRT[1]);
  } else for (let y = ty; y <= ty + 9; y++) {
    const k = (y - ty) / 9, bulge = Math.round(Math.sin(k * Math.PI) * 3);
    for (let x = cx - 5; x <= cx + 4 + bulge; x++) {
      const i = x < cx - 3 ? 3 : x > cx + 2 + bulge ? 0 : x > cx + bulge ? 1 : 2;
      p.px(x, y, MSHIRT[i]);
    }
  }
  p.line(cx - 2, ty, cx - 1, ty + 9, L[1]); p.line(cx + 3, ty, cx + 5, ty + 9, L[1]);
  p.px(cx + 5, ty + 4, BRASS[3]);
  if (p.fine) {
    p.fline(cx - 2.5, ty, cx - 1.5, ty + 9, L[3]); p.fline(cx + 2.5, ty, cx + 4.5, ty + 9, L[3]);
    fmap(p, cx + 4.5, ty + 3.5, ['443', '3.2', '321'], { 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1] });
  }
  p.rect(cx - 5, ty + 9, 11, 1, L[0]); p.px(cx + 1, ty + 9, BRASS[3]);
  if (p.fine) { p.rect(cx - 5, ty + 9, 11, 0.5, L[1]); fmap(p, cx + 0.5, ty + 9, ['443', '3.1'], { 4: BRASS[4], 3: BRASS[3], 1: BRASS[1] }); }
  // Hose zwischen Bauch und Stiefeln
  p.rect(cx - 4, ty + 10, 9, 1, MUD[2]);
  if (p.fine) { p.rect(cx - 4, ty + 10.5, 9, 0.5, MUD[1]); p.dot(cx + 2, ty + 10, MUD[3]); }
  // Kopf: rund, Doppelkinn, Südwester
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN, talk });
  p.rect(hx + 1, hy + 7, 6, 1, SKIN[2]); p.rect(hx + 2, hy + 8, 5, 1, SKIN[1]); p.px(hx + 7, hy + 6, SKIN[2]);
  if (p.fine) {
    // Doppelkinn mit Falte, Knollennase gerötet, Walross-Schnauzer in Strähnen über dem Mund
    p.rect(hx + 2, hy + 7.5, 4.5, 0.5, SKIN[1]); p.rect(hx + 1.5, hy + 7, 3, 0.5, SKIN[3]); p.rect(hx + 2.5, hy + 8.5, 4, 0.5, SKIN[0]);
    fmap(p, hx + 6, hy + 3.5, ['.32.', '3322', '2221', '.11.'], { 3: '#d8907a', 2: '#c07060', 1: '#904838' });
    fmap(p, hx + 4, hy + 5.5, ['..2332', '.23321', '21...1'], { 3: '#7a6450', 2: '#5a4834', 1: '#3a2e20' });
    if (talk) p.rect(hx + 5, hy + 6.5, 1.5, 0.5, MOUTH);
  } else {
    p.px(hx + 6, hy + 4, '#c07060'); // rote Nase/Wange
    p.rect(hx + 4, hy + 6, 3, 1, '#4a3a2a'); if (talk) p.px(hx + 6, hy + 6, MOUTH); // Schnauzer
  }
  p.rect(hx - 1, hy + 1, 11, 1, OILH[1]); p.rect(hx - 1, hy + 1, 3, 1, OILH[2]); p.rect(hx - 2, hy + 2, 3, 2, OILH[1]); // Krempe (hinten tiefer)
  p.rect(hx + 1, hy - 2, 6, 3, OILH[1]); p.rect(hx + 1, hy - 2, 2, 3, OILH[2]); p.px(hx + 6, hy, OILH[0]);
  if (p.fine) {
    // Ölzeug: Glanzstreifen, Nähte am Kopfteil, Krempe mit Lichtkante oben und Schatten unten
    p.rect(hx + 1, hy - 2, 5.5, 0.5, OILH[3]); p.rect(hx + 1.5, hy - 1.5, 0.5, 2, OILH[3]);
    stitch(p, hx + 4, hy - 1.5, hx + 4, hy + 0.5, OILH[0]); p.rect(hx + 6.5, hy - 1.5, 0.5, 2.5, OILH[0]);
    p.rect(hx - 1, hy + 1, 11, 0.5, OILH[2]); p.rect(hx - 1, hy + 1, 2.5, 0.5, OILH[3]); p.rect(hx + 2, hy + 1.5, 8, 0.5, OILH[0]);
    p.rect(hx - 2, hy + 2, 0.5, 2, OILH[2]); p.rect(hx - 2, hy + 3.5, 3, 0.5, OILH[0]); p.dot(hx + 8, hy + 1, OILH[3]);
  }
  // Pfeife mit Glut
  const pfx = hx + 8, pfy = hy + 6;
  p.px(pfx, pfy, L[3]); p.px(pfx + 1, pfy, L[3]); p.rect(pfx + 2, pfy - 2, 2, 3, L[2]); p.px(pfx + 2, pfy - 2, L[3]);
  const em = Math.sin(t * TAU) > 0 ? E[4] : E[3];
  const sk = (t * 2) % 1;
  if (p.fine) {
    // Pfeifenkopf gemasert, Glut mit heißem Kern, Rauch als feste Feinpixel
    p.rect(pfx, pfy, 2, 0.5, L[3]); p.rect(pfx, pfy + 0.5, 2, 0.5, L[1]);
    fmap(p, pfx + 2, pfy - 2.5, ['a1b2', '3221', '3211', '3211', '2211', '.11.'], { a: E[2], b: E[2], 3: L[3], 2: L[2], 1: L[1] });
    p.dot(pfx + 2.5, pfy - 2.5, em); p.dot(pfx + 3, pfy - 2.5, E[5]);
    g.dot(pfx + 2, pfy - 2.5, E[3]); g.dot(pfx + 2.5, pfy - 2.5, em); g.dot(pfx + 3, pfy - 2.5, E[5]); g.dot(pfx + 3.5, pfy - 2.5, E[2]); g.dot(pfx + 3, pfy - 3, E[2]);
    const x = pfx + 3 + sk * 2, y = pfy - 5 - sk * 4;
    p.dot(x, y, '#8a8a84'); p.dot(x + 0.5, y - 0.5, '#9a9a92'); if (sk < 0.6) p.dot(x - 0.5, y + 1, '#7a7a74');
  } else {
    p.px(pfx + 2, pfy - 3, em); g.px(pfx + 2, pfy - 3, em); g.px(pfx + 3, pfy - 3, E[2]);
    p.px(pfx + 3 + Math.round(sk * 2), pfy - 5 - Math.round(sk * 4), 'rgba(170,170,160,0.55)');
  }
  // Arme
  arm(p, cx - 4, ty + 1, cx - 5, ty + 7, MSHIRT[2], MSHIRT[1], SKIN[1]);
  if (gest) {
    arm(p, cx + 3, ty + 1, cx + 8, ty - gest, MSHIRT[2], MSHIRT[1], null);
    if (p.fine) fmap(p, cx + 8, ty - 1.5 - gest, ['..3.', '3332', '3321', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
    else { p.rect(cx + 8, ty - 1 - gest, 2, 2, SKIN[2]); p.px(cx + 10, ty - 1 - gest, SKIN[3]); }
  } else arm(p, cx + 3, ty + 1, cx + 7, ty + 5, MSHIRT[2], MSHIRT[1], SKIN[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ FROSTZINNEN
// ------------------------------------------------------------ Jarl Eskil
function drawEskil(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 9 - b;
  // Pelzumhang (breit, bis fast zum Boden)
  if (p.fine) {
    // Fell in langen, welligen Strähnen statt Sprenkeln; Lichtkante links, Spitzen unten gezackt
    const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 4 - (4 + k * 3 + sw * k); };
    p.each(cx - 13, ty - 2, cx + 1.99, fy - 0.01, (x, y) => {
      const xl = left(y);
      if (x < xl - 0.25) return null;
      const k = (y - ty) / (fy - ty);
      const s = (x - xl) * 2 + Math.sin(y * 0.9 + x * 0.6) * 0.9 + sw * k;
      const f = ((Math.floor(s) % 4) + 4) % 4;
      if (y > fy - 1.5 && Math.sin(x * 4.4) > 0.2) return null;
      let i = x < xl + 1 ? 3 : x > cx - 1 ? 1 : 2;
      if (f === 0) i -= 1; else if (f === 2 && i < 3) i += 1;
      if (x < xl + 0.5 && y < ty + 6) i = 4;
      if (y > fy - 2.5) i = Math.min(i, 2);
      return GREYF[Math.max(0, i)];
    });
  } else {
    for (let y = ty - 2; y <= fy - 1; y++) {
      const k = (y - ty) / (fy - ty), back = Math.round(4 + k * 3 + sw * k);
      for (let x = cx - 4 - back; x <= cx + 1; x++) {
        if (y === fy - 1 && (x & 1)) continue;
        p.px(x, y, GREYF[x < cx - 3 - back ? 3 : x > cx - 1 ? 1 : 2]);
      }
    }
    for (let y = ty; y < fy - 2; y++) for (let x = cx - 10; x <= cx - 1; x++) {
      const h = (x * 7 + y * 13) % 11;
      if (h === 0) p.px(x - Math.round(sw * (y - ty) / (fy - ty)), y, GREYF[4]);
      else if (h === 5) p.px(x - Math.round(sw * (y - ty) / (fy - ty)), y, GREYF[1]);
    }
  }
  // Beine: Wollhose, Fellstiefel mit Riemen
  legs(p, cx, fy, 29, FROSTB, [GREYF[1], GREYF[2], GREYF[3]]);
  if (p.fine) {
    fur(p, cx - 4, fy - 4, 4, 2, [GREYF[0], GREYF[1], GREYF[2], GREYF[3]], 1);
    fur(p, cx + 1, fy - 4, 4, 2, [GREYF[1], GREYF[2], GREYF[3], GREYF[4]], 2);
    p.fline(cx + 1, 30, cx + 3.5, 31.5, L[1]); p.fline(cx + 1, 32, cx + 3.5, 30.5, L[1]); p.dot(cx + 2, 30.5, L[3]);   // Kreuzschnürung
  } else {
    p.rect(cx - 4, fy - 4, 4, 2, GREYF[2]); p.rect(cx + 1, fy - 4, 4, 2, GREYF[3]); p.px(cx + 1, fy - 4, GREYF[4]);
    p.px(cx + 2, 30, L[1]); p.px(cx + 3, 32, L[1]);
  }
  // Rumpf: Kettenhemd + Tunika
  torso(p, cx - 4, ty, 9, 11, St, 2);
  if (p.fine) {
    // Kettenhemd: versetzte Ringe (Licht oben links), rechts dunkler
    p.each(cx - 4, ty, cx + 5, ty + 11, (x, y) => {
      const i = Math.floor((x - (cx - 4)) * 2), j = Math.floor((y - ty) * 2);
      if (i < 0 || i >= 18 || j < 0 || j >= 22) return null;
      const r = Math.floor(j / 3), jj = j % 3, ii = (i + (r & 1) * 2) % 4;
      const sh = i > 13 ? 1 : 0;
      const P = ['.43.', '3..2', '.21.'][jj][ii];
      if (P === '.') return St[1 - sh];
      return St[Math.max(0, +P - sh)];
    });
  } else for (let y = ty + 1; y < ty + 11; y += 2) for (let x = cx - 3 + (y & 1); x < cx + 4; x += 2) p.px(x, y, St[1]);
  p.rect(cx - 2, ty + 3, 5, 9, FROSTB[2]); p.rect(cx - 2, ty + 3, 1, 9, FROSTB[3]); p.rect(cx + 2, ty + 3, 1, 9, FROSTB[1]);
  if (p.fine) {
    // Tunika: Ziernaht in Gold am Saum, Falten
    p.rect(cx - 2, ty + 3, 0.5, 9, tone(FROSTB[3], 0.2)); fold(p, cx + 1, ty + 10, ty + 12, FROSTB[1], FROSTB[3]);
    p.rect(cx - 2, ty + 11.5, 5, 0.5, FROSTB[1]); stitch(p, cx - 1.5, ty + 11, cx + 2.5, ty + 11, G[2]);
    stitch(p, cx - 1.5, ty + 3.5, cx + 2, ty + 3.5, G[2]);
  }
  p.rect(cx - 4, ty + 8, 9, 2, L[1]); p.rect(cx - 1, ty + 8, 3, 2, G[2]); p.px(cx - 1, ty + 8, G[4]); p.px(cx, ty + 9, G[1]); // Gürtelschnalle
  if (p.fine) {
    p.rect(cx - 4, ty + 8, 9, 0.5, L[2]); p.rect(cx - 4, ty + 9.5, 9, 0.5, L[0]); stitch(p, cx - 3.5, ty + 8.5, cx - 1.5, ty + 8.5, L[3]);
    fmap(p, cx - 1, ty + 8, ['w4433', '43..2', '32..1', '22111'], { w: '#ffffff', 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
    p.rect(cx, ty + 8.5, 1, 1, L[0]); p.rect(cx + 0.5, ty + 8.5, 0.5, 1, G[3]);   // Dorn
  }
  // Pelzkragen über Schultern (weißer Rand)
  if (p.fine) {
    fur(p, cx - 6, ty - 2, 12, 3.5, [GREYF[1], GREYF[2], GREYF[3], WFUR[1], WFUR[2]], sw * 0.5);
    fmap(p, cx + 2, ty - 0.5, ['.43.', '4w32', '3221', '.11.'], { w: '#ffffff', 4: G[4], 3: G[3], 2: G[2], 1: G[1] });   // Fibel
  } else {
    p.rect(cx - 6, ty - 2, 12, 4, GREYF[3]); p.rect(cx - 6, ty - 2, 12, 1, WFUR[2]); p.px(cx - 6, ty + 1, GREYF[2]); p.px(cx + 5, ty + 1, GREYF[2]);
    for (let x = cx - 5; x <= cx + 5; x += 2) p.px(x, ty + 2, GREYF[3]);
    p.px(cx + 2, ty, G[3]); p.px(cx + 3, ty, G[4]); // Fibel
  }
  // Kopf mit Flügelhelm und langem geflochtenem Bart
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_COLD, talk: 0, brow: REDB[1] });
  if (p.fine) {
    // Bart in Strähnen, unten zum Zopf geflochten (Glieder mit Licht), Goldring; Schnurrbart lässt den Mund frei
    fur(p, hx + 1, hy + 3, 2, 3.5, REDB, 0.8);
    p.each(hx + 3, hy + 5, hx + 8, hy + 12, (x, y) => {
      const rx = x - hx, ry = y - hy;
      if (ry < 5.5 && rx > 7) return null;
      const half = ry < 9 ? 2.5 : 2.5 - (ry - 9) * 0.5;
      if (Math.abs(rx - 5.5) > half || ry < 5 || ry > 12) return null;
      const s = ((Math.floor((rx + Math.sin(ry * 1.5) * 0.5) * 2) % 3) + 3) % 3;
      if (s === 0) return REDB[1];
      if (s === 2) return ry < 8 || rx < 5 ? REDB[3] : REDB[2];
      return REDB[2];
    });
    fmap(p, hx + 4.5, hy + 5, ['.23333', '233322', '21..12'], { 3: REDB[3], 2: REDB[2], 1: REDB[1] });
    p.rect(hx + 6, hy + 6, 1.5, 0.5, talk ? MOUTH : REDB[0]); if (talk) p.dot(hx + 6.5, hy + 6.5, MOUTH);
    for (let k = 0; k < 2; k++) fmap(p, hx + 5, hy + 11 + k, k % 2 ? ['.32', '221'] : ['23.', '122'], { 3: REDB[3], 2: REDB[2], 1: REDB[1] });
    fmap(p, hx + 5, hy + 12, ['4332', '3221'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
    fmap(p, hx + 5.5, hy + 13, ['21', '21', '.1'], { 2: REDB[2], 1: REDB[1] });
  } else {
    p.rect(hx + 1, hy + 3, 2, 4, REDB[2]);
    p.rect(hx + 3, hy + 5, 5, 4, REDB[2]); p.rect(hx + 4, hy + 9, 4, 3, REDB[2]); p.rect(hx + 5, hy + 12, 2, 2, REDB[1]);
    p.rect(hx + 5, hy + 5, 3, 1, REDB[3]); p.px(hx + 4, hy + 7, REDB[3]); p.px(hx + 6, hy + 10, REDB[3]); p.px(hx + 5, hy + 9, REDB[1]);
    p.px(hx + 5, hy + 12, G[3]); p.px(hx + 6, hy + 12, G[2]); // Bartring
    p.px(hx + 7, hy + 6, talk ? MOUTH : REDB[1]);
  }
  if (p.fine) {
    // Helm: Kuppel 5-stufig mit Glanzlinie, Stirnreif mit goldenen Nieten, Nasal mit Grat
    dome(p, hx + 3.75, hy + 2.5, 3.9, 4.5, St, hy + 2);
    p.rect(hx, hy + 2, 8, 1, St[2]); p.rect(hx, hy + 2, 8, 0.5, St[4]); p.rect(hx + 0.5, hy + 2.5, 7.5, 0.5, St[1]);
    for (let x = hx + 1; x < hx + 8; x += 2) { p.dot(x, hy + 2, G[4]); p.dot(x + 0.5, hy + 2.5, G[1]); }
    fmap(p, hx + 6, hy + 3, ['54', '43', '42', '21'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
  } else {
    p.rect(hx, hy - 1, 8, 4, St[3]); p.rect(hx + 1, hy - 2, 6, 1, St[4]); p.rect(hx, hy - 1, 2, 4, St[4]); p.px(hx + 2, hy - 2, St[5]);
    p.rect(hx, hy + 2, 8, 1, St[2]); p.px(hx + 6, hy + 3, St[3]); p.px(hx + 6, hy + 4, St[3]); // Nasal
    for (let x = hx + 1; x < hx + 8; x += 2) p.px(x, hy + 2, G[2]);
  }
  // Flügel am Helm (weiße Federn, flattern leicht)
  const wf = Math.round(sw * 0.6);
  // Flügelfächer: drei Schwungfedern strahlen vom Helm nach hinten oben
  const feathers = [[-2.55, 6, WFUR[4], WFUR[3]], [-2.95, 6, WFUR[3], WFUR[2]], [2.95, 4, WFUR[2], WFUR[1]]];
  for (const [a0, len, c0, c1] of feathers) {
    const a = a0 + (a0 < 0 ? -1 : 1) * 0.08 * sw;
    if (p.fine) {
      // Feder: heller Kiel oben, Fahne darunter mit dunkler Kante, Spitze schmal
      for (let s = 0.5; s <= len + 0.01; s += 0.5) {
        const x = hx + 1.25 + Math.cos(a) * s, y = hy + 0.25 + Math.sin(a) * s;
        p.dot(x, y, c0);
        if (s < len - 0.5) { p.dot(x, y + 0.5, c1); p.dot(x, y + 1, s > 1.5 ? tone(c1, -0.25) : c1); }
      }
    } else {
      for (let s = 1; s <= len; s++) {
        const x = Math.round(hx + 1 + Math.cos(a) * s), y = Math.round(hy + Math.sin(a) * s);
        p.px(x, y, c0); if (s < len) p.px(x, y + 1, c1);
      }
    }
  }
  p.px(hx, hy - 1, St[4]); p.px(hx - 1, hy, WFUR[2]);
  p.px(hx + 7, hy - 3, WFUR[2]); p.px(hx + 8, hy - 4, WFUR[3]); p.px(hx + 8, hy - 3, WFUR[1]); p.px(hx + 9, hy - 5 - wf, WFUR[3]); // vorderer Flügel (verdeckt)
  if (p.fine) { p.dot(hx + 7.5, hy - 3.5, WFUR[4]); p.dot(hx + 8.5, hy - 4.5, WFUR[4]); p.dot(hx + 9.5, hy - 5.5 - wf, WFUR[4]); p.dot(hx + 8.5, hy - 2.5, WFUR[0]); }
  // hinterer Arm
  if (gest) {
    arm(p, cx - 2, ty + 1, cx + 5, ty - 1 - gest, GREYF[2], GREYF[3], null);
    if (p.fine) fist(p, cx + 5, ty - 2.5 - gest, SKIN_COLD);
    else { p.rect(cx + 5, ty - 2 - gest, 3, 3, SKIN_COLD[2]); p.px(cx + 7, ty - 2 - gest, SKIN_COLD[3]); }
  } else arm(p, cx - 5, ty + 2, cx - 5, ty + 9, GREYF[2], GREYF[3], SKIN_COLD[1]);
  // Bartaxt: Hand am Stiel, Kopf nach unten auf dem Boden (Ruhehaltung)
  const ax = cx + 7;
  if (p.fine) {
    shaft(p, ax, ty + 2, fy - 4, WOOD, 1);
    p.rect(ax, ty + 1, 2, 1, St[3]); p.rect(ax, ty + 1, 2, 0.5, St[5]);
    for (let y = ty + 7; y < ty + 10; y += 1) { p.rect(ax, y, 2, 0.5, L[2]); p.rect(ax, y + 0.5, 2, 0.5, L[0]); }   // Griffwicklung
    // Kopf: Öhr, Bart nach vorn mit Schneide (Glanzlinie), Glanzpunkt, Fase dunkel
    fmap(p, ax - 1, fy - 4, [
      '55443322',
      '44332211',
      '3322211.',
      '2211....',
    ], { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    fmap(p, ax + 2, fy - 7, [
      '43..',
      '443.',
      '3345',
      '33245',
      '322345',
      '322345',
      '32234w',
      '221345',
      '211345',
      '11.234',
      '...235',
      '...245',
      '....45',
      '....5.',
    ], { w: '#ffffff', 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
  } else {
    p.line(ax, ty + 2, ax, fy - 4, WOOD[3]); p.line(ax + 1, ty + 2, ax + 1, fy - 4, WOOD[1]);
    p.rect(ax, ty + 1, 2, 1, St[3]);
    p.rect(ax - 1, fy - 4, 4, 2, St[2]); p.px(ax - 1, fy - 4, St[4]);
    // Axtblatt (Bart nach vorn)
    p.rect(ax + 2, fy - 7, 2, 6, St[3]); p.rect(ax + 4, fy - 6, 1, 6, St[4]); p.px(ax + 5, fy - 5, St[4]); p.px(ax + 5, fy - 1, St[5]); p.px(ax + 4, fy, St[5]);
    p.px(ax + 2, fy - 7, St[4]); p.rect(ax + 2, fy - 2, 2, 1, St[2]);
  }
  arm(p, cx + 4, ty + 1, ax - 1, ty + 3, GREYF[3], GREYF[2], null);
  if (p.fine) fist(p, ax - 1, ty + 3, SKIN_COLD);
  else p.rect(ax - 1, ty + 3, 3, 2, SKIN_COLD[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Jägerin Sigrun
const PAINT = ['#24487a', '#3a6aa0'];
function drawSigrun(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Köcher auf dem Rücken
  p.line(cx - 7, ty - 3, cx - 3, ty + 9, L[2]); p.line(cx - 6, ty - 3, cx - 2, ty + 9, L[1]); p.line(cx - 8, ty - 2, cx - 4, ty + 9, L[3]);
  if (p.fine) {
    p.fline(cx - 8, ty - 2.5, cx - 4, ty + 8.5, tone(L[3], 0.25)); stitch(p, cx - 6.5, ty - 2, cx - 2.5, ty + 8.5, L[3], 3);
    p.fline(cx - 8, ty - 1, cx - 5.5, ty - 1.5, L[0]); p.fline(cx - 8, ty - 0.5, cx - 5.5, ty - 1, BRZ[3]);   // Rand mit Beschlag
    for (let i = 0; i < 3; i++) {
      const x = cx - 8 + i, y = ty - 5 - (i & 1);
      fmap(p, x, y, ['3.', '23', 'ww', 'w1', '1.'], { 3: '#b04a36', 2: '#8a3a2a', w: WFUR[3], 1: WFUR[1] });
    }
  } else for (let i = 0; i < 3; i++) { p.px(cx - 8 + i, ty - 4 - (i & 1), WFUR[3]); p.px(cx - 8 + i, ty - 5 - (i & 1), '#8a3a2a'); }
  // Pelzmantel weiß (bis Knie)
  skirt(p, cx, ty + 6, 32, 3.5, 5, WFUR, sw * 0.6, 3);
  legs(p, cx, fy, 31, ['#3a3a44', '#4a4a56', '#5e5e6a'], [WFUR[0], WFUR[1], WFUR[2]]);
  if (p.fine) { fur(p, cx - 3, fy - 3, 3, 1, [WFUR[0], WFUR[1], WFUR[2]], 1); fur(p, cx + 1, fy - 3, 3, 1, [WFUR[1], WFUR[2], WFUR[3]], 2); }
  else { p.rect(cx - 3, fy - 3, 3, 1, WFUR[2]); p.rect(cx + 1, fy - 3, 3, 1, WFUR[3]); }
  torso(p, cx - 3, ty, 7, 8, WFUR, 2);
  p.line(cx + 3, ty, cx - 3, ty + 6, L[1]); // Köcherriemen
  p.rect(cx - 3, ty + 6, 7, 1, L[1]); p.px(cx + 1, ty + 6, St[4]);
  if (p.fine) {
    p.fline(cx + 3, ty - 0.5, cx - 3, ty + 5.5, L[3]); stitch(p, cx + 2.5, ty + 1, cx - 2, ty + 5.5, L[2], 3);
    p.rect(cx - 3, ty + 6, 7, 0.5, L[2]); fmap(p, cx + 0.5, ty + 6, ['543', '4.2'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2] });
    fold(p, cx + 2, ty + 1, ty + 6, WFUR[1], WFUR[3]);
  }
  // Fellsaum
  if (p.fine) for (let x = cx - 5; x <= cx + 6.5; x += 1) { const s = sw * 0.6; p.dot(x + s, 32, WFUR[1]); p.dot(x + 0.5 + s, 32, WFUR[3]); p.dot(x + s, 32.5, WFUR[2]); }
  else for (let x = cx - 5; x <= cx + 6; x += 2) p.px(x + Math.round(sw * 0.6), 32, WFUR[1]);
  // Pelzkapuze + Gesicht mit Bemalung
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_COLD, talk, iris: '#3a6aa0', lash: true });
  if (p.fine) {
    // Bemalung als Band über das Auge; Auge (Weiß, Iris, Glanz) bleibt frei
    p.rect(hx + 3.5, hy + 4, 1, 1, PAINT[1]); p.rect(hx + 6, hy + 4, 1, 0.5, PAINT[1]); p.rect(hx + 4.5, hy + 5, 2, 0.5, PAINT[0]);
    fmap(p, hx + 4.5, hy + 4, ['wgk', '1ik'], { w: '#d6cabc', g: '#ffffff', k: EYE, i: PAINT[1], 1: SKIN_COLD[1] });
    // Haar blond in Strähnen unter der Kapuze
    fmap(p, hx + 1, hy + 1, ['33233232', '23123221', '2312....', '1221....', '.12.....'], { 3: BLOND[3], 2: BLOND[2], 1: BLOND[1] });
  } else {
    p.rect(hx + 4, hy + 4, 3, 1, PAINT[1]); p.px(hx + 5, hy + 4, EYE); // blaue Kriegsbemalung über dem Auge
    p.rect(hx + 1, hy + 1, 3, 3, BLOND[2]); p.px(hx + 4, hy + 1, BLOND[3]); p.px(hx + 5, hy + 1, BLOND[2]);
  }
  p.rect(hx, hy - 1, 7, 3, WFUR[3]); p.rect(hx - 1, hy + 1, 3, 7, WFUR[3]); p.rect(hx + 1, hy - 2, 5, 1, WFUR[4]);
  p.px(hx + 7, hy, WFUR[2]); p.px(hx + 7, hy + 1, WFUR[1]); p.px(hx - 1, hy + 1, WFUR[4]); p.px(hx - 1, hy + 7, WFUR[2]);
  if (p.fine) {
    // Pelzkapuze: Strähnen, Fellkrause um das Gesicht (gezackte Kante), Schatten innen
    fur(p, hx, hy - 1.5, 7, 1.5, WFUR, 0.5, 0.1);
    fur(p, hx - 1, hy + 1, 3, 6.5, [WFUR[1], WFUR[2], WFUR[3], WFUR[4]], 1.3);
    fmap(p, hx + 5, hy + 0.5, ['44343.', '.3.232', '....21'], { 4: WFUR[4], 3: WFUR[3], 2: WFUR[2], 1: WFUR[1] });
    fmap(p, hx + 2, hy + 1.5, ['323323', '2312..', '121...', '.1....'], { 3: BLOND[3], 2: BLOND[2], 1: BLOND[1] });
  }
  // Zopf vorn über der Schulter
  if (p.fine) {
    for (let k = 0; k < 4; k++) fmap(p, hx + 2 + k * 0.5, hy + 8 + k, k % 2 ? ['.32', '221'] : ['33.', '122'], { 3: BLOND[3], 2: BLOND[2], 1: BLOND[1] });
    fmap(p, hx + 4, hy + 12, ['32', '.2'], { 3: PAINT[1], 2: PAINT[0] });
  } else { p.px(hx + 2, hy + 8, BLOND[2]); p.px(hx + 3, hy + 9, BLOND[3]); p.px(hx + 3, hy + 10, BLOND[2]); p.px(hx + 4, hy + 11, BLOND[1]); p.px(hx + 4, hy + 12, PAINT[1]); }
  // hinterer Arm: Geste = zeigt nach vorn
  if (gest) {
    arm(p, cx - 1, ty + 1, cx + 5, ty - gest, WFUR[1], WFUR[2], null);
    if (p.fine) fmap(p, cx + 5, ty - 1.5 - gest, ['.....3', '333322', '33221.', '2211..', '.11...'], { 3: SKIN_COLD[3], 2: SKIN_COLD[2], 1: SKIN_COLD[1] });
    else { p.rect(cx + 5, ty - 1 - gest, 2, 2, SKIN_COLD[2]); p.px(cx + 7, ty - 1 - gest, SKIN_COLD[3]); }
  } else arm(p, cx - 3, ty + 1, cx - 3, ty + 7, WFUR[1], WFUR[2], SKIN_COLD[1]);
  // Langbogen vertikal in der vorderen Hand
  const bx = cx + 7, by = ty + 4;
  if (p.fine) {
    // Bogen: Holz in 4 Feinspalten mit Glanzlinie, Hornspitzen, Sehne als Feinlinie, Griff gewickelt
    for (let i = -15; i <= 14.6; i += 0.5) {
      const k = i / 15, x = Math.round((bx + (1 - k * k) * 2.5 - (Math.abs(k) > 0.85 ? -1 : 0)) * 2) / 2, y = by + i;
      p.dot(x, y, WOOD[3]); p.dot(x + 0.5, y, tone(WOOD[3], 0.2)); p.dot(x + 1, y, WOOD[2]); p.dot(x + 1.5, y, WOOD[1]);
    }
    fmap(p, bx - 1, by - 15, ['43', '32'], { 4: BN[4], 3: BN[3], 2: BN[2] }); fmap(p, bx - 1, by + 14, ['32', '21'], { 3: BN[3], 2: BN[2], 1: BN[1] });
    p.fline(bx, by - 14, bx, by + 13.5, '#e0d8c8');
    for (let y = by - 1; y < by + 2; y += 0.5) { p.dot(bx + 2, y, (y * 2) % 2 ? L[3] : L[2]); p.dot(bx + 2.5, y, (y * 2) % 2 ? L[2] : L[1]); p.dot(bx + 3, y, L[1]); p.dot(bx + 3.5, y, L[0]); }
  } else {
    for (let i = -15; i <= 14; i++) {
      const k = i / 15, x = Math.round(bx + (1 - k * k) * 2.5 - (Math.abs(k) > 0.85 ? -1 : 0)), y = by + i;
      p.px(x, y, WOOD[3]); p.px(x + 1, y, WOOD[1]);
    }
    p.px(bx - 1, by - 15, BN[3]); p.px(bx - 1, by + 14, BN[3]);
    p.line(bx, by - 14, bx, by + 13, '#d8d0c0');
    p.rect(bx + 2, by - 1, 2, 3, L[3]);
  }
  arm(p, cx + 3, ty + 1, bx + 1, by, WFUR[3], WFUR[2], null);
  if (p.fine) fist(p, bx + 1, by - 1, SKIN_COLD);
  else p.rect(bx + 1, by - 1, 3, 2, SKIN_COLD[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Pelzhändler Fenn
const COATP = ['#1e1a2a', '#2e2640', '#443a5a', '#5a4e74'];
function drawFenn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 20, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Pelzstapel auf dem Rücken (verschnürt), hängende Felle
  const px0 = cx - 13, py0 = ty - 5 + (b ? 0 : 1);
  for (let i = 0; i < 4; i++) {
    const P = PELTS[i % 3], y = py0 + i * 4, x = px0 - (i & 1);
    if (p.fine) {
      fur(p, x, y, 11, 4, [tone(P[0], -0.2), P[0], P[1], P[2]], i * 1.7, 0, true);
      p.rect(x, y, 11, 0.5, P[2]); p.dot(x - 1, y + 1, P[1]); p.dot(x - 0.5, y + 1, P[2]); p.dot(x - 1, y + 1.5, P[2]); p.dot(x - 0.5, y + 2, P[1]); p.dot(x - 1, y + 2.5, P[0]);
    } else {
      p.rect(x, y, 11, 4, P[1]); p.rect(x, y, 11, 1, P[2]); p.rect(x, y + 3, 11, 1, P[0]); p.px(x - 1, y + 1, P[1]); p.px(x - 1, y + 2, P[2]);
      for (let xx = x + 1; xx < x + 11; xx += 3) p.px(xx, y + 2, P[0]);
    }
  }
  p.rect(px0 + 3, py0, 1, 16, L[1]); p.rect(px0 + 8, py0, 1, 16, L[1]);
  if (p.fine) for (const sx of [px0 + 3, px0 + 8]) {
    p.rect(sx, py0, 0.5, 16, L[2]); for (let y = py0 + 1; y < py0 + 16; y += 4) { p.rect(sx, y, 1, 0.5, L[3]); }
    fmap(p, sx - 0.5, py0 + 7, ['433', '3.2', '321'], { 4: St[5], 3: St[4], 2: St[3], 1: St[2] });
  }
  // Fuchsschwänze baumeln unter dem Stapel
  for (const [ox, ph] of [[1, 0], [6, 1.7]]) {
    const tx = Math.round(Math.sin(t * TAU + ph) * 0.8);
    if (p.fine) {
      for (let s = 0; s < 5; s += 0.5) {
        const x = px0 + ox + (s > 2.5 ? tx * Math.min(1, (s - 2.5) / 1.5) : 0), y = py0 + 16 + s;
        p.dot(x, y, PELTS[2][2]); p.dot(x + 0.5, y, PELTS[2][s < 3 ? 1 : 2]); p.dot(x + 1, y, PELTS[2][1]); p.dot(x + 1.5, y, PELTS[2][0]);
      }
      fmap(p, px0 + ox + tx, py0 + 21, ['3443', '.43.'], { 4: WFUR[4], 3: WFUR[2] });
    } else {
      for (let s = 0; s < 5; s++) { const x = px0 + ox + (s > 2 ? tx : 0); p.px(x, py0 + 16 + s, PELTS[2][s < 3 ? 1 : 2]); p.px(x + 1, py0 + 16 + s, PELTS[2][0]); }
      p.px(px0 + ox + tx, py0 + 21, WFUR[3]);
    }
  }
  // Beine
  legs(p, cx, fy, 29, ['#2a241e', '#3a322a', '#4e443a'], [FUR[1], FUR[2], FUR[3]]);
  p.rect(cx + 1, fy - 3, 3, 1, FUR[4]);
  if (p.fine) { fur(p, cx + 1, fy - 3, 3, 1, [FUR[2], FUR[3], FUR[4]], 0.7); fur(p, cx - 3, fy - 3, 3, 1, [FUR[0], FUR[1], FUR[2]], 1.9); }
  // dicker Mantel mit Fellbesatz
  for (let y = ty; y <= ty + 12; y++) for (let x = cx - 3; x <= cx + 4; x++) {
    const i = x < cx - 1 ? 3 : x > cx + 2 ? 1 : 2;
    p.px(x, y, COATP[i]);
  }
  if (p.fine) { p.rect(cx - 3, ty, 0.5, 12, tone(COATP[3], 0.2)); fold(p, cx, ty + 8, ty + 12, COATP[1], COATP[3]); fold(p, cx - 1, ty + 2, ty + 6.5, COATP[1], COATP[3]); }
  p.line(cx + 2, ty + 1, cx + 2, ty + 12, FUR[3]); p.line(cx + 3, ty + 1, cx + 3, ty + 12, FUR[2]); // Fellbesatz vorn
  p.rect(cx - 3, ty + 12, 8, 1, FUR[3]);
  if (p.fine) { fur(p, cx + 2, ty + 1, 2, 11, [FUR[1], FUR[2], FUR[3], FUR[4]], 0.3); fur(p, cx - 3, ty + 12, 8, 1, [FUR[1], FUR[2], FUR[3], FUR[4]], 2.1); }
  p.rect(cx - 3, ty + 7, 5, 1, L[1]); p.px(cx - 2, ty + 7, St[4]);
  if (p.fine) { p.rect(cx - 3, ty + 7, 5, 0.5, L[2]); fmap(p, cx - 2.5, ty + 7, ['543', '3.2'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2] }); }
  p.rect(cx - 4, ty - 1, 9, 3, FUR[3]); p.rect(cx - 4, ty - 1, 9, 1, FUR[4]);
  if (p.fine) fur(p, cx - 4, ty - 1, 9, 2.5, FUR, 0.9);
  // Kopf: Pelzmütze mit Ohrenklappen, Wangen gerötet, Stoppelbart
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_COLD, talk });
  if (p.fine) {
    // gerötete Wange (weich gestuft), Stoppeln als flache dunklere Kinnfläche, Mund frei
    fmap(p, hx + 5.5, hy + 4.5, ['.r.', 'rRr'], { r: '#c8867a', R: '#d07a70' });
    fmap(p, hx + 3.5, hy + 6.5, ['..ss..', 'ssttss', '.sss..'], { s: '#8a6a60', t: '#7a5e54' });
    if (talk) fmap(p, hx + 5.5, hy + 6, ['mmm', '.m.'], { m: MOUTH }); else p.rect(hx + 5.5, hy + 6, 1.5, 0.5, '#6a4a44');
  } else { p.px(hx + 6, hy + 5, '#d07a70'); p.rect(hx + 4, hy + 7, 3, 1, '#6a5a4a'); p.px(hx + 6, hy + 6, talk ? MOUTH : '#6a5a4a'); }
  p.rect(hx, hy - 3, 8, 4, FUR[3]); p.rect(hx + 1, hy - 4, 6, 1, FUR[4]); p.rect(hx, hy - 3, 2, 4, FUR[4]);
  p.rect(hx, hy, 8, 1, FUR[2]); for (let x = hx + 1; x < hx + 8; x += 2) p.px(x, hy - 2, FUR[2]);
  p.rect(hx + 1, hy + 1, 2, 5, FUR[3]); p.px(hx + 1, hy + 6, FUR[2]); p.px(hx + 2, hy + 6 + Math.round(sw * 0.4), FUR[2]); // Ohrenklappe
  if (p.fine) {
    // Mütze: Kopfteil aus Fell in Strähnen, Krempenwulst, Ohrenklappe mit Fellspitzen, Bindeband
    fur(p, hx, hy - 3, 8, 3, FUR, 0.6, -0.08);
    fur(p, hx + 1, hy - 4, 6, 1, [FUR[2], FUR[3], FUR[4], tone(FUR[4], 0.2)], 1.4);
    fur(p, hx, hy - 0.5, 8, 1.5, [FUR[1], FUR[2], FUR[3], FUR[4]], 0.4);
    fur(p, hx + 1, hy + 1, 2, 5, [FUR[1], FUR[2], FUR[3], FUR[4]], 1.1);
    p.dot(hx + 2, hy + 6 + Math.round(sw * 0.4), L[2]); p.dot(hx + 2, hy + 6.5 + Math.round(sw * 0.4), L[1]);
  }
  // Arme
  arm(p, cx - 2, ty + 1, cx - 2, ty + 7, COATP[1], COATP[2], SKIN_COLD[1]);
  if (gest) {
    // hält ein Fuchsfell hoch
    const hx2 = cx + 7, hy2 = ty - 1 - gest;
    arm(p, cx + 3, ty + 1, hx2 - 1, hy2 + 1, COATP[2], COATP[1], null);
    const F = PELTS[2];
    if (p.fine) {
      fist(p, hx2 - 1, hy2, SKIN_COLD, true);
      fur(p, hx2 + 1, hy2 - 1, 4, 8, [F[0], F[1], F[1], F[2]], 0.5);
      p.rect(hx2 + 1, hy2 - 1, 0.5, 7.5, F[2]);
      fmap(p, hx2 + 1, hy2 - 2, ['32..12', '......'], { 3: F[2], 2: F[1], 1: F[0] });
      p.dot(hx2 + 3.5, hy2 + 0.5, '#1a0e08');   // Auge des Fells
      fmap(p, hx2 + 2, hy2 + 7, ['221.', '.22.', '.33.', '.44.'], { 2: F[1], 1: F[0], 3: F[2], 4: WFUR[4] });
    } else {
      p.rect(hx2 - 1, hy2, 2, 2, SKIN_COLD[2]);
      p.rect(hx2 + 1, hy2 - 1, 4, 8, F[1]); p.rect(hx2 + 1, hy2 - 1, 1, 8, F[2]); p.px(hx2 + 4, hy2 - 1, F[0]); p.px(hx2 + 1, hy2 - 2, F[2]); p.px(hx2 + 4, hy2 - 2, F[1]);
      p.px(hx2 + 2, hy2 + 7, F[1]); p.px(hx2 + 3, hy2 + 8, F[2]); p.px(hx2 + 3, hy2 + 9, WFUR[3]);
    }
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 5, COATP[2], COATP[1], null);
    // dampfender Metkrug
    p.rect(cx + 5, ty + 4, 3, 4, WOOD[2]); p.rect(cx + 5, ty + 4, 3, 1, BRASS[3]); p.rect(cx + 5, ty + 7, 3, 1, BRASS[2]); p.px(cx + 8, ty + 5, WOOD[1]); p.px(cx + 8, ty + 6, WOOD[1]);
    p.px(cx + 4, ty + 5, SKIN_COLD[2]);
    const st = (t * 2) % 1;
    if (p.fine) {
      // Daubenkrug: Dauben mit Fugen, Messingreifen mit Glanz, Henkel, Met-Schaum; Dampf feste Feinpixel
      p.rect(cx + 5, ty + 4.5, 0.5, 3, WOOD[3]); p.rect(cx + 6, ty + 5, 0.5, 2, WOOD[1]); p.rect(cx + 7, ty + 5, 0.5, 2, WOOD[1]); p.rect(cx + 7.5, ty + 5, 0.5, 2, WOOD[1]);
      p.rect(cx + 5, ty + 4, 3, 0.5, BRASS[4]); p.rect(cx + 5, ty + 4.5, 3, 0.5, BRASS[2]); p.dot(cx + 5.5, ty + 4, '#ffffff');
      p.rect(cx + 5, ty + 7, 3, 0.5, BRASS[3]); p.rect(cx + 5, ty + 7.5, 3, 0.5, BRASS[1]);
      p.rect(cx + 5.5, ty + 3.5, 2, 0.5, '#e8dcc0');
      fmap(p, cx + 8, ty + 4.5, ['21', '.1', '.1', '21'], { 2: WOOD[2], 1: WOOD[1] });
      fmap(p, cx + 4, ty + 5, ['32', '21', '.1'], { 3: SKIN_COLD[3], 2: SKIN_COLD[2], 1: SKIN_COLD[1] });
      const x1 = cx + 6 + Math.sin(st * 6) * 0.8, y1 = ty + 2 - st * 4, x2 = cx + 7 - Math.sin(st * 6) * 0.8, y2 = ty + 1 - ((st + 0.5) % 1) * 4;
      p.dot(x1, y1, '#b8bcc8'); p.dot(x1 + 0.5, y1 - 0.5, '#d0d4de'); p.dot(x2, y2, '#c0c4d0');
    } else {
      p.px(cx + 6 + Math.round(Math.sin(st * 6) * 0.8), ty + 2 - Math.round(st * 4), 'rgba(220,225,235,0.5)');
      p.px(cx + 7 - Math.round(Math.sin(st * 6) * 0.8), ty + 1 - Math.round(((st + 0.5) % 1) * 4), 'rgba(220,225,235,0.4)');
    }
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ GLUTÖDE
// ------------------------------------------------------------ Marschall Corvane
function drawCorvane(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 9 - b;
  // Umhang (dunkelrot, versengter Saum)
  if (p.fine) {
    // Kante glatt, Falten, Saum verkohlt (gezackt, dunkel) mit glimmenden Fasern
    const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 5 - (3 + k * 4 + sw * k); };
    const FK = [0.35, ty + 2, 0.72, ty + 5];   // Falten (Anteil, Startzeile)
    p.each(cx - 14, ty - 1, cx + 0.99, fy - 0.01, (x, y) => {
      const xl = left(y);
      if (x < xl - 0.25) return null;
      if (y > fy - 3) {
        const burn = fy - 2 + Math.sin(x * 2.9 + sw) * 0.6 + Math.sin(x * 7.3) * 0.35;
        if (y > burn + 0.6) return null;
        if (y > burn) return '#1a0a08';
      }
      let i = x < xl + 0.75 ? 2 : x > cx - 2 ? 0 : 1;
      for (let q = 0; q < 4; q += 2) {
        const f = FK[q], y0 = FK[q + 1];
        if (y < y0) continue;
        const xf = xl + (cx - 3 - xl) * f;
        if (Math.abs(x - xf) < 0.26) i = 0;
        else if (x < xf && x > xf - 0.76) i = 2;
      }
      if (x < xl + 0.5 && y < ty + 8) i = 3;
      return CR[i];
    });
    for (let x = cx - 11; x < cx - 4; x += 2) {
      const xx = x + sw, y = fy - 2 + Math.sin(xx * 2.9 + sw) * 0.6 + Math.sin(xx * 7.3) * 0.35 + 0.5;
      p.dot(xx, y, E[3]); p.dot(xx + 0.5, y, E[2]); g.dot(xx, y, E[4]); g.dot(xx + 0.5, y, E[2]); g.dot(xx, y - 0.5, E[1]);
    }
  } else {
    for (let y = ty - 1; y <= fy - 1; y++) {
      const k = (y - ty) / (fy - ty), back = Math.round(3 + k * 4 + sw * k);
      for (let x = cx - 5 - back; x <= cx; x++) {
        if (y >= fy - 2 && (x * 3 + y) % 4 === 0) continue;
        p.px(x, y, CR[x < cx - 4 - back ? 2 : x > cx - 2 ? 0 : 1]);
      }
    }
    for (let x = cx - 11; x < cx - 4; x += 2) { p.px(x + Math.round(sw), fy - 1, E[1]); g.px(x + Math.round(sw), fy - 1, E[1]); }
  }
  // schwere Plattenbeine
  p.rect(cx - 4, 28, 4, 7, St[1]); p.rect(cx + 1, 28, 4, 7, St[3]); p.rect(cx + 1, 28, 1, 7, St[4]);
  p.rect(cx + 1, 31, 4, 2, St[4]); p.px(cx + 2, 31, St[5]); // Kniekachel
  p.rect(cx - 5, fy - 2, 5, 3, St[0]); p.rect(cx + 1, fy - 2, 6, 3, St[2]); p.rect(cx + 1, fy - 2, 6, 1, St[4]);
  if (p.fine) {
    // Beinschienen: Glanzlinie, Kante dunkel, Kniekachel gewölbt mit Glanzpunkt, Sabatons geschuppt
    p.rect(cx + 1.5, 28, 0.5, 7, St[5]); p.rect(cx + 4.5, 28, 0.5, 7, St[1]); p.rect(cx - 4, 28, 0.5, 7, St[2]); p.rect(cx - 0.5, 28, 0.5, 7, St[0]);
    fmap(p, cx + 1, 30.5, ['.4443.', '455432', '444321', '.3221.', '..11..'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    p.dot(cx + 1.5, 31, '#ffffff'); p.dot(cx - 3, 31.5, St[2]); p.dot(cx - 2.5, 31.5, St[2]); p.rect(cx - 4, 32.5, 4, 0.5, St[0]);
    p.rect(cx + 1, fy - 2, 6, 0.5, St[5]); p.rect(cx + 1, fy - 1, 6, 0.5, St[1]); p.rect(cx + 1, fy - 0.5, 5, 0.5, St[3]); p.rect(cx + 1, fy + 0.5, 6, 0.5, St[0]);
    p.rect(cx - 5, fy - 2, 5, 0.5, St[2]); p.rect(cx - 5, fy - 0.5, 5, 0.5, St[1]);
  }
  // Brustharnisch
  torso(p, cx - 5, ty, 11, 10, St, 3);
  p.px(cx - 4, ty + 1, St[5]); p.px(cx - 3, ty + 2, St[5]);
  if (p.fine) { p.fline(cx - 4.5, ty + 0.5, cx - 2.5, ty + 2.5, '#ffffff'); p.fline(cx - 4.5, ty + 1.5, cx - 3, ty + 3, St[4]); }
  // Wappenrock rot-gold
  p.rect(cx - 3, ty + 2, 7, 14, CR[2]); p.rect(cx - 3, ty + 2, 1, 14, CR[3]); p.rect(cx + 3, ty + 2, 1, 14, CR[1]);
  p.rect(cx - 3, ty + 2, 7, 1, G[3]); p.rect(cx - 3, ty + 15, 7, 1, G[2]); p.px(cx - 3, ty + 16, G[1]); p.px(cx + 3, ty + 16, G[1]);
  if (p.fine) {
    // Wappenrock: Goldborte mit Glanz und Stich, Falten unten, Lichtkante
    p.rect(cx - 3, ty + 2, 0.5, 13, CR[4]); fold(p, cx + 2, ty + 11, ty + 15, CR[1], CR[3]); fold(p, cx - 1, ty + 12, ty + 15, CR[1], CR[3]);
    p.rect(cx - 3, ty + 2, 7, 0.5, G[4]); p.rect(cx - 3, ty + 2.5, 7, 0.5, G[2]);
    p.rect(cx - 3, ty + 15, 7, 0.5, G[3]); p.rect(cx - 3, ty + 15.5, 7, 0.5, G[1]);
    stitch(p, cx - 2.5, ty + 3.5, cx - 2.5, ty + 14.5, G[2], 3); stitch(p, cx + 3.5, ty + 3.5, cx + 3.5, ty + 14.5, G[1], 3);
  }
  // Wappen: goldene Flamme über Turm
  if (p.fine) {
    fmap(p, cx - 1, ty + 3.5, [
      '..4...',
      '..44..',
      '.4543.',
      '.4543.',
      '345432',
      '.3443.',
      '..32..',
      '2.2.21',
      '3333321',
      '34c3c21',
      '3333221',
      '3332221',
      '332k221',
    ], { 5: '#ffffff', 4: G[4], 3: G[3], 2: G[2], 1: G[1], c: CR[1], k: CR[0] });
  } else {
    p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 5, G[3]); p.px(cx + 1, ty + 5, G[3]); p.px(cx, ty + 5, G[4]); p.px(cx, ty + 6, G[3]);
    p.rect(cx - 1, ty + 7, 3, 3, G[2]); p.px(cx - 1, ty + 7, G[3]); p.px(cx + 1, ty + 7, G[3]); p.px(cx, ty + 9, CR[1]);
  }
  p.rect(cx - 5, ty + 10, 11, 2, L[1]); p.rect(cx - 1, ty + 10, 3, 2, G[3]); p.px(cx - 1, ty + 10, G[4]);
  if (p.fine) {
    p.rect(cx - 5, ty + 10, 11, 0.5, L[2]); p.rect(cx - 5, ty + 11.5, 11, 0.5, L[0]); stitch(p, cx - 4.5, ty + 11, cx - 1.5, ty + 11, L[3]);
    fmap(p, cx - 1, ty + 10, ['w44332', '43..21', '43..21', '322211'], { w: '#ffffff', 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
  }
  // Tassetten
  p.rect(cx - 5, ty + 12, 2, 3, St[2]); p.rect(cx + 4, ty + 12, 2, 3, St[1]);
  if (p.fine) for (let y = ty + 12; y < ty + 15; y += 1) { p.rect(cx - 5, y, 2, 0.5, St[4]); p.rect(cx + 4, y, 2, 0.5, St[3]); p.dot(cx - 4.5, y + 0.5, St[3]); }
  // Große Schulterplatten mit Goldrand
  for (const [sx, R] of [[cx - 5, [St[2], St[3], St[4], St[5]]], [cx + 5, [St[1], St[2], St[3], St[4]]]]) {
    if (p.fine) {
      dome(p, sx, ty + 0.5, 3.5, 3.5, [St[0], R[0], R[1], R[2], R[3]], ty + 2, sx < cx ? '#ffffff' : R[3]);
      p.rect(sx - 3, ty + 2, 7, 1, G[2]); p.rect(sx - 3, ty + 2, 7, 0.5, G[3]); p.dot(sx - 3, ty + 2, G[4]); p.dot(sx - 1, ty + 2, G[4]);
      p.rect(sx - 3, ty + 3, 7, 1, R[0]); p.rect(sx - 2, ty + 3, 5, 0.5, R[2]); p.rect(sx - 2, ty + 3.5, 5, 0.5, R[1]);
      p.dot(sx - 2, ty + 1, R[3]); p.dot(sx + 2, ty + 1, St[0]);   // Nieten
    } else {
      p.ellipse(sx, ty, 3.5, 3, R[1]); p.ellipse(sx - 1, ty - 1, 2, 1.5, R[2]); p.px(sx - 2, ty - 2, R[3]);
      p.rect(sx - 3, ty + 2, 7, 1, G[2]); p.px(sx - 3, ty + 2, G[3]);
      p.rect(sx - 3, ty + 3, 7, 1, R[0]); p.rect(sx - 2, ty + 3, 5, 1, R[1]);
    }
  }
  // Halsberge
  p.rect(cx - 3, ty - 2, 6, 2, St[3]); p.rect(cx - 3, ty - 2, 6, 1, St[4]);
  if (p.fine) { p.rect(cx - 3, ty - 2, 6, 0.5, St[5]); p.rect(cx - 3, ty - 1, 6, 0.5, St[4]); p.rect(cx - 3, ty - 0.5, 6, 0.5, St[2]); }
  // Kopf: graues Haar, kurzer Vollbart, Narben
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_OLD, talk: 0, brow: WHITEH[1], old: true });
  if (p.fine) {
    // Haar kurz in Strähnen zurückgekämmt, Bart gestutzt mit Kinnlinie, Mund frei, Narbe als Feinlinie über der Braue
    fmap(p, hx + 1, hy, ['.23332211...', '233222112111'], { 3: WHITEH[3], 2: WHITEH[2], 1: WHITEH[1] }); fur(p, hx + 1, hy + 1, 2, 4.5, WHITEH, 0.2, 0.05);
    p.each(hx + 3, hy + 5, hx + 8, hy + 9, (x, y) => {
      const rx = x - hx, ry = y - hy;
      if (rx < 3 || rx >= 8 || ry < 5 || ry >= 8.5) return null;
      if (ry >= 8 && (rx < 4 || rx >= 7)) return null;
      if (ry < 5.5 && rx >= 7) return null;
      const s = ((Math.floor((rx + Math.sin(ry * 2) * 0.4) * 2) % 3) + 3) % 3;
      return s === 0 ? WHITEH[0] : s === 2 && ry < 7 ? WHITEH[2] : WHITEH[1];
    });
    fmap(p, hx + 4.5, hy + 5, ['.2222', '22..2'], { 2: WHITEH[2] });
    p.rect(hx + 5.5, hy + 6, 1.5, 0.5, talk ? MOUTH : SKIN_OLD[0]); if (talk) p.dot(hx + 6, hy + 6.5, MOUTH);
    p.fline(hx + 4, hy + 2.5, hx + 5.5, hy + 1, '#8a4a40'); p.dot(hx + 4.5, hy + 2.5, '#c08070');
  } else {
    p.rect(hx + 1, hy, 6, 2, WHITEH[1]); p.rect(hx + 1, hy + 2, 2, 4, WHITEH[1]); p.px(hx + 3, hy, WHITEH[2]); p.px(hx + 4, hy, WHITEH[2]); p.px(hx + 1, hy + 1, WHITEH[0]);
    p.rect(hx + 3, hy + 5, 5, 3, WHITEH[1]); p.rect(hx + 4, hy + 8, 3, 1, WHITEH[0]); p.px(hx + 6, hy + 5, WHITEH[2]); p.px(hx + 4, hy + 6, WHITEH[2]);
    p.px(hx + 6, hy + 6, talk ? MOUTH : WHITEH[0]); if (talk) p.px(hx + 5, hy + 6, MOUTH);
    p.px(hx + 4, hy + 2, '#8a4a40'); p.px(hx + 5, hy + 1, '#8a4a40'); // Narbe über der Braue
  }
  // hinterer Arm (Geste: Panzerfaust nach vorn)
  if (gest) {
    arm(p, cx - 2, ty + 2, cx + 6, ty + 1 - gest, St[2], St[3], null);
    if (p.fine) fmap(p, cx + 6, ty - gest, ['544321', '432211', '433221', '.2211.'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    else { p.rect(cx + 6, ty - gest, 3, 3, St[3]); p.px(cx + 8, ty - gest, St[5]); }
  }
  // Zweihänder vor sich aufgestützt, Hände auf dem Knauf (Hüfthöhe)
  const swx = cx + 7, gy = ty + 10;
  if (p.fine) {
    // Klinge: Schneide hell mit Glanzlinie, Hohlkehle dunkel, Runen glühen mit hellem Kern
    p.rect(swx, gy + 2, 0.5, fy - gy - 2, St[5]); p.rect(swx + 0.5, gy + 2, 0.5, fy - gy - 2, St[4]);
    p.rect(swx + 1, gy + 2, 0.5, fy - gy - 2, St[2]); p.rect(swx + 1.5, gy + 2, 0.5, fy - gy - 2, St[3]);
    p.dot(swx, gy + 2, '#ffffff'); p.dot(swx + 0.5, fy, St[2]); p.dot(swx + 1, fy, St[1]);
  } else {
    p.rect(swx, gy + 2, 2, fy - gy - 2, St[3]); p.rect(swx, gy + 2, 1, fy - gy - 2, St[4]); p.px(swx + 1, fy, St[2]); p.px(swx, fy, St[4]);
    p.px(swx, gy + 2, St[5]);
  }
  for (let i = 0; i < 3; i++) {
    const ry = gy + 4 + i * 3, on = Math.sin(t * TAU + i) > -0.3 ? 1 : 0;
    if (p.fine) {
      fmap(p, swx + 1, ry - 0.5, on ? ['4', '5', '4'] : ['2', '3', '2'], { 5: E[5], 4: E[4], 3: E[3], 2: E[2] });
      if (on) { g.dot(swx + 1, ry - 0.5, E[3]); g.dot(swx + 1, ry, E[5]); g.dot(swx + 1, ry + 0.5, E[3]); g.dot(swx + 1.5, ry, E[2]); g.dot(swx + 0.5, ry, E[2]); }
      else { g.dot(swx + 1, ry, E[1]); }
    } else { p.px(swx + 1, ry, on ? E[4] : E[2]); g.px(swx + 1, ry, on ? E[4] : E[1]); }
  }
  p.rect(swx - 3, gy, 8, 2, G[2]); p.rect(swx - 3, gy, 8, 1, G[3]); p.px(swx - 3, gy + 1, G[1]); p.px(swx + 4, gy + 1, G[1]); p.px(swx - 3, gy, G[4]);
  p.rect(swx, gy - 4, 2, 4, L[1]); p.px(swx, gy - 3, L[3]); p.px(swx, gy - 1, L[3]);
  p.rect(swx - 1, gy - 6, 4, 2, G[3]); p.px(swx - 1, gy - 6, G[4]); p.px(swx, gy - 5, CR[4]);
  if (p.fine) {
    // Parierstange mit Glanzlinie und Endknöpfen, Griff schräg gewickelt, Knauf mit Rubin
    fmap(p, swx - 3, gy, ['w4444443333332', '43333332222221', '23222222111112', '.111111100001.'], { w: '#ffffff', 4: G[4], 3: G[3], 2: G[2], 1: G[1], 0: G[0] });
    for (let y = gy - 4; y < gy; y += 1) { p.fline(swx, y + 0.5, swx + 1.5, y, L[3]); p.fline(swx, y + 1, swx + 1.5, y + 0.5, L[0]); }
    fmap(p, swx - 1, gy - 6, ['.444331.', '44rR3321', '3332221.', '.2211...'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1], r: CR[4], R: '#ff9090' });
  }
  if (!gest) arm(p, cx - 4, ty + 3, swx - 2, gy - 6, St[1], St[2], null);
  arm(p, cx + 4, ty + 3, swx - 1, gy - 6, St[3], St[2], null);
  p.rect(swx - 1, gy - 7, 4, 2, St[3]); p.px(swx - 1, gy - 7, St[5]); p.px(swx + 2, gy - 6, St[1]); // Panzerhandschuhe
  if (p.fine) fmap(p, swx - 1, gy - 7, ['w5443.', '443321', '.32211'], { w: '#ffffff', 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Pilger Aldo
const ROPE = ['#5a4a32', '#6a5a42', '#8a7a5a', '#a8986e'];
function drawAldo(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 16, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // zerschlissene Robe (ausgefranster Saum, Löcher)
  skirt(p, cx, ty + 3, fy - 1, 3.5, 6, ROBE, sw * 0.7, 3, true);
  if (p.fine) {
    // Risse als kleine ausgefranste Löcher, Flicken mit grober Naht
    const hole = (x, y) => fmap(p, x, y, ['.10', '100', '.1.'], { 1: ROBE[1], 0: ROBE[0] });
    hole(cx - 2.5, ty + 10); hole(cx + 2.5, ty + 13); hole(cx - 4.5, ty + 14);
    p.rect(cx + 1, ty + 7, 2, 2, '#5a4a36'); p.rect(cx + 1, ty + 7, 2, 0.5, '#6e5c44'); p.rect(cx + 1, ty + 7, 0.5, 2, '#6e5c44');
    p.rect(cx + 2.5, ty + 7.5, 0.5, 1.5, '#3e3226'); p.rect(cx + 1.5, ty + 8.5, 1, 0.5, '#3e3226'); p.dot(cx + 1.5, ty + 7.5, ROPE[2]); p.dot(cx + 2.5, ty + 7, ROPE[2]);
  } else {
    p.px(cx - 2, ty + 10, ROBE[0]); p.px(cx + 3, ty + 13, ROBE[0]); p.px(cx - 4, ty + 14, ROBE[0]);
    p.rect(cx + 1, ty + 7, 2, 2, '#5a4a36'); p.px(cx + 1, ty + 7, '#6e5c44'); // Flicken
  }
  // Fußwickel
  p.rect(cx - 3, fy - 1, 3, 2, '#6a6050'); p.rect(cx + 2, fy - 1, 4, 2, '#8a7e68'); p.px(cx + 5, fy, '#6a6050');
  if (p.fine) {
    for (let x = cx + 2; x < cx + 6; x += 1) p.fline(x, fy + 0.5, x + 0.5, fy - 1, '#6a6050');
    for (let x = cx - 3; x < cx; x += 1) p.fline(x, fy + 0.5, x + 0.5, fy - 1, '#4a4238');
    p.rect(cx + 2, fy - 1, 4, 0.5, '#a89a80'); p.rect(cx - 3, fy + 0.5, 3, 0.5, '#2a2620'); p.rect(cx + 2, fy + 0.5, 4, 0.5, '#3a3428');
  }
  // Oberkörper gebeugt, Strick als Gürtel
  torso(p, cx - 4, ty, 8, 5, ROBE, 2);
  p.rect(cx - 4, ty + 4, 9, 1, ROPE[2]); p.px(cx - 3, ty + 5, ROPE[2]); p.px(cx - 3, ty + 6 + Math.round(sw * 0.4), ROPE[1]);
  if (p.fine) {
    // Strick gedreht: schräge Windungen, Knoten, Ende ausgefranst
    for (let x = cx - 4; x < cx + 5; x += 1) { p.dot(x, ty + 4, ROPE[3]); p.dot(x + 0.5, ty + 4.5, ROPE[1]); p.dot(x + 0.5, ty + 4, ROPE[2]); p.dot(x, ty + 4.5, ROPE[2]); }
    const e = Math.round(sw * 0.4) * 0.5;
    fmap(p, cx - 3.5, ty + 4, ['.33.', '3221', '.21.'], { 3: ROPE[3], 2: ROPE[2], 1: ROPE[0] });
    fmap(p, cx - 3 + e, ty + 5.5, ['32', '21', '21', '1.', '.1'], { 3: ROPE[3], 2: ROPE[2], 1: ROPE[1] });
  }
  // Gebetskette
  if (p.fine) {
    for (let i = 0; i < 9; i++) {
      const k = i / 8, x = cx - 1 + k * 4, y = ty + 1 + Math.sin(k * Math.PI) * 2;
      if (i % 2) p.dot(x, y, '#3a2418');
      else { p.dot(x, y, i === 4 ? '#e8d090' : '#7a5040'); p.dot(x, y + 0.5, i === 4 ? '#a88a40' : '#4a2a1e'); }
    }
    fmap(p, cx + 1, ty + 3.5, ['.4.', '434', '.3.', '.2.'], { 4: BN[4], 3: BN[3], 2: BN[2] });
  } else {
    for (let i = 0; i < 5; i++) p.px(cx - 1 + i, ty + 1 + Math.round(Math.sin(i / 4 * Math.PI) * 2), i === 2 ? '#c8b070' : '#5a3a2a');
    p.px(cx + 1, ty + 4, BN[3]); p.px(cx + 1, ty + 5, BN[2]);
  }
  // Kapuze + Gesicht (hager, grauer Stoppelbart)
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk, old: true });
  if (p.fine) {
    // eingefallene Wange, grauer Stoppelbart als flache Kinnfläche, Mund frei
    p.dot(hx + 4.5, hy + 5.5, SKIN_OLD[1]); p.dot(hx + 4, hy + 6, SKIN_OLD[1]);
    fmap(p, hx + 3.5, hy + 6.5, ['..bbb.', 'bbaab.', '.bbb..'], { a: WHITEH[0], b: '#8a7c78' });
    if (talk) fmap(p, hx + 5.5, hy + 6, ['mmm', '.m.'], { m: MOUTH }); else p.rect(hx + 5.5, hy + 6, 1.5, 0.5, SKIN_OLD[0]);
  } else { p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.rect(hx + 4, hy + 7, 3, 1, WHITEH[1]); p.px(hx + 6, hy + 6, talk ? MOUTH : WHITEH[0]); }
  p.rect(hx, hy - 1, 7, 3, ROBE[3]); p.rect(hx - 1, hy + 1, 4, 8, ROBE[3]); p.rect(hx + 1, hy - 2, 5, 1, ROBE[4]);
  p.px(hx + 7, hy, ROBE[3]); p.px(hx + 7, hy + 1, ROBE[2]); p.px(hx + 7, hy + 2, ROBE[2]); p.px(hx - 1, hy + 1, ROBE[4]);
  p.px(hx + 6, hy + 1, ROBE[1]); p.px(hx - 2, hy + 3, ROBE[2]); p.px(hx - 2, hy + 6, ROBE[1]); // ausgefranst
  if (p.fine) {
    // Kapuze: Saum mit Lichtkante, Schatten innen, Falten, Fransen als Fäden
    p.rect(hx + 1, hy - 2, 4.5, 0.5, tone(ROBE[4], 0.15)); p.rect(hx - 1, hy + 1, 0.5, 7.5, ROBE[4]);
    p.rect(hx + 3, hy + 1.5, 3.5, 0.5, ROBE[1]); p.rect(hx + 2.5, hy + 1.5, 0.5, 7, ROBE[2]);
    fold(p, hx + 1, hy, hy + 8.5, ROBE[2], ROBE[4]); p.fline(hx + 2.5, hy - 1, hx + 6, hy, ROBE[2]);
    p.dot(hx - 1.5, hy + 3.5, ROBE[2]); p.dot(hx - 1.5, hy + 6.5, ROBE[1]); p.dot(hx - 0.5, hy + 9, ROBE[2]); p.dot(hx + 1, hy + 9, ROBE[1]);
  }
  // Hakenstab mit hängender Laterne (Licht bei dx 5, dy -16)
  const stx = cx + 5, top = 13 - b;
  if (p.fine) {
    shaft(p, stx, top, fy, WOOD, 2);
    fmap(p, stx + 1, top - 2, ['.3332.', '32..21', '2....1', '.....1'], { 3: WOOD[3], 2: WOOD[2], 1: WOOD[1] });
    p.dot(stx + 3, top - 2, tone(WOOD[3], 0.25));
  } else {
    p.line(stx, top, stx, fy, WOOD[3]); p.line(stx + 1, top, stx + 1, fy, WOOD[1]);
    p.px(stx + 1, top - 1, WOOD[3]); p.px(stx + 2, top - 2, WOOD[3]); p.px(stx + 3, top - 2, WOOD[2]); p.px(stx + 4, top - 1, WOOD[2]); p.px(stx + 4, top, WOOD[1]);
  }
  const lx = AX + 5 + Math.round(sw * 0.6), ly = top + 3;
  p.line(stx + 4, top + 1, lx, ly - 1, '#6a5a40');
  const fl = Math.sin(t * TAU * 3) > 0 ? 1 : 0;
  if (p.fine) {
    // Laterne: Messingdach mit Glanz, Streben, Glas, Flamme mit weißem Kern; Leuchtebene fein
    p.fline(stx + 4.25, top + 1.25, lx + 0.25, ly - 0.75, '#8a7a58');
    fmap(p, lx - 2, ly - 1, ['....43....', '.44433221.', '4433332211'], { 4: BRZ[4], 3: BRZ[3], 2: BRZ[2], 1: BRZ[1] });
    p.rect(lx - 2, ly + 1, 5, 4, '#2a1a0a');
    p.rect(lx - 1, ly + 1, 3, 4, E[3]); p.rect(lx - 1, ly + 1, 0.5, 4, E[2]); p.rect(lx + 1.5, ly + 1, 0.5, 4, E[2]);
    fmap(p, lx - 0.5, ly + 1.5 + fl * 0.5, ['.4', '454', '454', '.4.'], { 5: E[5], 4: E[4] });
    p.dot(lx, ly + 2 + fl * 0.5, '#ffffff');
    p.rect(lx - 2, ly + 1, 0.5, 4, BRZ[3]); p.rect(lx - 1.5, ly + 1, 0.5, 4, BRZ[2]); p.rect(lx + 2, ly + 1, 1, 4, BRZ[1]);
    p.dot(lx - 1, ly + 1.5, '#fff0c0');
    p.rect(lx - 2, ly + 5, 5, 1, BRZ[1]); p.rect(lx - 2, ly + 5, 5, 0.5, BRZ[2]); p.dot(lx, ly + 6, BRZ[1]); p.dot(lx + 0.5, ly + 6, BRZ[0]);
    g.rect(lx - 2, ly + 1, 5, 4, E[1]); g.rect(lx - 1, ly + 1, 3, 4, E[2]);
    g.rect(lx - 0.5, ly + 1.5 + fl * 0.5, 1.5, 2, E[4]); g.dot(lx, ly + 2 + fl * 0.5, E[5]); g.dot(lx, ly + 2.5 + fl * 0.5, E[5]);
  } else {
    p.px(lx, ly - 1, BRZ[2]); p.rect(lx - 2, ly, 5, 1, BRZ[3]); p.rect(lx - 2, ly + 1, 5, 4, '#2a1a0a');
    p.rect(lx - 2, ly + 1, 1, 4, BRZ[2]); p.rect(lx + 2, ly + 1, 1, 4, BRZ[1]); p.rect(lx - 2, ly + 5, 5, 1, BRZ[1]); p.px(lx, ly + 6, BRZ[1]);
    p.rect(lx - 1, ly + 1, 3, 4, E[3]); p.px(lx, ly + 2 + fl, E[5]); p.px(lx, ly + 3, E[4]);
    g.rect(lx - 2, ly + 1, 5, 4, E[1]); g.rect(lx - 1, ly + 1, 3, 4, E[3]); g.px(lx, ly + 2 + fl, E[5]); g.px(lx, ly + 3, E[4]);
  }
  // Arme: vorn am Stab, hinten Geste (segnend) / an der Brust
  arm(p, cx + 1, ty + 1, stx - 1, ty + 3, ROBE[3], ROBE[2], null);
  if (p.fine) fist(p, stx - 1, ty + 2, SKIN_OLD);
  else p.rect(stx - 1, ty + 2, 3, 2, SKIN_OLD[2]);
  if (gest) {
    arm(p, cx - 2, ty + 1, cx + 2, ty - 2 - gest, ROBE[2], ROBE[3], null);
    if (p.fine) fmap(p, cx + 2.5, ty - 3.5 - gest, ['3.3', '323', '322', '21.'], { 3: SKIN_OLD[3], 2: SKIN_OLD[2], 1: SKIN_OLD[1] });
    else { p.px(cx + 3, ty - 2 - gest, SKIN_OLD[3]); p.px(cx + 3, ty - 3 - gest, SKIN_OLD[2]); }
  } else {
    arm(p, cx - 3, ty + 1, cx, ty + 3, ROBE[2], ROBE[1], null);
    if (p.fine) fmap(p, cx + 1, ty + 3, ['32', '21'], { 3: SKIN_OLD[3], 2: SKIN_OLD[2], 1: SKIN_OLD[1] });
    else p.px(cx + 1, ty + 3, SKIN_OLD[2]);
  }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: lx - AX, dy: ly + 3 - AY } };
}

// ------------------------------------------------------------ Quartiermeisterin Ryn
const RHAIR = ['#1a0e0a', '#2a1a14', '#4a3024', '#5e3e2e'];
function drawRyn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Umhängetasche hinten
  p.rect(cx - 8, ty + 6, 5, 5, L[2]); p.rect(cx - 8, ty + 6, 5, 1, L[3]); p.rect(cx - 8, ty + 10, 5, 1, L[1]); p.px(cx - 6, ty + 7, BRASS[3]);
  p.px(cx - 7, ty + 5, PAPER[1]); p.px(cx - 5, ty + 5, PAPER[2]);
  if (p.fine) {
    // Tasche: Klappe mit Naht, Schnalle mit Glanz, Kratzer; Papierrollen mit Schrift
    p.rect(cx - 8, ty + 6, 5, 0.5, tone(L[3], 0.25)); p.rect(cx - 8, ty + 8.5, 5, 0.5, L[1]);
    stitch(p, cx - 7.5, ty + 8, cx - 3.5, ty + 8, L[3]); p.rect(cx - 8, ty + 6.5, 0.5, 4, L[3]);
    fmap(p, cx - 6.5, ty + 7, ['443', '3.2', '321'], { 4: BRASS[4], 3: BRASS[3], 2: BRASS[2], 1: BRASS[1] });
    p.fline(cx - 4.5, ty + 9, cx - 3.5, ty + 9.5, L[1]);
    fmap(p, cx - 7, ty + 4.5, ['21..33', '1.1.32'], { 3: PAPER[2], 2: PAPER[1], 1: PAPER[0] });
  }
  // Beine + Stiefel
  legs(p, cx, fy, 29, ASHC, ['#141012', '#221a18', '#3a2c26']);
  p.px(cx + 1, 31, L[2]); p.px(cx + 2, 31, L[2]);
  if (p.fine) { p.rect(cx + 1, 31, 2, 0.5, L[3]); p.dot(cx + 2.5, 31.5, BRASS[3]); }
  // Gambeson (aschgrau, gesteppt), orange Schärpe
  torso(p, cx - 3, ty, 7, 11, ASHC, 2);
  if (p.fine) {
    // Steppnähte als Punktlinien, darunter je ein gepolsterter Wulst (Licht oben, Schatten unten)
    for (let y = ty + 2; y < ty + 11; y += 3) {
      stitch(p, cx - 2.5, y, cx + 2.5, y, ASHC[0]); p.rect(cx - 2, y + 0.5, 4.5, 0.5, ASHC[3]); p.rect(cx - 2, y - 0.5, 4.5, 0.5, ASHC[1]);
    }
    for (const x of [cx - 1, cx + 1.5]) stitch(p, x, ty + 0.5, x, ty + 10.5, ASHC[1], 3);
  } else for (let y = ty + 2; y < ty + 11; y += 3) p.rect(cx - 2, y, 5, 1, ASHC[1]);
  p.rect(cx - 3, ty + 11, 7, 1, ASHC[1]);
  p.line(cx + 3, ty, cx - 3, ty + 6, E[2]); p.line(cx + 3, ty + 1, cx - 2, ty + 6, E[1]); // Schärpe
  if (p.fine) { p.fline(cx + 3, ty - 0.5, cx - 3, ty + 5.5, E[3]); p.fline(cx + 2, ty + 2, cx - 1, ty + 5, E[1]); }
  p.rect(cx - 3, ty + 7, 7, 1, L[0]); p.px(cx + 2, ty + 7, BRASS[3]);
  if (p.fine) { p.rect(cx - 3, ty + 7, 7, 0.5, L[1]); fmap(p, cx + 1.5, ty + 7, ['443', '3.1'], { 4: BRASS[4], 3: BRASS[3], 1: BRASS[1] }); }
  // Schlüsselring und Tintenfass am Gürtel
  if (p.fine) {
    p.ellipseFine(cx - 2.75, ty + 8.25, 0.8, 0.8, (nx, ny, d) => (d < 0.3 ? null : nx + ny < 0 ? St[4] : St[2]));
    fmap(p, cx - 2.5, ty + 8.5, ['..5', '.43', '.3.', '42.', '3..'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2] });
    fmap(p, cx + 2, ty + 8, ['.kk.', 'aggb', 'ab1b', 'abbb'], { k: '#2a1a14', a: '#3a3a5a', g: '#9aa0c8', b: '#1a1a2a', 1: '#26263e' });
  } else {
    p.px(cx - 3, ty + 8, St[4]); p.px(cx - 2, ty + 9, St[3]);
    p.rect(cx + 2, ty + 8, 2, 2, '#1a1a2a'); p.px(cx + 2, ty + 8, '#3a3a5a');
  }
  // Kopf: Haar zum Dutt, Brillengläser
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk, lash: true });
  if (p.fine) {
    // Haar straff nach hinten (Strähnen zum Dutt), Dutt gewickelt mit Glanz, Haarnadel mit Kugel
    fmap(p, hx + 1, hy, ['.23332211...', '233222111211'], { 3: RHAIR[3], 2: RHAIR[2], 1: RHAIR[1] }); fur(p, hx + 1, hy + 1, 2, 3.5, RHAIR, 0.9, 0.05);
    p.dot(hx + 6.5, hy + 2, RHAIR[1]); p.dot(hx + 6, hy + 2, RHAIR[2]);
    p.ellipse(hx, hy + 1, 2, 2, (nx, ny, d) => {
      const a = Math.atan2(ny, nx) + d * 3;
      const s = ((Math.floor(a * 2.2) % 3) + 3) % 3;
      if (d > 0.7 && nx + ny > 0.3) return RHAIR[0];
      return s === 0 ? RHAIR[1] : nx + ny < -0.2 ? RHAIR[3] : RHAIR[2];
    });
    p.fline(hx - 1, hy - 2, hx + 2, hy + 1, '#c8a060'); p.dot(hx - 1, hy - 2, '#fff0c0'); p.dot(hx - 0.5, hy - 2, '#e8c080');
    // Brille: runde Messingfassung um das Auge, Glas mit Glanzpunkt, Bügel zum Ohr
    fmap(p, hx + 4, hy + 3, [
      '.333.',
      '3...3',
      '3...3',
      '3...3',
      '.322.',
    ], { 3: BRASS[3], 2: BRASS[2] });
    p.dot(hx + 5.5, hy + 3.5, '#d8e8f8'); p.dot(hx + 6, hy + 3.5, '#b8c8d8');
    p.fline(hx + 2.5, hy + 3.5, hx + 3.5, hy + 4, BRASS[2]);
  } else {
    p.rect(hx + 1, hy, 6, 2, RHAIR[1]); p.rect(hx + 1, hy + 2, 2, 3, RHAIR[1]); p.px(hx + 3, hy, RHAIR[2]); p.px(hx + 6, hy + 2, RHAIR[1]);
    p.ellipse(hx, hy + 1, 2, 2, RHAIR[1]); p.px(hx - 1, hy, RHAIR[2]); // Dutt
    p.line(hx - 1, hy - 2, hx + 2, hy + 1, '#c8a060'); // Haarnadel
    p.px(hx + 5, hy + 4, EYE); p.px(hx + 6, hy + 4, '#b8c8d8'); p.px(hx + 4, hy + 4, BRASS[3]); p.px(hx + 7, hy + 4, BRASS[3]); p.rect(hx + 5, hy + 5, 2, 1, BRASS[2]); p.px(hx + 3, hy + 3, BRASS[2]); // Brille
  }
  // Klemmbrett (vorn, schräg), Schreibfeder in der hinteren Hand
  const bx = cx + 4, by = ty + 2 - (gest ? 1 : 0);
  p.rect(bx, by, 6, 8, WOOD[3]); p.rect(bx + 1, by + 1, 4, 6, PAPER[2]); p.rect(bx + 1, by + 1, 4, 1, PAPER[1]);
  p.rect(bx + 2, by - 1, 2, 1, St[3]);
  if (p.fine) {
    // Brett gemasert, Klemme aus Stahl mit Glanz, Papier mit Schriftzeilen, rotes Siegel mit Licht
    p.rect(bx, by, 0.5, 8, tone(WOOD[3], 0.2)); p.rect(bx + 5.5, by, 0.5, 8, WOOD[2]); p.rect(bx, by + 7.5, 6, 0.5, WOOD[1]);
    p.rect(bx + 1, by + 1, 4, 0.5, PAPER[1]); p.rect(bx + 4.5, by + 1.5, 0.5, 5.5, PAPER[1]);
    for (let i = 0; i < 4; i++) { const y = by + 2.5 + i * 1.1, w = [3, 2.5, 3, 1.5][i]; for (let x = bx + 1.5; x < bx + 1.5 + w; x += 0.5) if ((x * 2 + i) % 5) p.dot(x, y, PAPER[0]); }
    fmap(p, bx + 1.5, by - 1, ['.5443.', '433221', '.2112.'], { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
    fmap(p, bx + 3.5, by + 5.5, ['.43', '432', '.2.'], { 4: '#d05a3a', 3: '#a83a24', 2: '#7a2216' });
  } else {
    for (let i = 0; i < 3; i++) p.rect(bx + 1, by + 3 + i * 1.5, 3 - (i % 2), 1, PAPER[0]);
    p.px(bx + 4, by + 6, '#8a2a1a'); // Siegel
  }
  arm(p, cx + 3, ty + 1, bx, by + 4, ASHC[3], ASHC[2], null);
  if (p.fine) fist(p, bx - 1, by + 4, SKIN, true);
  else p.rect(bx - 1, by + 4, 2, 2, SKIN[2]);
  const wr = gest ? 0 : Math.round(Math.sin(t * TAU * 2));
  // Feder: Kiel als Feinlinie, Fahne mit Ästen, helle Spitze
  const quill = (x0, y0, x1, y1) => {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      p.dot(x, y, i < 2 ? '#8a8070' : '#c8c0b0');
      if (i > 1) { p.dot(x - 0.5, y, '#e8e0d0'); p.dot(x + 0.5, y + 0.5, i % 2 ? '#d8d0c0' : '#fffbef'); if (i > 3) p.dot(x - 0.5, y - 0.5, '#fffbef'); }
    }
    p.dot(x1 + 0.5, y1 - 0.5, '#fffbef');
  };
  if (gest) {
    // Feder zeigt auffordernd nach vorn
    const qx = bx + 7, qy = by - 1 - gest;
    arm(p, cx - 1, ty + 1, qx - 2, qy + 2, ASHC[2], ASHC[3], null);
    if (p.fine) { quill(qx - 1, qy + 2.5, qx + 3, qy - 2.5); fist(p, qx - 2, qy + 2, SKIN, true); }
    else {
      p.rect(qx - 2, qy + 2, 2, 2, SKIN[3]);
      p.line(qx - 1, qy + 2, qx + 3, qy - 2, '#e8e0d0'); p.px(qx + 2, qy - 2, '#fffbef'); p.px(qx + 3, qy - 3, '#d8d0c0'); p.px(qx + 1, qy, '#c8c0b0');
    }
  } else {
    arm(p, cx - 1, ty + 1, bx + 1 + wr, by + 4, ASHC[2], ASHC[3], null);
    if (p.fine) { quill(bx + 2 + wr, by + 4.5, bx + 5 + wr, by - 1.5); fist(p, bx + 1 + wr, by + 4, SKIN, true); }
    else {
      p.rect(bx + 1 + wr, by + 4, 2, 2, SKIN[3]);
      p.line(bx + 2 + wr, by + 4, bx + 5 + wr, by - 1, '#e8e0d0'); p.px(bx + 5 + wr, by - 2, '#fffbef'); p.px(bx + 6 + wr, by - 2, '#d8d0c0'); p.px(bx + 4 + wr, by, '#c8c0b0');
    }
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Animationen (idle 6 Frames, talk 4 Frames)
function makeSet(draw) {
  const idle = new Animation(phases(6).map((t) => mkFrame((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mkFrame((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 1 })),
  ], 6);
  return { idle, talk };
}

export function createNpcSprites3() {
  return {
    captain_varra: makeSet(drawVarra),
    stablemaster_orla: makeSet(drawOrla),
    nomad_kesh: makeSet(drawKesh),
    trader_imra: makeSet(drawImra),
    warden_thane: makeSet(drawThane),
    alchemist_brisa: makeSet(drawBrisa),
    trader_moll: makeSet(drawMoll),
    jarl_eskil: makeSet(drawEskil),
    hunter_sigrun: makeSet(drawSigrun),
    trader_fenn: makeSet(drawFenn),
    marshal_corvane: makeSet(drawCorvane),
    pilgrim_aldo: makeSet(drawAldo),
    quartermaster_ryn: makeSet(drawRyn),
  };
}
