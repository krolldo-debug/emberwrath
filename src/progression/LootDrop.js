import { drawLoot, rarityRgb } from '../gfx/Icons.js';
import { Light } from '../gfx/Lighting.js';
import { getShadow } from '../entities/Entity.js';
import { RARITIES } from './items.js';
import { EV } from '../core/events.js';

const MAGNET_RANGE = 34;
const PICKUP_RANGE = 9;

// Beute in der Welt: springt aus dem Gegner, bleibt liegen und wird eingesammelt,
// wenn der Held nahe genug ist. Das Einsammeln ist ein Command ('loot:claim');
// ist das Inventar voll, bleibt die Beute liegen.
// drop = { dropId, itemId?, qty?, gold? }
export class LootDrop {
  constructor(session, drop, x, y) {
    this.session = session;
    this.drop = drop;
    this.def = drop.itemId ? session.content.find('item', drop.itemId) : null;
    this.rarity = this.def?.rarity ?? 'common';
    this.look = drop.gold ? { gold: drop.gold, icon: 'gold' } : this.def;
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 35;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp * 0.6;
    this.z = 0; this.vz = 70 + Math.random() * 30;
    this.t = 0;
    this.seed = Math.random() * 10;
    this.blocked = 0;
    this.removed = false;
    this.light = null;
    if (this.rarity !== 'common' || (drop.gold ?? 0) >= 20) {
      const rgb = drop.gold ? [255, 200, 90] : rarityRgb(this.rarity);
      const big = this.rarity === 'epic' || this.rarity === 'legendary';
      this.light = session.world.addLight(new Light({ follow: this, offsetY: -6, radius: big ? 50 : 30, color: rgb, intensity: big ? 0.85 : 0.7, flicker: 0.15, bloom: big ? 0.4 : 0.15 }));
    }
  }

  get sortY() { return this.y; }

  update(dt, world) {
    this.t += dt;
    // Flugbogen
    if (this.vz !== 0 || this.z > 0) {
      this.vz -= 260 * dt; this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = Math.abs(this.vz) > 30 ? -this.vz * 0.35 : 0; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    const f = Math.exp(-dt * 5); this.vx *= f; this.vy *= f;
    this.blocked = Math.max(0, this.blocked - dt);

    const hero = world.hero;
    if (!hero || hero.dead || this.t < 0.55 || this.blocked > 0) return;
    const dx = hero.x - this.x, dy = hero.y - 4 - this.y, d = Math.hypot(dx, dy);
    if (d < MAGNET_RANGE) {
      const pull = 140 * (1 - d / MAGNET_RANGE) + 30;
      this.x += (dx / (d || 1)) * pull * dt; this.y += (dy / (d || 1)) * pull * dt;
    }
    if (d < PICKUP_RANGE) this.#claim(world);
  }

  #claim(world) {
    const r = this.session.state.commit('loot:claim', { dropId: this.drop.dropId });
    if (r?.ok) {
      this.removed = true;
      const rgb = this.drop.gold ? ['#fff0a8', '#e8c25a', '#b8862a'] : [RARITIES[this.rarity].color, '#ffffff'];
      world.particles.ring(this.x, this.y - 4, 5, this.rarity === 'common' ? 6 : 12, rgb, 30);
      this.session.sfx.play?.(this.drop.gold ? 'coin' : 'pickup');
    } else if (r?.reason === 'full') {
      this.blocked = 2.5;
      this.session.bus.emit(EV.UI_TOAST, { text: 'Inventar voll – Beute bleibt liegen. Beim Händler: „Plunder verkaufen“', kind: 'warn', icon: 'bag' });
    } else {
      this.removed = true; // bereits eingesammelt / verfallen
    }
  }

  #bob() { return this.z > 0 ? this.z : Math.sin(this.t * 3 + this.seed) * 1.5 + 1.5; }

  render(ctx, cx, cy) {
    const sh = getShadow(10);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.drawImage(sh, x - (sh.width >> 1), y - (sh.height >> 1));
    drawLoot(ctx, this.look, x, y + 1, this.t + this.seed, { bob: this.#bob() });
  }

  // Seltenheitsleuchten und Lichtsäule (D, gfx/Icons.js) + Glitzern
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.save();
    drawLoot(ctx, this.look, x, y + 1, this.t + this.seed, { bob: this.#bob(), emissive: true });
    ctx.restore();
    if (this.rarity !== 'common' && (this.t * 2 + this.seed) % 2 < 0.12) {
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(x + 4, Math.round(y - 12 - this.#bob()), 1, 1);
    }
  }
}
