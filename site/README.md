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
- `kampf-*.webp`, `welt-*.webp`: Spielszenen in nativer Auflösung des Spiels (960 × 540, spriteRes 2 wie live), verlustfrei
  (WebP lossless), Helligkeit beim Aufnehmen eingerechnet. Aufgenommen mit `tools/szenen.mjs`, ausgewählt mit
  `tools/szenen-auswahl.py` (Pillow). Titelbild und Malgareth-Streifen zeigen eine Dreiergruppe.
  Anzeige: `img.shot` mit `--fx/--fy` (Bildpunkt, der in die Mitte soll). CSS gibt je Breite einen Faktor `--f`
  vor (×2, ab 1921 px ×3, Handy ×1); site.js rundet ihn auf ganze Bildschirmpunkte und füllt den Rahmen. Nie
  `object-fit: cover` oder CSS-Filter auf diese Bilder legen.
- `held-*`, `volk-*`, `skill-*`, `npc-*`, `logo.png`: direkt aus dem Spielcode gerendert (`tools/render-assets.mjs`); `boss-*`, `ritt-*` (Reiter auf Reittieren) und `item-*` mit `tools/render40.mjs`.
  Die Seite vergrößert sie ganzzahlig und pixelgenau (Helden ×5, Bosse ×2 bzw. Ulgrim und Malgareth ×3, Reiter ×4, Völker ×3, Symbole ×2).

Neu erzeugen, aus einer Kopie des Projekts:

```sh
node tools/build.mjs
npx http-server dist -p 8101 -s &     # gebündeltes Spiel für szenen.mjs
npx http-server .    -p 8102 -s &     # Module direkt für render-assets.mjs
node site/tools/szenen.mjs cn [ids,kommagetrennt]   # je Szene eine Bildserie in cn/, Bosszustand im Dateinamen
python3 site/tools/szenen-auswahl.py                # gewählte Bilder (oben im Skript) -> native/*.webp + focus.json
node site/tools/render-assets.mjs /tmp/assets       # Posen auswählen und nach site/img kopieren
```

Die Aufnahme hält den Helden unverwundbar, friert für jedes Bild die Spielschleife ein und entfernt Schadenszahlen,
Trefferblitze und Lebensbalken. Szenen, Ausrüstung und Posen stehen jeweils oben in den Skripten. Nach neuen
Figuren die `width`/`height` in index.html und die Höhen in site.css (`.hero-fig`, `.boss img`, `.riders img`) anpassen.

Die Skripte erwarten Playwright global (`/opt/node22/lib/node_modules/playwright`) und Chromium unter `/opt/pw-browsers`.
