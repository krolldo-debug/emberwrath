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

## Bilder = echte Spielgrafik

Alles in `img/` stammt aus dem Spiel, nichts ist nachgemalt:
- `kampf-*.webp`, `welt-*.webp`: Aufnahmen (Stufe-20-Helden in legendärer Ausrüstung gegen Bosse und Gruppen),
  erzeugt mit `tools/kampfszenen.mjs`.
- `held-*`, `boss-*`, `volk-*`, `skill-*`, `item-*`, `npc-*`, `logo.png`: direkt aus dem Spielcode gerendert
  mit `tools/render-assets.mjs` (Figuren, Bosse, Völker, Fähigkeits- und Gegenstandssymbole, NPC-Porträts).
  Die Seite vergrößert sie ganzzahlig und pixelgenau (Helden ×4, Bosse ×3, Völker und Porträts ×2).

Neu erzeugen, aus einer Kopie des Projekts:

```sh
# in der Kopie src/config.js spriteRes auf 4 stellen (größere Ansicht, Helden bleiben bei res 2)
node tools/build.mjs
npx http-server dist -p 8101 -s &     # gebündeltes Spiel für kampfszenen.mjs
npx http-server .    -p 8102 -s &     # Module direkt für render-assets.mjs
node site/tools/kampfszenen.mjs /tmp/kampf [ids,kommagetrennt]   # je Szene 18 Bilder, bestes von Hand wählen
node site/tools/towebp.mjs 0.9 site/img /tmp/kampf/<gewählt>.png  # danach umbenennen
node site/tools/render-assets.mjs /tmp/assets                     # Posen auswählen und nach site/img kopieren
```

Die Aufnahme hält den Helden unverwundbar, friert für jedes Bild die Spielschleife ein und entfernt Schadenszahlen,
Trefferblitze und Lebensbalken. Szenen, Ausrüstung und Posen stehen jeweils oben in den Skripten. Nach neuen
Figuren die `width`/`height` in index.html und die Höhen in site.css (`.hero-fig`, `.boss-fig img`) anpassen.

Die Skripte erwarten Playwright global (`/opt/node22/lib/node_modules/playwright`) und Chromium unter `/opt/pw-browsers`.
