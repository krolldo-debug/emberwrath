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
- Gegner in Gruppendungeons sind auf drei Personen ausgelegt (Stand 10.10. abends): Leben ×1,8 und Schaden ×1,7 (der
  Verteidiger fängt ihn ab), Bosse Leben ×2,7; je Boss anpassbar (`bossHpScaleById`, `bossDmgScaleById`, Schaden über
  `boss.groupDmgMult` in world/bossFury.js). Varkhul (Stufe 5) ist für Gruppen milder, Mutter Fäulnis und der Frostwyrm
  härter. Dieselben Werte gelten, wenn jemand allein durchs Portal in einen Dungeon geht (`groupScale.js`, Nutzerwunsch 10.10.;
  Glutprüfungen ausgenommen). Nach einer Niederlage füllen die Söldner ihre Tränke auf. Geprüft mit ganzen Dungeon-Läufen (Spieler-Bot +
  zwei Söldner, alle vier Klassen): jeder Dungeon auf seiner Stufe schaffbar, Varkhul mit gelegentlicher Niederlage.

## Söldner anheuern (`hire.js`)
Wer allein (ohne Dungeonsuche) durch das Portal eines Gruppen-Dungeons geht, sieht vor der Reise dieselbe Tafel wie
„Gruppe gefunden“, mit „Allein“ und „Anheuern · Preis“. Anheuern zieht das Gold ab (Command `finder:hire`, Preis
rechnet der Command aus der Einstiegsstufe: Katakomben 30 bis Aschethron 495) und reist mit zwei Söldnern hinein
(auf drei aufgefüllt wie in der Suche, Krieger sind Verteidiger). Weggehen oder Fallen schließt das Angebot. Das
Fortschrittsbuch bucht den Abgang ohne eigene Regel (Ausgaben gelten immer), es braucht kein neues SQL.
Haken: Portale melden `portal:enter` { zoneId, spawnId, held } (entities/Interactive.js), `held = true` hält die Reise an.

## Schalter (`config.js`, FINDER_CONFIG)
- `labelMercs: true` – Söldner tragen dezent das Söldner-Zeichen und „Söldner“ im Tooltip. **Auf `false` setzen,
  um die Kennzeichnung abzuschalten.**
- `hireOffer: true` – Söldner-Angebot am Dungeon-Portal (false = sofort allein hinein).
- `humanGroups` / Server-Variable `FINDER_HUMAN_GROUPS=true` – mehrere echte Spieler in eine Gruppe. Standard **aus**:
  Das braucht geteilte Gegner in der Instanz (Mehrspieler Stufe 2, src/net/README.md). Bis dahin bekommt jeder echte
  Spieler seine eigene Gruppe mit Söldnern; die Warteschlange und ihre Zahlen sind trotzdem echt.
- `hpScale`, `dmgScale`, `bossHpScale`, `bossHpScaleById`, `bossDmgScaleById`, `reviveAfter`, `reviveHp` – Balance.

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
