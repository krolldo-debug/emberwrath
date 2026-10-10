// Browsertest der CrazyGames-Fassung (docs/CRAZYGAMES.md), ohne Netz: Die Lade-ZIP läuft in einem iframe auf
// https://emberwrath.game-files.crazygames.com, die Seite drumherum auf https://www.crazygames.com. Alles andere
// (CrazyGames-SDK, www.emberwrath.com mit Spielcode und /net/cg/session, Supabase) wird im Browser nachgestellt.
// Vorher: npm run build. Aufruf: node tools/test-crazygames.mjs [ausgabeordner-für-bilder]
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = resolve(process.argv[2] ?? resolve(root, 'dist/crazygames/test'));
mkdirSync(shots, { recursive: true });
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const { chromium } = pw;

// ZIP lesen (nur deflate, wie tools/build-crazygames.mjs schreibt)
function unzip(buf) {
  const files = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), size = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString();
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    files[name] = method === 8 ? inflateRawSync(data) : data;
    p += 30 + nlen + xlen + size;
  }
  return files;
}
const zip = unzip(readFileSync(resolve(root, 'dist/crazygames/emberwrath-crazygames.zip')));
const gameJs = readFileSync(resolve(root, 'dist/site/crazygames/game.js'));
const gameCss = readFileSync(resolve(root, 'dist/site/crazygames/game.css'));

const SB = 'https://mgjhllqnelqbdqfvczls.supabase.co';
const GAME = 'https://emberwrath.game-files.crazygames.com';
let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Nachgestellte Dienste (gemeinsam für alle Seiten)
const sessionCalls = [];
const accounts = new Map(); // email -> { id, email, password, user_metadata }
const chars = new Map(); // userId -> Map(id -> row)
const wsUrls = [];
let n = 0;
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => `${b64u({ alg: 'HS256' })}.${b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`;
const userOf = (req) => { const t = (req.headers().authorization ?? '').replace('Bearer ', ''); return [...accounts.values()].find((u) => jwt(u) === t || t.endsWith(`.${u.id}`)) ?? null; };
const pub = (u) => ({ id: u.id, email: u.email, user_metadata: u.user_metadata, app_metadata: { provider: 'email', providers: ['email'] }, created_at: new Date().toISOString() });
const tokenFor = (u) => ({ access_token: `${b64u({ alg: 'HS256' })}.${b64u({ sub: u.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${u.id}`, refresh_token: `r-${u.id}`, expires_in: 3600, user: pub(u) });

// SDK-Nachbau: angemeldeter Nutzer über ?cguser=Name an der Spieladresse; showAuthPrompt meldet „Bob“ an.
const SDK_STUB = `(function () {
  var name = new URLSearchParams(location.search).get('cguser');
  var listeners = [];
  window.__cg = { events: [] };
  var user = name ? { username: name, profilePictureUrl: '' } : null;
  var tok = function () { return 'h.' + btoa(JSON.stringify({ userId: 'id-' + user.username, username: user.username })).replace(/=+$/, '') + '.s'; };
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: function () { return Promise.resolve(); },
    game: { gameplayStart: function () { window.__cg.events.push('start'); }, gameplayStop: function () { window.__cg.events.push('stop'); }, loadingStop: function () {} },
    user: {
      isUserAccountAvailable: true,
      getUser: function () { return Promise.resolve(user); },
      getUserToken: function () { return user ? Promise.resolve(tok()) : Promise.reject(new Error('userNotAuthenticated')); },
      showAuthPrompt: function () { user = { username: 'Bob', profilePictureUrl: '' }; listeners.forEach(function (f) { f(user); }); return Promise.resolve(user); },
      addAuthListener: function (f) { listeners.push(f); },
    },
  } };
})();`;

async function setupRoutes(ctx) {
  await ctx.route('https://www.crazygames.com/**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="margin:0;background:#111">
    <iframe id="g" src="${GAME}/index.html${new URL(r.request().url()).search}" style="border:0;width:100vw;height:100vh" allow="autoplay; fullscreen"></iframe></body></html>` }));
  await ctx.route(`${GAME}/**`, (r) => {
    const name = new URL(r.request().url()).pathname.slice(1);
    const f = zip[name];
    return f ? r.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : 'text/html', body: f }) : r.fulfill({ status: 404, body: 'nf' });
  });
  await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await ctx.route('https://www.emberwrath.com/**', async (r) => {
    const req = r.request(), url = new URL(req.url());
    const cors = { 'access-control-allow-origin': req.headers().origin ?? '*' };
    if (url.pathname === '/crazygames/game.js') return r.fulfill({ contentType: 'text/javascript', body: gameJs });
    if (url.pathname === '/crazygames/game.css') return r.fulfill({ contentType: 'text/css', body: gameCss });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
    if (url.pathname === '/net/cg/session') {
      const b = JSON.parse(req.postData());
      sessionCalls.push({ ...b, origin: req.headers().origin });
      const cgId = b.cg ? JSON.parse(Buffer.from(b.cg.split('.')[1], 'base64').toString()).userId : null;
      const email = cgId ? `cg-${cgId}@players.emberwrath.com` : `guest-${b.guest.slice(0, 8)}@players.emberwrath.com`;
      let linked = false;
      if (cgId && b.link && !accounts.has(email)) {
        const g = [...accounts.values()].find((u) => b.link.endsWith(`.${u.id}`));
        if (g) { accounts.delete(g.email); g.email = email; g.user_metadata = { ...g.user_metadata, cg_user_id: cgId, display_name: cgId.slice(3) }; accounts.set(email, g); linked = true; }
      }
      if (!accounts.has(email)) accounts.set(email, { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, email, password: 'pw', user_metadata: { platform: 'crazygames', ...(cgId ? { cg_user_id: cgId, display_name: cgId.slice(3) } : { display_name: 'Gast' }) } });
      return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ email, password: 'pw', kind: cgId ? 'cg' : 'guest', linked }) });
    }
    if (url.pathname === '/net/worlds') return r.fulfill({ contentType: 'application/json', headers: cors, body: '{"worlds":[]}' });
    return r.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  await ctx.routeWebSocket(/wss:\/\/www\.emberwrath\.com\/net\/.*/, (ws) => { wsUrls.push(ws.url()); ws.close(); });
  await ctx.route(`${SB}/**`, async (r) => {
    const req = r.request(), url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const send = (d, s = 200) => r.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(d) });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const b = JSON.parse(req.postData());
      const u = accounts.get(b.email);
      return u && u.password === b.password ? send(tokenFor(u)) : send({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const b = JSON.parse(req.postData());
      const u = [...accounts.values()].find((x) => `r-${x.id}` === b.refresh_token);
      return u ? send(tokenFor(u)) : send({ error_code: 'refresh_token_not_found' }, 400);
    }
    if (url.pathname === '/auth/v1/settings') return send({ external: { email: true, google: true } });
    if (url.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, headers: cors });
    const u = userOf(req);
    if (url.pathname === '/auth/v1/user') {
      if (!u) return send({ msg: 'bad' }, 401);
      if (req.method() === 'PUT') { const b = JSON.parse(req.postData()); u.user_metadata = { ...u.user_metadata, ...(b.data ?? {}) }; }
      return send(pub(u));
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return send(url.pathname.endsWith('is_admin') ? false : []);
    if (url.pathname === '/rest/v1/characters') {
      if (!u) return send({ msg: 'jwt' }, 401);
      const mine = chars.get(u.id) ?? new Map(); chars.set(u.id, mine);
      if (req.method() === 'POST') { for (const row of JSON.parse(req.postData())) mine.set(row.id, row); return send(JSON.parse(req.postData()).map((x) => ({ id: x.id })), 201); }
      if (req.method() === 'DELETE') { mine.delete((url.searchParams.get('id') ?? '').replace('eq.', '')); return r.fulfill({ status: 204, headers: cors }); }
      const ids = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')?.[1]?.split(',').map((s) => decodeURIComponent(s.replace(/"/g, '')));
      return send([...mine.values()].filter((x) => !ids || ids.includes(x.id)));
    }
    return send([]);
  });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
async function open({ viewport = { width: 1280, height: 720 }, locale = 'en-US', mobile = false, query = '', ctx = null } = {}) {
  ctx ??= await browser.newContext({ viewport, locale, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket/.test(m.text())) errs.push(m.text()); });
  await page.goto(`https://www.crazygames.com/game/emberwrath${query}`);
  const f = page.frameLocator('#g');
  await f.locator('.cg-title').waitFor({ timeout: 20000 });
  return { ctx, page, f, frame: () => page.frames().find((x) => x.url().startsWith(GAME)) };
}
const scene = (fr) => fr().evaluate(() => document.getElementById('ui')?.dataset.scene ?? document.querySelector('[data-scene]')?.dataset.scene);
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await wait(150); } return false; };

// 1) Erster Start als Gast, Englisch (Browser en-US)
const a = await open();
const titleText = await a.f.locator('.cg-title').innerText();
ok(/Play/.test(titleText) && !/Sign in|Log in|Create account|Google|E-mail/i.test(titleText), `Titel: „Play“, keine Anmeldung/Registrierung (${titleText.replace(/\s+/g, ' ').slice(0, 120)})`);
ok(/By playing you agree|Terms of Use/.test(titleText), 'Hinweis auf Nutzungsbedingungen und Datenschutz sichtbar (englisch)');
const links = await a.f.locator('.cg-legal a').evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.target]));
ok(links.length === 2 && links[0][0] === 'https://www.emberwrath.com/en/terms' && links[1][0] === 'https://www.emberwrath.com/en/privacy' && links.every((l) => l[1] === '_blank'), `Rechtstexte als volle englische Adressen im neuen Tab: ${links.map((l) => l[0]).join(', ')}`);
await a.page.screenshot({ path: `${shots}/1-titel-desktop.png` });
ok(sessionCalls.length === 0, 'vor „Play“ wird kein Konto angelegt');
await a.f.locator('.acc-play').click();
ok(await until(async () => (await scene(a.frame)) === 'characterCreate'), 'neuer Spieler landet direkt bei der Heldenerschaffung');
ok(sessionCalls.length === 1 && !sessionCalls[0].cg && /^[A-Za-z0-9_-]{32}$/.test(sessionCalls[0].guest) && sessionCalls[0].origin === GAME, `Gastkonto über /net/cg/session von ${sessionCalls[0]?.origin}`);
const guest = [...accounts.values()][0];
ok(guest?.user_metadata?.terms_version, `Zustimmung gespeichert (terms_version ${guest?.user_metadata?.terms_version})`);
await a.page.screenshot({ path: `${shots}/2-heldenerschaffung.png` });
await a.f.locator('.acc-name-input').fill('Glutfee');
await a.f.locator('.acc-start').click();
ok(await until(async () => (await scene(a.frame)) === 'play', 30000), 'Spielwelt startet');
await wait(2500);
ok((await a.frame().evaluate(() => window.__cg.events)).includes('start'), 'gameplayStart an CrazyGames gemeldet');
ok(await until(async () => wsUrls.some((u) => u.startsWith('wss://www.emberwrath.com/net/ws?')), 8000), `Welt-Server über wss://www.emberwrath.com (${wsUrls[0]?.slice(0, 60) ?? 'keine Verbindung'})`);
await a.page.screenshot({ path: `${shots}/3-spielwelt.png` });
const hudShop = await a.f.locator('.ef-hud .shop, .menu-shop').count();
await a.page.keyboard.press('Escape');
await wait(600);
const menuText = await a.f.locator('#ui').innerText();
ok(!/Shop|Fullscreen|Full screen/i.test(menuText) && hudShop === 0, 'Menü ohne Shop und ohne eigenen Vollbild-Knopf');
await a.page.screenshot({ path: `${shots}/4-menue.png` });
await a.f.getByText('Title Screen', { exact: true }).first().click().catch(() => {});
ok(await until(async () => (await scene(a.frame)) === 'title'), 'zurück zum Titel');
ok(await until(async () => (await a.f.locator('.cg-title').innerText()).includes('Glutfee')), 'Titel zeigt den Helden');
ok((await a.frame().evaluate(() => window.__cg.events)).includes('stop'), 'gameplayStop beim Verlassen gemeldet');
await until(async () => (chars.get(guest.id)?.size ?? 0) > 0, 5000);
ok((chars.get(guest.id)?.size ?? 0) === 1, 'Held in der Cloud gespeichert');

// 2) Konto-Seite: Anmelden bei CrazyGames übernimmt das Gastkonto
await a.f.locator('.cg-title .acc-textlink').click();
ok(await until(async () => (await scene(a.frame)) === 'login'), 'Konto-Seite öffnet');
const accText = await a.f.locator('#ui').innerText();
ok(/Guest/.test(accText) && /CrazyGames/.test(accText) && !/password|Google/i.test(accText), 'Konto-Seite: Gast, Anmelden bei CrazyGames, kein Passwort/Google');
await a.page.screenshot({ path: `${shots}/5-konto-gast.png` });
await a.f.getByRole('button', { name: 'Sign in with CrazyGames' }).click();
ok(await until(async () => sessionCalls.some((c) => c.cg && c.link)), 'Anmeldung bei CrazyGames schickt Gast-Token zum Übernehmen');
ok(await until(async () => (await a.f.locator('#ui').innerText()).includes('Bob')), 'Konto heißt jetzt wie das CrazyGames-Konto');
ok(accounts.get('cg-id-Bob@players.emberwrath.com')?.id === guest.id, 'gleiches Konto (Helden bleiben)');
await a.page.screenshot({ path: `${shots}/6-konto-crazygames.png` });
await a.ctx.close();

// 3) Anderes Gerät, bei CrazyGames als Bob angemeldet: gleiches Konto, Held da
const before = sessionCalls.length;
const b = await open({ query: '?cguser=Bob' });
await b.f.locator('.acc-play').click();
ok(await until(async () => (await scene(b.frame)) === 'characters'), 'Bob sieht seine Heldenauswahl');
ok(sessionCalls.length === before + 1 && sessionCalls.at(-1).cg && !sessionCalls.at(-1).link, 'Anmeldung mit CrazyGames-Token');
ok((await b.f.locator('#ui').innerText()).includes('Glutfee'), 'Held aus der Cloud geladen');
await b.page.screenshot({ path: `${shots}/7-anderes-geraet.png` });
await b.ctx.close();

// 4) Handy quer und Deutsch
const c = await open({ viewport: { width: 844, height: 390 }, mobile: true, locale: 'de-DE' });
const cText = await c.f.locator('.cg-title').innerText();
ok(/Spielen/.test(cText) && /Mit „Spielen“/.test(cText), 'Deutsch: „Spielen“ und Hinweis');
const cLinks = await c.f.locator('.cg-legal a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
ok(cLinks[0] === 'https://www.emberwrath.com/nutzungsbedingungen' && cLinks[1] === 'https://www.emberwrath.com/datenschutz', 'deutsche Rechtstexte verlinkt');
const fits = await c.frame().evaluate(() => { const r = document.querySelector('.cg-legal').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth; });
ok(fits, 'Hinweis passt auf das Handy (quer)');
await c.page.screenshot({ path: `${shots}/8-handy-quer.png` });
await c.f.locator('.acc-play').tap();
ok(await until(async () => (await scene(c.frame)) === 'characterCreate'), 'Handy: Spielen per Tippen startet');
await c.page.screenshot({ path: `${shots}/9-handy-erschaffung.png` });
await c.ctx.close();

// 5) Server nicht erreichbar: Meldung mit „Erneut versuchen“
const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await setupRoutes(dctx);
await dctx.route('https://www.emberwrath.com/crazygames/game.js', (r) => r.abort());
const dp = await dctx.newPage();
await dp.goto('https://www.crazygames.com/game/emberwrath');
const df = dp.frameLocator('#g');
ok(await until(async () => /Try again/.test(await df.locator('body').innerText())), 'ohne Server: verständliche Meldung mit „Try again“');
await dp.screenshot({ path: `${shots}/10-server-weg.png` });
await dctx.close();

const realErrs = errs.filter((e) => !/net::ERR|WebSocket|Failed to fetch/.test(e));
ok(realErrs.length === 0, `keine Skriptfehler${realErrs.length ? `: ${realErrs.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
console.log(fails ? `\n${fails} Fehler` : '\nalles grün', `· Bilder: ${shots}`);
process.exit(fails ? 1 : 0);
