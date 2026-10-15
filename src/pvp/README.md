# Glutarena (src/pvp/, worker/pvp/)

Gewertete Kämpfe 1 gegen 1. Reiter **„Glutarena“** im Fenster der Dungeonsuche (Taste **O**), ab Stufe 10.
Kein eigenes Fenster, keine eigene Leiste: Suche als kleine Leiste oben (wie die Dungeonsuche), im Kampf steht der
Gegner wie ein Boss oben in der Mitte.

## Regeln (rules.js)
- **Ab Stufe 10** (`PVP_MIN_LEVEL`). In der Arena kämpfen alle auf **Stufe 40** mit allen Fähigkeiten und derselben
  Arena-Rüstung (`arenaStats.js`, nur Klasse und Volk zählen). Eigene Ausrüstung, Talente und Tränke wirken nicht.
- **Kampf**: höchstens 2 Minuten, ab 1 Minute **Glutsturm** (+3 % Schaden je Sekunde). K.o. gewinnt; bei Zeitablauf
  gewinnt, wer anteilig mehr Leben hat. Schaden in der Arena ×0,1 mit Klassenfaktor (`PVP_CLASS`), Kampfdauer im
  Mittel um 30 s (`test/sim.mjs`).
- **Saisons** zu 8 Wochen (Beginn 12.10.2026). Neue Saison: Wertung rückt zur Mitte (`seasonStart`).
- **Wertung** Elo, Start 1000, erste 10 Kämpfe K 40, danach 24. Ligen Bronze, Silber (1100), Gold (1250),
  Platin (1400), Diamant (1550), Glutmeister (1700).
- **Gegnersuche**: echte Spieler zuerst, Wertungsfenster wächst mit der Wartezeit (`matchWindow`). Findet sich nach
  **20 s** niemand, tritt ein **Herausforderer** an (Bot, sieht aus wie ein Spieler, Söldner-Zeichen am Namen):
  halbe Wertung, Gewinne höchstens bis 1350. Platin und höher geht nur gegen echte Spieler.
- **Belohnung**: Gold für die ersten 10 Kämpfe am Tag (Sieg mehr als Niederlage, `goldFor`), Erfolge mit Titeln
  (Arenaneuling, Gladiator, Arenaschreck, Goldene Klinge, Platinklinge, Diamantklinge, Glutmeister).

## Ablauf
1. „Gegner suchen“ → WebSocket `/net/arena` (Durable Object `PvpArena`, eine Instanz), Anmeldung mit dem Supabase-Token.
2. `match` (echter Gegner) oder `bot` (Herausforderer) → Reise in die Zone `pvp_arena` (Karte `arenaLevel.js`).
   Danach geht es an dieselbe Stelle zurück (`PvpService.returnHome`).
3. Beide da → Gong (3 s) → Kampf. Ergebnis-Karte mit Wertung und Gold, „Nächster Kampf“ oder „Zurück“.

## Wer rechnet was
- **Echter Kampf**: Der Server führt Leben und Ergebnis. Der Angreifer meldet Treffer (Grundschaden ohne Krit); der
  Server prüft Kampfphase, Abstand, Obergrenze je Treffer (`maxHitDamage`), Schadensbudget je Sekunde und
  Unverwundbarkeit, würfelt Krit und rechnet Rüstung, Kriegsschrei, Unbeugsam, Blutdurst und Glutsturm.
  Verbindungsabbruch: 10 s Frist zum Wiederverbinden, dann Sieg für den Gegner.
- **Herausforderer**: läuft im Client (`BotRival.js`, KI `ArenaBrain.js`), der Server nimmt das Ergebnis an
  (Sieg frühestens nach 12 s, sonst ungültig) und rechnet Wertung und Gold. Schließen mitten im Kampf = Niederlage.
- Wertung, Bestenliste und Tageszähler liegen im Speicher des Durable Objects (`r:<saison>:<konto>:<charakter>`,
  `top:<saison>`, `d:<tag>:<konto>`). Im Spielstand (Slice `pvp`) steht nur, was der Server zuletzt gemeldet hat
  (für Erfolge und die Anzeige).

## Dateien
- `rules.js` Regeln, Zeiten, Saisons, Ligen, Wertung, Gold · `arenaStats.js` Arena-Werte · `protocol.js` Nachrichten
- `PvpService.js` (game.pvp) Suche, Verbindung, Reise · `PvpClient.js` WebSocket
- `ArenaSession.js` Sitzungssystem in der Arena · `arenaHero.js` Arena-Regeln am Helden · `NetDuel.js` echter Gegner
- `BotRival.js`, `ArenaBrain.js` Herausforderer · `ArenaHud.js`, `ArenaPanel.js`, `art.js`, `pvp.css` Anzeige
- Server: `worker/pvp/hub.js` (ohne Cloudflare, in Node testbar), `worker/pvp/arena.js` (Durable Object)

## Prüfen
- `node worker/pvp/test/hub.test.mjs` – Server: Anmeldung, Paarung, Herausforderer, Treffer, Budget, Ende, Tagesgold
- `node src/pvp/test/sim.mjs` – Kampfdauer und Schadensbudget je Klassenpaar
