# Auktionshaus (src/market/)

In jeder der sieben Städte mit Wegstein steht ein **Auktionator der Gilde der Glutwaage** mit Pult (`places.js`, Figur in
`sprite.js`). Ansprechen öffnet das Fenster `market` (Pixelrahmen und -titel aus `ui/pixelFrame.js`, Stil in `market.css`) mit drei Reitern: **Kaufen** (Suche, Warengruppe, Seltenheit,
Sortierung, „Für mich“), **Verkaufen** (alles Handelbare aus Tasche, Materialbeutel und gelernte Reittiere) und
**Gebote** (laufende eigene Gebote). Gekaufte und ersteigerte Ware, Erlöse und Rückgaben landen im **Postfach**
(`src/mail`, Briefkasten neben dem Auktionator). Kein neuer Knopf im HUD.

## Regeln (`rules.js`, gelten auch für die Datenbank)
- Startgebot und/oder Sofortkauf, Laufzeit 12/24/48 Stunden, höchstens 30 aktive Angebote je Konto, Preis bis 10 Mio.
- Gebühr 5 % vom Verkaufspreis (Goldsenke), nur beim Verkauf. Gebote mindestens +5 % (mindestens 1 Gold).
- Gebot in den letzten 2 Minuten verlängert auf 2 Minuten Restzeit. Mit Gebot lässt sich ein Angebot nicht zurückziehen.
- Handelbar: Waffen, Rüstung, Schmuck (ab ungewöhnlich), Tränke/Essen, Materialien, Reittier-Gegenstände und gelernte
  Reittiere. Nicht handelbar: Questgegenstände, Erfolgsbelohnungen, Shop-Designs, reines Aussehen, weiße Ausrüstung.

## Sicherheit: Buchungen nur in der Datenbank
Gold, Stufe und Gegenstände entstehen weiter im Browser (offener Punkt D3). Damit der Handel daraus weder Kopien noch
zusätzliches Gold machen kann, bucht **nur der Server**: `supabase/migrations/20261011090000_auktionshaus.sql` (erzeugt mit
`node src/market/marketSql.mjs > supabase/migrations/20261011090000_auktionshaus.sql`, Katalog und Grenzwerte aus `rules.js`).
- RPCs `market_list/bid/buyout/cancel` sperren Charakter und Angebot (`for update`) und ändern den gespeicherten
  Spielstand selbst (Gegenstand raus, Gold ab/zu). Zwei gleichzeitige Käufe: genau einer gewinnt. Gekauftes geht immer
  ins Postfach (`market_mail`), abgeholt wird mit `mail_take` (`market_collect` gibt es nicht mehr).
- **Buchungszähler nur auf dem Server** (`market_chars.seq`). Jede Buchung schreibt ihn in den Spielstand; ein Upload muss
  genau diesen Wert tragen, sonst wird er abgelehnt und als `handel` vermerkt (zweites Fenster, alter Speicherstand,
  erfundener hoher Zähler). Das Spiel lädt dann den gültigen Stand.
- **Gold-Obergrenze unverändert:** Erlöse aus dem Auktionshaus heben die Grenze der Spielstandprüfung nicht an.
  Bieten/Kaufen geht nur im **Goldrahmen des Kontos** (`market_accounts`): 150 je Sekunde geprüfter Handelszeit +
  Shop-Gold + Handelssaldo aller Käufe und Verkäufe (der Freibetrag neuer Charaktere zählt nicht); jeder Kauf zählt
  gegen denselben Rahmen. Handelszeit = geprüfte Spielzeit aller Charaktere, höchstens 4 Stunden je Tag seit dem ersten
  Handel (+ 2 Tage Vorlauf), damit frisch hochgespielte Zeit nicht auf einen Schlag zählt. Erlöse über dem Rahmen des
  Charakters und Rückzahlungen über der Gold-Obergrenze bleiben im Postfach, bis mehr Spielzeit geprüft ist. Damit
  bringt der Handel keinem Konto mehr Gold, als es ohnehin hochladen dürfte (auch nicht über Zweitkonten).
- Buchungen ändern `updated_at` nicht (`emberwrath.market`), die geprüfte Spielzeit läuft ehrlich weiter.
- **Herkunft:** Was das Auktionshaus geliefert hat (Kauf, Gewinn, Rückgabe), führt der Server als Bestand
  (`market_owned`) und lässt es frei wieder einstellen. Eigene Beute kostet Handelskontingent des Kontos nach Seltenheit
  und Stückzahl (`freshCost`, je angefangene 10 bzw. 5 Stück; wächst mit der Handelszeit ohne den Vorschuss, am ersten
  Handelstag also nur der Grundbetrag) und darf höchstens
  `LEVEL_SLACK` Stufen über dem Charakter liegen. Legendäre Reittiere, Shop- und Erfolgs-Reittiere sind nicht handelbar
  (der Generator bricht ab, falls doch eines im Katalog landet).
  Seit dem Fortschrittsbuch (`src/ledger`, D3) zählt der Server jede Beute und kappt Uploads darauf. Solange es das tut
  (`ledger_config.enforce`, Übergang vorbei, Charakter hat ein Buch), entfällt das Kontingent (`market_loot_checked`,
  Migration `20261026090000_handelskontingent.sql`); mit Notbremse gilt es wieder. Vorher bekam jedes Konto am ersten
  Handelstag nur den Grundbetrag (zwei epische, kein legendärer Gegenstand), egal wie lange es schon spielte.
- Handeln ab Stufe 10 und 1 Stunde geprüfter Spielzeit (`TRADE_MIN_LEVEL`, `TRADE_MIN_PLAY`). Konten mit Vermerk
  `stufe`/`gold`/`grenze` der letzten 7 Tage dürfen nicht handeln (ein Vermerk `handel` verdrängt diese Vermerke nicht).
  Höchstens 40 Aktionen je Minute; Suche und Übersicht höchstens 120 je Minute.
- Vorgänger der Migration: `20261011023000_namen_aendern.sql`. Nachfolger: `20261011150000_postfach.sql` (src/mail). Die Migration lässt sich mehrfach ausführen.
- Tabellen ohne direkten Zugriff für Spieler (RLS ohne Policies), nur die RPCs.

Ablauf im Spiel (`index.js`): speichern → `CloudSync.exclusive()` lädt Ausstehendes hoch und sperrt weitere Uploads →
RPC → Command `market:apply` übernimmt genau die gemeldete Änderung → `CloudSync.acknowledge()` merkt den neuen
Cloud-Zeitstempel → speichern und hochladen. Geht die Antwort verloren, holt der Abgleich den Stand des Servers.

## Tests
- `src/market/test/db.test.mjs`: gegen echte Postgres 16 mit allen Migrationen (Doppelverkauf, gleichzeitige Käufe
  und Gebote, alter und erfundener Zähler, Ablauf, Postfach, Reittiere, Rechte, Gold-Obergrenze, Handelsfreigabe,
  Bestand, Kontingent je Stück, Goldrahmen je Konto, Rückzahlungsgrenze, `updated_at`, Vermerke, Katalog).
  Braucht das npm-Paket `pg` und die Postfach-Migration.
- Browser: zwei Konten verkaufen, kaufen, bieten und holen am Briefkasten ab, ohne Neuladen; alter Spielstand wird abgelehnt.
