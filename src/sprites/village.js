import { PAL } from '../gfx/Palette.js';
import { PixelCanvas } from '../gfx/PixelCanvas.js';
import { buildFrame } from '../gfx/Sprite.js';
import { hash2 } from '../core/math.js';

// Dorf-Objekte für das Endgame: Glutpforte (Eingang der Glutprüfungen) und
// Gemeinschaftstruhe (Bank). Format wie Deko-Einträge: { sprite, glow, box, light }.
// Glow-Canvas (W+2)×(H+2) mit 1 px Versatz (wie buildFrame-Umriss).
const BASALT = ['#0d0b10', '#18141c', '#241e2a', '#332a39', '#463b4c', '#5b4e60'];
const EMB = PAL.ember, GOLD = PAL.gold, IRON = PAL.steel;
const WOOD = ['#140c09', '#22150f', '#342016', '#4a2e1e', '#61402a', '#7c5636'];

export function createVillageProps() {
  return { emberGate: emberGate(), bankChest: bankChest(), mirror: mirror() };
}

function emberGate() {
  const W = 48, H = 60, cx = 24, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // Sockelstufen
    p.rect(4, bottom - 3, W - 8, 4, BASALT[2]); p.rect(4, bottom - 3, W - 8, 1, BASALT[4]);
    p.rect(8, bottom - 6, W - 16, 3, BASALT[3]); p.rect(8, bottom - 6, W - 16, 1, BASALT[5]);
    // Pfeiler (links/rechts), leicht nach oben verjüngt, mit Runenkerben
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 7 : W - 15;
      for (let y = 8; y < bottom - 6; y++) {
        const taper = y < 16 ? 1 : 0;
        for (let x = x0 + taper; x < x0 + 8 - taper; x++) {
          const k = x - x0;
          let c = BASALT[k === 0 ? 4 : k === 1 ? 3 : k >= 6 ? 1 : 2];
          if (hash2(x, y, 9) < 0.06) c = BASALT[1];
          p.px(x, y, c);
        }
      }
      // Runen: drei Kerben je Pfeiler, auf der Glow-Ebene glühend
      for (let i = 0; i < 3; i++) {
        const ry = 20 + i * 9, rx = x0 + 3;
        const shape = [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]];
        const shape2 = [[0, 0], [1, 0], [1, 1], [0, 2], [1, 3], [1, 4]];
        for (const [dx, dy] of (i % 2 ? shape2 : shape)) { p.px(rx + dx, ry + dy, EMB[1]); G(rx + dx, ry + dy, EMB[3 + (dy % 2)]); }
      }
      // Kapitell
      p.rect(x0 - 1, 6, 10, 3, BASALT[3]); p.rect(x0 - 1, 6, 10, 1, BASALT[5]);
    }
    // Sturz (Bogen) mit Glutkristall
    for (let x = 6; x < W - 6; x++) {
      const t = (x - cx) / (cx - 6);
      const y0 = Math.round(2 + t * t * 4);
      for (let y = y0; y < y0 + 5; y++) p.px(x, y, BASALT[y === y0 ? 5 : y === y0 + 4 ? 1 : 3]);
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
    // Innenraum: dunkle Tiefe, der Wirbel liegt auf der Glow-Ebene
    for (let y = 11; y < bottom - 6; y++) {
      for (let x = 15; x < W - 15; x++) {
        const t = Math.abs(x - cx) / 9;
        if (y < 14 && t > 0.7) continue;
        p.px(x, y, y > bottom - 12 ? '#2a1010' : '#120709');
      }
    }
    // Wirbel: Spirale in Glutfarben
    for (let i = 0; i < 260; i++) {
      const a = i * 0.21, r = i * 0.055;
      const x = Math.round(cx + Math.cos(a) * r * 0.9), y = Math.round(30 + Math.sin(a) * r * 1.35);
      if (x < 15 || x >= W - 15 || y < 12 || y > bottom - 7) continue;
      const c = r < 3 ? '#fff4d0' : r < 7 ? EMB[5] : r < 11 ? EMB[4] : EMB[3];
      p.px(x, y, r < 7 ? EMB[4] : EMB[2]);
      G(x, y, c);
    }
    // Moosreste und Asche am Sockel
    for (let x = 6; x < W - 6; x++) if (hash2(x, 0, 12) < 0.25) p.px(x, bottom - 4, '#2a3923');
  });
  return { sprite, glow: g.canvas, box: [-18, -6, 18, 1], light: { dx: 0, dy: -26, radius: 90, color: [255, 150, 70], intensity: 0.95 }, embers: { dx: 0, dy: -24, rate: 5 } };
}

function bankChest() {
  const W = 30, H = 24, cx = 15, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
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
    // Eisenbänder und Beschläge
    for (const bx of [x0 + 3, x1 - 4]) {
      for (let y = lidY; y <= bottom - 1; y++) { p.px(bx, y, IRON[2]); p.px(bx + 1, y, IRON[1]); }
      for (let y = lidY + 2; y < bottom; y += 4) p.px(bx, y, IRON[4]);
    }
    p.rect(x0, bodyY, x1 - x0 + 1, 1, IRON[2]);
    p.rect(x0, bottom - 1, x1 - x0 + 1, 1, IRON[1]);
    // Goldkanten
    p.px(x0, bodyY, GOLD[3]); p.px(x1, bodyY, GOLD[3]); p.px(x0, bottom - 1, GOLD[2]); p.px(x1, bottom - 1, GOLD[2]);
    // Schloss mit Wappen
    p.rect(cx - 3, bodyY - 2, 6, 7, GOLD[2]); p.rect(cx - 3, bodyY - 2, 6, 1, GOLD[4]); p.rect(cx - 2, bodyY - 1, 4, 5, GOLD[3]);
    p.px(cx, bodyY + 1, WOOD[0]); p.px(cx, bodyY + 2, WOOD[0]);
    G(cx - 2, bodyY - 2, '#fff0b0'); G(cx - 1, bodyY - 2, GOLD[4]);
    // Füße
    p.rect(x0, bottom, 3, 1, IRON[1]); p.rect(x1 - 2, bottom, 3, 1, IRON[1]);
  });
  return { sprite, glow: g.canvas, box: [-13, -6, 13, 1] };
}

// Standspiegel mit geschnitztem Holzrahmen (Aussehen ändern, Panel von A)
function mirror() {
  const W = 20, H = 34, cx = 10, bottom = H - 1;
  const g = new PixelCanvas(W + 2, H + 2);
  const G = (x, y, c) => g.px(x + 1, y + 1, c);
  const sprite = buildFrame(W, H, cx, bottom, (p) => {
    // Füße und Ständer
    p.rect(3, bottom, 5, 1, WOOD[2]); p.rect(12, bottom, 5, 1, WOOD[2]);
    p.rect(5, bottom - 5, 2, 5, WOOD[3]); p.rect(13, bottom - 5, 2, 5, WOOD[3]);
    p.rect(5, bottom - 5, 1, 5, WOOD[5]);
    // Ovaler Rahmen
    const ey = 13, rx = 8, ry = 12;
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
    // Glanzstreifen
    for (let i = 0; i < 7; i++) { p.px(cx - 4 + i, ey - 6 + i, '#dfe7f2'); G(cx - 4 + i, ey - 6 + i, 'rgba(220,235,255,0.5)'); }
    p.px(cx + 3, ey - 5, '#ffffff'); G(cx + 3, ey - 5, '#ffffff');
    // Schnitzkrone oben
    p.rect(cx - 2, 0, 5, 2, WOOD[4]); p.px(cx, 0, GOLD[3]); G(cx, 0, GOLD[4]);
  });
  return { sprite, glow: g.canvas, box: [-7, -4, 7, 1] };
}
