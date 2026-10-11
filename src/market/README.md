# Auktionshaus (src/market/)

In jeder Stadt steht neben dem Wegstein ein **Auktionator der Gilde der Glutwaage** mit Pult (`places.js`, Figur in
`sprite.js`). Ansprechen öffnet das Fenster `market` mit drei Reitern: **Kaufen** (Suche, Warengruppe, Seltenheit,
Sortierung, „Für mich“), **Verkaufen** (alles Handelbare aus Tasche, Materialbeutel und gelernte Reittiere) und
**Abholen** (Erlöse, ersteigerte Ware, Rückgaben). Kein neuer Knopf im HUD.

## Regeln (`rules.js`, gelten auch für die Datenbank)
- Startgebot und/oder Sofortkauf, Laufzeit 12/24/48 Stunden, höchstens 30 aktive Angebote je Konto, Preis bis 10 Mio.
- Gebühr 5 % vom Verkaufspreis (Goldsenke), nur beim Verkauf. Gebote mindestens +5 % (mindestens 1 Gold).
- Gebot in den letzten 2 Minuten verlängert auf 2 Minuten Restzeit. Mit Gebot lässt sich ein Angebot nicht zurückziehen.
- Handelbar: Waffen, Rüstung, Schmuck (ab ungewöhnlich), Tränke/Essen, Materialien, Reittier-Gegenstände und gelernte
  Reittiere. Nicht handelbar: Questgegenstände, Erfolgsbelohnungen, Shop-Designs, reines Aussehen, weiße Ausrüstung.

## Sicherheit: Buchungen nur in der Datenbank
Gold, Stufe und Gegenstände entstehen weiter im Browser (offener Punkt D3). Damit der Handel daraus keine Kopien machen
kann, bucht **nur der Server**: `supabase/migrations/20261011090000_auktionshaus.sql` (erzeugt mit
`node src/market/marketSql.mjs > supabase/migrations/20261011090000_auktionshaus.sql`, Katalog aus `rules.js`).
- RPCs `market_list/bid/buyout/cancel/collect` sperren Charakter und Angebot (`for update`) und ändern den gespeicherten
  Spielstand selbst (Gegenstand raus, Gold ab/zu). Zwei gleichzeitige Käufe: genau einer gewinnt.
- Jede Buchung zählt `slices.market.seq` hoch (Server: `market_chars.seq`). Ein Upload mit kleinerem Zähler (zweites
  Fenster, alter Speicherplatz) wird abgelehnt und als `handel` vermerkt. Das Spiel lädt dann den gültigen Stand.
- `market_chars.net` (Einnahmen minus Ausgaben) erhöht die Gold-Obergrenze der Spielstandprüfung.
- Konten mit Vermerk `stufe`/`gold`/`grenze` der letzten 7 Tage dürfen nicht handeln. Höchstens 40 Aktionen je Minute.
- Tabellen ohne direkten Zugriff für Spieler (RLS ohne Policies), nur die RPCs.

Ablauf im Spiel (`index.js`): speichern → `CloudSync.exclusive()` lädt Ausstehendes hoch und sperrt weitere Uploads →
RPC → Command `market:apply` übernimmt genau die gemeldete Änderung → `CloudSync.acknowledge()` merkt den neuen
Cloud-Zeitstempel → speichern und hochladen. Geht die Antwort verloren, holt der Abgleich den Stand des Servers.

## Tests
- `src/market/test/db.test.mjs`: gegen echte Postgres 16 mit allen Migrationen (Doppelverkauf, gleichzeitige Käufe
  und Gebote, alter Spielstand, Ablauf, Abholen, Reittiere, Rechte, Gold-Obergrenze). Braucht das npm-Paket `pg`.
- Browser: zwei Konten verkaufen, kaufen, bieten und holen ab, ohne Neuladen; alter Spielstand wird abgelehnt.
