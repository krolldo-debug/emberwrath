# Sprachen (Deutsch / Englisch)

Emberwrath gibt es auf Deutsch und Englisch. Der Code bleibt deutsch: **jeder deutsche Anzeigetext ist sein eigener
Schlüssel**, die englische Fassung steht in `src/i18n/en.js`. Übersetzt wird erst beim Anzeigen, Spiellogik und IDs
bleiben unberührt.

| Datei | Zweck |
|---|---|
| `index.js` | Sprache wählen (`?lang=`, gespeichert unter `emberwrath:lang`, sonst Browsersprache: `de*` → Deutsch, sonst Englisch), `tr()`, `fmtNum()`, `fmtDate()`, `langSwitch()`, `installI18n()` |
| `translate.js` | Übersetzer: exakte Texte, Muster mit `{0}`, Großschreibung (PixelFont), Zerlegen an Trennern und Zahlen |
| `en.js` | Wörterbuch Spiel (Schlüssel = deutscher Text) |
| `i18n.css` | Umschalter auf dem Titelbild |
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
5. Nach neuen Texten: `node tools/i18n-check.mjs` und fehlende Einträge in `en.js` ergänzen. Fehlt einer, erscheint der Text im Englischen deutsch.
6. Auch englisch nie: demo, prototype, local, single-player.

Entwicklung: `?lang=en&i18n=1` sammelt zur Laufzeit fehlende Texte in `window.__i18nMissing`.
