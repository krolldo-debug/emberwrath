// Fehlermeldungen aus dem Spiel (Esc-Menü › Fehler melden, src/ui/bugReport.js).
//   POST /net/bug   Authorization: Bearer <Supabase-Zugriffstoken>
//                   { message, context: { version, zone, … , errors: [] }, shot: 'data:image/jpeg;base64,…' | null }
//   → { ok: true } | 401 auth | 422 invalid | 429 { error: 'rate' | 'day' } | 503 unavailable
//
// Zustellung wie das Support-Formular der Website (worker/forms.js): Mail über das send_email-Binding SUPPORT_MAIL an
// SUPPORT_TO. Ist SUPPORT_TO noch nicht gesetzt, geht die Mail über Resend (RESEND_API_KEY, wie der Newsletter) an
// BUG_TO (Standard support@emberwrath.com, Email Routing leitet weiter). Das Bild hängt als Datei an.
// Zusätzlich landet jede Meldung in Supabase (bug_reports, Migration 20261010120000_fehlermeldungen.sql), sobald
// SUPABASE_SERVICE_ROLE_KEY gesetzt und die Migration ausgeführt ist.
//
// Spam-Schutz: nur angemeldete Spieler (Token wie beim Welt-Server), FORM_LIMITER je Konto und je Adresse
// (5 je Minute), mit Tabelle zusätzlich höchstens DAY_PER_USER Meldungen je Konto und Tag und höchstens
// DAY_MAILS Mails am Tag insgesamt (danach nur noch Ablage, damit das Mail-Kontingent für Newsletter und Support bleibt).
import { verifyToken } from './auth.js';
import { mime } from './forms.js';

const MESSAGE_MIN = 3, MESSAGE_MAX = 2000;
const SHOT_MAX = 400_000; // Zeichen der data-URL (~290 KB Bild); der Client schickt meist 40–120 KB
const BODY_MAX = SHOT_MAX + 30_000;
const DAY_PER_USER = 10, DAY_MAILS = 150;
const SHOT_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
// Automatisch mitgeschickte Angaben (src/ui/bugReport.js collectContext); alles andere fällt weg.
const CONTEXT_KEYS = ['version', 'commit', 'zone', 'zoneName', 'world', 'pos', 'character', 'level', 'net', 'device', 'browser', 'screen', 'lang', 'touch', 'fps', 'time', 'url'];
const ERRORS_MAX = 15, ERROR_LEN = 300;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');

function originOk(request, url, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false; // kommt immer aus dem Browser
  if (origin === url.origin) return true;
  return String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

async function limited(env, key) {
  if (!env.FORM_LIMITER) return false;
  const { success } = await env.FORM_LIMITER.limit({ key }).catch(() => ({ success: true }));
  return !success;
}

export function cleanContext(c) {
  const src = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  const out = {};
  for (const k of CONTEXT_KEYS) if (src[k] != null && src[k] !== '') out[k] = oneLine(src[k], 200);
  out.errors = (Array.isArray(src.errors) ? src.errors : []).slice(-ERRORS_MAX).map((e) => oneLine(e, ERROR_LEN)).filter(Boolean);
  return out;
}

// ------------------------------------------------------------------ Supabase (service_role, wie worker/forms.js)
const dbReady = (env) => Boolean(String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() && env.SUPABASE_URL);
async function db(env, path, { method = 'GET', body } = {}) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const r = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
      'content-type': 'application/json', ...(method === 'GET' ? {} : { prefer: 'return=minimal' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`db ${r.status}`);
  return method === 'GET' ? r.json() : null;
}

// Meldungen der letzten 24 Stunden: { user, all } oder null (Tabelle fehlt, Störung)
async function countToday(env, uid) {
  if (!dbReady(env)) return null;
  const since = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
  try {
    const [mine, all] = await Promise.all([
      db(env, `bug_reports?user_id=eq.${uid}&created_at=gte.${since}&select=id&limit=${DAY_PER_USER}`),
      db(env, `bug_reports?created_at=gte.${since}&select=id&limit=${DAY_MAILS}`),
    ]);
    return { user: mine.length, all: all.length };
  } catch { return null; }
}

// ------------------------------------------------------------------ Mail
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

// Mail mit Bild als Anhang (multipart/mixed); ohne Bild die einfache Mail aus worker/forms.js
export function mimeWithImage(msg, shot) {
  const plain = mime(msg);
  if (!shot) return plain;
  const [, type, data] = shot.match(/^data:image\/(\w+);base64,(.*)$/);
  const boundary = `ew${crypto.randomUUID().replace(/-/g, '')}`;
  const [head, body] = plain.split('\r\n\r\n');
  const headers = head.split('\r\n').filter((l) => !/^Content-(Type|Transfer-Encoding):/i.test(l));
  return [
    ...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body.trimEnd(),
    `--${boundary}`, `Content-Type: image/${type}; name="spiel.${type === 'jpeg' ? 'jpg' : type}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="spiel.${type === 'jpeg' ? 'jpg' : type}"`, '', wrap76(data).trimEnd(),
    `--${boundary}--`, '',
  ].join('\r\n');
}

const mailFrom = (env) => env.MAIL_FROM || 'noreply@emberwrath.com';
const canMail = (env) => Boolean((env.SUPPORT_MAIL && env.SUPPORT_TO) || env.RESEND_API_KEY);

async function sendMail(env, { replyTo, subject, text, shot }) {
  if (env.SUPPORT_MAIL && env.SUPPORT_TO) {
    const { EmailMessage } = await import('cloudflare:email');
    const raw = mimeWithImage({ from: mailFrom(env), fromName: 'Emberwrath Spiel', to: env.SUPPORT_TO, replyTo, subject, text }, shot);
    await env.SUPPORT_MAIL.send(new EmailMessage(mailFrom(env), env.SUPPORT_TO, raw));
    return;
  }
  const to = String(env.BUG_TO || 'support@emberwrath.com');
  const m = shot?.match(/^data:image\/(\w+);base64,(.*)$/);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `Emberwrath Spiel <${mailFrom(env)}>`, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}),
      ...(m ? { attachments: [{ filename: `spiel.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, content: m[2] }] } : {}),
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
}

function mailText(user, message, ctx, hasShot) {
  const line = (label, v) => (v ? `${label}: ${v}` : null);
  return [
    line('Konto', `${user.email || '–'} (${user.uid})`),
    line('Charakter', ctx.character ? `${ctx.character}${ctx.level ? `, Stufe ${ctx.level}` : ''}` : ''),
    line('Gebiet', ctx.zone ? `${ctx.zoneName || ctx.zone} (${ctx.zone})${ctx.world ? `, Welt ${ctx.world}` : ''}${ctx.pos ? `, Position ${ctx.pos}` : ''}` : ''),
    line('Version', [ctx.version, ctx.commit].filter(Boolean).join(' · ')),
    line('Verbindung', ctx.net),
    line('Gerät', [ctx.device, ctx.touch === 'ja' ? 'Touch' : '', ctx.screen].filter(Boolean).join(' · ')),
    line('Browser', ctx.browser),
    line('Sprache', ctx.lang),
    line('Bilder/s', ctx.fps),
    line('Zeit beim Spieler', ctx.time),
    line('Gesendet', new Date().toISOString()),
    '',
    'Beschreibung:',
    message,
    '',
    ctx.errors.length ? `Letzte Fehler im Browser (${ctx.errors.length}):\n${ctx.errors.map((e) => `- ${e}`).join('\n')}` : 'Keine Fehler im Browser aufgezeichnet.',
    '',
    hasShot ? 'Bild vom Spiel im Anhang.' : 'Ohne Bild.',
    '— Antworten geht direkt an den Spieler (Reply-To).',
  ].filter((l) => l !== null).join('\n');
}

// ------------------------------------------------------------------ Einstieg (worker/index.js)
export async function handleBugReport(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!originOk(request, url, env)) return json({ error: 'origin' }, 403);
  if (!canMail(env) && !dbReady(env)) return json({ error: 'unavailable' }, 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env, `bugip:${ip}`)) return json({ error: 'rate' }, 429);
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'bad_request' }, 400);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return json({ error: 'too_large' }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = token ? await verifyToken(token, { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }) : null;
  if (!user) return json({ error: 'auth' }, 401);
  if (await limited(env, `bug:${user.uid}`)) return json({ error: 'rate' }, 429);

  const message = clean(b?.message, MESSAGE_MAX);
  if (message.length < MESSAGE_MIN) return json({ error: 'invalid', fields: { message: 'message' } }, 422);
  const shot = typeof b?.shot === 'string' && b.shot.length <= SHOT_MAX && SHOT_RE.test(b.shot) ? b.shot : null;
  const ctx = cleanContext(b?.context);

  const today = await countToday(env, user.uid);
  if (today && today.user >= DAY_PER_USER) return json({ error: 'day' }, 429);
  const mail = canMail(env) && (!today || today.all < DAY_MAILS);

  let stored = false, mailed = false;
  if (dbReady(env)) {
    try {
      await db(env, 'bug_reports', { method: 'POST', body: { user_id: user.uid, email: user.email ?? '', message, context: ctx, screenshot: shot } });
      stored = true;
    } catch (e) { console.error('bug store', e?.message); }
  }
  if (mail) {
    const subject = `[Fehler im Spiel] ${oneLine(message, 70)}`;
    try { await sendMail(env, { replyTo: user.email || null, subject, text: mailText(user, message, ctx, !!shot), shot }); mailed = true; } catch (e) { console.error('bug mail', e?.message); }
  }
  if (!stored && !mailed) return json({ error: 'server' }, 502);
  return json({ ok: true });
}
