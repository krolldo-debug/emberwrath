import { angleDiff, rand } from '../core/math.js';
import { CONFIG } from '../config.js';

// Trefferzonen (Hitboxes) gegen Trefferflächen (Hurtboxes).
// Das Combat-System kennt keine Effekte – es meldet nur "hit" über den Bus.
export class CombatSystem {
  constructor(bus) {
    this.bus = bus;
    this.hitboxes = [];
  }

  add(h) {
    this.hitboxes.push({ shape: 'circle', arc: Math.PI * 2, angle: 0, heavy: false, ...h, hitSet: new Set() });
  }

  clear() { this.hitboxes.length = 0; }

  update(dt, world) {
    const actors = world.actors;
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const h = this.hitboxes[i];
      const o = h.owner;
      // Getötete oder unterbrochene Angreifer verlieren ihre Trefferzone
      if (o.dead || (o.team === 'enemy' && o.state === 'hurt')) { this.hitboxes.splice(i, 1); continue; }
      if (h.follow) { h.x = o.x + h.offX; h.y = o.y + h.offY; }

      for (const a of actors) {
        if (a.team === h.team || a.dead || !a.hurtable || h.hitSet.has(a)) continue;
        const dx = a.x - h.x, dy = a.centerY - h.y;
        const d = Math.hypot(dx, dy);
        if (d > h.r + a.hurtRadius) continue;
        if (h.shape === 'arc' && d > a.hurtRadius) {
          const tol = Math.atan2(a.hurtRadius, d);
          if (Math.abs(angleDiff(h.angle, Math.atan2(dy, dx))) > h.arc / 2 + tol) continue;
        }
        h.hitSet.add(a);
        this.#resolve(h, a, world);
      }

      // Helden-Hiebe wehren Pfeile ab
      if (h.team === 'hero') {
        for (const p of world.projectiles) {
          if (p.removed || p.stuck || !p.deflectable) continue;
          const dx = p.x - h.x, dy = p.y - p.z - h.y;
          const d = Math.hypot(dx, dy);
          if (d > h.r + 3) continue;
          if (h.shape === 'arc' && Math.abs(angleDiff(h.angle, Math.atan2(dy, dx))) > h.arc / 2 + 0.3) continue;
          p.deflect(world);
        }
      }

      h.ttl -= dt;
      if (h.ttl <= 0) this.hitboxes.splice(i, 1);
    }
  }

  #resolve(h, target, world) {
    const crit = h.canCrit && Math.random() < (h.critChance ?? CONFIG.hero?.critChance ?? 0.1);
    let damage = h.damage * rand(0.88, 1.12) * (crit ? 1.8 : 1);
    damage = Math.max(1, Math.round(damage));
    let dirX = target.x - h.owner.x, dirY = target.y - h.owner.y;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;
    const hit = { damage, crit, heavy: h.heavy || crit, dirX, dirY, knockback: h.knockback * (crit ? 1.3 : 1), source: h.owner };
    if (!target.takeHit(hit)) return;
    this.bus.emit('hit', {
      attacker: h.owner, target, damage: hit.damage, crit, heavy: hit.heavy, dirX, dirY,
      x: target.x - dirX * target.hurtRadius * 0.5, y: target.centerY - dirY * 3, killed: target.dead,
    });
  }

  debugDraw(ctx, cx, cy) {
    ctx.strokeStyle = 'rgba(255,60,60,0.8)';
    for (const h of this.hitboxes) {
      ctx.beginPath();
      if (h.shape === 'arc') { ctx.moveTo(h.x - cx, h.y - cy); ctx.arc(h.x - cx, h.y - cy, h.r, h.angle - h.arc / 2, h.angle + h.arc / 2); ctx.closePath(); }
      else ctx.arc(h.x - cx, h.y - cy, h.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
