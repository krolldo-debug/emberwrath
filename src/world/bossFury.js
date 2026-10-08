// Boss-Balance zentral (Thread B): Schadensfaktor je Boss und weicher Wutmodus („Raserei“).
//
// - def.dmgMult (enemyTypes*.js / defs_*.js): skaliert jeden Treffer, dessen Urheber der Boss ist – Nahkampf,
//   Geschosse, Warnflächen, Wellen, Bodenflächen (Urheber über owner/hero/caster/source bis zu drei Stufen).
//   Beschworene Diener (eigene def ohne boss) bleiben unverändert.
// - Raserei: Nach FURY_START s Kampf (Boss engaged) +FURY_STEP Schaden je FURY_EVERY s, Toast und roter Schimmer.
//   Verhindert, dass weit unterstufige Helden einen Boss mit Trankvorrat „aussitzen“.
// Einbau: Actor.takeHit -> applyBossPower(hit, this) (neben applyLevelGap); World.update -> updateBossFury(this, dt).
import { Entity } from '../entities/Entity.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';

export const FURY_START = 240;
export const FURY_EVERY = 30;
export const FURY_STEP = 0.15;

// Boss hinter einer Trefferquelle (oder null)
export function bossOf(src) {
  let s = src;
  for (let i = 0; i < 4 && s; i++) {
    if (s.def?.boss) return s;
    const next = s.owner ?? s.caster ?? s.hero ?? s.source ?? null;
    if (next === s) break;
    s = next;
  }
  return null;
}

// Wutmodus-Faktor eines Bosses für eine Kampfdauer t (s)
export function furyMult(t) {
  if (!(t >= FURY_START)) return 1;
  return 1 + FURY_STEP * (1 + Math.floor((t - FURY_START) / FURY_EVERY));
}

// Passt hit.damage für Treffer eines Bosses an Nicht-Gegnern an (einmal je Treffer).
export function applyBossPower(hit, target) {
  if (!hit || hit.bossPower != null || !target || target.team === 'enemy') return hit;
  const b = bossOf(hit.source);
  const m = b ? (b.trialDmgMult ?? b.def.dmgMult ?? 1) * (b.furyMult ?? 1) : 1;
  hit.bossPower = m;
  if (m !== 1 && hit.damage > 0) hit.damage = Math.max(1, Math.round(hit.damage * m));
  return hit;
}

const shortName = (b) => String(b.def?.name ?? b.name ?? 'Der Boss').split(',')[0];

// Je Bild aus World.update
export function updateBossFury(world, dt) {
  const b = world.boss;
  if (!b || b.dead) { if (b?.furyAura) { b.furyAura.removed = true; b.furyAura = null; } return; }
  if (!b.engaged) { b.furyT = 0; b.furyMult = 1; return; }
  b.furyT = (b.furyT ?? 0) + dt;
  const m = furyMult(b.furyT);
  if (m > (b.furyMult ?? 1)) {
    if ((b.furyMult ?? 1) === 1) {
      world.bus.emit(EV.UI_TOAST, { text: `${shortName(b)} gerät in Raserei!`, kind: 'warn' });
      b.furyAura = world.spawn(new FuryAura(b));
      world.addLight?.(new Light({ follow: b, offsetY: -(b.bodyHeight ?? 50) * 0.5, radius: 70 + (b.radius ?? 12) * 2, color: [255, 50, 30], intensity: 0.75, flicker: 0.25, bloom: 0.35 }));
    }
    b.furyMult = m;
  }
}

// Rötlicher Schimmer um den rasenden Boss: pulsierender Bodenring + aufsteigende Glutfunken
class FuryAura extends Entity {
  constructor(boss) { super(boss.x, boss.y); this.boss = boss; this.t = 0; this.sortOffset = -40; }
  update(dt, world) {
    const b = this.boss;
    if (b.dead || b.removed) { this.removed = true; return; }
    this.x = b.x; this.y = b.y; this.t += dt;
    const w = (b.shadowW ?? 40) * 0.5, h = b.bodyHeight ?? 50;
    if (Math.random() < dt * 22) world.particles?.spawn?.({ x: b.x + (Math.random() - 0.5) * w * 1.6, y: b.y - Math.random() * 4, z: Math.random() * h * 0.8, vx: 0, vy: 0, vz: 18 + Math.random() * 20, life: 0.7 + Math.random() * 0.5, colors: ['#ff4a2a', '#ff8a3c', '#b8141c'], emissive: true, size: 1 });
  }
  renderEmissive(ctx, cx, cy) {
    const b = this.boss, r = (b.shadowW ?? 40) * 0.62 + 4;
    const p = 0.5 + 0.5 * Math.sin(this.t * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + 0.14 * p;
    ctx.fillStyle = '#ff2a18';
    ctx.beginPath();
    ctx.ellipse(Math.round(b.x - cx), Math.round(b.y - cy), r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35 + 0.25 * p;
    ctx.strokeStyle = '#ff5a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(b.x - cx) + 0.5, Math.round(b.y - cy) + 0.5, r + 2, (r + 2) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
