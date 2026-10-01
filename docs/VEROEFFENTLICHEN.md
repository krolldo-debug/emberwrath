# Emberwrath veröffentlichen

Spielname: **Emberwrath** (vom Nutzer bestätigt 2026-09-30). Adresse: https://www.emberwrath.com (Domain seit 2026-10-01, Cloudflare). emberwrath.com und emberwrath.kroll-do.workers.dev leiten mit 301 dorthin um (worker/index.js, wrangler.jsonc `vars`).
Anleitung für den Nutzer: Claude Doc „Emberwrath veröffentlichen – Anleitung“
(https://claude.ai/code/artifact/0e2b855d-b000-4637-bdc1-63fe97a19da9).

## Ablauf

- Quelle: privates GitHub-Repo `krolldo-debug/emberwrath`, Zweig `main`. **Veröffentlichen = Push auf `main`.**
- Die Bereichs-Threads arbeiten im geteilten Ordner `/mnt/project-files/emberfall`; der Architektur-Thread integriert,
  testet und pusht (Kopie ohne `node_modules/`, `dist/`).
- Cloudflare ist mit dem Repo verbunden (Git-Integration, kein API-Schlüssel bei Claude) und baut jeden Push.

## Cloudflare-Einstellungen

Das Projekt wurde im neuen Cloudflare-Ablauf als **Worker mit statischen Assets** angelegt (Workers & Pages → Git).
Die Konfiguration steht im Repo in `wrangler.jsonc` (Name `emberwrath`, Assets-Ordner `dist/site`, kein Worker-Skript).

| Feld (Cloudflare) | Wert |
|---|---|
| Projektname | `emberwrath` |
| Produktionszweig | `main` |
| Build-Befehl | `npm run build` (= `node tools/build.mjs`) |
| Deploy-Befehl | `npx wrangler deploy` (liest `wrangler.jsonc`) |
| Node-Version | aus `.node-version` (22); keine Abhängigkeiten |

Lokal prüfen: `node tools/build.mjs && npx wrangler deploy --dry-run`.

`dist/site/_headers` setzt CSP und Sicherheitsheader (INTEGRATION §11.11). Externe Skripte, Fonts oder Verbindungen
nur zusammen mit einer Anpassung der CSP in `tools/build.mjs`.

## Aufbau der Website

`/` Startseite (Ordner `site/`, Einstellungen in `site/config.js`: Kontakt, Social Media, Impressum-Angaben),
`/spielen/` das Spiel, `/support`, `/impressum`, `/datenschutz`. Lokal wie live prüfen: `node tools/build.mjs && npx wrangler dev`.
Impressum-Angaben fehlen noch (die Seite sagt das offen); vor dem Sammeln von E-Mails ausfüllen.

## Spielstand

- Liegt im Browser (localStorage, Präfix `emberfall:v1:`) der jeweiligen Adresse. Adresse nicht wechseln, sonst sind Stände
  dort nicht sichtbar. Mit Konto liegen die Charaktere zusätzlich in der Cloud (Supabase, docs/ONLINE.md).
- Interne Namen bleiben `emberfall` (Schlüssel, Exportformat, Ordner), damit alte Stände erhalten bleiben.

## Noch nicht

- Domain kaufen: nur auf ausdrückliches Wort des Nutzers.
- Server/Online-Accounts: siehe MULTIPLAYER.md (später Supabase oder Cloudflare D1).
