import { EV } from '../core/events.js';
import { Hero } from '../entities/Hero.js';
import { createCompanion } from '../finder/companion.js';
import { makeView } from '../finder/Party.js';
import { ArenaBrain } from './ArenaBrain.js';

// Herausforderer in der Glutarena: ein echter Hero (Figur, Ausrüstung, Fähigkeiten wie ein Spieler der Stufe 40,
// gebaut wie die Söldner der Dungeonsuche) mit eigener Sicht auf die Welt:
//   - sein Gegner ist der eigene Held (world.enemies), seine Eingabe kommt von ArenaBrain
//   - seine Trefferzonen und Geschosse gehören zur Seite 'foe' und treffen nur den eigenen Held, nie ihn selbst
//   - kein Zugriff auf den Spielstand, keine Hinweise auf dem Bildschirm, Bildschirmwackeln gedämpft
// Er steht in world.actors und world.enemies (Zielhilfe, Geschosse und Trefferzonen des Spielers treffen ihn);
// killReported verhindert Beute, Erfahrung und Aufträge für ihn.
const MUTED = new Set([EV.UI_TOAST, EV.UI_BANNER, 'character:unlock']);
const NO_STATE = Object.freeze({ slices: Object.freeze({ character: Object.freeze({}), inventory: Object.freeze({}) }), commands: new Map(), commit: () => ({ ok: false }) });

export function createBotRival(session, foe, x, y, player) {
  const w = session.world;
  const member = {
    kind: 'merc', id: 'arena', name: foe.name, level: 40, role: 'dps', classId: foe.classId, raceId: foe.raceId,
    look: foe.look ?? {}, gearSeed: foe.seed >>> 0,
  };
  const bot = createCompanion(session, member, x, y);
  bot.companion = false;
  bot.rival = true;
  bot.team = 'foe';
  bot.killReported = true;
  bot.facing = player.x < x ? -1 : 1;
  const brain = new ArenaBrain(bot, player, foe.skill ?? 0.5);
  bot.brain = brain;

  const bus = makeView(session.bus, { emit: (type, p) => { if (!MUTED.has(type)) session.bus.emit(type, p); } });
  let cam = null;
  const camView = () => {
    const c = session.camera;
    if (!c) return null;
    if (cam?.src !== c) cam = { src: c, view: makeView(c, { shake: (v) => c.shake?.(v * 0.4), kick: () => {} }) };
    return cam.view;
  };
  const sessionView = makeView(session, { state: NO_STATE, bus, get camera() { return camView(); }, hitstop: () => {}, slowmo: () => {} });
  const combat = makeView(w.combat, { add: (h) => w.combat.add({ ...h, team: 'foe' }) });
  let view = null;
  // Was er in die Welt setzt (Geschosse, Fallen, Hiebbögen, Verzögerungen), läuft in seiner Sicht
  const adopt = (e) => {
    if (!e || e.arenaOwn) return e;
    e.arenaOwn = true;
    if (e.team === 'hero') e.team = 'foe';
    const orig = e.update;
    if (typeof orig === 'function') e.update = function (dt, world) { return orig.call(this, dt, world === w ? view : world); };
    return e;
  };
  view = makeView(w, {
    hero: bot, input: brain.input, session: sessionView, bus, combat,
    get aim() { return brain.aim; },
    get enemies() { return player.downed ? [] : [player]; },
    spawn: (e) => w.spawn(adopt(e)),
    addEffect: (e) => w.addEffect(adopt(e)),
    addProjectile: (p) => w.addProjectile(adopt(p)),
  });
  bot.view = view;
  bot.update = function (dt) { return Hero.prototype.update.call(this, dt, view); };
  w.actors.push(bot);
  w.enemies.push(bot);
  w.spriteWarm?.add?.(bot);
  return bot;
}
