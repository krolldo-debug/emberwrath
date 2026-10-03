// Browsertest Chat-Moderation (Name anklicken → Melden/Ignorieren, Spielerliste, Verwaltungsansicht) gegen `wrangler dev`.
// Start wie worker/test/moderation.mjs; SHOTS=<ordner> speichert Bildschirmfotos.
import { chromium, devices } from 'playwright';
const APP = 'http://127.0.0.1:8787/spielen/', M = 'http://127.0.0.1:54399', SHOTS = process.env.SHOTS;
const uid = (n) => `0000001${n}-0000-4000-8000-000000000000`;
const tok = async (sub) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub.slice(0, 8)}@x.de`)).json()).token;
const get = async (p) => (await fetch(`${M}${p}`)).json();
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
async function player(sub, name, raceId, classId, ctxOpts = { viewport: { width: 1280, height: 720 } }) {
  const token = await tok(sub);
  const ctx = await browser.newContext(ctxOpts);
  const user = { id: sub, email: `${sub}@x.de`, created_at: new Date().toISOString(), user_metadata: { display_name: name } };
  await ctx.addInitScript(([s]) => { localStorage.setItem('emberwrath:online:session', s); }, [JSON.stringify({ access_token: token, refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600, user })]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/supabase|Failed to load resource|net::ERR/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.goto(APP);
  await page.waitForFunction(() => window.emberfall?.online);
  await page.evaluate(([user, name, raceId, classId]) => {
    const g = window.emberfall;
    g.login(g.online.sync.ensureLocalAccount(user));
    g.newGame({ character: { name, raceId, classId, appearance: { variant: 1 } } });
  }, [user, name, raceId, classId]);
  await page.waitForFunction(() => window.emberfall.scenes.currentId === 'play' && window.emberfall.net.client.status === 'online', null, { timeout: 15000 });
  await page.waitForTimeout(500);
  return { page, ctx, name };
}
const say = async (p, text) => { await p.page.bringToFront(); await p.page.keyboard.press('Enter'); await p.page.keyboard.type(text); await p.page.keyboard.press('Enter'); };
const shot = (p, f) => SHOTS && p.page.screenshot({ path: `${SHOTS}/${f}` });

await get('/test/reset');
const A = await player(uid(1), 'Aria', 'elf', 'mage');
const B = await player(uid(2), 'Borin', 'dwarf', 'warrior');
await B.page.waitForTimeout(800);
await say(B, 'Du Hurensohn, kauf Gold auf www.billig-gold.ru');
await A.page.waitForTimeout(500);
const logA = await A.page.locator('.net-chat-log').innerText();
ok(!/huren/i.test(logA) && logA.includes('[Link entfernt]'), 'A sieht gefilterte Nachricht: ' + logA.split('\n').at(-1));

// Chat öffnen, Namen anklicken → Menü
await A.page.bringToFront();
await A.page.keyboard.press('Enter');
await A.page.locator('button.net-name', { hasText: 'Borin' }).last().click();
const menu = A.page.locator('.net-pmenu');
ok(await menu.isVisible() && (await menu.innerText()).includes('Melden'), 'Menü am Namen: Melden, Ignorieren');
await shot(A, 'mod-menu.png');
await menu.getByText('Melden …').click();
const dlg = A.page.locator('.net-report');
ok(await dlg.isVisible(), 'Meldeformular offen');
await dlg.getByText('Meldung senden').click();
ok((await dlg.locator('.net-report-err').innerText()).includes('Grund'), 'ohne Grund: Hinweis');
await dlg.getByText('Beleidigung oder Belästigung').click();
await dlg.locator('textarea').fill('Beleidigt und wirbt für Goldverkauf.');
await dlg.getByText('Meldung senden').click();
ok((await dlg.locator('.net-report-err').innerText()).includes('bestätige'), 'ohne Bestätigung: Hinweis');
// Tippen im Formular bewegt den Helden nicht
const h0 = await A.page.evaluate(() => window.emberfall.scenes.current.world.hero.x);
await dlg.locator('textarea').press('d');
await A.page.waitForTimeout(200);
ok(h0 === await A.page.evaluate(() => window.emberfall.scenes.current.world.hero.x), 'Tippen im Formular steuert nicht den Helden');
await dlg.locator('textarea').fill('Beleidigt und wirbt für Goldverkauf.');
await dlg.locator('.net-report-faith input').check();
await shot(A, 'mod-report.png');
await dlg.getByText('Meldung senden').click();
await A.page.waitForTimeout(600);
ok(!(await dlg.count()), 'Formular geschlossen');
ok((await A.page.locator('.net-chat-log').innerText()).includes('Deine Meldung zu Borin ist eingegangen'), 'Eingangsbestätigung im Chat');
const rep = (await get('/test/reports')).at(-1);
ok(rep?.reported_id === uid(2) && rep.reason === 'beleidigung' && rep.note.includes('Goldverkauf') && rep.messages[0]?.text.includes('Hurensohn'), 'Meldung mit Beleg gespeichert');

// Ignorieren
await A.page.locator('button.net-name', { hasText: 'Borin' }).last().click();
await menu.getByText('Ignorieren').click();
ok((await A.page.locator('.net-chat-log').innerText()).includes('Du ignorierst Borin'), 'Ignorieren bestätigt');
await A.page.keyboard.press('Escape');
await say(B, 'Hörst du mich noch?');
await A.page.waitForTimeout(500);
ok(!(await A.page.locator('.net-chat-log').innerText()).includes('Hörst du mich noch'), 'Nachrichten von Borin ausgeblendet');
// gilt nach Neuladen (anonymer Schlüssel)
const stored = await A.page.evaluate(() => localStorage.getItem('emberwrath:net:ignore'));
ok(stored && !stored.includes(uid(2)) && JSON.parse(stored)[0]?.name === 'Borin', 'Ignorierliste ohne Konto-ID gespeichert');

// Spielerliste im Weltfenster
await A.page.bringToFront();
await A.page.locator('.net-world').click();
await A.page.waitForSelector('.net-plist-row');
const rows = await A.page.locator('.net-plist-row').allInnerTexts();
ok(rows.length === 1 && rows[0].includes('Borin') && rows[0].includes('ignoriert'), 'Spielerliste zeigt Borin (ignoriert)');
await shot(A, 'mod-plist.png');
await A.page.locator('.net-plist-row').first().click();
ok((await menu.innerText()).includes('Nicht mehr ignorieren'), 'Menü aus der Spielerliste');
await menu.getByText('Nicht mehr ignorieren').click();
await say(B, 'Jetzt wieder?');
await A.page.waitForTimeout(500);
ok((await A.page.locator('.net-chat-log').innerText()).includes('Jetzt wieder?'), 'nach Aufheben wieder sichtbar');

// Handy: Formular passt auf den Bildschirm
const P = await player(uid(3), 'Pia', 'human', 'rogue', { ...devices['iPhone 13'] });
await P.page.waitForTimeout(500);
await P.page.evaluate(() => { const n = window.emberfall.net; const r = [...n.session.remotes.values()].find((x) => x.name === 'Borin'); n.session.hud.mod.openReport({ id: r.netId, k: r.k, name: r.name }); });
const box = await P.page.locator('.net-report').boundingBox();
const vp = P.page.viewportSize();
ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `Formular passt aufs Handy (${Math.round(box?.width)}×${Math.round(box?.height)} in ${vp.width}×${vp.height})`);
await shot(P, 'mod-report-phone.png');

// Chatsperre
await get(`/test/mute?uid=${uid(2)}&reason=Beleidigung`);
await B.page.evaluate(() => { const c = window.emberfall.net.client; c.join(c.zone, c.world); });
await B.page.waitForFunction(() => window.emberfall.net.client.status === 'online', null, { timeout: 15000 }).catch(() => {});
await B.page.waitForTimeout(800);
ok((await B.page.locator('.net-chat-log').innerText()).includes('im Chat gesperrt'), 'gesperrte Person sieht Hinweis');

ok(!errors.length, 'keine Fehler im Browser' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `${fails} FEHLER` : 'alles ok');
process.exit(fails ? 1 : 0);
