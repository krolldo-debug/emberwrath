# Gold-Shop (Gold für Echtgeld)

Spieler kaufen im Spiel (Menü › Shop) Gold-Pakete. Bezahlt wird auf der Bezahlseite von Stripe (Karte, PayPal, Apple Pay,
Google Pay, Klarna usw. – je nachdem, was im Stripe-Konto aktiv ist). Das Gold landet beim Charakter, mit dem gekauft wurde.

**Stand:** fertig gebaut, aber abgeschaltet. Ohne Stripe-Schlüssel ist der Shop für niemanden sichtbar außer Admins
(Vorschau). Es fließt kein Geld, bis die Schritte unten erledigt sind.

## Ablauf und Sicherheit

1. Spiel → `POST /net/shop/checkout` (Worker, `worker/shop.js`). Der Worker prüft das Konto, legt in Supabase eine
   Bestellung `pending` an (`public.gold_orders`) und erzeugt eine Stripe-Checkout-Seite. Preis und Goldmenge kommen nur
   aus `src/shop/catalog.js`, nie aus der Anfrage.
2. Stripe meldet die Zahlung an `POST /net/shop/webhook`. Der Worker prüft die Signatur und den Betrag und setzt die
   Bestellung auf `paid`.
3. Das Spiel holt bezahlte Bestellungen ab (`shop_pending_credits`), schreibt das Gold gut, speichert und bestätigt
   (`shop_confirm_credits` → `credited`). Der Spielstand merkt sich gutgeschriebene Bestellungen (Slice `shop`), nichts
   kommt doppelt an. Erstattungen und Rückbuchungen setzen die Bestellung auf `refunded` bzw. `disputed`.

Auswertung für Admins: `select * from admin_gold_orders();` im SQL-Editor (oder per RPC).

## Freischalten (einmalig)

1. **Supabase:** `supabase/migrations/20261001230000_goldshop.sql` im SQL-Editor ausführen.
2. **Stripe-Konto** anlegen (stripe.com), Firmendaten und Bankkonto hinterlegen. Erst im **Testmodus** arbeiten.
3. **Webhook:** Stripe › Entwickler › Webhooks › Endpunkt hinzufügen:
   `https://www.emberwrath.com/net/shop/webhook`, Ereignisse `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`. Das Signatur-Geheimnis (`whsec_…`) kopieren.
4. **Cloudflare** › Worker emberwrath › Settings › Variables and Secrets:
   - Secret `STRIPE_SECRET_KEY` = `sk_test_…` (später `sk_live_…`)
   - Secret `STRIPE_WEBHOOK_SECRET` = `whsec_…`
   (`SUPABASE_SERVICE_ROLE_KEY` ist vom Newsletter schon gesetzt.)
5. **Testkauf als Admin:** Im Spiel Menü › Shop, mit Stripe-Testkarte `4242 4242 4242 4242` zahlen. Das Gold muss nach der
   Rückkehr ankommen.
6. **Für alle öffnen:** Live-Schlüssel und Live-Webhook eintragen, dann Variable `SHOP_ENABLED` = `true`.
   Zurück auf geschlossen: Variable löschen oder auf `false` setzen.

## Vor dem Freischalten rechtlich klären

- **AGB** mit Abschnitt zu virtuellen Gütern (kein Rücktausch in Geld, Gold ist an den Charakter gebunden) als eigene Seite;
  dann in Stripe als AGB-Adresse eintragen und Variable `STRIPE_REQUIRE_TOS` = `true` setzen.
- **Widerrufsrecht:** Das Spiel holt vor jedem Kauf die ausdrückliche Zustimmung zur sofortigen Gutschrift und die
  Bestätigung ein, dass das Widerrufsrecht damit erlischt (§ 356 Abs. 5 BGB). Eine Widerrufsbelehrung gehört trotzdem in
  die AGB, die Bestätigung schickt Stripe per Beleg-Mail (Stripe › Einstellungen › E-Mails › Belege einschalten).
- **Datenschutzerklärung:** Abschnitt zu Stripe als Zahlungsdienstleister ergänzen.
- **Steuern:** Umsatzsteuer auf digitale Leistungen (EU-weit Steuersatz des Käuferlandes, OSS-Verfahren, ggf.
  Kleinunternehmerregelung) mit Steuerberater klären; Stripe Tax kann das automatisch berechnen.
- **Minderjährige:** Käufe Minderjähriger sind ohne Zustimmung der Eltern schwebend unwirksam; Erstattungen über Stripe
  zurückgeben (Bestellung wird automatisch `refunded`).

## Pakete ändern

`src/shop/catalog.js` (`GOLD_PACKS`): Goldmenge, Bonus, Preis in Cent. Gilt nach dem nächsten Deploy für neue Käufe.

## Tests

`node worker/test/shop.test.mjs` – Worker ohne Netz (Stripe und Supabase nachgestellt): Checkout, Rechte, Signatur,
Betragsprüfung, Erstattung, doppelte Webhooks.
