import { CONFIG } from '../config.js';
import { EV } from '../core/events.js';
import { h } from '../core/dom.js';
import { Npc } from '../entities/Npc.js';
import { Decor } from '../entities/Decor.js';
import { getFolkSprites } from '../sprites/hero.js';
import { OUTFITS } from '../sprites/folk.js';
import { createServiceSigns } from '../sprites/decor_signs.js';
import { panelFrame, reactive } from '../progression/widgets.js';
import { PVP_MIN_LEVEL } from '../pvp/rules.js';
import { roomAt } from './interiors.js';

// Dienste in den Städten wie in klassischen Online-Rollenspielen: Manche Häuser haben eine feste Aufgabe
// (level.interiors[].service aus world/townHouses.js), andere Dienste stehen weiter draußen.
//   auction  Auktionshaus – der Auktionator steht drinnen (market/places.js room)
//   arena    Haus der Glutarena – Arenameister (hier), öffnet die Glutarena in der Dungeonsuche
//   tailor   Schneiderei – Gewandmeisterin mit Spiegel (transmog/places.js room)
//   smith    Schmiede – der Schmied des Ortes zieht hinein (townHouses.js npc)
//   herbs    Kräuterstube – die Alchemistin zieht hinein
// Vor jeder dieser Türen steht ein Zunftschild (sprites/decor_signs.js), damit man dem Haus ansieht, was drin ist.
// Wegbeschreibung: Wachen (townlife.js) und der Wegweiser am Wegstein öffnen das Fenster 'directions'. Ein Ziel dort
// legt die Glutspur (QuestGuide.lead) dorthin; die Wache sagt dazu, in welche Richtung es geht.
const T = CONFIG.tileSize;

export const SERVICE_NAMES = { auction: 'Auktionshaus', arena: 'Glutarena', tailor: 'Schneiderei', smith: 'Schmiede', herbs: 'Kräuterstube' };

// Wegweiser neben dem Wegstein (Abstand in Spielpixeln, wie market/places.js); Städte der Stufen 1–40
export const WAY_SIGNS = {
  emberhollow: { dx: -40, dy: 30 },
  ashwood: { dx: -40, dy: 8 },
  cinder_peaks: { dx: -40, dy: 30 },
  ashen_steppe: { dx: -40, dy: 30 },
  blighted_marsh: { dx: 40, dy: 14 },
  frostspire: { dx: 0, dy: 46 },
  ember_wastes: { dx: -40, dy: 30 },
};

// Arenameister: Standplatz im Raum (Kachel der Vorlage 'arena', world/houses.js)
const ARENA_SPOT = [6, 5];
const ARENA_MASTER = { name: 'Arenameister', title: 'Glutarena', facing: 1 };
let masterAnims = null;
const arenaMasterAnims = () => (masterAnims ??= getFolkSprites('human', 1, { ...OUTFITS.guard, chest: { style: 'chain', ramp: OUTFITS.guard.chest.ramp, tabard: ['#1a0a08', '#3a1210', '#6a1c14', '#9a2a1c', '#c84a2a'] }, cloth: ['#1a0a08', '#3a1210', '#6a1c14', '#9a2a1c', '#c84a2a'] }, 'arenamaster'));

class ArenaMaster extends Npc {
  prompt() { return 'Glutarena'; }
  interact(world) {
    this.talkTime = 2.5;
    this.animator.play('talk', true);
    this.facing = world.hero.x < this.x ? -1 : 1;
    const level = world.state.slices.progress?.level ?? 1;
    if (level < PVP_MIN_LEVEL) world.bus.emit(EV.UI_TOAST, { text: `Arenameister: „Komm wieder, wenn du Stufe ${PVP_MIN_LEVEL} erreicht hast.“`, kind: 'info' });
    else world.session.panels?.open('finder', { tab: 'arena' });
  }
}

// Zunftschild vor der Tür: Name des Dienstes in der Nähe
class ServiceSign extends Decor {
  constructor(x, y, opts, world, label) { super(x, y, opts, world); this.label = label; }
  renderEmissive(ctx, cx, cy) {
    super.renderEmissive?.(ctx, cx, cy);
    const hero = this.world.hero, font = this.world.session.font;
    if (!font || !hero || Math.hypot(hero.x - this.x, hero.y - this.y) > 80 || roomAt(this.world, hero.x, hero.y)) return;
    font.draw(ctx, this.label.toUpperCase(), Math.round(this.x - cx + (this.flip ? -17 : 17)), Math.round(this.y - cy - 58), { color: '#e8c25a', align: 'center', shadow: true });
  }
}

// Wegweiser: Schild zum Lesen (öffnet die Wegbeschreibung)
class WaySign extends Decor {
  constructor(x, y, opts, world) { super(x, y, opts, world); this.interactRange = 22; }
  canInteract(world) { return !world.hero.dead; }
  prompt() { return 'Wegweiser lesen'; }
  promptAnchor() { return { x: this.x, y: this.y - 50 }; }
  interact(world) { world.session.panels?.open('directions', { asker: null }); }
}

export function installTownServices(game) {
  game.panels.register('directions', (s, p) => reactive(s, directionsView(s, p)), { title: 'Wegbeschreibung' });
  game.addSessionSystem('townServices', (sess) => {
    const offs = [
      sess.bus.on(EV.ZONE_ENTER, () => { try { placeServices(sess.world); } catch (err) { console.error('townServices', err); } }),
      sess.bus.on('town:askWay', (e) => sess.panels?.open('directions', { asker: e.asker })),
    ];
    return { dispose: () => offs.forEach((off) => off?.()) };
  }, 27);   // nach Auktionator, Post und Gewandmeisterin (25/26)
}

function placeServices(world) {
  if (!world || world.zone?.instanced || world.props.some((p) => p.serviceSign)) return;
  const L = world.dungeon.level, signs = createServiceSigns();
  for (const it of L.interiors ?? []) {
    if (!it.service || !signs[it.service]) continue;
    if (it.service === 'arena') placeArenaMaster(world, it);
    const at = signSpot(world, it);
    if (!at) continue;
    const sign = new ServiceSign(at.x, at.y, { sprite: signs[it.service].sprite, flip: at.flip }, world, SERVICE_NAMES[it.service]);
    sign.serviceSign = it.service;
    world.props.push(sign);
  }
  const ws = WAY_SIGNS[world.zone?.id], stone = world.waystone;
  if (ws && stone) {
    const p = world.dungeon.nearestFree(stone.x + ws.dx, stone.y + ws.dy, 8);
    const sign = new WaySign(p.x, p.y, { sprite: signs.way.sprite, shadow: 12, box: [-3, -3, 3, 1] }, world);
    sign.serviceSign = 'way';
    world.props.push(sign);
    world.interactables.push(sign);
  }
  world.flow?.rebuildBlocked?.();
}

// Platz für das Schild: neben dem Stehplatz vor der Tür (nicht darauf), rechts bevorzugt (it.sign = -1: links).
// Das Brett hängt von der Tür weg, damit es weder die Tür noch Figuren davor verdeckt.
function signSpot(world, it) {
  const d = world.dungeon, fx = (it.door.x + 0.5) * T, fy = (it.door.y + 1) * T + 10, side = it.sign ?? 1;
  for (const [ox, oy] of [[24, 0], [-24, 0], [28, 8], [-28, 8], [32, -2], [-32, -2]]) {
    const x = fx + ox * side, y = fy + oy;
    if (!d.collidesRect(x - 3, y - 3, x + 3, y + 1)) return { x, y, flip: ox * side < 0 };
  }
  return null;
}

function placeArenaMaster(world, it) {
  if (world.npcs.some((n) => n.npcId === 'arena_master' && n.roomId === it.id)) return;
  const [dx, dy] = ARENA_SPOT;
  const x = (it.room.x + dx + 0.5) * T, y = (it.room.y + dy + 0.5) * T + 4;
  const npc = world.spawn(new ArenaMaster('arena_master', x, y, ARENA_MASTER, arenaMasterAnims(), world));
  npc.roomId = it.id;
  world.interactables.push(npc);
  world.npcs.push(npc);
}

// ---------------------------------------------------------------- Wegbeschreibung
// Ziele dieser Zone: Dienste, Händler und Handwerker, Briefkasten, Bank, Glutpforte, Wegstein
function destinations(world) {
  const c = world.session.content, out = [];
  const npc = (id) => world.npcs.find((n) => n.npcId === id && !n.removed);
  const add = (key, label, sub, target) => { if (target) out.push({ key, label, sub, target }); };
  add('auction', 'Auktionshaus', 'Auktionator', npc('auctioneer'));
  add('arena', 'Glutarena', 'Arenameister', npc('arena_master'));
  add('tailor', 'Gewandmeisterin', 'Aussehen wechseln', npc('transmog'));
  for (const n of world.npcs) {
    const v = n.npcId && c.find('vendor', n.npcId);
    if (!v || n.removed) continue;
    add(`v:${n.npcId}`, n.def?.name ?? n.npcId, v.craft ? 'Schmied' : 'Händler', n);
  }
  const mail = world.props.filter((p) => p.mailboxId);
  add('mail', 'Briefkasten', 'Rabenpost', nearest(world, mail));
  add('bank', 'Lagerkiste', 'Bank', world.interactables.find((o) => o.kind === 'bank'));
  add('trial', 'Glutpforte', 'Glutprüfungen', world.interactables.find((o) => o.kind === 'trial'));
  add('waystone', 'Wegstein', 'Reisen', world.waystone);
  return out;
}
const nearest = (world, list) => list.reduce((best, o) => (!best || Math.hypot(o.x - world.hero.x, o.y - world.hero.y) < Math.hypot(best.x - world.hero.x, best.y - world.hero.y) ? o : best), null);

// Himmelsrichtung vom Fragenden zum Ziel (draußen: vor die Haustür) als ganzer Satz
const NEAR = ['Gleich östlich von hier.', 'Gleich südöstlich von hier.', 'Gleich südlich von hier.', 'Gleich südwestlich von hier.', 'Gleich westlich von hier.', 'Gleich nordwestlich von hier.', 'Gleich nördlich von hier.', 'Gleich nordöstlich von hier.'];
const FAR = ['Ein gutes Stück nach Osten.', 'Ein gutes Stück nach Südosten.', 'Ein gutes Stück nach Süden.', 'Ein gutes Stück nach Südwesten.', 'Ein gutes Stück nach Westen.', 'Ein gutes Stück nach Nordwesten.', 'Ein gutes Stück nach Norden.', 'Ein gutes Stück nach Nordosten.'];
const SHORT = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
function outside(world, o) {
  const it = roomAt(world, o.x, o.y - 8);
  return it ? { x: (it.door.x + 0.5) * T, y: (it.door.y + 1.5) * T, it } : { x: o.x, y: o.y, it: null };
}
function bearing(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
  const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return { k, dist };
}

function directionsView(s, { asker = null } = {}) {
  return () => {
    const world = s.world;
    const from = asker ?? world.hero;
    const list = destinations(world);
    const go = (d) => {
      const o = outside(world, d.target), b = bearing(from, o);
      world.guide?.lead(d.target.npcId ? { npc: d.target } : { x: d.target.x, y: d.target.y + 6, near: 20 });
      const line = b.dist < 56 ? 'Direkt hier.' : b.dist < 260 ? NEAR[b.k] : FAR[b.k];
      if (asker?.sayNow) asker.sayNow(world, line);
      s.bus.emit(EV.UI_TOAST, { text: `Folge der Glutspur: ${d.label}`, kind: 'quest' });
      s.panels.close();
    };
    const rows = list.map((d) => {
      const o = outside(world, d.target), b = bearing(from, o);
      return h('button.pg-tab.tw-dest', { type: 'button', onclick: () => go(d) },
        h('b', d.label),
        h('small', d.sub),
        h('small.tw-dir', b.dist < 56 ? 'hier' : SHORT[b.k]),
        o.it ? h('small.tw-in', 'im Haus') : null);
    });
    return panelFrame(s, 'dialog', 'Wegbeschreibung',
      h('div.pg-scroll.pg-dialog',
        h('p.pg-dialog-text', asker ? '„Wohin willst du? Ich zeig dir den Weg.“' : 'Auf dem Wegweiser stehen alle Wege im Ort.'),
        rows.length ? h('div.tw-dests', rows) : h('p.pg-hint', 'Hier gibt es nichts, wohin der Weg führt.')));
  };
}
