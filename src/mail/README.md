# Postfach (src/mail/)

In jeder der sieben Städte mit Wegstein stehen ein bis zwei **Briefkästen der Rabenpost** (`places.js`, Figur in
`sprite.js`): einer neben dem Auktionator, in größeren Orten ein zweiter am Wegstein. Die Laterne brennt, solange Post
wartet. Ansprechen öffnet das Fenster `mail` (gleicher Rahmen wie das Auktionshaus, `market.css` + `mail.css`) mit zwei
Reitern: **Post** (alles Liegende, „Nehmen“ je Zeile, „Alles nehmen“) und **Schreiben** (Beilage aus Tasche oder
Materialbeutel, Empfänger, Gold). Kein neuer Knopf im HUD.

Im Postfach landet:
- vom **Auktionshaus**: gekaufte und ersteigerte Ware (immer, auch bei Platz in der Tasche), Erlöse, Rückgaben,
  überbotene Gebote, abgelaufene Angebote;
- **Briefe anderer Spieler**: Gold und/oder ein Gegenstand (Stapel möglich). Bewusst **ohne Absicherung** (kein
  Nachnahme-Brief, kein Rückruf): was verschickt ist, gehört dem Empfänger;
- **Bossbeute, die liegen blieb**: verlässt man ein Gebiet mit nicht aufgehobener Beute eines Bosses oder einer
  Bosstruhe, kommt sie als Beutebrief ins Postfach (`loot:left` aus `progression/logic.js`, Command `mail:loot`).

## Regeln (`rules.js`, gelten auch für die Datenbank)
- Post verfällt nach 30 Tagen (`KEEP_DAYS`). Höchstens 60 offene Spielerbriefe je Empfänger (`BOX_MAX`), 30 Briefe je
  Konto und Stunde (`SEND_PER_HOUR`), Gold bis 10 Mio. je Brief, höchstens 20 Beutebriefe je Charakter (`LOOT_MAX`).
- Empfänger per Charaktername (Groß-/Kleinschreibung egal). Gibt es den Namen mehrfach, bekommt ihn der zuletzt
  aktive Charakter; das Fenster sagt das vorher.
- Verschicken ab Stufe 10 und 1 Stunde Spielzeit, wie Handeln (`TRADE_MIN_LEVEL`).

## Sicherheit: wie das Auktionshaus
Briefe zwischen Spielern bucht nur der Server: `supabase/migrations/20261011150000_postfach.sql` (erzeugt mit
`node src/mail/mailSql.mjs > supabase/migrations/20261011150000_postfach.sql`; nach der Auktionshaus-Migration
ausführen, lässt sich mehrfach ausführen). Tabelle ist `market_mail` des Auktionshauses (neue Art `letter`).
- `mail_send` sperrt den Charakter, nimmt Gegenstand und Gold aus dem gespeicherten Spielstand und zählt den
  Buchungszähler hoch (`market_commit`), genau wie ein Verkauf. Zwei gleichzeitige Sendungen desselben Gegenstands:
  genau eine gelingt.
- **Herkunft wie beim Einstellen:** Bestand aus dem Handel ist frei, eigene Beute kostet Handelskontingent und darf
  höchstens `LEVEL_SLACK` Stufen über dem Charakter liegen. Was ein Empfänger bekommt, wird bei ihm Bestand.
- **Gold:** Verschicken nur im Goldrahmen des Kontos (`market_can_spend`), Empfangen nur bis zum Goldrahmen des
  Empfängers. Liegt mehr Gold im Brief, nimmt er den Gegenstand und das Gold bleibt liegen, bis mehr Spielzeit geprüft
  ist. Damit bringen Briefe (auch an Zweitkonten) nicht mehr Gold als der Handel.
- Konten mit Vermerk `stufe`/`gold`/`grenze` der letzten 7 Tage können nichts verschicken; Lesen und Nehmen geht.
- `mail_take` ersetzt `market_collect` (das ruft es nur noch auf). `mail_box` zeigt nur eigene Post und räumt
  Abgelaufenes auf. `mail_lookup` verrät keine Kennungen, nur Name, Stufe und Klasse.
- Bossbeute entsteht im Browser wie jede Beute (offener Punkt D3) und liegt deshalb im eigenen Spielstand
  (Slice `mail.loot`), nicht in der Datenbank; sie bekommt keinen Bestand-Status.

## Tests
- `src/mail/test/db.test.mjs`: gegen echte Postgres 16 mit allen Migrationen (41 Prüfungen: Senden, doppelt und
  gleichzeitig, alter Spielstand, Fehlercodes, Empfangen, Bestand, Auktionshaus ins Postfach, Kontingent, Goldrahmen
  beim Senden und Empfangen, gleiche Namen, Ablauf, volles Postfach, Rate, Vermerk, Rechte). Braucht das npm-Paket `pg`.
- Browser: zwei Konten schicken sich Gold und Gegenstände, kaufen im Auktionshaus und holen am Briefkasten ab;
  liegengebliebene Bossbeute kommt als Beutebrief.
