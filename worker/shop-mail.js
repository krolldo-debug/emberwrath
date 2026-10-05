// Bestellbestätigung des Shops per E-Mail (Resend). Pflicht, damit das Widerrufsrecht bei digitalen Inhalten erlischt
// (§ 356 Abs. 5 Nr. 3, § 312f Abs. 3 BGB): Vertragsinhalt, Verzichtserklärung mit Zeitpunkt und der vollständige Text der
// Kaufbedingungen samt Widerrufsbelehrung und Muster-Formular – als Text in der Mail, nicht nur als Link.
// Die Kaufbedingungen kommen aus der veröffentlichten Seite (env.ASSETS: /kaufbedingungen.html bzw. /en/kaufbedingungen.html),
// damit Mail und Website nie auseinanderlaufen.
import { PRICE_NOTES, TAX_MODE, TERMS_PATH, findPack, findDesign, packTotal, DESIGN_DETAILS } from '../src/shop/catalog.js';

// Anbieter wie im Impressum und in Abschnitt 1 der Kaufbedingungen.
const PROVIDER = 'Dominic Paul Kroll, Friedenstraße 5, 14532 Stahnsdorf, Deutschland, support@emberwrath.com';

const T = {
  de: {
    subject: (no) => `Deine Bestellung bei Emberwrath (Nr. ${no})`,
    hello: 'Hallo,',
    intro: 'vielen Dank für deinen Kauf. Hier ist deine Bestellbestätigung. Bitte bewahre diese E-Mail auf.',
    order: 'Bestellnummer', date: 'Datum', item: 'Angebot', price: 'Endpreis', payment: 'Zahlungsart', provider: 'Anbieter',
    gold: (amount, name) => `${amount} Gold für deinen Charakter ${name}, sofort gutgeschrieben`,
    goldNoName: (amount) => `${amount} Gold, sofort gutgeschrieben`,
    design: (details) => `${details} für alle Charaktere deines Kontos, Reiten ab Stufe 20`,
    waiver: (at) => `Du hast am ${at} ausdrücklich zugestimmt, dass wir vor Ablauf der Widerrufsfrist mit der Bereitstellung beginnen, und bestätigt, dass du damit dein Widerrufsrecht verlierst.`,
    delivery: 'Gold und Designs sind beim nächsten Spielstart in deinem Konto.',
    terms: 'Kaufbedingungen mit Widerrufsbelehrung und Muster-Widerrufsformular',
    termsNote: 'Es gelten die folgenden Kaufbedingungen in der Fassung',
    help: 'Fragen zu deinem Kauf? Antworte einfach auf diese E-Mail oder schreib an support@emberwrath.com.',
    priceNote: PRICE_NOTES,
    stripe: 'über Stripe',
    methods: { card: 'Karte', paypal: 'PayPal', klarna: 'Klarna', sepa_debit: 'SEPA-Lastschrift', link: 'Link', giropay: 'giropay', sofort: 'Sofort', apple_pay: 'Apple Pay', google_pay: 'Google Pay' },
    tz: 'Uhr',
  },
  en: {
    subject: (no) => `Your Emberwrath order (No. ${no})`,
    hello: 'Hello,',
    intro: 'thank you for your purchase. This is your order confirmation. Please keep this email.',
    order: 'Order number', date: 'Date', item: 'Item', price: 'Total price', payment: 'Payment method', provider: 'Seller',
    gold: (amount, name) => `${amount} gold for your character ${name}, credited immediately`,
    goldNoName: (amount) => `${amount} gold, credited immediately`,
    design: (details) => `${details} for all characters on your account, riding from level 20`,
    waiver: (at) => `On ${at} you expressly agreed that we begin providing the content before the withdrawal period ends, and confirmed that you thereby lose your right of withdrawal.`,
    delivery: 'Your gold and designs will be in your account the next time you start the game.',
    terms: 'Terms of purchase with withdrawal policy and model withdrawal form',
    termsNote: 'The following terms of purchase apply, version',
    help: 'Questions about your purchase? Just reply to this email or write to support@emberwrath.com.',
    priceNote: {
      ust: 'All prices are final prices including VAT.',
      kleinunternehmer: 'All prices are final prices. No VAT is charged under § 19 UStG (small business regulation).',
    },
    stripe: 'via Stripe',
    methods: { card: 'Card', paypal: 'PayPal', klarna: 'Klarna', sepa_debit: 'SEPA Direct Debit', link: 'Link', giropay: 'giropay', sofort: 'Sofort', apple_pay: 'Apple Pay', google_pay: 'Google Pay' },
    tz: '(German time)',
    englishNote: 'The German version of the terms is legally binding. An English translation follows the German text where available.',
  },
};
const DESIGN_DETAILS_EN = {
  design_phoenix: 'Mount Phoenix Wing and dye Phoenix Ember',
  design_astral: 'Mount Star Stallion and dye Starry Night',
  design_soul: 'Mount Soul Wolf and dye Soullight',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const orderNumber = (id) => String(id).replace(/-/g, '').slice(0, 10).toUpperCase();

function when(iso, lang) {
  const d = new Date(iso);
  const loc = lang === 'en' ? 'en-GB' : 'de-DE';
  const date = d.toLocaleDateString(loc, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString(loc, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time} ${T[lang].tz}`;
}

// Hauptteil einer Seite (<main>…</main>) als HTML mit absoluten Links und als Text.
export function termsFromPage(html, site) {
  const m = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html ?? '');
  if (!m || !/Widerrufsbelehrung|withdrawal/i.test(m[1])) throw new Error('terms page');
  const body = m[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/href="(?!https?:|mailto:|#)\/?([^"]*)"/g, (_, p) => `href="${site}/${p}"`);
  const text = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li|ol|ul|div)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&shy;/g, '').replace(/&#8209;/g, '-').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  // Überschriften der Seite für die Mail verkleinern
  const out = body
    .replace(/<h1\b[^>]*>/gi, '<h1 style="font:700 20px Georgia,serif;margin:22px 0 8px">')
    .replace(/<h2\b[^>]*>/gi, '<h2 style="font:700 16px Georgia,serif;margin:20px 0 6px">')
    .replace(/<h3\b[^>]*>/gi, '<h3 style="font:700 14px Georgia,serif;margin:16px 0 4px">')
    .replace(/<p class="lead"/g, '<p').trim();
  return { html: out, text };
}

async function loadTerms(env, site, lang) {
  if (!env.ASSETS) throw new Error('no assets');
  const get = async (path) => {
    const r = await env.ASSETS.fetch(new Request(`${site}${path}.html`));
    if (!r.ok) throw new Error(`terms ${r.status}`);
    return termsFromPage(await r.text(), site);
  };
  const de = await get(TERMS_PATH);
  if (lang !== 'en') return { de };
  const en = await get(`/en${TERMS_PATH}`).catch(() => null);
  return { de, en };
}

// Inhalt der Mail. order: Zeile aus gold_orders, extra: { characterName, paymentMethod, email }.
export function buildConfirmation({ order, characterName, paymentMethod, terms, site, termsVersion }) {
  const lang = order.lang === 'en' ? 'en' : 'de';
  const t = T[lang];
  const loc = lang === 'en' ? 'en-GB' : 'de-DE';
  const no = orderNumber(order.id);
  const pack = findPack(order.product_id), design = findDesign(order.product_id);
  const amount = (n) => n.toLocaleString(loc);
  const item = pack
    ? (characterName ? t.gold(amount(packTotal(pack)), characterName) : t.goldNoName(amount(packTotal(pack))))
    : t.design((lang === 'en' ? DESIGN_DETAILS_EN : DESIGN_DETAILS)[order.product_id] ?? design?.name ?? order.product_id);
  const price = `${(order.amount_cents / 100).toLocaleString(loc, { style: 'currency', currency: String(order.currency || 'eur').toUpperCase() })}`;
  const method = paymentMethod ? `${t.methods[paymentMethod] ?? paymentMethod} ${t.stripe}` : t.stripe.replace(/^\w/, (c) => c.toUpperCase());
  const rows = [
    [t.order, no],
    [t.date, when(order.paid_at ?? new Date().toISOString(), lang)],
    [t.item, item],
    [t.price, `${price}. ${t.priceNote[TAX_MODE]}`],
    [t.payment, method],
    [t.provider, PROVIDER],
  ];
  const waiver = t.waiver(when(order.withdrawal_waiver_at, lang));
  const version = termsVersion ?? order.terms_version ?? '';
  const parts = [terms.de, ...(terms.en ? [terms.en] : [])];

  const text = [
    t.hello, '', t.intro, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    waiver, '', t.delivery, '', t.help, '',
    '------------------------------------------------------------',
    `${t.terms}`, `${t.termsNote} ${version}${lang === 'en' ? `. ${t.englishNote}` : ''}`, `${site}${TERMS_PATH}`, '',
    ...parts.map((p) => p.text).join('\n\n------------------------------------------------------------\n\n').split('\n'),
  ].join('\n');

  const cell = 'padding:6px 12px 6px 0;vertical-align:top;';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(t.subject(no))}</title></head>
<body style="margin:0;padding:24px;background:#f6f3ee;color:#1d1a16;font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;background:#fff;padding:28px 32px;border:1px solid #e3ddd2">
<p style="margin:0 0 6px;font:700 20px Georgia,serif;color:#8a3a10">Emberwrath</p>
<p>${esc(t.hello)}</p><p>${esc(t.intro)}</p>
<table style="border-collapse:collapse;margin:14px 0">${rows.map(([k, v]) => `<tr><td style="${cell}color:#6b6256;white-space:nowrap">${esc(k)}</td><td style="${cell}"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<p style="padding:12px 14px;background:#fbf4e6;border-left:3px solid #c0661c">${esc(waiver)}</p>
<p>${esc(t.delivery)}</p><p style="color:#6b6256">${esc(t.help)}</p>
<hr style="border:0;border-top:1px solid #e3ddd2;margin:26px 0">
<h2 style="font:700 17px Georgia,serif;margin:0 0 6px">${esc(t.terms)}</h2>
<p style="color:#6b6256;font-size:13px">${esc(t.termsNote)} ${esc(version)}${lang === 'en' ? `. ${esc(t.englishNote)}` : ''} <a href="${site}${TERMS_PATH}">${esc(`${site.replace(/^https?:\/\//, '')}${TERMS_PATH}`)}</a></p>
${parts.map((p) => `<div style="font-size:13.5px">${p.html}</div>`).join('<hr style="border:0;border-top:1px solid #e3ddd2;margin:26px 0">')}
</div></body></html>`;
  return { subject: t.subject(no), text, html };
}

// Verschickt die Bestätigung. Wirft bei jedem Fehler (Aufrufer vermerkt ihn und lässt Stripe den Webhook wiederholen).
export async function sendConfirmation(env, { order, to, characterName, paymentMethod, site }) {
  if (!env.RESEND_API_KEY) throw new Error('resend not configured');
  if (!to) throw new Error('no recipient');
  const terms = await loadTerms(env, site, order.lang);
  const mail = buildConfirmation({ order, characterName, paymentMethod, terms, site });
  const from = env.MAIL_FROM || 'noreply@emberwrath.com';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': `order-${order.id}` },
    body: JSON.stringify({ from: `Emberwrath <${from}>`, to: [to], reply_to: 'support@emberwrath.com', subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
}
