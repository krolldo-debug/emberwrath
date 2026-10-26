import { hash2 } from '../../core/math.js';
import { ramp } from './kit.js';

// Brücken der Sternenscherben (level.bridges aus world/stars/kit.js bridge()): gerade Holz-, Hänge- und Steinbrücken
// über den Abgrund. Gezeichnet im Feinraster (F, G = Weltpixel × 2, 32 Feinpixel je Kachel), auf den Brückenkacheln und
// im Abgrund daneben (Geländerpfosten, Seile, Unterseite, Bögen). Rückgabe 0xRRGGBB oder -2 (durchsichtig: Himmel).
// u läuft entlang der Brücke, v quer (waagrecht: v nach unten, senkrecht: v nach rechts), H = Deckbreite.

const WOOD = ramp(['#2a1a14', '#3e2a1e', '#56392a', '#6e4c34', '#8a6444', '#a88058', '#c49c70']);
const DARK = ramp(['#1e1418', '#2c1e1e', '#3e2a26', '#523830', '#68483a', '#80584a', '#9a6c58']);
const ROPE = ramp(['#4a3624', '#8a6c48', '#c8a874']);
const STONE = ramp(['#2a2840', '#3a3858', '#4a4868', '#625f86', '#807ea6', '#a4a2c6', '#cbc9e2', '#f0eefc']);
const RUNE = ramp(['#8a86c8', '#bfe8ff', '#fff6d8']);
const TILE = 32;

// Seildurchhang zwischen zwei Pfosten (Abstand P): 0 an den Pfosten, bis s in der Mitte
const sag = (u, P, s) => Math.round(s * Math.sin(Math.PI * (u % P) / P));

// ---------------------------------------------------------------- Holz (Bohlen quer zur Laufrichtung)
// Bohle p (je 7 Feinpixel, 1 Fuge): Ton je Bohle, Maserung längs, helle Vorderkante; ragged: ausgefranste Enden
function plank(u, v, H, id, Wd, ragged) {
  const p = Math.floor(u / 7), lu = u - p * 7, hp = hash2(p, id, 731);
  if (lu === 0) return ragged ? -2 : Wd[0];
  if (ragged) {
    const a = 2 + Math.floor(hp * 3), b = H - 3 - Math.floor(hash2(p, id, 733) * 3);
    if (v < a || v > b) return -3;
    if (v === b) return Wd[1];
  }
  if (lu === 1) return Wd[hp < 0.3 ? 4 : 5];
  if (lu === 6) return Wd[2];
  const grain = hash2(p * 7 + lu, v >> 2, 732) < 0.16;
  return Wd[(hp < 0.25 ? 3 : 4) - (grain ? 1 : 0)];
}

function ropeBridge(u, v, H, id, horiz) {
  const P = 64, inDeck = v >= 0 && v < H;
  if (horiz) {
    const pu = u % P;
    // Pfosten oben (über dem Deck) und unten (vor dem Deck)
    if (pu < 3 && ((v >= -14 && v < 2) || (v >= H - 12 && v < H + 1))) return v === -14 || v === H - 12 ? ROPE[2] : WOOD[pu === 0 ? 5 : pu === 1 ? 3 : 1];
    const top = -11 + sag(u, P, 3), bot = H - 9 + sag(u, P, 3);
    if (v === top || v === bot) return ROPE[2];
    if (v === top + 1 || v === bot + 1) return ROPE[0];
    // Hänger zwischen Handlauf und Seitenseil
    if ((u & 7) === 4 && ((v > top + 1 && v < 1) || (v > bot + 1 && v < H - 1))) return ROPE[1];
    if (v === 1 || v === H - 2) return ROPE[1];
    if (inDeck) { const c = plank(u, v, H, id, WOOD, true); return c === -3 ? -2 : c; }
    if (v === H || v === H + 1) return u % 7 ? WOOD[v === H ? 1 : 0] : -2;
    return -2;
  }
  // senkrecht: Bohlen waagrecht, Seitenseile, Pfosten ragen nach oben
  const pu = u % P;
  if (pu >= P - 12 && ((v >= -2 && v < 2) || (v >= H - 2 && v < H + 2))) return pu === P - 12 ? ROPE[2] : WOOD[(v + 2) % 4 === 0 ? 5 : (v + 2) % 4 === 3 ? 1 : 3];
  if (v === -1 || v === H) return ROPE[2];
  if (v === -2 || v === H + 1) return ROPE[0];
  if (v === 1 || v === H - 2) return ROPE[1];
  if (inDeck) { const c = plank(u, v, H, id, WOOD, true); return c === -3 ? -2 : c; }
  return -2;
}

function woodBridge(u, v, H, id, horiz) {
  const P = 40, Wd = DARK, inDeck = v >= 0 && v < H;
  if (horiz) {
    const pu = u % P;
    // Geländer: Pfosten mit Handlauf und Mittelholm, oben über dem Deck, unten vor dem Deck
    const post = pu < 4, rail = (r) => v === r || v === r + 1;
    if (post && ((v >= -13 && v < 3) || (v >= H - 13 && v < H))) return v === -13 || v === H - 13 ? Wd[6] : Wd[pu === 0 ? 5 : pu === 3 ? 1 : 3];
    if (rail(-13) || rail(H - 13)) return v === -13 || v === H - 13 ? Wd[6] : Wd[3];
    if (rail(-7) || rail(H - 7)) return v === -7 || v === H - 7 ? Wd[5] : Wd[2];
    if (inDeck) {
      if (v < 4) return v === 0 ? Wd[5] : v === 3 ? Wd[1] : Wd[4];
      if (v >= H - 4) return v === H - 4 ? Wd[6] : v === H - 1 ? Wd[1] : Wd[3];
      if ((v === 5 || v === H - 6) && u % 7 === 3) return Wd[0];   // Nägel
      return plank(u, v, H, id, Wd, false);
    }
    // Unterseite: Balkenstirn, darunter Streben (V je Joch)
    if (v >= H && v < H + 6) return v === H ? Wd[2] : v === H + 5 ? Wd[0] : Wd[1];
    const d = v - H - 6;
    if (d >= 0 && d < 14) {
      const j = (u % 80) - 40, x = 13 - d;
      if (Math.abs(Math.abs(j) - x) <= 1) return Math.abs(j) - x === -1 ? Wd[2] : Wd[1];
      if (Math.abs(j) < 2 && d < 16) return Wd[1];
    }
    return -2;
  }
  const pu = u % P;
  // senkrecht: Seitenbalken, Handlauf außen, Pfosten als Klötze mit Kappe
  if ((v >= -3 && v < 1) || (v >= H - 1 && v < H + 3)) {
    if (pu >= P - 6) return pu === P - 6 ? Wd[6] : pu === P - 1 ? Wd[0] : Wd[4];
    if (v === -3 || v === H + 2) return Wd[1];
    return v === -2 || v === H - 1 ? Wd[5] : Wd[3];
  }
  if (inDeck) {
    if (v < 4) return v === 1 ? Wd[4] : v === 3 ? Wd[1] : Wd[3];
    if (v >= H - 4) return v === H - 4 ? Wd[5] : v === H - 2 ? Wd[2] : Wd[3];
    if ((v === 5 || v === H - 6) && u % 7 === 3) return Wd[0];
    return plank(u, v, H, id, Wd, false);
  }
  return -2;
}

// ---------------------------------------------------------------- Stein (Perlstein wie das Pflaster der Stadt)
// Platten in Reihen (10 Feinpixel), versetzte Fugen, Ton je Platte; rune: Lichtbrücke (Sternrunen in jeder dritten Platte)
function flag(u, v, id, rune) {
  const r = Math.floor(v / 10), lv = v - r * 10, off = Math.floor(hash2(r, id, 741) * 20);
  const s = Math.floor((u + off) / 20), lu = (u + off) - s * 20, h = hash2(s, r * 31 + id, 742);
  if (lv === 0 || lu === 0) return rune && (lv + lu) % 3 === 0 ? RUNE[0] : STONE[1];
  if (rune && h > 0.62) {
    const dx = Math.abs(lu - 10), dy = Math.abs(lv - 5);
    if ((dx === 0 && dy <= 3) || (dy === 0 && dx <= 3) || (dx === 1 && dy === 1)) return dx + dy === 0 ? RUNE[2] : RUNE[1];
  }
  if (lv === 1 || lu === 1) return STONE[h < 0.5 ? 6 : 5];
  if (lv === 9 || lu === 19) return STONE[3];
  return STONE[h < 0.2 ? 4 : h > 0.85 ? 6 : 5] - (hash2(u >> 1, v >> 1, 743) < 0.08 ? 0x101010 : 0);
}
// Mauerwerk (Ziegel 16 × 5)
function brick(u, v, lo) {
  const r = Math.floor(v / 5), lv = v - r * 5, lu = (u + (r & 1) * 8) % 16;
  if (lv === 0 || lu === 0) return STONE[lo - 2];
  return STONE[lv === 1 ? lo + 1 : lo];
}

function stoneBridge(u, v, H, id, horiz, rune = false) {
  if (horiz) {
    // obere Brüstung: Deckplatte, Mauer zum Deck hin, Schatten
    if (v >= -6 && v < -1) return v === -6 ? STONE[7] : (u % 24 === 0 ? STONE[3] : STONE[6]);
    if (v >= -1 && v < 4) return brick(u, v + 1, 3);
    if (v === 4) return STONE[1];
    if (v >= 5 && v < H - 8) return flag(u, v - 5, id, rune);
    // untere Brüstung
    if (v >= H - 8 && v < H - 4) return v === H - 8 ? STONE[7] : (u % 24 === 0 ? STONE[3] : STONE[6]);
    if (v >= H - 4 && v < H) return brick(u, v - H + 4, 4);
    // Unterseite: Bogenwand mit Pfeilern, die spitz in die Tiefe auslaufen
    const d = v - H, j = (u % 96) - 48;
    if (d >= 0 && d < 30) {
      const e = (j * j) / (34 * 34) + ((d - 30) * (d - 30)) / (22 * 22);
      if (d > 3 && e < 1) return -2;
      if (d > 3 && e < 1.35) return (Math.abs(j) % 6 === 0 ? STONE[1] : STONE[4]);
      return d === 0 ? STONE[2] : brick(u, d, 2);
    }
    const q = Math.abs(Math.abs(j) - 48), t = d - 30;
    if (t >= 0 && q < 14 - (t >> 1)) return q > 12 - (t >> 1) ? STONE[0] : brick(u, d, 2) - 0x080808;
    return -2;
  }
  // senkrecht: Brüstungen links und rechts (Deckplatte mit Fugen), alle 64 Feinpixel ein Pfeiler, der seitlich
  // vorsteht und in die Tiefe ausläuft (hell oben, Kappe), Schattenkante innen, Platten dazwischen
  const pu = u % 64, pil = pu >= 50;
  if (pil && ((v >= -4 && v < 8) || (v >= H - 8 && v < H + 4))) {
    if (pu === 50) return STONE[7];
    if (pu === 63) return STONE[1];
    if (v === -4 || v === H + 3) return STONE[1];
    return rune && pu >= 55 && pu <= 58 && (v === 2 || v === H - 3) ? RUNE[2] : STONE[pu < 53 ? 6 : 5];
  }
  // Pfeilerschaft unter dem Pfeiler (zwischen Deck und Abgrund sichtbar nur seitlich)
  if (pu < 14 && u >= 64 && ((v >= -4 && v < 0) || (v >= H && v < H + 4))) return pu < 2 ? STONE[1] : STONE[pu < 8 ? 2 : 1];
  if (v === -1 || v === H) return STONE[0];
  if (v >= 0 && v < 7) return v === 6 ? STONE[1] : u % 16 === 0 ? STONE[3] : STONE[v === 0 ? 4 : v === 1 ? 7 : 6];
  if (v >= H - 7 && v < H) return v === H - 7 ? STONE[7] : u % 16 === 0 ? STONE[3] : STONE[v === H - 1 ? 3 : 6];
  if (v === 7) return STONE[2];
  if (v > 7 && v < H - 7) return flag(v - 8, u, id, rune);
  return -2;
}

// Lichtbrücke: Steinbrücke mit leuchtenden Sternrunen, Brüstungskappen hell
const lightBridge = (u, v, H, id, horiz) => stoneBridge(u, v, H, id, horiz, true);
const PAINT = { rope: ropeBridge, wood: woodBridge, stone: stoneBridge, light: lightBridge };

// Maler für eine Karte (an der Outdoor-Instanz gemerkt): Kachelindex der Brücken (Deck und ein Rand von zwei Kacheln)
export function bridgePainter(world) {
  if (world.bridgePaint !== undefined) return world.bridgePaint;
  const segs = world.level.bridges ?? [];
  if (!segs.length) return (world.bridgePaint = null);
  const w = world.w, h = world.h, idx = new Int16Array(w * h).fill(-1);
  const mark = (s, i, pad) => {
    for (let a = s.a0 - pad; a < s.a1 + pad; a++) for (let c = s.c0 - pad; c < s.c1 + pad; c++) {
      const x = s.h ? a : c, y = s.h ? c : a;
      if (x >= 0 && y >= 0 && x < w && y < h) idx[y * w + x] = i;
    }
  };
  segs.forEach((s, i) => mark(s, i, 2));
  segs.forEach((s, i) => mark(s, i, 0));
  const geo = segs.map((s, i) => ({ h: s.h, U0: s.a0 * TILE, U1: s.a1 * TILE, V0: s.c0 * TILE, H: (s.c1 - s.c0) * TILE, id: i * 17 + 3, paint: PAINT[s.kind] ?? woodBridge }));
  return (world.bridgePaint = (F, G) => {
    const tx = F >> 5, ty = G >> 5;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -2;
    const i = idx[ty * w + tx];
    if (i < 0) return -2;
    const s = geo[i], u = s.h ? F : G;
    if (u < s.U0 || u >= s.U1) return -2;
    return s.paint(u - s.U0, (s.h ? G : F) - s.V0, s.H, s.id, s.h);
  });
}
