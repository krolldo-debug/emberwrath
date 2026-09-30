import { dangerAt, unsafe } from './dangers.js';

// Steuerung eines Söldners – so, wie ein Spieler spielt: Er drückt dieselben Aktionen ('attack', 'dodge',
// 'skill1'…'skill4') und bewegt denselben Stick (axis), zielt mit einem Zielpunkt (world.aim) und sieht nur,
// was ein Spieler auch sieht (Gegner, Warnflächen, Geschosse). Er hat eine Reaktionszeit, verfehlt gelegentlich
// eine Ausweichrolle und bleibt nicht perfekt in Formation.
//
// Rollen: 'tank' führt, zieht Gegner auf sich, stellt sich zwischen Gegner und Gruppe und holt Gegner von
// Schwächeren zurück. 'dps' greift das Ziel des Tanks an: Nahkämpfer von hinten, Fernkämpfer mit Abstand und
// Sichtlinie. Alle weichen Flächen und Geschossen aus, trinken Heiltränke und warten auf ihre Gruppe.

// Eingabe eines Söldners (gleiche Form wie core/Input für das, was Hero liest)
export class BotInput {
  constructor() { this.presses = new Set(); this.stick = { x: 0, y: 0 }; }
  pressed(a) { return this.presses.has(a); }
  axis() { return this.stick; }
  press(a) { this.presses.add(a); }
  clear() { this.presses.clear(); }
}

const RANGED = { ranger: true, mage: true };

export class BotBrain {
  constructor(bot, party) {
    this.bot = bot;
    this.party = party;
    this.member = bot.member;
    this.role = bot.member.role;
    this.style = bot.member.style ?? { reaction: 0.25, skill: 0.85 };
    this.input = new BotInput();
    this.aim = null;
    this.ranged = !!RANGED[bot.classId];
    this.think = Math.random() * 0.2;
    this.target = null;
    this.goal = null;
    this.moving = false;
    this.seen = new Map();       // Gefahr -> Zeitpunkt entdeckt (Reaktionszeit)
    this.ignored = new Set();    // Gefahren, die dieser Söldner "übersehen" hat
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.slotJitter = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 8 };
    this.potions = 3;
    this.potionCd = 0;
    this.stuck = 0;
    this.lastPos = { x: bot.x, y: bot.y };
    this.pause = 0;              // kurze "menschliche" Pausen außerhalb des Kampfes
    this.nextPause = 6 + Math.random() * 14;
    this.attackT = 0;
  }

  // Vor dem Welt-Update: Eingaben für diesen Tick setzen.
  update(dt, world, t) {
    const b = this.bot;
    this.input.clear();
    this.potionCd = Math.max(0, this.potionCd - dt);
    if (b.dead) { this.input.stick = { x: 0, y: 0 }; this.aim = null; return; }

    // 1. Gefahr: sofort (nach Reaktionszeit) ausweichen, alles andere wartet
    if (this.#dodge(world, t)) return;

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.1 + Math.random() * 0.09;
      this.#decide(world, t);
    }
    this.#potion(world);
    this.#steer(dt, world);
    // Angreifen: ein Spieler hält die Taste gedrückt bzw. klickt schnell
    if (this.target && !this.target.dead && this.inRange) {
      this.attackT -= dt;
      if (this.attackT <= 0) { this.attackT = 0.12 + Math.random() * 0.08; this.input.press('attack'); }
    }
  }

  // ------------------------------------------------------------------ Ausweichen
  #dodge(world, t) {
    const b = this.bot;
    const d = dangerAt(world, b);
    if (!d) { this.seen.clear(); return false; }
    if (this.ignored.has(d.key)) return false;
    if (!this.seen.has(d.key)) {
      this.seen.set(d.key, t);
      // Auch gute Spieler übersehen mal etwas
      if (Math.random() > 0.35 + this.style.skill * 0.62) { this.ignored.add(d.key); return false; }
    }
    if (t - this.seen.get(d.key) < this.style.reaction) return false;
    let dir = d.dir;
    // nicht in die Wand oder in die nächste Fläche flüchten
    const probe = (v, r) => !world.dungeon.collidesRect(b.x + v.x * r - 4, b.y + v.y * r - 3, b.x + v.x * r + 4, b.y + v.y * r + 1) && !unsafe(world, b.x + v.x * r, b.y + v.y * r);
    if (!probe(dir, 22)) {
      const alts = [[0.8, 0.6], [-0.8, 0.6], [0, 1], [0, -1]].map(([c, s]) => ({ x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c }));
      const alt = alts.find((v) => probe(v, 22));
      if (alt) dir = alt;
    }
    this.input.stick = dir;
    this.aim = null;
    const canRoll = b.stamina >= (b.stats?.dodgeCost ?? 30) && (b.dodgeCd ?? 0) <= 0;
    if ((d.roll || d.timeLeft < 0.45) && canRoll && b.state !== 'roll') this.input.press('dodge');
    return true;
  }

  // ------------------------------------------------------------------ Entscheiden
  #decide(world, t) {
    const b = this.bot, P = this.party;
    const hero = P.player;
    const foes = P.foes(); // aktive Gegner der Gruppe
    this.inRange = false;
    this.target = null;
    this.goal = null;

    if (foes.length) {
      this.pause = 0;
      const tgt = this.role === 'tank' ? this.#tankTarget(foes) : this.#assistTarget(foes);
      if (tgt) {
        this.target = tgt;
        this.#combatGoal(world, tgt, foes);
        this.#abilities(world, tgt, foes);
        return;
      }
    }

    // Außerhalb des Kampfes: Tank darf Gegner in der Nähe des Spielers anlocken
    if (this.role === 'tank' && P.leaderIsBot) {
      const pull = P.pullable(b, hero);
      if (pull) { this.target = pull; this.#combatGoal(world, pull, [pull]); return; }
    }
    this.#follow(world, t);
  }

  // Tank: zuerst Gegner, die Schwächere angreifen (zurückholen), dann das eigene Ziel, dann das nächste
  #tankTarget(foes) {
    const b = this.bot, P = this.party;
    let best = null, bestScore = Infinity;
    for (const e of foes) {
      const on = P.targetOf(e);
      const peel = on && on !== b ? 0 : 60;
      const dist = Math.hypot(e.x - b.x, e.y - b.y);
      const keep = e === this.lastTarget ? -30 : 0;
      const boss = e.boss || e.def?.boss ? -40 : 0;
      const s = dist + peel + keep + boss;
      if (s < bestScore) { bestScore = s; best = e; }
    }
    this.lastTarget = best;
    return best;
  }

  // Schaden: Ziel des Tanks (oder des Spielers), sonst das angeschlagenste in der Nähe
  #assistTarget(foes) {
    const b = this.bot, P = this.party;
    const lead = P.tankBrain?.target;
    if (lead && foes.includes(lead) && Math.hypot(lead.x - b.x, lead.y - b.y) < 260) return lead;
    const pt = P.playerTarget;
    if (pt && foes.includes(pt)) return pt;
    let best = null, bestScore = Infinity;
    for (const e of foes) {
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      const s = d * 0.6 + (e.hp / (e.maxHp || 1)) * 80 + (P.targetOf(e) === b ? -40 : 0);
      if (s < bestScore) { bestScore = s; best = e; }
    }
    return best;
  }

  #combatGoal(world, tgt, foes) {
    const b = this.bot, P = this.party;
    const tx = tgt.x, ty = tgt.y;
    const dist = Math.hypot(tx - b.x, ty - b.y);
    const reach = (tgt.hurtRadius ?? 7) + (tgt.boss || tgt.def?.boss ? 16 : 13);
    if (this.role === 'tank' || !this.ranged) {
      // Nahkampf: Tank zwischen Gegner und Gruppe, Schaden hinter dem Gegner (vom Tank aus gesehen)
      let ax, ay;
      const tank = P.tank;
      if (this.role === 'tank' || !tank || tank.dead || tank === b) {
        const c = P.centroid(b);
        const v = norm(tx - c.x, ty - c.y);
        ax = tx - v.x * reach; ay = ty - v.y * reach * 0.8;
      } else {
        const v = norm(tx - tank.x, ty - tank.y);
        const s = this.side * 0.5;
        ax = tx + (v.x - v.y * s) * reach; ay = ty + (v.y + v.x * s) * reach * 0.8;
      }
      this.goal = world.dungeon.collidesRect(ax - 4, ay - 3, ax + 4, ay + 1) ? { x: tx, y: ty } : { x: ax, y: ay };
      this.inRange = dist < reach + 12;
    } else {
      // Fernkampf: Abstand halten, Sichtlinie, nicht direkt neben anderen stehen
      const want = this.bot.classId === 'mage' ? 105 : 125;
      const tank = P.tank && !P.tank.dead ? P.tank : P.player;
      const base = norm(tank.x - tx, tank.y - ty);
      const ang = Math.atan2(base.y, base.x) + this.side * 0.45;
      let gx = tx + Math.cos(ang) * want, gy = ty + Math.sin(ang) * want * 0.75;
      // Gegner zu nah: zurückweichen
      const near = foes.find((e) => P.targetOf(e) === b && Math.hypot(e.x - b.x, e.y - b.y) < 34);
      if (near) { const v = norm(b.x - near.x, b.y - near.y); gx = b.x + v.x * 60; gy = b.y + v.y * 45; }
      if (world.dungeon.collidesRect(gx - 4, gy - 3, gx + 4, gy + 1) || !world.dungeon.lineOfSight(gx, gy - 8, tx, tgt.centerY)) { gx = b.x; gy = b.y; }
      this.goal = { x: gx, y: gy };
      const los = world.dungeon.lineOfSight(b.x, b.y - 8, tx, tgt.centerY);
      const range = this.bot.cls.basic.shot?.range ?? 200;
      this.inRange = los && dist < range * 0.8;
      if (!los || dist > range * 0.8) this.goal = { x: tx, y: ty };
      if (near) this.inRange = false;
    }
    // Zielen mit kleiner menschlicher Ungenauigkeit
    const j = (1 - this.style.skill) * 10;
    this.aim = { x: tx + (Math.random() - 0.5) * j, y: tgt.centerY + (Math.random() - 0.5) * j };
  }

  // ------------------------------------------------------------------ Fähigkeiten
  #abilities(world, tgt, foes) {
    const b = this.bot;
    const dist = Math.hypot(tgt.x - b.x, tgt.y - b.y);
    const boss = !!(tgt.boss || tgt.def?.boss);
    const tough = boss || !!tgt.def?.elite || !!tgt.rareId;
    const near = (r, x = b.x, y = b.y) => foes.filter((e) => Math.hypot(e.x - x, e.y - y) < r).length;
    const los = world.dungeon.lineOfSight(b.x, b.y - 8, tgt.x, tgt.centerY);
    const hpf = b.hp / b.maxHp;
    const use = (id, cond) => {
      if (!cond) return false;
      const i = b.abilities.findIndex((a) => a.id === id);
      const a = b.abilities[i];
      if (!a || a.locked || a.cdLeft > 0 || b.resource < a.cost) return false;
      if (b.state !== 'move' && b.state !== 'attack') return false;
      this.input.press(a.action);
      return true;
    };
    // Nicht jede Gelegenheit nutzen: Spieler sind nicht perfekt
    if (Math.random() > 0.55 + this.style.skill * 0.4) return;
    switch (b.classId) {
      case 'warrior':
        use('battle_shout', hpf < 0.6 || (this.role === 'tank' && (boss || foes.length >= 3))) ||
        use('whirlwind', near(32) >= 2) ||
        use('charge', dist > 55 && dist < 150 && los) ||
        use('earthshatter', dist < 70 && (tough || near(70) >= 3));
        break;
      case 'rogue':
        use('shadow_step', dist > 45 && dist < 110 && los) ||
        use('poison_blades', dist < 40 && (tough || foes.length >= 2)) ||
        use('assassinate', dist < 90 && los && (tough || tgt.hp / tgt.maxHp < 0.45)) ||
        use('fan_of_knives', near(60) >= 3 || (near(50) >= 2 && b.resource > 80));
        break;
      case 'ranger':
        use('fire_trap', foes.some((e) => this.party.targetOf(e) === b && Math.hypot(e.x - b.x, e.y - b.y) < 60)) ||
        use('arrow_rain', los && dist < 170 && (tough || near(40, tgt.x, tgt.y) >= 3)) ||
        use('piercing_shot', los && dist < 180 && tough) ||
        use('volley', los && dist < 150 && near(45, tgt.x, tgt.y) >= 2);
        break;
      case 'mage':
        use('blink', foes.some((e) => this.party.targetOf(e) === b && Math.hypot(e.x - b.x, e.y - b.y) < 28) && hpf < 0.7) ||
        use('flame_nova', near(30) >= 1 && (hpf < 0.8 || near(30) >= 2)) ||
        use('meteor', los && dist < 170 && (tough || near(40, tgt.x, tgt.y) >= 3)) ||
        use('fireball', los && dist < 180 && (tough || near(35, tgt.x, tgt.y) >= 2));
        break;
    }
  }

  #potion(world) {
    const b = this.bot;
    if (this.potions <= 0 || this.potionCd > 0 || b.hp / b.maxHp > 0.3 || !this.party.inCombat) return;
    this.potions--;
    this.potionCd = 22;
    b.heal(b.maxHp * 0.4, world);
    world.bus.emit('aura', { actor: b, element: 'nature' });
  }

  // ------------------------------------------------------------------ Folgen
  #follow(world, t) {
    const b = this.bot, P = this.party, h = P.player;
    this.aim = null;
    // Formation relativ zur Laufrichtung des Spielers
    const mv = P.playerDir;
    const slot = P.slotFor(this);
    const px = -mv.y, py = mv.x;
    const sx = h.x + mv.x * slot.ahead + px * slot.side + this.slotJitter.x;
    const sy = h.y + mv.y * slot.ahead * 0.8 + py * slot.side * 0.8 + this.slotJitter.y;
    const d = Math.hypot(sx - b.x, sy - b.y);
    // Menschliche Pausen: kurz stehen bleiben, wenn der Spieler auch steht
    this.nextPause -= 0.15;
    if (this.nextPause <= 0 && P.playerIdle > 1.5) { this.pause = 0.8 + Math.random() * 2.2; this.nextPause = 8 + Math.random() * 16; }
    if (this.pause > 0) { this.pause -= 0.15; this.goal = null; return; }
    if (this.moving ? d > 7 : d > 26) {
      const free = !world.dungeon.collidesRect(sx - 4, sy - 3, sx + 4, sy + 1);
      this.goal = free ? { x: sx, y: sy } : { x: h.x, y: h.y };
    } else this.goal = null;
  }

  // ------------------------------------------------------------------ Laufen
  #steer(dt, world) {
    const b = this.bot, g = this.goal, P = this.party;
    if (!g) { this.input.stick = { x: 0, y: 0 }; this.moving = false; this.stuck = 0; return; }
    const dx = g.x - b.x, dy = g.y - b.y, d = Math.hypot(dx, dy);
    if (d < 4) { this.input.stick = { x: 0, y: 0 }; this.moving = false; return; }
    let v;
    if (world.dungeon.lineOfSight(b.x, b.y - 2, g.x, g.y - 2)) v = norm(dx, dy);
    else v = P.pathDir(b) ?? norm(dx, dy);
    // Hindernis direkt voraus: seitlich vorbei
    const ahead = (u) => world.dungeon.collidesRect(b.x + u.x * 9 - 4, b.y + u.y * 9 - 3, b.x + u.x * 9 + 4, b.y + u.y * 9 + 1);
    if (ahead(v)) {
      for (const a of [0.7, -0.7, 1.4, -1.4]) {
        const u = { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
        if (!ahead(u)) { v = u; break; }
      }
    }
    // Im Kampf nicht in Warnflächen laufen
    if (P.inCombat && unsafe(world, b.x + v.x * 14, b.y + v.y * 14)) v = { x: -v.y * this.side, y: v.x * this.side };
    const speed = d > 40 || P.inCombat ? 1 : 0.55 + d / 90;
    this.input.stick = { x: v.x * speed, y: v.y * speed };
    this.moving = true;
    // Festgefahren? (zählt nur, wenn er laufen will)
    const moved = Math.hypot(b.x - this.lastPos.x, b.y - this.lastPos.y);
    this.lastPos = { x: b.x, y: b.y };
    this.stuck = moved < 12 * dt ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 2.5) { this.stuck = 0; P.unstick(b); }
  }
}

function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
