# Emberwrath auf CrazyGames

Stand 10.10.2026. Eigene Fassung für [CrazyGames](https://www.crazygames.com) (Basic Launch), gebaut aus demselben Code.

## Was anders ist

| | Website (`/spielen/`) | CrazyGames |
|---|---|---|
| Anmeldung | E-Mail, Google | keine: „Spielen“ startet sofort als Gast; mit CrazyGames-Konto automatisch dessen Konto |
| Konto-Seite | Passwort, Abmelden, Löschen | Gast oder CrazyGames-Name, „Bei CrazyGames anmelden“, Konto löschen |
| Shop | Gold und Designs (Stripe) | keiner (CrazyGames erlaubt keine eigenen Zahlungen) |
| Vollbild-Knopf | ja | nein (stellt CrazyGames selbst, eigene Knöpfe sind dort verboten) |
| Rechtstexte | Häkchen bei der Registrierung | Hinweis unter „Spielen“, Links auf www.emberwrath.com (CrazyGames empfiehlt einen schlichten Hinweis) |
| Welt-Server, Chat, Dungeonsuche, Cloud-Spielstände | wie gehabt | gleich, über `www.emberwrath.com` |

Sprache: wie auf der Website (gespeicherte Wahl, sonst Browsersprache: Deutsch für `de*`, sonst Englisch). CrazyGames
verlangt genau das (Sprache des Nutzers, sonst Englisch).

## Aufbau

- `src/platform.js`: `IS_CRAZYGAMES` (Schalter `globalThis.EMBERWRATH_PLATFORM = 'crazygames'` vor dem Spielcode),
  `httpBase()`/`wsBase()` für `/net/*` (CrazyGames: `https://www.emberwrath.com`), `siteUrl()`.
- `src/crazygames/`: SDK-Hülle (`sdk.js`), Konten (`session.js`), Titel- und Konto-Seite (`index.js`), Styles.
  `src/main.js` installiert es statt des Shops. SDK: `gameplayStart`/`gameplayStop` beim Betreten/Verlassen der Welt.
- `worker/crazygames.js`: CORS und WebSocket-Origin für `*.crazygames.com` und die Apps, `POST /net/cg/session`.
- `tools/build-crazygames.mjs` (läuft in `npm run build` nach `tools/build.mjs`).

## Konten

Externe Anmeldungen sind auf CrazyGames verboten, der Fortschritt liegt trotzdem auf unserem Server:

- **Gast:** Der Browser erzeugt einmal einen Zufallsschlüssel (`localStorage` `emberwrath:cg:guest`). Der Worker legt dazu
  ein bestätigtes Supabase-Konto `guest-<hash>@players.emberwrath.com` an und gibt E-Mail und Passwort
  (HMAC aus `CG_SECRET` bzw. `SUPABASE_SERVICE_ROLE_KEY`) zurück; das Spiel meldet sich damit normal an.
- **CrazyGames-Konto:** Das SDK liefert ein signiertes Token (RS256, Schlüssel von `sdk.crazygames.com/publicKey.json`).
  Der Worker prüft es und gibt das Konto `cg-<hash der ID>@players.emberwrath.com` (`user_metadata.cg_user_id`).
- **Gast meldet sich bei CrazyGames an:** Gibt es zu dieser CrazyGames-ID noch kein Konto, wird das Gastkonto übernommen
  (gleiche ID, Helden bleiben). Sonst wechselt das Spiel zum vorhandenen CrazyGames-Konto.
- Konten werden erst mit „Spielen“ angelegt (nicht beim bloßen Öffnen). Der Klick zählt als Zustimmung
  (`terms_version`, Nachweis per Trigger in `terms_consents`).
- Es sind echte, bestätigte Konten (keine anonymen): Welt-Server, Spielstand-Prüfung und Moderation gelten unverändert.

Nötig auf dem Server: nur `SUPABASE_SERVICE_ROLE_KEY` (gibt es schon). Optional `CG_SECRET`, `CG_GAME_ID` (nur Tokens
dieses Spiels annehmen; Wert steht nach dem Hochladen im Developer Portal). Kein Schritt im Supabase-Dashboard.
Ratelimit: `/net/cg/*` über `NET_LIMITER` (120/min je Adresse).

## Updates ohne neuen Upload

Die ZIP für CrazyGames (`dist/crazygames/emberwrath-crazygames.zip`, 2 Dateien) enthält nur eine Lade-Seite. Sie holt
`https://www.emberwrath.com/crazygames/game.js` und `game.css` (no-cache). Jede Veröffentlichung der Website bringt
damit auch CrazyGames auf den neuen Stand, ohne neuen Upload. Neu hochladen nur, wenn sich die Lade-Seite ändert.
CrazyGames erlaubt nachgeladene Dateien und bewertet dann die Zeit bis zum Spielstart (≤ 20 s,
docs.crazygames.com/requirements/technical). Rückfall, falls CrazyGames das Nachladen einmal ablehnt:
`node tools/build-crazygames.mjs --komplett` baut eine ZIP mit allem in einer Datei (dann bei jedem Update neu hochladen).

Ist www.emberwrath.com nicht erreichbar, zeigt die Lade-Seite „Der Spielserver ist gerade nicht erreichbar“ mit
„Erneut versuchen“.

## Prüfen

- `node worker/test/crazygames.test.mjs`: Worker ohne Netz (Token, Gast, Übernahme, Passwort neu, Herkunft).
- `npm run build && node tools/test-crazygames.mjs`: Browser (Playwright). Lade-ZIP im iframe auf
  `emberwrath.game-files.crazygames.com`, SDK, Worker und Supabase nachgestellt: Gast-Start, Heldenerschaffung, Spielwelt,
  gameplayStart/Stop, Welt-Server-Adresse, kein Shop/Vollbild, Anmelden bei CrazyGames mit Übernahme, zweites Gerät,
  Handy quer, Deutsch/Englisch, Server weg.
