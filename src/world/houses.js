// Begehbare Häuser in gewöhnlichen Außengebieten (Stufe 1–40): Innenräume als abgeschirmte Kammern in einem dunklen
// Streifen rechts an der Karte (wie Sternhafen, world/interiors.js). Der Streifen beginnt direkt hinter der letzten
// Kartenspalte; Karte, Minikarte und Kamera hören dort auf (mapColumns, Camera.bounds), drinnen zeigt die Kamera nur
// den Raum. Gemalt werden Räume und Dunkelheit von sprites/ground/ramparts.js (paintInteriors), Möbel und Wandschmuck
// kommen aus sprites/decor_altstadt.js (createFurniture, in jeden Deko-Satz gemischt, world/index.js).
//
// addInteriors(L, rooms, opts) – L: fertiges Level, rooms: [{ id, name, door: {x,y}, plan }] mit plan aus ROOMS
// (oder eigenem { w, h, s, win, rug, furn: [[dx, dy, 'fTable'], …], light: [dx, dy] }); spec.s ersetzt den Stil der Vorlage.
//   door = Türkachel des Hauses (fest), davor (door.y + 1) steht man beim Eintreten. Räume: s = Stil der Wände und
//   Böden (A Dielen/Fachwerk, B Stein, C Backstein/Fliesen, L Blockhaus, F Filz der Jurte), win = Fensterspalten.

const COLW = 34, ROWH = 22;               // Rasterzelle je Raum: Nachbarräume bleiben außerhalb des größten Bildes (40 × 22,5)
const WALL_ITEMS = new Set(['wShield', 'wShelf', 'wPicture', 'wStarmap', 'wSconce', 'wTapestry', 'wAntlers', 'wPelt', 'wHerbs', 'wNet']);
const POOL = [...'αβγδεζηθικλμνξοπρστυφχψωϐϑϕϖϗϘϙϚϛϜϝϞϟϠϡϢϣϤϥϦϧϨϩϪϫϬϭϮϯ'];

// Raumvorlagen. Möbel: [dx, dy, Deko-Schlüssel] relativ zur linken oberen Ecke (Rückwand = Zeilen 0–2, Boden ab Zeile 3).
export const ROOMS = {
  // Bauernstube: Herd, Tisch mit Hockern, Bett, Truhe, Schrank
  home: {
    w: 13, h: 9, s: 'A', win: [3, 9], rug: [4, 5, 5, 2], light: [6, 4],
    furn: [[6, 3, 'fHearth'], [2, 3, 'fCupboard'], [10, 4, 'fBed'], [5, 6, 'fTable'], [3, 6, 'fStool'], [8, 6, 'fStool'], [11, 7, 'fChest'], [1, 7, 'fSacks'], [4, 3, 'wShelf'], [9, 3, 'wPicture']],
  },
  homeB: {
    w: 11, h: 9, s: 'A', win: [5], rug: [3, 5, 5, 2], light: [5, 4],
    furn: [[2, 3, 'fHearth'], [8, 4, 'fBed'], [4, 6, 'fTable'], [7, 6, 'fStool'], [1, 7, 'fBarrels'], [9, 7, 'fChest'], [6, 3, 'wShelf']],
  },
  // Halle der Dorfältesten: langer Tisch, Kamin, Banner, Teppich
  hall: {
    w: 19, h: 10, s: 'A', win: [3, 15], rug: [6, 5, 7, 3], light: [9, 5],
    furn: [[9, 3, 'fHearth'], [5, 3, 'fBanner'], [13, 3, 'fBanner'], [5, 8, 'fTable'], [13, 8, 'fTable'], [3, 8, 'fStool'], [7, 8, 'fStool'], [11, 8, 'fStool'], [15, 8, 'fStool'],
      [2, 3, 'fBooks'], [16, 3, 'fCupboard'], [17, 7, 'fBarrels'], [1, 8, 'fPlant'], [7, 3, 'wSconce'], [11, 3, 'wSconce'], [3, 3, 'wTapestry']],
  },
  smithy: {
    w: 13, h: 10, s: 'B', win: [3, 9], light: [6, 4],
    furn: [[6, 3, 'fForge'], [6, 7, 'fAnvil'], [10, 3, 'fRack'], [2, 4, 'fBarrels'], [10, 8, 'fSacks'], [1, 8, 'fChest'], [3, 3, 'wShield'], [4, 7, 'fStool']],
  },
  store: {
    w: 13, h: 9, s: 'A', win: [6], rug: [4, 5, 5, 2], light: [6, 4],
    furn: [[6, 4, 'fCounter'], [2, 3, 'fCupboard'], [10, 3, 'fCupboard'], [11, 7, 'fBarrels'], [1, 7, 'fSacks'], [1, 5, 'fKegs'], [4, 3, 'wShelf'], [8, 3, 'wShelf']],
  },
  // Wachstube / Kaserne
  guard: {
    w: 13, h: 9, s: 'B', win: [6], light: [6, 4],
    furn: [[2, 3, 'fRack'], [10, 3, 'fRack'], [5, 3, 'fArmor'], [7, 3, 'fArmor'], [11, 7, 'fChest'], [1, 7, 'fBarrels'], [6, 6, 'fTable'], [4, 6, 'fStool'], [9, 6, 'fStool'], [4, 3, 'wShield']],
  },
  // Jagdhütte / Blockhaus
  lodge: {
    w: 13, h: 9, s: 'L', win: [9], rug: [4, 5, 5, 2], light: [3, 4],
    furn: [[3, 3, 'fHearth'], [10, 4, 'fBed'], [6, 6, 'fTable'], [4, 6, 'fStool'], [8, 6, 'fStool'], [1, 7, 'fSacks'], [11, 7, 'fChest'], [6, 3, 'wAntlers'], [8, 3, 'wPelt'], [1, 3, 'fRack']],
  },
  lodgeB: {
    w: 11, h: 9, s: 'L', win: [5], light: [5, 4],
    furn: [[2, 3, 'fHearth'], [8, 4, 'fBed'], [5, 6, 'fTable'], [3, 6, 'fStool'], [1, 7, 'fBarrels'], [9, 7, 'fChest'], [5, 3, 'wHerbs']],
  },
  // Methalle des Jarls
  mead: {
    w: 21, h: 11, s: 'L', win: [4, 16], light: [10, 6],
    furn: [[10, 3, 'fThrone'], [7, 3, 'fBanner'], [13, 3, 'fBanner'], [3, 9, 'fTable'], [17, 9, 'fTable'], [1, 9, 'fStool'], [5, 9, 'fStool'], [15, 9, 'fStool'], [19, 9, 'fStool'],
      [10, 6, 'fFirepit'], [2, 3, 'fRack'], [18, 3, 'fKegs'], [19, 7, 'fBarrels'], [1, 6, 'fChest'], [5, 3, 'wShield'], [15, 3, 'wShield'], [9, 3, 'wAntlers']],
  },
  // Jurte: Filzwände, Teppiche, Feuerstelle in der Mitte
  yurt: {
    w: 13, h: 9, s: 'F', win: [], rug: [3, 4, 7, 4], light: [6, 5],
    furn: [[6, 6, 'fFirepit'], [2, 4, 'fBed'], [10, 3, 'fChest'], [11, 7, 'fSacks'], [1, 7, 'fBarrels'], [4, 3, 'wPelt'], [8, 3, 'wHerbs']],
  },
  // Pfahlhaus in der Marsch: Netze, Kräuter, Kessel
  stilt: {
    w: 11, h: 9, s: 'L', win: [5], light: [5, 4],
    furn: [[2, 3, 'fHearth'], [8, 4, 'fBed'], [5, 6, 'fTable'], [3, 6, 'fStool'], [1, 7, 'fBarrels'], [9, 7, 'fSacks'], [5, 3, 'wNet'], [7, 3, 'wHerbs']],
  },
  alchemist: {
    w: 13, h: 9, s: 'L', win: [9], light: [6, 4],
    furn: [[3, 3, 'fBooks'], [6, 5, 'fDesk'], [10, 3, 'fCupboard'], [11, 7, 'fKegs'], [1, 7, 'fPlant'], [6, 3, 'wHerbs'], [8, 3, 'wShelf'], [2, 7, 'fBarrels']],
  },
};

const T = 16;

export function addInteriors(L, rooms, { ambient = [150, 128, 112], light = [255, 180, 110] } = {}) {
  if (!rooms.length) return L;
  const H = L.map.length, W0 = L.map[0].length;
  const perCol = Math.max(1, Math.floor((H - 2) / ROWH)), cols = Math.ceil(rooms.length / perCol);
  const X0 = W0 + 2, SW = 2 + cols * COLW;
  const rows = L.map.map((r) => [...r, ...'#'.repeat(SW)]);
  const put = (x, y, ch) => { rows[y][x] = ch; };
  L.decor = { ...(L.decor ?? {}) };
  const used = new Set(L.map.join('')), chars = new Map(), pool = POOL.filter((c) => !used.has(c));
  let solid = L.solid ?? '';
  const charOf = (key) => {
    if (!chars.has(key)) {
      const ch = pool.shift();
      if (!ch) throw new Error('houses.js: no free map chars left');
      chars.set(key, ch); L.decor[ch] = key;
      if (!WALL_ITEMS.has(key)) solid += ch;
    }
    return chars.get(key);
  };
  const ram = (L.ramparts ??= {});
  ram.rooms = [...(ram.rooms ?? [])]; ram.dark = [...(ram.dark ?? []), [W0, 0, SW, H]];
  L.interiors = [...(L.interiors ?? [])];
  rooms.forEach((spec, i) => {
    const P = typeof spec.plan === 'string' ? ROOMS[spec.plan] : spec.plan;
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = X0 + col * COLW + Math.floor((COLW - P.w) / 2), y = 1 + row * ROWH + Math.floor((ROWH - P.h) / 2);
    for (let yy = y + 3; yy < y + P.h - 1; yy++) for (let xx = x + 1; xx < x + P.w - 1; xx++) put(xx, yy, ':');
    const ex = x + Math.floor(P.w / 2);
    put(ex, y + P.h - 1, ':');
    for (const [dx, dy, key] of P.furn) put(x + dx, y + dy, charOf(key));
    ram.rooms.push({ r: [x, y, P.w, P.h], s: spec.s ?? P.s, win: (P.win ?? []).map((k) => x + k), rug: P.rug ? [x + P.rug[0], y + P.rug[1], P.rug[2], P.rug[3]] : null });
    const li = P.light ? { x: x + P.light[0], y: y + P.light[1], radius: Math.max(P.w, P.h) * 9, color: spec.lightColor ?? light, intensity: 0.85 } : null;
    L.interiors.push({ id: spec.id, name: spec.name, door: { ...spec.door }, room: { x, y, w: P.w, h: P.h }, spawn: { x: ex, y: y + P.h - 2 }, exit: { x: ex, y: y + P.h - 1 }, light: li });
  });
  L.map = rows.map((r) => r.join(''));
  L.solid = solid;
  L.indoorAmbient = ambient;
  return L;
}

// Prüfhilfe: vor jeder Tür begehbarer Boden (keine feste Kachel)
export function checkDoors(L) {
  const solid = new Set(['#', '~', '=', 'H', 'f', ...(L.solid ?? '')]), bad = [];
  for (const it of L.interiors ?? []) {
    const f = L.map[it.door.y + 1]?.[it.door.x];
    if (f === undefined || solid.has(f)) bad.push(`${it.id} @${it.door.x},${it.door.y + 1}: '${f}'`);
  }
  return bad;
}
