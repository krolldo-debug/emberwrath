import { fillWithMercs } from './mercs.js';

// Söldner anheuern: Wer allein (ohne Dungeonsuche) durch das Portal eines Gruppen-Dungeons geht, bekommt eine
// Söldnergruppe gegen Gold angeboten (Nutzerwunsch 15.10.). Ablehnen = allein hinein wie bisher.
// Die Gruppe entsteht wie in der Dungeonsuche (fillWithMercs: auf drei auffüllen, 1 Verteidiger + 2 Schaden).
// Ohne DOM, damit Tests die Preise prüfen können.

// Preis: steigt mit der Einstiegsstufe des Dungeons, etwa ein bis zwei Questbelohnungen dieser Stufe
// (Katakomben 30, Tempel 95, Schmiede 170, Hügelgrab 265, Sporenschlund 355, Reifhöhlen 440, Aschethron 495).
export function hireCost(zone) {
  const m = String(zone?.recommendedLevel ?? '').match(/\d+/);
  const lv = Math.max(1, Math.min(40, m ? +m[0] : 1));
  return Math.round((10 + lv * 7 + lv * lv * 0.15) / 5) * 5;
}

// Gruppen-Dungeon mit Endboss (keine Glutprüfung)
export const hireable = (zone) => !!zone?.instanced && zone.kind === 'dungeon' && !!zone.bossId && !zone.trial;

// Gruppe in der Form der Dungeonsuche (matchmaker.js #public): Spieler + Söldner, Verteidiger zuerst
export function hireGroup(char, dungeonId, seed = (Math.random() * 0xffffffff) >>> 0) {
  const me = { kind: 'player', ticketId: 'self', self: true, name: char.name, level: char.level, classId: char.classId, raceId: char.raceId, role: char.classId === 'warrior' ? 'tank' : 'dps' };
  const members = [me, ...fillWithMercs([me], { seed, size: 3 })]
    .sort((a, b) => (a.role === b.role ? (a.kind === 'player' ? -1 : 1) : a.role === 'tank' ? -1 : 1));
  return { id: `h${Date.now().toString(36)}_${(seed % 100000).toString(36)}`, dungeonId, seed, hired: true, members };
}
