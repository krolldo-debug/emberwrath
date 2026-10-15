import { BotInput } from '../finder/BotBrain.js';

// Steuerung eines Herausforderers in der Glutarena: ein Duellant, der spielt wie ein Mensch. Er drückt dieselben
// Aktionen wie ein Spieler ('attack', 'dodge', 'skill1'…'skill4'), bewegt denselben Stick und zielt mit einem
// Zielpunkt. Er sieht nur, was ein Spieler sieht: den Gegner, dessen Angriffe und Geschosse.
//
// Können (skill 0..1, aus der Wertung des Herausforderers): Reaktionszeit, Treffsicherheit, wie oft er ausweicht,
// wie klug er Fähigkeiten einsetzt. Auch starke Herausforderer übersehen mal etwas.
//   Nahkämpfer (Krieger, Schurke): ran an den Gegner, Sturmangriff/Schattenschritt zum Heranspringen, umkreisen.
//   Fernkämpfer (Waldläufer, Magier): Abstand halten, seitlich ausweichen, Sichtlinie um die Säulen suchen.
const RANGED = { ranger: true, mage: true };
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

export class ArenaBrain {
  constructor(bot, foe, skill = 0.5) {
    this.bot = bot;
    this.foe = foe;
    this.skill = Math.max(0, Math.min(1, skill));
    this.input = new BotInput();
    this.aim = null;
    this.ranged = !!RANGED[bot.classId];
    this.reaction = 0.42 - this.skill * 0.26;     // s bis zur Reaktion auf Gefahr
    this.think = 0;
    this.goal = null;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.sideT = 1 + Math.random() * 2;
    this.attackT = 0;
    this.seen = new WeakMap();                     // Gefahr -> Zeitpunkt entdeckt
    this.ignored = new WeakSet();
    this.t = 0;
    this.stuck = 0;
    this.last = { x: bot.x, y: bot.y };
    this.hesitate = 0;
  }

  // Vor dem Welt-Update: Eingaben für diesen Tick
  update(dt, world) {
    const b = this.bot, f = this.foe;
    this.t += dt;
    this.input.clear();
    if (b.downed || f.downed || b.state === 'wait') { this.input.stick = { x: 0, y: 0 }; this.aim = null; return; }
    this.aim = this.#aimAt(f);
    if (this.#evade(world)) return;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.12 + Math.random() * 0.1 + (1 - this.skill) * 0.12;
      this.#decide(world);
    }
    this.#steer(dt, world);
    this.#attack(dt, world);
  }

  // Zielpunkt mit menschlicher Ungenauigkeit (Körpermitte des Gegners)
  #aimAt(f) {
    const j = (1 - this.skill) * 16;
    return { x: f.x + (Math.random() - 0.5) * j, y: f.centerY + (Math.random() - 0.5) * j };
  }

  // ------------------------------------------------------------------ Ausweichen
  // Geschosse und Fallen des Gegners, sein Hieb in Reichweite: nach Reaktionszeit ausrollen (wenn er sie bemerkt)
  #evade(world) {
    const b = this.bot, f = this.foe;
    let threat = null, dir = null, urgent = false;
    for (const e of world.entities) {
      if (e.removed || e.hero !== f || e.target) continue; // e.target: Gift am Herausforderer selbst
      const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy);
      if (e.vx || e.vy) {
        // Geschoss: kommt es auf mich zu, und wann?
        const sp = Math.hypot(e.vx, e.vy) || 1;
        const along = (dx * e.vx + dy * e.vy) / sp;
        if (along <= 0 || along > 120) continue;
        const side = Math.abs(dx * e.vy - dy * e.vx) / sp;
        if (side > 14) continue;
        const tti = along / sp;
        if (!threat || tti < threat.tti) { threat = { e, tti }; const s = (dx * e.vy - dy * e.vx) >= 0 ? 1 : -1; dir = { x: (e.vy / sp) * s, y: (-e.vx / sp) * s }; urgent = tti < 0.32; }
      } else if (d < 26) {
        // Falle oder Einschlagstelle in der Nähe: wegtreten
        threat = { e, tti: 0.5 }; dir = norm(dx, dy); urgent = false;
      }
    }
    // Gegner holt zum Schlag aus und steht nah: wegrollen (gute Herausforderer lesen das)
    const dist = Math.hypot(f.x - b.x, f.y - b.y);
    if (!threat && (f.state === 'attack' || f.state === 'skill') && dist < 34 && f.stateTime < 0.1 && f.cls.basic.kind === 'melee') {
      if (!this.seen.has(f.atk ?? f)) {
        this.seen.set(f.atk ?? f, this.t);
        if (Math.random() < this.skill * 0.45) { this.input.stick = norm(b.x - f.x, b.y - f.y); this.#roll(); return true; }
      }
    }
    if (!threat) return false;
    const key = threat.e;
    if (this.ignored.has(key)) return false;
    if (!this.seen.has(key)) {
      this.seen.set(key, this.t);
      if (Math.random() > 0.25 + this.skill * 0.6) { this.ignored.add(key); return false; }
    }
    if (this.t - this.seen.get(key) < this.reaction) return false;
    if (this.#blocked(world, dir, 18)) dir = { x: -dir.x, y: -dir.y };
    this.input.stick = dir;
    if (urgent) this.#roll();
    return true;
  }

  #roll() {
    const b = this.bot;
    if (b.stamina >= (b.stats?.dodgeCost ?? 30) && (b.dodgeCd ?? 0) <= 0 && b.state !== 'roll') this.input.press('dodge');
  }

  // ------------------------------------------------------------------ Entscheiden
  #decide(world) {
    const b = this.bot, f = this.foe;
    const dx = f.x - b.x, dy = f.y - b.y, dist = Math.hypot(dx, dy);
    const los = world.dungeon.lineOfSight(b.x, b.y - 8, f.x, f.centerY);
    this.dist = dist;
    this.los = los;
    this.sideT -= 0.15;
    if (this.sideT <= 0) { this.sideT = 1.2 + Math.random() * 2.5; if (Math.random() < 0.5) this.side = -this.side; }
    if (this.hesitate > 0) this.hesitate -= 0.15;
    else if (Math.random() < (1 - this.skill) * 0.08) this.hesitate = 0.3 + Math.random() * 0.5;
    const u = norm(dx, dy);
    if (this.ranged) {
      // Abstand halten (Magier etwas näher), seitlich wandern; ist der Gegner zu nah, zurückweichen
      const want = b.classId === 'mage' ? 100 : 120;
      let gx = f.x - u.x * want - u.y * this.side * 40, gy = f.y - u.y * want * 0.8 + u.x * this.side * 32;
      if (dist < 50) { gx = b.x - u.x * 70; gy = b.y - u.y * 55; }
      if (!los) { gx = b.x + u.x * 30 - u.y * this.side * 30; gy = b.y + u.y * 30 + u.x * this.side * 30; }
      this.goal = this.#free(world, gx, gy) ? { x: gx, y: gy } : { x: b.x - u.y * this.side * 30, y: b.y + u.x * this.side * 30 };
      const range = b.cls.basic.shot?.range ?? 200;
      this.inRange = los && dist < range * 0.85;
    } else {
      // Nahkampf: ran, leicht seitlich versetzt (nicht frontal in den nächsten Hieb laufen)
      const reach = (f.hurtRadius ?? 6) + (b.classId === 'rogue' ? 12 : 16);
      const gx = f.x - u.x * reach + (-u.y) * this.side * 6, gy = f.y - u.y * reach * 0.8 + u.x * this.side * 5;
      this.goal = this.#free(world, gx, gy) ? { x: gx, y: gy } : { x: f.x, y: f.y };
      this.inRange = dist < reach + 10;
    }
    if (this.hesitate <= 0) this.#abilities(world, dist, los);
  }

  #abilities(world, dist, los) {
    const b = this.bot, f = this.foe;
    if (b.state !== 'move' && b.state !== 'attack') return;
    if (Math.random() > 0.35 + this.skill * 0.5) return;
    const hpf = b.hp / b.maxHp, fhp = f.hp / f.maxHp;
    const use = (id, cond) => {
      if (!cond) return false;
      const a = b.abilities.find((x) => x.id === id);
      if (!a || a.locked || a.cdLeft > 0 || b.resource < a.cost) return false;
      this.input.press(a.action);
      return true;
    };
    switch (b.classId) {
      case 'warrior':
        use('battle_shout', hpf < 0.7 || b.resource < 20) ||
        use('charge', dist > 50 && dist < 85 && los) ||
        use('earthshatter', dist < 60 && los) ||
        use('whirlwind', dist < 30);
        break;
      case 'rogue':
        use('shadow_step', dist > 40 && dist < 78 && los) ||
        use('poison_blades', dist < 45) ||
        use('assassinate', dist < 100 && los && (fhp < 0.5 || this.skill > 0.6)) ||
        use('fan_of_knives', dist < 55 && los);
        break;
      case 'ranger':
        use('fire_trap', dist < 55) ||
        use('piercing_shot', los && dist > 60 && dist < 180) ||
        use('arrow_rain', los && dist < 160 && (f.state === 'skill' || Math.random() < 0.5)) ||
        use('volley', los && dist < 110);
        break;
      case 'mage':
        use('blink', dist < 36 && hpf < 0.85) ||
        use('flame_nova', dist < 32) ||
        use('fireball', los && dist > 40 && dist < 170) ||
        use('meteor', los && dist < 160 && (f.state === 'skill' || f.state === 'attack' || Math.random() < 0.35));
        break;
    }
  }

  #attack(dt, world) {
    if (!this.inRange || this.hesitate > 0) return;
    this.attackT -= dt;
    if (this.attackT > 0) return;
    // Spieler klicken schnell, aber nicht in jedem Bild
    this.attackT = 0.1 + Math.random() * 0.1 + (1 - this.skill) * 0.15;
    if (this.ranged && !world.dungeon.lineOfSight(this.bot.x, this.bot.y - 8, this.foe.x, this.foe.centerY)) return;
    this.input.press('attack');
  }

  // ------------------------------------------------------------------ Laufen
  #steer(dt, world) {
    const b = this.bot, g = this.goal;
    if (!g) { this.input.stick = { x: 0, y: 0 }; return; }
    const dx = g.x - b.x, dy = g.y - b.y, d = Math.hypot(dx, dy);
    if (d < 4) { this.input.stick = { x: 0, y: 0 }; return; }
    let v = norm(dx, dy);
    if (this.#blocked(world, v, 10)) {
      for (const a of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
        const w = { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
        if (!this.#blocked(world, w, 10)) { v = w; break; }
      }
    }
    const k = this.hesitate > 0 ? 0.3 : 1;
    this.input.stick = { x: v.x * k, y: v.y * k };
    // Festgefahren: Seite wechseln
    const moved = Math.hypot(b.x - this.last.x, b.y - this.last.y);
    this.last = { x: b.x, y: b.y };
    this.stuck = moved < 10 * dt ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1) { this.stuck = 0; this.side = -this.side; this.think = 0; }
  }

  #blocked(world, v, r) {
    const b = this.bot, x = b.x + v.x * r, y = b.y + v.y * r;
    return world.dungeon.collidesRect(x - 4, y - 3, x + 4, y + 1);
  }

  #free(world, x, y) { return !world.dungeon.collidesRect(x - 5, y - 4, x + 5, y + 2); }
}
