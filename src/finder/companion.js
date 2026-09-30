import { Hero } from '../entities/Hero.js';
import { deriveStats } from '../character/stats.js';
import { resolveGear } from '../character/gearLook.js';
import { spriteStyle } from '../character/cosmetics.js';
import { talentsFor } from '../character/talents.js';
import { getHeroSprites } from '../sprites/hero.js';
import { makeRng } from './rng.js';

// Gruppenmitglied im Dungeon (Söldner): ein echter Hero derselben Klasse wie ein Spieler – gleiche Figuren,
// gleiche Grundangriffe, Fähigkeiten, Abklingzeiten und Ressourcen. Gesteuert wird er von BotBrain über
// dieselben Eingabe-Aktionen, die ein Spieler drückt (siehe Party.js: eigene Eingabe und Zielpunkt je Söldner).
//
// Ausrüstung: aus den echten Items (content 'item') passend zu Stufe und Klasse gewählt, reproduzierbar über
// member.gearSeed – so tragen Söldner, was Spieler ihrer Stufe auch tragen würden, und sehen entsprechend aus.

const SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'ring', 'amulet'];
const ARMOR_SLOTS = ['head', 'chest', 'hands', 'feet'];
const ARMOR_FOR ={ warrior: ['plate', 'mail'], rogue: ['leather', 'mail'], ranger: ['leather', 'mail'], mage: ['cloth'] };

export function mercGear(content, classId, level, seed) {
  const rng = makeRng(seed);
  const eq = {};
  const items = content.all('item').filter((d) => d.slot && (d.reqLevel ?? 1) <= level && (d.reqLevel ?? 1) >= level - 6 && d.source !== 'trial' && d.rarity !== 'legendary');
  for (const slot of SLOTS) {
    let pool = items.filter((d) => d.slot === slot && (!d.classes || d.classes.includes(classId)));
    if (ARMOR_SLOTS.includes(slot)) {
      // Rüstungsart passend zur Klasse (Krieger in Platte, Magier in Robe …)
      const fam = pool.filter((d) => !d.family || ARMOR_FOR[classId]?.includes(d.family));
      if (fam.length) pool = fam;
    }
    // Gelegentlich fehlt ein Teil (wie bei echten Spielern mit halbem Set), nie die Waffe
    if (!pool.length || (slot !== 'weapon' && rng.chance(0.06))) continue;
    const weight = (d) => ({ common: 8, uncommon: 34, rare: 40, epic: level >= 10 ? 14 : 2 }[d.rarity] ?? 4) * (1 + Math.max(0, (d.reqLevel ?? 1) - level + 6) * 0.25);
    eq[slot] = rng.weighted(pool.map((d) => [d.id, weight(d)]));
  }
  return eq;
}

// Talente wie ein Spieler, der seine Punkte verteilt hat (zufällige, aber gültige Auswahl)
function mercTalents(classId, rng) {
  const raw = {};
  for (const [id, def] of Object.entries(talentsFor(classId))) if (rng.chance(0.7)) raw[id] = def.max;
  return raw;
}

export function createCompanion(session, member, x, y) {
  const content = session.content;
  const rng = makeRng(member.gearSeed ?? 1);
  const cls = content.find('class', member.classId) ?? content.get('class', 'warrior');
  const raceId = content.find('race', member.raceId) ? member.raceId : 'human';
  const equipment = mercGear(content, cls.id, member.level, member.gearSeed ?? 1);
  const talents = mercTalents(cls.id, rng);
  const stats = deriveStats({ raceId, classId: cls.id, level: member.level, equipment, talents }, content);
  const look = member.look ?? {};
  const gear = resolveGear(equipment, content);
  const anims = getHeroSprites(raceId, cls.id, look.variant ?? 0, gear, spriteStyle(look));
  const abilities = cls.abilities.map((id) => content.get('ability', id));
  const hero = new Hero(x, y, { anims, cls, stats, abilities });
  hero.raceId = raceId;
  hero.companion = true;       // Gruppenmitglied, nicht der eigene Held (Feedback, HUD, Gegnerwahl)
  hero.member = member;
  hero.name = member.name;
  hero.equipment = equipment;
  hero.refreshLook = () => hero.setAnims(getHeroSprites(raceId, cls.id, look.variant ?? 0, gear, spriteStyle(look)));
  return hero;
}
