// Einstellungen der Dungeon-Gruppensuche (für den Betreiber, nicht für Spieler).
export const FINDER_CONFIG = {
  // Söldner dezent kennzeichnen: kleines Abzeichen am Namensschild und „Söldner“ in der Gruppenanzeige.
  // false = Söldner erscheinen ohne Kennzeichnung wie Mitspieler.
  labelMercs: true,
  mercLabel: 'Söldner',

  // Gegner in Gruppen-Dungeons halten mehr aus (drei statt einer Person teilen Schaden aus).
  hpScale: 1.8,
  bossHpScale: 2.3,

  // Gefallene Gruppenmitglieder stehen so viele Sekunden nach Kampfende wieder auf (mit 40 % Leben).
  reviveAfter: 3,
  reviveHp: 0.4,

  // Mehrere echte Spieler in einer Gruppe: erst mit geteilten Gegnern in der Instanz (Mehrspieler Stufe 2).
  // Muss zum Server passen (Worker-Variable FINDER_HUMAN_GROUPS).
  humanGroups: false,
};
