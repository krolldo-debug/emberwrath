import { angleDiff } from '../core/math.js';

// Zielhilfe des Helden (alle Klassen, Maus, Touch und Tastatur). Reine Rechnung ohne DOM.
//
// pickTarget wählt beim Drücken ein Ziel, aimAngle richtet im Moment des Hiebs bzw. Schusses
// (nach der Ausholzeit) auf die aktuelle Stelle des Ziels aus – Geschosse mit Vorhalt.
//   Maus:      Gegner unter oder nahe dem Zeiger zuerst, sonst der beste im engen Kegel um den Zeiger.
//   Richtung:  Stick/Tasten: bester im Kegel um die Laufrichtung, sonst der nächste in Reichweite.
//   Ohne:      Stehen ohne Eingabe: nächster Gegner ringsum (Blickrichtung leicht bevorzugt).
// Das zuletzt gewählte Ziel bleibt bevorzugt, damit die Hilfe nicht zwischen Gegnern springt.

const MOUSE_CONE = 0.6;     // rad, halber Kegel um den Zeiger
const DIR_CONE = 0.95;      // rad, halber Kegel um Stick/Tasten
const POINTER_SNAP = 18;    // px: so nah am Trefferkreis zählt der Zeiger als auf dem Gegner
const STICKY = 22;          // Bonus (px) für das bisherige Ziel
const MAX_LEAD = 0.9;       // s, längster Vorhalt

// Anvisierbar: lebt, ist aufgetaucht und trifft-bar
export function targetable(e) {
  return !!e && !e.dead && !e.removed && e.hurtable !== false && (e.rise ?? 1) >= 1;
}

// ox/oy = Bezugspunkt des Helden (Mitte der Waffe), range = Reichweite bis zum Rand des Trefferkreises.
export function pickTarget(enemies, { ox, oy, range, pointer = null, dir = null, facing = 1, last = null }) {
  let best = null, bestScore = Infinity;
  const pa = pointer ? Math.atan2(pointer.y - oy, pointer.x - ox) : null;
  const da = dir ? Math.atan2(dir.y, dir.x) : null;
  const fa = facing < 0 ? Math.PI : 0;
  for (const e of enemies) {
    if (!targetable(e)) continue;
    const dx = e.x - ox, dy = e.centerY - oy;
    const d = Math.hypot(dx, dy), r = e.hurtRadius ?? 7;
    if (d - r > range) continue;
    const ang = Math.atan2(dy, dx);
    let score;
    if (pointer) {
      const off = Math.hypot(pointer.x - e.x, pointer.y - e.centerY) - r;
      if (off <= POINTER_SNAP) score = -1000 + off;                        // Zeiger auf dem Gegner
      else {
        const a = Math.abs(angleDiff(pa, ang));
        if (a > MOUSE_CONE + Math.atan2(r, Math.max(d, 1))) continue;
        score = d * 0.6 + a * 60;
      }
    } else if (dir) {
      const a = Math.abs(angleDiff(da, ang));
      // Im Kegel zuerst; sonst trotzdem der nächste in Reichweite (Fernkämpfer schießen beim Zurückweichen nach hinten)
      score = a <= DIR_CONE + Math.atan2(r, Math.max(d, 1)) ? d + a * 30 : 400 + d + a * 20;
    } else {
      score = d + Math.abs(angleDiff(fa, ang)) * 12;
    }
    if (e === last) score -= STICKY;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Richtung von (ox, oy) auf das Ziel; mit speed (px/s) wird die Bewegung des Ziels vorgehalten.
export function aimAngle(e, ox, oy, speed = 0) {
  let tx = e.x, ty = e.centerY;
  if (speed > 0) {
    // Eigenbewegung läuft weiter (getroffene Gegner bremsen sofort ab), Rückstoß klingt ab (Actor.integrate: ×e^(−11·t))
    const own = e.state === 'hurt' ? 0 : 1;
    const vx = (e.vx ?? 0) * own, vy = (e.vy ?? 0) * own, kx = e.kbx ?? 0, ky = e.kby ?? 0;
    for (let i = 0; i < 2; i++) {
      const t = Math.min(MAX_LEAD, Math.hypot(tx - ox, ty - oy) / speed);
      const k = (1 - Math.exp(-11 * t)) / 11;
      tx = e.x + vx * t + kx * k; ty = e.centerY + vy * t + ky * k;
    }
  }
  return Math.atan2(ty - oy, tx - ox);
}
