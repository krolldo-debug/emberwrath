// Einstellungen der Startseite – hier werden Adressen und Kanäle eingetragen.
// Leere Felder blendet die Seite aus bzw. zeigt „bald“ (es wird nichts erfunden).
window.EW_SITE = {
  // Wohin die Knöpfe führen. Das Spiel liegt unter /spielen/.
  playUrl: '/spielen/',
  loginUrl: '/spielen/#anmelden',       // abgestimmt mit dem Thread „Login, Konten und Admin-Panel“
  registerUrl: '/spielen/#registrieren',
  accountUrl: '/spielen/#konto',

  // Kontakt für Support und Impressum, z. B. 'support@emberwrath.com'
  supportEmail: 'support@emberwrath.com',

  // Social Media: vollständige Adresse eintragen, z. B. 'https://discord.gg/abc123'.
  // Reihenfolge = Reihenfolge auf der Seite. Leer = „bald“.
  social: {
    discord: '',
    youtube: '',
    tiktok: '',
    instagram: '',
    x: '',
  },

  // Impressum (§ 5 DDG). Pflicht, sobald die Seite geschäftsmäßig angeboten wird.
  // Solange die Felder leer sind, zeigt die Seite einen Hinweis statt erfundener Angaben.
  impressum: {
    name: 'Dominic Paul Kroll', // Vor- und Nachname bzw. Firma
    street: 'Friedenstraße 5', // Straße und Hausnummer (kein Postfach)
    city: '14532 Stahnsdorf', // PLZ und Ort
    country: 'Deutschland',
    email: '',       // leer = supportEmail
    phone: '',       // optional, oder anderer schneller Kontaktweg
    responsible: '', // Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV), falls abweichend
  },
};
