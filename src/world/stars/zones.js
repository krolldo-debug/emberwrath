// Zonen und NPCs der Sternenscherben (Erweiterung „Sternenglut“). Reine Daten: zones.js mischt sie ein
// (auch der Worker liest sie für die Zonenliste).
const SKY_AMBIENT = [232, 222, 242];

export const STAR_ZONES = {
  sternhafen: {
    name: 'Sternhafen',
    subtitle: 'Hauptstadt · Sternenscherben',
    kind: 'outdoor',
    level: 'sternhafen',
    instanced: false,
    maxPlayers: 40,
    mountable: true,
    recommendedLevel: '40–60',
    respawnSpawn: 'respawn',
    links: ['ember_wastes', 'drifting_gardens', 'splitterweiten'],
    enemies: [],
    ambient: SKY_AMBIENT,
  },
  drifting_gardens: {
    name: 'Die Treibenden Gärten',
    subtitle: 'Wildnis · Sternenscherben',
    kind: 'outdoor',
    level: 'drifting_gardens',
    instanced: false,
    maxPlayers: 40,
    mountable: true,
    recommendedLevel: '40–45',
    respawnSpawn: 'respawn',
    links: ['sternhafen', 'rankengruft', 'splitterweiten'],
    enemies: ['bloom_stalker', 'void_wisp', 'rootbound', 'vine_horror', 'garden_golem', 'star_moth', 'withered_warden'],
    ambient: SKY_AMBIENT,
  },
};

export const STAR_NPCS = {
  // Sternhafen
  lady_amarys: { name: 'Amarys', title: 'Fürstin von Sternhafen', zoneId: 'sternhafen', greeting: 'Ihr kommt aus der Glut und steht doch aufrecht. Das ist selten geworden.' },
  seer_seraphe: { name: 'Seraphe', title: 'Sternkundige', zoneId: 'sternhafen', greeting: 'Die Sterne über uns sind jünger als die unter uns. Das beunruhigt mich.' },
  captain_halvard: { name: 'Halvard', title: 'Hauptmann der Sternwacht', zoneId: 'sternhafen', greeting: 'Noch einer durchs Tor? Willkommen in Sternhafen. Bleib auf den Brücken.' },
  arena_master_sora: { name: 'Sora', title: 'Arenameisterin', zoneId: 'sternhafen', greeting: 'Auch hier oben misst man sich. Die Glutarena kennt keine Grenzen.' },
  smith_brunna: { name: 'Brunna', title: 'Schmiedin', zoneId: 'sternhafen', greeting: 'Sternstahl ist störrisch. Wie ich. Darum verstehen wir uns.' },
  stablemaster_corvin: { name: 'Corvin', title: 'Stallmeister', zoneId: 'sternhafen', greeting: 'Sternrösser laufen über Licht. Man muss ihnen nur das Fallen abgewöhnen.' },
  innkeeper_mirela: { name: 'Mirela', title: 'Wirtin vom Fallenden Stern', zoneId: 'sternhafen', greeting: 'Setz dich. Wer hier oben ankommt, hat einen langen Weg hinter sich.' },
  trader_lio: { name: 'Lio', title: 'Händler', zoneId: 'sternhafen', greeting: 'Tränke, Verbände, Reiseproviant. Und gute Laune gibt es umsonst.' },
  jeweler_ysolde: { name: 'Ysolde', title: 'Juwelierin', zoneId: 'sternhafen', greeting: 'Sternglas schneidet man nicht. Man überredet es.' },
  quartermaster_tamsin: { name: 'Tamsin', title: 'Rüstmeister', zoneId: 'sternhafen', greeting: 'Die Sternwacht rüstet jeden aus, der die Brücken verteidigt.' },
  herald_fenn: { name: 'Fenn', title: 'Ausrufer', zoneId: 'sternhafen', greeting: 'Hört, hört! Neues aus den Gärten und den Splitterweiten!' },
  // Treibende Gärten
  warden_veyra: { name: 'Veyra', title: 'Hüterin der Gärten', zoneId: 'drifting_gardens', greeting: 'Die Wurzeln halten noch. Aber sie zittern.' },
  trader_pell: { name: 'Pell', title: 'Händlerin', zoneId: 'drifting_gardens', greeting: 'Samen, Tränke, Verbände. Alles, was man hier oben braucht.' },
  gardener_bren: { name: 'Bren', title: 'Gärtner', zoneId: 'drifting_gardens', greeting: 'König Aurel hat jeden dieser Bäume selbst gepflanzt, sagt man.' },
  herbalist_isell: { name: 'Isell', title: 'Kräuterkundige', zoneId: 'drifting_gardens', greeting: 'Das Lichtmoos heilt fast alles. Fast.' },
  hermit_odda: { name: 'Odda', title: 'Eremitin am Mondweiher', zoneId: 'drifting_gardens', greeting: 'Im Weiher spiegelt sich ein Himmel, den es nicht mehr gibt.' },
};
