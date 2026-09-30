// Talente und Passive (Thread A). Reine Daten + Auswertung.
//
// Talentpunkte: 1 pro Stufe ab Stufe 2 (Stufe 20 = 19, Stufe 40 = 39 Punkte). Talente liegen in sechs Reihen,
// die ab Stufe 2, 7, 13, 22, 28 und 34 offen sind (§12.8). Gespeichert im character-Slice: talents = { talentId: rang }.
// Passive schaltet die Stufe frei (8 und 16), ohne Punkte. Reihe 28 enthält je Klasse „Rang 2“ einer Fähigkeit
// (effect.upgrade, sichtbar anders, siehe abilities.js), Reihe 34 eine Meisterschaft mit eigenem Effekt.
//
// Wirkungen (effect, Wert je Rang):
//   powerPct, maxHpPct, armor, critChance, moveSpeed, resourceRegenPct, maxResource,
//   abilityPower, cooldownPct (alle Fähigkeiten), dodgeCost, onHitResource,
//   ability: { id: Schaden in Prozent je Rang }, upgrade: abilityId (Rang 2 der Fähigkeit),
//   bloodlustHeal, critResource, multishotPct, infernoPct (Meisterschaften, Hero.js)
export const TALENT_TIERS = [
  { level: 2, name: 'Grundlagen' },
  { level: 7, name: 'Vertiefung' },
  { level: 13, name: 'Meisterschaft' },
  { level: 22, name: 'Erwachen' },
  { level: 28, name: 'Veredelung' },
  { level: 34, name: 'Legende' },
];
// Höchste Stufe, bis zu der Talentpunkte vergeben werden (nur zur Formprüfung beim Laden)
export const TALENT_LEVEL_MAX = 40;

const T = (tier, name, icon, max, effect, desc) => ({ tier, name, icon, max, effect, desc });

export const TALENTS = {
  warrior: {
    w_might: T(0, 'Rohe Kraft', 'skill_rage', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    w_iron_skin: T(0, 'Eiserne Haut', 'armor_mail', 5, { armor: 3 }, '+3 Rüstung je Rang.'),
    w_fury: T(1, 'Zorn', 'skill_shout', 3, { onHitResource: 1 }, '+1 Wut je Treffer und Rang.'),
    w_whirl: T(1, 'Klingensturm', 'skill_whirlwind', 3, { ability: { whirlwind: 0.12, earthshatter: 0.12 } }, 'Wirbelsturm und Erdspalter: +12 % Schaden je Rang.'),
    w_vitality: T(2, 'Unerschütterlich', 'skill_heal', 5, { maxHpPct: 0.05 }, '+5 % maximales Leben je Rang.'),
    w_brutal: T(2, 'Brutalität', 'sword', 3, { critChance: 0.03 }, '+3 % kritische Trefferchance je Rang.'),
    w_warlord: T(3, 'Kriegsherr', 'skill_rage', 3, { powerPct: 0.05 }, '+5 % Angriffskraft je Rang.'),
    w_bulwark: T(3, 'Bollwerk', 'armor_mail', 3, { armor: 6, maxHpPct: 0.03 }, '+6 Rüstung und +3 % Leben je Rang.'),
    w_cyclone: T(4, 'Zyklon', 'skill_whirlwind', 1, { upgrade: 'whirlwind', ability: { whirlwind: 0.2 } }, 'Wirbelsturm Rang 2: größerer Kreis, eine dritte Klinge und eine Glutwelle. +20 % Schaden.'),
    w_rampage: T(4, 'Raserei', 'skill_shout', 3, { onHitResource: 1, cooldownPct: 0.03 }, '+1 Wut je Treffer und 3 % schnellere Abklingzeiten je Rang.'),
    w_bloodbath: T(5, 'Blutbad', 'passive_bloodlust', 1, { bloodlustHeal: 0.03 }, 'Blutdurst heilt 6 % statt 3 % deines maximalen Lebens.'),
    w_titan: T(5, 'Titanenkraft', 'sword', 5, { powerPct: 0.03, critChance: 0.01 }, '+3 % Angriffskraft und +1 % Krit je Rang.'),
  },
  rogue: {
    r_precision: T(0, 'Präzision', 'dagger', 5, { critChance: 0.02 }, '+2 % kritische Trefferchance je Rang.'),
    r_nimble: T(0, 'Leichtfüßig', 'boots_leather', 3, { moveSpeed: 0.03, dodgeCost: -2 }, '+3 % Tempo und 2 weniger Ausdauer pro Ausweichen je Rang.'),
    r_adrenaline: T(1, 'Adrenalin', 'skill_shadow', 5, { resourceRegenPct: 0.08 }, '+8 % Energie-Regeneration je Rang.'),
    r_blades: T(1, 'Scharfe Klingen', 'sword', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    r_venom: T(2, 'Tödliches Gift', 'skill_poison', 3, { ability: { poison_blades: 0.25, assassinate: 0.1 } }, 'Gift +25 % und Todesstoß +10 % Schaden je Rang.'),
    r_shadow: T(2, 'Schattenmeister', 'skill_stealth', 5, { cooldownPct: 0.04 }, 'Alle Fähigkeiten laden 4 % schneller je Rang.'),
    r_cutthroat: T(3, 'Halsabschneider', 'dagger', 3, { critChance: 0.02, powerPct: 0.03 }, '+2 % Krit und +3 % Angriffskraft je Rang.'),
    r_evasion: T(3, 'Ausweichkunst', 'boots_leather', 3, { dodgeCost: -3, maxHpPct: 0.03 }, '3 weniger Ausdauer pro Ausweichen und +3 % Leben je Rang.'),
    r_bladestorm: T(4, 'Klingenwirbel', 'skill_knives', 1, { upgrade: 'fan_of_knives', ability: { fan_of_knives: 0.15 } }, 'Messerfächer Rang 2: ein voller Kreis aus Klingen und eine zweite Welle. +15 % Schaden.'),
    r_venomcraft: T(4, 'Giftmischer', 'skill_poison', 3, { ability: { poison_blades: 0.2, assassinate: 0.08 } }, 'Gift +20 % und Todesstoß +8 % Schaden je Rang.'),
    r_deathmark: T(5, 'Todesmal', 'passive_opportunist', 1, { critResource: 6 }, 'Kritische Treffer geben zusätzlich 6 Energie zurück.'),
    r_phantom: T(5, 'Phantom', 'skill_shadow', 5, { powerPct: 0.03, resourceRegenPct: 0.04 }, '+3 % Angriffskraft und +4 % Energie-Regeneration je Rang.'),
  },
  ranger: {
    g_aim: T(0, 'Ruhige Hand', 'bow', 5, { powerPct: 0.04 }, '+4 % Angriffskraft je Rang.'),
    g_focus: T(0, 'Sammlung', 'skill_pierce', 3, { maxResource: 10 }, '+10 maximaler Fokus je Rang.'),
    g_eagle: T(1, 'Adlerauge', 'charm_feather', 5, { critChance: 0.02 }, '+2 % kritische Trefferchance je Rang.'),
    g_volley: T(1, 'Pfeilregen', 'skill_arrows', 3, { ability: { volley: 0.12, arrow_rain: 0.12 } }, 'Pfeilsalve und Pfeilhagel: +12 % Schaden je Rang.'),
    g_survival: T(2, 'Überlebenskunst', 'armor_leather', 3, { maxHpPct: 0.05, armor: 2 }, '+5 % Leben und +2 Rüstung je Rang.'),
    g_trapper: T(2, 'Fallensteller', 'skill_nova', 3, { ability: { fire_trap: 0.2 }, cooldownPct: 0.03 }, 'Sprengfalle +20 % Schaden, alle Fähigkeiten laden 3 % schneller je Rang.'),
    g_hawkeye: T(3, 'Falkenblick', 'charm_feather', 4, { critChance: 0.02, powerPct: 0.03 }, '+2 % Krit und +3 % Angriffskraft je Rang.'),
    g_wild: T(3, 'Wildnisblut', 'armor_leather', 3, { maxHpPct: 0.04, moveSpeed: 0.02 }, '+4 % Leben und +2 % Tempo je Rang.'),
    g_stormvolley: T(4, 'Sturmsalve', 'skill_arrows', 1, { upgrade: 'volley', ability: { volley: 0.15 } }, 'Pfeilsalve Rang 2: sieben leuchtende Pfeile und eine zweite, kleinere Salve. +15 % Schaden.'),
    g_trueshot: T(4, 'Meisterschuss', 'skill_pierce', 3, { ability: { piercing_shot: 0.15, arrow_rain: 0.1 } }, 'Durchschuss +15 % und Pfeilhagel +10 % Schaden je Rang.'),
    g_barrage: T(5, 'Sperrfeuer', 'passive_multishot', 1, { multishotPct: 0.25 }, 'Mehrfachschuss: die Zusatzpfeile verursachen 75 % statt 50 % Schaden.'),
    g_apex: T(5, 'Spitzenjäger', 'bow', 5, { powerPct: 0.03, maxResource: 4 }, '+3 % Angriffskraft und +4 maximaler Fokus je Rang.'),
  },
  mage: {
    m_ember: T(0, 'Glutkern', 'skill_fireball', 5, { abilityPower: 0.05 }, '+5 % Fähigkeitsschaden je Rang.'),
    m_mana: T(0, 'Manaquell', 'potion_mana', 3, { maxResource: 10 }, '+10 maximales Mana je Rang.'),
    m_flow: T(1, 'Arkaner Fluss', 'skill_blink', 5, { resourceRegenPct: 0.1 }, '+10 % Mana-Regeneration je Rang.'),
    m_ward: T(1, 'Glutschild', 'armor_cloth', 3, { armor: 3, maxHpPct: 0.04 }, '+3 Rüstung und +4 % Leben je Rang.'),
    m_pyro: T(2, 'Pyromanie', 'skill_flame_nova', 3, { ability: { fireball: 0.12, meteor: 0.12, flame_nova: 0.12 } }, 'Feuerball, Meteor und Flammenring: +12 % Schaden je Rang.'),
    m_haste: T(2, 'Zeitfaden', 'skill_lightning', 5, { cooldownPct: 0.04 }, 'Alle Fähigkeiten laden 4 % schneller je Rang.'),
    m_ignite: T(3, 'Entzünden', 'skill_fireball', 3, { abilityPower: 0.05 }, '+5 % Fähigkeitsschaden je Rang.'),
    m_ashward: T(3, 'Aschenmantel', 'armor_cloth', 3, { armor: 4, maxHpPct: 0.04 }, '+4 Rüstung und +4 % Leben je Rang.'),
    m_phoenix: T(4, 'Phönixflamme', 'skill_fireball', 1, { upgrade: 'fireball', ability: { fireball: 0.15 } }, 'Feuerball Rang 2: zwei kleinere Begleitflammen fliegen mit, die Explosion ist größer. +15 % Schaden.'),
    m_wellspring: T(4, 'Glutquell', 'potion_mana', 3, { maxResource: 12, resourceRegenPct: 0.06 }, '+12 Mana und +6 % Mana-Regeneration je Rang.'),
    m_cataclysm: T(5, 'Kataklysmus', 'passive_inferno', 1, { infernoPct: 0.25 }, 'Inferno: Glutbolzen explodieren größer und mit 75 % statt 50 % Schaden.'),
    m_archmage: T(5, 'Erzmagier', 'skill_flame_nova', 5, { abilityPower: 0.03, powerPct: 0.02 }, '+3 % Fähigkeitsschaden und +2 % Angriffskraft je Rang.'),
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
  for (let tier = 0; tier < TALENT_TIERS.length; tier++) {
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
      else if (k === 'upgrade') (sum.upgrades ??= {})[v] = true;
      else sum[k] = (sum[k] ?? 0) + v * rank;
    }
  }
  const passives = {};
  for (const p of PASSIVES[classId] ?? []) if (level >= p.level) passives[p.id] = true;
  return { mods: sum, passives };
}
