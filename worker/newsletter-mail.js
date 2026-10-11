// Bestätigungsmail des Newsletters (Double-Opt-in) im Look der Website: dunkel, Titelbild mit Logo, ein Glut-Knopf.
// HTML für Gmail, Apple Mail und Outlook (Tabellen, Inline-Styles), dazu dieselbe Nachricht als reiner Text.
// Das Kopfbild liegt auf der Website (site/img/mail-kopf.png, 340×210 Spielpixel ×4) und wird per https geladen.
// Dunkelmodus: Die Mail ist selbst dunkel. color-scheme verhindert, dass Apple Mail sie umfärbt; Gmail auf dem Handy
// kehrt Farben trotzdem um, deshalb liegen die Flächen zusätzlich als background-image (das Gmail nicht anfasst) und
// helle Schrift steckt in den gm-Hüllen (Mischmodus-Trick, wirkt nur in Gmail: „u + .body“).

const BG = '#060309';      // Himmel oben im Kopfbild, damit Bild und Mail nahtlos ineinander übergehen
const PANEL = '#0d0714';   // --bg-2 der Website
const EDGE = '#6a4526';    // --edge
const TEXT = '#efe6d2';    // --text
const SOFT = '#d6c9ae';    // --soft
const MUTED = '#a89a7c';   // --muted
const TITLE = '#fbe9c6';   // .title
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Cinzel,Georgia,'Times New Roman',serif";

const T = {
  de: {
    subject: 'Ein Klick noch: Bestätige deinen Emberwrath-Newsletter',
    preheader: 'Bestätige deine Anmeldung, dann bist du dabei.',
    title: 'Ein Klick noch',
    lead: 'Bestätige deine Anmeldung, dann erfährst du als Erstes von neuen Gebieten, Bossen und Ereignissen in Emberwrath.',
    button: 'Anmeldung bestätigen',
    valid: (h) => `Der Link gilt ${h} Stunden. Du hast dich nicht angemeldet? Dann ignoriere diese E-Mail einfach, du hörst nichts mehr von uns.`,
    fallback: 'Der Knopf geht nicht? Dann öffne diesen Link:',
    imprint: 'Impressum', privacy: 'Datenschutz', imprintPath: '/impressum', privacyPath: '/datenschutz', homePath: '/',
    hello: 'Hallo,',
    textLead: 'bestätige deine Anmeldung zum Emberwrath-Newsletter, dann erfährst du als Erstes von neuen Gebieten, Bossen und Ereignissen.',
    textOpen: 'Mit einem Klick auf diesen Link bestätigst du:',
  },
  en: {
    subject: 'One click left: confirm your Emberwrath newsletter',
    preheader: 'Confirm your sign-up and you are in.',
    title: 'One click left',
    lead: 'Confirm your sign-up and be the first to hear about new regions, bosses and events in Emberwrath.',
    button: 'Confirm sign-up',
    valid: (h) => `The link is valid for ${h} hours. Didn't sign up? Just ignore this email and you won't hear from us again.`,
    fallback: 'Button not working? Open this link:',
    imprint: 'Legal notice', privacy: 'Privacy', imprintPath: '/en/legal-notice', privacyPath: '/en/privacy', homePath: '/en/',
    hello: 'Hello,',
    textLead: 'please confirm your sign-up for the Emberwrath newsletter and be the first to hear about new regions, bosses and events.',
    textOpen: 'Open this link to confirm:',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Fläche, die Gmail im Dunkelmodus nicht umfärbt: Farbe als bgcolor und noch einmal als Verlauf.
const fill = (c) => `background-color:${c};background-image:linear-gradient(${c},${c});`;
// Helle Schrift, die Gmails Farbumkehr übersteht (siehe <style>); anderswo wirkungslos.
const gm = (html) => `<span class="gm-s"><span class="gm-d">${html}</span></span>`;

// lang: 'de' | 'en', link: Bestätigungsseite mit Token, home: https://www.emberwrath.com, ttlHours: Gültigkeit.
export function confirmMail(lang, link, home, ttlHours) {
  const t = T[lang === 'en' ? 'en' : 'de'];
  const host = home.replace(/^https?:\/\//, '');
  const text = [
    t.hello, '', t.textLead, '', t.textOpen, '', link, '', t.valid(ttlHours), '', 'Emberwrath', `${home}${t.homePath === '/' ? '' : t.homePath}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'de'}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(t.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
@font-face{font-family:Cinzel;font-weight:700;src:url(${home}/fonts/cinzel-latin-700-normal.woff2) format('woff2')}
:root{color-scheme:dark light;supported-color-schemes:dark light}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
a{text-decoration:none}
.ew-btn a:hover{background:#b8541f!important}
u + .body .gm-s{display:block;background:#000;mix-blend-mode:screen}
u + .body .gm-d{display:block;background:#000;mix-blend-mode:difference}
@media (max-width:620px){
  .ew-pad{padding-left:22px!important;padding-right:22px!important}
  .ew-title{font-size:26px!important}
  .ew-btn{width:100%!important}
  .ew-btn a{display:block!important;padding:17px 10px!important;letter-spacing:0.12em!important}
}
</style>
</head>
<body class="body" style="margin:0;padding:0;${fill(BG)}color:${TEXT}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG}">${esc(t.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="${fill(BG)}">
<tr><td align="center" style="padding:0">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
    <tr><td style="padding:0;line-height:0;font-size:0">
      <a href="${esc(home)}${t.homePath === '/' ? '' : t.homePath}" style="display:block"><img src="${home}/img/mail-kopf.png" width="600" height="371" alt="Emberwrath" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;image-rendering:pixelated;${fill(BG)}color:${TITLE};font:700 28px ${SERIF};line-height:371px;text-align:center"></a>
    </td></tr>
    <tr><td style="padding:0 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL}" style="${fill(PANEL)}border:2px solid ${EDGE};border-top-color:#b8862a">
        <tr><td class="ew-pad" align="center" style="padding:34px 40px 36px;text-align:center">
          <h1 class="ew-title" style="margin:0 0 14px;font:700 30px/1.15 ${SERIF};color:${TITLE};letter-spacing:0.02em">${gm(esc(t.title))}</h1>
          <p style="margin:0 auto 28px;max-width:430px;font:16px/1.6 ${SANS};color:${SOFT}">${gm(esc(t.lead))}</p>
          <table role="presentation" class="ew-btn" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
            <tr><td align="center" bgcolor="#a8481a" style="background-color:#a8481a;background-image:linear-gradient(180deg,#a8481a 0,#a8481a 50%,#86320f 50%,#86320f 100%);border:2px solid #ffb050;box-shadow:0 0 0 2px #1a0604,0 0 28px rgba(255,110,30,0.35)">
              <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:17px 34px"><![endif]-->
              <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:17px 34px;font:700 15px/1.2 ${SANS};letter-spacing:0.16em;text-transform:uppercase;color:#fff6e6;text-decoration:none;text-shadow:0 2px 0 #3a1004;mso-padding-alt:0">${gm(esc(t.button))}</a>
              <!--[if mso]></td></tr></table><![endif]-->
            </td></tr>
          </table>
          <p style="margin:28px auto 0;max-width:430px;font:13px/1.6 ${SANS};color:${MUTED}">${gm(esc(t.valid(ttlHours)))}</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="ew-pad" align="center" style="padding:22px 32px 8px;font:11px/1.6 ${SANS};color:#7d7058;text-align:center">
      ${esc(t.fallback)}<br><a href="${esc(link)}" style="color:#7d7058;text-decoration:underline;word-break:break-all">${esc(link)}</a>
    </td></tr>
    <tr><td align="center" style="padding:18px 16px 36px;font:12px/1.6 ${SANS};color:${MUTED};text-align:center">
      <a href="${esc(home)}${t.homePath === '/' ? '' : t.homePath}" style="color:${MUTED};text-decoration:none">${esc(host)}</a>
      &nbsp;·&nbsp; <a href="${esc(home + t.imprintPath)}" style="color:${MUTED};text-decoration:none">${esc(t.imprint)}</a>
      &nbsp;·&nbsp; <a href="${esc(home + t.privacyPath)}" style="color:${MUTED};text-decoration:none">${esc(t.privacy)}</a>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  return { subject: t.subject, text, html };
}
