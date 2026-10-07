import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, SpriteFrame, Animation } from '../gfx/Sprite.js';
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
}

// Arm als Linie von Schulter zu Hand (2 px stark)
function arm(p, x0, y0, x1, y1, c0, c1, hand) {
  p.line(x0, y0, x1, y1, c0); p.line(x0 + 1, y0, x1 + 1, y1, c1);
  if (hand) { p.px(x1, y1 + 1, hand); p.px(x1 + 1, y1 + 1, hand); }
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

// ------------------------------------------------------------ Wächterin Ilsa
function drawIlsa(p, g, { t = 0, talk = 0, gest = 0 }) {
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

// ------------------------------------------------------------ Kräuterfrau Oona
function drawOona(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 17, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 21 - b, hy = 13 - b;
  // Rock (Glocke)
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
  // Schultertuch/Oberkörper (gebeugt)
  for (let y = ty; y <= ty + 7; y++) for (let x = cx - 4; x <= cx + 3; x++) {
    const i = x < cx - 2 ? 3 : x > cx + 1 ? 1 : 2;
    p.px(x, y, SHAWL[i]);
  }
  for (let x = cx - 4; x <= cx + 3; x++) p.px(x, ty + 8 + (x % 2), SHAWL[1]); // Fransen
  // Gürtel mit Kräuterbündeln
  p.rect(cx - 4, ty + 7, 9, 1, L[1]);
  const herbs = [[cx - 3, '#3e6a32', '#5a8a3e'], [cx - 1, '#5a3a6a', '#8a5aa0'], [cx + 1, '#6a6a2a', '#9a9a3e']];
  for (const [x, c1, c2] of herbs) { p.px(x, ty + 8, L[2]); p.px(x, ty + 9, c1); p.px(x - 1, ty + 10, c1); p.px(x + 1, ty + 10, c2); p.px(x, ty + 11, c2); p.px(x, ty + 10, c1); }
  // Laterne mit Glühwürmchen an der Hüfte (schwingt)
  const lx = cx + 6 + Math.round(sw * 0.7), ly = ty + 9;
  p.line(cx + 4, ty + 7, lx, ly - 1, L[2]);
  p.rect(lx - 1, ly, 4, 1, St[2]); p.rect(lx - 1, ly + 1, 4, 4, '#18241a'); p.rect(lx - 1, ly + 5, 4, 1, St[1]);
  p.px(lx, ly + 2, '#c8f07a'); p.px(lx + 1, ly + 3, '#a0e060'); p.px(lx + 2, ly + 1, St[3]);
  g.rect(lx - 1, ly + 1, 4, 4, '#3a6a20'); g.px(lx, ly + 2, '#e8ffa0'); g.px(lx + 1, ly + 3, '#c8ff80');
  // freie Glühwürmchen
  const flies = [[0.0, 7, 4], [0.33, 5, 7], [0.66, 9, 6]];
  for (const [ph, r, hh] of flies) {
    const a = (t + ph) * TAU;
    const fx = Math.round(lx + 1 + Math.cos(a) * r * 0.6), fyy = Math.round(ly - hh + Math.sin(a * 2) * 2);
    p.px(fx, fyy, '#d8ff90'); g.px(fx, fyy, '#f0ffc0'); g.px(fx, fyy + 1, '#6aa030');
  }
  // Kopf mit Kapuze, nach vorn gebeugt
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN_OLD, talk, brow: GREYH[2] });
  p.px(hx + 4, hy + 5, SKIN_OLD[1]); p.px(hx + 6, hy + 3, SKIN_OLD[1]); // Falten
  p.rect(hx, hy - 1, 6, 3, SHAWL[2]); p.rect(hx - 1, hy + 1, 3, 8, SHAWL[2]); p.rect(hx + 1, hy - 2, 4, 1, SHAWL[3]);
  p.px(hx + 6, hy, SHAWL[2]); p.px(hx + 6, hy + 1, SHAWL[1]); p.px(hx - 1, hy + 1, SHAWL[3]);
  p.px(hx + 3, hy + 2, GREYH[2]); p.px(hx + 4, hy + 2, GREYH[3]); p.px(hx + 2, hy + 3, GREYH[1]); // Haarsträhne
  // Mörser mit beiden Händen, Stößel kreist
  const mx = cx + 4, my = ty + 4;
  arm(p, cx - 1, ty + 1, mx - 1, my, SHAWL[1], SHAWL[2], null);
  p.rect(mx - 2, my, 6, 3, '#4d4459'); p.rect(mx - 1, my + 3, 4, 1, '#3e364b'); p.rect(mx - 2, my, 6, 1, '#6a6272'); p.px(mx - 2, my + 1, '#5f566b');
  p.rect(mx - 1, my, 4, 1, '#2a3a1e'); p.px(mx, my, '#4a7a30');
  const pa = gest ? -1.2 : t * TAU;
  const px0 = mx + 1 + Math.round(Math.cos(pa) * 1), py0 = my - 1;
  p.line(px0, py0, px0 + 1 + (gest ? 2 : 0), py0 - 3 - (gest ? 2 : 0), '#bcae8e');
  p.px(mx - 2, my + 1, SKIN_OLD[2]); p.px(mx + 3, my + 1, SKIN_OLD[2]);
  arm(p, cx + 2, ty + 1, mx + 2, my + 1, SHAWL[2], SHAWL[1], null);
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Händler Vesk
function drawVesk(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 20, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Rucksack (hinter dem Körper, links)
  const px0 = cx - 13, py0 = ty - 6 + (b ? 0 : 1);
  p.rect(px0, py0, 10, 16, PACK[2]); p.rect(px0, py0, 3, 16, PACK[3]); p.rect(px0 + 8, py0, 2, 16, PACK[1]); p.rect(px0, py0 + 15, 10, 1, PACK[0]);
  p.rect(px0 + 1, py0 + 5, 8, 1, L[1]); p.rect(px0 + 1, py0 + 11, 8, 1, L[1]); p.px(px0 + 4, py0 + 5, G[2]);
  p.rect(px0 + 1, py0 + 7, 5, 3, PACK[1]); p.rect(px0 + 1, py0 + 7, 5, 1, PACK[3]); // Außentasche
  // Deckenrolle oben
  p.rect(px0 - 1, py0 - 4, 12, 4, CR[2]); p.rect(px0 - 1, py0 - 4, 12, 1, CR[3]); p.rect(px0 - 1, py0 - 1, 12, 1, CR[1]);
  p.px(px0 - 1, py0 - 3, CR[4]); p.rect(px0 + 3, py0 - 4, 1, 4, L[1]); p.rect(px0 + 7, py0 - 4, 1, 4, L[1]);
  // Pfanne + Topf schwingen
  const pnx = px0 - 1 + Math.round(sw * 0.8), pny = py0 + 13;
  p.line(px0, py0 + 9, pnx - 1, pny, St[2]); p.ellipse(pnx - 2, pny + 2, 2.2, 1.6, St[1]); p.px(pnx - 3, pny + 1, St[3]);
  p.rect(px0 + 2, py0 + 16, 4, 3, '#2a2a30'); p.rect(px0 + 2, py0 + 16, 4, 1, St[2]); p.px(px0 + 2, py0 + 17, St[3]);
  // Beine
  legs(p, cx, fy, 29, ['#221a16', '#30241c', '#44342a'], ['#120c0a', '#1e1410', '#342418']);
  // Mantel
  for (let y = ty; y <= ty + 12; y++) for (let x = cx - 3; x <= cx + 4; x++) {
    if (y > ty + 9 && (x === cx + 4 || x === cx - 3) && y === ty + 12) continue;
    const i = x < cx - 1 ? 3 : x > cx + 2 ? 1 : 2;
    p.px(x, y, COAT[i]);
  }
  p.line(cx + 1, ty + 1, cx + 1, ty + 12, COAT[1]); // Knopfleiste
  p.px(cx + 2, ty + 3, G[3]); p.px(cx + 2, ty + 6, G[2]);
  p.rect(cx - 3, ty + 7, 8, 1, L[1]); // Gürtel
  // Tragegurt
  p.line(cx - 3, ty, cx - 1, ty + 7, L[3]);
  // Münzbeutel
  p.rect(cx + 3, ty + 8, 3, 3, L[3]); p.px(cx + 3, ty + 8, '#8a6446'); p.px(cx + 4, ty + 7, G[3]); p.px(cx + 5, ty + 10, L[1]);
  p.px(cx + 4, ty + 9, G[3]);
  // Kopf + Hut mit breiter Krempe
  const hx = cx - 3;
  head(p, hx, hy, { skin: SKIN, talk });
  p.rect(hx + 5, hy + 6, 2, 1, DARKH[1]); p.px(hx + 4, hy + 7, DARKH[1]); // Kinnbart
  p.rect(hx + 1, hy + 1, 2, 5, DARKH[1]); // Haar hinten
  p.rect(hx - 2, hy + 1, 12, 1, HAT[2]); p.rect(hx - 2, hy + 1, 4, 1, HAT[3]); p.px(hx + 9, hy + 2, HAT[1]);
  p.rect(hx + 1, hy - 3, 6, 4, HAT[2]); p.rect(hx + 1, hy - 3, 2, 4, HAT[3]); p.rect(hx + 1, hy, 6, 1, CR[3]);
  p.px(hx + 2, hy - 4, HAT[3]); p.rect(hx + 3, hy - 4, 3, 1, HAT[2]);
  // Feder am Hut
  p.line(hx, hy - 1, hx - 3, hy - 5, '#c8b070'); p.px(hx - 3, hy - 6, '#e8d8a0');
  // Arme: hinten am Gurt, vorn Geste (Münze)
  arm(p, cx - 2, ty + 1, cx - 2, ty + 7, COAT[1], COAT[2], SKIN[1]);
  if (gest) {
    arm(p, cx + 3, ty + 1, cx + 7, ty - 1 - gest, COAT[2], COAT[1], null);
    p.rect(cx + 7, ty - 2 - gest, 2, 2, SKIN[2]);
    p.px(cx + 8, ty - 4 - gest, G[4]); p.px(cx + 9, ty - 4 - gest, G[3]); g.px(cx + 8, ty - 4 - gest, G[4]);
  } else {
    arm(p, cx + 3, ty + 1, cx + 5, ty + 7, COAT[2], COAT[1], SKIN[2]);
  }
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Kommandant Hale
function drawHale(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 18 - b, hy = 10 - b;
  // Umhang hinten
  for (let y = ty - 1; y <= fy - 1; y++) {
    const k = (y - ty) / (fy - ty), back = Math.round(2 + k * 4 + sw * k);
    for (let x = cx - 4 - back; x <= cx; x++) p.px(x, y, NAVY[x < cx - 3 - back ? 3 : x > cx - 2 ? 1 : 2]);
  }
  for (let x = cx - 9; x < cx - 3; x += 2) p.px(x + Math.round(sw), fy, NAVY[1]);
  // Plattenbeine
  legs(p, cx, fy, 28, [St[1], St[2], St[4]], [St[0], St[2], St[4]]);
  p.px(cx + 2, 31, St[4]); p.px(cx + 2, 32, St[3]); // Kniekachel
  // Brustplatte
  p.rect(cx - 4, ty, 9, 10, St[2]); p.rect(cx - 4, ty, 2, 10, St[3]); p.rect(cx + 4, ty, 1, 10, St[1]);
  p.px(cx - 3, ty + 1, St[5]);
  // Wappenrock
  p.rect(cx - 2, ty + 2, 5, 12, CR[2]); p.rect(cx - 2, ty + 2, 1, 12, CR[3]); p.rect(cx + 2, ty + 2, 1, 12, CR[1]);
  p.px(cx - 2, ty + 14, CR[2]); p.px(cx + 2, ty + 14, CR[1]);
  p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 5, G[3]); p.px(cx + 1, ty + 5, G[3]); p.px(cx, ty + 6, G[3]); p.px(cx, ty + 7, G[2]);
  p.rect(cx - 4, ty + 8, 9, 1, L[1]); p.px(cx + 1, ty + 8, G[3]); // Gürtel
  // Schulterstücke
  p.rect(cx - 5, ty - 1, 4, 3, St[3]); p.rect(cx - 5, ty - 1, 4, 1, St[4]); p.px(cx - 5, ty - 1, St[5]);
  p.rect(cx + 2, ty - 1, 4, 3, St[2]); p.rect(cx + 2, ty - 1, 4, 1, St[4]);
  // Halsberge
  p.rect(cx - 2, ty - 2, 5, 2, St[2]); p.px(cx - 2, ty - 2, St[4]);
  // Kopf: kurzes dunkles Haar, graue Schläfen, Narbe
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN, talk, brow: DARKH[0] });
  p.rect(hx + 1, hy, 5, 2, DARKH[1]); p.rect(hx + 1, hy + 2, 2, 3, DARKH[1]); p.px(hx + 2, hy, DARKH[2]); p.px(hx + 3, hy + 3, GREYH[1]); p.px(hx + 2, hy + 4, GREYH[1]);
  p.rect(hx + 4, hy + 6, 3, 2, '#5a3a30'); p.px(hx + 5, hy + 6, talk ? '#2a0e10' : '#5a3a30'); // Stoppelbart
  p.px(hx + 6, hy + 2, SKIN[1]); p.px(hx + 6, hy + 3, '#8a4a40'); // Narbe
  // hinterer Arm (Geste beim Sprechen: Faust nach vorn)
  if (gest) { arm(p, cx - 1, ty + 1, cx + 7, ty + 2 - gest, St[2], St[3], null); p.rect(cx + 7, ty + 1 - gest, 2, 2, St[3]); p.px(cx + 8, ty + 1 - gest, St[5]); }
  else arm(p, cx - 4, ty + 1, cx - 4, ty + 8, St[1], St[2], St[1]);
  // vorderer Arm mit Helm unter dem Arm
  arm(p, cx + 4, ty + 1, cx + 5, ty + 6, St[3], St[2], null);
  const mx = cx + 5, my = ty + 5;
  p.ellipse(mx + 1, my + 2, 3, 3, St[2]); p.rect(mx - 1, my, 3, 2, St[4]); p.px(mx - 1, my, St[5]);
  p.rect(mx + 1, my + 2, 3, 1, '#07080c'); // Visierschlitz
  p.rect(mx - 1, my - 2, 2, 2, CR[3]); p.px(mx - 2, my - 3, CR[4]); p.px(mx - 1, my - 3, CR[3]); // Helmbusch
  p.rect(mx + 3, my + 4, 2, 1, St[1]);
  p.rect(mx + 3, my, 2, 2, St[3]); // Panzerhandschuh
  return { head: { dx: 0, dy: hy - AY } };
}

// ------------------------------------------------------------ Seherin Ysolde
function drawYsolde(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t), sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 11 - b;
  // Runensteine (hinter dem Körper, wenn sin < 0)
  const stones = [0, 1 / 3, 2 / 3].map((ph) => {
    const a = (t + ph) * TAU;
    return { x: Math.round(cx + 1 + Math.cos(a) * 9), y: Math.round(ty + 1 - gest * 2 + Math.sin(a) * 2.5 + Math.sin(a * 2 + ph * 7) * 1), front: Math.sin(a) > 0, k: ph };
  });
  const drawStone = (s) => {
    p.rect(s.x - 1, s.y - 1, 3, 3, '#2a2638'); p.px(s.x - 1, s.y - 1, '#4a4460'); p.px(s.x + 1, s.y + 1, '#16121e');
    p.px(s.x, s.y, talk ? M[4] : M[3]);
    g.px(s.x, s.y, talk ? '#ffffff' : M[4]); g.px(s.x - 1, s.y, M[2]); g.px(s.x + 1, s.y, M[2]); g.px(s.x, s.y - 1, M[2]);
    // Funkenspur
    g.px(s.x - 2, s.y + 2, M[1]);
  };
  for (const s of stones) if (!s.front) drawStone(s);
  // Silberhaar hinten, lang, weht
  for (let y = hy + 2; y <= ty + 9; y++) {
    const k = (y - hy) / 20, off = Math.round(k * 2 + sw * k);
    p.px(cx - 4 - off, y, SILVER[1]); p.px(cx - 3 - off, y, SILVER[2]); p.px(cx - 5 - off, y, SILVER[0]);
  }
  // Robe (lang, schwingt am Saum)
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
  // Goldene Borte + Gürtelschnur
  for (let x = cx - 6; x <= cx + 7; x++) if ((x & 1) === 0) p.px(x + Math.round(sw * 0.8), fy - 1, G[2]);
  p.rect(cx - 3, ty + 6, 8, 1, G[2]); p.px(cx - 2, ty + 7, G[3]); p.px(cx - 2, ty + 8, G[2]);
  // Sternmuster
  p.px(cx + 3, ty + 12, M[4]); p.px(cx - 1, ty + 15, M[3]);
  // Kopf mit Augenbinde
  const hx = cx - 4;
  head(p, hx, hy, { skin: SKIN_PALE, talk });
  p.rect(hx + 1, hy, 5, 2, SILVER[2]); p.px(hx + 2, hy, SILVER[3]); p.rect(hx + 1, hy + 2, 2, 5, SILVER[2]); p.px(hx + 1, hy + 3, SILVER[3]);
  p.rect(hx + 3, hy + 3, 5, 2, '#3a2a52'); p.rect(hx + 3, hy + 3, 5, 1, '#5e4a80'); p.px(hx + 7, hy + 4, '#2a1e3a'); // Augenbinde
  g.px(hx + 5, hy + 3, M[2]); // schwacher Schimmer durch die Binde
  // Bindenenden wehen hinten
  p.px(hx, hy + 3, '#5e4a80'); p.px(hx - 1, hy + 4 + Math.round(sw * 0.6), '#3a2a52'); p.px(hx - 2, hy + 4 + Math.round(sw), '#5e4a80'); p.px(hx - 2, hy + 5 + Math.round(sw), '#3a2a52');
  // Stirnreif
  p.px(hx + 5, hy + 1, G[3]); p.px(hx + 6, hy + 1, G[4]);
  // Arme: Hände offen nach vorn/oben
  const lift = gest ? 3 : 1;
  arm(p, cx - 2, ty + 1, cx + 3, ty + 5 - lift, ROBE_V[2], ROBE_V[3], null);
  p.px(cx + 4, ty + 5 - lift, SKIN_PALE[2]);
  arm(p, cx + 3, ty + 1, cx + 7, ty + 4 - lift, ROBE_V[3], ROBE_V[2], null);
  p.px(cx + 8, ty + 4 - lift, SKIN_PALE[3]); p.px(cx + 8, ty + 3 - lift, SKIN_PALE[2]);
  p.px(cx + 9, ty + 2 - lift, M[3]); g.px(cx + 9, ty + 2 - lift, M[4]); g.px(cx + 9, ty + 1 - lift, M[2]);
  for (const s of stones) if (s.front) drawStone(s);
  return { head: { dx: 0, dy: hy - AY }, hand: { dx: cx + 9 - AX, dy: ty + 2 - lift - AY } };
}

// ------------------------------------------------------------ Quartiermeister Dunn (Zwerg)
function drawDunn(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = breath(t);
  const ty = 21 - b, hy = 13 - b;
  // Stämmige Beine
  p.rect(cx - 4, 31, 4, 4, '#2a2230'); p.rect(cx + 1, 31, 4, 4, '#382e3e');
  p.rect(cx - 5, fy - 2, 5, 3, '#120c0a'); p.rect(cx + 1, fy - 2, 6, 3, L[1]); p.rect(cx + 1, fy - 2, 6, 1, L[3]);
  // Rumpf (breit)
  p.rect(cx - 5, ty, 11, 11, SHIRT[1]); p.rect(cx - 5, ty, 3, 11, SHIRT[2]); p.rect(cx + 5, ty, 1, 11, SHIRT[0]);
  // Schürze
  p.rect(cx - 2, ty + 3, 8, 10, APRON[2]); p.rect(cx - 2, ty + 3, 2, 10, APRON[3]); p.rect(cx + 5, ty + 3, 1, 10, APRON[1]);
  p.rect(cx, ty + 9, 4, 2, APRON[1]); p.px(cx, ty + 9, APRON[3]); // Tasche
  p.px(cx + 1, ty + 8, '#bcae8e'); p.px(cx + 2, ty + 8, '#80755c'); // Werkzeug
  p.rect(cx - 5, ty + 6, 11, 1, L[0]); p.px(cx - 3, ty + 6, G[3]); // Gürtel
  // Schlüsselbund
  p.px(cx - 4, ty + 7, St[3]); p.px(cx - 4, ty + 8, St[4]); p.px(cx - 3, ty + 8, St[2]);
  // Kopf (breit), Glatze mit Haarkranz, großer Bart
  const hx = cx - 3;
  p.rect(hx, hy, 8, 8, SKIN[2]); p.rect(hx + 1, hy, 6, 1, SKIN[3]); p.px(hx + 2, hy, '#e0b090');
  p.px(hx + 8, hy + 4, SKIN[2]); p.px(hx + 8, hy + 5, SKIN[1]); // Nase
  p.px(hx + 6, hy + 3, EYE); p.rect(hx + 5, hy + 2, 3, 1, BEARD[2]); // Braue
  p.rect(hx, hy + 1, 3, 5, BEARD[1]); p.px(hx + 1, hy + 3, SKIN[1]); // Haarkranz/Ohr
  // Bart (wallend, geflochten)
  p.rect(hx + 1, hy + 5, 8, 4, BEARD[2]); p.rect(hx + 2, hy + 9, 6, 3, BEARD[2]); p.rect(hx + 3, hy + 12, 4, 2, BEARD[1]);
  p.rect(hx + 6, hy + 5, 3, 2, BEARD[3]); p.px(hx + 4, hy + 8, BEARD[3]); p.px(hx + 3, hy + 10, BEARD[3]); p.px(hx + 6, hy + 10, BEARD[1]);
  p.px(hx + 4, hy + 14, G[3]); p.px(hx + 5, hy + 14, G[2]); p.px(hx + 4, hy + 15, BEARD[1]); // Bartring
  p.px(hx + 7, hy + 6, talk ? '#1a0808' : BEARD[1]);
  // Feder hinter dem Ohr
  p.line(hx, hy - 2, hx + 2, hy + 2, '#e0d8c8'); p.px(hx - 1, hy - 3, '#fffbef');
  // Klemmbrett in der vorderen Hand
  const bx = cx + 5, by = ty + 2 - (gest ? 2 : 0);
  p.rect(bx, by, 6, 8, L[3]); p.rect(bx + 1, by + 1, 4, 6, PAPER[2]); p.rect(bx + 1, by + 1, 4, 1, PAPER[1]);
  p.rect(bx + 2, by - 1, 2, 1, St[3]);
  for (let i = 0; i < 3; i++) p.rect(bx + 1, by + 3 + i * 1.5, 3 - (i % 2), 1, PAPER[0]);
  p.rect(bx - 1, by + 4, 2, 2, SKIN[2]);
  arm(p, cx + 3, ty + 1, bx - 1, by + 3, SHIRT[2], SHIRT[1], null);
  // hinterer Arm mit Kohlestift, tippt aufs Brett
  const tap = gest ? 0 : Math.round(Math.sin(t * TAU * 2));
  arm(p, cx - 2, ty + 1, bx + 1, by + 5 + tap, SHIRT[1], SHIRT[2], null);
  p.rect(bx + 1, by + 5 + tap, 2, 2, SKIN[3]); p.line(bx + 2, by + 5 + tap, bx + 4, by + 3 + tap, '#1a1616');
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

export function createNpcSprites2() {
  return {
    warden_ilsa: makeSet(drawIlsa),
    herbalist_oona: makeSet(drawOona),
    trader_vesk: makeSet(drawVesk),
    commander_hale: makeSet(drawHale),
    seer_ysolde: makeSet(drawYsolde),
    quartermaster_dunn: makeSet(drawDunn),
  };
}
