// Erzeugt die E-Mail-Vorlagen für Supabase (Authentication › Emails) auf Deutsch und Englisch.
// Aufruf: node supabase/email-templates/build.mjs → schreibt *.html daneben. Anleitung: README.md.
// Sprache: user_metadata.lang ('de'/'en', setzt das Spiel bei der Registrierung). Fehlt sie (z. B. Google-Konten), zeigt die Mail beide Sprachen.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const T = {
  confirm: {
    subject: 'Bestätige dein Emberwrath-Konto / Confirm your Emberwrath account',
    de: { title: 'Willkommen in Emberwrath', body: 'Bitte bestätige deine E-Mail-Adresse, dann ist dein Konto bereit.', button: 'E-Mail bestätigen', foot: 'Wenn du kein Konto erstellt hast, ignoriere diese E-Mail einfach.' },
    en: { title: 'Welcome to Emberwrath', body: 'Please confirm your email address and your account is ready.', button: 'Confirm email', foot: 'If you did not create an account, simply ignore this email.' },
    url: '{{ .ConfirmationURL }}',
  },
  recovery: {
    subject: 'Neues Passwort für Emberwrath / Reset your Emberwrath password',
    de: { title: 'Neues Passwort festlegen', body: 'Du hast ein neues Passwort für dein Emberwrath-Konto angefordert. Über den Knopf legst du es fest.', button: 'Passwort festlegen', foot: 'Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt dann unverändert.' },
    en: { title: 'Set a new password', body: 'You asked for a new password for your Emberwrath account. Use the button to set it.', button: 'Set password', foot: 'If this was not you, ignore this email. Your password stays the same.' },
    url: '{{ .ConfirmationURL }}',
  },
  email_change: {
    subject: 'Neue E-Mail-Adresse bestätigen / Confirm your new email – Emberwrath',
    de: { title: 'Neue E-Mail-Adresse bestätigen', body: 'Bitte bestätige, dass dein Emberwrath-Konto ab jetzt {{ .NewEmail }} verwenden soll.', button: 'Adresse bestätigen', foot: 'Wenn du das nicht warst, schreib uns an support@emberwrath.com.' },
    en: { title: 'Confirm your new email address', body: 'Please confirm that your Emberwrath account should use {{ .NewEmail }} from now on.', button: 'Confirm address', foot: 'If this was not you, write to us at support@emberwrath.com.' },
    url: '{{ .ConfirmationURL }}',
  },
  magic_link: {
    subject: 'Dein Anmeldelink für Emberwrath / Your Emberwrath sign-in link',
    de: { title: 'Anmelden bei Emberwrath', body: 'Mit diesem Knopf meldest du dich an. Der Link gilt nur kurz und nur einmal.', button: 'Anmelden', foot: 'Wenn du das nicht angefordert hast, ignoriere diese E-Mail.' },
    en: { title: 'Sign in to Emberwrath', body: 'Use this button to sign in. The link only works once and for a short time.', button: 'Sign in', foot: 'If you did not request this, ignore this email.' },
    url: '{{ .ConfirmationURL }}',
  },
  reauthentication: {
    subject: 'Dein Bestätigungscode für Emberwrath / Your Emberwrath confirmation code',
    de: { title: 'Bestätigungscode', body: 'Gib diesen Code im Spiel ein, um die Aktion zu bestätigen: <b style="font-size:20px;letter-spacing:3px">{{ .Token }}</b>', foot: 'Wenn du das nicht warst, ändere bitte dein Passwort.' },
    en: { title: 'Confirmation code', body: 'Enter this code in the game to confirm the action: <b style="font-size:20px;letter-spacing:3px">{{ .Token }}</b>', foot: 'If this was not you, please change your password.' },
  },
};

const block = (t, url, lang) => `
  <div lang="${lang}">
    <h1 style="margin:0 0 12px;font:700 22px Georgia,serif;color:#f0c870">${t.title}</h1>
    <p style="margin:0 0 20px;font:16px/1.5 Arial,sans-serif;color:#e8e0d4">${t.body}</p>
    ${url ? `<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#c8641e;color:#fff;font:700 15px Arial,sans-serif;text-decoration:none;border-radius:3px">${t.button}</a></p>
    <p style="margin:0 0 16px;font:12px/1.5 Arial,sans-serif;color:#a89ab8">${lang === 'en' ? 'Button not working? Open this link:' : 'Knopf geht nicht? Öffne diesen Link:'}<br><a href="${url}" style="color:#f0c870;word-break:break-all">${url}</a></p>` : ''}
    <p style="margin:0;font:13px/1.5 Arial,sans-serif;color:#a89ab8">${t.foot}</p>
  </div>`;

for (const [name, t] of Object.entries(T)) {
  const de = block(t.de, t.url, 'de'), en = block(t.en, t.url, 'en');
  const sep = '\n  <hr style="border:0;border-top:1px solid #3a2a1a;margin:28px 0">';
  const html = `<!-- Emberwrath · Supabase-Vorlage „${name}“ · erzeugt von build.mjs. Betreff: ${t.subject} -->
<div style="background:#0b0710;padding:32px 20px">
<div style="max-width:520px;margin:0 auto;background:#150d1c;border:1px solid #5a3a1a;padding:28px">
  <p style="margin:0 0 20px;font:700 14px Georgia,serif;letter-spacing:4px;color:#e8742c">EMBERWRATH</p>
{{ if .Data.lang }}{{ if eq .Data.lang "en" }}${en}{{ else }}${de}{{ end }}{{ else }}${de}${sep}${en}{{ end }}
</div>
</div>
`;
  writeFileSync(join(here, `${name}.html`), html);
}
writeFileSync(join(here, 'subjects.txt'), Object.entries(T).map(([n, t]) => `${n}: ${t.subject}`).join('\n') + '\n');
console.log('Vorlagen geschrieben:', Object.keys(T).join(', '));
