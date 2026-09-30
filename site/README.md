# Startseite (site/)

Statische Startseite vor dem Spiel, dazu Support/FAQ, Impressum und Datenschutz. Zuständig: Thread „Startseite“.
Keine Abhängigkeiten, keine externen Skripte oder Schriften (CSP bleibt `'self'`).

## Aufbau der Website (dist/site)

| Adresse | Inhalt |
|---|---|
| `/` | Startseite (`site/index.html`) |
| `/spielen/` | das Spiel (von `tools/build.mjs` geschrieben) |
| `/support`, `/impressum`, `/datenschutz` | Unterseiten (Cloudflare liefert `x.html` unter `/x` aus) |

`site/build-site.mjs` → `buildSite(root, outDir)` kopiert Seiten, `site.css`, `site.js`, `config.js`, `favicon.svg`
und `img/` nach `outDir` und setzt `partials/header.html` / `footer.html` an `<!--#include name-->` ein.
Alle Pfade in den Seiten sind relativ (`img/…`, `support`), nur die Spieladressen in `config.js` sind absolut.

## Anpassen ohne Code

`site/config.js`: Spieladressen (`/spielen/#anmelden`, `#registrieren`, `#konto`), Support-E-Mail,
Social-Media-Adressen (leer = Knopf „bald“), Impressumsangaben (leer = Hinweis statt Angaben).
Anmeldestatus liest `site.js` aus `localStorage['emberwrath:online:session']` (Format vom Login-Thread).

## Bilder = echte Spielszenen

`img/` enthält nur Aufnahmen aus dem Spiel: Welt-, Boss- und HUD-Bilder als WebP 1440×810, Handy hochkant, Logo, Heldenfiguren und Fähigkeitssymbole direkt aus dem Spielcode.
Neu aufnehmen (z. B. nach neuen Charaktergrafiken), aus einer Kopie des Projekts:

```sh
node tools/build.mjs
npx http-server dist -p 8101 -s &      # für capture*.mjs (gebündeltes Spiel)
npx http-server .    -p 8102 -s &      # für render-assets.mjs (Module direkt)
mkdir -p /tmp/shots
node site/tools/capture.mjs /tmp/shots          # Zonen + Bosse (+ -hud Varianten), PNG 1440×810
node site/tools/capture-extra.mjs /tmp/shots    # handy.png, erstellung.png
node site/tools/towebp.mjs 0.95 site/img /tmp/shots/{glutsenke,katakomben,aschenwald,tempel,schlackenhoehen,glutschmiede,boss-varkhul,boss-nerith,boss-ignaroth,aschenwald-hud,boss-ignaroth-hud,handy}.png
node site/tools/render-assets.mjs site/img      # logo, held-* (zugeschnitten), skill-* als PNG
```

Aufnahmen mit einem 1920×1080-Fenster: Das Spiel rendert dann mit Überabtastung 3 (`CONFIG.renderScale`),
die feinen Figuren (spriteRes 3) greifen, und das Bild ist 1440×810. Szenen als WebP (≈150 KB statt ≈600 KB PNG).
Nach neuen Heldenbildern die `width`/`height` der `held-*`-Bilder in index.html auf doppelte Pixelgröße setzen.

Die Skripte erwarten Playwright global (`/opt/node22/lib/node_modules/playwright`) und Chromium unter `/opt/pw-browsers`.
