// Quests der Erweiterung „Sternenglut“, Teil 1 (Stufe 41–50): Kapitel 8–12 und die Nebenquests in Sternhafen, den
// Treibenden Gärten und den Splitterweiten. Format wie quests.js; quests.js hängt QUESTS_STARS und NPC_LINES_STARS an,
// items.js die Questgegenstände (QUEST_ITEMS_STARS), loot.js die Questdrops (QUEST_DROPS_STARS).
//
// Geschichte (Dokument „Emberwrath – Die Geschichte“, Kapitel 8–12): Ysolde sieht im kalten Feuer der Krone einen
// Stern. Hinter dem Aschethron reißt der Himmel auf, Corvanes Ritter halten den Riss, Hale schickt den Wanderer ein
// letztes Mal los. In Sternhafen erzählt Fürstin Amarys von den drei Königen (Aurel, Ysmeine, Durgrim), der Ankerstein
// verblasst. Ysgarn fällt, sein Lichtsamen erweckt den Stein. Die Splitter der Weiten singen denselben Ton wie das
// Herz der Glut; Kaldris' Splitter spricht mit Malgareths Stimme. Ysmeine nennt im Sterben den Namen Azhuron und
// öffnet die Lichtbrücke nach Osten (Teil 2). Nebenstrang „Ein Brief für Maren“: Tobin, Marens Sohn, lebt in Sternhafen.
//
// Ablauf ohne Zurücklaufen: Glutöde → Sternhafen → Gärten (Ankerhain, Wurzelbruch, Terrassen + Rankengruft, Mondweiher)
// → einmal zurück nach Sternhafen (Ankerstein) → Splitterweiten (Funkenruh, Scherbenfeld, Grate + Gläserne Hallen,
// Spiegelsee, Sternwartenberg + Sternwarte) → Sternhafen (Lichtbrücke). Dungeon-Hauptquests und Dungeon-Nebenquests
// werden gleichzeitig frei, damit ein Lauf reicht.
// Quests ab Stufe 41: questXp(40) rechnet wie 39 (xp.js). Ab 41 gibt es keinen Quest-Bonus mehr (QUEST_XP_BOOST),
// darum sind die Gewichte höher als in quests40.js. Abgestimmt mit test/pacing.mjs (Ziel: 40→50 rund 11 echte Stunden).
import { questXp } from './xp.js';

const Q = (level, weight) => questXp(level, weight);
const W = {
  travel: 0.08, main: 0.22, kill: 0.2, elite: 0.27, boss: 0.38, side: 0.17, dungeonSide: 0.21, choice: 0.18,
  lesson: 0.07, bounty: 0.13, hunt: 0.09, finale: 0.8,
};
// Gold je Quest: 360 auf Stufe 41 bis 560 auf Stufe 50 (Faktor k: Reise 0,6, Boss 2,5, Finale 5)
const G = (level, k = 1) => Math.round((((level - 40) * 22 + 340) * k) / 10) * 10;
const gear = (level, slot, rarity = 'uncommon') => ({ ilvl: Math.min(level + 1, 50), rarity, slot });

export const QUESTS_STARS = {
  // ================================================================ Kapitel 8: Der Riss hinter dem Thron (Glutland)
  q_star_in_crown: {
    title: 'Ein Stern im kalten Feuer', giver: 'seer_ysolde', turnInNpc: 'commander_hale', main: true, level: 41, minLevel: 40, requires: ['q_homecoming'],
    summary: 'Erzähl Kommandant Hale, was Ysolde im kalten Feuer der Krone gesehen hat.',
    offer: 'Seit du zurück bist, sehe ich jede Nacht dasselbe Bild. Die Krone ist kalt, aber in ihrer kalten Glut brennt noch etwas. Kein Thron diesmal. Ein Stern, weit hinter dem Aschethron, und er hat Hunger. Hale hört mir nicht mehr zu, seit der Krieg vorbei ist. Dir hört er zu.',
    progressText: 'Hale steht auf dem Wall der Rauhwacht.',
    completeText: 'Ein Stern. Natürlich. Ich habe zehn Jahre gebetet, dass es mit dem Aschenfürsten vorbei ist, und jetzt sagt mir eine Seherin, dass er nur der Anfang war. Ich glaube ihr. Das ist das Schlimmste daran.',
    objectives: [{ id: 'hale', text: 'Kommandant Hale von der Vision erzählt', count: 1, kind: 'talk', target: 'commander_hale', zone: 'cinder_peaks' }],
    rewards: { xp: Q(41, W.travel), gold: G(41, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_last_errand: {
    title: 'Ein letzter Auftrag', giver: 'commander_hale', turnInNpc: 'marshal_corvane', main: true, level: 41, requires: ['q_star_in_crown'],
    summary: 'Reise zur Letzten Bastion und melde dich bei Marschall Corvane.',
    offer: 'Corvane hat mir einen Boten geschickt, am selben Tag, an dem du zurückkamst. Hinter dem Aschethron ist der Himmel aufgerissen, schreibt er. Seine Ritter halten Wache, aber sie wissen nicht, wovor. Ich habe dich schon einmal losgeschickt, weil ich niemanden sonst hatte. Diesmal schicke ich dich, weil es keinen Besseren gibt. Ein letztes Mal, Wanderer.',
    progressText: 'Corvane wartet in der Letzten Bastion in der Glutöde.',
    completeText: 'Hale schickt dich? Dann glaubt er mir also. Gut. Ich hatte schon Angst, ich sehe Gespenster.',
    objectives: [{ id: 'travel', text: 'Glutöde erreicht', count: 1, kind: 'reach', target: ['zone:ember_wastes', 'last_bastion'], zone: 'cinder_peaks' }],
    rewards: { xp: Q(41, W.travel), gold: G(41, 0.6), items: [{ itemId: 'starlight_mana', qty: 2 }] },
  },
  q_rift_watch: {
    title: 'Wache am Sternenriss', giver: 'marshal_corvane', main: true, level: 41, requires: ['q_last_errand'], needs: 'defend',
    summary: 'Halte mit Corvanes Rittern den Sternenriss, bis er sich beruhigt.',
    offer: 'Neben dem Throntor hängt ein Spalt im Himmel. Er war kleiner, als ich ihn zum ersten Mal sah. Jede Nacht kriechen Lichter heraus, kalt und violett, und alles, was sie berühren, wird still. Meine Ritter halten Wache, aber sie werden müde. Geh zum Wachfeuer am Riss und steh ihnen bei, bis er sich beruhigt.',
    progressText: 'Das Wachfeuer brennt vor dem Sternenriss, gleich neben dem Throntor. Entzünde es, wenn du bereit bist.',
    completeText: 'Du hast sie gesehen, die Lichter. Sie bluten nicht und sie schreien nicht. Sie verlöschen nur. Ich weiß nicht, was hinter diesem Riss liegt. Aber ich weiß, dass es zu uns will.',
    objectives: [{ id: 'rift', text: 'Sternenriss gehalten', count: 1, kind: 'defend', target: 'defend_star_rift', start: { kind: 'object', id: 'rift_watchfire' }, zone: 'ember_wastes', failText: 'Die Ritter weichen zurück. Am Wachfeuer sammeln sie sich wieder.' }],
    rewards: { xp: Q(41, W.main), gold: G(41), gear: [gear(41, 'chest')] },
  },
  q_through_the_rift: {
    title: 'Durch den Riss', giver: 'marshal_corvane', turnInNpc: 'captain_halvard', main: true, level: 41, requires: ['q_rift_watch'],
    summary: 'Tritt durch den Sternenriss und finde heraus, was dahinter liegt.',
    offer: 'Der Riss ist ruhig. Ruhiger als je zuvor, und er ist weit genug für einen Menschen. Ich kann meine Ritter nicht schicken, die Bastion braucht sie. Und ehrlich gesagt: Wenn einer zurückkommt, dann du. Geh durch. Und wenn du dort drüben jemanden findest, sag ihm, dass das Glutland wieder steht.',
    progressText: 'Der Sternenriss hängt neben dem Throntor in der Luft.',
    completeText: 'Noch einer durchs Tor! Ganz ruhig, atme. Das erste Mal ist der Himmel unter den Füßen ein Schock. Du bist in Sternhafen, auf der Ankerinsel. Und deiner Rüstung nach kommst du aus dem Glutland. Es ist lange her, dass einer von dort kam.',
    objectives: [{ id: 'travel', text: 'Sternhafen erreicht', count: 1, kind: 'reach', target: ['zone:sternhafen', 'sternhafen_anker'], zone: 'ember_wastes' }],
    rewards: { xp: Q(41, W.travel), gold: G(41, 0.6), gear: [gear(41, 'feet')] },
  },

  // ================================================================ Kapitel 9: Die Stadt der Gestrandeten (Sternhafen)
  q_star_audience: {
    title: 'Audienz bei der Fürstin', giver: 'captain_halvard', turnInNpc: 'lady_amarys', main: true, level: 41, requires: ['q_through_the_rift'],
    summary: 'Geh über die Palastbrücke zu Fürstin Amarys.',
    offer: 'Wer aus dem Glutland kommt, muss zur Fürstin. So war es immer, auch wenn seit hundert Jahren keiner mehr kam. Die Palastbrücke liegt im Norden, über dem Ankerplatz. Benimm dich. Sie ist freundlicher, als sie aussieht, aber nicht viel.',
    progressText: 'Der Palast liegt auf der Palasthöhe, nördlich des Ankerplatzes.',
    completeText: 'Ihr kommt aus der Glut und steht doch aufrecht. Und an Euren Händen hängt kalte Asche. Ihr habt den Aschenfürsten gestürzt, nicht wahr? Dann wisst Ihr nicht, was Ihr getan habt. Setzt Euch. Ich erzähle es Euch.',
    objectives: [{ id: 'palace', text: 'Palasthöhe erreicht', count: 1, kind: 'reach', target: ['palace_heights'], zone: 'sternhafen' }],
    rewards: { xp: Q(41, W.travel), gold: G(41, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_three_kings: {
    title: 'Die drei Könige', giver: 'lady_amarys', main: true, level: 41, requires: ['q_star_audience'],
    summary: 'Lass dir von Seraphe im Sternturm zeigen, was Aurel jenseits der Glut fand.',
    offer: 'Vor tausend Jahren stürzten fünf Könige den Aschenfürsten. Zwei blieben bei Euch: Ulgrim, der fiel, und der Wächter, der am Thron blieb. Die anderen drei folgten der Spur der Glut bis zu ihrem Ursprung, um sie dort zu löschen. Aurel, mein Ahn. Ysmeine aus den Zwielichtwäldern. Und Durgrim, der Zwergenkönig. Keiner kam zurück. Aurel gründete diese Stadt auf dem, was er fand. Seraphe im Sternturm kann Euch zeigen, was das war. Ich kann es nicht mehr ansehen.',
    progressText: 'Der Sternturm steht auf einer eigenen Scherbe nordwestlich des Ankerplatzes.',
    completeText: 'Ihr habt es gesehen. Der Stern, aus dem die Glut kam, stirbt seit tausend Jahren. Und alles, was er im Sterben berührt, stirbt mit. Darum treiben unsere Inseln auseinander. Darum zählt Seraphe jede Nacht weniger Sterne.',
    objectives: [{ id: 'seraphe', text: 'Mit Seraphe im Sternturm gesprochen', count: 1, kind: 'talk', target: 'seer_seraphe', zone: 'sternhafen' }],
    rewards: { xp: Q(41, W.main), gold: G(41), gear: [gear(41, 'amulet')] },
  },
  q_anchor_fading: {
    title: 'Der Ankerstein', giver: 'lady_amarys', main: true, level: 42, requires: ['q_three_kings'],
    summary: 'Leg die Hand auf den Ankerstein, der Sternhafens Inseln zusammenhält.',
    offer: 'Aurel band die Inseln mit einem Stein aus reinem Sternlicht. Den Ankerstein. Solange er leuchtet, halten die Inseln zusammen. Er leuchtet nicht mehr so wie früher. Legt Eure Hand darauf, unten auf dem Ankerplatz. Ihr kommt von dort, wo die Glut herkommt. Vielleicht spürt Ihr etwas, das wir nicht mehr spüren.',
    progressText: 'Der Ankerstein liegt am Brunnen in der Mitte des Ankerplatzes.',
    completeText: 'Er hat geflackert, als Ihr ihn berührt habt? Dann lebt er noch. Seraphe sagt, er braucht neues Licht. Das letzte reine Licht dieser Welt wächst in den Gärten, im Herzen des Alten Gärtners, den Aurel dort pflanzte.',
    objectives: [{ id: 'stone', text: 'Ankerstein berührt', count: 1, kind: 'interact', target: ['anchor_stone'], zone: 'sternhafen' }],
    rewards: { xp: Q(42, W.main), gold: G(42), gear: [gear(42, 'hands')] },
  },
  q_light_bridge_gardens: {
    title: 'Über die Lichtbrücke', giver: 'lady_amarys', turnInNpc: 'warden_veyra', main: true, level: 42, requires: ['q_anchor_fading'],
    summary: 'Reise in die Treibenden Gärten und finde Hüterin Veyra in Morgentau.',
    offer: 'Westlich des Ankerplatzes führt die Lichtbrücke in die Treibenden Gärten. Aurels Gärten, heute verwildert. Hüterin Veyra hält dort das Dorf Morgentau. Sie traut niemandem, der aus der Stadt kommt. Sagt ihr, dass ich Euch schicke und dass es diesmal ernst ist.',
    progressText: 'Die Lichtbrücke beginnt am Westrand von Sternhafen. Morgentau liegt unter dem Ankerbaum.',
    completeText: 'Die Fürstin schickt jemanden? Zu Fuß über die Brücke, und nicht nur einen Brief? Dann steht es schlimm. Willkommen in Morgentau, Glutländer. Pass auf, wo du hintrittst. Hier wächst alles, auch das, was beißt.',
    objectives: [{ id: 'travel', text: 'Morgentau erreicht', count: 1, kind: 'reach', target: ['zone:drifting_gardens', 'morgentau'], zone: 'sternhafen' }],
    rewards: { xp: Q(42, W.travel), gold: G(42, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },

  // ================================================================ Kapitel 10: Gärten ohne Sonne (Treibende Gärten)
  q_roots_tremble: {
    title: 'Die Wurzeln zittern', giver: 'warden_veyra', main: true, level: 42, requires: ['q_light_bridge_gardens'],
    summary: 'Vertreibe die Blütenpirscher aus dem Ankerhain.',
    offer: 'Die Blütenpirscher waren einmal harmlos. Sie fraßen Falter und schliefen in den Blüten. Seit die Leere unter den Inseln wächst, jagen sie alles, was sich bewegt, auch meine Gärtner. Sie streifen rund um den Ankerhain. Sechzehn von ihnen, dann können meine Leute wieder an die Beete.',
    progressText: 'Die Blütenpirscher streifen am Rand des Ankerhains zwischen den Blütenbäumen.',
    completeText: 'Die Beete sind wieder sicher, für eine Weile. Aber die Pirscher sind nicht das Problem. Sie fliehen vor etwas. Und das sitzt im Wurzelbruch.',
    objectives: [{ id: 'stalkers', text: 'Blütenpirscher vertrieben', count: 16, kind: 'kill', target: 'bloom_stalker', zone: 'drifting_gardens' }],
    rewards: { xp: Q(42, W.kill), gold: G(42), gear: [gear(42, 'weapon')] },
  },
  q_root_break: {
    title: 'Der Wurzelbruch', giver: 'warden_veyra', main: true, level: 42, requires: ['q_roots_tremble'],
    summary: 'Versiegle die drei Leerenrisse im Wurzelbruch.',
    offer: 'Westlich von hier ist die Erde zerbrochen. Wir nennen es den Wurzelbruch. Dort sind Risse aufgegangen, und durch sie steigt die Leere herauf. Ich kann sie nicht schließen, aber du kannst sie versiegeln. Leg deine Hand darauf und halt dagegen. Es wird kalt. Sehr kalt.',
    progressText: 'Die Leerenrisse leuchten violett auf drei Brocken des Wurzelbruchs.',
    completeText: 'Drei Risse, versiegelt. Spürst du das? Die Wurzeln zittern nicht mehr ganz so stark. Aber Siegel halten nicht ewig, nicht gegen die Leere.',
    objectives: [
      { id: 'break', text: 'Wurzelbruch erreicht', count: 1, kind: 'reach', target: ['root_break'], zone: 'drifting_gardens' },
      { id: 'rifts', text: 'Leerenrisse versiegelt', count: 3, kind: 'interact', target: ['void_rift_1', 'void_rift_2', 'void_rift_3'], zone: 'drifting_gardens' },
    ],
    rewards: { xp: Q(42, W.main), gold: G(42), gear: [gear(42, 'head')] },
  },
  q_gardener_tokens: {
    title: 'Die Namen der Gärtner', giver: 'warden_veyra', main: true, level: 43, requires: ['q_root_break'],
    summary: 'Erlöse die Wurzelgebundenen und bring Veyra die Gärtnermarken zurück.',
    offer: 'Ich muss dir etwas sagen. Die Wurzelgebundenen im Bruch sind keine Tiere. Das waren Gärtner aus Morgentau. Sie gingen zu den Wurzeln, als das Zittern anfing, und die Leere hat sie behalten. Jeder trug eine Marke mit seinem Namen. Bring mir die Marken zurück. Ihre Familien sollen wissen, dass sie Ruhe gefunden haben.',
    progressText: 'Die Wurzelgebundenen wandern zwischen den Brocken des Wurzelbruchs.',
    completeText: 'Talbert. Wenna. Der alte Hollis. Ich kannte sie alle. Danke, dass du sie zurückgebracht hast, auch wenn es nur noch Namen sind.',
    objectives: [
      { id: 'rootbound', text: 'Wurzelgebundene erlöst', count: 12, kind: 'kill', target: 'rootbound', zone: 'drifting_gardens' },
      { id: 'tokens', text: 'Gärtnermarken geborgen', count: 6, kind: 'collect', target: 'gardener_token', from: ['rootbound'], zone: 'drifting_gardens' },
    ],
    rewards: { xp: Q(43, W.main), gold: G(43), gear: [gear(43, 'chest')] },
  },
  q_hanging_terraces: {
    title: 'Aurels Terrassen', giver: 'warden_veyra', main: true, level: 43, requires: ['q_gardener_tokens'],
    summary: 'Steig zu den Hängenden Terrassen hinauf und brich die Gartenwächter.',
    offer: 'Über dem Bruch hängen die Terrassen, Aurels Lieblingsort. Er ließ Wächter aus Perlstein bauen, die seine Gärten pflegten. Jetzt bewachen sie das Tor zur Rankengruft und lassen niemanden durch, nicht einmal mich. Die Leere ist in den Stein gekrochen. Zerbrich vierzehn von ihnen.',
    progressText: 'Die Gartenwächter stehen auf den drei Terrassen im Nordwesten.',
    completeText: 'Zehn Wächter. Aurel hätte geweint. Und dann hätte er dir gedankt.',
    objectives: [
      { id: 'terraces', text: 'Hängende Terrassen erreicht', count: 1, kind: 'reach', target: ['hanging_terraces'], zone: 'drifting_gardens' },
      { id: 'golems', text: 'Gartenwächter zerbrochen', count: 14, kind: 'kill', target: 'garden_golem', zone: 'drifting_gardens' },
    ],
    rewards: { xp: Q(43, W.main), gold: G(43), gear: [gear(43, 'feet')] },
  },
  q_vine_crypt: {
    title: 'Die Rankengruft', giver: 'warden_veyra', main: true, level: 44, requires: ['q_hanging_terraces'],
    summary: 'Steig in die Rankengruft hinab und dränge die Ranken zurück.',
    offer: 'Unter der obersten Terrasse liegt die Gruft der Gärtner. Dort wurde jeder begraben, der Aurels Gärten gepflegt hat, und dort wurzelt Ysgarn, der Alte Gärtner. Seine Ranken kommen inzwischen aus jeder Spalte der Gruft. Dräng sie zurück. Und nimm Freunde mit, wenn du welche hast.',
    progressText: 'Das Rankentor liegt am Ende der obersten Terrasse.',
    completeText: 'Du bist wieder da und riechst nach Moder und Blüten. Die Ranken weichen schon zurück, ich sehe es bis hier.',
    objectives: [
      { id: 'gate', text: 'Rankengruft betreten', count: 1, kind: 'reach', target: ['zone:rankengruft'], zone: 'drifting_gardens' },
      { id: 'vines', text: 'Diener der Ranken besiegt', count: 10, kind: 'kill', target: ['rootbound', 'vine_horror', 'thorn_priest', 'void_wisp'], zone: 'rankengruft' },
    ],
    rewards: { xp: Q(44, W.main), gold: G(44), gear: [gear(44, 'hands')] },
  },
  q_ysgarn: {
    title: 'Der Alte Gärtner', giver: 'warden_veyra', main: true, level: 44, requires: ['q_hanging_terraces'],
    summary: 'Erlöse Ysgarn im Herzgarten der Rankengruft und bring Veyra, was aus seinem Herzen fällt.',
    offer: 'Ysgarn hat diese Gärten gepflegt, lange bevor Sternhafen stand. Aurel pflanzte ihn als Hüter. Er ist nicht böse, er ist krank, und die Krankheit heißt Leere. Erlöse ihn. Man sagt, in seinem Herzen schläft ein Lichtsamen, das letzte reine Licht dieser Welt. Wenn er fällt, bring ihn mir. Vorsichtig.',
    progressText: 'Ysgarn wurzelt im Herzgarten am tiefsten Punkt der Rankengruft.',
    completeText: 'Er ist warm. Nach allem, was die Leere ihm angetan hat, ist das Herz des Alten Gärtners noch warm. Aber der Samen schläft. Odda am Mondweiher weiß, wie man ihn weckt.',
    objectives: [
      { id: 'boss', text: 'Ysgarn erlöst', count: 1, kind: 'boss', target: 'ysgarn', zone: 'rankengruft' },
      { id: 'seed', text: 'Schlafender Lichtsamen', count: 1, kind: 'collect', target: 'light_seed', from: ['ysgarn'], zone: 'rankengruft' },
    ],
    rewards: { xp: Q(44, W.boss), gold: G(44, 2.5), gear: [gear(44, 'weapon', 'rare')] },
  },
  q_moon_pond: {
    title: 'Licht unter dem Mond', giver: 'warden_veyra', turnInNpc: 'hermit_odda', main: true, level: 44, requires: ['q_ysgarn'],
    summary: 'Bring den schlafenden Lichtsamen zu Odda an den Mondweiher.',
    offer: 'Odda lebt allein am Mondweiher im Südwesten. Sie redet mit dem Wasser, und das Wasser redet zurück, sagen die Gärtner. Sie ist die Einzige, die noch weiß, wie Aurel die Lichtsamen geweckt hat. Nimm den Samen und geh zu ihr. Und sei höflich, sie wirft mit Steinen.',
    progressText: 'Der Mondweiher liegt im Südwesten der Gärten, über die lange Brücke von den Terrassen.',
    completeText: 'Ein Lichtsamen. Nach so vielen Jahren. Und er schläft, natürlich schläft er. Nach allem, was er gesehen hat, würde ich auch schlafen.',
    startItems: [{ itemId: 'light_seed', qty: 1 }],
    objectives: [{ id: 'pond', text: 'Mondweiher erreicht', count: 1, kind: 'reach', target: ['moon_pond'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(44, W.travel), gold: G(44, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_moon_altar: {
    title: 'Der Mondaltar', giver: 'hermit_odda', main: true, level: 45, requires: ['q_moon_pond'],
    summary: 'Vertreibe die Sternfalter vom Weiher und wecke den Lichtsamen am Mondaltar.',
    offer: 'Der Altar am Nordufer fängt das Mondlicht im Wasser und gibt es zurück. So hat Aurel die Samen geweckt. Aber die Sternfalter trinken das Licht, bevor es den Altar erreicht, und es werden mehr, je dunkler es wird. Vertreib vierzehn von ihnen. Dann leg den Samen auf den Altar.',
    progressText: 'Die Sternfalter flattern über dem Mondweiher. Der Altar steht am Nordufer.',
    completeText: 'Siehst du, wie er leuchtet? Er ist wach. Bring ihn nach Sternhafen, bevor die Leere ihn riecht. Und grüß die Fürstin nicht von mir. Sie weiß, warum.',
    startItems: [{ itemId: 'light_seed', qty: 1 }],
    objectives: [
      { id: 'moths', text: 'Sternfalter vertrieben', count: 14, kind: 'kill', target: 'star_moth', zone: 'drifting_gardens' },
      { id: 'altar', text: 'Lichtsamen am Mondaltar geweckt', count: 1, kind: 'use', item: 'light_seed', target: ['moon_altar'], zone: 'drifting_gardens' },
    ],
    rewards: { xp: Q(45, W.main), gold: G(45), gear: [gear(45, 'ring')] },
  },
  q_seed_to_anchor: {
    title: 'Neues Licht', giver: 'hermit_odda', turnInNpc: 'lady_amarys', main: true, level: 45, requires: ['q_moon_altar'],
    summary: 'Setze den erwachten Lichtsamen in den Ankerstein von Sternhafen.',
    offer: 'Geh zurück nach Sternhafen und leg den Samen in den Ankerstein. Halt ihn nicht zu lange in der Hand, er wird ungeduldig. Und dann frag die Fürstin, warum sie nie hierher kommt. Oder lieber nicht.',
    progressText: 'Der Ankerstein liegt am Brunnen auf dem Ankerplatz von Sternhafen.',
    completeText: 'Der Stein leuchtet. Die ganze Stadt hat es gesehen. Seraphe sagt, die Inseln treiben langsamer. Ihr habt uns Zeit geschenkt. Aber im neuen Licht hat Seraphe noch etwas gesehen: Die Splitterweiten im Süden glühen, und sie glühen genau wie die Krone, die Ihr bei Euch tragt.',
    startItems: [{ itemId: 'awakened_seed', qty: 1 }],
    objectives: [{ id: 'stone', text: 'Lichtsamen in den Ankerstein gelegt', count: 1, kind: 'use', item: 'awakened_seed', target: ['anchor_stone'], zone: 'sternhafen' }],
    rewards: { xp: Q(45, W.elite), gold: G(45, 1.5), gear: [gear(45, 'chest', 'rare')] },
  },

  // ================================================================ Kapitel 11: Splitter (Splitterweiten, Gläserne Hallen)
  q_splinter_reaches: {
    title: 'Glühende Weiten', giver: 'lady_amarys', turnInNpc: 'foreman_dagna', main: true, level: 45, requires: ['q_seed_to_anchor'],
    summary: 'Reise in die Splitterweiten und melde dich bei Vorarbeiterin Dagna in Funkenruh.',
    offer: 'Südlich der Stadt liegen die Splitterweiten. Dort zerbrach Aurels Himmelsreich, und heute graben Schürfer nach Sternsplittern. Die Splitter bringen gutes Gold, und in letzter Zeit bringen sie die Schürfer um den Verstand. Dagna führt das Lager Funkenruh. Findet heraus, warum die Weiten glühen wie Eure Krone.',
    progressText: 'Die Brücke in die Splitterweiten beginnt am Südtor. Funkenruh liegt westlich der Mitte.',
    completeText: 'Die Fürstin schickt mir jemanden? Na endlich. Ich habe ihr drei Briefe geschrieben. Hier draußen gehen mir die Leute aus, und nicht, weil sie kündigen.',
    objectives: [{ id: 'travel', text: 'Funkenruh erreicht', count: 1, kind: 'reach', target: ['zone:splitterweiten', 'funkenruh'], zone: 'sternhafen' }],
    rewards: { xp: Q(45, W.travel), gold: G(45, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_splinter_madness: {
    title: 'Splitterwahn', giver: 'foreman_dagna', main: true, level: 45, requires: ['q_splinter_reaches'],
    summary: 'Halte die wahnsinnigen Schürfer auf und nimm ihnen die Splitter ab, die sie horten.',
    offer: 'Meine Schürfer gehen ins Scherbenfeld und kommen anders zurück. Erst flüstern sie, dann horten sie, dann greifen sie jeden an, der ihren Splittern zu nahe kommt. Ich habe gute Leute an diese Steine verloren. Halt sie auf und bring mir die Splitter. Ich will wissen, was in denen steckt.',
    progressText: 'Die wahnsinnigen Schürfer graben im Scherbenfeld nördlich von Funkenruh.',
    completeText: 'Sieh dir das an. Die Splitter sind warm, und wenn man sie ans Ohr hält, summen sie. Kein Kristall summt so. Lun auf den Singenden Graten wird wissen, was das ist.',
    objectives: [
      { id: 'mad', text: 'Wahnsinnige Schürfer aufgehalten', count: 10, kind: 'kill', target: 'mad_prospector', zone: 'splitterweiten' },
      { id: 'shards', text: 'Gehortete Sternsplitter', count: 5, kind: 'collect', target: 'raw_starshard', from: ['mad_prospector', 'shard_crawler'], zone: 'splitterweiten' },
    ],
    rewards: { xp: Q(45, W.main), gold: G(45), gear: [gear(45, 'head')] },
  },
  q_same_fire: {
    title: 'Dasselbe Feuer', giver: 'foreman_dagna', turnInNpc: 'echo_sage_lun', main: true, level: 46, requires: ['q_splinter_madness'],
    summary: 'Bring die summenden Splitter zu Lun auf den Singenden Graten.',
    offer: 'Lun lebt draußen auf den Graten, wo die Kristalltürme singen. Er hört Dinge, die wir nicht hören. Nimm die Splitter mit und frag ihn, was sie sagen. Der Weg führt ostwärts über das Scherbenfeld.',
    progressText: 'Die Singenden Grate liegen im Osten der Splitterweiten.',
    completeText: 'Gib her. Ganz still jetzt. Hörst du es? Nein, natürlich nicht. Sie singen denselben Ton wie das Herz der Glut, aus dem eure Krone geschmiedet wurde. Ich habe ihn einmal gehört, vor langer Zeit, im Glutland. Diese Splitter und eure Krone sind aus demselben Feuer.',
    startItems: [{ itemId: 'humming_shards', qty: 1 }],
    objectives: [{ id: 'ridges', text: 'Singende Grate erreicht', count: 1, kind: 'reach', target: ['singing_ridges'], zone: 'splitterweiten' }],
    rewards: { xp: Q(46, W.travel), gold: G(46, 0.6), items: [{ itemId: 'starlight_mana', qty: 3 }] },
  },
  q_ridge_song: {
    title: 'Das Lied der Grate', giver: 'echo_sage_lun', main: true, level: 46, requires: ['q_same_fire'], needs: 'defend',
    summary: 'Beschütze Lun, während er den Grat umstimmt.',
    offer: 'Die Grate singen falsch, seit Kaldris in den Gläsernen Hallen erwacht ist. Sein Lied ruft die Prismengeister, und die zerschneiden alles, was nicht aus Glas ist. Ich kann den Grat umstimmen, aber nicht, wenn sie mich dabei in Scheiben schneiden. Steh bei mir, bis das Lied zu Ende ist. Sprich mich an, wenn du bereit bist.',
    progressText: 'Lun wartet auf dem Grat. Sprich ihn an, wenn du bereit bist.',
    completeText: 'Hörst du die Stille? So klang der Grat, bevor Kaldris erwachte. Jetzt hört er dich kommen. Gut. Soll er.',
    objectives: [{ id: 'song', text: 'Lun beschützt, bis das Lied endet', count: 1, kind: 'defend', target: 'defend_ridge_song', start: { kind: 'npc', id: 'echo_sage_lun' }, zone: 'splitterweiten', failText: 'Lun verstummt. Er stimmt das Lied neu an, sobald du bereit bist.' }],
    rewards: { xp: Q(46, W.main), gold: G(46), gear: [gear(46, 'hands')] },
  },
  q_glass_prisoners: {
    title: 'Die Gläsernen Gefangenen', giver: 'echo_sage_lun', main: true, level: 47, requires: ['q_ridge_song'],
    summary: 'Dringe in die Gläsernen Hallen ein und erlöse die gläsernen Gefangenen.',
    offer: 'Kaldris sammelt Menschen. Er nennt sie seine Statuen. Schürfer, Sternwachen, Abenteurer aus Sternhafen, alle, die zu nah an seine Hallen kamen. Er lässt sie zu Glas erstarren und stellt sie in seine Säle. Manche bewegen sich noch. Erlöse sie. Das Tor liegt am Ende der Grate.',
    progressText: 'Das Tor der Gläsernen Hallen steht am nordöstlichen Ende der Singenden Grate.',
    completeText: 'Du hast sie gesehen. Ich weiß. Man vergisst ihre Gesichter nicht. Aber jetzt ruhen sie.',
    objectives: [
      { id: 'gate', text: 'Gläserne Hallen betreten', count: 1, kind: 'reach', target: ['zone:glass_halls'], zone: 'splitterweiten' },
      { id: 'prisoners', text: 'Gläserne Gefangene erlöst', count: 8, kind: 'kill', target: 'statue_wraith', zone: 'glass_halls' },
    ],
    rewards: { xp: Q(47, W.main), gold: G(47), gear: [gear(47, 'feet')] },
  },
  q_kaldris: {
    title: 'Der Splitterfürst', giver: 'echo_sage_lun', main: true, level: 48, requires: ['q_ridge_song'],
    summary: 'Stürze Kaldris in den Gläsernen Hallen und nimm ihm den Splitter, den er in der Brust trägt.',
    offer: 'Kaldris ist aus Sternsplittern gewachsen, Splitter um Splitter, wie ein Kristall in einer Höhle. In seiner Brust steckt einer, der größer ist als alle anderen. Er ist es, der singt. Bring ihn mir, wenn Kaldris fällt. Aber halt ihn nicht ans Ohr. Bitte.',
    progressText: 'Kaldris erwartet dich im tiefsten Saal der Gläsernen Hallen.',
    completeText: 'Er ist still? Nein. Er flüstert. Ich höre es von hier. Eine ruhige Stimme, höflich, ohne jede Wut. Sie bedankt sich. Bei dir. Klingt sie wie die Stimme, die du am Aschethron gehört hast? Sag nichts. Ich sehe es dir an.',
    objectives: [
      { id: 'boss', text: 'Kaldris gestürzt', count: 1, kind: 'boss', target: 'kaldris', zone: 'glass_halls' },
      { id: 'splinter', text: 'Kaldris\' Herzsplitter', count: 1, kind: 'collect', target: 'kaldris_splinter', from: ['kaldris'], zone: 'glass_halls' },
    ],
    rewards: { xp: Q(48, W.boss), gold: G(48, 2.5), gear: [gear(48, 'weapon', 'rare')] },
  },
  q_mirror_lake: {
    title: 'Was der Spiegel zeigt', giver: 'echo_sage_lun', turnInNpc: 'mirror_keeper_ilse', main: true, level: 48, requires: ['q_kaldris'],
    summary: 'Bring den flüsternden Splitter zu Ilse an den Spiegelsee.',
    offer: 'Ich will dieses Ding nicht in meiner Nähe haben. Im Süden, am Spiegelsee, lebt Ilse. Sie liest Spiegelbilder wie andere Leute Briefe. Wenn jemand herausfindet, wo dieser Splitter gewesen ist, dann sie.',
    progressText: 'Der Spiegelsee liegt im Südwesten der Splitterweiten.',
    completeText: 'Leg ihn nicht ins Wasser! Gut. Ich sehe ihn auch so. Er ist voller Spiegelbilder, und keines davon gehört hierher.',
    startItems: [{ itemId: 'kaldris_splinter', qty: 1 }],
    objectives: [{ id: 'lake', text: 'Spiegelsee erreicht', count: 1, kind: 'reach', target: ['mirror_lake'], zone: 'splitterweiten' }],
    rewards: { xp: Q(48, W.travel), gold: G(48, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },

  // ================================================================ Kapitel 12: Die Königin, die zu lange hinsah
  q_lake_reflections: {
    title: 'Spiegelbilder', giver: 'mirror_keeper_ilse', main: true, level: 48, requires: ['q_mirror_lake'],
    summary: 'Richte die drei Spiegelsteine am Ufer aus und halte die Leerenhunde vom Wasser fern.',
    offer: 'Die Spiegelsteine am Ufer zeigen, was ein Ding gesehen hat, wenn man sie richtig dreht. Dreh alle drei zum Splitter, dann lese ich ihn. Aber die Leerenhunde kommen jede Nacht ans Wasser. Sie riechen, was in dem Splitter steckt, und sie wollen es zurück. Halte sie fern.',
    progressText: 'Die drei Spiegelsteine stehen am Ufer des Spiegelsees.',
    completeText: 'Ich habe es gesehen. Eine Sternwarte auf einem Berg, und darin eine Frau mit silbernem Haar, die in einen Stern starrt, bis ihre Augen brennen. Sie hat diesen Splitter einmal in der Hand gehalten. Geh zu Tovan auf den Sternwartenberg. Er kennt ihren Namen.',
    startItems: [{ itemId: 'kaldris_splinter', qty: 1 }],
    objectives: [
      { id: 'stones', text: 'Spiegelsteine ausgerichtet', count: 3, kind: 'interact', target: ['mirror_stone_1', 'mirror_stone_2', 'mirror_stone_3'], zone: 'splitterweiten' },
      { id: 'hounds', text: 'Leerenhunde vertrieben', count: 12, kind: 'kill', target: 'void_hound', zone: 'splitterweiten' },
    ],
    rewards: { xp: Q(48, W.main), gold: G(48), gear: [gear(48, 'amulet')] },
  },
  q_observatory_hill: {
    title: 'Der Sternwartenberg', giver: 'mirror_keeper_ilse', turnInNpc: 'astronomer_tovan', main: true, level: 49, requires: ['q_lake_reflections'],
    summary: 'Erzähl Tovan auf dem Sternwartenberg, was der Spiegel gezeigt hat.',
    offer: 'Tovan sitzt am Fuß der Sternwarte, seit sie dunkel wurde. Er wartet auf etwas, sagt er. Vielleicht auf dich. Der Sternwartenberg liegt im Südosten, hinter der langen Brücke.',
    progressText: 'Der Sternwartenberg liegt im Südosten der Splitterweiten.',
    completeText: 'Silbernes Haar und brennende Augen. Ysmeine. Königin Ysmeine aus den Zwielichtwäldern, eine der drei, die Aurel hierher folgten. Sie lebt noch, wenn man das so nennen kann. Sie hat nie aufgehört hinzusehen.',
    objectives: [{ id: 'hill', text: 'Sternwartenberg erreicht', count: 1, kind: 'reach', target: ['observatory_hill'], zone: 'splitterweiten' }],
    rewards: { xp: Q(49, W.travel), gold: G(49, 0.6), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_star_seers: {
    title: 'Die Sternseherinnen', giver: 'astronomer_tovan', main: true, level: 49, requires: ['q_observatory_hill'],
    summary: 'Halte Ysmeines Sternseherinnen auf und nimm ihnen die Himmelskarten ab.',
    offer: 'Ysmeine hat Dienerinnen. Schattenelfen wie sie, die ihr in die Sternwarte gefolgt sind. Sie zeichnen Karten des Himmels, Nacht für Nacht, und auf jeder Karte fehlen mehr Sterne. Halt sie auf und bring mir ihre Karten. Ich will wissen, wonach Ysmeine sucht.',
    progressText: 'Die Sternseherinnen wandeln über die Hänge des Sternwartenbergs.',
    completeText: 'Auf jeder Karte dasselbe. Ein Stern im Osten, größer als alle anderen, und um ihn herum ein Name in der alten Schrift der Schattenelfen. Ich kann ihn nicht lesen. Das kann nur Ysmeine.',
    objectives: [
      { id: 'seers', text: 'Sternseherinnen aufgehalten', count: 12, kind: 'kill', target: 'star_seer', zone: 'splitterweiten' },
      { id: 'charts', text: 'Himmelskarten erbeutet', count: 4, kind: 'collect', target: 'star_chart', from: ['star_seer'], zone: 'splitterweiten' },
    ],
    rewards: { xp: Q(49, W.main), gold: G(49), gear: [gear(49, 'head')] },
  },
  q_into_observatory: {
    title: 'Die Sternwarte', giver: 'astronomer_tovan', main: true, level: 50, requires: ['q_star_seers'],
    summary: 'Dringe in die Sternwarte ein und kämpf dich durch Ysmeines Gefolge.',
    offer: 'Die Sternwarte war Aurels Auge. Ysmeine hat sie zu ihrem gemacht. Ihre Späherinnen, ihre Seherinnen, ihre Hunde aus der Leere, alle stehen zwischen dir und ihr. Geh hinein und nimm Gefährten mit.',
    progressText: 'Das Tor der Sternwarte liegt auf dem Gipfel des Sternwartenbergs.',
    completeText: 'Du lebst. Und ihr Gefolge liegt still. Dann ist der Weg zu ihr frei, oder er war es, als du hinausgegangen bist.',
    objectives: [
      { id: 'gate', text: 'Sternwarte betreten', count: 1, kind: 'reach', target: ['zone:observatory'], zone: 'splitterweiten' },
      { id: 'guards', text: 'Ysmeines Gefolge besiegt', count: 10, kind: 'kill', target: ['shadow_ranger', 'star_seer', 'void_hound', 'glass_sentinel'], zone: 'observatory' },
    ],
    rewards: { xp: Q(50, W.main), gold: G(50), gear: [gear(50, 'chest')] },
  },
  q_ysmeine: {
    title: 'Die Königin, die zu lange hinsah', giver: 'astronomer_tovan', main: true, level: 50, requires: ['q_star_seers'],
    summary: 'Stell dich Königin Ysmeine im Planetarium der Sternwarte.',
    offer: 'Ysmeine wollte den Stern verstehen, der die Glut gebar. Sie hat tausend Jahre in ihn hineingesehen, und er hat zurückgesehen. Was von ihr übrig ist, wartet im Planetarium. Erlöse sie. Sie ist eine Königin, keine Bestie. Und wenn sie spricht, merk dir jedes Wort.',
    progressText: 'Ysmeine wartet im Planetarium im Herzen der Sternwarte.',
    completeText: 'Azhuron. Das hat sie gesagt? Der Name auf den Karten. Der sterbende Stern, der Malgareth die Angst vor dem Tod ins Ohr flüsterte. Und jedes Leben, das im Glutland zu Asche wurde, hat nicht die Krone genährt, sondern ihn. Malgareth war nur seine erste Kerze. Bei allen Sternen, die noch übrig sind. Die Fürstin muss das hören.',
    objectives: [{ id: 'boss', text: 'Ysmeine erlöst', count: 1, kind: 'boss', target: 'ysmeine', zone: 'observatory' }],
    rewards: { xp: Q(50, W.boss), gold: G(50, 2.5), gear: [gear(50, 'weapon', 'rare')] },
  },
  q_bridge_east: {
    title: 'Die Lichtbrücke nach Osten', giver: 'astronomer_tovan', turnInNpc: 'lady_amarys', main: true, level: 50, requires: ['q_ysmeine'],
    summary: 'Sieh dir in Sternhafen die Brücke an, die Ysmeine im Sterben geweckt hat, und berichte Amarys.',
    offer: 'Als Ysmeine fiel, zog ein Licht über den Himmel, von der Sternwarte bis nach Sternhafen. Es endete an der versiegelten Brücke im Nordosten der Stadt. Geh hin und sieh sie dir an. Dann geh zur Fürstin. Sie muss erfahren, wer Azhuron ist, und dass ihr Ahn nicht umsonst gegangen ist.',
    progressText: 'Die versiegelte Brücke liegt im Nordosten von Sternhafen, oberhalb der Sternställe.',
    completeText: 'Die Brücke leuchtet. Zum ersten Mal, seit Aurel sie überquert hat. Sie führt nach Osten, über die Wolkenriffe bis zur Aschensonne, wo Azhuron brennt. Aurel ist diesen Weg gegangen und nicht zurückgekommen. Ihr werdet zurückkommen, das befehle ich Euch. Ruht Euch aus, Wanderer. Sobald die Brücke trägt, brechen wir auf.',
    objectives: [{ id: 'bridge', text: 'An der versiegelten Brücke gestanden', count: 1, kind: 'reach', target: ['sealed_bridge'], zone: 'sternhafen' }],
    rewards: { xp: Q(50, W.finale), gold: G(50, 5), gear: [gear(50, 'amulet', 'rare')], items: [{ itemId: 'starlight_potion', qty: 5 }] },
  },

  // ================================================================ Sternhafen: Nebenquests
  q_herald_errands: {
    title: 'Neuigkeiten aus dem Glutland', giver: 'herald_fenn', level: 41, requires: ['q_star_audience'],
    summary: 'Erzähl den Leuten in Sternhafen selbst, was im Glutland geschehen ist.',
    offer: 'Hört, hört! Ein Glutländer! Endlich habe ich etwas auszurufen. Aber ich rufe nur aus, was ich gehört habe, und gehört haben es noch zu wenige. Geh zu Lio auf dem Markt, zu Brunna in der Schmiedegasse, zu Corvin in den Ställen und zu Mirela im Gasthaus. Erzähl es ihnen. Bis heute Abend weiß es dann die ganze Stadt.',
    progressText: 'Lio auf dem Sternmarkt, Brunna in der Schmiedegasse, Corvin in den Sternställen, Mirela im Gasthaus.',
    completeText: 'Hört, hört! Der Aschenfürst ist gestürzt, und sein Bezwinger trinkt im Fallenden Stern! Siehst du, so geht das. Morgen wollen alle mit dir reden. Ich würde mich verstecken.',
    objectives: [
      { id: 'lio', text: 'Lio auf dem Sternmarkt', count: 1, kind: 'talk', target: 'trader_lio', zone: 'sternhafen' },
      { id: 'brunna', text: 'Brunna in der Schmiedegasse', count: 1, kind: 'talk', target: 'smith_brunna', zone: 'sternhafen' },
      { id: 'corvin', text: 'Corvin in den Sternställen', count: 1, kind: 'talk', target: 'stablemaster_corvin', zone: 'sternhafen' },
      { id: 'mirela', text: 'Mirela im Fallenden Stern', count: 1, kind: 'talk', target: 'innkeeper_mirela', zone: 'sternhafen' },
    ],
    rewards: { xp: Q(41, W.side), gold: G(41), items: [{ itemId: 'starlight_potion', qty: 2 }] },
  },
  q_stranded_scholar: {
    title: 'Ein Gelehrter aus der Glut', giver: 'innkeeper_mirela', turnInNpc: 'scholar_tobin', level: 41, requires: ['q_star_audience'],
    summary: 'Such den Gelehrten im Sternturm, der jeden Neuankömmling nach dem Glutland fragt.',
    offer: 'Du kommst aus dem Glutland? Dann musst du Tobin kennenlernen. Er sitzt im Sternturm über Aurels Büchern und fragt jeden, der durchs Tor kommt, nach einem Dorf namens Glutsenke. Seit zehn Jahren. Bisher konnte ihm keiner etwas sagen. Vielleicht kannst du es.',
    progressText: 'Tobin arbeitet am Sternturm nordwestlich des Ankerplatzes.',
    completeText: 'Die Glutsenke? Du kennst sie? Du warst dort? Bei allen Sternen. Setz dich. Nein, steh. Ich weiß nicht, was ich sagen soll. Ich heiße Tobin. Meine Mutter heißt Maren. Lebt sie noch?',
    objectives: [{ id: 'tobin', text: 'Tobin gefunden', count: 1, kind: 'talk', target: 'scholar_tobin', zone: 'sternhafen' }],
    rewards: { xp: Q(41, W.side), gold: G(41), gear: [gear(41, 'ring')] },
  },
  q_letter_for_maren: {
    title: 'Ein Brief für Maren', giver: 'scholar_tobin', turnInNpc: 'elder_maren', level: 42, requires: ['q_stranded_scholar'],
    summary: 'Bring Tobins Brief durch das Sternentor zu Maren in die Glutsenke.',
    offer: 'Vor zehn Jahren ritt ich mit Corvane nach Norden. Als das Siegel brach, riss der Feuerregen einen Spalt in den Himmel, und ich fiel hindurch. Seitdem bin ich hier. Ich habe tausend Briefe an meine Mutter geschrieben und keinen abgeschickt. Diesen hier schon. Bring ihn ihr, bitte. Das Sternentor auf dem Ankerplatz führt zurück in die Glutöde.',
    progressText: 'Maren lebt in der Glutsenke, ganz im Süden des Glutlands.',
    completeText: 'Tobins Schrift. Das ist Tobins Schrift. Er lebt. Ich habe sein Erbstück einem Fremden geschenkt, weil ich dachte, er kommt nie zurück. Und jetzt bringt mir derselbe Fremde seinen Brief. Gib mir einen Moment. Nur einen Moment.',
    startItems: [{ itemId: 'tobin_letter', qty: 1 }],
    objectives: [{ id: 'maren', text: 'Brief an Maren übergeben', count: 1, kind: 'talk', target: 'elder_maren', zone: 'emberhollow' }],
    rewards: { xp: Q(42, W.side), gold: G(42), items: [{ itemId: 'starlight_potion', qty: 2 }] },
  },
  q_marens_answer: {
    title: 'Marens Antwort', giver: 'elder_maren', turnInNpc: 'scholar_tobin', level: 42, requires: ['q_letter_for_maren'],
    summary: 'Bring Marens Antwort zurück nach Sternhafen zu Tobin.',
    offer: 'Ich habe die ganze Nacht geschrieben. Es ist kein langer Brief geworden. Manche Dinge passen nicht auf Papier. Bring ihn zu meinem Sohn. Und sag ihm, dass die Laterne noch brennt, jeden Abend, an der Tür. Er weiß, was das heißt.',
    progressText: 'Tobin wartet am Sternturm in Sternhafen.',
    completeText: 'Die Laterne brennt noch. Natürlich brennt sie. Danke. Ich kann nicht zurück, nicht, solange der Stern hier draußen hungert. Aber jetzt weiß sie es. Nimm das. Es hat mich durch zehn Jahre gebracht, jetzt soll es dich durch den Rest bringen.',
    startItems: [{ itemId: 'maren_letter', qty: 1 }],
    objectives: [{ id: 'tobin', text: 'Marens Antwort an Tobin übergeben', count: 1, kind: 'talk', target: 'scholar_tobin', zone: 'sternhafen' }],
    rewards: { xp: Q(42, W.side), gold: G(42), gear: [gear(43, 'amulet', 'rare')] },
  },
  q_star_soup: {
    title: 'Sternsuppe', giver: 'innkeeper_mirela', level: 43, requires: ['q_light_bridge_gardens'],
    summary: 'Bring Mirela Keulen von Blütenpirschern für die Sternsuppe.',
    offer: 'Im Fallenden Stern gibt es jeden Abend Sternsuppe, seit Aurels Zeiten. Das Geheimnis sind Keulen vom Blütenpirscher, die schmecken nach Honig und Gewitter. Seit die Pirscher verrückt spielen, traut sich kein Jäger mehr in die Gärten. Bring mir sechs Keulen, wenn du ohnehin drüben bist.',
    progressText: 'Die Blütenpirscher streifen im Ankerhain der Treibenden Gärten.',
    completeText: 'Honig und Gewitter, riech mal. Heute Abend gibt es wieder Sternsuppe, und die erste Schale geht an dich. Die zweite auch, wenn du willst.',
    objectives: [{ id: 'haunches', text: 'Pirscherkeulen gesammelt', count: 6, kind: 'collect', target: 'bloom_haunch', from: ['bloom_stalker'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(43, W.side), gold: G(43), items: [{ itemId: 'steppe_jerky', qty: 6 }, { itemId: 'starlight_potion', qty: 2 }] },
  },
  q_brunna_pearlstone: {
    title: 'Perlstein für die Esse', giver: 'smith_brunna', level: 43, requires: ['q_light_bridge_gardens'],
    summary: 'Bring Brunna die Kerne der Gartenwächter von den Hängenden Terrassen.',
    offer: 'Sternstahl ist störrisch. Er will nur mit Perlstein im Feuer schmelzen, und den besten Perlstein tragen Aurels Gartenwächter in der Brust. Ich weiß, das klingt grausam. Aber die Leere sitzt in ihnen, die sind nicht mehr zu retten. Bring mir fünf Kerne, und ich zeige dir, was Sternstahl kann.',
    progressText: 'Die Gartenwächter stehen auf den Hängenden Terrassen im Nordwesten der Gärten.',
    completeText: 'Schau, wie er glüht. Wie ein kleiner Mond. Das wird die beste Klinge, die diese Esse seit hundert Jahren gesehen hat. Na gut, die zweitbeste. Die beste trägt die Fürstin.',
    objectives: [{ id: 'cores', text: 'Perlsteinkerne geborgen', count: 5, kind: 'collect', target: 'golem_core', from: ['garden_golem'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(43, W.side), gold: G(43), gear: [gear(44, 'weapon')] },
  },
  q_corvin_moths: {
    title: 'Futter für die Rochen', giver: 'stablemaster_corvin', level: 44, requires: ['q_light_bridge_gardens'],
    summary: 'Sammle Falterstaub von den Sternfaltern am Mondweiher für Corvins Himmelsrochen.',
    offer: 'Siehst du die Rochen über der Koppel? Himmelsrochen. Sie fressen nur eins: Falterstaub, das Leuchtpulver von den Flügeln der Sternfalter. Ohne ihn verblassen sie und sinken. Die Falter sammeln sich am Mondweiher in den Gärten. Bring mir sechs Hände voll Staub.',
    progressText: 'Die Sternfalter flattern über dem Mondweiher im Südwesten der Gärten.',
    completeText: 'Sieh nur, wie sie aufsteigen! Leuchtend wie am ersten Tag. Wer meinen Rochen hilft, ist mir immer willkommen. Und eines Tages trägt dich vielleicht einer von ihnen.',
    objectives: [{ id: 'dust', text: 'Falterstaub gesammelt', count: 6, kind: 'collect', target: 'moth_dust', from: ['star_moth'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(44, W.side), gold: G(44, 1.2), gear: [gear(45, 'feet')] },
  },
  q_ysolde_prisms: {
    title: 'Steine, die singen', giver: 'jeweler_ysolde', level: 47, requires: ['q_seed_to_anchor'],
    summary: 'Bring der Juwelierin Ysolde Prismenherzen von den Singenden Graten.',
    offer: 'Ich habe Steine, die singen, wenn man sie hält. Aber nur einen Ton. Die Prismengeister auf den Graten tragen Herzen, die ganze Lieder kennen. Bring mir fünf, und ich fasse dir einen, der für dich singt. Kein anderer Juwelier dieser Welt kann das. Nun ja, es gibt auch keinen anderen.',
    progressText: 'Die Prismengeister schweben über den Singenden Graten in den Splitterweiten.',
    completeText: 'Hörst du? Fünf Herzen, fünf Stimmen. Dieser hier ist deiner. Er singt leise, wenn Gefahr nah ist. Oder wenn er sich langweilt.',
    objectives: [{ id: 'prisms', text: 'Prismenherzen gesammelt', count: 5, kind: 'collect', target: 'prism_heart', from: ['prism_elemental'], zone: 'splitterweiten' }],
    rewards: { xp: Q(47, W.side), gold: G(47), gear: [gear(48, 'ring', 'rare')] },
  },

  // ================================================================ Treibende Gärten: Nebenquests
  q_pell_seed_bags: {
    title: 'Verlorene Saatbeutel', giver: 'trader_pell', level: 42, requires: ['q_light_bridge_gardens'],
    summary: 'Sammle die Saatbeutel ein, die Pells Gärtner auf der Flucht verloren haben.',
    offer: 'Als die Pirscher kamen, sind meine Gärtner gerannt und haben alles fallen lassen. Vier Saatbeutel liegen jetzt irgendwo im Ankerhain und am Rand des Wurzelbruchs. Ohne die Saat gibt es nächstes Jahr keine Ernte. Bring sie zurück, und ich mache dir einen guten Preis. Einen sehr guten.',
    progressText: 'Die Saatbeutel liegen verstreut im Ankerhain und am Rand des Wurzelbruchs.',
    completeText: 'Alle vier, und kein Korn verloren. Die Ernte ist gerettet. Mein Versprechen gilt: Für dich gibt es heute den Gärtnerpreis.',
    objectives: [{ id: 'bags', text: 'Saatbeutel gefunden', count: 4, kind: 'interact', target: ['seed_bag_1', 'seed_bag_2', 'seed_bag_3', 'seed_bag_4'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(42, W.side), gold: G(42, 1.3), items: [{ itemId: 'starlight_potion', qty: 2 }] },
  },
  q_bren_vines: {
    title: 'Ranken schneiden', giver: 'gardener_bren', level: 42, requires: ['q_roots_tremble'],
    summary: 'Hilf Bren, die Rankenschrecken im Wurzelbruch zurückzuschneiden.',
    offer: 'Wir schneiden die Ranken jeden Tag, und sie wachsen jede Nacht nach. Seit ein paar Wochen haben sie Zähne. Die Rankenschrecken im Wurzelbruch fressen die jungen Triebe vom Ankerbaum. Schneid vierzehn von ihnen zurück. Ganz zurück.',
    progressText: 'Die Rankenschrecken wuchern auf den Brocken des Wurzelbruchs.',
    completeText: 'Die Triebe wachsen wieder. Ich habe heute Morgen mit dem Ankerbaum gesprochen. Er sagt danke. Na gut, er hat geraschelt. Aber es klang nach danke.',
    objectives: [{ id: 'vines', text: 'Rankenschrecken zurückgeschnitten', count: 14, kind: 'kill', target: 'vine_horror', zone: 'drifting_gardens' }],
    rewards: { xp: Q(42, W.side), gold: G(42), gear: [gear(43, 'hands')] },
  },
  q_bren_cutting: {
    title: 'Ein Ableger für den Bruch', giver: 'gardener_bren', level: 43, requires: ['q_bren_vines', 'q_root_break'], needs: 'escort',
    summary: 'Begleite Bren mit einem Ableger des Ankerbaums in den Wurzelbruch.',
    offer: 'Die Risse sind versiegelt, aber der Boden dort ist tot. Ich will einen Ableger des Ankerbaums in den Bruch pflanzen, damit die Wurzeln wieder zusammenwachsen. Allein komme ich da nicht durch. Bring mich hin, ich trage den Ableger. Sprich mich an, wenn du bereit bist.',
    progressText: 'Bren wartet in Morgentau. Bleib nah bei ihm.',
    completeText: 'Er steht. Ein kleiner Baum am Rand der Leere, und er steht. In hundert Jahren wird hier ein Hain sein. Ich hoffe, ich erlebe den ersten Sommer.',
    objectives: [{ id: 'escort', text: 'Bren in den Wurzelbruch gebracht', count: 1, kind: 'escort', target: 'escort_bren_cutting', start: { kind: 'npc', id: 'gardener_bren' }, zone: 'drifting_gardens', failText: 'Bren ist gestürzt. Er wartet in Morgentau mit einem neuen Ableger.' }],
    rewards: { xp: Q(43, W.side), gold: G(43, 1.2), gear: [gear(44, 'chest')] },
  },
  q_isell_void_ash: {
    title: 'Leerenstaub', giver: 'herbalist_isell', level: 42, requires: ['q_roots_tremble'],
    summary: 'Sammle den Staub der Leerenirrlichter für Isells Salbe.',
    offer: 'Das Lichtmoos heilt fast alles. Nur nicht die Kälte, die die Leere hinterlässt. Dafür brauche ich das, was die Leere selbst zurücklässt: den Staub der Irrlichter, wenn sie verlöschen. Er brennt kalt in der Hand, also trag Handschuhe. Sechs Prisen.',
    progressText: 'Die Leerenirrlichter schweben über dem Wurzelbruch.',
    completeText: 'Brr. Er brennt sogar durch das Glas. Gut. Aus Gift macht man Gegengift, sagte meine Lehrmeisterin. Die Gärtner, die die Kälte in den Knochen haben, werden diesen Winter nicht frieren.',
    objectives: [{ id: 'ash', text: 'Leerenstaub gesammelt', count: 6, kind: 'collect', target: 'void_ash', from: ['void_wisp'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(42, W.side), gold: G(42), items: [{ itemId: 'starlight_potion', qty: 3 }, { itemId: 'starlight_mana', qty: 2 }] },
  },
  q_isell_seed_chamber: {
    title: 'Aurels Samenkammer', giver: 'herbalist_isell', level: 44, requires: ['q_isell_void_ash', 'q_hanging_terraces'],
    summary: 'Finde die verborgene Samenkammer in der Rankengruft.',
    offer: 'Die Gärtner erzählen sich, dass Aurel in der Gruft eine Kammer bauen ließ, in der er von jeder Pflanze dieser Welt einen Samen aufbewahrte. Hinter einer Wand, die sich nur öffnet, wenn man weiß, wo man ziehen muss. Wenn du in der Gruft bist, halt die Augen offen. Ein schwacher Schimmer an der Wand, sagt man.',
    progressText: 'Die Samenkammer liegt verborgen hinter einer Wand in der Rankengruft. Such nach einem Hebel.',
    completeText: 'Du hast sie gefunden? Wirklich? Und die Samen sind noch da? Dann ist nichts verloren, was Aurel gepflanzt hat. Gar nichts. Ich muss mich setzen.',
    objectives: [{ id: 'chamber', text: 'Samenkammer gefunden', count: 1, kind: 'reach', target: ['seed_chamber'], zone: 'rankengruft' }],
    rewards: { xp: Q(44, W.dungeonSide), gold: G(44, 1.2), gear: [gear(45, 'head', 'rare')] },
  },
  q_grave_seeds: {
    title: 'Samen der Gruft', giver: 'gardener_bren', level: 44, requires: ['q_bren_vines', 'q_hanging_terraces'],
    summary: 'Nimm den Dornenpriesterinnen in der Rankengruft die Dornsamen ab.',
    offer: 'In der Gruft beten Dornenpriesterinnen zu Ysgarn. Sie tragen Dornsamen bei sich und säen sie überall, wo die Leere schon war. Daraus wachsen die Ranken mit Zähnen. Nimm ihnen vier Samen ab, damit ich weiß, wie man die Brut wieder ausreißt.',
    progressText: 'Die Dornenpriesterinnen halten sich in der Rankengruft auf.',
    completeText: 'Sie sind schwarz innen. Ganz schwarz. Ich werde sie verbrennen, alle bis auf einen. Den untersuche ich. Vorsichtig.',
    objectives: [{ id: 'seeds', text: 'Dornsamen erbeutet', count: 4, kind: 'collect', target: 'grave_seed', from: ['thorn_priest'], zone: 'rankengruft' }],
    rewards: { xp: Q(44, W.dungeonSide), gold: G(44, 1.2), gear: [gear(45, 'hands', 'rare')] },
  },
  q_odda_crystals: {
    title: 'Mondkristalle', giver: 'hermit_odda', level: 45, requires: ['q_moon_pond'],
    summary: 'Sammle die Mondkristalle ein, die an den Ufern des Mondweihers wachsen.',
    offer: 'Im Weiher spiegelt sich ein Himmel, den es nicht mehr gibt. Und dort, wo das Spiegelbild das Ufer berührt, wachsen Kristalle. Ich brauche vier davon, um den Weiher klar zu halten. Ich würde sie selbst holen, aber meine Knie und ich reden seit Jahren nicht mehr miteinander.',
    progressText: 'Die Mondkristalle wachsen an den Ufern und auf den Nebeninseln des Mondweihers.',
    completeText: 'Schön kalt. Danke. Jetzt bleibt der Weiher noch ein paar Jahre klar. Länger als ich, vermutlich.',
    objectives: [{ id: 'crystals', text: 'Mondkristalle gesammelt', count: 4, kind: 'interact', target: ['moon_crystal_1', 'moon_crystal_2', 'moon_crystal_3', 'moon_crystal_4'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(45, W.side), gold: G(45), gear: [gear(45, 'amulet')] },
  },

  // ================================================================ Splitterweiten: Nebenquests
  q_kel_claim: {
    title: 'Kels Claim', giver: 'prospector_kel', level: 45, requires: ['q_splinter_reaches'],
    summary: 'Befreie Kels Claim im Scherbenfeld von den Splitterkrabblern.',
    offer: 'Mein Claim liegt draußen im Scherbenfeld. Gute Splitter, die besten weit und breit. Nur sitzen jetzt die Krabbler drauf, ganze Nester. Die fressen Kristall und sind schneller, als sie aussehen. Sechzehn weniger, und ich kann wieder graben.',
    progressText: 'Die Splitterkrabbler nisten auf den Scherben nördlich von Funkenruh.',
    completeText: 'Mein Claim! Frei! Ich teile mit dir, was ich finde. Na ja, einen Teil. Einen kleinen Teil. Hier, für den Anfang.',
    objectives: [{ id: 'crawlers', text: 'Splitterkrabbler vertrieben', count: 16, kind: 'kill', target: 'shard_crawler', zone: 'splitterweiten' }],
    rewards: { xp: Q(45, W.side), gold: G(45, 1.2), gear: [gear(46, 'feet')] },
  },
  q_kel_packs: {
    title: 'Verlorene Ausrüstung', giver: 'prospector_kel', level: 46, requires: ['q_kel_claim'],
    summary: 'Bring Kel die Schürferbeutel zurück, die im Scherbenfeld liegen geblieben sind.',
    offer: 'Als die Krabbler kamen, haben meine Leute alles stehen lassen. Vier Beutel mit Werkzeug liegen noch draußen auf den Scherben. Ohne Hacken und Seile kann ich meinen schönen freien Claim nicht nutzen. Holst du sie?',
    progressText: 'Die Schürferbeutel liegen auf den Scherbeninseln im Scherbenfeld verstreut.',
    completeText: 'Hacken, Seile, Laternen, und mein Glücksstein! Den hatte ich schon abgeschrieben. Danke. Heute grabe ich bis zum Dunkelwerden.',
    objectives: [{ id: 'packs', text: 'Schürferbeutel geborgen', count: 4, kind: 'interact', target: ['prospector_pack_1', 'prospector_pack_2', 'prospector_pack_3', 'prospector_pack_4'], zone: 'splitterweiten' }],
    rewards: { xp: Q(46, W.side), gold: G(46, 1.2), items: [{ itemId: 'starlight_potion', qty: 3 }] },
  },
  q_harrik_shard: {
    title: 'Der flüsternde Splitter', giver: 'prospector_kel', level: 46, requires: ['q_splinter_madness'],
    summary: 'Hol Harriks Splitter von den wahnsinnigen Schürfern zurück und entscheide, was damit geschieht.',
    offer: 'Mein Partner Harrik hat einen Splitter gefunden, so groß wie eine Faust. Er hat ihn Tag und Nacht gehalten und mit ihm geredet. Dann ist er ins Scherbenfeld gelaufen und nicht zurückgekommen. Jetzt trägt einer der Irren seinen Splitter. Hol ihn zurück. Ich will ihn nicht haben. Aber ich will auch nicht, dass ihn noch jemand findet.',
    progressText: 'Einer der wahnsinnigen Schürfer im Scherbenfeld trägt Harriks Splitter.',
    completeText: 'Das ist er. Hörst du ihn? Er flüstert sogar jetzt. Dagna will solche Splitter im Kranofen schmelzen. Bosk zahlt ein Vermögen dafür, frag mich nicht, an wen er sie weiterverkauft. Ich kann das nicht entscheiden. Du hast ihn geholt. Entscheide du.',
    objectives: [{ id: 'shard', text: 'Harriks Splitter', count: 1, kind: 'collect', target: 'harrik_shard', from: ['mad_prospector'], zone: 'splitterweiten' }],
    rewards: { xp: Q(46, W.choice), gold: G(46, 0.5) },
    choices: [
      { id: 'melt', label: 'Im Kranofen einschmelzen', hint: 'Der Splitter verstummt für immer. Dagna gibt dir Tränke aus ihrem Vorrat.', rewards: { items: [{ itemId: 'ember_elixir', qty: 2 }, { itemId: 'starlight_potion', qty: 4 }] } },
      { id: 'sell', label: 'An Bosk verkaufen', hint: 'Bosk zahlt sehr gut. Wohin der Splitter geht, sagt er nicht.', rewards: { gold: G(46, 2.5) } },
    ],
  },
  q_mira_survey: {
    title: 'Vermessungspunkte', giver: 'cartographer_mira', level: 46, requires: ['q_splinter_reaches'],
    summary: 'Besuche die drei Vermessungspunkte im Scherbenfeld, damit Mira ihre Karte neu zeichnen kann.',
    offer: 'Jede Woche zeichne ich die Weiten neu, weil die Scherben treiben. Dafür habe ich drei Punkte, von denen aus ich messe: die Westscherbe, den Gläsernen Bogen und die Ostklippe. Seit die Krabbler da sind, war keiner mehr dort. Geh hin, schau dir an, wo sie heute liegen, und erzähl es mir.',
    progressText: 'Westscherbe, Gläserner Bogen und Ostklippe liegen im Scherbenfeld.',
    completeText: 'Die Ostklippe ist zwei Steinwürfe nach Süden getrieben? Das erklärt, warum Bosk sich letzte Woche verlaufen hat. Danke. Hier, eine Abschrift für dich. Sie stimmt bis nächste Woche.',
    objectives: [{ id: 'points', text: 'Vermessungspunkte besucht', count: 3, kind: 'reach', target: ['survey_west', 'survey_arch', 'survey_east'], zone: 'splitterweiten' }],
    rewards: { xp: Q(46, W.side), gold: G(46), gear: [gear(46, 'head')] },
  },
  q_dagna_starglass: {
    title: 'Sternglas für den Kran', giver: 'foreman_dagna', level: 47, requires: ['q_same_fire'],
    summary: 'Brich Sternglas aus den Glaswächtern auf den Singenden Graten.',
    offer: 'Der Förderkran hält nicht mehr lange. Die Lager sind aus Sternglas, und Sternglas gibt es nur noch in den Glaswächtern auf den Graten. Die Dinger marschieren dort auf und ab und lassen sich das Glas natürlich nicht freiwillig abnehmen. Bring mir fünf Stücke.',
    progressText: 'Die Glaswächter patrouillieren auf den Singenden Graten.',
    completeText: 'Gutes, klares Glas. Der Kran läuft wieder rund, und meine Leute müssen die Loren nicht mehr von Hand hochziehen. Du hast gerade dreißig Rücken gerettet.',
    objectives: [{ id: 'glass', text: 'Sternglas gebrochen', count: 5, kind: 'collect', target: 'sentinel_glass', from: ['glass_sentinel'], zone: 'splitterweiten' }],
    rewards: { xp: Q(47, W.side), gold: G(47, 1.2), gear: [gear(48, 'chest')] },
  },
  q_kel_vault: {
    title: 'Kaldris\' Schatzkammer', giver: 'prospector_kel', level: 47, requires: ['q_kel_claim', 'q_ridge_song'],
    summary: 'Finde die verborgene Splitterkammer in den Gläsernen Hallen.',
    offer: 'Kaldris sammelt nicht nur Statuen. Er sammelt Splitter, die größten und reinsten. Die Alten sagen, er hortet sie in einer Kammer hinter einer gläsernen Wand. Wenn du schon in seine Hallen gehst, such sie. Ich will nichts davon haben. Ich will nur wissen, ob es stimmt.',
    progressText: 'Die Splitterkammer liegt verborgen in den Gläsernen Hallen. Such nach einem Hebel.',
    completeText: 'Es stimmt also. Ein ganzer Raum voller Sternsplitter, und keiner hat ihn je gesehen. Und du hast nichts eingesteckt? Wirklich nicht? Du bist ein seltsamer Mensch. Ein guter, aber seltsam.',
    objectives: [{ id: 'vault', text: 'Splitterkammer gefunden', count: 1, kind: 'reach', target: ['shard_vault'], zone: 'glass_halls' }],
    rewards: { xp: Q(47, W.dungeonSide), gold: G(47, 1.2), gear: [gear(48, 'hands', 'rare')] },
  },
  q_ilse_mirror_shards: {
    title: 'Was der See behält', giver: 'mirror_keeper_ilse', level: 48, requires: ['q_mirror_lake'],
    summary: 'Nimm den gläsernen Gefangenen am Spiegelsee die Spiegelscherben ab.',
    offer: 'Manche von Kaldris\' Gefangenen sind ihm entkommen und bis an meinen See gelaufen. Sie wollten sich im Wasser sehen, so wie sie einmal waren. In ihnen stecken Spiegelscherben mit ihren alten Gesichtern. Bring mir fünf, dann zeige ich ihnen die Gesichter ein letztes Mal, bevor sie gehen.',
    progressText: 'Die gläsernen Gefangenen wandern am Ufer des Spiegelsees.',
    completeText: 'Ein Schürfer mit krummer Nase. Eine Sternwächterin mit Zöpfen. Ein Junge, kaum älter als fünfzehn. Ich habe sie alle gesehen. Jetzt sind sie frei.',
    objectives: [{ id: 'shards', text: 'Spiegelscherben geborgen', count: 5, kind: 'collect', target: 'mirror_shard', from: ['statue_wraith'], zone: 'splitterweiten' }],
    rewards: { xp: Q(48, W.side), gold: G(48), gear: [gear(49, 'ring')] },
  },
  q_shadow_scouts: {
    title: 'Späherinnen am Ufer', giver: 'mirror_keeper_ilse', level: 49, requires: ['q_lake_reflections'],
    summary: 'Vertreibe die Schattenelfen-Späherinnen, die den Spiegelsee beobachten.',
    offer: 'Seit ich den Splitter gelesen habe, stehen Schattenelfen am Ufer. Sie sagen nichts, sie schießen nicht, sie schauen nur. Ysmeine weiß jetzt, dass jemand nach ihr sucht. Vertreib ihre Späherinnen, zwölf sollten reichen, sonst wartet sie in der Sternwarte schon auf dich.',
    progressText: 'Die Schattenelfen-Späherinnen lauern zwischen den Spiegelsteinen am Ufer.',
    completeText: 'Die Ufer sind leer. Wenn Ysmeine jetzt in ihren Spiegel schaut, sieht sie nur Wasser. Hoffentlich.',
    objectives: [{ id: 'scouts', text: 'Späherinnen vertrieben', count: 12, kind: 'kill', target: 'shadow_ranger', zone: 'splitterweiten' }],
    rewards: { xp: Q(49, W.side), gold: G(49), gear: [gear(50, 'feet')] },
  },
  q_tovan_lenses: {
    title: 'Die Linsen der Sternwarte', giver: 'astronomer_tovan', level: 49, requires: ['q_observatory_hill'],
    summary: 'Richte die drei Linsen am Sternwartenberg in der richtigen Reihenfolge aus.',
    offer: 'Aurel ließ drei Linsen rund um die Sternwarte aufstellen. Richtig ausgerichtet bündeln sie das Sternlicht und zeigen, was oben in der Kuppel geschieht. Die Reihenfolge steht auf dem Sockel: zuerst die westliche, dann die östliche, zuletzt die südliche. Falsch herum, und sie blenden dich nur.',
    progressText: 'Westliche, östliche, südliche Linse. Alle drei stehen am Fuß der Sternwarte.',
    completeText: 'Schau durch. Siehst du sie? Ganz oben in der Kuppel, eine Gestalt, die sich nicht bewegt. Ysmeine. Sie schaut nach Osten, wie jede Nacht seit tausend Jahren.',
    objectives: [{ id: 'lenses', text: 'Linsen ausgerichtet (West, Ost, Süd)', count: 3, kind: 'sequence', target: ['star_lens_1', 'star_lens_2', 'star_lens_3'], zone: 'splitterweiten', failText: 'Die Linsen blenden. Von vorn: zuerst West, dann Ost, zuletzt Süd.' }],
    rewards: { xp: Q(49, W.side), gold: G(49), gear: [gear(50, 'hands')] },
  },
  q_splinter_colossi: {
    title: 'Die Splitterkolosse', giver: 'astronomer_tovan', level: 49, requires: ['q_observatory_hill'],
    summary: 'Bring vier Splitterkolosse am Sternwartenberg zu Fall.',
    offer: 'Die Kolosse am Berg sind aus Splittern gewachsen, so wie Kaldris. Sie stehen um die Sternwarte wie Wachen um einen Thron. Solange sie stehen, kommt kein Schürfer und kein Gelehrter mehr den Berg hinauf. Bring vier von ihnen zu Fall. Allein ist das kein Spaß.',
    progressText: 'Die Splitterkolosse stapfen über die Hänge des Sternwartenbergs.',
    completeText: 'Drei Kolosse. Ich habe vom Fenster aus zugesehen und die ganze Zeit die Luft angehalten. Hier, das hatte ich für einen besonderen Tag aufgehoben.',
    objectives: [{ id: 'colossi', text: 'Splitterkolosse gefällt', count: 4, kind: 'kill', target: 'splinter_colossus', zone: 'splitterweiten' }],
    rewards: { xp: Q(49, W.elite), gold: G(49, 1.5), gear: [gear(50, 'chest', 'rare')] },
  },
  q_star_archive: {
    title: 'Aurels Archiv', giver: 'astronomer_tovan', level: 50, requires: ['q_star_seers'],
    summary: 'Finde das verborgene Sternenarchiv in der Sternwarte.',
    offer: 'Aurel schrieb alles auf, was er über den Stern herausfand. Seine Aufzeichnungen liegen in einem Archiv hinter der Bibliothek der Sternwarte. Ysmeine hat es versiegelt, damit niemand außer ihr es liest. Wenn du drinnen bist, such es. Eine Wand, die sich bewegen lässt.',
    progressText: 'Das Sternenarchiv liegt verborgen in der Sternwarte. Such nach einem Hebel.',
    completeText: 'Aurels Archiv. Unberührt. Wenn er wusste, wie man den Stern aufhält, dann steht es dort drin. Ich werde Jahre brauchen, es zu lesen. Wir haben keine Jahre. Ich fange heute Nacht an.',
    objectives: [{ id: 'archive', text: 'Sternenarchiv gefunden', count: 1, kind: 'reach', target: ['star_archive'], zone: 'observatory' }],
    rewards: { xp: Q(50, W.dungeonSide), gold: G(50, 1.2), gear: [gear(50, 'amulet', 'rare')] },
  },

  // ================================================================ Kopfgelder und Jagdaufträge (wiederholbar)
  q_bounty_gardens: {
    title: 'Kopfgeld: Treibende Gärten', giver: 'trader_pell', repeatable: true, level: 43, requires: ['q_roots_tremble'],
    summary: 'Pell zahlt für jedes Ungeheuer weniger in den Gärten.',
    offer: 'Jedes Biest, das nicht mehr durch meine Beete trampelt, ist bares Gold wert. Zwanzig, egal welche, und wir teilen. Komm wieder, wann du willst. Die Gärten wachsen nach, die Biester leider auch.',
    progressText: 'Zwanzig Ungeheuer in den Treibenden Gärten.',
    completeText: 'Die Beete danken es dir. Ich auch. Hier, dein Anteil.',
    objectives: [{ id: 'kills', text: 'Ungeheuer in den Gärten besiegt', count: 20, kind: 'kill', target: ['bloom_stalker', 'void_wisp', 'rootbound', 'vine_horror', 'garden_golem', 'star_moth'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(43, W.bounty), gold: G(43, 0.8), items: [{ itemId: 'starlight_potion', qty: 2 }] },
  },
  q_hunt_gardens: {
    title: 'Blüten und Falter', giver: 'herbalist_isell', repeatable: true, level: 44, requires: ['q_isell_void_ash'],
    summary: 'Isell braucht ständig Zutaten von Pirschern und Faltern.',
    offer: 'Pirscherfell für Verbände, Falterflügel für Tinkturen. Zwölf, egal von welchen, und ich zahle in Gold und Glas. Jederzeit wieder.',
    progressText: 'Blütenpirscher und Sternfalter in den Treibenden Gärten.',
    completeText: 'Frisch und leuchtend. Genau so brauche ich sie.',
    objectives: [{ id: 'hunt', text: 'Pirscher und Falter erlegt', count: 12, kind: 'kill', target: ['bloom_stalker', 'star_moth'], zone: 'drifting_gardens' }],
    rewards: { xp: Q(44, W.hunt), gold: G(44, 0.6), items: [{ itemId: 'starlight_potion', qty: 1 }] },
  },
  q_bounty_splitter: {
    title: 'Kopfgeld: Splitterweiten', giver: 'trader_bosk', repeatable: true, level: 47, requires: ['q_splinter_reaches'],
    summary: 'Bosk zahlt für jeden Feind weniger in den Splitterweiten.',
    offer: 'Tote Schürfer kaufen keine Seile. Zwanzig Feinde weniger in den Weiten, und ich zahle dir einen Anteil von dem, was die Lebenden bei mir lassen. So oft du willst.',
    progressText: 'Zwanzig Feinde in den Splitterweiten.',
    completeText: 'Mehr Schürfer, mehr Kundschaft. Hier, das ist ehrlich verdient.',
    objectives: [{ id: 'kills', text: 'Feinde in den Weiten besiegt', count: 20, kind: 'kill', target: ['shard_crawler', 'mad_prospector', 'glass_sentinel', 'prism_elemental', 'void_hound', 'statue_wraith', 'shadow_ranger', 'star_seer'], zone: 'splitterweiten' }],
    rewards: { xp: Q(47, W.bounty), gold: G(47, 0.8), items: [{ itemId: 'starlight_potion', qty: 2 }] },
  },
  q_hunt_splitter: {
    title: 'Scherben und Glas', giver: 'prospector_kel', repeatable: true, level: 48, requires: ['q_kel_claim'],
    summary: 'Kel hält seinen Claim frei. Hilf ihm dabei.',
    offer: 'Die Krabbler kommen immer wieder, und die Glaswächter marschieren jede Woche ein Stück näher an meinen Claim. Zwölf von ihnen, und ich zahle in Splittern. Na gut, in Gold.',
    progressText: 'Splitterkrabbler und Glaswächter in den Splitterweiten.',
    completeText: 'Der Claim ist frei. Für heute.',
    objectives: [{ id: 'hunt', text: 'Krabbler und Wächter besiegt', count: 12, kind: 'kill', target: ['shard_crawler', 'glass_sentinel'], zone: 'splitterweiten' }],
    rewards: { xp: Q(48, W.hunt), gold: G(48, 0.6), items: [{ itemId: 'starlight_potion', qty: 1 }] },
  },
};

// Questgegenstände (type 'quest': zählen nicht im Fortschrittsbuch, verschwinden bei der Abgabe)
export const QUEST_ITEMS_STARS = {
  gardener_token: { name: 'Gärtnermarke', type: 'quest', rarity: 'common', icon: 'seal', stack: 10, value: 0, desc: 'Eine kleine Holzmarke mit einem eingeritzten Namen. Die Wurzeln haben sie nicht losgelassen.' },
  light_seed: { name: 'Schlafender Lichtsamen', type: 'quest', rarity: 'epic', icon: 'gem_sapphire', stack: 1, value: 0, desc: 'Aus Ysgarns Herz gefallen. Er ist warm und leuchtet ganz schwach, wie im Schlaf.' },
  awakened_seed: { name: 'Erwachter Lichtsamen', type: 'quest', rarity: 'legendary', icon: 'gem_sapphire', stack: 1, value: 0, desc: 'Am Mondaltar geweckt. Er leuchtet so hell, dass man nicht lange hinsehen kann.' },
  raw_starshard: { name: 'Gehorteter Sternsplitter', type: 'quest', rarity: 'common', icon: 'gem_amethyst', stack: 10, value: 0, desc: 'Warm in der Hand. Wenn man ihn ans Ohr hält, summt er.' },
  humming_shards: { name: 'Summende Splitter', type: 'quest', rarity: 'uncommon', icon: 'gem_amethyst', stack: 1, value: 0, desc: 'Dagnas Splitter in einem Tuch. Sie summen alle denselben Ton.' },
  kaldris_splinter: { name: 'Kaldris\' Herzsplitter', type: 'quest', rarity: 'epic', icon: 'gem_amethyst', stack: 1, value: 0, desc: 'Er flüstert. Eine ruhige, höfliche Stimme ohne jede Wut.' },
  star_chart: { name: 'Himmelskarte', type: 'quest', rarity: 'uncommon', icon: 'map', stack: 10, value: 0, desc: 'Eine Karte des Himmels in der Schrift der Schattenelfen. Im Osten ein großer Stern mit einem Namen darum.' },
  tobin_letter: { name: 'Tobins Brief', type: 'quest', rarity: 'uncommon', icon: 'letter', stack: 1, value: 0, desc: 'Versiegelt, abgegriffen und an Maren in der Glutsenke adressiert.' },
  maren_letter: { name: 'Marens Antwort', type: 'quest', rarity: 'uncommon', icon: 'letter', stack: 1, value: 0, desc: 'Ein kurzer Brief in Marens Schrift. Er riecht nach Lampenöl.' },
  bloom_haunch: { name: 'Pirscherkeule', type: 'quest', rarity: 'common', icon: 'food_meat', stack: 10, value: 0, desc: 'Riecht nach Honig und Gewitter. Mirela braucht sie für die Sternsuppe.' },
  golem_core: { name: 'Perlsteinkern', type: 'quest', rarity: 'uncommon', icon: 'gem_sapphire', stack: 10, value: 0, desc: 'Das Herz eines Gartenwächters. Er glüht wie ein kleiner Mond.' },
  moth_dust: { name: 'Falterstaub', type: 'quest', rarity: 'common', icon: 'dust', stack: 10, value: 0, desc: 'Leuchtendes Pulver von den Flügeln der Sternfalter.' },
  prism_heart: { name: 'Prismenherz', type: 'quest', rarity: 'uncommon', icon: 'gem_sapphire', stack: 10, value: 0, desc: 'Es klingt wie eine ganze Melodie, wenn man es dreht.' },
  void_ash: { name: 'Leerenstaub', type: 'quest', rarity: 'common', icon: 'essence_shadow', stack: 10, value: 0, desc: 'Er brennt kalt in der Hand. Isell braucht ihn für ihre Salbe.' },
  grave_seed: { name: 'Dornsamen', type: 'quest', rarity: 'uncommon', icon: 'essence_shadow', stack: 10, value: 0, desc: 'Schwarz bis ins Innerste. Daraus wachsen Ranken mit Zähnen.' },
  harrik_shard: { name: 'Harriks Splitter', type: 'quest', rarity: 'rare', icon: 'gem_amethyst', stack: 1, value: 0, desc: 'So groß wie eine Faust. Er flüstert, auch wenn niemand zuhört.' },
  sentinel_glass: { name: 'Sternglas', type: 'quest', rarity: 'uncommon', icon: 'gem_sapphire', stack: 10, value: 0, desc: 'Klares Glas aus der Brust eines Glaswächters.' },
  mirror_shard: { name: 'Spiegelscherbe', type: 'quest', rarity: 'common', icon: 'gem_sapphire', stack: 10, value: 0, desc: 'In der Scherbe ist ein Gesicht zu sehen, das nicht deines ist.' },
};

// Questgegenstände, die nur während der Quest fallen: { Gegnertyp: [[questId, itemId, Chance]] }
// Dungeons haben keinen Respawn: Chancen dort so, dass ein Lauf reicht (Rankengruft 4+ Priesterinnen, Bosse immer).
export const QUEST_DROPS_STARS = {
  rootbound: [['q_gardener_tokens', 'gardener_token', 0.75]],
  bloom_stalker: [['q_star_soup', 'bloom_haunch', 0.6]],
  garden_golem: [['q_brunna_pearlstone', 'golem_core', 0.6]],
  star_moth: [['q_corvin_moths', 'moth_dust', 0.6]],
  void_wisp: [['q_isell_void_ash', 'void_ash', 0.6]],
  thorn_priest: [['q_grave_seeds', 'grave_seed', 0.9]],
  ysgarn: [['q_ysgarn', 'light_seed', 1]],
  mad_prospector: [['q_splinter_madness', 'raw_starshard', 0.8], ['q_harrik_shard', 'harrik_shard', 0.35]],
  shard_crawler: [['q_splinter_madness', 'raw_starshard', 0.25]],
  prism_elemental: [['q_ysolde_prisms', 'prism_heart', 0.55]],
  glass_sentinel: [['q_dagna_starglass', 'sentinel_glass', 0.55]],
  kaldris: [['q_kaldris', 'kaldris_splinter', 1]],
  statue_wraith: [['q_ilse_mirror_shards', 'mirror_shard', 0.55]],
  star_seer: [['q_star_seers', 'star_chart', 0.6]],
};

// Gesprächszeilen (npcIdleLine: es gilt die letzte Zeile, deren Quest abgeschlossen ist). Bestehende Einträge
// (Glutland-NPCs, Händler der Architektur) bekommen die Zeilen angehängt, statt ersetzt zu werden.
export const NPC_LINES_STARS = {
  // --- Glutland
  seer_ysolde: { lines: [['q_star_in_crown', 'Der Stern in der Krone ist still, seit du durch den Riss gegangen bist. Still heißt nicht schlafend.']] },
  commander_hale: { lines: [['q_last_errand', 'Pass auf dich auf da drüben. Ich habe keine Lust, noch eine Heimkehr ohne dich zu feiern.']] },
  marshal_corvane: { lines: [['q_through_the_rift', 'Meine Ritter wechseln sich am Riss ab. Jeder will der Erste sein, der dich zurückkommen sieht.']] },
  elder_maren: { lines: [['q_letter_for_maren', 'Er lebt. Ich sage es jeden Morgen laut, damit ich es glaube.'], ['q_marens_answer', 'Die Laterne brennt. Und jetzt weiß ich, für wen.']] },
  // --- Sternhafen
  lady_amarys: {
    name: 'Fürstin Amarys', idle: 'Ihr kommt aus der Glut und steht doch aufrecht. Das ist selten geworden.',
    lines: [
      [null, 'Ihr kommt aus der Glut und steht doch aufrecht. Das ist selten geworden.'],
      ['q_three_kings', 'Aurel hat diese Stadt aus Trümmern gebaut. Ich halte sie mit zu wenig Leuten zusammen. Jeder Tag ist ein Geschenk.'],
      ['q_seed_to_anchor', 'Seht Ihr den Ankerstein? Die Kinder spielen wieder auf dem Platz. Das habe ich seit Jahren nicht gesehen.'],
      ['q_bridge_east', 'Die Brücke nach Osten leuchtet jede Nacht ein wenig heller. Wenn sie trägt, gehen wir. Zusammen.'],
    ],
  },
  seer_seraphe: {
    name: 'Seraphe', idle: 'Die Sterne über uns sind jünger als die unter uns. Das beunruhigt mich.',
    lines: [
      [null, 'Die Sterne über uns sind jünger als die unter uns. Das beunruhigt mich.'],
      ['q_three_kings', 'Gestern Nacht habe ich zweitausendvierhundertneun Sterne gezählt. Vor zehn Jahren waren es dreitausend.'],
      ['q_seed_to_anchor', 'Seit der Samen im Ankerstein leuchtet, zähle ich jede Nacht dieselbe Zahl. Keiner fehlt mehr. Fürs Erste.'],
      ['q_ysmeine', 'Azhuron. Ich habe den Namen auf Ysmeines Karten gesucht und ihn in meinen eigenen gefunden. Er stand dort die ganze Zeit.'],
    ],
  },
  captain_halvard: {
    name: 'Hauptmann Halvard', idle: 'Noch einer durchs Tor? Willkommen in Sternhafen. Bleib auf den Brücken.',
    lines: [
      [null, 'Noch einer durchs Tor? Willkommen in Sternhafen. Bleib auf den Brücken.'],
      ['q_star_audience', 'Die Fürstin hat dich empfangen? Dann gehörst du jetzt zu uns, ob du willst oder nicht.'],
      ['q_kaldris', 'Meine Leute erzählen, du hättest die Gläsernen Hallen geleert. Einige der Statuen waren Sternwachen. Danke.'],
    ],
  },
  herald_fenn: {
    name: 'Fenn, der Ausrufer', idle: 'Hört, hört! Neues aus den Gärten und den Splitterweiten!',
    lines: [
      [null, 'Hört, hört! Neues aus den Gärten und den Splitterweiten!'],
      ['q_herald_errands', 'Hört, hört! Der Bezwinger des Aschenfürsten ist unter uns! Das rufe ich jetzt jeden Morgen aus. Die Leute werden es nie leid.'],
      ['q_seed_to_anchor', 'Hört, hört! Der Ankerstein leuchtet! Die Inseln halten! Und nein, ich übertreibe diesmal nicht.'],
      ['q_ysmeine', 'Hört, hört! Die Sternwarte ist wieder dunkel, und diesmal ist das eine gute Nachricht!'],
    ],
  },
  innkeeper_mirela: {
    name: 'Mirela', idle: 'Setz dich. Wer hier oben ankommt, hat einen langen Weg hinter sich.',
    lines: [
      [null, 'Setz dich. Wer hier oben ankommt, hat einen langen Weg hinter sich.'],
      ['q_star_soup', 'Die Sternsuppe ist wieder auf der Karte. Und dein Krug ist immer voll, wenn du hier sitzt.'],
      ['q_marens_answer', 'Tobin hat heute zum ersten Mal seit zehn Jahren gesungen. Furchtbar schief. Alle haben mitgesungen.'],
    ],
  },
  scholar_tobin: {
    name: 'Tobin', idle: 'Die Glutsenke? Nein? Schade. Ich frage jeden.',
    lines: [
      [null, 'Die Glutsenke? Nein? Schade. Ich frage jeden, der durchs Tor kommt.'],
      ['q_stranded_scholar', 'Ich schreibe gerade den Brief. Den richtigen diesmal. Er wird kurz. Das Wichtige ist immer kurz.'],
      ['q_letter_for_maren', 'Sie hat ihn gelesen? Sie hat ihn wirklich gelesen? Ich kann nicht arbeiten, ich lese dieselbe Zeile seit einer Stunde.'],
      ['q_marens_answer', 'In Aurels Büchern steht viel über den Stern. Aber nichts darüber, wie man ihn aufhält. Noch nicht. Ich suche weiter.'],
    ],
  },
  smith_brunna: { name: 'Brunna', idle: 'Sternstahl ist störrisch. Wie ich. Darum verstehen wir uns.', lines: [['q_brunna_pearlstone', 'Der Perlstein brennt gut. Wenn du eine Klinge brauchst, weißt du, wo die Esse steht.']] },
  stablemaster_corvin: { name: 'Corvin', idle: 'Sternrösser laufen über Licht. Man muss ihnen nur das Fallen abgewöhnen.', lines: [['q_corvin_moths', 'Die Rochen kreisen wieder hoch über der Koppel. Einer folgt dir mit den Augen, wenn du vorbeigehst.']] },
  jeweler_ysolde: { name: 'Ysolde', idle: 'Sternglas schneidet man nicht. Man überredet es.', lines: [['q_ysolde_prisms', 'Singt dein Stein noch? Wenn er schweigt, bring ihn mir. Manchmal schmollen sie.']] },
  // --- Treibende Gärten
  warden_veyra: {
    name: 'Veyra', idle: 'Die Wurzeln halten noch. Aber sie zittern.',
    lines: [
      [null, 'Die Wurzeln halten noch. Aber sie zittern.'],
      ['q_gardener_tokens', 'Wir haben die Marken an den Ankerbaum gehängt. Wenn der Wind geht, klappern sie. Es klingt wie Lachen.'],
      ['q_ysgarn', 'Seit Ysgarn ruht, wachsen die Ranken langsamer. Ich glaube, er hat sie zurückgehalten, solange er konnte.'],
      ['q_seed_to_anchor', 'Ich habe das Licht vom Ankerstein bis hierher gesehen. Die Gärten atmen wieder.'],
    ],
  },
  gardener_bren: {
    name: 'Bren', idle: 'König Aurel hat jeden dieser Bäume selbst gepflanzt, sagt man.',
    lines: [
      [null, 'König Aurel hat jeden dieser Bäume selbst gepflanzt, sagt man.'],
      ['q_bren_cutting', 'Der Ableger im Bruch hat drei neue Blätter. Drei! Ich gehe jeden Morgen hin und zähle sie.'],
    ],
  },
  herbalist_isell: {
    name: 'Isell', idle: 'Das Lichtmoos heilt fast alles. Fast.',
    lines: [
      [null, 'Das Lichtmoos heilt fast alles. Fast.'],
      ['q_isell_void_ash', 'Die Salbe wirkt. Die alten Gärtner frieren nicht mehr, und einer hat mir sogar einen Kuchen gebacken.'],
      ['q_isell_seed_chamber', 'Aurels Samen sind sicher. Was auch immer kommt, diese Welt kann wieder wachsen.'],
    ],
  },
  hermit_odda: {
    name: 'Odda', idle: 'Im Weiher spiegelt sich ein Himmel, den es nicht mehr gibt.',
    lines: [
      [null, 'Im Weiher spiegelt sich ein Himmel, den es nicht mehr gibt.'],
      ['q_moon_altar', 'Der Altar leuchtet noch nach. Die Falter halten Abstand. Sie wissen, wer gewonnen hat.'],
    ],
  },
  trader_pell: { name: 'Pell', idle: 'Samen, Tränke, Verbände. Alles, was man hier oben braucht.', lines: [['q_pell_seed_bags', 'Die neue Saat ist im Boden. Komm im Frühling wieder, dann siehst du, wofür du gelaufen bist.']] },
  // --- Splitterweiten
  foreman_dagna: {
    name: 'Dagna', idle: 'Wer hier schürft, gräbt im Himmel. Pass auf, wohin du trittst.',
    lines: [
      [null, 'Wer hier schürft, gräbt im Himmel. Pass auf, wohin du trittst.'],
      ['q_splinter_madness', 'Ich lasse keinen mehr allein ins Scherbenfeld. Immer zu zweit, und keiner hält einen Splitter länger als eine Stunde.'],
      ['q_kaldris', 'Lun sagt, die Grate singen wieder richtig. Meine Leute schlafen besser. Ich auch.'],
    ],
  },
  prospector_kel: {
    name: 'Kel', idle: 'Die Scherben singen, wenn man sie anschlägt. Manche schreien.',
    lines: [
      [null, 'Die Scherben singen, wenn man sie anschlägt. Manche schreien.'],
      ['q_kel_claim', 'Mein Claim läuft. Heute drei Splitter, gestern vier. Die Krabbler kommen, aber ich bin schneller geworden.'],
      ['q_harrik_shard', 'Harriks Splitter ist fort. Ich schlafe besser, egal wohin er gegangen ist.'],
    ],
  },
  cartographer_mira: { name: 'Mira', idle: 'Jede Woche zeichne ich die Weiten neu. Sie bleiben nicht, wo sie sind.', lines: [['q_mira_survey', 'Deine Messungen stimmen. Die ganzen Weiten treiben langsam nach Osten. Wie alles hier.']] },
  echo_sage_lun: {
    name: 'Lun', idle: 'Hör hin. Die Grate erzählen, wie der Himmel zerbrach.',
    lines: [
      [null, 'Hör hin. Die Grate erzählen, wie der Himmel zerbrach.'],
      ['q_ridge_song', 'Der Grat singt wieder seinen eigenen Ton. Hell und ein bisschen traurig. So, wie er sein soll.'],
      ['q_kaldris', 'Die Hallen sind still. Ich habe nie gedacht, dass Stille so laut sein kann.'],
    ],
  },
  mirror_keeper_ilse: {
    name: 'Ilse', idle: 'Schau nicht zu lange in den See. Er schaut zurück.',
    lines: [
      [null, 'Schau nicht zu lange in den See. Er schaut zurück.'],
      ['q_lake_reflections', 'Seit ich den Splitter gelesen habe, träume ich von Sternen. Ich mag es nicht.'],
    ],
  },
  astronomer_tovan: {
    name: 'Tovan', idle: 'Die Sternwarte war Aurels Auge. Jetzt sieht dort etwas anderes hinaus.',
    lines: [
      [null, 'Die Sternwarte war Aurels Auge. Jetzt sieht dort etwas anderes hinaus.'],
      ['q_ysmeine', 'Die Kuppel ist dunkel. Ysmeine ruht. Ich gehe morgen hinauf und öffne die Fenster. Sie hätte es so gewollt, glaube ich.'],
    ],
  },
  trader_bosk: { name: 'Bosk', idle: 'Seile, Laternen, Tränke. Alles doppelt so teuer wie in Sternhafen. Und doppelt so nötig.', lines: [] },
};

