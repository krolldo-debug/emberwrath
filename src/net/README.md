# Mehrspieler (src/net, worker/)

Stand 30.09.2026, Stufe 1.

## Was Stufe 1 kann

- In offenen Gebieten sieht man alle anderen Spieler derselben Welt: Name, Stufe, Volk, Klasse, Aussehen, sichtbare
  Ausrüstung, Lauf-, Angriffs-, Fähigkeits-, Ausweich- und Todesanimation. Die Bewegung wird flüssig interpoliert
  (200 ms Verzögerung, Senderuhr-Abgleich, kurzes Weiterschieben bei verspäteten Paketen).
- **Welten:** Jede offene Zone hat je Welt höchstens 40 Spieler (ein Durable Object je Zone × Welt). Ist Welt 1 voll,
  landet man automatisch in Welt 2 usw. Beim Zonenwechsel bleibt man, wenn möglich, in derselben Welt-Nummer.
  Klick auf „Welt 1 · 12 Spieler“ unter dem Zonennamen öffnet die Weltwahl.
- **Zonen-Chat** (Enter, auf Touch-Geräten der Sprechblasen-Knopf), bereinigt und begrenzt (160 Zeichen, 3 Nachrichten je ~4 s).
- Verbindung nur mit gültigem Supabase-Konto (Token wird im Worker geprüft: JWKS ES256/RS256, sonst `/auth/v1/user`).
  Dasselbe Konto zweimal in einem Shard: die ältere Verbindung wird ersetzt. Wiederverbinden mit Backoff, Ping/Pong.
- Andere Spieler laufen weiter, auch wenn das eigene Inventar/Menü offen ist.

## Was noch nicht (Stufe 2)

- Gegner, Beute, Truhen, Quests und Kampf rechnet weiter jeder Client selbst. Zwei Spieler sehen einander, aber nicht
  dieselben Gegner; Treffer zwischen Spielern gibt es nicht. Stufe 2 macht den Shard zur Autorität (Gegner-Zustände `e`,
  Treffer, Beute pro Spieler gewürfelt) – das braucht den darstellungsfreien Simulationskern aus docs/MULTIPLAYER.md §6.1.
- Dungeon-Instanzen und Glutprüfungen sind ohne Verbindung (man ist dort allein). Gruppen für bis zu 5 kommen mit Stufe 2.
- Reittiere: Abbild und Flag `riding` werden schon übertragen. Die Reiterfigur zeichnet RemotePlayer, sobald Bereich A
  `game.character.animsForLook(look, res)` bereitstellt (sonst die normale Heldenfigur).

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/net/protocol.js` | Nachrichten, Konstanten, Bereinigung (Client **und** Server) |
| `src/net/NetClient.js` | WebSocket, Wiederverbinden, Welt voll → nächste Welt |
| `src/net/NetAuthority.js` | ersetzt `LocalAuthority` (gleiche Form); `joinZone` verbindet in offenen Gebieten |
| `src/net/NetSession.js` | Sitzungssystem `net`: RemotePlayer in `world.entities`, eigener Zustand senden, Namensschilder |
| `src/net/RemotePlayer.js` | anderer Spieler: Interpolation, Animation |
| `src/net/NetHud.js`, `net.css` | Welt-Anzeige, Weltwahl, Chat |
| `worker/index.js` | Worker: `/net/ws`, `/net/worlds`, `/net/status`, sonst statische Dateien |
| `worker/shard.js` | Durable Object `ZoneShard` (WebSocket-Hibernation, Bündelung alle 50 ms, Rate-Limit) |
| `worker/directory.js` | Durable Object `Directory` (Belegung aller Welten, Zuteilung) |
| `worker/auth.js` | Supabase-Token prüfen |

Neue Zonen brauchen keine Codeänderung: der Shard heißt `<zoneId>~<welt>`; ob eine Zone geteilt ist, entscheidet
`instanced` in der Zonendefinition.

## Einbau (Architektur)

- `src/main.js`: `import { installNet } from './net/index.js';` und `.use(installNet)` nach `installOnline`.
- `index.html`: `<link rel="stylesheet" href="src/net/net.css">` nach `online.css`.
- `wrangler.jsonc`: `main`, `assets.binding`, Durable-Object-Bindungen und Migration – siehe
  `docs/proposals/mehrspieler-einbau.patch`. CSP bleibt: `connect-src 'self'` erlaubt wss auf derselben Adresse.
- Kein Schritt im Cloudflare-Dashboard nötig: der nächste Push mit dieser `wrangler.jsonc` legt die Durable Objects an.

## Kosten (Cloudflare Workers Free)

Durable Objects mit SQLite-Speicher sind im Gratis-Tarif enthalten: 100 000 Anfragen/Tag, 13 000 GB-s Laufzeit/Tag.
Eingehende WebSocket-Nachrichten zählen 20:1 als Anfrage; ausgehende sind frei.

- Ein laufender Spieler sendet höchstens 8 Zustände/s, ein stehender alle 5 s einen → grob 750 Anfragen je Spielerstunde.
  Das reicht für etwa **130 Spielerstunden am Tag**.
- Ein Shard kostet Laufzeit, solange sich dort etwas bewegt (schläft sonst): etwa **28 aktive Zonen-Stunden am Tag**.
- Darüber hinaus: Workers Paid (5 $/Monat, 1 Mio. Anfragen + 400 000 GB-s inklusive). Ist das Gratis-Kontingent eines
  Tages aufgebraucht, läuft das Spiel weiter, nur ohne andere Spieler (Anzeige „neuer Versuch …“) bis zum nächsten Tag.

## Chat-Moderation (DSA Art. 16/17)

- **Wortfilter** (`chatFilter.js`) läuft auf dem Welt-Server für jede Nachricht: grobe Beleidigungen und Hassbegriffe
  werden zu Sternchen, Links zu „[Link entfernt]“, gesperrt geschriebene Begriffe oder Drohwendungen entfernen die ganze
  Nachricht. Liste bewusst kurz; für alles andere gibt es „Melden“.
- **Melden**: Name im Chat oder in der Spielerliste des Weltfensters anklicken → Grund, Beschreibung, Bestätigung „in
  gutem Glauben“. Der Server hängt die letzten 10 Nachrichten der gemeldeten Person selbst an (Original + gefilterte
  Anzeige), speichert in `chat_reports` (Migration `supabase/migrations/20261003120100_chat_meldungen.sql`) und
  bestätigt den Eingang. Höchstens 6 Meldungen je Spieler in 10 Minuten. Wer das Gebiet gerade verlassen hat, kann noch
  10 Minuten gemeldet werden. Ist Supabase gestört oder fehlt das Secret, bleibt die Meldung im Speicher des Shards und
  wird beim nächsten Alarm (alle 60 s) nachgesendet.
- **Ignorieren** wirkt auf dem Gerät: gespeichert wird der anonyme Schlüssel `k` (aus der Konto-ID abgeleitet, verrät
  sie nicht), damit es über Gebiete, Welten und Neuladen hinweg gilt.
- **Verwaltung**: `AdminReports.js` (`renderChatReports(client)`) zeigt Meldungen mit Beleg; Erledigt/Ablehnen mit
  Begründung, Chatsperre 24 h/7/30 Tage, Sperre aufheben. Die Sperre gilt beim nächsten Betreten eines Gebiets.
- Braucht das Worker-Secret `SUPABASE_SERVICE_ROLE_KEY` (dasselbe wie für Newsletter/Support) und die Migration oben im
  Supabase-SQL-Editor. Gelöscht werden erledigte Meldungen nach 180 Tagen über `cleanup_chat_moderation()`.

## Name, Stufe und Weltplätze

- Name und Stufe, die andere sehen, lädt der Welt-Server aus dem gespeicherten Charakter (`characters`, per
  `SUPABASE_SERVICE_ROLE_KEY`). Die Stufe darf eine über dem Speicherstand liegen (Aufstieg seit dem letzten Autosave),
  nie über `LEVEL_MAX` (40, `protocol.js`). Ohne Speicherstand (neuer Charakter, Störung) gelten die Client-Angaben, geprüft.
- `names.js` (`nameProblem`) sperrt Team-Namen (Admin, Support, GM, Emberwrath …, auch mit Zeichen-Tricks) und anstößige
  Namen. Andere sehen dann „Abenteurer XXXX“, die Person bekommt einen Hinweis. Dieselbe Prüfung eignet sich für die
  Charaktererstellung.
- Ein Weltplatz zählt erst, wenn der Shard den Spieler nach geprüfter Anmeldung angenommen hat. Je Adresse sind höchstens
  4 noch nicht angemeldete Verbindungen pro Shard offen; nach 10 s ohne Anmeldung wird getrennt.

## Test

`worker`-Protokolltest (Node + ws) und Browsertest (Playwright, 6 Spieler inkl. Handy hoch/quer) gegen `wrangler dev`
mit nachgebautem Supabase-Auth; siehe Commit-Beschreibung. Befehl lokal:
`npx wrangler dev --var SUPABASE_URL:http://127.0.0.1:54399 --var SHARD_CAPACITY:3`.
Moderation und Identität: `worker/test/moderation.mjs`, `worker/test/identity.mjs` und `worker/test/browser-moderation.mjs` (mockauth.mjs bildet dafür auch
`chat_reports`/`chat_mutes` nach); zusätzlich `--var SUPABASE_SERVICE_ROLE_KEY:sb_secret_test`.
