# Fortschrittsbuch (D3)

Der Server bestätigt, was ein Charakter an **Erfahrung, Gold und Gegenständen** besitzt. Ein Spielstand, der mehr
enthält, als der Server nachrechnen kann, wird beim Hochladen auf das Buch gekappt. Ehrliches Spielen merkt davon nichts.

## Ablauf

1. **Spielstart** (`index.js`): `POST /net/buch { c, open }` → Sitzung `{ sid, seed }`. Mit dem `seed` würfelt das Spiel
   Beute und Belohnungen (`rng.js`), der Server kann jeden Wurf nachrechnen.
2. **Jeder Command** (`client.js`): Der Aufzeichner merkt sich, was sich an Erfahrung, Gold und Gegenständen geändert hat
   (Eintrag in `state.meta.ledger.q`, wird mit dem Spielstand gespeichert).
3. **Vor jedem Hochladen** (`online/CloudSync.js` → `beforeUpload`): Einträge an `POST /net/buch { c, s, e }`.
   Der Worker (`worker/ledger.js`) prüft sie mit `rules.js` und schreibt das Buch (`public.character_ledger`).
4. **Beim Hochladen** (Datenbank, `supabase/migrations/20261015120000_fortschrittsbuch.sql`): Trigger
   `characters_z_ledger` vergleicht den Stand mit dem Buch, kappt Überzähliges und vermerkt `buch` in `character_flags`.
   Dann ändert sich `saved_at`; CloudSync übernimmt den Cloud-Stand.
5. **Server-Buchungen** (Auktionshaus, Postfach, Rückbuchung, Admin): `characters_z_ledger_after` spiegelt die Änderung ins Buch.

## Was der Server nachrechnet (`rules.js`)

- Abgänge gelten immer (Ausgeben, Verkaufen, Verbrauchen, Einstellen).
- Kills: Erfahrung nach Formel, höchstens ein Kill auf eigener Stufe je Sekunde (Vorrat 180), Bosse mit Abstand.
- Beute: mit dem Würfel des Servers nachgewürfelt, ein Beuteschein je bestätigtem Kill.
- Quests (Fortschritt aus bestätigten Kills), Händler (Preis bezahlt), Rezepte (Zutaten verbraucht),
  Tagesbelohnung, Auftragsbrett, Wochentruhe, Glutprüfung, Arena-Gold (Tagesgrenze), Gold-Shop (bezahlte Bestellung),
  Verstärken, Verzaubern und Bankausbau (nur mit bezahltem Preis).
- Gezählt wird überall gleich (`values.js` = SQL `ledger_values`): Tasche, Ausrüstung, Material, Questbeutel, Bank,
  Beutebriefe, gelernte Reittiere mit Gegenstand, dazu die Buchposten `^up:<Platz>` (Verstärkungsstufe),
  `^en:<Platz>:<id>` (Verzauberung) und `^bank` (Ausbaustufe). Questgegenstände zählen nicht.
- Vor dem Zählen bringt `ledger_normalize` den Stand in die Form, die das Spiel selbst speichert (Zahlen statt Text,
  Text statt Listen, Werte im 32-Bit-Bereich). Sonst läse das Spiel mit JavaScript-Regeln mehr, als gezählt wird;
  `load.test.mjs` prüft das mit dem echten Laden des Spiels.

## Übergang und neue Helden

- Charaktere ohne Sitzung (`state` leer) übernehmen ihren hochgeladenen Stand als Buch, bis 2 Tage nach der ersten
  Sitzung mit dem neuen Spiel (`ledger_config.strict_after`, setzt die Datenbank selbst).
- Neuer Held oder erster Start mit Buch: Server antwortet `fresh`/`nochar`, das Spiel lädt erst hoch (Modus `wait`),
  danach öffnet es die Sitzung mit `base`.
- Ohne Migration oder ohne Secret Key antwortet der Worker `off`; das Spiel speichert wie bisher und fragt später erneut.

## Notbremse

```sql
update public.ledger_config set enforce = false;   -- nur vermerken, nicht kappen
update public.ledger_config set enforce = true;    -- wieder kappen
select * from public.character_flags where reason = 'buch' order by created_at desc limit 50;
```

## Bekannte Grenzen

- Ein Bot kann bis zum Tempo-Limit farmen (etwa das Vierfache ehrlichen Spiels), mehr nicht.
- Der `seed` liegt im Spiel: Wer ihn ausliest, kann die Reihenfolge seiner Kills auf gute Würfe abstimmen. Die Beute
  bleibt die eines echten Kills.
- Nicht im Buch: Aussehen, Talente, Erfolge ohne Gold oder Gegenstand. Erfolge mit Belohnung zählen je einmal.

## Tests

```sh
node src/ledger/test/ledger.test.mjs              # Regeln mit dem echten Spiel (Kampagne bis Stufe 40)
# Datenbank: Postgres 16, Supabase-Nachbau, alle Migrationen
createdb sbtest && psql -d sbtest -f src/ledger/test/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql -d sbtest -v ON_ERROR_STOP=1 -f "$f"; done
PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/db.test.mjs       # Zählung, Kappen, Spiegeln, Rechte
PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/worker.test.mjs   # Spiel → Worker → Datenbank
PGHOST=/var/run/postgresql PGDATABASE=sbtest node src/ledger/test/load.test.mjs     # Spiel lädt nie mehr, als gezählt wird
node src/ledger/ledgerSql.mjs > supabase/migrations/20261015120000_fortschrittsbuch.sql   # nach neuen Gegenständen
```

Hinweis: Die Datenbanktests des Auktionshauses laden frei erfundenes Gold hoch. Sie laufen im Übergang
(`strict_after` leer), so wie `db.test.mjs` die Einstellung am Ende zurücksetzt.
