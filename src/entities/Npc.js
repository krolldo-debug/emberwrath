import { Entity, getShadow } from './Entity.js';
import { Animator } from '../gfx/Sprite.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';

// Nicht-Spieler-Figur: steht, atmet, schaut zum Helden, spricht bei Interaktion.
// Das Gespräch selbst (Quests) führt Bereich C über EV.NPC_INTERACT; C zeichnet
// auch die Questmarkierungen (! / ?) über Entities mit `npcId` in Höhe `markerY`.
export class Npc extends Entity {
  constructor(npcId, x, y, def, anims, world) {
    super(x, y);
    this.npcId = npcId;
    this.def = def;
    this.animator = new Animator(anims);
    this.animator.play('idle');
    this.facing = def.facing ?? 1;
    this.interactRange = 26;
    this.talkTime = 0;
    this.markerY = 48;
    this.bodyHeight = 26;
    this.t = Math.random() * 3;
    this.lastFrame = -1;
    this.box = { x0: x - 5, y0: y - 4, x1: x + 5, y1: y + 1 };
    world.dungeon.boxes.push(this.box);
    if (def.light) this.light = world.addLight(new Light({ x: x + def.light.dx, y: y + def.light.dy, radius: def.light.radius, color: def.light.color, intensity: 0.85, flicker: 0.2, bloom: 0.35 }));
    this.world = world;
  }

  canInteract(world) { return !world.hero.dead; }
  prompt() { return `Sprechen: ${this.def.name}`; }
  promptAnchor() { return { x: this.x, y: this.y - 34 }; }

  interact(world) {
    this.talkTime = 2.5;
    this.animator.play('talk', true);
    const h = world.hero;
    if (!this.def.fixedFacing) this.facing = h.x < this.x ? -1 : 1;
    const hs = world.session.game?.bus?.handlers;
    const listeners = hs ? (hs.get(EV.NPC_INTERACT)?.size ?? 0) : 1;
    world.bus.emit(EV.NPC_INTERACT, { npcId: this.npcId, x: this.x, y: this.y });
    // Ohne Quest-System (z. B. im Einzeltest) wenigstens ein Gruß
    if (!listeners && this.def.greeting) world.bus.emit(EV.UI_TOAST, { text: `${this.def.name}: „${this.def.greeting}“`, kind: 'info' });
  }

  update(dt, world) {
    this.t += dt;
    this.animator.update(dt);
    const h = world.hero;
    const d = Math.hypot(h.x - this.x, h.y - this.y);
    if (this.talkTime > 0) {
      this.talkTime -= dt;
      if (this.talkTime <= 0) this.animator.play('idle', true);
    } else if (!this.def.fixedFacing && d < 70) this.facing = h.x < this.x ? -1 : 1;
    this.nearHero = d < 110;
    // Schmied: Funken beim Hammerschlag
    if (this.def.anvil && this.animator.name === 'idle') {
      const fi = Math.floor(this.animator.time * this.animator.current.fps) % this.animator.current.frames.length;
      if (fi === 3 && this.lastFrame !== 3) {
        const ax = this.x + this.def.anvil.dx, ay = this.y + this.def.anvil.dy;
        world.particles.sparks(ax, ay, -Math.PI / 2, 6, ['#ffffff', '#ffe8a0', '#ffc050']);
        world.addLight(new Light({ x: ax, y: ay, radius: 36, color: [255, 190, 110], intensity: 0.9, ttl: 0.12, bloom: 0.4 }));
        if (d < 160) world.bus.emit('anvil', { x: ax, y: ay });
      }
      this.lastFrame = fi;
    }
    if (this.light && this.def.light.sway) this.light.x = this.x + this.def.light.dx * this.facing + Math.sin(this.t * 1.5) * 0.6;
  }

  render(ctx, cx, cy) {
    const sh = getShadow(12);
    ctx.drawImage(sh, Math.round(this.x - cx - sh.width / 2), Math.round(this.y - cy - sh.height / 2));
    this.animator.frame.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 });
  }

  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), top = Math.round(this.y - cy - 34);
    const glow = this.animator.frame.glow;
    if (glow) glow.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0 });
    if (this.def.lanternGlow) {
      const g = this.def.lanternGlow;
      ctx.fillStyle = 'rgba(255,190,90,0.9)';
      ctx.fillRect(x + g.dx * this.facing - 1, top + g.dy, 3, 4);
    }
    const font = this.world.session.font;
    if (this.nearHero && font) {
      font.draw(ctx, this.def.name.toUpperCase(), x, top - 8, { color: '#e8c25a', align: 'center', shadow: true });
      if (this.def.title) font.draw(ctx, this.def.title.toUpperCase(), x, top - 1, { color: '#a89ab8', align: 'center', shadow: true });
    }
  }
}
