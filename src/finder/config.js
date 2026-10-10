// Einstellungen der Dungeon-Gruppensuche (für den Betreiber, nicht für Spieler).
export const FINDER_CONFIG = {
  // Söldner dezent kennzeichnen: kleines Abzeichen am Namensschild und „Söldner“ in der Gruppenanzeige.
  // false = Söldner erscheinen ohne Kennzeichnung wie Mitspieler.
  labelMercs: true,
  mercLabel: 'Söldner',

  // Gegner in Gruppen-Dungeons sind auf drei Personen ausgelegt: mehr Leben (drei teilen Schaden aus) und mehr
  // Schaden (der Verteidiger fängt ihn ab). Bosse je nach Kampf (Varkhul ruft Diener und ist für Stufe 5 sehr hart).
  hpScale: 1.8,
  dmgScale: 1.7,
  bossHpScale: 2.7,
  bossHpScaleById: { bonelord: 1.6 },
  bossDmgScaleById: { bonelord: 0.7, rot_mother: 1.2, frost_wyrm: 1.25 },

  // Gefallene Gruppenmitglieder stehen so viele Sekunden nach Kampfende wieder auf (mit 40 % Leben).
  reviveAfter: 3,
  reviveHp: 0.4,

  // Mehrere echte Spieler in einer Gruppe: erst mit geteilten Gegnern in der Instanz (Mehrspieler Stufe 2).
  // Muss zum Server passen (Worker-Variable FINDER_HUMAN_GROUPS).
  humanGroups: false,
};
