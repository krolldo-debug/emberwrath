import { ELEMENTS } from './Particles.js';
import { fxElement } from '../character/gearLook.js';

// Animierte Item-Effekte (Thread D): je seltener, desto spektakulärer.
//   selten    – funkelnde Teilchen im Thema des Gegenstands
//   episch    – dazu Flammen/Aura hinter dem Gegenstand, Leuchtpuls
//   legendär  – hohe Flammen, drehender Strahlenkranz, dichte Funken
// Das Thema (Feuer, Frost, Schatten, Licht, Arkan, Gift, Natur, Gezeiten) ergibt sich aus
// ID, Symbol und Name des Items (z. B. „Glutklinge“ → Feuer). Die Animation ist ein
// kleiner Pixel-Filmstreifen (9 Bilder à 24 × 24), der per CSS steps() abgespielt
// wird: kein JS pro Bild, günstig auch bei vollem Inventar.
//
// Für andere Bereiche (z. B. Thread A, Waffenglühen an der Figur):
//   itemFxTheme(def)  -> Element (Ausrüstung: fxElement von Thread A) ('fire' | 'frost' | …), sonst 'rare'|'epic'|'legendary'; unter selten null
//   FX_PALETTES[theme] -> [dunkel, mittel, hell, Kern] als CSS-Farben

// Farben aus den Element-Paletten (gfx/Particles.js), die auch der Held für das
// Waffenglühen nutzt (entities/Hero.js, Thread A) – Icon und Figur leuchten gleich.
const fromEl = (id) => { const c = ELEMENTS[id].colors; return [c[4], c[3], c[2], c[0]]; };
export const FX_PALETTES = Object.freeze({
  fire: fromEl('fire'), frost: fromEl('frost'), shadow: fromEl('shadow'), holy: fromEl('holy'),
  arcane: fromEl('arcane'), poison: fromEl('poison'), nature: fromEl('nature'), water: fromEl('water'),
  rare: ['#10306a', '#2a6ae0', '#7ab0ff', '#eef6ff'],
  epic: ['#300a5a', '#8a3ae0', '#d090ff', '#fbefff'],
  legendary: ['#7a3208', '#e0801a', '#ffd060', '#fffbe0'],
});

// Ausrüstung: Element genau wie an der Figur (character/gearLook.js, Thread A: fxElement).
// Andere Items (Material, Quest): nach ID, Icon und Namen.
const RULES = [
  ['shadow', /nightmare|albtraum/i],
  ['poison', /spore|sporen/i],
  ['nature', /marsh_strider|sumpfschreiter/i],
  ['fire', /drake|charger|ember|cinder|glut|asch|ash|schlack|forge|essen|tyrant|tyrann|flamm|feuer|inferno|lava/i],
  ['frost', /frost|winter|eis|ice|snow|schnee/i],
  ['water', /tide|gezeit|pearl|perle|salz|sea|meer/i],
  ['shadow', /shadow|obsidian|bone|schatten|night|nacht|dusk|knochen|varkhul|grave|grab|crypt|gruft|skull/i],
  ['poison', /gift|dorn|thorn/i],
  ['holy', /holy|sun|sonne|könig|licht|light|gold/i],
  ['arcane', /arcane|rune|arkan|star|stern|moon|mond|crystal|kristall|world|welt|amethyst/i],
];
const TIER = { rare: 1, epic: 2, legendary: 3 };

export function itemFxTier(def) { return TIER[def?.rarity] ?? 0; }

export function itemFxTheme(def) {
  const tier = itemFxTier(def);
  if (!tier) return null;
  if (def.slot) { try { return fxElement(def); } catch { /* weiter mit den Namensregeln */ } }
  const key = `${def.id ?? ''} ${def.icon ?? ''} ${def.name ?? ''}`;
  for (const [theme, re] of RULES) if (re.test(key)) return theme;
  return def.rarity;
}

// ---------------------------------------------------------------- Filmstreifen
const W = 24, H = 24, F = 8;
const TAU = Math.PI * 2;
const stripCache = new Map();

// Deterministischer Zufall je Streifen (gleiche Bilder bei jedem Laden)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function newStrip() {
  const c = document.createElement('canvas');
  c.width = W * (F + 1); c.height = H;
  return c;
}
// Letztes Bild = erstes Bild: background-position 0 → 100 % mit steps(8) läuft nahtlos
function closeLoop(c) {
  const ctx = c.getContext('2d');
  ctx.drawImage(c, 0, 0, W, H, W * F, 0, W, H);
  return c.toDataURL();
}

// Flammenzungen hinter dem Gegenstand, von unten aufsteigend
function flames(pal, tier, seed) {
  const c = newStrip(), ctx = c.getContext('2d'), r = rng(seed);
  const reach = tier >= 3 ? 0.98 : 0.62;
  const ph = Array.from({ length: W }, () => r() * TAU);
  const ph2 = Array.from({ length: W }, () => r() * TAU);
  for (let f = 0; f < F; f++) {
    const a = (f / F) * TAU, ox = f * W;
    for (let x = 0; x < W; x++) {
      const edge = Math.abs(x - (W - 1) / 2) / (W / 2);
      const base = H * reach * (0.45 + 0.55 * Math.cos(edge * Math.PI / 2));
      const h = Math.max(2, Math.round(base * (0.72 + 0.18 * Math.sin(a + ph[x]) + 0.12 * Math.sin(2 * a + ph2[x] + x * 0.7))));
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const col = t < 0.28 && edge < 0.55 ? pal[3] : t < 0.55 ? pal[2] : t < 0.82 ? pal[1] : pal[0];
        // Lücken an den Zungenspitzen: flackernder Rand
        if (t > 0.8 && ((x + y + f) % 3 === 0)) continue;
        ctx.globalAlpha = t > 0.82 ? 0.7 : 0.92;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, H - 1 - y, 1, 1);
      }
    }
    // Abgelöste Flammenfetzen über den Spitzen
    ctx.globalAlpha = 0.85;
    for (let k = 0; k < (tier >= 3 ? 4 : 2); k++) {
      const x = Math.round(4 + ((k * 7 + f * 3) % (W - 8)));
      const y = Math.round(H * (1 - reach) + ((f * 2 + k * 5) % 6));
      ctx.fillStyle = pal[1]; ctx.fillRect(ox + x, y, 1, 2);
      ctx.fillStyle = pal[2]; ctx.fillRect(ox + x, y + 1, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  return closeLoop(c);
}

// Weicher Lichtkranz (für Themen ohne Flammen: Frost, Arkan, Natur, Gezeiten)
function halo(pal, tier, seed) {
  const c = newStrip(), ctx = c.getContext('2d'), r = rng(seed);
  const n = tier >= 3 ? 16 : 10;
  const rays = Array.from({ length: n }, () => ({ a: r() * TAU, len: 0.6 + r() * 0.4 }));
  for (let f = 0; f < F; f++) {
    const ox = f * W, cx = ox + W / 2, cy = H / 2;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, W * 0.52);
    const pulse = 0.5 + 0.5 * Math.sin((f / F) * TAU);
    g.addColorStop(0, pal[3]); g.addColorStop(0.35, pal[2]); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45 + 0.25 * pulse;
    ctx.fillStyle = g; ctx.fillRect(ox, 0, W, H);
    // Strahlen, drehen sich pro Bild weiter
    ctx.globalAlpha = 0.8;
    for (const ray of rays) {
      const a = ray.a + (f / F) * (TAU / n);
      const l = (W / 2) * ray.len;
      for (let d = 5; d < l; d++) {
        ctx.fillStyle = d > l * 0.7 ? pal[1] : pal[2];
        ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  return closeLoop(c);
}

// Teilchen vor dem Gegenstand: Funken, Flocken, Blasen, Sterne, Irrlichter
const MOTE = {
  fire: 'ember', legendary: 'ember', poison: 'bubble', nature: 'twinkle', epic: 'star', rare: 'star',
  frost: 'flake', water: 'bubble', shadow: 'wisp', holy: 'twinkle', arcane: 'star',
};
function motes(pal, tier, theme, seed) {
  const c = newStrip(), ctx = c.getContext('2d'), r = rng(seed);
  const kind = MOTE[theme] ?? 'star';
  const n = tier >= 3 ? 11 : tier === 2 ? 7 : 4;
  const ps = Array.from({ length: n }, () => ({ x: 2 + r() * (W - 4), p: r(), k: 1 + (r() < 0.35 ? 1 : 0), w: r() * TAU }));
  const px = (x, y, col, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  for (let f = 0; f < F; f++) {
    const ox = f * W, t = f / F;
    for (const q of ps) {
      const u = (q.p + t * q.k) % 1; // 0 → 1 im Lauf der Schleife (ganzzahlige k: nahtlos)
      const sway = Math.sin(q.w + t * TAU * q.k) * 1.2;
      const fade = u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
      let x = ox + q.x + sway, y;
      switch (kind) {
        case 'flake': // fallen langsam
          y = -2 + u * (H + 2);
          px(x, y, pal[3], fade); px(x - 1, y, pal[2], fade * 0.8); px(x + 1, y, pal[2], fade * 0.8); px(x, y - 1, pal[2], fade * 0.8); px(x, y + 1, pal[2], fade * 0.8);
          break;
        case 'bubble':
          y = H + 1 - u * (H + 3);
          px(x, y - 1, pal[3], fade); px(x - 1, y, pal[2], fade); px(x + 1, y, pal[2], fade); px(x, y + 1, pal[1], fade);
          break;
        case 'wisp':
          y = H - u * (H + 2);
          px(x, y, pal[3], fade); px(x, y + 1, pal[2], fade * 0.8); px(x - sway * 0.6, y + 2, pal[1], fade * 0.6); px(x - sway, y + 3, pal[0], fade * 0.4);
          break;
        case 'twinkle': { // an festen Orten, blinken im Takt
          x = ox + q.x; y = 3 + ((q.p * 97) % 1) * (H - 6);
          const b = Math.max(0, Math.sin((q.p + t * q.k) * TAU));
          if (b < 0.2) break;
          px(x, y, pal[3], b);
          if (b > 0.6) { px(x - 1, y, pal[2], b * 0.8); px(x + 1, y, pal[2], b * 0.8); px(x, y - 1, pal[2], b * 0.8); px(x, y + 1, pal[2], b * 0.8); }
          if (b > 0.9 && tier >= 2) { px(x - 2, y, pal[1], 0.6); px(x + 2, y, pal[1], 0.6); px(x, y - 2, pal[1], 0.6); px(x, y + 2, pal[1], 0.6); }
          break;
        }
        case 'star': {
          y = H - u * (H + 2);
          const big = ((f + Math.round(q.p * 8)) % 4) === 0;
          px(x, y, pal[3], fade);
          if (big) { px(x - 1, y, pal[2], fade * 0.8); px(x + 1, y, pal[2], fade * 0.8); px(x, y - 1, pal[2], fade * 0.8); px(x, y + 1, pal[2], fade * 0.8); }
          break;
        }
        default: // ember: steigen auf, mit Schweif
          y = H - u * (H + 3);
          px(x, y, pal[3], fade); px(x, y + 1, pal[2], fade * 0.9); px(x - sway * 0.4, y + 2, pal[1], fade * 0.6);
      }
    }
  }
  ctx.globalAlpha = 1;
  return closeLoop(c);
}

const FLAME_THEMES = new Set(['fire', 'holy', 'shadow', 'poison', 'legendary', 'epic']);

// URLs der Filmstreifen für Thema und Stufe: { back, front } (back fehlt unter episch)
export function itemFxStrips(theme, tier) {
  const key = `${theme}|${tier}`;
  let s = stripCache.get(key);
  if (s) return s;
  const pal = FX_PALETTES[theme] ?? FX_PALETTES.rare;
  const seed = hash(key);
  s = {
    back: tier >= 2 ? (FLAME_THEMES.has(theme) ? flames(pal, tier, seed) : halo(pal, tier, seed)) : null,
    front: motes(pal, tier, theme, seed ^ 0x9e3779b9),
  };
  stripCache.set(key, s);
  return s;
}

// Hängt die Effektebenen an ein .ef-item-icon (von gfx/Icons.js: itemIconEl aufgerufen)
export function decorateItemIcon(span, def) {
  const tier = itemFxTier(def);
  if (!tier || typeof document === 'undefined') return span;
  const theme = itemFxTheme(def);
  const strips = itemFxStrips(theme, tier);
  const pal = FX_PALETTES[theme] ?? FX_PALETTES.rare;
  span.classList.add('fx', `fx-t${tier}`, `fx-${theme}`);
  span.style.setProperty('--fx-glow', pal[2]);
  span.style.setProperty('--fx-core', pal[3]);
  if (tier >= 3) span.prepend(Object.assign(document.createElement('i'), { className: 'fx-rays' }));
  if (strips.back) {
    const back = document.createElement('i');
    back.className = 'fx-back';
    back.style.backgroundImage = `url(${strips.back})`;
    span.prepend(back);
  }
  const front = document.createElement('i');
  front.className = 'fx-front';
  front.style.backgroundImage = `url(${strips.front})`;
  span.append(front);
  return span;
}
