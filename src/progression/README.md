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

## Erweiterung Stufe 20–40 (Runde 3, §12)

- `xp.js`: `LEVEL_CAP = 40`, Stufe 1–19 bitgenau wie vorher. Ab 20 berechnet `xpToNext` die XP aus der Zielzeit
  (15 → 25 Minuten je Stufe) und `PACE` (15 Kills/min, Kampfanteil 42 %, Wirkungsgrad 0,8). 20→21 = 42 000 EP.
  Volle Stufe-20-Stände steigen nach dem Laden normal weiter (`progress.deserialize`).
- `test/pacing.mjs` (geeicht an „Stufe 20 nach 30 Minuten“): 1–20 ≈ 31 min; 20–40 ≈ 5,4 h reine Spielzeit eines schnellen
  Spielers (ohne Dungeonsuche und Prüfungen), Quest-Anteil ≈ 66 %, Gold 20→40 ≈ 160 000 (alle Beute verkauft), 25–35 ≈ 29 000 Gold/h.
  Die Geschichte endet mit der Heimkehr auf Stufe 39; Kopfgelder und Jagdaufträge füllen nur noch kleine Lücken.
- `items40.js`: Tier 5–8 (`tierOf` erweitert), je Tier 3 Stile × (18 Waffen früh/spät, 16 Rüstungsteile, 2 Schmuck),
  handgeschriebene Epics, 7 Sets von Eliten/Dungeonbossen + `sovereign`, benannte Bosswaffen, 6 Legendäre des Aschenfürsten,
  Tränke `superior_potion`/`supreme_potion`/`greater_mana`/`supreme_mana`, Zonenmaterialien, Questgegenstände,
  9 Reittier-Gegenstände `mount_<id>` (`type: 'mount'`, `mountId`, `price` bei Orla). Icons nach D's Schema `_t5…_t8`.
- `quests40.js`: 55 Quests (Hauptkette Hale → Varra → Thane → Eskil → Corvane → `q_ash_sovereign`), `q_first_ride` bei Orla,
  4 Kopfgelder, Gesprächszeilen und Händler (`stablemaster_orla` mit `gear: false`: nur Reittiere).
- Reittiere: Stallpreise 75 000 (selten) und 150 000 (Glutross, ab Stufe 40). Drops: Hügelkönig/Mutter Fäulnis/Frostwurm/Moorgrauen 1 %,
  Aschenfürst 0,5 %, Glutprüfung ab Prüfungsstufe 20 0,3 %. `inventory:use` auf einen Reittier-Gegenstand committet `mount:learn`
  (Thread A); bekannt → `{ reason: 'known' }`, Gegenstand bleibt. Beritten kein Trank (`reason: 'riding'`, Toast „Nicht beritten“).
- Charakter-Panel hat den Reiter „Reittiere“ (Daten von A). Glutprüfungen: Stufe, Boss-Leben (+5 %/Stufe über 20), Gold und
  Beute-ilvl folgen der Spielerstufe; ab 38 zusätzlich der legendäre Pool des Aschenfürsten.

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

## Release-Runde (2026-10-03)

- **Wirtschaft und Gold-Shop:** Gold allein (auch gekauftes) kauft keine Macht ohne Spielen. Orla verkauft Reittiere erst nach
  `reqQuest` (Pferd/Wolf nach `q_first_ride`, Glutross nach `q_ash_sovereign` und ab 40; `shop:buy` → `reason: 'quest'`).
  Neue Gold-Sinks brauchen Materialien der Gebiete 20–40: Verstärken bis +15 (`smithing.js`, je Platz ≈ 45 000 Gold,
  ab +11 halbe Prozentwirkung), 9 neue Verzauberungen (1 500–5 000 Gold), 45 neue Rezepte.
- **Schmiede unterwegs:** Imra, Moll, Fenn und Ryn haben `craft: true` (Schmiede + Verstärken). Die Liste „Alle“ zeigt nur,
  was gerade zählt (keine Ausrüstung > 8 Stufen unter dir, nichts > 5 Stufen über dir), Neuestes zuerst.
- **Rezepte 20–40** (`crafting.js`): Alchemie (Dörrfleisch, Vorzügliche/Erhabene Heil- und Manatränke) und je Tier 6 Waffen
  (jede Klasse mindestens zwei) + 4 Brustteile im Stil „selten“ aus `items40.js`, aus den Materialien der Region.
- **Quests:** 13 neue Nebenquests in den Lücken (Imra, Varra, Moll, Thane, Fenn, Sigrun, Ryn, Corvane), 4 wiederholbare
  Jagdaufträge (Kesh, Brisa, Sigrun, Aldo), Nachspiel `q_homecoming` (Corvane → Hale). 5 neue Questgegenstände mit
  `QUEST_DROPS`. Questgewichte ×1,2, Malgareth 0,8 und Heimkehr 1,0 Stufen-Anteil.
- **Glutprüfungen 20–40** (`trials.js`): 4 neue Themen mit Gegnern und Boss der Gebiete (Heulendes Grab/Ulgrim ab 22,
  Faulender Schlund/Mutter Fäulnis ab 27, Reifgewölbe/Skalvyr ab 32, Thron der Asche/Malgareth ab 37), jeweils erst
  nach der Story-Quest dieses Bosses (`after`). `trialThemesFor(level, completed)`, `trialSpec(…, completed)`.
  In Prüfungen gibt es keine Reittier-Beute und keine Boss-Anrechnung für Quests.
- **Tränke knapper:** Trankdrop normal 6 % (Prüfung 3 %), Questbelohnungen 1–20 je ein Trank weniger (ab 3).
- **Graumaul** (`rares.js` `minPlayer: 3`) erscheint erst ab Spielerstufe 3, „Seltener Fang“ kommt nicht mehr in der ersten Minute.

## Runde 08.10.: Balancing, Questvielfalt, Items, Auftragsbrett

- **Stufenabstand** (`levelGap.js`): `applyLevelGap(hit, target)` in `Actor.takeHit`/`Hero.takeHit` (B/A).
  Ziel 3 Stufen höher: 82 % Schaden, ×1,32 erlitten; 5 höher: 60 %/×1,82; ab 10: 10 %/bis ×4. Stufe 24 gegen Malgareth ist chancenlos.
  `levelGapColor()` für die Stufenzahl über Gegnern.
  **Stand 10.10.:** Kurve ab 3 Stufen steiler (3: 70 %, 4: 50 %, 5: 33 %, 6: 22 %, 8: 9 %, ab 10: 4 %), Elite ab Stufe 20 zählen
  zwei Stufen höher (`combatLevel`). Standfestigkeit `staggerGuard`/`knockbackMult` in `Enemy.onHurt`/`takeHit`: drei Stufen höher
  unterbrechen nur schwere Treffer, ab sechs keine, sonst kurze Ruhe nach dem Taumeln (bis Stufe 4 keine), Rückstoß nach oben gedämpft.
- **Materialbeutel:** Materialien liegen in `inventory.mats` und belegen keine Taschenplätze (alte Stände werden umgelagert).
  `inventory:sellMat`, Selektor `materialList`. Neue Charaktere haben Auto-Verkauf „Weiße“.
- **Weniger Plunder:** Weiße Ausrüstung normaler Gegner fällt direkt als Gold (`junk: true`), Grün dafür öfter (29 % statt 14 % der Teile), Blau je Kill unverändert.
- **Varianten:** Jedes grüne/blaue Zufallsteil gibt es zusätzlich in 2 Fassungen mit Beinamen (`VARIANTS`: des Bären/Wächters/Fuchses/Falken, der Eule/Glut),
  andere Attribute + kleiner Zusatzwert. ID `<basis>_<variante>`, Felder `variant`, `base`.
- **Neue Zielarten** (logic.js `recordQuestEvent`): `sequence` (Reihenfolge, falsch = von vorn, `failText`), `use` (`item` wird verbraucht, `startItems` bei Annahme),
  `reach` mit mehreren Flächen (Erkunden), `escort`/`defend` (B meldet `quest:objective` { kind, target }, `…Failed` setzt zurück),
  `choices` bei der Abgabe (`quest:turnIn { choice }`, `requiresChoice` für Folgequests, `quests.choices`).
  Quests mit `needs: 'escort'|'defend'` bleiben verborgen, bis B `game.progression.setWorldFeatures([...])` meldet. `game.progression.openObjectives()` für B.
- **Quests:** 22 neue in `questsVariety.js` (alle Gebiete, 2 Entscheidungsketten mit Wendung: Vesks Kontobuch, Kessel der Moorhexe; Schicksal der Krone auf 40).
  5 alte umgebaut: Siegel der Spalte, Faultotems, Glutobelisken (Reihenfolge); Banner, Leuchtfeuer (Benutzen).
- **Champions** (B, Idee 1): `champion` in `progress:kill`/`loot:roll` → ×4 Erfahrung, 1 Teil mind. grün (blau 15 %, lila 1 %), 35 % ein zweites grünes, Gold ×5.
- **Auftragsbrett** (`board.js`, Panel `board`): 3 Tagesaufträge (UTC-Tag, Würfel aus Tag + Region, für alle gleich), Wochentruhe nach 10 Aufträgen
  (Montag–Sonntag). Region nach Spielerstufe am Tagesbeginn. Auf 40 mit Prüfungen/Bossen aller Gebiete, Gold + Material statt Erfahrung.
  B: `board:open` { zoneId } öffnet das Panel, `game.progression.boardHasOffers(zoneId)` für den Leucht-Hinweis.
- **Tempo** (pacing.mjs): 1–20 ≈ 40 min (vorher 31, mehr Quests), 20–40 ≈ 4,9 h Sim; echte Zeit steigt durch größere Karten und den Stufenabstand.

### Nachtrag 08.10. (Balance-Messung B)
- `applyLevelGap` nimmt bei Geschossen/Trefferzonen ohne Stufe die Stufe von `source.hero ?? owner ?? caster`.
- Kurve steiler: 3/4 Stufen ×0,79/×0,66 Schaden, ×1,37/×1,62 erlitten; ab 5 `max(0,05, 0,40−0,08·(g−5))` bzw. `min(4, 2,4+0,3·(g−5))`.
- Tränke: im Kampf (Treffer in den letzten 5 s) 10 s Abklingzeit, sonst 1,5 s (`POTION_COOLDOWN_COMBAT`, `hero.potionCooldown` für die HUD-Anzeige).

## Runde 10.10.: Gründe, täglich wiederzukommen (`daily.js`, `clock.js`)

Alles sichtbar im Auftragsbrett, kein neues Fenster und kein neuer Knopf.
- **Tagesbelohnung:** Serie über 7 Tage, eine Belohnung je UTC-Tag, automatisch beim ersten Spielen des Tages (eine Ansage
  über die Banner-Warteschlange, `kind: 'daily'`). Ausgelassene Tage setzen nichts zurück. Tag 7: Gold und ein blaues Teil.
  Neue Helden: erste Belohnung am Tag nach der Erschaffung.
- **Erster Sieg des Tages:** erster Boss/Elite/Champion/Seltener am Tag → Erfahrung + Gold (auf 40 Gold + 2 Glutsplitter), nur Toast.
- **Wochenherausforderung:** einer der zwei stärksten Story-Bosse, die man schon schaffen kann (ab Glutprüfungen: Prüfung
  Bestwert − 1), mit Regel ohne Heiltrank / ohne zu fallen / unter 150 s (Prüfung: unter 5 min). Abholen am Brett; Brett leuchtet.
  Vier geschaffte → Erfolg „Wachfeuer“, schaltet die Färbung Wachfeuer im Spiegel frei.
- **Zeit:** `clock.js` liest den Date-Kopf von `/version.json` (HEAD, no-store); Tage und Wochen gehen nie rückwärts.
  Ohne Serverzeit keine Tagesbelohnung. Auch Auftragsbrett und Wochentruhe rechnen jetzt mit `serverNow()`.
- Slice `daily { day, streak, rounds, winDay, week, challenge, cDone, cClaimed, cTotal }`, Commands `daily:login`, `daily:sync`,
  `daily:engage` (Boss/Prüfung beginnt), `daily:mark` (Trank/Tod), `daily:claimChallenge`. Gold je Woche auf Stufe 30 ≈ 13 Spielminuten (pacing.mjs).
