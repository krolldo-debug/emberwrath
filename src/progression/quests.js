// Quests, NPC-Texte und Händler (Thread C). Registriert als content 'quest' / 'vendor' / 'npcLine'.
//
// Quest: { title, giver, turnInNpc?, main?, repeatable?, level, minLevel?, requires?: [questId],
//          summary, offer, progressText, completeText, objectives, rewards }
// NPC_LINES[npcId].lines: [[questId | null, Text], …] – es gilt die letzte Zeile, deren Quest abgeschlossen ist (npcIdleLine).
//  objective: { id, text, count, kind, target, zone, from? }
//    kind  kill     – enemy:killed.type ∈ target (String oder Liste)
//          reach    – area:reached.areaId bzw. zone:enter als 'zone:<id>'
//          boss     – Boss target besiegt (auch rückwirkend über world.bossesDefeated)
//          collect  – Anzahl des Items target im Inventar; wird bei Abgabe eingezogen. from = Gegnertypen (Questpfad)
//          interact – object:interact.objectId ∈ target (jedes Objekt zählt einmal)
//          talk     – npc:interact.npcId === target
//    zone  Zone, in der das Ziel erfüllt wird (für den Questpfad, INTEGRATION.md §11.6)
//  rewards: { xp, gold, items: [{ itemId, qty }], gear: [{ ilvl, rarity, slot? }], reachLevel? }
//    reachLevel hebt bei der Abgabe mindestens auf diese Stufe (Ende der Geschichte → 20)
//    gear wird bei der Abgabe passend zur Klasse bestimmt (loot.js pickRewardGear) und im Dialog angezeigt.
// Zustände: gesperrt → verfügbar → aktiv ('active') → abgabebereit ('ready') → abgeschlossen.
import { questXp } from './xp.js';
import { QUESTS_40, NPC_LINES_40, VENDORS_40 } from './quests40.js';

const Q = (level, weight) => questXp(level, weight);

export const QUESTS = {
  // ================================================================ Glutsenke & Katakomben (1–6)
  q_ashen_wolves: {
    title: 'Asche und Zähne', giver: 'elder_maren', main: true, level: 1,
    summary: 'Vertreibe die Aschewölfe, die die Glutsenke heimsuchen.',
    offer: 'Seit der Ascheregen fällt, kommen die Wölfe bis an die Hütten. Erlege sechs von ihnen, dann trauen sich die anderen nicht mehr her.',
    progressText: 'Die Wölfe heulen noch immer. Sechs müssen fallen.',
    completeText: 'Die Nacht ist ruhig wie lange nicht. Nimm das hier, es hat meinem Sohn gehört.',
    objectives: [{ id: 'wolves', text: 'Aschewölfe erlegt', count: 6, kind: 'kill', target: 'wolf', zone: 'emberhollow' }],
    rewards: { xp: Q(1, 1.1), gold: 12, items: [{ itemId: 'leather_jerkin', qty: 1 }, { itemId: 'minor_potion', qty: 3 }] },
  },
  q_glutfang: {
    title: 'Glutfang', giver: 'smith_brom', level: 3, requires: ['q_ashen_wolves'],
    summary: 'Erlege Glutfang, den Rudelführer der Aschewölfe.',
    offer: 'Die Wölfe hören auf einen. Glutfang nennen sie ihn, ein Biest mit Augen wie Kohlen. Bring ihn zur Strecke und ich schmiede dir etwas Anständiges.',
    progressText: 'Glutfang streift am Rand der Senke umher. Pass auf seine Bisse auf.',
    completeText: 'Das Fell ist noch warm. Hier, frisch von der Esse – passend für deine Hand.',
    objectives: [{ id: 'alpha', text: 'Glutfang erlegt', count: 1, kind: 'kill', target: 'wolf_alpha', zone: 'emberhollow' }],
    rewards: { xp: Q(3, 0.5), gold: 20, gear: [{ ilvl: 3, rarity: 'uncommon', slot: 'weapon' }] },
  },
  q_into_catacombs: {
    title: 'Unter der Glutsenke', giver: 'elder_maren', main: true, level: 3, requires: ['q_ashen_wolves'],
    summary: 'Steige in die Katakomben hinab und zerschlage die erwachten Skelette.',
    offer: 'Die Toten unter dem Dorf sind erwacht. Der alte Eingang liegt am Rand der Senke. Geh hinab und bring sie zur Ruhe – acht Skelettkrieger, dann können wir wieder schlafen.',
    progressText: 'Ich höre sie nachts an den Grabsteinen kratzen. Bitte beeil dich.',
    completeText: 'Du bist zurück, und die Erde ist still. Aber da unten ist noch etwas Größeres …',
    objectives: [
      { id: 'gate', text: 'Katakomben betreten', count: 1, kind: 'reach', target: ['catacombs_gate', 'zone:catacombs'], zone: 'emberhollow' },
      { id: 'skeletons', text: 'Skelettkrieger zerschlagen', count: 8, kind: 'kill', target: 'skeleton', zone: 'catacombs' },
    ],
    rewards: { xp: Q(3, 0.7), gold: 25, items: [{ itemId: 'minor_potion', qty: 3 }], gear: [{ ilvl: 4, rarity: 'uncommon', slot: 'head' }] },
  },
  q_spider_silk: {
    title: 'Seide für die Esse', giver: 'smith_brom', level: 3, requires: ['q_ashen_wolves'],
    summary: 'Sammle Spinnenseide für Brom, den Schmied.',
    offer: 'Die Höhlenspinnen in den Katakomben spinnen Seide, die selbst Glut aushält. Bring mir drei Bündel, und ich schmiede dir etwas, das dich am Leben hält.',
    progressText: 'Drei Bündel. Die Spinnen hocken in den Katakomben.',
    completeText: 'Hervorragend! Zäh wie Draht. Hier, frisch aus der Esse.',
    objectives: [{ id: 'silk', text: 'Spinnenseide gesammelt', count: 3, kind: 'collect', target: 'spider_silk', from: ['spider'], zone: 'catacombs' }],
    rewards: { xp: Q(3, 0.45), gold: 20, items: [{ itemId: 'brom_ring', qty: 1 }] },
  },
  q_bonelord: {
    title: 'Der Knochenfürst', giver: 'elder_maren', main: true, level: 5, requires: ['q_into_catacombs'],
    summary: 'Besiege Varkhul, den Knochenfürsten, in der Tiefe der Katakomben.',
    offer: 'Varkhul. So hieß der Fürst, der hier vor dreihundert Jahren begraben wurde. Er ruft die Toten. Solange er steht, finden sie keine Ruhe. Bring mir sein Siegel.',
    progressText: 'Varkhul wartet in der großen Halle. Geh nicht unvorbereitet.',
    completeText: 'Sein Siegel … Sieh her: unter dem Knochenwappen glüht ein zweites Zeichen, eine Krone aus Flammen. Varkhul hat nicht aus eigenem Willen gerufen. Die Glutsenke steht in deiner Schuld.',
    objectives: [
      { id: 'boss', text: 'Varkhul besiegt', count: 1, kind: 'boss', target: 'bonelord', zone: 'catacombs' },
      { id: 'sigil', text: 'Varkhuls Siegel', count: 1, kind: 'collect', target: 'varkhul_sigil', from: ['bonelord'], zone: 'catacombs' },
    ],
    rewards: { xp: Q(5, 0.9), gold: 60, gear: [{ ilvl: 6, rarity: 'rare', slot: 'chest' }] },
  },
  q_road_east: {
    title: 'Der Weg nach Osten', giver: 'elder_maren', turnInNpc: 'warden_ilsa', main: true, level: 6, requires: ['q_bonelord'],
    summary: 'Reise in den Aschenwald und melde dich bei Wächterin Ilsa.',
    offer: 'Varkhul war nur ein Diener. Im Osten, hinter dem Aschenwald, glüht der Berg heller als je zuvor. Wächterin Ilsa hält dort das Lager. Geh zu ihr – sie wird dich brauchen.',
    progressText: 'Folge dem Pfad nach Osten in den Aschenwald.',
    completeText: 'Maren schickt dich? Dann bist du der, der Varkhul erschlagen hat. Gut. Wir brauchen jede Klinge.',
    objectives: [{ id: 'travel', text: 'Aschenwald erreicht', count: 1, kind: 'reach', target: ['zone:ashwood', 'ashwood_camp'], zone: 'emberhollow' }],
    rewards: { xp: Q(6, 0.3), gold: 15, items: [{ itemId: 'healing_potion', qty: 3 }] },
  },

  // ================================================================ Aschenwald & Versunkener Tempel (6–12)
  q_boar_cull: {
    title: 'Borstige Plage', giver: 'warden_ilsa', main: true, level: 6, requires: ['q_road_east'],
    summary: 'Dünne die wilden Aschenkeiler rund um das Lager aus.',
    offer: 'Die Keiler rennen unsere Zelte um, seit der Wald brennt. Acht von ihnen, und wir haben wieder Ruhe – und Braten für eine Woche.',
    progressText: 'Die Keiler wühlen im Unterholz. Weich ihrem Sturmangriff aus.',
    completeText: 'Das riecht nach Festmahl. Du hast dir deinen Anteil verdient.',
    objectives: [{ id: 'boars', text: 'Aschenkeiler erlegt', count: 8, kind: 'kill', target: 'ash_boar', zone: 'ashwood' }],
    rewards: { xp: Q(6, 0.6), gold: 30, gear: [{ ilvl: 7, rarity: 'uncommon', slot: 'feet' }] },
  },
  q_bandit_camp: {
    title: 'Rauch über den Bäumen', giver: 'warden_ilsa', main: true, level: 7, requires: ['q_boar_cull'],
    summary: 'Finde das Banditenlager und zerschlage die Bande.',
    offer: 'Banditen plündern die Flüchtlinge aus der Senke. Ihr Lager liegt tiefer im Wald – folge dem Rauch. Zehn weniger, und sie überlegen es sich zweimal.',
    progressText: 'Das Lager liegt dort, wo der Rauch am dichtesten ist.',
    completeText: 'Die Flüchtlinge können wieder atmen. Aber ihr Anführer lebt noch.',
    objectives: [
      { id: 'camp', text: 'Banditenlager gefunden', count: 1, kind: 'reach', target: 'bandit_camp', zone: 'ashwood' },
      { id: 'bandits', text: 'Banditen besiegt', count: 10, kind: 'kill', target: ['bandit', 'bandit_archer'], zone: 'ashwood' },
    ],
    rewards: { xp: Q(7, 0.7), gold: 40, items: [{ itemId: 'healing_potion', qty: 2 }], gear: [{ ilvl: 8, rarity: 'uncommon', slot: 'hands' }] },
  },
  q_bandit_chief: {
    title: 'Rask, der Brandschatzer', giver: 'warden_ilsa', main: true, level: 9, requires: ['q_bandit_camp'],
    summary: 'Stelle den Anführer der Banditen.',
    offer: 'Rask hat drei Dörfer niedergebrannt, bevor der Berg es tat. Er versteckt sich in seinem Lager. Beende das.',
    progressText: 'Rask ist gefährlich. Achte auf seine Feuerbomben.',
    completeText: 'Rask ist tot? Dann schulde ich dir mehr als Gold. In seinem Zelt lag ein Brief mit einer Flammenkrone als Siegel: Er hat die Dörfer für jemanden am Berg geräumt. Nimm das – es war seine beste Beute.',
    objectives: [{ id: 'chief', text: 'Rask besiegt', count: 1, kind: 'kill', target: 'bandit_chief', zone: 'ashwood' }],
    rewards: { xp: Q(9, 0.7), gold: 60, gear: [{ ilvl: 9, rarity: 'rare', slot: 'weapon' }] },
  },
  q_temple_shore: {
    title: 'Die Totems am Ufer', giver: 'warden_ilsa', main: true, level: 9, requires: ['q_bandit_chief'],
    summary: 'Entzünde die drei Schutztotems am Ufer des Versunkenen Tempels.',
    offer: 'Aus dem See steigen Ertrunkene. Die alten Totems am Ufer hielten sie einst zurück. Entzünde alle drei, dann können wir den Tempel betreten.',
    progressText: 'Die Totems stehen am Ufer vor dem Tempel. Berühre jedes einzelne.',
    completeText: 'Das Wasser ist still. Jetzt ist der Weg zum Tempel frei.',
    objectives: [
      { id: 'shore', text: 'Ufer des Tempels erreicht', count: 1, kind: 'reach', target: 'temple_shore', zone: 'ashwood' },
      { id: 'totems', text: 'Schutztotems entzündet', count: 3, kind: 'interact', target: ['ward_totem_1', 'ward_totem_2', 'ward_totem_3'], zone: 'ashwood' },
    ],
    rewards: { xp: Q(9, 0.6), gold: 45, gear: [{ ilvl: 10, rarity: 'uncommon', slot: 'amulet' }] },
  },
  q_nerith: {
    title: 'Die Ertrunkene Priesterin', giver: 'warden_ilsa', main: true, level: 11, requires: ['q_temple_shore'],
    summary: 'Besiege Nerith im Allerheiligsten des Versunkenen Tempels.',
    offer: 'Nerith war einst Hohepriesterin. Die Flut hat sie nicht getötet – sie hat sie verwandelt. Geh in den Tempel und bring mir ihre Perle.',
    progressText: 'Nerith erwartet dich im Allerheiligsten. Sie wird zweimal aufstehen.',
    completeText: 'Die Gezeitenperle … Sie ist warm, obwohl sie aus dem See kommt. Nerith hat die Flut gerufen, um etwas vor dem Berg zu verbergen, und sie hat verloren. Jetzt hat sie Frieden. Und du hast dir einen Namen gemacht.',
    objectives: [
      { id: 'boss', text: 'Nerith besiegt', count: 1, kind: 'boss', target: 'drowned_priestess', zone: 'sunken_temple' },
      { id: 'pearl', text: 'Gezeitenperle', count: 1, kind: 'collect', target: 'tide_pearl', from: ['drowned_priestess'], zone: 'sunken_temple' },
    ],
    rewards: { xp: Q(11, 1.0), gold: 110, gear: [{ ilvl: 12, rarity: 'rare', slot: 'chest' }] },
  },
  q_to_the_peaks: {
    title: 'Zu den Schlackenhöhen', giver: 'warden_ilsa', turnInNpc: 'commander_hale', main: true, level: 12, requires: ['q_nerith'],
    summary: 'Steige zu den Schlackenhöhen auf und melde dich bei Kommandant Hale.',
    offer: 'Der Berg ist die Quelle von allem. Kommandant Hale hält die Feste Rauhwacht am Aufstieg. Er hat nach jemandem wie dir gefragt.',
    progressText: 'Folge der Straße bergauf zu den Schlackenhöhen.',
    completeText: 'Ilsa hat nicht übertrieben. Willkommen in Rauhwacht – hier oben brennt die Luft.',
    objectives: [{ id: 'travel', text: 'Schlackenhöhen erreicht', count: 1, kind: 'reach', target: ['zone:cinder_peaks', 'rookwatch'], zone: 'ashwood' }],
    rewards: { xp: Q(12, 0.3), gold: 30, items: [{ itemId: 'greater_potion', qty: 3 }] },
  },

  // --- Oona (Nebenquests)
  q_thorn_sap: {
    title: 'Bitterer Saft', giver: 'herbalist_oona', level: 7, requires: ['q_road_east'],
    summary: 'Sammle Dornensaft von den Dornenkriechern für Oonas Gegengift.',
    offer: 'Die Dornenkriecher vergiften jeden, der zu nah kommt. Aus ihrem eigenen Saft kann ich ein Gegengift brauen. Sechs Phiolen, bitte.',
    progressText: 'Die Kriecher lauern im Dickicht. Ihr Saft ist grün und stinkt.',
    completeText: 'Wunderbar ekelhaft! Hier, das Gegengift wirkt auch als Heiltrank.',
    objectives: [{ id: 'sap', text: 'Dornensaft gesammelt', count: 6, kind: 'collect', target: 'thorn_sap', from: ['thorn_crawler'], zone: 'ashwood' }],
    rewards: { xp: Q(7, 0.45), gold: 30, items: [{ itemId: 'healing_potion', qty: 4 }, { itemId: 'mana_potion', qty: 2 }] },
  },
  q_lost_satchel: {
    title: 'Die verlorene Tasche', giver: 'herbalist_oona', level: 8, requires: ['q_road_east'],
    summary: 'Finde Oonas Kräutertasche, die sie auf der Flucht verloren hat.',
    offer: 'Als die Banditen kamen, habe ich meine Kräutertasche fallen lassen. Irgendwo im Wald, nahe dem alten Pfad. Ohne sie kann ich kaum etwas brauen.',
    progressText: 'Die Tasche liegt irgendwo am alten Pfad.',
    completeText: 'Meine Tasche! Alles noch da. Nimm dafür diesen Talisman – er hat mir Glück gebracht.',
    objectives: [{ id: 'satchel', text: 'Kräutertasche gefunden', count: 1, kind: 'interact', target: ['lost_satchel'], zone: 'ashwood' }],
    rewards: { xp: Q(8, 0.35), gold: 25, gear: [{ ilvl: 8, rarity: 'uncommon', slot: 'ring' }] },
  },
  q_drowned_relics: {
    title: 'Relikte aus der Tiefe', giver: 'herbalist_oona', level: 10, requires: ['q_temple_shore'],
    summary: 'Birg fünf Tempelrelikte aus dem Versunkenen Tempel.',
    offer: 'Die Götzenbilder des Tempels enthalten Salz, das Wunden schließt. Bring mir fünf, bevor sie ganz vom Wasser zerfressen sind.',
    progressText: 'Die Wesen im Tempel tragen die Relikte bei sich.',
    completeText: 'So viel Salz! Das reicht für hundert Verbände. Danke dir.',
    objectives: [{ id: 'relics', text: 'Tempelrelikte geborgen', count: 5, kind: 'collect', target: 'temple_relic', from: ['drowned', 'tide_cultist', 'temple_guardian'], zone: 'sunken_temple' }],
    rewards: { xp: Q(10, 0.45), gold: 50, items: [{ itemId: 'ember_elixir', qty: 1 }], gear: [{ ilvl: 11, rarity: 'uncommon', slot: 'head' }] },
  },

  // ================================================================ Schlackenhöhen & Glutschmiede (12–20)
  q_imp_plague: {
    title: 'Funkenplage', giver: 'commander_hale', main: true, level: 12, requires: ['q_to_the_peaks'],
    summary: 'Vernichte die Feuerkobolde, die Rauhwacht belagern.',
    offer: 'Feuerkobolde. Klein, flink, und sie zünden alles an, was nicht aus Stein ist. Zwölf davon, und meine Leute können wieder schlafen.',
    progressText: 'Die Kobolde schwärmen. Lass dich nicht umzingeln.',
    completeText: 'Gute Arbeit. Das Lager qualmt nur noch halb so viel.',
    objectives: [{ id: 'imps', text: 'Feuerkobolde vernichtet', count: 12, kind: 'kill', target: 'fire_imp', zone: 'cinder_peaks' }],
    rewards: { xp: Q(12, 0.6), gold: 70, gear: [{ ilvl: 13, rarity: 'uncommon', slot: 'feet' }] },
  },
  q_hound_pack: {
    title: 'Glutspuren', giver: 'commander_hale', main: true, level: 13, requires: ['q_imp_plague'],
    summary: 'Jage das Rudel der Magmahunde.',
    offer: 'Die Magmahunde folgen jedem Späher, den ich losschicke. Acht Bestien, dann sind unsere Wege wieder sicher.',
    progressText: 'Folge den glühenden Pfotenabdrücken.',
    completeText: 'Die Späher kommen zurück. Lebend. Das ist dein Verdienst.',
    objectives: [{ id: 'hounds', text: 'Magmahunde erlegt', count: 8, kind: 'kill', target: 'magma_hound', zone: 'cinder_peaks' }],
    rewards: { xp: Q(13, 0.6), gold: 80, gear: [{ ilvl: 14, rarity: 'uncommon', slot: 'hands' }] },
  },
  q_behemoth: {
    title: 'Der Schlackenkoloss', giver: 'commander_hale', main: true, level: 15, requires: ['q_hound_pack'],
    summary: 'Fälle den Schlackenkoloss, der die Obsidianspalte bewacht.',
    offer: 'In der Obsidianspalte haust ein Koloss aus Schlacke und Zorn. Er zerquetscht jeden Trupp, den ich schicke. Du bist kein Trupp. Du bist unsere letzte Hoffnung.',
    progressText: 'Der Koloss ist langsam, aber jeder Schlag lässt die Erde beben.',
    completeText: 'Du hast ihn gefällt? Beim Berg … Nimm das. Du hast es dir mehr als verdient.',
    objectives: [{ id: 'behemoth', text: 'Schlackenkoloss gefällt', count: 1, kind: 'kill', target: 'magma_behemoth', zone: 'cinder_peaks' }],
    rewards: { xp: Q(15, 0.7), gold: 110, gear: [{ ilvl: 15, rarity: 'rare', slot: 'weapon' }] },
  },
  q_forge_gate: {
    title: 'Das Tor der Glutschmiede', giver: 'commander_hale', main: true, level: 16, requires: ['q_behemoth'],
    summary: 'Finde das Tor zur Glutschmiede auf dem Gipfel.',
    offer: 'Hinter der Spalte liegt das Tor zur Glutschmiede. Dort sitzt Ignaroth, der Glut-Tyrann. Finde das Tor – und sag mir, was du siehst.',
    progressText: 'Das Tor liegt am Ende der Straße, oberhalb der Spalte.',
    completeText: 'Ein Tor aus flüssigem Eisen … Dann ist es wahr. Ignaroth ist erwacht.',
    objectives: [{ id: 'gate', text: 'Tor der Glutschmiede gefunden', count: 1, kind: 'reach', target: ['forge_gate', 'zone:molten_forge'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(16, 0.4), gold: 60, items: [{ itemId: 'greater_potion', qty: 3 }], gear: [{ ilvl: 16, rarity: 'uncommon', slot: 'amulet' }] },
  },
  q_forge_warden: {
    title: 'Der Wächter der Esse', giver: 'commander_hale', main: true, level: 17, requires: ['q_forge_gate'],
    summary: 'Besiege den Wächter der Esse in der Glutschmiede.',
    offer: 'Vor Ignaroths Thron steht ein Wächter aus lebendem Eisen. Niemand kommt an ihm vorbei. Bis heute.',
    progressText: 'Der Wächter hält die Halle vor dem Thron.',
    completeText: 'Der Wächter ist gefallen. Jetzt steht nur noch der Tyrann zwischen uns und dem Frieden.',
    objectives: [{ id: 'warden', text: 'Wächter der Esse besiegt', count: 1, kind: 'kill', target: 'forge_warden', zone: 'molten_forge' }],
    rewards: { xp: Q(17, 0.7), gold: 140, gear: [{ ilvl: 18, rarity: 'rare', slot: 'head' }] },
  },
  q_forge_cores: {
    title: 'Herzen aus Glut', giver: 'quartermaster_dunn', level: 18, requires: ['q_forge_gate'],
    summary: 'Sammle Glutkerne aus den Wesen der Glutschmiede für Dunns Belagerungsgerät.',
    offer: 'Hale will die Glutschmiede stürmen, und ich soll dafür Rammen bauen, die nicht sofort verbrennen. Glutkerne, vier Stück. Die Schmiedegolems und Drachen dort drin tragen sie im Leib.',
    progressText: 'Vier Glutkerne. Ohne die bleibt jede Ramme Brennholz.',
    completeText: 'Sie pochen noch. Unheimlich. Aber sie halten die Hitze. Hier, für deine Mühe – aus meinem persönlichen Vorrat.',
    objectives: [{ id: 'cores', text: 'Glutkerne gesammelt', count: 4, kind: 'collect', target: 'ember_core', from: ['forge_golem', 'ember_drake'], zone: 'molten_forge' }],
    rewards: { xp: Q(18, 0.5), gold: 150, items: [{ itemId: 'greater_potion', qty: 4 }], gear: [{ ilvl: 18, rarity: 'uncommon', slot: 'hands' }] },
  },
  q_ember_drakes: {
    title: 'Brut der Esse', giver: 'seer_ysolde', level: 18, requires: ['q_forge_gate'],
    summary: 'Töte die Glutdrachen, die in der Glutschmiede ausgebrütet werden.',
    offer: 'In den Flammen der Schmiede schlüpfen Drachen, klein noch, aber jeder Tag macht sie größer. Wenn Ignaroth fällt und sie bleiben, haben wir nichts gewonnen. Töte sechs von ihnen.',
    progressText: 'Sechs Drachen. Achte auf ihren Atem.',
    completeText: 'Ich habe ihr Kreischen in meinen Träumen verstummen hören. Nimm diesen Ring, er schützt vor Feuer – ein wenig.',
    objectives: [{ id: 'drakes', text: 'Glutdrachen getötet', count: 6, kind: 'kill', target: 'ember_drake', zone: 'molten_forge' }],
    rewards: { xp: Q(18, 0.55), gold: 140, gear: [{ ilvl: 18, rarity: 'rare', slot: 'ring' }] },
  },
  q_ignaroth: {
    title: 'Ignaroth, der Glut-Tyrann', giver: 'commander_hale', main: true, level: 19, requires: ['q_forge_warden'],
    summary: 'Stürze Ignaroth und bring seine Krone zurück.',
    offer: 'Das ist es. Ignaroth hat den Berg erweckt und die Toten gerufen. Geh in die Glutschmiede, stürze ihn und bring mir seine Krone. Ganz Emberwrath sieht auf dich.',
    progressText: 'Ignaroth wartet auf seinem Thron. Er wird dreimal wiederkehren, stärker als zuvor.',
    completeText: 'Die Krone des Tyrannen … Dieselbe Flammenkrone wie auf Varkhuls Siegel und Rasks Brief. Es war immer er. Der Berg schweigt. Du hast Emberwrath gerettet. Kein Lied wird dem gerecht.',
    objectives: [
      { id: 'boss', text: 'Ignaroth gestürzt', count: 1, kind: 'boss', target: 'ember_tyrant', zone: 'molten_forge' },
      { id: 'crown', text: 'Krone des Tyrannen', count: 1, kind: 'collect', target: 'tyrant_crown', from: ['ember_tyrant'], zone: 'molten_forge' },
    ],
    rewards: { xp: Q(19, 1.3), gold: 400, reachLevel: 20, gear: [{ ilvl: 20, rarity: 'epic', slot: 'weapon' }] },
  },

  // --- Ysolde (Nebenquests)
  q_obsidian_shards: {
    title: 'Scherben aus Schlacke', giver: 'seer_ysolde', level: 13, requires: ['q_to_the_peaks'],
    summary: 'Sammle Obsidiansplitter von den Aschengolems.',
    offer: 'In den Golems steckt Obsidian, und in Obsidian stecken Visionen. Bring mir acht Splitter – ich will sehen, was der Berg plant.',
    progressText: 'Die Aschengolems wandern über die Hänge. Zerschlag sie.',
    completeText: 'Ich sehe … Feuer. Eine Krone. Und dich. Nimm das, du wirst es brauchen.',
    objectives: [{ id: 'shards', text: 'Obsidiansplitter gesammelt', count: 8, kind: 'collect', target: 'obsidian_shard', from: ['ash_golem'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(13, 0.45), gold: 70, gear: [{ ilvl: 14, rarity: 'uncommon', slot: 'ring' }] },
  },
  q_rift_seals: {
    title: 'Die Siegel der Spalte', giver: 'seer_ysolde', level: 14, requires: ['q_obsidian_shards'],
    summary: 'Erneuere die drei Siegel an der Obsidianspalte.',
    offer: 'Drei Siegel halten die Spalte geschlossen. Sie flackern. Wenn sie brechen, strömt Glut in die Täler. Erneuere sie – berühre jedes, der Rest geschieht von selbst.',
    progressText: 'Die Siegel stehen an den Rändern der Obsidianspalte.',
    completeText: 'Ich spüre es – die Spalte ist ruhig. Für jetzt.',
    objectives: [{ id: 'seals', text: 'Siegel erneuert', count: 3, kind: 'interact', target: ['rift_seal_1', 'rift_seal_2', 'rift_seal_3'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(14, 0.45), gold: 80, items: [{ itemId: 'ember_elixir', qty: 1 }], gear: [{ ilvl: 15, rarity: 'uncommon', slot: 'chest' }] },
  },
  q_cultist_tomes: {
    title: 'Worte der Asche', giver: 'seer_ysolde', level: 16, requires: ['q_rift_seals'],
    summary: 'Erbeute fünf Kultistenfolios von den Anhängern Ignaroths.',
    offer: 'Die Kultisten beten zu Ignaroth. Ihre Folios verraten, wie man ihn schwächt. Bring mir fünf davon.',
    progressText: 'Schlackenkultisten und Flammenakolythen tragen die Folios bei sich.',
    completeText: 'Hier steht es … Ignaroths Herz ist verwundbar, wenn er sich verwandelt. Merk dir das.',
    objectives: [{ id: 'tomes', text: 'Kultistenfolios erbeutet', count: 5, kind: 'collect', target: 'cultist_tome', from: ['cinder_cultist', 'flame_acolyte'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(16, 0.45), gold: 90, gear: [{ ilvl: 17, rarity: 'rare', slot: 'amulet' }] },
  },

  // ================================================================ Kopfgelder (wiederholbar)
  q_bounty_emberhollow: {
    title: 'Kopfgeld: Aschewölfe', giver: 'smith_brom', repeatable: true, level: 2, requires: ['q_ashen_wolves'],
    summary: 'Brom zahlt für jeden Wolf, der nicht mehr an seinen Hühnern nagt.',
    offer: 'Die Wölfe kommen immer wieder. Acht Felle weniger, und ich zahl dir was. Jedes Mal.',
    progressText: 'Acht Wölfe. Brom zahlt bar.',
    completeText: 'Wie abgemacht. Komm wieder, wenn sie wieder heulen.',
    objectives: [{ id: 'kills', text: 'Wölfe erlegt', count: 8, kind: 'kill', target: ['wolf', 'wolf_alpha'], zone: 'emberhollow' }],
    rewards: { xp: Q(2, 0.3), gold: 15, items: [{ itemId: 'minor_potion', qty: 2 }] },
  },
  q_bounty_ashwood: {
    title: 'Kopfgeld: Aschenwald', giver: 'trader_vesk', repeatable: true, level: 8, requires: ['q_road_east'],
    summary: 'Vesk zahlt für jede Bedrohung weniger im Aschenwald.',
    offer: 'Keiler, Banditen, Kriecher – ist mir egal. Zwölf davon weniger, und die Handelsstraße bleibt offen. Das ist mir was wert.',
    progressText: 'Zwölf Feinde im Aschenwald. Egal welche.',
    completeText: 'Die Straße atmet auf. Hier, dein Lohn – bis zum nächsten Mal.',
    objectives: [{ id: 'kills', text: 'Feinde im Aschenwald besiegt', count: 12, kind: 'kill', target: ['ash_boar', 'bandit', 'bandit_archer', 'thorn_crawler'], zone: 'ashwood' }],
    rewards: { xp: Q(8, 0.3), gold: 45, items: [{ itemId: 'healing_potion', qty: 2 }] },
  },
  q_bounty_peaks: {
    title: 'Kopfgeld: Schlackenhöhen', giver: 'quartermaster_dunn', repeatable: true, level: 14, requires: ['q_to_the_peaks'],
    summary: 'Dunn zahlt Sold für jeden Feind auf den Schlackenhöhen.',
    offer: 'Ich hab mehr Gold als Soldaten. Fünfzehn Feinde auf den Höhen, und der Sold gehört dir. Jederzeit wieder.',
    progressText: 'Fünfzehn Feinde auf den Schlackenhöhen.',
    completeText: 'Sauber. Der Sold ist deiner.',
    objectives: [{ id: 'kills', text: 'Feinde auf den Höhen besiegt', count: 15, kind: 'kill', target: ['fire_imp', 'magma_hound', 'ash_golem', 'cinder_cultist'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(14, 0.3), gold: 110, items: [{ itemId: 'greater_potion', qty: 2 }] },
  },
};

// Grußtexte, wenn ein NPC nichts anzubieten hat (Namen kommen aus content 'npc' von Thread B).
export const NPC_LINES = {
  elder_maren: {
    name: 'Maren, die Dorfälteste', idle: 'Möge die Glut dich wärmen, Wanderer.', bank: true, trials: true,
    lines: [
      [null, 'Möge die Glut dich wärmen, Wanderer. Seit der Berg wieder raucht, kommt kaum noch jemand durch die Senke.'],
      ['q_ashen_wolves', 'Die Kinder spielen wieder draußen. Aber unter unseren Füßen kratzt etwas.'],
      ['q_bonelord', 'Die Flammenkrone auf Varkhuls Siegel lässt mich nicht los. Ich habe sie schon einmal gesehen, in einem sehr alten Buch.'],
      ['q_nerith', 'Boten aus dem Aschenwald erzählen von dir. Ich wusste, dass du weit gehen würdest.'],
      ['q_ignaroth', 'Emberwrath schläft ruhig. Aber in der Esse glüht es noch. Wer mutig ist, stellt sich dort den Glutprüfungen.'],
    ],
  },
  smith_brom: {
    name: 'Brom, der Schmied', idle: 'Brauchst du Stahl? Oder Tränke? Ich hab beides.', appearance: true,
    lines: [
      [null, 'Brauchst du Stahl? Oder Tränke? Ich hab beides. Und einen Rat: Tief in der Senke streift ein grauer Wolf, älter als ich. Graumaul. Lass ihn in Ruhe, wenn du klug bist.'],
      ['q_glutfang', 'Glutfangs Fell hängt über meiner Esse. Graumaul ist schlimmer, sagen die Jäger. Wenn du ihn erlegst, will ich den Zahn sehen.'],
      ['q_bonelord', 'Da unten schreibt einer Namen in die Wände, erzählen die Totengräber. Mortis nennen sie ihn. Ich geh da nicht mehr runter.'],
      ['q_ignaroth', 'Aus der Krone des Tyrannen könnte ich Schmuck für ein Königreich machen. Aber die behältst du besser.'],
    ],
  },
  warden_ilsa: {
    name: 'Wächterin Ilsa', idle: 'Halte die Augen offen. Der Wald hat mehr Zähne als Bäume.',
    lines: [
      [null, 'Halte die Augen offen. Der Wald hat mehr Zähne als Bäume. Und eine Axt: Borka, die Aschenhauerin, zieht am Waldweg entlang. Drei meiner Hauptmänner hat sie schon.'],
      ['q_bandit_chief', 'Der Brief aus Rasks Zelt … Jemand am Berg bezahlt dafür, dass die Täler leer werden. Das gefällt mir nicht.'],
      ['q_temple_shore', 'Im Tempel soll noch ein König sitzen, älter als Nerith. Der Salzkönig. Die Ertrunkenen knien vor ihm.'],
      ['q_nerith', 'Hale wartet oben in Rauhwacht. Grüß ihn von mir und sag ihm, dass er mir noch ein Fass schuldet.'],
    ],
  },
  herbalist_oona: {
    name: 'Oona, die Kräuterfrau', idle: 'Riechst du das? Salbei, Asche und ein Hauch von Gefahr.',
    lines: [
      [null, 'Riechst du das? Salbei, Asche und ein Hauch von Gefahr. Tief im Wald wächst etwas, das die Dornkriecher gebiert. Die Dornenmutter. Ihr Saft wäre ein Vermögen wert.'],
      ['q_thorn_sap', 'Dein Gegengift wirkt. Die Holzfäller bringen mir schon Blumen. Na ja, Unkraut. Aber es zählt.'],
    ],
  },
  trader_vesk: {
    name: 'Vesk, der Händler', idle: 'Alles hat seinen Preis. Auch Ratschläge. Der hier ist umsonst: kauf Tränke.',
    lines: [
      [null, 'Alles hat seinen Preis. Auch Ratschläge. Der hier ist umsonst: kauf Tränke.'],
      ['q_bandit_chief', 'Seit Rask weg ist, rollen meine Wagen wieder. Für dich gibt es heute keinen Aufschlag. Na gut, einen kleinen.'],
    ],
  },
  commander_hale: {
    name: 'Kommandant Hale', idle: 'Rauhwacht hält. Solange Leute wie du hier sind.',
    lines: [
      [null, 'Rauhwacht hält. Solange Leute wie du hier sind. Pass am Aufstieg auf einen Golem auf, der nicht zu den anderen gehört. Asch\'rak. Er trägt eine Faust aus Schlacke.'],
      ['q_behemoth', 'Der Koloss ist gefallen, und meine Leute singen wieder. Schlecht, aber sie singen.'],
      ['q_forge_warden', 'Nur noch der Tyrann. Ich habe mein Leben lang auf diesen Tag gewartet und hoffe, ihn zu überleben.'],
      ['q_ignaroth', 'Rauhwacht wird bleiben. Irgendwer muss den Berg im Auge behalten, auch wenn er schweigt.'],
      ['q_homecoming', 'Die Leute fragen mich jeden Tag, ob du wirklich den Aschenfürsten gestürzt hast. Ich sage ja und zeige auf dich. Dann glauben sie es.'],
    ],
  },
  seer_ysolde: {
    name: 'Seherin Ysolde', idle: 'Die Flammen erzählen Geschichten. Deine ist noch nicht zu Ende.',
    lines: [
      [null, 'Die Flammen erzählen Geschichten. Deine ist noch nicht zu Ende.'],
      ['q_obsidian_shards', 'In den Splittern sah ich Flügel aus Glut. Eine Drachenmutter nistet in der Schmiede. Glutschwinge. Ignaroth nährt sie mit seinem Blut.'],
      ['q_ignaroth', 'Ich sehe keine Krone mehr in den Flammen. Nur dich. Und eine Esse, die dich prüfen will.'],
    ],
  },
  quartermaster_dunn: {
    name: 'Quartiermeister Dunn', idle: 'Ausrüstung, Proviant, Sold. Frag nicht, woher.', bank: true,
    lines: [
      [null, 'Ausrüstung, Proviant, Sold. Frag nicht, woher. Und wenn du Gold übrig hast: Verstärken kostet, lohnt sich aber.'],
      ['q_forge_cores', 'Die Rammen halten. Deine Glutkerne pochen darin wie Herzen. Unheimlich, aber sie halten.'],
    ],
  },
};

// Händler: feste Waren plus Ausrüstung (nur common/uncommon) aus einer Stufenspanne.
export const VENDORS = {
  smith_brom: { name: 'Broms Schmiede', levels: [1, 6], goods: ['minor_potion', 'minor_mana', 'hearth_bread'], craft: true },
  trader_vesk: { name: 'Vesks Wagen', levels: [6, 12], goods: ['minor_potion', 'healing_potion', 'minor_mana', 'mana_potion'] },
  quartermaster_dunn: { name: 'Dunns Vorräte', levels: [12, 20], goods: ['healing_potion', 'greater_potion', 'mana_potion'], craft: true },
};

// Stufe 20–40 (quests40.js)
for (const [id, q] of Object.entries(QUESTS_40)) { if (QUESTS[id]) throw new Error(`Quest ${id} doppelt`); QUESTS[id] = q; }
Object.assign(NPC_LINES, NPC_LINES_40);
Object.assign(VENDORS, VENDORS_40);
