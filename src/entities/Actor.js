import { Entity, getShadow } from './Entity.js';
import { Animator } from '../gfx/Sprite.js';
import { moveAndCollide } from '../systems/Physics.js';

// Lebewesen: HP, Treffer-Reaktion, Rückstoß, Animation, Zustandsmaschine.
export class Actor extends Entity {
  constructor(x, y, anims) {
    super(x, y);
    this.animator = new Animator(anims);
    this.animator.play('idle');
    this.maxHp = this.hp = 10;
    this.dead = false;
    this.facing = 1;
    this.flash = 0;
    this.invuln = 0;
    this.kbx = 0; this.kby = 0;
    this.mass = 1;
    this.solid = true;
    this.hurtable = true;
    this.hurtRadius = 7;
    this.bodyHeight = 16;
    this.shadowW = 14;
    this.material = 'flesh';
    this.state = 'idle';
    this.stateTime = 0;
    this.hpBarTimer = 0;
    this.rise = 1; // 0..1 – Spawn "aus dem Boden"
  }

  setState(s) { this.state = s; this.stateTime = 0; }

  get centerY() { return this.y - this.bodyHeight / 2; }

  takeHit(hit) {
    if (this.dead || this.invuln > 0 || !this.hurtable) return false;
    this.hp -= hit.damage;
    this.flash = 0.1;
    this.hpBarTimer = 2.5;
    const kb = hit.knockback / this.mass;
    this.kbx += hit.dirX * kb;
    this.kby += hit.dirY * kb;
    if (this.hp <= 0) { this.hp = 0; this.die(hit); }
    else this.onHurt(hit);
    return true;
  }
  onHurt(hit) {}
  die(hit) { this.dead = true; this.solid = false; }

  // Integriert Eigenbewegung + Rückstoß mit Kollision.
  integrate(dt, world) {
    const dx = (this.vx + this.kbx) * dt, dy = (this.vy + this.kby) * dt;
    const res = moveAndCollide(this, dx, dy, world.dungeon);
    const f = Math.exp(-dt * 11);
    this.kbx *= f; this.kby *= f;
    if (res.hitX) this.kbx *= -0.3;
    if (res.hitY) this.kby *= -0.3;
    return res;
  }

  tickTimers(dt) {
    this.stateTime += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hpBarTimer = Math.max(0, this.hpBarTimer - dt);
    this.animator.update(dt);
  }

  currentFrame() { return this.animator.frame; }

  drawSprite(ctx, cx, cy, opts = {}) {
    const f = this.currentFrame();
    const x = this.x - cx, y = this.y - cy;
    if (this.rise < 1) {
      // Aus dem Boden steigen: nur der obere Teil ist sichtbar
      const img = this.facing < 0 ? f.flipped : f.canvas;
      const ax = this.facing < 0 ? f.canvas.width - f.ax : f.ax;
      const r = f.res ?? 1; // Texel je Weltpixel (§11.12)
      const visH = Math.max(1, Math.round(f.ay * this.rise));
      ctx.drawImage(img, 0, 0, img.width, visH, Math.round(x * r - ax) / r, Math.round(y * r - visH) / r, img.width / r, visH / r);
      return;
    }
    f.draw(ctx, x, y, { flip: this.facing < 0, ...opts });
  }

  render(ctx, cx, cy) {
    const sh = getShadow(this.shadowW);
    if (this.rise > 0.2) ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    this.drawSprite(ctx, cx, cy);
  }

  renderEmissive(ctx, cx, cy) {
    // flashMax: große Bosse blitzen gedämpft, damit der weiße Umriss den Helden nicht verdeckt
    if (this.flash > 0 && this.rise >= 1) this.drawSprite(ctx, cx, cy, { flash: true, alpha: Math.min(this.flashMax ?? 1, this.flash * 14) });
  }
}
