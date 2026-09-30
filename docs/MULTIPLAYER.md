# Emberfall – Weg zum echten Mehrspielerbetrieb

Stand heute: **Einzelspieler-Prototyp.** Accounts sind lokale Profile ohne Passwort, Spielstände liegen im
`localStorage` dieses Browsers, es gibt keinen Server und keine anderen Spieler. Das Spiel sagt das überall offen
(„Lokaler Demo-Account“, „Lokale Instanz · nur du“). Dieses Dokument beschreibt, was für echten Online-Betrieb
nötig ist und wo es im Code andockt.

## 1. Was schon vorbereitet ist

| Baustein | Datei | Bedeutung für Online |
|---|---|---|
| Ein zentraler Zustand in Slices | `core/GameState.js` | Genau das, was der Server pro Charakter speichert und synchronisiert |
| Änderungen nur per Command | `state.commit(type, payload)` | Wird zur Anfrage an den Server; Commands mit `authoritative: true` (XP, Beute, Gold, Quest-Abschluss, Boss, Kauf/Verkauf) berechnet später nur der Server |
| Authority-Schnittstelle | `core/Authority.js` | `LocalAuthority` heute, `ServerAuthority` später mit gleicher Form: `execute`, `joinZone`, `leaveZone`, `sendIntent`, `remotePlayers`, `on('snapshot'|'playerJoined'|'playerLeft')` |
| Zonen mit `instanced` und `maxPlayers` | `world/zones.js` | Offene Gebiete (Glutsenke, Aschenwald, Schlackenhöhen) = Kanal mit 40 Plätzen; Dungeons und Glutprüfungen = Instanz für bis zu 5 |
| Geräte-Einstellungen getrennt vom Spielstand | `core/Prefs.js` | Bleiben lokal; nur der Spielstand wandert auf den Server |
| Inhalte als Daten | `core/Content.js`, `*/items.js`, `quests.js`, `enemyTypes.js`, `classes.js` | Server und Client laden dieselben Definitionen |
| Reine Spiellogik ohne DOM | `progression/logic.js` (+ Tests) | Läuft unverändert in Node auf dem Server |
| Aktionsbasierte Eingabe | `core/Input.js` | Eingaben lassen sich als Absichten („bewege nach x,y“, „Fähigkeit 1“) verschicken |

## 2. Server

- **Gebietsserver (Zone Server):** Ein Prozess (Node.js oder Go/Rust) simuliert eine Zoneninstanz mit festem Takt
  (20 Hz genügen, Client rendert mit 60 Hz). Er besitzt Gegner, Beute, Truhen, Boss und die Positionen aller Spieler.
  Die Welt- und Kampflogik (`World`, `Enemy`, `Boss`, `Combat`) muss dazu in einen darstellungsfreien Kern und eine
  Render-Schicht getrennt werden. Das ist der größte Umbau.
- **Kanäle und Instanzen:** Ein Verteiler (Matchmaker) weist beim Betreten einer Zone einen Kanal zu:
  offenes Gebiet mit Obergrenze (z. B. 40, danach neuer Kanal „Glutsenke 2“), Dungeon als private Instanz für eine
  Gruppe (max. 5). Freunde/Gruppe landen bevorzugt im selben Kanal. So wirkt die Welt belebt, aber nicht überfüllt.
- **Account- und Charakterdienst:** REST/HTTP-Dienst mit Datenbank (z. B. PostgreSQL) für Accounts, Charaktere,
  Inventar, Quests. Nur dieser Dienst und die Gebietsserver schreiben Spielstände.
- **Gateway:** WebSocket-Verbindung pro Spieler (TLS), leitet an den zuständigen Gebietsserver weiter.

## 3. Synchronisierung

- **Client → Server:** nur Absichten (`sendIntent`): Bewegungsrichtung mit Sequenznummer, „Angriff“, „Fähigkeit 2 auf
  Richtung“, „Interagieren mit NPC x“, Commands wie `quest:accept`. Nie Ergebnisse wie „Gegner tot“ oder „+50 Gold“.
- **Server → Client:** Zustands-Snapshots der sichtbaren Umgebung (Interest Management: nur Objekte im Umkreis von
  ca. 1,5 Bildschirmen), als Deltas; Ereignisse (`hit`, `enemy:killed`, `loot:dropped` …) über denselben Event-Namen wie heute.
- **Eigene Figur:** Client-Vorhersage (sofort bewegen) + Abgleich mit der Serverposition über die Sequenznummer
  (Reconciliation). Treffer werden vom Server bestätigt; der Client darf Effekte vorab zeigen.
- **Andere Spieler und Gegner:** Interpolation zwischen zwei Snapshots mit ~100 ms Verzögerung.
- **Einbau im Client:** `ServerAuthority.remotePlayers()` liefert Einträge, die `World` als `RemotePlayer`-Actors
  anzeigt (Sprite über `getHeroSprites(raceId, classId, variant)`); `execute()` schickt Commands und wendet die
  Serverantwort auf die Slices an.

## 4. Authentifizierung

- Echte Accounts mit E-Mail + Passwort (gehasht mit Argon2/bcrypt) oder Anmeldung über einen Anbieter (OAuth/OIDC,
  z. B. Google).
- Nach der Anmeldung kurzlebiges Zugriffstoken (JWT, ~15 min) + Refresh-Token (HttpOnly-Cookie bzw. sicherer
  Speicher in der App). Die WebSocket-Verbindung wird mit dem Token aufgebaut und vom Gateway geprüft.
- Charaktere aus der Testphase werden beim ersten Anmelden einmalig ins Konto übernommen (docs/ONLINE.md).

## 5. Schutz vor manipulierten Spielständen

- **Der Server ist die einzige Wahrheit.** Alles im Browser ist veränderbar (localStorage, `window.emberfall`,
  Arbeitsspeicher). Deshalb speichert und berechnet online nur der Server XP, Stufen, Beute, Gold, Inventar und Quests.
- **Authoritative Commands prüfen:** z. B. `quest:turnIn` nur, wenn der Server selbst die Ziele gezählt hat;
  `loot:claim` nur für Beute, die der Server für genau diesen Spieler gewürfelt hat, in Reichweite; `shop:buy` nur mit
  Serverguthaben. Ebenso `craft:make`, `smith:upgrade/enchant`, `bank:*` und die Glutprüfungen: Zeit, Punkte und
  Belohnungswürfe (episch/legendär) rechnet nur der Server; der Client zeigt `trial:*`-Events nur an.
- **Bewegung plausibilisieren:** maximale Geschwindigkeit, Kollision und Zonengrenzen serverseitig; Ausreißer werden
  zurückgesetzt.
- **Kampf serverseitig:** Schaden, Krit, Abklingzeiten und Ressourcenkosten rechnet der Server mit denselben
  Daten (`classes.js`, `enemyTypes.js`).
- **Rate-Limits** pro Verbindung, Protokollierung auffälliger Werte (XP pro Minute, Gold pro Stunde).
- **Lokale Spielstände** aus dem Prototyp werden nicht als Online-Fortschritt übernommen.
- **Handelbare Werte zuerst:** Gold, Glutsplitter, epische/legendäre Items und Bankinhalt sind die ersten Ziele von
  Betrug; sie gehören von Tag 1 an ausschließlich in die Server-Datenbank (Transaktionen, Protokoll je Änderung).

## 6. Reihenfolge der Umsetzung (Vorschlag)

1. Welt-/Kampflogik von der Darstellung trennen (darstellungsfreier Simulationskern, im Browser und in Node lauffähig).
2. Account-/Charakterdienst + Anmeldung; Spielstände serverseitig (noch ohne Mitspieler).
3. Gebietsserver für die Glutsenke mit sichtbaren anderen Spielern (nur Bewegung, Interpolation), Kanäle mit Limit.
4. Kampf, Beute und Quests serverseitig; `ServerAuthority` ersetzt `LocalAuthority`.
5. Instanzierte Dungeons, Glutprüfungen und Gruppen (gemeinsamer Lauf, Beute pro Spieler gewürfelt).
6. Lasttests, Überwachung, Missbrauchsschutz.
