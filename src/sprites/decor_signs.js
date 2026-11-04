// Zunftschilder vor den Häusern mit Dienst (world/townServices.js) und der Wegweiser am Wegstein.
// Gleiche Bauweise wie die Hängeschilder der Altstadt (decor_altstadt.js sign): Eisenarm, Eichenbrett, gemaltes Zeichen,
// hier aber auf eigenem Pfosten, damit es vor jeder Bauart steht (Fachwerk, Baumhaus, Jurte, Pfahlhaus, Langhaus).
// Der Arm zeigt nach rechts; links der Tür wird das Schild gespiegelt (Decor flip), die Zeichen sind dafür symmetrisch.
import { mk } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import { PAL } from './decor_altstadt.js';

const { OAK, IRON, RUB } = PAL;
const C = (h) => col32(h);
const GOLD = ['#5a3a12', '#8a5a1c', '#c08a2a', '#e8c25a', '#fff0a8'].map(C);
const STEEL = ['#2c2c34', '#5a5a66', '#8a8a98', '#c0c4d0', '#eef0f6'].map(C);

// Pfosten mit Arm und hängendem Brett; icon(p, mx, my) malt das Zeichen um die Brettmitte (hier 1,5-fach vergrößert)
function guildSign(icon, rim) {
  return mk(38, 56, (p) => {
    // Fußstein und Pfosten
    p.scan(1, 51, 10, 55, (x, y) => (y < 52 ? RUB.c[5] : x < 2 || x > 9 ? RUB.c[2] : RUB.c[y < 53.5 ? 4 : 3]));
    p.scan(4, 6, 7, 52, (x) => OAK.c[x < 5 ? 6 : x > 6 ? 2 : 4]);
    p.scan(3.5, 4, 7.5, 6, (x) => OAK.c[x < 5 ? 7 : 5]);
    // Eisenarm mit Strebe und Zierspitze
    p.scan(5, 7, 36, 8.4, (x, y) => IRON.c[y < 7.6 ? 5 : 3]);
    p.scan(35, 5.6, 37, 9.8, () => IRON.c[4]);
    for (let t = 0; t <= 1; t += 0.04) { const x = 7 + t * 12, y = 17 - t * 9; p.scan(x - 0.6, y - 0.6, x + 0.6, y + 0.6, () => IRON.c[3]); }
    // Ketten
    for (const cx of [12, 32]) for (let y = 8.4; y < 12; y += 1.2) p.scan(cx - 0.5, y, cx + 0.5, y + 0.8, () => IRON.c[(Math.floor(y) % 2) ? 4 : 2]);
    // Brett mit gemaltem Rand
    p.scan(9, 12, 36, 36, (x, y) => {
      if (x < 9.8 || x > 35.2 || y > 35.2) return OAK.c[1];
      if (y < 12.8) return OAK.c[7];
      if (x < 11.2 || x > 33.8 || y < 14.2 || y > 33.8) return C(rim);
      return Math.floor(y - 12) % 6 === 0 ? OAK.c[3] : OAK.c[x < 22.5 ? 5 : 4];
    });
    icon(zoom(p, 22.5, 24, 1.5), 22.5, 24);
  }, { ax: 5, ay: 54, b: true });
}
// Zeichnen um (mx, my) um den Faktor k vergrößert: dieselben Zeichen-Funktionen für jede Brettgröße
function zoom(p, mx, my, k) {
  return { scan: (x0, y0, x1, y1, fn) => p.scan(mx + (x0 - mx) * k, my + (y0 - my) * k, mx + (x1 - mx) * k, my + (y1 - my) * k, (x, y) => fn(mx + (x - mx) / k, my + (y - my) / k)) };
}

// Waage: Auktionshaus
function scales(p, mx, my) {
  p.scan(mx - 0.5, my - 5.5, mx + 0.5, my + 5, (x) => GOLD[x < mx ? 4 : 2]);                     // Säule
  p.scan(mx - 3, my + 5, mx + 3, my + 6.4, (x) => GOLD[x < mx ? 3 : 1]);                         // Fuß
  p.scan(mx - 6.5, my - 4.6, mx + 6.5, my - 3.8, (x) => GOLD[x < mx ? 4 : 3]);                   // Balken
  p.scan(mx - 1, my - 6.6, mx + 1, my - 4.6, () => GOLD[4]);
  for (const sx of [-1, 1]) {
    const px = mx + sx * 5.6;
    for (const k of [-1, 1]) for (let t = 0; t <= 1; t += 0.08) { const x = px + k * t * 2.4, y = my - 3.8 + t * 4.4; p.scan(x - 0.25, y - 0.25, x + 0.25, y + 0.25, () => GOLD[1]); }
    p.scan(px - 3, my + 0.6, px + 3, my + 2.2, (x, y) => (Math.abs(x - px) > 3 - (y - my - 0.6) * 0.9 ? 0 : GOLD[y < my + 1.2 ? 4 : 2]));   // Schale
  }
}
// Gekreuzte Schwerter: Haus der Glutarena (Griffe unten)
function swords(p, mx, my) {
  for (const s of [-1, 1]) {
    const ax = mx - s * 6, ay = my + 6, bx = mx + s * 5.5, by = my - 5.5;
    for (let t = 0.24; t <= 1; t += 0.03) {                                                      // Klinge mit Licht- und Schattenkante
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      p.scan(x - 0.5, y - 0.5, x + 0.5, y + 0.5, () => STEEL[t > 0.94 ? 4 : 3]);
      p.scan(x + 0.5 * s, y + 0.5, x + 0.5 * s + 0.5, y + 1, () => STEEL[1]);
    }
    for (let t = 0; t < 0.2; t += 0.03) { const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; p.scan(x - 0.45, y - 0.45, x + 0.45, y + 0.45, () => OAK.c[6]); }   // Griff
    p.scan(ax - 0.9, ay - 0.9, ax + 0.9, ay + 0.9, () => GOLD[3]);                               // Knauf
    const gx = ax + (bx - ax) * 0.21, gy = ay + (by - ay) * 0.21;                                // Parierstange quer zur Klinge
    for (let k = -2.4; k <= 2.4; k += 0.3) { const x = gx + k * 0.71, y = gy + s * k * 0.71; p.scan(x - 0.45, y - 0.45, x + 0.45, y + 0.45, () => GOLD[k < 0 ? 4 : 2]); }
  }
}
// Gewand mit Nadel: Schneiderei
function tunic(p, mx, my) {
  const body = ['#2a1438', '#4a2462', '#6c3a8a', '#9058b0'].map(C);
  p.scan(mx - 6.5, my - 5, mx + 6.5, my + 7, (x, y) => {
    const ax = Math.abs(x - mx);
    if (ax < 1.6 && y < my - 3.6) return 0;                       // Halsausschnitt
    if (y < my - 1) return body[ax > 4.2 ? 1 : x < mx ? 3 : 2];    // Schultern und Ärmel
    if (ax > 4.2 + (y - my) * 0.15) return 0;                      // Rock wird nach unten weiter
    return y > my + 6 ? body[0] : body[x < mx ? 3 : 2];
  });
  p.scan(mx - 4.2, my + 1, mx + 4.6, my + 2, () => GOLD[3]);       // Gürtel
  for (let t = 0; t <= 1; t += 0.06) { const x = mx + 2 + t * 5, y = my - 6 + t * 8; p.scan(x - 0.4, y - 0.4, x + 0.4, y + 0.4, () => STEEL[4]); }
}
// Amboss mit Hammer: Schmiede
function anvilIcon(p, mx, my) {
  p.scan(mx - 6.5, my - 1, mx + 5, my + 2.4, (x, y) => (x < mx - 3.5 && y > my + 0.6 + (mx - 3.5 - x) * 0.4 ? 0 : STEEL[y < my - 0.2 ? 3 : 1]));
  p.scan(mx - 2, my + 2.4, mx + 2.5, my + 5, () => STEEL[0]);
  p.scan(mx - 4, my + 5, mx + 4.5, my + 6.6, (x) => STEEL[x < mx ? 2 : 1]);
  p.scan(mx + 1, my - 7, mx + 6, my - 4.4, (x, y) => STEEL[y < my - 6.2 ? 4 : 2]);
  p.scan(mx + 3, my - 4.4, mx + 4.2, my - 0.6, () => OAK.c[6]);
}
// Kolben mit Kraut: Kräuterstube
function flask(p, mx, my) {
  const G = ['#1a3a22', '#2a6a3a', '#3a8a4a', '#6ac07a', '#b0f0b8'].map(C);
  p.scan(mx - 1.3, my - 6.5, mx + 1.3, my - 2, (x, y) => (y < my - 5.5 ? OAK.c[6] : STEEL[x < mx ? 4 : 3]));
  p.scan(mx - 5, my - 2, mx + 5, my + 6.5, (x, y) => {
    const d = ((x - mx) / 5) ** 2 + ((y - my - 2.4) / 4.4) ** 2;
    return d > 1 ? 0 : d > 0.75 ? G[1] : y < my + 0.8 ? STEEL[3] : G[x < mx ? 3 : 2];
  });
  p.scan(mx - 2.4, my - 0.4, mx - 1.2, my + 2, () => G[4]);
}

const ICONS = { auction: [scales, '#8a5a1c'], arena: [swords, '#7a2420'], tailor: [tunic, '#4a2462'], smith: [anvilIcon, '#40404a'], herbs: [flask, '#2a6a3a'] };

// Wegweiser: Pfosten mit drei Pfeilbrettern (Schrift nur angedeutet)
function waySign() {
  return mk(36, 50, (p) => {
    p.scan(13, 45, 23, 49, (x, y) => (y < 46 ? RUB.c[5] : x < 14 || x > 22 ? RUB.c[2] : RUB.c[y < 47.5 ? 4 : 3]));
    p.scan(16.5, 4, 19.5, 46, (x) => OAK.c[x < 17.5 ? 6 : x > 18.5 ? 2 : 4]);
    p.scan(16, 2.5, 20, 4.5, (x) => OAK.c[x < 17.5 ? 7 : 5]);
    const board = (y, dir, x0, x1) => {
      p.scan(x0 - (dir < 0 ? 4 : 0), y, x1 + (dir > 0 ? 4 : 0), y + 7, (x, yy) => {
        const tip = dir > 0 ? x - x1 : x0 - x;
        if (tip > 0 && tip > 3.5 - Math.abs(yy - y - 3.5)) return 0;
        if (yy > y + 6.2) return OAK.c[1];
        if (yy < y + 0.8) return OAK.c[7];
        const tx = dir > 0 ? x - x0 : x1 - x;
        if (Math.abs(yy - y - 3.6) < 0.6 && tx > 2 && tx < (x1 - x0) - 2 && Math.floor(tx * 0.9) % 4 !== 3) return OAK.c[1];
        return OAK.c[(Math.floor(x / 5) + Math.floor(yy)) % 7 === 0 ? 3 : 5];
      });
    };
    board(6, 1, 18, 31);
    board(15, -1, 5, 18);
    board(24, 1, 18, 29);
    for (const y of [9, 18, 27]) p.scan(17.3, y, 18.7, y + 1.2, () => IRON.c[5]);
  }, { ax: 18, ay: 48, b: true });
}

let SIGNS = null;
export function createServiceSigns() {
  if (SIGNS) return SIGNS;
  SIGNS = { way: waySign() };
  for (const [k, [icon, rim]] of Object.entries(ICONS)) SIGNS[k] = guildSign(icon, rim);
  return SIGNS;
}
