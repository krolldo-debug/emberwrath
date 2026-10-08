import { CONFIG } from '../config.js';
import { canBeChampion, CHAMPION } from '../entities/Enemy.js';

// Platzierte Gegnergruppen statt Wellen.
// - Gegner-Markierungen der Karte werden nach Nähe zu Gruppen (Rudel, Wachen)
//   zusammengefasst. Entdeckt einer den Helden, alarmiert er seine Gruppe.
// - Besiegte Gegner kehren nach `respawn` Sekunden an ihren Platz zurück –
//   aber nie im Sichtfeld des Spielers. In Instanzen (Dungeon) ist respawn
//   Infinity: Die Instanz bleibt geräumt, bis sie neu betreten wird.
// - Angriffsmarken: höchstens N Gegner holen gleichzeitig zum Angriff aus,
//   damit Rudel fair und lesbar bleiben.
const GROUP_LINK = 5 * CONFIG.tileSize;
// Schlafregel (nur offene Gebiete mit Respawn, d. h. große Außenkarten): ruhige Gegner (idle/versteckt,
// nicht alarmiert) weiter als SLEEP_R vom Helden verlassen world.actors – kein Update, kein Zeichnen,
// keine Paarprüfung in separateActors. Sie bleiben in world.enemies (Minimap, Questziele, Gruppen).
// Aufwecken (jedes Bild geprüft, auch nach Teleport/Wiederbelebung) unter WAKE_R oder sobald alarmiert –
// WAKE_R liegt weit außerhalb jeder Sicht (640×360 → halbe Diagonale ≈ 370 px) und jeder Aggro-Reichweite.
const SLEEP_R = 60 * CONFIG.tileSize;
const WAKE_R = 48 * CONFIG.tileSize;
const CALM = new Set(['idle', 'dormant', 'ceiling']);

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
    // Rudel nicht im Raster: jede Marke einer Gruppe ab 3 Tieren leicht (deterministisch) versetzen, nur auf freien Boden
    const sizes = new Map();
    for (const p of pending) sizes.set(p.group, (sizes.get(p.group) ?? 0) + 1);
    const map = world.dungeon;
    for (const p of pending) {
      if (sizes.get(p.group) < 3 || !map?.collidesRect) continue;
      const m = p.mark, h = Math.sin(m.x * 12.9898 + m.y * 78.233) * 43758.5453, u = h - Math.floor(h);
      const h2 = Math.sin(m.x * 39.3468 + m.y * 11.135) * 24634.6345, v = h2 - Math.floor(h2);
      const x = m.x + (u - 0.5) * 18, y = m.y + (v - 0.5) * 14;
      if (!map.collidesRect(x - 5, y - 5, x + 5, y + 2)) p.mark = { ...m, x, y };
    }
    for (const p of pending) {
      const slot = { mark: p.mark, group: p.group, actor: null, deadFor: 0 };
      this.slots.push(slot);
      this.groups[p.group].push(slot);
      this.#spawn(slot, false);
    }
    // Champion-Gegner (Runde 5): in Instanzen höchstens einer, mit 25 % Chance
    if (this.respawn === Infinity && Math.random() < CHAMPION.chanceDungeon) {
      const pool = this.slots.map((s) => s.actor).filter(canBeChampion);
      if (pool.length) pool[Math.floor(Math.random() * pool.length)].makeChampion();
    }
  }

  #spawn(slot, respawned) {
    const m = slot.mark;
    slot.actor = this.world.spawnEnemy(m.type, m.x, m.y, {
      group: slot.group, home: { x: m.x, y: m.y },
      dormant: !respawned && m.dormant, ambush: !respawned && m.ambush, respawned,
    });
    slot.deadFor = 0;
    // Champion-Gegner (Runde 5): in offenen Zonen bei jedem (Wieder-)Erscheinen ~3 %
    if (this.respawn !== Infinity && canBeChampion(slot.actor) && Math.random() < CHAMPION.chanceOutdoor) slot.actor.makeChampion();
  }

  update(dt) {
    if (this.respawn === Infinity) return;
    this.#sleep();
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

  #sleep() {
    const w = this.world, h = w.hero;
    if (!h) return;
    let fell = false;
    const s2 = SLEEP_R * SLEEP_R, w2 = WAKE_R * WAKE_R;
    for (const e of w.enemies) {
      const dx = e.x - h.x, dy = e.y - h.y, d2 = dx * dx + dy * dy;
      if (e.sleeping) {
        if (d2 < w2 || e.aggroed || e.dead || e.removed || !CALM.has(e.state)) {
          e.sleeping = false;
          if (!e.removed && !w.actors.includes(e)) w.actors.push(e);
        }
      } else if (d2 > s2 && !e.dead && !e.aggroed && !e.def?.boss && CALM.has(e.state)) {
        e.sleeping = true;
        fell = true;
      }
    }
    if (fell) w.actors = w.actors.filter((a) => !a.sleeping);
  }

  // Prüfhilfe: Anzahl schlafender Gegner
  get sleeping() { let n = 0; for (const e of this.world.enemies) if (e.sleeping) n++; return n; }

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
