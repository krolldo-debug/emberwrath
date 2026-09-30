import { Hero } from '../entities/Hero.js';
import { EV } from '../core/events.js';
import { computeStats } from './stats.js';
import { DEFAULT_RACE } from './races.js';
import { DEFAULT_CLASS } from './classes.js';
import { getHeroSprites } from '../sprites/hero.js';
import { resolveGear, gearKey } from './gearLook.js';
import { PASSIVES, TALENT_TIERS } from './talents.js';
import { spriteStyle } from './cosmetics.js';

// VERTRAG (Thread A): erzeugt den Spieler-Actor für die aktuelle Sitzung
// aus dem character-Slice (Volk, Klasse, Aussehen) und computeStats().
// Wird von World aufgerufen: createHero(session, x, y) -> Hero (team 'hero') mit
// hp, maxHp, resource, maxResource, resourceType, resourceName, resourceColor,
// stamina, maxStamina, dead, abilities [{ id, name, icon, action, cooldown, cdLeft, cost, ready }].
// Werte werden bei jeder Zustandsänderung (Ausrüstung, Stufe) neu berechnet;
// beim Stufenaufstieg wird der Held voll geheilt.
const wired = new WeakSet();

export function createHero(session, x, y) {
  const { state, content } = session;
  const ch = state.slices.character ?? {};
  const cls = content.find('class', ch.classId) ?? content.get('class', DEFAULT_CLASS);
  const raceId = content.find('race', ch.raceId) ? ch.raceId : DEFAULT_RACE;
  const gear = resolveGear(state.slices.inventory?.equipment, content);
  const anims = getHeroSprites(raceId, cls.id, ch.appearance?.variant ?? 0, gear, spriteStyle(ch.appearance));
  const abilities = cls.abilities.map((id) => content.get('ability', id));
  const hero = new Hero(x, y, { anims, cls, stats: computeStats(state, content), abilities });
  hero.raceId = raceId;
  hero.gearKey = lookKey(gear, ch.appearance);
  wireSession(session);
  return hero;
}

// Ausrüstung und Kosmetik sichtbar machen: bei Änderung neue Sprites setzen.
const lookKey = (gear, a) => `${gearKey(gear)}|${a?.variant ?? 0}|${a?.dye ?? ''}|${a?.hairStyle ?? ''}`;
function refreshLook(session, h) {
  const { state, content } = session;
  const gear = resolveGear(state.slices.inventory?.equipment, content);
  const ch = state.slices.character ?? {};
  const key = lookKey(gear, ch.appearance);
  if (key === h.gearKey) return;
  h.gearKey = key;
  h.setAnims(getHeroSprites(h.raceId, h.classId, ch.appearance?.variant ?? 0, gear, spriteStyle(ch.appearance)));
}

// Stufenaufstieg: neue Fähigkeiten, Passive und Talentreihen ankündigen.
// Zusätzlich 'character:unlock' { kind: 'ability'|'passive'|'talents', id, name, level } für Banner/Effekte.
const lastPointToast = new WeakMap();
function announceUnlocks(session, level) {
  const { content, state, bus } = session;
  if (!level) return;
  const cls = content.find('class', state.slices.character?.classId);
  if (!cls) return;
  let said = false;
  const say = (kind, id, name, text) => {
    said = true;
    // Die große Freischalt-Karte zeigt D (ui) auf 'character:unlock'; kein eigener Toast mehr.
    bus.emit('character:unlock', { kind, id, name, level, text });
  };
  for (const id of cls.abilities) {
    const a = content.find('ability', id);
    if (a?.level === level) say('ability', id, a.name, `Neue Fähigkeit: ${a.name}`);
  }
  for (const p of PASSIVES[cls.id] ?? []) if (p.level === level) say('passive', p.id, p.name, `Neue Passive: ${p.name}`);
  const tier = TALENT_TIERS.findIndex((t) => t.level === level);
  if (tier > 0) say('talents', `tier${tier}`, TALENT_TIERS[tier].name, `Neue Talentreihe: ${TALENT_TIERS[tier].name}`);
  // Mehrere Stufen auf einmal: den Talentpunkt-Hinweis nur einmal zeigen
  const now = performance.now();
  if (level >= 2 && !said && now - (lastPointToast.get(session) ?? -1e9) > 1500) {
    lastPointToast.set(session, now);
    bus.emit(EV.UI_TOAST, { text: 'Neuer Talentpunkt verfügbar', kind: 'info' });
  }
}

// Einmal pro Sitzung: Werte nachführen und Wut aus eigenen Treffern speisen.
// Die Handler lesen immer den aktuellen Helden (session.world.hero), damit ein
// Zonenwechsel (neue Welt, neuer Held) keine alten Abos hinterlässt.
function wireSession(session) {
  if (wired.has(session)) return;
  wired.add(session);
  const hero = () => session.world?.hero;
  const refresh = (fill) => {
    const h = hero();
    if (h?.applyStats) h.applyStats(computeStats(session.state, session.content), { fill: fill && !h.dead });
    if (h?.setAnims) refreshLook(session, h);
  };
  session.bus.on(EV.STATE_CHANGED, () => refresh(false));
  session.bus.on(EV.LEVEL_UP, (e) => { refresh(true); announceUnlocks(session, e?.level); });
  session.bus.on('hit', (e) => {
    const h = hero();
    if (h && (e.attacker === h || e.attacker?.hero === h)) h.onDealtHit(e, session.world);
  });
}
