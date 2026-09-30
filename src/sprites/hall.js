import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Die Dorfhalle der Glutsenke: Langhaus mit Giebel zur Straße, Schindeldach,
// gekreuzten Giebelbalken mit geschnitzten Wolfsköpfen, Vordach auf zwei
// Schnitzsäulen, Doppeltür, Rundfenster, Bannern und Laternen.
// Licht von links oben; alles Leuchtende liegt zusätzlich auf der Glow-Ebene.
const WOOD = ['#140c09', '#22150f', '#342016', '#4a2e1e', '#61402a', '#7c5636'];
const ROOF = ['#110d18', '#1b1524', '#261e32', '#342940', '#44384f', '#574a63'];
const STONE = PAL.stone;
const MOSS = ['#1c2619', '#2a3923', '#3a4e2d'];
const CRIM = PAL.crimson, GOLD = PAL.gold, EMB = PAL.ember;
const IRON = PAL.steel;

export function createHall() {
  const W = 136, H = 122;
  const bottom = H - 1;
  const cx = W / 2;
  const wallH = 36, plinth = 6;
  const wallTop = bottom - plinth - wallH;
  const wx0 = 12, wx1 = W - 13; // Außenkante der Wand
  const apexY = 14, eaveY = wallTop + 4, eaveOver = 10;
  const g = new PixelCanvas(W + 2, H + 2); // Glow-Ebene (+1 Rand wie der Umriss)
  const G = (x, y, w, h, c) => g.rect(x + 1, y + 1, w, h, c);

  const sprite = buildFrame(W, H, W / 2, H - 1, (p) => {
    // ------------------------------------------------ Sockel aus Feldstein
    for (let y = bottom - plinth; y <= bottom; y++) p.rect(wx0 - 3, y, wx1 - wx0 + 7, 1, STONE[1]);
    for (let y = bottom - plinth; y < bottom; y += 3) {
      for (let x = wx0 - 3 + ((y / 3) % 2) * 3; x < wx1 + 3; x += 6) {
        const w = 5 - (hash2(x, y, 1) < 0.3 ? 1 : 0);
        p.rect(x, y, w, 2, STONE[2 + (hash2(x, y, 2) < 0.4 ? 1 : 0)]);
        p.px(x, y, STONE[4]);
      }
    }
    p.rect(wx0 - 3, bottom - plinth, wx1 - wx0 + 7, 1, STONE[4]);

    // ------------------------------------------------ Wand: senkrechte Bohlen
    for (let x = wx0; x <= wx1; x++) {
      const plank = Math.floor((x - wx0) / 4);
      const edge = (x - wx0) % 4;
      const base = 2 + (hash2(plank, 0, 3) < 0.35 ? 1 : 0) - (hash2(plank, 1, 3) < 0.2 ? 1 : 0);
      for (let y = wallTop; y < bottom - plinth; y++) {
        let c = WOOD[edge === 0 ? 1 : edge === 1 ? base + 1 : base];
        if (hash2(x, y >> 2, 4) < 0.05) c = WOOD[1]; // Maserung / Astlöcher
        p.px(x, y, c);
      }
    }
    // Schatten unter der Traufe
    for (let i = 0; i < 6; i++) { p.ctx.fillStyle = `rgba(6,3,10,${0.5 * (1 - i / 6)})`; p.ctx.fillRect(wx0, wallTop + i, wx1 - wx0 + 1, 1); }
    // Eckpfosten und Querbalken mit Zickzack-Schnitzerei
    for (const x of [wx0 - 2, wx1 - 2]) { p.rect(x, wallTop - 2, 5, wallH + 2, WOOD[2]); p.rect(x, wallTop - 2, 1, wallH + 2, WOOD[4]); p.rect(x + 4, wallTop - 2, 1, wallH + 2, WOOD[0]); }
    const beamY = wallTop + 8;
    p.rect(wx0, beamY, wx1 - wx0, 4, WOOD[3]); p.rect(wx0, beamY, wx1 - wx0, 1, WOOD[5]); p.rect(wx0, beamY + 3, wx1 - wx0, 1, WOOD[1]);
    for (let x = wx0 + 1; x < wx1 - 1; x += 4) { p.px(x, beamY + 2, WOOD[1]); p.px(x + 1, beamY + 1, WOOD[1]); p.px(x + 2, beamY + 2, WOOD[1]); }

    // ------------------------------------------------ Fenster (hoch, mit Läden)
    const windows = [wx0 + 12, wx1 - 22];
    for (const x of windows) {
      const y = beamY + 8, w = 10, h = 14;
      p.rect(x - 1, y - 1, w + 2, h + 2, WOOD[1]);
      p.rect(x, y, w, h, EMB[3]);
      p.rect(x, y, w, 3, EMB[4]);
      p.rect(x + w / 2 - 0.5, y, 1, h, WOOD[1]); p.rect(x, y + 6, w, 1, WOOD[1]);
      // Läden
      p.rect(x - 5, y - 1, 4, h + 2, WOOD[3]); p.rect(x - 5, y - 1, 1, h + 2, WOOD[4]); p.rect(x - 5, y + 3, 4, 1, WOOD[1]); p.rect(x - 5, y + 10, 4, 1, WOOD[1]);
      p.rect(x + w + 1, y - 1, 4, h + 2, WOOD[2]); p.rect(x + w + 1, y + 3, 4, 1, WOOD[1]); p.rect(x + w + 1, y + 10, 4, 1, WOOD[1]);
      // Blumenkasten mit Glutkraut
      p.rect(x - 1, y + h + 1, w + 2, 3, WOOD[2]); p.rect(x - 1, y + h + 1, w + 2, 1, WOOD[4]);
      for (let i = 0; i < w; i += 2) p.px(x + i, y + h, i % 4 ? MOSS[2] : EMB[2]);
      G(x, y, w, h, EMB[3]); G(x, y, w, 3, EMB[4]);
      G(x + w / 2 - 0.5, y, 1, h, '#000000'); G(x, y + 6, w, 1, '#000000');
      G(x + 1, y + 1, 2, 2, EMB[5]);
    }

    // ------------------------------------------------ Vordach über dem Eingang
    const porchW = 44, px0 = cx - porchW / 2, porchTop = beamY - 2;
    // Stufen
    p.rect(cx - 16, bottom - 3, 32, 3, STONE[2]); p.rect(cx - 16, bottom - 3, 32, 1, STONE[4]);
    p.rect(cx - 13, bottom - 6, 26, 3, STONE[3]); p.rect(cx - 13, bottom - 6, 26, 1, STONE[5]);
    // Doppeltür mit Rundbogen
    const dW = 20, dH = 24, dx = cx - dW / 2, dy = bottom - plinth - dH;
    p.rect(dx - 2, dy - 2, dW + 4, dH + 2, WOOD[1]);
    p.ellipse(cx, dy + 1, dW / 2 + 2, 6, WOOD[1]);
    p.rect(dx, dy, dW, dH, WOOD[3]);
    p.ellipse(cx, dy + 1, dW / 2, 5, WOOD[3]);
    for (let x = dx; x < dx + dW; x += 3) p.rect(x, dy - 3, 1, dH + 3, WOOD[2]);
    p.rect(cx - 0.5, dy - 4, 1, dH + 4, WOOD[0]);
    for (const yy of [dy + 3, dy + dH - 6]) { p.rect(dx, yy, dW, 2, IRON[1]); p.rect(dx, yy, dW, 1, IRON[3]); for (let x = dx + 1; x < dx + dW; x += 3) p.px(x, yy + 1, IRON[4]); }
    for (const s of [-1, 1]) { p.ellipse(cx + s * 3, dy + 12, 1.5, 1.5, GOLD[2]); p.px(cx + s * 3, dy + 13, GOLD[0]); }
    // Lichtspalt unter der Tür
    p.rect(dx + 1, bottom - plinth - 1, dW - 2, 1, EMB[4]); G(dx + 1, bottom - plinth - 1, dW - 2, 1, EMB[4]);
    // Säulen mit Schnitzringen
    for (const x of [px0 + 2, px0 + porchW - 7]) {
      p.rect(x, porchTop + 4, 5, bottom - plinth - porchTop - 4, WOOD[3]);
      p.rect(x, porchTop + 4, 1, bottom - plinth - porchTop - 4, WOOD[5]);
      p.rect(x + 4, porchTop + 4, 1, bottom - plinth - porchTop - 4, WOOD[1]);
      for (let y = porchTop + 10; y < bottom - plinth - 2; y += 7) { p.rect(x - 1, y, 7, 2, WOOD[2]); p.rect(x - 1, y, 7, 1, WOOD[4]); }
      p.rect(x - 1, bottom - plinth - 2, 7, 2, STONE[3]);
    }
    // Laternen an den Säulen
    for (const x of [px0 - 3, px0 + porchW + 1]) {
      const y = porchTop + 9;
      p.px(x + 1, y - 2, IRON[2]); p.rect(x, y - 1, 3, 1, IRON[1]);
      p.rect(x - 1, y, 5, 5, IRON[0]); p.rect(x, y + 1, 3, 3, EMB[4]); p.px(x + 1, y + 2, EMB[5]);
      p.rect(x - 1, y + 5, 5, 1, IRON[2]);
      G(x, y + 1, 3, 3, EMB[4]); G(x + 1, y + 2, 1, 1, EMB[5]);
    }
    // Banner neben der Tür
    for (const x of [cx - 34, cx + 26]) {
      const y = beamY + 4, bw = 8, bh = 22;
      p.rect(x - 1, y - 1, bw + 2, 1, WOOD[4]);
      for (let yy = 0; yy < bh; yy++) {
        const sway = Math.round(Math.sin(yy / 5) * 0.6);
        p.rect(x + sway, y + yy, bw, 1, yy < 2 ? CRIM[1] : CRIM[2]);
        p.px(x + sway, y + yy, CRIM[3]); p.px(x + sway + bw - 1, y + yy, CRIM[1]);
      }
      for (let i = 0; i < bw; i += 2) p.px(x + i, y + bh, CRIM[2]);
      // Goldene Glut-Flamme als Wappen
      const sx = x + bw / 2 - 1, sy = y + 8;
      p.px(sx + 1, sy, GOLD[3]); p.rect(sx, sy + 1, 3, 2, GOLD[3]); p.rect(sx - 1, sy + 3, 5, 2, GOLD[2]); p.px(sx + 1, sy + 3, GOLD[4]);
      p.rect(sx, sy + 5, 3, 1, GOLD[1]);
      p.rect(x + 1, y + 16, bw - 2, 1, GOLD[2]);
    }

    // ------------------------------------------------ Giebeldach
    // Schindelflächen links (heller) und rechts (dunkler), mit Überstand
    const left = wx0 - eaveOver, right = wx1 + eaveOver;
    const band = 13; // sichtbare Dachschräge (Überstand) in px
    const slope = (right - cx) / (eaveY - apexY);
    const shingle = (x, y, originY, sideLight) => {
      const row = Math.floor((y - originY) / 3);
      const off = (row % 2) * 3;
      const rv = (y - originY) % 3, cv = (x + off) % 6;
      let k = 2 + sideLight + (hash2(Math.floor((x + off) / 6), row, 6) < 0.25 ? 1 : 0) - (hash2(Math.floor((x + off) / 6), row, 7) < 0.15 ? 1 : 0);
      if (rv === 2) k = 0; else if (rv === 0) k += 1;
      if (cv === 0) k -= 1;
      if (hash2(Math.floor((x + off) / 6), row, 8) < 0.09 && rv < 2) return MOSS[rv === 0 ? 2 : 1];
      return ROOF[Math.max(0, Math.min(5, k))];
    };
    for (let y = apexY; y <= eaveY; y++) {
      const t = (y - apexY) / (eaveY - apexY);
      const xl = cx - (cx - left) * t, xr = cx + (right - cx) * t;
      const innerT = y - apexY - band * 1.1;
      const il = innerT > 0 ? cx - innerT * slope : cx, ir = innerT > 0 ? cx + innerT * slope : cx;
      for (let x = Math.floor(xl); x <= Math.ceil(xr); x++) {
        if (innerT > 0 && x > il + 1 && x < ir - 1 && y < eaveY - 1) {
          // Giebelfeld: senkrechte Bretter, oben dunkler (Schatten des Überstands)
          const col = Math.floor((x - cx + 200) / 3), e = (x - cx + 200) % 3;
          const depth = Math.min(1, (x - il) / 4, (ir - x) / 4);
          let k = e === 0 ? 1 : 2 + (hash2(col, 0, 9) < 0.3 ? 1 : 0);
          if (depth < 1) k = 0;
          p.px(x, y, WOOD[k]);
        } else {
          p.px(x, y, shingle(x, y, apexY, x < cx ? 1 : 0));
        }
      }
    }
    // Rautenschnitzerei im Giebelfeld
    for (let y = apexY + 30; y < eaveY - 8; y += 8) {
      const t = (y - apexY - band * 1.1) * slope - 6;
      for (let x = cx - t + 4; x < cx + t - 4; x += 8) {
        p.line(x, y, x + 4, y - 4, WOOD[1]); p.line(x + 4, y - 4, x + 8, y, WOOD[1]);
        p.line(x, y, x + 4, y + 4, WOOD[4]); p.line(x + 4, y + 4, x + 8, y, WOOD[4]);
      }
    }
    // Traufe
    p.rect(left, eaveY + 1, right - left + 1, 2, ROOF[0]);
    // Firstbretter (Windbretter) entlang der Schrägen, dicke Balken
    const beam = (x0, y0, x1, y1, lightSide) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        p.rect(x - 1, y - 1, 3, 3, WOOD[2]);
        p.px(x - 1, y - 1, lightSide ? WOOD[5] : WOOD[3]);
        p.px(x + 1, y + 1, WOOD[0]);
      }
    };
    beam(left - 1, eaveY + 1, cx + 14, apexY - 11, true);
    beam(right + 1, eaveY + 1, cx - 14, apexY - 11, false);
    // Geschnitzte Wolfsköpfe an den gekreuzten Balkenenden (Blick nach außen)
    for (const s of [-1, 1]) {
      const hx = cx + s * 15, hy = apexY - 12;
      p.ellipse(hx, hy, 4, 3.5, WOOD[3]);
      p.rect(hx + (s > 0 ? 2 : -7), hy - 1, 5, 3, WOOD[3]);          // Schnauze
      p.rect(hx + (s > 0 ? 2 : -7), hy + 2, 5, 1, WOOD[1]);          // offenes Maul
      p.rect(hx + (s > 0 ? 3 : -7), hy + 3, 4, 1, WOOD[2]);
      p.px(hx + s * 7, hy - 1, WOOD[0]);
      p.line(hx - s * 1, hy - 3, hx - s * 3, hy - 7, WOOD[4]);       // Ohr
      p.line(hx + s * 1, hy - 3, hx, hy - 6, WOOD[3]);
      p.px(hx - 2, hy - 2, WOOD[5]);
      p.px(hx + s * 2, hy - 1, EMB[4]); g.px(hx + s * 2 + 1, hy, EMB[4]);
    }
    // Rundfenster im Giebel
    const rx = cx, ry = apexY + 22;
    p.ellipse(rx, ry, 9, 9, WOOD[1]);
    p.ellipse(rx, ry, 7, 7, EMB[3]);
    p.ellipse(rx - 1, ry - 1, 4, 4, EMB[4]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.line(rx, ry, rx + Math.cos(a) * 7, ry + Math.sin(a) * 7, WOOD[1]); }
    p.ellipse(rx, ry, 2, 2, WOOD[2]);
    g.ellipse(rx + 1, ry + 1, 7, 7, EMB[3]); g.ellipse(rx, ry, 4, 4, EMB[4]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.line(rx + 1, ry + 1, rx + 1 + Math.cos(a) * 7, ry + 1 + Math.sin(a) * 7, '#000000'); }
    g.ellipse(rx + 1, ry + 1, 2, 2, '#000000');
    // Rahmen des Giebelfelds unter dem Fenster
    p.rect(cx - 22, ry + 12, 44, 2, WOOD[2]); p.rect(cx - 22, ry + 12, 44, 1, WOOD[4]);
    // Firstlaterne (Rauchabzug)
    p.rect(cx - 4, apexY - 6, 8, 6, WOOD[2]); p.rect(cx - 5, apexY - 8, 10, 2, ROOF[3]); p.rect(cx - 5, apexY - 8, 10, 1, ROOF[5]);
    p.rect(cx - 2, apexY - 5, 4, 3, EMB[2]); G(cx - 2, apexY - 5, 4, 3, EMB[3]);

    // ------------------------------------------------ Vordach als kleiner Giebel
    const pApexY = porchTop - 14, pEave = porchTop + 6, pL = px0 - 8, pR = px0 + porchW + 8;
    for (let y = pApexY; y <= pEave; y++) {
      const t = (y - pApexY) / (pEave - pApexY);
      const xl = cx - (cx - pL) * t, xr = cx + (pR - cx) * t;
      const inner = y - pApexY - 7;
      for (let x = Math.floor(xl); x <= Math.ceil(xr); x++) {
        const inField = inner > 0 && Math.abs(x - cx) < inner * ((pR - cx) / (pEave - pApexY)) - 1 && y < pEave - 1;
        if (inField) p.px(x, y, WOOD[(x - cx + 99) % 3 === 0 ? 1 : 2]);
        else p.px(x, y, shingle(x, y, pApexY, x < cx ? 1 : 0));
      }
    }
    p.rect(pL, pEave + 1, pR - pL + 1, 2, WOOD[2]); p.rect(pL, pEave + 1, pR - pL + 1, 1, WOOD[4]);
    beam(pL - 1, pEave + 1, cx + 5, pApexY - 4, true);
    beam(pR + 1, pEave + 1, cx - 5, pApexY - 4, false);
    // Sonnen-/Glutscheibe im kleinen Giebel
    p.ellipse(cx, pEave - 4, 3, 3, GOLD[1]); p.ellipse(cx - 0.5, pEave - 4.5, 2, 2, GOLD[3]); p.px(cx - 1, pEave - 5, GOLD[4]);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.px(cx + Math.cos(a) * 5, pEave - 4 + Math.sin(a) * 4, GOLD[2]); }
  });

  return {
    sprite,
    glow: g.canvas,
    chimney: { x: 0, y: -(H - 1) + (14 - 8) },
    forge: null,
    width: W, height: H,
  };
}
