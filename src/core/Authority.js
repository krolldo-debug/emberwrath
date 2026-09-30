// Schnittstelle zur "Wahrheitsquelle" des Spiels.
//
// Heute: LocalAuthority. Alles läuft im Browser, nichts wird übertragen,
// es gibt keine anderen Spieler. Das wird im Spiel auch so angezeigt.
//
// Später: ein ServerAuthority mit derselben Form. Dann
//  - schickt execute() Commands an den Server; authoritative Commands
//    (XP, Beute, Gold, Quest-Abschluss) berechnet der Server selbst,
//  - liefert joinZone() einen echten Kanal / eine Instanz mit Spielerlimit,
//  - kommen andere Spieler über remotePlayers() und die Events
//    'snapshot', 'playerJoined', 'playerLeft' herein,
//  - sendet sendIntent() Bewegungs-/Aktionsabsichten statt fertiger Ergebnisse.
// Siehe docs/INTEGRATION.md und docs/MULTIPLAYER.md.
export class LocalAuthority {
  constructor(content) {
    this.content = content;
    this.mode = 'local';
    this.online = false;
    this.zone = null;
  }

  // cmd = { type, payload, authoritative }, apply = lokale Anwendung
  execute(cmd, apply) { return apply(); }

  // Betritt eine Zone. Lokal immer eine eigene Instanz mit genau einem Spieler.
  joinZone(zoneId) {
    const zone = this.content.find('zone', zoneId);
    this.zone = {
      zoneId,
      instanceId: `${zoneId}#local`,
      capacity: zone?.maxPlayers ?? 1,
      population: 1,
    };
    return this.zone;
  }
  leaveZone() { this.zone = null; }

  // Absicht des lokalen Spielers (Bewegung, Angriff). Lokal nicht benötigt.
  sendIntent(intent) {}

  // Andere Spieler in derselben Instanz. Lokal immer leer, es wird nichts vorgetäuscht.
  remotePlayers() { return []; }

  // 'snapshot' | 'playerJoined' | 'playerLeft' – lokal feuert nie etwas.
  on(event, fn) { return () => {}; }
}
