import { ELEMENTS } from './Particles.js';
import { fxElement } from '../character/gearLook.js';

// Animierte Item-Effekte (Thread D): je seltener, desto spektakulärer.
//   selten    – nur der blaue Rahmen (keine Funkelpixel, 11.10.: wirkten wie Streupixel)
//   episch    – nur der leuchtende Rahmen (kein Kranz, keine Kante, keine Funken über dem Bild)
//   legendär  – hohe goldene Glut als eigene Innenfläche, dichte Funken
// Alles in Palettenfarben ohne Transparenzstufen (11.10.); Größe ganzzahlig über --fpx (ui/theme.css).
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

function newStrip(res = 1) {
  const c = document.createElement('canvas');
  c.width = W * res * (F + 1); c.height = H * res;
  return c;
}
// Letztes Bild = erstes Bild: background-position 0 → 100 % mit steps(8) läuft nahtlos
function closeLoop(c, res = 1) {
  const ctx = c.getContext('2d'), w = W * res, h = H * res;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, 0, 0, w, h, w * F, 0, w, h);
  return c.toDataURL();
}

// Legendär: tiefe Glut am Boden der dunklen Innenfläche statt Flammen bis oben – der Gegenstand steht frei davor
const LEGEND_EMBERS = ['#3a0c04', '#8a2008', '#d04a0c', '#ff8a1a'];

// Flammenzungen hinter dem Gegenstand, von unten aufsteigend (legendär). Einzelne Zungen mit Lücken dazwischen
// (Grafikupdate: ausgedünnt, damit das Motiv frei steht); res 2 = Feinraster passend zum 48er-Icon.
function flames(pal, tier, seed, res = 1) {
  const c = newStrip(res), ctx = c.getContext('2d'), r = rng(seed);
  const SW = W * res, SH = H * res;
  const reach = tier >= 3 ? 0.26 : 0.5;
  const tongues = 6, ph = Array.from({ length: tongues }, () => r() * TAU), off = r() * 0.5;
  for (let f = 0; f < F; f++) {
    const a = (f / F) * TAU, ox = f * SW;
    for (let x = 0; x < SW; x++) {
      const u = (x + 0.5) / SW, edge = Math.abs(u - 0.5) * 2;
      const tp = u * tongues + off, ti = Math.floor(tp) % tongues, tf = tp % 1;
      const shape = Math.max(0, 1 - Math.abs(tf - 0.5) * 2.6);                 // Zunge: Mitte hoch, Rand null
      if (shape <= 0) continue;
      const base = SH * reach * (0.5 + 0.5 * Math.cos(edge * Math.PI / 2)) * Math.sqrt(shape);
      const h = Math.round(base * (0.7 + 0.2 * Math.sin(a + ph[ti]) + 0.1 * Math.sin(2 * a + ph[ti] * 1.7)));
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const col = t < 0.3 && shape > 0.6 ? pal[3] : t < 0.58 ? pal[2] : t < 0.84 ? pal[1] : pal[0];
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, SH - 1 - y, 1, 1);
      }
    }
  }
  return closeLoop(c, res);
}

// Teilchen um den Gegenstand: Funken, Flocken, Blasen, Sterne, Irrlichter (liegen hinter dem Motiv, siehe decorateItemIcon)
const MOTE = {
  fire: 'ember', legendary: 'ember', poison: 'bubble', nature: 'twinkle', epic: 'star', rare: 'star',
  frost: 'flake', water: 'bubble', shadow: 'wisp', holy: 'twinkle', arcane: 'star',
};
function motes(pal, tier, theme, seed, res = 1) {
  const c = newStrip(res), ctx = c.getContext('2d'), r = rng(seed);
  const kind = MOTE[theme] ?? 'star';
  const n = 6;
  const ps = Array.from({ length: n }, () => ({ x: 2 + r() * (W - 4), p: r(), k: 1 + (r() < 0.35 ? 1 : 0), w: r() * TAU }));
  // Im Feinraster ein Teilchenpixel = ein Feinpixel (Koordinaten im 24er-Maß, auf das Feinraster gerundet)
  ctx.scale(res, res);
  const q = 1 / res;
  // Ausblenden in Palettenstufen statt Transparenz: halb sichtbar = eine Farbe dunkler, darunter weg
  const darker = new Map([[pal[3], pal[2]], [pal[2], pal[1]], [pal[1], pal[0]], [pal[0], pal[0]]]);
  const px = (x, y, col, a = 1) => {
    if (a < 0.4) return;
    ctx.fillStyle = a < 0.75 ? darker.get(col) ?? col : col;
    ctx.fillRect(Math.round(x * res) / res, Math.round(y * res) / res, q, q);
  };
  for (let f = 0; f < F; f++) {
    const ox = f * W, t = f / F;
    for (const m of ps) {
      const u = (m.p + t * m.k) % 1; // 0 → 1 im Lauf der Schleife (ganzzahlige k: nahtlos)
      const sway = Math.sin(m.w + t * TAU * m.k) * 1.2;
      const fade = u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
      let x = ox + m.x + sway, y;
      switch (kind) {
        case 'flake': // fallen langsam
          y = -2 + u * (H + 2);
          px(x, y, pal[3], fade); px(x - 1 * q, y, pal[2], fade * 0.8); px(x + 1 * q, y, pal[2], fade * 0.8); px(x, y - 1 * q, pal[2], fade * 0.8); px(x, y + 1 * q, pal[2], fade * 0.8);
          break;
        case 'bubble':
          y = H + 1 - u * (H + 3);
          px(x, y - 1 * q, pal[3], fade); px(x - 1 * q, y, pal[2], fade); px(x + 1 * q, y, pal[2], fade); px(x, y + 1 * q, pal[1], fade);
          break;
        case 'wisp':
          y = H - u * (H + 2);
          px(x, y, pal[3], fade); px(x, y + 1 * q, pal[2], fade * 0.8); px(x - sway * 0.6, y + 2 * q, pal[1], fade * 0.6); px(x - sway, y + 3 * q, pal[0], fade * 0.4);
          break;
        case 'twinkle': { // an festen Orten, blinken im Takt
          x = ox + m.x; y = 3 + ((m.p * 97) % 1) * (H - 6);
          const b = Math.max(0, Math.sin((m.p + t * m.k) * TAU));
          if (b < 0.2) break;
          px(x, y, pal[3], b);
          if (b > 0.6) { px(x - 1 * q, y, pal[2], b * 0.8); px(x + 1 * q, y, pal[2], b * 0.8); px(x, y - 1 * q, pal[2], b * 0.8); px(x, y + 1 * q, pal[2], b * 0.8); }
          if (b > 0.9 && tier >= 2) { px(x - 2 * q, y, pal[1], 0.6); px(x + 2 * q, y, pal[1], 0.6); px(x, y - 2 * q, pal[1], 0.6); px(x, y + 2 * q, pal[1], 0.6); }
          break;
        }
        case 'star': {
          y = H - u * (H + 2);
          const big = ((f + Math.round(m.p * 8)) % 4) === 0;
          px(x, y, pal[3], fade);
          if (big) { px(x - 1 * q, y, pal[2], fade * 0.8); px(x + 1 * q, y, pal[2], fade * 0.8); px(x, y - 1 * q, pal[2], fade * 0.8); px(x, y + 1 * q, pal[2], fade * 0.8); }
          break;
        }
        default: // ember: steigen auf, mit Schweif
          y = H - u * (H + 3);
          px(x, y, pal[3], fade); px(x, y + 1 * q, pal[2], fade * 0.9); px(x - sway * 0.4, y + 2 * q, pal[1], fade * 0.6);
      }
    }
  }
  return closeLoop(c, res);
}

// URLs der Filmstreifen für Thema, Stufe und Variante (0–3, je Gegenstand fest): { back, front } (nur legendär)
export function itemFxStrips(theme, tier, variant = 0, res = 1) {
  const key = `${theme}|${tier}|${variant}|${res}`;
  let s = stripCache.get(key);
  if (s) return s;
  const pal = FX_PALETTES[theme] ?? FX_PALETTES.rare;
  const seed = hash(key);
  // Legendär: immer eigene Glut am Boden (unabhängig vom Thema des Gegenstands), Innenfläche bleibt dunkel
  s = {
    back: tier >= 3 ? flames(LEGEND_EMBERS, tier, seed, res) : null,
    front: tier >= 3 ? motes(pal, tier, theme, seed ^ 0x9e3779b9, res) : null,
  };
  stripCache.set(key, s);
  return s;
}

// Hängt die Effektebenen an ein .ef-item-icon (von gfx/Icons.js: itemIconEl aufgerufen). res 2 = Feinraster (48er-Icon).
// Beide Ebenen liegen hinter dem Motiv (Grafikupdate: nichts über dem Gegenstand).
export function decorateItemIcon(span, def, res = 1) {
  const tier = itemFxTier(def);
  if (!tier || typeof document === 'undefined') return span;
  const theme = itemFxTheme(def);
  // Je Gegenstand eigene Variante und eigener Takt: nicht alle seltenen Teile funkeln an denselben Stellen gleichzeitig
  const h = hash(String(def?.id ?? def?.icon ?? def?.name ?? ''));
  const strips = itemFxStrips(theme, tier, h % 4, res);
  span.classList.add('fx', `fx-t${tier}`, `fx-${theme}`);
  span.dataset.fx = `${theme}|${tier}|${h % 4}`;
  if (strips.back) {
    const back = document.createElement('i');
    back.className = 'fx-back';
    back.style.backgroundImage = `url(${strips.back})`;
    span.prepend(back);
  }
  if (strips.front) {
    const front = document.createElement('i');
    front.className = 'fx-front';
    front.style.backgroundImage = `url(${strips.front})`;
    front.style.zIndex = '0';
    front.style.animationDelay = `${-((h >>> 4) % 997) / 997 * 2}s`;
    span.append(front);
  }
  return span;
}

// Effektstreifen eines fertigen Icons auf eine andere Feinheit umstellen (Icons.js, nach dem ersten Layout)
export function setItemFxRes(span, res) {
  const key = span.dataset.fx;
  if (!key) return;
  const [theme, tier, variant] = key.split('|');
  const strips = itemFxStrips(theme, +tier, +variant, res);
  const back = span.querySelector(':scope > .fx-back'), front = span.querySelector(':scope > .fx-front');
  if (back && strips.back) back.style.backgroundImage = `url(${strips.back})`;
  if (front && strips.front) front.style.backgroundImage = `url(${strips.front})`;
}
