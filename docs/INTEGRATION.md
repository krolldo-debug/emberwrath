# Emberfall – Integrationsvertrag (RPG-Umbau)

Gilt für alle Threads. Wer etwas braucht, das hier nicht steht oder einer anderen
Datei gehört, meldet es über den Koordinator an den Architektur-Thread, statt die
fremde Datei zu ändern.

## 1. Grundregeln

1. **Ein Zustand.** `game.state` (`src/core/GameState.js`) ist der einzige Spielzustand.
   Er besteht aus Slices; jede Slice gehört genau einem Thread (Tabelle unten).
2. **Schreiben nur per Command.** `state.commit('inventory:add', { itemId, qty })`.
   Commands registriert der Slice-Besitzer mit `state.defineCommand(type, handler, { authoritative })`.
   Belohnungen und Fortschritt (XP, Beute, Gold, Quest-Abschluss, Boss besiegt) sind
   `authoritative: true` – die berechnet später der Server.
3. **Darstellung liest nur.** Render-Code und HUD lesen `state.slices.*`, `session.world.*`
   und Content-Definitionen. Sie committen nie aus `draw()`/`render()`. Ein Button in einem
   Panel darf eine Spielaktion auslösen (commit oder `input.press(action)`).
4. **Systeme reden über Events.** Namen stehen in `src/core/events.js` (`EV.*`). Bereichsübergreifende
   Events nur aus dieser Liste; neue über den Architektur-Thread. Bereichsinterne Events sind frei.
5. **Inhalte sind Daten.** Völker, Klassen, Items, Quests, Gegner, Zonen, NPCs werden in
   `game.content` registriert (`content.define(kind, id, def)`) und überall nur per ID gelesen.
6. **Kein vorgetäuschtes Netzwerk.** Accounts und Spielstände sind lokal (`SaveStore`). Es gibt
   keine anderen Spieler. Texte im Spiel sagen das ehrlich („Lokaler Demo-Account – Spielstand auf
   diesem Gerät“, „Lokale Instanz“).
7. **Build bleibt grün.** `node tools/build.mjs` muss laufen. Build-Einschränkungen:
   nur `import { a, b as c } from './x.js';` (eine Zeile) und `export class|function|async function|const|let Name`.
   Kein `export default`, kein `import * as`, keine dynamischen Imports, keine npm-Pakete.
   Neue CSS-Dateien nur über den Architektur-Thread (werden in `index.html` verlinkt).
8. **Test-Hook.** `window.emberfall` ist das `Game`. Laufende Sitzung: `emberfall.scenes.current`.

## 2. Aufbau zur Laufzeit

```
main.js ── new Game(canvas)
            ├─ bus (EventBus)  content (Content)  state (GameState)  save (SaveStore)
            ├─ authority (LocalAuthority)  input (Input)  assets  sfx  font
            ├─ scenes (SceneManager)  panels (PanelRegistry)  sessionSystems
            └─ ui-Layer #ui: .ui-scene | .ui-hud | .ui-panels | .ui-toasts
         .use(installCharacter)  A
         .use(installAccount)    A
         .use(installWorld)      B
         .use(installProgression) C
         .use(installUi)         D
         scenes: 'title' (A) … 'play' = PlayScene (Architektur)
```

Jeder Bereich hat **genau eine** `install(game)`-Funktion in seiner `index.js`. Dort registriert er:
Slices, Commands, Content, Assets (`game.assets.define(key, factory)`), Szenen
(`game.scenes.register(id, g => scene)`), Panels (`game.panels.register(...)`) und
Sitzungssysteme (`game.addSessionSystem(id, session => system, order)`).

### Szenen (`core/SceneManager.js`)
Objekt mit optional `enter(params)`, `exit()`, `update(dt)`, `render(ctx)`, `root` (DOM-Element für `.ui-scene`).
Wechsel: `game.scenes.go(id, params)` (wirkt im nächsten Tick). `ctx` ist das interne 480×270-Canvas;
Menüszenen dürfen dort einen animierten Hintergrund zeichnen.

### Spielsitzung = `PlayScene` (`src/scenes/PlayScene.js`, Architektur)
Das `session`-Objekt, das Systeme, Panels, Welt und Held bekommen:

| Feld | Bedeutung |
|---|---|
| `game, bus, input, state, content, assets, sfx, font, authority` | Dienste. `bus` ist ein Abo-Bereich: `bus.on` wird beim Verlassen automatisch gelöst |
| `world, camera, zone` | aktuelle Welt, Kamera, `{ zoneId, instanceId, capacity, population, def }` |
| `panels` | `PanelHost`: `open(id, params)`, `close()`, `toggle(id)`, `openId` |
| `hitstop(t)`, `slowmo(scale, dur)` | Game-Feel (Thread D nutzt sie im Feedback) |
| `setPaused(reason, on)`, `paused` | Nur für Sonderfälle. Online-Welt: Menüs, Fenster, Fokusverlust und verborgener Tab halten nichts an (GameLoop rechnet im Hintergrund weiter) |
| `travel(zoneId, spawnId, pos?)` | Zonenwechsel (oder `bus.emit(EV.ZONE_TRAVEL, …)`); `pos` (Weltpixel) hat Vorrang vor `spawnId`. Vorher geht `zone:travelPlan` { zoneId, spawnId, pos, fromZoneId } über den Bus, Hörer dürfen das Ziel ändern (Dungeonsuche: zurück zur Beitrittsstelle) |
| `respawn({ leave })` | Wiederbeleben bzw. Dungeon verlassen (oder `bus.emit(EV.RESPAWN_REQUEST, { leave })`) |
| `time, hurtFlash, deadTime, debug, fps` | Laufzeitwerte |

Tick: Panels (Esc/Aktionstasten) → alle `system.update(dt, session)` (auch während Pause – selbst `session.paused` prüfen) →
bei Pause Ende → Hitstop/Zeitlupe → `world.update` → Tod/Respawn → Kamera.
Zeichnen: `world.render` → `system.draw(ctx, session)` in Reihenfolge `order`.
Autosave: alle 20 s, bei Zonenwechsel, `LEVEL_UP`, `QUEST_ACCEPTED`, `QUEST_COMPLETED`, `BOSS_DEFEATED`, Tab verstecken, Verlassen.
Tod: `PLAYER_DIED`; nach 2 s Angriff/Interagieren (oder `EV.RESPAWN_REQUEST`) → Wiederbeleben:
- Dungeon (`instanced`, keine Glutprüfung): am Eingang derselben Instanz (`world/instanceRevive.js`), besiegte Gegner bleiben besiegt.
  Lief ein Bosskampf, steht der Boss unversehrt wieder an seinem Platz (`world/bossReset.js`, `EV.BOSS_RESET`), das Tor öffnet sich.
  `PLAYER_RESPAWNED { inInstance: true }`: die Gruppe (`finder/Party.js`) holt ihre Söldner an den Eingang.
- sonst: in `zone.respawnZone ?? zone` am Spawn `zone.respawnSpawn ?? 'respawn'`.
- `RESPAWN_REQUEST { leave: true }`: Dungeon verlassen, draußen am Spawn `from_<dungeon>` (tot oder lebendig).
Kämpft die Gruppe noch (`hero.partyWaiting`), gibt es kein Wiederbeleben; die Gruppe hebt den Helden nach dem Kampf auf.

### Sitzungssysteme
`game.addSessionSystem(id, (session) => ({ update?(dt, session), draw?(ctx, session), dispose?() }), order)`
Werden bei jedem Betreten der PlayScene neu erzeugt. Kleines `order` zuerst (Feedback 0, Fortschritt 10, HUD 100).

### Panels (`core/PanelHost.js`)
`game.panels.register(id, (session, params) => ({ root, update?(dt), dispose?() }), { action, title })`.
`action` = Eingabeaktion, die das Panel umschaltet. Esc schließt ein offenes Panel, sonst öffnet es `'menu'` (falls registriert).
Es ist immer höchstens ein Panel offen. Kein Panel hält die Welt an (Online-Spiel); `pauses` wird nicht mehr ausgewertet.

### Welt-Vertrag (`world/World.js`, Thread B)
`new World(session, zoneDef, { spawnId, pos })` mit mindestens:
`hero, actors, enemies, props, effects, projectiles, entities, lights, particles, decals, lighting, combat, dungeon, time, aim, zone, session, pixelW, pixelH`,
`spawn(entity)` (beliebige Objekte mit `update(dt, world)`, `render(ctx, cx, cy)`, optional `renderEmissive`, `sortY`, `removed`),
`spawnEnemy(type, x, y, opts)`, `addEffect`, `addLight`, `addProjectile`, `update(dt)`, `render(ctx, cx, cy, debug)`, `dispose()`.
Den Helden erzeugt die Welt über `createHero(session, x, y)` (Thread A).
Jeder besiegte Gegner wird genau einmal als `EV.ENEMY_KILLED` gemeldet (inkl. `xp`, `level`, `isBoss`).

### Held-Vertrag (`character/createHero.js`, Thread A)
`createHero(session, x, y)` → Actor mit `team: 'hero'`, `hp, maxHp, resource, maxResource, resourceType, stamina, maxStamina, dead`,
`abilities: [{ id, name, cooldown, cdLeft, cost }]` (für HUD/Touch-Knöpfe). Liest Werte aus `computeStats(state, content)`
(`character/stats.js`, Thread A, Form dort dokumentiert). Lebenspunkte im Kampf leben im Actor und werden nicht gespeichert
(nach Laden volle HP). Eigene Geschosse des Helden: eigenes Entity + `world.combat.add({ owner: geschoss, team: 'hero', follow: true, … })`.

## 3. Zustand: Slices und Besitzer

| Slice | Besitzer | Form (Minimum, erweiterbar) |
|---|---|---|
| `meta` (kein Slice) | Architektur | `{ accountId, characterId, createdAt, savedAt, playTime, version }` |
| `character` | A | `{ name, raceId, classId, appearance }` |
| `world` | B | `{ zoneId, spawnId, pos, flags: {}, bossesDefeated: [] }` |
| `progress` | C | `{ level, xp }` |
| `inventory` | C | `{ slots: Array(36) of { itemId, qty } \| null, equipment: { weapon, head, chest, hands, feet, ring, amulet }, questBag, bonus }` (Runde 2; C migriert alte Stände). `questBag`: Quest- und Sammelgegenstände aktiver Quests, wenn die Tasche voll ist – zählen für Fortschritt/Abgabe, wandern bei freiem Platz zurück. `bonus`: Set-/Verstärkungs-/Verzauberungsboni |
| `wallet` | C | `{ gold }` |
| `quests` | C | `{ active: { [questId]: { status: 'active'\|'ready', progress: { [objectiveId]: n } } }, completed: [questId], tracked: questId \| null }` (Command `quest:track`) |
| `bank` | C | `{ size: 16…48, slots }` (Lager im Dorf, `object:interact` mit `kind: 'bank'`) |
| `achievements` | C | `{ unlocked, title }` (Event `achievement:unlocked`) |
| `trials` | C | `{ run, … }` (Glutprüfungen, §11.10) |

Neues Spiel: `game.newGame({ character: { name, raceId, classId } })` → jede Slice bekommt `create(init[slice])`.
Slices mit Versionen/Migration: `defineSlice(name, { create, serialize?, deserialize?(json, version) })`.

## 4. Speichern und Account (`core/SaveStore.js`, Architektur)

`game.save`: `listAccounts()`, `createAccount(name)`, `getAccount(id)`, `deleteAccount(id)`,
`listCharacters(accountId)` → `[{ id, name, raceId, classId, level, zoneId, savedAt }]`,
`loadCharacter`, `deleteCharacter`, `getLast()`. `game.save.persistent === false` heißt: kein localStorage
(z. B. privates Fenster) → Thread A zeigt einen Hinweis.
Ablauf-Helfer in `Game`: `login(accountId)`, `logout()`, `newGame(init)`, `loadGame(accountId, characterId)`,
`continueLast()`, `saveNow(reason)`.

## 5. Server-Schnittstelle (`core/Authority.js`, Architektur)

Heute `LocalAuthority`: `execute(cmd, apply)` wendet lokal an, `joinZone(zoneId)` → `{ instanceId: 'zone#local', capacity: zone.maxPlayers, population: 1 }`,
`sendIntent()` tut nichts, `remotePlayers()` → `[]`, `on()` feuert nie. Später ersetzt ein `ServerAuthority` dieselbe Form.
Deshalb: Belohnungen nur per authoritative Command, Zonen tragen `instanced` und `maxPlayers`, keine Logik verlässt sich
darauf, der einzige Spieler zu sein, wenn es vermeidbar ist.

## 6. Events (`src/core/events.js`)

Nutzlasten stehen als Kommentar in `events.js`. Wer sendet, wer hört typischerweise:

| Event | Sender | Hörer |
|---|---|---|
| `scene:change`, `game:started`, `game:saved`, `state:changed` | Architektur | D (Anzeige „Gespeichert“) |
| `account:login/logout`, `character:created` | A | – |
| `zone:enter`, `zone:leave`, `zone:travel` (Anfrage), `zone:travelPlan` | Architektur / B | C (Ziel „Zone erreichen“), D (Zonenbanner) |
| `area:reached`, `npc:interact`, `object:interact` | B | C (Quests, Truhen-Beute) |
| `enemy:killed`, `boss:engaged`, `boss:defeated` | B | C (XP, Beute, Quests), D (Boss-Leiste, Banner) |
| `player:died`, `player:respawned` | Architektur | D |
| `xp:gained`, `level:up`, `loot:dropped`, `item:*`, `gold:changed`, `quest:*` | C | D (HUD, Toasts), A (Held liest neue Werte bei `level:up`/`item:equipped`) |
| `ui:toast`, `ui:banner`, `ui:openPanel`, `ui:closePanel`, `ui:prompt` | alle | D (Toasts, Banner, Interaktionshinweis), PanelHost |

Bestehende interne Events (`hit`, `swing`, `enemySwing`, `telegraph`, `lunge`, `shoot`, `arrowStuck`, `deflect`, `roll`,
`rollEnd`, `footstep`, `spawnStart`, `heal`) bleiben; Hauptempfänger ist das Feedback-System (D).

## 7. Eingabe-Aktionen (`core/Input.js`)

`up down left right attack dodge skill1 skill2 skill3 skill4 potion interact inventory character quests talents pause mute debug`
(Runde 2: `skill3` T/4, `skill4` G/5, `talents` U → Panel `talents` von A; M öffnet die Zonenkarte, N schaltet den Ton).
Tastatur: WASD/Pfeile, J/Leertaste/Klick, K/Shift/Rechtsklick, Q/1, R/2, H/3, E/F, I/B, C, L, Esc/P, M, F3.
HTML-Knöpfe lösen Aktionen per `input.press(a)` / `input.release(a)` aus. Tastendrücke in Eingabefeldern gehen nicht ans Spiel.
Panel-Tasten: `inventory` → Panel `inventory`, `character` → `character`, `quests` → `questlog` (Thread C registriert sie mit `action`).

## 8. Fest vereinbarte Inhalts-IDs (Vertikalschnitt)

Damit C Quests schreiben kann, während B die Welt baut:

- **Zonen (B):** `emberhollow` – Startgebiet „Glutsenke“ (Außenbereich, `start: true`, `maxPlayers: 40`, nicht instanziert);
  `catacombs` – Dungeon „Die Katakomben“ (`instanced: true`, `maxPlayers: 5`, `respawnZone: 'emberhollow'`, Boss-Raum).
- **Spawns (B):** in `emberhollow`: `start`, `respawn`, `from_catacombs`; in `catacombs`: `start`, `respawn`.
- **Flächen (B, `area:reached`):** `catacombs_gate` (Eingang in der Glutsenke), `boss_hall` (vor dem Boss).
- **NPCs (B platziert, `npc:interact`):** `elder_maren` (Dorfälteste, Hauptquests), `smith_brom` (Schmied, Nebenquest).
- **Gegner (B, `enemy:killed.type`):** `wolf` (Aschewolf, Startgebiet), `skeleton`, `archer`, `spider` (Dungeon).
  B darf weitere ergänzen. **Boss:** Gegnertyp `bonelord` („Varkhul, der Knochenfürst“), `bossId: 'bonelord'`.
- **Quests (C):** `q_ashen_wolves` (Maren: 4 × `wolf`), `q_into_catacombs` (Maren: `catacombs_gate` erreichen, 6 × `skeleton`),
  `q_spider_silk` (Brom: 3 × Item `spider_silk` sammeln), `q_bonelord` (Maren: Boss `bonelord` besiegen). C darf anpassen,
  solange die IDs von B unverändert benutzt werden.
- **Item-Typen (C):** `weapon`, `armor`, `trinket`, `consumable`, `material`, `quest`. Seltenheit `common|uncommon|rare|epic`.
  Item-Definition: `{ name, type, rarity, icon, stats?: { power, armor, maxHp, critChance, … }, value, stack?, classes?: [classId], use? }`.
  Währung: Gold.
- **Völker/Klassen (A):** IDs vergibt A (je 4 empfohlen). Andere Threads verwenden sie nur über `content.all('race'|'class')`.

## 9. Dateizuteilung

Neue Dateien gehören ihrem Ersteller. Geteilte Dateien ändert nur ihr Besitzer.

**Architektur (dieser Thread):** `index.html`, `styles.css`, `package.json`, `tools/build.mjs`, `src/main.js`, `src/Game.js`,
`src/config.js`, `src/Assets.js`, `src/core/*` außer `Input.js`, `src/scenes/PlayScene.js`, `docs/INTEGRATION.md`,
`docs/ARCHITECTURE.md`, `docs/MULTIPLAYER.md`, `README.md`.

**A – Charakter und Speicherung:** `src/account/**` (Titel, Account-Auswahl/-Erstellung, Charakterliste,
Charaktererstellung, `account.css`, `index.js`), `src/character/**` (`races.js`, `classes.js`, `stats.js`, `createHero.js`,
Fähigkeiten, `index.js` mit Slice `character`), `src/entities/Hero.js`, `src/sprites/hero.js` (Volk-/Klassenvarianten).

**B – Welt, Dungeon, Gegner, Boss:** `src/world/**` (`World.js`, `Dungeon.js`, `levels.js`, `FlowField.js`, Zonen, NPC-/Tor-Logik,
`world.css`, `index.js` mit Slice `world`), `src/entities/{Actor,Entity,Enemy,enemyTypes,Prop,Projectile}.js`, neue Entities,
`src/systems/{Combat,Physics}.js`, `src/sprites/{skeleton,spider}.js` und neue Kreaturen-/NPC-/Außenbereich-Sprites
(neue Dateien, z. B. `sprites/wolf.js`, `sprites/bonelord.js`, `sprites/outdoor.js`).

**C – Quests, XP, Level, Beute, Inventar, Währung:** `src/progression/**` (Slices `progress`, `inventory`, `wallet`, `quests`,
Commands, `items.js`, `quests.js`, `loot.js`, Beute-Entity, Panels `inventory`, `character`, `questlog`, `questDialog`,
`progression.css`, `index.js`).

**D – Grafik, UI, Touch, Effekte:** `src/ui/**` (HUD neu, HTML- oder Canvas-HUD, Toasts, Banner, Interaktionshinweis,
Menü-Panel `menu`, Touch-Steuerung, `theme.css`, `index.js`), `src/gfx/**`, `src/sprites/{tiles,props,effects}.js`,
`src/entities/Effects.js`, `src/systems/Feedback.js`, `src/audio/Sfx.js`, `src/core/Input.js` (Touch, Belegung; Aktionsnamen fix).
D legt `docs/STYLE.md` an (Palette, Umriss, Licht, Größen) – A und B halten sich bei neuen Sprites daran.

Überschneidungen, die bewusst so gelöst sind:
- UI-Baukasten-Klassen (`ef-*` in `styles.css`) nutzen alle; D gestaltet sie in `theme.css` um, ohne sie umzubenennen.
- Das Charakter-Panel baut C; die Werte liefert `computeStats` (A).
- Gegner-Sprites macht B; Umgebung, Licht und Effekte macht D.
- Interne Auflösung ist 480×270 (Tile 16 px). Größere/feinere Figuren sind erlaubt; Änderung der Auflösung nur über Architektur.

## 10. Übergangszustand nach Phase 1

Läuft: Titel-Stub → Gast-Account → Spiel in `catacombs` mit fest platzierten Gegnern (keine Wellen), XP-Stub, Autosave,
„Fortsetzen“. Die Stubs in `account/`, `character/`, `world/index.js`, `progression/`, `ui/index.js` sind zum Ersetzen da.
Bekannt: Gegner greifen sofort alle an (keine Aggro-Reichweite) – Thread B.

## 11. Runde 2: Inhalte bis Stufe 20 (fest vereinbart)

Ziel: Stufe 20 nach etwa 60–90 Minuten, nicht nach 5. Epische Gegenstände sind selten. Alle IDs unten sind fix;
Namen/Texte dürfen die Besitzer anpassen. Bestehende IDs aus Abschnitt 8 bleiben unverändert.

### 11.1 Zonen und Reiseweg (B)

| Zone-ID | Name | Art | Stufen | `maxPlayers` | Boss / Elite | `respawnZone` |
|---|---|---|---|---|---|---|
| `emberhollow` | Glutsenke | outdoor, `start` | 1–3 | 40 | – | – |
| `catacombs` | Die Katakomben | dungeon, `instanced` | 3–6 | 5 | Boss `bonelord` | `emberhollow` |
| `ashwood` | Der Aschenwald | outdoor | 6–11 | 40 | Elite `bandit_chief` | – |
| `sunken_temple` | Der Versunkene Tempel | dungeon, `instanced` | 10–12 | 5 | Boss `drowned_priestess` | `ashwood` |
| `cinder_peaks` | Die Schlackenhöhen | outdoor | 12–17 | 40 | Elite `magma_behemoth` | – |
| `molten_forge` | Die Glutschmiede | dungeon, `instanced` | 17–20 | 5 | Elite `forge_warden`, Boss `ember_tyrant` | `cinder_peaks` |

Reiseweg (Portale, `zone:travel`): `emberhollow ↔ catacombs`, `emberhollow ↔ ashwood`, `ashwood ↔ sunken_temple`,
`ashwood ↔ cinder_peaks`, `cinder_peaks ↔ molten_forge`.
- **Portal-IDs:** `to_<zielzone>` (bestehend `to_catacombs`, `to_emberhollow`; neu `to_ashwood`, `to_sunken_temple`,
  `to_cinder_peaks`, `to_molten_forge`). Ein Portal darf `requires: { level }` tragen (Hinweis „Empfohlen ab Stufe X“, sperrt nicht hart).
- **Spawns je Zone:** `start`, `respawn`, und `from_<herkunftszone>` für jede Verbindung (z. B. in `ashwood`: `from_emberhollow`,
  `from_sunken_temple`, `from_cinder_peaks`).
- **Zonen-Definition** bekommt zusätzlich `links: [zoneId …]` (für die Wegführung über Zonengrenzen, siehe 11.6).

**Flächen (`area:reached`):** `ashwood`: `ashwood_camp` (Lager der Wächter), `bandit_camp`, `temple_shore` (Eingang Tempel),
`peaks_road` (Aufstieg); `sunken_temple`: `temple_sanctum` (vor dem Boss); `cinder_peaks`: `rookwatch` (Feste Rauhwacht),
`obsidian_rift`, `forge_gate`; `molten_forge`: `warden_hall`, `tyrant_throne` (vor dem Boss).

**Objekte (`object:interact`, `kind` in Klammern):** `ashwood`: `lost_satchel` (`item`), `ward_totem_1..3` (`shrine`);
`cinder_peaks`: `rift_seal_1..3` (`shrine`); Truhen weiter `chest_*`, Bosstruhen `boss_*`.

### 11.2 NPCs (B platziert, C schreibt Dialoge/Quests)

| NPC-ID | Zone | Rolle |
|---|---|---|
| `elder_maren`, `smith_brom` | `emberhollow` | bestehend; Brom wird zusätzlich Händler |
| `warden_ilsa` | `ashwood` | Hauptquests Aschenwald/Tempel |
| `herbalist_oona` | `ashwood` | Nebenquests |
| `trader_vesk` | `ashwood` | Händler (Stufe 6–12) |
| `commander_hale` | `cinder_peaks` | Hauptquests Schlackenhöhen/Glutschmiede |
| `seer_ysolde` | `cinder_peaks` | Nebenquests |
| `quartermaster_dunn` | `cinder_peaks` | Händler (Stufe 12–20) |

### 11.3 Gegner (B, `enemy:killed.type`)

Jeder Gegnertyp hat `level` (oder Spanne `levels: [min,max]`) und `xp`; `enemy:killed` schickt `level` mit.
Elite: `elite: true` (mehr Leben, eigener Name, Leiste wie Boss optional). Boss: `boss: true`, `bossId` = Gegnertyp.

- `ashwood` (6–11): `ash_boar` (Keiler, Sturmangriff), `bandit` (Nahkampf), `bandit_archer` (Fernkampf),
  `thorn_crawler` (Dornenkriecher, langsam, Gift), Elite `bandit_chief` („Rask, der Brandschatzer“).
- `sunken_temple` (10–12): `drowned` (Ertrunkener), `tide_cultist` (Zauberer, Projektile), `temple_guardian` (schwer, langsam),
  Boss `drowned_priestess` („Nerith, die Ertrunkene Priesterin“, 2 Phasen).
- `cinder_peaks` (12–17): `fire_imp` (flink, Schwarm), `magma_hound`, `ash_golem` (schwer), `cinder_cultist` (Zauberer),
  Elite `magma_behemoth` („Der Schlackenkoloss“).
- `molten_forge` (17–20): `forge_golem`, `flame_acolyte`, `ember_drake` (junger Drache, Feuerstoß), `magma_hound`,
  Elite `forge_warden` („Wächter der Esse“), Boss `ember_tyrant` („Ignaroth, der Glut-Tyrann“, 3 Phasen).
- Bestehende Werte werden auf die neuen Stufen gezogen: `wolf`/`wolf_alpha` 1–3, `skeleton`/`archer`/`spider` 3–6, `bonelord` 6.

### 11.4 Quests (C)

Kette Hauptquests (Reihenfolge = `requires`), Nebenquests parallel. Zielarten wie bisher (`kill`, `reach`, `collect`, `boss`,
`talk`, `interact`). **Neu:** jedes Ziel trägt `zone` (Zone, in der es erfüllt wird) und jede Quest `turnInNpc` + implizit dessen Zone,
damit die Wegführung (11.6) ohne Weltwissen auskommt.

- **Glutsenke/Katakomben (bestehend):** `q_ashen_wolves`, `q_spider_silk`, `q_into_catacombs`, `q_bonelord` → danach
  `q_road_east` (Maren: nach `ashwood` reisen, mit `warden_ilsa` sprechen).
- **Aschenwald (Ilsa):** `q_boar_cull` (8 × `ash_boar`), `q_bandit_camp` (`bandit_camp` erreichen, 10 × `bandit`/`bandit_archer`),
  `q_bandit_chief` (Elite `bandit_chief`), `q_temple_shore` (`temple_shore` erreichen, 3 × `ward_totem_*` aktivieren),
  `q_nerith` (Boss `drowned_priestess`, Item `tide_pearl`) → `q_to_the_peaks` (nach `cinder_peaks`, mit `commander_hale` sprechen).
- **Aschenwald (Oona, Neben):** `q_thorn_sap` (6 × Item `thorn_sap` von `thorn_crawler`), `q_lost_satchel` (Objekt `lost_satchel`),
  `q_drowned_relics` (Tempel: 5 × Item `temple_relic`).
- **Schlackenhöhen (Hale):** `q_imp_plague` (12 × `fire_imp`), `q_hound_pack` (8 × `magma_hound`), `q_behemoth` (Elite `magma_behemoth`),
  `q_forge_gate` (`forge_gate` erreichen), `q_forge_warden` (Elite `forge_warden`), `q_ignaroth` (Boss `ember_tyrant`, Item `tyrant_crown`).
- **Schlackenhöhen (Ysolde, Neben):** `q_obsidian_shards` (8 × Item `obsidian_shard` von `ash_golem`), `q_rift_seals` (3 × `rift_seal_*`),
  `q_cultist_tomes` (5 × Item `cultist_tome` von `cinder_cultist`/`flame_acolyte`).
- Optional (C entscheidet): wiederholbare Kopfgeldquests `q_bounty_<zone>` beim Händler, damit niemand an einer Stufe festhängt.

**Tempo (C, `xp.js`):** Richtwerte: Varkhul ≈ Stufe 6, Ende Aschenwald ≈ 10, Nerith ≈ 12, Ende Schlackenhöhen ≈ 17,
Ignaroth ≈ 20. Quest-XP ≈ 55–65 % des Fortschritts, Kills den Rest; Gegner ≥ 5 Stufen unter dem Spieler geben fast nichts.

### 11.5 Gegenstände und Seltenheit (C; Icons D)

- **Neue Felder (von C festgelegt):** `ilvl` (Gegenstandsstufe) und `reqLevel` (benötigte Stufe); Tier ergibt sich aus `ilvl`
  (1: 1–5, 2: 6–11, 3: 12–16, 4: 17–20). Neue Werte `str`, `agi`, `int`, `vit`, `moveSpeed`. Tasche: 36 Plätze.
- **Ausrüstungsplätze (C, Slice `inventory.equipment`):** `weapon, head, chest, hands, feet, ring, amulet`. C migriert alte
  Spielstände (`armor` → `chest`, `trinket` → `ring` bzw. `amulet`). Item-Typen `armor`/`trinket` bekommen dafür `slot`.
- **Neues Feld `visual`** bei Waffen: `sword | greatsword | axe | mace | dagger | bow | staff | wand` (A zeigt die Waffe am Helden,
  D das Icon). Rüstungen: `visual: cloth | leather | mail | plate` (A darf die Rüstungsfarbe/-form am Helden andeuten).
- **Seltenheiten:** `common | uncommon | rare | epic`, neu zusätzlich `legendary` (nur `ember_tyrant`, sehr selten). Farben: C in
  `RARITIES`, D übernimmt sie für Rahmen/Leuchten.
- **Seltenheitsgrenzen (verbindlich, in `loot.js` durchgesetzt; Stand v6, genaue Tabelle in `src/progression/README.md`):**
  normale Gegner: 6 % Ausrüstung, davon `rare` 0,8 % und erst ab Tier 2, `epic` nie. Elite: `rare` 12 %, `epic` ≤ 1 %.
  Seltene Weltgegner: `rare` 28 %, `epic` 2 %. Boss: mindestens `uncommon` (Varkhul, Nerith) bzw. `rare` (Ignaroth), `epic` 3–8 %
  (Varkhul 3, Nerith 5, Ignaroth 8), `legendary` ≤ 2 % (nur Ignaroth). Truhen: höchstens `rare`. Händler verkaufen nur `common`/`uncommon`.
  Ausnahme Glutprüfungen: siehe 11.10.
- **Verkaufen (C, v6):** `inventory:sell { slots: [index] }` → `{ ok, gold, count }` (Mehrfachauswahl, überall);
  `inventory:sellJunk { upTo: 'common'|'uncommon' }` (alles bis zu dieser Seltenheit außer Verbesserungen);
  `inventory:autoSell { mode: null|'common'|'uncommon' }` verkauft beim Aufsammeln automatisch, Event `item:autoSold { itemId, qty, gold }`
  (`EV.ITEM_AUTO_SOLD`); C fasst mehrere zu einem Toast zusammen.
- **Vielfalt:** je Tier mindestens 2 Schwerter + je 1 der übrigen Waffenarten, Rüstung je Machart, 3–4 Schmuckstücke.
  ID-Schema `<stil>_<visual>` bzw. `<stil>_<teil>`, z. B. `ashen_sword`, `tidebound_dagger`, `obsidian_greatsword`,
  `tyrant_plate`. Materialien: `thorn_sap`, `temple_relic`, `obsidian_shard`, `cultist_tome`, `ember_core`.
  Quest-Items: `tide_pearl`, `tyrant_crown`. Tränke: `greater_potion` (Tier 3+).
- **Icons:** `item.icon` bleibt die Icon-ID. D liefert `iconEl(id, size, { rarity })` / `iconCanvas(id, { rarity })`, das Rahmen,
  Leuchten und Verzierung je Seltenheit zeichnet, und je `visual` mindestens eine Grundform plus Tier-Varianten
  (Icon-IDs `<visual>_t1 … _t4`, z. B. `sword_t3`). Unbekannte IDs fallen auf die Grundform zurück. C wählt pro Item eine ID aus `ICON_IDS`.

### 11.6 Questpfad am Boden (C liefert Ziel, B rechnet und zeichnet, D liefert Grafik)

- **C:** `game.progression.questTarget()` → `null` oder
  `{ questId, zoneId, kind: 'npc'|'area'|'enemy'|'object'|'boss', id }` für die **verfolgte** Quest (erstes offenes Ziel; ist sie
  fertig, deren `turnInNpc`). Verfolgung: Feld `tracked` im Slice `quests`, Command `quest:track { questId }` (Questlog-Knopf
  „Verfolgen“); ohne Auswahl gilt die erste aktive Hauptquest. Bei Änderung Event `quest:tracked` (`EV.QUEST_TRACKED`).
- **B:** löst das Ziel in eine Weltposition auf (NPC, Fläche, Objekt, nächster lebender Gegner des Typs). Liegt es in einer
  anderen Zone, führt der Pfad zum passenden Portal (Breitensuche über `links`). Pfad per Rasterweg (`FlowField`/A*), neu
  berechnet bei `quest:*`, `zone:enter` und alle ~0,5 s. Öffentlich: `world.guidePath` (Array `{x,y}` in Weltpixeln, geglättet).
  B zeichnet ihn in der Bodenschicht (unter Figuren) als leuchtende Glutspur, die zum Ziel hin wandert und in der Nähe des Ziels ausläuft.
- **D:** Sprite `effects.guide` (Rune/Glutfleck, 2–4 Frames) und Schalter im Menü. Einstellung über `game.prefs`
  (siehe 11.8), Schlüssel `guidePath` (Standard `true`).

### 11.7 Zuständigkeiten Runde 2

- **A:** Spielerfigur deutlich detaillierter (mehr Frames für Laufen/Angriff/Ausweichen/Treffer/Tod, je Volk/Klasse erkennbar,
  sichtbare Waffe nach `visual`, Kopf/Brust nach Machart angedeutet); `computeStats` wertet `str/agi/int/vit/moveSpeed` und alle 7 Plätze aus; Stufenwerte bis 20 in `computeStats`; ggf. je Klasse eine
  dritte Fähigkeit ab Stufe 10 (Aktion `skill3`, Taste T/4 – D ergänzt Input und Touch-Knopf).
- **B:** die vier neuen Zonen, Portale, Spawns, Flächen, Objekte, NPCs; alle neuen Gegner und Sprites; Bossanimationen neu
  (Varkhul überarbeitet, Nerith, Ignaroth; Elite-Gegner): Ansage-, Angriffs-, Phasenwechsel- und Todesanimation, lesbare
  Telegraphs; Hauptgebäude der Glutsenke (Marens Halle) und die Lager-Hubs ästhetischer; Questpfad (11.6).
- **C:** Quests, Dialoge, XP-Kurve, Items (mehr Vielfalt, `ilvl`, `reqLevel`, `visual`), Beutetabellen mit den Grenzen aus 11.5,
  Händler; Inventar-Panel neu (Raster mit Seltenheitsrahmen, Filter/Sortierung, Vergleich mit Ausgerüstetem, Doppeltipp =
  ausrüsten/benutzen, Verkaufen, Charakterpuppe mit Slots) mit D’s Icons; `questTarget()` und `quest:track`, 7 Ausrüstungsplätze, Tasche 36.
- **D:** Item-Icons je Seltenheit/Tier, Hotbar/obere Leiste (Inventar, Charakter, Quests, Menü) als gezeichnete Symbole,
  HUD-Symbole, Treffer-/Zauber-/Boss-Effekte, Stufenaufstieg-Effekt, `effects.guide`, Seltenheitsleuchten für Beute am Boden
  (C’s `LootDrop` fragt `assets.effects.lootGlow?.(rarity)`), Menü-Schalter für `guidePath`.
- **Architektur:** `EV.QUEST_TRACKED`, `EV.PREFS_CHANGED`, `game.prefs`, Integration, Tests bis Stufe 20 (Desktop + Mobil), Leistung, Veröffentlichung.

### 11.8 Geräte-Einstellungen `game.prefs` (Architektur)

`game.prefs.get(key, fallback)`, `game.prefs.set(key, value)` – pro Gerät (localStorage `emberfall:v1:prefs`), nicht im Spielstand.
Bekannte Schlüssel: `guidePath` (bool), `muted` (bool), `screenShake` (bool), `volume` (0..1), `musicVolume` (0..1),
`minimap` (bool), `touchScale` (0.85/1/1.2), `quality` (Darstellung: setzt `world.particles.max/density` und `lighting.bloomScale`
pro Bild; ändert nie Spiellogik). Änderungen melden `prefs:changed { key, value }`.

### 11.9 Hochformat (Architektur, Vorschlag von D)

In der Szene `play` auf hohen Bildschirmen (Höhe > 1,15 × Breite) ist das interne Bild 270 × 360–480 statt 480 × 270
(`CONFIG.landscapeView`, `portraitView`, `portraitScenes`). `CONFIG.viewWidth/viewHeight` ändern sich zur Laufzeit: **immer live lesen,
nie beim Laden zwischenspeichern.** `<html>` trägt dann `ef-portrait`; Event `view:resized { width, height, portrait }` (`EV.VIEW_RESIZED`).

### 11.10 Endgame „Glutprüfungen“ (C Logik, B Welt)

- **Zone** `ember_trial` (dungeon, `instanced`, `maxPlayers: 5`), Spawn `start`. Wiederholbarer, mit der Prüfungsstufe skalierender Lauf.
- **Objekte:** `trial_portal` (`kind: 'trial'`, Eingang zur Prüfung), `village_chest` (`kind: 'bank'`, Lager im Dorf).
- **Zustand (C):** Slice `trials` mit `run` (laufende Prüfung oder `null`); `inventory.bonus` (Set-Boni, Verzauberungen).
  API: `game.progression.trialRun()`, `game.progression.trialInfo()`.
- **Events:** `trial:started { run }`, `trial:progress { value, target, timeLeft }`, `trial:boss { bossId }`,
  `trial:completed { tier, time, rewards }`, `trial:failed { reason }` (`EV.TRIAL_*`); außerdem `achievement:unlocked`
  (`EV.ACHIEVEMENT_UNLOCKED`). Details und Commands: `src/progression/README.md`.
- **Bewusste Ausnahme von §11.5, nur in Prüfungen:** Episch 10 % + 2 % je Prüfungsstufe (höchstens 40 %),
  Legendär 1 % + 0,5 % je Prüfungsstufe (höchstens 6 %). In der Kampagne gelten die Grenzen aus §11.5 unverändert.

### 11.11 Veröffentlichen und Sicherung (Architektur)

- `npm run build` schreibt zusätzlich `dist/site/` (index.html = komplettes Spiel, `_headers` mit CSP/Sicherheitsheadern, robots.txt).
  Die CSP erlaubt nur `'self'`, `data:` und `blob:` – keine externen Skripte, Fonts oder Verbindungen einbauen, ohne `_headers` anzupassen.
- `game.save.requestPersistence()` wird nach dem ersten Speichern eines neuen Spiels aufgerufen (Browser soll den Stand nicht räumen).
- **Entfallen (30.09.):** Sicherungsdatei. `game.exportSaveFile()`/`importSaveFile()` und die Knöpfe sind entfernt; Charaktere liegen im Konto (docs/ONLINE.md). `SaveStore.exportAll/importAll` bleiben (CloudSync nutzt `importAll`). Früher:
- `game.exportSaveFile()` (in der claude.ai-Vorschau über die Capability `downloads` mit Rückfrage) lädt `emberfall-spielstand-JJJJ-MM-TT.json` herunter (alle Schlüssel mit Präfix `emberfall:v1:`).
- `await game.importSaveFile(file)` → `{ ok, accounts, characters }` oder `{ ok:false, reason:'format'|'full'|'size' }`;
  führt Accounts nach id zusammen, überschreibt keine anderen Accounts.
- UI-Knöpfe (Thread A, Titel/Account-Auswahl): „Spielstand sichern“ und „Sicherung laden“ (`<input type=file accept=".json">`).
- Spielstände bleiben lokal; die Oberfläche sagt das weiterhin deutlich.
- CSP `connect-src`: `'self'` plus genau die `supabaseUrl` aus `src/online/config.js` (der Build liest sie aus und prüft das Format).
- **Name:** sichtbar heißt das Spiel **Emberwrath** (Titel, Logo, Seitentitel, Texte). Intern bleiben `emberfall:v1:`-Schlüssel,
  das Exportformat `emberfall-save`, `window.emberfall` und der Ordnername – nicht umbenennen, sonst gehen Spielstände verloren.

### 11.12 Feinere Figuren: Überabtastung (Architektur, Wunsch von A)

- Das interne Bild hat `CONFIG.viewWidth × CONFIG.renderScale` Bildpunkte. Game setzt vor jedem Frame
  `ctx.setTransform(k, 0, 0, k, 0, 0)` und `imageSmoothingEnabled = false`. **Alle Systeme zeichnen weiter in Weltpixeln;**
  `CONFIG.viewWidth/viewHeight` bleiben Weltpixel. Nie `ctx.canvas.width/height` als Bildgröße lesen, nie `setTransform`/
  `resetTransform` auf dem Spiel-Kontext (nur `save/translate/restore`).
- `k = CONFIG.renderScale` (nur Game schreibt): höchstens `CONFIG.spriteRes` (2, seit 30.09. wegen Rucklern; Figuren res 2 passen bei k=2 pixelgenau), nie mehr als die Anzeige-Skalierung,
  Qualität „Mittel“ (Standard auf Touch) höchstens 2, „Niedrig“ 1. Die automatische Qualität senkt bei Ruckeln weiter.
- **`SpriteFrame.res`** (Standard 1) = Texel je Weltpixel; `canvas`, `ax`, `ay` sind in Texeln. `draw()` rechnet selbst um.
  Wer `frame.canvas` direkt zeichnet, teilt Position und Größe durch `res` (umgesetzt in Actor „Aufsteigen“, Afterimage,
  Decals.stampFrame, Enemy.drawScaled, HUD-Porträt). Gegner/NPCs können dieselbe Mechanik nutzen.
- `frame.weapon`/`glows` (A) bleiben in Weltpixeln relativ zum Fußpunkt.
- Leistung (Chromium ohne GPU, also Obergrenze): k=1 ~4–6 ms, k=2 ~10–13 ms, k=3 ~17–27 ms pro Bild; Hitzeflimmern
  (Glutgipfel, Glutschmiede) ist der teuerste Einzelposten. Mit GPU deutlich weniger.

## 12. Runde 3: Erweiterung bis Stufe 40 und Reiten (fest vereinbart, 30.09.)

Ziel: Stufe 20 → 40 dauert für einen normalen Spieler **6–8 Stunden** aktives Spielen (Stufe 1–20 bleibt unverändert,
ca. 30–60 Minuten). Ab Stufe 20 kann man reiten; Reittiere sind selten und teuer. Alles ist so gebaut, dass später weitere
Stufen (41+) nur neue Daten brauchen. Alle IDs unten sind fix; Namen/Texte dürfen die Besitzer anpassen. Bestehende IDs
aus §8 und §11 bleiben unverändert. Später sehen sich Spieler in der Welt (eigener Multiplayer-Thread): alles, was andere
sehen müssen, steht in §12.9.

### 12.1 Stufenkurve und Tempo (C, `progression/xp.js`)

- `LEVEL_CAP = 40`. Die Kurve für Stufe 1–19 bleibt **bitgenau** gleich (bestehende Spielstände, Tests). Ab Stufe 20 neue Formel,
  Umgesetzt (C, 30.09.): 20→21 = 42 000 EP, 20→40 ≈ 7 h (EP je Kill über `mobXp`, Nachweis `pacing.mjs`). Ursprünglicher Richtwert war `xpToNext(19) × 1,16^(L−19)`.
  Maßgeblich ist nicht die Formel, sondern das Tempo: **pro Stufe 15–25 Minuten**, zum Ende hin länger.
  C weist das mit `src/progression/test/pacing.mjs` nach (Kills/Minute und Quest-Anteil wie heute, Quest-XP ≈ 55–60 %).
- Charaktere, die heute auf 20 „voll“ stehen (`xp = xpNext`), steigen nach dem Update normal weiter (Migration in `progress.restore`).
- Richtwerte der Kette: Aschensteppe 20–25, Hügelgrab ≈ 25, Faulmarsch 25–30, Sporenschlund ≈ 31, Frostzinnen 31–35,
  Reifhöhlen ≈ 36, Glutöde 36–40, Aschethron ≈ 40.
- Glutprüfungen (§11.10) bleiben ab Stufe 20 offen; Gegnerstufe und Beute-`ilvl` = Stufe des Spielers (20–40), die Prüfungsstufen bleiben.

### 12.2 Zonen und Reiseweg (B)

| Zone-ID | Name | Art | Stufen | `maxPlayers` | `mountable` | Boss / Elite | `respawnZone` |
|---|---|---|---|---|---|---|---|
| `ashen_steppe` | Die Aschensteppe | outdoor | 20–25 | 40 | ja | Elite `steppe_warlord` | – |
| `howling_barrow` | Das Heulende Hügelgrab | dungeon, `instanced` | 24–26 | 5 | nein | Boss `barrow_king` | `ashen_steppe` |
| `blighted_marsh` | Die Faulmarsch | outdoor | 25–31 | 40 | ja | Elite `bog_horror` | – |
| `spore_hollow` | Der Sporenschlund | dungeon, `instanced` | 30–32 | 5 | nein | Boss `rot_mother` | `blighted_marsh` |
| `frostspire` | Die Frostzinnen | outdoor | 31–36 | 40 | ja | Elite `ice_troll_chief` | – |
| `rime_caverns` | Die Reifhöhlen | dungeon, `instanced` | 35–37 | 5 | nein | Boss `frost_wyrm` | `frostspire` |
| `ember_wastes` | Die Glutöde | outdoor | 36–40 | 40 | ja | Elite `waste_colossus` | – |
| `ashen_throne` | Der Aschethron | dungeon, `instanced` | 38–40 | 5 | nein | Elite `throne_sentinel`, Boss `ash_sovereign` | `ember_wastes` |

- **Reiseweg:** `cinder_peaks ↔ ashen_steppe`, `ashen_steppe ↔ howling_barrow`, `ashen_steppe ↔ blighted_marsh`,
  `blighted_marsh ↔ spore_hollow`, `blighted_marsh ↔ frostspire`, `frostspire ↔ rime_caverns`, `frostspire ↔ ember_wastes`,
  `ember_wastes ↔ ashen_throne`. Portal-IDs `to_<zielzone>`, Spawns `start`, `respawn`, `from_<herkunftszone>` wie §11.1;
  Portal nach `ashen_steppe` mit `requires: { level: 20 }`.
- **Neues Zonenfeld `mountable`** (bool; Standard: `true` für `outdoor`, `false` für alles andere, auch `ember_trial` und Dörfer-Innenräume);
  A prüft `zoneMountable(def) = def.mountable ?? (def.kind === 'outdoor')`. Zusätzlich darf B Flächen in `level.areas` mit `noMount: true` markieren (z. B. Lagerhütten).
- **Größe:** Außengebiete höchstens so groß wie `ashwood`/`cinder_peaks` (1536 × 1024 px), dafür wegen der Reittiere
  längere Wege sinnvoll anlegen (Straßen). Mehr Fläche nur nach Leistungsmessung durch Architektur.
- **Flächen (`area:reached`):** `ashen_steppe`: `steppe_outpost` (Lager, Stallmeisterin), `warlord_camp`, `barrow_gate`, `marsh_edge`;
  `howling_barrow`: `barrow_crypt`; `blighted_marsh`: `mirefort` (Lager), `sunken_village`, `spore_gate`, `frost_pass`;
  `spore_hollow`: `mother_nest`; `frostspire`: `frosthold` (Lager), `troll_caves`, `rime_gate`, `wastes_descent`;
  `rime_caverns`: `wyrm_lair`; `ember_wastes`: `last_bastion` (Lager), `colossus_field`, `throne_gate`; `ashen_throne`: `sovereign_hall`.
- **Objekte:** `ashen_steppe`: `war_banner_1..3` (`shrine`); `blighted_marsh`: `rot_totem_1..3` (`shrine`), `lost_caravan` (`item`);
  `frostspire`: `frost_beacon_1..3` (`shrine`); `ember_wastes`: `ember_obelisk_1..3` (`shrine`); Truhen `chest_*`, Bosstruhen `boss_*`.
- **Wetter/Stimmung (B Zone, D Effekte):** Steppe = Aschewind, Marsch = Nebel/Sporen, Zinnen = Schnee, Öde = Glutregen/Hitzeflimmern
  (Flimmern sparsam, §11.12 Leistung).

### 12.3 NPCs (B platziert, C schreibt Dialoge/Quests/Sortimente)

| NPC-ID | Zone | Rolle |
|---|---|---|
| `captain_varra` | `ashen_steppe` | Hauptquests Steppe/Hügelgrab |
| `stablemaster_orla` | `ashen_steppe` | Reiten: Einführungsquest, **Reittier-Händlerin** (§12.6) |
| `nomad_kesh` | `ashen_steppe` | Nebenquests |
| `trader_imra` | `ashen_steppe` | Händler Stufe 20–26 |
| `warden_thane` | `blighted_marsh` | Hauptquests Marsch/Sporenschlund |
| `alchemist_brisa` | `blighted_marsh` | Nebenquests |
| `trader_moll` | `blighted_marsh` | Händler Stufe 26–32 |
| `jarl_eskil` | `frostspire` | Hauptquests Zinnen/Reifhöhlen |
| `hunter_sigrun` | `frostspire` | Nebenquests |
| `trader_fenn` | `frostspire` | Händler Stufe 32–37 |
| `marshal_corvane` | `ember_wastes` | Hauptquests Öde/Aschethron |
| `pilgrim_aldo` | `ember_wastes` | Nebenquests |
| `quartermaster_ryn` | `ember_wastes` | Händler Stufe 37–40 |

### 12.4 Gegner (B, `enemy:killed.type`)

Wie §11.3 (`level`/`levels`, `xp`, `elite`, `boss`, `bossId`). Jede Zone bekommt mindestens 4 normale Typen mit eigenem
Verhalten (Nah, Fern, schwer, Schwarm) und eigene Sprites; neue Bosse mit Ansage, Phasen, Telegraphs, Todesanimation wie in Runde 2.

- `ashen_steppe` (20–25): `steppe_raider`, `raider_archer`, `dust_hyena` (Rudel), `ash_vulture` (fliegt, stößt herab),
  Elite `steppe_warlord` („Khar, der Steppenfürst“).
- `howling_barrow` (24–26): `barrow_wight`, `grave_hound`, `bone_archer`, `wight_caller` (beschwört), Boss `barrow_king`
  („Ulgrim, der Hügelkönig“, 2 Phasen).
- `blighted_marsh` (25–31): `bog_lurker`, `rot_shaman` (Zauberer), `swamp_leech` (Schwarm), `plague_toad` (Giftwolke),
  Elite `bog_horror` („Das Moorgrauen“).
- `spore_hollow` (30–32): `sporeling` (Schwarm), `fungal_brute` (schwer), `spore_caster`, Boss `rot_mother`
  („Mutter Fäulnis“, 3 Phasen).
- `frostspire` (31–36): `ice_troll`, `frost_wolf` (Rudel), `rime_witch` (Zauberer), `snow_stalker` (Hinterhalt),
  Elite `ice_troll_chief` („Gorm Eisfaust“).
- `rime_caverns` (35–37): `ice_elemental`, `crystal_spider`, `frozen_knight` (schwer), Boss `frost_wyrm`
  („Skalvyr, der Frostwurm“, 3 Phasen).
- `ember_wastes` (36–40): `ash_wraith`, `cinder_knight` (schwer), `magma_serpent`, `ember_cultist_adept` (Zauberer),
  Elite `waste_colossus` („Der Glutkoloss“).
- `ashen_throne` (38–40): `throne_guard`, `ash_priest`, `ember_hellhound`, Elite `throne_sentinel` („Wächter des Throns“),
  Endboss `ash_sovereign` („Malgareth, der Aschenfürst“, 3 Phasen, stärkster Kampf des Spiels).

### 12.5 Quests (C)

Zielarten, `zone` je Ziel und `turnInNpc` wie §11.4; Questpfad (§11.6) funktioniert unverändert.
Pro Außengebiet **6–8 Hauptquests und 4–6 Nebenquests**, dazu wiederholbare Kopfgeldquests `q_bounty_<zone>` bei jedem Händler.
Fest sind nur die Verbindungsglieder (Rest benennt C nach Schema `q_<zone>_<thema>`):

- `q_ignaroth` → `q_new_horizons` (Hale: nach `ashen_steppe`, mit `captain_varra` sprechen).
- `q_first_ride` (Orla, ab Stufe 20, parallel): „Reitunterricht“ – schaltet Reiten frei (§12.6), **kein** Gratis-Reittier.
- Steppe: … → `q_barrow_king` (Boss `barrow_king`) → `q_into_the_marsh` (mit `warden_thane` sprechen).
- Marsch: … → `q_rot_mother` (Boss `rot_mother`) → `q_frost_pass` (mit `jarl_eskil` sprechen).
- Zinnen: … → `q_frost_wyrm` (Boss `frost_wyrm`) → `q_the_wastes` (mit `marshal_corvane` sprechen).
- Öde: … → `q_ash_sovereign` (Boss `ash_sovereign`, Quest-Item `sovereign_crown`) = Ende der Kampagne.

### 12.6 Reittiere (A Logik/Figur, C Beschaffung, D Icons/HUD, B Zonenregeln)

**Freischaltung:** ab Stufe 20 **und** abgeschlossener `q_first_ride`. Vorher lässt sich kein Reittier benutzen (Hinweis „Ab Stufe 20
bei Stallmeisterin Orla in der Aschensteppe“).

**Definitionen (A, neue Datei `src/character/mounts.js`, Content-Typ `mount`):**
`{ id, name, rarity: 'rare'|'epic'|'legendary', speed, sprite, source, desc }`. Tempo-Bonus nach Seltenheit, fest:
`rare` **+60 %**, `epic` **+80 %**, `legendary` **+100 %** Laufgeschwindigkeit (unabhängig von der 30-%-Obergrenze aus Ausrüstung).
Reittiere kämpfen nicht, haben keine Werte außer Tempo.

| Mount-ID | Name | Seltenheit | Beschaffung (C) |
|---|---|---|---|
| `steppe_horse` | Steppenpferd | rare | Orla, sehr teuer (75 000 Gold) |
| `ash_wolf` | Aschenwolf | rare | Orla, sehr teuer (75 000 Gold) |
| `marsh_strider` | Sumpfschreiter | rare | Elite `bog_horror`, 1 % |
| `bone_stallion` | Knochenhengst | epic | Boss `barrow_king`, 1 % |
| `spore_beetle` | Sporenkäfer | epic | Boss `rot_mother`, 1 % |
| `frost_elk` | Frostelch | epic | Boss `frost_wyrm`, 1 % |
| `ember_charger` | Glutross | epic | Orla, extrem teuer, ab Stufe 40 (150 000 Gold) |
| `cinder_drake` | Schlackendrache | legendary | Boss `ash_sovereign`, 0,5 % |
| `nightmare_steed` | Albtraumross | legendary | Glutprüfung ab Prüfungsstufe 20, 0,3 % je Abschluss |

- Die Goldpreise stimmt C so ab, dass ein seltenes Reittier beim Händler **etwa 3–4 Stunden** Spielzeit im Bereich 25–35
  an Gold kostet und das epische erst gegen Stufe 40 erreichbar ist. Richtwerte oben passen C nach der Tempo-Simulation an.
- Reittier-Drops zählen **nicht** gegen die Seltenheitsgrenzen aus §11.5 (eigener Wurf, nicht persönlich übertragbar ist egal:
  es gibt keinen Handel). Kein Reittier in Truhen.
- **Gegenstand (C):** Beute/Kauf ist ein Item `mount_<mountId>` (`type: 'mount'`, `mountId`, `rarity`, Symbol `mount_<mountId>`).
  Benutzen im Inventar → C committet `mount:learn { mountId }` und entfernt das Item. Schon bekannt → Hinweis, Item bleibt (verkaufbar).
- **Zustand (A, Slice `character`):** `mounts: { owned: [mountId], active: mountId|null, riding: bool }` (Migration: fehlt → leer).
  Commands (A): `mount:learn { mountId }`, `mount:select { mountId }`, `mount:toggle` (aufsitzen/absitzen), Selektor
  `game.character.canMount()` → `{ ok, reason: 'level'|'lesson'|'none'|'combat'|'zone'|'area' }`.
- **Regeln (A, in `Hero`):** Aufsitzen dauert 1,2 s Stillstand (Wirkbalken, D zeichnet ihn), bricht bei Bewegung/Treffer ab.
  Nicht im Kampf (`hero.combatTime < 3`), nicht in Zonen mit `mountable: false`, nicht auf `noMount`-Flächen.
  Beritten: kein Angriff, keine Fähigkeit, kein Ausweichen, kein Trank. Ein Druck auf Angriff/Fähigkeit/Ausweichen **sitzt nur ab**
  (ohne die Aktion auszuführen). Automatisches Absitzen bei jedem erlittenen Treffer, beim Zonenwechsel in eine nicht
  beritten erlaubte Zone und beim Tod. Interagieren (NPC, Händler, Portal) geht beritten.
  `riding` wird gespeichert; beim Laden in eine erlaubte Zone sitzt man wieder auf.
- **Eingabe (D, `Input.js`):** neue Aktion `mount`, Tasten `KeyV` und `Digit6`; Touch-Knopf „Reittier“ neben der Hotbar,
  nur sichtbar, wenn `canMount().reason !== 'level'`. Auswahl des aktiven Reittiers im Charakter-Panel (Reiter „Reittiere“, C baut
  das Panel mit A’s Daten) mit Tempo und Seltenheitsrahmen.
- **Figur (A):** neue Datei `src/sprites/mounts.js`: je Reittier **nur Seitenansicht** (4 Steh- und 6 Lauf-Frames, nach links gespiegelt; Stand der Lieferung 30.09.), `res` wie Helden (§11.12);
  Heldenfigur bekommt eine Sitz-Pose, Waffe bleibt auf dem Rücken sichtbar. Hoher Wiedererkennungswert je Seltenheit
  (legendär mit Glut-/Leuchteffekt über `glows`).
- **Events (Architektur, `events.js`):** `mount:changed { riding, mountId }` (`EV.MOUNT_CHANGED`), `mount:learned { mountId }`
  (`EV.MOUNT_LEARNED`). D zeigt Toast/Staubwolke, Audio Hufschlag optional.

### 12.7 Gegenstände (C; Icons D)

- **Tiers weiter** nach `ilvl`: 5: 21–25, 6: 26–30, 7: 31–35, 8: 36–40; allgemein `tier = 4 + ceil((ilvl − 20) / 5)` für `ilvl > 20`
  (erweiterbar). Icons `<visual>_t5 … _t8` (D); fehlt eins, fällt D auf `_t4` zurück.
- Je Tier dieselbe Vielfalt wie §11.5, dazu je Außengebiet ein Rüstungsset (3–4 Teile, Boni wie bisher) und je Dungeonboss
  eine benannte Waffe und ein Set. Materialien je Zone (C benennt, Schema wie bisher), Tränke `superior_potion` (Tier 5+),
  `supreme_potion` (Tier 7+), Manatränke entsprechend.
- **Seltenheitsgrenzen** aus §11.5 gelten unverändert auch für 21–40. Bosse: `epic` Hügelkönig 4 %, Mutter Fäulnis 5 %,
  Frostwurm 6 %, Aschenfürst 8 %; `legendary` ≤ 2 % **nur** `ash_sovereign` (neuer legendärer Pool, 6 Teile, `ilvl 40`) und
  weiter Ignaroth (sein Pool bleibt `ilvl 20`). Glutprüfungen nach §11.10.
- `reqLevel` = `ilvl` − 1 wie bisher; Händler verkaufen weiter nur `common`/`uncommon` (Reittiere ausgenommen, §12.6).

### 12.8 Charakter bis 40 (A)

- `computeStats` bis Stufe 40 (Klassenwerte linear weiter; Gegner-/Item-Werte von B/C darauf abgestimmt, Kampfdauer je
  Normalgegner wie bei 1–20: 2–4 Treffer).
- **Keine neuen Hotbar-Plätze.** Neue Talent-Stufen bei **22, 28 und 34** (je Klasse Passive oder „Rang 2“ einer bestehenden
  Fähigkeit mit sichtbar anderem Effekt). Talentpunkte bis 40 fortschreiben.

### 12.9 Vorbereitung Mehrspieler (alle)

- **Sichtbar für andere Spieler** ist nur, was im Helden-Abbild steht, das der Multiplayer-Thread verschickt:
  Position, Richtung, Animation, Volk/Klasse/Aussehen, sichtbare Ausrüstung (`visual`, Seltenheit), **`mountId` und `riding`**.
  A stellt dafür `hero.snapshotLook()` → `{ raceId, classId, appearance, gear, mountId, riding }` bereit (reine Daten, keine Canvas).
  Fremde Spieler zeichnet derselbe Code wie den eigenen Helden (`sprites/hero.js`, `sprites/mounts.js`) aus diesem Abbild.
- Neue Zonen/Bosse/Gegner nur als Daten + Logik, die ohne DOM laufen kann (wie heute `world/*`, `progression/logic.js`),
  damit ein Server sie später ausführen kann. Keine Zufallszahlen aus `Math.random()` in neuer Spiellogik, sondern den
  vorhandenen RNG der Sitzung (`h.rng`, `world.rng`).
- Offene Gebiete bleiben Kanäle mit `maxPlayers: 40`, Dungeons Instanzen mit 5 – der Multiplayer-Thread verteilt Spieler später
  auf mehrere Welten/Kanäle.

### 12.10 Zuständigkeiten Runde 3 (Dateien wie §9)

- **A:** `character/mounts.js` (neu), `sprites/mounts.js` (neu), Reitlogik in `entities/Hero.js`, Slice `character.mounts` + Commands +
  `canMount()`, Sitz-Pose in `sprites/hero.js`, `computeStats` bis 40, Talent-Stufen 22/28/34, `hero.snapshotLook()`.
- **B:** 8 Zonen (§12.2) mit Portalen, Spawns, Flächen, Objekten, NPC-Plätzen, `mountable`/`noMount`, Straßen; alle neuen Gegner und
  Sprites, 4 Bosse + 4 Eliten mit Animationen/Telegraphs; Wetter/Stimmung je Zone gemeinsam mit D.
- **C:** `LEVEL_CAP = 40` + Kurve (§12.1) mit Tempo-Nachweis, alle Quests/Dialoge (§12.5), Items/Sets/Tränke (§12.7), Beutetabellen
  inkl. Reittier-Drops, Händler inkl. Orla, Gold-Ökonomie, Item-Typ `mount` → `mount:learn`, Reiter „Reittiere“ im Charakter-Panel,
  Glutprüfungen skalieren mit Spielerstufe.
- **D:** Icons Tier 5–8 und `mount_<id>`, Aktion `mount` (Tasten + Touch-Knopf), Wirkbalken beim Aufsitzen, Staub-/Hufeffekte,
  Schnee/Nebel/Sporen/Glutregen, Minimap-Farben der neuen Zonen, Stufenanzeige bis 40 im HUD.
- **Architektur:** `EV.MOUNT_CHANGED`, `EV.MOUNT_LEARNED`, dieser Vertrag, Integration, Kampagnen-Bot bis 40 (beschleunigt),
  Leistungsmessung der neuen Zonen (Desktop + Handy), Veröffentlichen.
- **Reihenfolge:** C zuerst `xp.js` + Item-/Quest-Grundgerüst, B zuerst Zonen mit Platzhalter-Gegnern (Portale und Wege spielbar),
  A zuerst Reitlogik mit Platzhalter-Sprite. Jede Teillieferung darf einzeln integriert werden, solange das Spiel bis 20 unverändert läuft.
