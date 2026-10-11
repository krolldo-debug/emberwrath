import { PAL } from '../gfx/Palette.js';
import { buildFrame, Animation } from '../gfx/Sprite.js';
import { FineCanvas, fineRes } from '../gfx/Fine.js';
import { hash2 } from '../core/math.js';

// Eskorte und Verteidigen (world/questRuns.js): fahrender Karren mit Maultier, Planwagen mit Ochse
// und Kutscher, Ritualkreis. Blickrichtung rechts, Anker = Fußpunkt (Mitte unter dem Gefährt).
// Je Gefährt: anims { idle, walk } (4 Frames: Speichen drehen sich, Zugtier schreitet) und
// decor { sprite, glow?, box } für das stehende Start-Objekt (level.objects, decor 'cart' | 'caravan').
// riftCircle: flacher Kreis am Boden (Start-Objekt 'rift_circle' und Kreis unter Ysolde), glow = Leuchtrunen.
//
// Feinraster (docs/STYLE.md „Feinraster“, Stufe B): gezeichnet wird auf FineCanvas in Weltpixeln; Grundformen wie bisher
// (bei Qualität „Niedrig“ pixelgleich), Feindetails (Holzmaserung, Nägel, Fell, Gesicht, Planenfalten, Runen) in if (p.fine).
const WOOD = ['#140c09', '#1f140f', '#2e1d14', '#412a1c', '#573a26', '#714c31', '#8a6040'];
const IRON = PAL.steel;
const CANVAS = ['#2a241c', '#433a2c', '#5e533e', '#7c6f54', '#9c8e6c', '#bcae88', '#d8cca4'];
const MULE = ['#17110f', '#271c18', '#3a2a24', '#4e3a30', '#664c3e', '#80634f'];
const OX = ['#140f0d', '#231a15', '#35271f', '#4a372a', '#614835', '#7a5c43'];
const HORN = PAL.bone;
const CLOTH = ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a'];
const SKIN = ['#4a2e28', '#7a5040', '#a8765a', '#c89878'];
const RUNE = PAL.magic, EMB = PAL.ember;
const STONE = PAL.stone;

// Ein Frame mit Glow-Ebene (gleiche Koordinaten, 1 Texel Rand wie der buildFrame-Umriss → gleiche Größe wie
// frame.canvas, drawGlowLayer zeichnet sie passend).
function frame(W, H, ax, ay, draw) {
  const res = fineRes(), b = 1 / res;
  const gl = new FineCanvas(W + 2 * b, H + 2 * b, res);
  gl.translate(b, b);
  let used = false;
  const g = {
    fine: gl.fine,
    px: (x, y, c) => { used = true; gl.px(x, y, c); },
    dot: (x, y, c) => { used = true; gl.dot(x, y, c); },
    rect: (x, y, w, h, c) => { used = true; gl.rect(x, y, w, h, c); },
    ellipse: (x, y, rx, ry, c) => { used = true; ell(gl, x, y, rx, ry, c); },
  };
  const f = buildFrame(W, H, ax, ay, (p) => draw(p, g), { fine: true, res });
  if (used) f.glowCanvas = gl.canvas;
  return f;
}

// Gefüllte Ellipse: fein abgetastet, bei res 1 zeilenweise wie PixelCanvas.ellipse (Qualität „Niedrig“ wie früher).
function ell(p, cx, cy, rx, ry, c) {
  if (p.fine) { p.ellipse(cx, cy, rx, ry, c); return; }
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const hw = Math.round(rx * Math.sqrt(t) - 0.15);
    p.rect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, c);
  }
}

// Schattierte Ellipse (Licht oben links), nur fein: Rumpf der Zugtiere, Säcke.
function vol(p, cx, cy, rx, ry, ramp, bias = 0) {
  p.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) return null;
    const t = 0.3 + 0.62 * (u * -0.55 + v * -0.68 + Math.sqrt(1 - d) * 0.48) + bias;
    return ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
  });
}

// Holzbohlen fein: Maserung als kurze Linien (je Bohle fest, kein Rauschen) und Nägel mit Glanzpunkt.
function planksFine(p, x0, y0, w, h, rows, posts) {
  for (const [ry, rh] of rows) {
    for (let i = 0; i < Math.floor(w / 4); i++) {
      const gx = x0 + 1 + i * 4 + hash2(i, ry, 33) * 2, gy = ry + 0.5 + Math.floor(hash2(i, ry, 34) * (rh - 0.5) * 2) / 2;
      p.fline(gx, gy, gx + 1.5 + hash2(i, ry, 35) * 1.5, gy, i % 2 ? WOOD[2] : WOOD[4]);
    }
  }
  for (const x of posts) for (const ny of [y0 + 1, y0 + h - 2]) { p.dot(x + 0.25, ny, IRON[2]); p.dot(x, ny - 0.25, '#d8dee8'); }
}

// Speichenrad: Eisenreif, Felge, 6 Speichen (um phase gedreht), Nabe.
function wheel(p, wx, wy, r, phase) {
  if (p.fine) { wheelFine(p, wx, wy, r, phase); return; }
  ell(p, wx, wy, r, r, IRON[1]);
  ell(p, wx, wy, r - 1, r - 1, WOOD[3]);
  ell(p, wx, wy, r - 2, r - 2, '#0d0a0c');
  for (let i = 0; i < 6; i++) {
    const a = phase + (i / 6) * Math.PI * 2;
    p.line(wx, wy, wx + Math.cos(a) * (r - 2), wy + Math.sin(a) * (r - 2), i % 2 ? WOOD[3] : WOOD[4]);
  }
  ell(p, wx, wy, 1.5, 1.5, WOOD[5]); p.px(wx, wy, IRON[3]);
  for (let i = 0; i < 5; i++) { const a = Math.PI + 0.4 + i * 0.3; p.px(wx + Math.round(Math.cos(a) * r), wy + Math.round(Math.sin(a) * r), IRON[3]); }
}
// Handfein: Eisenreif mit Lichtkante oben links und Nieten, Felge in Holzstufen mit Stoßfugen, Speichen mit Licht- und
// Schattenseite, Nabe mit Eisenring und Glanzpunkt.
function wheelFine(p, wx, wy, r, phase) {
  const LX = -0.62, LY = -0.78;
  p.each(wx - r - 1, wy - r - 1, wx + r + 1, wy + r + 1, (x, y) => {
    const dx = x - wx, dy = y - wy, d = Math.hypot(dx, dy);
    if (d > r) return null;
    const lit = (dx * LX + dy * LY) / (d || 1);
    if (d > r - 1) return d > r - 0.5 && lit > 0.35 ? IRON[4] : lit > -0.2 ? IRON[2] : IRON[1];       // Eisenreif
    if (d > r - 2) {                                                                                      // Felge
      const a = Math.atan2(dy, dx) - phase, seg = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
      if (seg < 0.09) return WOOD[1];                                                                     // Stoßfuge
      return d < r - 1.5 ? (lit > 0.2 ? WOOD[4] : WOOD[2]) : lit > 0.3 ? WOOD[5] : WOOD[3];
    }
    return d > r - 2.5 ? '#07050a' : '#0d0a0c';
  });
  for (let i = 0; i < 6; i++) {
    const a = phase + (i / 6) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), L = r - 1.75;
    p.fline(wx, wy, wx + c * L, wy + sn * L, i % 2 ? WOOD[3] : WOOD[4], 1);
    // Lichtseite der Speiche (zum Licht oben links), Schattenseite gegenüber
    const nx = -sn * 0.5, ny = c * 0.5, up = nx * -0.62 + ny * -0.78 > 0 ? 1 : -1;
    p.fline(wx + nx * up + c * 1.5, wy + ny * up + sn * 1.5, wx + nx * up + c * L, wy + ny * up + sn * L, WOOD[5]);
    p.fline(wx - nx * up + c * 1.5, wy - ny * up + sn * 1.5, wx - nx * up + c * L, wy - ny * up + sn * L, WOOD[2]);
  }
  for (let i = 0; i < 8; i++) {                                                                           // Nieten im Reif
    const a = phase + (i / 8) * Math.PI * 2 + 0.2, x = wx + Math.cos(a) * (r - 0.5), y = wy + Math.sin(a) * (r - 0.5);
    p.dot(x, y, Math.cos(a) * -0.62 + Math.sin(a) * -0.78 > 0 ? '#e8eef6' : IRON[3]);
  }
  p.ellipse(wx, wy, 1.75, 1.75, IRON[2]); p.ellipse(wx, wy, 1.25, 1.25, WOOD[5]); p.ellipse(wx, wy, 0.75, 0.75, IRON[3]);
  p.dot(wx - 0.5, wy - 0.5, '#f4f8ff'); p.dot(wx + 0.5, wy + 1, IRON[1]);
}

// Vierbeiniges Zugtier (Maultier/Ochse) nach rechts. step 0..3: Beinpaare im Wechsel.
function beast(p, x, y, { body, big = false, horns = false, step = 0 }) {
  const C = body, bw = big ? 9 : 7, bh = big ? 5 : 4;
  const legs = big ? [[-6, 0], [-3, 1], [4, 0], [7, 1]] : [[-5, 0], [-3, 1], [3, 0], [5, 1]];
  legs.forEach(([lx, pair], i) => {
    const swing = (step + pair * 2) % 4;
    const off = swing === 1 ? 1 : swing === 3 ? -1 : 0;
    const top = y + bh - 1, len = big ? 6 : 6;
    p.line(x + lx, top, x + lx + off, top + len, i < 2 ? C[1] : C[2]);
    p.px(x + lx + off, top + len, C[0]);
  });
  if (p.fine) vol(p, x, y, bw, bh, [C[1], C[1], C[3], C[3], C[4]], 0.05);   // drei klare Tonflächen: Schatten, Mittel, Licht
  else {
    ell(p, x, y, bw, bh, C[2]);
    ell(p, x - 1, y - 1, bw - 1, bh - 2, C[3]);
    p.rect(x - bw + 2, y - bh + 1, bw * 2 - 4, 1, C[4]);
  }
  // Schweif
  p.line(x - bw, y - 1, x - bw - 2, y + 3, C[1]); p.px(x - bw - 2, y + 4, C[0]);
  // Hals und Kopf
  const hx = x + bw - 1, hy = y - (big ? 3 : 4);
  p.rect(hx - 1, hy, 4, 4, C[3]);
  if (big) {
    p.rect(hx + 2, hy, 5, 5, C[3]); p.rect(hx + 2, hy, 5, 1, C[4]); p.rect(hx + 5, hy + 3, 2, 2, C[2]);
    p.px(hx + 4, hy + 1, '#0b0710');
    if (horns) { p.line(hx + 2, hy - 1, hx, hy - 3, HORN[3]); p.px(hx - 1, hy - 3, HORN[4]); p.line(hx + 5, hy - 1, hx + 6, hy - 3, HORN[2]); }
  } else {
    p.rect(hx + 2, hy - 2, 4, 4, C[3]); p.rect(hx + 5, hy, 2, 2, C[2]); p.rect(hx + 2, hy - 2, 4, 1, C[4]);
    p.px(hx + 4, hy - 1, '#0b0710');
    p.line(hx + 2, hy - 3, hx + 1, hy - 6, C[3]); p.line(hx + 3, hy - 3, hx + 3, hy - 6, C[4]); // lange Ohren
  }
  // Geschirr
  p.rect(hx - 1, hy + 1, 1, 3, WOOD[2]); p.px(hx - 1, hy + 1, IRON[3]);
  if (p.fine) beastFine(p, x, y, C, bw, bh, hx, hy, big, horns, legs, step);
}

// Handfein: Rumpf in drei klaren Tonflächen mit Schulter und Schattenfuge, Hals/Kopf abgesetzt, Beine mit Licht- und
// dunkler Außenkante und Hufen, Schweifquaste, Gesicht mit Auge, Glanzpunkt, Nüstern und Maul, Spitzlicht auf
// Hörnern/Ohren, Geschirr mit Naht und Nieten.
function beastFine(p, x, y, C, bw, bh, hx, hy, big, horns, legs, step) {
  vol(p, x + bw - 3, y - 0.5, big ? 4.5 : 3.5, bh - 0.5, [C[1], C[1], C[3], C[3], C[4]], 0.1);   // Schulter
  p.fline(x + bw - 6, y - bh + 2, x + bw - 6.5, y + bh - 1.5, C[1]);                 // Schattenfuge hinter der Schulter
  p.fline(x - bw + 2, y + bh - 0.5, x + bw - 3, y + bh - 0.5, C[0]);                 // Bauchkante
  legs.forEach(([lx, pair]) => {
    const swing = (step + pair * 2) % 4, off = swing === 1 ? 1 : swing === 3 ? -1 : 0, top = y + bh - 1;
    p.fline(x + lx, top + 1.5, x + lx + off, top + 5, C[3]);                            // Lichtkante
    p.fline(x + lx + 0.5, top + 1.5, x + lx + off + 0.5, top + 5, C[0]);                // dunkle Außenkante
    p.dot(x + lx + off + 0.5, top + 5.5, C[0]); p.dot(x + lx + off, top + 6, '#0b0710'); p.dot(x + lx + off + 0.5, top + 6, C[2]);   // Huf
  });
  for (let k = 0; k < 3; k++) p.fline(x - bw - 2, y + 3.5, x - bw - 2.5 + k * 0.5, y + 5, k === 1 ? C[0] : C[1]);   // Quaste
  if (big) {
    p.dot(hx + 4, hy + 1, '#0b0710'); p.dot(hx + 4.5, hy + 1, '#0b0710'); p.dot(hx + 4, hy + 1.5, '#1a1014'); p.dot(hx + 4.5, hy + 1.5, '#0b0710');
    p.dot(hx + 4, hy + 1, '#f0e6d4');                                                    // Glanzpunkt
    p.fline(hx + 3.5, hy + 0.5, hx + 5, hy + 0.5, C[1]);                               // Brauenwulst
    p.dot(hx + 6.5, hy + 3.5, '#0b0710'); p.dot(hx + 6, hy + 3, C[4]);                 // Nüster, Maullicht
    p.fline(hx + 5, hy + 4.5, hx + 6.5, hy + 4.5, C[0]);
    p.fline(hx + 1.5, hy + 0.5, hx + 1.5, hy + 4.5, C[0]);                             // Schattenfuge Hals/Kopf
    p.fline(hx - 1.5, hy + 0.5, hx - 1.5, hy + 4, C[1]);                               // Hals/Rumpf
    p.fline(hx + 2, hy, hx + 6.5, hy, C[5]);                                            // Licht auf der Stirn
    if (horns) {
      p.fline(hx + 1.5, hy - 1, hx - 0.5, hy - 2.5, HORN[4]); p.dot(hx - 1, hy - 3, '#fffbef'); p.dot(hx - 0.5, hy - 3, '#fffbef');
      p.fline(hx + 5.5, hy - 1, hx + 6, hy - 2.5, HORN[3]); p.dot(hx + 6, hy - 3, '#fffbef');
      p.dot(hx + 1.5, hy - 0.5, HORN[1]); p.dot(hx + 5, hy - 0.5, HORN[1]);             // Hornansatz
    }
  } else {
    p.dot(hx + 4, hy - 1, '#0b0710'); p.dot(hx + 4.5, hy - 1, '#0b0710'); p.dot(hx + 4.5, hy - 0.5, '#0b0710'); p.dot(hx + 4, hy - 0.5, '#1a1014');
    p.dot(hx + 4, hy - 1, '#f0e6d4');
    p.fline(hx + 3.5, hy - 1.5, hx + 5, hy - 1.5, C[2]);
    p.dot(hx + 6.5, hy + 0.5, '#0b0710'); p.dot(hx + 6, hy, C[4]); p.fline(hx + 5, hy + 1.5, hx + 6.5, hy + 1.5, C[0]);
    p.fline(hx + 1.5, hy - 3.5, hx + 1, hy - 5.5, '#2a1a16');                          // Ohren: Innenseite, Spitzlicht
    p.dot(hx + 3, hy - 6, '#c8ac90'); p.dot(hx + 3, hy - 5.5, C[5]); p.dot(hx + 1, hy - 6, C[5]);
    p.fline(hx + 1.5, hy - 2, hx + 1.5, hy + 1.5, C[0]);                               // Schattenfuge Hals/Kopf
    p.fline(hx + 2, hy - 2, hx + 5.5, hy - 2, C[5]);
    for (let k = 0; k < 6; k++) p.fline(hx - 1 + k * 0.5, hy - 0.5 + (k & 1) * 0.5, hx - 1.5 + k * 0.5, hy + 1, k % 2 ? C[0] : C[1]);   // Mähne
  }
  // Geschirr: Riemen um die Brust mit Naht, Nieten am Kummet
  p.fline(hx - 0.5, hy + 4, x + 1, y + bh - 1, WOOD[2], 0.5);
  for (let t = 0.15; t < 0.95; t += 0.2) p.dot(hx - 0.5 + (x + 1 - hx + 0.5) * t, hy + 4 + (y + bh - 1 - hy - 4) * t, WOOD[4]);
  p.dot(hx - 1, hy + 1, '#e8eef6'); p.dot(hx - 1, hy + 3, IRON[3]);
}

// ------------------------------------------------------------ Karren mit Maultier (Vesks Händler Tamm)
function cartFrame(step) {
  const W = 58, H = 30, ax = 26, ay = H - 2;
  return frame(W, H, ax, ay, (p) => {
    const phase = step * (Math.PI / 12);
    // Deichsel zum Maultier
    p.line(30, 18, 40, 17, WOOD[2]); p.line(30, 19, 40, 18, WOOD[1]);
    beast(p, 41, 14, { body: MULE, step });
    // Ladefläche
    p.rect(3, 11, 28, 8, WOOD[3]);
    for (let x = 3; x < 31; x += 5) p.rect(x, 11, 1, 8, WOOD[1]);
    p.rect(3, 11, 28, 1, WOOD[5]); p.rect(3, 15, 28, 1, WOOD[2]); p.rect(3, 18, 28, 1, WOOD[0]);
    p.rect(3, 11, 1, 8, WOOD[5]);
    // Ladung: Säcke unter Plane, Kiste, Fass
    ell(p, 11, 9, 7, 3.5, CANVAS[3]); ell(p, 10, 8, 5, 2.5, CANVAS[4]); p.px(8, 6, CANVAS[5]); p.px(10, 6, CANVAS[5]);
    p.line(5, 11, 17, 10, CANVAS[1]);
    p.rect(19, 4, 9, 7, WOOD[4]); p.rect(19, 4, 9, 1, WOOD[5]); p.rect(19, 4, 1, 7, WOOD[5]); p.rect(27, 5, 1, 6, WOOD[2]); p.rect(19, 7, 9, 1, IRON[1]);
    p.px(23, 6, '#c8a040');
    if (p.fine) {
      planksFine(p, 3, 11, 28, 8, [[12, 3], [16, 2]], [8, 13, 18, 23, 28]);
      p.fline(3, 11, 30.5, 11, '#a07a50');                                                     // Lichtkante Bordwand
      vol(p, 11, 9, 7, 3.5, [CANVAS[2], CANVAS[3], CANVAS[4], CANVAS[5]], 0.05);               // Säcke rund schattiert
      vol(p, 9.5, 7.5, 4.5, 2.5, [CANVAS[3], CANVAS[4], CANVAS[5], CANVAS[6]], 0.05);
      p.fline(6, 9.5, 8.5, 7.5, CANVAS[2]); p.fline(13, 10, 15, 8, CANVAS[2]); p.fline(13.5, 10, 15.5, 8, CANVAS[4]);   // Falten
      p.fline(11.5, 6, 12, 11, '#5a4630'); p.dot(11.5, 6, '#7a6040');                      // Schnur
      p.fline(5, 11, 17, 10, CANVAS[1]);
      p.fline(19.5, 9.5, 26.5, 9.5, WOOD[2]); p.fline(19.5, 5.5, 26.5, 5.5, WOOD[3]);         // Kistenbretter
      p.fline(19, 7, 27, 7, IRON[3]); p.fline(19, 7.5, 27, 7.5, IRON[0]);                      // Eisenband
      for (const nx of [20, 26]) { p.dot(nx, 7, '#d8dee8'); p.dot(nx, 9.5, IRON[2]); }
      p.dot(23, 6, '#e8c860'); p.dot(23, 6, '#fff0a0'); p.dot(23.5, 6.5, '#7a5a20');            // Schloss
    }
    // Rad (vorn, dreht sich)
    wheel(p, 15, 21, 7, phase);
    // Staub am Rad
    if (step % 2) p.px(8 + step, 28, '#4a4038');
  });
}

// ------------------------------------------------------------ Planwagen mit Ochse und Kutscher (Imras Karawane)
function caravanFrame(step) {
  const W = 78, H = 44, ax = 34, ay = H - 2;
  return frame(W, H, ax, ay, (p, g) => {
    const phase = step * (Math.PI / 14);
    const bob = step % 2;
    // Deichsel
    p.line(42, 28, 52, 27, WOOD[2]); p.line(42, 29, 52, 28, WOOD[1]);
    beast(p, 55, 23, { body: OX, big: true, horns: true, step });
    // hinteres Rad (dahinter)
    wheel(p, 36, 33, 7, phase + 0.3);
    // Wagenkasten
    p.rect(2, 22, 42, 9, WOOD[3]);
    for (let x = 2; x < 44; x += 6) p.rect(x, 22, 1, 9, WOOD[1]);
    p.rect(2, 22, 42, 1, WOOD[5]); p.rect(2, 26, 42, 1, WOOD[2]); p.rect(2, 30, 42, 1, WOOD[0]);
    if (p.fine) { planksFine(p, 2, 22, 42, 9, [[23, 3], [27, 3]], [8, 14, 20, 26, 32, 38]); p.fline(2, 22, 43.5, 22, '#a07a50'); }
    // Plane: Bogen über Reifen, helle Leinwand mit Flicken
    for (let x = 3; x <= 40; x++) {
      const t = (x - 3) / 37;
      const top = 6 + Math.round(Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 5);
      for (let y = top; y < 22; y++) {
        let i = y < top + 2 ? 5 : y > 18 ? 2 : 4;
        if ((x - 3) % 9 === 0) i = 1; // Reifen
        else if (!p.fine && hash2(x, y, 71) < 0.08) i--;
        p.px(x, y, CANVAS[i]);
      }
    }
    p.rect(14, 12, 5, 4, CANVAS[2]); p.rect(14, 12, 5, 1, CANVAS[3]); p.px(16, 13, CANVAS[1]); // Flicken
    p.rect(27, 15, 4, 3, CLOTH[2]); p.px(27, 15, CLOTH[3]);
    if (p.fine) {
      // Plane: zweifarbige Falten zwischen den Reifen, Reifen mit Lichtkante, Saum, Nähte an den Flicken
      const topAt = (x) => 6 + Math.round(Math.pow(Math.abs((x - 3) / 37 - 0.5) * 2, 2.2) * 5);
      for (let h = 3, j = 0; h < 40; h += 9, j++) {
        p.fline(h + 0.5, topAt(h) + 0.5, h + 0.5, 21.5, CANVAS[3]);                           // Reifen: Schattenseite
        p.dot(h - 0.5, topAt(h) + 0.5, CANVAS[6]);
        // je Feld eine Hängefalte (hell auf der Lichtseite, dunkel daneben), am Saum zusammengezogen
        const fx = h + 4 + (j % 2) * 1.5;
        if (fx < 38) {
          const t0 = topAt(Math.floor(fx)) + 3 + (j % 3);
          p.fline(fx - 0.5, t0, fx - 0.5, 19, CANVAS[5]); p.fline(fx, t0 + 1, fx, 19.5, CANVAS[3]);
          p.fline(fx - 2, 20, fx, 19.5, CANVAS[3]); p.fline(fx + 2, 20, fx, 19.5, CANVAS[3]);
        }
      }
      p.fline(3, 21.5, 40.5, 21.5, CANVAS[1]);
      for (let x = 3.5; x < 40; x += 1.5) p.dot(x, 21, CANVAS[2]);                             // Saumnaht
      // Flicken ruhig: gleichmäßige Fläche, Naht nur als helle Kante oben links, Schattenkante unten
      p.rect(14, 12.5, 5, 3.5, CANVAS[2]); p.fline(14, 12, 18.5, 12, CANVAS[4]); p.fline(14, 12, 14, 15.5, CANVAS[3]);
      p.fline(14.5, 15.5, 18.5, 15.5, CANVAS[1]);
      p.fline(27, 15, 30.5, 15, CLOTH[3]); p.fline(27.5, 17.5, 30.5, 17.5, CLOTH[1]);
    }
    // Öffnung vorn mit dunklem Inneren
    p.rect(38, 9, 3, 13, '#120c0a'); p.rect(37, 8, 1, 14, CANVAS[1]);
    // Kutscher auf dem Bock
    const kx = 42, ky = 13 + bob * 0;
    p.rect(kx - 1, ky + 4, 5, 6, CLOTH[1]); p.rect(kx - 1, ky + 4, 5, 1, CLOTH[2]); p.rect(kx, ky + 5, 1, 4, CLOTH[2]);
    p.rect(kx, ky, 4, 4, SKIN[2]); p.px(kx + 2, ky + 1, '#150c12'); p.rect(kx, ky + 3, 4, 1, SKIN[1]);
    p.rect(kx - 1, ky - 1, 6, 2, '#3a2a1a'); p.rect(kx, ky - 2, 4, 1, '#4e3a24'); // Hut
    if (p.fine) {
      // Gesicht: Augenweiß, Pupille, Braue, Nasenrücken, Bartstoppeln, Mund; Hutband und Krempe mit Lichtkante; Mantelfalten, Knöpfe
      p.dot(kx + 1.5, ky + 1, '#e6dccb'); p.dot(kx + 2, ky + 1, '#150c12'); p.dot(kx + 2, ky + 1.5, '#150c12'); p.dot(kx + 1.5, ky + 1.5, '#8a5a44');
      p.fline(kx + 1, ky + 0.5, kx + 2.5, ky + 0.5, '#2a1a12');
      p.dot(kx + 3.5, ky + 1, SKIN[3]); p.dot(kx + 3.5, ky + 1.5, SKIN[3]); p.dot(kx + 3.5, ky + 2, SKIN[1]);
      p.dot(kx + 0.5, ky + 0.5, SKIN[3]); p.dot(kx, ky + 1.5, SKIN[1]);                    // Wange, Ohr
      p.dot(kx + 2.5, ky + 2.5, '#4a2418');
      for (let k = 0; k < 8; k++) p.dot(kx + k * 0.5, ky + 3 + (k & 1) * 0.5, k % 3 ? '#3a2618' : '#56392a');   // Bart
      p.fline(kx - 1, ky - 1, kx + 4.5, ky - 1, '#5e4a30'); p.fline(kx - 0.5, ky - 0.5, kx + 4.5, ky - 0.5, '#24180e');
      p.fline(kx, ky - 2, kx + 2, ky - 2, '#6a5236');
      p.fline(kx + 2.5, ky + 5, kx + 3, ky + 9.5, CLOTH[0]); p.fline(kx - 0.5, ky + 6, kx - 0.5, ky + 9.5, CLOTH[2]);
      p.dot(kx + 1.5, ky + 6, '#c8a040'); p.dot(kx + 1.5, ky + 7.5, '#c8a040'); p.dot(kx + 1.5, ky + 6, '#f0d070');
      p.dot(kx + 3.5, ky + 6, SKIN[2]); p.dot(kx + 4, ky + 6, SKIN[3]);                      // Hand am Zügel
    }
    p.line(kx + 4, ky + 6, 51, 24, '#2a1c12'); // Zügel
    // Laterne am Bug
    p.px(44, 6, IRON[2]); p.rect(43, 7, 3, 4, EMB[3]); p.px(44, 8, EMB[5]);
    g.rect(43, 7, 3, 4, EMB[4]); g.px(44, 8, '#fff4d0');
    if (p.fine) {
      // Laterne: Eisengitter, heißer Kern, Glasglanz
      p.fline(43, 7, 45.5, 7, IRON[3]); p.fline(43, 10.5, 45.5, 10.5, IRON[1]); p.fline(44.5, 7, 44.5, 10.5, IRON[1]);
      p.dot(44, 8.5, '#fffbe8'); p.dot(44, 9, '#fff0b0'); p.dot(43, 7.5, '#fff4d0'); p.dot(44.5, 5.5, IRON[4]);
      g.dot(44, 8.5, '#ffffff'); g.dot(44, 9, '#fff4d0');
    }
    // Vorderrad (dreht sich)
    wheel(p, 12, 33, 8, phase);
    if (step % 2) p.px(4 + step, 42, '#4a4038');
  });
}

// ------------------------------------------------------------ Ritualkreis (Schlackenhöhen)
// Runenzeichen 6×4 Feinpixel (3×2 Weltpixel): '#' heißer Kern, '+' Strich, '.' leer
const RUNE_GLYPHS = [
  ['.+##+.', '.+..+.', '.+..+.', '++..++'],
  ['+.##.+', '.+..+.', '..++..', '.+..+.'],
  ['.++++.', '..#...', '...#..', '.++++.'],
  ['+....+', '.+##+.', '.+..+.', '+....+'],
  ['..++..', '.+##+.', '+.##.+', '..++..'],
  ['++.+..', '.+##+.', '..+.++', '...+..'],
];
function riftCircle() {
  const W = 52, H = 24, ax = 26, ay = 15;
  return frame(W, H, ax, ay, (p, g) => {
    const cx = 26, cy = 12;
    // Ascheboden und Steinring
    ell(p, cx, cy, 25, 11, '#1a1418');
    ell(p, cx, cy, 22, 9, '#241c20');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 23), y = Math.round(cy + Math.sin(a) * 10);
      ell(p, x, y, 2, 1.3, STONE[3]); p.px(x - 1, y - 1, STONE[5]);
      if (p.fine) {
        p.fline(x - 1.5, y - 0.5, x + 0.5, y - 1, STONE[4]); p.dot(x - 1.5, y - 1, STONE[5]);
        p.fline(x - 1, y + 1, x + 1.5, y + 0.5, STONE[1]); p.dot(x + 0.5, y, STONE[2]);
      }
    }
    // Runenring (leuchtet)
    if (p.fine) {
      // fein: doppelter Ring (hell außen, dunkler innen), Glow nur auf dem äußeren
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        p.dot(cx + c * 17.25, cy + sn * 7.25, i % 5 ? RUNE[2] : RUNE[3]);
        p.dot(cx + c * 16.25, cy + sn * 6.5, RUNE[1]);
        if (i % 2 === 0) g.dot(cx + c * 17.25, cy + sn * 7.25, i % 10 ? RUNE[3] : RUNE[4]);
      }
    } else {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * 17), y = Math.round(cy + Math.sin(a) * 7);
        p.px(x, y, RUNE[2]);
        if (i % 2 === 0) g.px(x, y, RUNE[3]);
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.round(cx + Math.cos(a) * 12), y = Math.round(cy + Math.sin(a) * 5);
      if (p.fine) {
        // Runenzeichen in Feinpixeln auf leuchtender Steinplatte: Strich, heißer Kern
        p.rect(x - 1, y - 1, 3, 2, RUNE[2]); g.rect(x - 1, y - 1, 3, 2, RUNE[3]);
        const G = RUNE_GLYPHS[i % RUNE_GLYPHS.length];
        for (let r = 0; r < G.length; r++) for (let k = 0; k < G[r].length; k++) {
          const ch = G[r][k]; if (ch === '.') continue;
          const dx = x - 1 + k * 0.5, dy = y - 1 + r * 0.5;
          p.dot(dx, dy, ch === '#' ? '#ffffff' : RUNE[4]); g.dot(dx, dy, ch === '#' ? '#ffffff' : RUNE[4]);
        }
        continue;
      }
      p.rect(x - 1, y - 1, 3, 2, RUNE[3]); p.px(x, y - 1, RUNE[4]);
      g.rect(x - 1, y - 1, 3, 2, RUNE[4]); g.px(x, y - 1, '#ffffff');
    }
    // Glutkern
    ell(p, cx, cy, 4, 2, EMB[2]); ell(p, cx, cy, 2, 1, EMB[4]);
    g.ellipse(cx, cy, 4, 2, EMB[3]); g.px(cx, cy, EMB[5]);
    if (p.fine) {
      ell(p, cx, cy, 3, 1.5, EMB[3]); ell(p, cx, cy, 1.5, 0.75, EMB[5]); p.dot(cx - 0.5, cy - 0.5, '#ffffff');
      g.ellipse(cx, cy, 2, 1, EMB[4]); g.dot(cx - 0.5, cy - 0.5, '#ffffff'); g.dot(cx, cy - 0.5, '#ffffff');
    }
  });
}

const deco = (f, box) => ({ sprite: f, glow: f.glowCanvas ?? null, box });

export function createCaravanSprites() {
  const cartFrames = [0, 1, 2, 3].map(cartFrame);
  const carFrames = [0, 1, 2, 3].map(caravanFrame);
  const circle = riftCircle();
  return {
    cartAnims: { idle: new Animation([cartFrames[0]], 1), walk: new Animation(cartFrames, 8) },
    caravanAnims: { idle: new Animation([carFrames[0]], 1), walk: new Animation(carFrames, 7) },
    // decor-Einträge für level.objects (Fallback in placeObjects, wenn der Deko-Satz der Zone sie nicht hat)
    cart: deco(cartFrames[0], [-16, -5, 16, 1]),
    caravan: deco(carFrames[0], [-22, -6, 24, 1]),
    riftCircle: { sprite: circle, glow: circle.glowCanvas ?? null, box: [-2, -1, 2, 0], light: { dx: 0, dy: -4, radius: 70, color: [170, 100, 255], intensity: 0.7 } },
  };
}
