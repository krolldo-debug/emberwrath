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
   **Vor dem Live-Start 20.10.** (Migration `20261020090000_shop_live.sql`): Die Prüfwerte sind HMACs mit einem Geheimnis
   (`SHOP_HASH_SECRET`, sonst das Service-Secret; D15). Eine Rückbuchung sperrt zusätzlich das Zahlungsmittel
   (Kartenfingerabdruck von Stripe, PayPal-Konto; D5). Zahlt ein neues Konto mit einem gesperrten Zahlungsmittel, erstattet
   der Webhook sofort (Stripe-Grund `fraudulent`) und sperrt das Konto, nichts wird freigeschaltet. Prüfwerte an Bestellungen
   werden 180 Tage nach der Zahlung gelöscht (`cleanup_shop`). **Test und Live getrennt (S25):** Nur Ereignisse aus dem Modus
   des Schlüssels zählen (mit `sk_live_…` nie Testzahlungen), und mit `sk_test_…` kaufen nur Admins, auch mit `SHOP_ENABLED`.
   Exklusive Designs sehen andere Spieler (Welt, Glutarena) nur, wenn das Konto sie besitzt (`worker/designs.js`).
7. **Bestellbestätigung** (Rechtsprüfung 05.10., `worker/shop-mail.js`): Beim Webhook „bezahlt“ geht zuerst per Resend
   eine Mail an die Käuferadresse (Angebot, Preis, Zahlungsart, Anbieter, Verzichtserklärung mit Zeitpunkt und der volle
   Text der Kaufbedingungen von `/kaufbedingungen`, bei englischer Oberfläche zusätzlich `/en/kaufbedingungen`), danach
   wird freigegeben. Ohne diese Bestätigung erlischt das Widerrufsrecht nicht. Schlägt der Versand fehl, ist die
   Bestellung trotzdem bezahlt, `confirmation_error` wird vermerkt und Stripe wiederholt den Webhook, bis die Mail raus ist.
   Prüfen: `select id, status, confirmation_error from gold_orders where confirmation_sent_at is null and status in ('paid','credited');`
   Umsatzsteuer-Hinweis: `TAX_MODE` in `src/shop/catalog.js` (`'ust'` oder `'kleinunternehmer'`, dazu Abschnitt 4 der
   Kaufbedingungen anpassen). Fassung der Kaufbedingungen: `TERMS_VERSION`, wird je Bestellung gespeichert.
8. **Designs:** Bestellungen mit `kind = 'design'` und `items` (z. B. `mount:soul_wolf`, `dye:soullight`). Besitz =
   bezahlte Design-Bestellungen (`shop_designs()`), das Spiel trägt sie in den Spielstand ein (Slice `shop.owned`, Command
   `shop:designs`). Zweimal kaufen geht nicht (409 `owned`). Neue Designs: Eintrag in `DESIGNS`, Reittier/Färbung mit
   `exclusive: true`, Schlüssel in `public.shop_exclusive_items` eintragen.
   **Geschenkte Designs** (z. B. für das Admin-Konto) stehen in `public.shop_grants` und zählen wie gekaufte
   (`shop_owned_items()`); Vorlage `supabase/admin/shop-designs-schenken.sql`. Eintrag löschen nimmt sie beim nächsten
   Spielstart wieder weg.

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

## App Store (iOS-App ab Version 1.1)

In der App ist Stripe nicht erlaubt (Apple-Richtlinie 3.1.1), dort läuft derselbe Shop über In-App-Käufe von Apple.
Gold-Pakete sind Verbrauchsartikel, Designs dauerhafte Käufe, Produkt-ID `com.emberwrath.game.<Katalog-ID>`
(`appleProductId` in `src/shop/catalog.js`). Apple rechnet ab, kümmert sich um Umsatzsteuer, Widerruf und Erstattung.

1. **App** (`app/ios/App/App/StorePlugin.swift`, StoreKit 2, im Spiel `src/app/store.js`): Kauf mit der Konto-ID als
   `appAccountToken`. Ältere App-Versionen haben den Baustein nicht, dort bleibt der Shop verborgen.
2. **Prüfen** (`POST /net/shop/apple`, `worker/apple.js`): Die von Apple signierte Transaktion (JWS) wird ohne Netz geprüft:
   Kette bis zur fest eingetragenen Apple Root CA - G3, Apple-OIDs, Signatur, Bundle-ID, Produkt im Katalog, Konto-ID.
   Dann Bestellung `paid` mit `provider = 'apple'` und `apple_transaction_id` (eindeutig, nichts doppelt). Gold und Inhalt
   nur aus dem Katalog, Preis laut Apple (sonst Katalog). Testkäufe (Sandbox: TestFlight, App-Prüfung) zählen mit
   `livemode = false`.
3. **Abschließen:** Erst wenn der Server einen Kauf als erledigt meldet, schließt die App ihn bei Apple ab (`finish`).
   Bis dahin liefert StoreKit ihn bei jedem Start erneut (`unfinished`), z. B. nach Absturz, Funkloch oder Erlaubnis der Eltern.
4. **Gutschrift** wie bei Stripe (`shop_pending_credits`, Designs über `shop_owned_items`).
5. **Erstattung:** Apple meldet sie an `POST /net/shop/apple/notify` (App Store Server Notifications V2, signiert).
   `REFUND`/`REVOKE` → `refunded` und `shop_server_revoke`, `REFUND_REVERSED` → gilt wieder, solange nichts abgezogen ist.
6. **Käufe wiederherstellen** (Knopf im Shop): dauerhafte Käufe dieser Apple-ID für dieses Konto erneut melden.

Schalter: wie die Website über `SHOP_ENABLED` (Admins sehen den Shop in der App immer). Braucht nur
`SUPABASE_SERVICE_ROLE_KEY`, keine Apple-Schlüssel. Migration `20261030100000_app_store_kaeufe.sql`.
Auswertung: `select * from admin_apple_orders();`

**Produkte anlegen:** GitHub → Actions → „App-Store-Produkte“ → Run workflow (`tools/appstore-produkte.mjs`, mehrfach
ausführbar): legt alle Produkte mit Texten (de/en/es/fr), Preis (Basis Deutschland), Verfügbarkeit, Prüf-Bildschirmfoto
(`app/store/iap-*.png`) und die Adresse für Apples Benachrichtigungen an. Vorher in App Store Connect den Vertrag
„Bezahlte Apps“ mit Bank- und Steuerdaten abschließen. Die ersten Käufe reicht man zusammen mit einer App-Version ein.
Neue Pakete oder Designs: Eintrag im Katalog, Workflow erneut ausführen, mit der nächsten App-Version einreichen
(eine neue App-Version ist dafür nicht nötig, nur die Prüfung der neuen Produkte).

## Pakete ändern

`src/shop/catalog.js` (`GOLD_PACKS`): Goldmenge, Bonus, Preis in Cent. Gilt nach dem nächsten Deploy für neue Käufe.
Im App Store ändert sich der Preis nicht von selbst (in App Store Connect anpassen); die Goldmenge kommt immer aus dem Katalog.

## Tests

`node worker/test/shop.test.mjs` – Worker ohne Netz (Stripe und Supabase nachgestellt): Checkout, Rechte, Signatur,
Betragsprüfung, Erstattung, Rückbuchung mit Kaufsperre, doppelte Webhooks, Designs (Kauf ohne Charakter, schon gekauft,
Erstattung, Test/Live, gesperrte Karte). `node worker/test/designs.test.mjs` – Designs im Aussehen für andere.
`node worker/test/apple.test.mjs` – App-Store-Käufe: echte Apple-Kette, Signaturen einer Test-Kette (`fixtures/apple`),
Gutschrift, doppelte Käufe, fremdes Konto, Erstattung per Benachrichtigung. Die SQL-Funktionen wurden gegen ein lokales Postgres 16 geprüft (Rechte, Abzug im Spielstand, Trigger).
