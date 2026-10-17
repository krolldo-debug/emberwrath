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
  `tools/szenen-auswahl.py` (Pillow). Die Malgareth-Szene ist mit `tools/keyart.mjs` inszeniert.
  Anzeige: `img.shot` mit `--fx/--fy` (Bildpunkt, der in die Mitte soll), auf dem Handy (≤ 820 px) `--mx/--my`, falls gesetzt. CSS gibt je Breite einen Faktor `--f`
  vor (×2; großer Streifen ab 1200 px ×3; ab 1921 px sonst ×3; Handy Streifen ×1,67 (5 Gerätepixel bei 3×), sonst ×1); site.js rundet ihn auf ganze Bildschirmpunkte und füllt den Rahmen. Nie
  `object-fit: cover` oder CSS-Filter auf diese Bilder legen.
- `held-*`, `volk-*`, `skill-*`, `npc-*`, `logo.png`: direkt aus dem Spielcode gerendert (`tools/render-assets.mjs`); `boss-*` und `item-*` mit `tools/render40.mjs`.
- Klassen (`tools/klassen-kampf.mjs`, echte Spiellogik, Gegner wird nicht verletzt), Streifen aus 104 × 66 Weltpixeln je Bild in doppelter
  Detailauflösung, 12 Bilder pro Sekunde: `kampf-<klasse>.webp` (Kampf beim Wechsel), `ruhe-<klasse>.webp` (nahtlose Ruheschleife) und
  `kampf-<klasse>-1…4.webp` (je eine Fähigkeit, Reihenfolge wie auf der Seite). site.js spielt Kampf → Ruhe → reihum eine Fähigkeit
  (oder die angeklickte); die Bildzahlen stehen in `data-n` an `.fight` (Ausgabe des Skripts). Erdspalter bekommt einen
  glühenden Bodenriss (das Spiel brennt ihn nur in die Bodenebene, die hier nicht mitgezeichnet wird).
- Bosskino (`tools/bosskino.mjs` ruft `tools/bosskino.py`, je Boss ein Modul `tools/bosskino_<boss>.py`; gezeichnet von
  `bosskino.js`): eine breite Bühne im Stil des Titelbilds, Szene 560 × 216 Szenenpixel, Figur und Ebenen 1:1, ganzzahlig in
  Gerätepixeln vergrößert, Ebenen (fern, mitte, boden, vorn, je mit Leuchtebene in harten Stufen) verschieben sich nur in ganzen
  Szenenpixeln. Jeder Boss ist eigene Pixel-Art (Farben nach den Boss-Sprites des Spiels in `src/sprites/`), gezeichnet aus Teilen
  mit 4-Ton-Rampen, Umriss und Randlicht, Blick nach links. Ruhe als Teile mit eigenen Zyklen (Atem, Flammen, Umhang …), die Attacke
  als ganze Bilder (Ausholen, Halten, Einschlag mit 1-px-Erschütterung, Nachklang); Warnfläche, Fugenwelle, Feuerwand, Geisterflammen,
  Wurzeldornen, Sporenwolken und Eiszapfen als Bildfolgen und Ereignisse relativ zum Einschlag. Ziel der Attacke ist ein Held:
  die echte Spielfigur (Krieger im Ritterharnisch, `tools/bosskino-held.mjs` rendert sie mit getHeroSprites, RES 2, nach
  `tools/bosskino-held.png`/`.json`; Server im Repo-Ordner, danach bosskino.mjs neu), 1 Weltpixel = 1 Szenenpixel wie die
  Reittier-Parade, dem Boss gegenüber (Fußpunkt je Boss in `HELD` in bosskino.py, im Bildausschnitt auch am Handy). Er zeigt nur
  die Kampfhaltung des Spiels, beim Treffer einen harten Blitz und die Trefferbilder (kurz zurück), kein Sterben, keine Zahlen
  oder Leisten; Feuer- und Wasserwand rollen über ihn, ihre Spur brennt hinter ihm, Skalvyrs großer Zapfen schlägt bei ihm ein. Je Boss ein verlustfreier Atlas
  `bosskino-<boss>.webp`; Rechtecke, Bildfolgen und Zeiten schreibt das Werkzeug in den Block `<bosskino.mjs>` in `bosskino.js`
  (ein Teillauf ersetzt nur die genannten Bosse). `bosskino.webp` ist das Standbild (Malgareth, ohne JS und bei reduzierter
  Bewegung; dort wechselt ein Klick das Standbild). bosskino.js wechselt alle 9–10 s den Boss (Blöcke zerfallen von unten mit
  glühender Kante), Auswahl als ARIA-Tabs (Klick, Pfeiltasten, Pos1/Ende), Fortschrittslinie unter dem aktiven Boss; lädt die
  Atlanten erst kurz vor Sichtbarkeit, läuft nur, solange sichtbar, nicht bei Datensparmodus.
- Reittier-Parade (`tools/reittiere-gang.mjs`, Maße in `tools/reittiere-gang.json`): `gang-<reittier>.webp` je Gangart (Galopp, Sprung,
  Trab, Flug …), Sprunghöhe je Bild in `data-l`; Boden aus Steppenkacheln in zwei Ebenen `parade-nah.webp` und `parade-fern.webp`
  (`tools/parade-boden.mjs`, nahtlos kachelbar, Lauflinie und Versatz in `data-near-y`/`data-far-y` an `.parade`). Werte in `data-f`
  der Namensliste (Breite, Höhe, Fuß x/y, Bilder, fps, Flughöhe, Tempo); site.js zeichnet die Parade in ganzen Bildschirmpunkten,
  die Kamera zieht mit, unter der Bühne steht der Name des Tiers in der Mitte.
- Titelbild „Aufbruch zum Aschethron“ (`tools/titel-held.mjs` mit `tools/titel-held.py`, gezeichnet von `titel.js`): eine
  Pixelgröße für alles – Szene 640 × 272 Szenenpixel, jede Ebene und der Held 1:1, ganzzahlig vergrößert, keine Ebene skaliert
  oder verzerrt. Held als eigene Pixel-Art (Rüstung des Aschenfürsten und Zweihänder Königsfall, Farben aus `character/gearLook.js`),
  Kruste und Lavastrom aus den Lava-Generatoren des Spiels, Aschethron als gezeichneter Schattenriss. Ebenen
  `titel-fern/-strom/-mitte/-nah` (je mit `-glut`), Held in Ruhe aus `titel-held-umhang` (8 Bilder), `-koerper` (Atem, 6),
  `-flamme` (6) und `-klinge`, Momente als ganze Bilder in `titel-held-momente`, Glutwelle des Erdspalters `titel-welle` (Bildfolge über
  die Fugen der Kruste). Bildfolgen, Dauern, Treffer und Maße schreibt das Werkzeug in den Block `<titel-held.mjs>` in `titel.js`.
  `titel.webp` ist das Standbild (LCP, vorgeladen; auch ohne JS und bei reduzierter Bewegung). titel.js legt es pixelgenau
  aus, verschiebt Ebenen nur in ganzen Szenenpixeln (Schweben, Maus) und zeigt alle 6–8 s abwechselnd Erdspalter (Ausholen,
  Halten, Einschlag mit Erschütterung, Glutwelle über die Fugen, Staub, Funken) und Schlachtruf (Klinge hoch, Kopf in den
  Nacken, Umhang weht auf, Funkenring, Feuerschalen lodern);
  läuft nur, solange sichtbar, nicht bei Datensparmodus.
- Vorschaubild beim Teilen (`og-teilen.png`, 1200 × 630, auf allen Seiten und Sprachfassungen als og:image und twitter:image): `tools/og.py`
  aus den Paradestreifen. Neues Motiv = neuer Dateiname, sonst zeigen Messenger das alte Bild aus ihrem Zwischenspeicher.
- Die Skripte schreiben PNG; für die Seite verlustfrei nach WebP wandeln (Pillow: `Image.open(f).save(o, lossless=True, method=6)`).
- Seite /welt („Von der Glutsenke zum Aschethron“, `welt.html`, `welt.css`, `welt.js`): ein Weg von Stufe 1 bis 40 mit
  Stufenschildern (welt.js füllt die Spur und schaltet erreichte Schilder um), sechs Etappen abwechselnd links und rechts,
  dazwischen randlose Bänder (Glutarena ab Stufe 10, Reittier-Parade ab Stufe 20, Mitspieler und Städte) und zwei große
  Auftritte (Glutschmiede mit Ignaroth, Thronsaal mit Malgareth). Alles hart: Glutkanten aus drei Farbbändern, gezeichnete
  Rahmen, Knöpfe auf dieser Seite ohne Schein. Szenen `reise-*.webp` (960 × 540) aus `tools/welt.mjs welt-…`
  (`welt-aufbruch`, `-glutsenke`, `-aschenwald`, `-arena`, `-schlacke`, `-ignaroth`, `-steppe`, `-marsch`, `-frostzinnen`,
  `-aschethron`; PNG `…-NN.png` je Bild, bestes Bild wählen und verlustfrei nach WebP), `welt-gruppe.webp` aus `leben-gruppe`.
  Einstiegsbild fürs Handy hoch (≤ 430 px): `reise-aufbruch-handy.webp` = Bildpunkte x 294–666 (volle Höhe) aus
  `reise-aufbruch.webp`, per `<picture>` geliefert, `data-handy="294 372"`; nach neuem Einstiegsbild neu schneiden.
  Szenen mit `loading="lazy"` lädt die Seite erst nach dem ersten großen Bild (`.vorlauf`: lang.js, site.js, site.css).
  Die Glutarena nimmt welt.mjs in `pvp_arena` vor der Nordwand auf (Schmelztiegel, Kohlebecken; Heimweg der Arena abgeschaltet),
  das Band zeigt sie enger (`.band.nah`, ×2). Dungeon-Marken: Gebiet und Stufe als zwei `<b>` (Umbruch nur vor der Stufe),
  darunter der Bossname; der Text bleibt in seiner Spalte. Bossfiguren der Dungeon-Marken
  `tor-*.png` mit `tools/bossfiguren.mjs` (erstes Ruhebild, 1:1, auf der Seite halb). Bildausschnitt je Bild über
  `--fx/--fy` (Handy `--mx/--my`) am `img.shot`, `--ay` setzt die Stelle im Rahmen (Einstieg: Mitte unter der Kopfleiste).
  Die Parade dort zeigt keinen Tiernamen (nur für Screenreader).
- Parade (Startseite und /welt, beide `data-hart`: keine Maske an den Rändern, kein Auslauf unten, einfarbiger Grund):
  Größe 4 bzw. 3 Bildschirmpunkte je Weltpixel, aber höchstens so groß, dass die Bühne
  in 60 % der Fensterhöhe passt (Handy quer); sie zeichnet beim Laden und nach Größenänderungen sofort ein Standbild.
- `gewoelbe.webp`, `gewoelbe-breit.webp`: Titelbild des Spiels als Hintergrund für Support und Newsletter (`tools/gewoelbe.mjs`).
  Die Seite vergrößert sie ganzzahlig und pixelgenau (Klassen ×6/×5/×4, Handy gut ×3, Bosskino ganzzahlig in Gerätepixeln, Parade 4 bzw. 3 Bildschirmpunkte je Weltpixel, Symbole ×2).

Neu erzeugen, aus einer Kopie des Projekts:

```sh
node tools/build.mjs
npx http-server dist -p 8101 -s &     # gebündeltes Spiel für szenen.mjs
npx http-server .    -p 8102 -s &     # Module direkt für render-assets.mjs
node site/tools/szenen.mjs cn [ids,kommagetrennt]   # je Szene eine Bildserie in cn/, Bosszustand im Dateinamen
python3 site/tools/szenen-auswahl.py                # gewählte Bilder (oben im Skript) -> native/*.webp + focus.json
node site/tools/keyart.mjs ka [ids]              # Streifen (kampf-*.webp): feste Aufstellung, Warnflächen
                                                   # ausgeblendet, Gegenlicht, Farbgebung eingerechnet
node site/tools/render-assets.mjs /tmp/assets       # Posen auswählen und nach site/img kopieren
node site/tools/klassen-kampf.mjs out              # Klassen: Kampf, Ruhe, Fähigkeiten (Bildzahlen → data-n in index.html)
node site/tools/bosskino.mjs [malgareth,faeulnis,skalvyr]  # Bosskino: Atlanten, Standbild, Block in bosskino.js (Pillow, numpy)
node site/tools/reittiere-gang.mjs out              # Reittiere in eigener Gangart
node site/tools/parade-boden.mjs site/img          # Steppenkacheln der Parade (nah, fern)
node site/tools/titel-held.mjs                     # Titelbild (Server im Repo-Ordner auf :8123; ruft titel-held.py)
node site/tools/welt.mjs wl aufbruch,arena,ignaroth # Szenen auf /welt (Ids ohne „welt-“)
node site/tools/bossfiguren.mjs site/img          # Bossfiguren der Dungeon-Marken auf /welt
```

Die Aufnahme hält den Helden unverwundbar, friert für jedes Bild die Spielschleife ein und entfernt Schadenszahlen,
Trefferblitze und Lebensbalken. Szenen, Ausrüstung und Posen stehen jeweils oben in den Skripten. Nach neuen
Figuren die Maße in index.html (`data-n`, `--w/--h`, `data-f`) aus der Skriptausgabe übernehmen.

Die Skripte erwarten Playwright global (`/opt/node22/lib/node_modules/playwright`) und Chromium unter `/opt/pw-browsers`.
