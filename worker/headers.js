// Sicherheits-Header der Seiten: eine Quelle für dist/site/_headers (tools/build.mjs) und den Worker (worker/index.js).
// scriptHashes: 'sha256-…' der eingebetteten Skripte (die Website hat keine mehr; das Spiel liegt in spielen/spiel.<hash>.js).
// Ohne Hashes (Rückfall im Worker, der den Hash nicht kennt) bleibt 'unsafe-inline' für Skripte wie bisher.
export function pageCsp(supabaseUrl, scriptHashes = null) {
  const connect = supabaseUrl ? `'self' ${supabaseUrl}` : "'self'";
  const script = scriptHashes ? ["'self'", ...scriptHashes.map((h) => `'${h}'`)].join(' ') : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    // Inline-Styles bleiben erlaubt: style="" auf den Seiten und el.setAttribute('style', …) im Spiel
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export function pageHeaders(supabaseUrl, scriptHashes = null) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': pageCsp(supabaseUrl, scriptHashes),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}
