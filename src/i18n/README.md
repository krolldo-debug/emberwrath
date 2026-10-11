# Sprachen (Deutsch, Englisch, Spanisch, Französisch)

Das Spiel gibt es auf Deutsch, Englisch, Spanisch und Französisch, die Website auf Deutsch und Englisch. Der Code bleibt
deutsch: **jeder deutsche Anzeigetext ist sein eigener Schlüssel**, die Fassungen stehen in `en.js`, `es.js` und `fr.js`. Übersetzt wird erst beim Anzeigen, Spiellogik und IDs
bleiben unberührt.

| Datei | Zweck |
|---|---|
| `index.js` | Sprachen (`LANGS`), Sprache wählen (`?lang=`, gespeichert unter `emberwrath:lang`, sonst die erste unterstützte Browsersprache, sonst Englisch), `tr()`, `fmtNum()`, `fmtDate()`, `langSwitch()` (Auswahl „Languages / Sprachen“), `installI18n()` |
| `translate.js` | Übersetzer: exakte Texte, Muster mit `{0}`, Großschreibung (PixelFont), Zerlegen an Trennern und Zahlen |
| `en.js` | Wörterbuch Englisch (Schlüssel = deutscher Text), zugleich die Liste aller Texte |
| `es.js`, `fr.js` | Spanisch, Französisch, gleiche Schlüssel wie `en.js`. Fehlt dort ein Text, erscheint er englisch |
| `i18n.css` | Sprachauswahl (Titelbild, Einstellungen) |
| `../../site/i18n/` | Website: `/en/…` wird beim Build aus den deutschen Seiten erzeugt (`build-en.mjs`, Texte `en.json`) |
| `../../tools/i18n-check.mjs` | listet deutsche Texte im Code ohne englische Fassung |

## Wo übersetzt wird
- **DOM:** ein MutationObserver übersetzt Textknoten und die Attribute `title`, `placeholder`, `aria-label`, `alt`.
  Das Original bleibt gemerkt; der Umschalter wechselt ohne Neuladen.
- **PixelFont** (Namen über Köpfen, Schadenstexte): `font.draw()`/`measure()` übersetzen selbst. Spielernamen mit `{ raw: true }` zeichnen.
- **Zahlen und Daten:** im Englischen wird aus `toLocaleString('de-DE')` automatisch `en-US`. Neuer Code nimmt `fmtNum()` / `fmtDate()`.
- `alert` / `confirm` / `prompt` werden übersetzt.

## Regeln für neue Texte
1. Jeden angezeigten Satz als **einen** String oder **ein** Template-Literal schreiben: `` `Stufe ${n} erreicht` ``, nicht `'Stufe ' + n + ' erreicht'`.
   Im Wörterbuch wird daraus `"Stufe {0} erreicht": "Reached level {0}"`. Eingesetzte Werte (Namen, Gegenstände) werden mit übersetzt.
2. Nichts, was nicht übersetzt werden darf (Spielernamen, Chat anderer Spieler), bekommt `translate: 'no'` (oder die Klasse `notranslate`).
3. Keine Logik auf angezeigtem Text (kein Vergleich mit `textContent`). Wer selbst vergleicht, vergleicht mit `tr(text)` (siehe `setText` in ui/Hud.js).
4. Texte, die jedes Bild neu gesetzt werden, vor dem Vergleich mit `tr()` übersetzen, sonst wird der DOM-Knoten jedes Bild neu geschrieben.
5. Nach neuen Texten: `node tools/i18n-check.mjs` und fehlende Einträge in `en.js` ergänzen (fehlt einer, erscheint der Text
   im Englischen deutsch), danach dieselben Schlüssel in `es.js` und `fr.js` (`--lang es` listet, was dort fehlt).
6. In keiner Sprache: demo, prototype, local, single-player (und deren Übersetzungen).
7. PixelFont kennt A–Z, Ä Ö Ü ß, die spanischen und französischen Akzente (Á É Í Ó Ú Ñ À Â Ç È Ê Ë Î Ï Ô Ù Û Œ, ¿ ¡ « »),
   Ziffern und Satzzeichen; Akzente stehen bis 3 Pixel über der Schrift (`font.ascent(text)` sagt, wie viel Platz nötig ist).
8. Wörterbücher (en/es/fr) liegen nicht im Spiel-Skript: der Build schreibt `spielen/sprache-xx.<hash>.js`, das Spiel lädt
   nur die gewählte Sprache (vor dem Start bzw. beim Umschalten). Deutsch lädt nichts nach.

Neue Sprache: `xx.js` mit `export const XX = {…}` anlegen, in `LANGS` (index.js) eintragen, Anführungszeichen in translate.js (`QUOTES`).

Entwicklung: `?lang=en&i18n=1` sammelt zur Laufzeit fehlende Texte in `window.__i18nMissing`.
