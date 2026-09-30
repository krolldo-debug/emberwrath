import { Telegraph, DamageWave } from '../entities/Telegraph.js';
import { HazardCloud } from '../entities/Hazards.js';

// Was ein aufmerksamer Spieler am Boden und in der Luft sieht: Warnflächen (Telegraph), Gefahrenwolken,
// Druckwellen und heranfliegende Geschosse. Liefert für einen Punkt die dringendste Gefahr samt Fluchtrichtung.
//
// dangerAt(world, actor) -> null | { key, kind, timeLeft, dir: { x, y }, roll }
//   key       stabile Kennung (für Reaktionszeit: dieselbe Gefahr wird nur einmal "entdeckt")
//   timeLeft  Sekunden bis zum Treffer (Infinity für bleibende Flächen)
//   dir       Richtung aus der Gefahr heraus (normiert)
//   roll      true = nur eine Ausweichrolle hilft noch (zu knapp zum Laufen / Welle durchrollen)
const MARGIN = 7;
const keys = new WeakMap();
let nextKey = 1;
const keyOf = (o) => { let k = keys.get(o); if (!k) keys.set(o, (k = nextKey++)); return k; };
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

// Liegt (px, py) in der Warnfläche? -> Fluchtrichtung oder null
function inTelegraph(t, px, py) {
  const dx = px - t.x, dy = py - t.y;
  if (t.shape === 'circle') {
    const r = t.r + MARGIN;
    if ((dx / r) ** 2 + (dy / (r * 0.6)) ** 2 > 1) return null;
    return Math.hypot(dx, dy) < 2 ? norm(Math.random() - 0.5, Math.random() - 0.5) : norm(dx, dy / 0.6);
  }
  if (t.shape === 'arc') {
    const ey = dy / 0.6, d = Math.hypot(dx, ey);
    if (d > t.r + MARGIN) return null;
    const a = Math.atan2(ey, dx);
    let da = a - t.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > t.arc / 2 + 0.25 && d > 10) return null;
    // Aus dem Kegel: seitlich heraus, wenn der Kegel schmal ist, sonst nach hinten am Ursprung vorbei
    if (t.arc < Math.PI * 0.9) { const s = da >= 0 ? 1 : -1; return norm(Math.cos(t.angle + s * Math.PI / 2), Math.sin(t.angle + s * Math.PI / 2) * 0.6); }
    return norm(dx, dy);
  }
  // Linie
  const ux = Math.cos(t.angle), uy = Math.sin(t.angle) * 0.75;
  const ul = Math.hypot(ux, uy) || 1;
  const along = (dx * ux + dy * uy) / ul;
  const nx = -uy / ul, ny = ux / ul;
  const perp = dx * nx + dy * ny;
  if (along < -MARGIN || along > t.len + MARGIN || Math.abs(perp) > t.width / 2 + MARGIN) return null;
  const s = perp >= 0 ? 1 : -1;
  return { x: nx * s, y: ny * s };
}

export function dangerAt(world, a) {
  const px = a.x, py = a.y;
  let best = null;
  const consider = (d) => { if (!best || d.timeLeft < best.timeLeft) best = d; };
  for (const e of world.entities) {
    if (e.removed) continue;
    if (e instanceof Telegraph) {
      const dir = inTelegraph(e, px, py);
      if (!dir) continue;
      const timeLeft = Math.max(0, e.duration - e.t);
      consider({ key: keyOf(e), kind: 'telegraph', timeLeft, dir, roll: timeLeft < 0.3 });
    } else if (e instanceof HazardCloud) {
      const r = e.radius + 5;
      const dx = px - e.x, dy = (py - e.y) / 0.6;
      if (Math.hypot(dx, dy) > r) continue;
      consider({ key: keyOf(e), kind: 'cloud', timeLeft: 0.4, dir: norm(dx, dy), roll: false });
    }
  }
  for (const e of world.effects) {
    if (!(e instanceof DamageWave) || e.removed) continue;
    const dx = px - e.x, dy = (py - e.y) / 0.6, d = Math.hypot(dx, dy);
    const gap = d - e.r;
    if (gap < -8 || gap > 26) continue;
    // Welle kommt: durchrollen (Rolle macht unverwundbar), kurz bevor sie ankommt
    const speed = (e.maxR - 6) / e.duration;
    consider({ key: keyOf(e), kind: 'wave', timeLeft: Math.max(0, gap / speed), dir: norm(-dx, -dy), roll: true });
  }
  for (const p of world.projectiles) {
    if (p.removed || p.stuck || p.team !== 'enemy') continue;
    const vx = p.vx ?? 0, vy = p.vy ?? 0, sp = Math.hypot(vx, vy);
    if (sp < 20) continue;
    const rx = px - p.x, ry = a.centerY - (p.y - (p.z ?? 0) * 0.3);
    const t = (rx * vx + ry * vy) / (sp * sp); // Zeitpunkt der größten Annäherung
    if (t < 0 || t > 0.6) continue;
    const mx = rx - vx * t, my = ry - vy * t;
    if (Math.hypot(mx, my) > (a.hurtRadius ?? 6) + (p.radius ?? 3) + 4) continue;
    // seitlich aus der Flugbahn
    const s = mx * -vy + my * vx >= 0 ? 1 : -1;
    consider({ key: keyOf(p), kind: 'shot', timeLeft: t, dir: norm(-vy * s, vx * s), roll: t < 0.22 });
  }
  return best;
}

// Ist ein Punkt gerade gefährlich? (für die Wahl von Standorten)
export function unsafe(world, x, y) {
  for (const e of world.entities) {
    if (e.removed) continue;
    if (e instanceof Telegraph && inTelegraph(e, x, y)) return true;
    if (e instanceof HazardCloud && Math.hypot(x - e.x, (y - e.y) / 0.6) < e.radius + 5) return true;
  }
  return false;
}
