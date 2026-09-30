# Emberfall – Architektur

> Zustand, Szenen, Speichern, Server-Schnittstelle, Inhalts-IDs und Dateizuteilung stehen in
> **docs/INTEGRATION.md** (verbindlich). Grafikstil in **docs/STYLE.md**, Weg zum Online-Betrieb in
> **docs/MULTIPLAYER.md**, Fortschrittslogik in **src/progression/README.md**. Dieses Dokument beschreibt die Engine.

Reines HTML + JavaScript (ES-Module) + Canvas 2D. Keine Abhängigkeiten, keine Bilddateien: alle Grafik ist prozedural.

## Starten

- Entwicklung: `npm run dev` (oder beliebiger statischer Server im Projektordner), dann `http://localhost:8080`.
  ES-Module laufen nicht über `file://`, daher der Server.
- Build: `npm run build` → `dist/emberfall.html` (eine Datei, läuft per Doppelklick)
  und `dist/emberfall.fragment.html` (ohne Dokument-Gerüst, zum Einbetten/Artifact).
- Logiktests: `node src/progression/test/logic.test.mjs` (läuft ohne Browser).

## Leitprinzipien

1. **Ein Zustand, nur Commands schreiben** (`core/GameState.js`): Slices je Bereich, Änderungen über
   `state.commit(type, payload)`; Belohnungen sind `authoritative` und laufen über `core/Authority.js`
   (heute lokal, später Server).
2. **Interne Pixel-Auflösung 480×270** (quer) bzw. **270×360–480** (Hochformat auf dem Handy, nur im Spiel),
   ganzzahlig hochskaliert, wenn das ≥ 85 % der Fläche nutzt. `CONFIG.viewWidth/viewHeight` ändern sich zur Laufzeit –
   immer live lesen.
3. **Fester Simulationstakt 60 Hz** (`core/GameLoop.js`), Rendering entkoppelt; Fehler in einem Frame werden
   gefangen und gemeldet, die Schleife läuft weiter.
4. **Systeme sprechen über Events** (`core/events.js`, `EventBus.scope()` pro Sitzung): Gameplay meldet
   `enemy:killed`, `hit` …; Fortschritt, HUD, Effekte und Ton reagieren. Gameplay-Code kennt keine Effekte.
5. **Inhalte als Daten** (`core/Content.js`): Zonen, NPCs, Gegner, Items, Quests, Rezepte, Sets – dieselben
   Definitionen könnte ein Server laden.
6. **Aktionsbasiertes Input** (`core/Input.js`): Tastatur, Maus und Touch speisen dieselben Aktionen.
7. **Prozedurale Pixel-Art, erzeugt bei Bedarf** (`Assets.js`): `assets.sprites.x` ist ein Getter, der die Grafik
   beim ersten Zugriff baut und sich dann ersetzt. Der Titel steht dadurch in ~0,3 s; jede Zone baut beim
   ersten Betreten nur ihre eigenen Gegner (der Zonenübergang deckt das ab). `Assets.js` bleibt die Stelle,
   an der später echte Spritesheets (PNG + JSON) eingehängt werden.
8. **Gerät vs. Spielstand:** Einstellungen (`game.prefs`, `core/Prefs.js`) liegen pro Gerät, der Spielstand pro
   Charakter (`core/SaveStore.js`). Darstellungsqualität ändert nie die Spiellogik.

## Laufzeit

```
main.js ─ installCharacter (A) → installAccount (A) → installWorld (B) → installProgression (C) → installUi (D)
          (A vor C: Startausrüstung je Klasse)
Game ──── Szenen: title → account → characters → characterCreate → play
   │      Dienste: bus, state, save, prefs, content, assets, input, sfx, panels, authority
PlayScene (eine Spielsitzung)
   ├─ World (B): Karte, Entities, Kampf, Questpfad, Prüfungs-Regie
   ├─ Sitzungssysteme: Fortschritt (C), HUD/Karte/Effekte/Musik (D) …
   ├─ Kamera (Wackeln abschaltbar), Hitstop, Zeitlupe, Autosave, Respawn, Zonenreise
   └─ PanelHost: ein Panel zur Zeit (Inventar, Charakter, Quests, Talente, Händler, Schmiede, Bank …)
```

**Speichern:** alle 20 s, bei Stufenaufstieg, Quest angenommen/abgeschlossen, Bosssieg, Zonenwechsel, beim
Verstecken/Schließen der Seite. Alte Spielstände werden beim Laden von den Slices selbst migriert
(`deserialize(raw, version)`); geprüft mit Ständen aus v2 (3 Ausrüstungsplätze, 24 Taschenplätze, alte Quests)
und v3. Unbekannte Items/Quests werden verworfen statt zum Absturz zu führen; fehlt der Account zu „Fortsetzen“,
bleibt das Spiel im Titel.

## Dateistruktur (Kurzform)

```
index.html, styles.css        Einstieg, UI-Baukasten (ef-*)
src/
  main.js  Game.js  config.js  Assets.js
  scenes/PlayScene.js         Spielsitzung
  core/                       GameState SaveStore Prefs Authority Content SceneManager PanelHost
                              EventBus events GameLoop Input Camera dom math
  account/ character/         Thread A – Titel, Accounts, Charaktere, Klassen, Fähigkeiten, Talente, Held
  world/ entities/ systems/   Thread B – Zonen, Karten, Gegner, Bosse, Kampf, Questpfad, Glutprüfungen
  progression/                Thread C – XP, Quests, Beute, Inventar, Händler, Schmiede, Sets, Bank, Erfolge
  ui/ gfx/ audio/             Thread D – HUD, Karte, Einstellungen, Effekte, Licht, Musik, Ton
  sprites/                    Prozedurale Pixel-Art (Besitz je Datei, siehe INTEGRATION.md §9)
tools/build.mjs               Zero-Dependency-Bundler → dist/
docs/                         INTEGRATION, ARCHITECTURE, MULTIPLAYER, STYLE
```

## Render-Pipeline (pro Frame)

1. Vorgerenderter Hintergrund der Zone + Dekal-Ebene, Questpfad am Boden
2. Y-sortierte Szene: Props, Akteure, Projektile (+ Schatten)
3. **Lightmap** (Umgebungsdunkel + additive Lichter, `multiply`), Wetter
4. **Emissive-Pass**: Flammen, Augen, Treffer-Blitz, Hiebe, Funken, Schadenszahlen
5. Bloom, Vignette; HTML-HUD darüber (DOM, nicht im Canvas)

## Leistung (gemessen 2026-09-30, Chromium ohne GPU)

| Messung | Wert |
|---|---|
| Bis Titelbild | ~0,3 s (vorher 3,4 s, alle Grafiken beim Start) |
| Erstes Betreten einer großen Zone | ~1,0–1,4 s, danach aus dem Speicher |
| Update / Render pro Bild, volle Zone | ~0,6–1,2 ms / ~6–7,5 ms |
| Speicher nach 30 Zonenwechseln | gleichbleibend ~11 MB JS-Heap, DOM konstant |

## Nächste sinnvolle Schritte

- Echte Spritesheets (Aseprite-Export) über `Assets.js` einhängen
- Zonen-Grafik im Leerlauf vorab erzeugen (Nachbarzonen), damit auch der erste Zonenwechsel sofort ist
- PWA-Manifest + Service Worker (Offline, Startbildschirm-Symbol), Haptik
- Darstellungsfreier Simulationskern für den Server (siehe MULTIPLAYER.md)
