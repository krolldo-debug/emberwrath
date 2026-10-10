// Fehler melden (Esc-Menü › Fehler melden, ui/MenuPanel.js). Schickt Beschreibung, optional ein Bild vom Spiel und
// automatisch gesammelte Angaben an den Server (POST /net/bug, worker/bugreport.js). Angemeldet wird mit dem
// Supabase-Token wie beim Welt-Server.
//
// Ab dem Laden des Moduls merkt sich das Spiel die letzten Fehler im Browser (Skriptfehler, abgelehnte Promises,
// console.error), nur im Speicher. Sie gehen erst mit einer Meldung hinaus.

const ERRORS_MAX = 15, ERROR_LEN = 300;
const SHOT_W = 800, SHOT_QUALITY = 0.72;
const errors = [];

function remember(kind, v) {
  let s = '';
  try {
    if (v instanceof Error) s = `${v.name}: ${v.message}${v.stack ? ` @ ${String(v.stack).split('\n').slice(1, 3).map((l) => l.trim()).join(' ')}` : ''}`;
    else s = typeof v === 'string' ? v : JSON.stringify(v);
  } catch { s = String(v); }
  errors.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${s}`.slice(0, ERROR_LEN));
  if (errors.length > ERRORS_MAX) errors.shift();
}

let installed = false;
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => remember('Fehler', e.error ?? `${e.message} (${e.filename?.split('/').pop() ?? ''}:${e.lineno ?? ''})`));
  window.addEventListener('unhandledrejection', (e) => remember('Promise', e.reason));
  const orig = console.error.bind(console);
  console.error = (...args) => { remember('console', args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ')); orig(...args); };
}
installErrorLog();

// Gerät und Browser grob aus der Kennung (nur zur Einordnung, kein Fingerabdruck)
function deviceInfo() {
  const ua = navigator.userAgent ?? '';
  const os = /iPhone|iPad|iPod/.test(ua) ? `iOS ${(ua.match(/OS (\d+[_.]\d+)/)?.[1] ?? '').replace('_', '.')}`
    : /Android/.test(ua) ? `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ''}`
      : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unbekannt';
  const browser = ua.match(/(Edg|OPR|SamsungBrowser|Firefox|FxiOS|CriOS|Chrome|Version)\/([\d.]+)/);
  const name = { Edg: 'Edge', OPR: 'Opera', SamsungBrowser: 'Samsung Internet', FxiOS: 'Firefox', CriOS: 'Chrome', Version: 'Safari' }[browser?.[1]] ?? browser?.[1] ?? 'unbekannt';
  return { device: os.trim(), browser: `${name} ${browser?.[2]?.split('.')[0] ?? ''}`.trim() };
}

export function collectContext(game, session) {
  const build = globalThis.EMBERWRATH_BUILD ?? {};
  const def = session?.zone?.def;
  const slices = session?.state?.slices ?? {};
  const hero = session?.world?.hero;
  const net = game?.net?.client;
  const { device, browser } = deviceInfo();
  return {
    version: build.version ?? 'dev', commit: build.commit ?? '',
    zone: def?.id ?? '', zoneName: def?.name ?? '', world: net?.world ?? '',
    pos: hero ? `${Math.round(hero.x)},${Math.round(hero.y)}` : '',
    character: slices.character?.classId ?? '', level: slices.progress?.level ?? '',
    net: net?.status ?? '', fps: game?.fps ?? '',
    device, browser,
    screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio ?? 1}x`,
    touch: document.documentElement.classList.contains('ef-touch') ? 'ja' : 'nein',
    lang: document.documentElement.lang || navigator.language || '',
    time: new Date().toString().slice(0, 33),
    errors: [...errors],
  };
}

// Bild des Spielfelds (nur die Welt, ohne Menüs), verkleinert als JPEG. null, wenn es nicht geht.
export function captureShot(canvas) {
  try {
    if (!canvas?.width) return null;
    const scale = Math.min(1, SHOT_W / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * scale); c.height = Math.round(canvas.height * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', SHOT_QUALITY);
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch { return null; }
}

// → 'ok' | 'auth' | 'rate' | 'day' | 'fail'
export async function sendBugReport(game, { message, context, shot }) {
  let token = null;
  try { token = game?.online?.user ? await game.online.client.getAccessToken() : null; } catch { token = null; }
  if (!token) return 'auth';
  try {
    const r = await fetch('/net/bug', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, context, shot }),
    });
    if (r.ok) return 'ok';
    if (r.status === 401) return 'auth';
    if (r.status === 429) return (await r.json().catch(() => ({}))).error === 'day' ? 'day' : 'rate';
    return 'fail';
  } catch { return 'fail'; }
}
