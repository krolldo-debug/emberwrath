# Release-Checkliste Emberwrath 1.0

Stand: 03.10.2026. Abhaken vor dem offiziellen Start (Ankündigung, Social Media, Presse).
Ausführliche Befunde der Release-Bewertung: /mnt/project-files/uebergabe/release-bewertung/.

## 1. Technik (Architektur, erledigt in claude/release-core)

- [x] Cloud-Spielstände: Ein altes Fenster oder ein Gerät, das offline gespielt hat, überschreibt keinen neueren
      Stand eines anderen Geräts mehr. Der Stand dieses Geräts landet dann in einem Speicherplatz, der laufende
      Charakter wird neu geladen und der Spieler bekommt einen Hinweis (src/online/CloudSync.js).
- [x] Beim Wechsel in den Hintergrund und beim Schließen: erst speichern, dann sofort hochladen (keepalive).
      Beim Zurückkehren in den Tab wird abgeglichen.
- [x] 429 (zu viele Anfragen) meldet nicht mehr ab; Abmeldung mitten im Spiel wird angezeigt.
- [x] Gold-Shop bestätigt eine Gutschrift erst nach erfolgreichem Speichern.
- [x] Mehrspieler: keine Verbindungsschleife nach „Welt voll“, ohne Netz kein dauerhafter Anmeldefehler.
- [x] Fehler beim Öffnen eines Spielstands: Titel mit Hinweis statt schwarzem Bild. Hängt die Spielschleife,
      erscheint „Neu laden“.
- [x] Schwache Handys: Auto-Qualität misst jetzt die echte Bildrate (vorher nie gesenkt), höchstens 4 Logikschritte
      pro Bild. Gedrosseltes Handy (6-fach) 5–8 fps → 10–21 fps.
- [x] Strg/Cmd/Alt-Kürzel bleiben beim Browser, keine hängenden Tasten auf dem Mac; Pause bei Fokusverlust.
- [x] Panels: Fokus im Panel, Tab bleibt drin, Fokus kehrt zurück.
- [x] Worker: /net/status und /net/worlds 5 s zwischengespeichert; Fehler im Log; HSTS; eigene 404-Seite
      (not_found_handling); /favicon.ico und /apple-touch-icon.png.
- [x] Titel zeigt „Version 1.0.0“ (package.json), der Commit steht im Tooltip und in /version.json.

## 2. Vor dem Start prüfen (nach dem Merge)

- [ ] Cloudflare-Build grün, /version.json zeigt den neuen Commit.
- [ ] `curl -I https://www.emberwrath.com/spielen/` zeigt Content-Security-Policy, Strict-Transport-Security, Cache-Control: no-cache.
- [ ] Unbekannte Adresse (z. B. /gibtsnicht) zeigt die eigene 404-Seite mit Status 404.
- [ ] Zwei Geräte, ein Konto: auf A spielen, auf B weiterspielen, zurück zu A: A lädt den Stand von B und zeigt den Hinweis.
- [ ] Handy (echt, nicht Emulator): Glutöde und Aschenthron flüssig? Einstellungen › Qualität „Auto“ senkt bei Bedarf.
- [ ] Anmeldung E-Mail und Google, Registrierung mit Zustimmungs-Häkchen, Passwort vergessen.
- [ ] Newsletter-Anmeldung und Support-Formular kommen an (support@ → Team-Postfach).

## 3. Beim Nutzer offen (nur der Kontoinhaber kann das)

- [ ] Supabase › Authentication › URL Configuration: Site URL `https://www.emberwrath.com/spielen/`,
      Redirect URL `https://www.emberwrath.com/**`.
- [ ] Supabase: Auftragsverarbeitungsvertrag (DPA) abschließen.
- [ ] Supabase-Mails (Bestätigung, Passwort) über eigenes SMTP von noreply@emberwrath.com (z. B. Resend) senden,
      sonst erreichen sie nur Team-Adressen.
- [ ] Cloudflare › Worker › Settings › Variables: SUPPORT_TO gesetzt (Support-Formular antwortet sonst 503).
- [ ] Google Search Console: Domain bestätigen, Sitemap einreichen.
- [ ] Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen) von einer Kanzlei oder einem Rechtstext-Dienst prüfen lassen.

## 4. Inhalte (Bereichs-Threads, siehe Release-Bewertung)

- [ ] Datenschutz: Welt-Server, Gebietschat, Dungeonsuche ergänzen (Startseite).
- [ ] Nutzungsbedingungen-Seite /nutzungsbedingungen (Startseite) – Voraussetzung für die Zustimmung bei der Registrierung.
- [ ] Meldeweg: Spieler melden/ignorieren im Chat (Mehrspieler), Kategorie im Support-Formular (Startseite).
- [ ] Texte, die nach unfertigem Stand klingen, neutral (Bereichs-Threads).

## 5. Gold-Shop (erst wenn Stripe eingerichtet wird, nicht zum Start nötig)

- [ ] Stripe-Konto, Schlüssel als Worker-Secrets, Webhook (docs/SHOP.md).
- [ ] Migration supabase/migrations/20261001230000_goldshop.sql ausführen.
- [ ] Kaufbedingungen, Widerrufsbelehrung, „zahlungspflichtig bestellen“, Stripe in der Datenschutzerklärung,
      Umsatzsteuer mit Steuerberater klären.

## 6. Nach dem Start beobachten

- Cloudflare › Worker › Observability: Fehler `forms`, `shop`, `net`.
- Durable Objects und Anfragen: Gratis-Tarif reicht für ca. 130 Spielerstunden pro Tag, danach 5 $/Monat (nur mit OK des Nutzers buchen).
- Supabase › Database: Größe der Tabelle characters (Snapshot bis 1 MB je Charakter).
