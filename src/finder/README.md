# Dungeonsuche (src/finder/, worker/finder/)

Online-Gruppensuche für Dungeons in 3er-Gruppen (1 Verteidiger + 2 Schaden). Echte Spieler zuerst; nur wenn in der
Warteschlange niemand Passendes sucht, füllen **Söldner** (Bots) die freien Plätze.

## Ablauf
1. Spieler öffnet „Dungeonsuche“ (Menü oder Taste **O**), wählt Dungeon (oder „Zufälliger Dungeon“) und Rolle.
2. Client verbindet sich per WebSocket mit `/net/finder` (Durable Object `DungeonFinder`, eine Instanz für alle).
   Anmeldung mit dem Supabase-Token wie beim Welt-Server. Ohne Server/Anmeldung sucht der Client mit demselben
   Matchmaker weiter (dann nur mit Söldnern).
3. Matchmaker (`matchmaker.js`): echte Spieler zuerst; sucht sonst niemand, Söldner nach 7–13 s. Suchen andere
   Passendes, wird bis 45 s auf eine echte Gruppe gewartet (Teilgruppe nach 20 s). Bereitschaftsprüfung 30 s.
4. Alle bereit → Reise in die Dungeon-Instanz, Söldner erscheinen am Eingang (`Party.js`).
5. Dungeon verlassen (Ausgangsportal, Menü, „Zurück“) → zurück an die Stelle, an der man beigetreten ist; die Gruppe löst sich auf.
   Ebenso, wenn die Gruppe komplett besiegt wurde.

## Söldner
- Echte `Hero`-Instanzen (gleiche Klassen, Fähigkeiten, Figuren, echte Ausrüstung passend zur Stufe).
- KI `BotBrain.js`: weicht Warnflächen/Geschossen mit Reaktionszeit und Fehlern aus, Tank hält Bedrohung (Spott über
  Kriegerfähigkeiten), Nahkämpfer hinter dem Ziel, Fernkämpfer auf Abstand mit Sichtlinie, Tränke, Formation, Pausen.
- Chat wie Spieler (`chatter.js`): Begrüßung, Ansagen, gg, Antworten auf den Gruppenchat.
- Tod: nach 3 s außer Kampf mit 40 % Leben wieder da. Stirbt der Spieler, solange ein Söldner lebt, steht er ebenfalls
  wieder auf; fallen alle, gilt die normale Wiederbelebung.
- Gegner in Gruppendungeons haben mehr Leben (×1,8, Boss ×2,3), damit es für drei nicht zu leicht ist.

## Schalter (`config.js`, FINDER_CONFIG)
- `labelMercs: true` – Söldner tragen dezent das Söldner-Zeichen und „Söldner“ im Tooltip. **Auf `false` setzen,
  um die Kennzeichnung abzuschalten.**
- `humanGroups` / Server-Variable `FINDER_HUMAN_GROUPS=true` – mehrere echte Spieler in eine Gruppe. Standard **aus**:
  Das braucht geteilte Gegner in der Instanz (Mehrspieler Stufe 2, src/net/README.md). Bis dahin bekommt jeder echte
  Spieler seine eigene Gruppe mit Söldnern; die Warteschlange und ihre Zahlen sind trotzdem echt.
- `hpScale`, `bossHpScale`, `reviveAfter`, `reviveHp` – Balance.

## Protokoll
Siehe Kopf von `protocol.js` (hello/queue/cancel/accept ↔ welcome/queued/stats/proposal{group,you}/ready/start/
requeued/cancelled/bye).

## Integration (außerhalb dieses Ordners)
- `src/main.js`: `import { installFinder } from './finder/index.js';` und `.use(installFinder)` nach installNet.
- `index.html`: `<link rel="stylesheet" href="src/finder/finder.css">`.
- `worker/index.js`: Route `/net/finder` → `DUNGEON_FINDER` (idFromName('main')), Export `DungeonFinder`.
- `wrangler.jsonc`: Binding `DUNGEON_FINDER` + Migration `v2`.
- `src/systems/Feedback.js`: Treffer von/auf Söldner ohne Hitstop, Wackeln und roten Bildschirm; keine Schrittgeräusche.

## Kosten
Verbindungen bestehen nur während der Suche (Sekunden bis wenige Minuten); nur dann läuft ein Sekundentakt. Im
Gratis-Tarif von Durable Objects fällt das neben dem Welt-Server kaum ins Gewicht. Nichts Kostenpflichtiges nötig.

## Tests
- `node src/finder/test/matchmaker.test.mjs` – Gruppenbildung
- `node worker/finder/test/hub.test.mjs` – Server-Kern (Anmeldung, Warteschlange, Bereitschaft, Ersetzen, Drosselung)
- Mit `npx wrangler dev` + `worker/test/mockauth.mjs` auch über den echten Worker geprüft.
