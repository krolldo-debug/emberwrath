import { Entity } from '../entities/Entity.js';
import { SlashEffect, Afterimage } from '../entities/Effects.js';
import { SLASH_STYLES } from '../sprites/effects.js';
import { Light } from '../gfx/Lighting.js';
import { PAL } from '../gfx/Palette.js';
import { EV } from '../core/events.js';

// Verhalten der Klassenfähigkeiten und Helden-Geschosse (Thread A).
// Daten (Name, Kosten, Abklingzeit, Schadensfaktor) stehen in classes.js.
//
// Eine Fähigkeit: { anim, duration, start(hero, world, angle, def), update?(hero, world, dt, t, def) }
// Während duration steht der Held im Zustand 'skill'. Schaden läuft über
// world.combat (Trefferzonen) – so bekommen Feedback, Beute und XP dieselben
// "hit"/"enemy:killed"-Events wie beim Grundangriff.

const TILE = 16;

// Trefferzone des Helden (Fähigkeiten und Geschosse)
export function heroHitbox(hero, world, h) {
  world.combat.add({ owner: hero, team: 'hero', canCrit: true, critChance: hero.stats.critChance, ...h });
}

// ---------------------------------------------------------------------------
// Helden-Geschoss: Pfeil, Glutbolzen, Wurfdolch. Prüft selbst die Berührung
// und legt beim Treffer eine kurze Trefferzone genau auf den Gegner.
const PROJECTILES = {
  arrow: { radius: 3, life: 1.1, light: null },
  dagger: { radius: 3, life: 0.5, light: null },
  bolt: { radius: 4, life: 1.2, light: { radius: 34, color: [255, 150, 60] } },
  fireball: { radius: 6, life: 1.4, light: { radius: 56, color: [255, 130, 40] } },
};

export class HeroProjectile extends Entity {
  // pierce: true = unbegrenzt, Zahl = so viele zusätzliche Gegner; explode: { r, damage, knockback } beim Aufprall
  constructor(hero, kind, x, y, angle, { speed, damage, knockback = 80, pierce = false, heavy = false, range = null, explode = null }) {
    super(x, y);
    this.hero = hero; this.owner = hero; this.team = 'hero';
    this.kind = kind; this.def = PROJECTILES[kind];
    this.angle = angle;
    this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    this.z = 9;
    this.damage = damage; this.knockback = knockback; this.pierce = pierce; this.heavy = heavy;
    this.explode = explode;
    this.fiery = kind === 'bolt' || kind === 'fireball';
    this.life = range ? range / speed : this.def.life;
    this.hitIds = new Set();
    this.trail = 0;
    this.light = null;
  }

  get sortY() { return this.y; }

  update(dt, world) {
    if (!this.light && this.def.light) {
      this.light = world.addLight(new Light({ follow: this, offsetY: -this.z, radius: this.def.light.radius, color: this.def.light.color, intensity: 0.9, flicker: 0.2, bloom: 0.5 }));
    }
    this.life -= dt;
    if (this.life <= 0) { this.#fizzle(world); return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.dungeon.isWall(Math.floor(nx / TILE), Math.floor((ny - this.z * 0.5) / TILE))) { this.#fizzle(world, true); return; }
    this.x = nx; this.y = ny;

    // Spur
    this.trail -= dt;
    if (this.trail <= 0) {
      this.trail = 0.016;
      const p = world.particles;
      if (this.fiery) {
        const big = this.kind === 'fireball';
        p.spawn({ x: this.x, y: this.y - this.z, vx: -this.vx * 0.1, vy: -this.vy * 0.1, rise: 8, life: big ? 0.45 : 0.3, colors: ['#fff0b0', '#ffb640', '#f07a1c', '#7a2208'], emissive: true, size: big ? 3 : 2, shrink: true });
      } else if (this.heavy) {
        p.spawn({ x: this.x, y: this.y - this.z, life: 0.2, colors: ['#e0ffd0', '#8ee07a', '#3a7a34'], emissive: true });
      }
    }

    for (const e of world.enemies) {
      if (e.dead || e.rise < 1 || this.hitIds.has(e.id)) continue;
      if (Math.hypot(e.x - this.x, e.centerY - (this.y - this.z * 0.4)) > e.hurtRadius + this.def.radius) continue;
      this.hitIds.add(e.id);
      heroHitbox(this.hero, world, {
        owner: this, shape: 'circle', x: e.x, y: e.centerY, r: 1, ttl: 0.02,
        damage: this.damage, knockback: this.knockback, heavy: this.heavy,
      });
      if (this.explode) { this.#explode(world); this.removed = true; return; }
      if (this.fiery) this.#burst(world);
      if (typeof this.pierce === 'number' && this.pierce > 0) { this.pierce--; continue; }
      if (!this.pierce) { this.removed = true; return; }
    }
  }

  #burst(world) {
    world.particles.ring(this.x, this.y - this.z, 3, 12, ['#fff0b0', '#ffb640', '#f07a1c'], 70);
    world.addLight(new Light({ x: this.x, y: this.y - this.z, radius: 46, color: [255, 160, 70], intensity: 1, ttl: 0.18, bloom: 0.6 }));
  }

  // Explosion: Trefferzone um den Aufschlagpunkt (der direkt getroffene Gegner ist ausgenommen)
  #explode(world) {
    const x = this.x, y = this.y - this.z * 0.4, ex = this.explode;
    const zone = { owner: this, shape: 'circle', x, y, r: ex.r, ttl: 0.05, damage: ex.damage, knockback: ex.knockback ?? 140, heavy: !!ex.heavy };
    heroHitbox(this.hero, world, zone);
    const hb = world.combat.hitboxes[world.combat.hitboxes.length - 1];
    for (const e of world.enemies) if (this.hitIds.has(e.id) && ex.skipDirect) hb.hitSet.add(e);
    world.bus.emit('spellImpact', { x, y, element: 'fire', radius: ex.r, big: ex.r >= 24 });
    if (ex.r >= 24) { world.decals.scorch?.(x, this.y + 1, Math.round(ex.r * 0.4)); world.session.camera?.shake?.(2.5); }
    else this.#burst(world);
  }

  #fizzle(world, wall = false) {
    this.removed = true;
    if (this.explode) { this.#explode(world); return; }
    if (this.fiery) this.#burst(world);
    else if (wall) world.particles.dust(this.x, this.y - this.z, 3);
  }

  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = 'rgba(4,2,8,0.4)';
    ctx.fillRect(x - 2, y, 4, 1);
    if (this.fiery) return; // leuchtet nur im Emissive-Pass
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const len = this.kind === 'arrow' ? 8 : 4;
    const yy = y - this.z;
    for (let i = 0; i <= len; i++) {
      const px = Math.round(x - c * i), py = Math.round(yy - s * i);
      ctx.fillStyle = i < 2 ? PAL.steel[5] : this.kind === 'arrow' ? (i > len - 2 ? '#e8e0d0' : '#7e5432') : PAL.steel[3];
      ctx.fillRect(px, py, 1, 1);
    }
  }

  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - this.z - cy);
    if (this.kind === 'fireball') {
      ctx.fillStyle = 'rgba(240,122,28,0.4)'; ctx.fillRect(x - 5, y - 3, 10, 7); ctx.fillRect(x - 3, y - 5, 7, 11);
      ctx.fillStyle = '#f07a1c'; ctx.fillRect(x - 3, y - 2, 7, 5); ctx.fillRect(x - 2, y - 3, 5, 7);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(x - 2, y - 1, 4, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
      ctx.fillStyle = '#fff0b0'; ctx.fillRect(x - 1, y - 1, 2, 2);
      return;
    }
    if (this.kind === 'bolt') {
      ctx.fillStyle = 'rgba(240,122,28,0.45)'; ctx.fillRect(x - 3, y - 2, 6, 5); ctx.fillRect(x - 2, y - 3, 5, 7);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(x - 2, y - 1, 4, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
      ctx.fillStyle = '#fff0b0'; ctx.fillRect(x - 1, y - 1, 2, 2);
      return;
    }
    // Glanz an der Spitze, damit Pfeile und Dolche im Dunkeln lesbar bleiben
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    ctx.fillStyle = this.heavy ? 'rgba(160,255,140,0.55)' : 'rgba(255,240,210,0.35)';
    for (let i = 1; i <= (this.heavy ? 6 : 3); i++) ctx.fillRect(Math.round(x - c * i * 2), Math.round(y - s * i * 2), 1, 1);
    ctx.fillStyle = this.heavy ? '#d8ffc8' : '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  }
}

export function fireProjectile(hero, world, kind, angle, opts) {
  const ox = Math.cos(angle) * 8, oy = Math.sin(angle) * 6;
  return world.spawn(new HeroProjectile(hero, kind, hero.x + ox, hero.y + oy, angle, opts));
}

// ---------------------------------------------------------------------------
function fan(n, spread, center) {
  if (n === 1) return [center];
  return Array.from({ length: n }, (_, i) => center - spread / 2 + (spread * i) / (n - 1));
}

// Weg bis zur nächsten Wand (für Sprints und Teleport)
function clearDistance(world, x, y, dx, dy, max) {
  let d = 0;
  while (d + 4 <= max) {
    const nx = x + dx * (d + 4), ny = y + dy * (d + 4);
    const r = 5;
    if (world.dungeon.isWall(Math.floor((nx - r) / TILE), Math.floor(ny / TILE)) || world.dungeon.isWall(Math.floor((nx + r) / TILE), Math.floor(ny / TILE))
      || world.dungeon.isWall(Math.floor(nx / TILE), Math.floor((ny - 3) / TILE)) || world.dungeon.isWall(Math.floor(nx / TILE), Math.floor((ny + 3) / TILE))) break;
    d += 4;
  }
  return d;
}

// Nächster Gegner in Zielrichtung (Kegel), sonst null
function findTarget(h, w, ang, range, cone = 0.8) {
  let best = null, bestScore = Infinity;
  for (const e of w.enemies) {
    if (e.dead || e.rise < 1) continue;
    const dx = e.x - h.x, dy = e.centerY - (h.y - 8), d = Math.hypot(dx, dy);
    if (d > range) continue;
    let da = Math.abs(Math.atan2(dy, dx) - ang) % (Math.PI * 2);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > cone) continue;
    const score = d + da * 40;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Zielpunkt für Flächenzauber: Gegner in Zielrichtung oder ein Stück voraus
function targetPoint(h, w, ang, range, fallback) {
  const t = findTarget(h, w, ang, range, 0.7);
  if (t) return { x: t.x, y: t.y };
  const d = clearDistance(w, h.x, h.y, Math.cos(ang), Math.sin(ang), fallback);
  return { x: h.x + Math.cos(ang) * d, y: h.y + Math.sin(ang) * d };
}

// Trefferzone, die sich die Trefferliste mit anderen teilt (mehrere Wellen treffen jeden Gegner nur einmal)
function sharedHitbox(h, w, zone, shared) {
  heroHitbox(h, w, zone);
  const hb = w.combat.hitboxes[w.combat.hitboxes.length - 1];
  if (shared) hb.hitSet = shared;
  return hb;
}

// Verzögerte Aktion als Weltobjekt (endet mit der Welt, z. B. beim Zonenwechsel)
class Delay extends Entity {
  constructor(t, fn) { super(0, 0); this.t = t; this.fn = fn; }
  update(dt, world) { this.t -= dt; if (this.t <= 0) { this.removed = true; this.fn(world); } }
}
const after = (w, t, fn) => w.spawn(new Delay(t, fn));

// --- Gift (Giftklingen): 4 Giftschläge über 2 s, ohne den Gegner zu unterbrechen
class Poison extends Entity {
  constructor(hero, target, damage) { super(target.x, target.y); this.hero = hero; this.target = target; this.damage = damage; this.ticks = 4; this.t = 0.5; }
  refresh(damage) { this.ticks = 4; this.damage = Math.max(this.damage, damage); }
  update(dt, w) {
    const e = this.target;
    if (e.dead || e.removed) { this.removed = true; return; }
    this.x = e.x; this.y = e.y + 1;
    if (Math.random() < dt * 14) w.particles.spawn({ x: e.x + (Math.random() - 0.5) * 8, y: e.centerY, rise: 14, life: 0.5, colors: ['#b8f090', '#56b850', '#2a7a34'], emissive: true, size: 1 });
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const dmg = Math.max(1, Math.round(this.damage * (0.9 + Math.random() * 0.2)));
    if (e.hp - dmg > 0) {
      e.hp -= dmg; e.flash = 0.05; e.hpBarTimer = 2.5;
      w.bus.emit('hit', { attacker: this.hero, target: e, damage: dmg, crit: false, heavy: false, dot: true, dirX: 0, dirY: 0, x: e.x, y: e.centerY - 2, killed: false, element: 'poison' });
    } else {
      // tödlich: normaler Treffer, damit Tod, Beute und XP wie gewohnt laufen
      const hit = { damage: dmg, crit: false, heavy: false, dirX: 0, dirY: 0, knockback: 0, source: this.hero };
      if (e.takeHit(hit)) w.bus.emit('hit', { attacker: this.hero, target: e, damage: hit.damage, crit: false, heavy: false, dot: true, dirX: 0, dirY: 0, x: e.x, y: e.centerY - 2, killed: e.dead, element: 'poison' });
    }
    if (--this.ticks <= 0) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const e = this.target;
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#56b850';
    ctx.fillRect(Math.round(e.x - cx) - 1, Math.round(e.y - cy - e.bodyHeight - 5), 3, 2);
    ctx.globalAlpha = 1;
  }
}
const poisons = new WeakMap();
export function applyPoison(hero, w, target) {
  const def = hero.abilities.find((a) => a.id === 'poison_blades')?.def;
  if (!def) return;
  const damage = hero.damageFor(def.mult, def.id);
  const cur = poisons.get(target);
  if (cur && !cur.removed) { cur.refresh(damage); return; }
  poisons.set(target, w.spawn(new Poison(hero, target, damage)));
}

// --- Sprengfalle
class FireTrap extends Entity {
  constructor(hero, x, y, damage) { super(x, y); this.hero = hero; this.damage = damage; this.arm = 0.35; this.life = 8; this.t = 0; this.sortOffset = -20; }
  update(dt, w) {
    this.t += dt; this.arm -= dt; this.life -= dt;
    if (this.arm > 0) return;
    const near = w.enemies.some((e) => !e.dead && e.rise >= 1 && Math.hypot(e.x - this.x, e.y - this.y) < 15);
    if (near || this.life <= 0) this.#boom(w);
  }
  #boom(w) {
    this.removed = true;
    heroHitbox(this.hero, w, { owner: this.hero, shape: 'circle', x: this.x, y: this.y - 4, r: 30, ttl: 0.06, damage: this.damage, knockback: 240, heavy: true });
    w.bus.emit('spellImpact', { x: this.x, y: this.y - 4, element: 'fire', radius: 30, big: true });
    w.particles.embers(this.x, this.y, 10);
    w.decals.scorch?.(this.x, this.y + 1, 12);
    w.addLight(new Light({ x: this.x, y: this.y - 6, radius: 90, color: [255, 140, 50], intensity: 1.2, ttl: 0.4, bloom: 0.6 }));
    w.session.camera?.shake?.(3);
  }
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 4, y - 1, 9, 3);
    ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x - 3, y - 2, 7, 1);
    ctx.fillStyle = '#69738a'; ctx.fillRect(x - 4, y - 1, 1, 1); ctx.fillRect(x + 4, y - 1, 1, 1);
  }
  renderEmissive(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const on = this.arm > 0 || Math.floor(this.t * (this.life < 2 ? 8 : 3)) % 2 === 0;
    ctx.fillStyle = on ? '#ffb640' : '#7a2208'; ctx.fillRect(x, y - 1, 1, 1);
    if (on) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#f07a1c'; ctx.fillRect(x - 2, y - 2, 5, 3); ctx.globalAlpha = 1; }
  }
}

// --- Pfeilhagel: Pfeile fallen verteilt auf ein Zielgebiet
class ArrowRain extends Entity {
  constructor(hero, x, y, damage) { super(x, y); this.hero = hero; this.damage = damage; this.t = 0; this.spawnT = 0; this.left = 14; this.arrows = []; this.sortOffset = -30; }
  update(dt, w) {
    this.t += dt; this.spawnT -= dt;
    if (this.left > 0 && this.spawnT <= 0 && this.t > 0.15) {
      this.spawnT = 0.1; this.left--;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 26;
      this.arrows.push({ x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r * 0.7, fall: 0.2 });
    }
    for (const ar of this.arrows) {
      ar.fall -= dt;
      if (ar.fall <= 0 && !ar.hit) {
        ar.hit = true; ar.stuck = 0.8;
        heroHitbox(this.hero, w, { owner: this.hero, shape: 'circle', x: ar.x, y: ar.y - 4, r: 9, ttl: 0.04, damage: this.damage, knockback: 60 });
        w.particles.dust(ar.x, ar.y, 2);
      }
      if (ar.hit) ar.stuck -= dt;
    }
    this.arrows = this.arrows.filter((ar) => !ar.hit || ar.stuck > 0);
    if (this.left <= 0 && this.arrows.length === 0) this.removed = true;
  }
  render(ctx, cx, cy) {
    for (const ar of this.arrows) {
      const x = Math.round(ar.x - cx), y = Math.round(ar.y - cy);
      const lift = ar.hit ? 0 : Math.round(ar.fall * 260);
      ctx.fillStyle = '#7e5432'; ctx.fillRect(x, y - lift - 7, 1, 6);
      ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x, y - lift - 8, 1, 2);
      if (!ar.hit) { ctx.fillStyle = '#dfe7f2'; ctx.fillRect(x, y - lift - 1, 1, 1); }
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (this.left <= 0) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.globalAlpha = 0.18; ctx.strokeStyle = '#d8ffc8';
    ctx.beginPath(); ctx.ellipse(x, y, 27, 19, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

// --- Meteor: Warnkreis, fallender Brocken, Einschlag
class Meteor extends Entity {
  constructor(hero, x, y, damage) { super(x, y); this.hero = hero; this.damage = damage; this.t = 0; this.delay = 0.85; this.sortOffset = 40; }
  update(dt, w) {
    this.t += dt;
    if (this.t >= this.delay) {
      this.removed = true;
      heroHitbox(this.hero, w, { owner: this.hero, shape: 'circle', x: this.x, y: this.y - 4, r: 40, ttl: 0.06, damage: this.damage, knockback: 320, heavy: true });
      w.bus.emit('spellImpact', { x: this.x, y: this.y - 4, element: 'fire', radius: 40, big: true });
      w.particles.ring(this.x, this.y - 2, 8, 40, ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c'], 190);
      w.particles.embers(this.x, this.y, 16);
      w.decals.scorch?.(this.x, this.y + 1, 18);
      w.addLight(new Light({ x: this.x, y: this.y - 8, radius: 140, color: [255, 130, 40], intensity: 1.4, ttl: 0.55, bloom: 0.8 }));
      w.lighting.ambientBoost = 0.35;
      w.session.camera?.shake?.(6);
      w.session.hitstop?.(0.06);
    }
  }
  render(ctx, cx, cy) {
    const k = this.t / this.delay;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.globalAlpha = 0.25 + k * 0.35; ctx.fillStyle = 'rgba(4,2,8,0.6)';
    ctx.beginPath(); ctx.ellipse(x, y, 6 + k * 12, 3 + k * 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  renderEmissive(ctx, cx, cy) {
    const k = this.t / this.delay;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.globalAlpha = 0.35; ctx.strokeStyle = '#f07a1c';
    ctx.beginPath(); ctx.ellipse(x, y, 40, 28, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 40 * k, 28 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // Brocken fällt schräg von oben
    const fx = x - Math.round((1 - k) * 60), fy = y - Math.round((1 - k) * 170);
    ctx.fillStyle = 'rgba(240,122,28,0.4)'; ctx.fillRect(fx - 6, fy - 6, 13, 13);
    ctx.fillStyle = '#c8420c'; ctx.fillRect(fx - 4, fy - 4, 9, 9);
    ctx.fillStyle = '#ffb640'; ctx.fillRect(fx - 3, fy - 3, 6, 6);
    ctx.fillStyle = '#fff0b0'; ctx.fillRect(fx - 1, fy - 2, 3, 3);
    for (let i = 1; i < 6; i++) { ctx.globalAlpha = 0.5 - i * 0.08; ctx.fillStyle = '#f07a1c'; ctx.fillRect(fx - i * 3, fy - i * 8, 3, 3); }
    ctx.globalAlpha = 1;
  }
}

export const ABILITY_IMPL = {
  // --- Krieger
  whirlwind: {
    anim: 'spin', duration: 0.5,
    start(h, w, ang, def) {
      heroHitbox(h, w, { shape: 'circle', x: h.x, y: h.y - 8, follow: true, offX: 0, offY: -8, r: 30, ttl: 0.4, damage: h.damageFor(def.mult, def.id), knockback: 180, heavy: true });
      w.addEffect(new SlashEffect(h, ang, SLASH_STYLES.heroHeavy, false, 0.25));
      w.addEffect(new SlashEffect(h, ang + Math.PI, SLASH_STYLES.heroHeavy, true, 0.3));
      w.bus.emit('swing', { actor: h, heavy: true, angle: ang });
    },
    update(h, w, dt, t) {
      h.vx *= 0.9; h.vy *= 0.9;
      h.facing = Math.floor(t * 14) % 2 === 0 ? 1 : -1;
      if (t > 0.2 && !h.skillState.second) {
        h.skillState.second = true;
        w.addEffect(new SlashEffect(h, h.aimAngle + Math.PI / 2, SLASH_STYLES.heroHeavy, false, 0.25));
        w.bus.emit('swing', { actor: h, heavy: true, angle: h.aimAngle });
      }
    },
  },
  battle_shout: {
    anim: 'cast', duration: 0.4,
    start(h, w) {
      h.gainResource(40);
      h.buff('guard', 5, { damageTaken: 0.6 });
      w.particles.ring(h.x, h.y - 10, 6, 24, ['#fff0b0', '#ffb640', '#d83a2a'], 110);
      w.addLight(new Light({ x: h.x, y: h.y - 10, radius: 80, color: [255, 120, 60], intensity: 1, ttl: 0.4, bloom: 0.5 }));
      w.lighting.ambientBoost = 0.2;
      w.session.hitstop?.(0.04);
      w.bus.emit('swing', { actor: h, heavy: true, angle: 0 });
      w.bus.emit(EV.UI_TOAST, { text: 'Kriegsschrei: 40 % weniger Schaden', kind: 'info' });
    },
  },

  // --- Schurke
  shadow_step: {
    anim: 'roll', duration: 0.22,
    start(h, w, ang, def) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      h.skillState.dir = { x: dx, y: dy };
      h.skillState.dist = clearDistance(w, h.x, h.y, dx, dy, 78);
      h.invuln = 0.3;
      if (Math.abs(dx) > 0.1) h.facing = Math.sign(dx);
      heroHitbox(h, w, { shape: 'circle', x: h.x, y: h.y - 8, follow: true, offX: 0, offY: -8, r: 13, ttl: 0.22, damage: h.damageFor(def.mult, def.id), knockback: 60 });
      w.bus.emit('roll', { actor: h });
    },
    update(h, w, dt, t) {
      const s = h.skillState;
      const sp = s.dist / 0.22;
      h.vx = s.dir.x * sp; h.vy = s.dir.y * sp;
      s.ghost = (s.ghost ?? 0) - dt;
      if (s.ghost <= 0) {
        s.ghost = 0.03;
        w.addEffect(new Afterimage(h.currentFrame(), h.x, h.y, h.facing < 0));
        w.particles.spawn({ x: h.x, y: h.y - 6, rise: 10, life: 0.4, colors: ['#645088', '#34264a', '#140e1c'], size: 2, shrink: true, alpha: 0.8 });
      }
      if (t + dt >= 0.22) { h.vx *= 0.25; h.vy *= 0.25; }
    },
  },
  fan_of_knives: {
    anim: 'spin', duration: 0.28,
    start(h, w, ang, def) {
      for (const a of fan(7, 1.5, ang)) fireProjectile(h, w, 'dagger', a, { speed: 250, damage: h.damageFor(def.mult, def.id), knockback: 60, range: 120 });
      w.bus.emit('swing', { actor: h, heavy: false, angle: ang });
    },
  },

  // --- Waldläufer
  volley: {
    anim: 'atk1', duration: 0.32,
    start(h, w, ang, def) {
      for (const a of fan(5, 0.55, ang)) fireProjectile(h, w, 'arrow', a, { speed: 270, damage: h.damageFor(def.mult, def.id), knockback: 70, range: 200 });
      w.bus.emit('shoot', { actor: h });
    },
    update(h, w, dt, t) {
      h.vx *= 0.85; h.vy *= 0.85;
      if (t < 0.06) h.setPhaseFrame('active', 0);
      else h.setPhaseFrame('recover', (t - 0.06) / 0.26);
    },
  },
  piercing_shot: {
    anim: 'atk1', duration: 0.55,
    start(h, w) {
      w.particles.magic(h.x + h.facing * 8, h.y - 12, 8, 5);
    },
    update(h, w, dt, t, def) {
      h.vx *= 0.8; h.vy *= 0.8;
      // lange gespannt, dann los
      if (t < 0.3) h.setPhaseFrame('windup', t / 0.12);
      else if (t < 0.36) h.setPhaseFrame('active', 0);
      else h.setPhaseFrame('recover', (t - 0.36) / 0.19);
      if (t >= 0.3 && !h.skillState.fired) {
        h.skillState.fired = true;
        fireProjectile(h, w, 'arrow', h.aimAngle, { speed: 420, damage: h.damageFor(def.mult, def.id), knockback: 220, pierce: true, heavy: true, range: 260 });
        w.bus.emit('shoot', { actor: h });
        w.session.camera?.kick?.(-Math.cos(h.aimAngle) * 2, -Math.sin(h.aimAngle) * 2);
      }
    },
  },

  // --- Glutmagier
  flame_nova: {
    anim: 'cast', duration: 0.4,
    start(h, w, ang, def) {
      heroHitbox(h, w, { shape: 'circle', x: h.x, y: h.y - 6, r: 38, ttl: 0.12, damage: h.damageFor(def.mult, def.id), knockback: 260, heavy: true });
      const P = w.particles;
      P.ring(h.x, h.y - 4, 6, 36, ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c'], 170);
      P.ring(h.x, h.y - 4, 4, 22, ['#ffb640', '#c8420c', '#7a2208'], 100);
      P.embers(h.x, h.y, 10);
      w.decals.scorch?.(h.x, h.y + 1, 14);
      w.addLight(new Light({ x: h.x, y: h.y - 8, radius: 110, color: [255, 140, 50], intensity: 1.2, ttl: 0.45, bloom: 0.7 }));
      w.lighting.ambientBoost = 0.3;
      w.session.camera?.shake?.(4);
      w.bus.emit('swing', { actor: h, heavy: true, angle: ang });
    },
  },
  blink: {
    anim: 'cast', duration: 0.16,
    start(h, w, ang) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const d = clearDistance(w, h.x, h.y, dx, dy, 72);
      w.particles.magic(h.x, h.y - 8, 16, 8);
      w.addEffect(new Afterimage(h.currentFrame(), h.x, h.y, h.facing < 0));
      h.x += dx * d; h.y += dy * d;
      h.vx = h.vy = 0; h.kbx = h.kby = 0;
      h.invuln = Math.max(h.invuln, 0.3);
      if (Math.abs(dx) > 0.1) h.facing = Math.sign(dx);
      w.particles.magic(h.x, h.y - 8, 20, 10);
      w.addLight(new Light({ x: h.x, y: h.y - 8, radius: 50, color: [190, 130, 255], intensity: 1, ttl: 0.3, bloom: 0.6 }));
      w.bus.emit('roll', { actor: h });
    },
  },

  // --- Ab Stufe 4 / 12
  charge: {
    anim: 'dash', duration: 0.34,
    start(h, w, ang, def) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      h.skillState.dir = { x: dx, y: dy };
      h.skillState.dist = clearDistance(w, h.x, h.y, dx, dy, 86);
      if (Math.abs(dx) > 0.1) h.facing = Math.sign(dx);
      h.invuln = Math.max(h.invuln, 0.18);
      h.gainResource(20);
      heroHitbox(h, w, { shape: 'circle', x: h.x, y: h.y - 8, follow: true, offX: dx * 6, offY: -8 + dy * 4, r: 14, ttl: 0.3, damage: h.damageFor(def.mult, def.id), knockback: 260, heavy: true });
      w.bus.emit('cast', { actor: h, element: 'physical' });
      w.bus.emit('swing', { actor: h, heavy: true, angle: ang });
    },
    update(h, w, dt, t) {
      const s = h.skillState;
      if (t < 0.28) {
        const sp = s.dist / 0.28;
        h.vx = s.dir.x * sp; h.vy = s.dir.y * sp;
        s.ghost = (s.ghost ?? 0) - dt;
        if (s.ghost <= 0) { s.ghost = 0.04; w.addEffect(new Afterimage(h.currentFrame(), h.x, h.y, h.facing < 0)); w.particles.dust(h.x, h.y, 2); }
      } else { h.vx *= 0.6; h.vy *= 0.6; }
    },
  },
  earthshatter: {
    anim: 'slam', duration: 0.62,
    start(h, w, ang) { h.vx *= 0.2; h.vy *= 0.2; w.bus.emit('cast', { actor: h, element: 'fire' }); },
    update(h, w, dt, t, def) {
      h.vx *= 0.8; h.vy *= 0.8;
      if (t < 0.22) h.setPhaseFrame('windup', t / 0.22);
      else if (t < 0.32) h.setPhaseFrame('active', (t - 0.22) / 0.1);
      else h.setPhaseFrame('recover', (t - 0.32) / 0.3);
      const s = h.skillState;
      if (t >= 0.22 && !s.done) {
        s.done = true;
        const shared = new Set();
        const dx = Math.cos(h.aimAngle), dy = Math.sin(h.aimAngle);
        const reach = clearDistance(w, h.x, h.y, dx, dy, 70);
        const dmg = h.damageFor(def.mult, def.id);
        [14, 34, 54].forEach((d, i) => after(w, i * 0.08, (ww) => {
          if (d > reach + 8) return;
          const x = h.x + dx * d, y = h.y + dy * d;
          sharedHitbox(h, ww, { shape: 'circle', x, y: y - 4, r: 17, ttl: 0.08, damage: dmg, knockback: 280, heavy: true }, shared);
          ww.bus.emit('spellImpact', { x, y: y - 2, element: 'fire', radius: 16, big: i === 2 });
          ww.particles.dust(x, y, 6, '#5a4838');
          ww.decals.scorch?.(x, y + 1, 7);
          ww.session.camera?.shake?.(2 + i);
        }));
        w.bus.emit('swing', { actor: h, heavy: true, angle: h.aimAngle });
      }
    },
  },
  poison_blades: {
    anim: 'coat', duration: 0.32,
    start(h, w) {
      h.buff('poison', 8, {});
      w.bus.emit('aura', { actor: h, element: 'poison' });
      w.particles.element?.(h.x, h.y - 10, 'poison', 12, 8);
    },
  },
  assassinate: {
    anim: 'lunge', duration: 0.46,
    start(h, w, ang, def) {
      const t = findTarget(h, w, ang, 120, 0.9);
      const ox = h.x, oy = h.y;
      w.addEffect(new Afterimage(h.currentFrame(), h.x, h.y, h.facing < 0));
      w.particles.magic(h.x, h.y - 8, 10, 6);
      if (t) {
        // hinter den Gegner, sofern dort Platz ist
        const dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        const behind = Math.min(clearDistance(w, h.x, h.y, ux, uy, d + 14), d + 14);
        h.x += ux * behind; h.y += uy * behind;
        h.facing = t.x < h.x ? -1 : 1;
        h.aimAngle = Math.atan2(t.centerY - (h.y - 8), t.x - h.x);
      } else {
        const d = clearDistance(w, h.x, h.y, Math.cos(ang), Math.sin(ang), 60);
        h.x += Math.cos(ang) * d; h.y += Math.sin(ang) * d;
      }
      h.vx = h.vy = 0; h.kbx = h.kby = 0;
      h.invuln = Math.max(h.invuln, 0.3);
      h.skillState.from = { x: ox, y: oy };
      w.bus.emit('spellImpact', { x: h.x, y: h.y - 8, element: 'shadow', radius: 10 });
    },
    update(h, w, dt, t, def) {
      h.vx *= 0.7; h.vy *= 0.7;
      if (t < 0.12) h.setPhaseFrame('windup', t / 0.12);
      else if (t < 0.2) h.setPhaseFrame('active', (t - 0.12) / 0.08);
      else h.setPhaseFrame('recover', (t - 0.2) / 0.26);
      const s = h.skillState;
      if (t >= 0.12 && !s.done) {
        s.done = true;
        const dx = Math.cos(h.aimAngle), dy = Math.sin(h.aimAngle);
        heroHitbox(h, w, { shape: 'arc', x: h.x + dx * 4, y: h.y - 8 + dy * 4, r: 26, angle: h.aimAngle, arc: 2.2, ttl: 0.08,
          damage: h.damageFor(def.mult, def.id), knockback: 200, heavy: true, critChance: Math.min(0.95, h.stats.critChance + 0.5) });
        w.addEffect(new SlashEffect(h, h.aimAngle, SLASH_STYLES.heroHeavy, false, 0.2));
        w.bus.emit('swing', { actor: h, heavy: true, angle: h.aimAngle });
      }
    },
  },
  fire_trap: {
    anim: 'plant', duration: 0.32,
    start(h, w, ang, def) {
      w.spawn(new FireTrap(h, h.x, h.y + 2, h.damageFor(def.mult, def.id)));
      w.bus.emit('cast', { actor: h, element: 'fire' });
    },
  },
  arrow_rain: {
    anim: 'rainshot', duration: 0.4,
    start(h, w, ang) {
      h.vx *= 0.3; h.vy *= 0.3;
      h.skillState.p = targetPoint(h, w, ang, 170, 90);
      w.bus.emit('cast', { actor: h, element: 'nature' });
    },
    update(h, w, dt, t, def) {
      h.vx *= 0.8; h.vy *= 0.8;
      if (t < 0.16) h.setPhaseFrame('windup', t / 0.16);
      else if (t < 0.22) h.setPhaseFrame('active', 0);
      else h.setPhaseFrame('recover', (t - 0.22) / 0.18);
      const s = h.skillState;
      if (t >= 0.16 && !s.fired) {
        // Salve steil nach oben lösen, der Hagel fällt am Zielpunkt
        s.fired = true;
        w.spawn(new ArrowRain(h, s.p.x, s.p.y, h.damageFor(def.mult, def.id)));
        w.bus.emit('shoot', { actor: h });
        w.particles.dust?.(h.x, h.y, 3);
      }
    },
  },
  fireball: {
    anim: 'hurl', duration: 0.42,
    start(h, w) { h.vx *= 0.3; h.vy *= 0.3; w.bus.emit('cast', { actor: h, element: 'fire' }); },
    update(h, w, dt, t, def) {
      h.vx *= 0.85; h.vy *= 0.85;
      if (t < 0.16) h.setPhaseFrame('windup', t / 0.16);
      else if (t < 0.22) h.setPhaseFrame('active', (t - 0.16) / 0.06);
      else h.setPhaseFrame('recover', (t - 0.22) / 0.2);
      if (t >= 0.16 && !h.skillState.fired) {
        h.skillState.fired = true;
        const dmg = h.damageFor(def.mult, def.id);
        fireProjectile(h, w, 'fireball', h.aimAngle, { speed: 190, damage: dmg, knockback: 160, range: 210, heavy: true, explode: { r: 26, damage: dmg, knockback: 200, heavy: true, skipDirect: true } });
        w.bus.emit('swing', { actor: h, heavy: true, angle: h.aimAngle });
      }
    },
  },
  meteor: {
    anim: 'summon', duration: 0.5,
    update(h, w, dt, t) {
      h.vx *= 0.8; h.vy *= 0.8;
      if (t < 0.26) h.setPhaseFrame('windup', t / 0.26);
      else if (t < 0.34) h.setPhaseFrame('active', 0);
      else h.setPhaseFrame('recover', (t - 0.34) / 0.16);
      if (t >= 0.26 && !h.skillState.shook) { h.skillState.shook = true; w.session.camera?.shake?.(1.5); }
    },
    start(h, w, ang, def) {
      const p = targetPoint(h, w, ang, 170, 100);
      w.spawn(new Meteor(h, p.x, p.y, h.damageFor(def.mult, def.id)));
      w.bus.emit('cast', { actor: h, element: 'fire' });
      w.addLight(new Light({ x: h.x, y: h.y - 14, radius: 50, color: [255, 140, 50], intensity: 0.9, ttl: 0.4, bloom: 0.5 }));
    },
  },
};
