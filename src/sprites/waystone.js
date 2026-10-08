import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Wegstein (Teleporter zwischen Städten): Runen-Obelisk aus altem Basalt auf
// gestuftem Sockel, Bronzebänder, eingekerbte Runen und ein schwebender
// Seelenkristall über der Spitze. Die Runen leuchten auf eigenen Glow-Ebenen
// (dim = noch nicht entdeckt, lit = freigeschaltet); der Kristall wird vom Code
// mit leichtem Schweben gezeichnet.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss).
const STONE = ['#0c0a10', '#16121b', '#211b28', '#2e2637', '#3d3348', '#4f445a', '#64586e'];
const MOSS = ['#1c2a1e', '#2a3d2a', '#3c5236'];
const BRONZE = PAL.gold;
export const RUNE = ['#082230', '#0d3e52', '#15708a', '#2fb2cf', '#86ecff', '#e6ffff'];

// Runenformen 3×4 (x, y)
const GLYPHS = [
  [[1, 0], [0, 1], [2, 1], [1, 2], [1, 3]],
  [[0, 0], [2, 0], [1, 1], [1, 2], [0, 3], [2, 3]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [0, 3]],
  [[1, 0], [1, 1], [0, 2], [2, 2], [1, 3]],
  [[0, 0], [2, 1], [1, 1], [0, 2], [2, 3], [1, 3]],
];

export function createWaystoneSprites() {
  const W = 28, H = 58, cx = 14, bottom = H - 1;
  const lit = new PixelCanvas(W + 2, H + 2), dim = new PixelCanvas(W + 2, H + 2);
  const GL = (x, y, c) => lit.px(x + 1, y + 1, c);
  const GD = (x, y, c) => dim.px(x + 1, y + 1, c);

  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // --- Sockel: drei Stufen, Oberkante hell, Front dunkel, Kanten bröckelig
    const slab = (x0, x1, y0, y1, seed) => {
      for (let x = x0; x <= x1; x++) {
        const chip = hash2(x, seed, 3) < 0.18 && (x === x0 || x === x1 || x === x0 + 1 || x === x1 - 1);
        for (let y = y0; y <= y1; y++) {
          if (chip && y === y0) continue;
          const side = x > (x0 + x1) / 2 + (x1 - x0) * 0.3;
          let c = y === y0 ? STONE[5] : y === y0 + 1 ? STONE[4] : side ? STONE[2] : STONE[3];
          if (y === y1) c = STONE[1];
          if (y > y0 + 1 && hash2(x, y, seed) < 0.08) c = STONE[1];
          p.px(x, y, c);
        }
      }
      // Fugen
      for (let x = x0 + 4 + (seed % 3); x < x1; x += 7) for (let y = y0 + 2; y < y1; y++) p.px(x, y, STONE[1]);
    };
    slab(1, W - 2, bottom - 4, bottom, 11);
    slab(4, W - 5, bottom - 8, bottom - 5, 12);
    slab(7, W - 8, bottom - 11, bottom - 9, 13);
    // Moos in den Fugen des untersten Absatzes
    for (let x = 1; x < W - 1; x++) if (hash2(x, 2, 14) < 0.3) p.px(x, bottom - 4, MOSS[hash2(x, 3, 14) < 0.5 ? 1 : 2]);
    for (let x = 4; x < W - 4; x++) if (hash2(x, 5, 15) < 0.18) p.px(x, bottom - 8, MOSS[1]);
    // Kleine Runensteine an den Sockelecken
    for (const sx of [3, W - 4]) {
      p.rect(sx - 1, bottom - 7, 3, 3, STONE[3]); p.px(sx - 1, bottom - 7, STONE[5]); p.px(sx, bottom - 7, STONE[4]);
      p.px(sx, bottom - 6, RUNE[1]); GL(sx, bottom - 6, RUNE[3]); GD(sx, bottom - 6, RUNE[1]);
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
        const n = hash2(x, y, 21);
        if (n < 0.07) c = STONE[1];
        else if (n > 0.95 && x < edge) c = STONE[4];
        p.px(x, y, c);
      }
    }
    // Riss quer über die Front
    for (const [x, y] of [[cx - 3, 37], [cx - 2, 38], [cx - 1, 38], [cx, 39], [cx + 1, 40]]) p.px(x, y, STONE[0]);
    // Bronzebänder
    for (const by of [top + 5, base - 4]) {
      const t = (by - top) / (base - top), half = 3.5 + t * 2.2 + 1;
      const xl = Math.round(cx - half), xr = Math.round(cx + half) - 1;
      for (let x = xl; x <= xr; x++) {
        p.px(x, by, x < cx ? BRONZE[2] : BRONZE[1]);
        p.px(x, by + 1, x < cx ? BRONZE[1] : BRONZE[0]);
      }
      p.px(xl + 1, by, BRONZE[3]);
      // Patina
      for (let x = xl; x <= xr; x++) if (hash2(x, by, 22) < 0.3) p.px(x, by + 1, '#2f5a4e');
    }
    // --- Pyramidion
    for (let y = top - 7; y < top; y++) {
      const k = y - (top - 7);
      const half = 0.5 + k * 0.55;
      for (let x = Math.round(cx - half - 0.5); x <= Math.round(cx + half - 0.5); x++) p.px(x, y, x < cx ? STONE[5] : x === cx ? STONE[4] : STONE[2]);
    }
    p.px(cx - 1, top - 7, STONE[6]);

    // --- Runen: Kerben in der Front (Sprite: tiefe Rillen), leuchten auf der Glow-Ebene
    const runeYs = [top + 9, top + 14, top + 19, top + 24];
    runeYs.forEach((ry, i) => {
      const gx = cx - 3;
      for (const [dx, dy] of GLYPHS[i % GLYPHS.length]) {
        const x = gx + dx, y = ry + dy;
        p.px(x, y, RUNE[0]);
        GL(x, y, dy === 0 || dx === 1 ? RUNE[5] : RUNE[4]);
        GD(x, y, RUNE[2]);
      }
      // Lichtschein um die Rune (nur freigeschaltet)
      for (const [dx, dy] of GLYPHS[i % GLYPHS.length]) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = gx + dx + ox, y = ry + dy + oy;
        if (lit.ctx.getImageData(x + 1, y + 1, 1, 1).data[3] === 0) GL(x, y, RUNE[1]);
      }
    });
    // Runenband auf dem Sockel (leuchtende Linie)
    for (let x = 9; x <= W - 10; x++) if (x % 2 === 0) { p.px(x, bottom - 10, RUNE[1]); GL(x, bottom - 10, RUNE[3]); GD(x, bottom - 10, RUNE[1]); }
  });

  // Schwebender Seelenkristall (eigener Frame; Anker = Unterkante)
  const cw = 9, ch = 13, ccx = 4;
  const cg = new PixelCanvas(cw + 2, ch + 2);
  const shape = (fn) => {
    for (let y = 0; y < ch; y++) {
      const t = y < 5 ? y / 5 : 1 - (y - 5) / (ch - 6);
      const half = Math.max(0, Math.round(t * 4));
      for (let x = ccx - half; x <= ccx + half; x++) fn(x, y);
    }
  };
  const crystal = buildFrame(cw, ch, ccx, ch - 1, (p) => {
    shape((x, y) => {
      p.px(x, y, x < ccx ? RUNE[3] : x === ccx ? RUNE[4] : RUNE[2]);
      cg.px(x + 1, y + 1, x === ccx - 1 && y > 2 && y < 7 ? '#ffffff' : x <= ccx ? RUNE[5] : RUNE[4]);
    });
    p.px(ccx - 1, 3, RUNE[5]); p.px(ccx - 2, 5, RUNE[5]);
  });
  // Ruhender Kristall (noch nicht entdeckt): trübes Graublau
  const DULL = ['#2a3442', '#3c4a5c', '#56687c', '#7a8ea2'];
  const crystalDim = buildFrame(cw, ch, ccx, ch - 1, (p) => {
    shape((x, y) => p.px(x, y, x < ccx ? DULL[2] : x === ccx ? DULL[3] : DULL[1]));
    p.px(ccx - 1, 3, DULL[3]);
  });
  return {
    sprite, glowLit: lit.canvas, glowDim: dim.canvas, crystal, crystalDim, crystalGlow: cg.canvas,
    crystalY: -H + 7, box: [-9, -7, 9, 1],
  };
}
