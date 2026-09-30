import { CONFIG } from '../config.js';

// Platzierte Gegnergruppen statt Wellen.
// - Gegner-Markierungen der Karte werden nach Nähe zu Gruppen (Rudel, Wachen)
//   zusammengefasst. Entdeckt einer den Helden, alarmiert er seine Gruppe.
// - Besiegte Gegner kehren nach `respawn` Sekunden an ihren Platz zurück –
//   aber nie im Sichtfeld des Spielers. In Instanzen (Dungeon) ist respawn
//   Infinity: Die Instanz bleibt geräumt, bis sie neu betreten wird.
// - Angriffsmarken: höchstens N Gegner holen gleichzeitig zum Angriff aus,
//   damit Rudel fair und lesbar bleiben.
const GROUP_LINK = 5 * CONFIG.tileSize;

export class Spawner {
  constructor(world, marks, { respawn = Infinity, maxAttackers = 2 } = {}) {
    this.world = world;
    this.respawn = respawn;
    this.maxAttackers = maxAttackers;
    this.slots = [];
    this.groups = [];
    // Gruppenbildung: einfache Verbundkomponenten über Abstand
    const pending = marks.filter((m) => !m.boss).map((m) => ({ mark: m, group: null }));
    let gid = 0;
    for (const p of pending) {
      if (p.group !== null) continue;
      p.group = gid;
      const stack = [p];
      while (stack.length) {
        const a = stack.pop();
        for (const b of pending) {
          if (b.group !== null) continue;
          if (Math.hypot(a.mark.x - b.mark.x, a.mark.y - b.mark.y) <= GROUP_LINK) { b.group = gid; stack.push(b); }
        }
      }
      gid++;
    }
    for (let g = 0; g < gid; g++) this.groups.push([]);
    for (const p of pending) {
      const slot = { mark: p.mark, group: p.group, actor: null, deadFor: 0 };
      this.slots.push(slot);
      this.groups[p.group].push(slot);
      this.#spawn(slot, false);
    }
  }

  #spawn(slot, respawned) {
    const m = slot.mark;
    slot.actor = this.world.spawnEnemy(m.type, m.x, m.y, {
      group: slot.group, home: { x: m.x, y: m.y },
      dormant: !respawned && m.dormant, ambush: !respawned && m.ambush, respawned,
    });
    slot.deadFor = 0;
  }

  update(dt) {
    if (this.respawn === Infinity) return;
    const w = this.world, h = w.hero;
    const view = w.view;
    for (const s of this.slots) {
      if (!s.actor.dead) continue;
      s.deadFor += dt;
      if (s.deadFor < this.respawn) continue;
      const m = s.mark;
      const onScreen = m.x > view.x - 24 && m.x < view.x + CONFIG.viewWidth + 24 && m.y > view.y - 32 && m.y < view.y + CONFIG.viewHeight + 24;
      if (onScreen || Math.hypot(h.x - m.x, h.y - m.y) < 160) continue;
      this.#spawn(s, true);
    }
  }

  // Ein Gegner hat den Helden entdeckt -> Gruppe in der Nähe greift mit an.
  alert(enemy, world) {
    const members = this.groups[enemy.group];
    if (!members) return;
    for (const s of members) {
      const a = s.actor;
      if (a === enemy || a.dead || a.aggroed) continue;
      if (Math.hypot(a.x - enemy.x, a.y - enemy.y) < 170) a.aggro(world, { alertGroup: false });
    }
  }

  // Heulen des Rudelführers: Rudel wird kurz schneller
  rally(enemy, world) {
    for (const e of world.enemies) {
      if (e.dead || e.def.family !== enemy.def.family) continue;
      if (Math.hypot(e.x - enemy.x, e.y - enemy.y) < 180) {
        e.speedBoost = 6;
        if (!e.aggroed && !e.isHidden) e.aggro(world, { alertGroup: false });
      }
    }
  }

  canAttack(enemy) {
    let n = 0;
    for (const e of this.world.enemies) {
      if (e === enemy || e.dead || e.def.boss) continue;
      if (e.state === 'windup' || e.state === 'strike') n++;
    }
    return n < this.maxAttackers;
  }
}
