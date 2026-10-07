# E-Mail-Vorlagen für Supabase (Deutsch und Englisch)

Supabase verschickt die Konto-Mails (Konto bestätigen, Passwort vergessen …) selbst. Diese Vorlagen sind zweisprachig:
Wer sich im englischen Spiel registriert, bekommt Englisch, im deutschen Spiel Deutsch. Ist die Sprache unbekannt
(z. B. Anmeldung mit Google), steht die Mail auf Deutsch und darunter auf Englisch.

## Eintragen (einmalig, ca. 5 Minuten)
1. Supabase-Dashboard öffnen → Projekt **mgjhllqnelqbdqfvczls** → links **Authentication** → **Emails** (Reiter „Templates“).
2. Für jede Vorlage oben den passenden Eintrag wählen, **Subject** und **Body** ersetzen, **Save**:

| Supabase-Eintrag | Datei | Betreff (Subject) |
|---|---|---|
| Confirm sign up | `confirm.html` | Bestätige dein Emberwrath-Konto / Confirm your Emberwrath account |
| Reset password | `recovery.html` | Neues Passwort für Emberwrath / Reset your Emberwrath password |
| Change email address | `email_change.html` | Neue E-Mail-Adresse bestätigen / Confirm your new email – Emberwrath |
| Magic link | `magic_link.html` | Dein Anmeldelink für Emberwrath / Your Emberwrath sign-in link |
| Reauthentication | `reauthentication.html` | Dein Bestätigungscode für Emberwrath / Your Emberwrath confirmation code |

Body = kompletter Inhalt der Datei (öffnen, alles markieren, kopieren, einfügen). Die Betreffzeilen stehen auch in `subjects.txt`.

Texte ändern: in `build.mjs` anpassen und `node supabase/email-templates/build.mjs` ausführen.
Technik: Die Sprache steht in `user_metadata.lang` (`{{ .Data.lang }}`), das Spiel setzt sie bei der Registrierung.

Falls Supabase beim Speichern meldet, dass eigene Vorlagen einen eigenen Mailversand brauchen: unter
**Authentication → Emails → SMTP Settings** Resend eintragen (Host `smtp.resend.com`, Port `465`, Benutzer `resend`,
Passwort = der Resend-API-Schlüssel, Absender `noreply@emberwrath.com`, Name `Emberwrath`).
