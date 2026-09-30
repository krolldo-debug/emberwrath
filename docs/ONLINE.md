# Online-Konten, Cloud-Spielstände und Verwaltung

Stand 2026-09-30. Code: `src/online/`, Datenbank: `supabase/migrations/`. Dienst: [Supabase](https://supabase.com) (Free-Tarif reicht).

## Was es gibt

- **Registrierung und Anmeldung** mit E-Mail und Passwort (Bestätigungslink, „Passwort vergessen“, Passwort ändern),
  Schnellanmeldung mit **Google** und **Apple** (Apple vorbereitet, siehe unten).
- **Cloud-Spielstände:** Charaktere eines Kontos liegen in der Datenbank und sind auf jedem Gerät verfügbar. Gespielt wird
  weiter lokal (schnell, auch kurz ohne Netz); nach jedem Speichern lädt das Spiel den Stand hoch. Neuerer Stand gewinnt.
- Gespielt wird nur mit Konto. Ältere lokale Charaktere eines Geräts lassen sich als Kopie ins Konto übernehmen.
- **Konto selbst löschen** (Konto + alle Online-Charaktere, DSGVO).
- **Verwaltung** (`…/spielen/#admin` oder Knopf „Verwaltung öffnen“ im Konto): registrierte Konten (Name, E-Mail,
  Anmeldeart, Registrierungsdatum, letzte Anmeldung, Anzahl Charaktere, höchste Stufe), alle Charaktere (Volk, Klasse,
  Stufe, Gebiet, erstellt, zuletzt gespielt), Kennzahlen und Verteilung der Stufen, Registrierungen der letzten 30 Tage.

## Sicherheit in Kürze

- Admin ist nur, wer in der Tabelle `public.admins` steht. Diese Tabelle kann kein Spieler lesen oder beschreiben;
  eingetragen wird von Hand im SQL-Editor (Schritt 6). Registrieren allein macht niemanden zum Admin.
- Die Verwaltungsdaten liefern nur die Funktionen `admin_stats`, `admin_users`, `admin_characters`. Sie prüfen auf dem
  Server, ob das anfragende Konto Admin ist. Ein manipulierter Browser bekommt trotzdem nur „Kein Zugriff“.
- Jeder Spieler kann per Row Level Security nur seine eigenen Charaktere lesen und schreiben.
- Im Spiel steht nur der öffentliche `anon`-Schlüssel. Der `service_role`-/Secret-Schlüssel gehört nie ins Repo.
- Sitzungstokens liegen unter `emberwrath:online:*` (getrennt von den Spielständen unter `emberfall:v1:*`).
- Stufe und Spielstand meldet das Gerät. Für die Übersicht reicht das; gegen Schummeln hilft erst die serverseitige
  Spiellogik aus `docs/MULTIPLAYER.md`.

## Einrichtung (einmalig, vom Projektbesitzer)

1. **Supabase-Projekt anlegen:** auf supabase.com registrieren → *New project*, Name `emberwrath`, Region
   *Central EU (Frankfurt)*, ein starkes Datenbank-Passwort wählen und sicher aufbewahren.
2. **Datenbank einrichten:** *SQL Editor* → *New query* → den kompletten Inhalt von
   `supabase/migrations/20260930120000_konten_und_admin.sql` einfügen → *Run*. Das Skript darf mehrfach laufen.
3. **Adressen freigeben:** *Authentication → URL Configuration*
   - Site URL: `https://emberwrath.kroll-do.workers.dev/spielen/`
   - Redirect URLs: `https://emberwrath.kroll-do.workers.dev/**` und `http://localhost:8080/**`
   - Später mit eigener Domain dieselben Einträge für die Domain ergänzen.
4. **E-Mail:** *Authentication → Sign In / Providers → Email*: „Confirm email“ eingeschaltet lassen.
   Wichtig: Der eingebaute Mailversand von Supabase schickt nur an Mitglieder des Supabase-Teams und nur wenige Mails pro
   Stunde. Für echte Spieler braucht es einen eigenen Mailversand (*Authentication → Emails → SMTP Settings*, z. B. Resend
   oder Brevo, beide mit Gratis-Kontingent; dafür ist eine eigene Domain nötig). Zum Testen mit dem eigenen Konto reicht der
   eingebaute Versand.
5. **Schlüssel übergeben:** *Project Settings → API* (bzw. *API Keys*): **Project URL** und **anon/publishable key** an
   Claude geben. Sie kommen in `src/online/config.js`, und die CSP in `tools/build.mjs` bekommt
   `connect-src 'self' https://<projekt>.supabase.co`. Den `service_role`/Secret-Key nicht weitergeben.
6. **Admin festlegen:** Im Spiel mit der eigenen E-Mail registrieren und den Link bestätigen. Dann im SQL-Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'DEINE-E-MAIL@beispiel.de';
   ```
   Entfernen: `delete from public.admins where user_id = (select id from auth.users where email = '…');`
7. **Google-Anmeldung:** In der [Google Cloud Console](https://console.cloud.google.com):
   1. Projekt anlegen (z. B. „Emberwrath“).
   2. *Google Auth Platform* (früher *OAuth consent screen*) → *Get started*: App-Name „Emberwrath“, Support-E-Mail,
      Zielgruppe *Extern*, Kontakt-E-Mail. Unter *Branding* die Startseite, Datenschutz- und Impressum-Adresse eintragen
      (`https://emberwrath.kroll-do.workers.dev/`, `…/datenschutz.html`, `…/impressum.html`).
      Unter *Data Access* reichen die Standard-Bereiche `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`.
      Unter *Audience* auf *In production* stellen, sonst können sich nur eingetragene Testnutzer anmelden.
   3. *Clients* → *Create client* → Typ *Web application*, Name „Emberwrath Web“.
      *Authorized JavaScript origins*: `https://emberwrath.kroll-do.workers.dev`.
      *Authorized redirect URIs*: `https://mgjhllqnelqbdqfvczls.supabase.co/auth/v1/callback`.
   4. **Client ID** und **Client secret** kopieren. In Supabase: *Authentication → Sign In / Providers → Google* →
      *Enable*, beide Werte eintragen → *Save*. Das Secret nur dort eintragen, nicht weitergeben.
   Mehr ist nicht nötig: Das Spiel fragt die aktiven Anbieter bei Supabase ab (`/auth/v1/settings`) und schaltet den
   Knopf „Weiter mit Google“ beim nächsten Öffnen der Anmeldeseite von selbst frei.
8. **Apple-Anmeldung:** braucht eine Mitgliedschaft im Apple Developer Program (99 US-$ pro Jahr, Entscheidung des
   Projektbesitzers). Danach im Apple-Developer-Bereich: eine *App ID* mit „Sign in with Apple“, eine *Services ID*
   (z. B. `de.emberwrath.web`) mit Domain `mgjhllqnelqbdqfvczls.supabase.co` und Return-URL
   `https://mgjhllqnelqbdqfvczls.supabase.co/auth/v1/callback`, dazu einen *Key* mit „Sign in with Apple“ (.p8-Datei).
   In Supabase unter *Providers → Apple* die Services ID als Client ID eintragen und das Secret aus Team-ID, Key-ID und
   .p8-Datei erzeugen (Supabase bietet dafür ein Werkzeug). Das Apple-Secret läuft nach spätestens 6 Monaten ab und muss
   dann neu erzeugt werden. Auch hier schaltet sich der Knopf von selbst frei; bis dahin zeigt er „bald“.
   Für eine spätere iOS-App verlangt Apple in der Regel diese Anmeldeart, sobald Google angeboten wird.

## Einbau (Architektur)

- `src/main.js`: `import { installOnline } from './online/index.js';` und `.use(installOnline)` nach `installUi`.
- `index.html`: `<link rel="stylesheet" href="src/online/online.css">` nach `world.css`.
- `tools/build.mjs`: CSP `connect-src 'self' https://<projekt>.supabase.co` (kein Wildcard, kein Realtime nötig).
- Anker: `…/spielen/#anmelden`, `#registrieren`, `#konto`, `#admin`. Rückleitungen (E-Mail-Links, Google, Apple) kommen
  auf dieselbe Seite zurück (`location.origin + location.pathname`) und werden dort ausgewertet.

## Schnittstelle für andere Bereiche

`game.online`: `configured`, `user`, `displayName`, `accountId` (`'sb_<id>'`), `syncStatus`, `isAdmin()`,
`open('login'|'register'|'account')`, `play()`, `isOnlineAccount(accountId)`.
Szenen `login` (`{ mode }`) und `admin`. Bus-Event `online:changed` `{ user, status }`.
Ein Online-Konto erscheint in `game.save` als lokaler Account `sb_<Nutzer-ID>` (Zwischenspeicher dieses Geräts);
Speichern und Löschen darüber wird automatisch hochgeladen. Beim Abmelden wird dieser Zwischenspeicher entfernt,
sofern alles hochgeladen ist.

Anmeldestatus ohne Spielcode (z. B. Startseite): `localStorage['emberwrath:online:session']` enthält
`{ user: { email, user_metadata: { display_name } }, expires_at }`, solange jemand angemeldet ist.

## Test

Browsertest gegen einen nachgebauten Supabase-Dienst auf echter Postgres-Datenbank mit denselben Regeln:
Registrierung mit Bestätigung, Anmeldung, Google-Rückleitung, Upload und Download von Charakteren über zwei Geräte,
Löschen in beide Richtungen, Übernahme lokaler Charaktere, Abmelden, Passwort zurücksetzen (auch Link im fremden
Browser), Token-Erneuerung, Konto löschen, Verwaltung mit und ohne Recht, fremdes Konto sieht nur eigene Daten.
