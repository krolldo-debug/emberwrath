// Zonen und NPCs der Sternenscherben (Erweiterung „Sternenglut“). Reine Daten: zones.js mischt sie ein
// (auch der Worker liest sie für die Zonenliste).
const SKY_AMBIENT = [232, 222, 242];

export const STAR_ZONES = {
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
  warden_veyra: { name: 'Veyra', title: 'Hüterin der Gärten', zoneId: 'drifting_gardens', greeting: 'Die Wurzeln halten noch. Aber sie zittern.' },
  trader_pell: { name: 'Pell', title: 'Händlerin', zoneId: 'drifting_gardens', greeting: 'Samen, Tränke, Verbände. Alles, was man hier oben braucht.' },
  gardener_bren: { name: 'Bren', title: 'Gärtner', zoneId: 'drifting_gardens', greeting: 'König Aurel hat jeden dieser Bäume selbst gepflanzt, sagt man.' },
  herbalist_isell: { name: 'Isell', title: 'Kräuterkundige', zoneId: 'drifting_gardens', greeting: 'Das Lichtmoos heilt fast alles. Fast.' },
  hermit_odda: { name: 'Odda', title: 'Eremitin am Mondweiher', zoneId: 'drifting_gardens', greeting: 'Im Weiher spiegelt sich ein Himmel, den es nicht mehr gibt.' },
};
