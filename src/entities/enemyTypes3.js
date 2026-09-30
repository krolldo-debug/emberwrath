// Gegner der Runde 3 (INTEGRATION.md §12.4), Stufe 20–40.
//
// Jeder Typ leitet sich von einem Vorbild der Stufen 1–20 ab (gleiches
// Verhalten, gleiche Maße) und wird mit A's Richtwerten auf seine Stufe
// skaliert: Leben ~ Heldenkraft der Stufe, Schaden ~ Magier-HP der Stufe
// (character/README.md). So bleibt das Verhältnis der Rollen (Schwarm,
// Nah, Fern, schwer) wie in 1–20 erhalten. `sprites` zeigt auf den eigenen
// Figurensatz der Zone; solange der fehlt, auf den des Vorbilds (siehe
// SPRITE_FALLBACK in world/index.js).

const power = (L) => 13 + (L - 1) * 5;          // Heldenkraft der Stufe (Durchschnitt der Klassen)
const mageHp = (L) => 86 + (L - 1) * 16.3;      // Magier-HP der Stufe
const xpAt = (L) => Math.round(130 * 1.1 ** (L - 20)); // normaler Gegner; C darf nachregeln

function scaleAttack(a, k) {
  if (!a) return a;
  const o = { ...a };
  if (o.damage != null) o.damage = Math.round(o.damage * k);
  return o;
}

// base: Vorbild aus ENEMY_TYPES; L: [min, max] oder Zahl; hp/dmg/xp: Rollen-Faktoren relativ zum Vorbild
function derive(T, baseId, id, name, L, { hp = 1, dmg = 1, xp = 1, sprites = id, ...over } = {}) {
  const b = T[baseId];
  const bL = b.levels?.[0] ?? b.level ?? 1;
  const nL = Array.isArray(L) ? L[0] : L;
  const kHp = (power(nL) / power(bL)) * hp;
  const kDmg = (mageHp(nL) / mageHp(bL)) * dmg;
  const def = {
    ...b,
    name,
    sprites,
    spriteBase: b.sprites,
    hp: Math.round(b.hp * kHp),
    attack: scaleAttack(b.attack, kDmg),
    specials: b.specials?.map((s) => scaleAttack(s, kDmg)),
    xp: Math.round((b.elite ? xpAt(nL) * 7 : xpAt(nL)) * xp),
    ...over,
  };
  delete def.levels; delete def.level;
  if (Array.isArray(L)) def.levels = L; else def.level = L;
  if (!def.specials) delete def.specials;
  return def;
}

// Bosse: Leben absolut (Kampfdauer 40–60 s wie Runde 2), Logik je Boss in eigener Klasse.
function boss(id, name, level, hp, over) {
  return {
    name, family: 'undead', level, xp: Math.round(xpAt(level) * 22), boss: true, bossId: id,
    sprites: id, spriteBase: 'bonelord',
    hp, speed: 42, radius: 11, mass: 7, hurtRadius: 14, bodyHeight: 50, shadowW: 36,
    material: 'flesh', hurtTime: 0.2, eye: { x: 5, y: -48 },
    ...over,
  };
}

export function createRound3Enemies(T) {
  const d = (...a) => derive(T, ...a);
  const out = {
    // --- Aschensteppe (20–25)
    steppe_raider: d('bandit', 'steppe_raider', 'Steppenräuber', [20, 23], { family: 'human' }),
    raider_archer: d('bandit_archer', 'raider_archer', 'Räuberschützin', [20, 23], { family: 'human' }),
    dust_hyena: d('wolf', 'dust_hyena', 'Staubhyäne', [21, 24], { family: 'beast', hp: 0.9, howl: true }),
    ash_vulture: d('fire_imp', 'ash_vulture', 'Aschegeier', [22, 25], { family: 'beast', hitAndRun: 0.9, strafe: true, spawnStyle: 'drop' }),
    steppe_warlord: d('bandit_chief', 'steppe_warlord', 'Khar, der Steppenfürst', 25, { family: 'human', hp: 1.1 }),
    // --- Heulendes Hügelgrab (24–26)
    barrow_wight: d('skeleton', 'barrow_wight', 'Grabunhold', [24, 26], { family: 'undead' }),
    grave_hound: d('wolf', 'grave_hound', 'Grabhund', [24, 26], { family: 'undead' }),
    bone_archer: d('archer', 'bone_archer', 'Knochenschütze', [24, 26], { family: 'undead' }),
    wight_caller: d('tide_cultist', 'wight_caller', 'Totenrufer', [25, 26], { family: 'undead' }),
    barrow_king: boss('barrow_king', 'Ulgrim, der Hügelkönig', 26, 15000, { family: 'undead', material: 'bone' }),
    // --- Faulmarsch (25–31)
    bog_lurker: d('drowned', 'bog_lurker', 'Moorlauerer', [25, 28], { family: 'beast' }),
    rot_shaman: d('tide_cultist', 'rot_shaman', 'Fäulnisschamane', [26, 30], { family: 'human' }),
    swamp_leech: d('spider', 'swamp_leech', 'Sumpfegel', [26, 29], { family: 'beast', hp: 0.6, xp: 0.5 }),
    plague_toad: d('thorn_crawler', 'plague_toad', 'Pestkröte', [27, 31], { family: 'beast' }),
    bog_horror: d('magma_behemoth', 'bog_horror', 'Das Moorgrauen', 30, { family: 'beast', material: 'flesh' }),
    // --- Sporenschlund (30–32)
    sporeling: d('spider', 'sporeling', 'Sporling', [30, 31], { family: 'plant', hp: 0.55, xp: 0.45 }),
    fungal_brute: d('ash_golem', 'fungal_brute', 'Pilzwüterich', [30, 32], { family: 'plant', material: 'wood' }),
    spore_caster: d('cinder_cultist', 'spore_caster', 'Sporenwirker', [30, 32], { family: 'plant' }),
    rot_mother: boss('rot_mother', 'Mutter Fäulnis', 32, 17500, { family: 'plant', material: 'wood', radius: 14, hurtRadius: 18, bodyHeight: 46, shadowW: 48 }),
    // --- Frostzinnen (31–36)
    ice_troll: d('ash_golem', 'ice_troll', 'Eistroll', [32, 35], { family: 'beast', material: 'flesh' }),
    frost_wolf: d('wolf', 'frost_wolf', 'Frostwolf', [31, 34], { family: 'beast' }),
    rime_witch: d('tide_cultist', 'rime_witch', 'Reifhexe', [32, 36], { family: 'human' }),
    snow_stalker: d('bandit', 'snow_stalker', 'Schneepirscher', [33, 36], { family: 'beast', spawnStyle: 'rise', dmg: 1.15, hp: 0.85 }),
    ice_troll_chief: d('magma_behemoth', 'ice_troll_chief', 'Gorm Eisfaust', 35, { family: 'beast', material: 'flesh' }),
    // --- Reifhöhlen (35–37)
    ice_elemental: d('fire_imp', 'ice_elemental', 'Eiselementar', [35, 37], { family: 'construct', material: 'stone', hp: 1.2 }),
    crystal_spider: d('spider', 'crystal_spider', 'Kristallspinne', [35, 37], { family: 'spider', material: 'chitin' }),
    frozen_knight: d('temple_guardian', 'frozen_knight', 'Erfrorener Ritter', [36, 37], { family: 'undead', material: 'stone' }),
    frost_wyrm: boss('frost_wyrm', 'Skalvyr, der Frostwurm', 37, 20000, { family: 'dragon', material: 'stone', radius: 14, hurtRadius: 18, bodyHeight: 54, shadowW: 56 }),
    // --- Glutöde (36–40)
    ash_wraith: d('drowned', 'ash_wraith', 'Aschegeist', [36, 39], { family: 'undead', spawnStyle: 'fade' }),
    cinder_knight: d('forge_golem', 'cinder_knight', 'Schlackenritter', [37, 40], { family: 'construct', material: 'stone' }),
    magma_serpent: d('ember_drake', 'magma_serpent', 'Magmaschlange', [37, 40], { family: 'beast' }),
    ember_cultist_adept: d('flame_acolyte', 'ember_cultist_adept', 'Glutadept', [38, 40], { family: 'human' }),
    waste_colossus: d('forge_warden', 'waste_colossus', 'Der Glutkoloss', 40, { family: 'construct' }),
    // --- Aschethron (38–40)
    throne_guard: d('bandit', 'throne_guard', 'Thronwache', [38, 40], { family: 'human', material: 'stone', hp: 1.3 }),
    ash_priest: d('flame_acolyte', 'ash_priest', 'Aschepriester', [38, 40], { family: 'human' }),
    ember_hellhound: d('magma_hound', 'ember_hellhound', 'Glut-Höllenhund', [38, 40], { family: 'demon' }),
    throne_sentinel: d('forge_warden', 'throne_sentinel', 'Wächter des Throns', 40, { family: 'construct', hp: 1.15 }),
    ash_sovereign: boss('ash_sovereign', 'Malgareth, der Aschenfürst', 40, 28000, { family: 'demon', material: 'stone', radius: 12, hurtRadius: 15, bodyHeight: 58, shadowW: 40, eye: { x: 5, y: -56 } }),
  };
  applyDefs(out, BASE_SPECIALS);
  return out;
}

// Grundverhalten der neuen Rollen (Beschwörer, Giftwolken); Grafik-Dateien dürfen es verfeinern.
const BASE_SPECIALS = {
  wight_caller: { specials: [{ kind: 'summon', type: 'barrow_wight', count: 2, max: 3, range: 170, windup: 1.1, recover: 0.6, cooldown: 11, anim: 'cast' }] },
  rot_shaman: { specials: [{ kind: 'cloud', range: 140, windup: 0.9, radius: 24, duration: 5, tick: 0.5, dmgK: 0.3, element: 'poison', recover: 0.6, cooldown: 9, anim: 'cast' }] },
  plague_toad: { specials: [{ kind: 'cloud', range: 120, windup: 0.8, radius: 28, duration: 6, tick: 0.5, dmgK: 0.35, element: 'poison', recover: 0.7, cooldown: 8, anim: 'puff' }] },
  spore_caster: { specials: [{ kind: 'cloud', range: 140, windup: 0.9, radius: 24, duration: 5, tick: 0.5, dmgK: 0.3, element: 'spore', recover: 0.6, cooldown: 9, anim: 'cast' }] },
  rime_witch: { specials: [{ kind: 'cloud', range: 150, windup: 1.0, radius: 26, duration: 4, tick: 0.5, dmgK: 0.3, element: 'frost', recover: 0.6, cooldown: 10, anim: 'cast' }] },
};

// Feinschliff der Grafik-/Verhaltensdateien (entities/defs_<gruppe>.js): nur Maße,
// Verhalten und Angriffsart; Schaden bleibt vom Skalierer. specials[].dmgK =
// Faktor relativ zum Grundangriff.
export function applyDefs(T, DEFS) {
  for (const [id, over] of Object.entries(DEFS ?? {})) {
    const def = T[id];
    if (!def) continue;
    const { attackPatch, specials, damage, hp, xp, ...rest } = over;
    Object.assign(def, rest);
    if (attackPatch) { const { damage: _d, ...p } = attackPatch; def.attack = { ...def.attack, ...p }; }
    if (specials) {
      const base = def.attack?.damage ?? 20;
      def.specials = specials.map(({ dmgK = 1, damage: _d, ...s }) => ({ ...s, damage: Math.round(base * dmgK) }));
    }
    if (def.boss && hp) def.hp = hp; // Bosse: Leben absolut aus den Boss-Dateien
  }
}
