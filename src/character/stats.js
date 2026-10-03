// VERTRAG (Thread A): abgeleitete Charakterwerte aus Volk, Klasse, Stufe und
// Ausrüstung. Wird vom Helden, vom HUD und vom Charakter-Panel gelesen.
// computeStats(state, content) -> {
//   level, maxHp, maxResource, resourceType ('rage'|'mana'|'energy'|null),
//   resourceName, resourceColor, resourceRegen (pro s),
//   power, armor, damageReduction (0..1, aus Rüstung), critChance, moveSpeed,
//   maxStamina, staminaRegen, dodgeCost, abilityPower (Faktor),
//   attributes: { str, agi, int, vit },
//   raceId, classId, equipmentBonus: { … summierte Item-Werte + inventory.bonus },
//   cooldownMult, onHitResource, abilityMods { abilityId: +Schaden }, passives { id: true },
//   upgrades { abilityId: true } (Rang 2), mastery { bloodlustHeal, critResource, multishotPct, infernoPct },
//   talents { id: rang }, talentPoints { total, spent, free }
// }
// Ausrüstungsboni stammen aus den Item-Definitionen (content 'item', Feld stats):
// power, armor, maxHp, critChance, maxResource, moveSpeed (Anteil, z. B. 0.05), str, agi, int, vit.
// deriveStats({ raceId, classId, level, equipment }, content) rechnet dasselbe
// ohne Spielzustand (Vorschau in der Charaktererstellung).
import { DEFAULT_RACE } from './races.js';
import { DEFAULT_CLASS } from './classes.js';
import { talentEffects, cleanTalents, spentPoints, talentPointsTotal } from './talents.js';

const BASE_SPEED = 88;
const ATTRS = ['str', 'agi', 'int', 'vit'];

export function computeStats(state, content) {
  const s = state.slices;
  return deriveStats({
    raceId: s.character?.raceId, classId: s.character?.classId,
    level: s.progress?.level ?? 1, equipment: s.inventory?.equipment ?? null,
    bonus: s.inventory?.bonus ?? null, talents: s.character?.talents ?? null,
  }, content);
}

// Summiert die stats aller angelegten Items. equipment-Werte dürfen eine
// Item-ID oder ein Objekt { itemId } sein.
export function equipmentBonus(equipment, content) {
  const sum = {};
  if (!equipment) return sum;
  for (const entry of Object.values(equipment)) {
    const itemId = typeof entry === 'string' ? entry : entry?.itemId;
    const def = itemId ? content.find('item', itemId) : null;
    if (!def?.stats) continue;
    for (const [k, v] of Object.entries(def.stats)) if (typeof v === 'number') sum[k] = (sum[k] ?? 0) + v;
  }
  return sum;
}

export function deriveStats({ raceId, classId, level = 1, equipment = null, bonus = null, talents = null }, content) {
  const race = content.find('race', raceId) ?? content.get('race', DEFAULT_RACE);
  const cls = content.find('class', classId) ?? content.get('class', DEFAULT_CLASS);
  const lv = Math.max(1, level | 0);
  const eq = equipmentBonus(equipment, content);
  // Set-Boni, Schmiede, Verzauberungen (Thread C: inventory.bonus)
  for (const [k, v] of Object.entries(bonus ?? {})) if (typeof v === 'number') eq[k] = (eq[k] ?? 0) + v;
  const m = race.mods ?? {};
  const tal = cleanTalents(cls.id, talents, lv);
  const { mods: t, passives } = talentEffects(cls.id, tal, lv);

  const attributes = {};
  for (const a of ATTRS) {
    attributes[a] = Math.max(1, cls.base[a] + cls.growth[a] * (lv - 1) + (race.attrs?.[a] ?? 0) + (eq[a] ?? 0));
  }
  const { str, agi, vit } = attributes;
  const primary = attributes[cls.primary];

  const maxHp = Math.round((cls.hp + vit * 4 + (lv - 1) * cls.hpPerLevel + (eq.maxHp ?? 0)) * (1 + (m.maxHpPct ?? 0) + (t.maxHpPct ?? 0)));
  const power = Math.round((cls.powerBase + primary * 0.6 + (lv - 1) * 0.8 + (eq.power ?? 0)) * (1 + (t.powerPct ?? 0)) * 10) / 10;
  const armor = Math.round(cls.armor + (m.armor ?? 0) + str * 0.15 + (eq.armor ?? 0) + (t.armor ?? 0));
  const critChance = Math.min(0.6, cls.crit + agi * 0.0016 + (m.critChance ?? 0) + (eq.critChance ?? 0) + (t.critChance ?? 0));
  const moveSpeed = Math.round(BASE_SPEED * cls.speed * (1 + (m.moveSpeed ?? 0) + Math.min(0.3, (eq.moveSpeed ?? 0) + (t.moveSpeed ?? 0))));

  const res = cls.resource;
  const maxResource = Math.round(res.max + (res.perInt ?? 0) * attributes.int + (eq.maxResource ?? 0) + (t.maxResource ?? 0));
  const resourceRegen = (res.regen * (1 + (m.resourceRegen ?? 0)) + (res.type === 'mana' ? attributes.int * 0.1 : 0)) * (1 + (t.resourceRegenPct ?? 0));

  return {
    level: lv, raceId: race.id, classId: cls.id,
    maxHp, power, armor,
    // Rüstungsminderung skaliert mit der Stufe, damit Ausrüstung bis Stufe 20 nicht zur Unverwundbarkeit führt
    damageReduction: armor / (armor + 45 + (lv - 1) * 10),
    critChance, moveSpeed,
    resourceType: res.type, resourceName: res.name, resourceColor: res.color,
    maxResource, resourceRegen,
    maxStamina: 100,
    staminaRegen: 38 * (1 + (m.staminaRegen ?? 0)),
    dodgeCost: 30 + (m.dodgeCost ?? 0) + (t.dodgeCost ?? 0),
    abilityPower: 1 + (m.abilityPower ?? 0) + (t.abilityPower ?? 0),
    cooldownMult: Math.max(0.6, 1 - (t.cooldownPct ?? 0)),
    onHitResource: (res.onHit ?? 0) + (t.onHitResource ?? 0),
    abilityMods: t.ability,
    upgrades: t.upgrades ?? {},     // Rang 2 von Fähigkeiten (Talentreihe 28), abilities.js
    mastery: {                      // Meisterschaften (Talentreihe 34), Hero.js
      bloodlustHeal: 0.03 + (t.bloodlustHeal ?? 0), critResource: t.critResource ?? 0,
      multishotPct: 0.25 + (t.multishotPct ?? 0), infernoPct: 0.5 + (t.infernoPct ?? 0),
    },
    passives,
    talents: tal,
    talentPoints: { total: talentPointsTotal(lv), spent: spentPoints(tal), free: talentPointsTotal(lv) - spentPoints(tal) },
    attributes,
    equipmentBonus: eq,
  };
}
