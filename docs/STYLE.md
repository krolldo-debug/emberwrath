# Emberfall – Stilregeln für Pixel-Art und UI

Gilt für alle neuen Sprites (A: Held/Völker/Klassen, B: Gegner, NPCs, Außenbereich) und
jede HTML-Oberfläche. Verantwortlich: Thread D. Werkzeuge liegen in `src/gfx/`.

## Grundlagen

| Thema | Regel |
|---|---|
| Auflösung | Intern 480×270, Tile 16 px. Nichts hochskalieren: Details entstehen durch Pixel, nicht durch Vergrößern. |
| Figurengrößen | Held/Humanoide 22–28 px hoch (Fußpunkt = Anker). Kleine Kreaturen 10–16 px, Wolf ~24×16, Boss 40–56 px. |
| Perspektive | 3/4-Draufsicht. Boden leicht gestaucht (Ellipsen y ≈ 0,5–0,6 × x). |
| Licht | Kommt in allen Sprites **von oben links**: hellste Kante oben/links, Schatten unten/rechts. Die Szene wird zusätzlich per Lightmap beleuchtet – Sprites nicht selbst „glühen“ lassen (dafür `renderEmissive`). |
| Umriss | Immer über `buildFrame(...)`/`outlineCanvas()` (1 px). Standard ist der **selektive Umriss**: fast schwarz, an Oberkanten leicht im Materialton. Keine eigenen schwarzen Konturen zusätzlich zeichnen. |
| Palette | Farben nur aus `PAL` (`gfx/Palette.js`) bzw. Rampen mit 3–5 Stufen (dunkel → hell). Pro Material eine Rampe, keine Einzelfarben „nach Gefühl“. Neue Rampen dürfen in eigenen Dateien stehen, sollen aber Sättigung und Helligkeit der vorhandenen treffen. |
| Materialien | Metall: harter Glanzpunkt (1–2 px `steel[5]`), dunkle Spiegelung. Stoff/Leder: weiche Stufen, kein Glanz. Knochen: warmes Elfenbein `bone`. Magie/Glut: nur in Emissive-Pässen und Partikeln. |
| Dithering | Sparsam, nur für große Flächen (`PixelCanvas.vgrad(x, y, w, h, rampe)` = gerasterter Verlauf). Keine Anti-Aliasing-Kanten, keine Halbtransparenz in Sprites (außer Spinnweben/Rauch). |
| Animation | Idle 4 Frames (~6 fps, Atmen 1 px), Laufen 6 Frames (~12 fps), Angriff Ausholen–Treffer–Nachschwung (3–5 Frames, Trefferframe klar lesbar), Treffer 1–2 Frames, Tod 4–6 Frames. Jede Figur braucht `idle`-Frame 0 mit Kopf im oberen Bereich (HUD-Porträt schneidet 32×32 über dem Körper aus). |
| Lesbarkeit | Gegner müssen sich vom Boden abheben: mindestens eine helle Akzentfarbe (Augen, Waffe, Muster). Feindliche Hiebe kalt (Blau/Weiß), eigene warm (Glut/Gold). |

## Stimmung

Violett-schwarze Schatten (`CONFIG.lighting.ambient`), warmes Fackellicht (`[255,150,70]`),
kontrastreiche, kurze Effekte. Die Farbstimmung (oben kühles Violett, unten warme Glut) und die
Vignette legt `ui/ScreenFx.js` über jedes Bild – Zonen müssen das nicht selbst tun.
Außenbereiche dürfen heller und grüner sein (höheres `ambient`), aber gleiche Umriss- und Lichtregeln.

## Effekte für Fähigkeiten und Welt (Thread D stellt bereit)

Alles über den Bus der Sitzung (`session.bus.emit(...)`), das Feedback-System erzeugt Partikel, Licht, Ring und Ton:

| Event | Nutzlast | Wirkung |
|---|---|---|
| `cast` | `{ actor, element }` | Glühen und Funken an der Hand, kurzer Lichtblitz, Zauberton |
| `spellImpact` | `{ x, y, element, radius?, big? }` | Druckwelle, Element-Funken, Lichtblitz, bei Feuer Brandfleck, bei `big` Wackeln + Hitstop |
| `aura` | `{ actor, element }` | Ring um die Figur, aufsteigende Funken (Buffs, Schreie, Heilung) |
| `heal` | `{ actor, amount }` | grüne Zahl, goldener Ring |

`element`: `fire | frost | holy | shadow | arcane | poison | nature | physical`
(Farben/Licht/Ton in `ELEMENTS`, `gfx/Particles.js`). Direkt nutzbar: `world.particles.element(x, y, element, count, radius)`,
`new Shockwave(x, y, { radius, color, life })` und `new LightPillar(x, y, {...})` aus `entities/Effects.js`.

Fortschritt (XP, Stufe, Beute, Gold, Quests, Boss) zeigt D automatisch aus den C-/B-Events an –
dafür keine eigenen Toasts oder Banner senden. `ui:toast`/`ui:banner` nur für Sonderfälle.

## Icons (v2, Runde 2)

`gfx/Icons.js`: 24×24-Icons (26×26 mit Umriss), prozedural, Licht von oben links.
- HTML: `iconEl(id, cssSize)`, `iconUrl(id)`; Items mit Seltenheitsrahmen: `itemIconEl(def, cssSize)`
  (Rahmenfarbe je Seltenheit, ab `rare` Eckbeschläge und Glanz, `epic`/`legendary` pulsieren).
- Canvas: `iconCanvas(id)`; Beute am Boden: `drawLoot(ctx, def, x, y, t, { bob, emissive })`
  (kleines Bodensprite, ab `uncommon` Lichtsäule in Seltenheitsfarbe, `epic`/`legendary` mit Funkeln), `lootSprite(defOrId)`.
- Seltenheiten: `common uncommon rare epic legendary` – Farben in `RARITY_COLORS` / `rarityRgb(r)`, CSS-Klassen `.r-<rarity>`.
- Item-IDs: `ICON_IDS` (≈146). Familien mit Varianten, z. B. `sword_rusty|iron|steel|broad|sabre|long|bone|rune|ember|frost|obsidian|royal`,
  `dagger_*`, `axe_*`, `mace_*`, `staff_*`, `wand_*`, `bow_*`, Rüstung `robe_* leather_* mail_* plate_*`, `helm_* hood`,
  `gloves_cloth|leather|mail|plate|ember`, `boots_cloth|leather|mail|plate|ember`, `ring_* amulet_* charm_*`,
  `potion_hp_s|m|l potion_mana_s|m|l elixir`, Material/Quest (`ore_* gem_* key_* seal relic map letter …`).
  Unbekannte ID → Familie vor dem ersten `_` → `bag`.
- Fähigkeiten: `SKILL_ICON_IDS` (`skill_fireball frostbolt nova lightning heal holy shield charge whirlwind rage arrows poison
  stealth shadow slash shout knives pierce flame_nova blink`). `abilityIcon(abilityId, def)` wählt das Emblem je Fähigkeit
  (`ABILITY_ICONS`), sonst `def.icon`.
- UI: `ui_bag ui_character ui_quests ui_menu ui_map ui_dodge ui_interact`.
Neue Icons über Thread D.

## Kampfeffekte (Runde 2)

`entities/Effects.js` (Emissive-Pass): `ImpactStar` (Trefferstern), `NovaBurst` (gefüllter Element-/Flammenring),
`SpinVortex` (Wirbel um eine Figur), `RiftFlash` (Portalriss), `ChargeGlow` (Aufladen an der Hand), `SoulWisp` (Seelenlicht beim Tod),
dazu `Shockwave`, `LightPillar`, `SlashEffect`, `Afterimage`.
Das Feedback-System hängt an das Event `ability` (`{ actor, abilityId }`, sendet der Held nach `impl.start`) je Klassenfähigkeit
eine eigene Effektschicht; unbekannte Fähigkeiten bekommen einen neutralen Ring. Jeder Heldentreffer zeigt einen Trefferstern
(kritisch: größer, 8 Strahlen, Bodenring), jeder Kill ein aufsteigendes Seelenlicht.

## Objekte (`assets.props`, Thread D)

`torchBracket, torchFlame, brazier, brazierFlame, pillar, candles, candleFlame, bonePiles[4], banner, chains,
cobwebL/R, rune, barrel, crate, urns[3], sarcophagus, chest[geschlossen, offen]` – alle als `SpriteFrame`
(`.draw(ctx, x, y)` am Fußpunkt) außer Flammen (Frame-Canvas-Listen) und Spinnweben/Rune (Canvas).

## HTML-Oberflächen

- Klassen `ef-*` aus `styles.css` benutzen, Aussehen kommt aus `ui/theme.css`.
- Farben als CSS-Variablen: `--ef-gold --ef-ember --ef-text --ef-muted --ef-panel --ef-panel-edge --ef-danger`,
  Ressourcen `--ef-hp --ef-mana --ef-rage --ef-energy --ef-xp`. Seltenheit: `.r-common/.r-uncommon/.r-rare/.r-epic`.
- Schrift: Fließtext `--ef-font`, Überschriften `--ef-font-title`. Mindestens 14 px in Panels, 11 px im HUD.
- Touch: `<html>` trägt `.ef-touch`, sobald Touch benutzt wird. Ziele dann ≥ `--ef-touch` (52 px), sonst ≥ 44 px.
  Keine Hover-only-Informationen (Tooltips müssen auch per Tippen erreichbar sein).
- Panels scrollen selbst (`.ef-panel` hat `max-height: 88vh; overflow: auto; touch-action: pan-y`).
- Ehrlichkeit: Texte sagen „lokal“, „auf diesem Gerät“, „Lokale Instanz“ – nie „online“, „Server“, „andere Spieler“.

## Runde 3: Hochformat, Karte, Branding, Einstellungen (Thread D)

- **Hochformat:** In `play` ist das interne Bild auf hohen Schirmen 270 × 360–480 (INTEGRATION.md §11.9). `<html class="ef-portrait">`
  schaltet das HUD um: Infos oben, Steuerung unten, Minimap rechts unter Zone/Gold. Größen immer live aus `CONFIG.viewWidth/viewHeight`.
- **Minimap / Zonenkarte:** `ui/Minimap.js`. Minimap im HUD (Taste M oder Antippen → Panel `map`). Karte = verkleinerter
  `world.background`, Wände dunkel, Wandkanten hell. Marker: Held (Pfeil), Portal (lila Raute), Gegner (rot), Elite (orange),
  Boss (Schädel), NPC `!`/`?` (aus `npcMarker`), Questziel (goldener Ring; außerhalb: Pfeil am Rand). `resolveTarget(session, questTarget)`
  ist exportiert (Portal zur Zielzone über `zone.links`).
- **Glutprüfung:** HUD liest `game.progression.trialInfo()` → Timer, Fortschritt, Phase; Banner bei `trial:*`.
- **Branding:** `gfx/Logo.js` – Pixel-Schriftzug (eigene Glyphen, Glutverlauf, Tropfen, Zierlinie). `installLogoCss()` setzt
  `--ef-logo`/`--ef-logo-ratio`; `.acc-logo .ef-title` und `.ef-logo` zeigen ihn (Text bleibt für Screenreader).
- **Zonenübergang:** `ui/ZoneTransition.js` – Karte mit Zonenname, Untertitel, Stufe, Tipp; Glut (Oberwelt) bzw. violett (Dungeon).
- **Einstellungen:** `ui/Settings.js` im Pausemenü. `game.prefs`: `volume` (0..1), `muted`, `guidePath`, `screenShake`, `minimap`,
  `touchScale` (0.85/1/1.2 → CSS `--touch-scale`). `sfx.setVolume/setMuted/bindPrefs`. Tastatur: M = Karte, N = Ton.
- **Questpfad-Sprite:** `assets.effects.guide = { frames[4] (11×6), arrow(angle) (11×11), end (15×8) }`, emissiv zeichnen.

## Runde 4: Klang, Umgebung, Dialoge, Leistung (Thread D)

- **Musik** (`audio/Music.js`, prozedural, keine Dateien): Stücke `village, crypt, forest, temple, peaks, forge, boss, trial`.
  Zone → Stück über `themeForZone(def)` (Feld `def.music` hat Vorrang). `audio/Soundscape.js` wechselt bei Boss (`boss:engaged`,
  `trial:boss`) und Glutprüfung und blendet danach zurück. Lautstärke: `prefs.musicVolume` (Regler „Musik“).
- **Atmo**: `sfx.setAmbience(kind)` mit `outdoor | forest | dungeon | water | fire | rain | storm`; Zone → Art über `ambienceForZone(def)`
  (Feld `def.ambience` hat Vorrang).
- **Gegnerstimmen** (`audio/voices.js`): je Typ Treffer, Tod und Warnlaut, sonst nach `material` (`flesh | bone | chitin | stone | ember | water`).
  Neue Gegner brauchen nur ein `material`, einen Eintrag nur für Sonderlaute.
- **Neue Sfx-Namen**: Gegner `growl grunt impChitter rumble gurgle dragonBreath stone stoneDeath ember emberDeath splash fleshDeath`;
  Fähigkeiten `shout whoosh quake shadow knives bowDraw arrowRain trap blink meteorFall`; Bossangriffe `bossBreath bossMeteor bossWave bossDive bossEmerge`;
  Welt `crow squeak flutter spikes lever secret`; UI `unlock achievement dialog blip`.
- **Umgebungseffekte** (`gfx/Weather.js`): Rezepte je Zone in `ZONE_WEATHER` (Schichten `ash ember firefly dust bubble drip`,
  `caustics` Wasserlicht, `shimmer` Hitzeflimmern, `glow` Bodenglut, `weather`-Liste wechselnder Zustände `clear drizzle rain storm ash ashstorm`).
  Feld `def.weather` in einer Zone ersetzt das Rezept.
- **Qualität** (`ui/Quality.js`, `prefs.quality`: `auto | low | medium | high`): Partikelbudget 350/800/1400 plus Ausdünnung
  (`particles.density`), Bloom aus/70 %/voll, Wettermenge 30/60/100 %, Hitzeflimmern ab mittel. „Auto“ startet auf Touch mittel und
  senkt die Stufe bei anhaltend unter 45 FPS.
- **Fähigkeiten-Leiste**: 4 Slots (Q R T G, Touch in zwei Bögen um den Angriffsknopf), gesperrte mit Schloss und „St. N“.
  Embleme `skill_*` eckig, Passive `passive_*` rund mit Goldfassung.
- **Freischalt-Karte** (`ui/Unlocks.js`): `character:unlock` und `achievement:unlocked` erscheinen als Karte oben mittig, nacheinander.
- **Gesprächsporträts** (`gfx/Portraits.js`, `ui/DialogPortrait.js`): 48×48, 3/4-Profil, Licht oben links, Kontur, Hintergrund in
  Zonenstimmung. Datensatz je NPC in `PORTRAITS` (Haut, Haare, Bart, Kopfbedeckung, Kleidung, Beiwerk); unbekannte NPCs werden aus der ID abgeleitet.

## Runde 5 (Thread D): weniger Fläche, kompakte Meldungen, spektakuläre Items

- **Aktionsleiste:** Desktop zeigt nur Q R T G und den Trank (H); Angriff (linke Maustaste, Leertaste, J) und Ausweichen (rechte Maustaste, Umschalt, K) liegen nicht mehr in der Leiste. Touch: Angriff (76 px) und Ausweichen (60 px) sind die zwei Hauptknöpfe, darum Q R T G (48 px), Trank (44 px) und Sprechen; Behälter 192 × 192.
- **Menü auf Touch:** ein Knopf (40 px, drei Striche) klappt Inventar, Charakter, Quests, Talente und Menü als Liste auf; schließt bei Auswahl, beim Tippen daneben, beim Öffnen eines Fensters oder nach 6 s. Goldener Punkt am Knopf und an „Talente“ bei freien Talentpunkten (auch Desktop).
- **Meldungen (ui/Toasts.js):** einzeilig, 12 px (Handy 11 px), linker Rand unter dem Spielerrahmen. Gewöhnliche/ungewöhnliche Beute innerhalb von 2,4 s wird zu „N Gegenstände“ mit bis zu 4 Mini-Icons; ab selten eigene Zeile. Sichtbar 2–3 s (episch 4,2 s, legendär 5 s); Desktop max. 4, Handy max. 2.
- **Freischalt-Karte auf Touch:** klein (Icon 34 px, ohne Unterzeile), oben am Rand, 25 % kürzer.
- **Item-Effekte (gfx/ItemFx.js, automatisch in itemIconEl):** selten = Teilchen im Element, episch = Flammen oder Lichtkranz hinter dem Item plus Leuchten, legendär = hohe Flammen, drehender Strahlenkranz, schwebendes Item. Element für Ausrüstung direkt aus `fxElement(def)` in character/gearLook.js (Thread A), sonst nach Namen; Farben aus `ELEMENTS` in gfx/Particles.js, damit Icon und Waffe an der Figur gleich leuchten. Pixel-Filmstreifen 9 × 24 px, CSS `steps(8)`; bei Qualität „Niedrig“ und reduzierter Bewegung stehend.

## Erweiterung bis Stufe 40 (Thread D, §12)

- **Icons Tier 5–8** (gfx/Icons.js, `ICON_TIERS`): `<visual>_t5 … _t8` für sword, greatsword, dagger, axe, mace, staff, wand, bow, cloth, leather, mail, plate; dazu `helm_tN`, `hood_tN`, `gloves_<cloth|leather|mail|plate>_tN`, `boots_<…>_tN`, `gloves_tN`/`boots_tN` (= Platte), `ring_tN`, `amulet_tN`. Farben nach Gebiet: 5 Steppe (Bronze, Kriegsrot), 6 Marsch (Moos, Knochen, Gift), 7 Zinnen (Frost, Silber), 8 Öde (Obsidian, Gold, Glut). Fehlende Stufe → nächstniedrigere, dann Grundform.
- **Reittier-Icons** `mount_<id>` (9 Stück, Kopf im Profil; Käfer eigene Form) und `ui_mount` (Hufeisen). Seltenheitseffekte über ItemFx wie bei Waffen.
- **Aktion `mount`**: Tasten V und 6. HUD-Platz „V“ nach dem Trank, erst sichtbar, wenn `canMount().reason !== 'level'`; leuchtet beim Reiten, Kampfknöpfe gedimmt. Touch: kleiner Knopf (42 px) oben links im Bogen.
- **Wirkbalken** `.hud-cast` liest `hero.mountCast = { t, dur }` (Thread A).
- **Rückmeldung**: Staubwolke + `mountUp`/`mountDown` bei `mount:changed`, Hufschlag `hoof` und größere Staubwolke bei `footstep` beritten, Karte „Neues Reittier“ bei `mount:learned`, „Reiten gelernt“ nach `q_first_ride`.
- **Wetter** (gfx/Weather.js): neue Teilchen `snow`, `spore`, `emberrain`, `glint`, Nebelschwaden (`fog: { a, c }`), Tönung (`tint`), Zustände `ashwind`, `blizzard`, `emberstorm`, `fog`. Rezepte für alle 8 neuen Zonen; Atmo `wind`, `marsh`, `blizzard`; Musikthemen zugeordnet.
- **Minimap**: Farbstil je Zone (`MAP_STYLE` in ui/Minimap.js), Schnee wird weniger aufgehellt. EP-Zahlen mit Tausenderpunkt.
