// Formulare der Website: Support (Kontakt, Fehler melden, Löschung) und Newsletter mit Double-Opt-in.
//   POST /net/forms/support          { kind, name, email, character, device, message, website, t }  → Mail an den Support
//   GET  /net/newsletter/status      → { enabled }  (Formular erscheint nur, wenn Versand und Speicher eingerichtet sind)
//   POST /net/newsletter/subscribe   { email, website, t }  → Bestätigungsmail (Double-Opt-in)
//   GET  /net/newsletter/confirm?token=…      → bestätigt, leitet auf /newsletter?s=bestaetigt
//   GET  /net/newsletter/unsubscribe?token=…  → abgemeldet, leitet auf /newsletter?s=abgemeldet
//   POST /net/newsletter/unsubscribe?token=…  → Ein-Klick-Abmeldung aus dem Mailprogramm (RFC 8058)
//
// Bindings und Variablen (wrangler.jsonc, Secrets per `wrangler secret put` bzw. Cloudflare › Settings › Variables):
//   SUPPORT_MAIL        send_email-Binding (Email Routing). Ziel: SUPPORT_TO.
//   SUPPORT_TO          Zieladresse der Support-Mails, eine bestätigte Weiterleitungsadresse aus Email Routing (Variable).
//   MAIL_FROM           Absender, Standard noreply@emberwrath.com.
//   SITE_URL            Standard https://www.emberwrath.com (Links in Mails).
//   FORM_LIMITER        Rate-Limit-Binding (ratelimits), Schlüssel = IP. Fehlt es, gilt kein Limit.
//   SUPABASE_SERVICE_ROLE_KEY  Secret. Abonnenten und Anfragen werden in Supabase gespeichert (RLS ohne Policies).
//   RESEND_API_KEY      Secret. Versand der Bestätigungsmails (Email Routing kann nur an bestätigte eigene Adressen senden).
// Spam-Schutz: verstecktes Feld „website“, Mindestzeit zwischen Anzeigen und Absenden, Rate-Limit je IP.

const KINDS = { kontakt: 'Kontakt', fehler: 'Fehler', loeschen: 'Löschung' };
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,}$/i;
const MIN_FILL_MS = 2500;
const CONFIRM_TTL_H = 72;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const redirect = (to) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });
const site = (env) => (env.SITE_URL || 'https://www.emberwrath.com').replace(/\/$/, '');
const from = (env) => env.MAIL_FROM || 'noreply@emberwrath.com';
const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false; // Formulare kommen immer aus dem Browser
  if (origin === url.origin) return true;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

async function limited(request, env) {
  if (!env.FORM_LIMITER) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.FORM_LIMITER.limit({ key: ip });
  return !success;
}

async function readBody(request) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return null;
  const text = await request.text();
  if (text.length > 20000) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// Bots füllen das versteckte Feld aus oder senden sofort ab: still „ok“ antworten, nichts tun.
const isBot = (b) => clean(b.website, 200) !== '' || !(Number(b.t) >= MIN_FILL_MS);

// ------------------------------------------------------------------ Mail (MIME, UTF-8)
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

export function mime({ from: f, fromName, to, replyTo, subject, text }) {
  const head = [
    `From: ${fromName ? `${encWord(fromName)} ` : ''}<${f}>`,
    `To: <${to}>`,
    replyTo ? `Reply-To: <${replyTo}>` : null,
    `Subject: ${encWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${token()}@${f.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return `${head.join('\r\n')}\r\n\r\n${wrap76(b64(text))}`;
}

async function sendSupportMail(env, msg) {
  if (!env.SUPPORT_MAIL || !env.SUPPORT_TO) throw new Error('support mail not configured');
  const { EmailMessage } = await import('cloudflare:email');
  const raw = mime({ from: from(env), fromName: 'Emberwrath Website', to: env.SUPPORT_TO, ...msg });
  await env.SUPPORT_MAIL.send(new EmailMessage(from(env), env.SUPPORT_TO, raw));
}

async function sendResend(env, { to, subject, text, headers }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `Emberwrath <${from(env)}>`, to: [to], subject, text, headers }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
}

// ------------------------------------------------------------------ Supabase (REST mit service_role)
async function db(env, path, { method = 'GET', body, prefer } = {}) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`db ${r.status}`);
  return r.status === 204 ? null : r.json();
}

// ------------------------------------------------------------------ Support
async function support(request, env) {
  // Noch nicht eingerichtet (SUPPORT_TO fehlt): sauber ablehnen, die Seite verweist dann auf die E-Mail-Adresse.
  if (!env.SUPPORT_MAIL || !env.SUPPORT_TO) return json({ error: 'unavailable' }, 503);
  const b = await readBody(request);
  if (!b) return json({ error: 'bad_request' }, 400);
  if (isBot(b)) return json({ ok: true });
  const kind = KINDS[b.kind] ? b.kind : null;
  const email = oneLine(b.email, 254).toLowerCase();
  const name = oneLine(b.name, 100);
  const character = oneLine(b.character, 40);
  const device = oneLine(b.device, 200);
  const message = clean(b.message, 5000);
  const errors = {};
  if (!kind) errors.kind = 'kind';
  if (!EMAIL_RE.test(email)) errors.email = 'email';
  if (message.length < (kind === 'loeschen' ? 0 : 10)) errors.message = 'message';
  if (Object.keys(errors).length) return json({ error: 'invalid', fields: errors }, 422);
  if (await limited(request, env)) return json({ error: 'rate' }, 429);

  const label = KINDS[kind];
  const subject = `[${label}] ${name || email}${kind === 'fehler' && message ? ` – ${oneLine(message, 60)}` : ''}`;
  const lines = [
    `Art: ${label}`,
    `Name: ${name || '–'}`,
    `E-Mail: ${email}`,
    character ? `Charakter: ${character}` : null,
    device ? `Gerät/Browser: ${device}` : null,
    `Gesendet: ${new Date().toISOString()}`,
    '',
    kind === 'loeschen' ? 'Bitte Konto und alle Charaktere zu dieser E-Mail-Adresse löschen (Art. 17 DSGVO). Identität vor dem Löschen per Antwort an diese Adresse bestätigen.' : null,
    message ? `Nachricht:\n${message}` : null,
    '',
    '— Antworten geht direkt an den Absender (Reply-To).',
  ].filter((l) => l !== null);
  await sendSupportMail(env, { replyTo: email, subject, text: lines.join('\n') });
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try { await db(env, 'support_requests', { method: 'POST', body: { kind, email, name: name || null, character: character || null, device: device || null, message }, prefer: 'return=minimal' }); } catch { /* Mail ist raus, Ablage ist nur Zusatz */ }
  }
  return json({ ok: true });
}

// ------------------------------------------------------------------ Newsletter
const newsletterReady = (env) => Boolean(env.RESEND_API_KEY && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_URL);

async function subscribe(request, env) {
  if (!newsletterReady(env)) return json({ error: 'unavailable' }, 503);
  const b = await readBody(request);
  if (!b) return json({ error: 'bad_request' }, 400);
  if (isBot(b)) return json({ ok: true });
  const email = oneLine(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid', fields: { email: 'email' } }, 422);
  if (await limited(request, env)) return json({ error: 'rate' }, 429);

  const q = encodeURIComponent(email);
  const [row] = await db(env, `newsletter_subscribers?email=eq.${q}&select=status,unsubscribe_token`);
  // Bereits bestätigt: nichts verraten, nichts senden.
  if (row?.status === 'confirmed') return json({ ok: true });
  const confirm = token();
  const unsub = row?.unsubscribe_token ?? token();
  const fields = { status: 'pending', confirm_token: confirm, unsubscribe_token: unsub, requested_at: new Date().toISOString(), source: oneLine(b.source, 40) || 'website' };
  if (row) await db(env, `newsletter_subscribers?email=eq.${q}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
  else await db(env, 'newsletter_subscribers', { method: 'POST', body: { email, ...fields }, prefer: 'return=minimal' });

  const link = `${site(env)}/net/newsletter/confirm?token=${confirm}`;
  await sendResend(env, {
    to: email,
    subject: 'Bitte bestätige deinen Emberwrath-Newsletter',
    text: [
      'Hallo,',
      '',
      'du hast dich (oder jemand mit deiner Adresse) für den Newsletter von Emberwrath angemeldet.',
      'Bitte bestätige die Anmeldung mit diesem Link:',
      '',
      link,
      '',
      `Der Link gilt ${CONFIRM_TTL_H} Stunden. Wenn du dich nicht angemeldet hast, ignoriere diese Mail einfach, dann bekommst du nichts von uns.`,
      '',
      'Emberwrath',
      site(env),
    ].join('\n'),
  });
  return json({ ok: true });
}

async function confirm(env, url) {
  if (!newsletterReady(env)) return redirect(`${site(env)}/newsletter?s=fehler`);
  const t = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{48}$/.test(t)) return redirect(`${site(env)}/newsletter?s=ungueltig`);
  const since = new Date(Date.now() - CONFIRM_TTL_H * 3600e3).toISOString();
  const rows = await db(env, `newsletter_subscribers?confirm_token=eq.${t}&status=eq.pending&requested_at=gte.${encodeURIComponent(since)}`, {
    method: 'PATCH', body: { status: 'confirmed', confirmed_at: new Date().toISOString(), confirm_token: null }, prefer: 'return=representation',
  });
  return redirect(`${site(env)}/newsletter?s=${rows?.length ? 'bestaetigt' : 'ungueltig'}`);
}

async function unsubscribe(request, env, url) {
  const t = url.searchParams.get('token') ?? '';
  const ok = newsletterReady(env) && /^[0-9a-f]{48}$/.test(t);
  if (ok) {
    await db(env, `newsletter_subscribers?unsubscribe_token=eq.${t}&status=neq.unsubscribed`, {
      method: 'PATCH', body: { status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token: null }, prefer: 'return=minimal',
    });
  }
  if (request.method === 'POST') return json({ ok });
  return redirect(`${site(env)}/newsletter?s=${ok ? 'abgemeldet' : 'ungueltig'}`);
}

// Einstieg aus worker/index.js. Liefert null, wenn die Route nicht hierher gehört.
export async function handleForms(request, env, url, route) {
  const isPost = request.method === 'POST';
  if (route === '/newsletter/status') return json({ enabled: newsletterReady(env) });
  if (route === '/newsletter/confirm' && request.method === 'GET') return confirm(env, url);
  if (route === '/newsletter/unsubscribe' && (isPost || request.method === 'GET')) return unsubscribe(request, env, url);
  if (route === '/forms/support' || route === '/newsletter/subscribe') {
    if (!isPost) return json({ error: 'method' }, 405);
    if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
    try {
      return route === '/forms/support' ? await support(request, env) : await subscribe(request, env);
    } catch (e) {
      console.error('forms', route, e?.message);
      return json({ error: 'server' }, 502);
    }
  }
  return null;
}
