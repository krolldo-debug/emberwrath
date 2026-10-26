import { Boss } from './Boss.js';
import { Entity } from './Entity.js';
import { Telegraph, DamageWave } from './Telegraph.js';
import { HazardCloud } from './Hazards.js';
import { Light } from '../gfx/Lighting.js';
import { makeCanvas } from '../gfx/PixelCanvas.js';
import { rand } from '../core/math.js';

// Bosse der Sternenscherben (Erweiterung „Sternenglut“, Teil 1). Alle drei stehen auf Varkhuls Rig
// (sprites/star_bosses.js) und erben aus Boss.js Bewegung, Hieb, Beben, Speere, Beschwörung (def.summon) und den
// Ansturm ab Phase 3. Dazu kommen je zwei eigene Angriffe, jeder mit Bodenwarnung:
//   Ysgarn   Ranken     Wurzeln brechen an markierten Stellen aus dem Boden und halten fest
//            Blütenstaub ab Phase 2: Leerenblüten-Wolken bleiben eine Weile im Raum liegen
//   Kaldris  Splitterregen  Sternsplitter fallen zeitversetzt auf markierte Kreise um den Helden
//            Spiegelbilder  ab Phase 2: gläserne Abbilder erscheinen und stoßen über eine markierte Bahn
//   Ysmeine  Sternbild      Sterne um den Helden, ihre Verbindungslinien brennen nach kurzer Warnung
//            Lichtbrücke    ab Phase 2: der ganze Saal wird zur Gefahr, nur auf der goldenen Brücke ist man sicher
// Schaden: Grundwerte in Varkhul-Einheiten, def.dmgMult (defs_stars.js) skaliert alles, was der Boss verursacht.

// Treffer am Helden mit dem Boss als Urheber (bossFury.js skaliert über source)
function hurtHero(world, owner, damage, x, y, knockback = 120, heavy = true) {
  const h = world.hero;
  if (h.dead) return false;
  const dx = h.x - x, dy = h.y - y, l = Math.hypot(dx, dy) || 1;
  const hit = { damage: Math.round(damage * rand(0.92, 1.08)), dirX: dx / l, dirY: dy / l, knockback, source: owner };
  if (!h.takeHit(hit)) return false;
  world.bus.emit('hit', { attacker: owner, target: h, damage: hit.damage, crit: false, heavy, dirX: hit.dirX, dirY: hit.dirY, x: h.x, y: h.centerY, killed: h.dead });
  return true;
}

// Abstand eines Punkts zur Strecke (Bildraum)
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// Ruft fn nach `delay` s auf, solange der Boss lebt
class Later extends Entity {
  constructor(owner, delay, fn) { super(owner.x, owner.y); Object.assign(this, { owner, delay, fn }); this.t = 0; }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    if (this.t >= this.delay) { this.removed = true; this.fn(world); }
  }
}
const later = (world, owner, delay, fn) => world.spawn(new Later(owner, delay, fn));

// Freier Punkt nahe (x, y), der im Saal bleibt
function freeNear(world, x, y) { return world.dungeon.nearestFree(x, y); }

// ---------------------------------------------------------------- Ysgarn, der Alte Gärtner (Rankengruft, 44)
const VINE = ['#1a2410', '#2e4a1a', '#4a7a2a', '#7ab048', '#c8f090'];
const BLOOM = [220, 90, 200];

// Ranken um die Füße des Helden, solange er festgehalten wird
class VineSnare extends Entity {
  constructor(target, duration) { super(target.x, target.y); Object.assign(this, { target, duration }); this.t = 0; this.sortOffset = 2; }
  update(dt) {
    this.t += dt; this.x = this.target.x; this.y = this.target.y;
    if (this.t >= this.duration || this.target.dead) this.removed = true;
  }
  render(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy), k = this.t / this.duration;
    const grow = Math.min(1, this.t * 6);
    ctx.save();
    ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, base = x + side * (3 + (i >> 1) * 4), h = Math.round((10 + (i >> 1) * 4) * grow);
      for (let j = 0; j < h; j++) {
        const px = base + Math.round(Math.sin(j * 0.55 + i) * 2) - side * Math.round(j * 0.25);
        ctx.fillStyle = VINE[0]; ctx.fillRect(px + 1, y - j, 1, 1);
        ctx.fillStyle = VINE[j % 4 === 0 ? 4 : j % 2 ? 2 : 3]; ctx.fillRect(px, y - j, 1, 1);
      }
      if (h > 6) { ctx.fillStyle = `rgb(${BLOOM})`; ctx.fillRect(base - side * Math.round(h * 0.25) - 1, y - h, 2, 2); }
    }
    ctx.restore();
  }
}

export class Ysgarn extends Boss {
  constructor(x, y, assets) {
    super(x, y, assets, 'ysgarn');
    this.rootTimer = 3;
    this.pollenTimer = 4;
  }

  phaseText(phase) {
    return phase === 2 ? ['Ysgarn lässt die Gärten blühen', 'Meide den Blütenstaub'] : ['Ysgarn wuchert vor Zorn', 'Die Ranken greifen schneller'];
  }

  update(dt, world) {
    if (this.state === 'chase') { this.rootTimer -= dt; this.pollenTimer -= dt; }
    super.update(dt, world);
  }

  special(world) {
    if (this.phase >= 2 && this.pollenTimer <= 0) {
      this.pollenTimer = rand(14, 17);
      this.beginAttack(world, 'pollenWindup', 'cast', 0.9);
      return true;
    }
    if (this.rootTimer <= 0) {
      this.rootTimer = this.enraged ? rand(6, 8) : rand(9, 11);
      const h = world.hero, n = this.phase === 1 ? 2 : this.phase === 2 ? 4 : 5, dur = this.enraged ? 0.85 : 1.1;
      this.roots = [{ x: h.x, y: h.y }];
      for (let i = 1; i < n; i++) {
        const a = (i / (n - 1)) * Math.PI * 2 + rand(-0.5, 0.5), d = rand(38, 64);
        this.roots.push(freeNear(world, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.6));
      }
      for (const p of this.roots) world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 20, duration: dur, color: [130, 220, 80] }));
      this.beginAttack(world, 'rootsWindup', 'slamWindup', dur);
      return true;
    }
    return false;
  }

  updateSpecial(dt, world) {
    if (this.state === 'rootsWindup') {
      if (Math.random() < dt * 30) for (const p of this.roots) world.particles.dust(p.x + rand(-10, 10), p.y + rand(-5, 5), 1, '#4a3a2a');
      if (this.stateTime >= this.windup) this.#roots(world);
    } else if (this.state === 'pollenWindup') {
      if (Math.random() < dt * 40) world.particles.magic(this.x + rand(-16, 16), this.y - rand(20, 60), 1, 6);
      if (this.stateTime >= this.windup) this.#pollen(world);
    }
  }

  #roots(world) {
    this.endAttack('slam', 0.7);
    const h = world.hero;
    let held = false;
    for (const p of this.roots) {
      world.particles.dust(p.x, p.y, 12, '#3a2e24');
      world.particles.sparks(p.x, p.y - 4, -Math.PI / 2, 6, VINE.slice(2));
      world.decals.scorch(p.x, p.y, 8);
      if (!held && Math.hypot(h.x - p.x, (h.y - p.y) / 0.6) <= 20 && hurtHero(world, this, 16, p.x, p.y, 60)) {
        held = true;
        h.buff?.('rooted', 1.1, { moveSpeed: 0 });
        world.spawn(new VineSnare(h, 1.1));
      }
    }
    world.session.camera?.shake(5);
    world.bus.emit('bossSlam', { x: this.x, y: this.y });
  }

  #pollen(world) {
    this.endAttack(null, 0.5);
    const h = world.hero, n = this.enraged ? 4 : 3;
    const spots = [{ x: h.x, y: h.y }];
    for (let i = 1; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(50, 100);
      spots.push(freeNear(world, this.home.x + Math.cos(a) * d, this.home.y + Math.sin(a) * d * 0.6));
    }
    for (const p of spots) world.spawn(new HazardCloud(p.x, p.y, this, { radius: 30, duration: 8, damage: 4, tick: 0.5, element: 'spore', arm: 0.9 }));
    world.bus.emit('cast', { actor: this, element: 'nature' });
  }
}

// ---------------------------------------------------------------- Kaldris, der Splitterfürst (Gläserne Hallen, 48)
const GLASS = ['#ffffff', '#d8f4ff', '#8ad0ff', '#c070ff'];

// Gläsernes Abbild des Bosses: erscheint, zielt (Warnbahn) und stößt über die Bahn
class MirrorImage extends Entity {
  constructor(boss, x, y, target, delay) {
    super(x, y);
    this.boss = boss; this.from = { x, y }; this.delay = delay;
    const a = Math.atan2(target.y - y, target.x - x);
    this.angle = a; this.len = 150;
    this.to = { x: x + Math.cos(a) * this.len, y: y + Math.sin(a) * this.len };
    this.facing = Math.cos(a) >= 0 ? 1 : -1;
    this.t = 0; this.struck = false; this.sortOffset = 0;
  }
  update(dt, world) {
    this.t += dt;
    if (this.boss.dead) { this.removed = true; return; }
    if (!this.tele && this.t >= 0.3) this.tele = world.spawn(new Telegraph(this.from.x, this.from.y, { shape: 'line', screen: true, angle: this.angle, len: this.len, width: 22, duration: this.delay, color: [140, 200, 255] }));
    const go = 0.3 + this.delay;
    if (this.t >= go && !this.struck) {
      this.struck = true;
      const h = world.hero;
      if (segDist(h.x, h.y, this.from.x, this.from.y, this.to.x, this.to.y) <= 13) hurtHero(world, this.boss, 14, this.from.x, this.from.y, 200);
      for (let i = 0; i < 6; i++) world.particles.sparks(this.from.x + (this.to.x - this.from.x) * i / 5, this.from.y + (this.to.y - this.from.y) * i / 5 - 10, this.angle, 2, GLASS);
      world.addLight(new Light({ x: (this.from.x + this.to.x) / 2, y: (this.from.y + this.to.y) / 2, radius: 90, color: [150, 210, 255], intensity: 0.8, ttl: 0.25, bloom: 0.5 }));
      world.bus.emit('bossCharge', { actor: this.boss });
    }
    if (this.t >= go) {
      const k = Math.min(1, (this.t - go) / 0.16);
      this.x = this.from.x + (this.to.x - this.from.x) * k; this.y = this.from.y + (this.to.y - this.from.y) * k;
    }
    if (this.t >= go + 0.45) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const f = this.boss.animator.frame;
    if (!f?.draw) return;
    const go = 0.3 + this.delay;
    const a = this.t < 0.3 ? this.t / 0.3 : this.t > go + 0.2 ? Math.max(0, 1 - (this.t - go - 0.2) / 0.25) : 1;
    f.draw(ctx, this.x - cx, this.y - cy, { flip: this.facing < 0, flash: true, alpha: 0.42 * a });
  }
}

export class Kaldris extends Boss {
  constructor(x, y, assets) {
    super(x, y, assets, 'kaldris');
    this.shardTimer = 2.5;
    this.mirrorTimer = 5;
  }

  phaseText(phase) {
    return phase === 2 ? ['Kaldris zersplittert', 'Seine Spiegelbilder greifen an'] : ['Kaldris zerbricht vor Zorn', 'Der Splitterregen wird dichter'];
  }

  update(dt, world) {
    if (this.state === 'chase') { this.shardTimer -= dt; this.mirrorTimer -= dt; }
    super.update(dt, world);
  }

  special(world) {
    if (this.phase >= 2 && this.mirrorTimer <= 0) {
      this.mirrorTimer = rand(15, 18);
      this.beginAttack(world, 'mirrorWindup', 'cast', 0.7);
      return true;
    }
    if (this.shardTimer <= 0) {
      this.shardTimer = this.enraged ? rand(6, 7.5) : rand(8.5, 10.5);
      this.beginAttack(world, 'shardsWindup', 'cast', 0.7);
      return true;
    }
    return false;
  }

  updateSpecial(dt, world) {
    if (Math.random() < dt * 40) world.particles.sparks(this.x + rand(-14, 14), this.y - rand(30, 60), -Math.PI / 2, 1, GLASS);
    if (this.stateTime < this.windup) return;
    if (this.state === 'shardsWindup') this.#shards(world);
    else if (this.state === 'mirrorWindup') this.#mirrors(world);
  }

  #shards(world) {
    this.endAttack(null, 0.4);
    const h = world.hero, n = this.phase === 1 ? 7 : this.phase === 2 ? 9 : 12;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = i === 0 ? 0 : rand(18, 75);
      const p = i === 0 ? { x: h.x, y: h.y } : freeNear(world, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.6);
      const dur = 1.0 + i * 0.12;
      world.spawn(new Telegraph(p.x, p.y, { shape: 'circle', r: 15, duration: dur, color: [140, 200, 255] }));
      later(world, this, dur, (w) => {
        w.combat.add({ owner: this, team: 'enemy', shape: 'circle', follow: false, x: p.x, y: p.y - 3, lift: 3, r: 15, damage: 9, knockback: 80, ttl: 0.1 });
        w.particles.sparks(p.x, p.y - 2, -Math.PI / 2, 5, GLASS);
        w.particles.ring(p.x, p.y, 4, 14, GLASS, 70);
        w.addLight(new Light({ x: p.x, y: p.y, radius: 40, color: [160, 210, 255], intensity: 0.7, ttl: 0.18, bloom: 0.4 }));
        w.bus.emit('spellImpact', { x: p.x, y: p.y, element: 'arcane', radius: 15 });
      });
    }
    world.bus.emit('cast', { actor: this, element: 'arcane' });
  }

  #mirrors(world) {
    this.endAttack(null, 0.5);
    const h = world.hero, n = this.enraged ? 3 : 2, base = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2;
      const p = freeNear(world, h.x + Math.cos(a) * 80, h.y + Math.sin(a) * 50);
      world.spawn(new MirrorImage(this, p.x, p.y, { x: h.x, y: h.y }, 1.0 + i * 0.35));
      world.particles.magic(p.x, p.y - 20, 12, 10);
    }
    world.bus.emit('bossSummon', { bossId: this.bossId, count: 0 });
  }
}

// ---------------------------------------------------------------- Königin Ysmeine (Sternwarte, 50)
const STAR = ['#fffbe8', '#ffe8a0', '#ffc850', '#c08a2a'];
const STAR_RGB = [255, 214, 120];

// Sterne eines Sternbilds und, nach der Warnung, der kurze Lichtschlag entlang der Linien
class Constellation extends Entity {
  constructor(owner, pts, delay) {
    super(pts[0].x, pts[0].y);
    Object.assign(this, { owner, pts, delay });
    this.t = 0; this.fired = false; this.sortOffset = -19000;
  }
  update(dt, world) {
    this.t += dt;
    if (this.owner.dead) { this.removed = true; return; }
    if (!this.fired && this.t >= this.delay) {
      this.fired = true;
      const h = world.hero;
      for (let i = 0; i + 1 < this.pts.length; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        if (segDist(h.x, h.y, a.x, a.y, b.x, b.y) <= 7) { hurtHero(world, this.owner, 15, (a.x + b.x) / 2, (a.y + b.y) / 2, 90); break; }
      }
      for (const p of this.pts) world.particles.sparks(p.x, p.y - 2, -Math.PI / 2, 4, STAR);
      world.addLight(new Light({ x: this.x, y: this.y, radius: 140, color: STAR_RGB, intensity: 0.9, ttl: 0.3, bloom: 0.6 }));
      world.bus.emit('spellImpact', { x: this.x, y: this.y, element: 'holy', radius: 40 });
    }
    if (this.t >= this.delay + 0.3) this.removed = true;
  }
  renderEmissive(ctx, cx, cy) {
    const twinkle = (i) => (Math.sin(this.t * 9 + i * 1.7) > 0 ? 1 : 0);
    if (this.fired) {
      // Lichtschlag: helle, zwei Pixel breite Linien, die ausblenden
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - (this.t - this.delay) / 0.3);
      for (let i = 0; i + 1 < this.pts.length; i++) line(ctx, this.pts[i], this.pts[i + 1], cx, cy, STAR[0], STAR[2]);
      ctx.restore();
    }
    this.pts.forEach((p, i) => {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy) - 6, r = 1 + twinkle(i);
      ctx.fillStyle = STAR[2]; ctx.fillRect(x - r, y, r * 2 + 1, 1); ctx.fillRect(x, y - r, 1, r * 2 + 1);
      ctx.fillStyle = STAR[0]; ctx.fillRect(x, y, 1, 1);
    });
  }
}
function line(ctx, a, b, cx, cy, core, rim) {
  const x0 = a.x - cx, y0 = a.y - cy - 2, dx = b.x - a.x, dy = b.y - a.y, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
    ctx.fillStyle = rim; ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = core; ctx.fillRect(x, y, 1, 1);
  }
}

// Goldene Lichtbrücke am Boden (einmal in eine Leinwand gezeichnet); wer darauf steht, ist sicher
class LightBridge extends Entity {
  constructor(owner, x, y, angle, len, width, duration) {
    super(x, y);
    Object.assign(this, { owner, angle, len, width, duration });
    this.t = 0; this.sortOffset = -19500;
    this.a = { x: x - Math.cos(angle) * len / 2, y: y - Math.sin(angle) * len / 2 };
    this.b = { x: x + Math.cos(angle) * len / 2, y: y + Math.sin(angle) * len / 2 };
  }
  covers(px, py) { return segDist(px, py, this.a.x, this.a.y, this.b.x, this.b.y) <= this.width / 2; }
  update(dt) {
    this.t += dt;
    if (this.owner.dead || this.t >= this.duration) this.removed = true;
  }
  #bake() {
    const pad = Math.ceil(this.width / 2) + 2;
    const x0 = Math.floor(Math.min(this.a.x, this.b.x)) - pad, y0 = Math.floor(Math.min(this.a.y, this.b.y)) - pad;
    const w = Math.ceil(Math.abs(this.a.x - this.b.x)) + pad * 2, h = Math.ceil(Math.abs(this.a.y - this.b.y)) + pad * 2;
    const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = segDist(x0 + x + 0.5, y0 + y + 0.5, this.a.x, this.a.y, this.b.x, this.b.y), e = this.width / 2 - d;
      if (e < 0) continue;
      const rgb = e < 1 ? [255, 250, 230] : e < 2 ? [255, 200, 90] : (x + y) % 6 === 0 ? [255, 236, 170] : [214, 150, 50];
      const i = (y * w + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = e < 2 ? 255 : 150;
    }
    g.putImageData(img, 0, 0);
    this.img = { c, x0, y0 };
  }
  renderEmissive(ctx, cx, cy) {
    if (!this.img) this.#bake();
    const fadeIn = Math.min(1, this.t * 4), fadeOut = Math.min(1, (this.duration - this.t) * 4);
    ctx.save();
    ctx.globalAlpha = Math.min(fadeIn, fadeOut) * (0.75 + 0.25 * Math.sin(this.t * 10));
    ctx.drawImage(this.img.c, Math.round(this.img.x0 - cx), Math.round(this.img.y0 - cy));
    ctx.restore();
  }
}

export class Ysmeine extends Boss {
  constructor(x, y, assets) {
    super(x, y, assets, 'ysmeine');
    this.starTimer = 3;
    this.bridgeTimer = 3;
  }

  phaseText(phase) {
    return phase === 2 ? ['Ysmeine ruft die Sterne', 'Rette dich auf die Lichtbrücke'] : ['Ysmeine greift nach dem Himmel', 'Die Sternbilder brennen schneller'];
  }

  update(dt, world) {
    if (this.state === 'chase') { this.starTimer -= dt; this.bridgeTimer -= dt; }
    super.update(dt, world);
  }

  special(world) {
    if (this.phase >= 2 && this.bridgeTimer <= 0) {
      this.bridgeTimer = this.enraged ? rand(18, 21) : rand(22, 26);
      const a = rand(0, Math.PI * 2), dur = 2.8;
      this.bridge = world.spawn(new LightBridge(this, this.home.x, this.home.y, a, 280, 34, dur + 0.2));
      world.spawn(new Telegraph(this.home.x, this.home.y, { shape: 'circle', r: 230, duration: dur, color: [150, 90, 255] }));
      this.beginAttack(world, 'bridgeWindup', 'cast', dur);
      return true;
    }
    if (this.starTimer <= 0) {
      this.starTimer = this.enraged ? rand(5.5, 7) : rand(8, 10);
      this.beginAttack(world, 'starsWindup', 'cast', 0.6);
      return true;
    }
    return false;
  }

  updateSpecial(dt, world) {
    if (Math.random() < dt * 30) world.particles.magic(this.x + rand(-14, 14), this.y - rand(30, 64), 1, 6);
    if (this.stateTime < this.windup) return;
    if (this.state === 'starsWindup') this.#stars(world);
    else if (this.state === 'bridgeWindup') this.#nova(world);
  }

  #stars(world) {
    this.endAttack(null, 0.4);
    const h = world.hero, n = this.phase === 1 ? 4 : this.phase === 2 ? 5 : 6, dur = this.enraged ? 1.1 : 1.4;
    const pts = [];
    let a = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      // Zickzack über den Helden: abwechselnd links und rechts von ihm, damit eine Linie ihn kreuzt
      const d = i === Math.floor(n / 2) ? 0 : rand(55, 100);
      a += Math.PI * rand(0.6, 1.0);
      pts.push(freeNear(world, h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.6));
    }
    for (let i = 0; i + 1 < n; i++) {
      const p = pts[i], q = pts[i + 1], ang = Math.atan2(q.y - p.y, q.x - p.x), len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len > 4) world.spawn(new Telegraph(p.x, p.y, { shape: 'line', screen: true, angle: ang, len, width: 12, duration: dur, color: STAR_RGB }));
    }
    world.spawn(new Constellation(this, pts, dur));
    world.bus.emit('cast', { actor: this, element: 'holy' });
  }

  #nova(world) {
    this.endAttack('slam', 0.9);
    const h = world.hero, safe = this.bridge && this.bridge.covers(h.x, h.y);
    if (!safe) hurtHero(world, this, 40, this.home.x, this.home.y, 220);
    world.addEffect(new DamageWave(this.home.x, this.home.y, this, { maxR: 240, duration: 0.7, harmless: true, color: [150, 90, 255] }));
    world.addLight(new Light({ x: this.home.x, y: this.home.y, radius: 260, color: [150, 90, 255], intensity: 1.1, ttl: 0.4, bloom: 0.8 }));
    world.session.camera?.shake(10);
    world.session.hitstop?.(0.08);
    world.bus.emit('bossSlam', { x: this.home.x, y: this.home.y });
  }
}
