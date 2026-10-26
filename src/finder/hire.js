import { fillWithMercs } from './mercs.js';
import { FINDER_CONFIG } from './config.js';

// Söldner anheuern: Wer allein (ohne Dungeonsuche) durch das Portal eines Gruppen-Dungeons geht, bekommt eine
// Söldnergruppe gegen Gold angeboten (Nutzerwunsch 15.10.). Ablehnen = allein hinein wie bisher.
// Die Gruppe entsteht wie in der Dungeonsuche (fillWithMercs: auf drei auffüllen, 1 Verteidiger + 2 Schaden).
// Ohne DOM, damit Tests die Preise prüfen können.

// Preis für zwei Söldner: steigt mit der Einstiegsstufe des Dungeons, etwa 10 Minuten Spiel auf dieser Stufe (16.10.:
// Söldner sollen nicht zu günstig sein). Katakomben kostenlos (erster Dungeon), Tempel 300, Schmiede 850,
// Hügelgrab 1.750, Sporenschlund 2.700, Reifhöhlen 3.700, Aschethron 4.350. Ein Söldner kostet die Hälfte.
export function hireCost(zone, mercs = 2) {
  if (!zone || (FINDER_CONFIG.hireFree ?? []).includes(zone.id)) return 0;
  const m = String(zone.recommendedLevel ?? '').match(/\d+/);
  const lv = Math.max(1, Math.min(40, m ? +m[0] : 1));
  const n = Math.max(0, Math.min(2, mercs | 0));
  return Math.round((3 * lv * lv * n / 2) / 50) * 50;
}

// Söldner einer Gruppe (Dungeonsuche oder Portal)
export const mercCount = (group) => (group?.members ?? []).filter((m) => m.kind === 'merc').length;

// Gruppen-Dungeon mit Endboss (keine Glutprüfung)
export const hireable = (zone) => !!zone?.instanced && zone.kind === 'dungeon' && !!zone.bossId && !zone.trial;

// Gruppe in der Form der Dungeonsuche (matchmaker.js #public): Spieler + Söldner, Verteidiger zuerst
export function hireGroup(char, dungeonId, seed = (Math.random() * 0xffffffff) >>> 0) {
  const me = { kind: 'player', ticketId: 'self', self: true, name: char.name, level: char.level, classId: char.classId, raceId: char.raceId, role: char.classId === 'warrior' ? 'tank' : 'dps' };
  const members = [me, ...fillWithMercs([me], { seed, size: 3 })]
    .sort((a, b) => (a.role === b.role ? (a.kind === 'player' ? -1 : 1) : a.role === 'tank' ? -1 : 1));
  return { id: `h${Date.now().toString(36)}_${(seed % 100000).toString(36)}`, dungeonId, seed, hired: true, members };
}
