# Shop (Designs und Gold für Echtgeld)

Spieler kaufen im Spiel (Menü › Shop) oder auf der Website (`/shop`, `site/shop.html`) **exklusive Designs** und
**Gold-Pakete**. Bezahlt wird auf der Bezahlseite von Stripe (Karte, PayPal, Apple Pay,
Google Pay, Klarna usw. – je nachdem, was im Stripe-Konto aktiv ist). Das Gold landet beim Charakter, mit dem gekauft
bzw. der auf der Website gewählt wurde. Designs gelten für alle Charaktere des Kontos.

**Designs** (`DESIGNS` in `src/shop/catalog.js`): je ein legendäres Reittier und eine Färbung, nicht erspielbar,
so schnell wie epische Reittiere (kein Kampfvorteil). Phönixschwinge 14,99 €, Sternenhengst 12,99 €, Seelenwolf 9,99 €.
Bilder für die Website: `site/tools/render-shop.mjs` (Bildstreifen der Laufanimation, `site/img/shop-*.png`).

**Stand:** fertig gebaut, aber abgeschaltet. Ohne Stripe-Schlüssel ist der Shop für niemanden sichtbar außer Admins
(Vorschau). Es fließt kein Geld, bis die Schritte unten erledigt sind.

## Ablauf und Sicherheit

1. Spiel → `POST /net/shop/checkout` (Worker, `worker/shop.js`). Der Worker prüft das Konto, legt in Supabase eine
   Bestellung `pending` an (`public.gold_orders`) und erzeugt eine Stripe-Checkout-Seite. Preis und Goldmenge kommen nur
   aus `src/shop/catalog.js`, nie aus der Anfrage.
2. Stripe meldet die Zahlung an `POST /net/shop/webhook`. Der Worker prüft die Signatur und den Betrag und setzt die
   Bestellung auf `paid`.
3. Das Spiel holt bezahlte Bestellungen ab (`shop_pending_credits`), schreibt das Gold gut, speichert und bestätigt
   (`shop_confirm_credits` → `credited`), erst wenn der Stand lokal und in der Cloud gespeichert ist. Der Spielstand
   merkt sich gutgeschriebene Bestellungen (Slice `shop`), nichts kommt doppelt an.
4. **Erstattung oder Rückbuchung:** `charge.refunded` (volle Erstattung) setzt die Bestellung auf `refunded`,
   `charge.dispute.created` (Rückbuchung über Bank/PayPal) auf `disputed` und sperrt das Konto für weitere Käufe
   (`public.shop_blocks`). War das Gold schon gutgeschrieben, holt das Spiel die Bestellung ab (`shop_pending_revokes`),
   zieht das Gold beim Charakter wieder ab – auch ins Minus, wenn es schon ausgegeben ist – und bestätigt
   (`shop_confirm_revokes` → `revoked_at`). Ein Minusstand wird durch Einnahmen abgebaut; ausgeben lässt sich dann nichts.
   Solange ein Abzug offen ist, nimmt der Worker von diesem Konto keine Käufe an. Gewinnt der Händler die Rückbuchung
   (`charge.dispute.closed`, `won`) und war das Gold noch nicht abgezogen, gilt die Bestellung wieder; die Kaufsperre hebt
   ein Admin auf: `select admin_shop_unblock('<user_id>');`. Teilerstattungen bucht ein Admin von Hand nach.
5. **Serverseitig** (Migration `20261005120000_shop_designs.sql`): Nach `charge.refunded`/`charge.dispute.created` ruft der
   Worker `shop_server_revoke` auf. Das zieht das Gold direkt im gespeicherten Spielstand ab bzw. entfernt Designs aus
   allen Charakteren des Kontos; das Spiel übernimmt den Cloud-Stand beim nächsten Abgleich. Der Weg über das Spiel
   (Schritt 4) bleibt als Rückfall. Der Trigger `characters_shop_check` lehnt Uploads ab, die unbezahlte exklusive Designs
   enthalten, erstattetes Gold noch führen oder eine unmögliche Tasche haben (über 36 Plätze, Mengen außerhalb 1–999);
   Vermerk in `character_flags` (Gründe `design`, `rueckbuchung`, `gegenstaende`). Unbekannte Gegenstände verwirft das
   Spiel selbst beim Laden.
6. **Sicherheitsprüfung 05.10.:** Abholen setzt `delivered_at`; ab dann zieht eine Rückbuchung das Gold serverseitig ab,
   auch wenn das Spiel den Erhalt nie bestätigt hat (D4). Kaufsperren hängen zusätzlich an einem Hash der normalisierten
   E-Mail-Adresse (`shop_block_marks`) und überleben das Löschen des Kontos (D5); `admin_shop_unblock` hebt beides auf.
   Höchstens 10 Bezahlseiten je Konto in 10 Minuten (429 `rate_limited`, S13).
7. **Designs:** Bestellungen mit `kind = 'design'` und `items` (z. B. `mount:soul_wolf`, `dye:soullight`). Besitz =
   bezahlte Design-Bestellungen (`shop_designs()`), das Spiel trägt sie in den Spielstand ein (Slice `shop.owned`, Command
   `shop:designs`). Zweimal kaufen geht nicht (409 `owned`). Neue Designs: Eintrag in `DESIGNS`, Reittier/Färbung mit
   `exclusive: true`, Schlüssel in `public.shop_exclusive_items` eintragen.

Auswertung für Admins: `select * from admin_gold_orders();` im SQL-Editor (mit Abzug `revoked_at` und Kaufsperre).

## Freischalten (einmalig)

1. **Supabase:** `supabase/migrations/20261001230000_goldshop.sql` und danach
   `supabase/migrations/20261003140000_goldshop_rueckbuchung.sql` und
   `supabase/migrations/20261005120000_shop_designs.sql` im SQL-Editor ausführen.
2. **Stripe-Konto** anlegen (stripe.com), Firmendaten und Bankkonto hinterlegen. Erst im **Testmodus** arbeiten.
3. **Webhook:** Stripe › Entwickler › Webhooks › Endpunkt hinzufügen:
   `https://www.emberwrath.com/net/shop/webhook`, Ereignisse `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Das Signatur-Geheimnis (`whsec_…`) kopieren.
4. **Cloudflare** › Worker emberwrath › Settings › Variables and Secrets:
   - Secret `STRIPE_SECRET_KEY` = `sk_test_…` (später `sk_live_…`)
   - Secret `STRIPE_WEBHOOK_SECRET` = `whsec_…`
   (`SUPABASE_SERVICE_ROLE_KEY` ist vom Newsletter schon gesetzt.)
5. **Testkauf als Admin:** Im Spiel Menü › Shop, mit Stripe-Testkarte `4242 4242 4242 4242` zahlen. Das Gold muss nach der
   Rückkehr ankommen.
6. **Für alle öffnen:** Live-Schlüssel und Live-Webhook eintragen, dann Variable `SHOP_ENABLED` = `true`.
   Zurück auf geschlossen: Variable löschen oder auf `false` setzen. Dann auf der Website den Shop-Link in die Navigation
   nehmen und in `site/shop.html` das `noindex` entfernen (bis dahin ist `/shop` nur über die Adresse erreichbar).

## Vor dem Freischalten rechtlich klären

- **AGB** mit Abschnitt zu virtuellen Gütern (kein Rücktausch in Geld, Gold ist an den Charakter gebunden) als eigene Seite;
  dann in Stripe als AGB-Adresse eintragen und Variable `STRIPE_REQUIRE_TOS` = `true` setzen.
- **Widerrufsrecht:** Das Spiel holt vor jedem Kauf die ausdrückliche Zustimmung zur sofortigen Gutschrift und die
  Bestätigung ein, dass das Widerrufsrecht damit erlischt (§ 356 Abs. 5 BGB). Eine Widerrufsbelehrung gehört trotzdem in
  die AGB, die Bestätigung schickt Stripe per Beleg-Mail (Stripe › Einstellungen › E-Mails › Belege einschalten).
- **Datenschutzerklärung:** Abschnitt zu Stripe als Zahlungsdienstleister ergänzen, dazu der E-Mail-Hash für Kaufsperren
  nach Rückbuchung (Betrugsabwehr, Art. 6 Abs. 1 f DSGVO, bleibt nach Kontolöschung).
- **Steuern:** Umsatzsteuer auf digitale Leistungen (EU-weit Steuersatz des Käuferlandes, OSS-Verfahren, ggf.
  Kleinunternehmerregelung) mit Steuerberater klären; Stripe Tax kann das automatisch berechnen.
- **Minderjährige:** Käufe Minderjähriger sind ohne Zustimmung der Eltern schwebend unwirksam; Erstattungen über Stripe
  zurückgeben (Bestellung wird automatisch `refunded`).

## Pakete ändern

`src/shop/catalog.js` (`GOLD_PACKS`): Goldmenge, Bonus, Preis in Cent. Gilt nach dem nächsten Deploy für neue Käufe.

## Tests

`node worker/test/shop.test.mjs` – Worker ohne Netz (Stripe und Supabase nachgestellt): Checkout, Rechte, Signatur,
Betragsprüfung, Erstattung, Rückbuchung mit Kaufsperre, doppelte Webhooks, Designs (Kauf ohne Charakter, schon gekauft,
Erstattung). Die SQL-Funktionen wurden gegen ein lokales Postgres 16 geprüft (Rechte, Abzug im Spielstand, Trigger).
