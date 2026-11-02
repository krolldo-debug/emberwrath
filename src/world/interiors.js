import { CONFIG } from '../config.js';
import { Entity } from '../entities/Entity.js';

// Begehbare Häuser (level.interiors). Die Innenräume liegen als abgeschirmte Kammern in derselben Zone (Sternhafen:
// dunkler Bereich östlich der Stadt). Haustür außen = Versetzen in den Raum, Türlücke unten im Raum = zurück vor die
// Haustür. Kein Zonenwechsel: Welt-Verbindung, Mitspieler und Spielstand bleiben unberührt (Mitspieler sehen einen
// Sprung, RemotePlayer interpoliert ihn nicht).
//   level.interiors: [{ id, name, door: {x,y}, room: {x,y,w,h}, spawn: {x,y}, exit: {x,y}, locked? }] in Kacheln.
//   door = Haustür (feste Kachel), davor steht man auf door.y + 1; exit = Türlücke in der untersten Raumzeile.
// Karte und Minikarte zeigen nur die Stadt (mapColumns); alles in einem Raum erscheint an seiner Haustür (mapPoint).
// Reiten geht in Räumen nicht (character/mounts.js noMountAt), die Questspur führt über die Türen (guideVia).
const T = CONFIG.tileSize;
const FADE_MS = 380;

const interiorsOf = (world) => world?.dungeon?.level?.interiors ?? null;
const inRoom = (it, tx, ty) => tx >= it.room.x && ty >= it.room.y && tx < it.room.x + it.room.w && ty < it.room.y + it.room.h;
const front = (it) => ({ x: (it.door.x + 0.5) * T, y: (it.door.y + 1.5) * T });
const center = (p) => ({ x: (p.x + 0.5) * T, y: (p.y + 0.5) * T });

// Raum an einer Weltposition (Pixel) oder null
export function roomAt(world, x, y) {
  const list = interiorsOf(world);
  if (!list) return null;
  const tx = x / T, ty = y / T;
  return list.find((it) => inRoom(it, tx, ty)) ?? null;
}

// Position für Karte und Minikarte: Was in einem Raum ist, steht an der Haustür.
export function mapPoint(world, x, y) {
  const it = roomAt(world, x, y);
  if (!it) return { x, y };
  const f = front(it);
  return { x: f.x, y: f.y - T };
}

// Spalten der Karte: ohne den Bereich der Innenräume (alles ab dem westlichsten Rand des dunklen Bereichs bzw. Raums)
export function mapColumns(d) {
  const L = d.level, list = L?.interiors;
  if (!list?.length) return d.w;
  const xs = L.ramparts?.dark?.length ? L.ramparts.dark.map((r) => r[0]) : list.map((it) => it.room.x);
  return Math.max(1, Math.min(d.w, ...xs));
}

// Questspur: Ziel in einem anderen Raum (oder draußen, während man drinnen ist) → erst zur passenden Tür.
export function guideVia(world, goal) {
  if (!goal || !interiorsOf(world)) return goal;
  const h = world.hero;
  const here = roomAt(world, h.x, h.y), there = roomAt(world, goal.x, goal.y - 8);
  if (here === there) return goal;
  if (here) { const e = center(here.exit); return { x: e.x, y: e.y, near: 10, label: 'door' }; }
  const f = front(there);
  return { x: f.x, y: f.y, near: 12, label: 'door' };
}

function fade(world) {
  const root = world.session?.game?.ui?.root;
  if (!root || typeof document === 'undefined') return;
  let el = root.querySelector(':scope > .door-fade');
  if (!el) {
    el = document.createElement('div');
    el.className = 'door-fade';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { position: 'absolute', inset: '0', background: '#07060a', pointerEvents: 'none', opacity: '0', zIndex: '5' });
    root.append(el);
  }
  el.style.transition = 'none';
  el.style.opacity = '1';
  void el.offsetWidth;
  el.style.transition = `opacity ${FADE_MS}ms ease-out`;
  el.style.opacity = '0';
}

function moveHero(world, p) {
  const h = world.hero;
  h.x = p.x; h.y = p.y; h.vx = 0; h.vy = 0;
  world.session?.camera?.snapTo?.(h.x, h.y);
  world.session?.sfx?.play?.('thunk');
  fade(world);
}

// Haustür außen: „Eintreten: …“
class HouseDoor extends Entity {
  constructor(it) {
    const f = front(it);
    super(f.x, f.y - 4);
    this.it = it; this.interactRange = 20;
  }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return `Eintreten: ${this.it.name}`; }
  promptAnchor() { return { x: this.x, y: (this.it.door.y - 1) * T }; }
  interact(world) { moveHero(world, center(this.it.spawn)); }
}

// Türlücke im Raum: wer hineinläuft, steht wieder vor der Haustür
class RoomExit extends Entity {
  constructor(it) {
    const e = center(it.exit);
    super(e.x, e.y);
    this.it = it;
  }
  update(dt, world) {
    const h = world.hero;
    if (h.dead) return;
    const tx = Math.floor(h.x / T), ty = Math.floor(h.y / T);
    if (tx === this.it.exit.x && ty === this.it.exit.y) moveHero(world, front(this.it));
  }
}

export function placeInteriors(world, L) {
  for (const it of L.interiors ?? []) {
    if (it.locked) continue;
    world.interactables.push(world.spawn(new HouseDoor(it)));
    world.spawn(new RoomExit(it));
  }
}
