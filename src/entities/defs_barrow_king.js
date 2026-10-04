// Werte für Ulgrim, den Hügelkönig (Stufe 26), ergänzen ENEMY_TYPES.barrow_king (enemyTypes3.js).
// Magier-HP Stufe 26 ≈ 494: normale Treffer ≈ 10–13 %, große Angriffe ≈ 25 %.
// `damage` wird nur von entities/Ulgrim.js gelesen (Schaden je Angriff).
export const DEFS = {
  barrow_king: {
    speed: 40, radius: 13, mass: 7, hurtRadius: 18, bodyHeight: 68, shadowW: 48,
    eye: { x: 5, y: -68 }, material: 'bone',
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
