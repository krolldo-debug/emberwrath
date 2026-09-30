import { makeRng } from './rng.js';
import { RACE_HAIR, DYES } from '../character/cosmetics.js';

// Söldner: Mitspieler, die die Gruppensuche stellt, wenn keine echten Spieler passen.
// Reine Daten, ohne DOM – läuft im Worker (Gruppenbildung) und im Browser gleich.
//
// makeMerc(rng, { role, level, takenNames, takenClasses }) -> {
//   kind: 'merc', id, name, level, role, classId, raceId,
//   look: { variant, hairStyle, dye },          Aussehen (Ausrüstung ergibt sich im Client aus Stufe + gearSeed)
//   gearSeed,                                     Samen für die Ausrüstungswahl (mercGear, client)
//   style: { reaction, skill, chatty, caps, lang } Verhalten: Reaktionszeit (s), Treffsicherheit 0..1, Redseligkeit 0..1
// }
// Die Namen sind Spielernamen, wie man sie in Online-Rollenspielen findet – keine NPC-Namen der Spielwelt.

const NAMES = [
  'Aschefaust', 'Nachtfalke', 'Grimmbart', 'Lyrana', 'Kalrok', 'Zerafyn', 'Brandolin', 'Skarvi', 'Tharnok', 'Mirelle',
  'Veyla', 'Dornwacht', 'Eisenherz', 'Rabenfeder', 'Thorgal', 'Isgard', 'Feuerlilie', 'Nebelkraehe', 'Sturmbrecher',
  'Aurelion', 'Kaelthar', 'Vendria', 'Balduin', 'Ylvie', 'Gorbash', 'Selvara', 'Drakmor', 'Wolfsruf', 'Finnlir',
  'Elowen', 'Rotbart', 'Silberdorn', 'Kazrak', 'Liora', 'Brakka', 'Nimue', 'Hjalmar', 'Sareth', 'Vorn', 'Talisha',
  'Kjartan', 'Mireya', 'Oskarr', 'Tyrell', 'Fenrika', 'Grimwald', 'Ashryn', 'Lucan', 'Morrigan', 'Seraphel',
  'Dunkelherz', 'Glutbaron', 'Mondkalb', 'Kornblume', 'Pixelpaladin', 'Kevlarkeks', 'Hexenkind', 'Frostbeule',
  'Schattenpfote', 'Bruchstein', 'Wildfang', 'Distelkopf', 'Kaltschnauze', 'Funkenflug',
];
const DECOR = [(n, r) => `${n}${r.int(7, 99)}`, (n) => `x${n}x`, (n) => n.toLowerCase(), (n) => `${n}${['_de', 'tv', 'hd', 'ttv'][n.length % 4]}`];

// Klassen für die Schadensrolle (Krieger seltener, damit Gruppen abwechslungsreich sind)
const DPS_CLASSES = [['rogue', 3], ['ranger', 3], ['mage', 3], ['warrior', 1]];
const RACES = [['human', 3], ['elf', 3], ['dwarf', 2], ['emberborn', 2]];
const RACE_FOR_CLASS = { warrior: [['human', 3], ['dwarf', 4], ['emberborn', 2], ['elf', 1]], mage: [['elf', 3], ['emberborn', 3], ['human', 2], ['dwarf', 1]] };
const DYE_IDS = Object.keys(DYES);

export function mercName(rng, taken = new Set()) {
  for (let i = 0; i < 20; i++) {
    let n = rng.pick(NAMES);
    if (rng.chance(0.22)) n = rng.pick(DECOR)(n, rng);
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${rng.pick(NAMES)}${rng.int(100, 999)}`;
}

export function makeMerc(rng, { role = 'dps', level = 1, takenNames = new Set(), takenClasses = [] } = {}) {
  let classId = 'warrior';
  if (role !== 'tank') {
    // Doppelte Klassen vermeiden, wenn möglich (echte Gruppen sind selten zwei gleiche Fernkämpfer)
    const pool = DPS_CLASSES.map(([c, w]) => [c, takenClasses.includes(c) ? w * 0.25 : w]);
    classId = rng.weighted(pool);
  }
  const raceId = rng.weighted(RACE_FOR_CLASS[classId] ?? RACES);
  const hair = RACE_HAIR[raceId] ?? RACE_HAIR.human;
  const name = mercName(rng, takenNames);
  takenNames.add(name.toLowerCase());
  const lv = Math.max(1, Math.min(40, level + rng.weighted([[0, 5], [1, 2], [-1, 2], [2, 1]])));
  return {
    kind: 'merc',
    id: `m${(rng() * 0xffffffff) >>> 0}`,
    name, level: lv, role, classId, raceId,
    look: { variant: rng.int(0, 2), hairStyle: rng.pick(hair), dye: rng.chance(0.45) ? rng.pick(DYE_IDS) : null },
    gearSeed: (rng() * 0xffffffff) >>> 0,
    style: {
      reaction: Math.round(rng.range(0.16, 0.34) * 100) / 100,
      skill: Math.round(rng.range(0.74, 0.95) * 100) / 100,
      chatty: Math.round(rng.range(0.15, 0.95) * 100) / 100,
      caps: rng.chance(0.55) ? 'lower' : 'normal',
      lang: rng.chance(0.3) ? 'slang' : 'plain',
    },
  };
}

// Freie Plätze einer Gruppe mit Söldnern auffüllen. members = vorhandene Spieler ({ role, classId, level, name }).
// Liefert neue Söldner-Einträge (ohne die vorhandenen).
export function fillWithMercs(members, { seed, size = 3 }) {
  const rng = makeRng(seed);
  const taken = new Set(members.map((m) => String(m.name).toLowerCase()));
  const classes = members.map((m) => m.classId);
  const level = Math.max(1, ...members.map((m) => m.level ?? 1));
  const out = [];
  const needTank = !members.some((m) => m.role === 'tank');
  let free = size - members.length;
  if (needTank && free > 0) { const m = makeMerc(rng, { role: 'tank', level, takenNames: taken, takenClasses: classes }); out.push(m); classes.push(m.classId); free--; }
  while (free-- > 0) { const m = makeMerc(rng, { role: 'dps', level, takenNames: taken, takenClasses: classes }); out.push(m); classes.push(m.classId); }
  return out;
}
