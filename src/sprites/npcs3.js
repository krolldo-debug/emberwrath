import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
import { TAU } from '../core/math.js';

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
}

function arm(p, x0, y0, x1, y1, c0, c1, hand) {
  p.line(x0, y0, x1, y1, c0); p.line(x0 + 1, y0, x1 + 1, y1, c1);
  if (hand) { p.px(x1, y1 + 1, hand); p.px(x1 + 1, y1 + 1, hand); }
}

// Rumpfblock mit Licht links, Schatten rechts (R: Rampe, m: Mittelstufe)
function torso(p, x, y, w, h, R, m = 2) {
  p.rect(x, y, w, h, R[m]); p.rect(x, y, 2, h, R[m + 1]); p.rect(x + w - 1, y, 1, h, R[m - 1]);
}

// Glockenförmiger Rock/Robe von y0 bis fy; hw0 → hw1 halbe Breite, sh = Saumschwung
function skirt(p, cx, y0, fy, hw0, hw1, R, sh = 0, fold = 3, ragged = false) {
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

function mkFrame(draw) {
  const gc = new PixelCanvas(W, H);
  let used = false;
  const g = new Proxy(gc, { get(t, k) { if (k === 'px' || k === 'rect' || k === 'line' || k === 'ellipse') used = true; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  let meta = null;
  const f = buildFrame(W, H, AX, AY, (p) => { meta = draw(p, g); });
  if (used) f.glow = new SpriteFrame(gc.canvas, AX, AY);
  if (meta) f.meta = meta;
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
  p.ellipse(sx, sy, 5, 6, OCHRE[1]); p.ellipse(sx, sy, 4, 5, OCHRE[2]);
  p.ellipse(sx - 1, sy - 1, 2, 3, OCHRE[3]);
  p.ellipse(sx, sy, 1.5, 1.5, BRZ[3]); p.px(sx - 1, sy - 1, BRZ[4]);
  for (let a = 0; a < 8; a++) p.px(Math.round(sx + Math.cos(a * TAU / 8) * 4), Math.round(sy + Math.sin(a * TAU / 8) * 5), BRZ[2]);
  // Fellwickel + Stiefel
  legs(p, cx, fy, 29, OCHRE, ['#1a120c', '#2a1c12', '#443020']);
  p.rect(cx + 1, 31, 3, 2, FUR[3]); p.px(cx + 1, 31, FUR[4]); p.rect(cx - 3, 31, 3, 2, FUR[1]);
  // Lamellenpanzer (Leder mit Bronzeschuppen)
  torso(p, cx - 3, ty, 7, 10, OCHRE);
  for (let y = ty + 1; y < ty + 6; y += 2) for (let x = cx - 2 + ((y >> 1) & 1); x < cx + 4; x += 2) p.px(x, y, y < ty + 3 ? BRZ[3] : BRZ[2]);
  p.rect(cx - 3, ty + 6, 7, 1, RUST[1]); p.px(cx + 1, ty + 6, BRZ[4]); // Gürtel
  // Schärpe/Rockschoß in Rostrot, weht leicht
  p.rect(cx - 3, ty + 7, 7, 4, RUST[2]); p.rect(cx - 3, ty + 7, 2, 4, RUST[3]); p.rect(cx + 3, ty + 7, 1, 4, RUST[1]);
  p.px(cx - 4 - Math.round(sw * 0.6), ty + 8, RUST[2]); p.px(cx - 5 - Math.round(sw), ty + 9, RUST[1]); p.px(cx - 5 - Math.round(sw), ty + 10, RUST[2]);
  for (let x = cx - 3; x <= cx + 3; x += 2) p.px(x, ty + 11, RUST[1]);
  // Fellkragen
  p.rect(cx - 4, ty - 1, 9, 3, FUR[3]); p.rect(cx - 4, ty - 1, 9, 1, FUR[4]); p.px(cx - 4, ty + 1, FUR[2]); p.px(cx + 4, ty + 1, FUR[2]);
  // Kopf mit Bronzehelm (Nasal) + Federbusch
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_TAN, talk });
  p.px(hx + 6, hy + 5, '#c05a3a'); p.px(hx + 4, hy + 5, '#c05a3a'); // Kriegsbemalung
  p.rect(hx + 1, hy + 2, 2, 5, BLACKH[1]); p.px(hx, hy + 6, BLACKH[1]); p.px(hx - 1, hy + 7, BLACKH[2]); // Haar/Zopf
  p.rect(hx, hy - 1, 7, 3, BRZ[2]); p.rect(hx + 1, hy - 2, 5, 1, BRZ[3]); p.rect(hx, hy - 1, 2, 3, BRZ[3]);
  p.px(hx + 2, hy - 2, BRZ[4]); p.px(hx + 1, hy - 1, BRZ[4]); p.rect(hx, hy + 1, 8, 1, BRZ[1]);
  p.px(hx + 6, hy + 2, BRZ[2]); p.px(hx + 6, hy + 3, BRZ[3]); // Nasal
  p.px(hx + 3, hy - 3, BRZ[3]); p.px(hx + 3, hy - 4, BRZ[2]); // Federhalter
  // Federn (drei lange, schwingen nach hinten)
  const fs = [[0, BN[3], BN[4]], [1, RUST[3], '#d06a3a'], [2, BN[2], BN[3]]];
  for (const [i, c0, c1] of fs) {
    for (let s = 0; s < 7; s++) {
      const k = s / 6, x = Math.round(hx + 3 - s - k * i * 0.6 - sw * k * 1.2), y = Math.round(hy - 4 - i + k * (2 + i * 1.3) + Math.sin(k * 3) * -1.2);
      p.px(x, y, s < 3 ? c1 : c0);
    }
  }
  // hinterer Arm
  if (gest) { arm(p, cx - 1, ty + 1, cx + 6, ty + 1 - gest, OCHRE[1], OCHRE[2], null); p.rect(cx + 6, ty - gest, 2, 2, SKIN_TAN[2]); p.px(cx + 8, ty - gest, SKIN_TAN[3]); }
  else arm(p, cx - 3, ty + 1, cx - 3, ty + 7, OCHRE[1], OCHRE[2], SKIN_TAN[1]);
  // Speer mit langer Bronzeklinge und Rosshaarquaste
  const spx = cx + 6;
  p.line(spx, 6 - b, spx, fy, WOOD[3]); p.line(spx + 1, 6 - b, spx + 1, fy, WOOD[1]);
  p.rect(spx, 2 - b, 2, 4, BRZ[3]); p.px(spx, 1 - b, BRZ[4]); p.px(spx + 1, 1 - b, BRZ[2]); p.px(spx, 0 - b + 1 - 1 + 0, BRZ[4]); p.px(spx + 1, 5 - b, BRZ[1]); p.px(spx, 3 - b, BRZ[4]);
  p.rect(spx - 1, 5 - b, 4, 1, BRZ[2]);
  p.px(spx - 1, 6 - b, '#2a1810'); p.px(spx - 1 - Math.round(sw * 0.5), 7 - b, '#3e2418'); p.px(spx - 2 - Math.round(sw), 8 - b, '#2a1810'); p.px(spx + 2, 6 - b, '#3e2418');
  arm(p, cx + 3, ty + 1, spx - 1, ty + 5, OCHRE[3], OCHRE[2], null);
  p.rect(spx - 1, ty + 5, 3, 2, SKIN_TAN[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Stallmeisterin Orla
function drawOrla(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // kräftige Beine, hohe Reitstiefel
  p.rect(cx - 4, 30, 4, 5, OCHRE[1]); p.rect(cx + 1, 30, 4, 5, OCHRE[2]); p.px(cx + 1, 30, OCHRE[3]);
  p.rect(cx - 5, fy - 3, 5, 4, '#1a120c'); p.rect(cx + 1, fy - 4, 5, 5, L[1]); p.rect(cx + 1, fy - 4, 5, 1, L[3]); p.px(cx + 6, fy, L[1]);
  // breiter Rumpf, hochgekrempelte Leinenärmel
  torso(p, cx - 5, ty, 11, 11, ['#3a3226', '#5a4e3a', '#7a6c52', '#9a8a6a']);
  // Lederschürze
  p.rect(cx - 2, ty + 3, 8, 12, L[2]); p.rect(cx - 2, ty + 3, 2, 12, L[3]); p.rect(cx + 5, ty + 3, 1, 12, L[1]);
  p.px(cx - 2, ty + 15, L[1]); p.px(cx + 5, ty + 15, L[0]);
  p.rect(cx, ty + 9, 4, 2, L[1]); p.px(cx, ty + 9, L[3]); // Tasche
  p.px(cx + 1, ty + 8, BRZ[3]); p.px(cx + 2, ty + 8, BRZ[2]); // Hufkratzer
  p.px(cx - 1, ty + 4, BRZ[3]); p.px(cx + 4, ty + 4, BRZ[3]); // Nieten
  p.rect(cx - 5, ty + 6, 11, 1, L[0]); p.px(cx - 3, ty + 6, BRZ[3]);
  // Zaumzeug über der Schulter: Riemen, Trensenring, Kopfstück hängt hinten
  p.line(cx + 3, ty - 1, cx - 4, ty + 8, L[3]); p.line(cx + 4, ty - 1, cx - 3, ty + 8, L[1]);
  const zx = cx - 6, zy = ty + 5 + (b ? 0 : 1);
  p.line(cx - 4, ty + 1, zx, zy, L[2]); p.line(zx, zy, zx + 1, zy + 6, L[3]); p.line(zx - 1, zy + 1, zx - 1, zy + 5, L[1]);
  p.ellipse(zx, zy + 7, 1.5, 1.5, BRZ[3]); p.px(zx, zy + 7, L[0]); p.px(zx - 1, zy + 6, BRZ[4]);
  p.px(cx - 4, ty + 8, BRZ[3]); p.px(cx - 5, ty + 9, BRZ[4]); p.px(cx - 3, ty + 9, BRZ[2]);
  // Kopf: breites Gesicht, dunkles Haar zum Knoten, Stirnband
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_TAN, talk });
  p.px(hx + 1, hy + 7, SKIN_TAN[2]); p.px(hx + 6, hy + 7, SKIN_TAN[1]);
  p.rect(hx + 1, hy, 6, 2, BLACKH[1]); p.rect(hx + 1, hy + 2, 2, 4, BLACKH[1]); p.px(hx + 3, hy, BLACKH[2]);
  p.rect(hx + 1, hy + 1, 6, 1, RUST[2]); p.px(hx, hy + 1, RUST[3]); // Stirnband
  p.rect(hx - 2, hy - 1, 3, 3, BLACKH[1]); p.px(hx - 2, hy - 1, BLACKH[2]); p.px(hx - 3, hy + 2 + Math.round(sw * 0.5), RUST[2]); // Knoten + Bandende
  // hinterer Arm (nackter Unterarm, Faust in die Hüfte)
  p.rect(cx - 6, ty + 1, 2, 3, '#7a6c52');
  p.line(cx - 6, ty + 4, cx - 5, ty + 7, SKIN_TAN[1]); p.line(cx - 5, ty + 4, cx - 4, ty + 7, SKIN_TAN[2]);
  // vorderer Arm mit Peitsche
  const hxp = cx + 7, hyp = ty + 6 - (gest ? 4 + gest : 0);
  p.rect(cx + 4, ty, 3, 3, '#9a8a6a'); p.px(cx + 6, ty + 2, '#7a6c52');
  arm(p, cx + 5, ty + 3, hxp - 1, hyp - 1, SKIN_TAN[2], SKIN_TAN[1], null);
  p.rect(hxp - 1, hyp - 1, 3, 2, SKIN_TAN[2]); p.px(hxp, hyp - 1, SKIN_TAN[3]);
  // Peitschengriff + Schnur
  if (gest) { p.line(hxp, hyp - 1, hxp + 2, hyp - 4, L[1]); p.px(hxp + 2, hyp - 5, BRZ[3]); }
  else { p.line(hxp + 1, hyp, hxp + 3, hyp + 2, L[1]); p.px(hxp, hyp - 2, BRZ[3]); }
  if (gest) {
    // Schnur schwingt im Bogen nach oben/hinten
    let px0 = hxp + 2, py0 = hyp - 5;
    for (let s = 1; s <= 12; s++) {
      const k = s / 12, x = Math.round(hxp + 2 + Math.sin(k * 2.6 + gest) * (4 + k * 5) - k * 6), y = Math.round(hyp - 5 - k * 6 + Math.cos(k * 3) * 2);
      p.line(px0, py0, x, y, s < 6 ? L[2] : L[3]); px0 = x; py0 = y;
    }
  } else {
    // aufgerollte Schnur hängt vom Griff, Ende pendelt
    const rx = hxp + 3, ry = hyp + 2;
    p.ellipse(rx, ry + 2, 2.5, 3, L[3]); p.ellipse(rx, ry + 2, 1.5, 2, 'rgba(0,0,0,0)');
    p.px(rx, ry + 2, L[1]); p.px(rx - 1, ry + 1, L[1]); p.px(rx + 1, ry + 3, L[1]); p.px(rx, ry, L[1]); p.px(rx - 2, ry + 3, L[2]); p.px(rx + 2, ry + 1, L[2]);
    const ex = rx + 1 + Math.round(sw * 1.2);
    p.line(rx + 1, ry + 5, ex, ry + 9, L[2]); p.px(ex, ry + 10, L[1]);
  }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: hxp - AX, dy: hyp - 1 - AY } };
}

// ------------------------------------------------------------ Nomade Kesh
function drawKesh(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // langer Umhang (Indigo) hinten
  for (let y = ty; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(2 + k * 3 + sw * k);
    for (let x = cx - 4 - back; x <= cx - 1; x++) p.px(x, y, INDIGO[x < cx - 3 - back ? 3 : 2]);
  }
  // Robe (staubiges Ocker), Saum mit Borte
  skirt(p, cx, ty + 4, fy, 3.5, 5.5, OCHRE, sw * 0.6, 3);
  for (let x = cx - 5; x <= cx + 6; x++) if (x % 2 === 0) p.px(x + Math.round(sw * 0.6), fy - 1, RUST[2]);
  p.px(cx + 4, fy, L[1]); p.px(cx + 5, fy, L[0]); // Sandalen
  // Oberkörper gebeugt
  torso(p, cx - 4, ty, 8, 6, OCHRE);
  p.line(cx - 3, ty, cx + 2, ty + 5, INDIGO[3]); p.line(cx - 2, ty, cx + 3, ty + 5, INDIGO[2]); // Schärpe
  p.rect(cx - 4, ty + 5, 9, 1, RUST[1]); p.px(cx - 2, ty + 5, BRZ[3]);
  // Amulette/Beutel
  p.px(cx - 3, ty + 6, L[3]); p.rect(cx - 4, ty + 7, 2, 2, L[2]);
  // Kopf mit Turban und langem Bart
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk, brow: WHITEH[2] });
  p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.px(hx + 6, hy + 3, SKIN_OLD[1]);
  p.rect(hx + 3, hy + 6, 5, 3, WHITEH[2]); p.rect(hx + 4, hy + 9, 3, 2, WHITEH[1]); p.px(hx + 5, hy + 11, WHITEH[1]);
  p.px(hx + 6, hy + 6, WHITEH[3]); p.px(hx + 4, hy + 8, WHITEH[3]); p.px(hx + 5, hy + 10, WHITEH[2]);
  p.px(hx + 6, hy + 7, talk ? MOUTH : WHITEH[1]);
  p.rect(hx + 1, hy + 2, 2, 3, WHITEH[1]);
  // Turban: gewickelt, Tuchende hinten
  p.rect(hx, hy - 2, 8, 4, INDIGO[2]); p.rect(hx + 1, hy - 3, 6, 1, INDIGO[3]); p.rect(hx, hy - 2, 2, 4, INDIGO[3]);
  p.line(hx, hy, hx + 7, hy - 2, OCHRE[4]); p.line(hx, hy + 1, hx + 7, hy - 1, OCHRE[3]);
  p.px(hx + 7, hy + 1, INDIGO[1]); p.px(hx + 4, hy - 3, BRZ[4]);
  p.rect(hx - 1, hy + 1, 2, 3, INDIGO[2]); p.px(hx - 2 - Math.round(sw * 0.6), hy + 4, INDIGO[3]); p.px(hx - 2 - Math.round(sw), hy + 5, INDIGO[2]); p.px(hx - 3 - Math.round(sw), hy + 6, INDIGO[1]);
  // Stab mit Krücke und Glöckchen
  const stx = cx + 8 + (gest ? 1 : 0), top = 8 - b - (gest ? 2 : 0);
  p.line(stx, top + 2, stx, fy, WOOD[3]); p.line(stx + 1, top + 2, stx + 1, fy, WOOD[1]);
  p.px(stx, top + 1, WOOD[3]); p.px(stx - 1, top, WOOD[3]); p.px(stx - 2, top, WOOD[2]); p.px(stx - 3, top + 1, WOOD[2]); p.px(stx - 3, top + 2, WOOD[1]);
  p.px(stx + 1, top + 1, WOOD[2]);
  // Glöckchen schwingen (Pendel)
  const ring = talk || gest ? 1.6 : 0.8;
  const bells = [[stx - 3, top + 3, 3, 0], [stx - 1, top + 2, 5, 1.3], [stx + 2, top + 3, 4, 2.6]];
  for (const [bx0, by0, len, ph] of bells) {
    const a = Math.sin(t * TAU * 2 + ph) * 0.35 * ring;
    const bx = Math.round(bx0 + Math.sin(a) * len), by = Math.round(by0 + Math.cos(a) * len);
    p.line(bx0, by0, bx, by - 1, '#8a7a60');
    p.rect(bx - 1, by, 3, 2, BRZ[2]); p.px(bx - 1, by, BRZ[4]); p.px(bx, by - 1, BRZ[3]); p.px(bx, by + 2, BRZ[1]);
    if (ring > 1) g.px(bx - 1, by, '#fff0b0');
  }
  // Bänder am Stab
  p.px(stx + 2, top + 6, RUST[3]); p.px(stx + 3, top + 7 + Math.round(sw * 0.5), RUST[2]);
  arm(p, cx + 1, ty + 1, stx - 2, ty + 4, OCHRE[3], OCHRE[2], null);
  p.rect(stx - 1, ty + 3, 3, 2, SKIN_OLD[2]); p.px(stx - 1, ty + 3, SKIN_OLD[3]);
  // hinterer Arm: hält Robe / Geste mit offener Hand
  if (gest) { arm(p, cx - 2, ty + 1, cx + 3, ty - 1 - gest, OCHRE[2], OCHRE[3], null); p.px(cx + 4, ty - 1 - gest, SKIN_OLD[3]); p.px(cx + 4, ty - 2 - gest, SKIN_OLD[2]); }
  else arm(p, cx - 3, ty + 1, cx - 1, ty + 7, OCHRE[2], OCHRE[1], SKIN_OLD[1]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Händlerin Imra
function drawImra(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 21, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Kraxe: Holzgestell hinter dem Körper
  const kx = cx - 14, ky = ty - 12 + (b ? 0 : 1);
  p.rect(kx, ky, 2, 30, WOOD[3]); p.rect(kx + 10, ky + 2, 2, 28, WOOD[1]); p.px(kx, ky, WOOD[2]);
  for (const yy of [ky + 10, ky + 20, ky + 27]) { p.rect(kx, yy, 12, 1, WOOD[2]); p.px(kx + 1, yy, WOOD[3]); }
  // aufgeschnürte Waren
  p.rect(kx - 1, ky + 1, 13, 5, TEAL[2]); p.rect(kx - 1, ky + 1, 13, 1, TEAL[3]); p.rect(kx - 1, ky + 5, 13, 1, TEAL[1]); // Teppichrolle
  for (let x = kx; x < kx + 12; x += 3) p.px(x, ky + 3, BRZ[3]);
  p.ellipse(kx - 1, ky + 3, 1, 2, TEAL[3]); p.px(kx - 1, ky + 3, RUST[3]);
  p.rect(kx + 1, ky + 6, 5, 4, '#7a4228'); p.rect(kx + 2, ky + 5, 3, 1, '#9a5a34'); p.px(kx + 1, ky + 6, '#9a5a34'); p.rect(kx + 1, ky + 8, 5, 1, '#4e2818'); // Tonkrug
  p.rect(kx + 6, ky + 6, 5, 4, RUST[2]); p.rect(kx + 6, ky + 6, 5, 1, RUST[3]); p.px(kx + 8, ky + 7, BRZ[3]); // Stoffballen
  p.rect(kx + 1, ky + 11, 9, 8, '#6a5a3a'); p.rect(kx + 1, ky + 11, 3, 8, '#86744c'); p.rect(kx + 9, ky + 11, 1, 8, '#4a3e28'); // Sack
  p.rect(kx + 3, ky + 13, 5, 1, '#4a3e28'); p.px(kx + 5, ky + 12, '#a8966a');
  // hängende Waren: Messinglampe, Kupferkessel, Fellbündel
  const lx = kx - 2 + Math.round(sw * 0.8), ly = ky + 13;
  p.line(kx, ky + 10, lx, ly, '#6a5a40'); p.rect(lx - 1, ly + 1, 3, 3, BRASS[2]); p.px(lx - 1, ly + 1, BRASS[4]); p.px(lx + 1, ly + 3, BRASS[1]); p.px(lx, ly + 4, BRASS[1]);
  p.ellipse(kx + 5, ky + 22, 3, 2, '#8a4a2a'); p.rect(kx + 3, ky + 21, 5, 1, '#b8683a'); p.px(kx + 3, ky + 22, '#c8784a'); // Kessel
  p.rect(kx + 1, ky + 24, 3, 3, FUR[3]); p.px(kx + 1, ky + 24, FUR[4]); p.px(kx + 2, ky + 27, FUR[2]);
  // Beine unter Rock
  skirt(p, cx, ty + 7, fy - 1, 3.5, 5, RUST, sw * 0.5, 3);
  p.rect(cx - 3, fy - 1, 3, 2, L[0]); p.rect(cx + 1, fy - 1, 4, 2, L[1]); p.px(cx + 1, fy - 1, L[3]);
  // Mieder/Weste
  torso(p, cx - 3, ty, 7, 8, OCHRE);
  p.rect(cx - 1, ty + 1, 3, 5, TEAL[2]); p.px(cx, ty + 2, BRZ[4]); p.px(cx, ty + 4, BRZ[3]);
  p.rect(cx - 3, ty + 6, 7, 1, TEAL[1]); p.px(cx - 3, ty + 7, TEAL[3]); p.px(cx - 4, ty + 8 + Math.round(sw * 0.5), TEAL[2]);
  // Tragriemen
  p.line(cx - 2, ty - 1, cx - 2, ty + 7, L[3]); p.px(cx - 1, ty, L[2]);
  // Kopf mit Kopftuch und Ohrringen
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_TAN, talk });
  p.rect(hx, hy - 1, 7, 3, TEAL[2]); p.rect(hx + 1, hy - 2, 5, 1, TEAL[3]); p.rect(hx, hy - 1, 2, 3, TEAL[3]);
  p.rect(hx - 1, hy + 1, 3, 6, TEAL[2]); p.px(hx - 1, hy + 1, TEAL[3]); p.px(hx - 2, hy + 6, TEAL[1]); p.px(hx - 2 - Math.round(sw * 0.6), hy + 7, TEAL[2]);
  for (let x = hx + 1; x <= hx + 6; x += 2) p.px(x, hy + 1, BRZ[3]); // Münzborte
  p.px(hx + 3, hy + 6, BRZ[4]); p.px(hx + 3, hy + 7, BRZ[3]); // Ohrring
  p.px(hx + 6, hy + 2, BLACKH[1]); p.px(hx + 5, hy + 2, BLACKH[2]);
  // Arme
  arm(p, cx - 3, ty + 1, cx - 2, ty + 7, OCHRE[2], OCHRE[1], SKIN_TAN[1]);
  if (gest) {
    // hält einen Stoffstreifen/Schal zur Ansicht hoch
    const hx2 = cx + 7, hy2 = ty - 1 - gest;
    arm(p, cx + 3, ty + 1, hx2 - 1, hy2 + 1, OCHRE[3], OCHRE[2], null);
    p.rect(hx2 - 1, hy2, 2, 2, SKIN_TAN[2]);
    for (let s = 0; s < 8; s++) { const x = hx2 + 1 + Math.round(Math.sin(s * 0.9 + gest) * 1), y = hy2 + s; p.px(x, y, s % 3 === 0 ? BRZ[3] : '#b04a8a'); p.px(x + 1, y, '#7a2a60'); }
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 6, OCHRE[3], OCHRE[2], SKIN_TAN[2]);
    // Armreifen
    p.px(cx + 5, ty + 5, BRZ[4]); p.px(cx + 6, ty + 5, BRZ[3]);
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ FAULMARSCH
// ------------------------------------------------------------ Moorwächter Thane
function drawThane(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Umhang hinten (fransig, feucht)
  for (let y = ty - 1; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(3 + k * 3 + sw * k * 1.2);
    for (let x = cx - 3 - back; x <= cx + 1; x++) {
      if (y >= fy - 2 && (x * 5 + y) % 3 === 0) continue;
      p.px(x, y, MOSS[x < cx - 2 - back ? 3 : x > cx - 1 ? 1 : 2]);
    }
  }
  // Watbeinlinge
  legs(p, cx, fy, 28, WADER, [WADER[0], WADER[1], WADER[2]]);
  p.rect(cx - 3, 32, 3, 1, MUD[3]); p.rect(cx + 1, 32, 3, 1, MUD[3]); p.px(cx + 2, 34, MUD[2]);
  // Wams + Gurtzeug
  torso(p, cx - 3, ty, 7, 10, MUD);
  p.rect(cx - 3, ty + 6, 7, 1, L[0]); p.px(cx, ty + 6, BRASS[3]);
  p.line(cx + 3, ty, cx - 3, ty + 6, L[2]);
  p.rect(cx - 3, ty + 7, 7, 3, MOSS[2]); p.rect(cx - 3, ty + 7, 2, 3, MOSS[3]);
  // Pfeife/Horn am Gürtel
  p.px(cx - 4, ty + 7, BN[3]); p.px(cx - 4, ty + 8, BN[2]); p.px(cx - 3, ty + 9, BN[1]);
  // Kapuzenmantel über Schultern
  p.rect(cx - 4, ty - 1, 8, 4, MOSS[3]); p.rect(cx - 4, ty - 1, 8, 1, MOSS[4]); p.px(cx + 3, ty + 2, MOSS[2]);
  // Kopf: Atemschutztuch, tiefe Kapuze
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_PALE, talk: 0 });
  p.rect(hx + 3, hy + 4, 5, 4, '#6a6a4e'); p.rect(hx + 3, hy + 4, 5, 1, '#8a8a66'); p.px(hx + 7, hy + 6, '#4a4a36'); // Tuch über Mund/Nase
  p.px(hx + 7, hy + 4, '#8a8a66');
  if (talk) p.px(hx + 6, hy + 6, '#4a4a36');
  p.px(hx + 5, hy + 3, EYE); p.px(hx + 4, hy + 2, SKIN_PALE[1]);
  p.px(hx + 3, hy + 8, '#6a6a4e'); p.px(hx + 2, hy + 9, '#5a5a42'); // Tuchzipfel
  p.rect(hx, hy - 1, 7, 3, MOSS[3]); p.rect(hx - 1, hy + 1, 4, 7, MOSS[3]); p.rect(hx + 1, hy - 2, 5, 1, MOSS[4]);
  p.px(hx + 7, hy, MOSS[3]); p.px(hx + 7, hy + 1, MOSS[2]); p.px(hx + 7, hy + 2, MOSS[2]); p.px(hx - 1, hy + 1, MOSS[4]);
  p.px(hx + 6, hy + 1, MOSS[1]); p.px(hx + 6, hy + 2, MOSS[1]); // Schatten unter Kapuze
  g.px(hx + 5, hy + 3, '#1a3a10');
  // hinterer Arm (Geste: warnend erhoben)
  if (gest) { arm(p, cx - 1, ty + 1, cx + 3, ty - 2 - gest, MOSS[2], MOSS[3], null); p.rect(cx + 3, ty - 3 - gest, 2, 2, SKIN_PALE[2]); }
  else arm(p, cx - 3, ty + 1, cx - 3, ty + 8, MOSS[1], MOSS[2], SKIN_PALE[1]);
  // Laterne mit grünem Licht in der vorderen Hand (Licht bei dx 6, dy -14)
  const lx = AX + 5, ly = AY - 17 + Math.round(sw * 0.4) - (gest ? 1 : 0);
  arm(p, cx + 3, ty + 1, lx, ly - 3, MOSS[3], MOSS[2], null);
  p.rect(lx - 1, ly - 3, 3, 2, SKIN_PALE[2]);
  p.px(lx, ly - 2, St[2]); p.rect(lx - 1, ly - 1, 4, 1, St[2]); p.rect(lx - 2, ly, 6, 1, St[3]);
  p.rect(lx - 2, ly + 1, 6, 5, '#10200c'); p.rect(lx - 2, ly + 1, 1, 5, St[2]); p.rect(lx + 3, ly + 1, 1, 5, St[1]); p.px(lx + 1, ly + 1, St[1]); p.px(lx + 1, ly + 4, St[1]);
  p.rect(lx - 2, ly + 6, 6, 1, St[1]);
  const fl = Math.sin(t * TAU * 3) > 0 ? 1 : 0;
  p.rect(lx - 1, ly + 2, 4, 3, TOX[2]); p.px(lx, ly + 2 + fl, TOX[4]); p.px(lx + 1, ly + 3, TOX[3]);
  g.rect(lx - 2, ly + 1, 6, 5, '#1e5a14'); g.rect(lx - 1, ly + 2, 4, 3, TOX[2]); g.px(lx, ly + 2 + fl, TOX[4]); g.px(lx + 1, ly + 3, TOX[3]);
  // Glühfünkchen über der Laterne
  const sp = (t * 3) % 1;
  g.px(lx + Math.round(Math.sin(t * TAU) * 1), ly - 2 - Math.round(sp * 4), TOX[3]);
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: lx - AX, dy: ly + 3 - AY } };
}

// ------------------------------------------------------------ Alchemistin Brisa
function drawBrisa(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 19, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Glastank auf dem Rücken (Licht bei dx -6, dy -12)
  const tx = cx - 10, tyy = ty - 3 + (b ? 0 : 1);
  p.rect(tx, tyy, 7, 13, BRASS[1]); p.rect(tx + 1, tyy + 1, 5, 11, GLASS[0]);
  p.rect(tx, tyy, 7, 1, BRASS[3]); p.rect(tx, tyy + 12, 7, 1, BRASS[2]); p.px(tx, tyy, BRASS[4]);
  const lvl = 3 + Math.round(sw * 0.5);
  p.rect(tx + 1, tyy + lvl, 5, 12 - lvl, TOX[1]); p.rect(tx + 1, tyy + lvl, 5, 1, TOX[3]); p.rect(tx + 1, tyy + lvl + 1, 1, 10 - lvl, TOX[2]);
  g.rect(tx + 1, tyy + lvl, 5, 12 - lvl, '#10300a'); g.rect(tx + 1, tyy + lvl, 5, 1, TOX[3]); g.rect(tx + 2, tyy + lvl + 2, 1, 6, '#2a6a1a');
  // Blasen steigen
  for (let i = 0; i < 3; i++) {
    const k = (t * 2 + i / 3) % 1, by = Math.round(tyy + 11 - k * (11 - lvl)), bx = tx + 2 + ((i * 2) % 4);
    if (by > tyy + lvl) { p.px(bx, by, TOX[4]); g.px(bx, by, TOX[4]); }
  }
  p.px(tx + 5, tyy + 2, '#c8e8e0'); p.px(tx + 5, tyy + 3, '#8ab0a8'); // Glanz
  p.rect(tx + 2, tyy - 2, 3, 2, BRASS[2]); p.px(tx + 2, tyy - 2, BRASS[4]); // Deckel
  // Schlauch vom Tank zur Schulter
  p.line(tx + 4, tyy - 2, tx + 6, tyy - 4, '#3a3226'); p.line(tx + 6, tyy - 4, cx - 1, ty - 1, '#3a3226'); p.line(tx + 5, tyy - 2, tx + 7, tyy - 4, '#54483a');
  // Beine + Schnallenstiefel
  legs(p, cx, fy, 29, ['#1e1a22', '#2a2530', '#3a3440'], ['#140e0c', '#241814', '#3a2a20']);
  p.px(cx + 2, fy - 2, BRASS[3]);
  // Mantel/Schürze (gefleckt)
  torso(p, cx - 3, ty, 7, 10, OLIVE);
  p.rect(cx - 1, ty + 2, 5, 11, '#6a6450'); p.rect(cx - 1, ty + 2, 1, 11, '#827a62'); p.rect(cx + 3, ty + 2, 1, 11, '#4a4638');
  p.px(cx + 1, ty + 7, TOX[1]); p.px(cx + 2, ty + 10, '#5a3a6a'); p.px(cx, ty + 12, TOX[0]); // Flecken
  // Phiolengürtel
  p.rect(cx - 3, ty + 6, 7, 1, L[0]);
  const vials = [[cx - 3, TOX[2], TOX[4]], [cx - 1, '#a050d0', '#e0a0ff'], [cx + 1, '#d06a20', '#ffc070'], [cx + 3, TOX[2], TOX[4]]];
  for (const [vx, c0, c1] of vials) {
    p.px(vx, ty + 5, BN[2]); p.px(vx, ty + 7, c0); p.px(vx, ty + 8, c0); p.px(vx, ty + 6, '#c8d8d0');
    g.px(vx, ty + 7, c1); g.px(vx, ty + 8, c0);
  }
  p.rect(cx - 4, ty - 1, 9, 2, OLIVE[3]); p.px(cx - 4, ty - 1, '#6e6e3a'); // Kragen
  // Kopf: rote Locken, Schutzbrille mit grünen Gläsern
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk, noEye: true });
  p.rect(hx + 1, hy - 1, 6, 2, '#86381c'); p.rect(hx, hy, 3, 6, '#86381c'); p.px(hx + 2, hy - 1, '#a8522a'); p.px(hx, hy + 1, '#a8522a');
  p.px(hx - 1, hy + 2, '#5e2414'); p.px(hx - 1, hy + 4, '#86381c'); p.px(hx, hy + 6, '#5e2414'); p.px(hx - 1, hy + 6 + Math.round(sw * 0.4), '#86381c');
  p.rect(hx + 2, hy + 3, 6, 1, L[0]); // Brillenband
  p.rect(hx + 4, hy + 2, 3, 3, BRASS[2]); p.px(hx + 4, hy + 2, BRASS[4]);
  p.px(hx + 5, hy + 3, TOX[3]); p.px(hx + 6, hy + 3, TOX[2]);
  g.px(hx + 5, hy + 3, TOX[4]); g.px(hx + 6, hy + 3, TOX[2]);
  // Arme: hinten zum Tankgurt, vorn schwenkt eine Phiole
  arm(p, cx - 3, ty + 1, cx - 3, ty + 7, OLIVE[1], OLIVE[2], SKIN[1]);
  const fx = cx + 6, fyv = ty + 3 - (gest ? 3 + gest : 0) + (gest ? 0 : Math.round(sw * 0.5));
  arm(p, cx + 3, ty + 1, fx - 1, fyv + 2, OLIVE[3], OLIVE[2], null);
  p.rect(fx - 1, fyv + 2, 2, 2, SKIN[2]);
  const tilt = gest ? (gest === 1 ? -1 : 1) : 0;
  p.px(fx + 1 + tilt, fyv - 3, BN[3]); p.px(fx + 1 + tilt, fyv - 2, '#b8d0c8');
  p.ellipse(fx + 1, fyv + 1, 2, 2, GLASS[2]); p.ellipse(fx + 1, fyv + 1, 1.5, 1.5, TOX[2]); p.px(fx, fyv, '#e8fff0');
  g.ellipse(fx + 1, fyv + 1, 2, 2, TOX[1]); g.px(fx + 1, fyv + 1, TOX[4]);
  if (gest) { g.px(fx + 2, fyv - 4 - gest, TOX[3]); g.px(fx + 1, fyv - 6 - gest, TOX[2]); p.px(fx + 2, fyv - 4 - gest, TOX[3]); }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: fx + 1 - AX, dy: fyv + 1 - AY } };
}

// ------------------------------------------------------------ Händler Moll
function drawMoll(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 20 - b, hy = 12 - b;
  // Reusen-/Netzbündel auf dem Rücken
  const nx = cx - 12, ny = ty - 3 + (b ? 0 : 1);
  p.ellipse(nx + 4, ny + 6, 4, 7, MUD[2]); p.ellipse(nx + 4, ny + 6, 3, 6, MUD[1]);
  for (let y = ny; y <= ny + 12; y += 2) p.line(nx + 1, y, nx + 7, y + 1, MUD[3]);
  for (let x = nx + 1; x <= nx + 7; x += 2) p.line(x, ny, x, ny + 12, MUD[3]);
  p.rect(nx + 2, ny - 1, 5, 1, L[2]);
  // Aal an der Schnur
  const ex = nx + 1 + Math.round(sw * 0.6);
  p.line(nx + 2, ny + 9, ex, ny + 12, '#6a5a40');
  for (let s = 0; s < 6; s++) { const x = ex + Math.round(Math.sin(s * 1.1 + t * TAU) * 1), y = ny + 13 + s; p.px(x, y, '#3a4a3a'); p.px(x + 1, y, '#5a6a50'); }
  // Watstiefel bis über die Knie
  p.rect(cx - 4, 27, 4, 8, WADER[1]); p.rect(cx - 4, 27, 4, 1, WADER[3]);
  p.rect(cx + 1, 27, 4, 8, WADER[2]); p.rect(cx + 1, 27, 4, 1, WADER[3]); p.rect(cx + 1, 27, 1, 8, WADER[3]);
  p.rect(cx - 5, fy - 2, 5, 3, WADER[0]); p.rect(cx + 1, fy - 2, 6, 3, WADER[1]); p.rect(cx + 5, fy - 1, 2, 1, WADER[2]);
  p.px(cx + 2, 31, MUD[3]); p.px(cx + 3, 33, MUD[2]); p.px(cx - 2, 32, MUD[3]); p.rect(cx - 5, fy, 5, 1, MUD[1]);
  // dicker Bauch in Hemd, Hosenträger
  for (let y = ty; y <= ty + 9; y++) {
    const k = (y - ty) / 9, bulge = Math.round(Math.sin(k * Math.PI) * 3);
    for (let x = cx - 5; x <= cx + 4 + bulge; x++) {
      const i = x < cx - 3 ? 3 : x > cx + 2 + bulge ? 0 : x > cx + bulge ? 1 : 2;
      p.px(x, y, ['#3a3020', '#5a4c34', '#76664a', '#928262'][i]);
    }
  }
  p.line(cx - 2, ty, cx - 1, ty + 9, L[1]); p.line(cx + 3, ty, cx + 5, ty + 9, L[1]);
  p.px(cx + 5, ty + 4, BRASS[3]);
  p.rect(cx - 5, ty + 9, 11, 1, L[0]); p.px(cx + 1, ty + 9, BRASS[3]);
  // Hose zwischen Bauch und Stiefeln
  p.rect(cx - 4, ty + 10, 9, 1, MUD[2]);
  // Kopf: rund, Doppelkinn, Südwester
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN, talk });
  p.rect(hx + 1, hy + 7, 6, 1, SKIN[2]); p.rect(hx + 2, hy + 8, 5, 1, SKIN[1]); p.px(hx + 7, hy + 6, SKIN[2]);
  p.px(hx + 6, hy + 4, '#c07060'); // rote Nase/Wange
  p.rect(hx + 4, hy + 6, 3, 1, '#4a3a2a'); if (talk) p.px(hx + 6, hy + 6, MOUTH); // Schnauzer
  p.rect(hx - 1, hy + 1, 11, 1, '#4a5a2a'); p.rect(hx - 1, hy + 1, 3, 1, '#6a7a3a'); p.rect(hx - 2, hy + 2, 3, 2, '#4a5a2a'); // Krempe (hinten tiefer)
  p.rect(hx + 1, hy - 2, 6, 3, '#4a5a2a'); p.rect(hx + 1, hy - 2, 2, 3, '#6a7a3a'); p.px(hx + 6, hy, '#34401e');
  // Pfeife mit Glut
  const pfx = hx + 8, pfy = hy + 6;
  p.px(pfx, pfy, L[3]); p.px(pfx + 1, pfy, L[3]); p.rect(pfx + 2, pfy - 2, 2, 3, L[2]); p.px(pfx + 2, pfy - 2, L[3]);
  const em = Math.sin(t * TAU) > 0 ? E[4] : E[3];
  p.px(pfx + 2, pfy - 3, em); g.px(pfx + 2, pfy - 3, em); g.px(pfx + 3, pfy - 3, E[2]);
  const sk = (t * 2) % 1;
  p.px(pfx + 3 + Math.round(sk * 2), pfy - 5 - Math.round(sk * 4), 'rgba(170,170,160,0.55)');
  // Arme
  arm(p, cx - 4, ty + 1, cx - 5, ty + 7, '#76664a', '#5a4c34', SKIN[1]);
  if (gest) {
    arm(p, cx + 3, ty + 1, cx + 8, ty - gest, '#76664a', '#5a4c34', null);
    p.rect(cx + 8, ty - 1 - gest, 2, 2, SKIN[2]); p.px(cx + 10, ty - 1 - gest, SKIN[3]);
  } else arm(p, cx + 3, ty + 1, cx + 7, ty + 5, '#76664a', '#5a4c34', SKIN[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ FROSTZINNEN
// ------------------------------------------------------------ Jarl Eskil
function drawEskil(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 9 - b;
  // Pelzumhang (breit, bis fast zum Boden)
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
  // Beine: Wollhose, Fellstiefel mit Riemen
  legs(p, cx, fy, 29, FROSTB, [GREYF[1], GREYF[2], GREYF[3]]);
  p.rect(cx - 4, fy - 4, 4, 2, GREYF[2]); p.rect(cx + 1, fy - 4, 4, 2, GREYF[3]); p.px(cx + 1, fy - 4, GREYF[4]);
  p.px(cx + 2, 30, L[1]); p.px(cx + 3, 32, L[1]);
  // Rumpf: Kettenhemd + Tunika
  torso(p, cx - 4, ty, 9, 11, St, 2);
  for (let y = ty + 1; y < ty + 11; y += 2) for (let x = cx - 3 + (y & 1); x < cx + 4; x += 2) p.px(x, y, St[1]);
  p.rect(cx - 2, ty + 3, 5, 9, FROSTB[2]); p.rect(cx - 2, ty + 3, 1, 9, FROSTB[3]); p.rect(cx + 2, ty + 3, 1, 9, FROSTB[1]);
  p.rect(cx - 4, ty + 8, 9, 2, L[1]); p.rect(cx - 1, ty + 8, 3, 2, G[2]); p.px(cx - 1, ty + 8, G[4]); p.px(cx, ty + 9, G[1]); // Gürtelschnalle
  // Pelzkragen über Schultern (weißer Rand)
  p.rect(cx - 6, ty - 2, 12, 4, GREYF[3]); p.rect(cx - 6, ty - 2, 12, 1, WFUR[2]); p.px(cx - 6, ty + 1, GREYF[2]); p.px(cx + 5, ty + 1, GREYF[2]);
  for (let x = cx - 5; x <= cx + 5; x += 2) p.px(x, ty + 2, GREYF[3]);
  p.px(cx + 2, ty, G[3]); p.px(cx + 3, ty, G[4]); // Fibel
  // Kopf mit Flügelhelm und langem geflochtenem Bart
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_COLD, talk: 0, brow: REDB[1] });
  p.rect(hx + 1, hy + 3, 2, 4, REDB[2]);
  p.rect(hx + 3, hy + 5, 5, 4, REDB[2]); p.rect(hx + 4, hy + 9, 4, 3, REDB[2]); p.rect(hx + 5, hy + 12, 2, 2, REDB[1]);
  p.rect(hx + 5, hy + 5, 3, 1, REDB[3]); p.px(hx + 4, hy + 7, REDB[3]); p.px(hx + 6, hy + 10, REDB[3]); p.px(hx + 5, hy + 9, REDB[1]);
  p.px(hx + 5, hy + 12, G[3]); p.px(hx + 6, hy + 12, G[2]); // Bartring
  p.px(hx + 7, hy + 6, talk ? MOUTH : REDB[1]);
  p.rect(hx, hy - 1, 8, 4, St[3]); p.rect(hx + 1, hy - 2, 6, 1, St[4]); p.rect(hx, hy - 1, 2, 4, St[4]); p.px(hx + 2, hy - 2, St[5]);
  p.rect(hx, hy + 2, 8, 1, St[2]); p.px(hx + 6, hy + 3, St[3]); p.px(hx + 6, hy + 4, St[3]); // Nasal
  for (let x = hx + 1; x < hx + 8; x += 2) p.px(x, hy + 2, G[2]);
  // Flügel am Helm (weiße Federn, flattern leicht)
  const wf = Math.round(sw * 0.6);
  // Flügelfächer: drei Schwungfedern strahlen vom Helm nach hinten oben
  const feathers = [[-2.55, 6, WFUR[4], WFUR[3]], [-2.95, 6, WFUR[3], WFUR[2]], [2.95, 4, WFUR[2], WFUR[1]]];
  for (const [a0, len, c0, c1] of feathers) {
    const a = a0 + (a0 < 0 ? -1 : 1) * 0.08 * sw;
    for (let s = 1; s <= len; s++) {
      const x = Math.round(hx + 1 + Math.cos(a) * s), y = Math.round(hy + Math.sin(a) * s);
      p.px(x, y, c0); if (s < len) p.px(x, y + 1, c1);
    }
  }
  p.px(hx, hy - 1, St[4]); p.px(hx - 1, hy, WFUR[2]);
  p.px(hx + 7, hy - 3, WFUR[2]); p.px(hx + 8, hy - 4, WFUR[3]); p.px(hx + 8, hy - 3, WFUR[1]); p.px(hx + 9, hy - 5 - wf, WFUR[3]); // vorderer Flügel (verdeckt)
  // hinterer Arm
  if (gest) { arm(p, cx - 2, ty + 1, cx + 5, ty - 1 - gest, GREYF[2], GREYF[3], null); p.rect(cx + 5, ty - 2 - gest, 3, 3, SKIN_COLD[2]); p.px(cx + 7, ty - 2 - gest, SKIN_COLD[3]); }
  else arm(p, cx - 5, ty + 2, cx - 5, ty + 9, GREYF[2], GREYF[3], SKIN_COLD[1]);
  // Bartaxt: Hand am Stiel, Kopf nach unten auf dem Boden (Ruhehaltung)
  const ax = cx + 7;
  p.line(ax, ty + 2, ax, fy - 4, WOOD[3]); p.line(ax + 1, ty + 2, ax + 1, fy - 4, WOOD[1]);
  p.rect(ax, ty + 1, 2, 1, St[3]);
  p.rect(ax - 1, fy - 4, 4, 2, St[2]); p.px(ax - 1, fy - 4, St[4]);
  // Axtblatt (Bart nach vorn)
  p.rect(ax + 2, fy - 7, 2, 6, St[3]); p.rect(ax + 4, fy - 6, 1, 6, St[4]); p.px(ax + 5, fy - 5, St[4]); p.px(ax + 5, fy - 1, St[5]); p.px(ax + 4, fy, St[5]);
  p.px(ax + 2, fy - 7, St[4]); p.rect(ax + 2, fy - 2, 2, 1, St[2]);
  arm(p, cx + 4, ty + 1, ax - 1, ty + 3, GREYF[3], GREYF[2], null);
  p.rect(ax - 1, ty + 3, 3, 2, SKIN_COLD[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Jägerin Sigrun
function drawSigrun(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Köcher auf dem Rücken
  p.line(cx - 7, ty - 3, cx - 3, ty + 9, L[2]); p.line(cx - 6, ty - 3, cx - 2, ty + 9, L[1]); p.line(cx - 8, ty - 2, cx - 4, ty + 9, L[3]);
  for (let i = 0; i < 3; i++) { p.px(cx - 8 + i, ty - 4 - (i & 1), WFUR[3]); p.px(cx - 8 + i, ty - 5 - (i & 1), '#8a3a2a'); }
  // Pelzmantel weiß (bis Knie)
  skirt(p, cx, ty + 6, 32, 3.5, 5, WFUR, sw * 0.6, 3);
  legs(p, cx, fy, 31, ['#3a3a44', '#4a4a56', '#5e5e6a'], [WFUR[0], WFUR[1], WFUR[2]]);
  p.rect(cx - 3, fy - 3, 3, 1, WFUR[2]); p.rect(cx + 1, fy - 3, 3, 1, WFUR[3]);
  torso(p, cx - 3, ty, 7, 8, WFUR, 2);
  p.line(cx + 3, ty, cx - 3, ty + 6, L[1]); // Köcherriemen
  p.rect(cx - 3, ty + 6, 7, 1, L[1]); p.px(cx + 1, ty + 6, St[4]);
  for (let x = cx - 5; x <= cx + 6; x += 2) p.px(x + Math.round(sw * 0.6), 32, WFUR[1]); // Fellsaum
  // Pelzkapuze + Gesicht mit Bemalung
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_COLD, talk });
  p.rect(hx + 4, hy + 4, 3, 1, '#3a6aa0'); p.px(hx + 5, hy + 4, EYE); // blaue Kriegsbemalung über dem Auge
  p.rect(hx + 1, hy + 1, 3, 3, BLOND[2]); p.px(hx + 4, hy + 1, BLOND[3]); p.px(hx + 5, hy + 1, BLOND[2]);
  p.rect(hx, hy - 1, 7, 3, WFUR[3]); p.rect(hx - 1, hy + 1, 3, 7, WFUR[3]); p.rect(hx + 1, hy - 2, 5, 1, WFUR[4]);
  p.px(hx + 7, hy, WFUR[2]); p.px(hx + 7, hy + 1, WFUR[1]); p.px(hx - 1, hy + 1, WFUR[4]); p.px(hx - 1, hy + 7, WFUR[2]);
  // Zopf vorn über der Schulter
  p.px(hx + 2, hy + 8, BLOND[2]); p.px(hx + 3, hy + 9, BLOND[3]); p.px(hx + 3, hy + 10, BLOND[2]); p.px(hx + 4, hy + 11, BLOND[1]); p.px(hx + 4, hy + 12, '#3a6aa0');
  // hinterer Arm: Geste = zeigt nach vorn
  if (gest) { arm(p, cx - 1, ty + 1, cx + 5, ty - gest, WFUR[1], WFUR[2], null); p.rect(cx + 5, ty - 1 - gest, 2, 2, SKIN_COLD[2]); p.px(cx + 7, ty - 1 - gest, SKIN_COLD[3]); }
  else arm(p, cx - 3, ty + 1, cx - 3, ty + 7, WFUR[1], WFUR[2], SKIN_COLD[1]);
  // Langbogen vertikal in der vorderen Hand
  const bx = cx + 7, by = ty + 4;
  for (let i = -15; i <= 14; i++) {
    const k = i / 15, x = Math.round(bx + (1 - k * k) * 2.5 - (Math.abs(k) > 0.85 ? -1 : 0)), y = by + i;
    p.px(x, y, WOOD[3]); p.px(x + 1, y, WOOD[1]);
  }
  p.px(bx - 1, by - 15, BN[3]); p.px(bx - 1, by + 14, BN[3]);
  p.line(bx, by - 14, bx, by + 13, '#d8d0c0');
  p.rect(bx + 2, by - 1, 2, 3, L[3]);
  arm(p, cx + 3, ty + 1, bx + 1, by, WFUR[3], WFUR[2], null);
  p.rect(bx + 1, by - 1, 3, 2, SKIN_COLD[2]);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Pelzhändler Fenn
function drawFenn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 20, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Pelzstapel auf dem Rücken (verschnürt), hängende Felle
  const px0 = cx - 13, py0 = ty - 5 + (b ? 0 : 1);
  for (let i = 0; i < 4; i++) {
    const P = PELTS[i % 3], y = py0 + i * 4, x = px0 - (i & 1);
    p.rect(x, y, 11, 4, P[1]); p.rect(x, y, 11, 1, P[2]); p.rect(x, y + 3, 11, 1, P[0]); p.px(x - 1, y + 1, P[1]); p.px(x - 1, y + 2, P[2]);
    for (let xx = x + 1; xx < x + 11; xx += 3) p.px(xx, y + 2, P[0]);
  }
  p.rect(px0 + 3, py0, 1, 16, L[1]); p.rect(px0 + 8, py0, 1, 16, L[1]);
  // Wolfsfell mit Schwanz hängt seitlich
  // Fuchsschwänze baumeln unter dem Stapel
  for (const [ox, ph] of [[1, 0], [6, 1.7]]) {
    const tx = Math.round(Math.sin(t * TAU + ph) * 0.8);
    for (let s = 0; s < 5; s++) { const x = px0 + ox + (s > 2 ? tx : 0); p.px(x, py0 + 16 + s, PELTS[2][s < 3 ? 1 : 2]); p.px(x + 1, py0 + 16 + s, PELTS[2][0]); }
    p.px(px0 + ox + tx, py0 + 21, WFUR[3]);
  }
  // Beine
  legs(p, cx, fy, 29, ['#2a241e', '#3a322a', '#4e443a'], [FUR[1], FUR[2], FUR[3]]);
  p.rect(cx + 1, fy - 3, 3, 1, FUR[4]);
  // dicker Mantel mit Fellbesatz
  for (let y = ty; y <= ty + 12; y++) for (let x = cx - 3; x <= cx + 4; x++) {
    const i = x < cx - 1 ? 3 : x > cx + 2 ? 1 : 2;
    p.px(x, y, ['#1e1a2a', '#2e2640', '#443a5a', '#5a4e74'][i]);
  }
  p.line(cx + 2, ty + 1, cx + 2, ty + 12, FUR[3]); p.line(cx + 3, ty + 1, cx + 3, ty + 12, FUR[2]); // Fellbesatz vorn
  p.rect(cx - 3, ty + 12, 8, 1, FUR[3]);
  p.rect(cx - 3, ty + 7, 5, 1, L[1]); p.px(cx - 2, ty + 7, St[4]);
  p.rect(cx - 4, ty - 1, 9, 3, FUR[3]); p.rect(cx - 4, ty - 1, 9, 1, FUR[4]);
  // Kopf: Pelzmütze mit Ohrenklappen, Wangen gerötet, Stoppelbart
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_COLD, talk });
  p.px(hx + 6, hy + 5, '#d07a70'); p.rect(hx + 4, hy + 7, 3, 1, '#6a5a4a'); p.px(hx + 6, hy + 6, talk ? MOUTH : '#6a5a4a');
  p.rect(hx, hy - 3, 8, 4, FUR[3]); p.rect(hx + 1, hy - 4, 6, 1, FUR[4]); p.rect(hx, hy - 3, 2, 4, FUR[4]);
  p.rect(hx, hy, 8, 1, FUR[2]); for (let x = hx + 1; x < hx + 8; x += 2) p.px(x, hy - 2, FUR[2]);
  p.rect(hx + 1, hy + 1, 2, 5, FUR[3]); p.px(hx + 1, hy + 6, FUR[2]); p.px(hx + 2, hy + 6 + Math.round(sw * 0.4), FUR[2]); // Ohrenklappe
  // Arme
  arm(p, cx - 2, ty + 1, cx - 2, ty + 7, '#2e2640', '#443a5a', SKIN_COLD[1]);
  if (gest) {
    // hält ein Fuchsfell hoch
    const hx2 = cx + 7, hy2 = ty - 1 - gest;
    arm(p, cx + 3, ty + 1, hx2 - 1, hy2 + 1, '#443a5a', '#2e2640', null);
    p.rect(hx2 - 1, hy2, 2, 2, SKIN_COLD[2]);
    const F = PELTS[2];
    p.rect(hx2 + 1, hy2 - 1, 4, 8, F[1]); p.rect(hx2 + 1, hy2 - 1, 1, 8, F[2]); p.px(hx2 + 4, hy2 - 1, F[0]); p.px(hx2 + 1, hy2 - 2, F[2]); p.px(hx2 + 4, hy2 - 2, F[1]);
    p.px(hx2 + 2, hy2 + 7, F[1]); p.px(hx2 + 3, hy2 + 8, F[2]); p.px(hx2 + 3, hy2 + 9, WFUR[3]);
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 5, '#443a5a', '#2e2640', null);
    // dampfender Metkrug
    p.rect(cx + 5, ty + 4, 3, 4, WOOD[2]); p.rect(cx + 5, ty + 4, 3, 1, BRASS[3]); p.rect(cx + 5, ty + 7, 3, 1, BRASS[2]); p.px(cx + 8, ty + 5, WOOD[1]); p.px(cx + 8, ty + 6, WOOD[1]);
    p.px(cx + 4, ty + 5, SKIN_COLD[2]);
    const st = (t * 2) % 1;
    p.px(cx + 6 + Math.round(Math.sin(st * 6) * 0.8), ty + 2 - Math.round(st * 4), 'rgba(220,225,235,0.5)');
    p.px(cx + 7 - Math.round(Math.sin(st * 6) * 0.8), ty + 1 - Math.round(((st + 0.5) % 1) * 4), 'rgba(220,225,235,0.4)');
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ============================================================ GLUTÖDE
// ------------------------------------------------------------ Marschall Corvane
function drawCorvane(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 9 - b;
  // Umhang (dunkelrot, versengter Saum)
  for (let y = ty - 1; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(3 + k * 4 + sw * k);
    for (let x = cx - 5 - back; x <= cx; x++) {
      if (y >= fy - 2 && (x * 3 + y) % 4 === 0) continue;
      p.px(x, y, CR[x < cx - 4 - back ? 2 : x > cx - 2 ? 0 : 1]);
    }
  }
  for (let x = cx - 11; x < cx - 4; x += 2) { p.px(x + Math.round(sw), fy - 1, E[1]); g.px(x + Math.round(sw), fy - 1, E[1]); }
  // schwere Plattenbeine
  p.rect(cx - 4, 28, 4, 7, St[1]); p.rect(cx + 1, 28, 4, 7, St[3]); p.rect(cx + 1, 28, 1, 7, St[4]);
  p.rect(cx + 1, 31, 4, 2, St[4]); p.px(cx + 2, 31, St[5]); // Kniekachel
  p.rect(cx - 5, fy - 2, 5, 3, St[0]); p.rect(cx + 1, fy - 2, 6, 3, St[2]); p.rect(cx + 1, fy - 2, 6, 1, St[4]);
  // Brustharnisch
  torso(p, cx - 5, ty, 11, 10, St, 3);
  p.px(cx - 4, ty + 1, St[5]); p.px(cx - 3, ty + 2, St[5]);
  // Wappenrock rot-gold
  p.rect(cx - 3, ty + 2, 7, 14, CR[2]); p.rect(cx - 3, ty + 2, 1, 14, CR[3]); p.rect(cx + 3, ty + 2, 1, 14, CR[1]);
  p.rect(cx - 3, ty + 2, 7, 1, G[3]); p.rect(cx - 3, ty + 15, 7, 1, G[2]); p.px(cx - 3, ty + 16, G[1]); p.px(cx + 3, ty + 16, G[1]);
  // Wappen: goldene Flamme über Turm
  p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 5, G[3]); p.px(cx + 1, ty + 5, G[3]); p.px(cx, ty + 5, G[4]); p.px(cx, ty + 6, G[3]);
  p.rect(cx - 1, ty + 7, 3, 3, G[2]); p.px(cx - 1, ty + 7, G[3]); p.px(cx + 1, ty + 7, G[3]); p.px(cx, ty + 9, CR[1]);
  p.rect(cx - 5, ty + 10, 11, 2, L[1]); p.rect(cx - 1, ty + 10, 3, 2, G[3]); p.px(cx - 1, ty + 10, G[4]);
  // Tassetten
  p.rect(cx - 5, ty + 12, 2, 3, St[2]); p.rect(cx + 4, ty + 12, 2, 3, St[1]);
  // Große Schulterplatten mit Goldrand
  for (const [sx, R] of [[cx - 5, [St[2], St[3], St[4], St[5]]], [cx + 5, [St[1], St[2], St[3], St[4]]]]) {
    p.ellipse(sx, ty, 3.5, 3, R[1]); p.ellipse(sx - 1, ty - 1, 2, 1.5, R[2]); p.px(sx - 2, ty - 2, R[3]);
    p.rect(sx - 3, ty + 2, 7, 1, G[2]); p.px(sx - 3, ty + 2, G[3]);
    p.rect(sx - 3, ty + 3, 7, 1, R[0]); p.rect(sx - 2, ty + 3, 5, 1, R[1]);
  }
  // Halsberge
  p.rect(cx - 3, ty - 2, 6, 2, St[3]); p.rect(cx - 3, ty - 2, 6, 1, St[4]);
  // Kopf: graues Haar, kurzer Vollbart, Narben
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_OLD, talk: 0, brow: WHITEH[1] });
  p.rect(hx + 1, hy, 6, 2, WHITEH[1]); p.rect(hx + 1, hy + 2, 2, 4, WHITEH[1]); p.px(hx + 3, hy, WHITEH[2]); p.px(hx + 4, hy, WHITEH[2]); p.px(hx + 1, hy + 1, WHITEH[0]);
  p.rect(hx + 3, hy + 5, 5, 3, WHITEH[1]); p.rect(hx + 4, hy + 8, 3, 1, WHITEH[0]); p.px(hx + 6, hy + 5, WHITEH[2]); p.px(hx + 4, hy + 6, WHITEH[2]);
  p.px(hx + 6, hy + 6, talk ? MOUTH : WHITEH[0]); if (talk) p.px(hx + 5, hy + 6, MOUTH);
  p.px(hx + 4, hy + 2, '#8a4a40'); p.px(hx + 5, hy + 1, '#8a4a40'); // Narbe über der Braue
  // hinterer Arm (Geste: Panzerfaust nach vorn)
  if (gest) { arm(p, cx - 2, ty + 2, cx + 6, ty + 1 - gest, St[2], St[3], null); p.rect(cx + 6, ty - gest, 3, 3, St[3]); p.px(cx + 8, ty - gest, St[5]); }
  // Zweihänder vor sich aufgestützt, Hände auf dem Knauf (Hüfthöhe)
  const swx = cx + 7, gy = ty + 10;
  p.rect(swx, gy + 2, 2, fy - gy - 2, St[3]); p.rect(swx, gy + 2, 1, fy - gy - 2, St[4]); p.px(swx + 1, fy, St[2]); p.px(swx, fy, St[4]);
  p.px(swx, gy + 2, St[5]);
  for (let i = 0; i < 3; i++) { const ry = gy + 4 + i * 3, on = Math.sin(t * TAU + i) > -0.3 ? 1 : 0; p.px(swx + 1, ry, on ? E[4] : E[2]); g.px(swx + 1, ry, on ? E[4] : E[1]); }
  p.rect(swx - 3, gy, 8, 2, G[2]); p.rect(swx - 3, gy, 8, 1, G[3]); p.px(swx - 3, gy + 1, G[1]); p.px(swx + 4, gy + 1, G[1]); p.px(swx - 3, gy, G[4]);
  p.rect(swx, gy - 4, 2, 4, L[1]); p.px(swx, gy - 3, L[3]); p.px(swx, gy - 1, L[3]);
  p.rect(swx - 1, gy - 6, 4, 2, G[3]); p.px(swx - 1, gy - 6, G[4]); p.px(swx, gy - 5, CR[4]);
  if (!gest) arm(p, cx - 4, ty + 3, swx - 2, gy - 6, St[1], St[2], null);
  arm(p, cx + 4, ty + 3, swx - 1, gy - 6, St[3], St[2], null);
  p.rect(swx - 1, gy - 7, 4, 2, St[3]); p.px(swx - 1, gy - 7, St[5]); p.px(swx + 2, gy - 6, St[1]); // Panzerhandschuhe
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Pilger Aldo
function drawAldo(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 16, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // zerschlissene Robe (ausgefranster Saum, Löcher)
  skirt(p, cx, ty + 3, fy - 1, 3.5, 6, ROBE, sw * 0.7, 3, true);
  p.px(cx - 2, ty + 10, ROBE[0]); p.px(cx + 3, ty + 13, ROBE[0]); p.px(cx - 4, ty + 14, ROBE[0]);
  p.rect(cx + 1, ty + 7, 2, 2, '#5a4a36'); p.px(cx + 1, ty + 7, '#6e5c44'); // Flicken
  // Fußwickel
  p.rect(cx - 3, fy - 1, 3, 2, '#6a6050'); p.rect(cx + 2, fy - 1, 4, 2, '#8a7e68'); p.px(cx + 5, fy, '#6a6050');
  // Oberkörper gebeugt, Strick als Gürtel
  torso(p, cx - 4, ty, 8, 5, ROBE, 2);
  p.rect(cx - 4, ty + 4, 9, 1, '#8a7a5a'); p.px(cx - 3, ty + 5, '#8a7a5a'); p.px(cx - 3, ty + 6 + Math.round(sw * 0.4), '#6a5a42');
  // Gebetskette
  for (let i = 0; i < 5; i++) p.px(cx - 1 + i, ty + 1 + Math.round(Math.sin(i / 4 * Math.PI) * 2), i === 2 ? '#c8b070' : '#5a3a2a');
  p.px(cx + 1, ty + 4, BN[3]); p.px(cx + 1, ty + 5, BN[2]);
  // Kapuze + Gesicht (hager, grauer Stoppelbart)
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk });
  p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.rect(hx + 4, hy + 7, 3, 1, WHITEH[1]); p.px(hx + 6, hy + 6, talk ? MOUTH : WHITEH[0]);
  p.rect(hx, hy - 1, 7, 3, ROBE[3]); p.rect(hx - 1, hy + 1, 4, 8, ROBE[3]); p.rect(hx + 1, hy - 2, 5, 1, ROBE[4]);
  p.px(hx + 7, hy, ROBE[3]); p.px(hx + 7, hy + 1, ROBE[2]); p.px(hx + 7, hy + 2, ROBE[2]); p.px(hx - 1, hy + 1, ROBE[4]);
  p.px(hx + 6, hy + 1, ROBE[1]); p.px(hx - 2, hy + 3, ROBE[2]); p.px(hx - 2, hy + 6, ROBE[1]); // ausgefranst
  // Hakenstab mit hängender Laterne (Licht bei dx 5, dy -16)
  const stx = cx + 5, top = 13 - b;
  p.line(stx, top, stx, fy, WOOD[3]); p.line(stx + 1, top, stx + 1, fy, WOOD[1]);
  p.px(stx + 1, top - 1, WOOD[3]); p.px(stx + 2, top - 2, WOOD[3]); p.px(stx + 3, top - 2, WOOD[2]); p.px(stx + 4, top - 1, WOOD[2]); p.px(stx + 4, top, WOOD[1]);
  const lx = AX + 5 + Math.round(sw * 0.6), ly = top + 3;
  p.line(stx + 4, top + 1, lx, ly - 1, '#6a5a40');
  p.px(lx, ly - 1, BRZ[2]); p.rect(lx - 2, ly, 5, 1, BRZ[3]); p.rect(lx - 2, ly + 1, 5, 4, '#2a1a0a');
  p.rect(lx - 2, ly + 1, 1, 4, BRZ[2]); p.rect(lx + 2, ly + 1, 1, 4, BRZ[1]); p.rect(lx - 2, ly + 5, 5, 1, BRZ[1]); p.px(lx, ly + 6, BRZ[1]);
  const fl = Math.sin(t * TAU * 3) > 0 ? 1 : 0;
  p.rect(lx - 1, ly + 1, 3, 4, E[3]); p.px(lx, ly + 2 + fl, E[5]); p.px(lx, ly + 3, E[4]);
  g.rect(lx - 2, ly + 1, 5, 4, E[1]); g.rect(lx - 1, ly + 1, 3, 4, E[3]); g.px(lx, ly + 2 + fl, E[5]); g.px(lx, ly + 3, E[4]);
  // Arme: vorn am Stab, hinten Geste (segnend) / an der Brust
  arm(p, cx + 1, ty + 1, stx - 1, ty + 3, ROBE[3], ROBE[2], null);
  p.rect(stx - 1, ty + 2, 3, 2, SKIN_OLD[2]);
  if (gest) { arm(p, cx - 2, ty + 1, cx + 2, ty - 2 - gest, ROBE[2], ROBE[3], null); p.px(cx + 3, ty - 2 - gest, SKIN_OLD[3]); p.px(cx + 3, ty - 3 - gest, SKIN_OLD[2]); }
  else { arm(p, cx - 3, ty + 1, cx, ty + 3, ROBE[2], ROBE[1], null); p.px(cx + 1, ty + 3, SKIN_OLD[2]); }
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: lx - AX, dy: ly + 3 - AY } };
}

// ------------------------------------------------------------ Quartiermeisterin Ryn
function drawRyn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Umhängetasche hinten
  p.rect(cx - 8, ty + 6, 5, 5, L[2]); p.rect(cx - 8, ty + 6, 5, 1, L[3]); p.rect(cx - 8, ty + 10, 5, 1, L[1]); p.px(cx - 6, ty + 7, BRASS[3]);
  p.px(cx - 7, ty + 5, PAPER[1]); p.px(cx - 5, ty + 5, PAPER[2]);
  // Beine + Stiefel
  legs(p, cx, fy, 29, ASHC, ['#141012', '#221a18', '#3a2c26']);
  p.px(cx + 1, 31, L[2]); p.px(cx + 2, 31, L[2]);
  // Gambeson (aschgrau, gesteppt), orange Schärpe
  torso(p, cx - 3, ty, 7, 11, ASHC, 2);
  for (let y = ty + 2; y < ty + 11; y += 3) p.rect(cx - 2, y, 5, 1, ASHC[1]);
  p.rect(cx - 3, ty + 11, 7, 1, ASHC[1]);
  p.line(cx + 3, ty, cx - 3, ty + 6, E[2]); p.line(cx + 3, ty + 1, cx - 2, ty + 6, E[1]); // Schärpe
  p.rect(cx - 3, ty + 7, 7, 1, L[0]); p.px(cx + 2, ty + 7, BRASS[3]);
  // Schlüsselring und Tintenfass am Gürtel
  p.px(cx - 3, ty + 8, St[4]); p.px(cx - 2, ty + 9, St[3]);
  p.rect(cx + 2, ty + 8, 2, 2, '#1a1a2a'); p.px(cx + 2, ty + 8, '#3a3a5a');
  // Kopf: Haar zum Dutt, Brillengläser
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk });
  p.rect(hx + 1, hy, 6, 2, '#2a1a14'); p.rect(hx + 1, hy + 2, 2, 3, '#2a1a14'); p.px(hx + 3, hy, '#4a3024'); p.px(hx + 6, hy + 2, '#2a1a14');
  p.ellipse(hx, hy + 1, 2, 2, '#2a1a14'); p.px(hx - 1, hy, '#4a3024'); // Dutt
  p.line(hx - 1, hy - 2, hx + 2, hy + 1, '#c8a060'); // Haarnadel
  p.px(hx + 5, hy + 4, EYE); p.px(hx + 6, hy + 4, '#b8c8d8'); p.px(hx + 4, hy + 4, BRASS[3]); p.px(hx + 7, hy + 4, BRASS[3]); p.rect(hx + 5, hy + 5, 2, 1, BRASS[2]); p.px(hx + 3, hy + 3, BRASS[2]); // Brille
  // Klemmbrett (vorn, schräg), Schreibfeder in der hinteren Hand
  const bx = cx + 4, by = ty + 2 - (gest ? 1 : 0);
  p.rect(bx, by, 6, 8, WOOD[3]); p.rect(bx + 1, by + 1, 4, 6, PAPER[2]); p.rect(bx + 1, by + 1, 4, 1, PAPER[1]);
  p.rect(bx + 2, by - 1, 2, 1, St[3]);
  for (let i = 0; i < 3; i++) p.rect(bx + 1, by + 3 + i * 1.5, 3 - (i % 2), 1, PAPER[0]);
  p.px(bx + 4, by + 6, '#8a2a1a'); // Siegel
  arm(p, cx + 3, ty + 1, bx, by + 4, ASHC[3], ASHC[2], null);
  p.rect(bx - 1, by + 4, 2, 2, SKIN[2]);
  const wr = gest ? 0 : Math.round(Math.sin(t * TAU * 2));
  if (gest) {
    // Feder zeigt auffordernd nach vorn
    const qx = bx + 7, qy = by - 1 - gest;
    arm(p, cx - 1, ty + 1, qx - 2, qy + 2, ASHC[2], ASHC[3], null);
    p.rect(qx - 2, qy + 2, 2, 2, SKIN[3]);
    p.line(qx - 1, qy + 2, qx + 3, qy - 2, '#e8e0d0'); p.px(qx + 2, qy - 2, '#fffbef'); p.px(qx + 3, qy - 3, '#d8d0c0'); p.px(qx + 1, qy, '#c8c0b0');
  } else {
    arm(p, cx - 1, ty + 1, bx + 1 + wr, by + 4, ASHC[2], ASHC[3], null);
    p.rect(bx + 1 + wr, by + 4, 2, 2, SKIN[3]);
    p.line(bx + 2 + wr, by + 4, bx + 5 + wr, by - 1, '#e8e0d0'); p.px(bx + 5 + wr, by - 2, '#fffbef'); p.px(bx + 6 + wr, by - 2, '#d8d0c0'); p.px(bx + 4 + wr, by, '#c8c0b0');
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
