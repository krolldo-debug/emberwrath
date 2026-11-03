// Häuser der Welt Stufe 1–40: neue Häuser (sprites/decor_houses.js) an die Stelle der alten Hütten, Zelte und
// Gebäude setzen und begehbar machen (world/houses.js). Je Gebiet eine Liste:
//   { at: [x, y] Ankerkachel (unten Mitte), key Deko, span: [links, rechts] Kacheln ab Anker, door: Türversatz in Kacheln,
//     room: { id, name, plan } }
// Der Fuß des Hauses (zwei Zeilen) wird fest (FILL, ohne Deko), der Anker trägt das Haus. clear: alte Deko/Gebäude, die weichen.
// Läuft nach dem Bau der Karte (levels3.js), vor calmArrivals.
import { addInteriors, ROOMS } from './houses.js';
import { VILLAGE, YURTS, STILTS, FROST, fwDoorTiles, stiltDoorTiles, FROST_DOORS } from '../sprites/decor_houses.js';

const fwSpan = (o) => { const n = o.w / 16, l = Math.ceil(n / 2) - 1; return [l, n - 1 - l]; };
const POOL = [...'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ'];
const FILL = '¤';

const BASE_SOLID = ['#', '~', '=', 'H', 'f'];
export const MISSING = [];   // Prüfhilfe: Häuser ohne Platz (fit)
function build(L, houses, { clear = [], ground = ',', ambient, depth = 2 } = {}) {
  const rows = L.map.map((r) => [...r]);
  const set = (x, y, ch) => { if (rows[y]?.[x] !== undefined) rows[y][x] = ch; };
  for (const c of clear) {
    if (c.rect) { const [x0, y0, w, h] = c.rect; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c.ch ?? ground); }
    else set(c[0], c[1], c[2] ?? ground);
  }
  if (clear.buildings) L.buildings = [];
  const used = new Set(rows.flat()), chars = new Map(), pool = POOL.filter((c) => !used.has(c));
  L.decor = { ...(L.decor ?? {}) };
  let solid = (L.solid ?? '') + FILL;
  const charOf = (key) => {
    if (!chars.has(key)) { const ch = pool.shift(); chars.set(key, ch); L.decor[ch] = key; solid += ch; }
    return chars.get(key);
  };
  const solidSet = () => new Set([...BASE_SOLID, ...solid]);
  const rooms = [];
  for (const h of houses) {
    let [x, y] = h.at;
    const [l, r] = h.span, dep = h.depth ?? depth;
    // fit: Lage in der Nähe suchen, bei der der Fuß nur auf Wasser/Festem steht und vor der Tür begehbarer Boden liegt
    if (h.fit) {
      const S = solidSet(), walk = (cx, cy) => rows[cy]?.[cx] !== undefined && !S.has(rows[cy][cx]);
      const ok = (ax, ay) => {
        if (!walk(ax + h.door, ay + 1)) return false;
        for (let yy = ay - dep + 1; yy <= ay; yy++) for (let xx = ax - l; xx <= ax + r; xx++) {
          const ch = rows[yy]?.[xx];
          if (ch === undefined || ch === FILL || (walk(xx, yy) && !(h.fitOk ?? '').includes(ch))) return false;
        }
        return true;
      };
      const cands = [];
      for (let dy = -h.fit; dy <= h.fit; dy++) for (let dx = -h.fit; dx <= h.fit; dx++) cands.push([dx, dy, Math.hypot(dx, dy * 1.5)]);
      cands.sort((a, b) => a[2] - b[2]);
      const c = cands.find(([dx, dy]) => ok(x + dx, y + dy));
      if (!c) { MISSING.push(`${h.key}@${x},${y}`); continue; }
      x += c[0]; y += c[1];
    }
    for (let yy = y - dep + 1; yy <= y; yy++) for (let xx = x - l; xx <= x + r; xx++) if (!(h.keepWater && rows[yy]?.[xx] === '~')) set(xx, yy, FILL);
    set(x, y, charOf(h.key));
    h.placed = [x, y];
    if (h.room) rooms.push({ ...h.room, door: { x: x + h.door, y } });
  }
  L.map = rows.map((r) => r.join(''));
  L.solid = solid;
  return addInteriors(L, rooms, { ambient });
}
// Spannweite in Kacheln aus der halben Kollisionsbreite (px, Anker in der Kachelmitte)
const spanOf = (half) => [-Math.floor((8 - half) / 16), Math.floor((8 + half - 0.01) / 16)];

// ------------------------------------------------------------------ Glutsenke: Reet und Fachwerk
const v = (key, x, y, room) => ({ at: [x, y], key, span: fwSpan(VILLAGE[key]), door: fwDoorTiles(VILLAGE[key]), room });
export function housesEmberhollow(L) {
  const clear = [{ rect: [47, 24, 7, 3] }, { rect: [59, 25, 6, 3] }, [68, 25], [70, 31], [66, 39], [47, 39], [64, 44], [18, 30, '.']];
  clear.buildings = true;
  return build(L, [
    v('vHall', 50, 26, { id: 'glut_halle', name: 'Dorfhalle', plan: 'hall' }),
    v('vSmithy', 62, 27, { id: 'glut_schmiede', name: 'Schmiede', plan: 'smithy' }),
    v('vHouse0', 69, 24, { id: 'glut_haus1', name: 'Wohnhaus', plan: 'home' }),
    v('vHouse2', 71, 31, { id: 'glut_haus2', name: 'Wohnhaus', plan: 'homeB' }),
    v('vHouse1', 66, 39, { id: 'glut_haus3', name: 'Wohnhaus', plan: 'home' }),
    v('vHouse3', 47, 39, { id: 'glut_haus4', name: 'Wohnhaus', plan: 'homeB' }),
    v('vHouse0', 64, 44, { id: 'glut_haus5', name: 'Wohnhaus', plan: 'store' }),
    v('vHouse1', 18, 30, { id: 'glut_hof', name: 'Bauernhof', plan: 'homeB' }),
  ], { clear });
}

// ------------------------------------------------------------------ Wächterlager (Aschenwald): Baumhäuser
// Treppe links (aTree0) oder rechts (aTree1); Tür = Fuß der Treppe
const tree = (key, x, y, room) => ({ at: [x, y], key, span: [3, 3], door: key === 'aTree1' ? 1 : -1, room });
export function housesAshwood(L) {
  return build(L, [
    tree('aTree0', 20, 37, { id: 'wald_baumhaus1', name: 'Baumhaus', plan: 'lodge' }),
    tree('aTree1', 38, 36, { id: 'wald_baumhaus2', name: 'Baumhaus', plan: 'lodgeB' }),
    tree('aTree0', 19, 47, { id: 'wald_baumhaus3', name: 'Baumhaus', plan: 'lodgeB' }),
    tree('aTree1', 37, 49, { id: 'wald_baumhaus4', name: 'Baumhaus', plan: 'lodge' }),
  ], { clear: [[38, 36], [20, 37], [19, 47], [37, 49]], ambient: [140, 120, 104] });
}

// ------------------------------------------------------------------ Steppenwacht und Nomadenlager: Jurten
const yurt = (key, x, y, room) => ({ at: [x, y], key, span: spanOf(YURTS[key].r - 4), door: 0, room });
const YR = (id, name = 'Jurte', plan = 'yurt') => ({ id, name, plan });
export function housesSteppe(L) {
  const old = [[34, 36], [29, 38], [44, 38], [46, 44], [32, 48], [38, 48], [39, 36], [27, 41], [43, 47], [64, 75], [53, 67], [66, 67], [52, 75]];
  return build(L, [
    yurt('sYurtL', 34, 36, { ...YR('steppe_jurte_wacht', 'Wachjurte', 'guard'), s: 'F' }),
    yurt('sYurt', 29, 39, YR('steppe_jurte1')),
    yurt('sYurtB', 44, 38, YR('steppe_jurte2')),
    yurt('sYurt', 46, 44, YR('steppe_jurte3')),
    yurt('sYurtB', 31, 48, YR('steppe_jurte4')),
    yurt('sYurt', 39, 48, YR('steppe_jurte5')),
    yurt('sYurtS', 26, 43, YR('steppe_jurte6')),
    yurt('sYurt', 64, 75, YR('nomaden_jurte1')),
    yurt('sYurtS', 53, 67, YR('nomaden_jurte2')),
    yurt('sYurtB', 66, 67, YR('nomaden_jurte3')),
    yurt('sYurtS', 52, 75, YR('nomaden_jurte4')),
  ], { clear: old, ambient: [146, 124, 104] });
}

// ------------------------------------------------------------------ Mirefeste (Faulmarsch): Pfahlhäuser über dem Wasser
const stilt = (key, x, y, room, fit = 3) => ({ at: [x, y], key, span: spanOf(STILTS[key].w / 2 + 6), door: stiltDoorTiles(STILTS[key]), room, fit, keepWater: true });
export function housesMarsh(L) {
  return build(L, [
    stilt('mStilt0', 69, 43, { id: 'marsch_haus1', name: 'Pfahlhaus', plan: 'stilt' }),
    stilt('mHall', 60, 47, { id: 'marsch_halle', name: 'Pfahlhalle', plan: 'guard', s: 'L' }, 1),
    stilt('mStilt1', 77, 49, { id: 'marsch_haus2', name: 'Pfahlhaus', plan: 'stilt' }),
    stilt('mStilt2', 48, 54, { id: 'marsch_kraeuter', name: 'Kräuterstube', plan: 'alchemist' }, 1),
    stilt('mStilt3', 41, 56, { id: 'marsch_haus3', name: 'Pfahlhaus', plan: 'stilt' }, 1),
    stilt('mStilt0', 81, 48, { id: 'marsch_haus4', name: 'Pfahlhaus', plan: 'stilt' }, 1),
  ], { clear: [[69, 43, '~'], [49, 46, '~'], [77, 49, '~'], [46, 60, '~'], [53, 60, '~'], [71, 61, '~']], ambient: [128, 132, 112] });
}

// ------------------------------------------------------------------ Frosthold (Frostzinnen): Langhäuser, Soden- und Fischerhütten
const FROST_HALF = { fLong: 92, fLongS: 76, fLodge: 52, fSod: 42, fFish: 34 };
const frost = (key, x, y, room) => ({ at: [x, y], key, span: spanOf(FROST_HALF[key]), door: FROST_DOORS[key], room });
export function housesFrost(L) {
  return build(L, [
    frost('fLong', 58, 76, { id: 'frost_methalle', name: 'Methalle', plan: 'mead' }),
    frost('fLongS', 46, 79, { id: 'frost_langhaus1', name: 'Langhaus', plan: 'lodge' }),
    frost('fLongS', 70, 79, { id: 'frost_langhaus2', name: 'Langhaus', plan: 'lodge' }),
    frost('fSod', 46, 91, { id: 'frost_sode1', name: 'Sodenhütte', plan: 'lodgeB' }),
    frost('fSod', 68, 91, { id: 'frost_sode2', name: 'Sodenhütte', plan: 'lodgeB' }),
    frost('fLodge', 14, 76, { id: 'frost_jagdhuette', name: 'Jagdhütte', plan: 'lodge' }),
    frost('fFish', 119, 70, { id: 'frost_fischer1', name: 'Fischerhütte', plan: 'stilt' }),
    frost('fFish', 102, 72, { id: 'frost_fischer2', name: 'Fischerhütte', plan: 'stilt' }),
  ], { clear: [[58, 76], [46, 79], [70, 79], [46, 91], [68, 91], [14, 76], [119, 70, 'I'], [102, 72, 'I']], ambient: [150, 140, 136] });
}
