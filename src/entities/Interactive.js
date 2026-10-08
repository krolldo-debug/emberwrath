import { Entity } from './Entity.js';
import { Light } from '../gfx/Lighting.js';
import { EV } from '../core/events.js';
import { rand } from '../core/math.js';

// Interaktive Weltobjekte. Gemeinsame Form (siehe world/Interactions.js):
//   interactRange, canInteract(world), prompt(world) -> Text, promptAnchor() -> {x,y},
//   interact(world)
// Flächen (AreaTrigger) sind nicht interaktiv, sondern melden das Betreten.

// Übergang in eine andere Zone (Dungeon-Eingang, Treppe, Rückkehr-Portal).
export class Portal extends Entity {
  constructor(x, y, { id, to, prompt, range = 24, sub = null, visual = null, dir = null, minLevel = null }) {
    super(x, y);
    this.portalId = id; this.to = to; this.promptText = prompt; this.interactRange = range; this.sub = sub;
    this.minLevel = minLevel; // harte Sperre (Dungeons ab empfohlener Stufe − 3)
    // visual 'road': Wegausgang am Kartenrand – glimmende Pfeile am Boden zeigen hinaus
    this.visual = visual; this.dir = dir ?? [0, -1]; this.t = 0;
    if (visual === 'road') this.sortOffset = -9000;
  }
  update(dt, world) {
    if (this.visual !== 'road') return;
    this.t += dt;
    const near = Math.hypot(world.hero.x - this.x, world.hero.y - this.y) < 160;
    if (near && Math.random() < dt * 6) {
      const [dx, dy] = this.dir;
      world.particles.embers?.(this.x - dx * 20 + (Math.random() - 0.5) * 18 * Math.abs(dy), this.y - dy * 20 + (Math.random() - 0.5) * 18 * Math.abs(dx), 1);
    }
  }
  renderEmissive(ctx, cx, cy) {
    if (this.visual !== 'road') return;
    const [dx, dy] = this.dir;
    const px = -dy, py = dx; // quer zur Richtung
    for (let k = 0; k < 3; k++) {
      const ph = (this.t * 0.9 + k / 3) % 1;
      const d = -26 + ph * 26;
      const a = Math.sin(ph * Math.PI) * 0.75;
      if (a <= 0.02) continue;
      ctx.fillStyle = `rgba(255,${150 + k * 20},70,${a.toFixed(3)})`;
      const bx = this.x - cx + dx * d, by = this.y - cy + dy * d;
      for (let i = -4; i <= 4; i++) {
        const back = -Math.abs(i) * 0.9;
        ctx.fillRect(Math.round(bx + px * i + dx * back), Math.round(by + py * i + dy * back), 2, 2);
      }
    }
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return this.sub ? `${this.promptText} (${this.sub})` : this.promptText; }
  promptAnchor() { return { x: this.x, y: this.y - 26 }; }
  interact(world) {
    if (this.minLevel && (world.hero.level ?? 1) < this.minLevel) {
      world.bus.emit(EV.UI_TOAST, { text: `Zu gefährlich – erst ab Stufe ${this.minLevel}.`, kind: 'warn' });
      return;
    }
    world.bus.emit(EV.ZONE_TRAVEL, { zoneId: this.to.zoneId, spawnId: this.to.spawnId });
  }
}

// Leuchtender Runenkreis, der nach dem Boss erscheint und hinausführt.
export class ExitPortal extends Portal {
  constructor(x, y, opts, rune) {
    super(x, y, opts);
    this.rune = rune; this.t = 0; this.sortOffset = -9000;
  }
  update(dt, world) {
    this.t += dt;
    if (!this.light) this.light = world.addLight(new Light({ x: this.x, y: this.y, radius: 90, color: [150, 90, 255], intensity: 0.9, flicker: 0.15, bloom: 0.5 }));
    if (Math.random() < dt * 20) world.particles.magic(this.x, this.y, 1, 16);
  }
  promptAnchor() { return { x: this.x, y: this.y - 20 }; }
  render(ctx, cx, cy) {
    const b = this.rune.base;
    ctx.drawImage(b, Math.round(this.x - cx - b.width / 2), Math.round(this.y - cy - b.height / 2));
  }
  renderEmissive(ctx, cx, cy) {
    const g = this.rune.glow;
    ctx.globalAlpha = Math.min(1, this.t) * (0.6 + 0.4 * Math.sin(this.t * 3));
    ctx.drawImage(g, Math.round(this.x - cx - g.width / 2), Math.round(this.y - cy - g.height / 2));
    ctx.globalAlpha = 1;
  }
}

// Truhe: öffnet einmal. Die Beute vergibt der Fortschritts-Bereich über
// EV.OBJECT_INTERACT { objectId, kind: 'chest', x, y }.
// persistent = true: bleibt für diesen Charakter offen (Flag im world-Slice).
export class Chest extends Entity {
  // Truhen-Grafik aus den Objekten von Thread D, sonst eigene
  static sprites(assets) {
    const c = assets.props.chest;
    return c ? { chest: c[0], chestOpen: c[1] } : assets.sprites.crypt;
  }
  constructor(x, y, { id, sprites, persistent, opened }) {
    super(x, y);
    this.objectId = id; this.sprites = sprites; this.persistent = persistent;
    this.opened = !!opened; this.interactRange = 20; this.t = 0;
  }
  canInteract(world) { return !this.opened && !world.hero.dead; }
  prompt() { return 'Truhe öffnen'; }
  promptAnchor() { return { x: this.x, y: this.y - 18 }; }
  interact(world) {
    this.opened = true;
    if (this.persistent) world.state.commit('world:setFlag', { key: `chest:${this.objectId}` });
    world.particles.ring(this.x, this.y - 6, 4, 14, ['#fff0a8', '#e8c25a', '#b8862a'], 50);
    world.addLight(new Light({ x: this.x, y: this.y - 6, radius: 50, color: [255, 210, 120], intensity: 1, ttl: 0.6, bloom: 0.5 }));
    world.bus.emit('chestOpen', { x: this.x, y: this.y });
    world.bus.emit(EV.OBJECT_INTERACT, { objectId: this.objectId, kind: 'chest', x: this.x, y: this.y - 4, zoneId: world.zone.id });
  }
  update(dt, world) {
    this.t += dt;
    if (!this.opened && Math.random() < dt * 1.5) world.particles.spawn({ x: this.x + rand(-5, 5), y: this.y - 4, vx: 0, vy: 0, rise: rand(6, 12), wobble: 6, life: rand(0.6, 1.2), colors: ['#fff0a8', '#e8c25a'], emissive: true });
  }
  render(ctx, cx, cy) {
    (this.opened ? this.sprites.chestOpen : this.sprites.chest).draw(ctx, this.x - cx, this.y - cy);
  }
}

// Knochentor (Boss-Arena). Geschlossen = Kollisionsbox aktiv.
export class Gate extends Entity {
  constructor(x, y, width, sprite, world) {
    super(x, y);
    this.sprite = sprite;
    this.box = { x0: x - width / 2, y0: y - 10, x1: x + width / 2, y1: y + 2, off: true };
    world.dungeon.boxes.push(this.box);
    this.closed = false;
    this.k = 0; // 0 = offen (hochgezogen), 1 = geschlossen
    this.sortOffset = -2;
  }
  setClosed(on, world) {
    if (this.closed === on) return;
    this.closed = on;
    this.box.off = !on;
    world.flow.rebuildBlocked();
    world.bus.emit('gate', { closed: on, x: this.x, y: this.y });
    world.particles.dust(this.x, this.y, 16, '#6e6450');
    world.session.camera?.shake(3);
  }
  update(dt) {
    const target = this.closed ? 1 : 0;
    this.k += Math.sign(target - this.k) * Math.min(Math.abs(target - this.k), dt * (this.closed ? 6 : 1.5));
  }
  render(ctx, cx, cy) {
    if (this.k <= 0.01) return;
    const s = this.sprite;
    const visH = Math.max(1, Math.round(s.canvas.height * this.k));
    ctx.drawImage(s.canvas, 0, s.canvas.height - visH, s.canvas.width, visH,
      Math.round(this.x - cx - s.ax), Math.round(this.y - cy - visH + 1), s.canvas.width, visH);
  }
}

// Unsichtbare Fläche: meldet EV.AREA_REACHED einmal pro Betreten der Zone.
export class AreaTrigger extends Entity {
  constructor(rect, areaId) {
    super(rect.x0, rect.y0);
    this.rect = rect; this.areaId = areaId; this.fired = false;
  }
  contains(x, y) { const r = this.rect; return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; }
  update(dt, world) {
    const h = world.hero;
    if (this.fired || h.dead || !this.contains(h.x, h.y)) return;
    this.fired = true;
    if (!world.state.slices.world?.flags?.[`area:${this.areaId}`]) world.state.commit('world:setFlag', { key: `area:${this.areaId}` });
    world.bus.emit(EV.AREA_REACHED, { areaId: this.areaId, zoneId: world.zone.id });
  }
}

// Schrein / aufhebbares Objekt aus den Level-Daten (Totems, Siegel, Taschen).
// Meldet EV.OBJECT_INTERACT { objectId, kind, x, y, zoneId }; die Quest-Logik
// (Thread C) entscheidet, ob das zählt. Aktivierte Schreine leuchten eine Weile
// und lassen sich danach erneut benutzen; aufgehobene Gegenstände verschwinden
// bis zum nächsten Betreten der Zone.
export class WorldObject extends Entity {
  constructor(x, y, { id, kind, looks, prompt, pickup = false }) {
    super(x, y);
    this.objectId = id; this.kind = kind; this.looks = looks; this.promptText = prompt;
    this.pickup = pickup; this.used = false; this.usedTime = 0; this.t = Math.random() * 5;
    this.interactRange = 22;
  }
  get look() { return (this.used && this.looks.on) || this.looks.off || this.looks; }
  canInteract(world) { return !this.used && !world.hero.dead; }
  prompt() { return this.promptText; }
  promptAnchor() { return { x: this.x, y: this.y - Math.min(40, (this.look.sprite?.ay ?? 20) + 4) }; }
  // Bank und Glutpforte bleiben benutzbar (öffnen nur ein Panel bei C)
  get reusable() { return this.kind === 'bank' || this.kind === 'trial' || this.kind === 'mirror'; }
  interact(world) {
    if (this.reusable) {
      world.bus.emit(EV.OBJECT_INTERACT, { objectId: this.objectId, kind: this.kind, x: this.x, y: this.y - 4, zoneId: world.zone.id });
      world.bus.emit('objectUse', { objectId: this.objectId, kind: this.kind, x: this.x, y: this.y });
      if (this.kind === 'mirror') world.bus.emit(EV.UI_OPEN_PANEL, { id: 'appearance' });
      if (this.kind === 'trial') world.particles.ring(this.x, this.y - 24, 12, 20, ['#fff0b0', '#ffb640', '#f07a1c'], 60);
      return;
    }
    this.used = true; this.usedTime = 0;
    const colors = this.kind === 'shrine' ? ['#ffffff', '#f8f0a0', '#90e070'] : ['#fff0a8', '#e8c25a'];
    world.particles.ring(this.x, this.y - 10, 10, 18, colors, 60);
    world.addLight(new Light({ x: this.x, y: this.y - 12, radius: 80, color: this.kind === 'shrine' ? [200, 255, 170] : [255, 220, 140], intensity: 1, ttl: 1.2, bloom: 0.6 }));
    world.bus.emit(EV.OBJECT_INTERACT, { objectId: this.objectId, kind: this.kind, x: this.x, y: this.y - 4, zoneId: world.zone.id });
    world.bus.emit('objectUse', { objectId: this.objectId, kind: this.kind, x: this.x, y: this.y });
    if (this.pickup) this.hidden = true;
  }
  update(dt, world) {
    this.t += dt;
    // Licht des aktuellen Aussehens (z. B. erweckter Totem)
    const L = this.hidden ? null : this.look.light;
    if (L !== this.lightDef) {
      if (this.light) this.light.dead = true;
      this.light = L ? world.addLight(new Light({ x: this.x + (L.dx ?? 0), y: this.y + (L.dy ?? 0), radius: L.radius, color: L.color, intensity: L.intensity ?? 0.9, flicker: 0.15, bloom: 0.3 })) : null;
      this.lightDef = L;
    }
    const em = this.look.embers;
    if (em && !this.hidden && Math.random() < em.rate * dt) world.particles.embers(this.x + em.dx + rand(-6, 6), this.y + em.dy + rand(-8, 8), 1);
    if (this.reusable) return;
    if (this.used && !this.pickup) {
      this.usedTime += dt;
      if (Math.random() < dt * 6) world.particles.magic(this.x + rand(-4, 4), this.y - rand(8, 24), 1, 4);
      if (this.usedTime > 90) this.used = false; // Schrein lädt sich wieder auf
    } else if (!this.used && Math.random() < dt * 0.8) {
      world.particles.spawn({ x: this.x + rand(-6, 6), y: this.y - rand(2, 14), vx: 0, vy: 0, rise: rand(6, 12), wobble: 6, life: rand(0.8, 1.4), colors: ['#fff0a8', '#e8c25a'], emissive: true });
    }
  }
  render(ctx, cx, cy) {
    if (this.hidden) return;
    this.look.sprite?.draw(ctx, this.x - cx, this.y - cy);
  }
  renderEmissive(ctx, cx, cy) {
    if (this.hidden) return;
    const L = this.look, s = L.sprite;
    if (!L.glow || !s) return;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 3);
    ctx.drawImage(L.glow, Math.round(this.x - cx - s.ax), Math.round(this.y - cy - s.ay));
    ctx.globalAlpha = 1;
  }
}

// Wegstein (Teleporter zwischen Städten/Lagern, world/waystones.js).
// Schaltet sich beim ersten Besuch frei (Held näher als 4 Kacheln): Flag
// 'waystone:<zoneId>' + Meldung. Interaktion -> Bus 'travel:open' (Reisemenü);
// depart(world, zoneId) spielt die Lichtsäule (~0,6 s) und reist per EV.ZONE_TRAVEL.
const WS_RUNE = ['#0d3e52', '#15708a', '#2fb2cf', '#86ecff', '#e6ffff'];
export class Waystone extends Entity {
  constructor(x, y, { zoneId, site, unlocked, looks, travelInfo, inCombat }) {
    super(x, y);
    this.zoneId = zoneId; this.site = site; this.looks = looks;
    this.unlocked = !!unlocked; this.k = this.unlocked ? 1 : 0; // 0 = dunkel, 1 = erwacht
    this.travelInfo = travelInfo; this.inCombat = inCombat;
    this.interactRange = 28; this.t = 0; this.flash = 0;
    this.departing = null; // { zoneId, t }
    this.arriving = 0;
    this.light = null;
  }
  canInteract(world) { return !world.hero.dead && !this.departing; }
  prompt() { return this.unlocked ? 'Wegstein: Reisen' : 'Wegstein berühren'; }
  promptAnchor() { return { x: this.x, y: this.y - 40 }; }

  unlock(world) {
    if (this.unlocked) return;
    this.unlocked = true; this.flash = 1;
    world.state.commit('world:setFlag', { key: `waystone:${this.zoneId}` });
    world.particles.ring(this.x, this.y - 30, 6, 22, ['#ffffff', ...WS_RUNE.slice(2)], 70);
    world.particles.magic(this.x, this.y - 24, 18, 10);
    world.addLight(new Light({ x: this.x, y: this.y - 30, radius: 120, color: [140, 230, 255], intensity: 1.2, ttl: 1.2, bloom: 0.7 }));
    world.bus.emit('waystone:unlocked', { zoneId: this.zoneId, x: this.x, y: this.y });
    world.bus.emit(EV.UI_TOAST, { text: `Wegstein von ${this.site?.name ?? world.zone.name} entdeckt`, kind: 'quest' });
  }

  interact(world) {
    this.unlock(world);
    world.bus.emit('objectUse', { objectId: `waystone_${this.zoneId}`, kind: 'waystone', x: this.x, y: this.y });
    world.bus.emit('travel:open', this.travelInfo(world));
  }

  // Reise antreten (vom Bus 'travel:go'). Prüft Freischaltung und Kampf erneut.
  depart(world, zoneId) {
    if (this.departing || world.hero.dead) return false;
    const flags = world.state.slices.world?.flags ?? {};
    if (zoneId === world.zone.id) return false;
    if (!flags[`waystone:${zoneId}`]) { world.bus.emit(EV.UI_TOAST, { text: 'Diesen Wegstein hast du noch nicht entdeckt.', kind: 'warn' }); return false; }
    if (this.inCombat(world)) { world.bus.emit(EV.UI_TOAST, { text: 'Im Kampf kannst du nicht reisen.', kind: 'warn' }); return false; }
    this.departing = { zoneId, t: 0, paused: 0 };
    const h = world.hero;
    world.addLight(new Light({ follow: h, offsetY: -20, radius: 110, color: [150, 230, 255], intensity: 1.3, ttl: 0.8, bloom: 0.8 }));
    world.particles.ring(h.x, h.y - 4, 4, 16, ['#ffffff', ...WS_RUNE.slice(2)], 60);
    world.bus.emit('waystone:depart', { zoneId, x: h.x, y: h.y });
    return true;
  }
  // Ankunft (Spawn 'waystone'): kurze Lichtsäule über dem Helden, sobald der
  // Ladebildschirm (ui/ZoneTransition, ~1,5 s) ausblendet.
  arrive(world, delay = 1.35) { this.arriveIn = delay; }
  #arriveNow(world) {
    this.arriving = 0.7;
    const h = world.hero;
    world.addLight(new Light({ follow: h, offsetY: -20, radius: 110, color: [150, 230, 255], intensity: 1.2, ttl: 0.9, bloom: 0.8 }));
    world.particles.ring(h.x, h.y - 4, 4, 18, ['#ffffff', ...WS_RUNE.slice(2)], 60);
  }
  #go(world) {
    const z = this.departing.zoneId;
    this.departing = null;
    world.bus.emit(EV.ZONE_TRAVEL, { zoneId: z, spawnId: 'waystone' });
  }
  // Notausgang, falls ein Panel die Welt nach 'travel:go' pausiert lässt (Sitzungssystem ruft das).
  tickPaused(dt, world) {
    if (!this.departing) return;
    this.departing.paused += dt;
    if (this.departing.paused > 1) this.#go(world);
  }

  update(dt, world) {
    this.t += dt;
    const h = world.hero;
    this.heroRef = h;
    if (!this.unlocked && !h.dead && Math.hypot(h.x - this.x, h.y - this.y) < 4 * 16) this.unlock(world);
    this.k += ((this.unlocked ? 1 : 0) - this.k) * Math.min(1, dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.arriving = Math.max(0, this.arriving - dt);
    if (this.arriveIn > 0 && (this.arriveIn -= dt) <= 0) this.#arriveNow(world);
    if (!this.light) this.light = world.addLight(new Light({ x: this.x, y: this.y - 30, radius: 84, color: [90, 200, 255], intensity: 0.25, flicker: 0.12, bloom: 0.35 }));
    this.light.intensity = 0.22 + this.k * 0.55 + this.flash * 0.6 + Math.sin(this.t * 2.1) * 0.05 * this.k;
    this.light.radius = 70 + this.k * 30;
    // Aufsteigende Runenfunken
    const rate = 0.6 + this.k * 3;
    if (Math.random() < dt * rate) {
      world.particles.spawn({ x: this.x + rand(-5, 5), y: this.y - rand(14, 40), vx: 0, vy: 0, rise: rand(8, 18), wobble: 6, life: rand(0.8, 1.6), colors: this.k > 0.5 ? ['#e6ffff', '#86ecff', '#2fb2cf'] : ['#2fb2cf', '#15708a'], emissive: true });
    }
    if (this.departing) {
      const D = this.departing;
      if (h.dead) { this.departing = null; return; }
      // Während der Lichtsäule getroffen -> Reise abgebrochen
      if (D.t > 0 && (h.combatTime ?? 99) < D.t) { this.departing = null; world.bus.emit(EV.UI_TOAST, { text: 'Reise unterbrochen – du wirst angegriffen.', kind: 'warn' }); return; }
      D.t += dt; D.paused = 0;
      if (Math.random() < dt * 40) world.particles.spawn({ x: h.x + rand(-6, 6), y: h.y - rand(0, 30), vx: 0, vy: 0, rise: rand(40, 90), wobble: 4, life: rand(0.3, 0.6), colors: ['#ffffff', '#86ecff', '#2fb2cf'], emissive: true });
      if (D.t >= 0.6) this.#go(world);
    }
  }

  render(ctx, cx, cy) {
    const L = this.looks;
    L.sprite.draw(ctx, this.x - cx, this.y - cy);
    const bob = Math.round(Math.sin(this.t * 1.6) * 1.5 * (0.4 + this.k * 0.6));
    const cy0 = this.y - cy + L.crystalY - 3 + bob;
    if (this.k < 0.99) L.crystalDim.draw(ctx, this.x - cx, cy0);
    if (this.k > 0.01) L.crystal.draw(ctx, this.x - cx, cy0, { alpha: Math.min(1, this.k) });
  }
  // Lichtsäule: schmaler Kern + breiter Schein, von den Füßen bis über den Bildrand
  #pillar(ctx, x, y, a, w) {
    if (a <= 0.01) return;
    const top = -40;
    ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#2fb2cf';
    ctx.fillRect(Math.round(x - w), top, Math.round(w * 2), Math.round(y - top));
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#86ecff';
    ctx.fillRect(Math.round(x - w * 0.55), top, Math.max(1, Math.round(w * 1.1)), Math.round(y - top));
    ctx.globalAlpha = a; ctx.fillStyle = '#e6ffff';
    ctx.fillRect(Math.round(x - w * 0.2), top, Math.max(1, Math.round(w * 0.4)), Math.round(y - top));
    // Bodenring
    ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#86ecff';
    ctx.fillRect(Math.round(x - w * 1.6), Math.round(y - 1), Math.round(w * 3.2), 2);
    ctx.globalAlpha = 1;
  }
  renderEmissive(ctx, cx, cy) {
    const L = this.looks, s = L.sprite;
    const x0 = Math.round(this.x - cx - s.ax), y0 = Math.round(this.y - cy - s.ay);
    const pulse = 0.78 + 0.22 * Math.sin(this.t * 2.4) + this.flash * 0.4;
    // Gedimmte Runen (noch nicht entdeckt) flimmern schwach
    const dimA = (1 - this.k) * (0.45 + 0.25 * Math.sin(this.t * 1.3 + Math.sin(this.t * 3.7)));
    if (dimA > 0.01) { ctx.globalAlpha = Math.min(1, dimA); ctx.drawImage(L.glowDim, x0, y0); }
    if (this.k > 0.01) { ctx.globalAlpha = Math.min(1, this.k * pulse); ctx.drawImage(L.glowLit, x0, y0); }
    const c = L.crystal, bob = Math.round(Math.sin(this.t * 1.6) * 1.5 * (0.4 + this.k * 0.6));
    ctx.globalAlpha = Math.min(1, 0.08 + this.k * 0.8 * pulse);
    ctx.drawImage(L.crystalGlow, Math.round(this.x - cx - c.ax), Math.round(this.y - cy + L.crystalY - 3 + bob - c.ay));
    ctx.globalAlpha = 1;
    // Freischalt-Funkeln: Sternkreuz am Kristall
    if (this.flash > 0) {
      const fx = Math.round(this.x - cx), fy = Math.round(this.y - cy + L.crystalY - 9 + bob), r = Math.round(4 + (1 - this.flash) * 10);
      ctx.globalAlpha = this.flash; ctx.fillStyle = '#e6ffff';
      ctx.fillRect(fx - r, fy, r * 2 + 1, 1); ctx.fillRect(fx, fy - r, 1, r * 2 + 1);
      ctx.fillRect(fx - 1, fy - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
    if (this.departing || this.arriving > 0) {
      const h = this.heroRef;
      if (!h) return;
      let a, w;
      if (this.departing) { const p = Math.min(1, this.departing.t / 0.6); a = 0.4 + p * 0.6; w = 2 + p * 7; }
      else { const p = this.arriving / 0.7; a = p; w = 3 + p * 6; }
      this.#pillar(ctx, h.x - cx, h.y - cy, a, w);
    }
  }
}

// Auftragsbrett (Städte/Lager). Interaktion -> Bus 'board:open' { zoneId, boardId }
// (Panel von Thread C). Das Ausrufezeichen leuchtet, wenn world.boardHasOffers(zoneId, boardId)
// true liefert (Standard: game.boardHasOffers-Hook, sonst false); abgefragt alle 0,5 s.
export class QuestBoard extends Entity {
  constructor(x, y, { zoneId, boardId, looks }) {
    super(x, y);
    this.zoneId = zoneId; this.boardId = boardId; this.looks = looks;
    this.interactRange = 24; this.t = Math.random() * 3; this.poll = 0;
    this.offers = false; this.k = 0; this.light = null;
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return this.offers ? 'Auftragsbrett lesen (neue Aufträge)' : 'Auftragsbrett lesen'; }
  promptAnchor() { return { x: this.x, y: this.y - 46 }; }
  interact(world) {
    world.bus.emit('objectUse', { objectId: this.boardId, kind: 'quest_board', x: this.x, y: this.y });
    world.bus.emit('board:open', { zoneId: this.zoneId, boardId: this.boardId });
  }
  update(dt, world) {
    this.t += dt;
    if ((this.poll -= dt) <= 0) {
      this.poll = 0.5;
      try { this.offers = !!world.boardHasOffers?.(this.zoneId, this.boardId); } catch { this.offers = false; }
    }
    this.k += ((this.offers ? 1 : 0) - this.k) * Math.min(1, dt * 4);
    if (!this.light) {
      const l = this.looks.lantern;
      this.light = world.addLight(new Light({ x: this.x + l.dx, y: this.y + l.dy, radius: 54, color: [255, 170, 90], intensity: 0.75, flicker: 0.25, bloom: 0.3 }));
    }
    if (this.k > 0.5 && Math.random() < dt * 2) world.particles.spawn({ x: this.x + rand(-3, 3), y: this.y + this.looks.markY + 2, vx: 0, vy: 0, rise: rand(6, 12), wobble: 5, life: rand(0.5, 1), colors: ['#fff0a8', '#e8c25a'], emissive: true });
  }
  #markPos() { return Math.round(Math.sin(this.t * 3) * 1.5); }
  render(ctx, cx, cy) {
    const L = this.looks;
    L.sprite.draw(ctx, this.x - cx, this.y - cy);
    if (this.k > 0.02) L.mark.draw(ctx, this.x - cx, this.y - cy + L.markY + this.#markPos(), { alpha: Math.min(1, this.k) });
  }
  renderEmissive(ctx, cx, cy) {
    const L = this.looks, s = L.sprite;
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(this.t * 7 + Math.sin(this.t * 13));
    ctx.drawImage(L.glow, Math.round(this.x - cx - s.ax), Math.round(this.y - cy - s.ay));
    if (this.k > 0.02) {
      const m = L.mark;
      ctx.globalAlpha = this.k * (0.7 + 0.3 * Math.sin(this.t * 4));
      ctx.drawImage(L.markGlow, Math.round(this.x - cx - m.ax), Math.round(this.y - cy + L.markY + this.#markPos() - m.ay));
    }
    ctx.globalAlpha = 1;
  }
}
