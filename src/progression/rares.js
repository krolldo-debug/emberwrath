// Seltene Weltgegner (Thread C). Reine Daten + Regeln, ohne DOM.
//
// Ein seltener Gegner ist ein verstärkter Gegner eines vorhandenen Typs (`base`) mit eigenem Namen,
// Farbton und eigener Beute. Thread B spawnt ihn (game.progression.rareSpawns(zoneId)) und meldet den
// Tod mit `rareId` in EV.ENEMY_KILLED. Alles andere (XP, Beute, Erfolge, Wiederkehr) macht Thread C.
//
// Eintrag: { name, title, zone, base, level, hpMult, dmgMult, scale, tint, spawn, respawn, signature, lore }
//   spawn      Hinweis für B, wo er steht: 'deep' (weit weg vom Eingang) | 'path' (am Weg) | 'boss' (vor dem Boss)
//   respawn    Sekunden, bis er nach einem Kill wieder erscheinen kann (danach 50 % je Zonenbetreten)
//   signature  [itemId, Chance] – eigenes Beutestück, das nur er fallen lässt
// 1 Teil mindestens grün (blau 28 %, lila 2 %), eigenes Beutestück 25 %.
export const RARE_ENEMIES = {
  greymaw: {
    name: 'Graumaul', title: 'der Uralte', zone: 'emberhollow', base: 'wolf_alpha', level: 4,
    hpMult: 3.2, dmgMult: 1.4, scale: 1.25, tint: '#b8c4d0', spawn: 'deep', respawn: 300,
    signature: ['greymaw_fang', 0.25],
    lore: 'Älter als das Dorf, sagen die Jäger. Sein Fell ist grau vor Asche und Jahren.',
  },
  bone_scribe: {
    name: 'Mortis', title: 'der Knochenschreiber', zone: 'catacombs', base: 'skeleton', level: 5,
    hpMult: 3.5, dmgMult: 1.4, scale: 1.2, tint: '#a58cff', spawn: 'deep', respawn: 300,
    signature: ['scribe_quill', 0.25],
    lore: 'Er schreibt die Namen der Toten in die Wände. Manche davon leben noch.',
  },
  borka: {
    name: 'Borka', title: 'die Aschenhauerin', zone: 'ashwood', base: 'bandit', level: 9,
    hpMult: 3.5, dmgMult: 1.5, scale: 1.2, tint: '#ff8a4a', spawn: 'path', respawn: 360,
    signature: ['borka_cleaver', 0.25],
    lore: 'Hat drei Hauptmänner der Grenzwacht erschlagen und trägt ihre Abzeichen am Gürtel.',
  },
  thorn_mother: {
    name: 'Die Dornenmutter', title: 'Brut des Waldes', zone: 'ashwood', base: 'thorn_crawler', level: 10,
    hpMult: 4, dmgMult: 1.4, scale: 1.4, tint: '#8fe06a', spawn: 'deep', respawn: 360,
    signature: ['thornmother_grips', 0.25],
    lore: 'Jeder Dornkriecher im Aschenwald ist aus ihrem Leib gekrochen.',
  },
  salt_king: {
    name: 'Der Salzkönig', title: 'Herr der Ertrunkenen', zone: 'sunken_temple', base: 'drowned', level: 12,
    hpMult: 4, dmgMult: 1.5, scale: 1.3, tint: '#7ad8ff', spawn: 'deep', respawn: 420,
    signature: ['salt_crown_ring', 0.25],
    lore: 'Er herrschte über den Tempel, bevor Nerith kam. Die Flut hat ihm nur die Krone gelassen.',
  },
  cinderfist: {
    name: "Asch'rak", title: 'Schlackenfaust', zone: 'cinder_peaks', base: 'ash_golem', level: 15,
    hpMult: 4, dmgMult: 1.5, scale: 1.3, tint: '#ff5a2a', spawn: 'path', respawn: 480,
    signature: ['cinderfist_maul', 0.25],
    lore: 'Ein Golem, den die Kultisten nicht mehr bändigen konnten. Er sucht seinen Schöpfer.',
  },
  emberwing: {
    name: 'Glutschwinge', title: 'Mutter der Drachen', zone: 'molten_forge', base: 'ember_drake', level: 19,
    hpMult: 4.5, dmgMult: 1.5, scale: 1.45, tint: '#ffd84a', spawn: 'deep', respawn: 600,
    signature: ['emberwing_scale', 0.25],
    lore: 'Ignaroth hat sie mit seinem Blut genährt. Ihre Schuppen glühen wie frisches Eisen.',
  },
};

export const RARE_XP_MULT = 8;          // Elite ×5, seltene ×8
export const RARE_GOLD_MULT = 6;
export const RARE_WEIGHTS = { uncommon: 70, rare: 28, epic: 2 };
export const RARE_RESPAWN_CHANCE = 0.5;

// Welche seltenen Gegner beim Betreten einer Zone erscheinen.
// Nie besiegt: immer. Sonst nach Ablauf von `respawn` mit 50 %. now = Millisekunden (Date.now()).
export function rareSpawnsFor(zoneId, rareSlice, now, rng = Math.random) {
  const out = [];
  for (const [id, r] of Object.entries(RARE_ENEMIES)) {
    if (r.zone !== zoneId) continue;
    const last = rareSlice?.killedAt?.[id];
    if (last == null || (now - last >= r.respawn * 1000 && rng() < RARE_RESPAWN_CHANCE)) out.push(rareSpawnSpec(id));
  }
  return out;
}

// Das, was B zum Spawnen braucht.
export function rareSpawnSpec(id) {
  const r = RARE_ENEMIES[id];
  if (!r) return null;
  return { rareId: id, type: r.base, name: r.name, title: r.title, level: r.level, hpMult: r.hpMult, dmgMult: r.dmgMult, scale: r.scale, tint: r.tint, spawn: r.spawn, elite: true };
}
