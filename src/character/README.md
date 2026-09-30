# Thread A – Charakter, Account, Speicherung

## Dateien
- `src/character/races.js` – 4 Völker (`human`, `dwarf`, `elf`, `emberborn`), content `race`
- `src/character/classes.js` – 4 Klassen (`warrior`, `rogue`, `ranger`, `mage`) + 8 Fähigkeiten, content `class` / `ability`
- `src/character/stats.js` – `computeStats(state, content)`, `deriveStats({ raceId, classId, level, equipment }, content)`, `equipmentBonus()`
- `src/character/abilities.js` – Verhalten der Fähigkeiten, `HeroProjectile` (Pfeil, Glutbolzen, Wurfdolch)
- `src/character/createHero.js` – `createHero(session, x, y)`
- `src/character/index.js` – `installCharacter`, Slice `character`, Command `character:rename`, `validateName()`
- `src/entities/Hero.js` – klassengesteuerter Held (Nahkampf-Kombo oder Schuss, 2 Fähigkeiten, Ressource, Buffs)
- `src/sprites/hero.js` – `getHeroSprites(raceId, classId, variant, gear?, style?)` (Skelettfigur mit IK, Frames werden je Animation erst bei Bedarf gerastert; eigene Posen `slam`, `lunge`, `coat`, `rainshot`, `plant`, `summon`, `hurl` für die Stufe-4/12-Fähigkeiten, Waffen-Wischspuren über Pose-Feld `smear: [altWinkel, neuWinkel]`); `createHeroSprites()` bleibt für `Assets.js`
- `src/character/cosmetics.js` – Färbungen (`DYES`), Frisuren je Volk, Preise; `character:restyle { variant?, dye?, hairStyle? }` kostet Gold (prüft das Guthaben vorher)
- `src/character/AppearancePanel.js` – Panel `appearance` (Spiegel `appearance_mirror` im Dorf, Brom „Rüstung färben“)
- `src/character/TalentPanel.js`, `src/character/talents.js` – Panel `talents`, Talentbaum und Passive
- `src/account/backups.js` – 3 Speicherplätze + automatische Sicherung je Charakter (Schlüssel `emberfall:v1:slots:<acc>:<chr>`), `snapInfo()` für Stufe/Titel/Spielzeit
- `src/character/gearLook.js` – `resolveGear(equipment, content)` / `gearKey()`: Ausrüstung → Aussehen (Waffenform nach `family`/`icon`, Material und Leuchten nach Seltenheit, Rüstungsstil, Helm, Handschuhe, Stiefel)
- `src/account/*` – Szenen `title`, `account`, `characters`, `characterCreate`, Menü-Hintergrund, `account.css`

## Held (für HUD, Touch, Fortschritt)
`hero.abilities[i]` = `{ id, name, icon, desc, action: 'skill1'|'skill2', cooldown, cdLeft, cost, ready }`.
Außerdem `resource, maxResource, resourceType ('rage'|'energy'|'mana'), resourceName, resourceColor`,
`stamina, maxStamina, stats` (= computeStats), `buffs [{ id, time, duration, damageTaken? }]`, `classId`, `raceId`.
`hero.heal(amount, world)` heilt und sendet `heal`. Wut: +7 je eigenem Treffer, +5 je erlittenem, verfällt 3 s nach dem Kampf.
Rüstung/Buffs mindern Schaden in `Hero.takeHit` und schreiben den geminderten Wert zurück in `hit.damage`.
Werte werden bei `state:changed` nachgeführt (Ausrüstung), bei `level:up` zusätzlich volle Heilung.
Bei geänderter Ausrüstung tauscht der Held seine Sprites (`hero.setAnims`), die laufende Animation bleibt.
Angriffsanimationen tragen `anim.phases = { windup, active, recover }`; `hero.setPhaseFrame(phase, k)` wählt den Frame (auch für Fähigkeiten).

## Fähigkeiten, Passive, Talente (Runde 2)
Jede Klasse hat 4 aktive Fähigkeiten: 2 ab Stufe 1 (`skill1` Q, `skill2` R), eine ab Stufe 4 (`skill3`) und eine ab Stufe 12 (`skill4`),
dazu 2 Passive ab Stufe 8 und 16 (`talents.js` → `PASSIVES`). `hero.abilities[i]` trägt zusätzlich `level` und `locked`.

| Klasse | Stufe 4 | Stufe 12 | Passiv 8 | Passiv 16 |
|---|---|---|---|---|
| Krieger | Sturmangriff `charge` | Erdspalter `earthshatter` | Blutdurst | Unbeugsam |
| Schurke | Giftklingen `poison_blades` | Todesstoß `assassinate` | Opportunist | Schattentanz |
| Waldläufer | Sprengfalle `fire_trap` | Pfeilhagel `arrow_rain` | Durchschlagskraft | Mehrfachschuss |
| Glutmagier | Feuerball `fireball` | Meteor `meteor` | Glutseele | Inferno |

Talente: 1 Punkt je Stufe ab 2 (19 auf Stufe 20), 6 Talente je Klasse in 3 Reihen (offen ab Stufe 2 / 7 / 13).
Gespeichert in `character.talents`; Commands `character:learnTalent { id }`, `character:resetTalents` (kostenlos).
Wirkung über `computeStats` (`cooldownMult`, `abilityMods`, `passives`, `talentPoints`, `onHitResource`).
Panel `talents` (Aktion `talents`) zeigt Fähigkeiten mit Freischaltstufe, Passive und den Talentbaum.
Stufenaufstieg: Toast + Event `character:unlock { kind: 'ability'|'passive'|'talents', id, name, level }`.

### Werte bis Stufe 20 (Mensch, typische Ausrüstung der Stufe + Talente)
Rüstungsminderung = Rüstung / (Rüstung + 45 + 10 × (Stufe − 1)).

| Stufe | Krieger HP / Kraft / Minderung | Schurke | Waldläufer | Magier |
|---|---|---|---|---|
| 1 | 122 / 13 / 18 % | 100 / 12.6 / 10 % | 98 / 12 / 10 % | 86 / 13.6 / 6 % |
| 10 | 306 / 65 / 33 % | 198 / 47 / 22 % | 204 / 55 / 21 % | 187 / 48 / 20 % |
| 20 | 711 / 126 / 37 % | 386 / 103 / 29 % | 442 / 107 / 30 % | 395 / 95 / 27 % (Fähigkeiten ×1.25) |

Grober Anhalt für Gegner (B): ein normaler Gegner seiner Stufe sollte 4–6 Grundtreffer aushalten (HP ≈ 5 × Kraft der Stufe),
ein Treffer von ihm 6–10 % des Stufen-HP eines Magiers kosten.

## Events
- `character:created` { characterId, name, raceId, classId, appearance } nach `game.newGame()`
- `character:unlock` { kind, id, name, level, text } bei neuer Fähigkeit/Passive/Talentreihe (D zeigt dazu die Freischalt-Karte; A zeigt keinen eigenen Toast)
- `hit` mit `dot: true` für Giftschläge (kein Rückstoß, unterbricht nicht)
- intern: `ability` { actor, abilityId } beim Wirken (für Sound/Effekte frei nutzbar); Fähigkeiten senden sonst `swing`, `shoot`, `roll`, `heal`
- `ui:toast` (kind `warn`) bei „Nicht genug Wut“ / „lädt noch“, gedrosselt

## Wünsche an andere Bereiche
- **B, `systems/Combat.js`:** (1) Krit-Chance je Trefferzone nutzen: `h.critChance ?? CONFIG.hero.critChance` (der Held setzt `critChance` aus seinen Werten).
  (2) Im `hit`-Event `hit.damage` statt der lokalen Variable senden, damit die Schadenszahl die Rüstungsminderung zeigt.
- **Architektur:** `CONFIG.hero` wird vom Helden nicht mehr gelesen; nach (1) kann es aus `config.js` raus.
  Optional: `variant` in die Speicher-Kurzübersicht (`Game.saveNow` summary) aufnehmen – A liest sie heute aus dem Snapshot.

## Balancing-Prüfung (Kampf-Bot, Stand Runde 2)
Bot spielt jede Klasse im Browser (Stufe der Zone, grüne Ausrüstung eine Stufe darunter, Talente verteilt, Fähigkeiten ja, Ausweichen nein).
Bosskampf-Dauer: Varkhul (6) 16–21 s, Nerith (12) 15–25 s, Ignaroth (20) 19–29 s, kein Tod. Reihenfolge Tempo: Schurke ≈ Waldläufer > Krieger > Magier;
Krieger verliert am wenigsten Leben, Magier am meisten. 6er-Gruppen in Aschenwald/Schlackenhöhen: 6–17 s, 15–50 % Leben.
Magier danach leicht verstärkt (Leben 52 +6/Stufe, Rüstung 4, Glutbolzen ×1.25). Empfehlung an B: Boss-Leben etwa verdoppeln.

Qualitätsrunde (nach Version 4): Laufzyklus neu (Standbein/Schwungbein nach Beinlänge, Knie heben, Hüfte wippt, Arme gegengleich),
Frisurwahl kostenlos in der Charaktererstellung (Knopf „Frisur“ in der Vorschau). Frühe Kämpfe (Stufe 2, Wölfe) für alle Klassen geprüft.

## Sichtbare Ausrüstung (Runde 4)

- `gearLook.weaponLook`: Zweihänder (`family: 'greatsword'`) werden als großes Schwert gezeichnet (`great`, Länge 19, breite Klinge).
  Neu: `tier` (1 selten, 2 episch, 3 legendär) und `fx` (Element: fire, frost, shadow, holy, poison, nature, arcane; aus Item-id und Icon).
  Exportiert: `fxElement(itemDef)` liefert dasselbe Element für jedes Item (genutzt von D in gfx/ItemFx.js).
- Helme: Plattenhelme sind geschlossene Topfhelme (`great`), ab selten mit Helmbusch, legendär mit Glutkrone. Platte ab episch mit Schulterdornen.
- `sprites/hero.js`: Waffen größer (Schwert 15, Axt 14, Kolben 12 mit größeren Köpfen). Krieger hält das Schwert kampfbereit nach oben,
  Axt, Kolben und Zweihänder ruhen auf der Schulter. Jeder Frame trägt `frame.weapon = { x, y, ang, u0, u1, fx, tier, arc? }`.
- `entities/Hero.js`: animierte Effekte aus `frame.weapon`: selten = wandernder Glanz, episch = flackernde Aura, Flammenzungen bzw. Funkeln,
  Partikel je Element und ein Licht am Helden; legendär doppelt so dicht und heller.
- Account-Auswahl: „Spielstand sichern“ und „Sicherung laden“ (INTEGRATION.md §11.11) mit verständlichen Fehlermeldungen.
