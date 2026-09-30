// Stufen und Erfahrung (Thread C).
//
// progress.xp ist die GESAMT-Erfahrung, progress.xpNext die Gesamt-XP für die nächste Stufe.
// Tempo (INTEGRATION.md §11.4): Varkhul ≈ Stufe 6, Ende Aschenwald ≈ 10, Nerith ≈ 12,
// Ende Schlackenhöhen ≈ 17, Ignaroth ≈ 20 – etwa 30–60 Minuten. Quests liefern rund 55–60 %
// der Erfahrung, Kämpfe den Rest. Nachrechnen: node src/progression/test/pacing.mjs
// Ab Stufe 20 (§12.1) wird die Kurve aus der Zielzeit berechnet: 15 Minuten für 20→21, dann linear
// bis 25 Minuten für 39→40, bei gleichem Kampftempo (Kills je Minute) und Quest-Anteil wie bis 20.
import { clamp } from '../core/math.js';

export const LEVEL_CAP = 40;
export const CLASSIC_CAP = 20;          // Stufe 1–19 bleibt bitgenau wie vor der Erweiterung
// Annahmen der Tempo-Rechnung ab Stufe 20 (dieselben wie in test/pacing.mjs)
// efficiency: Anteil der XP je Kill auf Spielerstufe, der im Schnitt wirklich ankommt (Wege, schwächere Gegner,
// Kopfgelder zwischen den Regionen) – aus test/pacing.mjs geeicht.
export const PACE = { killsPerMinute: 15, killShare: 0.42, efficiency: 0.8, minutesFirst: 15, minutesLast: 25 };

// Zielminuten für die Stufe `level` → `level + 1` (nur ab 20)
export function minutesForLevel(level) {
  const f = (level - CLASSIC_CAP) / (LEVEL_CAP - 1 - CLASSIC_CAP);
  return PACE.minutesFirst + (PACE.minutesLast - PACE.minutesFirst) * Math.max(0, Math.min(1, f));
}

// Benötigte Erfahrung von Stufe `level` auf `level + 1`: 100, 270, 480, 715, 985 … 6545 (bis 19),
// ab 20: Zielminuten × Kills/Minute × Gegner-XP ÷ Kampfanteil (≈ 52 000 für 20→21, ≈ 164 000 für 39→40)
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
export function questXp(questLevel, weight) {
  return Math.round((xpToNext(Math.min(questLevel, LEVEL_CAP - 1)) * weight * 0.75) / 5) * 5;
}

// Vorschlag für den Werteanstieg je Stufe (computeStats von Thread A hat eigene Klassenwerte).
export const LEVEL_GROWTH = { maxHp: 12, power: 2, armor: 1, maxResource: 5 };
