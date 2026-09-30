// Werte für Ulgrim, den Hügelkönig (Stufe 26), ergänzen ENEMY_TYPES.barrow_king (enemyTypes3.js).
// Magier-HP Stufe 26 ≈ 494: normale Treffer ≈ 10–13 %, große Angriffe ≈ 25 %.
// `damage` wird nur von entities/Ulgrim.js gelesen (Schaden je Angriff).
export const DEFS = {
  barrow_king: {
    speed: 40, radius: 11, mass: 7, hurtRadius: 14, bodyHeight: 52, shadowW: 34,
    eye: { x: 6, y: -50 }, material: 'bone',
    damage: {
      sweep: 55,      // Schwungschlag (Bogen)
      backsweep: 50,  // Rückhand in der Kombo (Phase 2)
      chop: 62,       // Grabspalter, Einschlag an der Klinge
      rift: 52,       // Geisterriss entlang der Bahn
      leap: 125,      // Sprung-Stampfer (Kreis)
      wave: 45,       // Geister-Druckwelle (Phasenwechsel, Landung in Phase 2)
      howl: 58,       // Geisterheulen, je Ringwelle
      phantom: 50,    // Schlag eines Geister-Nachbilds
    },
  },
};
