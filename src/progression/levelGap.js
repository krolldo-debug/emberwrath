// Stufenabstand im Kampf (Thread C). Reine Regeln, ohne DOM und ohne Imports.
//
// Wer weit über seiner Stufe kämpft, macht kaum Schaden und nimmt viel mehr. Ein Held auf Stufe 24
// soll Malgareth (40) auch mit sehr guter Ausrüstung nicht legen können; ein, zwei Stufen darunter
// bleiben fair. Nach unten wirkt es nur schwach: hohe Stufen sollen Startgebiete nicht in einem
// Schlag leeren, aber auch nicht übermäßig belohnt werden.
//
// Einbau (INTEGRATION.md §13.1): am Anfang von Actor.takeHit bzw. Hero.takeHit (vor der Rüstung)
//   applyLevelGap(hit, this);
// Wirkt nur zwischen verschiedenen Teams und nur einmal je Treffer (hit.levelGap wird gesetzt).

// Ab wie vielen Stufen Abstand der Malus steil wird.
export const GAP_FREE = 2;
export const GAP_STEEP = 4;

// Faktor für Schaden, den ein Angreifer der Stufe `att` an einem Ziel der Stufe `def` macht.
export function levelGapMult(att, def) {
  if (!Number.isFinite(att) || !Number.isFinite(def)) return 1;
  const gap = Math.round(def - att);
  if (gap > 0) {
    // Ziel liegt höher: 1–2 Stufen kaum spürbar, 3–4 deutlich, ab 5 steil, ab etwa 10 fast wirkungslos
    if (gap <= GAP_FREE) return 1 - 0.04 * gap;
    if (gap <= GAP_STEEP) return 0.92 - 0.1 * (gap - GAP_FREE);
    return Math.max(0.1, 0.72 - 0.12 * (gap - GAP_STEEP));
  }
  // Ziel liegt tiefer: der Stärkere trifft etwas härter (höchstens +25 %)
  if (gap < 0) return Math.min(1.25, 1 + 0.025 * -gap);
  return 1;
}

// Faktor für Schaden, den ein Ziel der Stufe `def` von einem Angreifer der Stufe `att` erleidet
// (dieselbe Rechnung von der anderen Seite: wer zu tief ist, nimmt mehr; höchstens ×4).
export function levelGapTakenMult(att, def) {
  if (!Number.isFinite(att) || !Number.isFinite(def)) return 1;
  const gap = Math.round(att - def);
  if (gap <= 0) return Math.max(0.6, 1 - 0.04 * -gap);
  if (gap <= GAP_FREE) return 1 + 0.06 * gap;
  if (gap <= GAP_STEEP) return 1.12 + 0.2 * (gap - GAP_FREE);
  return Math.min(4, 1.52 + 0.3 * (gap - GAP_STEEP));
}

const levelOf = (a) => (a && Number.isFinite(a.level) ? a.level : null);

// Passt hit.damage an. source = hit.source (Angreifer, bei Geschossen der Schütze).
// Gegner → Held: levelGapTakenMult; Held/Verbündete → Gegner: levelGapMult.
export function applyLevelGap(hit, target) {
  if (!hit || hit.levelGap != null || !target) return hit;
  const src = hit.source;
  const a = levelOf(src), d = levelOf(target);
  if (a == null || d == null || !src.team || src.team === target.team) { hit.levelGap = 1; return hit; }
  const m = target.team === 'enemy' ? levelGapMult(a, d) : levelGapTakenMult(a, d);
  hit.levelGap = m;
  if (m !== 1 && hit.damage > 0) hit.damage = Math.max(1, Math.round(hit.damage * m));
  return hit;
}

// Farbe der Stufenzahl über einem Gegner aus Sicht des Helden (wie gewohnt: grau leicht … rot gefährlich).
export const GAP_COLORS = { trivial: '#8a8a8a', easy: '#6fd36f', even: '#e8d36a', hard: '#ff9a3c', deadly: '#ff4a4a', skull: '#d23cff' };
export function levelGapTier(heroLevel, enemyLevel) {
  const gap = Math.round((enemyLevel ?? 0) - (heroLevel ?? 0));
  if (gap >= 10) return 'skull';
  if (gap >= GAP_STEEP + 1) return 'deadly';
  if (gap >= GAP_FREE + 1) return 'hard';
  if (gap >= -2) return 'even';
  if (gap >= -7) return 'easy';
  return 'trivial';
}
export function levelGapColor(heroLevel, enemyLevel) { return GAP_COLORS[levelGapTier(heroLevel, enemyLevel)]; }
