# Fortschritt (Thread C): Quests, Stufen, Beute, Inventar, Gold, Händler, Schmiede

Alles liegt in `src/progression/`. Nur `index.js` wird von `main.js` geladen (`installProgression`).

| Datei | Inhalt |
|---|---|
| `xp.js` | Levelkurve bis 20 (`xpToNext`, `totalXpForLevel`), `mobXp` (Elite ×5, Boss ×25), `killXp` (Stufenabstand), `questXp` |
| `items.js` | 177 Items: 8 Waffenarten, Rüstung in 4 Macharten × 4 Plätze, Ringe/Amulette, Tränke, Materialien; 5 Seltenheiten (`legendary` neu), `ilvl`, `reqLevel`, `tier`, `visual` |
| `quests.js` | 29 Quests (Kampagne bis 20, Nebenquests, 3 wiederholbare Kopfgelder), NPC-Texte, 3 Händler |
| `loot.js` | Beute mit den Seltenheitsgrenzen aus INTEGRATION §11.5, Materialien je Gegnertyp, Questbeute, `pickRewardGear` |
| `crafting.js` | 31 Schmiede-Rezepte (Alchemie, Waffen, Rüstung, Schmuck; höchstens `rare`) |
| `logic.js` | Slices + Commands (ohne DOM, testbar, server-tauglich) |
| `rares.js` | 7 seltene Weltgegner (einer je Gebiet, Aschenwald zwei) mit eigenem Beutestück, Wiederkehr |
| `sets.js` | 4 Sets mit Boni ab 2/3/4/5 Teilen (Varkhul, Nerith, Ignaroth, Glutwächter) |
| `smithing.js` | Verstärken (+1…+10 je Platz) und 10 Verzauberungen, `computeBonus` → `inventory.bonus` |
| `achievements.js` | 31 Erfolge in 5 Gruppen, 13 davon mit Titel |
| `trials.js` | Glutprüfungen: `trialSpec(tier, seed)`, Belohnung, Chancen |
| `endgame.js` | Slices/Commands für Bank, Erfolge, Schmied, Glutprüfungen |
| `endgamePanels.js` | Panels `bank`, `achievements`, `smith`, `trials` |
| `selectors.js` | Reine Lesefunktionen: `xpInfo`, `questTarget`, `trackedQuestId`, `isUpgrade`, `vendorStock`, `junkSlots` … |
| `ProgressionSystem.js` | Sitzungssystem: Events → Commands, Heilen/Ressource, Questmarkierungen (`!` gelb, `!` blau = Kopfgeld, `?`) |
| `LootDrop.js` | Beute in der Welt (Grafik und Leuchten von D: `drawLoot`), Einsammeln per `loot:claim` |
| `panels.js`, `widgets.js`, `progression.css` | Panels `inventory`, `character`, `questlog`, `questDialog`, `shop`, `craft` |
| `test/logic.test.mjs` | 27 Logiktests: `node src/progression/test/logic.test.mjs` |
| `test/pacing.mjs` | Tempo-Simulation der Kampagne mit den echten Commands: `node src/progression/test/pacing.mjs` |

## Slices

```
progress  { level, xp, xpNext, stats: { kills, bossKills, eliteKills, questsCompleted, goldEarned, itemsLooted, crafted } }
          xp und xpNext sind GESAMT-Erfahrung; Fortschritt in der Stufe: game.progression.xpInfo()
inventory { slots: 36 × ({ itemId, qty, n? } | null), equipment: { weapon, head, chest, hands, feet, ring, amulet }, questBag: [{ itemId, qty }] }
          questBag = Überlauf für Questgegenstände/Sammelobjekte aktiver Quests und Questbelohnungen bei voller Tasche (Abgabe klappt immer); zählt für Quests, wandert bei Platz zurück
          n = neu (gelber Punkt), wird beim Schließen des Inventars gelöscht (inventory:seen)
wallet    { gold }
quests    { active: { [questId]: { status: 'active'|'ready', progress, seen?, bossSeen? } }, completed: [], repeats: {}, tracked }
rares     { killedAt: { [rareId]: ms }, kills: { [rareId]: n } }
```
Neues Spiel: 5 kleine Heiltränke, 3 Herdbrote, Startwaffe und Brustteil je Klasse (`STARTER_GEAR` in logic.js). Beim Laden werden unbekannte Items/Quests verworfen;
alte Stände (24 Plätze, `armor`/`trinket`) werden migriert.

## Tempo und Seltenheit

Simulation (`test/pacing.mjs`): Varkhul Stufe 6, Ende Aschenwald 10, Nerith 12, Schmiedewächter 17, Ignaroth 20;
Quests liefern rund 65 % der Erfahrung. Gegner 5 Stufen unter dir geben nur noch 10 %.

| Quelle | Seltenheit (v5, gesenkt: blau besonders, lila wirklich selten) |
|---|---|
| normale Gegner | 6 % Chance auf Ausrüstung; davon 14 % grün, 0,8 % blau; nie lila |
| Elite | 1 Teil: 57 % grün, 12 % blau, 1 % lila; Material: Glutkern 15 %, Schattenessenz 8 %, Rubin/Saphir je 6 %, Amethyst 1,5 % |
| Seltene Weltgegner | 1 Teil mind. grün: 28 % blau, 2 % lila; eigenes Beutestück 25 % |
| Varkhul | 2 Teile, mind. grün: 22 % blau, 3 % lila |
| Nerith | 2 Teile, mind. grün: 45 % blau, 5 % lila |
| Ignaroth | 3 Teile, mind. blau, 8 % lila; 1,8 % pro Kill ein legendäres Teil |
| Truhen / Bosstruhen | 3 % blau / 25 % blau, nie lila |

Materialien: Glutenerz, Schattenessenz, Rubin, Saphir sind grün, Amethyst blau.
Weltsimulation 1–20: rund 10 blaue und 1 lila Teil pro Durchlauf.

## Endgame (Runde 3)

- **Sets:** Setteile fallen bei Varkhul (50 %/Kill), Nerith (50 %) und Ignaroth (12 %, episch); das Wächter-Set und
  (teuer, als Pechschutz) die Tyrannen-Teile gibt es in der Schmiede gegen Glutsplitter. Tooltip zeigt Teile und Boni.
- **Zusatzwerte:** `inventory.bonus` = Setboni + Verstärkung + Verzauberung. Thread A addiert es in `computeStats`.
  Verstärkung und Verzauberung hängen am Platz, nicht am Teil (Items sind reine IDs).
- **Bank:** Slice `bank { size 16…48, slots }`, Erweitern kostet 200/600/1500/4000 Gold. Geöffnet über
  `object:interact` mit `kind: 'bank'` oder den Knopf bei Maren/Dunn.
- **Erfolge:** Slice `achievements { unlocked, title }`, geprüft nach jedem Command von C; Event `achievement:unlocked`
  + Toast. `game.progression.title()` liefert den gewählten Titel (für HUD/Namensschild).
- **Glutprüfungen:** ab Stufe 20 nach `q_ignaroth`. `trial:start { tier }` → Lauf in `trials.run`, Reise nach
  `ember_trial` (nur wenn die Zone existiert). Punkte: normal 1, Elite 4, Ziel 60 → `trial:boss` → Bosstod →
  `trial:completed` mit Gold, Glutsplittern und 1–2 Teilen Stufe 20 (episch 10 % + 2 %/Stufe ≤ 40 %, legendär
  1 % + 0,5 %/Stufe ≤ 6 %). Zeit (10 min), Tod oder Verlassen → `trial:failed`. Boss-Leben absolut in `run.bossHp` (9000 × Thema × hpMult, Stufe 1 ≈ 30–40 s mit Epic). B liest `game.progression.trialRun()`,
  D `trialInfo()`. Einstieg: `object:interact` mit `kind: 'trial'` oder Knopf bei Maren.

- **Seltene Weltgegner:** `game.progression.rareSpawns(zoneId)` einmal pro Zonenaufbau → `[{ rareId, type, name, title, level,
  hpMult, dmgMult, scale, tint, spawn: 'deep'|'path'|'boss', elite }]`. B spawnt einen Gegner vom Typ `type` mit diesen
  Werten und meldet `enemy:killed` mit `rareId`. Nie besiegt → erscheint immer; danach nach `respawn` (5–10 min) mit 50 %.
  Beute: 1 Teil mind. grün (lila 3 %), Gold ×6, 30–40 % eigenes Beutestück (`source: 'rare'`). ×8 Erfahrung.
  Event `rare:killed { rareId, name }` → Banner. Erfolge „Seltener Fang“ und „Großwildjäger“ (Titel).
- **NPC-Gespräche:** `NPC_LINES[npc].lines` = `[[questId | null, Text], …]`, `npcIdleLine()` nimmt die letzte freigeschaltete Zeile
  (Reiter „Gespräch“ im Dialog). Die Zeilen erzählen den roten Faden (Flammenkrone: Varkhul → Rask → Nerith → Ignaroth) und
  geben Hinweise auf die seltenen Gegner.

## Commands (★ = authoritative)

| Command | Nutzlast | Ergebnis |
|---|---|---|
| ★ `progress:grantXp` | `{ amount, source }` | |
| ★ `progress:kill` | `{ type, level, isBoss, bossId, elite, summoned, rareId, now }` | `{ xp }` – XP (beschworene 20 %), Statistik, Kill-Ziele |
| ★ `quest:event` | `{ kind: 'reach'\|'boss'\|'kill'\|'interact'\|'talk', target }` | |
| `quest:accept` / `quest:abandon` | `{ questId }` | `{ ok }` (neue Hauptquests werden automatisch verfolgt) |
| `quest:track` | `{ questId \| null }` | `{ ok }` → `quest:tracked` |
| `quest:guide` | `{ questId \| null }` | Questpfad zum Geber einer verfügbaren Quest (Questlog „Hinführen“); `questTarget()` bevorzugt ihn |
| ★ `quest:turnIn` | `{ questId }` | `{ ok, rewards, overflow }` – was nicht passt, landet im Questbeutel |
| ★ `inventory:add` / `inventory:remove` | `{ itemId, qty }` | |
| `inventory:move` / `inventory:sort` / `inventory:seen` | `{ from, to }` / – / – | |
| `inventory:equip` / `inventory:unequip` | `{ slot: index }` / `{ slot: 'weapon'… }` | `reason: 'class' \| 'level'` |
| ★ `inventory:use` | `{ slot }` | `{ ok, effect }` → `item:used` (`heal`, `resource`) |
| `inventory:discard` | `{ slot, qty? }` | Questgegenstände nicht |
| ★ `inventory:sell` | `{ slots: [index] }` | verkauft überall (Mehrfachauswahl), `{ ok, gold, count }` |
| ★ `inventory:sellJunk` | `{ upTo: 'common' \| 'uncommon' }` | alles bis zu dieser Seltenheit, außer Verbesserungen |
| `inventory:autoSell` | `{ mode: null \| 'common' \| 'uncommon' }` | beim Aufsammeln automatisch verkaufen (Verbesserungen bleiben), Event `item:autoSold` |
| ★ `wallet:addGold` | `{ amount, source }` | |
| ★ `shop:buy` / `shop:sell` / `shop:sellJunk` | `{ vendorId, itemId }` / `{ vendorId, slot }` / `{ vendorId }` | |
| ★ `craft:make` | `{ recipeId }` | `reason: 'level' \| 'gold' \| 'mats' \| 'full'` |
| ★ `loot:roll` | `{ source: 'kill'\|'chest', id, level, elite, isBoss, bossId, family, x, y }` | `{ drops }` → `loot:dropped` |
| ★ `loot:claim` | `{ dropId }` | `{ ok, reason? }` |
| `bank:deposit` / `bank:withdraw` | `{ slot }` | `{ ok, qty }` |
| `bank:depositMaterials` / `bank:sort` / ★ `bank:expand` | – | |
| `achievement:title` | `{ id \| null }` | |
| ★ `smith:upgrade` / ★ `smith:enchant` | `{ slot }` / `{ slot, enchantId }` | `reason: 'gold' \| 'mats' \| 'level' \| 'max'` |
| ★ `trial:start` / ★ `trial:fail` / `trial:leave` | `{ tier }` / `{ reason }` / – | |

## Welche Events C hört und was passiert

| Event | Reaktion |
|---|---|
| `enemy:killed` | `progress:kill` + `loot:roll` (nicht für `summoned`) → `LootDrop` in `world.spawn` |
| `boss:defeated`, `area:reached`, `zone:enter` | `quest:event` (Zone als Ziel: `'zone:<zoneId>'`) |
| `object:interact` | `kind: 'chest'` → `loot:roll` (objectId `boss…` = Bosstruhe); sonst `quest:event 'interact'` |
| `npc:interact` | `quest:event 'talk'` und Panel `questDialog` (Händler: „Handeln“, Brom/Dunn: „Schmiede“) |
| `item:used` | heilt `world.hero` bzw. füllt `hero.resource` (nicht bei Wut) |
| `level:up` | Held im nächsten Tick auf volle HP |
| Aktion `potion` | bester passender Heiltrank, Abklingzeit 1,5 s (`hero.potionCd`, `hero.potionCooldown`) |

## Für andere Threads

- **Stufe 20:** `q_ignaroth` hat `reachLevel: 20` – das Ende der Geschichte hebt sicher auf 20. Neu freigeschaltete Quests werden nach jeder Abgabe per Toast angesagt.
- **Questpfad (B):** `game.progression.questTarget()` → `null` oder `{ questId, objectiveId, title, text, zoneId, kind, id, ids?, ready, offer? }`
  mit `kind` `npc | area | enemy | object | boss | zone`. `ids` = alle Kandidaten (Gegnertypen, offene Objekte).
  Ohne verfolgte Quest zeigt es auf den nächsten Questgeber (`offer: true`).
- **B:** `enemy:killed` mit `level`, `elite`, `isBoss`, `bossId`, `summoned`; Objekte mit `kind` (`chest`, `shrine`, `item`).
  Richtwerte für Gegnerstufen stehen in `test/pacing.mjs` (`ENEMY_LEVELS`).
- **A:** 7 Ausrüstungsplätze; Items tragen `reqLevel`, `visual` (Waffe), `family` (Machart) und Werte `str/agi/int/vit/moveSpeed`.
- **D:** `game.progression.trackedQuestId()`, `trackQuest(id)`, `questTarget()`, `xpInfo()`, `isUpgrade(itemId)`.
