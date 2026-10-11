# Postfach (src/mail/)

In jeder der sieben Städte mit Wegstein stehen ein bis zwei **Briefkästen der Rabenpost** (`places.js`, Figur in
`sprite.js`): einer neben dem Auktionator, in größeren Orten ein zweiter am Wegstein. Die Laterne brennt, solange Post
wartet. Ansprechen öffnet das Fenster `mail` (gleicher Rahmen wie das Auktionshaus, `market.css` + `mail.css`) mit zwei
Reitern: **Post** (alles Liegende, „Nehmen“ je Zeile, „Alles nehmen“ in der Kopfzeile) und **Schreiben** (Beilage aus Tasche oder
Materialbeutel, Empfänger, Gold). Kein neuer Knopf im HUD.

Im Postfach landet:
- vom **Auktionshaus**: gekaufte und ersteigerte Ware (immer, auch bei Platz in der Tasche), Erlöse, Rückgaben,
  überbotene Gebote, abgelaufene Angebote. Diese Post verfällt nie;
- **Briefe anderer Spieler**: Gold und/oder ein Gegenstand (Stapel möglich). Bewusst **ohne Absicherung** (keine
  Nachnahme, kein Zurückholen durch den Absender): Betrug zwischen Spielern ist möglich. Nach 30 Tagen geht ein
  ungeöffneter Brief einmal zurück an den Absender („Zurück von …“, verfällt dann nicht mehr). Der Empfänger kann einen
  Brief auch selbst zurückschicken (leises ↩ in der Zeile, zweites Tippen bestätigt). Gibt es den Absender nicht mehr,
  bleibt der Brief beim Empfänger;
- **Bossbeute, die liegen blieb**: verlässt man ein Gebiet mit nicht aufgehobener Beute eines Bosses oder einer
  Bosstruhe, kommt sie als Beutebrief ins Postfach (`loot:left` aus `progression/logic.js`, Command `mail:loot`).

## Regeln (`rules.js`, gelten auch für die Datenbank)
- Spielerbriefe gehen nach 30 Tagen zurück (`KEEP_DAYS`). Höchstens 60 offene Spielerbriefe je Empfänger (`BOX_MAX`),
  3 offene Briefe eines Kontos an denselben Empfänger (`PAIR_MAX`), 30 Briefe je Konto und Stunde (`SEND_PER_HOUR`),
  20-mal Nachschlagen je Minute (`LOOKUP_PER_MINUTE`), Gold bis 10 Mio. je Brief.
- Beutebriefe: höchstens 20 je Charakter (`LOOT_MAX`), 8 Teile je Brief, Mengen 1–999, Gold bis 20.000 je Brief; sie
  verfallen nach 30 Tagen.
- Empfänger per Charaktername (Groß-/Kleinschreibung egal). Heißen mehrere so, gilt der älteste Charakter, der Post
  empfangen darf; das Fenster zeigt Stufe und Klasse und „Name mehrfach vergeben“.
- Senden und Empfangen ab Stufe 10 und 1 Stunde Spielzeit, wie Handeln (`TRADE_MIN_LEVEL`).

## Sicherheit: wie das Auktionshaus
Briefe zwischen Spielern bucht nur der Server: `supabase/migrations/20261011150000_postfach.sql` (erzeugt mit
`node src/mail/mailSql.mjs > supabase/migrations/20261011150000_postfach.sql`; nach der aktuellen
Auktionshaus-Migration ausführen, beide lassen sich mehrfach ausführen). Tabelle ist `market_mail` des Auktionshauses
(neue Arten `letter`, `returned`).
- `mail_send` prüft erst alles und bucht dann: Charakter gesperrt, Gegenstand und Gold aus dem gespeicherten Spielstand,
  Buchungszähler (`market_commit`), genau wie ein Verkauf. Ein abgelehnter Brief verbraucht weder Kontingent noch
  Bestand. Zwei gleichzeitige Sendungen desselben Gegenstands: genau eine gelingt.
- **Empfänger fest:** `mail_lookup` liefert eine zufällige Empfängerkennung (`mail_keys`), `mail_send` verlangt sie und
  lehnt ab (`changed`), wenn der Name inzwischen auf jemand anderen zeigt. Charakternamen ändern sich per Upload nicht
  mehr (`characters_post_check`; ein späteres Umbenennen braucht eine Server-Funktion). Ein später angelegter
  Doppelgänger fängt keine Briefe ab. Absendername kommt aus der Datenbank.
- **Herkunft wie beim Einstellen:** Bestand aus dem Handel ist frei, eigene Beute kostet Handelskontingent und darf
  höchstens `LEVEL_SLACK` Stufen über dem Charakter liegen; nie Shop-Designs. Was ein Empfänger bekommt, wird bei ihm
  Bestand.
- **Gold:** Verschicken nur im Goldrahmen des Kontos (`market_can_spend`), Empfangen nur bis zum Goldrahmen des
  Empfängers, auch teilweise. Der Rest bleibt im Brief und verfällt nicht, bis mehr Spielzeit geprüft ist. Damit bringen
  Briefe (auch an Zweitkonten) nicht mehr Gold als der Handel.
- Grenzen je Empfänger zählt der Server unter einer Sperre auf den Empfänger; volles Postfach und Absendergrenze geben
  denselben Fehler (`nodeliver`), damit niemand das Postfach anderer ausforschen kann.
- Konten mit Vermerk `stufe`/`gold`/`grenze` der letzten 7 Tage können weder senden noch Post nehmen
  (`market_guard`); ansehen geht.
- `mail_take` ersetzt `market_collect` (gelöscht). `mail_box` zeigt nur eigene Post, die nicht älter als der Charakter
  ist, und schickt Abgelaufenes zurück (`mail_expire`). `mail_lookup` verrät keine Kennungen der Konten.
- Gelöschter Charakter: seine Post, sein Bestand und sein Buchungszähler werden gelöscht; Briefe von ihm haben keinen
  Absender mehr.
- **Bossbeute** entsteht im Browser wie jede Beute (offener Punkt D3) und liegt deshalb im eigenen Spielstand
  (Slice `mail.loot`), nicht in der Datenbank; sie bekommt keinen Bestand-Status. `characters_post_check` prüft sie beim
  Hochladen: Grenzen wie oben, neue Charaktere ohne Beutebriefe, Gold darin zählt zur Gold-Obergrenze.
- Bekanntes Restrisiko bis D3 (wie im Auktionshaus): gefälschte eigene Beute begrenzt nur das Kontingent; Briefe an
  Zweitkonten werden nicht gesondert ausgewertet.

## Tests
- `src/mail/test/db.test.mjs`: gegen echte Postgres 16 mit allen Migrationen (67 Prüfungen: Senden, doppelt und
  gleichzeitig, alter Spielstand, Fehlercodes, kein Verbrauch bei Fehlern, Empfangen, Bestand, Auktionshaus ins
  Postfach ohne Verfall, Kontingent, Goldrahmen beim Senden und Empfangen (teilweise), gleiche Namen, Umbenennen,
  Doppelgänger, Kennung, gelöschte Charaktere, Rücksendung, Grenzen, Tempo, Vermerk, Beutebriefe im Spielstand,
  Rechte). Braucht das npm-Paket `pg`.
- Browser: zwei Konten schicken sich Gold und Gegenstände, kaufen im Auktionshaus und holen am Briefkasten ab;
  liegengebliebene Bossbeute kommt als Beutebrief; Zurückschicken.
