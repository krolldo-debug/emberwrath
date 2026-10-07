// Gegenstände für Stufe 21–40 (Thread C, INTEGRATION.md §12.7). Reine Daten; items.js baut daraus die Items.
//
// Tier 5: 21–25 (Aschensteppe, Hügelgrab), 6: 26–30 (Faulmarsch), 7: 31–35 (Frostzinnen),
// 8: 36–40 (Glutöde, Aschethron). Je Tier erzeugt gear() die Grundausrüstung (gewöhnlich, ungewöhnlich, selten)
// in einem eigenen Stil; epische Teile, Sets, benannte Bosswaffen und der legendäre Pool des Aschenfürsten
// sind von Hand geschrieben. Weitere Stufen (41+) brauchen nur einen neuen Eintrag in TIER_STYLES.
// Icons: <visual>_t5 … _t8 von Thread D (Waffen, Rüstung je Machart, Kopf, Hände, Füße, Schmuck).
const E = (id, name, ilvl, rarity, icon, desc = '', extra = {}) => ({ id, name, ilvl, rarity, icon, desc, ...extra });

// Stil je Tier und Seltenheit: [ID-Präfix, Namensteil]
export const TIER_STYLES = {
  5: { common: ['nomad', 'Nomaden'], uncommon: ['steppe', 'Steppenreiter'], rare: ['barrow', 'Grabwächter'] },
  6: { common: ['bog', 'Moor'], uncommon: ['mirewarden', 'Sumpfwächter'], rare: ['blightbane', 'Faulbann'] },
  7: { common: ['rimeforged', 'Reif'], uncommon: ['rimehunter', 'Reifjäger'], rare: ['jarl', 'Jarls'] },
  8: { common: ['waste', 'Ödland'], uncommon: ['bastion', 'Bastions'], rare: ['emberknight', 'Glutritter'] },
};
export function tierBase(tier) { return 21 + (tier - 5) * 5; }

// Teile: [ID-Teil, Wortteil, Familie, ID-Teil spät, Wortteil spät]. Waffen gibt es je Seltenheit früh und spät im Tier,
// damit jede Klasse unterwegs eine passende Waffe findet.
const WEAPON_PARTS = [
  ['sword', 'schwert', 'sword', 'blade', 'klinge'], ['sabre', 'säbel', 'sword', 'scimitar', 'krummsäbel'],
  ['greatsword', 'zweihänder', 'greatsword', 'claymore', 'großschwert'], ['axe', 'axt', 'axe', 'hatchet', 'beil'],
  ['mace', 'streitkolben', 'mace', 'morningstar', 'morgenstern'], ['dagger', 'dolch', 'dagger', 'stiletto', 'stilett'],
  ['bow', 'bogen', 'bow', 'longbow', 'langbogen'], ['staff', 'stab', 'staff', 'quarterstaff', 'kampfstab'], ['wand', 'zauberstab', 'wand', 'rod', 'zauberrute'],
];
const ARMOR_PARTS = {
  chest: [['robe', 'robe', 'cloth'], ['jerkin', 'wams', 'leather'], ['hauberk', 'kettenhemd', 'mail'], ['cuirass', 'harnisch', 'plate']],
  head: [['hood', 'kapuze', 'cloth'], ['cap', 'kappe', 'leather'], ['coif', 'haube', 'mail'], ['helm', 'helm', 'plate']],
  hands: [['gloves', 'handschuhe', 'cloth'], ['grips', 'griffe', 'leather'], ['mitts', 'kettenhandschuhe', 'mail'], ['gauntlets', 'stulpen', 'plate']],
  feet: [['slippers', 'schuhe', 'cloth'], ['boots', 'stiefel', 'leather'], ['greaves', 'schienen', 'mail'], ['sabatons', 'sabatons', 'plate']],
};
const JEWELRY_PARTS = { ring: ['ring', 'ring'], amulet: ['amulet', 'amulett'] };
// Grundform: Ring Leben + Stärke, Amulett Leben + Intelligenz (items.js makeStats); dazu die fehlenden Hauptattribute
const RARE_JEWELRY_VARIANTS = {
  ring: [['band', 'reif', ['vit', 'agi']], ['signet', 'siegel', ['vit', 'int']]],
  amulet: [['pendant', 'anhänger', ['vit', 'str']], ['talisman', 'talisman', ['vit', 'agi']]],
};

// „Steppenreiter“ + „schwert“ → „Steppenreiterschwert“, lange Wörter mit Bindestrich
function compound(prefix, word) {
  return prefix.length + word.length > 20 ? `${prefix}-${word[0].toUpperCase()}${word.slice(1)}` : `${prefix}${word}`;
}
export function armorIcon(slot, family, tier) {
  if (slot === 'chest') return `${family}_t${tier}`;
  if (slot === 'head') return `${family === 'cloth' || family === 'leather' ? 'hood' : 'helm'}_t${tier}`;
  if (slot === 'hands') return `gloves_${family}_t${tier}`;
  return `boots_${family}_t${tier}`;
}

// Grundausrüstung eines Tiers. Stufen verteilen sich über das Tier, damit es unterwegs laufend Verbesserungen gibt.
function gear(tier) {
  const b = tierBase(tier), styles = TIER_STYLES[tier];
  const weapons = {}, armor = { chest: [], head: [], hands: [], feet: [] }, jewelry = { ring: [], amulet: [] };
  const shift = { common: 0, uncommon: 2, rare: 4 };
  for (const [rarity, [sid, sname]] of Object.entries(styles)) {
    WEAPON_PARTS.forEach(([pid, word, family, pid2, word2], i) => {
      const early = b + ((i + shift[rarity]) % 2), late = b + 3 + ((i + shift[rarity]) % 2);
      (weapons[family] ??= []).push(E(`${sid}_${pid}`, compound(sname, word), early, rarity, `${family}_t${tier}`));
      weapons[family].push(E(`${sid}_${pid2}`, compound(sname, word2), late, rarity, `${family}_t${tier}`));
    });
    let k = 0;
    for (const [slot, parts] of Object.entries(ARMOR_PARTS)) {
      for (const [pid, word, family] of parts) {
        armor[slot].push(E(`${sid}_${pid}`, compound(sname, word), b + ((k * 3 + shift[rarity] + 1) % 5), rarity, armorIcon(slot, family, tier), '', { family }));
        k++;
      }
    }
    for (const [slot, [pid, word]] of Object.entries(JEWELRY_PARTS)) {
      const at = { ring: { common: 1, uncommon: 3, rare: 4 }, amulet: { common: 2, uncommon: 4, rare: 3 } }[slot][rarity];
      jewelry[slot].push(E(`${sid}_${pid}`, compound(sname, word), b + at, rarity, `${slot}_t${tier}`));
      // Seltener Schmuck trägt zwei Attribute: je Hauptattribut eine Fassung, damit jede Klasse passenden Schmuck findet
      if (rarity === 'rare') {
        for (const [vid, vword, attrs] of RARE_JEWELRY_VARIANTS[slot]) jewelry[slot].push(E(`${sid}_${vid}`, compound(sname, vword), b + at, rarity, `${slot}_t${tier}`, '', { attrs }));
      }
    }
  }
  return { weapons, armor, jewelry };
}

// ---------------------------------------------------------------- von Hand: episch (Zufallsbeute von Eliten/Bossen)
const EPIC_WEAPONS = {
  sword: [
    E('dustwind_blade', 'Staubwindklinge', 24, 'epic', 'sword_t5', 'Wer sie schwingt, hört den Steppenwind heulen.'),
    E('emberwraith_blade', 'Glutgeist', 38, 'epic', 'sword_t8', 'Die Klinge flackert wie eine Flamme, die sich nicht entscheiden kann, ob sie brennen will.'),
  ],
  greatsword: [
    E('glacier_edge', 'Gletscherschneide', 34, 'epic', 'greatsword_t7', 'Aus einem Stück Gletschereis geschlagen, das in tausend Jahren nicht getaut ist.'),
    E('ashfall', 'Aschefall', 39, 'epic', 'greatsword_t8', 'Jeder Hieb lässt einen grauen Schleier zurück, der langsam zu Boden sinkt.'),
  ],
  axe: [E('rotfang', 'Faulzahn', 28, 'epic', 'axe_t6', 'Die Schneide ist grün angelaufen. Wunden, die sie schlägt, riechen nach Moor.')],
  mace: [E('frostjarl_hammer', 'Hammer der Frostjarle', 35, 'epic', 'mace_t7', 'Die Jarle von Frosthold schwören seit zwölf Generationen auf diesen Hammer.')],
  dagger: [
    E('laughing_fang', 'Lachender Zahn', 23, 'epic', 'dagger_t5', 'Aus dem Kiefer einer Hyäne, die bis zuletzt gelacht hat.'),
    E('mist_thorn', 'Nebeldorn', 29, 'epic', 'dagger_t6', 'Im Nebel der Faulmarsch ist die Klinge unsichtbar.'),
    E('winterwhisper', 'Winterflüstern', 33, 'epic', 'dagger_t7', 'Wo sie trifft, bildet sich Reif auf der Haut.'),
    E('cinder_kris', 'Schlackenkris', 39, 'epic', 'dagger_t8', 'Die gewellte Klinge wurde in einem Lavastrom abgeschreckt. Sie zischt noch, wenn es regnet.'),
  ],
  bow: [
    E('windrunner', 'Windläufer', 25, 'epic', 'bow_t5', 'Die Pfeile fliegen, als hätte der Wind selbst sie geschickt.'),
    E('last_light', 'Letztes Licht', 40, 'epic', 'bow_t8', 'Der Bogen der letzten Bastion. Seine Sehne leuchtet, solange einer von ihnen lebt.'),
  ],
  staff: [
    E('grave_lantern', 'Grablaterne', 25, 'epic', 'staff_t5', 'Ein grünes Licht brennt in ihrer Spitze und wirft keine Schatten.'),
    E('aurora_staff', 'Nordlichtstab', 35, 'epic', 'staff_t7', 'In klaren Nächten tanzen farbige Schleier um seine Spitze.'),
    E('pyre_staff', 'Scheiterhaufen', 39, 'epic', 'staff_t8', 'Aus dem Holz des letzten Scheiterhaufens der Glutöde geschnitzt. Es brennt noch.'),
  ],
  wand: [E('bogwitch_wand', 'Zauberstab der Moorhexe', 29, 'epic', 'wand_t6', 'Er riecht nach Sumpf und flüstert in einer Sprache, die keiner mehr spricht.')],
};
const EPIC_ARMOR = {
  chest: [
    E('dustveil_mantle', 'Staubschleier', 24, 'epic', 'leather_t5', 'Ein Mantel der Steppenläufer. Im Staub sieht man seinen Träger nicht.', { family: 'leather' }),
    E('swampking_scales', 'Schuppen des Sumpfkönigs', 29, 'epic', 'mail_t6', 'Jede Schuppe stammt von einem anderen Tier, das der Sumpf verschlungen hat.', { family: 'mail' }),
    E('jarlsguard_plate', 'Jarlswacht', 34, 'epic', 'plate_t7', 'Die Rüstung der Leibwache von Frosthold. Kälte prallt an ihr ab wie Pfeile.', { family: 'plate' }),
    E('bastion_warplate', 'Kriegsplatte der Bastion', 39, 'epic', 'plate_t8', 'Die Dellen darin erzählen von hundert Belagerungen.', { family: 'plate' }),
    E('ember_silk_robe', 'Robe aus Glutseide', 38, 'epic', 'cloth_t8', 'Gewebt aus Fäden, die in der Glutöde aus dem Boden wachsen.', { family: 'cloth' }),
  ],
  head: [E('sporeveil_hood', 'Sporenschleier', 28, 'epic', 'hood_t6', 'Leuchtende Sporen tanzen um den Saum, aber sie schaden nur anderen.', { family: 'cloth' })],
  feet: [E('snowstalker_boots', 'Schneepirscher', 33, 'epic', 'boots_leather_t7', 'Sie hinterlassen im Schnee keine Spuren.', { family: 'leather', stats: { moveSpeed: 0.05 } })],
};
const EPIC_JEWELRY = {
  ring: [
    E('drowned_moon_ring', 'Ring des ertrunkenen Mondes', 30, 'epic', 'ring_t6', 'Im Stein spiegelt sich ein Mond, auch wenn keiner am Himmel steht.', { attrs: ['int', 'agi', 'vit'], stats: { critChance: 0.02 } }),
    E('magma_heart_ring', 'Magmaherz', 40, 'epic', 'ring_t8', 'Der Stein pulsiert warm, als schlüge darin ein kleines Herz.', { attrs: ['str', 'agi', 'vit'], stats: { critChance: 0.02 } }),
  ],
  amulet: [
    E('steppe_sun_disc', 'Sonnenscheibe der Steppe', 25, 'epic', 'amulet_t5', 'Die Nomaden tragen sie gegen den Aschewind. Sie wärmt auch nachts.', { attrs: ['vit', 'str', 'agi'] }),
    E('icebound_heart', 'Eisgebundenes Herz', 35, 'epic', 'amulet_t7', 'Ein Herz aus klarem Eis, in dem ein Funke gefangen ist.', { attrs: ['vit', 'int', 'agi'] }),
  ],
};

// ---------------------------------------------------------------- Sets (sets.js), nur von Eliten/Bossen
// Außengebiete: je ein Set vom Elite-Gegner; Dungeons: je ein Set + benannte Waffe vom Boss (loot.js).
const SET_ARMOR = {
  chest: [
    E('khar_hauberk', 'Kettenhemd des Steppenfürsten', 24, 'rare', 'mail_t5', 'Khars Rüstung. An den Ringen kleben noch Staub und Blut.', { family: 'mail', source: 'boss', set: 'warlord' }),
    E('hillking_cuirass', 'Harnisch des Hügelkönigs', 26, 'rare', 'plate_t6', 'Ulgrim wurde darin begraben. Er hat ihn nie abgelegt.', { family: 'plate', source: 'boss', set: 'hillking' }),
    E('bogdread_jerkin', 'Wams des Moorgrauens', 29, 'rare', 'leather_t6', 'Die Haut des Moorgrauens, gegerbt und doch noch feucht.', { family: 'leather', source: 'boss', set: 'bogdread' }),
    E('rotmother_robe', 'Robe der Mutter Fäulnis', 32, 'rare', 'cloth_t7', 'Pilzfäden durchziehen den Stoff und leuchten im Dunkeln.', { family: 'cloth', source: 'boss', set: 'rotmother' }),
    E('gorm_cuirass', 'Gorms Eisharnisch', 34, 'rare', 'plate_t7', 'Aus dem Panzer eines Eistrolls geschnitten. Er wird nie warm.', { family: 'plate', source: 'boss', set: 'gorm' }),
    E('wyrmscale_jerkin', 'Wurmschuppenwams', 37, 'rare', 'leather_t8', 'Die Schuppen Skalvyrs, dünn wie Glas und hart wie Stahl.', { family: 'leather', source: 'boss', set: 'wyrmscale' }),
    E('colossus_robe', 'Robe der Kolossglut', 39, 'rare', 'cloth_t8', 'Aus dem glühenden Innern des Kolosses gewoben.', { family: 'cloth', source: 'boss', set: 'colossus' }),
  ],
  head: [
    E('khar_helm', 'Helm des Steppenfürsten', 24, 'rare', 'helm_t5', 'Ein Pferdeschweif weht vom Scheitel.', { family: 'mail', source: 'boss', set: 'warlord' }),
    E('hillking_helm', 'Krone des Hügelkönigs', 26, 'rare', 'helm_t6', 'Eine eiserne Krone, in die Grabrunen geschlagen sind.', { family: 'plate', source: 'boss', set: 'hillking' }),
    E('bogdread_hood', 'Kapuze des Moorgrauens', 29, 'rare', 'hood_t6', '', { family: 'leather', source: 'boss', set: 'bogdread' }),
    E('rotmother_hood', 'Pilzhaube der Mutter Fäulnis', 32, 'rare', 'hood_t7', '', { family: 'cloth', source: 'boss', set: 'rotmother' }),
    E('gorm_helm', 'Gorms Hörnerhelm', 34, 'rare', 'helm_t7', 'Die Hörner stammen von Gorm selbst.', { family: 'plate', source: 'boss', set: 'gorm' }),
    E('wyrmscale_cap', 'Wurmschuppenkappe', 37, 'rare', 'hood_t8', '', { family: 'leather', source: 'boss', set: 'wyrmscale' }),
    E('colossus_hood', 'Kapuze der Kolossglut', 39, 'rare', 'hood_t8', '', { family: 'cloth', source: 'boss', set: 'colossus' }),
    E('sovereign_helm', 'Krone des Aschenfürsten', 40, 'epic', 'helm_t8', 'Malgareths Krone. Die Flammen darauf sind das Zeichen, das du auf Varkhuls Siegel gesehen hast.', { family: 'plate', source: 'boss', set: 'sovereign' }),
  ],
  hands: [
    E('khar_grips', 'Griffe des Steppenfürsten', 24, 'rare', 'gloves_mail_t5', '', { family: 'mail', source: 'boss', set: 'warlord' }),
    E('hillking_gauntlets', 'Stulpen des Hügelkönigs', 26, 'rare', 'gloves_plate_t6', '', { family: 'plate', source: 'boss', set: 'hillking' }),
    E('bogdread_grips', 'Griffe des Moorgrauens', 29, 'rare', 'gloves_leather_t6', '', { family: 'leather', source: 'boss', set: 'bogdread' }),
    E('rotmother_gloves', 'Handschuhe der Mutter Fäulnis', 32, 'rare', 'gloves_cloth_t7', '', { family: 'cloth', source: 'boss', set: 'rotmother' }),
    E('gorm_gauntlets', 'Gorms Eisfäuste', 34, 'rare', 'gloves_plate_t7', '', { family: 'plate', source: 'boss', set: 'gorm' }),
    E('wyrmscale_grips', 'Wurmschuppengriffe', 37, 'rare', 'gloves_leather_t8', '', { family: 'leather', source: 'boss', set: 'wyrmscale' }),
    E('colossus_gloves', 'Handschuhe der Kolossglut', 39, 'rare', 'gloves_cloth_t8', '', { family: 'cloth', source: 'boss', set: 'colossus' }),
    E('sovereign_gauntlets', 'Stulpen des Aschenfürsten', 40, 'epic', 'gloves_plate_t8', 'Was sie greifen, zerfällt zu Asche.', { family: 'plate', source: 'boss', set: 'sovereign' }),
  ],
  feet: [
    E('khar_boots', 'Reitstiefel des Steppenfürsten', 24, 'rare', 'boots_mail_t5', '', { family: 'mail', source: 'boss', set: 'warlord', stats: { moveSpeed: 0.02 } }),
    E('bogdread_boots', 'Stiefel des Moorgrauens', 29, 'rare', 'boots_leather_t6', '', { family: 'leather', source: 'boss', set: 'bogdread' }),
    E('gorm_sabatons', 'Gorms Eisschritt', 34, 'rare', 'boots_plate_t7', '', { family: 'plate', source: 'boss', set: 'gorm' }),
    E('wyrmscale_boots', 'Wurmschuppenstiefel', 37, 'rare', 'boots_leather_t8', '', { family: 'leather', source: 'boss', set: 'wyrmscale', stats: { moveSpeed: 0.03 } }),
    E('colossus_slippers', 'Schuhe der Kolossglut', 39, 'rare', 'boots_cloth_t8', '', { family: 'cloth', source: 'boss', set: 'colossus' }),
    E('sovereign_sabatons', 'Sabatons des Aschenfürsten', 40, 'epic', 'boots_plate_t8', 'Jeder Schritt lässt den Boden glimmen.', { family: 'plate', source: 'boss', set: 'sovereign' }),
  ],
};
const SET_JEWELRY = {
  ring: [E('hillking_ring', 'Siegelring des Hügelkönigs', 26, 'rare', 'ring_t6', 'Mit ihm siegelte Ulgrim die Gräber seiner Feinde.', { source: 'boss', set: 'hillking', attrs: ['str', 'vit'] })],
  amulet: [E('rotmother_amulet', 'Sporenherz', 32, 'rare', 'amulet_t7', 'Es pocht langsam, wie ein Pilz, der atmet.', { source: 'boss', set: 'rotmother', attrs: ['int', 'vit'] })],
};
// Benannte Bosswaffen (loot.js BOSSES.named)
const NAMED_WEAPONS = {
  sword: [E('ulgrim_blade', 'Ulgrims Grabklinge', 26, 'rare', 'sword_t6', 'Das Schwert, mit dem der Hügelkönig begraben wurde. Es will zurück.', { source: 'boss', stats: { maxHp: 30 } })],
  staff: [E('rotmother_staff', 'Stab der Mutter Fäulnis', 32, 'rare', 'staff_t7', 'Ein knorriger Pilzstiel, der nie aufhört zu wachsen.', { source: 'boss', stats: { maxResource: 20 } })],
  dagger: [E('skalvyr_fang', 'Skalvyrs Fang', 37, 'rare', 'dagger_t8', 'Ein Zahn des Frostwurms. Er schmilzt nicht einmal in der Glutöde.', { source: 'boss', stats: { critChance: 0.02 } })],
  bow: [E('skalvyr_rib_bow', 'Rippenbogen des Frostwurms', 37, 'rare', 'bow_t8', 'Aus einer Rippe Skalvyrs gebogen. Die Sehne knistert vor Kälte.', { source: 'boss', stats: { critChance: 0.015 } })],
};

// ---------------------------------------------------------------- legendärer Pool des Aschenfürsten (ilvl 40)
export const SOVEREIGN_LEGENDARIES = ['sovereign_plate', 'kingsbane', 'veilpiercer', 'dawnstring', 'staff_of_last_ash', 'sovereign_signet'];
const LEGENDARY_WEAPONS = {
  greatsword: [E('kingsbane', 'Königsfall', 40, 'legendary', 'greatsword_t8', 'Die Klinge, die Malgareth den Thron nahm. Sie ist schwer von allem, was sie beendet hat.', { source: 'boss' })],
  dagger: [E('veilpiercer', 'Schleierstecher', 40, 'legendary', 'dagger_t8', 'Man sagt, sie schneide durch die Grenze zwischen Asche und Leben.', { source: 'boss' })],
  bow: [E('dawnstring', 'Morgensehne', 40, 'legendary', 'bow_t8', 'Ihr erster Pfeil nach jeder Nacht leuchtet wie die aufgehende Sonne.', { source: 'boss' })],
  staff: [E('staff_of_last_ash', 'Stab der letzten Asche', 40, 'legendary', 'staff_t8', 'Im Kern schwelt das letzte Feuer des Aschethrons. Es gehorcht jetzt dir.', { source: 'boss' })],
};
const LEGENDARY_ARMOR = {
  chest: [E('sovereign_plate', 'Harnisch des Aschenfürsten', 40, 'legendary', 'plate_t8', 'Malgareths eigene Rüstung. Unter der Asche glüht sie noch.', { family: 'plate', source: 'boss', set: 'sovereign' })],
};
const LEGENDARY_JEWELRY = {
  ring: [E('sovereign_signet', 'Siegel des Aschenfürsten', 40, 'legendary', 'ring_t8', 'Die Flammenkrone, klein genug für einen Finger. Jeder Diener Malgareths trug ihr Abbild.', { source: 'boss', set: 'sovereign', attrs: ['str', 'agi', 'int'], stats: { critChance: 0.03 } })],
};

// ---------------------------------------------------------------- Zusammenführen
function merge(...tables) {
  const out = {};
  for (const t of tables) for (const [k, list] of Object.entries(t)) (out[k] ??= []).push(...list);
  return out;
}
const TIERS = [5, 6, 7, 8].map(gear);
export const WEAPONS_40 = merge(...TIERS.map((t) => t.weapons), EPIC_WEAPONS, NAMED_WEAPONS, LEGENDARY_WEAPONS);
export const ARMOR_40 = merge(...TIERS.map((t) => t.armor), EPIC_ARMOR, SET_ARMOR, LEGENDARY_ARMOR);
export const JEWELRY_40 = merge(...TIERS.map((t) => t.jewelry), EPIC_JEWELRY, SET_JEWELRY, LEGENDARY_JEWELRY);

// ---------------------------------------------------------------- Verbrauch, Material, Quest, Reittiere
const MOUNT_ITEM = (mountId, name, rarity, value, extra = {}) => ({
  name, type: 'mount', mountId, rarity, ilvl: 20, reqLevel: 20, icon: `mount_${mountId}`, stack: 1, value,
  desc: 'Benutzen, um das Reittier zu erlernen. Aufsitzen mit V oder dem Reittier-Knopf.', ...extra,
});
export const OTHER_40 = {
  superior_potion: { name: 'Vorzüglicher Heiltrank', type: 'consumable', rarity: 'uncommon', ilvl: 21, icon: 'potion_hp_l', use: { heal: 450 }, stack: 20, value: 25, desc: 'Stellt 450 Leben wieder her.' },
  supreme_potion: { name: 'Erhabener Heiltrank', type: 'consumable', rarity: 'uncommon', ilvl: 31, icon: 'potion_hp_l', use: { heal: 800 }, stack: 20, value: 40, desc: 'Stellt 800 Leben wieder her.' },
  greater_mana: { name: 'Großer Manatrank', type: 'consumable', rarity: 'uncommon', ilvl: 21, icon: 'potion_mana_l', use: { resource: 120 }, stack: 20, value: 22, desc: 'Stellt 120 Ressource wieder her.' },
  supreme_mana: { name: 'Erhabener Manatrank', type: 'consumable', rarity: 'uncommon', ilvl: 31, icon: 'potion_mana_l', use: { resource: 180 }, stack: 20, value: 35, desc: 'Stellt 180 Ressource wieder her.' },
  steppe_jerky: { name: 'Steppendörrfleisch', type: 'consumable', rarity: 'common', ilvl: 20, icon: 'food_meat', use: { heal: 180 }, stack: 20, value: 6, desc: 'Zäh, salzig und sättigend. Stellt 180 Leben wieder her.' },

  // Materialien je Zone
  hyena_hide: { name: 'Hyänenfell', type: 'material', rarity: 'common', icon: 'pelt', stack: 50, value: 8, desc: 'Gefleckt und zäh. Orla macht daraus Sattelzeug.' },
  vulture_feather: { name: 'Geierfeder', type: 'material', rarity: 'common', icon: 'fang', stack: 50, value: 8, desc: 'Grau vom Aschewind. Die Nomaden befiedern ihre Pfeile damit.' },
  raider_arrowhead: { name: 'Plündererspitze', type: 'material', rarity: 'common', icon: 'ore_iron', stack: 50, value: 7, desc: 'Grob geschmiedet und mit Asche geschwärzt.' },
  barrow_bone: { name: 'Hügelgrabknochen', type: 'material', rarity: 'common', icon: 'bone', stack: 50, value: 9, desc: 'Alt, gelb und kalt wie Stein.' },
  leech_ichor: { name: 'Egelschleim', type: 'material', rarity: 'common', icon: 'potion_mana_s', stack: 50, value: 10, desc: 'Grünlich und klebrig. Brisa braucht ihn für ihre Tränke.' },
  toad_gland: { name: 'Krötendrüse', type: 'material', rarity: 'common', icon: 'essence_shadow', stack: 50, value: 10, desc: 'Sie pulsiert noch. Nicht anfassen, wenn es geht.' },
  spore_cap: { name: 'Sporenkappe', type: 'material', rarity: 'common', icon: 'dust', stack: 50, value: 11, desc: 'Ein leuchtender Pilzhut aus dem Sporenschlund.' },
  bog_iron: { name: 'Moorraseneisen', type: 'material', rarity: 'uncommon', icon: 'ore_iron', stack: 50, value: 28, desc: 'Rostrot und schwer. Aus dem Grund der Faulmarsch.' },
  frost_pelt: { name: 'Frostwolfsfell', type: 'material', rarity: 'common', icon: 'pelt', stack: 50, value: 13, desc: 'Weiß wie frischer Schnee und doppelt so dicht.' },
  troll_fat: { name: 'Trollfett', type: 'material', rarity: 'common', icon: 'food_meat', stack: 50, value: 13, desc: 'Die Frostholder fetten damit Stiefel und Klingen ein.' },
  crystal_silk: { name: 'Kristallseide', type: 'material', rarity: 'uncommon', icon: 'spider_silk', stack: 50, value: 32, desc: 'Fäden aus Eis, die nicht brechen.' },
  rime_crystal: { name: 'Reifkristall', type: 'material', rarity: 'uncommon', icon: 'gem_sapphire', stack: 50, value: 36, desc: 'Er schmilzt nicht, egal wie warm die Hand ist.' },
  magma_scale: { name: 'Magmaschuppe', type: 'material', rarity: 'uncommon', icon: 'ore_ember', stack: 50, value: 40, desc: 'Von den Magmaschlangen der Glutöde. Heiß genug, um Holz zu entzünden.' },
  adept_sigil: { name: 'Adeptensiegel', type: 'material', rarity: 'common', icon: 'seal', stack: 50, value: 16, desc: 'Das Zeichen der Flammenkrone, in Wachs gedrückt.' },
  pilgrim_relic: { name: 'Pilgerreliquie', type: 'material', rarity: 'common', icon: 'relic', stack: 50, value: 16, desc: 'Ein kleines Heiligtum der Pilger, die nie am Thron ankamen.' },

  // Questgegenstände
  khar_warhorn: { name: 'Khars Kriegshorn', type: 'quest', rarity: 'rare', icon: 'fang', stack: 1, value: 0, desc: 'Mit ihm rief Khar die Stämme. Varra will es zerbrechen.' },
  barrow_seal: { name: 'Grabsiegel des Hügelkönigs', type: 'quest', rarity: 'epic', icon: 'seal', stack: 1, value: 0, desc: 'Auf dem Siegel glüht eine Krone aus Flammen.' },
  rot_idol: { name: 'Faulgötze', type: 'quest', rarity: 'common', icon: 'relic', stack: 10, value: 0, desc: 'Ein Götzenbild aus Torf und Knochen. Es riecht nach Verwesung.' },
  horror_heart: { name: 'Herz des Moorgrauens', type: 'quest', rarity: 'rare', icon: 'essence_shadow', stack: 1, value: 0, desc: 'Es schlägt noch. Thane will es brennen sehen.' },
  gorm_tusk: { name: 'Gorms Hauer', type: 'quest', rarity: 'rare', icon: 'fang', stack: 1, value: 0, desc: 'So lang wie ein Unterarm. Beweis genug für jeden Jarl.' },
  wyrm_heart: { name: 'Herz des Frostwurms', type: 'quest', rarity: 'epic', icon: 'gem_sapphire', stack: 1, value: 0, desc: 'Ein Eisklumpen, in dem ein Funke der Flammenkrone gefangen ist.' },
  colossus_core: { name: 'Kern des Glutkolosses', type: 'quest', rarity: 'rare', icon: 'ore_ember', stack: 1, value: 0, desc: 'Er glüht so hell, dass man nicht hineinsehen kann.' },
  ash_prayer: { name: 'Aschengebet', type: 'quest', rarity: 'common', icon: 'scroll', stack: 10, value: 0, desc: 'Ein Gebet an Malgareth, auf Haut geschrieben.' },
  spice_bale: { name: 'Gewürzballen', type: 'quest', rarity: 'common', icon: 'bag', stack: 10, value: 0, desc: 'Safran, Zimt und Glutpfeffer. Er gehört Imra.' },
  moll_crate: { name: 'Molls Warenkiste', type: 'quest', rarity: 'common', icon: 'potion_hp_m', stack: 10, value: 0, desc: 'Nass und verbeult. Drinnen klirren Tränke.' },
  stalker_claw: { name: 'Pirscherkralle', type: 'quest', rarity: 'common', icon: 'charm_tooth', stack: 10, value: 0, desc: 'Weiß, gebogen und scharf wie ein Messer.' },
  witch_charm: { name: 'Frostzeichen', type: 'quest', rarity: 'uncommon', icon: 'charm_skull', stack: 10, value: 0, desc: 'Ein Knochen an einer Schnur aus Eis. Er ist kälter als Schnee.' },
  bastion_supplies: { name: 'Vorratsbündel', type: 'quest', rarity: 'common', icon: 'food_bread', stack: 10, value: 0, desc: 'Brot, Verbände und Pfeilspitzen für die letzte Bastion.' },
  sovereign_crown: { name: 'Flammenkrone', type: 'quest', rarity: 'legendary', icon: 'relic', stack: 1, value: 0, desc: 'Die Krone des Aschenfürsten. Das Zeichen, das alles begann.' },

  // Reittiere (§12.6): Benutzen → mount:learn. price = Kaufpreis bei Orla (ersetzt value × 4).
  // reqQuest: Orla verkauft erst nach dieser Quest. Gold allein (auch gekauftes) reicht nie: Das Glutross gibt es erst nach Malgareth.
// Preise aus test/pacing.mjs: Stufe 25–35 bringt höchstens ≈ 28 000 Gold je Stunde (alle Beute verkauft), realistisch
// ≈ 75 % davon → seltenes Reittier ≈ 3,5 Stunden. Stufe 20→40 bringt realistisch ≈ 160 000 Gold → das epische erst gegen 40.
  mount_steppe_horse: MOUNT_ITEM('steppe_horse', 'Zügel: Steppenpferd', 'rare', 2500, { source: 'vendor', price: 75000, reqQuest: 'q_first_ride' }),
  mount_ash_wolf: MOUNT_ITEM('ash_wolf', 'Halsband: Aschenwolf', 'rare', 2500, { source: 'vendor', price: 75000, reqQuest: 'q_first_ride' }),
  mount_marsh_strider: MOUNT_ITEM('marsh_strider', 'Pfeife: Sumpfschreiter', 'rare', 2500, { source: 'boss' }),
  mount_bone_stallion: MOUNT_ITEM('bone_stallion', 'Totenglocke: Knochenhengst', 'epic', 8000, { source: 'boss' }),
  mount_spore_beetle: MOUNT_ITEM('spore_beetle', 'Sporenhorn: Sporenkäfer', 'epic', 8000, { source: 'boss' }),
  mount_frost_elk: MOUNT_ITEM('frost_elk', 'Eishorn: Frostelch', 'epic', 8000, { source: 'boss' }),
  mount_ember_charger: MOUNT_ITEM('ember_charger', 'Zügel: Glutross', 'epic', 15000, { source: 'vendor', reqLevel: 40, price: 150000, reqQuest: 'q_ash_sovereign' }),
  mount_cinder_drake: MOUNT_ITEM('cinder_drake', 'Drachenei: Schlackendrache', 'legendary', 25000, { source: 'boss' }),
  mount_hellhound: MOUNT_ITEM('hellhound', 'Glutkette: Höllenhund', 'legendary', 25000, { source: 'boss' }),
  mount_rime_drake: MOUNT_ITEM('rime_drake', 'Eisei: Reifschwinge', 'legendary', 25000, { source: 'boss' }),
  mount_nightmare_steed: MOUNT_ITEM('nightmare_steed', 'Schattenzügel: Albtraumross', 'legendary', 25000, { source: 'trial' }),
};
