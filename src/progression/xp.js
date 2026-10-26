// Stufen und Erfahrung (Thread C).
//
// progress.xp ist die GESAMT-Erfahrung, progress.xpNext die Gesamt-XP für die nächste Stufe.
// Tempo (INTEGRATION.md §11.4): Varkhul ≈ Stufe 6, Ende Aschenwald ≈ 10, Nerith ≈ 12,
// Ende Schlackenhöhen ≈ 17, Ignaroth ≈ 20 – etwa 30–60 Minuten. Quests liefern rund 55–60 %
// der Erfahrung, Kämpfe den Rest. Nachrechnen: node src/progression/test/pacing.mjs
// Ab Stufe 20 (§12.1) wird die Kurve aus der Zielzeit berechnet: 15 Minuten für 20→21, dann linear
// bis 25 Minuten für 39→40, bei gleichem Kampftempo (Kills je Minute) und Quest-Anteil wie bis 20.
// Sternenglut (Plan 26.10.): 50 → 80 Minuten für 40→50, 70 → 95 für 50→60 (Teil 2). Die Schwellen bis 40 bleiben für
// alle Charaktere gleich (Stufe und Erfahrung bestehender Spielstände bleiben auf den Punkt genau). Neue Charaktere
// (progress.pace = PACE_NEW) bekommen in 20–39 rund ein Viertel weniger Erfahrung, damit 20→40 etwa 1,7-mal so lange
// dauert (Plan: 6–7 → rund 12 echte Stunden; Simulation test/pacing.mjs 2,1 → 3,5 h). Bestehende Charaktere (ohne pace)
// behalten das bisherige Tempo (Bestandsschutz, xpPaceFactor). Mehr kürzen hieße Kopfgelder statt Quests (Grind).
import { clamp } from '../core/math.js';

export const LEVEL_CAP = 50;
export const CLASSIC_CAP = 20;          // Stufe 1–19 bleibt bitgenau wie vor der Erweiterung
export const LEGACY_CAP = 40;           // Höchststufe vor Sternenglut: bis hier gelten die alten Zielminuten
export const PACE_NEW = 2;              // progress.pace neuer Charaktere; fehlt es, gilt das alte Tempo bis 40
// Annahmen der Tempo-Rechnung ab Stufe 20 (dieselben wie in test/pacing.mjs)
// efficiency: Anteil der XP je Kill auf Spielerstufe, der im Schnitt wirklich ankommt (Wege, schwächere Gegner,
// Kopfgelder zwischen den Regionen) – aus test/pacing.mjs geeicht.
export const PACE = { killsPerMinute: 15, killShare: 0.42, efficiency: 0.8, minutesFirst: 15, minutesLast: 25 };

// Zielminuten je Stufe ab 40: [von Stufe, bis Stufe, Minuten am Anfang, Minuten am Ende]
export const PACE_STAR = [[40, 49, 50, 80], [50, 59, 70, 95]];
// Zielminuten neuer Charaktere für 20–39 (statt PACE.minutesFirst/minutesLast), an test/pacing.mjs geeicht
export const PACE_NEW_MINUTES = [20, 32];
const lerp = (lo, hi, a, b, level) => a + (b - a) * Math.max(0, Math.min(1, (level - lo) / (hi - lo)));

// Zielminuten für die Stufe `level` → `level + 1` (nur ab 20)
export function minutesForLevel(level) {
  const star = PACE_STAR.find(([lo, hi]) => level >= lo && level <= hi);
  if (star) return lerp(...star, level);
  return lerp(CLASSIC_CAP, LEGACY_CAP - 1, PACE.minutesFirst, PACE.minutesLast, level);
}

// Anteil der Erfahrung, den ein Charakter auf `level` bekommt: 1, außer neue Charaktere (pace = PACE_NEW) in 20–39.
// Dort gleiche Schwellen, aber weniger Erfahrung je Kill und Quest, sodass die Stufe die neuen Zielminuten dauert.
export function xpPaceFactor(level, pace) {
  if (pace !== PACE_NEW || level < CLASSIC_CAP || level >= LEGACY_CAP) return 1;
  return minutesForLevel(level) / lerp(CLASSIC_CAP, LEGACY_CAP - 1, ...PACE_NEW_MINUTES, level);
}

// Erfahrung, die ein Charakter (progress) von `amount` wirklich bekommt
export function paceXp(progress, amount) {
  const f = xpPaceFactor(progress?.level ?? 1, progress?.pace);
  return f === 1 || amount <= 0 ? amount : Math.max(1, Math.round(amount * f));
}

// Benötigte Erfahrung von Stufe `level` auf `level + 1`: 100, 270, 480, 715, 985 … 6545 (bis 19),
// ab 20: Zielminuten × Kills/Minute × Gegner-XP ÷ Kampfanteil (42 000 für 20→21, 131 400 für 39→40,
// 268 600 für 40→41, 523 400 für 49→50)
export function xpToNext(level) {
  if (level >= LEVEL_CAP) return Infinity;
  if (level < CLASSIC_CAP) return Math.round((100 * Math.pow(level, 1.42)) / 5) * 5;
  return Math.round((minutesForLevel(level) * PACE.killsPerMinute * mobXp(level) * PACE.efficiency) / PACE.killShare / 100) * 100;
}

// Gesamterfahrung, die man für das Erreichen von `level` braucht.
const TOTAL = [0, 0];
for (let l = 2; l <= LEVEL_CAP; l++) TOTAL[l] = TOTAL[l - 1] + xpToNext(l - 1);
export function totalXpForLevel(level) {
  if (level <= 1) return 0;
  return TOTAL[Math.min(level, LEVEL_CAP)];
}

// Grund-XP eines Gegners nach seiner Stufe. Elite ×5, Boss ×25.
// Die Welt schickt zwar ein xp-Feld mit; das Tempo gehört aber zur Fortschrittslogik
// und wird deshalb hier einheitlich berechnet (xp der Welt nur als Untergrenze für Sonderfälle).
export function mobXp(level, { elite = false, boss = false } = {}) {
  const base = 8 + 4.5 * Math.max(1, level);
  return Math.round(base * (boss ? 25 : elite ? 5 : 1));
}

// Stufenabstand: stärkere Gegner geben etwas mehr, deutlich schwächere kaum noch etwas
// (≥ 5 Stufen darunter: 10 %).
export function killXp(baseXp, enemyLevel, playerLevel) {
  const diff = (enemyLevel ?? playerLevel) - playerLevel;
  const factor = diff >= 0 ? 1 + Math.min(diff, 4) * 0.08 : clamp(1 + diff * 0.2, 0.1, 1);
  return Math.max(1, Math.round(baseXp * factor));
}

// Quest-Erfahrung: Anteil an der Stufe, auf der die Quest liegt.
// QUEST_XP_BOOST: Quests ab 21 geben mehr, sonst liegt man rund zwei Stufen unter dem Questgebiet und muss es mit
// Kopfgeldern auffüllen (Rundgänge 21–30 und 31–40). Mit ×1,7 / ×1,8 liegt man wie bis 20 etwa eine Stufe darunter
// (test/pacing.mjs, auch mit GAP=99 ohne Kopfgelder).
export const QUEST_XP_BOOST = [{ from: 21, to: 30, mult: 1.7 }, { from: 31, to: 40, mult: 1.8 }];
// Quests der Stufe 40 rechnen wie vor Sternenglut mit der Stufe 39 (sonst gäben Aschenfürst und Heimkehr plötzlich das
// Doppelte); Quests der neuen Welt setzen deshalb ab Stufe 41 an.
export function questXp(questLevel, weight) {
  const boost = QUEST_XP_BOOST.find((b) => questLevel >= b.from && questLevel <= b.to)?.mult ?? 1;
  const base = questLevel === LEGACY_CAP ? LEGACY_CAP - 1 : Math.min(questLevel, LEVEL_CAP - 1);
  return Math.round((xpToNext(base) * weight * 0.75 * boost) / 5) * 5;
}

// Vorschlag für den Werteanstieg je Stufe (computeStats von Thread A hat eigene Klassenwerte).
export const LEVEL_GROWTH = { maxHp: 12, power: 2, armor: 1, maxResource: 5 };
