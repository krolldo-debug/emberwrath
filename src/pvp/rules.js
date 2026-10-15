// Regeln der Glutarena (PvP, 1 gegen 1). Reine Daten und Rechenfunktionen: Client und Arena-Server
// (worker/pvp/) teilen diese Datei. Beschreibung: src/pvp/README.md.
//
// Entscheidungen (Stand 15.10.2026):
//   - Arena ab Stufe 10. In der Arena kämpfen alle auf Stufe 40 mit allen Fähigkeiten, allen Talenten und derselben
//     Arena-Rüstung ihrer Klasse (arenaStats.js). Es zählen Klasse, Volk und Können, nicht Ausrüstung oder Stufe.
//   - Gewertet (Elo), Saisons à 8 Wochen, Ligen von Bronze bis Glutmeister, weicher Rücksetzer zur neuen Saison.
//   - Echte Gegner zuerst (ähnliche Wertung, Fenster wächst mit der Wartezeit). Findet sich nach BOT_AFTER_MS keiner,
//     tritt ein Herausforderer an (Bot, wie die Söldner der Dungeonsuche gekennzeichnet). Gegen Herausforderer gibt es
//     halbe Wertung und höchstens BOT_RATING_CAP: Platin und höher erreicht nur, wer echte Gegner besiegt.
//   - Belohnung: Gold je Kampf (Sieg mehr), die ersten DAILY_REWARDS Kämpfe am Tag; Titel für Ligen und Siege.

export const PVP_MIN_LEVEL = 10;
export const ARENA_LEVEL = 40;
export const ARENA_ZONE = 'pvp_arena';

// Schaden in der Arena (alle Quellen eines Helden, Helden.damageFor): Helden sind für Monster gebaut, gegeneinander
// fielen Kämpfe sonst nach wenigen Treffern. Mit diesem Faktor dauert ein Kampf etwa 25–45 Sekunden (Simulation,
// src/pvp/test/sim.mjs).
export const PVP_DAMAGE = 0.1;
// Ausgleich je Klasse (Simulation): Magier und Waldläufer treffen aus der Ferne, Schurken treffen oft, aber leicht
export const PVP_CLASS = { warrior: 0.9, rogue: 1.45, ranger: 1, mage: 0.85 };
export const pvpDamage = (classId) => PVP_DAMAGE * (PVP_CLASS[classId] ?? 1);

// Ablauf eines Kampfes (ms)
export const TIMING = {
  botAfterMs: 20_000,     // so lange wird nach einem echten Gegner gesucht
  readyMs: 30_000,        // beide müssen die Arena so schnell betreten haben
  countdownMs: 3_000,     // Gong nach dem Betreten beider Kämpfer
  matchMs: 120_000,       // danach entscheidet das Leben in Prozent
  stormAfterMs: 60_000,   // ab hier „Glutsturm“: jeder Treffer wird stärker
  graceMs: 10_000,        // Verbindung weg: so lange wird gewartet, dann gilt der Kampf als aufgegeben
  resultMs: 6_000,        // Ergebnis anzeigen, dann zurück an die Stelle, an der man gesucht hat
};
export const STORM_PER_S = 0.03; // +3 % Schaden je Sekunde Glutsturm

// Glutsturm-Faktor nach t ms Kampfzeit
export function stormMult(tMs) {
  return 1 + Math.max(0, (tMs - TIMING.stormAfterMs) / 1000) * STORM_PER_S;
}

// ------------------------------------------------------------------ Saisons
// Saison 1 beginnt am Montag, 12.10.2026 (UTC). Jede Saison dauert 8 Wochen.
export const SEASON_EPOCH = Date.UTC(2026, 9, 12);
export const SEASON_DAYS = 56;
const DAY = 86_400_000;

export function seasonAt(ms = Date.now()) {
  const n = Math.max(1, Math.floor((ms - SEASON_EPOCH) / (SEASON_DAYS * DAY)) + 1);
  const start = SEASON_EPOCH + (n - 1) * SEASON_DAYS * DAY;
  return { n, start, end: start + SEASON_DAYS * DAY };
}

// Tag für die Tagesgrenze der Belohnungen (UTC)
export const dayOf = (ms = Date.now()) => Math.floor(ms / DAY);

// ------------------------------------------------------------------ Wertung
export const START_RATING = 1000;
export const RATING_MIN = 100;
export const RATING_MAX = 4000;
export const PLACEMENT_GAMES = 10;      // so viele Kämpfe zählen doppelt so stark (schnell an die richtige Stelle)
export const BOT_RATING_CAP = 1350;     // höher bringen Herausforderer niemanden
export const BOT_K_MULT = 0.5;

// Ligen nach Wertung. color: Rahmen/Schrift im Arena-Fenster
export const TIERS = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#c07a44' },
  { id: 'silver', name: 'Silber', min: 1100, color: '#c8d0dc' },
  { id: 'gold', name: 'Gold', min: 1250, color: '#f2c14e' },
  { id: 'platinum', name: 'Platin', min: 1400, color: '#7fe0d0' },
  { id: 'diamond', name: 'Diamant', min: 1550, color: '#8ab8ff' },
  { id: 'master', name: 'Glutmeister', min: 1700, color: '#ff8a3a' },
];
export function tierOf(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t;
}
export const tierIndex = (id) => Math.max(0, TIERS.findIndex((t) => t.id === id));

// Startwert einer neuen Saison aus dem Endstand der vorigen (halber Abstand zum Start, nie darunter)
export function seasonStart(prevRating) {
  if (!Number.isFinite(prevRating)) return START_RATING;
  return Math.max(START_RATING, Math.round(START_RATING + (prevRating - START_RATING) / 2));
}

export const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

// Neue Wertung nach einem Kampf. score: 1 Sieg, 0.5 Unentschieden, 0 Niederlage.
// bot: Gegner war ein Herausforderer (halbe Wertung, Gewinne höchstens bis BOT_RATING_CAP)
export function rate(rating, foeRating, score, { games = 99, bot = false } = {}) {
  let k = games < PLACEMENT_GAMES ? 40 : 24;
  if (bot) k *= BOT_K_MULT;
  let delta = Math.round(k * (score - expected(rating, foeRating)));
  if (bot && delta > 0) delta = Math.max(0, Math.min(delta, BOT_RATING_CAP - rating));
  const next = Math.max(RATING_MIN, Math.min(RATING_MAX, rating + delta));
  return { rating: next, delta: next - rating };
}

// Suchfenster für echte Gegner: wächst mit der Wartezeit
export const matchWindow = (waitMs) => Math.min(400, 100 + (waitMs / 1000) * 15);

// Wertung des Herausforderers: nahe an der eigenen, nie über der Obergrenze
export function botRating(rating, rnd = Math.random) {
  return Math.round(Math.max(800, Math.min(BOT_RATING_CAP + 50, rating + (rnd() - 0.5) * 120)));
}

// Können des Herausforderers nach seiner Wertung: 0 (zögerlich) .. 1 (stark)
export function botSkill(rating) {
  return Math.max(0.15, Math.min(0.95, (rating - 750) / 800));
}

// ------------------------------------------------------------------ Belohnungen
export const DAILY_REWARDS = 10;
// Gold je Kampf nach der echten Stufe des Charakters (nicht der Arena-Stufe)
export function goldFor(level, score) {
  const lv = Math.max(1, Math.min(40, level | 0));
  if (score >= 1) return 20 + lv * 4;
  if (score > 0) return 10 + lv * 2;
  return 5 + lv;
}
