# Emberwrath

Pixel-Art-Action-RPG in dunkler Fantasy, direkt im Browser (Desktop, Tablet, Handy).
Reines HTML + JavaScript (ES-Module) + Canvas 2D, keine Abhängigkeiten, alle Grafik prozedural.

**Stand 0.6:** Einzelspieler mit lokalen Demo-Accounts. 4 Völker, 4 Klassen mit je 4 Fähigkeiten und Talenten,
6 Gebiete bis Stufe 20, 3 Bosse, Endgame „Glutprüfungen“, Quests mit Questpfad, rund 180 Gegenstände mit sichtbarer
Ausrüstung, Sets, Schmied, Bank und Erfolge. Der Spielstand liegt im Browser; „Spielstand sichern“ erzeugt eine
Sicherungsdatei. Kein Server, keine anderen Spieler – siehe `docs/MULTIPLAYER.md`.

## Starten und bauen

- Entwicklung: `npm run dev` (oder beliebiger statischer Server im Projektordner), dann `http://localhost:8080`.
- Build: `npm run build` bzw. `node tools/build.mjs` (Node 18 oder neuer, sonst nichts) schreibt
  - `dist/site/` – die Website (index.html, `_headers`, robots.txt), wird auf Cloudflare veröffentlicht,
  - `dist/emberfall.html` – eine Datei, läuft per Doppelklick,
  - `dist/emberfall.fragment.html` – zum Einbetten (Vorschau).
- Logiktests Fortschritt: `node src/progression/test/logic.test.mjs`

## Veröffentlichen

Jeder Push auf `main` wird von Cloudflare gebaut (`npm run build`) und mit `npx wrangler deploy` unter https://emberwrath.kroll-do.workers.dev veröffentlicht
(Konfiguration `wrangler.jsonc`: statische Website aus `dist/site`). Details: `docs/VEROEFFENTLICHEN.md`.

Interne Namen (`emberfall:v1:`-Speicherschlüssel, Exportformat `emberfall-save`, `window.emberfall`) bleiben absichtlich
beim alten Namen, damit bestehende Spielstände erhalten bleiben.

## Steuerung

| Aktion | Tastatur / Maus | Touch |
|---|---|---|
| Bewegen | WASD / Pfeile | linker Daumen-Stick |
| Angriff | J / Leertaste / Linksklick | großer Knopf |
| Ausweichen | K / Shift / Rechtsklick | Ausweich-Knopf |
| Fähigkeiten 1–4 | Q, R, T, G (oder 1, 2, 4, 5) | Fähigkeitsknöpfe |
| Heiltrank | H / 3 | Trank-Knopf |
| Sprechen / Öffnen | E / F | Hinweis-Knopf |
| Inventar, Charakter, Quests, Talente | I, C, L, U | Menüknopf |
| Karte, Ton | M, N | Karte antippen |
| Menü | Esc / P | Menüknopf |

## Dokumentation

`docs/ARCHITECTURE.md` (Engine), `docs/INTEGRATION.md` (verbindliche Schnittstellen), `docs/STYLE.md` (Grafik),
`docs/MULTIPLAYER.md` (Weg zum Online-Betrieb), `docs/VEROEFFENTLICHEN.md` (Hosting).
