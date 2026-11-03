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
  // Durchlauf 03.11.: Mit den kostenlosen Söldnern waren die ersten Story-Bosse schwerer als allein – Varkhul (Stufe 6)
  // 12–15 Tode für Krieger und Magier ohne Ausweichen, Nerith (Stufe 10–11) 83.700 Leben und ein Schurke 13 Mal tot,
  // Ignaroth (Stufe 20) 4–7 Versuche, Ulgrim (Stufe 26, Hauptquest 25) 229.500 Leben, Magier auf 23 starb 51 Mal in
  // 50 Minuten. Jetzt: Varkhul so leicht wie allein, Nerith, Ignaroth und Ulgrim spürbar leichter.
  bossHpScaleById: { bonelord: 1.0, drowned_priestess: 1.5, ember_tyrant: 2.3, barrow_king: 1.9 },
  bossDmgScaleById: { bonelord: 0.35, drowned_priestess: 0.65, ember_tyrant: 0.85, barrow_king: 0.75, rot_mother: 1.2, frost_wyrm: 1.25 },

  // Allein (ohne Gruppe): keine Gruppenwerte, Boss mit eigenem Leben/Schaden und späterer Raserei.
  // Ziel: Varkhul fällt allein in etwa 4–6 Minuten, auch für einen Glutmagier auf Stufe 5–6.
  // Versunkener Tempel (01.11.): Viele hörten bei Nerith auf (Stufe 11, Hauptquest). Allein in etwa 5 Minuten zu schaffen.
  solo: {
    catacombs: { bossHp: 0.7, bossDmg: 0.1, furyStart: 420 },
    sunken_temple: { bossHp: 0.85, bossDmg: 0.3, furyStart: 420 },
  },

  // Gefallene Gruppenmitglieder stehen so viele Sekunden nach Kampfende wieder auf (mit 40 % Leben).
  reviveAfter: 3,
  reviveHp: 0.4,
  // Mitten im Kampf: Ein Söldner hilft dem gefallenen Helden nach `after` Sekunden wieder auf (mit `hp` Leben und
  // kurz unverwundbar), höchstens alle `cooldown` Sekunden. Durchlauf 03.11.: Neue Spieler schauten bei Varkhul
  // (Stufe 6) bis zu zwei Minuten tot zu, wie die Söldner allein verloren. null = nur nach dem Kampf.
  combatRevive: { after: 8, hp: 0.5, invuln: 2, cooldown: 30 },

  // Söldner anheuern: Wer allein durch das Portal eines Gruppen-Dungeons geht, bekommt eine Söldnergruppe gegen Gold
  // angeboten (Preise in hire.js). false = Portal führt wie früher sofort allein hinein.
  hireOffer: true,
  // Söldner kosten Gold (Preise in hire.js), am Portal wie in der Dungeonsuche. Der allererste Dungeon ist kostenlos (Nutzer 16.10.).
  hireFree: ['catacombs'],
  // Söldner sind schwächer als ein gleich ausgerüsteter Spieler, damit der Kampf mit ihnen eine Herausforderung bleibt
  // (16.10.: Nerith fiel mit zwei Söldnern in unter 2 Minuten). Gemessen mit 0,5: Nerith ~3 Min., Ignaroth ~4 Min.;
  // fällt der Spieler früh, verlieren die Söldner Ignaroth allein. 1 = volle Kraft.
  mercPower: 0.5,

  // Mehrere echte Spieler in einer Gruppe: erst mit geteilten Gegnern in der Instanz (Mehrspieler Stufe 2).
  // Muss zum Server passen (Worker-Variable FINDER_HUMAN_GROUPS).
  humanGroups: false,
};
