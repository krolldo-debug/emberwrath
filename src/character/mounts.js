import { EV } from '../core/events.js';
import { CONFIG } from '../config.js';
import { getHeroSprites } from '../sprites/hero.js';
import { getMountSprites, composeRide } from '../sprites/mounts.js';
import { spriteStyle } from './cosmetics.js';

// Reittiere (Thread A, INTEGRATION §12.6). Reine Daten + Regeln, ohne DOM (serverfähig).
//
// content 'mount': { id, name, rarity, speed, sprite, source, desc }
//   speed  = Tempo-Bonus als Anteil (rare 0.6, epic 0.8, legendary 1.0), gilt zusätzlich zur Ausrüstungs-Obergrenze.
//   sprite = Körperbau in sprites/mounts.js (horse, wolf, strider, beetle, elk, drake) + Farben (look).
// Slice character.mounts = { owned: [mountId], active: mountId|null, riding: bool }
// Commands: mount:learn { mountId }, mount:select { mountId }, mount:toggle { riding? }
//   mount:toggle prüft nur den Spielstand (Stufe, Lektion, Besitz). Kampf, Zone und Fläche prüft der Held
//   (entities/Hero.js) vor dem Aufsitzen, weil nur er die Welt kennt.
// Selektor: game.character.canMount() -> { ok, reason: 'level'|'lesson'|'none'|'combat'|'zone'|'area'|null }
export const MOUNT_LEVEL = 20;
export const MOUNT_QUEST = 'q_first_ride';
export const MOUNT_CAST = 1.2;          // s Stillstand zum Aufsitzen
export const MOUNT_SPEED = { rare: 0.6, epic: 0.8, legendary: 1.0 };

const M = (name, rarity, sprite, look, source, desc) => ({ name, rarity, speed: MOUNT_SPEED[rarity], sprite, look, source, desc });

export const MOUNTS = {
  steppe_horse: M('Steppenpferd', 'rare', 'horse',
    { coat: 'bay', mane: 'dark', tack: 'leather' },
    'Stallmeisterin Orla, Aschensteppe', 'Ein ausdauerndes Pferd der Aschensteppe, gezüchtet für lange Ritte durch Staub und Wind.'),
  ash_wolf: M('Aschenwolf', 'rare', 'wolf',
    { coat: 'ash', mane: 'soot', tack: 'leather' },
    'Stallmeisterin Orla, Aschensteppe', 'Ein grauer Riesenwolf mit rußigem Fell. Treu, schnell und nie ganz zahm.'),
  marsh_strider: M('Sumpfschreiter', 'rare', 'strider',
    { coat: 'moss', mane: 'reed', tack: 'rope' },
    'Selten vom Moorgrauen in der Faulmarsch', 'Ein hochbeiniger Laufvogel, der trockenen Fußes durch jeden Sumpf stakst.'),
  bone_stallion: M('Knochenhengst', 'epic', 'horse',
    { coat: 'bone', mane: 'ghost', tack: 'iron', eyes: 'ghost' },
    'Selten vom Hügelkönig im Heulenden Hügelgrab', 'Ein Hengst aus bleichen Knochen, von grünem Totenlicht zusammengehalten.'),
  spore_beetle: M('Sporenkäfer', 'epic', 'beetle',
    { coat: 'spore', mane: 'cap', tack: 'rope', eyes: 'spore' },
    'Selten von Mutter Fäulnis im Sporenschlund', 'Ein gepanzerter Riesenkäfer, auf dessen Rücken leuchtende Pilze wachsen.'),
  frost_elk: M('Frostelch', 'epic', 'elk',
    { coat: 'frost', mane: 'snow', tack: 'silver', eyes: 'frost' },
    'Selten vom Frostwurm in den Reifhöhlen', 'Ein weißer Elch mit Geweih aus klarem Eis. Wo er tritt, knirscht Reif.'),
  ember_charger: M('Glutross', 'epic', 'horse',
    { coat: 'coal', mane: 'fire', tack: 'gold', eyes: 'fire' },
    'Stallmeisterin Orla, ab Stufe 40, nach Malgareths Fall', 'Ein schwarzes Schlachtross mit brennender Mähne, der Stolz der Stallmeisterin.'),
  cinder_drake: M('Schlackendrache', 'legendary', 'drake',
    { coat: 'cinder', mane: 'fire', tack: 'gold', eyes: 'fire', glow: 'fire' },
    'Äußerst selten vom Aschenfürsten im Aschethron', 'Ein junger Drache aus erkalteter Schlacke. In seinen Rissen glüht noch das Feuer des Throns.'),
  nightmare_steed: M('Albtraumross', 'legendary', 'horse',
    { coat: 'night', mane: 'shadow', tack: 'gold', eyes: 'shadow', glow: 'shadow' },
    'Äußerst selten aus den Glutprüfungen ab Stufe 20', 'Ein Ross aus Schatten und Rauch. Seine Hufe berühren den Boden kaum.'),
  // Exklusive Designs aus dem Shop (src/shop/catalog.js): nicht erspielbar, Besitz führt der Server (shop_entitlements).
  // Tempo wie epische Reittiere (kein Vorteil durch Echtgeld), Aussehen über allem, was es im Spiel gibt.
  phoenix_wing: { ...M('Phönixschwinge', 'legendary', 'drake',
    { coat: 'phoenix', mane: 'fire', tack: 'gold', eyes: 'fire', glow: 'fire' },
    'Exklusives Design aus dem Emberwrath-Shop', 'Ein Drache, aus der eigenen Asche wiedergeboren. Seine Schwingen sind reines Feuer, seine Schuppen glühendes Gold.'),
    speed: MOUNT_SPEED.epic, exclusive: true },
  astral_stallion: { ...M('Sternenhengst', 'legendary', 'horse',
    { coat: 'astral', mane: 'starlight', tack: 'astral', eyes: 'star', glow: 'astral' },
    'Exklusives Design aus dem Emberwrath-Shop', 'Ein Hengst aus dem Nachthimmel über der Aschensteppe. In seinem Fell leuchten die alten Sternbilder.'),
    speed: MOUNT_SPEED.epic, exclusive: true },
  soul_wolf: { ...M('Seelenwolf', 'legendary', 'wolf',
    { coat: 'spirit', mane: 'soul', tack: 'spirit', eyes: 'soul', glow: 'soul' },
    'Exklusives Design aus dem Emberwrath-Shop', 'Der Geist des ersten Wolfs, der dem Glutfeuer folgte. Er läuft lautlos und hinterlässt grünes Seelenlicht.'),
    speed: MOUNT_SPEED.epic, exclusive: true },
};

export const RARITY_NAME = { rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };

// Slice-Teil prüfen (Migration: fehlt -> leer; unbekannte Reittiere fallen weg)
export function cleanMounts(raw, has = (id) => !!MOUNTS[id]) {
  const owned = [...new Set(Array.isArray(raw?.owned) ? raw.owned.filter((id) => typeof id === 'string' && has(id)) : [])];
  const active = owned.includes(raw?.active) ? raw.active : owned[0] ?? null;
  return { owned, active, riding: !!raw?.riding && !!active };
}

// Stufe, Lektion und Besitz (ohne Welt). Fehlt die Quest noch im Inhalt, gilt die Lektion als erfüllt.
export function mountStateReason(slices, content) {
  if ((slices.progress?.level ?? 1) < MOUNT_LEVEL) return 'level';
  if (content.find('quest', MOUNT_QUEST) && !(slices.quests?.completed ?? []).includes(MOUNT_QUEST)) return 'lesson';
  if (!slices.character?.mounts?.active) return 'none';
  return null;
}

// Zone und Fläche. mountable fehlt -> Außengebiete ja, sonst nein (§12.2).
export function zoneMountable(zoneDef) { return zoneDef ? zoneDef.mountable ?? zoneDef.kind === 'outdoor' : false; }
export function noMountAt(world, x, y) {
  const areas = world?.dungeon?.level?.areas;
  if (!areas) return false;
  const ts = CONFIG.tileSize;
  const tx = x / ts, ty = y / ts;
  return areas.some((a) => a.noMount && tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h);
}

// Vollständige Prüfung mit Held und Welt (für Held, HUD, Touch-Knopf)
export function canMount(slices, content, hero = null, world = null) {
  const reason = mountStateReason(slices, content);
  if (reason) return { ok: false, reason };
  if (hero && (hero.combatTime ?? 99) < 3) return { ok: false, reason: 'combat' };
  if (world && !zoneMountable(world.zone)) return { ok: false, reason: 'zone' };
  if (world && hero && noMountAt(world, hero.x, hero.y)) return { ok: false, reason: 'area' };
  return { ok: true, reason: null };
}

export const MOUNT_REASON_TEXT = {
  level: `Ab Stufe ${MOUNT_LEVEL} bei Stallmeisterin Orla in der Aschensteppe`,
  lesson: 'Erst die Reitstunde bei Stallmeisterin Orla abschließen',
  none: 'Du besitzt noch kein Reittier',
  combat: 'Im Kampf kannst du nicht aufsitzen',
  zone: 'Hier kannst du nicht reiten',
  area: 'Hier kannst du nicht reiten',
};

export function installMounts(game) {
  const { content, state } = game;
  content.defineAll('mount', MOUNTS);
  const has = (id) => !!content.find('mount', id);

  state.defineCommand('mount:learn', (s, { mountId, shop = false }, ctx) => {
    if (!has(mountId)) return { ok: false, error: 'Unbekanntes Reittier.' };
    // Exklusive Designs nur über den Shop (shop:sync); der Server prüft den Besitz beim Speichern.
    if (content.find('mount', mountId).exclusive && !shop) return { ok: false, error: 'Dieses Reittier gibt es nur im Shop.' };
    const m = s.get('character').mounts;
    if (m.owned.includes(mountId)) return { ok: false, error: 'Dieses Reittier kennst du schon.', known: true };
    m.owned.push(mountId);
    if (!m.active) m.active = mountId;
    ctx.bus.emit(EV.MOUNT_LEARNED, { mountId });
    return { ok: true, mountId };
  }, { authoritative: true });

  state.defineCommand('mount:select', (s, { mountId }, ctx) => {
    const m = s.get('character').mounts;
    if (!m.owned.includes(mountId)) return { ok: false, error: 'Dieses Reittier besitzt du nicht.' };
    if (m.active === mountId) return { ok: true, mountId };
    m.active = mountId;
    if (m.riding) ctx.bus.emit(EV.MOUNT_CHANGED, { riding: true, mountId });
    return { ok: true, mountId };
  });

  // riding fehlt -> umschalten. Aufsitzen prüft den Spielstand; Absitzen geht immer.
  state.defineCommand('mount:toggle', (s, p = {}, ctx) => {
    const m = s.get('character').mounts;
    const want = p.riding ?? !m.riding;
    if (want) {
      const reason = mountStateReason(s.slices, ctx.content);
      if (reason) return { ok: false, reason, error: MOUNT_REASON_TEXT[reason] };
    }
    if (m.riding === want) return { ok: true, riding: want, mountId: m.active };
    m.riding = want;
    ctx.bus.emit(EV.MOUNT_CHANGED, { riding: want, mountId: m.active });
    return { ok: true, riding: want, mountId: m.active };
  });

  const world = () => game.scenes?.current?.world ?? null;
  game.character = {
    ...(game.character ?? {}),
    // { ok, reason } – mit laufender Welt inkl. Kampf/Zone/Fläche
    canMount: () => { const w = world(); return canMount(state.slices, content, w?.hero ?? null, w); },
    mountReasonText: (reason) => MOUNT_REASON_TEXT[reason] ?? '',
    mounts: () => state.slices.character?.mounts ?? { owned: [], active: null, riding: false },
    mountDef: (id) => content.find('mount', id),
    // Figur eines Mitspielers aus hero.snapshotLook() (§12.9). 'ride'/'rideRun' zeichnen Reiter + Reittier zusammen.
    animsForLook: (look, res) => animsForLook(content, look, res),
  };
}

// Animationssatz eines fremden Helden. Ohne Reittier der normale Heldensatz; mit Reittier dieselben Animationen,
// nur 'ride' (steht) und 'rideRun' (läuft) als zusammengesetzte Frames.
export function animsForLook(content, look, res = 1) {
  const raceId = content.find('race', look?.raceId) ? look.raceId : 'human';
  const classId = content.find('class', look?.classId) ? look.classId : 'warrior';
  const set = getHeroSprites(raceId, classId, look?.appearance?.variant ?? 0, look?.gear ?? null, spriteStyle(look?.appearance), res);
  const def = look?.mountId ? content.find('mount', look.mountId) : null;
  if (!def) return set;
  const out = Object.create(set);
  const lazy = (name, make) => Object.defineProperty(out, name, { configurable: true, enumerable: true,
    get() { const v = make(); Object.defineProperty(out, name, { value: v, enumerable: true }); return v; } });
  lazy('ride', () => composeRide(set.ride, getMountSprites(def.id, def, res).stand));
  lazy('rideRun', () => composeRide(set.ride, getMountSprites(def.id, def, res).walk));
  return out;
}
