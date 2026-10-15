import { MapBuilder } from '../world/levels.js';
import { ARENA_ZONE } from './rules.js';

// Die Glutarena: ein runder Kampfplatz in der Glutschmiede. Vier Säulen geben Deckung gegen Geschosse,
// Kohlebecken und Ketten am Rand. Die Kämpfer starten im Westen (Spawn 'start') und Osten ('east').
// Gebaut mit denselben Zeichen wie die Glutprüfung (Biom 'forge'), damit keine neue Grafik nötig ist.
export function buildArena() {
  const W = 42, H = 30;
  const m = new MapBuilder(W, H, '#');
  m.ellipse(20.5, 15, 16.5, 10.5, '.');
  // abgeflachte Ränder: kein Treppenmuster an den Polen
  m.rect(8, 6, 26, 19, '.');
  // Säulen (Deckung), leicht versetzt, damit es keine perfekten Verstecke gibt
  [[14, 11], [27, 11], [14, 19], [27, 19]].forEach(([x, y]) => m.set(x, y, 'I'));
  [[6, 9], [35, 9], [6, 21], [35, 21], [12, 5], [29, 5]].forEach(([x, y]) => m.set(x, y, 'B'));
  [[18, 5], [23, 5]].forEach(([x, y]) => m.set(x, y, 'U'));
  [[9, 24], [32, 24]].forEach(([x, y]) => m.set(x, y, 's'));
  [[5, 15], [36, 15]].forEach(([x, y]) => m.set(x, y, 'j'));
  // Fackeln an der Nordwand
  for (let x = 10; x < 32; x += 5) if (m.get(x, 4) === '#' && m.get(x, 5) === '.') m.set(x, 4, 'T');
  m.set(9, 15, '1');
  m.set(32, 15, '2');
  return {
    name: 'Glutarena',
    kind: 'dungeon',
    biome: 'forge',
    map: m.rows(),
    decor: { I: 'forgePillar', B: 'brazierForge', U: 'crucible', s: 'slagPile', j: 'chains' },
    points: { 1: 'start', 2: 'east' },
    enemies: {},
    respawn: Infinity,
    room: { x: 4, y: 4, w: 34, h: 22 },
    portals: [],
  };
}

// Zonendefinition (content 'zone'). pvp: die Arena-Sitzung (ArenaSession) übernimmt Kampf, Tod und Rückkehr.
export const ARENA_ZONE_DEF = {
  name: 'Glutarena',
  subtitle: 'Arena · 1 gegen 1',
  tag: 'Arena · 1 gegen 1', // Unterzeile unter der Karte (ui/Hud.js) statt „Dungeon-Instanz“
  kind: 'dungeon',
  level: ARENA_ZONE,
  instanced: true,
  maxPlayers: 2,
  pvp: true,
  mountable: false,
  meta: 'Alle kämpfen auf Stufe 40 mit gleicher Ausrüstung.', // Ladebild (ui/ZoneTransition.js)
  tip: 'Ab der Hälfte der Zeit brennt der Glutsturm: Jeder Treffer wird stärker.',
  respawnZone: 'emberhollow',
  links: [],
  enemies: [],
  ambient: [104, 74, 70],
};
