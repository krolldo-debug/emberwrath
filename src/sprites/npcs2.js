import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { buildFine, glowCanvas, lazySets, headFine, legsFine, armFine, skirtFine, band as bandF, stitch, fold, grain, tone } from './npcFine.js';
import { TAU } from '../core/math.js';

// Weitere NPCs für Aschenwald und Schlackenhöhen. Blickrichtung rechts,
// Anker = Fußpunkt. Leuchtendes (Laterne, Glühwürmchen, Runensteine) liegt
// zusätzlich auf frame.glow (SpriteFrame ohne Umriss, gleicher Anker).
const W = 40, H = 42, AX = 18, AY = 37;
const L = PAL.leather, St = PAL.steel, E = PAL.ember, G = PAL.gold, CR = PAL.crimson, M = PAL.magic;
const SKIN = ['#4a2e28', '#7a5040', '#a8765a', '#c89878'];
const SKIN_OLD = ['#4a3430', '#7a5a4c', '#a07e6a', '#bc9c86'];
const SKIN_PALE = ['#4e3a44', '#8a6a72', '#b8969a', '#d8bcb8'];
const EYE = '#150c12';
const CLOAK_G = ['#0c1610', '#132218', '#1b3222', '#26452d', '#35593a'];
const AUBURN = ['#3a140c', '#5e2414', '#86381c'];
const SHAWL = ['#1e1612', '#2e221a', '#423024', '#584230'];
const SKIRT = ['#161a12', '#20261a', '#2c3422', '#3a442c'];
const GREYH = ['#5a5460', '#8a8490', '#bab4c0', '#e0dce4'];
const COAT = ['#24120e', '#3a1d14', '#54301e', '#6e4228'];
const PACK = ['#1e1610', '#30241a', '#463424', '#5e4832'];
const HAT = ['#141016', '#221c20', '#322a2c', '#443a38'];
const TAN = ['#3a3024', '#5a4a34', '#7e6a4a', '#a08a62'];
const NAVY = ['#0c0f1c', '#141a2e', '#1e2842', '#2c3a5a'];
const DARKH = ['#140e10', '#241a1a', '#382a26'];
const ROBE_V = ['#140a22', '#22103a', '#34185a', '#4a247a', '#6a3aa0'];
const SILVER = ['#6a6878', '#9c9aae', '#cccade', '#f0eefa'];
const BEARD = ['#3a140a', '#5e2410', '#84381a', '#a8522a'];
const APRON = ['#1c120e', '#2c1c14', '#3e281c', '#52382a'];
const SHIRT = ['#1e2230', '#2a3044', '#384058'];
const PAPER = ['#8a8070', '#bcb09a', '#e0d6bc'];

const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// ------------------------------------------------------------ Bausteine
// Kopf im 3/4-Profil nach rechts. hx = linke Kante, hy = Oberkante (8 hoch).
function head(p, hx, hy, o) {
  if (p.fine) { headFine(p, hx, hy, o); return; }
  const S = o.skin;
  p.rect(hx + 1, hy + 1, 6, 6, S[2]);
  p.rect(hx + 2, hy + 7, 4, 1, S[1]); // Kinn/Hals
  p.rect(hx + 5, hy + 2, 2, 1, S[3]); // Stirnlicht
  p.px(hx + 7, hy + 4, S[2]); // Nase
  p.px(hx + 7, hy + 5, S[1]);
  p.px(hx + 5, hy + 4, EYE); // Auge
  p.px(hx + 4, hy + 3, o.brow ?? S[1]);
  p.px(hx + 5, hy + 3, o.brow ?? S[1]);
  p.px(hx + 6, hy + 6, o.talk ? '#2a0e10' : S[1]); // Mund
  if (o.talk) p.px(hx + 5, hy + 6, '#2a0e10');
  p.px(hx + 3, hy + 4, S[1]); p.px(hx + 3, hy + 5, S[0]); // Ohr
  p.px(hx + 6, hy + 5, S[3]);
  // Volumen: Wangenlicht, Kieferschatten, Lidschatten über dem Auge
  p.px(hx + 1, hy + 5, S[1]); p.px(hx + 1, hy + 6, S[1]); p.px(hx + 2, hy + 6, S[1]);
  p.px(hx + 6, hy + 3, S[3]); p.px(hx + 4, hy + 5, S[3]);
  if (!o.noEye) p.px(hx + 5, hy + 5, S[1]);
}

function legs(p, cx, fy, top, pants, boots, step = 0) {
  // hinteres Bein
  p.rect(cx - 3, top, 3, fy - top - 2, pants[0]);
  p.rect(cx - 3, fy - 3, 3, 3, boots[0]); p.px(cx, fy, boots[0]);
  // vorderes Bein
  p.rect(cx + 1 + step, top, 3, fy - top - 2, pants[1]); p.px(cx + 1 + step, top, pants[2]);
  p.rect(cx + 1 + step, fy - 3, 3, 3, boots[1]); p.rect(cx + 1 + step, fy - 3, 3, 1, boots[2]); p.px(cx + 4 + step, fy, boots[1]);
  if (p.fine) legsFine(p, cx, fy, top, pants, boots, step);
}

// Arm als Linie von Schulter zu Hand (2 px stark)
function arm(p, x0, y0, x1, y1, c0, c1, hand) {
  if (p.fine) { armFine(p, x0, y0, x1, y1, c0, c1, hand); return; }
  p.line(x0, y0, x1, y1, c0); p.line(x0 + 1, y0, x1 + 1, y1, c1);
  if (hand) { p.px(x1, y1 + 1, hand); p.px(x1 + 1, y1 + 1, hand); }
}

// fine = true: Stufe B (handfein) – draw bekommt FineCanvas (p.fine), die Leuchtebene ebenfalls. Bei fineRes() 1
// (Qualität „Niedrig“) bleibt alles beim alten Weg in Weltpixeln.
function mkFrame(draw, fine = false) {
  const res = fine ? fineRes() : 1;
  const gc = res > 1 ? new FineCanvas(W, H, res) : new PixelCanvas(W, H);
  let used = false;
  const DRAW = new Set(['px', 'rect', 'line', 'ellipse', 'dot', 'fline', 'each']);
  const g = new Proxy(gc, { get(t, k) { if (DRAW.has(k)) used = true; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  let meta = null;
  const f = res > 1
    ? buildFrame(W, H, AX, AY, (p) => { meta = draw(p, g); }, { fine: true, res })
    : buildFrame(W, H, AX, AY, (p) => { meta = draw(p, g); });
  if (used) f.glow = res > 1 ? new SpriteFrame(gc.canvas, AX * res, AY * res, res) : new SpriteFrame(gc.canvas, AX, AY);
  if (meta) f.meta = meta;
  return f;
}

// Stufe B über buildFine (npcFine.js): alter Weg grob + feiner Durchgang mit Details in `if (p.fine)`. Die Leuchtebene
// bekommt nur der letzte Durchgang (fein: FineCanvas, Niedrig: PixelCanvas in Weltpixeln wie bisher).
const NOGLOW = { px() {}, rect() {}, line() {}, ellipse() {}, dot() {}, fline() {}, each() {}, fine: true, step: 0.5 };
function mkFineFrame(draw) {
  const res = fineRes(), gc = glowCanvas(W, H);
  let used = false;
  const DRAW = new Set(['px', 'rect', 'line', 'ellipse', 'dot', 'fline', 'each']);
  const g = new Proxy(gc, { get(t, k) { if (DRAW.has(k)) used = true; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const f = buildFine(W, H, AX, AY, (p, pass) => draw(p, res > 1 && pass === 0 ? NOGLOW : g));
  if (used) f.glow = res > 1 ? new SpriteFrame(gc.canvas, AX * res, AY * res, res) : new SpriteFrame(gc.canvas, AX, AY);
  return f;
}
const r2 = (v) => Math.round(v * 2) / 2;
// Feinfassung einer Farbe (Blaukanal ±1, mit bloßem Auge gleich): neu gezeichnete Großformen (Umhang, Rock, Haar) sollen im
// feinen Durchgang ganz gelten – buildFine ersetzt sonst gleichfarbige Feinpixel durch die geglättete Grobfassung (Treppen an Kanten).
const nudge = (c) => '#' + ((parseInt(c.slice(1), 16) ^ 1) >>> 0).toString(16).padStart(6, '0');
const NAVY_F = NAVY.map(nudge), SKIRT_F = SKIRT.map(nudge), ROBE_VF = ROBE_V.map(nudge), SILVER_F = SILVER.map(nudge);

const phases = (n) => [...Array(n)].map((_, i) => i / n);
const breath = (t) => (Math.sin(t * TAU) > 0.2 ? 1 : 0);

// ------------------------------------------------------------ Wächterin Ilsa
function drawIlsa(p, g, o) {
  if (p.fine) return drawIlsaFine(p, g, o);
  const { t = 0, talk = 0, gest = 0 } = o;
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Umhang hinten (weht)
  for (let y = ty - 1; y <= fy - 2; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(3 + k * 4 + sw * k * 1.5);
    for (let x = cx - 3 - back; x <= cx + 1; x++) {
      const i = x < cx - 3 - back + 2 ? 3 : x > cx - 1 ? 1 : 2;
      p.px(x, y, CLOAK_G[i]);
    }
    if (y === fy - 2) for (let x = cx - 3 - back; x < cx; x += 2) p.px(x, y + 1, CLOAK_G[1]);
  }
  // Langbogen auf dem Rücken (diagonal)
  for (let i = 0; i <= 22; i++) {
    const k = i / 22, x = Math.round(10 + k * 8 + Math.sin(k * Math.PI) * -3), y = Math.round(hy - 1 + k * 20);
    p.px(x, y, L[3]); p.px(x + 1, y, L[2]);
  }
  p.line(12, hy, 19, hy + 20, '#b8b0a0');
  legs(p, cx, fy, 29, L, ['#150d0a', '#221610', '#3a2a1e']);
  // Torso: Lederwams, grüner Umhang über der Schulter
  p.rect(cx - 3, ty, 7, 10, L[2]); p.rect(cx - 3, ty, 2, 10, L[3]); p.rect(cx + 3, ty, 1, 10, L[1]);
  p.rect(cx - 3, ty + 6, 7, 1, L[0]); p.px(cx + 1, ty + 6, G[3]); // Gürtel
  p.rect(cx - 3, ty + 7, 7, 3, CLOAK_G[2]); p.rect(cx - 3, ty + 7, 2, 3, CLOAK_G[3]); // Rockschoß
  p.line(cx - 2, ty + 1, cx + 2, ty + 5, L[0]); // Köcherriemen
  p.rect(cx - 4, ty - 1, 8, 3, CLOAK_G[3]); p.rect(cx - 4, ty - 1, 8, 1, CLOAK_G[4]); // Umhangkragen
  p.px(cx + 2, ty + 1, G[3]); // Fibel
  // Kopf mit Kapuze
  head(p, cx - 4, hy, { skin: SKIN, talk });
  p.rect(cx - 4, hy - 1, 6, 3, CLOAK_G[3]); p.rect(cx - 5, hy + 1, 3, 7, CLOAK_G[3]); p.rect(cx - 3, hy - 2, 5, 1, CLOAK_G[4]);
  p.px(cx + 2, hy, CLOAK_G[3]); p.px(cx + 2, hy + 1, CLOAK_G[2]); p.px(cx - 5, hy + 2, CLOAK_G[4]);
  p.rect(cx - 1, hy + 1, 3, 1, AUBURN[2]); p.px(cx - 2, hy + 2, AUBURN[1]); // Haar unter der Kapuze
  // Zopf, schwingt
  p.px(cx - 5, hy + 8, AUBURN[1]); p.px(cx - 6 - Math.round(sw * 0.6), hy + 9, AUBURN[2]); p.px(cx - 6 - Math.round(sw), hy + 10, AUBURN[1]);
  // hinterer Arm
  if (gest) arm(p, cx - 1, ty + 2, cx + 5, ty + 2 - gest, L[1], L[2], SKIN[2]);
  else arm(p, cx - 3, ty + 1, cx - 3, ty + 7, CLOAK_G[1], L[1], SKIN[1]);
  // Speer in der vorderen Hand
  const sx = cx + 6;
  p.line(sx, 4 - b, sx, fy, L[3]); p.line(sx + 1, 4 - b, sx + 1, fy, L[1]);
  p.rect(sx, 1 - b, 2, 3, St[3]); p.px(sx, 0 - b, St[5]); p.px(sx, 1 - b, St[4]); p.px(sx + 1, 3 - b, St[2]);
  p.rect(sx - 1, 4 - b, 4, 1, CR[2]); p.px(sx - 1, 5 - b, CR[3]); p.px(sx + 2, 6 - b, CR[2]); // Band
  arm(p, cx + 3, ty + 1, sx - 1, ty + 5, CLOAK_G[3], L[2], null);
  p.rect(sx - 1, ty + 5, 3, 2, SKIN[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Feinraster (Stufe B, handfein)
// Bildmuster in Feinpixeln: rows = Zeichenketten (ein Zeichen = ein Feinpixel), pal = Zeichen → Farbe, '.' = frei.
// x/y = Weltkoordinate der linken oberen Ecke.
function fmap(p, x, y, rows, pal) {
  const q = p.step;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) { const col = pal[row[c]]; if (col) p.dot(x + c * q, y + r * q, col); }
  }
}
// Gerades Band (Arm, Stab) fein abgetastet: Breite w Weltpixel, ramp von der Lichtseite (oben links) zur Schattenseite.
function band(p, x0, y0, x1, y1, w, ramp) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-3, len = Math.sqrt(l2);
  let nx = -dy / len, ny = dx / len;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const R = w / 2 + 1, h = w / 2;
  p.each(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, (x, y) => {
    const t = ((x - x0) * dx + (y - y0) * dy) / l2;
    if (t < 0 || t > 1) return null;
    const s = (x - x0 - dx * t) * nx + (y - y0 - dy * t) * ny;
    if (s > h || s < -h) return null;
    return ramp[Math.min(ramp.length - 1, Math.floor((h - s) / w * ramp.length))];
  });
}

const IL_HAIR = [AUBURN[0], AUBURN[1], AUBURN[2], '#ac5a2c'];
const IL_BOOT = ['#0e0907', '#1a110d', '#2c1f16', '#46342a', '#6a5040'];
const IL_HL = '#8a6446'; // Lederglanz
// Kopf mit Kapuze, 20×20 Feinpixel ab (12, hy-2). Kapuze a–e (dunkel → hell), Haut 0–3/h, Haar x/y/z/Z,
// Auge k (Lid/Pupille), w (Weiß), i (Iris), g (Glanz), Mund l (Lippenlinie) / m (offen).
const IL_HEAD = [
  '.......eeeee........',
  '.....eeedddddd......',
  '....eedddcdddddd....',
  '...eddddcdddddddcc..',
  '...edddcddddddcccc..',
  '..edddcdddddcccbbbc.',
  '..eddcdddbayzzzyabc.',
  '..edcdddbyzZZzzybc..',
  '..edcddbyy111y2233..',
  '..edcddby122223333..',
  '..ddcddb1222yy2233..',
  '..ddcddb122221yy32..',
  '..dcdddb11211kkk222.',
  '..dcdddb11312wgk2332',
  '..dcdddb113131ik3321',
  '..dcddbb11223312h31.',
  '..dccdbb0122222ll2..',
  '..dccdbb0112222221..',
  '..dccbbb.01111111...',
  '..dccbba............',
];
const IL_TALK = { 16: '..dccdbb0122222mm1..', 17: '..dccdbb0112222ml1..' };
const IL_HEAD_PAL = {
  a: CLOAK_G[0], b: CLOAK_G[1], c: CLOAK_G[2], d: CLOAK_G[3], e: CLOAK_G[4],
  0: SKIN[0], 1: SKIN[1], 2: SKIN[2], 3: SKIN[3], h: '#dcb092',
  x: IL_HAIR[0], y: IL_HAIR[1], z: IL_HAIR[2], Z: IL_HAIR[3],
  k: EYE, w: '#d0c4b8', i: '#3a6a3a', g: '#ffffff', l: '#6a3028', m: '#2a0e10',
};

function drawIlsaFine(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU), q = p.step;
  const ty = 19 - b, hy = 11 - b;
  // --- Umhang hinten (weht): Kante fein, zwei Falten laufen von der Schulter nach unten auseinander
  const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 3 - (3 + k * 4 + sw * k * 1.5); };
  p.each(0, ty - 1, cx + 1.9, fy - 1.1, (x, y) => {
    const xl = left(y);
    if (x < xl - 0.25 || x > cx + 2) return null;
    const d = x - xl;
    if (y > fy - 1.5) return CLOAK_G[1];                                   // Saum unten
    let i = d < 0.5 && y < ty + 9 ? 4 : d < 2 ? 3 : x > cx - 1 ? 1 : 2;
    for (const [f, y0] of [[0.42, ty + 3], [0.74, ty + 7]]) {
      if (y < y0) continue;
      const xf = xl + (cx - 3 - xl) * f - (y - y0) * 0.06;
      if (Math.abs(x - xf) < 0.26) i = y < y0 + 2 ? 2 : 1;                 // Falte: oben weich, unten tief
      else if (x < xf && x > xf - 0.76 && y > y0 + 1) i = Math.max(i, 3);   // Lichtgrat links daneben
    }
    return CLOAK_G[i];
  });
  { // Fransen am Saum
    const xl = Math.round(left(fy - 2) * 2) / 2;
    for (let x = xl; x < cx; x += 2) { p.rect(x, fy - 1, 1, 0.5, CLOAK_G[1]); p.dot(x + 0.25, fy - 0.5, CLOAK_G[0]); }
  }
  // --- Langbogen auf dem Rücken: Holz dreistufig mit Glanzlinie, Hornspitzen, Griffwicklung; Sehne als Feinlinie
  for (let y = hy - 1; y < hy + 20; y += q) {
    const k = (y - (hy - 1)) / 20, x = Math.round((10 + k * 8 + Math.sin(k * Math.PI) * -3) * 2) / 2;
    if (k < 0.06 || k > 0.95) { p.dot(x + 0.5, y, '#c8b898'); p.dot(x + 1, y, '#8a7c66'); continue; }
    const grip = Math.abs(k - 0.5) < 0.07;
    const wr = grip && Math.round(y * 2) % 2;   // Griffwicklung
    p.dot(x, y, L[3]); p.dot(x + 0.5, y, grip ? (wr ? L[3] : L[0]) : IL_HL); p.dot(x + 1, y, grip ? (wr ? L[2] : L[0]) : L[2]); p.dot(x + 1.5, y, L[1]);
  }
  p.fline(12, hy, 19, hy + 20, '#c8c0ae');
  // --- Beine: Hose, Stiefel mit umgeschlagenem Schaft und Lichtkante
  p.rect(cx - 3, 29, 3, 5, L[0]); p.rect(cx - 3, 29, 0.5, 5, L[1]);
  p.rect(cx + 1, 29, 3, 5, L[1]); p.rect(cx + 1, 29, 0.5, 5, L[2]); p.rect(cx + 3.5, 29, 0.5, 5, L[0]);
  p.dot(cx + 1.5, 31.5, L[2]); p.dot(cx + 2, 31.5, L[3]);                  // Knie
  const boot = (x, B) => fmap(p, x, fy - 3, [
    '4433322.',
    '2111110.',
    '310000..',
    '310000..',
    '3100000.',
    '31111100',
    '....1123',
    '....0000',
  ], { 0: B[0], 1: B[1], 2: B[2], 3: B[3], 4: B[4] });
  boot(cx - 3, [IL_BOOT[0], IL_BOOT[0], IL_BOOT[1], IL_BOOT[2], IL_BOOT[3]]);
  boot(cx + 1, [IL_BOOT[0], IL_BOOT[1], IL_BOOT[2], IL_BOOT[3], IL_BOOT[4]]);
  // --- Rumpf: Lederwams mit Ziernaht, Köcherriemen mit Nieten, Gürtel und Schnalle
  p.rect(cx - 3, ty, 7, 10, L[2]); p.rect(cx - 3, ty, 2, 10, L[3]); p.rect(cx - 3, ty + 0.5, 0.5, 6, IL_HL);
  p.rect(cx + 3, ty, 1, 10, L[1]); p.rect(cx + 2.5, ty + 2, 0.5, 4, L[1]);
  for (let y = ty + 2; y < ty + 6; y += 1) p.dot(cx + 2, y, L[3]);          // Naht als Punktlinie
  p.fline(cx - 2, ty + 1, cx + 2, ty + 5, L[0], 1);                          // Köcherriemen
  p.fline(cx - 2, ty + 0.5, cx + 2, ty + 4.5, IL_HL);                       // Glanzkante am Riemen
  p.dot(cx - 1, ty + 2, St[3]); p.dot(cx + 1, ty + 4, St[3]); p.dot(cx + 1.5, ty + 4, St[1]);
  p.rect(cx - 3, ty + 6, 7, 1, L[0]); p.rect(cx - 3, ty + 6, 7, 0.5, '#2c1c14');
  fmap(p, cx + 0.5, ty + 6, ['432', '3.1'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
  p.dot(cx + 1, ty + 6.5, L[0]);
  // Rockschoß mit Falten
  p.rect(cx - 3, ty + 7, 7, 3, CLOAK_G[2]); p.rect(cx - 3, ty + 7, 2, 3, CLOAK_G[3]); p.rect(cx - 3, ty + 7, 7, 0.5, CLOAK_G[1]);
  for (const fx of [cx - 0.5, cx + 2]) { p.rect(fx, ty + 7.5, 0.5, 2.5, CLOAK_G[1]); p.rect(fx - 0.5, ty + 8, 0.5, 2, CLOAK_G[3]); }
  p.rect(cx - 3, ty + 9.5, 7, 0.5, CLOAK_G[1]); p.rect(cx - 3, ty + 9.5, 2, 0.5, CLOAK_G[2]);
  // Umhangkragen mit Falten und Schatten auf dem Wams, Fibel mit Glanz
  p.rect(cx - 4, ty - 1, 8, 3, CLOAK_G[3]); p.rect(cx - 4, ty - 1, 8, 0.5, CLOAK_G[4]); p.rect(cx - 4, ty - 0.5, 3, 0.5, CLOAK_G[4]);
  p.rect(cx - 4, ty + 1.5, 8, 0.5, CLOAK_G[2]); p.rect(cx - 1, ty + 2, 4, 0.5, L[1]);
  p.dot(cx - 2, ty, CLOAK_G[2]); p.dot(cx - 1.5, ty + 0.5, CLOAK_G[2]); p.dot(cx + 0.5, ty + 0.5, CLOAK_G[2]); p.dot(cx + 1, ty + 1, CLOAK_G[1]);
  fmap(p, cx + 1.5, ty + 0.5, ['342', '2g1', '.1.'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1], g: CR[3] });
  // --- Kopf mit Kapuze
  fmap(p, 12, hy - 2, talk ? IL_HEAD.map((r, i) => IL_TALK[i] ?? r) : IL_HEAD, IL_HEAD_PAL);
  // Zopf (schwingt): verflochtene Glieder mit Strähnenlicht, Lederband, Quaste
  const bx = (k) => 13 - k * 0.5 - sw * Math.min(k, 2) * 0.5;
  for (let k = 0; k < 3; k++) {
    const x = Math.round(bx(k) * 2) / 2, y = hy + 8 + k;
    fmap(p, x, y, k % 2 ? ['.yz', 'xyy'] : ['zZ.', 'yyx'], { x: IL_HAIR[0], y: IL_HAIR[1], z: IL_HAIR[2], Z: IL_HAIR[3] });
  }
  { const x = Math.round(bx(3) * 2) / 2, y = hy + 11; p.dot(x + 0.5, y, L[3]); p.dot(x, y + 0.5, IL_HAIR[2]); p.dot(x + 0.5, y + 0.5, IL_HAIR[1]); }
  // --- hinterer Arm
  if (gest) {
    band(p, cx - 0.5, ty + 2.5, cx + 5.5, ty + 2.5 - gest, 2, [IL_HL, L[3], L[2], L[0]]);
    band(p, cx + 3, ty + 2.5 - gest * 0.6, cx + 4.5, ty + 2.5 - gest * 0.85, 2, [L[1], L[1], L[0], L[0]]); // Armschiene
    p.dot(cx + 3.5, ty + 1.5 - gest * 0.7, L[3]);
    fmap(p, cx + 5, ty + 1.5 - gest, ['.32', '3221', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  } else {
    p.rect(cx - 3, ty + 1, 1, 7, CLOAK_G[1]); p.rect(cx - 3, ty + 1, 0.5, 7, CLOAK_G[2]);
    p.rect(cx - 2, ty + 1, 1, 7, L[1]); p.rect(cx - 1.5, ty + 1, 0.5, 7, L[0]); p.rect(cx - 2, ty + 5, 1, 0.5, L[2]);
    fmap(p, cx - 3, ty + 8, ['2211', '1100'], { 2: SKIN[2], 1: SKIN[1], 0: SKIN[0] });
  }
  // --- Speer: Schaft dreistufig, Blatt mit Mittelgrat (Glanzlinie) und Glanzpunkt, rotes Band mit Falte
  const sx = cx + 6;
  p.rect(sx, 4 - b, 0.5, fy - 3 + b, L[3]); p.rect(sx + 0.5, 4 - b, 0.5, fy - 3 + b, IL_HL);
  p.rect(sx + 1, 4 - b, 0.5, fy - 3 + b, L[2]); p.rect(sx + 1.5, 4 - b, 0.5, fy - 3 + b, L[1]);
  fmap(p, sx, fy - 0.5, ['3421'], { 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
  fmap(p, sx, -b, [
    '.w..',
    '.54.',
    '4553',
    '4543',
    '3542',
    '3532',
    '2521',
    '1221',
  ], { w: '#ffffff', 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] });
  const fl = Math.round(sw * 0.8) * q;
  fmap(p, sx - 1, 4 - b, [
    '23443422',
    '12231211',
    '32.....3',
    '21......',
  ], { 4: CR[4], 3: CR[3], 2: CR[2], 1: CR[1] });
  p.dot(sx + 2 + fl, 5.5 - b, CR[2]); p.dot(sx + 2 + fl, 6 - b, CR[3]); p.dot(sx + 2.5 + fl, 6 - b, CR[1]); p.dot(sx + 2 + fl, 6.5 - b, CR[1]);
  // --- vorderer Arm: Umhang über der Schulter, Lederärmel, Hand umfasst den Schaft
  band(p, cx + 3.5, ty + 1.5, cx + 5.5, ty + 5.5, 2, [CLOAK_G[4], CLOAK_G[3], L[3], L[2], L[2], L[1]]);
  fmap(p, sx - 1, ty + 5, [
    '.3332.',
    '232221',
    '121111',
    '.2221.',
  ], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Kräuterfrau Oona
const STONE = PAL.stone;
const FLY = ['#3a6a20', '#7ab040', '#c8f07a', '#f4ffd0'];
// Kräuterbündel kopfüber: Bindfaden oben, Blätter mit Licht an den Spitzen
const HERB = [
  '..ts..',
  '..st..',
  '.dbbd.',
  'dbccbd',
  'adbcda',
  '.dbbd.',
  '.a.da.',
  '...a..',
];
function drawOona(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // Rock (Glocke)
  if (p.fine) {
    skirtFine(p, cx - 0.5, ty + 4, fy, 3, 6.5, SKIRT_F, 0, 4);
    // Flicken mit Punktnaht, Schuhspitze mit Licht
    p.rect(cx + 1.5, fy - 4.5, 2, 1.5, SHAWL[1]); p.rect(cx + 1.5, fy - 4.5, 2, 0.5, SHAWL[2]);
    stitch(p, cx + 1.5, fy - 3, cx + 3.5, fy - 3, SHAWL[3]); stitch(p, cx + 3.5, fy - 4.5, cx + 3.5, fy - 3.5, SHAWL[3]);
    p.rect(cx + 5, fy, 2, 0.5, L[2]); p.dot(cx + 6, fy, L[3]); p.rect(cx + 5, fy + 0.5, 2, 0.5, L[0]);
  } else {
    for (let y = ty + 4; y <= fy; y++) {
      const k = (y - ty - 4) / (fy - ty - 4), hw = 3.5 + k * 3.5;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - (cx - hw)) / (2 * hw);
        let i = rel < 0.25 ? 3 : rel < 0.7 ? 2 : 1;
        if (y === fy) i = 0;
        if ((x + 1) % 4 === 0 && y > ty + 7) i = Math.max(0, i - 1);
        p.px(x, y, SKIRT[i]);
      }
    }
    p.px(cx + 5, fy, L[1]); p.px(cx + 6, fy, L[1]);
  }
  // Schultertuch/Oberkörper (gebeugt)
  for (let y = ty; y <= ty + 7; y++) for (let x = cx - 4; x <= cx + 3; x++) {
    const i = x < cx - 2 ? 3 : x > cx + 1 ? 1 : 2;
    p.px(x, y, SHAWL[i]);
  }
  if (p.fine) {
    // Tuch: Dreieck mit zwei Falten zur Mitte, Strickkante unten, Fransen als einzelne Fäden
    p.rect(cx - 4, ty + 0.5, 0.5, 7, tone(SHAWL[3], 0.18));
    fold(p, cx - 2.5, ty + 2, ty + 6.5, SHAWL[1], SHAWL[3]);
    for (let x = cx - 4; x < cx + 4; x += 0.5) p.dot(x, ty + 6.5 + ((x * 2) % 2 ? 0.5 : 0), (x * 2) % 2 ? SHAWL[1] : SHAWL[3]);
    for (let x = cx - 4; x < cx + 4; x += 1) {
      const n = (Math.round(x) & 1) ? 2 : 1.5;
      p.rect(x, ty + 8, 0.5, n, SHAWL[2]); p.dot(x, ty + 7.5 + n, SHAWL[1]);
      p.rect(x + 0.5, ty + 8, 0.5, n - 0.5, SHAWL[1]);
    }
  } else for (let x = cx - 4; x <= cx + 3; x++) p.px(x, ty + 8 + (x % 2), SHAWL[1]); // Fransen
  // Gürtel mit Kräuterbündeln
  p.rect(cx - 4, ty + 7, 9, 1, L[1]);
  if (p.fine) { p.rect(cx - 4, ty + 7, 9, 0.5, L[2]); fmap(p, cx + 4, ty + 7, ['32', '21', '.1'], { 3: L[3], 2: L[2], 1: L[1] }); }
  const herbs = [[cx - 3, '#3e6a32', '#5a8a3e'], [cx - 1, '#5a3a6a', '#8a5aa0'], [cx + 1, '#6a6a2a', '#9a9a3e']];
  for (const [x, c1, c2] of herbs) {
    if (p.fine) fmap(p, x - 1, ty + 8, HERB, { t: L[3], s: L[1], a: tone(c1, -0.3), d: c1, b: c2, c: tone(c2, 0.25) });
    else { p.px(x, ty + 8, L[2]); p.px(x, ty + 9, c1); p.px(x - 1, ty + 10, c1); p.px(x + 1, ty + 10, c2); p.px(x, ty + 11, c2); p.px(x, ty + 10, c1); }
  }
  // Laterne mit Glühwürmchen an der Hüfte (schwingt)
  const lx = cx + 6 + Math.round(sw * 0.7), ly = ty + 9;
  p.line(cx + 4, ty + 7, lx, ly - 1, L[2]);
  p.rect(lx - 1, ly, 4, 1, St[2]); p.rect(lx - 1, ly + 1, 4, 4, '#18241a'); p.rect(lx - 1, ly + 5, 4, 1, St[1]);
  // zwei Glühwürmchen im Glas, kreisen langsam
  const inner = [[lx + 0.5 + Math.round(Math.cos(t * TAU) * 1) * 0.5, ly + 2], [lx + 1.5 - Math.round(Math.cos(t * TAU) * 1) * 0.5, ly + 3.5]];
  if (p.fine) {
    // Deckel mit Glanz und Öse, Streben, Glasglanz, Boden 2-stufig
    p.rect(lx - 1, ly, 4, 0.5, St[4]); p.dot(lx - 0.5, ly, St[5]); p.rect(lx - 1, ly + 0.5, 4, 0.5, St[1]);
    p.dot(lx + 0.5, ly - 0.5, St[3]); p.dot(lx + 1, ly - 0.5, St[1]);
    p.rect(lx + 1.5, ly + 1, 1, 4, '#121c14');
    p.rect(lx - 1, ly + 1, 0.5, 4, St[3]); p.rect(lx + 0.5, ly + 1, 0.5, 4, St[1]); p.rect(lx + 2.5, ly + 1, 0.5, 4, St[0]);
    p.dot(lx - 0.5, ly + 1.5, '#5a7a5a'); p.dot(lx - 0.5, ly + 2, '#3a5a3a');
    for (const [x, y] of inner) { p.dot(x, y, FLY[3]); p.dot(x - 0.5, y, FLY[1]); p.dot(x, y + 0.5, FLY[1]); }
    p.rect(lx - 1, ly + 5, 4, 0.5, St[2]); p.rect(lx - 1, ly + 5.5, 4, 0.5, St[0]); p.dot(lx - 0.5, ly + 5, St[4]);
  } else { p.px(lx, ly + 2, '#c8f07a'); p.px(lx + 1, ly + 3, '#a0e060'); p.px(lx + 2, ly + 1, St[3]); }
  if (g.fine) {
    g.rect(lx - 0.5, ly + 1, 3, 4, '#24481a');
    for (const [x, y] of inner) { g.dot(x, y, '#f8ffe0'); g.dot(x - 0.5, y, FLY[2]); g.dot(x + 0.5, y, FLY[1]); g.dot(x, y - 0.5, FLY[1]); g.dot(x, y + 0.5, FLY[2]); }
  } else { g.rect(lx - 1, ly + 1, 4, 4, '#3a6a20'); g.px(lx, ly + 2, '#e8ffa0'); g.px(lx + 1, ly + 3, '#c8ff80'); }
  // freie Glühwürmchen
  const flies = [[0.0, 7, 4], [0.33, 5, 7], [0.66, 9, 6]];
  for (const [ph, r, hh] of flies) {
    const a = (t + ph) * TAU;
    if (p.fine) {
      // fein: Lage auf Feinpixel, heißer Kern, Flügelchen, Leuchtschweif nach unten
      const fx = r2(lx + 1 + Math.cos(a) * r * 0.6), fyy = r2(ly - hh + Math.sin(a * 2) * 2);
      p.dot(fx, fyy, FLY[3]); p.dot(fx + 0.5, fyy, FLY[2]); p.dot(fx, fyy + 0.5, FLY[1]);
      g.dot(fx, fyy, '#ffffff'); g.dot(fx + 0.5, fyy, FLY[2]); g.dot(fx - 0.5, fyy, FLY[1]); g.dot(fx, fyy - 0.5, FLY[1]);
      g.dot(fx, fyy + 0.5, FLY[2]); g.dot(fx, fyy + 1, FLY[1]); g.dot(fx, fyy + 1.5, FLY[0]);
    } else {
      const fx = Math.round(lx + 1 + Math.cos(a) * r * 0.6), fyy = Math.round(ly - hh + Math.sin(a * 2) * 2);
      p.px(fx, fyy, '#d8ff90'); g.px(fx, fyy, '#f0ffc0'); g.px(fx, fyy + 1, '#6aa030');
    }
  }
  // Kopf mit Kapuze, nach vorn gebeugt
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk, brow: GREYH[2], old: true, iris: '#5a6a4a' });
  if (!p.fine) { p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.px(hx + 6, hy + 3, SKIN_OLD[1]); } // Falten
  p.rect(hx, hy - 1, 6, 3, SHAWL[2]); p.rect(hx - 1, hy + 1, 3, 8, SHAWL[2]); p.rect(hx + 1, hy - 2, 4, 1, SHAWL[3]);
  p.px(hx + 6, hy, SHAWL[2]); p.px(hx + 6, hy + 1, SHAWL[1]); p.px(hx - 1, hy + 1, SHAWL[3]);
  if (p.fine) {
    // Kapuze: Lichtkante oben/links, Naht über dem Scheitel, Schatten am Gesichtsrand und auf der Stirn
    p.rect(hx + 1, hy - 2, 4, 0.5, tone(SHAWL[3], 0.2)); p.dot(hx + 0.5, hy - 1.5, SHAWL[3]); p.dot(hx, hy - 1, SHAWL[3]);
    p.rect(hx - 1, hy + 1.5, 0.5, 7, SHAWL[3]); p.rect(hx - 0.5, hy + 1, 0.5, 0.5, tone(SHAWL[3], 0.2));
    stitch(p, hx + 1, hy - 1, hx + 5, hy - 1.5, SHAWL[1]);
    p.fline(hx + 0.5, hy + 0.5, hx + 5.5, hy + 0.5, SHAWL[3]); p.rect(hx + 1, hy + 1.5, 5.5, 0.5, SHAWL[1]);
    p.rect(hx + 1.5, hy + 2, 0.5, 6.5, SHAWL[1]); p.dot(hx + 6.5, hy + 1, SHAWL[0]);
    p.rect(hx + 2.5, hy + 2, 3.5, 0.5, SKIN_OLD[1]);
    // graue Strähnen unter der Kapuze, wellig über Stirn und Schläfe
    fmap(p, hx + 2, hy + 2, ['.cdcc.c', 'cbcb.b.', 'bc.c...', 'b.b....', '.b.....'], { b: GREYH[1], c: GREYH[2], d: GREYH[3] });
  } else { p.px(hx + 3, hy + 2, GREYH[2]); p.px(hx + 4, hy + 2, GREYH[3]); p.px(hx + 2, hy + 3, GREYH[1]); } // Haarsträhne
  // Mörser mit beiden Händen, Stößel kreist
  const mx = cx + 4, my = ty + 4;
  arm(p, cx - 1, ty + 1, mx - 1, my, SHAWL[1], SHAWL[2], null);
  const pa = gest ? -1.2 : t * TAU;
  const px0 = mx + 1 + Math.round(Math.cos(pa) * 1), py0 = my - 1;
  if (p.fine) {
    // Steinmörser: runde Schale, Rand mit Lichtkante, Riss, Inhalt aus zerstoßenen Kräutern, Stößel mit Knauf
    p.each(mx - 2, my, mx + 4, my + 4, (x, y) => {
      const u = (x - (mx + 1)) / 3, v = y - my;
      if (v < 3 ? Math.abs(u) > (v > 2.5 ? 0.84 : 1) : Math.abs(u) > (v > 3.5 ? 0.5 : 0.67)) return null;
      if (v < 0.5) return Math.abs(u) > 0.67 ? (u < 0 ? '#8a8294' : STONE[4]) : null;
      if (v < 1) return u < 0.3 ? '#7a7282' : STONE[5];
      if (v >= 3) return v >= 3.5 ? STONE[2] : u < -0.2 ? STONE[4] : STONE[3];
      return u < -0.62 ? '#7a7282' : u < -0.1 ? STONE[5] : u < 0.5 ? STONE[4] : STONE[3];
    });
    fmap(p, mx - 1, my, ['24312342'], { 1: '#1e2a16', 2: '#2a3a1e', 3: '#4a7a30', 4: '#6a9a3e' });
    p.dot(mx + 2.5, my + 1, STONE[2]); p.dot(mx + 2.5, my + 1.5, STONE[2]); p.dot(mx + 3, my + 2, STONE[2]); p.dot(mx + 2, my + 1.5, '#7a7282');
    p.line(px0, py0, px0 + 1 + (gest ? 2 : 0), py0 - 3 - (gest ? 2 : 0), '#bcae8e');
    const ex = px0 + 1 + (gest ? 2 : 0), ey = py0 - 3 - (gest ? 2 : 0);
    p.fline(px0 + 0.5, py0, ex + 0.5, ey, '#8a7e62'); p.dot(ex, ey, '#e8dcbc'); p.dot(ex + 0.5, ey - 0.5, '#d0c4a2'); p.dot(ex, ey - 0.5, '#f4ead0');
    fmap(p, mx - 2.5, my + 1, ['32', '21'], { 3: SKIN_OLD[3], 2: SKIN_OLD[2], 1: SKIN_OLD[1] });
    fmap(p, mx + 3, my + 1, ['32', '21'], { 3: SKIN_OLD[3], 2: SKIN_OLD[2], 1: SKIN_OLD[1] });
  } else {
    p.rect(mx - 2, my, 6, 3, '#4d4459'); p.rect(mx - 1, my + 3, 4, 1, '#3e364b'); p.rect(mx - 2, my, 6, 1, '#6a6272'); p.px(mx - 2, my + 1, '#5f566b');
    p.rect(mx - 1, my, 4, 1, '#2a3a1e'); p.px(mx, my, '#4a7a30');
    p.line(px0, py0, px0 + 1 + (gest ? 2 : 0), py0 - 3 - (gest ? 2 : 0), '#bcae8e');
    p.px(mx - 2, my + 1, SKIN_OLD[2]); p.px(mx + 3, my + 1, SKIN_OLD[2]);
  }
  arm(p, cx + 2, ty + 1, mx + 2, my + 1, SHAWL[2], SHAWL[1], null);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Händler Vesk
const GP = { 5: '#fff8d8', 4: G[4], 3: G[3], 2: G[2], 1: G[1] };
// Feder (fein): Kiel von a nach b, Fahne beidseitig, zur Spitze schmaler, Kerben als dunkle Feinpixel
function quill(p, x0, y0, x1, y1, shaft, light, mid, dark) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const s = i / n, x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s, w = Math.sin(Math.PI * Math.min(1, s * 1.15));
    p.dot(x, y, shaft);
    if (w > 0.3 && s > 0.12) { p.dot(x - 0.5, y + 0.5, i % 3 === 0 ? dark : mid); p.dot(x + 0.5, y, light); }
    if (w > 0.8 && s > 0.2) p.dot(x - 1, y + 0.5, i % 3 === 1 ? dark : mid);
  }
}
function drawVesk(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 20, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Rucksack (hinter dem Körper, links)
  const px0 = cx - 13, py0 = ty - 6 + (b ? 0 : 1);
  p.rect(px0, py0, 10, 16, PACK[2]); p.rect(px0, py0, 3, 16, PACK[3]); p.rect(px0 + 8, py0, 2, 16, PACK[1]); p.rect(px0, py0 + 15, 10, 1, PACK[0]);
  p.rect(px0 + 1, py0 + 5, 8, 1, L[1]); p.rect(px0 + 1, py0 + 11, 8, 1, L[1]); p.px(px0 + 4, py0 + 5, G[2]);
  p.rect(px0 + 1, py0 + 7, 5, 3, PACK[1]); p.rect(px0 + 1, py0 + 7, 5, 1, PACK[3]); // Außentasche
  if (p.fine) {
    // Segeltuch: Lichtkante, Nähte als Punktlinien, Kratzer; Riemen mit Glanzkante und Messingschnalle
    p.rect(px0, py0 + 0.5, 0.5, 14.5, tone(PACK[3], 0.2)); p.rect(px0 + 9.5, py0, 0.5, 15, PACK[0]);
    stitch(p, px0 + 1, py0 + 0.5, px0 + 8.5, py0 + 0.5, PACK[1]);
    stitch(p, px0 + 2.5, py0 + 1, px0 + 2.5, py0 + 14.5, PACK[1]); stitch(p, px0 + 7.5, py0 + 1, px0 + 7.5, py0 + 14.5, PACK[0]);
    p.fline(px0 + 5, py0 + 2, px0 + 6.5, py0 + 3.5, PACK[1]); p.fline(px0 + 5.5, py0 + 2, px0 + 7, py0 + 3.5, tone(PACK[2], 0.15));
    p.fline(px0 + 4, py0 + 13, px0 + 5.5, py0 + 12.5, PACK[1]);
    for (const y of [py0 + 5, py0 + 11]) { p.rect(px0 + 1, y, 8, 0.5, L[2]); p.rect(px0 + 1, y + 0.5, 8, 0.5, L[0]); p.dot(px0 + 1.5, y, L[3]); }
    fmap(p, px0 + 3.5, py0 + 4.5, ['5432', '4..1', '3221'], GP);
    // Außentasche: Klappe mit gerundeter Kante, Naht, Knopf
    fmap(p, px0 + 1, py0 + 7, [
      '4333333333',
      '3222222222',
      '1222222221',
      '.11222211.',
      '0001gg1000',
      '0000000000',
    ], { 4: tone(PACK[3], 0.15), 3: PACK[3], 2: PACK[2], 1: PACK[1], 0: PACK[0], g: G[3] });
    stitch(p, px0 + 1.5, py0 + 8, px0 + 5.5, py0 + 8, PACK[3]);
  }
  // Deckenrolle oben
  p.rect(px0 - 1, py0 - 4, 12, 4, CR[2]); p.rect(px0 - 1, py0 - 4, 12, 1, CR[3]); p.rect(px0 - 1, py0 - 1, 12, 1, CR[1]);
  p.px(px0 - 1, py0 - 3, CR[4]); p.rect(px0 + 3, py0 - 4, 1, 4, L[1]); p.rect(px0 + 7, py0 - 4, 1, 4, L[1]);
  if (p.fine) {
    // Wolldecke: Rundung 6-stufig, Stirnseite als Spirale, gewebte Streifen, Riemen mit Glanz
    for (let i = 0; i < 8; i++) p.rect(px0 - 0.5, py0 - 4 + i * 0.5, 11.5, 0.5, [CR[3], CR[4], CR[3], CR[2], CR[2], CR[2], CR[1], CR[0]][i]);
    for (const x of [px0 + 1, px0 + 9.5]) for (let i = 0; i < 8; i++) p.dot(x, py0 - 4 + i * 0.5, [G[3], G[4], G[3], G[2], G[2], G[2], G[1], G[0]][i]);
    fmap(p, px0 - 1, py0 - 4, ['.43', '4322', '3141', '3412', '3121', '3211', '2111', '.10'], { 4: CR[4], 3: CR[3], 2: CR[2], 1: CR[1], 0: CR[0] });
    for (const x of [px0 + 3, px0 + 7]) { p.rect(x, py0 - 4, 0.5, 4, L[2]); p.rect(x + 0.5, py0 - 4, 0.5, 4, L[0]); p.dot(x, py0 - 3.5, L[3]); }
  }
  // Pfanne + Topf schwingen
  const pnx = px0 - 1 + Math.round(sw * 0.8), pny = py0 + 13;
  p.line(px0, py0 + 9, pnx - 1, pny, St[2]);
  if (p.fine) {
    // Pfanne schräg: Rand mit Glanzbogen, dunkler Boden, Glanzpunkt; Stiel mit Glanzkante und Niete
    p.fline(px0 - 0.5, py0 + 9, pnx - 1.5, pny, St[3]);
    p.ellipse(pnx - 2, pny + 2, 2.2, 1.6, (nx, ny, d) => {
      if (d > 0.5) return nx + ny < -0.45 ? St[4] : nx + ny < 0.35 ? St[2] : St[0];
      return nx + ny < -0.3 ? St[1] : '#141824';
    });
    p.dot(pnx - 3.5, pny + 1, St[5]); p.dot(pnx - 3, pny + 0.5, '#ffffff'); p.dot(pnx - 1, pny + 0.5, St[4]);
  } else { p.ellipse(pnx - 2, pny + 2, 2.2, 1.6, St[1]); p.px(pnx - 3, pny + 1, St[3]); }
  p.rect(px0 + 2, py0 + 16, 4, 3, '#2a2a30'); p.rect(px0 + 2, py0 + 16, 4, 1, St[2]); p.px(px0 + 2, py0 + 17, St[3]);
  if (p.fine) {
    // Topf: Lippe mit Glanzlinie, Licht links, Ruß unten, Henkelöhrchen
    p.rect(px0 + 2, py0 + 16, 4, 0.5, St[4]); p.dot(px0 + 2.5, py0 + 16, St[5]); p.rect(px0 + 2, py0 + 16.5, 4, 0.5, St[1]);
    p.rect(px0 + 2, py0 + 17, 0.5, 2, St[2]); p.rect(px0 + 2.5, py0 + 17, 0.5, 1.5, '#3a3a44'); p.rect(px0 + 2.5, py0 + 18.5, 3.5, 0.5, '#16161a');
    p.dot(px0 + 1.5, py0 + 17, St[3]); p.dot(px0 + 6, py0 + 17, St[1]);
  }
  // Beine
  legs(p, cx, fy, 29, ['#221a16', '#30241c', '#44342a'], ['#120c0a', '#1e1410', '#342418']);
  // Mantel
  for (let y = ty; y <= ty + 12; y++) for (let x = cx - 3; x <= cx + 4; x++) {
    if (y > ty + 9 && (x === cx + 4 || x === cx - 3) && y === ty + 12) continue;
    const i = x < cx - 1 ? 3 : x > cx + 2 ? 1 : 2;
    p.px(x, y, COAT[i]);
  }
  p.line(cx + 1, ty + 1, cx + 1, ty + 12, COAT[1]); // Knopfleiste
  if (p.fine) {
    // Mantel: Lichtkante, Revers, Falten am Schoß (Tal + Grat), Saum, Knöpfe mit Glanz
    p.rect(cx - 3, ty + 0.5, 0.5, 11.5, tone(COAT[3], 0.2));
    p.fline(cx - 1, ty, cx + 0.5, ty + 3, COAT[3]); p.fline(cx + 3, ty, cx + 1.5, ty + 3, COAT[0]); p.dot(cx + 1, ty + 0.5, SHIRT[2]); p.dot(cx + 1, ty + 1, SHIRT[1]);
    p.rect(cx + 1.5, ty + 3, 0.5, 9, COAT[3]);
    fold(p, cx - 0.5, ty + 8.5, ty + 12.5, COAT[1], COAT[3]); fold(p, cx + 3.5, ty + 8.5, ty + 12, COAT[0], COAT[2]);
    p.rect(cx - 2.5, ty + 12.5, 7, 0.5, COAT[0]);
    fmap(p, cx + 2, ty + 3, ['43', '21'], GP); fmap(p, cx + 2, ty + 5.5, ['32', '21'], GP);
  } else { p.px(cx + 2, ty + 3, G[3]); p.px(cx + 2, ty + 6, G[2]); }
  p.rect(cx - 3, ty + 7, 8, 1, L[1]); // Gürtel
  if (p.fine) { p.rect(cx - 3, ty + 7, 8, 0.5, L[2]); fmap(p, cx - 0.5, ty + 7, ['4332', '3..1'], GP); }
  // Tragegurt
  p.line(cx - 3, ty, cx - 1, ty + 7, L[3]);
  if (p.fine) { p.fline(cx - 3.5, ty, cx - 1.5, ty + 7, tone(L[3], 0.25)); stitch(p, cx - 2.5, ty + 1, cx - 1, ty + 6, L[1], 3); }
  // Münzbeutel
  if (p.fine) {
    fmap(p, cx + 3, ty + 7, [
      '..Kk..',
      '..kk..',
      '.5bb5.',
      '5aaabc',
      '5aagbc',
      '5aabbc',
      '.abbc.',
      '..cc..',
    ], { K: G[4], k: G[2], 5: '#8a6446', a: L[3], b: L[2], c: L[1], g: G[3] });
  } else {
    p.rect(cx + 3, ty + 8, 3, 3, L[3]); p.px(cx + 3, ty + 8, '#8a6446'); p.px(cx + 4, ty + 7, G[3]); p.px(cx + 5, ty + 10, L[1]);
    p.px(cx + 4, ty + 9, G[3]);
  }
  // Kopf + Hut mit breiter Krempe
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN, talk, iris: '#3a2a1a' });
  if (p.fine) {
    // Haar hinten in Strähnen, Schnurrbart und Kinnbart
    fmap(p, hx + 1, hy + 1, ['bcbb', 'cbab', 'bcab', 'bbca', 'cbab', 'bcba', 'bbab', 'cba.', 'ba..', 'a...'], { a: DARKH[0], b: DARKH[1], c: DARKH[2] });
    fmap(p, hx + 4.5, hy + 5.5, ['..cbb.', 'b.....', '..bcb.', '..bab.', '...b..'], { a: DARKH[0], b: DARKH[1], c: DARKH[2] });
  } else {
    p.rect(hx + 5, hy + 6, 2, 1, DARKH[1]); p.px(hx + 4, hy + 7, DARKH[1]); // Kinnbart
    p.rect(hx + 1, hy + 1, 2, 5, DARKH[1]); // Haar hinten
  }
  p.rect(hx - 2, hy + 1, 12, 1, HAT[2]); p.rect(hx - 2, hy + 1, 4, 1, HAT[3]); p.px(hx + 9, hy + 2, HAT[1]);
  p.rect(hx + 1, hy - 3, 6, 4, HAT[2]); p.rect(hx + 1, hy - 3, 2, 4, HAT[3]); p.rect(hx + 1, hy, 6, 1, CR[3]);
  p.px(hx + 2, hy - 4, HAT[3]); p.rect(hx + 3, hy - 4, 3, 1, HAT[2]);
  if (p.fine) {
    // Filzhut: Krempe mit Lichtkante oben und Schatten unten, Delle im Kopf, Hutband mit Schnalle
    p.rect(hx - 2, hy + 1, 5, 0.5, tone(HAT[3], 0.22)); p.rect(hx + 3, hy + 1, 6, 0.5, HAT[3]);
    p.rect(hx - 1.5, hy + 1.5, 10.5, 0.5, HAT[1]); p.dot(hx + 9.5, hy + 1.5, HAT[2]); p.dot(hx - 2, hy + 1.5, HAT[2]);
    p.rect(hx + 1, hy - 2.5, 0.5, 2.5, tone(HAT[3], 0.18)); p.rect(hx + 2.5, hy - 4, 3, 0.5, HAT[3]);
    p.dot(hx + 4, hy - 3.5, HAT[1]); p.dot(hx + 4.5, hy - 3, HAT[1]); fold(p, hx + 5, hy - 2.5, hy, HAT[1], HAT[3]);
    p.rect(hx + 6.5, hy - 3, 0.5, 3, HAT[1]);
    p.rect(hx + 1, hy, 6, 0.5, CR[4]); p.rect(hx + 1, hy + 0.5, 6, 0.5, CR[2]);
    fmap(p, hx + 1.5, hy, ['43', '21'], GP);
    // Feder: Kiel und Fahne fein
    quill(p, hx + 0.5, hy - 0.5, hx - 3, hy - 6, '#f4e8c0', '#e0cc90', '#c8b070', '#8a7840');
  } else {
    // Feder am Hut
    p.line(hx, hy - 1, hx - 3, hy - 5, '#c8b070'); p.px(hx - 3, hy - 6, '#e8d8a0');
  }
  // Arme: hinten am Gurt, vorn Geste (Münze)
  arm(p, cx - 2, ty + 1, cx - 2, ty + 7, COAT[1], COAT[2], SKIN[1]);
  if (gest) {
    arm(p, cx + 3, ty + 1, cx + 7, ty - 1 - gest, COAT[2], COAT[1], null);
    if (p.fine) {
      fmap(p, cx + 7, ty - 2 - gest, ['.32.', '3321', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
      fmap(p, cx + 8, ty - 4 - gest, ['.54.', '5443', '3221'], GP);
      g.dot(cx + 8.5, ty - 4 - gest, '#ffffff'); g.dot(cx + 8, ty - 3.5 - gest, G[4]); g.dot(cx + 9, ty - 3.5 - gest, G[3]);
      g.dot(cx + 8.5, ty - 4.5 - gest, G[3]); g.dot(cx + 8.5, ty - 5 - gest, G[2]); g.dot(cx + 7.5, ty - 4 - gest, G[2]);
    } else {
      p.rect(cx + 7, ty - 2 - gest, 2, 2, SKIN[2]);
      p.px(cx + 8, ty - 4 - gest, G[4]); p.px(cx + 9, ty - 4 - gest, G[3]); g.px(cx + 8, ty - 4 - gest, G[4]);
    }
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 7, COAT[2], COAT[1], SKIN[2]);
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Kommandant Hale
const SP = { w: '#ffffff', 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1], 0: St[0] };
const CRP = { 4: CR[4], 3: CR[3], 2: CR[2], 1: CR[1], 0: CR[0] };
function drawHale(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 10 - b;
  // Umhang hinten
  if (p.fine) {
    // Kante glatt, zwei Falten laufen von der Schulter auseinander (Tal dunkel, Grat hell), Saum unten
    const left = (y) => { const k = (y - ty) / (fy - ty); return cx - 4 - (2 + k * 4 + sw * k); };
    p.each(cx - 14, ty - 1, cx + 0.99, fy - 0.01, (x, y) => {
      const xl = left(y);
      if (x < xl - 0.25 || x >= cx + 1) return null;
      if (y > fy - 0.5) return NAVY_F[0];
      let i = x - xl < 0.75 ? 3 : x > cx - 1 ? 1 : 2;
      for (const [f, y0] of [[0.42, ty + 3], [0.76, ty + 7]]) {
        if (y < y0) continue;
        const xf = xl + (cx - 2 - xl) * f;
        if (Math.abs(x - xf) < 0.26) i = y < y0 + 2 ? 1 : 0;
        else if (x < xf && x > xf - 0.76 && y > y0 + 1) i = 3;
      }
      return NAVY_F[i];
    });
    for (let x = cx - 9; x < cx - 3; x += 2) { p.rect(x + Math.round(sw), fy, 1, 0.5, NAVY[1]); p.dot(x + Math.round(sw) + 0.5, fy + 0.5, NAVY[0]); }
  } else {
    for (let y = ty - 1; y <= fy - 1; y++) {
      const k = (y - ty) / (fy - ty), back = Math.round(2 + k * 4 + sw * k);
      for (let x = cx - 4 - back; x <= cx; x++) p.px(x, y, NAVY[x < cx - 3 - back ? 3 : x > cx - 2 ? 1 : 2]);
    }
    for (let x = cx - 9; x < cx - 3; x += 2) p.px(x + Math.round(sw), fy, NAVY[1]);
  }
  // Plattenbeine
  legs(p, cx, fy, 28, [St[1], St[2], St[4]], [St[0], St[2], St[4]]);
  if (p.fine) {
    // Beinschienen: Kniekachel 5-stufig mit Glanzpunkt, Glanzlinie auf der Schiene, Folgen am Schuh
    p.rect(cx - 3, 30, 3, 0.5, St[0]); p.rect(cx - 3, 30.5, 3, 0.5, St[2]);
    fmap(p, cx + 1, 30.5, ['.2342.', '234w42', '123321', '.1221.'], SP);
    p.rect(cx + 1.5, 32.5, 0.5, 1.5, St[5]);
    p.rect(cx + 1, fy - 1.5, 3, 0.5, St[1]); p.rect(cx - 3, fy - 1.5, 3, 0.5, '#10131c');
  } else { p.px(cx + 2, 31, St[4]); p.px(cx + 2, 32, St[3]); } // Kniekachel
  // Brustplatte
  p.rect(cx - 4, ty, 9, 10, St[2]); p.rect(cx - 4, ty, 2, 10, St[3]); p.rect(cx + 4, ty, 1, 10, St[1]);
  if (p.fine) {
    // Lichtkante, Glanzlinie (1 Feinpixel) und Glanzpunkt, Nieten, Schattenkante rechts, Bauchreifen
    p.rect(cx - 4, ty, 0.5, 10, St[4]); p.rect(cx - 3, ty + 1, 0.5, 6, St[5]); p.dot(cx - 3, ty + 1, '#ffffff');
    p.rect(cx - 2.5, ty + 1, 0.5, 8, St[2]); p.rect(cx + 4.5, ty, 0.5, 10, St[0]); p.rect(cx + 3, ty, 0.5, 10, St[3]);
    for (const y of [ty + 3, ty + 6]) { p.dot(cx - 3.5, y, St[5]); p.dot(cx - 3.5, y + 0.5, St[1]); p.dot(cx + 3.5, y, St[3]); p.dot(cx + 3.5, y + 0.5, St[0]); }
    p.rect(cx - 4, ty + 9.5, 9, 0.5, St[1]); p.rect(cx - 4, ty + 9, 2, 0.5, St[4]);
  } else p.px(cx - 3, ty + 1, St[5]);
  // Wappenrock
  p.rect(cx - 2, ty + 2, 5, 12, CR[2]); p.rect(cx - 2, ty + 2, 1, 12, CR[3]); p.rect(cx + 2, ty + 2, 1, 12, CR[1]);
  p.px(cx - 2, ty + 14, CR[2]); p.px(cx + 2, ty + 14, CR[1]);
  if (p.fine) {
    // Goldborte am Halsausschnitt, Falten unter dem Gürtel, gezackter Saum, Schwert-Wappen in Gold
    p.rect(cx - 2, ty + 2, 5, 0.5, G[2]); p.dot(cx - 2, ty + 2, G[3]); p.dot(cx - 1.5, ty + 2, G[4]);
    p.rect(cx - 2, ty + 2.5, 0.5, 11.5, CR[4]);
    fold(p, cx, ty + 9.5, ty + 14, CR[1], CR[3]); fold(p, cx + 2, ty + 10, ty + 14, CR[0], CR[2]);
    p.rect(cx - 1.5, ty + 13.5, 4, 0.5, CR[1]); p.dot(cx - 1.5, ty + 14.5, CR[1]); p.dot(cx + 2.5, ty + 14.5, CR[0]);
    fmap(p, cx - 1, ty + 4, ['..43..', '.4332.', '443321', '.3221.', '..21..', '..21..', '..21..', '.1111.'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
  } else { p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 5, G[3]); p.px(cx + 1, ty + 5, G[3]); p.px(cx, ty + 6, G[3]); p.px(cx, ty + 7, G[2]); }
  p.rect(cx - 4, ty + 8, 9, 1, L[1]); p.px(cx + 1, ty + 8, G[3]); // Gürtel
  if (p.fine) { p.rect(cx - 4, ty + 8, 9, 0.5, L[2]); p.dot(cx - 4, ty + 8, L[3]); fmap(p, cx + 0.5, ty + 8, ['4332', '3..1'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] }); }
  // Schulterstücke
  if (p.fine) {
    // zwei Folgen je Seite: Kante oben hell, Fuge dunkel, Niete; vorn links im Licht, hinten rechts im Schatten
    fmap(p, cx - 5, ty - 1, ['.w54443.', '54443332', '21151110', '44333322', '33322221', '.111110.'], SP);
    fmap(p, cx + 2, ty - 1, ['.454332.', '44333221', '11141000', '33222211', '22211110', '.000000.'], SP);
  } else {
    p.rect(cx - 5, ty - 1, 4, 3, St[3]); p.rect(cx - 5, ty - 1, 4, 1, St[4]); p.px(cx - 5, ty - 1, St[5]);
    p.rect(cx + 2, ty - 1, 4, 3, St[2]); p.rect(cx + 2, ty - 1, 4, 1, St[4]);
  }
  // Halsberge
  if (p.fine) fmap(p, cx - 2, ty - 2, ['5443332211', '2111111110', '4333222211', '1111100000'], SP);
  else { p.rect(cx - 2, ty - 2, 5, 2, St[2]); p.px(cx - 2, ty - 2, St[4]); }
  // Kopf: kurzes dunkles Haar, graue Schläfen, Narbe
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk, brow: DARKH[0], iris: '#3a4a5a' });
  if (p.fine) {
    // kurzes Haar in Strähnen mit Lichtkante, graue Schläfe; Stoppeln als dunklere Kieferfläche, Narbe über der Braue
    fmap(p, hx + 1, hy, [
      '.ccbcbbb..',
      'cbcbbabbab',
      'bbabbabaab',
      'babaaab.a.',
      'bbab',
      'baGa',
      'bgGb',
      'bagb',
      'bgb.',
      'bb..',
    ], { a: DARKH[0], b: DARKH[1], c: DARKH[2], g: GREYH[1], G: GREYH[2] });
    p.rect(hx + 4, hy + 6, 3, 1.5, '#7a4e3c'); p.rect(hx + 4, hy + 7, 2.5, 0.5, '#6a4434'); p.rect(hx + 4, hy + 7.5, 2, 0.5, '#5a3a30'); p.dot(hx + 4, hy + 6, SKIN[1]);
    p.rect(hx + 5.5, hy + 6, 1, 0.5, talk ? '#2a0e10' : '#4a2a22'); p.dot(hx + 6.5, hy + 6, '#7a5040');
    p.dot(hx + 6, hy + 2, '#8a4a40'); p.dot(hx + 6, hy + 2.5, '#9a5a4c'); p.dot(hx + 6.5, hy + 3, '#8a4a40'); p.dot(hx + 6.5, hy + 2.5, SKIN[3]);
  } else {
    p.rect(hx + 1, hy, 5, 2, DARKH[1]); p.rect(hx + 1, hy + 2, 2, 3, DARKH[1]); p.px(hx + 2, hy, DARKH[2]); p.px(hx + 3, hy + 3, GREYH[1]); p.px(hx + 2, hy + 4, GREYH[1]);
    p.rect(hx + 4, hy + 6, 3, 2, '#5a3a30'); p.px(hx + 5, hy + 6, talk ? '#2a0e10' : '#5a3a30'); // Stoppelbart
    p.px(hx + 6, hy + 2, SKIN[1]); p.px(hx + 6, hy + 3, '#8a4a40'); // Narbe
  }
  // hinterer Arm (Geste beim Sprechen: Faust nach vorn)
  if (gest) {
    arm(p, cx - 1, ty + 1, cx + 7, ty + 2 - gest, St[2], St[3], null);
    if (p.fine) {
      bandF(p, cx, ty + 1.5, cx + 8, ty + 2.5 - gest, 2, [St[4], St[3], St[2], St[1]]);
      fmap(p, cx + 3, ty + 1 - gest * 0.4, ['232', '121'], SP);   // Ellbogenkachel
      fmap(p, cx + 7, ty + 1 - gest, ['.443', '4w43', '3332', '2211'], SP);
    } else { p.rect(cx + 7, ty + 1 - gest, 2, 2, St[3]); p.px(cx + 8, ty + 1 - gest, St[5]); }
  } else {
    arm(p, cx - 4, ty + 1, cx - 4, ty + 8, St[1], St[2], St[1]);
    if (p.fine) { bandF(p, cx - 3, ty + 1.5, cx - 3, ty + 8.5, 2, [St[3], St[2], St[1], St[0]]); p.rect(cx - 4, ty + 4.5, 2, 0.5, St[0]); p.rect(cx - 4, ty + 5, 1, 0.5, St[3]); }
  }
  // vorderer Arm mit Helm unter dem Arm
  arm(p, cx + 4, ty + 1, cx + 5, ty + 6, St[3], St[2], null);
  if (p.fine) bandF(p, cx + 5, ty + 1.5, cx + 6, ty + 6.5, 2, [St[4], St[3], St[2], St[1]]);
  const mx = cx + 5, my = ty + 5;
  if (p.fine) {
    // Helm: Kugel 6-stufig (Licht oben links), Glanzlinie als Bogen, Glanzpunkt, Sehschlitz mit Atemlöchern
    p.ellipse(mx + 1, my + 2, 3, 3, (nx, ny, d) => {
      if (Math.abs(d - 0.5) < 0.09 && nx < -0.05 && ny < -0.05) return St[5];
      const l = -0.55 * nx - 0.65 * ny + 0.35 * (1 - d);
      return St[l > 0.8 ? 4 : l > 0.42 ? 3 : l > 0.05 ? 2 : l > -0.4 ? 1 : 0];
    });
    p.dot(mx - 0.5, my + 0.5, '#ffffff');
    p.rect(mx + 1, my + 2, 3, 0.5, '#07080c'); p.rect(mx + 1, my + 2.5, 3, 0.5, St[0]); p.rect(mx + 1, my + 3, 2.5, 0.5, St[3]);
    p.dot(mx + 2, my + 3.5, '#07080c'); p.dot(mx + 3, my + 3.5, '#07080c');
  } else {
    p.ellipse(mx + 1, my + 2, 3, 3, St[2]); p.rect(mx - 1, my, 3, 2, St[4]); p.px(mx - 1, my, St[5]);
    p.rect(mx + 1, my + 2, 3, 1, '#07080c'); // Visierschlitz
  }
  if (p.fine) fmap(p, mx - 2, my - 3, ['43.4..', '3343..', '.3332.', '..3322', '..2321', '..1221'], CRP);   // Helmbusch in Strähnen
  else { p.rect(mx - 1, my - 2, 2, 2, CR[3]); p.px(mx - 2, my - 3, CR[4]); p.px(mx - 1, my - 3, CR[3]); } // Helmbusch
  p.rect(mx + 3, my + 4, 2, 1, St[1]);
  if (p.fine) fmap(p, mx + 3, my, ['4432', '3w32', '3221', '2110'], SP);   // Panzerhandschuh
  else p.rect(mx + 3, my, 2, 2, St[3]); // Panzerhandschuh
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Seherin Ysolde
const BLIND = ['#2a1e3a', '#3a2a52', '#4a3a68', '#5e4a80', '#7a64a0'];
// Runen auf den Steinen (4×4 Feinpixel), x = Strich, o = heißer Kern
const RUNES = [
  ['.x..', '.ox.', '.x.x', '.x..'],
  ['x..x', '.xo.', '.xx.', 'x..x'],
  ['.xx.', 'x.ox', '.xx.', '..x.'],
];
function drawYsolde(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Runensteine (hinter dem Körper, wenn sin < 0)
  const stones = [0, 1 / 3, 2 / 3].map((ph, n) => {
    const a = (t + ph) * TAU;
    return { x: Math.round(cx + 1 + Math.cos(a) * 9), y: Math.round(ty + 1 - gest * 2 + Math.sin(a) * 2.5 + Math.sin(a * 2 + ph * 7) * 1), front: Math.sin(a) > 0, k: ph, n };
  });
  const drawStone = (s) => {
    if (p.fine) {
      // Stein mit Kantenlicht oben links, Rune als Feinstrich, heißer Kern
      fmap(p, s.x - 1, s.y - 1, ['.4332.', '433221', '322211', '322110', '211110', '.1100.'], { 4: '#5e5878', 3: '#4a4460', 2: '#2a2638', 1: '#1e1a2a', 0: '#16121e' });
      fmap(p, s.x - 0.5, s.y - 0.5, RUNES[s.n], { x: talk ? M[4] : M[3], o: talk ? '#ffffff' : M[4] });
    } else {
      p.rect(s.x - 1, s.y - 1, 3, 3, '#2a2638'); p.px(s.x - 1, s.y - 1, '#4a4460'); p.px(s.x + 1, s.y + 1, '#16121e');
      p.px(s.x, s.y, talk ? M[4] : M[3]);
    }
    if (g.fine) {
      // Leuchtebene fein: Rune im Saum (M2/M3), Kern weiß bzw. hell, Funkenspur
      fmap(g, s.x - 0.5, s.y - 0.5, RUNES[s.n], { x: M[3], o: '#ffffff', '.': M[1] });
      g.dot(s.x - 1, s.y + 0.5, M[2]); g.dot(s.x + 1.5, s.y, M[2]); g.dot(s.x + 0.5, s.y - 1, M[2]);
      g.dot(s.x - 2, s.y + 2, M[2]); g.dot(s.x - 2.5, s.y + 2.5, M[1]); g.dot(s.x - 1.5, s.y + 2, M[1]);
    } else {
      g.px(s.x, s.y, talk ? '#ffffff' : M[4]); g.px(s.x - 1, s.y, M[2]); g.px(s.x + 1, s.y, M[2]); g.px(s.x, s.y - 1, M[2]);
      // Funkenspur
      g.px(s.x - 2, s.y + 2, M[1]);
    }
  };
  for (const s of stones) if (!s.front) drawStone(s);
  // Silberhaar hinten, lang, weht
  if (p.fine) {
    // Strähnen: wellig, verschieden lang, Licht links (oben), Rillen dunkel
    p.each(cx - 10, hy + 2, cx - 1, ty + 11, (x, y) => {
      const k = (y - hy) / 20, xl = cx - 5 - (k * 2 + sw * k);
      const u = x - xl + Math.sin(y * 0.9 + 1) * 0.6 + (y > ty + 4 ? Math.sin(y * 2.1) * 0.3 : 0);
      if (u < 0 || u >= 3) return null;
      const s = Math.floor(u * 2);
      if (y > ty + 9.5 + ((s * 5) % 3) * 0.5) return null;
      return SILVER_F[[0, 1, 2, 1, 2, 3][s]];
    });
  } else {
    for (let y = hy + 2; y <= ty + 9; y++) {
      const k = (y - hy) / 20, off = Math.round(k * 2 + sw * k);
      p.px(cx - 4 - off, y, SILVER[1]); p.px(cx - 3 - off, y, SILVER[2]); p.px(cx - 5 - off, y, SILVER[0]);
    }
  }
  // Robe (lang, schwingt am Saum)
  if (p.fine) {
    skirtFine(p, cx, ty, fy, 3.2, 6.5, ROBE_VF.slice(1), sw * 0.8, 3);
    const l = cx - 6.5 + sw * 0.8, r = cx + 7.5 + sw * 0.8;
    p.each(l - 1, fy - 1, r + 2, fy + 0.99, (x, y) => {
      if (x < l || x > r + 1) return null;
      if (y >= fy) return ROBE_VF[0];
      // goldene Borte: Flechtmuster, oben heller
      const f = (Math.floor(x * 2) + (y < fy - 0.5 ? 0 : 1)) % 3;
      return f === 0 ? G[3] : y < fy - 0.5 ? G[2] : G[1];
    });
    // Halsausschnitt, Lichtkante am Mieder
    p.rect(cx - 2, ty, 5, 0.5, ROBE_V[4]); p.dot(cx + 0.5, ty + 0.5, ROBE_V[1]); p.dot(cx + 1, ty + 1, ROBE_V[1]); p.dot(cx + 1.5, ty + 0.5, ROBE_V[1]);
  } else {
    for (let y = ty; y <= fy; y++) {
      const k = (y - ty) / (fy - ty), hw = 3.2 + k * 3.3, sh = Math.round(sw * k * 0.8);
      for (let x = Math.round(cx - hw) + sh; x <= Math.round(cx + 1 + hw) + sh; x++) {
        const rel = (x - sh - (cx - hw)) / (2 * hw + 1);
        let i = rel < 0.25 ? 4 : rel < 0.6 ? 3 : rel < 0.85 ? 2 : 1;
        if (y === fy) i = 0;
        if ((x - sh) % 3 === 0 && y > ty + 10) i = Math.max(0, i - 1);
        p.px(x, y, ROBE_V[i]);
      }
    }
    // Goldene Borte
    for (let x = cx - 6; x <= cx + 7; x++) if ((x & 1) === 0) p.px(x + Math.round(sw * 0.8), fy - 1, G[2]);
  }
  // Gürtelschnur
  p.rect(cx - 3, ty + 6, 8, 1, G[2]); p.px(cx - 2, ty + 7, G[3]); p.px(cx - 2, ty + 8, G[2]);
  if (p.fine) {
    // gedrehte Schnur, hängendes Ende mit Quaste
    for (let x = cx - 3; x < cx + 5; x += 0.5) { const o = (x * 2) & 1; p.dot(x, ty + 6, o ? G[2] : G[3]); p.dot(x, ty + 6.5, o ? G[1] : G[2]); }
    p.rect(cx - 2, ty + 7, 0.5, 1.5, G[3]); p.rect(cx - 1.5, ty + 7, 0.5, 1.5, G[1]);
    fmap(p, cx - 2.5, ty + 8.5, ['.43.', '3221', '2.1.'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
  }
  // Sternmuster
  if (p.fine) {
    for (const [x, y, c] of [[cx + 3, ty + 12, M[4]], [cx - 1, ty + 15, M[3]]]) { p.dot(x, y, c === M[4] ? '#f0e0ff' : M[4]); p.dot(x - 0.5, y, c); p.dot(x + 0.5, y, c); p.dot(x, y - 0.5, c); p.dot(x, y + 0.5, c); }
    p.dot(cx + 1, ty + 18.5, M[3]); p.dot(cx - 3.5, ty + 11, M[3]);
  } else { p.px(cx + 3, ty + 12, M[4]); p.px(cx - 1, ty + 15, M[3]); }
  // Kopf mit Augenbinde
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_PALE, talk, lip: '#8a5a68' });
  if (p.fine) {
    // Silberhaar in Strähnen, Scheitel oben, wellig über die Schläfe
    fmap(p, hx + 1, hy, [
      '.ddcdcc...',
      'dccbcbcb..',
      'cbcbbcbab.',
      'bcbab.ab..',
      'cbab',
      'dcba',
      'cbba',
      'bcba',
      'bcab',
      'cbab',
      'cbba',
      'bcb.',
      'bab.',
      'ab..',
    ], { a: SILVER[0], b: SILVER[1], c: SILVER[2], d: SILVER[3] });
    // Augenbinde: Stoff mit Falte, eingestickte Rune schimmert
    fmap(p, hx + 3, hy + 3, ['4433333332', '3322122221', '2213222110', '1111111000'], { 4: BLIND[4], 3: BLIND[3], 2: BLIND[2], 1: BLIND[1], 0: BLIND[0] });
    p.dot(hx + 5, hy + 3.5, M[2]); p.dot(hx + 5.5, hy + 3.5, M[3]); p.dot(hx + 6, hy + 3.5, M[2]);
    g.dot(hx + 5, hy + 3.5, M[2]); g.dot(hx + 5.5, hy + 3.5, talk ? '#ffffff' : M[4]); g.dot(hx + 6, hy + 3.5, M[2]);
    // Knoten am Hinterkopf, Bänder wehen
    fmap(p, hx + 0.5, hy + 3, ['43', '21'], { 4: BLIND[4], 3: BLIND[3], 2: BLIND[2], 1: BLIND[1] });
    p.fline(hx, hy + 3.5, hx - 2, hy + 4 + sw * 0.8, BLIND[3]); p.fline(hx, hy + 4, hx - 2.5, hy + 5.5 + sw, BLIND[1]);
    // Stirnreif mit Stein
    fmap(p, hx + 3, hy + 1.5, ['1223m432'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1], m: M[4] });
  } else {
    p.rect(hx + 1, hy, 5, 2, SILVER[2]); p.px(hx + 2, hy, SILVER[3]); p.rect(hx + 1, hy + 2, 2, 5, SILVER[2]); p.px(hx + 1, hy + 3, SILVER[3]);
    p.rect(hx + 3, hy + 3, 5, 2, '#3a2a52'); p.rect(hx + 3, hy + 3, 5, 1, '#5e4a80'); p.px(hx + 7, hy + 4, '#2a1e3a'); // Augenbinde
    g.px(hx + 5, hy + 3, M[2]); // schwacher Schimmer durch die Binde
    // Bindenenden wehen hinten
    p.px(hx, hy + 3, '#5e4a80'); p.px(hx - 1, hy + 4 + Math.round(sw * 0.6), '#3a2a52'); p.px(hx - 2, hy + 4 + Math.round(sw), '#5e4a80'); p.px(hx - 2, hy + 5 + Math.round(sw), '#3a2a52');
    // Stirnreif
    p.px(hx + 5, hy + 1, G[3]); p.px(hx + 6, hy + 1, G[4]);
  }
  // Arme: Hände offen nach vorn/oben
  const lift = gest ? 3 : 1;
  const SP3 = { 3: SKIN_PALE[3], 2: SKIN_PALE[2], 1: SKIN_PALE[1] };
  arm(p, cx - 2, ty + 1, cx + 3, ty + 5 - lift, ROBE_V[2], ROBE_V[3], null);
  if (p.fine) fmap(p, cx + 4, ty + 4.5 - lift, ['3.', '32', '21'], SP3);
  else p.px(cx + 4, ty + 5 - lift, SKIN_PALE[2]);
  arm(p, cx + 3, ty + 1, cx + 7, ty + 4 - lift, ROBE_V[3], ROBE_V[2], null);
  if (p.fine) {
    // offene Hand, Finger gespreizt; Funke darüber mit heißem Kern
    p.rect(cx + 7, ty + 4 - lift, 1, 0.5, ROBE_V[4]); p.dot(cx + 7.5, ty + 4.5 - lift, G[2]);
    fmap(p, cx + 8, ty + 3 - lift, ['3.3', '232', '321', '21.'], SP3);
    const sx = cx + 9, sy = ty + 2 - lift;
    p.dot(sx, sy, '#ffffff'); p.dot(sx - 0.5, sy, M[4]); p.dot(sx + 0.5, sy, M[3]); p.dot(sx, sy - 0.5, M[4]); p.dot(sx, sy + 0.5, M[3]);
    g.dot(sx, sy, '#ffffff'); g.dot(sx - 0.5, sy, M[4]); g.dot(sx + 0.5, sy, M[4]); g.dot(sx, sy - 0.5, M[4]); g.dot(sx, sy + 0.5, M[3]);
    g.dot(sx - 0.5, sy - 0.5, M[2]); g.dot(sx + 0.5, sy - 0.5, M[2]); g.dot(sx, sy - 1, M[3]); g.dot(sx, sy - 1.5, M[2]); g.dot(sx + 1, sy, M[2]);
  } else {
    p.px(cx + 8, ty + 4 - lift, SKIN_PALE[3]); p.px(cx + 8, ty + 3 - lift, SKIN_PALE[2]);
    p.px(cx + 9, ty + 2 - lift, M[3]); g.px(cx + 9, ty + 2 - lift, M[4]); g.px(cx + 9, ty + 1 - lift, M[2]);
  }
  for (const s of stones) if (s.front) drawStone(s);
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: cx + 9 - AX, dy: ty + 2 - lift - AY } };
}

// ------------------------------------------------------------ Quartiermeister Dunn (Zwerg)
// Gesicht 18×10 Feinpixel ab (hx, hy): Glatze mit Glanz, Haarkranz a/b, Ohr 0/1, buschige Braue c/C, Auge k/w/g/i,
// Knollennase, rote Wange r. Der Bart liegt darüber ab hy+5.
const DUNN_FACE = [
  '.2333hh33333332...',
  '23333h3333333332..',
  'abb23333333333332.',
  'babb2333333333332.',
  'abab222222CCcccc..',
  'baba222222bbbbb2..',
  'ab1b22222222kkk2..',
  'ba01b222222wgk2332',
  'ab1ab2222221ik3333',
  'baba222222r2233332',
];
function drawDunn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t);
  const ty = 21 - b, hy = 13 - b;
  // Stämmige Beine
  p.rect(cx - 4, 31, 4, 4, '#2a2230'); p.rect(cx + 1, 31, 4, 4, '#382e3e');
  p.rect(cx - 5, fy - 2, 5, 3, '#120c0a'); p.rect(cx + 1, fy - 2, 6, 3, L[1]); p.rect(cx + 1, fy - 2, 6, 1, L[3]);
  if (p.fine) {
    // Hose mit Knielicht und Falte, Stiefel: Schaftkante, Schnürung, Sohle, Zehenlicht
    p.rect(cx + 1, 31, 0.5, 4, '#4a3e52'); fold(p, cx + 3.5, 31.5, 35, '#2a2230', '#46394e'); p.rect(cx - 4, 31, 0.5, 4, '#382e3e');
    p.rect(cx - 5, fy - 2, 5, 0.5, '#2a1c16'); p.rect(cx - 5, fy + 0.5, 5, 0.5, '#080504');
    p.rect(cx + 1, fy - 2, 6, 0.5, tone(L[3], 0.2)); p.rect(cx + 1, fy - 1.5, 6, 0.5, L[2]);
    p.dot(cx + 2.5, fy - 1, L[3]); p.dot(cx + 3, fy - 0.5, L[3]); p.dot(cx + 3.5, fy - 1, L[3]); p.dot(cx + 3, fy - 1, L[0]);
    p.dot(cx + 6, fy - 1, tone(L[3], 0.3)); p.dot(cx + 6.5, fy - 0.5, L[2]); p.rect(cx + 1, fy + 0.5, 6, 0.5, '#0e0806');
  }
  // Rumpf (breit)
  p.rect(cx - 5, ty, 11, 11, SHIRT[1]); p.rect(cx - 5, ty, 3, 11, SHIRT[2]); p.rect(cx + 5, ty, 1, 11, SHIRT[0]);
  if (p.fine) { p.rect(cx - 5, ty + 0.5, 0.5, 10, tone(SHIRT[2], 0.2)); fold(p, cx - 3, ty + 7.5, ty + 11, SHIRT[0], SHIRT[2]); }
  // Schürze
  p.rect(cx - 2, ty + 3, 8, 10, APRON[2]); p.rect(cx - 2, ty + 3, 2, 10, APRON[3]); p.rect(cx + 5, ty + 3, 1, 10, APRON[1]);
  p.rect(cx, ty + 9, 4, 2, APRON[1]); p.px(cx, ty + 9, APRON[3]); // Tasche
  if (p.fine) {
    // Leder: Glanzkante, Punktnähte, Kratzer, Tasche mit Nieten und Naht, Werkzeug (Meißel, Bleistift)
    p.rect(cx - 2, ty + 3.5, 0.5, 9.5, tone(APRON[3], 0.22));
    stitch(p, cx - 1.5, ty + 3.5, cx + 5.5, ty + 3.5, APRON[1]); stitch(p, cx + 5, ty + 4, cx + 5, ty + 12.5, APRON[0]);
    stitch(p, cx - 1.5, ty + 12.5, cx + 4.5, ty + 12.5, APRON[1]);
    p.fline(cx + 3, ty + 5, cx + 4, ty + 6, APRON[1]); p.fline(cx + 3.5, ty + 5, cx + 4.5, ty + 6, tone(APRON[2], 0.18));
    p.fline(cx - 1, ty + 10, cx - 0.5, ty + 11.5, APRON[1]);
    p.rect(cx, ty + 9, 4, 0.5, APRON[3]); p.rect(cx, ty + 9.5, 4, 0.5, APRON[0]);
    stitch(p, cx + 0.5, ty + 10.5, cx + 3.5, ty + 10.5, APRON[3]);
    p.dot(cx, ty + 9, '#c8b090'); p.dot(cx + 3.5, ty + 9, '#a08868');
    p.rect(cx + 1, ty + 7.5, 0.5, 1.5, '#d0c4a2'); p.rect(cx + 1.5, ty + 7.5, 0.5, 1.5, '#80755c'); p.dot(cx + 1, ty + 7, St[4]); p.dot(cx + 1.5, ty + 7, St[2]);
    p.rect(cx + 2.5, ty + 7.5, 0.5, 1.5, '#d8a840'); p.dot(cx + 2.5, ty + 7, '#e8d8b0');
  } else { p.px(cx + 1, ty + 8, '#bcae8e'); p.px(cx + 2, ty + 8, '#80755c'); } // Werkzeug
  p.rect(cx - 5, ty + 6, 11, 1, L[0]); p.px(cx - 3, ty + 6, G[3]); // Gürtel
  if (p.fine) {
    p.rect(cx - 5, ty + 6, 11, 0.5, L[1]); p.dot(cx - 5, ty + 6, L[2]);
    fmap(p, cx - 3.5, ty + 6, ['4332', '3..1'], { 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
    // Schlüsselbund: Ring und zwei Schlüssel mit Bart, Glanzpunkt
    fmap(p, cx - 4.5, ty + 7, ['.43.', '3..2', '.42.', '43.2', '3.12', '2.1.', '1...'], { 4: St[5], 3: St[4], 2: St[2], 1: St[1] });
  } else { p.px(cx - 4, ty + 7, St[3]); p.px(cx - 4, ty + 8, St[4]); p.px(cx - 3, ty + 8, St[2]); } // Schlüsselbund
  // Kopf (breit), Glatze mit Haarkranz, großer Bart
  const hx = cx - 3;
  if (p.fine) {
    fmap(p, hx, hy, DUNN_FACE, {
      0: SKIN[0], 1: SKIN[1], 2: SKIN[2], 3: SKIN[3], h: '#e0b090', a: BEARD[0], b: BEARD[1], c: BEARD[2], C: BEARD[3],
      k: EYE, w: '#d6cabc', g: '#ffffff', i: '#3a2418', r: '#b8705a',
    });
  } else {
    p.rect(hx, hy, 8, 8, SKIN[2]); p.rect(hx + 1, hy, 6, 1, SKIN[3]); p.px(hx + 2, hy, '#e0b090');
    p.px(hx + 8, hy + 4, SKIN[2]); p.px(hx + 8, hy + 5, SKIN[1]); // Nase
    p.px(hx + 6, hy + 3, EYE); p.rect(hx + 5, hy + 2, 3, 1, BEARD[2]); // Braue
    p.rect(hx, hy + 1, 3, 5, BEARD[1]); p.px(hx + 1, hy + 3, SKIN[1]); // Haarkranz/Ohr
  }
  // Bart (wallend, geflochten)
  if (p.fine) {
    // Strähnen wellig, oben (Schnurrbart) im Licht, unten dunkler; Spitzen unregelmäßig; Mittelzopf mit Ring
    p.each(hx + 1, hy + 5, hx + 9, hy + 14, (x, y) => {
      const rx = x - hx, ry = y - hy;
      const inside = (ry < 9 && rx >= 1 && rx < 9 - (ry > 8.5 ? 0.5 : 0)) || (ry >= 9 && ry < 12 && rx >= 2 - (ry < 9.5 ? 0.5 : 0) && rx < 8) || (ry >= 12 && ry < 13.5 + Math.sin(rx * 3.3) * 0.5 && rx >= 3 && rx < 7);
      if (!inside) return null;
      const s = ((Math.floor((rx + Math.sin(ry * 1.6 + rx) * 0.5) * 2) % 4) + 4) % 4;
      if (s === 3) return BEARD[0];
      if (ry < 7 && rx > 5.5) return s === 0 ? BEARD[3] : BEARD[2];
      if (s === 0) return ry < 9 ? BEARD[3] : BEARD[2];
      return ry < 10 ? BEARD[2] : BEARD[1];
    });
    // Nasenspitze über dem Schnurrbart, Mund
    p.dot(hx + 8, hy + 5, SKIN[2]); p.dot(hx + 8.5, hy + 5, SKIN[1]); p.dot(hx + 7.5, hy + 5, SKIN[0]);
    p.rect(hx + 6.5, hy + 6.5, 1, 0.5, talk ? '#1a0808' : BEARD[0]);
    if (talk) p.dot(hx + 7, hy + 7, '#3a1010');
    // Zopf (zwei Glieder), Bartring mit Glanz, Quaste
    fmap(p, hx + 4, hy + 12, ['cCb.', '.bba', '.bCc', 'abb.'], { a: BEARD[0], b: BEARD[1], c: BEARD[2], C: BEARD[3] });
    fmap(p, hx + 4, hy + 14, ['4w32', '3221'], { w: '#fff8d8', 4: G[4], 3: G[3], 2: G[2], 1: G[1] });
    fmap(p, hx + 4, hy + 15, ['bcb.', '.ab.'], { a: BEARD[0], b: BEARD[1], c: BEARD[2] });
  } else {
    p.rect(hx + 1, hy + 5, 8, 4, BEARD[2]); p.rect(hx + 2, hy + 9, 6, 3, BEARD[2]); p.rect(hx + 3, hy + 12, 4, 2, BEARD[1]);
    p.rect(hx + 6, hy + 5, 3, 2, BEARD[3]); p.px(hx + 4, hy + 8, BEARD[3]); p.px(hx + 3, hy + 10, BEARD[3]); p.px(hx + 6, hy + 10, BEARD[1]);
    p.px(hx + 4, hy + 14, G[3]); p.px(hx + 5, hy + 14, G[2]); p.px(hx + 4, hy + 15, BEARD[1]); // Bartring
    p.px(hx + 7, hy + 6, talk ? '#1a0808' : BEARD[1]);
  }
  // Feder hinter dem Ohr
  if (p.fine) quill(p, hx + 2, hy + 2, hx - 1, hy - 3, '#fffbef', '#f0eadc', '#d0c8b8', '#8a8478');
  else { p.line(hx, hy - 2, hx + 2, hy + 2, '#e0d8c8'); p.px(hx - 1, hy - 3, '#fffbef'); }
  // Klemmbrett in der vorderen Hand
  const bx = cx + 5, by = ty + 2 - (gest ? 2 : 0);
  p.rect(bx, by, 6, 8, L[3]); p.rect(bx + 1, by + 1, 4, 6, PAPER[2]); p.rect(bx + 1, by + 1, 4, 1, PAPER[1]);
  p.rect(bx + 2, by - 1, 2, 1, St[3]);
  if (p.fine) {
    // Brett gemasert mit Kantenlicht, Papier mit Schriftzeilen und Häkchen, Klammer aus Blech mit Glanz
    grain(p, bx, by, 6, 8, L[2], tone(L[3], 0.2), 3);
    p.rect(bx, by, 6, 0.5, tone(L[3], 0.25)); p.rect(bx, by, 0.5, 8, tone(L[3], 0.15)); p.rect(bx + 5.5, by + 0.5, 0.5, 7.5, L[1]); p.rect(bx, by + 7.5, 6, 0.5, L[1]);
    p.rect(bx + 1, by + 1, 4, 6, PAPER[2]); p.rect(bx + 1, by + 1, 4, 0.5, PAPER[1]); p.rect(bx + 4.5, by + 1.5, 0.5, 5.5, PAPER[1]);
    const INK = '#3a3028';
    fmap(p, bx + 1.5, by + 2, ['vv.kkk', '......', 'v.kk.k', '......', 'vv.kkk', '......', '..kk.k', '......', 'v.k.kk'], { k: INK, v: '#2e5a2a' });
    p.dot(bx + 4.5, by + 6.5, PAPER[0]); p.dot(bx + 4, by + 6.5, PAPER[1]);
    fmap(p, bx + 1.5, by - 1, ['.4554.', '343332', '.2112.'], SP_D);
  } else for (let i = 0; i < 3; i++) p.rect(bx + 1, by + 3 + i * 1.5, 3 - (i % 2), 1, PAPER[0]);
  if (p.fine) fmap(p, bx - 1, by + 4, ['3332', '2221', '3221', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  else p.rect(bx - 1, by + 4, 2, 2, SKIN[2]);
  arm(p, cx + 3, ty + 1, bx - 1, by + 3, SHIRT[2], SHIRT[1], null);
  // hinterer Arm mit Kohlestift, tippt aufs Brett
  const tap = gest ? 0 : Math.round(Math.sin(t * TAU * 2));
  arm(p, cx - 2, ty + 1, bx + 1, by + 5 + tap, SHIRT[1], SHIRT[2], null);
  if (p.fine) {
    fmap(p, bx + 1, by + 5 + tap, ['.33.', '3322', '3221', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
    p.fline(bx + 2, by + 5 + tap, bx + 4, by + 3 + tap, '#1a1616', 0.5); p.dot(bx + 3.5, by + 3.5 + tap, '#5a5050'); p.dot(bx + 4, by + 3 + tap, '#0a0808');
  } else { p.rect(bx + 1, by + 5 + tap, 2, 2, SKIN[3]); p.line(bx + 2, by + 5 + tap, bx + 4, by + 3 + tap, '#1a1616'); }
  return { head: { dx: 0, dy: hy - AY } };
}
const SP_D = { 5: St[5], 4: St[4], 3: St[3], 2: St[2], 1: St[1] };

// ------------------------------------------------------------ Animationen (idle 6 Frames, talk 4 Frames)
// fine: true = eigener Feinweg (Ilsa, mkFrame), 'b' = buildFine (alter Weg + feine Ergänzungen)
function makeSet(draw, fine = false) {
  const mk = fine === 'b' ? (fn) => mkFineFrame(fn) : (fn) => mkFrame(fn, fine);
  const idle = new Animation(phases(6).map((t) => mk((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mk((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mk((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mk((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 2 })),
    mk((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 1 })),
  ], 6);
  return { idle, talk };
}

export function createNpcSprites2() {
  return lazySets({  // jede Figur erst bei Bedarf bauen
    warden_ilsa: () => makeSet(drawIlsa, true),
    herbalist_oona: () => makeSet(drawOona, 'b'),
    trader_vesk: () => makeSet(drawVesk, 'b'),
    commander_hale: () => makeSet(drawHale, 'b'),
    seer_ysolde: () => makeSet(drawYsolde, 'b'),
    quartermaster_dunn: () => makeSet(drawDunn, 'b'),
  });
}
