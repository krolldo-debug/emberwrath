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
// Schadensfaktor je Stufe Abstand nach oben (Index = Abstand), danach 0,04
const GAP_UP = [1, 0.96, 0.92, 0.7, 0.5, 0.33, 0.22, 0.14, 0.09, 0.06];
// Elite ab Stufe 20 zählen im Stufenabstand zwei Stufen höher (wer sie überspringt, kommt nicht mehr durch)
export const ELITE_BONUS = 2, ELITE_FROM = 20;

// Faktor für Schaden, den ein Angreifer der Stufe `att` an einem Ziel der Stufe `def` macht.
export function levelGapMult(att, def) {
  if (!Number.isFinite(att) || !Number.isFinite(def)) return 1;
  const gap = Math.round(def - att);
  if (gap > 0) {
    // Ziel liegt höher: 1–2 Stufen kaum spürbar, 3–4 deutlich, ab 5 steil, ab 10 nahezu immun
    // (Messung B 08.10.: bei ×0,60 auf −5 gewann der Held jeden Kampf; Messung 10.10.: Stufe 27 legte mit ×0,40 noch
    // Gruppen der Stufe 32 und Elite der Stufe 35 – Kurve ab 3 Stufen steiler)
    return gap < GAP_UP.length ? GAP_UP[gap] : 0.04;
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
  if (gap <= GAP_STEEP) return 1.12 + 0.25 * (gap - GAP_FREE);
  return Math.min(4, 2.4 + 0.3 * (gap - GAP_STEEP - 1));
}

const levelOf = (a) => (a && Number.isFinite(a.level) ? a.level : null);

// Stufe im Kampf: Elite ab ELITE_FROM zählen ELITE_BONUS Stufen höher
export function combatLevel(a) {
  const L = levelOf(a);
  return L != null && a.def?.elite && !a.def?.boss && L >= ELITE_FROM ? L + ELITE_BONUS : L;
}

// Geschosse, Explosionen und Warnflächen tragen sich selbst als source (ohne Stufe):
// dann zählt die Stufe des Schützen.
function attackerOf(src) {
  if (!src || levelOf(src) != null) return src;
  return src.hero ?? src.owner ?? src.caster ?? src;
}

// Stufe des Angreifers eines Treffers (Geschoss → Schütze), sonst fallback
export function attackerLevel(source, fallback = null) { return levelOf(attackerOf(source)) ?? fallback; }

// Standfestigkeit der Gegner. gap = Gegnerstufe − Stufe des Angreifers.
// Treffer unterbrechen Angriffe (Taumeln). Ohne Grenze hielt schnelles Zuschlagen jeden normalen Gegner dauerhaft
// fest – Messung 10.10.: Held 27 besiegte Gruppen der Stufe 36–38 und Elite der Stufe 35, ohne selbst getroffen zu werden.
// Rückgabe: Sperrzeit in s nach dem Taumeln (bis wieder ein Treffer unterbricht) oder null = dieser Treffer unterbricht nicht.
//   ab 6 Stufen höher: nie; ab 3 höher und Elite/Champions: nur schwere Treffer (Kombo-Abschluss, Krit), dann 2,5 bzw. 2 s Ruhe;
//   sonst jeder Treffer, danach kurze Ruhe (Startgebiete bis Stufe 4 ohne, damit der Einstieg leicht bleibt).
export const STAGGER_HARD = 3, STAGGER_IMMUNE = 6;
export function staggerGuard(gap, { heavy = false, elite = false, level = 1 } = {}) {
  if (gap >= STAGGER_IMMUNE) return null;
  if (gap >= STAGGER_HARD) return heavy ? 2.5 : null;
  if (elite) return heavy ? 2 : null;
  const base = level <= 4 ? 0 : level < 10 ? 0.5 : 0.9;
  return heavy ? base * 0.5 : base;
}

// Rückstoß auf höhere Gegner: sie lassen sich kaum noch wegschieben (Fernkämpfer halten sie sonst dauerhaft auf Abstand)
export function knockbackMult(gap) { return gap >= STAGGER_IMMUNE ? 0.2 : gap >= STAGGER_HARD ? 0.5 : 1; }

// Passt hit.damage an. source = hit.source (Angreifer, Geschoss oder Trefferzone).
// Gegner → Held: levelGapTakenMult; Held/Verbündete → Gegner: levelGapMult.
export function applyLevelGap(hit, target) {
  if (!hit || hit.levelGap != null || !target) return hit;
  const src = attackerOf(hit.source);
  const a = combatLevel(src), d = combatLevel(target);
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
