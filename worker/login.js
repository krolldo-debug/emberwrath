// Anmeldung über den eigenen Server (/net/auth/*). Hier wird nichts geprüft oder gespeichert.
// /net/auth/apple: Rückkehr von „Weiter mit Apple“ auf der Website (Return URL der Services-ID). Apple schickt das Ergebnis
// per POST (response_mode=form_post, nötig für Name und E-Mail). Weiterleitung ins Spiel mit dem ID-Token im Anker (der
// geht nie an einen Server und in kein Protokoll); das Spiel prüft state und tauscht das Token mit seiner Nonce bei
// Supabase (src/online/AuthClient.js, signInWithAppleWeb).
const GAME = '/spielen/';
const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const back = (params) => new Response(null, {
  status: 303,
  headers: { location: `${GAME}#${params}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

// Apple nennt den Namen nur bei der ersten Anmeldung: user = {"name":{"firstName":…,"lastName":…},"email":…}
function nameOf(raw) {
  try {
    const n = JSON.parse(String(raw ?? '')).name ?? {};
    return [n.firstName, n.lastName].filter((x) => typeof x === 'string').join(' ').trim().slice(0, 24);
  } catch { return ''; }
}

export async function handleAppleLogin(request) {
  if (request.method !== 'POST') return back(new URLSearchParams({ apple_error: 'failed' }));
  let form = null;
  try { form = await request.formData(); } catch { /* leer */ }
  const token = form?.get('id_token'), state = form?.get('state'), error = form?.get('error');
  const out = new URLSearchParams();
  if (typeof token === 'string' && token.length < 8192 && TOKEN_RE.test(token) && typeof state === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(state)) {
    out.set('apple_id_token', token);
    out.set('state', state);
    const name = nameOf(form.get('user'));
    if (name) out.set('name', name);
  } else {
    out.set('apple_error', typeof error === 'string' && /^[a-z_]{1,40}$/.test(error) ? error : 'failed');
  }
  return back(out);
}

// Start der Google-Anmeldung aus der iOS-App (/net/auth/start?provider=google&…): leitet unverändert zu Supabase weiter.
// Nur damit iOS im Hinweis „Emberwrath möchte … zum Anmelden verwenden“ emberwrath.com nennt statt supabase.co.
// Ziel ist fest das eigene Supabase-Projekt, also keine offene Weiterleitung.
export function handleAuthStart(url, supabaseUrl) {
  if (url.searchParams.get('provider') !== 'google') return new Response('not found', { status: 404 });
  return new Response(null, { status: 302, headers: { location: `${supabaseUrl}/auth/v1/authorize${url.search}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
