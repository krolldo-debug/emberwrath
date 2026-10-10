// Browsertest „Fehler melden“ (Esc-Menü, src/ui/bugReport.js, worker/bugreport.js) gegen `wrangler dev` + mockauth.mjs.
//   node worker/test/mockauth.mjs &
//   npx wrangler dev --var SUPABASE_URL:http://127.0.0.1:54399 --var SUPABASE_SERVICE_ROLE_KEY:sb_secret_test
//   SHOTS=<ordner> node worker/test/browser-bugreport.mjs
// Ohne RESEND_API_KEY und SUPPORT_TO landet die Meldung nur in der (nachgebauten) Tabelle bug_reports.
import { chromium, devices } from 'playwright';
const HOST = 'http://127.0.0.1:8787', APP = `${HOST}/spielen/`, M = 'http://127.0.0.1:54399', SHOTS = process.env.SHOTS;
const tok = async (sub) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub.slice(0, 8)}@x.de`)).json()).token;
const get = async (p) => (await fetch(`${M}${p}`)).json();
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const uid = (n) => `0000005${n}-0000-4000-8000-000000000000`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader'] });
const pageErrors = [];

async function player(sub, name, classId, ctxOpts, lang = 'de') {
  const token = await tok(sub);
  const ctx = await browser.newContext(ctxOpts);
  const user = { id: sub, email: `${sub.slice(0, 8)}@x.de`, created_at: new Date().toISOString(), user_metadata: { display_name: name } };
  await ctx.addInitScript(([s, l]) => {
    localStorage.setItem('emberwrath:online:session', s);
    localStorage.setItem('emberwrath:lang', l);
  }, [JSON.stringify({ access_token: token, refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600, user }), lang]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  await page.goto(APP);
  await page.waitForFunction(() => window.emberfall?.online);
  await page.evaluate(([user, name, classId]) => {
    const g = window.emberfall;
    g.login(g.online.sync.ensureLocalAccount(user));
    g.newGame({ character: { name, raceId: 'human', classId, appearance: { variant: 1 } } });
  }, [user, name, classId]);
  await page.waitForFunction(() => window.emberfall.scenes.currentId === 'play' && window.emberfall.net.client.status === 'online', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  // Einführungshinweise schließen, damit die Bilder das Menü zeigen
  await page.evaluate(() => document.querySelectorAll('.eg-close, .eg-hint button').forEach((b) => b.click()));
  return { page, ctx, token };
}
const openMenu = (p) => p.page.evaluate(() => window.emberfall.scenes.current.panels.open('menu'));
const shot = async (p, name) => { if (SHOTS) await p.page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await get('/test/reset');

// ---------------------------------------------------------------- PC
const A = await player(uid(1), 'Aria', 'mage', { locale: 'de-DE', viewport: { width: 1280, height: 720 } });
await A.page.evaluate(() => { console.error('Testfehler: Kiste lässt sich nicht öffnen'); setTimeout(() => { throw new Error('Testausnahme im Spiel'); }); });
await A.page.waitForTimeout(200);
await openMenu(A);
await A.page.waitForSelector('.menu-report-link');
const link = await A.page.$eval('.menu-report-link', (b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { h: r.height, w: r.width, font: cs.fontSize, border: cs.borderTopWidth, text: b.textContent }; });
ok(link.text === 'Fehler melden' && link.font === '12px' && link.border === '0px', `PC: kleiner Textknopf „Fehler melden“ im Menü (${JSON.stringify(link)})`);
await shot(A, 'pc-1-menue');
await A.page.click('.menu-report-link');
await A.page.waitForSelector('.menu-report.open');
ok(await A.page.$eval('.menu-title', (e) => e.textContent) === 'Fehler melden', 'PC: Seite „Fehler melden“ in derselben Tafel');
ok(await A.page.$eval('.menu-report-send', (b) => b.disabled), 'Senden gesperrt, solange nichts drinsteht');
ok(await A.page.evaluate(() => document.activeElement?.classList.contains('menu-report-text')), 'PC: Textfeld hat sofort den Fokus');
await A.page.keyboard.type('Die Truhe im Aschenwald geht nicht auf, wenn ich auf dem Reittier sitze. WASD');
const hx = await A.page.evaluate(() => Math.round(window.emberfall.scenes.current.world.hero.x));
await A.page.waitForTimeout(300);
ok(hx === await A.page.evaluate(() => Math.round(window.emberfall.scenes.current.world.hero.x)), 'Tippen bewegt den Helden nicht');
await shot(A, 'pc-2-formular');
await A.page.click('.menu-report-send');
await A.page.waitForFunction(() => /Danke/.test(document.querySelector('.menu-report-status')?.textContent ?? ''), null, { timeout: 8000 });
await shot(A, 'pc-3-danke');
const bugs = await get('/test/bugs');
const b = bugs[0] ?? {};
ok(bugs.length === 1 && b.user_id === uid(1) && /Truhe im Aschenwald/.test(b.message), 'Meldung kommt mit Konto und Text an');
ok(b.context?.zone && b.context?.version && b.context?.device && b.context?.browser && b.context?.screen && b.context?.net === 'online' && /,/.test(b.context?.pos ?? ''),
  `Angaben automatisch dabei: ${JSON.stringify({ ...b.context, errors: undefined })}`);
ok(b.context?.errors?.some((e) => /Kiste lässt sich nicht öffnen/.test(e)) && b.context.errors.some((e) => /Testausnahme/.test(e)), `letzte Fehler dabei: ${JSON.stringify(b.context?.errors)}`);
ok(/^data:image\/jpeg;base64,/.test(b.screenshot ?? '') && b.screenshot.length < 400_000, `Bild dabei (${Math.round((b.screenshot?.length ?? 0) / 1024)} KB als Text)`);
if (SHOTS && b.screenshot) (await import('node:fs')).writeFileSync(`${SHOTS}/gesendetes-bild.jpg`, Buffer.from(b.screenshot.split(',')[1], 'base64'));
await A.page.waitForTimeout(2000);
ok(await A.page.$eval('.menu-panel', (e) => e.dataset.page) === 'main', 'nach dem Dank zurück zum Menü');

// ---------------------------------------------------------------- Server: Schutz
const post = (body, { token = A.token, origin = HOST, ip = '' } = {}) => fetch(`${HOST}/net/bug`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) }, body: JSON.stringify(body),
});
ok((await post({ message: 'ohne Konto' }, { token: null })).status === 401, 'ohne Anmeldung abgewiesen (401)');
ok((await post({ message: 'fremde Seite' }, { origin: 'https://evil.example' })).status === 403, 'fremde Seite abgewiesen (403)');
ok((await post({ message: 'x' })).status === 422, 'zu kurze Beschreibung abgewiesen (422)');
ok((await post({ message: 'zu groß', shot: `data:image/jpeg;base64,${'A'.repeat(500_000)}` })).status === 413, 'zu großes Bild abgewiesen (413)');
const r2 = await post({ message: 'Bild mit Unsinn', shot: 'data:text/html;base64,PHNjcmlwdD4=', context: { zone: 'x'.repeat(500), evil: 'weg', errors: Array(40).fill('e') } });
const last = (await get('/test/bugs')).at(-1);
ok(r2.status === 200 && last.screenshot === null && last.context.zone.length === 200 && !('evil' in last.context) && last.context.errors.length === 15, 'falsches Bild verworfen, Angaben gekürzt');
// Je Minute höchstens 5 je Adresse (FORM_LIMITER)
const codes = [];
for (let i = 0; i < 7; i++) codes.push((await post({ message: `Meldung ${i}` }, { ip: '198.51.100.20' })).status);
ok(codes.at(-1) === 429, `Sperre je Minute greift: ${codes.join(',')}`);
// Je Konto höchstens 10 am Tag: Konto mit 10 Meldungen von heute
await get(`/test/seedbugs?uid=${uid(4)}&n=10`);
const day = await post({ message: 'die elfte heute' }, { token: await tok(uid(4)), ip: '198.51.100.21' });
ok(day.status === 429 && (await day.json()).error === 'day', 'Tagesgrenze je Konto greift (429 day)');
const fresh = await post({ message: 'anderes Konto, andere Adresse' }, { token: await tok(uid(5)), ip: '198.51.100.22' });
ok(fresh.status === 200, 'anderes Konto kann weiter melden');

// ---------------------------------------------------------------- Handy (quer) und Englisch
const L = await player(uid(2), 'Lio', 'ranger', { ...devices['iPhone 13 landscape'], locale: 'de-DE' });
await openMenu(L);
await L.page.waitForSelector('.menu-report-link');
const tl = await L.page.$eval('.menu-report-link', (b) => b.getBoundingClientRect().height);
ok(tl >= 43.5, `Handy: Touch-Ziel ${Math.round(tl)} px`);
await shot(L, 'handy-1-menue');
await L.page.tap('.menu-report-link');
await L.page.waitForSelector('.menu-report.open');
const fit = await L.page.evaluate(() => { const p = document.querySelector('.menu-panel'), r = p.getBoundingClientRect(), b = document.querySelector('.menu-report-send').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.left >= -1 && b.bottom <= r.bottom && p.scrollHeight <= p.clientHeight + 6; }); // +6: Eckbeschlag (.ef-panel::after) ragt etwas hinaus
ok(fit, 'Handy: Formular passt ohne Scrollen auf den Bildschirm, Senden sichtbar');
const sizes = await L.page.evaluate(() => ['.menu-report-send', '.menu-report-shot', '.menu-back', '.menu-close'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)));
ok(sizes.every((h) => h >= 44), `Handy: Knöpfe mindestens 44 px (${sizes.join(', ')})`);
await L.page.fill('.menu-report-text', 'Auf dem Handy ruckelt die Karte beim Zoomen.');
await shot(L, 'handy-2-formular');

const E = await player(uid(3), 'Ena', 'rogue', { locale: 'en-US', viewport: { width: 1280, height: 720 } }, 'en');
await openMenu(E);
await E.page.waitForSelector('.menu-report-link');
await E.page.waitForTimeout(300);
ok(await E.page.$eval('.menu-report-link', (b) => b.textContent) === 'Report a bug', 'Englisch: „Report a bug“');
await E.page.click('.menu-report-link');
await E.page.waitForTimeout(300);
const en = await E.page.evaluate(() => [document.querySelector('.menu-title').textContent, document.querySelector('.menu-report-text').placeholder, document.querySelector('.menu-report-shot').textContent]);
ok(en[0] === 'Report a bug' && /What happened/.test(en[1]) && en[2] === 'Attach a screenshot', `Englisch: ${JSON.stringify(en)}`);
await shot(E, 'pc-en-formular');

ok(pageErrors.every((e) => /Testausnahme/.test(e)), `keine weiteren Fehler: ${pageErrors.join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} FEHLER` : 'alles grün');
process.exit(fails ? 1 : 0);
