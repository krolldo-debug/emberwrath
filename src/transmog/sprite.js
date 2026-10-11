import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { SpriteFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { buildFine, glowCanvas, headFine, fmap, fold, tone } from '../sprites/npcFine.js';
import { TAU } from '../core/math.js';

// Gewandmeisterin (Haus der Spiegel) und ihr Standspiegel: in jeder Wegstein-Stadt, legt gesammeltes Aussehen gegen Gold an.
// Format wie der Auktionator (market/sprite.js): Blick nach rechts, Anker = Fußpunkt, Leuchtendes zusätzlich auf frame.glow.
// Feinraster Stufe B (npcFine.buildFine): alter Weg grob, Details im feinen Durchgang (`if (p.fine)`); bei „Niedrig“ nur alt.
const W = 40, H = 42, AX = 18, AY = 37;
const G = PAL.gold, S = PAL.steel, E = PAL.ember;
const SKIN = ['#4a3430', '#7a5a4c', '#a07e6a', '#c4a28a'];
const PLUM = ['#12081a', '#1e0e2a', '#2e163e', '#422058', '#5a2e74'];
const HAIR = ['#1a0c0a', '#2e1610', '#4a2216', '#6a321c'];
const LACE = ['#8a7e6c', '#c8bca2', '#ece2c8'];
const CLOTH = ['#2a0810', '#4e0e1c', '#7a1a2a', '#a42a38'];
const TAPE = ['#8a6418', '#d8a830'];
const EYE = '#150c12', LIP = '#6a2a30';
const GP = { w: '#fff8d8', 4: G[4], 3: G[3], 2: G[2], 1: G[1], 0: G[0] };
const HP = { a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3], e: tone(HAIR[3], 0.2) };
// Feinfassung (Blaukanal ±1): neu gezeichnete Großformen gelten im feinen Durchgang ganz (keine Treppen aus der Grobfassung)
const nudge = (c) => '#' + ((parseInt(c.slice(1), 16) ^ 1) >>> 0).toString(16).padStart(6, '0');
const PLUM_F = PLUM.map(nudge), G_F = G.map(nudge);
// Leuchtebene nur im letzten Durchgang beschreiben (fein: FineCanvas, Niedrig: PixelCanvas)
const NOGLOW = { px() {}, rect() {}, line() {}, ellipse() {}, dot() {}, fline() {}, each() {}, fine: true, step: 0.5 };

function head(p, hx, hy, talk) {
  if (p.fine) {
    // Gesicht fein (Wimpern, Lippen), Haar streng zurück in Strähnen, Knoten als Schnecke, Nadel mit Glanz
    headFine(p, hx, hy, { skin: SKIN, talk, brow: HAIR[1], lash: true, lip: LIP, iris: '#3a5a4a' });
    fmap(p, hx + 1, hy - 2, [
      '..bbcbbbb...',
      '.bccddccbb..',
      'bcddccbccbb.',
      'ccbbcceddcba',
      'bbccbbccbbaa',
      'abbccbbcbba.',
    ], HP);
    fmap(p, hx + 1, hy + 1, ['cbba', 'bcba', 'cdab', 'bcba', 'cbab', 'bcb.', 'cba.', 'bb..', 'ba..', 'a...', '.a..'], HP);
    fmap(p, hx - 2, hy - 1, ['.bccb.', 'bcddcb', 'cdbbca', 'cbccba', 'bcbbaa', '.baa..'], HP);
    p.line(hx - 4, hy - 2, hx + 1, hy + 1, G[3]);
    p.fline(hx - 4, hy - 2.5, hx + 1, hy + 0.5, G[4]); p.dot(hx - 4, hy - 2.5, '#ffffff'); p.dot(hx - 4.5, hy - 2, G[4]);
    return;
  }
  // Gesicht schmaler als beim Auktionator, hohe Wangen
  p.rect(hx + 2, hy + 1, 5, 6, SKIN[2]);
  p.rect(hx + 3, hy + 7, 3, 1, SKIN[1]);
  p.px(hx + 7, hy + 3, SKIN[2]); p.px(hx + 7, hy + 4, SKIN[2]); p.px(hx + 7, hy + 5, SKIN[1]);
  p.px(hx + 6, hy + 2, SKIN[3]); p.px(hx + 6, hy + 4, SKIN[3]);
  p.px(hx + 5, hy + 3, EYE); p.px(hx + 5, hy + 2, HAIR[1]);
  p.px(hx + 3, hy + 5, SKIN[1]);
  p.px(hx + 6, hy + 6, talk ? EYE : LIP);
  // Haar: streng zurück, Knoten am Hinterkopf mit goldener Nadel
  p.rect(hx + 1, hy - 1, 6, 2, HAIR[2]); p.rect(hx + 2, hy - 2, 4, 1, HAIR[1]);
  p.px(hx + 6, hy, HAIR[3]); p.px(hx + 4, hy - 1, HAIR[3]);
  p.rect(hx + 1, hy + 1, 2, 5, HAIR[2]); p.px(hx + 1, hy + 1, HAIR[3]); p.px(hx + 2, hy + 6, HAIR[1]);
  p.rect(hx - 2, hy - 1, 3, 3, HAIR[2]); p.px(hx - 2, hy - 1, HAIR[1]); p.px(hx - 1, hy - 1, HAIR[3]); p.px(hx - 2, hy + 1, HAIR[1]);
  p.line(hx - 4, hy - 2, hx + 1, hy + 1, G[3]); p.px(hx - 4, hy - 2, G[4]);
}

// Maßband fein: Teilstriche (lang/kurz), Schattenkante, Metallkappe am Ende
function tapeFine(p, x, y0, y1) {
  p.rect(x + 0.5, y0, 0.5, y1 - y0 + 1, '#b08420');
  for (let y = y0 + 0.5; y <= y1; y += 1) { p.dot(x, y, TAPE[0]); if ((y - y0) % 2 > 1) p.dot(x + 0.5, y, TAPE[0]); }
  p.rect(x, y1 + 0.5, 1, 0.5, S[4]); p.dot(x + 0.5, y1 + 0.5, S[2]);
}

function draw(p, g, { t = 0, talk = 0, gest = 0 }) {
  const fy = AY, cx = 18, b = Math.sin(t * TAU) > 0.2 ? 1 : 0, sw = Math.sin(t * TAU);
  const ty = 19 - b, hy = 10 - b;
  // Langes Kleid aus Pflaumensamt, unten weit, goldene Borte am Saum
  if (p.fine) {
    // Glocke fein, geschwungene Falten (Tal/Grat), Borte mit Flechtmuster und Lichtkante
    p.each(cx - 10, ty + 8, cx + 12, fy + 0.99, (x, y) => {
      const k = (y - ty - 8) / (fy - ty - 8), hw = 3 + k * 5, s = -sw * k * 0.6;
      const l = cx - hw + s, wd = 2 * hw + 2;
      if (x < l || x > l + wd) return null;
      if (y >= fy) return y < fy + 0.5 ? G_F[1] : G_F[0];
      if (y >= fy - 1) return y < fy - 0.5 ? (Math.floor(x * 2) % 3 ? G_F[3] : G_F[4]) : G_F[2];
      const rel = (x - l) / wd;
      let i = rel < 0.2 ? 4 : rel < 0.55 ? 3 : rel < 0.85 ? 2 : 1;
      if (k > 0.15) {
        const u = (x - s - cx + (y - ty) * 0.18) / 4, f = u - Math.round(u);
        if (Math.abs(f) < 0.07) i = Math.max(1, i - 1);
        else if (f < 0 && f > -0.2) i = Math.min(4, i + 1);
      }
      if (y >= fy - 1.5) i = Math.max(0, i - 1);
      return PLUM_F[i];
    });
  } else {
    for (let y = ty + 8; y <= fy; y++) {
      const k = (y - ty - 8) / (fy - ty - 8), hw = 3 + k * 5, s = Math.round(-sw * k * 0.6);
      for (let x = Math.round(cx - hw) + s; x <= Math.round(cx + 1 + hw) + s; x++) {
        const rel = (x - s - (cx - hw)) / (2 * hw + 1);
        let i = rel < 0.2 ? 4 : rel < 0.55 ? 3 : rel < 0.85 ? 2 : 1;
        if ((x - s + (y >> 2)) % 4 === 0 && k > 0.2) i = Math.max(1, i - 1);   // Faltenwurf
        p.px(x, y, y >= fy - 1 ? G[y === fy ? 1 : 2] : PLUM[i]);
      }
    }
  }
  // Mieder mit Schnürung, Spitzenkragen
  p.rect(cx - 3, ty, 7, 9, PLUM[3]); p.rect(cx - 3, ty, 2, 9, PLUM[4]); p.rect(cx + 3, ty, 1, 9, PLUM[2]);
  if (p.fine) {
    // Mieder: Lichtkante, Stäbchennähte, Schnürung über Kreuz mit Ösen
    p.rect(cx - 3, ty + 0.5, 0.5, 8, tone(PLUM[4], 0.18)); fold(p, cx - 1, ty + 1.5, ty + 8, PLUM[2], PLUM[4]); fold(p, cx + 3, ty + 1.5, ty + 8, PLUM[1], PLUM[3]);
    p.rect(cx + 0.5, ty + 1.5, 0.5, 6.5, PLUM[1]);
    fmap(p, cx - 0.5, ty + 1.5, ['g...g', '.l.L.', '..l..', '.L.l.', 'g...g', '.l.L.', '..l..', '.L.l.', 'g...g', '.l.L.', '..l..', '.L.l.', 'g...g'], { g: G[3], l: LACE[2], L: LACE[0] });
  } else for (let y = ty + 2; y < ty + 8; y += 2) { p.px(cx, y, LACE[1]); p.px(cx + 1, y + 1, LACE[0]); }
  p.rect(cx - 4, ty + 8, 9, 1, G[1]); p.px(cx, ty + 8, G[3]);
  if (p.fine) {
    for (let x = cx - 4; x < cx + 5; x += 0.5) { const o = (x * 2) & 1; p.dot(x, ty + 8, o ? G[2] : G[3]); p.dot(x, ty + 8.5, o ? G[1] : G[2]); }
    fmap(p, cx - 0.5, ty + 7.5, ['.43.', '4cC3', '3cc2', '.21.'], { ...GP, c: CLOTH[2], C: CLOTH[3] });
  }
  p.rect(cx - 3, ty - 1, 7, 2, LACE[2]); p.px(cx - 3, ty, LACE[1]); p.px(cx + 3, ty, LACE[1]); p.px(cx, ty + 1, LACE[1]);
  if (p.fine) {
    // Spitzenkragen: Bogenkante, Lochmuster (Mieder scheint durch)
    p.rect(cx - 3, ty - 1, 7, 1, LACE[2]); p.rect(cx - 3, ty, 7, 1, PLUM[3]); p.rect(cx - 3, ty, 2, 1, PLUM[4]);
    fmap(p, cx - 3, ty - 1, ['.222222222222.', '22212221222122', '2.2212.2122.21', '1212.1212.1212', '.1.1..1.1..1.1'], { 2: LACE[2], 1: LACE[1] });
  }
  // Maßband über den Schultern, hängt vorn herunter
  p.line(cx - 2, ty + 1, cx - 2, ty + 9, TAPE[1]); p.line(cx + 3, ty + 1, cx + 3, ty + 7, TAPE[1]);
  if (p.fine) { tapeFine(p, cx - 2, ty + 1, ty + 9); tapeFine(p, cx + 3, ty + 1, ty + 7); }
  else for (let y = ty + 2; y <= ty + 8; y += 2) { p.px(cx - 2, y, TAPE[0]); if (y <= ty + 6) p.px(cx + 3, y, TAPE[0]); }
  // Kopf
  const hx = cx - 3;
  head(p, hx, hy, talk);
  // hinterer Arm: Stoffballen unter dem Arm (Glutrot)
  p.rect(cx - 6, ty + 1, 2, 7, PLUM[2]); p.px(cx - 6, ty + 1, PLUM[3]);
  p.rect(cx - 9, ty + 5, 5, 7, CLOTH[2]); p.rect(cx - 9, ty + 5, 5, 1, CLOTH[3]); p.rect(cx - 9, ty + 6, 1, 6, CLOTH[1]);
  p.px(cx - 7, ty + 8, CLOTH[3]); p.px(cx - 6, ty + 10, CLOTH[1]); p.rect(cx - 9, ty + 12, 5, 1, CLOTH[0]);
  if (p.fine) {
    // Ärmel mit Lichtkante; Stoffballen: Lagen am Stirnende, Brokatmuster in Gold, Faltenkante, Kante oben im Licht
    p.rect(cx - 6, ty + 1, 0.5, 4, PLUM[3]); p.rect(cx - 4.5, ty + 1.5, 0.5, 3.5, PLUM[1]);
    p.rect(cx - 9, ty + 5, 5, 0.5, tone(CLOTH[3], 0.2)); p.rect(cx - 8.5, ty + 5.5, 4.5, 0.5, CLOTH[3]);
    fmap(p, cx - 9, ty + 6, ['21', '12', '21', '32', '21', '12', '21', '32', '21', '12', '21', '10'], { 3: CLOTH[3], 2: CLOTH[2], 1: CLOTH[1], 0: CLOTH[0] });
    for (const [x, y] of [[cx - 7.5, ty + 7], [cx - 5.5, ty + 7], [cx - 6.5, ty + 9], [cx - 7.5, ty + 11], [cx - 5.5, ty + 11]]) {
      p.dot(x, y, G[2]); p.dot(x - 0.5, y + 0.5, G[1]); p.dot(x + 0.5, y + 0.5, G[1]); p.dot(x, y + 1, G[1]);
    }
    p.rect(cx - 8, ty + 12, 4, 0.5, CLOTH[1]);
    fmap(p, cx - 5, ty + 8, ['.332', '3221', '2211', '.11.'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  } else p.rect(cx - 5, ty + 8, 2, 2, SKIN[2]);
  // vorderer Arm mit Schere; beim Sprechen erhoben, die Schere schnappt
  const ax = cx + 6, ay = ty + 6 - (gest ? 2 + gest * 2 : 0);
  p.rect(cx + 4, ty, 2, 3, PLUM[4]); p.px(cx + 5, ty + 2, PLUM[3]);
  p.line(cx + 5, ty + 3, ax - 1, ay - 1, PLUM[3]); p.line(cx + 6, ty + 3, ax, ay - 1, PLUM[2]);
  if (p.fine) {
    // Puffärmel mit Glanz und Falte, Spitzenmanschette, Hand mit Fingern
    p.rect(cx + 4, ty, 2, 0.5, tone(PLUM[4], 0.2)); p.dot(cx + 4, ty + 0.5, tone(PLUM[4], 0.2)); p.rect(cx + 5, ty + 0.5, 0.5, 2, PLUM[3]);
    p.fline(cx + 4.5, ty + 3, ax - 1.5, ay - 1, PLUM[4]);
    fmap(p, ax - 1.5, ay, ['.2221', '21.12'], { 2: LACE[2], 1: LACE[1] });
    fmap(p, ax - 1, ay + 1, ['233332', '322221', '.2211.', '..11..'], { 3: SKIN[3], 2: SKIN[2], 1: SKIN[1] });
  } else {
    p.px(ax - 1, ay, LACE[1]); p.px(ax, ay, LACE[1]);
    p.rect(ax - 1, ay + 1, 3, 2, SKIN[2]); p.px(ax + 1, ay + 1, SKIN[3]);
  }
  // Schere: zwei Griffringe in der Hand, Klingen nach oben vorn
  const sx = ax + 1, sy = ay;
  const open = gest === 2 ? 1 : 0;
  if (p.fine) {
    // Griffringe golden (offen), Klingen Stahl mit Glanzlinie (1 Feinpixel) und Spitze, Schraube
    fmap(p, sx - 1.5, sy + 1.5, ['.32.', '3..2', '.21.'], GP); fmap(p, sx + 0.5, sy + 2.5, ['.32.', '3..1', '.21.'], GP);
    p.line(sx + 1, sy, sx + 4, sy - 4, S[3]); p.line(sx + 2, sy + 1, sx + 5 + open, sy - 3 + open, S[2]);
    p.fline(sx + 1, sy - 0.5, sx + 4, sy - 4.5, S[5]); p.fline(sx + 2.5, sy + 1, sx + 5.5 + open, sy - 3 + open, S[4]);
    p.dot(sx + 4, sy - 4.5, '#ffffff');
    fmap(p, sx + 1.5, sy - 1.5, ['43', '21'], GP);
  } else {
    p.px(sx - 1, sy + 2, G[2]); p.px(sx + 1, sy + 3, G[2]); p.px(sx, sy + 3, G[1]);
    p.line(sx + 1, sy, sx + 4, sy - 4, S[4]); p.line(sx + 2, sy + 1, sx + 5 + open, sy - 3 + open, S[3]);
    p.px(sx + 4, sy - 4, S[5]); p.px(sx + 2, sy - 1, G[3]);
  }
  if (g.fine) { g.dot(sx + 4, sy - 4.5, '#ffffff'); g.dot(sx + 3.5, sy - 4.5, S[4]); g.dot(sx + 4.5, sy - 4.5, S[3]); g.dot(sx + 4, sy - 5, S[4]); g.dot(sx + 4, sy - 4, S[3]); }
  else g.px(sx + 4, sy - 4, S[5]);
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

// Standspiegel: ovales Glas im vergoldeten Rahmen auf Klauenfüßen, oben ein Glutstein.
// Glas nachtblau mit einem harten hellen Streif (kein Verlauf), der Stein leuchtet auf der Glow-Ebene.
const MW = 22, MH = 40, MAX = 11, MAY = 38;
const GLASS = ['#0c1424', '#14223a', '#1e3252', '#2c4a70'];
const GLASS_F = GLASS.map(nudge);
function drawMirror(p, g) {
  const fy = MAY, cx = 11, top = 4, bot = fy - 8;
  const rx = 7, ry = (bot - top) / 2, cy = top + ry;
  // Füße und Fuß des Ständers
  p.rect(cx - 6, fy - 1, 3, 2, G[1]); p.rect(cx + 4, fy - 1, 3, 2, G[1]); p.px(cx - 6, fy - 1, G[2]); p.px(cx + 6, fy - 1, G[2]);
  p.rect(cx - 5, fy - 3, 11, 2, G[1]); p.rect(cx - 5, fy - 3, 11, 1, G[2]);
  p.rect(cx - 1, bot, 3, fy - 3 - bot, G[2]); p.px(cx - 1, bot + 2, G[3]); p.px(cx + 1, bot + 3, G[1]);
  if (p.fine) {
    // Klauenfüße mit Zehen, Sockel mit Lichtkante und Perlstab, Säule als Zylinder mit Glanzlinie und Wulst
    fmap(p, cx - 6, fy - 1, ['.3443.', '322221', '21.1.1'], GP); fmap(p, cx + 4, fy - 1, ['.3332.', '322211', '1.1.10'], GP);
    p.rect(cx - 5, fy - 3, 11, 0.5, G[3]); p.dot(cx - 4.5, fy - 3, G[4]); p.rect(cx - 5, fy - 1.5, 11, 0.5, G[0]);
    for (let x = cx - 4.5; x < cx + 6; x += 1) { p.dot(x, fy - 2.5, G[3]); p.dot(x + 0.5, fy - 2, G[1]); }
    for (let y = bot; y < fy - 3; y += 0.5) { p.dot(cx - 1, y, G[3]); p.dot(cx - 0.5, y, G[4]); p.dot(cx, y, G[3]); p.dot(cx + 0.5, y, G[2]); p.dot(cx + 1, y, G[2]); p.dot(cx + 1.5, y, G[1]); }
    fmap(p, cx - 1.5, bot + 2, ['2344332', '1222211'], GP);
  }
  // Rahmen (Oval, 2 px Gold) und Glas
  if (p.fine) {
    // Rahmen 5-stufig nach Lichtwinkel, Glanzlinie oben links, Perlen, dunkle Innenkante; Glas mit harten Spiegelstreifen
    p.each(cx - rx - 1.5, top - 1.5, cx + rx + 2, bot + 2, (x, y) => {
      const X = x - cx - 0.5, Y = y - cy - 0.5;
      const ox = X / (rx + 1.2), oy = Y / (ry + 1.2), d = ox * ox + oy * oy;
      if (d > 1) return null;
      const ix = X / (rx - 0.6), iy = Y / (ry - 0.6), id = ix * ix + iy * iy;
      if (id > 1) {
        const a = Math.atan2(oy, ox), l = -Math.cos(a) - Math.sin(a);   // > 0 oben links
        const mid = Math.abs(Math.sqrt(d) - 0.94) < 0.025;
        if (id < 1.12) return G_F[l > 0.6 ? 1 : 0];                     // Innenkante (Schatten)
        if (mid && l > 0.9) return G_F[4];                               // Glanzlinie
        if (mid && Math.round(a * 9) % 2 === 0) return l > -0.5 ? G_F[4] : G_F[2];   // Perlstab
        return G_F[l > 0.9 ? 3 : l > 0 ? 3 : l > -0.9 ? 2 : 1];
      }
      // Glas: Stufen von links hell nach rechts dunkel, zwei harte Streifen schräg
      const sd = X + Y * 0.45;
      if (sd > -4.6 && sd < -3.6 && Y > -ry + 3 && Y < ry - 6) return '#5a7aa4';
      if (sd > -3.6 && sd < -2.4 && Y > -ry + 2 && Y < ry - 4) return GLASS_F[3];
      if (sd > 1.4 && sd < 1.9 && Y > -ry + 5 && Y < ry - 8) return GLASS_F[3];
      return GLASS_F[X < -2 ? 2 : X < 3 ? 1 : 0];
    });
    p.dot(cx - 3.5, top + 3, '#ffffff'); p.dot(cx - 3, top + 3, '#a8c0e0'); p.dot(cx - 3.5, top + 3.5, '#a8c0e0');
  } else {
    for (let y = top - 1; y <= bot + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / (rx + 1.2), dy = (y - cy) / (ry + 1.2), d = dx * dx + dy * dy;
      if (d > 1) continue;
      const ix = (x - cx) / (rx - 0.6), iy = (y - cy) / (ry - 0.6), inner = ix * ix + iy * iy <= 1;
      if (!inner) p.px(x, y, x < cx ? (y < cy ? G[3] : G[2]) : y < cy ? G[2] : G[1]);
      else p.px(x, y, GLASS[x < cx - 2 ? 2 : x < cx + 3 ? 1 : 0]);
    }
    // Spiegelung: harter heller Streif schräg, ein paar Glanzpunkte
    for (let i = 0; i < 8; i++) { p.px(cx - 4 + (i >> 2), top + 5 + i, GLASS[3]); if (i < 5) p.px(cx - 3 + (i >> 2), top + 5 + i, '#5a7aa4'); }
    p.px(cx + 3, top + 4, GLASS[3]); p.px(cx + 4, bot - 6, GLASS[2]);
  }
  // Krone mit Glutstein
  if (p.fine) {
    fmap(p, cx - 3, top - 4.5, [
      '......44......',
      '.....3w43.....',
      '..2.234432.2..',
      '.232334433232.',
      '12332eEe233321',
      '.1222eee22221.',
      '..1111111111..',
    ], { ...GP, e: E[3], E: E[5] });
    p.dot(cx, top - 2.5, E[4]);
    fmap(p, cx - rx - 1, cy, ['54', '32'], { 5: E[5], 4: E[4], 3: E[3], 2: E[2] }); fmap(p, cx + rx + 1, cy, ['43', '32'], { 4: E[4], 3: E[3], 2: E[2] });
  } else {
    p.rect(cx - 2, top - 3, 5, 2, G[2]); p.px(cx - 3, top - 2, G[1]); p.px(cx + 3, top - 2, G[1]); p.px(cx, top - 4, G[3]);
    p.px(cx, top - 2, PAL.ember[4]);
    p.px(cx - rx - 1, cy, PAL.ember[3]); p.px(cx + rx + 1, cy, PAL.ember[3]);
  }
  if (g.fine) {
    // Glutstein: weißer Kern, gelb/oranger Saum; Seitensteine kleiner
    fmap(g, cx - 1, top - 3.5, ['.22.', '2443', '4w54', '.33.'], { w: '#fffbe8', 5: E[5], 4: E[4], 3: E[3], 2: E[2] });
    for (const x of [cx - rx - 1, cx + rx + 1]) fmap(g, x - 0.5, cy - 0.5, ['.2.', '243', '.3.'], { 4: E[5], 3: E[3], 2: E[2] });
  } else {
    g.px(cx, top - 2, PAL.ember[4]); g.px(cx, top - 3, PAL.ember[3]);
    g.px(cx - rx - 1, cy, PAL.ember[3]); g.px(cx + rx + 1, cy, PAL.ember[3]);
  }
}

export function createTransmogSprites() {
  const phases = (n) => [...Array(n)].map((_, i) => i / n);
  const idle = new Animation(phases(6).map((t) => mkFrame((p, g) => draw(p, g, { t }))), 6);
  const talk = new Animation([
    mkFrame((p, g) => draw(p, g, { t: 0.1, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.25, talk: 0, gest: 2 })),
    mkFrame((p, g) => draw(p, g, { t: 0.4, talk: 1, gest: 1 })),
    mkFrame((p, g) => draw(p, g, { t: 0.55, talk: 0, gest: 0 })),
  ], 6);
  // Leuchtebene des Spiegels: fein = Texelgröße des umrandeten Sprites ((MW+1)×(MH+1) Weltpixel, Versatz ½), sonst alt in Weltpixeln
  const res = fineRes();
  let gc;
  if (res > 1) { gc = new FineCanvas(MW + 1, MH + 1, 2); gc.translate(0.5, 0.5); } else gc = new PixelCanvas(MW, MH);
  const mirror = buildFine(MW, MH, MAX, MAY, (p, pass) => drawMirror(p, res > 1 && pass === 0 ? NOGLOW : gc));
  return { idle, talk, mirror, mirrorGlow: gc.canvas };
}
