import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame, blitFrame, glowCanvasSize } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2, createRng } from '../core/math.js';
import { OUT, createPine, createDeadTree, createRock, createBush, createFence, createGrave, createLamp, createCampfire, createWell, createCrate, createSign } from './outdoor.js';
import { poly } from './decor_ashwood.js';
import { buildFine, fmap, stitch, fold, grain, tone } from './npcFine.js';

// ---------------------------------------------------------------- Feinraster Stufe B (docs/STYLE.md „Feinraster“)
// Alle Einträge laufen über buildFine: draw(p) zeichnet zweimal, grob (alte Weltpixel-Zeichnung) und fein
// (p.fine: Maserung, Fugen, Risse, Falten, Glanzlinien …). Leuchtebenen sind im Feinraster fein (FineCanvas mit
// Texelgröße = sprite.canvas inkl. Umriss, Versatz 0.5) und werden dann nur im feinen Durchgang beschrieben.
// Bei Qualität „Niedrig“ (fineRes() 1) bleibt alles wie vor dem Update.

// FineCanvas.ellipse tastet um (cx, cy) als Punkt ab, PixelCanvas.ellipse legt die Mitte in Pixel (cx, cy):
// im feinen Durchgang auf die alte Lage und Größe bringen (sonst sitzen Ellipsen einen halben Weltpixel versetzt).
// buildFine (npcFine.js) erledigt das für p selbst (p.ellipseFine = fein zentriert); hier nur für eigene Leinwände.
function fixEllipse(c) {
  if (c.fine && !c.ellipseFine) {
    const e = c.ellipse.bind(c);
    c.ellipseFine = e;
    c.ellipse = (cx, cy, rx, ry, col) => e(cx + 0.5, cy + 0.5, rx + 0.35, ry + 0.4, col);
  }
  return c;
}

// Leuchtebene zu einem buildFine-Sprite der Größe W×H. Liefert { g, canvas, pass(p) }: g zeichnet in
// Sprite-Koordinaten (px/rect/line/ellipse/dot/fline wie p); pass(p) vor jedem Durchgang aufrufen.
function glowLayer(W, H) {
  const fine = fineRes() >= 2;
  const c = fine ? new FineCanvas(W + 1, H + 1, 2) : new PixelCanvas(W + 2, H + 2);
  if (fine) { c.translate(0.5, 0.5); fixEllipse(c); } else c.ctx.translate(1, 1);
  let on = true, used = false;
  const call = (fn) => (...a) => { if (on) { used = true; fn(...a); } };
  const g = {
    px: call((x, y, col) => c.px(x, y, col)),
    rect: call((x, y, w, h, col) => c.rect(x, y, w, h, col)),
    line: call((x0, y0, x1, y1, col) => c.line(x0, y0, x1, y1, col)),
    ellipse: call((x, y, rx, ry, col) => c.ellipse(x, y, rx, ry, col)),
    // feine Werkzeuge: bei fineRes() 1 als ganze Weltpixel
    dot: call((x, y, col) => (fine ? c.dot(x, y, col) : c.px(Math.floor(x), Math.floor(y), col))),
    fline: call((x0, y0, x1, y1, col) => (fine ? c.fline(x0, y0, x1, y1, col) : c.line(x0, y0, x1, y1, col))),
    fine, step: fine ? 0.5 : 1,
  };
  return {
    g,
    get used() { return used; },
    get canvas() { return c.canvas; },
    // Im Feinraster nur der feine Durchgang (sonst blieben grobe 2×2-Reste unter dem heißen Kern stehen)
    pass(p) { on = !fine || !!p.fine; },
  };
}

// mk() wie decor_ashwood, aber Stufe B: buildFine + feine Leuchtebene. draw(p, g) läuft je Durchgang einmal;
// Zufall daher IN draw erzeugen (createRng), sonst sähe der feine Durchgang andere Werte als der grobe.
function mk(W, H, draw, { ax = Math.floor(W / 2), ay = H - 1, box, light, extra, outline = true, finish = true } = {}) {
  const gl = glowLayer(W, H);
  const sprite = buildFine(W, H, ax, ay, (p) => { fixEllipse(p); gl.pass(p); draw(p, gl.g); }, { outline, finish });
  const e = { sprite };
  if (gl.used) e.glow = gl.canvas;
  if (box) e.box = box;
  if (light) e.light = light;
  if (extra) Object.assign(e, extra);
  return e;
}

// Grober Durchgang im Feinraster (pass 0 bei fineRes() 2): Flächen, die der feine Durchgang ohnehin ganz neu
// zeichnet, hier auslassen – spart Zeit, und Scale2x füllt sonst an der alten Silhouette Ecken, die als
// Streupixel neben der neuen, feinen Silhouette stehen blieben.
const coarseSkip = (p) => !p.fine && fineRes() >= 2;
// nur die alte Weltpixel-Fassung (Qualität „Niedrig“): Sprenkel und Formen, die fein ersetzt werden
const lo = (p) => !p.fine && fineRes() < 2;

// ---- kleine Feinwerkzeuge (nur im feinen Durchgang)
// Nagelkopf: heller Punkt oben links, Schatten unten rechts
function nail(p, x, y, I = PAL.steel) { p.dot(x, y, I[3]); p.dot(x + 0.5, y + 0.5, I[0]); }
// Fase eines Blocks/Bretts: Licht oben/links, Schatten unten/rechts (je 1 Feinpixel)
function bevel(p, x, y, w, h, light, dark, { top = true, left = true, bottom = true, right = true } = {}) {
  if (top && light) p.rect(x, y, w, 0.5, light);
  if (left && light) p.rect(x, y, 0.5, h, light);
  if (bottom && dark) p.rect(x, y + h - 0.5, w, 0.5, dark);
  if (right && dark) p.rect(x + w - 0.5, y, 0.5, h, dark);
}
// Riss im Stein: Feinpixel-Zickzack nach unten, Lichtlippe rechts daneben
function crack(p, x, y, len, seed, dark, light) {
  let cx = x;
  for (let k = 0; k < len * 2; k++) {
    const yy = y + k * 0.5;
    p.dot(cx, yy, dark);
    if (light && k % 2) p.dot(cx + 0.5, yy, light);
    const h = hash2(k, seed, 77);
    if (h < 0.3) cx -= 0.5; else if (h > 0.7) cx += 0.5;
  }
}
// Grasbüschel/Moospolster aus Feinpixeln (3 Halme)
function tuft(p, x, y, dark, mid, light) {
  p.dot(x, y, dark); p.dot(x + 0.5, y, mid); p.dot(x + 1, y, dark);
  p.dot(x, y - 0.5, mid); p.dot(x + 0.5, y - 1, light); p.dot(x + 1, y - 0.5, mid);
}
// Harter Schattenwurf im Feinpuffer (Traufschatten): Zeilen dunkler, gestuft statt halbtransparent
function shadeBand(p, x, y, w, ks) {
  const F0 = p.F(x), G0 = p.G(y), F1 = p.F(x + w);
  for (let j = 0; j < ks.length; j++) {
    const G = G0 + j, k = ks[j];
    if (G < 0 || G >= p.H) continue;
    for (let F = Math.max(0, F0); F < Math.min(p.W, F1); F++) {
      const i = G * p.W + F, v = p.buf[i];
      if (!v) continue;
      const r = (v & 255) * k, gg = ((v >>> 8) & 255) * k, b = ((v >>> 16) & 255) * k;
      p.buf[i] = ((v & 0xff000000) | (Math.round(b) << 16) | (Math.round(gg) << 8) | Math.round(r)) >>> 0;
    }
  }
}

// Dorf-Objekte für das Endgame: Glutpforte (Eingang der Glutprüfungen) und
// Gemeinschaftstruhe (Bank). Format wie Deko-Einträge: { sprite, glow, box, light }.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss).
const BASALT = ['#0d0b10', '#18141c', '#241e2a', '#332a39', '#463b4c', '#5b4e60'];
const EMB = PAL.ember, GOLD = PAL.gold, IRON = PAL.steel;
const WOOD = ['#140c09', '#22150f', '#342016', '#4a2e1e', '#61402a', '#7c5636'];

export function createVillageProps() {
  return {
    emberGate: emberGate(), bankChest: bankChest(), mirror: mirror(),
    // Runde 5: Deko-Satz der Glutsenke (level.decorSet = 'village')
    ...createValleyDecor(),
  };
}

function emberGate() {
  const W = 48, H = 60, cx = 24, bottom = H - 1;
  const gl = glowLayer(W, H), g = gl.g;
  const G = (x, y, c) => g.px(x, y, c);
  const sprite = buildFine(W, H, cx, bottom, (p) => {
    gl.pass(p);
    const fine = p.fine;
    // Sockelstufen
    p.rect(4, bottom - 3, W - 8, 4, BASALT[2]); p.rect(4, bottom - 3, W - 8, 1, BASALT[4]);
    p.rect(8, bottom - 6, W - 16, 3, BASALT[3]); p.rect(8, bottom - 6, W - 16, 1, BASALT[5]);
    if (fine) {
      // Stufen: Kante als Feinlinie, Stoßfugen mit Lichtlippe, Kantenschatten, abgeschlagene Ecken
      for (const [y0, h, x0, x1, top, face] of [[bottom - 3, 4, 4, W - 4, BASALT[4], BASALT[2]], [bottom - 6, 3, 8, W - 8, BASALT[5], BASALT[3]]]) {
        p.rect(x0, y0 + 0.5, x1 - x0, 0.5, face); p.rect(x0, y0 + 1, x1 - x0, 0.5, tone(face, -0.25));
        p.rect(x0, y0, x1 - x0, 0.5, top);
        for (let x = x0 + 5 + (h & 1) * 3; x < x1 - 2; x += 7) { p.rect(x, y0 + 1, 0.5, h - 1, BASALT[1]); p.rect(x + 0.5, y0 + 1, 0.5, h - 1, tone(face, 0.12)); }
        p.dot(x0, y0, BASALT[1]); p.dot(x1 - 0.5, y0, BASALT[1]);
      }
      p.rect(4, bottom + 0.5, W - 8, 0.5, BASALT[1]);
    }
    // Pfeiler (links/rechts), leicht nach oben verjüngt, mit Runenkerben
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 7 : W - 15;
      for (let y = 8; y < bottom - 6; y++) {
        const taper = y < 16 ? 1 : 0;
        for (let x = x0 + taper; x < x0 + 8 - taper; x++) {
          const k = x - x0;
          let c = BASALT[k === 0 ? 4 : k === 1 ? 3 : k >= 6 ? 1 : 2];
          if (lo(p) && hash2(x, y, 9) < 0.06) c = BASALT[1];
          p.px(x, y, c);
        }
      }
      if (fine) {
        // Quader: Lagerfugen alle 6 Weltpixel (Feinlinie dunkel, darunter Lichtkante), Stoßfugen versetzt,
        // Kantenlicht links, Risse statt Sprenkel
        for (let y = 13, r = 0; y < bottom - 7; y += 6, r++) {
          const taper = y < 16 ? 1 : 0, xl = x0 + taper, xr = x0 + 8 - taper;
          p.rect(xl, y, xr - xl, 0.5, BASALT[0]); p.rect(xl + 0.5, y + 0.5, xr - xl - 1, 0.5, BASALT[3]);
          const sx = x0 + (r % 2 ? 5 : 3);
          if (y + 6 < bottom - 6) { p.rect(sx, y + 0.5, 0.5, 5.5, BASALT[0]); p.rect(sx + 0.5, y + 1, 0.5, 4.5, BASALT[3]); }
        }
        p.rect(x0 + 0.5, 16, 0.5, bottom - 23, BASALT[5]);
        p.rect(x0 + 7.5, 16, 0.5, bottom - 23, BASALT[0]);
        crack(p, x0 + 5.5, 44 + (side > 0 ? 3 : 0), 4, 11 + side, BASALT[0], BASALT[3]);
        crack(p, x0 + 2, 15, 2.5, 13 + side, BASALT[1], BASALT[3]);
      }
      // Runen: drei Kerben je Pfeiler, auf der Glow-Ebene glühend
      for (let i = 0; i < 3; i++) {
        const ry = 20 + i * 9, rx = x0 + 3;
        const shape = [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]];
        const shape2 = [[0, 0], [1, 0], [1, 1], [0, 2], [1, 3], [1, 4]];
        const sh = i % 2 ? shape2 : shape;
        for (const [dx, dy] of sh) { p.px(rx + dx, ry + dy, EMB[1]); G(rx + dx, ry + dy, EMB[3 + (dy % 2)]); }
        if (fine) {
          // Kerbe: dunkle Schattenkante oben links, heißer Kern als Feinlinie in der Mitte
          p.rect(rx - 0.5, ry - 0.5, 2.5, 0.5, BASALT[0]); p.rect(rx - 0.5, ry, 0.5, 5, BASALT[0]);
          for (const [dx, dy] of sh) { p.dot(rx + dx + 0.5, ry + dy + 0.5, EMB[3]); g.dot(rx + dx + 0.5, ry + dy, EMB[5]); g.dot(rx + dx + 0.5, ry + dy + 0.5, '#fff6d8'); }
        }
      }
      // Kapitell
      p.rect(x0 - 1, 6, 10, 3, BASALT[3]); p.rect(x0 - 1, 6, 10, 1, BASALT[5]);
      if (fine) {
        bevel(p, x0 - 1, 6, 10, 3, BASALT[5], BASALT[1], { left: false });
        p.rect(x0 - 1, 6.5, 10, 0.5, BASALT[4]); p.rect(x0 - 1, 8, 10, 0.5, BASALT[2]);
        for (let x = x0; x < x0 + 9; x += 2) p.dot(x + 0.5, 7.5, BASALT[1]);   // Zahnschnitt
        p.dot(x0 - 1, 6, '#7a6c80');
      }
    }
    // Sturz (Bogen) mit Glutkristall
    for (let x = 6; x < W - 6; x++) {
      const t = (x - cx) / (cx - 6);
      const y0 = Math.round(2 + t * t * 4);
      for (let y = y0; y < y0 + 5; y++) p.px(x, y, BASALT[y === y0 ? 5 : y === y0 + 4 ? 1 : 3]);
    }
    if (fine) {
      // Bogensteine: glatte Ober-/Unterkante im Feinraster, Fugen radial mit Lichtlippe
      p.each(6, 1, W - 6, 11, (x, y) => {
        const t = (x - cx) / (cx - 6), y0 = 2 + t * t * 4;
        const d = y - y0;
        if (d < 0 || d >= 5) return null;
        if (d < 0.5) return BASALT[5];
        if (d < 1) return BASALT[4];
        if (d >= 4.5) return BASALT[0];
        if (d >= 4) return BASALT[1];
        return null;
      });
      for (const vx of [9, 14, 19, 29, 34, 39]) {
        const t = (vx - cx) / (cx - 6), y0 = 2 + t * t * 4, sl = t * 1.6;
        for (let d = 1; d < 4.5; d += 0.5) { p.dot(vx + sl * d * 0.3, y0 + d, BASALT[1]); p.dot(vx + sl * d * 0.3 + 0.5, y0 + d, BASALT[4]); }
      }
    }
    // Kristall in der Mitte
    const kx = cx, ky = 3;
    for (let dy = -3; dy <= 4; dy++) {
      const w = 3 - Math.abs(dy - 0.5) * 0.7;
      for (let dx = -Math.floor(w); dx <= Math.floor(w); dx++) {
        const c = dx < 0 ? EMB[4] : dx === 0 ? EMB[5] : EMB[3];
        p.px(kx + dx, ky + dy, c); G(kx + dx, ky + dy, dx === 0 && dy < 2 ? '#fff4d0' : EMB[4]);
      }
    }
    if (fine) {
      // Kristall facettiert: Spitze oben/unten im Feinraster, Mittelgrat, heißer Kern auf der Leuchtebene
      fmap(p, kx - 3, ky - 3.5, [
        '.....55.....',
        '....4555....',
        '...445553...',
        '..44455533..',
        '.4444W55333.',
        '.444455W333.',
        '4444455W3333',
        '4444455W3332',
        '.444455W333.',
        '.44445553321',
        '..444555332.',
        '..44455532..',
        '...445532...',
        '....4553....',
        '.....52.....',
        '.....1......',
      ], { 5: EMB[5], 4: EMB[4], 3: EMB[3], 2: EMB[2], 1: EMB[1], W: '#ffffff' });
      fmap(g, kx - 3, ky - 3.5, [
        '.....55.....',
        '....4wW5....',
        '...44wW54...',
        '..444wW544..',
        '.4444wW5444.',
        '.4445wWW544.',
        '4444wWWW5444',
        '4444wWWW5444',
        '.4445wWW544.',
        '.4444wW5444.',
        '..444wW544..',
        '..4445W54...',
        '...44554....',
        '....455.....',
        '.....5......',
      ], { 5: EMB[5], 4: EMB[4], w: '#fff4d0', W: '#ffffff' });
    }
    // Innenraum: dunkle Tiefe, der Wirbel liegt auf der Glow-Ebene
    for (let y = 11; y < bottom - 6; y++) {
      for (let x = 15; x < W - 15; x++) {
        const t = Math.abs(x - cx) / 9;
        if (y < 14 && t > 0.7) continue;
        p.px(x, y, y > bottom - 12 ? '#2a1010' : '#120709');
      }
    }
    // Wirbel: Spirale in Glutfarben
    if (lo(p)) {
      for (let i = 0; i < 260; i++) {
        const a = i * 0.21, r = i * 0.055;
        const x = Math.round(cx + Math.cos(a) * r * 0.9), y = Math.round(30 + Math.sin(a) * r * 1.35);
        if (x < 15 || x >= W - 15 || y < 12 || y > bottom - 7) continue;
        const c = r < 3 ? '#fff4d0' : r < 7 ? EMB[5] : r < 11 ? EMB[4] : EMB[3];
        p.px(x, y, r < 7 ? EMB[4] : EMB[2]);
        G(x, y, c);
      }
    } else if (fine) {
      // Feinraster: Spirale als Funkenbahn (innen geschlossen, außen in Strichen), heißer weißer Kern;
      // darunter ein gestufter Glutschein (zwei harte Ellipsen) auf der Leuchtebene
      g.ellipse(cx, 30, 8, 13, EMB[0]); g.ellipse(cx, 30, 5.5, 8.5, EMB[1]); g.ellipse(cx, 30, 3, 4.5, EMB[2]);
      for (let i = 0; i < 560; i++) {
        const a = i * 0.105, r = i * 0.0275;
        if (r > 5 && i % 6 >= (r > 9.5 ? 3 : 4)) {
          // zweiter, dunklerer Arm in den Lücken
          const b = a + Math.PI, x2 = cx + 0.25 + Math.cos(b) * r * 0.9, y2 = 30 + Math.sin(b) * r * 1.35;
          if (i % 3 === 0 && x2 >= 15 && x2 < W - 15 && y2 >= 12 && y2 <= bottom - 7) { p.dot(x2, y2, EMB[2]); g.dot(x2, y2, r < 9 ? EMB[4] : EMB[3]); }
          continue;
        }
        const x = cx + 0.25 + Math.cos(a) * r * 0.9, y = 30 + Math.sin(a) * r * 1.35;
        if (x < 15 || x >= W - 15 || y < 12 || y > bottom - 7) continue;
        const c = r < 2.2 ? '#ffffff' : r < 3.6 ? '#fff4d0' : r < 7 ? EMB[5] : r < 10.5 ? EMB[4] : EMB[3];
        p.dot(x, y, r < 7 ? EMB[4] : EMB[2]);
        g.dot(x, y, c);
        if (r < 7) { p.dot(x + 0.5, y, r < 3 ? EMB[5] : EMB[3]); g.dot(x + 0.5, y, r < 3.6 ? '#fff4d0' : EMB[4]); }
      }
      // Glutboden: Stufe heller zur Mitte (keine Verläufe)
      for (let x = 15; x < W - 15; x += 0.5) if (Math.abs(x + 0.25 - cx) < 5.5) p.dot(x, bottom - 12, EMB[1]);
    }
    // Moosreste und Asche am Sockel
    if (lo(p)) { for (let x = 6; x < W - 6; x++) if (hash2(x, 0, 12) < 0.25) p.px(x, bottom - 4, '#2a3923'); }
    else if (fine) {
      for (const x of [6.5, 11, 17.5, 31, 36.5, 40]) tuft(p, x, bottom - 3.5, '#1e2a1f', '#2a3923', '#3d5232');
      for (const x of [9, 22, 27, 38]) { p.dot(x, bottom - 3.5, '#4a4048'); p.dot(x + 0.5, bottom - 3.5, '#2e2830'); }
    }
  });
  return { sprite, glow: gl.canvas, box: [-18, -6, 18, 1], light: { dx: 0, dy: -26, radius: 90, color: [255, 150, 70], intensity: 0.95 }, embers: { dx: 0, dy: -24, rate: 5 } };
}

function bankChest() {
  const W = 30, H = 24, cx = 15, bottom = H - 1;
  const gl = glowLayer(W, H), g = gl.g;
  const G = (x, y, c) => g.px(x, y, c);
  const sprite = buildFine(W, H, cx, bottom, (p) => {
    gl.pass(p);
    const x0 = 2, x1 = W - 3, lidY = 4, bodyY = 11;
    // Korpus: Bohlen
    for (let x = x0; x <= x1; x++) {
      const k = (x - x0) % 6;
      for (let y = bodyY; y <= bottom - 1; y++) p.px(x, y, WOOD[k === 0 ? 1 : y === bodyY ? 4 : 3]);
    }
    // Gewölbter Deckel
    for (let x = x0; x <= x1; x++) {
      const t = (x - cx) / (cx - x0);
      const top = Math.round(lidY + t * t * 2);
      for (let y = top; y < bodyY; y++) p.px(x, y, WOOD[y === top ? 5 : y === bodyY - 1 ? 1 : 3]);
    }
    if (p.fine) {
      // Bohlen: Maserung senkrecht, Fuge als Feinlinie mit Lichtkante, Deckel mit glatter Wölbung und Querbrettern
      for (let bx = x0; bx <= x1; bx += 6) {
        const w = Math.min(6, x1 + 1 - bx);
        p.rect(bx, bodyY + 1, 0.5, bottom - bodyY - 2, WOOD[0]); p.rect(bx + 0.5, bodyY + 1, 0.5, bottom - bodyY - 2, WOOD[2]);
        p.rect(bx + 1, bodyY + 1, 0.5, bottom - bodyY - 2, WOOD[4]);
        grain(p, bx + 1.5, bodyY + 1.5, w - 2, bottom - bodyY - 3, WOOD[2], WOOD[4], bx * 3 + 1);
      }
      p.each(x0, lidY - 1, x1 + 1, bodyY, (x, y) => {
        const t = (x - 0.25 - cx) / (cx - x0), top = lidY + t * t * 2;
        const d = y - top;
        if (d < -0.5) return null;
        if (d < 0) return WOOD[4];
        if (d < 0.5) return WOOD[5];
        if (y > bodyY - 1) return WOOD[1];
        if (y > bodyY - 1.5) return WOOD[2];
        return Math.abs(y - (lidY + 3.2)) < 0.26 ? WOOD[2] : Math.abs(y - (lidY + 3.7)) < 0.26 ? WOOD[4] : null;
      });
      grain(p, x0 + 1, lidY + 1, x1 - x0 - 1, 1.6, WOOD[2], null, 7, true);
      grain(p, x0 + 1, lidY + 4.2, x1 - x0 - 1, 1.8, WOOD[2], WOOD[4], 9, true);
    }
    // Eisenbänder und Beschläge
    for (const bx of [x0 + 3, x1 - 4]) {
      for (let y = lidY; y <= bottom - 1; y++) { p.px(bx, y, IRON[2]); p.px(bx + 1, y, IRON[1]); }
      for (let y = lidY + 2; y < bottom; y += 4) p.px(bx, y, IRON[4]);
      if (p.fine) {
        // Band 4-stufig mit Glanzlinie, Nieten als Nagelköpfe statt Klötzchen
        const t = (bx - cx) / (cx - x0), top = lidY + t * t * 2;
        p.rect(bx, top + 0.5, 0.5, bottom - 1 - top, IRON[3]); p.rect(bx + 0.5, top + 0.5, 0.5, bottom - 1 - top, IRON[4]);
        p.rect(bx + 1, top + 0.5, 0.5, bottom - 1 - top, IRON[2]); p.rect(bx + 1.5, top + 0.5, 0.5, bottom - 1 - top, IRON[0]);
        p.dot(bx + 0.5, top + 0.5, IRON[5]);
        for (let y = lidY + 2; y < bottom; y += 4) { p.rect(bx, y, 1.5, 1, IRON[2]); nail(p, bx + 0.5, y, IRON); }
      }
    }
    p.rect(x0, bodyY, x1 - x0 + 1, 1, IRON[2]);
    p.rect(x0, bottom - 1, x1 - x0 + 1, 1, IRON[1]);
    if (p.fine) {
      p.rect(x0, bodyY, x1 - x0 + 1, 0.5, IRON[4]); p.rect(x0 + 1, bodyY, 6, 0.5, IRON[5]);
      p.rect(x0, bottom - 1, x1 - x0 + 1, 0.5, IRON[2]);
      for (let x = x0 + 1.5; x < x1; x += 4) { p.dot(x, bodyY + 0.5, IRON[1]); p.dot(x, bottom - 0.5, IRON[0]); }
    }
    // Goldkanten
    p.px(x0, bodyY, GOLD[3]); p.px(x1, bodyY, GOLD[3]); p.px(x0, bottom - 1, GOLD[2]); p.px(x1, bottom - 1, GOLD[2]);
    if (p.fine) {
      for (const xx of [x0, x1]) { fmap(p, xx, bodyY - 0.5, ['43', '32', '21'], { 4: GOLD[4], 3: GOLD[3], 2: GOLD[2], 1: GOLD[1] }); fmap(p, xx, bottom - 1.5, ['32', '21', '10'], { 3: GOLD[3], 2: GOLD[2], 1: GOLD[1], 0: GOLD[0] }); }
    }
    // Schloss mit Wappen
    p.rect(cx - 3, bodyY - 2, 6, 7, GOLD[2]); p.rect(cx - 3, bodyY - 2, 6, 1, GOLD[4]); p.rect(cx - 2, bodyY - 1, 4, 5, GOLD[3]);
    p.px(cx, bodyY + 1, WOOD[0]); p.px(cx, bodyY + 2, WOOD[0]);
    G(cx - 2, bodyY - 2, '#fff0b0'); G(cx - 1, bodyY - 2, GOLD[4]);
    if (p.fine) {
      // Schlossblech: 5 Stufen, Glanzlinie oben links, Schlüsselloch, Nieten in den Ecken
      fmap(p, cx - 3, bodyY - 2, [
        '.444444444..',
        '44WW4444443.',
        '4433333333321',
        '43332222233210',
        '4332223322210',
        '43322k2222210',
        '4332kkk222210',
        '4332kkk222210',
        '43322k2222210',
        '4332222222210',
        '43322222222210',
        '4n32222222n10',
        '.3222222222100',
        '..1111111111.',
      ].map((r) => r.slice(0, 12)), { W: '#ffffff', 4: GOLD[4], 3: GOLD[3], 2: GOLD[2], 1: GOLD[1], 0: GOLD[0], k: '#120a06', n: GOLD[4] });
      g.dot(cx - 2.5, bodyY - 1.5, '#ffffff'); g.dot(cx - 2, bodyY - 1.5, '#fff0b0');
    }
    // Füße
    p.rect(x0, bottom, 3, 1, IRON[1]); p.rect(x1 - 2, bottom, 3, 1, IRON[1]);
    if (p.fine) { p.rect(x0, bottom, 3, 0.5, IRON[3]); p.rect(x1 - 2, bottom, 3, 0.5, IRON[2]); }
  });
  return { sprite, glow: gl.canvas, box: [-13, -6, 13, 1] };
}

// Standspiegel mit geschnitztem Holzrahmen (Aussehen ändern, Panel von A)
function mirror() {
  const W = 20, H = 34, cx = 10, bottom = H - 1;
  const gl = glowLayer(W, H), g = gl.g;
  const G = (x, y, c) => g.px(x, y, c);
  const sprite = buildFine(W, H, cx, bottom, (p) => {
    gl.pass(p);
    // Füße und Ständer
    p.rect(3, bottom, 5, 1, WOOD[2]); p.rect(12, bottom, 5, 1, WOOD[2]);
    p.rect(5, bottom - 5, 2, 5, WOOD[3]); p.rect(13, bottom - 5, 2, 5, WOOD[3]);
    p.rect(5, bottom - 5, 1, 5, WOOD[5]);
    if (p.fine) {
      p.rect(3, bottom, 5, 0.5, WOOD[4]); p.rect(12, bottom, 5, 0.5, WOOD[3]); p.dot(3, bottom + 0.5, WOOD[3]);
      p.rect(5.5, bottom - 5, 0.5, 5, WOOD[4]); p.rect(6.5, bottom - 5, 0.5, 5, WOOD[1]);
      p.rect(13, bottom - 5, 0.5, 5, WOOD[4]); p.rect(14.5, bottom - 5, 0.5, 5, WOOD[1]);
      nail(p, 5.5, bottom - 0.5, PAL.gold); nail(p, 13.5, bottom - 0.5, PAL.gold);
    }
    // Ovaler Rahmen
    const ey = 13, rx = 8, ry = 12;
    if (lo(p)) {
      for (let y = ey - ry; y <= ey + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
          const dx = (x - cx + 0.5) / rx, dy = (y - ey + 0.5) / ry;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          if (d > 0.62) p.px(x, y, d > 0.86 ? WOOD[2] : dy < -0.2 || dx < -0.3 ? WOOD[5] : WOOD[4]);
          else {
            // Spiegelglas: kühler Verlauf mit Spiegelung
            const k = (y - (ey - ry)) / (2 * ry);
            p.px(x, y, k < 0.35 ? '#8aa0bc' : k < 0.7 ? '#5e7290' : '#3e4c66');
          }
        }
      }
    } else if (p.fine) {
      // Rahmen fein: gedrechselter Wulst (Licht oben links, Kehle dunkel), Perlstab, Glas mit gestuftem Himmel
      p.each(cx - rx, ey - ry, cx + rx + 1, ey + ry + 1, (x, y) => {
        const dx = (x - cx - 0.5) / rx, dy = (y - ey - 0.5) / ry, d = dx * dx + dy * dy;
        if (d > 1.04) return null;
        const l = -dx - dy * 0.8;
        if (d > 0.9) return l > 0.3 ? WOOD[3] : WOOD[1];
        if (d > 0.76) return l > 0.1 ? WOOD[5] : l > -0.5 ? WOOD[4] : WOOD[3];
        if (d > 0.69) return l > 0.2 ? WOOD[2] : WOOD[1];
        if (d > 0.62) return l < -0.2 ? WOOD[4] : WOOD[3];
        const k = (y - (ey - ry)) / (2 * ry);
        if (d > 0.56 && l > 0) return '#2a3448';   // Glasfalz (Schatten unter dem Rahmen)
        return k < 0.33 ? '#8aa0bc' : k < 0.36 ? '#7a90ac' : k < 0.66 ? '#5e7290' : k < 0.69 ? '#4e607c' : '#3e4c66';
      });
      // Perlstab auf dem Wulst
      for (let a = 0; a < 26; a++) {
        const t = (a / 26) * Math.PI * 2, x = cx + 0.5 + Math.cos(t) * rx * 0.91, y = ey + 0.5 + Math.sin(t) * ry * 0.91;
        p.dot(x, y, Math.cos(t) + Math.sin(t) < 0 ? '#9a7048' : WOOD[2]);
      }
    }
    // Glanzstreifen
    if (lo(p)) {
      for (let i = 0; i < 7; i++) { p.px(cx - 4 + i, ey - 6 + i, '#dfe7f2'); G(cx - 4 + i, ey - 6 + i, 'rgba(220,235,255,0.5)'); }
      p.px(cx + 3, ey - 5, '#ffffff'); G(cx + 3, ey - 5, '#ffffff');
    } else if (p.fine) {
      // zwei schräge Spiegelungen (1 Feinpixel), Glanzpunkt mit Kreuz
      p.fline(cx - 4, ey - 6, cx + 2.5, ey + 0.5, '#dfe7f2'); p.fline(cx - 4, ey - 5, cx + 1.5, ey + 0.5, '#b8c6da');
      p.fline(cx - 2, ey - 8, cx + 4, ey - 2, '#a6b8d0');
      p.fline(cx - 5, ey + 1, cx - 1, ey + 5, '#6e84a2');
      g.fline(cx - 4, ey - 6, cx + 2.5, ey + 0.5, '#6e7884');
      p.dot(cx + 3, ey - 5, '#ffffff'); p.dot(cx + 2.5, ey - 5, '#dfe7f2'); p.dot(cx + 3.5, ey - 5, '#dfe7f2'); p.dot(cx + 3, ey - 5.5, '#dfe7f2'); p.dot(cx + 3, ey - 4.5, '#dfe7f2');
      g.dot(cx + 3, ey - 5, '#ffffff'); g.dot(cx + 2.5, ey - 5, '#8090a0'); g.dot(cx + 3.5, ey - 5, '#8090a0');
    }
    // Schnitzkrone oben
    p.rect(cx - 2, 0, 5, 2, WOOD[4]); p.px(cx, 0, GOLD[3]); G(cx, 0, GOLD[4]);
    if (p.fine) {
      fmap(p, cx - 2.5, -0.5 + 0.5, ['.455554.', '45532553', '3421.243', '.21..12.'], { 5: WOOD[5], 4: WOOD[4], 3: WOOD[3], 2: WOOD[2], 1: WOOD[1] });
      fmap(p, cx, 0, ['43', '21'], { 4: '#ffffff', 3: GOLD[4], 2: GOLD[3], 1: GOLD[1] });
      g.dot(cx, 0, '#fff6d0');
    }
  });
  return { sprite, glow: gl.canvas, box: [-7, -4, 7, 1] };
}

// ====================================================================== Glutsenke (Runde 5)
// Deko-Satz der neuen Glutsenke: Wald, Dorf, Mühle, Brücken, Felder, Friedhof,
// Höhle. Format wie decor_ashwood (mk: { sprite, glow, box, light, … }).
// Licht von links oben (Mond), warme Akzente nur an Laternen/Fenstern/Feuer.
const GR = OUT.grass, DIRT = OUT.dirt, PINE = OUT.pine, BARK = OUT.bark, SLATE = OUT.slate, WTR = OUT.water;
const STN = PAL.stone, MOSS = PAL.moss, BONE = PAL.bone;
const STRAW = ['#2a2210', '#3e3318', '#55461f', '#6e5c28', '#8a7434', '#a88e44'];
const LEAF = ['#0a120d', '#101c14', '#16261a', '#1e3221', '#28402a', '#355235'];
const CABB = ['#0f1a18', '#16282a', '#203a38', '#2e4e48', '#42665a'];
const PLAST = ['#2b2630', '#3a3440', '#4a4350', '#5c5462', '#6e6674'];
const AWN = [['#3a0c14', '#5e1420', '#8a2030'], ['#2a2a12', '#46461e', '#6a6a2c'], ['#0e2230', '#163448', '#22506a']];
// Kachelgenaue Teile ohne Umriss und ohne Feinschliff (der zöge an jeder Kachelkante Licht-/Schattenlinien)
const flat = (W, H, ax, ay, draw) => ({ sprite: buildFine(W, H, ax, ay, (p) => { fixEllipse(p); draw(p); }, { outline: false, finish: false }) });
const wrap = (sprite, extra = {}) => ({ sprite, ...extra });
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

// Weicher Bodenschatten / Grasfuß unter Objekten
function footShadow(p, cx, cy, rx, ry, seed) {
  if (p.fine) {
    // fein: geschlossene Ellipse in zwei harten Stufen, am Rand ein paar Halme statt Sprenkel
    p.each(cx - rx - 0.5, cy - ry - 0.5, cx + rx + 1.5, cy + ry + 1.5, (x, y) => {
      const nx = (x - cx - 0.5) / (rx + 0.4), ny = (y - cy - 0.5) / (ry + 0.4), d = nx * nx + ny * ny;
      return d > 1 ? null : d < 0.4 ? '#0a0f0c' : GR[0];
    });
    for (let k = 0; k < Math.max(2, rx / 3); k++) {
      const s = k % 2 ? 1 : -1, x = cx + s * (rx * (0.55 + 0.35 * hash2(k, seed, 3))), y = cy + ry * 0.35;
      p.dot(x, y, GR[2]); p.dot(x + 0.5 * s, y - 0.5, GR[3]); p.dot(x, y - 0.5, GR[1]);
    }
    return;
  }
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1 || (d > 0.55 && hash2(cx + x, cy + y, seed) < 0.5)) continue;
    p.px(cx + x, cy + y, d < 0.4 ? '#0a0f0c' : GR[0]);
  }
}

// Rinde fein: Längsrisse (dunkel) mit Lichtgrat links, Kante im Licht
function barkFine(p, x, y, w, h, B, seed) {
  p.rect(x, y, 0.5, h, B[3]);
  p.rect(x + w - 0.5, y, 0.5, h, B[0]);
  for (let k = 0; k < Math.max(1, Math.floor(w * 0.8)); k++) {
    const fx = x + 1 + Math.floor(hash2(k, seed, 5) * (w - 1.5) * 2) / 2;
    const y0 = y + hash2(k, seed, 6) * h * 0.4, len = h * (0.35 + hash2(k, seed, 7) * 0.5);
    for (let yy = y0; yy < Math.min(y + h, y0 + len); yy += 0.5) {
      const o = Math.round(Math.sin(yy * 0.9 + k) * 0.6) * 0.5;
      p.dot(fx + o, yy, B[0]); if (fx + o - 0.5 > x + 0.4) p.dot(fx + o - 0.5, yy, B[2]);
    }
  }
}

// ------------------------------------------------------------ Bäume
// Tanne mit gezackten Etagen, Mondkante links, dunkler Innenseite
function fir(seed, H = 52, W = 34) {
  const cx = Math.floor(W / 2), bottom = H - 1, top = 2;
  return mk(W, H, (p) => {
    const rng = createRng(seed);
    footShadow(p, cx, bottom - 1, 10, 2, seed);
    p.rect(cx - 2, bottom - 9, 4, 9, BARK[1]); p.rect(cx - 2, bottom - 9, 1, 9, BARK[3]); p.rect(cx + 1, bottom - 9, 1, 9, BARK[0]);
    p.px(cx - 3, bottom, BARK[2]); p.px(cx + 2, bottom, BARK[0]);
    if (p.fine) { barkFine(p, cx - 2, bottom - 9, 4, 9, BARK, seed); p.dot(cx - 3, bottom, BARK[3]); }
    const tiers = 6, tierInfo = [];
    for (let t = 0; t < tiers; t++) {
      const k0 = t / tiers;
      const baseY = Math.round(bottom - 8 - (bottom - 8 - top) * k0);
      const half = (W / 2 - 2) * (1 - k0 * 0.78);
      const th = Math.round((bottom - top) / tiers) + 4;
      const hws = [];
      for (let dy = 0; dy < th; dy++) {
        const y = baseY - dy, k = dy / th;
        const hw = Math.max(0.5, half * (1 - k) ** 0.9 + rng.range(-1, 1));
        hws.push(hw);
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          const rel = (x - cx) / Math.max(1, hw);
          let i = 2;
          if (rel < -0.45) i = 4; else if (rel < -0.1) i = 3; else if (rel > 0.55) i = 1;
          if (dy < 2) i -= 1;
          if (lo(p) && hash2(x, y, seed) < 0.13) i += hash2(x, y, seed + 1) < 0.5 ? 1 : -1;
          p.px(x, y, PINE[clampI(i, 6)]);
        }
        // gezackte Zweigspitzen an der Unterkante
        if (dy === 0) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) if (hash2(x, t, seed + 2) < 0.45) p.px(x, y + 1, PINE[x < cx ? 2 : 1]);
      }
      tierInfo.push([baseY, half, th, hws]);
      // Mondlicht auf den linken Zweigspitzen
      for (let dy = 1; dy < th - 2; dy += 2) {
        const y = baseY - dy, hw = half * (1 - dy / th);
        p.px(Math.round(cx - hw) + 1, y, PINE[5]);
      }
    }
    p.px(cx, top - 1, PINE[4]); p.px(cx, top, PINE[3]);
    if (p.fine) {
      // Nadelbüschel: kurze Feinstriche schräg nach außen unten, links im Mondlicht, rechts im Schatten;
      // Unterkante jeder Etage mit dunkler Schattenfuge und hängenden Spitzen
      for (let t = 0; t < tiers; t++) {
        const [baseY, , th, hws] = tierInfo[t];
        for (let dy = 1.5, r = 0; dy < th - 1.5; dy += 1.5, r++) {
          const hw = hws[Math.floor(dy)] - 0.6;
          if (hw < 1.2) continue;
          const y = baseY - dy;
          for (let u = (r % 2) * 0.75 + 0.6; u < hw; u += 1.5) {
            const jit = (hash2(r, Math.round(u * 2), seed + t) - 0.5) * 0.5;
            for (const s of [-1, 1]) {
              const x = cx + 0.5 + s * (u + jit), rel = (u + jit) / hw;
              const c = s < 0 ? (rel > 0.5 ? PINE[5] : PINE[4]) : (rel > 0.6 ? PINE[0] : PINE[1]);
              const c2 = s < 0 ? PINE[3] : PINE[2];
              p.dot(x, y, c); p.dot(x + s * 0.5, y + 0.5, c2); if (s < 0 && rel > 0.45) p.dot(x - 0.5, y + 1, PINE[4]);
            }
          }
        }
        // Schattenfuge über der nächsten Etage
        const hw0 = hws[0];
        for (let x = cx - hw0 + 1; x < cx + hw0; x += 0.5) {
          if (hash2(Math.round(x * 2), t, seed + 2) < 0.5) p.dot(x, baseY + 0.5, x < cx ? PINE[2] : PINE[0]);
        }
      }
      p.dot(cx, top - 1, PINE[5]); p.dot(cx + 0.5, top - 0.5, PINE[3]);
    }
  }, { ax: cx, box: [-3, -3, 3, 1], extra: { shadow: 18 } });
}

// Laubbaum (Eiche/Linde): Wolkenkrone aus Ballen mit Lichtseite oben links
function oak(seed) {
  const W = 40, H = 46, cx = 20, bottom = H - 1;
  return mk(W, H, (p) => {
    const rng = createRng(seed);
    footShadow(p, cx, bottom - 1, 13, 3, seed);
    // Stamm mit Wurzelansatz und Astgabel
    for (let y = bottom - 16; y <= bottom; y++) {
      const hw = 2 + (y > bottom - 3 ? (y - bottom + 3) : 0);
      for (let x = cx - hw; x <= cx + hw; x++) p.px(x, y, BARK[x === cx - hw ? 3 : x === cx + hw ? 0 : (lo(p) && (x + y) % 4 === 0) ? 1 : 2]);
    }
    if (p.fine) {
      barkFine(p, cx - 2, bottom - 16, 5, 14, BARK, seed);
      // Wurzelanläufe
      p.fline(cx - 2.5, bottom - 2, cx - 4.5, bottom + 0.5, BARK[3]); p.fline(cx + 2.5, bottom - 2, cx + 4.5, bottom + 0.5, BARK[0]);
      p.dot(cx - 1, bottom - 6, BARK[0]); p.dot(cx - 0.5, bottom - 6.5, BARK[0]); p.dot(cx - 1, bottom - 5.5, BARK[3]);   // Astloch
    }
    p.line(cx - 1, bottom - 15, cx - 7, bottom - 22, BARK[2]); p.line(cx + 1, bottom - 15, cx + 6, bottom - 23, BARK[1]);
    if (p.fine) { p.fline(cx - 1.5, bottom - 15.5, cx - 7.5, bottom - 22.5, BARK[3]); p.fline(cx + 1.5, bottom - 14.5, cx + 6.5, bottom - 22.5, BARK[0]); }
    // Kronenballen (hinten dunkel, vorne hell)
    const balls = [];
    for (let i = 0; i < 9; i++) balls.push([cx + rng.range(-12, 12), rng.range(8, 24), rng.range(6, 9)]);
    balls.push([cx - 6, 12, 8], [cx + 6, 13, 8], [cx, 7, 8]);
    balls.sort((a, b) => a[1] - b[1]);
    if (p.fine) {
      // Krone im Feinraster: vier klar abgesetzte Laubbüschel (hinten dunkler), Licht oben links, dunkle Unterseite
      const j = (k) => (hash2(k, 7, seed) - 0.5) * 2;
      leafClump(p, cx - 8 + j(1), 17, 8, 6.5, 1, seed + 1);
      leafClump(p, cx + 8 + j(2), 16, 8, 6.5, 1, seed + 2);
      leafClump(p, cx + 1 + j(3), 10, 9, 7, 0, seed + 3);
      leafClump(p, cx - 3 + j(4), 22, 10, 6, 0, seed + 4);
      leafClump(p, cx + 8 + j(5), 23, 6.5, 5, 0, seed + 5);
    }
    for (const [bx, by, r] of balls) {
      if (p.fine) continue;
      if (coarseSkip(p)) continue;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = (x * x + y * y) / (r * r);
        if (d > 1 || (d > 0.8 && hash2(Math.round(bx + x), Math.round(by + y), seed) < 0.4)) continue;
        const l = (-x - y) / r; // Licht von oben links
        let i = 2 + (l > 0.55 ? 2 : l > 0.1 ? 1 : l < -0.6 ? -1 : 0);
        if (hash2(Math.round(bx + x), Math.round(by + y), seed + 1) < 0.15) i -= 1;
        p.px(bx + x, by + y, LEAF[clampI(i, 6)]);
      }
      // Blattkanten-Glanz
      for (let k = 0; k < 4; k++) p.px(Math.round(bx - r * 0.5 + k), Math.round(by - r * 0.7 + (k % 2)), LEAF[5]);
    }
    // Schatten unten in der Krone
    if (lo(p)) for (let x = 4; x < W - 4; x++) for (let y = 26; y < 31; y++) if (hash2(x, y, seed + 3) < 0.25) p.px(x, y, LEAF[0]);
  }, { ax: cx, box: [-3, -3, 3, 1], extra: { shadow: 22 }, finish: false });
}

// Laubbüschel im Feinraster: Rand in wenigen runden Buckeln, harte Lichtstufen von oben links, unten ein dunkles
// Schattenband; dazu drei Unterbüschel als helle Kappe oben links + dunkle Sichel unten rechts (Form statt Rauschen).
function leafClump(p, bx, by, rx, ry, dark, seed) {
  const ph = hash2(seed, 1, 77) * 6.28;
  const sub = [[-0.42, -0.2, 0.42], [0.35, -0.38, 0.4], [0.05, 0.3, 0.45]].map(([u, v, r]) => [u + (hash2(seed, u * 9, 3) - 0.5) * 0.15, v, r]);
  p.each(bx - rx - 1, by - ry - 1, bx + rx + 1, by + ry + 1, (x, y) => {
    const u = (x - bx) / rx, v = (y - by) / ry, d = u * u + v * v;
    const f = 1 + 0.07 * Math.sin(Math.atan2(v, u) * 6 + ph);
    if (d > f * f) return null;
    const z = Math.sqrt(Math.max(0, 1 - d));
    const l = -u * 0.55 - v * 0.75 + z * 0.45;
    let i = l > 0.62 ? 4 : l > 0.22 ? 3 : l > -0.2 ? 2 : l > -0.55 ? 1 : 0;
    for (const [su, sv, sr] of sub) {
      const du = (u - su) / sr, dv = (v - sv) / sr, dd = du * du + dv * dv;
      if (dd > 1) continue;
      if (dd > 0.62 && du + dv > 0.55) i = Math.max(0, i - 1);           // Sichel unten rechts
      else if (dd < 0.45 && du + dv < -0.45 && i >= 2) i = Math.min(5, i + 1);   // Kappe oben links
    }
    if (v > 0.55 && d > 0.55) i = Math.min(i, 1);
    return LEAF[clampI(i - dark, 6)];
  });
}

// Laubballen im Feinraster: gewellter Rand, Blattbüschel als kleine Schuppen (Licht oben links an jedem Büschel,
// Schattenrand unten rechts), Unterseite der Krone dunkler – Struktur statt Sprenkel.
function leafBall(p, bx, by, r, seed) {
  const ph = hash2(Math.round(bx), Math.round(by), seed) * 6.28;
  const cw = 2.6, ch = 2;
  p.each(bx - r - 1, by - r - 1, bx + r + 1.5, by + r + 1.5, (x, y) => {
    const dx = x - bx - 0.5, dy = y - by - 0.5, dist = Math.hypot(dx, dy);
    const rr = r * (0.94 + 0.07 * Math.sin(Math.atan2(dy, dx) * 7 + ph));
    if (dist > rr) return null;
    const l = (-dx - dy) / r;
    let i = 2 + (l > 0.55 ? 2 : l > 0.1 ? 1 : l < -0.6 ? -1 : 0);
    if (y > 25.5) i -= 1;
    // Büschel-Schuppen
    const row = Math.floor(y / ch), xo = (row & 1) * cw * 0.5 + hash2(row, 3, seed) * 0.6;
    const col = Math.floor((x + xo) / cw);
    const ux = ((x + xo) - col * cw) / cw - 0.5, uy = (y - row * ch) / ch - 0.5;
    if (ux + uy > 0.42) i -= 1;
    else if (ux + uy < -0.55 && l > -0.3) i += 1;
    if (dist > rr - 0.6 && l < 0) i -= 1;
    return LEAF[clampI(i, 6)];
  });
  // Glanzbogen oben links
  for (let a = 3.5; a < 4.6; a += 0.2) p.dot(bx + 0.5 + Math.cos(a) * r * 0.62, by + 0.5 + Math.sin(a) * r * 0.62, LEAF[5]);
}

// Waldmasse: zwei bis drei Bäume hintereinander, hintere dunkler (fester Waldrand, ohne Box)
function forestClump(seed) {
  const rng = createRng(seed);
  const W = 50, H = 66, cx = 25, bottom = H - 1;
  const parts = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const back = i === 0;
    const useOak = !back && rng.chance(0.22);
    const s = useOak ? oak(seed * 7 + i).sprite : fir(seed * 13 + i, back ? 56 : rng.int(44, 54), back ? 34 : 32).sprite;
    parts.push({ s, x: back ? cx + rng.int(-6, 6) : cx + (i === 1 ? -10 : 9) + rng.int(-2, 2), y: back ? bottom - 9 : bottom - (i === 1 ? 1 : 4), back });
  }
  // Fertige (feine) Baum-Frames direkt auf eine FineCanvas setzen: keine Rückrechnung auf Weltpixel, kein zweiter
  // Feinschliff (die Bäume haben ihn schon). Bei fineRes() 1 wie früher.
  const sprite = buildFrame(W, H, cx, bottom - 2, (p) => {
    for (const q of parts) {
      if (q.back) { p.ctx.filter = 'brightness(0.62)'; }
      blitFrame(p.ctx, q.s, q.x, q.y);
      p.ctx.filter = 'none';
    }
    // Unterholz-Saum am Fuß (dunkel, damit der Waldrand geschlossen wirkt)
    for (let x = 4; x < W - 4; x++) {
      const h = 2 + Math.round(hash2(x, 1, seed) * 4);
      if (p.fine) {
        // Farnwedel: Spitzen als Feinpixel, darunter zwei Lagen, keine Sprenkel
        for (let y = bottom - h; y <= bottom - 1; y++) p.px(x, y, y < bottom - h + 1 ? PINE[2] : y < bottom - h + 2.5 ? PINE[1] : PINE[0]);
        p.dot(x + (x % 2) * 0.5, bottom - h - 0.5, x % 3 ? PINE[2] : PINE[3]);
        if (x % 2 === 0) p.dot(x + 0.5, bottom - h + 0.5, PINE[3]);
        if (x % 3 === 1) p.dot(x, bottom - h + 1.5, PINE[2]);
      } else for (let y = bottom - h; y <= bottom - 1; y++) p.px(x, y, y < bottom - h + 1 ? PINE[2] : hash2(x, y, seed + 4) < 0.5 ? PINE[1] : PINE[0]);
    }
  }, { outline: false, fine: true, finish: false });
  return { sprite };
}

// ------------------------------------------------------------ Kleinkram Natur
function flowers(v) {
  const C = [['#6a5aa0', '#9a8ad0'], ['#9a4a6a', '#d07a9a'], ['#b8a050', '#e8d080']][v];
  const eye = ['#e8d080', '#f0d890', '#7a4a1a'][v];
  return mk(14, 8, (p) => {
    const rng = createRng(500 + v);
    for (let i = 0; i < 7; i++) {
      const x = rng.int(1, 12), y = rng.int(2, 7);
      const bloom = rng.chance(0.75);
      if (p.fine) {
        // Stängel als Feinlinie mit Blatt, Blüte aus fünf Blättern mit Auge
        p.dot(x + 0.5, y - 1, GR[3]); p.dot(x + 0.5, y - 0.5, GR[3]); p.dot(x + 0.5, y, GR[4]); p.dot(x + 0.5, y + 0.5, GR[3]);
        if (i % 2) { p.dot(x + 1, y, GR[4]); p.dot(x + 1.5, y - 0.5, GR[5]); } else { p.dot(x, y + 0.5, GR[4]); p.dot(x - 0.5, y, GR[5]); }
        if (bloom) fmap(p, x - 0.5, y - 3, ['.11.', '1c00', '.00.'], { 1: C[1], 0: C[0], c: eye });
        else { p.dot(x + 0.5, y - 1.5, GR[4]); p.dot(x + 0.5, y - 2, C[0]); }
      } else {
        p.px(x, y, GR[4]); p.px(x, y - 1, GR[3]);
        if (bloom) { p.px(x, y - 2, C[0]); p.px(x - 1, y - 2, C[0]); p.px(x + 1, y - 2, C[0]); p.px(x, y - 3, C[1]); }
      }
    }
  }, { ax: 7 });
}

function reedsV(v) {
  const R = ['#16200f', '#22301a', '#2e4222', '#3e5628', '#566e34'];
  return mk(16, 22, (p) => {
    const rng = createRng(540 + v);
    const bottom = 21;
    for (let i = 0; i < 6 + v; i++) {
      const x = 2 + rng.int(0, 11), h = rng.int(8, 18), bend = rng.range(-3, 3);
      const head = rng.chance(0.45);
      if (p.fine) {
        // Halm im Feinraster: unten zwei Feinpixel (Lichtseite links), oben einer, glatte Biegung
        let lx = x, ly = bottom;
        for (let k = 0.5; k <= h; k += 0.5) {
          const t = k / h;
          lx = Math.round((x + 0.25 + bend * t * t) * 2) / 2; ly = bottom - k + 0.5;
          p.dot(lx, ly, R[t > 0.6 ? 4 : t > 0.3 ? 3 : 2]);
          if (t < 0.55) p.dot(lx + 0.5, ly, R[1]);
        }
        if (head) {
          // Rohrkolben: Kolben mit Lichtkante und Spitze
          const hx = Math.round((x + bend) * 2) / 2, hy = bottom - h;
          fmap(p, hx - 0.5, hy + 0.5, ['.d.', 'cba', 'cba', 'cba', 'cba', 'cbb', '.a.'], { d: R[3], c: '#7a4a2c', b: '#5a3622', a: '#3a2216' });
        }
      } else {
        let lx = x, ly = bottom;
        for (let k = 1; k <= h; k++) { const t = k / h; lx = Math.round(x + bend * t * t); ly = bottom - k; p.px(lx, ly, R[t > 0.6 ? 3 : t > 0.3 ? 2 : 1]); }
        if (head) { p.rect(lx, ly + 1, 2, 3, '#3a2216'); p.px(lx, ly + 1, '#5a3622'); }
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = 3 + rng.int(0, 9);
      if (p.fine) {
        // Blatt: schmale Klinge (Mittelrippe hell, Rand dunkel), läuft spitz aus
        const x1 = x + (i % 2 ? 4 : -3), y1 = bottom - 6;
        p.line(x, bottom, x1, y1, R[i % 2 ? 2 : 3]);
        p.fline(x, bottom - 0.5, x1, y1, R[i % 2 ? 3 : 4]); p.dot(x1 + 0.5, y1 - 0.5, R[4]);
      } else p.line(x, bottom, x + (i % 2 ? 4 : -3), bottom - 6, R[i % 2 ? 2 : 4]);
    }
    p.rect(1, bottom, 14, 1, WTR[2]); p.px(4, bottom, WTR[4]);
    if (p.fine) { p.rect(1, bottom, 14, 0.5, WTR[3]); p.rect(3.5, bottom, 2, 0.5, WTR[4]); p.dot(9, bottom, WTR[4]); p.dot(12.5, bottom + 0.5, WTR[3]); }
  }, { ax: 8 });
}

const MUSH = ['#1a3a3a', '#2a5a5a', '#3a7a72', '#4a9a8a', '#6ac4b0'];
function mushrooms(v) {
  return mk(10, 8, (p, g) => {
    const caps = [[2, 5], [6, 4], [8, 6]].slice(0, 2 + (v % 2));
    for (const [x, y] of caps) {
      if (p.fine) {
        // Kappe gewölbt mit Glanz und Tupfen, Lamellenschatten, Stiel mit Lichtseite; Leuchten mit hellem Kern
        fmap(p, x - 1, y - 1, [
          '..43..',
          '.4w32.',
          '432221',
          '.0000.',
          '..ab..',
          '..ab..',
          '..aa..',
        ], { w: '#a0ffe0', 4: MUSH[4], 3: MUSH[3], 2: MUSH[2], 1: MUSH[1], 0: MUSH[0], a: BONE[2], b: BONE[1] });
        p.dot(x + 1, y - 0.5, '#8ad8c4');
        fmap(g, x - 1, y - 1, ['..54..', '.5W54.', '445543', '.3333.'], { W: '#d8fff4', 5: '#8ae8d0', 4: '#40c0a0', 3: '#207a66' });
      } else {
        p.px(x, y + 1, BONE[2]); p.px(x, y + 2, BONE[1]);
        p.rect(x - 1, y, 3, 1, '#2a5a5a'); p.px(x, y - 1, '#4a9a8a');
        g.rect(x - 1, y, 3, 1, '#3ac0a0'); g.px(x, y - 1, '#a0ffe0');
      }
    }
  }, { ax: 5, light: v === 0 ? { dx: 0, dy: -4, radius: 26, color: [90, 230, 190], intensity: 0.45 } : undefined });
}

function boulder(seed) {
  const R = OUT.rock;
  const w = 20, h = 14;
  return mk(w + 4, h + 3, (p) => {
    const rng = createRng(seed);
    const cx = (w + 3) / 2, cy = h / 2 + 2;
    p.ellipse(cx, cy, w / 2, h / 2, R[2]);
    p.ellipse(cx - 1, cy - 1, w / 2 - 2, h / 2 - 2, R[3]);
    p.ellipse(cx - 3, cy - 2.5, w / 4, h / 4, R[4]);
    p.line(cx + 2, cy - h / 2 + 2, cx + 4, cy + 2, R[1]);
    p.rect(cx - w / 2 + 2, h + 1, w - 3, 1, R[1]);
    if (p.fine) {
      // Kantenlicht auf der oberen Facette, Riss mit Lichtlippe, abgeplatzte Schuppe, Fuß dunkel
      for (let a = 3.3; a < 5.1; a += 0.08) p.dot(cx - 3 + 0.5 + Math.cos(a) * (w / 4 + 0.2), cy - 2.5 + 0.5 + Math.sin(a) * (h / 4 + 0.2), R[5]);
      for (let a = 3.6; a < 4.6; a += 0.06) p.dot(cx + 0.5 + Math.cos(a) * (w / 2 - 0.2), cy + 0.5 + Math.sin(a) * (h / 2 - 0.2), R[3]);
      crack(p, cx + 4.5, cy - 0.5, 3, seed, R[1], R[4]);
      p.fline(cx - 5, cy + 2.5, cx - 2, cy + 3.5, R[1]); p.fline(cx - 5, cy + 2, cx - 2.5, cy + 3, R[4]);
      fmap(p, cx + 5, cy - 3, ['1.', '21', '.2'], { 1: R[1], 2: R[4] });
      p.rect(cx - w / 2 + 2.5, h + 1.5, w - 4, 0.5, R[0]);
    }
    // Moospolster oben
    for (let x = Math.round(cx - w / 2) + 2; x < Math.round(cx + w / 3); x++) {
      const t = 1 - ((x - cx) / (w / 2)) ** 2; if (t <= 0) continue;
      const yt = Math.round(cy - (h / 2) * Math.sqrt(t));
      if (p.fine) {
        // Polster: geschlossen, Unterkante gewellt, Spitzen oben als Feinpixel
        const dd = 1 + (Math.sin(x * 1.7 + seed) > 0 ? 0.5 : 0) + (x % 3 === 0 ? 0.5 : 0);
        p.rect(x, yt + 0.5, 1, dd, MOSS[1]); p.rect(x, yt, 1, 0.5, MOSS[2]);
        p.dot(x + (x % 2) * 0.5, yt - 0.5, x % 2 ? MOSS[2] : '#4e6a3e'); p.dot(x, yt + dd + 0.5, MOSS[0]);
      } else if (lo(p)) for (let d = 0; d < 2; d++) if (hash2(x, d, seed) < 0.7) p.px(x, yt + d, MOSS[2 - d]);
    }
    for (let i = 0; i < 3; i++) { const x = cx + rng.int(-6, 4), y = cy + rng.int(0, 3); if (lo(p)) p.px(x, y, R[1]); }
  }, { ax: Math.floor((w + 4) / 2), ay: h + 2, box: [-8, -4, 8, 1] });
}

function fallenLog(v) {
  return mk(38, 16, (p) => {
    footShadow(p, 19, 13, 17, 2, 600 + v);
    const y0 = 5, y1 = 12;
    for (let x = 3; x < 34; x++) for (let y = y0; y <= y1; y++) {
      const k = (y - y0) / (y1 - y0);
      let i = k < 0.2 ? 3 : k < 0.5 ? 2 : k < 0.85 ? 1 : 0;
      if (lo(p) && hash2(x, y, 601) < 0.12) i -= 1;
      if (lo(p) && (x * 3 + y) % 7 === 0) i -= 1;
      p.px(x, y, BARK[clampI(i, 4)]);
    }
    if (p.fine) {
      // Rinde: Längsfurchen (wellig, dunkel) mit Lichtgrat darüber, unterbrochen; Lichtkante oben
      for (let r = 0; r < 6; r++) {
        const yy = y0 + 1.25 + r * 1.2, ph = r * 1.9 + v;
        for (let x = 4; x < 33.5; x += 0.5) {
          if (Math.sin(x * 0.45 + ph) > 0.55) continue;
          const y = Math.round((yy + Math.sin(x * 0.3 + ph) * 0.35) * 2) / 2;
          p.dot(x, y, BARK[0]);
          if (r < 3 && Math.round(x * 2) % 3 === 0) p.dot(x, y - 0.5, BARK[3]);
        }
      }
      p.rect(4, y0, 29, 0.5, '#4e3a3e');
    }
    // Schnittfläche links, abgebrochene Äste
    p.ellipse(3, 8.5, 2.6, 4, '#4a3424'); p.ellipse(3, 8.5, 1.6, 2.6, '#6a4a30'); p.px(3, 8, '#8a6a44');
    if (p.fine) {
      // Jahresringe, Kernriss, Rindenrand
      p.ellipse(3, 8.5, 2.1, 3.3, '#5a3e28'); p.ellipse(3, 8.5, 1.6, 2.6, '#7a5636'); p.ellipse(3, 8.5, 1, 1.8, '#6a4a30'); p.ellipse(3, 8.5, 0.5, 1, '#8a6a44');
      p.fline(3.5, 9, 4.5, 11.5, '#3a2618'); p.dot(2.5, 7.5, '#a8885a');
    }
    p.line(14, y0, 12, 1, BARK[2]); p.line(24, y0, 27, 2, BARK[1]);
    if (p.fine) { p.fline(13.5, y0 - 0.5, 11.5, 1, BARK[3]); p.dot(12, 1, '#6a4a30'); p.fline(24.5, y0 - 0.5, 27.5, 2.5, BARK[0]); p.dot(27, 2, '#5a3e28'); }
    // Moos und Pilze
    for (let x = 6; x < 32; x++) {
      if (p.fine) {
        if (Math.sin(x * 0.9 + v * 2) > -0.2) { p.rect(x, y0, 1, 0.5, MOSS[1]); p.dot(x + (x % 2) * 0.5, y0 - 0.5, x % 3 ? MOSS[2] : '#4e6a3e'); if (x % 2) p.dot(x, y0 + 0.5, MOSS[0]); }
      } else if (lo(p) && hash2(x, 0, 602 + v) < 0.5) p.px(x, y0, MOSS[1 + (x % 2)]);
    }
    if (v) {
      p.px(20, y0 - 1, '#c8a46a'); p.rect(19, y0 - 2, 3, 1, '#8a3a2a');
      if (p.fine) fmap(p, 19, y0 - 2.5, ['.443..', '432221', '..ab..', '..ab..'], { 4: '#d06a4a', 3: '#a84a32', 2: '#8a3a2a', 1: '#5a2418', a: '#e0c08a', b: '#a8844e' });
    }
  }, { ax: 19, ay: 14, box: [-15, -6, 15, 0] });
}

// ------------------------------------------------------------ Felder (kachelgenau, ohne Umriss)
function wheat(v) {
  return flat(16, 18, 8, 16, (p) => {
    for (let row = 0; row < 3; row++) {
      const by = 6 + row * 5;
      for (let x = 0; x < 16; x++) {
        const h = 3 + Math.floor(hash2(x, row, 700 + v) * 3);
        for (let k = 0; k < h; k++) p.px(x, by - k, STRAW[k === h - 1 ? 5 : k > 1 ? 4 : 2 + (x % 2)]);
        const awn = hash2(x, row, 710 + v) < 0.35;
        if (awn) p.px(x, by - h, STRAW[3]);
        if (p.fine) {
          // Ähre: Körner versetzt (hell/dunkel), Grannen als Feinpixel, Halme getrennt durch dunkle Feinfuge
          const ty = by - h + 1;
          p.dot(x, ty, STRAW[5]); p.dot(x + 0.5, ty, STRAW[4]); p.dot(x, ty + 0.5, STRAW[3]); p.dot(x + 0.5, ty + 0.5, STRAW[5]);
          if (h > 3) { p.dot(x, ty + 1, STRAW[4]); p.dot(x + 0.5, ty + 1.5, STRAW[3]); }
          if (awn) { p.rect(x, ty - 1, 1, 1, null); p.dot(x + 0.5, ty - 0.5, STRAW[4]); p.dot(x + (x % 2) * 0.5, ty - 1, STRAW[3]); }
          if (x % 2) p.rect(x + 0.5, by - 1.5, 0.5, 2, STRAW[1]);
          else p.dot(x, by - 2, STRAW[3]);
        }
      }
      for (let x = 0; x < 16; x++) p.px(x, by + 1, DIRT[1]);
      if (p.fine) for (let x = 0; x < 16; x += 2) { p.dot(x + (row % 2), by + 1, DIRT[3]); p.dot(x + 0.5 + (row % 2), by + 1.5, DIRT[0]); }
    }
  });
}
function cabbage(v) {
  return flat(16, 18, 8, 16, (p) => {
    for (let x = 0; x < 16; x++) for (let y = 2; y < 18; y++) p.px(x, y, (y % 5 === 4) ? DIRT[3] : DIRT[2]);
    if (p.fine) {
      // Furchenkamm: Lichtkante oben, Schattenfuge darunter; Erdkrumen in festem Raster (kachelbar)
      for (let y = 4; y < 18; y += 5) { p.rect(0, y, 16, 0.5, DIRT[4]); p.rect(0, y + 1, 16, 0.5, DIRT[1]); }
      for (let i = 0; i < 6; i++) { const x = (i * 5 + 1.5 + v * 2) % 16, y = 2.5 + ((i * 7) % 15); if ((Math.floor(y) % 5) !== 4) { p.dot(x, y, DIRT[3]); p.dot(x + 0.5, y + 0.5, DIRT[1]); } }
    }
    for (let row = 0; row < 3; row++) {
      const by = 4 + row * 5;
      for (let i = 0; i < 3; i++) {
        const x = 2 + i * 5 + (row % 2 ? 2 : 0) + Math.round(hash2(i, row, 720 + v) * 1.5) - 1;
        if (x > 14) continue;
        p.ellipse(x, by, 2.2, 1.6, CABB[1]); p.ellipse(x - 0.5, by - 0.5, 1.4, 1, CABB[3]); p.px(x - 1, by - 1, CABB[4]); p.px(x + 1, by + 1, CABB[0]);
        if (p.fine) {
          // Kopf: Außenblätter mit Rippen (Feinlinien), Herz mit Glanz, Schatten unten rechts
          p.fline(x + 0.5, by + 0.5, x - 1.5, by + 1.5, CABB[2]); p.fline(x + 0.5, by + 0.5, x + 2.5, by + 1.5, CABB[0]);
          p.fline(x + 0.5, by + 0.5, x + 2, by - 0.5, CABB[2]);
          fmap(p, x - 0.5, by - 0.5, ['.43', '432', '32.'], { 4: '#5e8270', 3: CABB[4], 2: CABB[3] });
          p.dot(x - 1.5, by + 1.5, CABB[2]); p.dot(x + 2, by + 2, CABB[0]); p.dot(x + 1.5, by + 2, '#0a1210');
        }
      }
    }
  });
}
function furrows(v) {
  return flat(16, 16, 8, 14, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = (y + (v ? 2 : 0)) % 4;
      let c = k === 0 ? DIRT[4] : k === 1 ? DIRT[3] : k === 2 ? DIRT[1] : DIRT[2];
      if (lo(p) && hash2(x, y, 730 + v) < 0.08) c = DIRT[0];
      p.px(x, y, c);
    }
    if (p.fine) {
      // Kamm mit Lichtgrat, Furchengrund mit dunkler Feinfuge; Schollen in festem Raster (kachelbar)
      for (let y = 0; y < 16; y++) {
        const k = (y + (v ? 2 : 0)) % 4;
        if (k === 0) p.rect(0, y, 16, 0.5, DIRT[5]);
        if (k === 2) p.rect(0, y + 0.5, 16, 0.5, DIRT[0]);
      }
      for (let i = 0; i < 8; i++) {
        const x = (i * 4.5 + 1 + v * 2.5) % 15.5, y = ((i * 2 + (v ? 2 : 0) + 1) % 16);
        p.rect(x, y, 1, 0.5, DIRT[4]); p.rect(x, y + 0.5, 1, 0.5, DIRT[1]);
      }
    }
    // junge Triebe auf den Kämmen
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(hash2(i, 1, 731 + v) * 15), y = ((i % 4) * 4 + (v ? 2 : 0)) % 16;
      p.px(x, y, GR[4]); p.px(x, y - 1, GR[5]);
      if (p.fine) fmap(p, x - 0.5, y - 1, ['5..5', '.45.', '.34.', '.33.'], { 5: GR[5], 4: GR[4], 3: GR[3] });
    }
  });
}

function haystack() {
  return mk(28, 24, (p) => {
    footShadow(p, 14, 21, 13, 2, 740);
    for (let y = 3; y < 22; y++) {
      const k = (y - 3) / 19, hw = Math.round(5 + Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * 7.5);
      for (let x = 14 - hw; x <= 14 + hw; x++) {
        const rel = (x - 14) / hw;
        let i = rel < -0.4 ? 4 : rel < 0.2 ? 3 : rel < 0.7 ? 2 : 1;
        if (lo(p) && (x + y * 2) % 5 === 0) i -= 1;
        if (lo(p) && hash2(x, y, 741) < 0.1) i += 1;
        p.px(x, y, STRAW[clampI(i, 6)]);
      }
    }
    if (p.fine) {
      // Halmlagen: kurze, nach außen fallende Strähnen (hell auf der Lichtseite, dunkel im Schatten), Lagenkanten
      for (let y = 4, r = 0; y < 21; y += 1.5, r++) {
        const k = (y - 3) / 19, hw = 5 + Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * 7.5;
        for (let u = -hw + 1 + (r % 2) * 1.1; u < hw - 0.5; u += 2.2) {
          const rel = u / hw, x = Math.round((14.5 + u) * 2) / 2, s = rel < 0 ? -0.5 : 0.5;
          const c = rel < -0.4 ? STRAW[5] : rel < 0.2 ? STRAW[4] : rel < 0.7 ? STRAW[2] : STRAW[0];
          p.dot(x, y, c); p.dot(x + s * Math.abs(rel), y + 0.5, c); p.dot(x + s * Math.abs(rel) * 2, y + 1, rel < 0.2 ? STRAW[3] : STRAW[1]);
        }
        if (r % 3 === 2) for (let x = 14.5 - hw + 1; x < 14.5 + hw - 1; x += 0.5) if (Math.sin(x * 2.3 + r) > 0) p.dot(x, y + 1, (x < 12 ? STRAW[3] : STRAW[1]));
      }
    }
    // Halme, Bindeseil
    for (let i = 0; i < 9; i++) p.px(6 + i * 2, 2 + (i % 3), STRAW[5]);
    if (p.fine) for (let i = 0; i < 9; i++) { p.dot(6.5 + i * 2, 1.5 + (i % 3), STRAW[4]); p.dot(7 + i * 2 - (i % 2), 1 + (i % 3), STRAW[3]); }
    p.line(4, 13, 24, 11, '#3a2a16'); p.line(4, 14, 24, 12, STRAW[1]);
    if (p.fine) {
      // Seil gedreht: schräge Lichtglieder
      for (let x = 4.5; x < 24; x += 1) { const y = 13 - (x - 4) * 0.1; p.dot(x, y, '#6a5432'); p.dot(x + 0.5, y + 0.5, '#2a1e10'); }
    }
    p.line(18, 2, 22, 21, OUT.wood[2]); // Heugabel
    p.rect(17, 0, 3, 1, PAL.steel[3]); p.px(17, 1, PAL.steel[3]); p.px(19, 1, PAL.steel[3]);
    if (p.fine) {
      p.fline(17.5, 2, 21.5, 21, OUT.wood[4]); p.fline(18.5, 2.5, 22.5, 21, OUT.wood[1]);
      fmap(p, 17, 0, ['454321', '4..3.1', '3..2.1', '2.....'], { 5: PAL.steel[5], 4: PAL.steel[4], 3: PAL.steel[3], 2: PAL.steel[2], 1: PAL.steel[1] });
    }
  }, { ax: 14, box: [-11, -5, 11, 1] });
}

function scarecrow() {
  return mk(22, 36, (p) => {
    footShadow(p, 11, 34, 5, 1, 750);
    const Wd = OUT.wood;
    p.rect(10, 8, 2, 27, Wd[2]); p.rect(10, 8, 1, 27, Wd[3]);
    p.rect(1, 13, 20, 2, Wd[2]); p.rect(1, 13, 20, 1, Wd[3]);
    if (p.fine) {
      grain(p, 10.5, 15, 1.5, 19, Wd[1], Wd[4], 3);
      p.rect(10, 15, 0.5, 20, Wd[4]); p.rect(11.5, 15, 0.5, 20, Wd[1]);
      p.rect(1, 13, 20, 0.5, Wd[4]); p.rect(1, 14.5, 20, 0.5, Wd[1]);
    }
    // Mantel
    poly(p, [[6, 12], [16, 12], [17, 25], [13, 23], [11, 26], [8, 23], [5, 25]], (x, y) => (x < 9 ? '#4a3a2a' : x < 14 ? '#3a2c20' : '#2a2018'));
    p.rect(1, 12, 5, 4, '#3a2c20'); p.rect(16, 12, 5, 4, '#2a2018');
    for (const x of [1, 3, 19, 20]) p.px(x, 16 + (x % 2), STRAW[4]);
    p.px(9, 18, '#5a4a36'); p.px(12, 20, '#20160e');
    if (p.fine) {
      // Mantel: Falten (Tal dunkel, Grat hell), Flicken mit Punktnaht, Knöpfe, Fransen aus Stroh
      fold(p, 8.5, 14, 22.5, '#2e2218', '#5a4834'); fold(p, 13, 14.5, 22, '#1e160e', '#4a3a2a'); fold(p, 15.5, 15, 24, '#1a120c', '#3a2c20');
      p.rect(12, 16, 2.5, 2.5, '#4a3424'); stitch(p, 12, 16, 14.5, 16, '#7a6448'); stitch(p, 12, 18.5, 14.5, 18.5, '#7a6448');
      p.dot(11, 15, '#8a7a5a'); p.dot(11, 17.5, '#8a7a5a'); p.dot(11, 20, '#8a7a5a');
      p.rect(6, 12, 10, 0.5, '#5a4834'); p.rect(1, 12, 5, 0.5, '#4a3a2a');
      for (const [x, y, d] of [[1, 16, -1], [2, 16.5, -1], [3.5, 16, 0], [19, 16.5, 0], [20, 16, 1], [20.5, 17, 1]]) { p.dot(x, y, STRAW[5]); p.dot(x + d * 0.5, y + 0.5, STRAW[3]); p.dot(x + d * 0.5, y + 1, STRAW[2]); }
      for (const x of [5.5, 8, 12.5, 16.5]) { p.dot(x, 25 - (x > 10 && x < 14 ? 1.5 : 0), STRAW[4]); }
    }
    // Sackkopf mit Hut
    p.ellipse(11, 8, 3.5, 3.5, '#6e5a3c'); p.px(9, 7, '#20140c'); p.px(13, 7, '#20140c'); p.line(9, 10, 13, 10, '#20140c');
    p.rect(5, 3, 13, 2, '#1e1a16'); p.rect(8, 0, 7, 4, '#26201a'); p.rect(8, 0, 7, 1, '#3a3028');
    if (p.fine) {
      // Sack: Licht oben links, Kreuzstich-Mund, Knopfaugen mit Glanz, Schnur am Hals; Hut mit Band und Krempenlicht
      fmap(p, 8, 5.5, ['..3332..', '.333322.', '33322221', '3322222111'.slice(0, 8)], { 3: '#8a7450', 2: '#6e5a3c', 1: '#54442c' });
      for (const ex of [9, 13]) fmap(p, ex - 0.5, 6.5, ['00.', '0g0', '.0.'], { 0: '#20140c', g: '#8a7a6a' });
      for (let x = 9; x < 13.5; x += 1) { p.dot(x, 9.5, '#20140c'); p.dot(x + 0.5, 10, '#20140c'); p.dot(x, 10.5, '#20140c'); }
      p.rect(9, 11, 4, 0.5, '#3a2a16'); p.dot(12.5, 11.5, '#3a2a16');
      p.rect(5, 3, 13, 0.5, '#3a3028'); p.rect(5, 4.5, 13, 0.5, '#100c0a');
      p.rect(8, 2.5, 7, 1, '#5a2418'); p.rect(8, 2.5, 7, 0.5, '#7a3424');
      p.rect(8, 0, 0.5, 4, '#3a3028'); p.rect(14.5, 0.5, 0.5, 2, '#14100c');
    }
    // Krähe auf dem Arm
    p.rect(17, 10, 3, 2, '#0c0a10'); p.px(19, 9, '#0c0a10'); p.px(20, 9, '#8a6a2a');
    if (p.fine) {
      fmap(p, 16.5, 8.5, ['....00..', '...0g0c.', '.0000000', '01100000', '.0000...', '..2..2..'], { 0: '#0c0a10', 1: '#2a2a3a', g: '#c8b878', c: '#8a6a2a', 2: '#3a2a1a' });
    }
  }, { ax: 11, box: [-2, -3, 2, 1] });
}

// ------------------------------------------------------------ Häuser
// Feine Dach- und Wandflächen (ganze Fläche je Feinpixel neu, glatte Walmkanten statt Treppen)
// Schieferdach: Reihen à 4, Platten à 6 versetzt; Plattenkante oben hell, Schattenfuge unten, Stoß links dunkel mit
// Lichtkante, untere Ecken gerundet, einzelne dunklere (ersetzte) Platten statt Sprenkel.
function slateFine(p, x0, x1, top, bot, insMax, out, litW, seed) {
  p.each(x0 - out, top, x1 + out + 1, bot + 1, (x, y) => {
    const k = (y - top) / (bot + 1 - top), ins = (1 - k) * insMax;
    if (x < x0 - out + ins || x >= x1 + out + 1 - ins) return null;
    const ry = y - top, row = Math.floor(ry / 4), fy = ry - row * 4;
    const u = x + (row % 2) * 3, col = Math.floor(u / 6), lx = u - col * 6;
    const lit = x < x0 - out + ins + litW ? 1 : 0;
    if (x < x0 - out + ins + 0.5) return SLATE[4];
    let i;
    if (fy >= 3.5) i = 0;
    else if (fy >= 3) i = 1;
    else if (lx < 0.5) i = 0;
    else if (fy >= 2.5 && (lx < 1 || lx >= 5.5)) i = 1;
    else if (lx < 1) i = 3;
    else if (fy < 0.5) i = 3;
    else i = 2;
    const hv = hash2(col, row, seed);
    if (i === 2 && hv < 0.2) return SLATE[1];                      // ältere, dunklere Platten
    if (i === 2 && hv > 0.85 && fy < 1.5 && lx < 3) i = 3;          // Abrieb/Licht an einzelnen Platten
    if (i > 0) i += lit;
    return SLATE[Math.min(4, i)];
  });
}
// Strohdach: Lagen à 5, Halme als 1-Feinpixel-Streifen (dunkel/hell), Lagenkante unten gefranst, Traufe dunkel
function thatchFine(p, x0, x1, top, bot, insMax, out, litW) {
  p.each(x0 - out, top, x1 + out + 1, bot + 1, (x, y) => {
    const k = (y - top) / (bot + 1 - top), ins = (1 - k) * insMax;
    if (x < x0 - out + ins || x >= x1 + out + 1 - ins) return null;
    const ry = y - top, band = Math.floor(ry / 5), fy = ry - band * 5;
    const F = Math.floor(x * 2), h = hash2(F, band, 764), h2 = hash2(F >> 1, band, 765);
    let i = 3 + (x < x0 - out + ins + litW ? 1 : 0);
    const fr = h2 < 0.35 ? 1 : h2 < 0.7 ? 0.5 : 0;   // Halmenden verschieden lang
    const st = fy - (h < 0.5 ? 0 : 0.5);              // Strähnen beginnen versetzt
    if (fy >= 4.5 - fr * 0.5) i -= 2;
    else if (fy >= 4 - fr) i -= 1;
    else if (h < 0.16 && st > 0.5) i -= 1;
    else if (h > 0.84 && st < 3) i += 1;
    if (k > 0.94) i -= 1;
    if (x < x0 - out + ins + 0.5 && fy < 4) i = 5;
    return STRAW[clampI(i, 6)];
  });
}
// Bruchstein-/Quaderwand: Lagen à bh, Steine à bw versetzt, Fuge 1 Feinpixel dunkel, Kantenlicht oben/links,
// Stein je Block hell/dunkel (Struktur), keine Sprenkel
function stoneWallFine(p, x0, x1, y0, y1, bw, bh, off, seed, R = STN, litX = -1) {
  p.each(x0, y0, x1, y1, (x, y) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return null;
    const ry = y - y0, row = Math.floor(ry / bh), fy = ry - row * bh;
    const u = x + (row % 2) * off, col = Math.floor(u / bw), lx = u - col * bw;
    if (fy >= bh - 0.5 || lx < 0.5) return R[1];
    let i = 2 + (hash2(col, row, seed) < 0.3 ? 1 : 0) + (x < litX ? 1 : 0);
    if (fy < 0.5 || lx < 1) i += 1;
    else if (fy >= bh - 1 || lx >= bw - 0.5) i -= 1;
    return R[clampI(i, R.length)];
  });
}
// Brett/Pfosten mit Maserung, Licht links, Schatten rechts
function plankV(p, x, y, w, h, Wd, seed) {
  p.rect(x, y, 0.5, h, Wd[3]); p.rect(x + w - 0.5, y, 0.5, h, Wd[1]);
  grain(p, x + 0.5, y, w - 1, h, Wd[1], Wd[3], seed);
}
// warm erleuchtete Scheibe: Leuchtebene mit heißem Kern oben links
function paneGlow(g, x, y, w, h) {
  g.rect(x, y, w, h, PAL.ember[3]);
  g.rect(x, y, w - 0.5, h - 0.5, PAL.ember[4]);
  g.rect(x, y, Math.max(0.5, w - 1.5), Math.max(0.5, h - 1.5), PAL.ember[5]);
  g.dot(x, y, '#ffffff');
}

// Fachwerkhaus 3/4: Giebelseite zur Straße? Nein – Traufseite vorn, Dach nach hinten.
function cottage(kind) {
  const W = 74, H = 74, cx = 37, bottom = H - 1;
  const thatch = kind === 0;
  const Wd = OUT.wood;
  const ROOF = thatch ? STRAW : ['#100e18', ...SLATE];
  return mk(W, H, (p, g) => {
    const fine = p.fine;
    footShadow(p, cx, bottom - 1, 34, 3, 760 + kind);
    const x0 = 8, x1 = W - 9, wallH = 26, wallTop = bottom - 4 - wallH;
    // Sockel
    p.rect(x0 - 1, bottom - 5, x1 - x0 + 3, 5, STN[2]);
    for (let x = x0; x < x1; x += 5) { p.rect(x, bottom - 5, 4, 2, STN[3]); p.px(x, bottom - 5, STN[4]); }
    if (fine) {
      for (let x = x0; x < x1; x += 5) { bevel(p, x, bottom - 5, 4, 2, STN[4], STN[1]); p.dot(x, bottom - 5, STN[5]); }
      for (let x = x0 + 2; x < x1; x += 5) { p.rect(x, bottom - 3, 0.5, 2, STN[1]); p.rect(x + 0.5, bottom - 3, 0.5, 2, STN[3]); }
      p.rect(x0 - 1, bottom - 2.5, x1 - x0 + 3, 0.5, STN[1]); p.rect(x0 - 1, bottom - 0.5, x1 - x0 + 3, 0.5, STN[0]);
      crack(p, x0 + 21, bottom - 2.5, 2, 3, STN[0], STN[3]);
    }
    // Wand: Putz mit Fachwerk (A) oder Bruchstein (B)
    if (fine) {
      if (thatch) {
        p.rect(x0, wallTop, x1 - x0 + 1, bottom - 5 - wallTop, PLAST[1]);
        // Putz: Haarrisse von den Balkenecken, Kellenzug als helle Feinlinien, Wasserflecken unten
        for (const [x, y, l, sd] of [[x0 + 4, wallTop + 15, 3, 1], [x1 - 8, wallTop + 3, 2.5, 2], [x0 + 26, wallTop + 18, 3.5, 3], [x1 - 22, wallTop + 16, 2, 4]]) crack(p, x, y, l, sd, PLAST[0], PLAST[2]);
        for (const [x, y, w] of [[x0 + 3, wallTop + 5, 5], [x0 + 22, wallTop + 7, 4], [x1 - 14, wallTop + 19, 6], [x0 + 6, wallTop + 21, 4]]) p.rect(x, y, w, 0.5, PLAST[2]);
        for (let x = x0 + 2; x < x1 - 1; x += 3.5) p.rect(x, bottom - 6, 1.5, 0.5, PLAST[0]);
      } else stoneWallFine(p, x0, x1 + 1, wallTop, bottom - 5, 7, 4, 3, 763, STN, x0 + 3);
    } else if (!coarseSkip(p)) for (let y = wallTop; y < bottom - 5; y++) for (let x = x0; x <= x1; x++) {
      let c;
      if (thatch) c = PLAST[1 + ((hash2(x, y, 761) < 0.12) ? 1 : 0) - (hash2(x, y, 762) < 0.06 ? 1 : 0)];
      else {
        const row = Math.floor((y - wallTop) / 4), lx = (x + (row % 2) * 3) % 7, ly = (y - wallTop) % 4;
        c = ly === 3 || lx === 0 ? STN[1] : ly === 0 ? STN[4] : STN[2 + (hash2(x >> 2, row, 763) < 0.3 ? 1 : 0)];
      }
      p.px(x, y, c);
    }
    if (thatch) {
      for (const x of [x0, x0 + 18, x1 - 18, x1 - 1]) { p.rect(x, wallTop, 2, wallH - 1, Wd[2]); p.px(x, wallTop, Wd[3]); }
      p.rect(x0, wallTop, x1 - x0 + 1, 2, Wd[3]); p.rect(x0, wallTop + 12, x1 - x0 + 1, 2, Wd[2]);
      p.line(x0 + 2, wallTop + 12, x0 + 17, wallTop + 2, Wd[1]); p.line(x1 - 17, wallTop + 2, x1 - 2, wallTop + 12, Wd[1]);
      if (fine) {
        // Fachwerk: Ständer gemasert, Riegel mit Kanten, Holznägel an den Knoten, Streben mit Lichtkante
        for (const [i, x] of [x0, x0 + 18, x1 - 18, x1 - 1].entries()) { plankV(p, x, wallTop + 2, 2, wallH - 3, Wd, 40 + i); }
        p.rect(x0, wallTop, x1 - x0 + 1, 0.5, Wd[4]); p.rect(x0, wallTop + 1.5, x1 - x0 + 1, 0.5, Wd[1]);
        p.rect(x0, wallTop + 12, x1 - x0 + 1, 0.5, Wd[3]); p.rect(x0, wallTop + 13.5, x1 - x0 + 1, 0.5, Wd[0]);
        grain(p, x0, wallTop + 0.5, x1 - x0 + 1, 1, Wd[2], null, 47, true);
        grain(p, x0, wallTop + 12.5, x1 - x0 + 1, 1, Wd[1], null, 48, true);
        p.fline(x0 + 2, wallTop + 11.5, x0 + 17, wallTop + 1.5, Wd[3]); p.fline(x1 - 17, wallTop + 1.5, x1 - 2, wallTop + 11.5, Wd[2]);
        for (const x of [x0, x0 + 18, x1 - 18, x1 - 1]) for (const y of [wallTop + 0.5, wallTop + 12.5]) p.dot(x + 1, y, Wd[4]);
      }
    }
    // Traufschatten (fein: harte Stufen im Puffer statt halbtransparenter Streifen)
    if (fine) shadeBand(p, x0, wallTop, x1 - x0 + 1, [0.5, 0.5, 0.5, 0.62, 0.62, 0.74, 0.74, 0.86]);
    else for (let i = 0; i < 4; i++) { p.ctx.fillStyle = `rgba(6,3,10,${0.5 * (1 - i / 4)})`; p.ctx.fillRect(x0, wallTop + i, x1 - x0 + 1, 1); }
    // Tür (Mitte) mit Vordach
    const dx = cx - 5;
    p.rect(dx - 1, bottom - 22, 12, 18, Wd[1]); p.rect(dx, bottom - 21, 10, 17, Wd[2]);
    for (let x = dx + 2; x < dx + 10; x += 3) p.rect(x, bottom - 21, 1, 17, Wd[1]);
    p.px(dx + 8, bottom - 13, PAL.gold[3]);
    p.rect(dx - 2, bottom - 5, 14, 1, STN[4]);
    if (fine) {
      // Tür: Bretter gemasert, Fugen fein, zwei Eisenbänder mit Nagelköpfen, Ringgriff mit Glanz, Zarge mit Kanten
      for (let x = dx, k = 0; x < dx + 10; x += 3, k++) grain(p, x + 0.5, bottom - 21, 1.5, 17, Wd[1], Wd[3], 60 + k);
      for (let x = dx + 2; x < dx + 10; x += 3) { p.rect(x, bottom - 21, 0.5, 17, Wd[0]); p.rect(x + 0.5, bottom - 21, 0.5, 17, Wd[3]); }
      p.rect(dx - 1, bottom - 22, 12, 0.5, Wd[3]); p.rect(dx - 1, bottom - 22, 0.5, 18, Wd[3]); p.rect(dx + 10.5, bottom - 22, 0.5, 18, Wd[0]);
      for (const y of [bottom - 19, bottom - 9]) {
        p.rect(dx, y, 8, 1, PAL.steel[1]); p.rect(dx, y, 8, 0.5, PAL.steel[2]);
        for (let x = dx + 0.5; x < dx + 8; x += 2.5) nail(p, x, y, PAL.steel);
      }
      fmap(p, dx + 7.5, bottom - 13.5, ['.43.', '4..2', '3..1', '.21.'], { 4: PAL.gold[4], 3: PAL.gold[3], 2: PAL.gold[2], 1: PAL.gold[1] });
      p.rect(dx - 2, bottom - 5, 14, 0.5, STN[5]); p.rect(dx - 2, bottom - 4.5, 14, 0.5, STN[3]);
    }
    // Fenster mit Läden, warm erleuchtet
    for (const fx of [x0 + 7, x1 - 15]) {
      const fy = wallTop + 7;
      p.rect(fx - 1, fy - 1, 10, 10, Wd[1]); p.rect(fx, fy, 8, 8, '#3a1c0c');
      p.rect(fx + 1, fy + 1, 3, 3, PAL.ember[3]); p.rect(fx + 5, fy + 1, 2, 3, PAL.ember[2]); p.rect(fx + 1, fy + 5, 3, 2, PAL.ember[2]); p.rect(fx + 5, fy + 5, 2, 2, PAL.ember[3]);
      p.rect(fx + 4, fy, 1, 8, Wd[1]); p.rect(fx, fy + 4, 8, 1, Wd[1]);
      if (fine) {
        paneGlow(g, fx + 1, fy + 1, 3, 3); paneGlow(g, fx + 5, fy + 1, 2, 3); paneGlow(g, fx + 1, fy + 5, 3, 2); paneGlow(g, fx + 5, fy + 5, 2, 2);
        // Scheiben: Kern hell, Spiegelstrich; Sprossen mit Lichtkante; Rahmen gefast
        for (const [x, y] of [[fx + 1, fy + 1], [fx + 5, fy + 1], [fx + 1, fy + 5], [fx + 5, fy + 5]]) { p.dot(x, y, PAL.ember[5]); p.dot(x + 0.5, y, PAL.ember[4]); p.dot(x, y + 0.5, PAL.ember[4]); }
        p.rect(fx + 4, fy, 0.5, 8, Wd[3]); p.rect(fx, fy + 4, 8, 0.5, Wd[3]);
        bevel(p, fx - 1, fy - 1, 10, 10, Wd[3], Wd[0]);
        p.rect(fx, fy, 8, 0.5, '#1e0e06'); p.rect(fx, fy, 0.5, 8, '#1e0e06');
      } else {
        g.rect(fx + 1, fy + 1, 3, 3, PAL.ember[4]); g.rect(fx + 5, fy + 1, 2, 3, PAL.ember[3]); g.rect(fx + 1, fy + 5, 3, 2, PAL.ember[3]); g.rect(fx + 5, fy + 5, 2, 2, PAL.ember[4]);
      }
      const SH = kind ? ['#1e3040', '#16242e'] : ['#3a2416', '#2a1a10'];
      p.rect(fx - 4, fy - 1, 3, 10, SH[0]); p.rect(fx + 9, fy - 1, 3, 10, SH[1]);
      p.rect(fx - 1, fy + 9, 10, 1, Wd[3]);
      if (fine) {
        // Läden: zwei Bretter, Z-Strebe, Nagelköpfe, Kanten
        for (const [sx, c] of [[fx - 4, SH[0]], [fx + 9, SH[1]]]) {
          p.rect(sx + 1.5, fy - 1, 0.5, 10, tone(c, -0.35)); p.rect(sx, fy - 1, 0.5, 10, tone(c, 0.18)); p.rect(sx + 2.5, fy - 1, 0.5, 10, tone(c, -0.3));
          p.rect(sx, fy, 3, 0.5, tone(c, 0.12)); p.rect(sx, fy + 7, 3, 0.5, tone(c, 0.12)); p.fline(sx + 0.5, fy + 7, sx + 2.5, fy + 0.5, tone(c, 0.1));
          nail(p, sx + 0.5, fy, PAL.steel); nail(p, sx + 2, fy + 7, PAL.steel);
        }
        p.rect(fx - 1, fy + 9, 10, 0.5, Wd[4]);
      }
      // Blumenkasten
      p.rect(fx, fy + 10, 8, 2, Wd[2]); for (let i = 0; i < 4; i++) p.px(fx + 1 + i * 2, fy + 9, i % 2 ? '#9a4a6a' : '#b8a050');
      if (fine) {
        grain(p, fx, fy + 10.5, 8, 1.5, Wd[1], Wd[3], fx, true); p.rect(fx, fy + 11.5, 8, 0.5, Wd[0]);
        for (let i = 0; i < 4; i++) {
          const C = i % 2 ? ['#9a4a6a', '#d07a9a'] : ['#b8a050', '#e8d080'];
          fmap(p, fx + 0.5 + i * 2, fy + 8.5, ['.1.', '101', 'g0g'], { 1: C[1], 0: C[0], g: GR[4] });
        }
      }
    }
    // Dach
    const roofBottom = wallTop + 1, roofTop = 6;
    if (fine) {
      if (thatch) thatchFine(p, x0, x1, roofTop, roofBottom, 9, 5, 6);
      else slateFine(p, x0, x1, roofTop, roofBottom, 9, 5, 1, 765);
    } else if (!coarseSkip(p)) for (let y = roofTop; y <= roofBottom; y++) {
      const k = (y - roofTop) / (roofBottom - roofTop);
      const inset = Math.round((1 - k) * 9);
      for (let x = x0 - 5 + inset; x <= x1 + 5 - inset; x++) {
        let c;
        if (thatch) {
          const band = Math.floor((y - roofTop) / 5), lx = (x * 7 + band * 13) % 5;
          let i = 3 + (x < x0 + inset + 6 ? 1 : 0) - ((y - roofTop) % 5 === 4 ? 2 : 0) - (lx === 0 ? 1 : 0);
          if (hash2(x, y, 764) < 0.1) i -= 1;
          if (k > 0.92) i -= 1;
          c = ROOF[clampI(i, 6)];
        } else {
          const row = Math.floor((y - roofTop) / 4), lx = (x + (row % 2) * 3) % 6;
          let i = (y - roofTop) % 4 === 3 ? 0 : lx === 0 ? 1 : (y - roofTop) % 4 === 0 ? 3 : 2;
          if (x < x0 + inset) i += 1;
          if (hash2(x, y, 765) < 0.05) i = 0;
          c = ROOF[clampI(i + 1, 6)];
        }
        p.px(x, y, c);
      }
    }
    // Strohkante / Moos, First
    if (thatch) {
      if (fine) {
        // Traufkante: hängende Halmspitzen, Moospolster als Büschel
        for (let x = x0 - 5; x <= x1 + 5.5; x += 0.5) { const F = Math.round(x * 2); p.dot(x, roofBottom + 1, F % 3 ? STRAW[1] : STRAW[2]); if (F % 4 === 1) p.dot(x, roofBottom + 1.5, STRAW[0]); }
        for (const [x, y] of [[x0 + 7, roofTop + 9], [x0 + 22, roofTop + 14], [x1 - 12, roofTop + 11], [x1 - 26, roofTop + 21], [x0 + 12, roofTop + 24]]) { p.rect(x, y, 2, 1, MOSS[1]); tuft(p, x + 0.25, y, MOSS[0], MOSS[2], '#4e6a3e'); }
      } else if (!coarseSkip(p)) { for (let x = x0 - 5; x <= x1 + 5; x++) if (hash2(x, 1, 766) < 0.7) p.px(x, roofBottom + 1, STRAW[1]); for (let x = x0 + 4; x < x1 - 4; x += 3) if (hash2(x, 2, 767) < 0.4) p.px(x, roofTop + 8 + (x % 5), MOSS[2]); }
    }
    p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 2, thatch ? STRAW[2] : Wd[2]); p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 1, thatch ? STRAW[5] : Wd[3]);
    if (fine) {
      // First: Lichtgrat, Bindungen / Firstbretter mit Stößen
      p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 0.5, thatch ? '#c8ac5a' : Wd[4]); p.rect(x0 + 4, roofTop + 0.5, x1 - x0 - 8, 0.5, thatch ? STRAW[1] : Wd[0]);
      for (let x = x0 + 7; x < x1 - 4; x += thatch ? 4 : 9) { p.rect(x, roofTop - 1, 0.5, 2, thatch ? STRAW[1] : Wd[1]); if (!thatch) nail(p, x + 1, roofTop - 0.5, PAL.steel); }
    }
    // Schornstein mit Rauchöffnung
    const chx = kind ? x1 - 14 : x0 + 12;
    p.rect(chx, roofTop - 7, 7, 12, STN[2]); p.rect(chx, roofTop - 7, 2, 12, STN[4]); p.rect(chx, roofTop - 7, 7, 1, STN[5]); p.rect(chx + 1, roofTop - 7, 5, 1, '#07050a');
    if (fine) {
      stoneWallFine(p, chx, chx + 7, roofTop - 6, roofTop + 5, 3.5, 2, 1.75, 768 + kind, STN, chx + 2);
      p.rect(chx - 0.5, roofTop - 7, 8, 1, STN[4]); p.rect(chx - 0.5, roofTop - 7, 8, 0.5, STN[5]); p.rect(chx + 1, roofTop - 7, 5, 0.5, '#07050a');
      p.rect(chx, roofTop - 6, 7, 0.5, '#1a1420'); p.rect(chx + 1, roofTop - 5.5, 5, 0.5, STN[1]);   // Ruß
      p.rect(chx, roofTop + 4.5, 7, 0.5, thatch ? STRAW[1] : SLATE[0]);
    }
    // Gaube / Dachfenster bei B
    if (kind) {
      p.rect(cx - 5, roofTop + 10, 10, 9, Wd[1]); p.rect(cx - 4, roofTop + 11, 8, 6, '#3a1c0c'); p.rect(cx - 3, roofTop + 12, 2, 2, PAL.ember[3]); p.rect(cx - 6, roofTop + 8, 12, 2, SLATE[3]);
      if (fine) {
        paneGlow(g, cx - 3, roofTop + 12, 2, 2); p.dot(cx - 3, roofTop + 12, PAL.ember[5]);
        bevel(p, cx - 5, roofTop + 10, 10, 9, Wd[3], Wd[0]);
        p.rect(cx, roofTop + 11, 0.5, 6, Wd[1]); p.rect(cx - 4, roofTop + 14, 8, 0.5, Wd[1]);
        p.rect(cx - 6, roofTop + 8, 12, 0.5, SLATE[4]); p.rect(cx - 6, roofTop + 9.5, 12, 0.5, SLATE[0]);
        for (let x = cx - 5; x < cx + 6; x += 3) p.rect(x, roofTop + 8.5, 0.5, 1, SLATE[1]);
      } else g.rect(cx - 3, roofTop + 12, 2, 2, PAL.ember[4]);
    }
  }, { ax: cx, box: [-28, -22, 28, 1], extra: { smoke: { dx: kind ? 17 : -14, dy: -74, rate: 2 } } });
}

function marketStall(kind) {
  const W = 42, H = 40, cx = 21, bottom = H - 1;
  const A = AWN[kind % AWN.length], Wd = OUT.wood;
  return mk(W, H, (p) => {
    const fine = p.fine;
    footShadow(p, cx, bottom - 1, 19, 2, 780 + kind);
    // Pfosten
    for (const x of [3, W - 5]) { p.rect(x, 8, 2, bottom - 8, Wd[2]); p.px(x, 8, Wd[3]); if (fine) plankV(p, x, 8, 2, bottom - 8, Wd, x); }
    // Theke
    p.rect(2, bottom - 12, W - 4, 11, Wd[2]); p.rect(2, bottom - 12, W - 4, 2, Wd[4]); p.rect(2, bottom - 2, W - 4, 1, Wd[0]);
    for (let x = 5; x < W - 4; x += 6) p.rect(x, bottom - 10, 1, 8, Wd[1]);
    if (fine) {
      // Thekenbrett mit Kante und Maserung, Bretter fein gefugt, Nagelköpfe oben/unten
      p.rect(2, bottom - 12, W - 4, 0.5, '#8a5e40'); p.rect(2, bottom - 10.5, W - 4, 0.5, Wd[1]);
      grain(p, 2, bottom - 11.5, W - 4, 1, Wd[3], null, 81 + kind, true);
      for (let x = 5; x < W - 4; x += 6) { p.rect(x, bottom - 10, 0.5, 8, Wd[0]); p.rect(x + 0.5, bottom - 10, 0.5, 8, Wd[3]); }
      for (let x = 2, k = 0; x < W - 3; x += 6, k++) {
        grain(p, x + 1, bottom - 10, Math.min(4.5, W - 3 - x - 1), 8, Wd[1], Wd[3], 90 + k + kind * 7);
        nail(p, x + 1.5, bottom - 9.5); nail(p, x + 1.5, bottom - 3.5);
      }
      p.rect(2, bottom - 2, W - 4, 0.5, Wd[1]);
    }
    // Waren
    const goods = kind === 0
      ? [[7, '#5a2a18', '#8a4a2a'], [13, '#6e5a28', '#a88e44'], [19, '#203a38', '#42665a'], [25, '#5a2a18', '#a86a3a'], [31, '#7a1a26', '#d0454a'], [36, '#6e5a28', '#a88e44']]
      : [[7, '#2d3548', '#6d7a94'], [12, '#48526a', '#a3b0c6'], [18, '#4d3326', '#6b4a34'], [24, '#2d3548', '#a3b0c6'], [30, '#4a2f10', '#b8862a'], [36, '#33211a', '#6b4a34']];
    for (const [x, c0, c1] of goods) {
      p.ellipse(x, bottom - 14, 2.6, 2, c0); p.px(x - 1, bottom - 15, c1); p.px(x, bottom - 16, c1);
      if (fine) {
        // Ware gehäuft: einzelne Stücke mit Glanzpunkt, Schatten auf der Theke
        p.ellipse(x - 1, bottom - 14.5, 1.1, 0.9, c1); p.ellipse(x + 1, bottom - 13.5, 1.1, 0.9, tone(c1, -0.2));
        p.dot(x - 1.5, bottom - 15.5, tone(c1, 0.45)); p.dot(x + 0.5, bottom - 14, tone(c1, 0.3));
        p.rect(x - 2, bottom - 12, 5, 0.5, tone(Wd[4], -0.4));
      }
    }
    // Körbe/Fässer davor
    p.ellipse(8, bottom - 1, 4, 2.4, Wd[1]); p.ellipse(8, bottom - 2, 3, 1.4, kind ? '#48526a' : '#6e5a28');
    if (fine) {
      // Korbgeflecht: versetzte Lichtpunkte in Reihen, Rand hell
      for (let r = 0; r < 3; r++) for (let x = 4.5 + (r % 2) * 0.5; x < 12; x += 1) p.dot(x, bottom - 1 + r * 0.5, r % 2 ? Wd[2] : Wd[3]);
      for (let x = 5.5; x < 11; x += 0.5) p.dot(x, bottom - 3, Wd[4]);
      p.dot(7, bottom - 2.5, tone(kind ? '#48526a' : '#6e5a28', 0.4)); p.dot(9, bottom - 2, tone(kind ? '#48526a' : '#6e5a28', 0.25));
    }
    // Markise gestreift mit Zacken
    if (fine) {
      // Stoff fein: je Bahn Grat (hell) links und Tal (dunkel) an der Naht, Mittelfalte, Bogensaum statt Zacken
      p.each(1, 1, W - 1, 13, (x, y) => {
        const stripe = Math.floor((x - 1) / 5) % 2, u = (((x - 1) % 5) + 5) % 5 / 5;
        const L = stripe ? A[2] : '#8a7a5a', M = stripe ? A[1] : '#6a5c44', D = stripe ? A[0] : '#4a4030';
        if (y < 2) return x < W - 1 ? A[0] : null;
        if (y < 10.5) {
          const ins = (10.5 - y) * 0.4;
          if (x < 1 + ins || x >= W - 1 - ins) return null;
          if (y < 2.5) return tone(L, 0.12);
          let c = y < 4 ? M : L;
          if (u > 0.86) c = y < 4 ? D : M;
          else if (u < 0.12 && y >= 4) c = tone(L, 0.14);
          else if (y > 5.5 && u > 0.46 && u < 0.56) c = M;
          if (y >= 10) c = D;
          return c;
        }
        // Bogensaum je Bahn
        const ccx = Math.floor((x - 1) / 5) * 5 + 3.5, dy = y - 10.5, e = ((x - ccx) / 2.4) ** 2 + (dy / 1.7) ** 2;
        if (e >= 1 || x >= W - 1) return null;
        return dy > 1.1 ? D : e > 0.55 ? D : M;
      });
      for (let x = 2; x < W - 2; x += 1) p.dot(x + 0.5, 1.5, x % 5 === 0 ? '#a89870' : A[1]);   // Stange mit Ringen
    } else if (!coarseSkip(p)) {
      for (let y = 2; y < 11; y++) {
        const inset = Math.round((10 - y) * 0.4);
        for (let x = 1 + inset; x < W - 1 - inset; x++) {
          const stripe = Math.floor((x - 1) / 5) % 2;
          let c = stripe ? A[2] : '#8a7a5a';
          if (y < 4) c = stripe ? A[1] : '#6a5c44';
          if (y === 10) c = stripe ? A[0] : '#4a4030';
          p.px(x, y, c);
        }
      }
      for (let x = 1; x < W - 1; x++) if (x % 5 === 2) { p.px(x, 11, Math.floor((x - 1) / 5) % 2 ? A[1] : '#6a5c44'); p.px(x + 1, 11, Math.floor((x - 1) / 5) % 2 ? A[1] : '#6a5c44'); }
      p.rect(1, 1, W - 2, 1, A[0]);
    }
  }, { ax: cx, box: [-19, -10, 19, 1] });
}

// ------------------------------------------------------------ Mühle (Fachwerkhaus mit Wasserrad links)
function watermill() {
  const W = 104, H = 86, ax = 60, bottom = H - 1;
  const Wd = OUT.wood;
  return mk(W, H, (p, g) => {
    const fine = p.fine;
    // Haus (rechts vom Anker)
    const x0 = 36, x1 = 96, wallH = 30, wallTop = bottom - 5 - wallH;
    footShadow(p, 66, bottom - 1, 30, 3, 800);
    p.rect(x0 - 2, bottom - 6, x1 - x0 + 5, 6, STN[2]);
    for (let x = x0 - 2; x < x1 + 2; x += 5) { p.rect(x, bottom - 6, 4, 2, STN[3]); p.rect(x + 2, bottom - 3, 4, 2, STN[3]); p.px(x, bottom - 6, STN[4]); }
    if (fine) stoneWallFine(p, x0 - 2, x1 + 3, bottom - 6, bottom, 5, 3, 2, 799, STN, x0 + 1);
    for (let y = wallTop; y < bottom - 6; y++) for (let x = x0; x <= x1; x++) {
      const plank = Math.floor((x - x0) / 4), e = (x - x0) % 4;
      let c = Wd[e === 0 ? 1 : 2 + (hash2(plank, 0, 801) < 0.35 ? 1 : 0)];
      if (lo(p) && hash2(x, y >> 2, 802) < 0.04) c = Wd[1];
      p.px(x, y, c);
    }
    if (fine) {
      // Bretterwand: Fuge 1 Feinpixel mit Lichtkante, Maserung je Brett, Astlöcher, Nagelreihen an Schwelle und Riegel
      for (let x = x0, k = 0; x <= x1; x += 4, k++) {
        p.rect(x, wallTop, 0.5, bottom - 6 - wallTop, Wd[0]); p.rect(x + 0.5, wallTop, 0.5, bottom - 6 - wallTop, Wd[2]);
        grain(p, x + 1, wallTop, Math.min(3, x1 + 1 - x - 1), bottom - 6 - wallTop, Wd[1], Wd[4], 810 + k);
        if (hash2(k, 1, 803) < 0.25) { const y = wallTop + 18 + hash2(k, 2, 803) * 8; p.dot(x + 2, y, Wd[0]); p.dot(x + 2.5, y, Wd[1]); p.dot(x + 2, y - 0.5, Wd[4]); }
        nail(p, x + 1.5, bottom - 7); nail(p, x + 1.5, wallTop + 6);
      }
      shadeBand(p, x0, wallTop, x1 - x0 + 1, [0.5, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9]);
    } else for (let i = 0; i < 5; i++) { p.ctx.fillStyle = `rgba(6,3,10,${0.5 * (1 - i / 5)})`; p.ctx.fillRect(x0, wallTop + i, x1 - x0 + 1, 1); }
    p.rect(x0, wallTop + 14, x1 - x0 + 1, 2, Wd[3]); p.rect(x0, wallTop + 14, x1 - x0 + 1, 1, Wd[4]);
    if (fine) { p.rect(x0, wallTop + 14, x1 - x0 + 1, 0.5, '#8a5e40'); p.rect(x0, wallTop + 15.5, x1 - x0 + 1, 0.5, Wd[1]); for (let x = x0 + 2; x < x1; x += 6) nail(p, x, wallTop + 14.5); }
    // Tor mit Mehlsäcken, Fenster
    p.rect(70, bottom - 26, 16, 20, Wd[0]); p.rect(71, bottom - 25, 14, 19, '#140c0a');
    p.line(71, bottom - 25, 84, bottom - 7, Wd[2]); p.line(84, bottom - 25, 71, bottom - 7, Wd[1]);
    p.rect(70, bottom - 26, 16, 2, Wd[3]);
    if (fine) {
      // Tor: Andreaskreuz mit Lichtkante, Bretterfugen im Dunkel, Sturz gefast, Nagelköpfe an den Enden
      for (let x = 73; x < 84; x += 3) p.rect(x, bottom - 24, 0.5, 18, '#22140e');
      p.line(71, bottom - 25, 84, bottom - 7, Wd[2]); p.line(84, bottom - 25, 71, bottom - 7, Wd[1]);
      p.fline(71, bottom - 25.5, 84.5, bottom - 7.5, Wd[3]); p.fline(83.5, bottom - 25, 70.5, bottom - 7.5, Wd[2]);
      p.rect(70, bottom - 26, 16, 0.5, Wd[4]); p.rect(70, bottom - 24.5, 16, 0.5, Wd[1]);
      for (const [x, y] of [[71.5, bottom - 24.5], [83.5, bottom - 24.5], [71.5, bottom - 8], [83.5, bottom - 8], [77.5, bottom - 16]]) nail(p, x, y);
    }
    for (const [sx, sy] of [[88, bottom - 9], [91, bottom - 8], [89, bottom - 13]]) {
      p.ellipse(sx, sy, 3, 2.6, '#8a8070'); p.px(sx - 1, sy - 2, '#b8ae98'); p.px(sx + 1, sy + 1, '#5a5446');
      if (fine) {
        // Mehlsack: Zipfel mit Schnur, Falte, Mehlstaub hell, Schatten unten rechts
        fmap(p, sx - 1, sy - 3.5, ['.4..', '322.', '.r1.'], { 4: '#d0c6ae', 3: '#b8ae98', 2: '#8a8070', 1: '#5a5446', r: '#6a4a2a' });
        p.fline(sx - 1.5, sy - 1, sx - 2, sy + 1.5, '#b8ae98'); p.fline(sx + 1, sy - 1.5, sx + 1.5, sy + 1, '#6e6656');
        p.dot(sx + 2.5, sy + 1.5, '#4a4438'); p.dot(sx + 2, sy + 2, '#4a4438');
      }
    }
    for (const fx of [44, 58]) {
      const fy = wallTop + 5;
      p.rect(fx - 1, fy - 1, 9, 8, Wd[1]); p.rect(fx, fy, 7, 6, '#3a1c0c'); p.rect(fx + 1, fy + 1, 2, 2, PAL.ember[3]); p.rect(fx + 4, fy + 3, 2, 2, PAL.ember[2]); p.rect(fx + 3, fy, 1, 6, Wd[1]);
      if (fine) {
        paneGlow(g, fx + 1, fy + 1, 2, 2); paneGlow(g, fx + 4, fy + 3, 2, 2);
        p.dot(fx + 1, fy + 1, PAL.ember[5]); p.dot(fx + 4, fy + 3, PAL.ember[4]);
        bevel(p, fx - 1, fy - 1, 9, 8, Wd[3], Wd[0]); p.rect(fx + 3, fy, 0.5, 6, Wd[3]);
        p.rect(fx, fy, 7, 0.5, '#1e0e06');
      } else { g.rect(fx + 1, fy + 1, 2, 2, PAL.ember[4]); g.rect(fx + 4, fy + 3, 2, 2, PAL.ember[3]); }
    }
    // Schieferdach mit Giebel nach links (zum Rad)
    const roofBottom = wallTop + 1, roofTop = 8;
    if (fine) slateFine(p, x0, x1, roofTop, roofBottom, 8, 4, 3, 803);
    else if (!coarseSkip(p)) for (let y = roofTop; y <= roofBottom; y++) {
      const k = (y - roofTop) / (roofBottom - roofTop), inset = Math.round((1 - k) * 8);
      for (let x = x0 - 4 + inset; x <= x1 + 4 - inset; x++) {
        const row = Math.floor((y - roofTop) / 4), lx = (x + (row % 2) * 3) % 6;
        let i = (y - roofTop) % 4 === 3 ? 0 : lx === 0 ? 1 : (y - roofTop) % 4 === 0 ? 3 : 2;
        if (x < x0 + inset + 3) i += 1;
        if (hash2(x, y, 803) < 0.05) i = 0;
        p.px(x, y, SLATE[clampI(i, 5)]);
      }
    }
    if (fine) { for (const [x, y] of [[x0 + 10, roofTop + 9], [x0 + 31, roofTop + 15], [x1 - 14, roofTop + 7], [x1 - 6, roofTop + 21]]) { p.rect(x, y, 1.5, 0.5, MOSS[1]); tuft(p, x, y, MOSS[0], MOSS[1], MOSS[2]); } }
    else if (!coarseSkip(p)) for (let x = x0 + 6; x < x1 - 6; x += 4) if (hash2(x, 3, 804) < 0.5) p.px(x, roofTop + 6 + (x % 7), MOSS[1]);
    p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 2, Wd[2]); p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 1, Wd[4]);
    if (fine) {
      p.rect(x0 + 4, roofTop - 1, x1 - x0 - 8, 0.5, '#8a5e40'); p.rect(x0 + 4, roofTop + 0.5, x1 - x0 - 8, 0.5, Wd[0]);
      for (let x = x0 + 9; x < x1 - 4; x += 9) { p.rect(x, roofTop - 1, 0.5, 2, Wd[1]); nail(p, x + 1, roofTop - 0.5); }
    }
    // Schornstein, Mehlstaub
    p.rect(84, roofTop - 6, 6, 10, STN[2]); p.rect(84, roofTop - 6, 2, 10, STN[4]); p.rect(85, roofTop - 6, 4, 1, '#07050a');
    if (fine) {
      stoneWallFine(p, 84, 90, roofTop - 5, roofTop + 4, 3, 2, 1.5, 806, STN, 86);
      p.rect(83.5, roofTop - 6, 7, 1, STN[4]); p.rect(83.5, roofTop - 6, 7, 0.5, STN[5]); p.rect(85, roofTop - 6, 4, 0.5, '#07050a');
      p.rect(84, roofTop - 5, 6, 0.5, '#1a1420'); p.rect(84, roofTop + 3.5, 6, 0.5, SLATE[0]);
    }
    // Achse und Wasserrad (vor dem Haus links, über dem Bach)
    const wx = 20, wy = bottom - 22, R = 18;
    p.rect(wx, wy - 2, x0 - wx + 2, 4, Wd[1]); p.rect(wx, wy - 2, x0 - wx + 2, 1, Wd[3]);
    if (fine) { p.rect(wx, wy - 2, x0 - wx + 2, 0.5, Wd[4]); p.rect(wx, wy + 1.5, x0 - wx + 2, 0.5, Wd[0]); grain(p, wx, wy - 1, x0 - wx + 2, 2.5, Wd[0], Wd[2], 807, true); }
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.5) continue;
      if (d > R - 2.5) p.px(wx + x, wy + y, d > R - 0.8 ? Wd[1] : (x + y < 0 ? Wd[4] : Wd[2]));
      else if (d > R - 4 && Math.abs(Math.atan2(y, x) * 12 / Math.PI % 1) < 0.25) p.px(wx + x, wy + y, Wd[1]);
    }
    if (fine) {
      // Radkranz: Lichtbogen oben links (1 Feinpixel), Innenkante dunkel, Eisenreif mit Glanz, Nagelköpfe an den Speichen
      for (let a = 0; a < 6.283; a += 0.025) {
        const c = Math.cos(a), s2 = Math.sin(a), lit = c + s2 < -0.3;
        p.dot(wx + 0.5 + c * (R - 1.25), wy + 0.5 + s2 * (R - 1.25), lit ? '#8a5e40' : Wd[3]);
        p.dot(wx + 0.5 + c * (R - 2.75), wy + 0.5 + s2 * (R - 2.75), Wd[0]);
      }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.13; nail(p, wx + 0.5 + Math.cos(a) * (R - 1.75), wy + 0.5 + Math.sin(a) * (R - 1.75)); }
    }
    // Schaufeln
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const c = Math.cos(a), s = Math.sin(a);
      p.line(wx + c * (R - 2), wy + s * (R - 2), wx + c * (R + 3), wy + s * (R + 3), i < 6 ? Wd[3] : Wd[2]);
      p.line(wx + c * 3, wy + s * 3, wx + c * (R - 2), wy + s * (R - 2), Wd[1]);
      if (fine) {
        p.fline(wx + 0.5 + c * (R - 1.5), wy + 0.5 + s * (R - 1.5), wx + 0.5 + c * (R + 2.5), wy + 0.5 + s * (R + 2.5), c + s < 0 ? '#8a5e40' : Wd[4]);
      }
    }
    p.ellipse(wx, wy, 3, 3, Wd[2]); p.px(wx - 1, wy - 1, Wd[4]); p.px(wx, wy, PAL.steel[3]);
    if (fine) fmap(p, wx - 1, wy - 1, ['.43.', '4532', '3221', '.11.'], { 5: PAL.steel[5], 4: PAL.steel[4], 3: PAL.steel[3], 2: PAL.steel[2], 1: PAL.steel[1] });
    // Wasser unter dem Rad: Gischt
    if (fine) {
      // Gischt als Schaumbögen (Feinpixel), Wellenkämme hell
      for (let i = 0; i < 9; i++) {
        const x = wx - 14 + i * 3.4 + hash2(i, 1, 805) * 1.5, y = wy + R - 2 + hash2(i, 2, 805) * 4;
        for (let k = 0; k < 4; k++) p.dot(x + k * 0.5, y - (k === 1 || k === 2 ? 0.5 : 0), k === 1 ? '#c8d8ea' : '#8aa0bc');
        p.dot(x + 0.5, y + 0.5, WTR[4]);
      }
      for (let x = wx - 16; x < wx + 18; x += 0.5) if (Math.sin(x * 1.3) > 0.2) p.dot(x, wy + R + 2.5, WTR[4]);
    } else if (!coarseSkip(p)) for (let i = 0; i < 26; i++) {
      const x = wx - 14 + Math.floor(hash2(i, 1, 805) * 30), y = wy + R - 3 + Math.floor(hash2(i, 2, 805) * 6);
      p.px(x, y, hash2(i, 3, 805) < 0.4 ? '#8aa0bc' : WTR[4]);
    }
    for (let x = wx - 16; x < wx + 18; x++) p.px(x, wy + R + 3, WTR[3]);
    // Lampe am Tor
    p.rect(66, bottom - 30, 3, 4, '#3a2410'); p.px(67, bottom - 29, PAL.ember[4]);
    if (fine) {
      fmap(p, 66, bottom - 30.5, ['.11.', '1221', '1w31', '1331', '1331', '.11.'], { 1: '#3a2410', 2: '#5a3a1a', w: '#fff0b0', 3: PAL.ember[4] });
      g.rect(67, bottom - 29, 1, 2, PAL.ember[4]); g.dot(67, bottom - 29, '#ffffff'); g.dot(67.5, bottom - 28.5, PAL.ember[5]);
    } else { g.px(67, bottom - 29, PAL.ember[5]); g.px(67, bottom - 28, PAL.ember[4]); }
  }, { ax, box: [-26, -20, 36, 1], light: { dx: 7, dy: -30, radius: 70, color: [255, 170, 90], intensity: 0.8 }, extra: { smoke: { dx: 27, dy: -83, rate: 2 } } });
}

// ------------------------------------------------------------ Brücken (Segmente, ohne Umriss)
// Waagerechte Maserung, die nach 16 Weltpixeln nahtlos weiterläuft (Kachelbreite): Sinuswellen mit Periode 16
function railGrain(p, y, h, dark, light, ph = 0) {
  const n = Math.max(1, Math.round(h * 2 / 3));
  for (let j = 0; j < n; j++) {
    for (let x = 0; x < 16; x += 0.5) {
      const t = (x / 16) * Math.PI * 2;
      if (Math.sin(t * 2 + j * 1.9 + ph) < 0.15) continue;
      const yy = y + (j + 0.5) * h / n + Math.sin(t + j + ph) * 0.3;
      p.dot(x, Math.floor(yy * 2) / 2, j % 2 && light ? light : dark);
    }
  }
}
// Querbohle senkrecht im Feinraster: Fuge, Lichtkante, Maserung, ein Ast; Seed je Bohle (nicht je Kachel)
function deckPlank(p, x, y0, y1, w, Wd, seed, joint = true) {
  if (joint) { p.rect(x + w - 1, y0, 0.5, y1 - y0, Wd[1]); p.rect(x + w - 0.5, y0, 0.5, y1 - y0, Wd[0]); }
  p.rect(x, y0, 0.5, y1 - y0, Wd[3]);
  grain(p, x + 0.5, y0, w - 1.5, y1 - y0, Wd[1], Wd[3], seed);
  const ky = y0 + 3 + hash2(seed, 1, 821) * (y1 - y0 - 6);
  if (hash2(seed, 2, 821) < 0.6) { p.dot(x + 1, ky, Wd[0]); p.dot(x + 1.5, ky, Wd[1]); p.dot(x + 1, ky - 0.5, Wd[4]); p.dot(x + 1, ky + 0.5, Wd[1]); }
}
const NAIL4 = (p, x, y) => { const I = PAL.steel; p.dot(x, y, I[3]); p.dot(x + 0.5, y, I[1]); p.dot(x, y + 0.5, I[1]); p.dot(x + 0.5, y + 0.5, I[0]); };

// Ost–West-Brücke über den Bach: Anker in der Zeile über dem Steg (Geländer), Sprite reicht
// über zwei Stegzeilen bis zur Stirnbohle. end: -1 linkes Widerlager, 0 Mitte, 1 rechtes.
function bridgeSeg(end, light = false) {
  const Wd = OUT.wood, W = 16, H = 56;
  return flat(W, H, 8, 14, (p) => {
    const fine = p.fine;
    // oben: Wasserschatten unter dem hinteren Geländer (Mitte) bzw. Uferstein (Enden)
    for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) {
      if (end) p.px(x, y, lo(p) ? (hash2(x, y, 820) < 0.5 ? STN[2] : STN[3]) : STN[2]);
      else p.px(x, y, lo(p) ? (y < 3 && hash2(x, y, 821) < 0.3 ? WTR[3] : (x + y) % 5 === 0 ? WTR[1] : WTR[0]) : WTR[0]);
    }
    if (fine) {
      if (end) stoneWallFine(p, 0, W, 0, 10, 5, 3.5, 2.5, 820, STN);
      else for (let r = 0; r < 4; r++) for (let x = 0; x < 16; x += 4) {
        // Wellen: kurze Lichtstriche, periodisch in 16
        const xx = (x + r * 2.5) % 16, yy = 1 + r * 2.2;
        p.rect(xx, yy, 1.5, 0.5, r === 0 ? WTR[3] : WTR[1]); p.dot((xx + 1.5) % 16, yy + 0.5, WTR[0]);
      }
    }
    // Deck: Querbohlen (senkrecht zur Laufrichtung)
    const d0 = 12, d1 = 47, off = end > 0 ? 1 : 0;
    for (let x = 0; x < W; x++) {
      const plank = Math.floor((x + off) / 4), e = (x + off) % 4;
      for (let y = d0; y <= d1; y++) {
        let c = e === 3 ? Wd[0] : Wd[2 + (hash2(plank, 0, 822 + end) < 0.4 ? 1 : 0)];
        if (e === 0) c = Wd[3];
        if (lo(p) && hash2(x, y, 823) < 0.04) c = Wd[1];
        if ((y === 18 || y === 41) && e === 1) c = PAL.steel[2]; // Nägel
        p.px(x, y, c);
      }
    }
    if (fine) {
      for (let x = -off; x < W; x += 4) deckPlank(p, x, d0, d1 + 1, 4, Wd, (Math.floor((x + off) / 4) + 4) % 4 + end * 5 + 7);
      for (let x = 1 - off; x < W; x += 4) if (x >= 0) { NAIL4(p, x, 18); NAIL4(p, x, 41); }
    }
    p.rect(0, d0 - 2, W, 2, Wd[3]); p.rect(0, d0 - 2, W, 1, Wd[4]);       // hintere Längsbohle
    p.rect(0, d1 + 1, W, 2, Wd[3]); p.rect(0, d1 + 3, W, 4, Wd[1]);       // Stirnbohle vorn
    p.rect(0, d1 + 3, W, 1, Wd[2]);
    if (fine) {
      p.rect(0, d0 - 2, W, 0.5, '#8a5e40'); p.rect(0, d0 - 0.5, W, 0.5, Wd[1]); railGrain(p, d0 - 1.5, 1, Wd[2], null, 1);
      p.rect(0, d1 + 1, W, 0.5, Wd[4]); p.rect(0, d1 + 2.5, W, 0.5, Wd[1]);
      p.rect(0, d1 + 3, W, 0.5, Wd[3]); railGrain(p, d1 + 3.5, 3, Wd[0], Wd[2], 2); p.rect(0, d1 + 6.5, W, 0.5, Wd[0]);
      for (let x = 2; x < W; x += 8) NAIL4(p, x, d1 + 4.5);
    }
    // hinteres Geländer: Pfosten + Handlauf
    const postX = end < 0 ? 2 : end > 0 ? 12 : 7;
    p.rect(postX, 0, 3, d0, Wd[2]); p.rect(postX, 0, 1, d0, Wd[4]); p.px(postX + 1, 0, Wd[4]);
    if (fine) { plankV(p, postX, 0, 3, d0, Wd, 830 + end); p.rect(postX, 0, 0.5, d0, '#8a5e40'); p.rect(postX + 0.5, 0, 0.5, d0, Wd[4]); }
    p.rect(0, 3, W, 2, Wd[3]); p.rect(0, 3, W, 1, Wd[4]); p.rect(0, 7, W, 1, Wd[1]);
    if (fine) {
      p.rect(0, 3, W, 0.5, '#8a5e40'); p.rect(0, 4.5, W, 0.5, Wd[1]); railGrain(p, 3.5, 1, Wd[2], null, 3);
      p.rect(0, 7, W, 0.5, Wd[2]); NAIL4(p, postX + 1, 3.5);
    }
    // vordere Kante: niedriger Bordbalken mit Pfosten
    p.rect(0, d1 - 2, W, 2, Wd[3]); p.rect(0, d1 - 2, W, 1, Wd[5] ?? Wd[4]);
    p.rect(postX, d1 - 6, 3, 6, Wd[2]); p.rect(postX, d1 - 6, 1, 6, Wd[4]);
    if (fine) {
      p.rect(0, d1 - 2, W, 0.5, '#8a5e40'); p.rect(0, d1 - 0.5, W, 0.5, Wd[1]); railGrain(p, d1 - 1.5, 1, Wd[2], null, 4);
      plankV(p, postX, d1 - 6, 3, 4, Wd, 840 + end); p.rect(postX, d1 - 6, 3, 0.5, '#8a5e40'); NAIL4(p, postX + 1, d1 - 1.5);
    }
    if (end) {
      // Widerlager: Steinpfeiler mit Laterne
      p.rect(postX - 1, 0, 5, 3, STN[4]);
      if (fine) { bevel(p, postX - 1, 0, 5, 3, STN[5], STN[2]); p.dot(postX + 2.5, 1.5, STN[2]); }
      if (light) { p.rect(postX, -0 + 0, 3, 2, '#3a2410'); }
    }
  });
}

// schmaler Mühlsteg: ein Handlauf, grobe Bohlen
function footbridgeSeg(end) {
  const Wd = OUT.wood, W = 16, H = 52;
  return flat(W, H, 8, 14, (p) => {
    const fine = p.fine;
    for (let y = 0; y < 12; y++) for (let x = 0; x < W; x++) {
      if (end) p.px(x, y, lo(p) && hash2(x, y, 830) < 0.6 ? GR[1] : GR[2]);
      else p.px(x, y, lo(p) && (x + y) % 6 === 0 ? WTR[1] : WTR[0]);
    }
    if (fine) {
      if (end) for (let i = 0; i < 9; i++) { const x = (i * 5.5 + 1) % 15, y = 1.5 + (i * 3.7) % 9; tuft(p, x, y, GR[1], GR[3], GR[4]); }
      else for (let r = 0; r < 5; r++) for (let x = 0; x < 16; x += 5.33) { const xx = Math.floor(((x + r * 2.7) % 16) * 2) / 2; p.rect(xx, 1 + r * 2.2, 1.5, 0.5, r % 2 ? WTR[1] : WTR[2]); }
    }
    for (let x = 0; x < W; x++) for (let y = 14; y <= 44; y++) {
      const e = (x + 2) % 5;
      let c = e === 4 ? Wd[0] : e === 0 ? Wd[3] : Wd[2];
      if (lo(p) && hash2(x, y, 831) < 0.05) c = Wd[1];
      p.px(x, y, c);
    }
    if (fine) {
      for (let x = -2; x < W; x += 5) deckPlank(p, x, 14, 45, 5, Wd, x + 12, true);
      for (let x = -1; x < W; x += 5) if (x >= 0) { NAIL4(p, x, 16); NAIL4(p, x, 42); }
    }
    p.rect(0, 45, W, 3, Wd[1]); p.rect(0, 45, W, 1, Wd[2]);
    p.rect(0, 12, W, 2, Wd[1]);
    if (fine) {
      p.rect(0, 45, W, 0.5, Wd[3]); railGrain(p, 45.5, 2.5, Wd[0], null, 5); p.rect(0, 47.5, W, 0.5, Wd[0]);
      p.rect(0, 12, W, 0.5, Wd[2]); p.rect(0, 13.5, W, 0.5, Wd[0]);
    }
    const postX = end < 0 ? 3 : end > 0 ? 11 : 6;
    p.rect(postX, 2, 2, 12, Wd[2]); p.px(postX, 2, Wd[4]);
    p.rect(0, 5, W, 1, Wd[3]); p.rect(0, 6, W, 1, Wd[1]);
    if (fine) {
      plankV(p, postX, 2, 2, 12, Wd, 850 + end); p.rect(postX, 2, 2, 0.5, Wd[4]);
      p.rect(0, 5, W, 0.5, Wd[4]); railGrain(p, 5.5, 1, Wd[1], null, 6); p.rect(0, 6.5, W, 0.5, Wd[0]);
      NAIL4(p, postX + 0.5, 5);
    }
  });
}

// ------------------------------------------------------------ Friedhof
function graveNew(v) {
  return mk(16, 22, (p) => {
    const fine = p.fine;
    footShadow(p, 8, 20, 6, 1, 840 + v);
    if (v === 0) {
      // Keltenkreuz mit Ring
      p.rect(7, 2, 3, 18, STN[3]); p.rect(3, 6, 11, 3, STN[3]); p.rect(7, 2, 1, 18, STN[4]); p.rect(3, 6, 11, 1, STN[4]);
      for (let a = 0; a < 16; a++) { const x = 8.5 + Math.cos(a / 16 * Math.PI * 2) * 4, y = 7.5 + Math.sin(a / 16 * Math.PI * 2) * 4; if (lo(p)) p.px(x, y, a < 8 ? STN[2] : STN[4]); }
      p.rect(5, 18, 7, 3, STN[2]); p.rect(5, 18, 7, 1, STN[4]);
      if (fine) {
        // Ring im Feinraster (oben hell, unten dunkel), Kanten gefast, Flechtknoten in der Mitte, Riss
        for (let a = 0; a < 6.283; a += 0.06) {
          const x = 8.5 + Math.cos(a) * 4, y = 7.5 + Math.sin(a) * 4, up = Math.sin(a) < 0;
          p.dot(x, y, up ? STN[4] : STN[2]); p.dot(x + 0.5 * Math.cos(a), y + 0.5 * Math.sin(a), up ? STN[3] : STN[1]);
        }
        p.rect(7, 2, 3, 0.5, STN[5]); p.rect(9.5, 2.5, 0.5, 17.5, STN[1]); p.rect(3, 6, 11, 0.5, STN[5]); p.rect(3, 8.5, 11, 0.5, STN[1]);
        p.rect(7.5, 2.5, 0.5, 17, STN[5]); p.rect(3, 6, 0.5, 3, STN[5]);
        fmap(p, 7.5, 6.5, ['.4.', '414', '.4.'], { 4: STN[5], 1: STN[1] });
        crack(p, 8.5, 12, 3, 841, STN[1], STN[4]);
        p.rect(5, 18, 7, 0.5, STN[5]); p.rect(11.5, 18.5, 0.5, 2.5, STN[1]);
        for (const x of [5.5, 6.5, 10]) p.dot(x, 19.5, '#56603e');   // Flechte
      }
    } else if (v === 1) {
      // schiefer Stein, halb im Boden
      poly(p, [[4, 8], [11, 5], [13, 19], [5, 20]], (x, y) => (x < 7 ? STN[4] : x < 11 ? STN[3] : STN[2]));
      p.line(6, 11, 10, 9, STN[1]); p.line(6, 14, 11, 12, STN[1]);
      for (let i = 0; i < 6; i++) p.px(4 + i * 2, 19 - (i % 2), MOSS[1 + (i % 2)]);
      if (fine) {
        // Inschrift als eingeschlagene Rillen (dunkel, Lichtlippe unten), Kante oben hell, abgeschlagene Ecke
        p.fline(6, 11, 10, 9, STN[1]); p.fline(6, 11.5, 10, 9.5, STN[4]); p.fline(6, 14, 11, 12, STN[1]); p.fline(6, 14.5, 11, 12.5, STN[4]);
        p.fline(6.5, 16.5, 9.5, 15.5, STN[2]);
        p.fline(4, 8, 11, 5, STN[5]); p.fline(11, 5, 13, 19, STN[1]);
        fmap(p, 10.5, 5, ['.1', '12'], { 1: STN[1], 2: STN[2] });
        for (let i = 0; i < 6; i++) tuft(p, 4 + i * 2, 19.5 - (i % 2), MOSS[0], MOSS[1], MOSS[2]);
      }
    } else {
      // Obelisk
      poly(p, [[6, 3], [10, 3], [11, 18], [5, 18]], (x, y) => (x < 7 ? STN[4] : x < 9 ? STN[3] : STN[2]));
      p.rect(7, 1, 2, 2, STN[4]); p.rect(4, 18, 9, 3, STN[2]); p.rect(4, 18, 9, 1, STN[4]);
      p.px(8, 9, STN[1]); p.px(7, 10, STN[1]); p.px(8, 11, STN[1]);
      if (fine) {
        // Obelisk fein: Kanten als Feinlinien, Pyramidion mit Licht, eingeritzte Rune, Sockelfase
        p.fline(6, 3, 5, 18, STN[5]); p.fline(10.5, 3, 11.5, 18, STN[1]); p.fline(8.5, 3, 8.5, 18, STN[2]);
        fmap(p, 6.5, 0.5, ['..5...', '.554..', '55432.'], { 5: STN[5], 4: STN[4], 3: STN[3], 2: STN[2] });
        fmap(p, 7, 8.5, ['.1.', '1.1', '.1.', '.1.', '1.1'], { 1: STN[1] });
        p.dot(8, 9.5, STN[4]);
        p.rect(4, 18, 9, 0.5, STN[5]); p.rect(12.5, 18.5, 0.5, 2.5, STN[1]); p.rect(4, 20.5, 9, 0.5, STN[1]);
        crack(p, 5.5, 18.5, 1.5, 842, STN[1], null);
      }
    }
    p.px(5, 20, MOSS[2]); p.px(11, 20, MOSS[1]);
    if (fine) { tuft(p, 4.5, 20.5, MOSS[0], MOSS[1], MOSS[2]); tuft(p, 10.5, 20.5, MOSS[0], MOSS[1], MOSS[2]); }
  }, { ax: 8, box: [-5, -3, 5, 1], extra: { low: true } });
}

function mausoleum() {
  const W = 52, H = 56, cx = 26, bottom = H - 1;
  return mk(W, H, (p, g) => {
    const fine = p.fine;
    footShadow(p, cx, bottom - 1, 24, 2, 850);
    // Stufen
    p.rect(6, bottom - 3, W - 12, 3, STN[2]); p.rect(6, bottom - 3, W - 12, 1, STN[4]);
    if (fine) { p.rect(6, bottom - 3, W - 12, 0.5, STN[5]); p.rect(6, bottom - 1.5, W - 12, 0.5, STN[3]); p.rect(6, bottom - 0.5, W - 12, 0.5, STN[1]); for (let x = 11; x < W - 7; x += 8) p.rect(x, bottom - 2.5, 0.5, 2.5, STN[1]); }
    // Korpus aus Quadern
    if (fine) {
      stoneWallFine(p, 8, W - 8, 18, bottom - 3, 8, 5, 4, 851, STN, 11);
      for (const [x, y, l] of [[14, 30, 4], [37, 22, 3], [40, 41, 3.5]]) crack(p, x, y, l, x, STN[0], STN[3]);
    } else if (!coarseSkip(p)) for (let y = 18; y < bottom - 3; y++) for (let x = 8; x < W - 8; x++) {
      const row = Math.floor((y - 18) / 5), lx = (x + (row % 2) * 4) % 8, ly = (y - 18) % 5;
      let c = ly === 4 || lx === 0 ? STN[1] : ly === 0 ? STN[4] : STN[2 + (hash2(x >> 3, row, 851) < 0.3 ? 1 : 0)];
      if (x < 11) c = STN[Math.min(5, STN.indexOf(c) + 1)];
      p.px(x, y, c);
    }
    // Giebeldach
    poly(p, [[4, 20], [cx, 4], [W - 4, 20]], (x, y) => (x < cx ? STN[4] : STN[2]));
    p.line(4, 20, cx, 4, STN[5]); p.line(cx, 4, W - 4, 20, STN[1]); p.rect(4, 20, W - 8, 2, STN[1]);
    if (fine) {
      // Giebel: Gesimsplatten mit Fugen, Lichtgrat am First, Traufgesims mit Zahnschnitt
      p.fline(4, 19.5, cx, 3.5, '#7a7088'); p.fline(cx + 0.5, 4, W - 4, 19.5, STN[0]);
      for (let k = 1; k < 6; k++) { const t = k / 6; p.fline(4 + (cx - 4) * t, 20 - 16 * t, 4 + (cx - 4) * t + 1.5, 20 - 16 * t + 1.5, STN[3]); p.fline(W - 4 - (W - 4 - cx) * t, 20 - 16 * t, W - 4 - (W - 4 - cx) * t - 1.5, 20 - 16 * t + 1.5, STN[1]); }
      p.rect(4, 20, W - 8, 0.5, STN[3]); for (let x = 5; x < W - 4; x += 2) p.dot(x, 21, STN[0]);
    }
    // Tür mit Gitter, fahles Licht
    p.rect(cx - 7, 28, 14, bottom - 31, '#07060a');
    for (let x = cx - 6; x < cx + 7; x += 3) p.rect(x, 28, 1, bottom - 31, PAL.steel[2]);
    p.rect(cx - 7, 34, 14, 1, PAL.steel[2]);
    p.rect(cx - 8, 26, 16, 2, STN[4]);
    if (fine) {
      // Gitterstäbe rund: Glanzlinie links, Schatten rechts; Spitzen; Querband mit Nieten; Rost unten
      for (let x = cx - 6; x < cx + 7; x += 3) {
        p.rect(x, 28, 0.5, bottom - 31, PAL.steel[3]); p.rect(x + 0.5, 28, 0.5, bottom - 31, PAL.steel[1]);
        p.dot(x, 28.5, PAL.steel[4]); p.rect(x, bottom - 5, 1, 1, '#4a2a1e');
      }
      p.rect(cx - 7, 34, 14, 0.5, PAL.steel[3]); for (let x = cx - 6; x < cx + 7; x += 3) p.dot(x, 34, PAL.steel[5]);
      bevel(p, cx - 8, 26, 16, 2, STN[5], STN[1]);
      for (let y = 36; y < bottom - 4; y += 0.5) if (Math.round(y * 2) % 3 === 0) { g.dot(cx - 2, y, '#5a4a9a'); g.dot(cx + 2.5, y, '#4a3a8a'); }
      g.dot(cx - 2, 40, '#9a8ae0'); g.dot(cx + 2.5, 44, '#8a7ad0');
    } else for (let y = 36; y < bottom - 4; y++) if (y % 2) { g.px(cx - 2, y, '#5a4a9a'); g.px(cx + 2, y, '#4a3a8a'); }
    // Schädel-Relief im Giebel, Urnen
    p.rect(cx - 2, 11, 5, 4, BONE[3]); p.px(cx - 1, 12, '#140808'); p.px(cx + 1, 12, '#140808'); p.rect(cx - 1, 15, 3, 1, BONE[2]);
    if (fine) fmap(p, cx - 2, 10.5, [
      '..4444....',
      '.443333...',
      '4433333321',
      '43kk3kk321',
      '43kk3kk321',
      '4333n33321',
      '.32222221.',
      '..2t2t2...',
      '..1t1t1...',
    ], { 4: BONE[4], 3: BONE[3], 2: BONE[2], 1: BONE[1], k: '#140808', n: '#3a2a20', t: '#463d30' });
    for (const x of [5, W - 9]) {
      p.ellipse(x + 2, bottom - 6, 2.5, 3, STN[3]); p.px(x + 1, bottom - 8, STN[5]); p.rect(x + 1, bottom - 10, 3, 1, STN[2]);
      if (fine) { p.dot(x + 1, bottom - 7.5, STN[5]); p.dot(x + 1, bottom - 7, STN[4]); p.rect(x + 1.5, bottom - 4, 2, 0.5, STN[1]); p.rect(x + 1, bottom - 10, 3, 0.5, STN[4]); p.rect(x + 0.5, bottom - 6, 4, 0.5, STN[2]); }
    }
    // Efeu
    if (fine) {
      // Efeuranke: Stängel als Feinlinie, Blätter zweifarbig mit Licht oben links
      p.fline(9, bottom - 4, 12, 36, '#24301e'); p.fline(12, 36, 9.5, 27, '#24301e'); p.fline(9.5, 27, 13, 21, '#24301e');
      for (const [x, y] of [[9, 45], [11, 41], [12.5, 37], [10, 33], [11.5, 30], [9.5, 26], [12, 23], [14, 21], [10.5, 49], [13, 43]]) fmap(p, x - 0.5, y - 0.5, ['.21', '210', '.0.'], { 2: '#4e6a3e', 1: MOSS[2], 0: MOSS[1] });
    } else if (!coarseSkip(p)) for (let i = 0; i < 40; i++) { const x = 8 + Math.floor(hash2(i, 1, 852) * 10), y = 20 + Math.floor(hash2(i, 2, 852) * 30); p.px(x, y, MOSS[1 + (i % 2)]); }
  }, { ax: cx, box: [-18, -12, 18, 1], light: { dx: 0, dy: -14, radius: 40, color: [130, 110, 230], intensity: 0.45 } });
}

// ------------------------------------------------------------ Steinkreis, Höhle
function standingStone(v) {
  const H = [30, 34, 26][v];
  return mk(16, H, (p, g) => {
    const bottom = H - 1, fine = p.fine;
    footShadow(p, 8, bottom - 1, 6, 1, 860 + v);
    poly(p, [[3, bottom], [4, 6], [7, 1], [11, 3], [13, bottom]], (x, y) => {
      let i = x < 6 ? 4 : x < 9 ? 3 : x < 11 ? 2 : 1;
      if (lo(p) && hash2(x, y, 861 + v) < 0.08) i -= 1;
      if ((y + v * 3) % 9 === 0 && x > 5) i -= 1;
      return OUT.rock[clampI(i, 6)];
    });
    if (fine) {
      // Kanten im Licht/Schatten als Feinlinien, Schichtfugen mit Lichtlippe, Risse, Flechtenflecken
      const R = OUT.rock;
      p.fline(4, 6, 7, 1, R[5]); p.fline(3.5, bottom, 4, 6.5, R[5]); p.fline(7.5, 1, 11, 3, R[4]); p.fline(11.5, 3.5, 13, bottom, R[0]);
      for (let y = 0; y < bottom; y++) if ((y + v * 3) % 9 === 0 && y > 2) { p.rect(6, y + 1, 5, 0.5, R[4]); }
      crack(p, 9.5, 6 + v, 4, 862 + v, R[0], R[3]); crack(p, 5.5, bottom - 9, 3, 863 + v, R[1], null);
      for (const [x, y] of [[5, 5 + v], [10, 17], [6.5, 21 - v]]) fmap(p, x, y, ['.aa', 'ab.', '.a.'], { a: '#4e5a3a', b: '#6a7448' });
    }
    for (let y = bottom - 6; y < bottom; y++) for (let x = 3; x < 13; x++) {
      if (fine) { if (y === bottom - 3 && x % 2) tuft(p, x, y + 2.5 - (x % 3) * 0.5, MOSS[0], MOSS[1], MOSS[2]); }
      else if (lo(p) && hash2(x, y, 862) < 0.35) p.px(x, y, MOSS[1 + (x % 2)]);
    }
    if (fine) { p.rect(3.5, bottom - 2, 9.5, 2, MOSS[1]); p.rect(3.5, bottom - 2, 9.5, 0.5, MOSS[2]); }
    // Glutrune
    const ry = 9 + v * 2, RUNE = [[0, 0], [1, 1], [0, 2], [1, 3], [2, 2], [0, 4]];
    for (const [dx, dy] of RUNE) { p.px(7 + dx, ry + dy, PAL.ember[2]); if (!fine) g.px(7 + dx, ry + dy, PAL.ember[4]); }
    if (fine) for (const [dx, dy] of RUNE) {
      // Kerbe: Schattenkante oben links, heißer Kern
      p.dot(7 + dx, ry + dy, PAL.ember[1]); p.dot(7 + dx + 0.5, ry + dy + 0.5, PAL.ember[3]);
      g.rect(7 + dx, ry + dy, 1, 1, PAL.ember[3]); g.dot(7 + dx + 0.5, ry + dy, PAL.ember[5]); g.dot(7 + dx + 0.5, ry + dy + 0.5, '#fff6d8');
    }
  }, { ax: 8, box: [-5, -3, 5, 1] });
}

function caveMouth() {
  const W = 46, H = 38, cx = 23, bottom = H - 1;
  return mk(W, H, (p, g) => {
    const R = OUT.rock, fine = p.fine;
    // Felsrahmen
    if (fine) {
      // Fels in Schichtplatten: Bänke schräg, Plattenkante hell, Fuge dunkel, Licht links
      p.each(0, 0, W, H, (x, y) => {
        const e = ((x - cx - 0.5) / 22) ** 2 + ((y - bottom - 0.5) / 36) ** 2;
        if (e > 1) return null;
        const u = y + (x - cx) * 0.22 + Math.sin(x * 0.45) * 0.9, band = Math.floor(u / 4.5), fy = u - band * 4.5;
        const bw = 6 + Math.floor(hash2(band, 1, 872) * 6), sh = band * 3.3 + Math.sin(y * 0.7) * 0.6;
        const blk = Math.floor((x + sh) / bw), lx = x + sh - blk * bw;
        const hb = hash2(blk, band, 870);
        let i = 2 + (x < cx - 8 ? 1 : 0) - (x > cx + 10 ? 1 : 0) + (hb < 0.25 ? 1 : hb > 0.8 ? -1 : 0);
        if (fy < 0.5) i += 1; else if (fy >= 4 || (lx < 0.5 && hb < 0.6)) i = 0; else if (fy >= 3.5) i -= 1;
        if (e > 0.93) i -= 1;
        return R[clampI(i, 6)];
      });
    } else if (!coarseSkip(p)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ((x - cx) / 22) ** 2 + ((y - bottom) / 36) ** 2;
      if (e > 1) continue;
      let i = 2 + (x < cx - 8 ? 1 : 0) + (hash2(x >> 1, y >> 1, 870) < 0.2 ? 1 : 0) - (x > cx + 10 ? 1 : 0);
      p.px(x, y, R[clampI(i, 6)]);
    }
    // Öffnung
    if (fine) {
      p.each(cx - 14, 7, cx + 15, H, (x, y) => {
        const e = ((x - cx - 0.5) / 13) ** 2 + ((y - bottom - 0.5) / 29) ** 2;
        if (e > 1) return null;
        return e > 0.9 ? R[4] : e > 0.82 ? '#0c0a10' : '#040306';   // Lichtkante am Rand der Öffnung
      });
    } else for (let y = 8; y <= bottom; y++) for (let x = 0; x < W; x++) {
      const e = ((x - cx) / 13) ** 2 + ((y - bottom) / 29) ** 2;
      if (e > 1) continue;
      p.px(x, y, e > 0.8 ? '#0c0a10' : '#040306');
    }
    // Glutschimmer aus der Tiefe
    if (fine) {
      // gestufte Glut (harte Ringe), heißer Kern unten in der Mitte
      p.each(cx - 9, bottom - 9, cx + 10, H, (x, y) => {
        const e = ((x - cx - 0.5) / 9) ** 2 + ((y - bottom - 1) / 9) ** 2;
        if (e > 1) return null;
        if (((Math.floor(x * 2) + Math.floor(y * 2)) % 3) && e > 0.55) return null;   // äußerer Saum locker
        return e < 0.2 ? PAL.ember[2] : e < 0.55 ? PAL.ember[1] : PAL.ember[0];
      });
      g.ellipse(cx, bottom + 0.5, 6, 4.5, PAL.ember[0]); g.ellipse(cx, bottom + 0.5, 4, 3, PAL.ember[1]); g.ellipse(cx, bottom + 0.5, 2, 1.5, PAL.ember[2]); g.ellipse(cx, bottom + 1, 0.8, 0.5, PAL.ember[4]);
    } else for (let y = bottom - 8; y <= bottom; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      if ((x + y) % 3) continue;
      const k = 1 - Math.abs(x - cx) / 9;
      p.px(x, y, PAL.ember[k > 0.6 ? 1 : 0]); g.px(x, y, PAL.ember[k > 0.6 ? 2 : 1]);
    }
    // Moos, Wurzeln über dem Eingang
    for (let x = cx - 14; x < cx + 14; x++) {
      const t = 1 - ((x - cx) / 14) ** 2; const y = Math.round(bottom - 29 * Math.sqrt(Math.max(0, t))) - 1;
      p.px(x, y, MOSS[2]);
      const root = hash2(x, 0, 871) < 0.3;
      if (root) {
        if (fine) { const len = 3 + (x % 3); p.fline(x + 0.5, y, x + 0.5 + (x % 2 ? 0.5 : -0.5), y + len, BARK[2]); p.dot(x + (x % 2 ? 1 : 0), y + len + 0.5, BARK[1]); p.dot(x, y + 0.5, BARK[3]); }
        else p.line(x, y, x, y + 3 + (x % 3), BARK[2]);
      }
      if (fine) { p.dot(x + 0.5 * (x % 2), y - 0.5, x % 3 ? MOSS[2] : '#4e6a3e'); p.dot(x, y + 0.5, MOSS[1]); }
    }
    for (let i = 0; i < 3; i++) {
      p.px(cx - 6 + i * 6, bottom - 1, BONE[2]);
      if (fine) fmap(p, cx - 6.5 + i * 6, bottom - 1, ['.32.', '3211'], { 3: BONE[3], 2: BONE[2], 1: BONE[1] });
    }
  }, { ax: cx, ay: H - 1, light: { dx: 0, dy: -6, radius: 50, color: [255, 120, 50], intensity: 0.5 } });
}

// ------------------------------------------------------------ Dorfkleinkram
function woodpile() {
  const Wd = OUT.wood;
  return mk(30, 20, (p) => {
    const fine = p.fine;
    footShadow(p, 15, 18, 14, 1, 880);
    const logs = [[6, 15], [13, 15], [20, 15], [26, 15], [9.5, 10], [16.5, 10], [23, 10], [13, 5], [20, 5]];
    for (const [x, y] of logs) { p.rect(x - 3, y - 5, 7, 5, Wd[2]); p.rect(x - 3, y - 5, 7, 1, Wd[3]); if (fine) { p.rect(x - 3, y - 5, 7, 0.5, Wd[4]); grain(p, x - 3, y - 4.5, 7, 3, BARK[1], null, x * 7 + y, true); } }
    for (const [x, y] of logs) {
      p.ellipse(x, y, 3.2, 2.8, Wd[1]); p.ellipse(x, y, 2.4, 2, '#8a6a44'); p.px(x, y, '#6a4a2c'); p.px(x - 1, y - 1, '#b8945c');
      if (fine) {
        // Hirnholz: Jahresringe, Kern, Trockenriss, Rinde als Rand (oben Licht)
        p.ellipse(x, y, 1.8, 1.4, '#9a7a50'); p.ellipse(x, y, 1.3, 1, '#7a5a38'); p.ellipse(x, y, 0.8, 0.6, '#9a7a50'); p.dot(x + 0.5, y + 0.5, '#5a3a20');
        p.fline(x + 0.5, y + 0.5, x + 2.5, y - 0.5, '#4a3020'); p.dot(x - 1, y - 0.5, '#c8a46a'); p.dot(x - 0.5, y - 1, '#c8a46a');
        for (let a = 3.4; a < 4.9; a += 0.25) p.dot(x + 0.5 + Math.cos(a) * 3.1, y + 0.5 + Math.sin(a) * 2.7, BARK[3]);
      }
    }
    p.rect(0, 0, 30, 2, SLATE[2]); p.rect(0, 0, 30, 1, SLATE[3]); p.rect(1, 2, 2, 16, Wd[2]); p.rect(27, 2, 2, 16, Wd[1]);
    if (fine) {
      // Pultdach: Schindeln mit Stoß, Kante unten dunkel; Pfosten gemasert
      p.rect(0, 0, 30, 0.5, SLATE[4]); p.rect(0, 1.5, 30, 0.5, SLATE[0]);
      for (let x = 2.5; x < 30; x += 3) { p.rect(x, 0.5, 0.5, 1, SLATE[0]); p.dot(x + 0.5, 0.5, SLATE[4]); }
      plankV(p, 1, 2, 2, 16, Wd, 881); plankV(p, 27, 2, 2, 16, Wd, 882); nail(p, 1.5, 2.5); nail(p, 27.5, 2.5);
    }
  }, { ax: 15, box: [-13, -5, 13, 1] });
}

function farmCart() {
  const Wd = OUT.wood, I = PAL.steel;
  return mk(42, 30, (p) => {
    const fine = p.fine;
    footShadow(p, 20, 28, 18, 2, 890);
    p.line(33, 19, 41, 25, Wd[2]); p.line(33, 20, 41, 26, Wd[1]);
    if (fine) p.fline(33, 18.5, 41, 24.5, Wd[4]);
    p.ellipse(28, 21, 6, 6.5, Wd[0]);
    p.rect(3, 12, 31, 8, Wd[2]); for (let x = 3; x < 34; x += 5) p.rect(x, 12, 1, 8, Wd[1]);
    p.rect(3, 12, 31, 1, Wd[4]); p.rect(3, 19, 31, 1, Wd[0]);
    if (fine) {
      // Seitenbretter: waagerechte Fuge, Maserung, Rungen mit Lichtkante und Nagelköpfen
      p.rect(3, 15.5, 31, 0.5, Wd[1]); grain(p, 3, 13, 31, 2.5, Wd[1], Wd[3], 891, true); grain(p, 3, 16, 31, 3, Wd[1], null, 892, true);
      for (let x = 3; x < 34; x += 5) { p.rect(x, 12, 0.5, 8, Wd[3]); p.rect(x + 0.5, 12, 0.5, 8, Wd[0]); nail(p, x, 13); nail(p, x, 18); }
      p.rect(3, 12, 31, 0.5, '#8a5e40');
    }
    // Heuladung
    for (let y = 2; y < 13; y++) for (let x = 4; x < 33; x++) {
      const e = ((x - 18) / 15) ** 2 + ((y - 12) / 10) ** 2; if (e > 1) continue;
      let i = 3 + (x < 12 ? 1 : 0) - (x > 26 ? 1 : 0) - (lo(p) && (x + y * 2) % 5 === 0 ? 1 : 0); p.px(x, y, STRAW[clampI(i, 6)]);
    }
    if (fine) {
      // Halmsträhnen fallen nach außen, Lagen gestuft
      for (let y = 3.5, r = 0; y < 11.5; y += 2, r++) for (let x = 5.5 + (r % 2) * 1.5; x < 32; x += 3) {
        const e = ((x - 18) / 15) ** 2 + ((y - 12) / 10) ** 2; if (e > 0.8) continue;
        const s2 = x < 18 ? -0.5 : 0.5, c = x < 12 ? STRAW[5] : x > 26 ? STRAW[2] : STRAW[4];
        p.dot(x, y, c); p.dot(x + s2, y + 0.5, c); p.dot(x + s2 * 2, y + 1, x > 26 ? STRAW[0] : STRAW[2]);
      }
    }
    for (let i = 0; i < 6; i++) p.px(6 + i * 4, 2 + (i % 2) * 2, STRAW[5]);
    if (fine) for (let i = 0; i < 6; i++) { p.dot(6.5 + i * 4, 1.5 + (i % 2) * 2, STRAW[4]); p.dot(6 + i * 4 - 0.5, 1 + (i % 2) * 2, STRAW[3]); }
    const wx = 13, wy = 21;
    p.ellipse(wx, wy, 7, 7, I[1]); p.ellipse(wx, wy, 6, 6, Wd[2]); p.ellipse(wx, wy, 5, 5, '#0d0a0c');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.line(wx, wy, wx + Math.cos(a) * 5, wy + Math.sin(a) * 5, i < 4 ? Wd[2] : Wd[3]); }
    p.ellipse(wx, wy, 1.5, 1.5, Wd[4]);
    if (fine) {
      // Eisenreif mit Glanzbogen oben links, Felge mit Lichtkante, Nabe mit Metallkappe
      for (let a = 0; a < 6.283; a += 0.04) {
        const c = Math.cos(a), s2 = Math.sin(a), lit = c + s2 < -0.4;
        p.dot(wx + 0.5 + c * 7.05, wy + 0.5 + s2 * 7.05, lit ? I[4] : I[1]);
        p.dot(wx + 0.5 + c * 6.55, wy + 0.5 + s2 * 6.55, lit ? I[3] : I[0]);
        p.dot(wx + 0.5 + c * 5.8, wy + 0.5 + s2 * 5.8, lit ? Wd[4] : Wd[1]);
      }
      p.dot(wx - 4, wy - 4.5, I[5]);
      fmap(p, wx - 1, wy - 1, ['.43.', '4532', '3221', '.11.'], { 5: I[5], 4: I[4], 3: I[3], 2: I[2], 1: I[1] });
    }
  }, { ax: 20, box: [-16, -5, 14, 1] });
}

function signpost() {
  const Wd = OUT.wood;
  return mk(30, 34, (p) => {
    const fine = p.fine;
    footShadow(p, 14, 32, 5, 1, 900);
    p.rect(13, 4, 3, 29, Wd[2]); p.rect(13, 4, 1, 29, Wd[4]); p.px(14, 3, Wd[3]);
    if (fine) { plankV(p, 13, 4, 3, 26, Wd, 901); p.rect(13, 4, 0.5, 26, '#8a5e40'); fmap(p, 13.5, 3, ['.43.', '4321'], { 4: Wd[4], 3: Wd[3], 2: Wd[2], 1: Wd[1] }); }
    const board = (y, dir, len, c, k) => {
      const x0 = dir > 0 ? 15 : 14 - len;
      p.rect(x0, y, len, 5, c); p.rect(x0, y, len, 1, Wd[4]); p.rect(x0, y + 4, len, 1, Wd[1]);
      const tip = dir > 0 ? x0 + len : x0 - 1;
      p.px(tip, y + 1, c); p.px(tip, y + 2, c); p.px(tip, y + 3, c); p.px(tip + dir, y + 2, c);
      if (lo(p)) for (let i = 2; i < len - 2; i += 2) p.px(x0 + i, y + 2, Wd[1]);
      if (fine) {
        // Brett: Kante fein, Maserung, eingebrannte Schrift (Feinstriche), Nagelköpfe am Pfosten
        p.rect(x0, y, len, 0.5, '#8a5e40'); p.rect(x0, y + 4.5, len, 0.5, Wd[0]);
        grain(p, x0, y + 1, len, 3, Wd[1], null, 905 + k, true);
        for (let i = 2; i < len - 2; i += 1.5) {
          const h = hash2(i * 2, k, 906);
          if (h < 0.2) continue;
          p.dot(x0 + i, y + 1.5 + (h > 0.6 ? 0 : 0.5), '#1e120c'); p.dot(x0 + i, y + 2.5, '#1e120c'); if (h > 0.45) p.dot(x0 + i + 0.5, y + (h > 0.75 ? 1.5 : 3), '#1e120c');
        }
        nail(p, dir > 0 ? 15.5 : 13.5, y + 1); nail(p, dir > 0 ? 15.5 : 13.5, y + 3);
        p.dot(tip + dir * 0.5 + (dir < 0 ? 0.5 : 0), y + 1.5, Wd[4]);
      }
    };
    board(6, 1, 12, Wd[3], 0); board(13, -1, 11, Wd[3], 1); board(20, 1, 10, Wd[2], 2);
    p.rect(13, 30, 4, 3, STN[3]); p.px(12, 32, STN[2]); p.px(17, 32, STN[2]);
    if (fine) { bevel(p, 13, 30, 4, 3, STN[5], STN[1]); p.dot(15, 31, STN[1]); p.dot(15.5, 31.5, STN[4]); tuft(p, 11.5, 32.5, GR[1], GR[3], GR[4]); }
  }, { ax: 14, box: [-2, -3, 2, 1], extra: { sign: true } });
}

// Flammen-Frames fürs Lagerfeuer (eigene, da der Satz ohne Requisiten auskommt)
function flameFrames() {
  const E = PAL.ember, out = [];
  for (let f = 0; f < 6; f++) {
    const c = new PixelCanvas(12, 16);
    for (let k = 0; k < 3; k++) {
      const bx = 3 + k * 3, h = 9 + Math.round(Math.sin(f * 1.3 + k * 2.1) * 3) + (k === 1 ? 3 : 0);
      for (let i = 0; i < h; i++) {
        const sway = Math.round(Math.sin(f * 0.9 + i * 0.6 + k) * (i / h) * 1.6);
        const w = Math.max(1, Math.round((1 - i / h) * 2.4));
        const col = i < 2 ? E[5] : i < h * 0.45 ? E[4] : i < h * 0.75 ? E[3] : E[2];
        c.rect(bx + sway - (w >> 1), 15 - i, w, 1, col);
      }
    }
    out.push(c.canvas);
  }
  return out;
}

function campfireV() {
  const base = createCampfire();
  return { sprite: base, box: [-8, -3, 8, 2], low: true, flames: flameFrames(), flameAt: { dx: -6, dy: -17 }, light: { dx: 0, dy: -8, radius: 130, color: [255, 140, 60], intensity: 1, flicker: 0.3, bloom: 0.4 }, embers: { dx: 0, dy: -10, rate: 5 } };
}

function lampV() {
  const s = createLamp();
  let gl;
  if ((s.res ?? 1) >= 2 && s.canvas.width % 2 === 0) {
    // feine Leuchtebene in Texelgröße des Sprites (Versatz 0.5 = Umriss): Glutsaum, heller Kern, weißer Punkt
    gl = new FineCanvas(s.canvas.width / 2, s.canvas.height / 2, 2); gl.translate(0.5, 0.5);
    gl.rect(3, 2, 3, 3, PAL.ember[3]); gl.rect(3, 2, 2.5, 2.5, PAL.ember[4]); gl.rect(3.5, 2.5, 1.5, 1.5, PAL.ember[5]); gl.dot(4, 3, '#ffffff');
  } else {
    gl = new PixelCanvas(...glowCanvasSize(s));
    gl.rect(4, 3, 3, 3, PAL.ember[4]); gl.px(5, 4, PAL.ember[5]);
  }
  return { sprite: s, glow: gl.canvas, box: [-2, -2, 2, 1], shadow: 8, light: { dx: 0, dy: -26, radius: 78, color: [255, 170, 90], intensity: 0.9, flicker: 0.12, bloom: 0.35 } };
}

function barrelSacks() {
  const Wd = OUT.wood;
  return mk(20, 16, (p) => {
    const fine = p.fine, I = PAL.steel;
    footShadow(p, 10, 14, 9, 1, 910);
    p.rect(2, 2, 9, 13, Wd[2]); p.rect(2, 2, 3, 13, Wd[3]); p.rect(10, 3, 1, 12, Wd[1]);
    p.rect(1, 5, 11, 1, PAL.steel[1]); p.rect(1, 11, 11, 1, PAL.steel[1]); p.ellipse(6.5, 2, 4.5, 1.2, Wd[4]);
    if (fine) {
      // Dauben: Fugen fein, Lichtkante, Maserung; Reifen mit Glanzlinie und Nieten; Deckel mit Ring
      for (const x of [4, 6, 8, 9.5]) { p.rect(x, 2.5, 0.5, 12.5, Wd[1]); p.rect(x + 0.5, 2.5, 0.5, 12.5, x < 6 ? Wd[4] : Wd[3]); }
      p.rect(2, 2.5, 0.5, 12.5, Wd[4]);
      for (const y of [5, 11]) { p.rect(1, y, 11, 0.5, I[3]); p.rect(1.5, y, 3, 0.5, I[4]); p.dot(2, y, I[5]); p.rect(1, y + 0.5, 11, 0.5, I[0]); p.dot(5, y + 0.5, I[2]); p.dot(9, y + 0.5, I[2]); }
      p.ellipse(6.5, 2, 3.5, 0.8, '#7a5236'); p.ellipse(6.5, 2, 2.5, 0.5, Wd[3]); p.dot(4.5, 1.5, '#a0784e');
    }
    p.ellipse(15, 11, 4, 4, '#8a8070'); p.px(13, 8, '#b8ae98'); p.px(16, 14, '#5a5446'); p.rect(14, 7, 2, 1, '#5a5446');
    if (fine) {
      // Sack: Schnürung, zwei Falten (Tal/Grat), Licht oben links, Grobgewebe nur angedeutet an der Kante
      fmap(p, 13.5, 6, ['.44.', '3rr2', '.32.'], { 4: '#c8bea8', 3: '#b8ae98', 2: '#8a8070', r: '#5a3a20' });
      p.fline(13, 9, 12.5, 12.5, '#b8ae98'); p.fline(16.5, 9, 17.5, 13, '#5a5446'); p.fline(16, 9, 17, 13, '#9a907e');
      p.dot(12.5, 9.5, '#c8bea8'); p.dot(15, 14.5, '#4a4438');
    }
  }, { ax: 10, box: [-8, -4, 8, 1] });
}

// Bohlensteg über den Weiher (Nord–Süd): Anker in der Kachel darüber, Sprite deckt die Kachel darunter
function boardwalkSeg(v) {
  const Wd = OUT.wood;
  return flat(32, 16, 8, -2, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      if (x < 2 || x > 29) { p.px(x, y, (y + v) % 8 < 2 ? Wd[1] : WTR[1]); continue; }
      const plank = Math.floor((y + v) / 4), e = (y + v) % 4;
      let c = e === 3 ? Wd[0] : e === 0 ? Wd[3] : Wd[2 + (hash2(plank, 0, 920 + v) < 0.3 ? 1 : 0)];
      if (lo(p) && hash2(x, y, 921 + v) < 0.04) c = Wd[1];
      p.px(x, y, c);
    }
    p.rect(2, 0, 1, 16, Wd[4]); p.rect(29, 0, 1, 16, Wd[1]);
    if (v === 0) { p.rect(0, 2, 3, 6, Wd[3]); p.rect(0, 2, 3, 1, Wd[4]); p.rect(29, 2, 3, 6, Wd[1]); }
    if (p.fine) {
      // Bohlen quer: Fuge 1 Feinpixel, Lichtkante oben, Maserung längs, Nagelköpfe an beiden Enden;
      // Reihen im 4er-Takt (y + v), damit Kacheln untereinander nahtlos bleiben
      for (let y0 = -v; y0 < 16; y0 += 4) {
        const plank = Math.floor((y0 + v) / 4) + 1;
        const a = Math.max(0, y0), b = Math.min(16, y0 + 4);
        if (y0 + 3 >= 0 && y0 + 3 < 16) { p.rect(3, y0 + 3, 26, 0.5, Wd[1]); p.rect(3, y0 + 3.5, 26, 0.5, Wd[0]); }
        if (y0 >= 0) p.rect(3, y0, 26, 0.5, '#7e5638');
        if (b - a > 1) grain(p, 3, Math.max(a, y0 + 0.5), 26, Math.min(b, y0 + 3) - Math.max(a, y0 + 0.5), Wd[1], Wd[3], plank * 3 + v, true);
        if (y0 + 1 >= 0 && y0 + 1 < 16) { NAIL4(p, 3.5, y0 + 1); NAIL4(p, 27.5, y0 + 1); }
        if (hash2(plank, 5, 922 + v) < 0.5 && y0 + 1.5 >= 0 && y0 + 2 < 16) { const kx = 8 + hash2(plank, 6, 922) * 14; p.dot(kx, y0 + 1.5, Wd[0]); p.dot(kx + 0.5, y0 + 1.5, Wd[1]); p.dot(kx - 0.5, y0 + 1.5, Wd[1]); p.dot(kx, y0 + 1, Wd[4]); }
      }
      p.rect(2, 0, 0.5, 16, '#8a5e40'); p.rect(29.5, 0, 0.5, 16, Wd[0]);
      for (let y = 0; y < 16; y += 0.5) { const k = ((y + v) % 8 + 8) % 8; if (k >= 2 && k < 2.5) { p.dot(0.5, y, WTR[3]); p.dot(30.5, y, WTR[3]); } }
      if (v === 0) { bevel(p, 0, 2, 3, 6, '#8a5e40', Wd[1], { left: false }); bevel(p, 29, 2, 3, 6, Wd[2], Wd[0], { left: false }); }
    }
  });
}

// ------------------------------------------------------------ Runde 5: Questobjekte
// Feuerstein: Basaltsäule mit eiserner Feuerschale (kalt / entzündet)
function beacon(on) {
  const W = 26, H = 54, cx = 13, b = H - 1;
  return mk(W, H, (p, g) => {
    const fine = p.fine;
    footShadow(p, cx, b - 1, 11, 2, 1501);
    // Sockel aus drei Steinen
    for (const [x, y, r] of [[5, b - 2, 3.4], [21, b - 2, 3.2], [13, b - 1, 4]]) {
      p.ellipse(x, y, r, r * 0.6, BASALT[2]); p.px(Math.round(x - 1), Math.round(y - 1), BASALT[4]);
      if (fine) { for (let a = 3.3; a < 4.9; a += 0.2) p.dot(x + 0.5 + Math.cos(a) * r * 0.9, y + 0.5 + Math.sin(a) * r * 0.55, BASALT[4]); p.dot(x - 0.5, y - 1, BASALT[5]); }
    }
    // Säule
    for (let y = 16; y < b - 2; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const t = (x - (cx - 4)) / 8;
      let i = t < 0.25 ? 4 : t < 0.6 ? 3 : 2;
      if (y % 6 === 0) i -= 1;
      if (lo(p) && hash2(x, y, 1502) < 0.08) i -= 1;
      p.px(x, y, BASALT[clampI(i, 6)]);
    }
    if (fine) {
      // Trommeln: Fuge dunkel + Lichtkante darunter, Kanten fein, Risse statt Sprenkel
      for (let y = 18; y < b - 2; y += 6) { p.rect(cx - 4, y, 9, 0.5, BASALT[0]); p.rect(cx - 3.5, y + 0.5, 8, 0.5, BASALT[4]); }
      p.rect(cx - 4, 16, 0.5, b - 18, BASALT[5]); p.rect(cx + 4.5, 16, 0.5, b - 18, BASALT[0]);
      crack(p, cx + 2.5, 37, 4, 1503, BASALT[0], BASALT[3]); crack(p, cx - 2, 44, 2.5, 1504, BASALT[1], BASALT[4]);
    }
    // eingeritzte Glutrune
    const RUNE = [[cx, 24], [cx, 25], [cx - 1, 26], [cx + 1, 26], [cx, 27], [cx, 28], [cx - 1, 30], [cx + 1, 30]];
    for (const [x, y] of RUNE) {
      p.px(x, y, on ? EMB[4] : BASALT[0]);
      if (on && !fine) g.px(x, y, EMB[5]);
      if (fine) {
        p.dot(x, y, on ? EMB[3] : BASALT[0]); p.dot(x + 0.5, y + 0.5, on ? EMB[5] : BASALT[3]);
        if (on) { g.rect(x, y, 1, 1, EMB[4]); g.dot(x + 0.5, y, EMB[5]); g.dot(x + 0.5, y + 0.5, '#fff6d8'); }
      }
    }
    // Feuerschale
    p.rect(cx - 8, 13, 17, 3, IRON[1]); p.rect(cx - 8, 13, 17, 1, IRON[3]); p.rect(cx - 6, 16, 13, 1, IRON[0]);
    p.px(cx - 9, 12, IRON[2]); p.px(cx + 9, 12, IRON[1]);
    if (fine) {
      // Schale: 5 Stufen, Glanzlinie oben, Glanzpunkt, Nieten, Rost unten
      p.rect(cx - 8, 13, 17, 0.5, IRON[4]); p.rect(cx - 7, 13, 5, 0.5, IRON[5]); p.dot(cx - 6, 13.5, '#ffffff');
      p.rect(cx - 8, 13.5, 17, 0.5, IRON[3]); p.rect(cx - 8, 14.5, 17, 1, IRON[1]); p.rect(cx - 7.5, 15.5, 16, 0.5, IRON[0]);
      for (let x = cx - 6; x <= cx + 6; x += 3) { p.dot(x, 14.5, IRON[4]); p.dot(x + 0.5, 15, IRON[0]); }
      p.dot(cx + 3, 16, '#4a2a1e'); p.dot(cx - 2, 16, '#4a2a1e');
    }
    if (!on) {
      // kalte Kohle, Asche
      p.ellipse(cx, 12, 6, 1.6, '#1a1517'); p.px(cx - 2, 11, '#2c2629'); p.px(cx + 2, 11, '#3a3336'); p.px(cx, 11, '#221d1f');
      if (fine) for (const [x, y, c] of [[cx - 4, 11.5, '#3a3336'], [cx - 1, 11, '#4a4246'], [cx + 3.5, 11.5, '#2c2629'], [cx + 1, 10.5, '#3a3336'], [cx - 2.5, 10.5, '#221d1f']]) { p.dot(x, y, c); p.dot(x + 0.5, y + 0.5, '#100c0e'); }
    } else {
      // Flammen
      const fl = [[0, 12, 2.6], [-3, 9, 2], [3, 8, 2], [0, 5, 1.6], [-1, 2, 1], [2, 3, 0.9]];
      for (const [dx, y, r] of fl) { p.ellipse(cx + dx, y, r, r * 1.3, EMB[3]); if (!fine) g.ellipse(cx + dx, y, r + 0.6, r * 1.4, EMB[4]); }
      for (const [dx, y] of [[0, 10], [-2, 8], [2, 7], [0, 6]]) { p.px(cx + dx, y, EMB[5]); if (!fine) g.px(cx + dx, y, '#fff2c0'); }
      p.ellipse(cx, 12, 6, 1.4, EMB[2]);
      if (fine) {
        // Flammenzungen: Saum orange, Innen gelb, heißer weißer Kern unten; Leuchtebene gestuft
        for (const [dx, y, r] of fl) { p.ellipse(cx + dx, y + 0.3, r * 0.6, r * 0.85, EMB[4]); }
        for (const [dx, y, r] of fl) { g.ellipse(cx + dx, y, r + 0.6, r * 1.4, EMB[2]); g.ellipse(cx + dx, y + 0.3, r * 0.6, r * 0.9, EMB[3]); }
        for (const [dx, y] of [[0, 10], [-2, 8], [2, 7], [0, 6]]) { p.dot(cx + dx, y, '#fff2c0'); p.dot(cx + dx + 0.5, y + 0.5, EMB[5]); g.dot(cx + dx, y, EMB[5]); g.dot(cx + dx + 0.5, y + 0.5, '#fff2c0'); }
        // dunkle Zungenspitzen trennen die Flammen (Saum statt Klumpen)
        for (const [dx, y] of [[-1.5, 6], [1.5, 5], [0.5, 1], [-2.5, 4]]) { p.dot(cx + dx, y, EMB[2]); p.dot(cx + dx, y + 0.5, EMB[3]); }
        p.ellipse(cx, 11.8, 5, 0.9, EMB[3]); p.ellipse(cx, 11.8, 2.5, 0.5, EMB[5]);
        for (const [x, y] of [[cx - 4, 12], [cx + 3, 12], [cx - 1, 12.5]]) p.dot(x, y, EMB[1]);
      }
    }
  }, { ax: cx, ay: b - 1, box: [-6, -3, 6, 1], light: on ? { dx: 0, dy: -36, radius: 150, color: [255, 140, 60], intensity: 1 } : undefined, extra: on ? { embers: { dx: 0, dy: -38, rate: 7 } } : undefined });
}

// Dorfbrunnen mit Reinsalz-Schimmer (Questobjekt: off = normal, on = gesegnet)
function saltWell(on) {
  const s = createWell();
  const e = { sprite: s, box: [-11, -9, 11, 1] };
  if (on) {
    if ((s.res ?? 1) >= 2 && s.canvas.width % 2 === 0) {
      // fein: Salzkristalle als kleine Funkelkreuze (heller Kern, Strahlen 1 Feinpixel), Glanz am Dachrand
      const gl = new FineCanvas(s.canvas.width / 2, s.canvas.height / 2, 2); gl.translate(0.5, 0.5);
      for (let i = 0; i < 14; i++) {
        const x = 4 + Math.floor(hash2(i, 1, 1511) * 16 * 2) / 2, y = 20 + Math.floor(hash2(i, 2, 1511) * 3 * 2) / 2;
        gl.dot(x, y, '#ffffff');
        if (i % 3 === 0) { gl.dot(x - 0.5, y, '#9ac0e8'); gl.dot(x + 0.5, y, '#9ac0e8'); gl.dot(x, y - 0.5, '#9ac0e8'); gl.dot(x, y + 0.5, '#9ac0e8'); }
        else gl.dot(x + 0.5, y, '#cfe8ff');
      }
      for (let i = 0; i < 6; i++) { gl.dot(5 + i * 2, 11 - (i % 2), '#e8f4ff'); gl.dot(5.5 + i * 2, 11 - (i % 2), '#8aa8c8'); }
      e.glow = gl.canvas;
    } else {
      const gl = new PixelCanvas(...glowCanvasSize(s));
      for (let i = 0; i < 14; i++) { const x = 5 + Math.floor(hash2(i, 1, 1511) * 16), y = 21 + Math.floor(hash2(i, 2, 1511) * 3); gl.px(x, y, i % 3 ? '#cfe8ff' : '#ffffff'); }
      for (let i = 0; i < 6; i++) gl.px(6 + i * 2, 12 - (i % 2), '#e8f4ff');
      e.glow = gl.canvas;
    }
    e.light = { dx: 0, dy: -12, radius: 70, color: [190, 220, 255], intensity: 0.7 };
  }
  return e;
}

export function createValleyDecor() {
  return {
    valleyPines: [fir(1201, 52), fir(1207, 46), fir(1213, 56), oak(1219), wrap(createPine(7), { box: [-3, -3, 3, 1], shadow: 18 })],
    forestPines: [forestClump(31), forestClump(37), forestClump(41), forestClump(43), forestClump(47)],
    oaks: [oak(1301), oak(1307)],
    deadTrees: [5, 9, 13].map((s) => wrap(createDeadTree(s), { box: [-3, -3, 3, 1], shadow: 16 })),
    rocks: [wrap(createRock(2), { box: [-6, -5, 6, 1], low: true }), wrap(createRock(6), { box: [-6, -5, 6, 1], low: true }), boulder(1401), boulder(1403)],
    bushes: [1, 2, 3].map((s) => wrap(createBush(s), { shadow: 12 })),
    flowers: [0, 1, 2].map(flowers),
    reeds: [0, 1, 2].map(reedsV),
    mushrooms: [0, 1, 2].map(mushrooms),
    fallenLog: [fallenLog(0), fallenLog(1)],
    fenceH: wrap(createFence(false), { low: true, box: [-8, -3, 8, 1] }),
    fenceV: wrap(createFence(true), { low: true }),
    graves: [...[1, 2, 3, 4].map((s) => wrap(createGrave(s), { box: [-5, -3, 5, 1], low: true })), graveNew(0), graveNew(1), graveNew(2)],
    mausoleum: mausoleum(),
    lamp: lampV(),
    campfire: campfireV(),
    well: wrap(createWell(), { box: [-11, -9, 11, 1] }),
    crates: [wrap(createCrate(0), { box: [-6, -4, 6, 1], low: true, shadow: 12 }), wrap(createCrate(1), { box: [-6, -4, 6, 1], low: true, shadow: 12 }), barrelSacks()],
    signpost: signpost(),
    watermill: watermill(),
    bridgeL: bridgeSeg(-1), bridgeM: [bridgeSeg(0)], bridgeR: bridgeSeg(1),
    footbridgeL: footbridgeSeg(-1), footbridgeM: footbridgeSeg(0), footbridgeR: footbridgeSeg(1),
    boardwalk: [boardwalkSeg(0), boardwalkSeg(1), boardwalkSeg(2)],
    wheatField: [wheat(0), wheat(1), wheat(2)],
    cabbageField: [cabbage(0), cabbage(1)],
    furrowField: [furrows(0), furrows(1)],
    haystack: haystack(),
    scarecrow: scarecrow(),
    cottage: cottage(0),
    cottageB: cottage(1),
    marketStall: [marketStall(0), marketStall(1), marketStall(2)],
    woodpile: woodpile(),
    farmCart: farmCart(),
    standingStones: [0, 1, 2].map(standingStone),
    caveMouth: caveMouth(),
    beacon: { off: beacon(false), on: beacon(true) },
    saltWell: { off: saltWell(false), on: saltWell(true) },
  };
}
