// Talente und Passive (Thread A). Reine Daten + Auswertung.
//
// Talentpunkte: 1 pro Stufe ab Stufe 2 (Stufe 20 = 19 Punkte). Talente liegen in drei Reihen,
// die ab Stufe 2, 7 und 13 offen sind. Gespeichert im character-Slice: talents = { talentId: rang }.
// Passive schaltet die Stufe frei (8 und 16), ohne Punkte.
//
// Wirkungen (effect, Wert je Rang):
//   powerPct, maxHpPct, armor, critChance, moveSpeed, resourceRegenPct, maxResource,
//   abilityPower, cooldownPct (alle Fähigkeiten), dodgeCost, onHitResource,
//   ability: { id: Schaden in Prozent je Rang }
export const TALENT_TIERS = [
  { level: 2, name: 'Grundlagen' },
  { level: 7, name: 'Vertiefung' },
  { level: 13, name: 'Meisterschaft' },
];

const T = (tier, name, icon, max, effect, desc) => ({ tier, name, icon, max, effect, desc });

export const TALENTS = {
  warrior: {
    w_might: T(0, 'Rohe Kraft', 'skill_rage', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    w_iron_skin: T(0, 'Eiserne Haut', 'armor_mail', 5, { armor: 3 }, '+3 Rüstung je Rang.'),
    w_fury: T(1, 'Zorn', 'skill_shout', 3, { onHitResource: 1 }, '+1 Wut je Treffer und Rang.'),
    w_whirl: T(1, 'Klingensturm', 'skill_whirlwind', 3, { ability: { whirlwind: 0.12, earthshatter: 0.12 } }, 'Wirbelsturm und Erdspalter: +12 % Schaden je Rang.'),
    w_vitality: T(2, 'Unerschütterlich', 'skill_heal', 5, { maxHpPct: 0.05 }, '+5 % maximales Leben je Rang.'),
    w_brutal: T(2, 'Brutalität', 'sword', 3, { critChance: 0.03 }, '+3 % kritische Trefferchance je Rang.'),
  },
  rogue: {
    r_precision: T(0, 'Präzision', 'dagger', 5, { critChance: 0.02 }, '+2 % kritische Trefferchance je Rang.'),
    r_nimble: T(0, 'Leichtfüßig', 'boots_leather', 3, { moveSpeed: 0.03, dodgeCost: -2 }, '+3 % Tempo und 2 weniger Ausdauer pro Ausweichen je Rang.'),
    r_adrenaline: T(1, 'Adrenalin', 'skill_shadow', 5, { resourceRegenPct: 0.08 }, '+8 % Energie-Regeneration je Rang.'),
    r_blades: T(1, 'Scharfe Klingen', 'sword', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    r_venom: T(2, 'Tödliches Gift', 'skill_poison', 3, { ability: { poison_blades: 0.25, assassinate: 0.1 } }, 'Gift +25 % und Todesstoß +10 % Schaden je Rang.'),
    r_shadow: T(2, 'Schattenmeister', 'skill_stealth', 5, { cooldownPct: 0.04 }, 'Alle Fähigkeiten laden 4 % schneller je Rang.'),
  },
  ranger: {
    g_aim: T(0, 'Ruhige Hand', 'bow', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    g_focus: T(0, 'Sammlung', 'skill_pierce', 3, { maxResource: 10 }, '+10 maximaler Fokus je Rang.'),
    g_eagle: T(1, 'Adlerauge', 'charm_feather', 5, { critChance: 0.02 }, '+2 % kritische Trefferchance je Rang.'),
    g_volley: T(1, 'Pfeilregen', 'skill_arrows', 3, { ability: { volley: 0.12, arrow_rain: 0.12 } }, 'Pfeilsalve und Pfeilhagel: +12 % Schaden je Rang.'),
    g_survival: T(2, 'Überlebenskunst', 'armor_leather', 3, { maxHpPct: 0.05, armor: 2 }, '+5 % Leben und +2 Rüstung je Rang.'),
    g_trapper: T(2, 'Fallensteller', 'skill_nova', 3, { ability: { fire_trap: 0.2 }, cooldownPct: 0.03 }, 'Sprengfalle +20 % Schaden, alle Fähigkeiten laden 3 % schneller je Rang.'),
  },
  mage: {
    m_ember: T(0, 'Glutkern', 'skill_fireball', 5, { abilityPower: 0.05 }, '+5 % Fähigkeitsschaden je Rang.'),
    m_mana: T(0, 'Manaquell', 'potion_mana', 3, { maxResource: 10 }, '+10 maximales Mana je Rang.'),
    m_flow: T(1, 'Arkaner Fluss', 'skill_blink', 5, { resourceRegenPct: 0.1 }, '+10 % Mana-Regeneration je Rang.'),
    m_ward: T(1, 'Glutschild', 'armor_cloth', 3, { armor: 3, maxHpPct: 0.04 }, '+3 Rüstung und +4 % Leben je Rang.'),
    m_pyro: T(2, 'Pyromanie', 'skill_flame_nova', 3, { ability: { fireball: 0.12, meteor: 0.12, flame_nova: 0.12 } }, 'Feuerball, Meteor und Flammenring: +12 % Schaden je Rang.'),
    m_haste: T(2, 'Zeitfaden', 'skill_lightning', 5, { cooldownPct: 0.04 }, 'Alle Fähigkeiten laden 4 % schneller je Rang.'),
  },
};

// Passive je Klasse: Stufe 8 und 16
export const PASSIVES = {
  warrior: [
    { id: 'bloodlust', level: 8, name: 'Blutdurst', icon: 'passive_bloodlust', desc: 'Schwere Treffer (dritter Kombo-Schlag und Fähigkeiten) heilen 3 % deines maximalen Lebens.' },
    { id: 'unbroken', level: 16, name: 'Unbeugsam', icon: 'passive_unbroken', desc: 'Ein tödlicher Treffer lässt dich mit 1 Leben stehen und halbiert 3 Sekunden lang den Schaden. Einmal alle 90 Sekunden.' },
  ],
  rogue: [
    { id: 'opportunist', level: 8, name: 'Opportunist', icon: 'passive_opportunist', desc: 'Kritische Treffer geben 6 Energie zurück.' },
    { id: 'shadow_dance', level: 16, name: 'Schattentanz', icon: 'passive_shadow_dance', desc: 'Nach dem Ausweichen verursacht dein nächster Angriff innerhalb von 2 Sekunden 60 % mehr Schaden.' },
  ],
  ranger: [
    { id: 'piercing_arrows', level: 8, name: 'Durchschlagskraft', icon: 'passive_piercing_arrows', desc: 'Grundschüsse durchschlagen einen zusätzlichen Gegner.' },
    { id: 'multishot', level: 16, name: 'Mehrfachschuss', icon: 'passive_multishot', desc: 'Grundschüsse feuern zwei zusätzliche Pfeile mit 50 % Schaden.' },
  ],
  mage: [
    { id: 'ember_soul', level: 8, name: 'Glutseele', icon: 'passive_ember_soul', desc: 'Kritische Treffer geben 5 Mana zurück.' },
    { id: 'inferno', level: 16, name: 'Inferno', icon: 'passive_inferno', desc: 'Glutbolzen explodieren beim Aufprall und treffen Umstehende mit 50 % Schaden.' },
  ],
};

export function talentPointsTotal(level) { return Math.max(0, (level | 0) - 1); }

export function talentsFor(classId) { return TALENTS[classId] ?? {}; }

// Nur gültige Ränge behalten (unbekannte IDs, zu hohe Ränge, zu viele Punkte, gesperrte Reihen)
export function cleanTalents(classId, raw, level = 20) {
  const defs = talentsFor(classId);
  const out = {};
  let left = talentPointsTotal(level);
  for (const tier of [0, 1, 2]) {
    if (level < TALENT_TIERS[tier].level) break;
    for (const [id, def] of Object.entries(defs)) {
      if (def.tier !== tier) continue;
      const r = Math.max(0, Math.min(def.max, (raw?.[id] ?? 0) | 0, left));
      if (r > 0) { out[id] = r; left -= r; }
    }
  }
  return out;
}

export function spentPoints(talents) { return Object.values(talents ?? {}).reduce((s, r) => s + (r | 0), 0); }

// Prüft, ob ein weiterer Rang gelernt werden darf -> null oder Fehlertext
export function canLearn(classId, talents, level, id) {
  const def = talentsFor(classId)[id];
  if (!def) return 'Unbekanntes Talent.';
  if (level < TALENT_TIERS[def.tier].level) return `Ab Stufe ${TALENT_TIERS[def.tier].level}.`;
  if ((talents?.[id] ?? 0) >= def.max) return 'Höchster Rang erreicht.';
  if (spentPoints(talents) >= talentPointsTotal(level)) return 'Keine Talentpunkte frei.';
  return null;
}

// Summierte Wirkung aller Talente + freigeschaltete Passive
export function talentEffects(classId, talents, level) {
  const sum = { ability: {} };
  const defs = talentsFor(classId);
  for (const [id, rank] of Object.entries(talents ?? {})) {
    const def = defs[id];
    if (!def || !rank) continue;
    for (const [k, v] of Object.entries(def.effect)) {
      if (k === 'ability') for (const [aid, pct] of Object.entries(v)) sum.ability[aid] = (sum.ability[aid] ?? 0) + pct * rank;
      else sum[k] = (sum[k] ?? 0) + v * rank;
    }
  }
  const passives = {};
  for (const p of PASSIVES[classId] ?? []) if (level >= p.level) passives[p.id] = true;
  return { mods: sum, passives };
}
