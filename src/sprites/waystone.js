import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';
import { buildFine, fmap } from './npcFine.js';

// Wegstein (Teleporter zwischen Städten): Runen-Obelisk aus altem Basalt auf
// gestuftem Sockel, Bronzebänder, eingekerbte Runen und ein schwebender
// Seelenkristall über der Spitze. Die Runen leuchten auf eigenen Glow-Ebenen
// (dim = noch nicht entdeckt, lit = freigeschaltet); der Kristall wird vom Code
// mit leichtem Schweben gezeichnet.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss); im Feinraster FineCanvas (W+1)×(H+1) mit
// Versatz 0,5 (Texelgröße = Sprite inkl. Umriss, drawGlowLayer zeichnet beides richtig).
// Feinraster Stufe B: buildFine – alte Zeichnung grob, fein dazu Fugen/Risse/Kantenlicht im Basalt, Bronze mit Glanz
// und Patina-Läufern, Runen als Kerben mit heißem Kern und gestuftem Saum, Kristall mit Facetten.
const STONE = ['#0c0a10', '#16121b', '#211b28', '#2e2637', '#3d3348', '#4f445a', '#64586e'];
const MOSS = ['#1c2a1e', '#2a3d2a', '#3c5236'];
const BRONZE = PAL.gold;
const PATINA = ['#1e3a32', '#2f5a4e', '#4a8a74'];
export const RUNE = ['#082230', '#0d3e52', '#15708a', '#2fb2cf', '#86ecff', '#e6ffff'];

// Runenformen 3×4 (x, y)
const GLYPHS = [
  [[1, 0], [0, 1], [2, 1], [1, 2], [1, 3]],
  [[0, 0], [2, 0], [1, 1], [1, 2], [0, 3], [2, 3]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [0, 3]],
  [[1, 0], [1, 1], [0, 2], [2, 2], [1, 3]],
  [[0, 0], [2, 1], [1, 1], [0, 2], [2, 3], [1, 3]],
];

// Leuchtebene passend zum Sprite (W×H Weltpixel): fein (Versatz 0,5) oder alt (Versatz 1).
function glowLayer(w, h) {
  if (fineRes() >= 2) { const g = new FineCanvas(w + 1, h + 1, 2); return { g, fine: true, G: (x, y, c) => g.px(x + 0.5, y + 0.5, c) }; }
  const g = new PixelCanvas(w + 2, h + 2);
  return { g, fine: false, G: (x, y, c) => g.px(x + 1, y + 1, c) };
}
// Feines Leuchten um eine Pixelmenge (Weltpixel): Kern = die Pixel selbst, Saum in Feinpixel-Ringen.
// ring = [Kernfarbe, Ring 1, Ring 2, …] (null = frei). core(x, y) darf die Kernfarbe je Pixel ersetzen.
function glowFine(L, pts, ring, core) {
  const set = new Set(pts.map(([x, y]) => x * 1000 + y));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const R = Math.ceil((ring.length - 1) / 2);
  L.g.each(x0 - R + 0.5, y0 - R + 0.5, x1 + 1 + R + 0.25, y1 + 1 + R + 0.25, (X, Y) => {
    const wx = X - 0.5, wy = Y - 0.5, px = Math.floor(wx), py = Math.floor(wy);
    if (set.has(px * 1000 + py)) return core ? core(px, py, wx - px, wy - py) ?? ring[0] : ring[0];
    const fx = Math.floor(wx * 2), fy = Math.floor(wy * 2);
    let d = 99;
    for (const [x, y] of pts) {
      const dx = fx < 2 * x ? 2 * x - fx : fx > 2 * x + 1 ? fx - 2 * x - 1 : 0;
      const dy = fy < 2 * y ? 2 * y - fy : fy > 2 * y + 1 ? fy - 2 * y - 1 : 0;
      d = Math.min(d, Math.max(dx, dy));
    }
    return ring[d] ?? null;
  });
}

export function createWaystoneSprites() {
  const W = 28, H = 58, cx = 14, bottom = H - 1;
  const LIT = glowLayer(W, H), DIM = glowLayer(W, H);
  const litSet = new Set();
  const GL = (x, y, c) => { LIT.G(x, y, c); litSet.add(x * 1000 + y); };
  const GD = (x, y, c) => DIM.G(x, y, c);
  // Leuchtebenen nur einmal beschreiben: alter Weg im groben Durchgang, feiner im feinen
  const glowHere = (p) => (LIT.fine ? p.fine : true);

  const sprite = buildFine(W, H, cx, bottom, (p) => {
    const fine = p.fine, glow = glowHere(p);
    // --- Sockel: drei Stufen, Oberkante hell, Front dunkel, Kanten bröckelig
    const slab = (x0, x1, y0, y1, seed) => {
      for (let x = x0; x <= x1; x++) {
        const chip = hash2(x, seed, 3) < 0.18 && (x === x0 || x === x1 || x === x0 + 1 || x === x1 - 1);
        for (let y = y0; y <= y1; y++) {
          if (chip && y === y0) continue;
          const side = x > (x0 + x1) / 2 + (x1 - x0) * 0.3;
          let c = y === y0 ? STONE[5] : y === y0 + 1 ? STONE[4] : side ? STONE[2] : STONE[3];
          if (y === y1) c = STONE[1];
          if (!fine && y > y0 + 1 && hash2(x, y, seed) < 0.08) c = STONE[1];
          p.px(x, y, c);
        }
        // fein: Kantenlicht oben (abgebrochene Ecken mit eigener Kante), Fase zur Front
        if (fine) {
          const top = chip ? y0 + 1 : y0;
          const side = x > (x0 + x1) / 2 + (x1 - x0) * 0.3;
          p.rect(x, top, 1, 0.5, side ? STONE[5] : STONE[6]);
          p.rect(x, y0 + 1.5, 1, 0.5, side ? STONE[3] : STONE[4]);
          p.rect(x, y1, 1, 0.5, STONE[2]);
        }
      }
      // Fugen
      for (let x = x0 + 4 + (seed % 3); x < x1; x += 7) {
        if (!fine) { for (let y = y0 + 2; y < y1; y++) p.px(x, y, STONE[1]); continue; }
        p.rect(x, y0 + 2, 0.5, y1 - y0 - 2, STONE[0]); p.rect(x + 0.5, y0 + 2, 0.5, y1 - y0 - 2, STONE[4]);
      }
    };
    slab(1, W - 2, bottom - 4, bottom, 11);
    slab(4, W - 5, bottom - 8, bottom - 5, 12);
    slab(7, W - 8, bottom - 11, bottom - 9, 13);
    if (!fine) {
      // Moos in den Fugen des untersten Absatzes
      for (let x = 1; x < W - 1; x++) if (hash2(x, 2, 14) < 0.3) p.px(x, bottom - 4, MOSS[hash2(x, 3, 14) < 0.5 ? 1 : 2]);
      for (let x = 4; x < W - 4; x++) if (hash2(x, 5, 15) < 0.18) p.px(x, bottom - 8, MOSS[1]);
    } else {
      // fein: Moospolster auf den Stufen, hängen über die Kante; Risse in den Fronten
      for (let x = 1; x < W - 1; x++) if (hash2(x, 2, 14) < 0.3) {
        const big = hash2(x, 3, 14) < 0.5;
        fmap(p, x, bottom - 4, big ? ['22', '21', '.1'] : ['21', '1.'], { 2: MOSS[2], 1: MOSS[1] });
      }
      for (let x = 4; x < W - 4; x++) if (hash2(x, 5, 15) < 0.18) fmap(p, x, bottom - 8, ['21', '.1'], { 2: MOSS[2], 1: MOSS[1] });
      const crack = (pts) => {
        for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0] + 0.5, pts[i - 1][1] + 0.5, pts[i][0] + 0.5, pts[i][1] + 0.5, STONE[4]);
        for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], STONE[0]);
      };
      crack([[3, bottom - 2], [4, bottom - 1.5], [4.5, bottom - 0.5]]);
      crack([[19, bottom - 2.5], [19.5, bottom - 1.5], [21, bottom - 1]]);
      crack([[8, bottom - 6.5], [8.5, bottom - 5.5]]);
    }
    // Kleine Runensteine an den Sockelecken
    for (const sx of [3, W - 4]) {
      p.rect(sx - 1, bottom - 7, 3, 3, STONE[3]); p.px(sx - 1, bottom - 7, STONE[5]); p.px(sx, bottom - 7, STONE[4]);
      p.px(sx, bottom - 6, RUNE[1]);
      if (fine) {
        fmap(p, sx - 1, bottom - 7, ['665544', '5....2', '4....1', '4....1', '3....1', '322211'], { 6: STONE[6], 5: STONE[5], 4: STONE[4], 3: STONE[3], 2: STONE[2], 1: STONE[1] });
        fmap(p, sx, bottom - 6, ['0', '1'], { 0: STONE[0], 1: RUNE[2] }); p.dot(sx + 0.5, bottom - 6, RUNE[1]); p.dot(sx + 0.5, bottom - 5.5, RUNE[1]);
      }
      if (glow) {
        if (!LIT.fine) { GL(sx, bottom - 6, RUNE[3]); GD(sx, bottom - 6, RUNE[1]); }
        else {
          glowFine(LIT, [[sx, bottom - 6]], [RUNE[4], RUNE[2]], (x, y, fx, fy) => (fy < 0.5 ? RUNE[5] : null));
          glowFine(DIM, [[sx, bottom - 6]], [RUNE[1]]);
        }
      }
    }

    // --- Schaft: verjüngt sich nach oben, linke Fläche im Licht, rechte im Schatten
    const top = 13, base = bottom - 12;
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top);
      const half = 3.5 + t * 2.2;
      const xl = Math.round(cx - half), xr = Math.round(cx + half) - 1;
      const edge = Math.round(cx + half * 0.35);
      for (let x = xl; x <= xr; x++) {
        let c;
        if (x === xl) c = STONE[5];
        else if (x < edge) c = x === xl + 1 ? STONE[4] : STONE[3];
        else if (x === edge) c = STONE[2];
        else c = x === xr ? STONE[1] : STONE[2];
        // Verwitterung und feine Risse
        if (!fine) {
          const n = hash2(x, y, 21);
          if (n < 0.07) c = STONE[1];
          else if (n > 0.95 && x < edge) c = STONE[4];
        }
        p.px(x, y, c);
      }
      if (fine) {
        // Kantenlicht links (1 Feinpixel), Grat zwischen Licht- und Schattenfläche, Schattenkante rechts
        p.dot(xl, y, STONE[6]); p.dot(xl, y + 0.5, STONE[6]);
        p.dot(edge - 0.5, y, STONE[4]); p.dot(edge - 0.5, y + 0.5, STONE[4]);
        p.dot(xr + 0.5, y, STONE[0]); p.dot(xr + 0.5, y + 0.5, STONE[0]);
      }
    }
    // Riss quer über die Front
    if (!fine) for (const [x, y] of [[cx - 3, 37], [cx - 2, 38], [cx - 1, 38], [cx, 39], [cx + 1, 40]]) p.px(x, y, STONE[0]);
    else {
      // fein: Risse mit heller Unterkante, Verwitterungsnarben als kurze Haarrisse statt Sprenkel
      const crack = (pts, light = STONE[4]) => {
        for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0] + 0.5, pts[i - 1][1] + 0.5, pts[i][0] + 0.5, pts[i][1] + 0.5, light);
        for (let i = 1; i < pts.length; i++) p.fline(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], STONE[0]);
      };
      crack([[cx - 3.5, 37], [cx - 2, 38], [cx - 0.5, 38.5], [cx + 0.5, 39.5], [cx + 1.5, 41]]);
      crack([[cx - 1, 38.5], [cx - 1, 40]], STONE[3]);
      crack([[cx + 2, 16], [cx + 2.5, 17.5], [cx + 2, 19]], STONE[2]);
      crack([[cx - 4, 30], [cx - 3, 30.5]], STONE[4]);
      crack([[cx + 3, 33], [cx + 3.5, 34.5]], STONE[2]);
      for (const [x, y] of [[cx - 3, 22], [cx + 1, 27], [cx - 4, 41], [cx + 3, 25]]) { p.dot(x, y, STONE[1]); p.dot(x + 0.5, y + 0.5, STONE[4]); }
    }
    // Bronzebänder
    for (const by of [top + 5, base - 4]) {
      const t = (by - top) / (base - top), half = 3.5 + t * 2.2 + 1;
      const xl = Math.round(cx - half), xr = Math.round(cx + half) - 1;
      for (let x = xl; x <= xr; x++) {
        p.px(x, by, x < cx ? BRONZE[2] : BRONZE[1]);
        p.px(x, by + 1, x < cx ? BRONZE[1] : BRONZE[0]);
      }
      p.px(xl + 1, by, BRONZE[3]);
      if (!fine) {
        // Patina
        for (let x = xl; x <= xr; x++) if (hash2(x, by, 22) < 0.3) p.px(x, by + 1, PATINA[1]);
        continue;
      }
      // fein: 5 Stufen – Glanzlinie oben, Glanzpunkt, Unterkante dunkel, Nieten; Patina sammelt sich unten und läuft ab
      p.rect(xl, by, xr - xl + 1, 0.5, BRONZE[2]); p.rect(xl, by, cx - xl, 0.5, BRONZE[3]);
      p.rect(xl + 1, by, cx - xl - 2, 0.5, BRONZE[4]); p.dot(xl + 1, by, '#fffbe6');
      p.rect(xl, by + 1.5, xr - xl + 1, 0.5, BRONZE[0]);
      for (let x = xl + 1; x < xr; x += 2) { p.dot(x + 0.5, by + 0.5, x < cx ? BRONZE[4] : BRONZE[2]); p.dot(x + 0.5, by + 1, BRONZE[0]); }
      for (const [dx, len] of [[-2, 1.5], [1, 2.5], [3, 1]]) {
        const x = cx + dx;
        if (x < xl || x > xr) continue;
        p.rect(x, by + 1.5, 1, 0.5, PATINA[1]); p.dot(x, by + 1.5, PATINA[2]);
        p.rect(x + 0.5, by + 2, 0.5, len, PATINA[0]); p.dot(x + 0.5, by + 2, PATINA[1]);
      }
    }
    // --- Pyramidion
    for (let y = top - 7; y < top; y++) {
      const k = y - (top - 7);
      const half = 0.5 + k * 0.55;
      for (let x = Math.round(cx - half - 0.5); x <= Math.round(cx + half - 0.5); x++) p.px(x, y, x < cx ? STONE[5] : x === cx ? STONE[4] : STONE[2]);
    }
    p.px(cx - 1, top - 7, STONE[6]);
    if (fine) {
      // Kante links im Licht, Grat in der Mitte, Spitze mit Glanzpunkt
      p.fline(cx - 1, top - 6.5, cx - 4, top - 0.5, STONE[6]);
      p.fline(cx, top - 6.5, cx, top - 0.5, STONE[5]);
      p.fline(cx + 0.5, top - 6, cx + 0.5, top - 0.5, STONE[3]);
      p.dot(cx - 0.5, top - 7, '#8a7e96');
      p.rect(cx - 4, top - 0.5, 8, 0.5, STONE[1]);
    }

    // --- Runen: Kerben in der Front (Sprite: tiefe Rillen), leuchten auf der Glow-Ebene
    const runeYs = [top + 9, top + 14, top + 19, top + 24];
    runeYs.forEach((ry, i) => {
      const gx = cx - 3, glyph = GLYPHS[i % GLYPHS.length];
      const pts = glyph.map(([dx, dy]) => [gx + dx, ry + dy]);
      for (const [x, y] of pts) {
        p.px(x, y, RUNE[0]);
        if (fine) { p.rect(x, y, 1, 0.5, STONE[0]); p.dot(x + 0.5, y + 0.5, RUNE[1]); }
      }
      if (fine) {
        // Kerbkante: unter der Rille fängt der Stein Licht
        const has = (x, y) => pts.some(([a, b]) => a === x && b === y);
        for (const [x, y] of pts) if (!has(x, y + 1)) p.rect(x, y + 1, 1, 0.5, STONE[4]);
      }
      if (!glow) return;
      if (!LIT.fine) {
        for (const [dx, dy] of glyph) {
          const x = gx + dx, y = ry + dy;
          GL(x, y, dy === 0 || dx === 1 ? RUNE[5] : RUNE[4]);
          GD(x, y, RUNE[2]);
        }
        // Lichtschein um die Rune (nur freigeschaltet)
        for (const [dx, dy] of glyph) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const x = gx + dx + ox, y = ry + dy + oy;
          if (!litSet.has(x * 1000 + y)) GL(x, y, RUNE[1]);
        }
      } else {
        // fein: heißer weißer Kern in der Rille, cyan Saum (1 Feinpixel), Schein (1 Feinpixel)
        glowFine(LIT, pts, [RUNE[5], RUNE[3], RUNE[1]]);
        glowFine(DIM, pts, [RUNE[2], RUNE[0]], (x, y, fx, fy) => (fy < 0.5 ? RUNE[3] : null));
      }
    });
    // Runenband auf dem Sockel (leuchtende Linie)
    for (let x = 9; x <= W - 10; x++) if (x % 2 === 0) {
      p.px(x, bottom - 10, RUNE[1]);
      if (fine) { p.rect(x, bottom - 10, 1, 0.5, STONE[0]); p.dot(x + 1, bottom - 9.5, STONE[1]); }
      if (!glow) continue;
      if (!LIT.fine) { GL(x, bottom - 10, RUNE[3]); GD(x, bottom - 10, RUNE[1]); }
      else {
        LIT.g.rect(x + 0.5, bottom - 9.5, 1, 0.5, RUNE[3]); LIT.g.rect(x + 0.5, bottom - 9.5, 0.5, 0.5, RUNE[5]); LIT.g.rect(x + 1, bottom - 9.5, 0.5, 0.5, RUNE[4]);
        LIT.g.dot(x + 0.5, bottom - 10, RUNE[1]); LIT.g.dot(x + 1, bottom - 10, RUNE[1]);
        DIM.g.rect(x + 0.5, bottom - 9.5, 1, 0.5, RUNE[1]); DIM.g.rect(x + 0.5, bottom - 9, 1, 0.5, RUNE[1]); DIM.g.dot(x + 0.5, bottom - 9.5, RUNE[2]);
      }
    }
  });

  // Schwebender Seelenkristall (eigener Frame; Anker = Unterkante)
  const cw = 9, ch = 13, ccx = 4;
  const CG = glowLayer(cw, ch);
  const shape = (fn) => {
    for (let y = 0; y < ch; y++) {
      const t = y < 5 ? y / 5 : 1 - (y - 5) / (ch - 6);
      const half = Math.max(0, Math.round(t * 4));
      for (let x = ccx - half; x <= ccx + half; x++) fn(x, y);
    }
  };
  // feine Kristallform (glatte Kanten): fn(rel, yy, x, y) mit rel = −1 … 1 quer, yy = Zeile (0 Spitze, 5 Gürtel)
  const fineShape = (p, ox, oy, fn) => {
    p.each(ox - 0.5, oy - 0.5, ox + cw + 0.5, oy + ch + 0.5, (X, Y) => {
      const x = X - ox, yy = Y - oy - 0.5;
      if (yy < -0.5 || yy > ch - 0.5) return null;
      const t = yy < 5 ? yy / 5 : 1 - (yy - 5) / (ch - 6);
      const hw = Math.max(0, t * 4) + 0.5, dx = x - (ccx + 0.5);
      if (Math.abs(dx) > hw) return null;
      return fn(dx / hw, yy, dx, hw);
    });
  };
  // Facetten: Krone (oben) mit lichtem linkem Feld und Glanzgrat, Gürtel als helle Kante, Pavillon dunkler
  const facet = (R, glint) => (rel, yy, dx, hw) => {
    if (Math.abs(yy - 5) < 0.3) return rel < 0.3 ? R[4] : R[3];
    if (yy < 5) {
      if (hw - Math.abs(dx) < 0.5 && dx < 0) return R[4];
      if (rel < -0.45) return R[4];
      if (rel < -0.05) return R[3];
      if (rel < 0.2) return glint;
      return rel < 0.65 ? R[2] : R[1];
    }
    if (rel < -0.5) return R[3];
    if (rel < -0.05) return yy < 8 ? R[3] : R[2];
    if (rel < 0.2) return R[4];
    return rel < 0.6 ? R[2] : R[1];
  };
  const crystal = buildFine(cw, ch, ccx, ch - 1, (p) => {
    if (!p.fine) {
      shape((x, y) => {
        p.px(x, y, x < ccx ? RUNE[3] : x === ccx ? RUNE[4] : RUNE[2]);
        if (!CG.fine) CG.G(x, y, x === ccx - 1 && y > 2 && y < 7 ? '#ffffff' : x <= ccx ? RUNE[5] : RUNE[4]);
      });
      p.px(ccx - 1, 3, RUNE[5]); p.px(ccx - 2, 5, RUNE[5]);
      return;
    }
    fineShape(p, 0, 0, facet([RUNE[1], RUNE[2], RUNE[2], RUNE[3], RUNE[4]], RUNE[5]));
    p.dot(ccx - 1, 2.5, '#ffffff'); p.dot(ccx - 1, 3, RUNE[5]); p.dot(ccx - 2, 4.5, RUNE[5]);
    // Leuchten fein: weißer Kern längs der Mitte, heller Innenraum, cyan Saum an den Kanten
    fineShape(CG.g, 0.5, 0.5, (rel, yy, dx, hw) => {
      if (hw - Math.abs(dx) < 0.5) return RUNE[3];
      if (Math.abs(dx + 0.25) < 0.5 && yy > 1.5 && yy < 9.5) return '#ffffff';
      return rel < 0.35 ? RUNE[5] : RUNE[4];
    });
  });
  // Ruhender Kristall (noch nicht entdeckt): trübes Graublau
  const DULL = ['#2a3442', '#3c4a5c', '#56687c', '#7a8ea2'];
  const crystalDim = buildFine(cw, ch, ccx, ch - 1, (p) => {
    if (!p.fine) {
      shape((x, y) => p.px(x, y, x < ccx ? DULL[2] : x === ccx ? DULL[3] : DULL[1]));
      p.px(ccx - 1, 3, DULL[3]);
      return;
    }
    fineShape(p, 0, 0, facet([DULL[0], DULL[1], DULL[1], DULL[2], DULL[3]], DULL[3]));
    p.dot(ccx - 1, 2.5, '#a0b0c0');
  });
  return {
    sprite, glowLit: LIT.g.canvas, glowDim: DIM.g.canvas, crystal, crystalDim, crystalGlow: CG.g.canvas,
    crystalY: -H + 7, box: [-9, -7, 9, 1],
  };
}
