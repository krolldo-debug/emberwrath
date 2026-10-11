import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { buildFine, glowCanvas, headFine, fmap, stitch, grain, tone } from '../sprites/npcFine.js';
import { TAU } from '../core/math.js';

// Auktionator der Gilde der Glutwaage und sein Pult (Auktionshaus in jeder Stadt).
// Format wie die NPCs in sprites/npcs3.js: Blick nach rechts, Anker = Fußpunkt, Leuchtendes zusätzlich auf frame.glow.
// Feinraster Stufe B (npcFine.buildFine): alter Weg grob, Details im feinen Durchgang (`if (p.fine)`); bei „Niedrig“ nur alt.
const W = 40, H = 42, AX = 18, AY = 37;
const G = PAL.gold, L = PAL.leather, E = PAL.ember, CR = PAL.crimson;
const SKIN = ['#4a3430', '#7a5a4c', '#a07e6a', '#bc9c86'];
const WINE = ['#1a070c', '#2e0c16', '#4a1424', '#6a1e32', '#8a2c40'];
const NIGHT = ['#0e0a14', '#18121e', '#241a2c', '#32263c'];
const GREY = ['#4a4448', '#787074', '#a49ca0', '#cec8ca'];
const WOOD = ['#1e130c', '#2e1e12', '#43301c', '#5a4228', '#735634'];
const PAGE = ['#7a6e5a', '#b8aa8a', '#e2d6b6'];
const EYE = '#150c12', MOUTH = '#2a0e10';
const GP = { w: '#fff8d8', 4: G[4], 3: G[3], 2: G[2], 1: G[1], 0: G[0] };
// Feinfassung (Blaukanal ±1): neu gezeichnete Großformen gelten im feinen Durchgang ganz (keine Treppen aus der Grobfassung)
const nudge = (c) => '#' + ((parseInt(c.slice(1), 16) ^ 1) >>> 0).toString(16).padStart(6, '0');
const WINE_F = WINE.map(nudge), G_F = G.map(nudge);
// Leuchtebene nur im letzten Durchgang beschreiben (fein: FineCanvas, Niedrig: PixelCanvas)
const NOGLOW = { px() {}, rect() {}, line() {}, ellipse() {}, dot() {}, fline() {}, each() {}, fine: true };

function head(p, hx, hy, talk) {
  const S = SKIN;
  if (p.fine) {
    // Gesicht fein, graue Schläfen in Strähnen, gezwirbelter Schnurrbart und Spitzbart
    headFine(p, hx, hy, { skin: S, talk, brow: GREY[2], old: true, iris: '#4a5a6a' });
    fmap(p, hx + 1, hy + 2, ['cdcb', 'bcbc', 'cbcb', 'bccb', 'cbbc', 'bcb.', 'cb..', 'b...'], { b: GREY[1], c: GREY[2], d: GREY[3] });
    fmap(p, hx + 3, hy + 5.5, [
      '...dccd...',
      '..dccbbccd',
      '.bcb.mm.bc',
      '.bcbccbc..',
      '..bcbcb...',
      '..cbcbc...',
      '...bcb....',
      '...cb.....',
      '....b.....',
    ], { b: GREY[1], c: GREY[2], d: GREY[3], m: talk ? MOUTH : '#6a4a40' });
    return;
  }
  p.rect(hx + 1, hy + 1, 6, 6, S[2]);
  p.rect(hx + 2, hy + 7, 4, 1, S[1]);
  p.rect(hx + 5, hy + 2, 2, 1, S[3]);
  p.px(hx + 7, hy + 4, S[2]); p.px(hx + 7, hy + 5, S[1]);
  p.px(hx + 5, hy + 4, EYE);
  p.px(hx + 4, hy + 3, GREY[1]); p.px(hx + 5, hy + 3, GREY[1]);
  p.px(hx + 3, hy + 4, S[1]); p.px(hx + 3, hy + 5, S[0]);
  p.px(hx + 6, hy + 5, S[3]); p.px(hx + 6, hy + 3, S[3]); p.px(hx + 4, hy + 5, S[3]);
  p.px(hx + 1, hy + 5, S[1]); p.px(hx + 1, hy + 6, S[1]);
  // gepflegter grauer Spitzbart und Schnurrbart
  p.rect(hx + 3, hy + 6, 4, 1, GREY[2]); p.px(hx + 7, hy + 6, GREY[1]);
  p.rect(hx + 3, hy + 7, 4, 1, GREY[1]); p.rect(hx + 4, hy + 8, 3, 1, GREY[2]); p.px(hx + 5, hy + 9, GREY[1]);
  p.px(hx + 6, hy + 6, talk ? MOUTH : GREY[3]);
  if (talk) p.px(hx + 5, hy + 7, MOUTH);
  // Schläfen grau
  p.rect(hx + 1, hy + 2, 2, 4, GREY[1]); p.px(hx + 1, hy + 2, GREY[2]);
}

// Barett aus Samt mit Goldborte und kurzer Glutfeder
function cap(p, g, hx, hy, sw) {
  p.rect(hx - 1, hy - 1, 9, 2, NIGHT[2]); p.rect(hx, hy - 2, 7, 1, NIGHT[3]); p.rect(hx + 1, hy - 3, 4, 1, NIGHT[2]);
  p.px(hx - 1, hy, NIGHT[1]); p.px(hx - 2, hy, NIGHT[1]);
  p.rect(hx, hy + 1, 8, 1, G[2]); p.px(hx + 6, hy + 1, G[3]); p.px(hx + 2, hy + 1, G[1]);
  const fx = hx + 1 - Math.round(sw * 0.6);
  if (p.fine) {
    // Samt: Lichtkante oben, Falten als Tal/Grat, herabhängende Seite; Borte geflochten mit Glanz
    p.rect(hx + 1, hy - 3, 4, 0.5, tone(NIGHT[3], 0.2)); p.rect(hx, hy - 2, 7, 0.5, tone(NIGHT[3], 0.12)); p.dot(hx - 0.5, hy - 1, NIGHT[3]);
    for (const x of [hx + 2, hx + 4.5]) { p.dot(x, hy - 1.5, NIGHT[1]); p.dot(x, hy - 1, NIGHT[1]); p.dot(x - 0.5, hy - 1, NIGHT[3]); }
    p.rect(hx - 1, hy + 0.5, 8, 0.5, NIGHT[1]); p.dot(hx - 2, hy + 0.5, NIGHT[0]);
    for (let x = hx; x < hx + 8; x += 0.5) { const o = (x * 2) & 1; p.dot(x, hy + 1, o ? G[2] : G[3]); p.dot(x, hy + 1.5, o ? G[1] : G[2]); }
    p.dot(hx + 6, hy + 1, G[4]);
    // Glutfeder: Fahne bogenförmig, Spitze glüht
    fmap(p, fx - 3, hy - 5.5, ['...455.', '.33445w', '2234.4.', '12...3.', '.....2.'], { w: E[5], 5: E[5], 4: E[4], 3: E[3], 2: E[2], 1: E[1] });
    g.dot(fx + 0.5, hy - 5, E[5]); g.dot(fx, hy - 5, E[3]); g.dot(fx + 0.5, hy - 5.5, E[2]);
  } else {
    p.px(fx, hy - 4, PAL.ember[3]); p.px(fx - 1, hy - 5, PAL.ember[4]); p.px(fx - 2, hy - 5, PAL.ember[3]); p.px(fx - 3, hy - 4, PAL.ember[2]);
  }
}

function draw(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = Math.sin(t * TAU) > 0.2 ? 1 : 0, sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 10 - b;
  // Beine und Schnallenschuhe
  p.rect(cx - 3, 31, 3, fy - 33, NIGHT[1]); p.rect(cx + 1, 31, 3, fy - 33, NIGHT[2]);
  p.rect(cx - 4, fy - 2, 4, 3, L[0]); p.rect(cx + 1, fy - 2, 5, 3, L[1]); p.px(cx + 3, fy - 2, G[3]); p.px(cx - 2, fy - 2, G[2]);
  if (p.fine) {
    // Strumpfhose mit Lichtkante, Schuhe mit Glanz, Schnallen 5-stufig, Sohle
    p.rect(cx + 1, 31, 0.5, fy - 33, NIGHT[3]); p.rect(cx - 3, 31, 0.5, fy - 33, NIGHT[2]);
    p.rect(cx + 1, fy - 2, 5, 0.5, L[2]); p.dot(cx + 5, fy - 1, L[3]); p.dot(cx + 5.5, fy - 0.5, L[2]); p.rect(cx + 1, fy + 0.5, 5, 0.5, '#0e0806');
    p.rect(cx - 4, fy - 2, 4, 0.5, L[1]); p.rect(cx - 4, fy + 0.5, 4, 0.5, '#0a0605');
    fmap(p, cx + 2.5, fy - 2, ['w43', '3.1', '221'], GP); fmap(p, cx - 2.5, fy - 2, ['32', '21'], GP);
  }
  // langer Weinrotmantel mit Goldsaum, Schöße offen
  if (p.fine) {
    // Glockenform fein, Falten (Tal/Grat), offener Schoß mit Goldkante (Flechtmuster), Goldsaum unten
    p.each(cx - 9, ty + 2, cx + 11, fy - 2.01, (x, y) => {
      const k = (y - ty - 2) / (fy - 3 - ty - 2), hw = 4 + k * 3, s = -sw * k * 0.8;
      const l = cx - hw + s, wd = 2 * hw + 2;
      if (x < l || x > l + wd) return null;
      const rel = (x - l) / wd, xa = l + 0.42 * wd, xb = l + 0.62 * wd;
      const open = y > ty + 9;
      if (open && x >= xa && x < xb) return null;
      if (y >= fy - 3) return (open && (x < xa + 0.5 || x >= xb - 0.5)) || Math.floor(x * 2) % 3 ? (y < fy - 2.5 ? G_F[3] : G_F[1]) : G_F[2];
      if (open && x >= xa - 0.5 && x < xa) return Math.floor(y * 2) % 3 ? G_F[2] : G_F[3];
      if (open && x >= xb && x < xb + 0.5) return Math.floor(y * 2) % 3 ? G_F[1] : G_F[2];
      let i = rel < 0.2 ? 4 : rel < 0.58 ? 3 : 2;
      if (k > 0.3) {
        const u = (x - s - cx) / 3, f = u - Math.round(u);
        if (Math.abs(f) < 0.09) i = Math.max(1, i - 1);
        else if (f < 0 && f > -0.26) i = Math.min(4, i + 1);
      }
      return WINE_F[i];
    });
  } else {
    for (let y = ty + 2; y <= fy - 3; y++) {
      const k = (y - ty - 2) / (fy - 3 - ty - 2), hw = 4 + k * 3, s = Math.round(-sw * k * 0.8);
      for (let x = Math.round(cx - hw) + s; x <= Math.round(cx + 1 + hw) + s; x++) {
        const rel = (x - s - (cx - hw)) / (2 * hw + 1);
        if (rel > 0.42 && rel < 0.62 && y > ty + 9) continue; // offener Schoß: Beine sichtbar
        let i = rel < 0.25 ? 4 : rel < 0.6 ? 3 : 2;
        if ((x - s) % 3 === 0 && k > 0.3) i -= 1;
        p.px(x, y, WINE[y === fy - 3 ? 1 : i]);
      }
    }
    for (let y = ty + 10; y <= fy - 3; y++) { p.px(cx - 1 + Math.round(-sw * ((y - ty) / 18) * 0.8), y, G[2]); p.px(cx + 3 + Math.round(-sw * ((y - ty) / 18) * 0.8), y, G[1]); }
    for (let x = cx - 6; x <= cx + 7; x++) if (x < cx - 1 || x > cx + 3) p.px(x + Math.round(-sw * 0.8), fy - 3, G[2]);
  }
  // dunkles Wams, Gürtel mit Geldbeutel
  p.rect(cx - 3, ty, 7, 10, NIGHT[2]); p.rect(cx - 3, ty, 2, 10, NIGHT[3]); p.rect(cx + 3, ty, 1, 10, NIGHT[1]);
  if (p.fine) {
    p.rect(cx - 3, ty + 0.5, 0.5, 9, tone(NIGHT[3], 0.18)); p.rect(cx + 0.5, ty + 1, 0.5, 8, NIGHT[1]); p.rect(cx + 1.5, ty + 1, 0.5, 8, NIGHT[3]);
    for (let y = ty + 2; y < ty + 9; y += 2) fmap(p, cx + 1, y, ['43', '21'], GP);
  } else for (let y = ty + 2; y < ty + 9; y += 2) p.px(cx + 1, y, G[3]);
  p.rect(cx - 4, ty + 8, 9, 1, L[0]); p.px(cx, ty + 8, G[3]);
  if (p.fine) {
    p.rect(cx - 4, ty + 8, 9, 0.5, L[1]); fmap(p, cx - 0.5, ty + 8, ['w432', '3..1'], GP);
    fmap(p, cx + 3, ty + 9, ['.5kk5.', '5aaabc', '5aagbc', '5aabbc', '.abbc.', '..bc..', '...c..'], { k: G[2], 5: '#8a6446', a: L[3], b: L[2], c: L[1], g: G[3] });
  } else { p.rect(cx + 3, ty + 9, 3, 3, L[2]); p.px(cx + 3, ty + 9, L[3]); p.px(cx + 4, ty + 12, L[1]); p.px(cx + 4, ty + 10, G[3]); }
  // Mantelschultern + Pelzkragen
  p.rect(cx - 5, ty - 1, 11, 3, WINE[3]); p.rect(cx - 5, ty - 1, 11, 1, WINE[4]); p.px(cx - 5, ty + 1, WINE[2]); p.px(cx + 5, ty + 1, WINE[2]);
  if (p.fine) {
    p.rect(cx - 5, ty - 0.5, 11, 0.5, WINE[3]); p.rect(cx - 5, ty - 1, 3, 0.5, tone(WINE[4], 0.18)); p.rect(cx + 3.5, ty - 0.5, 2.5, 2.5, WINE[2]);
    // Pelz in Büscheln, Spitzen hängen über den Mantel
    fmap(p, cx - 4, ty - 2.5, [
      '...dc.dcd..cd.....',
      '..cdcc.dcdc.cdc...',
      '.cbccdcbccbcdcbc..',
      'cbcbbcbbcbcbbcbbc.',
      'bbabbcbabbabbcbab.',
      '.a.ba..a.b.a..ab..',
    ], { a: GREY[0], b: GREY[1], c: GREY[2], d: GREY[3] });
  } else { p.rect(cx - 4, ty - 2, 9, 2, GREY[1]); p.rect(cx - 3, ty - 2, 7, 1, GREY[2]); p.px(cx + 3, ty - 2, GREY[3]); }
  // Amtskette mit der Glutwaage
  if (p.fine) {
    // Kettenglieder abwechselnd hell/dunkel, Medaillon mit Glutkern
    for (const [x0, y0, x1, y1] of [[cx - 3, ty, cx, ty + 4], [cx + 4, ty, cx + 1, ty + 4]]) {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= n; i++) p.dot(x0 + 0.25 + (x1 - x0) * i / n, y0 + 0.25 + (y1 - y0) * i / n, i % 2 ? G[1] : x1 > x0 ? G[4] : G[3]);
    }
    fmap(p, cx - 1, ty + 4, ['.3443.', '342234', '32ew23', '32ee21', '231121', '.2111.'], { ...GP, e: E[4], w: E[5] });
  } else {
    p.line(cx - 3, ty, cx, ty + 4, G[2]); p.line(cx + 4, ty, cx + 1, ty + 4, G[1]);
    p.px(cx - 2, ty + 1, G[4]); p.px(cx + 3, ty + 1, G[3]);
    p.rect(cx - 1, ty + 4, 3, 3, G[2]); p.px(cx, ty + 4, G[4]); p.px(cx - 1, ty + 6, G[1]);
  }
  if (g.fine) {
    g.dot(cx + 0.5, ty + 5, '#fff8e0'); g.dot(cx, ty + 5, E[4]); g.dot(cx, ty + 5.5, E[4]); g.dot(cx + 0.5, ty + 5.5, E[4]);
    g.dot(cx - 0.5, ty + 5, E[2]); g.dot(cx + 1, ty + 5, E[3]); g.dot(cx + 0.5, ty + 4.5, E[3]); g.dot(cx, ty + 6, E[2]);
  } else { g.px(cx, ty + 5, PAL.ember[4]); g.px(cx, ty + 4, PAL.ember[3]); }
  // Kopf
  const hx = cx - 3;
  head(p, hx, hy, talk);
  cap(p, g, hx, hy, sw);
  // hinterer Arm: Kontobuch unter dem Arm
  p.rect(cx - 6, ty + 1, 2, 7, WINE[2]); p.px(cx - 6, ty + 1, WINE[3]);
  p.rect(cx - 8, ty + 5, 5, 6, L[1]); p.rect(cx - 8, ty + 5, 5, 1, L[3]); p.rect(cx - 8, ty + 6, 1, 5, PAGE[1]); p.px(cx - 6, ty + 7, G[3]);
  if (p.fine) {
    // Ärmel mit Lichtkante; Buch: Lederdeckel mit Punktnaht, Seitenschnitt in Lagen, Goldecken und Schließe
    p.rect(cx - 6, ty + 1, 0.5, 4, WINE[3]); p.rect(cx - 4.5, ty + 1.5, 0.5, 3.5, WINE[1]);
    p.rect(cx - 8, ty + 5, 5, 0.5, tone(L[3], 0.2)); p.rect(cx - 7.5, ty + 5.5, 4.5, 0.5, L[2]);
    for (let y = ty + 6; y < ty + 11; y += 0.5) p.dot(cx - 8, y, (y * 2) % 2 ? PAGE[0] : PAGE[2]);
    p.rect(cx - 7.5, ty + 6, 0.5, 5, PAGE[0]);
    stitch(p, cx - 6.5, ty + 6.5, cx - 6.5, ty + 10.5, L[2]); stitch(p, cx - 6.5, ty + 10.5, cx - 3.5, ty + 10.5, L[2]);
    fmap(p, cx - 4, ty + 5, ['32', '.1'], GP); fmap(p, cx - 4, ty + 10, ['.2', '21'], GP);
    fmap(p, cx - 6, ty + 7, ['43', '32', '21'], GP);
    fmap(p, cx - 5, ty + 8, ['.332', '3221', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  } else p.rect(cx - 5, ty + 8, 2, 2, SKIN[2]);
  // vorderer Arm mit Hammer; beim Sprechen erhoben
  const ax = cx + 6, ay = ty + 6 - (gest ? 3 + gest * 2 : 0);
  p.rect(cx + 4, ty, 3, 3, WINE[3]); p.px(cx + 6, ty + 2, WINE[2]);
  p.line(cx + 5, ty + 3, ax - 1, ay - 1, WINE[3]); p.line(cx + 6, ty + 3, ax, ay - 1, WINE[2]);
  if (p.fine) {
    p.rect(cx + 4, ty, 3, 0.5, WINE[4]); p.rect(cx + 4, ty + 0.5, 0.5, 2, WINE[4]);
    p.fline(cx + 4.5, ty + 3, ax - 1.5, ay - 1, WINE[4]);
    fmap(p, ax - 1, ay, ['4433', '2211'], GP);
    fmap(p, ax - 1, ay + 1, ['233332', '322221', '.2211.', '..11..'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  } else {
    p.px(ax - 1, ay, G[2]); p.px(ax, ay, G[2]); // Ärmelborte
    p.rect(ax - 1, ay + 1, 3, 2, SKIN[2]); p.px(ax + 1, ay + 1, SKIN[3]);
  }
  // Auktionshammer: Stiel schräg nach oben, Kopf aus dunklem Holz mit Messingband
  const hx2 = ax + 1, hy2 = ay + 1;
  p.line(hx2, hy2, hx2 + 3, hy2 - 4, WOOD[3]); p.px(hx2 + 1, hy2 - 1, WOOD[4]);
  p.rect(hx2 + 2, hy2 - 7, 3, 4, WOOD[2]); p.rect(hx2 + 2, hy2 - 7, 3, 1, WOOD[4]); p.rect(hx2 + 2, hy2 - 5, 3, 1, G[2]); p.px(hx2 + 4, hy2 - 6, WOOD[1]);
  if (p.fine) {
    p.fline(hx2 + 0.5, hy2 - 0.5, hx2 + 3, hy2 - 4, WOOD[4]); p.dot(hx2 + 1, hy2 - 1, tone(WOOD[4], 0.25));
    fmap(p, hx2 + 2, hy2 - 7, ['544433', '433322', '332221', '322211', 'wBBBbc', 'bbbbcc', '322211', '211100'], {
      5: tone(WOOD[4], 0.18), 4: WOOD[4], 3: WOOD[3], 2: WOOD[2], 1: WOOD[1], 0: WOOD[0], w: G[4], B: G[3], b: G[2], c: G[1],
    });
  }
  return { head: { dx: 0, dy: hy - AY } };
}

function mkFrame(fn) {
  const res = fineRes(), gc = glowCanvas(W, H);
  let used = false;
  const DRAW = new Set(['px', 'rect', 'line', 'ellipse', 'dot', 'fline', 'each']);
  const g = new Proxy(gc, { get(tg, k) { if (DRAW.has(k)) used = true; const v = tg[k]; return typeof v === 'function' ? v.bind(tg) : v; } });
  const f = buildFine(W, H, AX, AY, (p, pass) => fn(p, res > 1 && pass === 0 ? NOGLOW : g));
  if (used) f.glow = res > 1 ? new SpriteFrame(gc.canvas, AX * res, AY * res, res) : new SpriteFrame(gc.canvas, AX, AY);
  return f;
}

// Pult aus dunklem Holz mit Messing-Waage und aufgeschlagenem Auktionsbuch, Kerze oben links.
const LW = 26, LH = 30, LAX = 13, LAY = 28;
function drawLectern(p, g) {
  const fy = LAY;
  // Sockel und Korpus (leicht nach vorn geneigt)
  p.rect(5, fy - 2, 17, 3, WOOD[1]); p.rect(5, fy - 2, 17, 1, WOOD[2]);
  p.rect(7, fy - 16, 13, 14, WOOD[2]); p.rect(7, fy - 16, 3, 14, WOOD[3]); p.rect(18, fy - 16, 2, 14, WOOD[1]);
  for (let y = fy - 14; y < fy - 2; y += 4) p.rect(10, y, 8, 1, WOOD[1]);
  if (p.fine) {
    // Sockel: Maserung waagerecht, Kante oben im Licht, Nagelköpfe
    grain(p, 5, fy - 1, 17, 2, WOOD[0], WOOD[2], 7, true);
    p.rect(5, fy - 2, 17, 0.5, WOOD[3]); p.rect(5, fy + 0.5, 17, 0.5, WOOD[0]);
    for (const x of [6, 20.5]) { p.dot(x, fy - 1, '#8a8a96'); p.dot(x, fy - 0.5, '#2a2a30'); }
    // Korpus: Rahmen (Lichtkante links, Schatten rechts), Füllung mit Maserung, Bretterfugen mit Kantenlicht, Nägel
    grain(p, 7, fy - 16, 3, 14, WOOD[2], WOOD[4], 3); grain(p, 10, fy - 16, 8, 14, WOOD[1], WOOD[3], 5); grain(p, 18, fy - 16, 2, 14, WOOD[0], null, 9);
    p.rect(7, fy - 16, 0.5, 14, WOOD[4]); p.rect(9.5, fy - 16, 0.5, 14, WOOD[1]); p.rect(10, fy - 16, 0.5, 14, WOOD[3]);
    p.rect(17.5, fy - 16, 0.5, 14, WOOD[1]); p.rect(19.5, fy - 16, 0.5, 14, WOOD[0]);
    for (let y = fy - 14; y < fy - 2; y += 4) {
      p.rect(10, y, 8, 0.5, WOOD[0]); p.rect(10, y + 1, 8, 0.5, WOOD[3]);
      for (const x of [10.5, 17]) { p.dot(x, y + 0.5, '#8a8a96'); p.dot(x + 0.5, y + 0.5, '#2a2a30'); }
    }
  }
  // Messingbeschlag: Glutwaage
  p.rect(12, fy - 13, 3, 1, G[3]); p.px(13, fy - 14, G[4]); p.line(13, fy - 13, 13, fy - 6, G[2]);
  p.line(10, fy - 12, 16, fy - 12, G[2]); p.px(10, fy - 11, G[2]); p.px(16, fy - 11, G[2]);
  p.rect(9, fy - 10, 3, 1, G[3]); p.rect(15, fy - 10, 3, 1, G[3]); p.rect(12, fy - 6, 3, 1, G[1]);
  if (p.fine) {
    // Messing 5-stufig: Säule mit Glanzlinie, Balken mit Lichtkante, Schalen als Mulden, Fuß, Glutstein mit Kern
    p.rect(13, fy - 13, 0.5, 7, G[3]); p.rect(13.5, fy - 13, 0.5, 7, G[1]); p.dot(13, fy - 11, G[4]);
    p.rect(10, fy - 12, 7, 0.5, G[3]); p.rect(10, fy - 11.5, 7, 0.5, G[1]); p.dot(11, fy - 12, G[4]);
    for (const x of [9, 15]) fmap(p, x, fy - 10, ['433332', '.2211.'], GP);
    p.dot(10.5, fy - 11, G[2]); p.dot(16.5, fy - 11, G[2]);
    fmap(p, 12, fy - 6, ['344332', '211110'], GP);
    fmap(p, 12, fy - 14, ['..44..', '.4ew3.', '332221'], { ...GP, e: E[4], w: E[5] });
  }
  if (g.fine) { g.dot(13, fy - 13.5, '#fff8e0'); g.dot(12.5, fy - 13.5, E[3]); g.dot(13.5, fy - 13.5, E[4]); g.dot(13, fy - 14, E[2]); }
  else g.px(13, fy - 14, PAL.ember[4]);
  // schräge Pultplatte
  for (let i = 0; i < 4; i++) p.rect(5 + i, fy - 20 + i, 17 - i, 1, WOOD[3 - (i >> 1)]);
  p.rect(5, fy - 20, 17, 1, WOOD[4]);
  if (p.fine) {
    p.rect(5, fy - 20, 17, 0.5, tone(WOOD[4], 0.2)); grain(p, 6, fy - 19, 15, 3, WOOD[1], WOOD[4], 11, true);
    p.rect(8, fy - 16.5, 14 - 2, 0.5, WOOD[0]);
  }
  // aufgeschlagenes Buch
  p.rect(9, fy - 22, 4, 3, PAGE[2]); p.rect(13, fy - 22, 4, 3, PAGE[1]); p.px(13, fy - 22, PAGE[0]);
  p.px(10, fy - 21, PAGE[0]); p.px(11, fy - 21, PAGE[0]); p.px(14, fy - 21, PAGE[0]); p.px(15, fy - 20, PAGE[0]);
  p.rect(9, fy - 19, 8, 1, WINE[2]);
  if (p.fine) {
    // Seiten gewölbt, Schriftzeilen, Falz, Lesezeichen; Deckel mit Goldrücken
    fmap(p, 9, fy - 22, [
      '.3333332g222222.',
      '3kk3kkk3g2kk2k22',
      '33333333g2222222',
      '3kkk3kk3g2kkk222',
      '33333333g222r222',
      '13333333g222r221',
      'wwwwwwwwGWWWWWWW',
      'WWWWWWWWWWWWWWWW',
    ], { 3: PAGE[2], 2: PAGE[1], 1: PAGE[0], k: '#6a5a46', g: PAGE[0], r: CR[3], w: WINE[3], W: WINE[2], G: G[3] });
    p.dot(15, fy - 18.5, CR[3]); p.dot(15, fy - 18, CR[2]); p.dot(15.5, fy - 17.5, CR[1]);
  }
  // Kerze in Messinghalter
  p.rect(6, fy - 22, 2, 2, G[2]); p.rect(6, fy - 26, 2, 4, '#e8dcc0'); p.px(6, fy - 26, '#fffbef');
  p.px(6, fy - 27, PAL.ember[4]); p.px(7, fy - 28, PAL.ember[5]);
  if (p.fine) {
    // Halter mit Glanz, Wachs mit Lichtkante und Tropfen, Docht, Flamme mit heißem Kern
    fmap(p, 5.5, fy - 22, ['34432', '23321', '.221.', '.111.'], GP);
    p.rect(6, fy - 26, 0.5, 4, '#fffbef'); p.rect(7.5, fy - 25.5, 0.5, 3.5, '#c8b898'); p.dot(7.5, fy - 26, '#e8dcc0');
    p.dot(6.5, fy - 25, '#fffbef'); p.dot(6.5, fy - 24.5, '#fffbef'); p.dot(7, fy - 26, '#d8ccb0');
    p.dot(6.5, fy - 26.5, '#2a1a10');
    fmap(p, 5.5, fy - 29, ['..4.', '.45.', '.554', '4553', '.43.'], { 5: E[5], 4: E[4], 3: E[3] });
  }
  if (g.fine) {
    // Flamme: weißer Kern, gelber und oranger Saum, gestufter Schein
    fmap(g, 5, fy - 29.5, ['...2..', '..343.', '.2454.', '.3w53.', '.2442.', '..32..'], { w: '#fffbe8', 5: E[5], 4: E[4], 3: E[3], 2: E[2] });
  } else { g.px(6, fy - 27, PAL.ember[4]); g.px(7, fy - 28, PAL.ember[5]); g.px(7, fy - 27, PAL.ember[3]); }
}

export function createAuctioneerSprites() {
  const phases = (n) => [...Array(n)].map((_, i) => i / n);
  const idle = new Animation(phases(6).map((t) => mkFrame((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mkFrame((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 0 })),
  ], 6);
  // Leuchtebene des Pults: fein = Texelgröße des umrandeten Sprites ((LW+1)×(LH+1) Weltpixel, Versatz ½), sonst alt in Weltpixeln
  const res = fineRes();
  let gc;
  if (res > 1) { gc = new FineCanvas(LW + 1, LH + 1, 2); gc.translate(0.5, 0.5); } else gc = new PixelCanvas(LW, LH);
  const lectern = buildFine(LW, LH, LAX, LAY, (p, pass) => drawLectern(p, res > 1 && pass === 0 ? NOGLOW : gc));
  return { idle, talk, lectern, lecternGlow: gc.canvas };
}
