# Story-Clips (src/story)

Kurze Szenen in Spielgrafik an festen Stellen der Geschichte (Geschichte: Claude Doc „Emberwrath – Die Geschichte“,
Kopie unter /mnt/project-files/story/geschichte.md).

- `index.js` – `installStory(game)` registriert das Sitzungssystem `story` (Reihenfolge 90, zeichnet über allem).
  Prüft die Auslöser aus `clips.js`, spielt einen Clip und setzt danach das Weltflag `clip:<id>` (einmal je Charakter).
- `Cinematic.js` – Abspielgerät: Breitbild-Balken, Kamera, ganzzahlige 2×-Nahaufnahme, Blitze ohne Alpha,
  Sprechzeilen mit Schreibmaschine (PixelFont, über `tr()` übersetzt).
- `clips.js` – die Clips als Daten mit kleinen Funktionen (`beats`, `camera`, `lines`, `closeups`, `drawWorld`, `end`).
- `sigil.js` – das Zeichen der Flammenkrone, von Hand gezeichnet, brennt sich pixelweise ein.

Regeln (Online-Spiel): Die Welt hält nie an. Jede Eingabe nach 0,45 s überspringt den Clip. Ein Clip startet nur,
wenn der Held seit 2 s nicht im Kampf war; stirbt er, wechselt die Zone oder wird der Boss anders geweckt, endet der
Clip sofort. `end(c, skipped)` stellt immer den Zustand her, den das Spiel danach braucht (z. B. Boss im Kampf).

Gemeinsame Dateien (Architektur): `PlayScene.js` liest `session.cameraFocus` ({ x, y } oder null) für die Kamera,
`main.js` ruft `.use(installStory)`. Sonst nichts.

Auslöser `bossGate`: Held steht zwischen Knochentor und Arena (bis 14 px vor `arena.y0 + 8`), Boss schläft noch.
Der Clip weckt den Boss selbst (`engage`) und schließt das Tor.
