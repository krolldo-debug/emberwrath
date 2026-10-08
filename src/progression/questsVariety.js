// Questvielfalt (Thread C, Runde 08.10.). Nutzer: „pro Questgebiet immer die gleichen Quests“.
// Jedes Gebiet bekommt Quests mit anderen Zielarten als Töten und Sammeln:
//   sequence (Rätsel in fester Reihenfolge), use (Gegenstand an einem Ort benutzen), reach mit mehreren Flächen (Erkunden),
//   escort / defend (Eskorte, Verteidigen; B meldet Erfolg über 'quest:objective'), choices (Entscheidung mit Folgen).
// Welt-Objekte und Flächen, die B dafür platziert: INTEGRATION.md §13.3 (Liste auch in README.md).
// Quests mit `needs` bleiben verborgen, bis B die Funktion über game.progression.setWorldFeatures() meldet.
// quests.js hängt diese Tabelle an QUESTS an.
import { questXp } from './xp.js';

const Q = (level, weight) => questXp(level, weight);
// Stufe 1–20 bewusst leicht (das Tempo dort ist am Nutzer geeicht), ab 20 wie Nebenquests in quests40.js
const W = { early: 0.3, side: 0.13, event: 0.155, choice: 0.1 };

export const QUESTS_VARIETY = {
  // ------------------------------------------------------------------ Glutsenke (1–5)
  q_poisoned_wells: {
    title: 'Bitteres Wasser', giver: 'elder_maren', level: 2, requires: ['q_ashen_wolves'],
    summary: 'Reinige die beiden Brunnen der Glutsenke mit Marens Salz.',
    offer: 'Das Wasser schmeckt nach Asche, und gestern ist die Ziege der Müllerin nicht mehr aufgestanden. Hier, das ist Reinsalz, das Letzte, was wir haben. Streu es in den Dorfbrunnen und in den an der Mühle. Ein Beutel je Brunnen, mehr nicht.',
    progressText: 'Ein Beutel Reinsalz in den Dorfbrunnen, einer in den Brunnen an der Mühle.',
    completeText: 'Klar wie früher. Ich habe schon vergessen, wie Wasser ohne Asche schmeckt.',
    startItems: [{ itemId: 'clean_salts', qty: 2 }],
    objectives: [{ id: 'wells', text: 'Brunnen mit Reinsalz gereinigt', count: 2, kind: 'use', item: 'clean_salts', target: ['well_village', 'well_mill'], zone: 'emberhollow' }],
    rewards: { xp: Q(2, W.early), gold: 15, items: [{ itemId: 'hearth_bread', qty: 3 }] },
  },
  q_beacon_stones: {
    title: 'Die alten Feuersteine', giver: 'smith_brom', level: 4, requires: ['q_glutfang'],
    summary: 'Entzünde die drei Feuersteine um die Senke in der richtigen Reihenfolge.',
    offer: 'Mein Großvater hat erzählt, die drei Feuersteine um die Senke halten das Schlimmste fern. Man muss sie in der alten Folge anzünden, sonst verlöschen sie. Erst der Stein, wo die Sonne aufgeht. Dann der unter dem Berg. Zuletzt der, wo sie untergeht.',
    progressText: 'Osten, dann Norden unter dem Berg, dann Westen.',
    completeText: 'Ich habe es vom Amboss aus gesehen. Drei Feuer auf einmal. Großvater hatte also recht.',
    objectives: [{ id: 'stones', text: 'Feuersteine entzündet (Osten, Norden, Westen)', count: 3, kind: 'sequence', target: ['beacon_east', 'beacon_north', 'beacon_west'], zone: 'emberhollow', failText: 'Die Steine verlöschen. Erst Osten, dann Norden, zuletzt Westen.' }],
    rewards: { xp: Q(4, W.early), gold: 25, gear: [{ ilvl: 5, rarity: 'uncommon', slot: 'hands' }] },
  },

  // ------------------------------------------------------------------ Aschenwald (6–11)
  q_ashwood_lookouts: {
    title: 'Augen im Wald', giver: 'warden_ilsa', level: 7, requires: ['q_boar_cull'],
    summary: 'Prüfe die drei alten Wachposten des Aschenwalds.',
    offer: 'Früher hatte die Grenzwacht drei Posten im Wald: am Nordhang, am Bach im Osten und an der alten Eiche im Süden. Seit dem Ascheregen war keiner mehr dort. Geh hin und sieh nach, ob noch etwas steht. Und wer dort jetzt wohnt.',
    progressText: 'Nordhang, Bach im Osten, alte Eiche im Süden.',
    completeText: 'Drei Posten, alle verlassen, und überall Banditenspuren. Gut zu wissen, bevor wir hingehen.',
    objectives: [{ id: 'posts', text: 'Wachposten erkundet', count: 3, kind: 'reach', target: ['ashwood_lookout_n', 'ashwood_lookout_e', 'ashwood_lookout_s'], zone: 'ashwood' }],
    rewards: { xp: Q(7, W.early), gold: 35, gear: [{ ilvl: 8, rarity: 'uncommon', slot: 'feet' }] },
  },
  q_vesk_cart: {
    title: 'Der Karren muss durch', giver: 'trader_vesk', level: 9, requires: ['q_bandit_camp'], needs: 'escort',
    summary: 'Begleite Vesks Kutscher sicher bis zur Straße in die Schlackenhöhen.',
    offer: 'Mein Kutscher Tamm will nicht mehr allein fahren. Die Banditen haben ihm letztes Mal das Pferd unter dem Hintern weggeschossen. Bring ihn bis zur Straße in die Höhen. Ich zahle, wenn der Karren ankommt. Und Tamm auch, wenn es sich machen lässt.',
    progressText: 'Tamm wartet beim Karren im Lager. Bleib nah bei ihm.',
    completeText: 'Er ist da? Mit Karren? Dann bist du jeden Kupfer wert.',
    objectives: [{ id: 'cart', text: 'Tamm und den Karren zur Straße gebracht', count: 1, kind: 'escort', target: 'escort_vesk_cart', start: { kind: 'object', id: 'vesk_cart' }, zone: 'ashwood', failText: 'Tamm ist gefallen. Er wartet wieder beim Karren im Lager.' }],
    rewards: { xp: Q(9, W.early), gold: 70, gear: [{ ilvl: 10, rarity: 'uncommon', slot: 'weapon' }] },
  },
  q_bandit_ledger: {
    title: 'Das Kontobuch', giver: 'warden_ilsa', level: 10, requires: ['q_bandit_chief'],
    summary: 'Finde heraus, wer die Banditen bezahlt.',
    offer: 'Der Anführer ist tot, aber jemand hat ihm Waffen verkauft. Gute Waffen, nicht aus dem Wald. In seiner Truhe im Lager muss ein Kontobuch liegen. Bring es mir, bevor es verbrennt.',
    progressText: 'Die Truhe steht im Zelt des Anführers.',
    completeText: 'Lies selbst. Jede Lieferung trägt dasselbe Zeichen: das Siegel von Vesk, unserem Händler. Er hat beide Seiten beliefert. Was soll ich mit ihm machen? Du hast das Buch gefunden. Entscheide du.',
    objectives: [{ id: 'ledger', text: 'Kontobuch aus der Truhe des Anführers geholt', count: 1, kind: 'interact', target: ['bandit_strongbox'], zone: 'ashwood' }],
    rewards: { xp: Q(10, W.early), gold: 30 },
    choices: [
      { id: 'expose', label: 'Vesk der Wache übergeben', hint: 'Ilsa zahlt dir die Belohnung der Wache. Vesk muss Buße tun.', rewards: { gold: 60 } },
      { id: 'spare', label: 'Vesk eine Chance geben', hint: 'Vesk bleibt dir etwas schuldig. Ilsa ist enttäuscht.', rewards: { items: [{ itemId: 'ember_elixir', qty: 1 }] } },
    ],
  },
  q_vesk_penance: {
    title: 'Buße', giver: 'trader_vesk', level: 10, requires: ['q_bandit_ledger'], requiresChoice: ['q_bandit_ledger', 'expose'],
    summary: 'Vesk muss die gestohlene Ware der Wache zurückkaufen. Hilf ihm, die Kisten zu finden.',
    offer: 'Ich habe Fehler gemacht, ja. Ilsa will die Waffen zurück, alle. Die Banditen haben vier Kisten im Wald versteckt. Hilf mir, sie zu finden, und ich bin vielleicht bald wieder ein ehrlicher Mann.',
    progressText: 'Vier Kisten mit Vesks Waffen liegen im Wald.',
    completeText: 'Vier Kisten. Ilsa redet wieder mit mir. Fast freundlich. Hier, das ist kein Bestechungsgeld. Das ist ein Dank.',
    objectives: [{ id: 'crates', text: 'Waffenkisten gefunden', count: 4, kind: 'interact', target: ['weapon_crate_1', 'weapon_crate_2', 'weapon_crate_3', 'weapon_crate_4'], zone: 'ashwood' }],
    rewards: { xp: Q(10, W.early), gold: 50, gear: [{ ilvl: 11, rarity: 'uncommon', slot: 'ring' }] },
  },
  q_vesk_debt: {
    title: 'Eine Schuld', giver: 'trader_vesk', level: 10, requires: ['q_bandit_ledger'], requiresChoice: ['q_bandit_ledger', 'spare'],
    summary: 'Vesk will seine Schuld begleichen: Er weiß, wo die Banditen ihre Beute vergraben haben.',
    offer: 'Du hättest mich ausliefern können. Das vergesse ich nicht. Die Banditen haben ihre Beute an zwei Stellen vergraben, unter dem umgestürzten Turm und am Bach. Hol sie dir. Es ist das Mindeste.',
    progressText: 'Unter dem umgestürzten Turm und am Bach.',
    completeText: 'Siehst du? Ein Händler zahlt seine Schulden. Meistens.',
    objectives: [{ id: 'caches', text: 'Verstecke ausgegraben', count: 2, kind: 'interact', target: ['bandit_cache_tower', 'bandit_cache_brook'], zone: 'ashwood' }],
    rewards: { xp: Q(10, W.early), gold: 90, gear: [{ ilvl: 11, rarity: 'uncommon', slot: 'amulet' }] },
  },

  // ------------------------------------------------------------------ Schlackenhöhen (12–20)
  q_lava_sluices: {
    title: 'Die Lavaschleusen', giver: 'commander_hale', level: 14, requires: ['q_hound_pack'],
    summary: 'Öffne die drei Schleusen am Lavafluss in der richtigen Reihenfolge.',
    offer: 'Der Lavafluss steigt. Die Zwerge haben vor langer Zeit drei Schleusen gebaut, um ihn umzuleiten. Die Inschrift an der Feste sagt: unten beginnen, oben enden. Die untere Schleuse liegt am Damm, die mittlere an der Brücke, die obere am Wasserfall. Falsch herum, und die Lava sucht sich unseren Weg.',
    progressText: 'Unten am Damm, dann an der Brücke, zuletzt oben am Wasserfall.',
    completeText: 'Der Fluss biegt ab. Zum ersten Mal seit Wochen ist die Straße kühl genug zum Gehen.',
    objectives: [{ id: 'sluices', text: 'Schleusen geöffnet (Damm, Brücke, Wasserfall)', count: 3, kind: 'sequence', target: ['sluice_dam', 'sluice_bridge', 'sluice_falls'], zone: 'cinder_peaks', failText: 'Die Schleusen schlagen zu. Von unten nach oben: Damm, Brücke, Wasserfall.' }],
    rewards: { xp: Q(14, W.early), gold: 70, gear: [{ ilvl: 15, rarity: 'uncommon', slot: 'head' }] },
  },
  q_harpy_nests: {
    title: 'Nester an der Klippe', giver: 'quartermaster_dunn', level: 15, requires: ['q_imp_plague'],
    summary: 'Vertreibe die Klippenharpyien und zerstöre ihre Nester.',
    offer: 'Die Harpyien stehlen unsere Vorräte direkt von den Karren. Sie nisten an den Klippen über der Straße. Hol ein paar vom Himmel und zertritt ihre Nester, dann suchen sie sich einen anderen Berg.',
    progressText: 'Die Nester hängen an den Klippen über der Straße.',
    completeText: 'Kein Kreischen mehr über der Straße. Die Fuhrleute werden dir ein Lied schreiben. Ein schlechtes, aber immerhin.',
    objectives: [
      { id: 'harpies', text: 'Klippenharpyien erlegt', count: 6, kind: 'kill', target: 'cliff_harpy', zone: 'cinder_peaks' },
      { id: 'nests', text: 'Nester zerstört', count: 3, kind: 'interact', target: ['harpy_nest_1', 'harpy_nest_2', 'harpy_nest_3'], zone: 'cinder_peaks' },
    ],
    rewards: { xp: Q(15, W.early), gold: 80, gear: [{ ilvl: 16, rarity: 'uncommon', slot: 'hands' }] },
  },
  q_rift_ritual: {
    title: 'Das Ritual an der Spalte', giver: 'seer_ysolde', level: 17, requires: ['q_cultist_tomes'], needs: 'defend',
    summary: 'Schütze Ysoldes Ritual, während sie die Spalte endgültig verschließt.',
    offer: 'Die Siegel halten, aber nicht ewig. Ich kann die Spalte schließen, für immer. Dafür brauche ich Zeit, und die Kultisten werden spüren, was ich tue. Halte sie von mir fern, bis der Kreis geschlossen ist.',
    progressText: 'Sprich mich am Ritualkreis an, wenn du bereit bist.',
    completeText: 'Geschlossen. Spürst du, wie still der Berg ist? So klingt er, wenn er schläft.',
    objectives: [{ id: 'ritual', text: 'Ritualkreis verteidigt', count: 1, kind: 'defend', target: 'defend_rift_ritual', start: { kind: 'object', id: 'rift_circle' }, zone: 'cinder_peaks', failText: 'Das Ritual ist gebrochen. Ysolde beginnt von vorn, sobald du bereit bist.' }],
    rewards: { xp: Q(17, W.early), gold: 110, gear: [{ ilvl: 18, rarity: 'uncommon', slot: 'chest' }] },
  },

  // ------------------------------------------------------------------ Aschensteppe (20–25)
  q_steppe_scouting: {
    title: 'Weites Land', giver: 'captain_varra', level: 20, requires: ['q_new_horizons'],
    summary: 'Erkunde die vier Landmarken der Steppe für Varras Karte.',
    offer: 'Meine Karte der Steppe ist dreißig Jahre alt und zur Hälfte falsch. Reite die vier Landmarken ab: den Knochenbogen, den Salzsee, den Rabenfels und die zerbrochene Brücke. Sag mir, was noch steht.',
    progressText: 'Knochenbogen, Salzsee, Rabenfels, zerbrochene Brücke.',
    completeText: 'Der Salzsee ist halb verschwunden? Gut zu wissen, bevor wir dort Pferde tränken wollen.',
    objectives: [{ id: 'marks', text: 'Landmarken erkundet', count: 4, kind: 'reach', target: ['steppe_bone_arch', 'steppe_salt_lake', 'steppe_raven_rock', 'steppe_broken_bridge'], zone: 'ashen_steppe' }],
    rewards: { xp: Q(20, W.side), gold: 150, gear: [{ ilvl: 21, rarity: 'uncommon', slot: 'feet' }] },
  },
  q_ancestor_stones: {
    title: 'Wasser für die Ahnen', giver: 'nomad_kesh', level: 22, requires: ['q_steppe_hyenas'],
    summary: 'Benetze die drei Ahnensteine mit Geisterwasser, damit die Staubschamanen ihre Macht verlieren.',
    offer: 'Die Staubschamanen sprechen mit unseren Ahnen, und die Ahnen antworten ihnen, weil niemand sonst mit ihnen redet. Nimm dieses Geisterwasser und gieß es über die drei Ahnensteine. Dann hören die Ahnen wieder auf uns.',
    progressText: 'Die Ahnensteine stehen dort, wo die Schamanen tanzen.',
    completeText: 'Ich habe sie gehört, letzte Nacht. Meine Großmutter hat geschimpft wie früher. Danke.',
    startItems: [{ itemId: 'spirit_water', qty: 3 }],
    objectives: [
      { id: 'stones', text: 'Ahnensteine benetzt', count: 3, kind: 'use', item: 'spirit_water', target: ['ancestor_stone_1', 'ancestor_stone_2', 'ancestor_stone_3'], zone: 'ashen_steppe' },
      { id: 'shamans', text: 'Staubschamanen vertrieben', count: 4, kind: 'kill', target: 'dust_shaman', zone: 'ashen_steppe' },
    ],
    rewards: { xp: Q(22, W.side), gold: 190, gear: [{ ilvl: 23, rarity: 'uncommon', slot: 'amulet' }] },
  },
  q_imra_caravan: {
    title: 'Gewürze für den Außenposten', giver: 'trader_imra', level: 24, requires: ['q_imra_cargo'], needs: 'escort',
    summary: 'Begleite Imras Karawane durch das Gebiet der Gnollfallensteller.',
    offer: 'Die Gnolle legen Fallen auf der Handelsstraße, und meine Treiber laufen davon, sobald einer bellt. Begleite die Karawane bis zum Außenposten. Und tritt in keine Falle, ich bezahle keine Beine.',
    progressText: 'Die Karawane wartet am Lager. Achte auf die Fallen der Gnolle.',
    completeText: 'Alle Kamele, alle Ballen, alle Treiber. Ich glaube, das ist das erste Mal.',
    objectives: [{ id: 'caravan', text: 'Karawane zum Außenposten gebracht', count: 1, kind: 'escort', target: 'escort_imra_caravan', start: { kind: 'object', id: 'imra_caravan' }, zone: 'ashen_steppe', failText: 'Die Karawane ist zerstreut. Die Treiber sammeln sich wieder am Lager.' }],
    rewards: { xp: Q(24, W.event), gold: 260, gear: [{ ilvl: 25, rarity: 'uncommon', slot: 'weapon' }] },
  },

  // ------------------------------------------------------------------ Faulmarsch und Sporenschlund (25–31)
  q_marsh_lanterns: {
    title: 'Irrlichter', giver: 'warden_thane', level: 27, requires: ['q_marsh_totems'],
    summary: 'Entzünde die vier Sumpflaternen in der Folge des alten Fährmannsliedes.',
    offer: 'Die Fährleute haben ein Lied: Rot am Steg, Grün am Baum, Blau am Stein und Weiß am Grab. So zündeten sie die Laternen, damit die Irrlichter dem Weg folgen statt den Lebenden. Seit die Fährleute weg sind, folgen sie uns.',
    progressText: 'Rot am Steg, Grün am Baum, Blau am Stein, Weiß am Grab.',
    completeText: 'Die Irrlichter tanzen über dem Weg, nicht über unseren Köpfen. Ich hätte nie gedacht, dass mich ein Kinderlied rettet.',
    objectives: [{ id: 'lanterns', text: 'Laternen nach dem Fährmannslied entzündet', count: 4, kind: 'sequence', target: ['lantern_red', 'lantern_green', 'lantern_blue', 'lantern_white'], zone: 'blighted_marsh', failText: 'Die Laternen verlöschen. Rot am Steg, Grün am Baum, Blau am Stein, Weiß am Grab.' }],
    rewards: { xp: Q(27, W.side), gold: 230, gear: [{ ilvl: 28, rarity: 'uncommon', slot: 'head' }] },
  },
  q_hag_cauldron: {
    title: 'Der Kessel der Moorhexe', giver: 'trader_moll', level: 28, requires: ['q_moll_crates'],
    summary: 'Finde den Kessel der Moorhexe und entscheide, was aus ihrem Rezept wird.',
    offer: 'Die Moorhexen kochen Schleim zu etwas, das Leute wie Wasser trinken und dann wie Schleim aussehen. Ihr Kessel steht irgendwo im Schilf. Erledige ein paar Hexen und find den Kessel. Ob du das Rezept zerstörst oder mir bringst, ist deine Sache. Aber ich zahle besser.',
    progressText: 'Die Moorhexen hüten den Kessel tief im Schilf.',
    completeText: 'Das ist es? Das Rezept? Hm. Willst du es mir verkaufen, oder willst du es lieber verbrennen?',
    objectives: [
      { id: 'hags', text: 'Moorhexen erledigt', count: 3, kind: 'kill', target: 'marsh_hag', zone: 'blighted_marsh' },
      { id: 'cauldron', text: 'Hexenkessel gefunden', count: 1, kind: 'interact', target: ['hag_cauldron'], zone: 'blighted_marsh' },
    ],
    rewards: { xp: Q(28, W.side), gold: 120 },
    choices: [
      { id: 'sell', label: 'Moll das Rezept verkaufen', hint: 'Mehr Gold. Moll schuldet dir etwas.', rewards: { gold: 260 } },
      { id: 'burn', label: 'Das Rezept verbrennen', hint: 'Weniger Gold, aber Thane erfährt davon.', rewards: { gold: 60, items: [{ itemId: 'ember_elixir', qty: 2 }] } },
    ],
  },
  q_thane_gratitude: {
    title: 'Ein Wort von Thane', giver: 'warden_thane', level: 29, requires: ['q_hag_cauldron'], requiresChoice: ['q_hag_cauldron', 'burn'],
    summary: 'Thane hat vom verbrannten Rezept gehört und hat einen Auftrag für jemanden, dem er traut.',
    offer: 'Man sagt, du hättest Molls Gold ausgeschlagen. Das tut hier draußen keiner. Ich brauche jemanden, dem ich traue: Im Sporenschlund wächst etwas, und meine Leute kommen nicht zurück. Sieh dir die drei Lichtungen an und komm lebend wieder.',
    progressText: 'Die drei Lichtungen am Rand des Sporenschlunds.',
    completeText: 'Du bist zurück. Das ist mehr, als ich von den anderen sagen kann. Nimm das, es gehörte dem Hauptmann vor mir.',
    objectives: [{ id: 'glades', text: 'Lichtungen erkundet', count: 3, kind: 'reach', target: ['spore_glade_1', 'spore_glade_2', 'spore_glade_3'], zone: 'blighted_marsh' }],
    rewards: { xp: Q(29, W.side), gold: 200, gear: [{ ilvl: 30, rarity: 'rare', slot: 'ring' }] },
  },
  q_moll_favor: {
    title: 'Molls Gefallen', giver: 'trader_moll', level: 29, requires: ['q_hag_cauldron'], requiresChoice: ['q_hag_cauldron', 'sell'],
    summary: 'Moll löst seine Schuld ein: Er kennt das Versteck einer Schmugglerbande.',
    offer: 'Ich zahle meine Schulden. Die Schmuggler, die mir die Kisten geklaut haben, haben ein Lager auf drei Stelzenhütten. Was dort liegt, gehört dir. Ich will nur, dass sie es nicht mehr haben.',
    progressText: 'Drei Stelzenhütten im Nordmoor.',
    completeText: 'Leer? Gut. Dann wissen sie jetzt, wie es sich anfühlt.',
    objectives: [{ id: 'huts', text: 'Schmugglerhütten durchsucht', count: 3, kind: 'interact', target: ['smuggler_hut_1', 'smuggler_hut_2', 'smuggler_hut_3'], zone: 'blighted_marsh' }],
    rewards: { xp: Q(29, W.side), gold: 320, gear: [{ ilvl: 30, rarity: 'uncommon', slot: 'weapon' }] },
  },

  // ------------------------------------------------------------------ Frostzinnen (31–36)
  q_lodge_siege: {
    title: 'Die Jagdhütte', giver: 'hunter_sigrun', level: 33, requires: ['q_snow_stalkers'], needs: 'defend',
    summary: 'Halte Sigruns Jagdhütte gegen die Frostwiedergänger, bis der Morgen kommt.',
    offer: 'Jede Nacht kommen sie näher. Frostwiedergänger, die Toten der letzten Winter. Heute Nacht greifen sie die Hütte an, ich spüre es in den Zähnen. Bleib bei mir. Wenn die Hütte bis zum Morgen steht, haben wir gewonnen.',
    progressText: 'Sprich mich an der Hütte an, wenn du bereit bist.',
    completeText: 'Morgen. Wirklich Morgen. Ich hatte vergessen, wie die Sonne über den Zinnen aussieht.',
    objectives: [{ id: 'lodge', text: 'Jagdhütte bis zum Morgen gehalten', count: 1, kind: 'defend', target: 'defend_sigrun_lodge', start: { kind: 'npc', id: 'hunter_sigrun' }, zone: 'frostspire', failText: 'Die Hütte ist gefallen. Sigrun baut die Tür wieder auf.' }],
    rewards: { xp: Q(33, W.event), gold: 300, gear: [{ ilvl: 34, rarity: 'uncommon', slot: 'chest' }] },
  },
  q_burrower_tunnels: {
    title: 'Unter dem Schnee', giver: 'trader_fenn', level: 34, requires: ['q_witch_charms'],
    summary: 'Stopf die Tunnel der Schneewühler mit Sprengpulver zu.',
    offer: 'Die Schneewühler graben unter dem Lager durch. Letzte Woche ist ein ganzes Zelt im Boden verschwunden, samt Bewohner. Hier, Sprengpulver. Ein Fass in jeden der drei Tunnel, und dann lauf.',
    progressText: 'Drei Tunneleingänge rund um das Lager.',
    completeText: 'Drei Mal Bumm. Ich habe es bis hierher gehört. Die Zelte stehen noch. Fast alle.',
    startItems: [{ itemId: 'blast_powder', qty: 3 }],
    objectives: [
      { id: 'tunnels', text: 'Tunnel gesprengt', count: 3, kind: 'use', item: 'blast_powder', target: ['burrow_tunnel_1', 'burrow_tunnel_2', 'burrow_tunnel_3'], zone: 'frostspire' },
      { id: 'burrowers', text: 'Schneewühler erlegt', count: 5, kind: 'kill', target: 'snow_burrower', zone: 'frostspire' },
    ],
    rewards: { xp: Q(34, W.side), gold: 280, gear: [{ ilvl: 35, rarity: 'uncommon', slot: 'feet' }] },
  },

  // ------------------------------------------------------------------ Glutöde (36–40)
  q_pilgrim_road: {
    title: 'Der letzte Pilgerzug', giver: 'pilgrim_aldo', level: 37, requires: ['q_magma_serpents'], needs: 'escort',
    summary: 'Begleite die Pilger zum Schrein am Thronweg.',
    offer: 'Seit hundert Jahren geht jedes Jahr ein Pilgerzug zum Schrein am Thronweg. Letztes Jahr kam keiner zurück. Dieses Jahr sind es nur noch sechs. Ich gehe mit ihnen. Komm mit uns, und wir kommen vielleicht an.',
    progressText: 'Die Pilger warten am Lager. Die Bombardiere des Aschenfürsten lauern am Weg.',
    completeText: 'Wir sind da. Alle sechs. Der Schrein ist kalt, aber wir haben ihn gefunden. Danke.',
    objectives: [{ id: 'pilgrims', text: 'Pilger zum Schrein gebracht', count: 1, kind: 'escort', target: 'escort_pilgrims', start: { kind: 'npc', id: 'pilgrim_aldo' }, zone: 'ember_wastes', failText: 'Der Pilgerzug ist zerstreut. Aldo sammelt die Pilger wieder am Lager.' }],
    rewards: { xp: Q(37, W.event), gold: 380, gear: [{ ilvl: 38, rarity: 'uncommon', slot: 'amulet' }] },
  },
  q_phase_wraiths: {
    title: 'Die Zwischenwelt', giver: 'quartermaster_ryn', level: 38, requires: ['q_serpent_pits'],
    summary: 'Zerstöre die Ankersteine, mit denen die Phasengeister in die Öde kommen.',
    offer: 'Die Phasengeister kommen durch Steine, die glühen wie Kohle. Drei davon haben wir gefunden. Zerschlag sie, und schick die Geister dorthin zurück, wo sie herkommen. Vorsicht: Sie verschwinden, wenn du zuschlägst, und tauchen hinter dir wieder auf.',
    progressText: 'Drei glühende Ankersteine in der Öde.',
    completeText: 'Die Wachen schlafen wieder. Zumindest die, die nicht Wache halten.',
    objectives: [
      { id: 'wraiths', text: 'Phasengeister vertrieben', count: 6, kind: 'kill', target: 'phase_wraith', zone: 'ember_wastes' },
      { id: 'anchors', text: 'Ankersteine zerschlagen', count: 3, kind: 'interact', target: ['phase_anchor_1', 'phase_anchor_2', 'phase_anchor_3'], zone: 'ember_wastes' },
    ],
    rewards: { xp: Q(38, W.side), gold: 360, gear: [{ ilvl: 39, rarity: 'uncommon', slot: 'hands' }] },
  },
  q_crown_fate: {
    title: 'Das Schicksal der Krone', giver: 'pilgrim_aldo', level: 40, requires: ['q_ash_sovereign'],
    summary: 'Entscheide, was mit der Flammenkrone geschieht.',
    offer: 'Du trägst sie bei dir. Ich spüre sie bis hierher, wie eine Glut, die nicht ausgehen will. Bring sie zum Schrein am Thronweg. Dort entscheidest du: Wir können sie zerschlagen, oder du nimmst ihre Macht an. Beides hat einen Preis.',
    progressText: 'Der Schrein steht am Thronweg.',
    completeText: 'Hier ist der Schrein. Die Krone flüstert. Hörst du sie? Entscheide.',
    objectives: [{ id: 'shrine', text: 'Krone zum Schrein am Thronweg gebracht', count: 1, kind: 'interact', target: ['crown_shrine'], zone: 'ember_wastes' }],
    rewards: { xp: Q(40, W.choice), gold: 200 },
    choices: [
      { id: 'shatter', label: 'Die Krone zerschlagen', hint: 'Der Fluch endet. Die Pilger ehren dich mit ihrem Schatz.', rewards: { gold: 1500, items: [{ itemId: 'ember_elixir', qty: 3 }] } },
      { id: 'claim', label: 'Ihre Macht annehmen', hint: 'Die Glut der Krone geht auf dich über. Die Pilger wenden sich ab.', rewards: { gold: 400, items: [{ itemId: 'ember_core', qty: 5 }, { itemId: 'magma_scale', qty: 5 }] } },
    ],
  },
};

// Gesprächszeilen nach Entscheidungen (npcIdleLine: es gilt die letzte Zeile, deren Quest abgeschlossen ist)
export const NPC_LINES_VARIETY = {
  trader_vesk: [['q_vesk_penance', 'Ich verkaufe jetzt nur noch an eine Seite. Die richtige, hoffe ich.'], ['q_vesk_debt', 'Du hast etwas gut bei mir. Erzähl es nur nicht Ilsa.']],
};
