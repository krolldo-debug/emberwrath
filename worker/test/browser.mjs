import { chromium, devices } from 'playwright';
const APP = 'http://127.0.0.1:8787/spielen/', M = 'http://127.0.0.1:54399', SHOTS = process.env.SHOTS;
const tok = async (sub) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub}@x.de`)).json()).token;
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
async function player(sub, name, raceId, classId, ctxOpts = { locale: 'de-DE', viewport: { width: 1280, height: 720 } }) {
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
    const acc = g.online.sync.ensureLocalAccount(user);
    g.login(acc);
    g.newGame({ character: { name, raceId, classId, appearance: { variant: 1 } } });
  }, [user, name, raceId, classId]);
  await page.waitForFunction(() => window.emberfall.scenes.currentId === 'play' && window.emberfall.net.client.status === 'online', null, { timeout: 15000 });
  // Einführungsdialoge/Karten wegklicken
  await page.waitForTimeout(500);
  return { page, ctx, name };
}
const net = (p) => p.page.evaluate(() => { const n = window.emberfall.net; const r = [...(n.session?.remotes.values() ?? [])]; return { status: n.client.status, world: n.client.world, zone: n.client.zone, remotes: r.map((x) => ({ name: x.name, level: x.level, x: Math.round(x.x), y: Math.round(x.y), built: !!x.animator, anim: x.animator?.name, inWorld: window.emberfall.scenes.current.world.entities.includes(x) })) }; });
const hero = (p) => p.page.evaluate(() => { const h = window.emberfall.scenes.current.world.hero; return { x: Math.round(h.x), y: Math.round(h.y) }; });

const A = await player('ua', 'Aria', 'elf', 'mage');
const B = await player('ub', 'Borin', 'dwarf', 'warrior');
await B.page.waitForTimeout(800);
let nb = await net(B), na = await net(A);
ok(nb.remotes.length === 1 && nb.remotes[0].name === 'Aria' && nb.remotes[0].built && nb.remotes[0].inWorld, 'B sieht Aria: ' + JSON.stringify(nb.remotes));
ok(na.remotes.length === 1 && na.remotes[0].name === 'Borin', 'A sieht Borin');
ok(na.world === 1 && nb.world === 1, 'beide in Welt 1');
// A läuft nach rechts
const a0 = await hero(A);
await A.page.bringToFront();
await A.page.keyboard.down('KeyD'); await A.page.waitForTimeout(900); await A.page.keyboard.up('KeyD');
await A.page.waitForTimeout(600);
const a1 = await hero(A);
nb = await net(B);
const seen = nb.remotes[0];
ok(a1.x - a0.x > 40 && Math.abs(seen.x - a1.x) <= 3 && Math.abs(seen.y - a1.y) <= 3, `B sieht A an der neuen Stelle (A ${a0.x}->${a1.x}, gesehen ${seen.x})`);
// Bewegung wird flüssig interpoliert: Positionen während des Laufens abtasten
await B.page.evaluate(() => { window.__trace = []; const tick = () => { const r = [...window.emberfall.net.session.remotes.values()][0]; window.__trace.push([performance.now(), r.x, r.y]); if (window.__trace.length < 90) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await A.page.keyboard.down('KeyS');
await A.page.waitForTimeout(1600);
await A.page.keyboard.up('KeyS');
const trace = await B.page.evaluate(() => window.__trace);
console.log(JSON.stringify(trace.slice(20,50).map(t=>[Math.round(t[0]%100000),Math.round(t[2]*10)/10])));
const samples = [];
// Geschwindigkeit je Frame im mittleren Abschnitt: gleichmäßig, keine Sprünge/Stillstände
const v = []; for (let i = 1; i < trace.length; i++) { const dt = (trace[i][0] - trace[i - 1][0]) / 1000; if (dt > 0) v.push((trace[i][2] - trace[i - 1][2]) / dt); }
const moving = v.filter((x) => x > 5);
const mean = moving.reduce((a, b) => a + b, 0) / Math.max(1, moving.length);
const dev = Math.sqrt(moving.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, moving.length));
const stalls = v.slice(v.findIndex((x) => x > 5), v.length - [...v].reverse().findIndex((x) => x > 5)).filter((x) => x <= 5).length;
console.log('  Frames', trace.length, 'Tempo px/s', Math.round(mean), '±', Math.round(dev), 'Stillstände mitten im Lauf', stalls);
ok(moving.length > 40 && dev / mean < 0.35 && stalls <= 3, 'Bewegung bei B gleichmäßig interpoliert');
for (let i = 0; i < 3; i++) samples.push((await net(B)).remotes[0]);
await A.page.keyboard.down('KeyD'); for (let i = 0; i < 6; i++) { samples.push((await net(B)).remotes[0]); await B.page.waitForTimeout(60); } await A.page.keyboard.up('KeyD');
ok(samples.some((s) => s.anim === 'run'), 'Laufanimation wird gezeigt');
// Angriff
await A.page.waitForTimeout(500);
await A.page.keyboard.press('KeyJ');
const seenAnims = [];
for (let i = 0; i < 16; i++) { seenAnims.push((await net(B)).remotes[0].anim); await B.page.waitForTimeout(40); }
const atk = seenAnims.find((a) => /^atk/.test(a)) ?? seenAnims.join(',');
ok(/^atk/.test(atk ?? ''), 'Angriffsanimation (gesehen: ' + atk + ')');
// Chat
const beforeChat = await hero(A);
await A.page.keyboard.press('Enter');
await A.page.keyboard.type('Hallo Borin, gehen wir in den Aschenwald?');
await A.page.keyboard.press('Enter');
await B.page.waitForTimeout(400);
const logB = await B.page.locator('.net-chat-log').innerText();
ok(logB.includes('Aria: Hallo Borin, gehen wir in den Aschenwald?'), 'Chat kommt bei B an');
const typedMove = await hero(A);
ok(Math.abs(typedMove.x - beforeChat.x) < 30, 'Tippen im Chat bewegt den Helden nicht (D in "Borin")');
const badge = await B.page.locator('.net-world').innerText();
ok(/Welt 1 · 2 Spieler/.test(badge), 'Welt-Anzeige: ' + badge);
if (SHOTS) {
  await B.page.bringToFront();
  await B.page.evaluate(() => { const h = window.emberfall.scenes.current.world.hero; const r = [...window.emberfall.net.session.remotes.values()][0]; }).catch(() => {});
  await B.page.screenshot({ path: `${SHOTS}/b-sieht-a.png` });
}
// Ausrüstung/Stufe von A ändern -> B sieht neue Stufe
await A.page.evaluate(() => { const g = window.emberfall; g.state.commit('progress:grantXp', { amount: 400, source: 'test' }); });
await B.page.waitForTimeout(1600);
nb = await net(B);
ok(nb.remotes[0].level > 1, 'B sieht neue Stufe von A: ' + nb.remotes[0].level);
// Dritter Spieler, Welt voll (Kapazität im Test 3) -> vierter in Welt 2
const C = await player('uc', 'Cara', 'human', 'rogue');
const D = await player('ud', 'Dorn', 'emberborn', 'ranger');
const nd = await net(D), nc = await net(C);
ok(nc.world === 1 && nd.world === 2 && nd.remotes.length === 0, `Cara Welt ${nc.world}, Dorn Welt ${nd.world} (Welt 1 voll)`);
// Weltwahl öffnen
await D.page.bringToFront();
await D.page.waitForTimeout(3500);
await D.page.locator('.net-world').click();
await D.page.waitForSelector('.net-worlds-row');
const rows = await D.page.locator('.net-worlds-row').allInnerTexts();
ok(rows.some((r) => /Welt 1[\s\S]*voll/.test(r)) && rows.some((r) => /Welt 2[\s\S]*du bist hier/.test(r)), 'Weltliste: ' + rows.join(' | '));
if (SHOTS) await D.page.screenshot({ path: `${SHOTS}/weltwahl.png` });
await D.page.keyboard.press('Escape').catch(() => {});
// Zonenwechsel: A geht in den Aschenwald
await A.page.evaluate(() => window.emberfall.bus.emit('zone:travel', { zoneId: 'ashwood', spawnId: 'start' }));
await A.page.waitForFunction(() => window.emberfall.net.client.zone === 'ashwood' && window.emberfall.net.client.status === 'online', null, { timeout: 10000 });
await B.page.waitForTimeout(400);
nb = await net(B); na = await net(A);
ok(!nb.remotes.some((r) => r.name === 'Aria') && na.zone === 'ashwood' && na.world === 1, 'A im Aschenwald Welt 1, B sieht A nicht mehr');
// B folgt
await B.page.evaluate(() => window.emberfall.bus.emit('zone:travel', { zoneId: 'ashwood', spawnId: 'start' }));
await B.page.waitForFunction(() => window.emberfall.net.client.zone === 'ashwood' && window.emberfall.net.client.status === 'online', null, { timeout: 10000 });
await B.page.waitForTimeout(800);
nb = await net(B);
ok(nb.remotes.some((r) => r.name === 'Aria' && r.built && r.inWorld), 'B folgt in den Aschenwald und sieht A wieder');
// Dungeon-Instanz: keine Verbindung
await B.page.evaluate(() => window.emberfall.bus.emit('zone:travel', { zoneId: 'catacombs', spawnId: 'start' }));
await B.page.waitForTimeout(1200);
nb = await net(B);
ok(nb.status === 'off' && (await B.page.locator('.net-world').isHidden()), 'Dungeon-Instanz ohne Verbindung, Anzeige versteckt');
// Wiederverbinden nach Verbindungsabbruch
await A.page.evaluate(() => window.emberfall.net.client.ws.close());
await A.page.waitForFunction(() => window.emberfall.net.client.status === 'online', null, { timeout: 15000 });
na = await net(A);
ok(na.world === 1 && na.zone === 'ashwood', 'A verbindet sich nach Abbruch wieder (Welt ' + na.world + ')');
// Pause (Menü offen) -> andere bewegen sich trotzdem
// Handy
const P = await player('up', 'Pia', 'human', 'mage', { ...devices['iPhone 13'], locale: 'de-DE' });
await P.page.waitForTimeout(800);
const np = await net(P);
ok(np.status === 'online', 'Handy online in Welt ' + np.world);
if (SHOTS) {
  await P.page.waitForTimeout(3000);
  await P.page.evaluate(() => { const g = window.emberfall; g.net.session.hud.chat({ name: 'Borin', text: 'Wer kommt mit in die Katakomben?' }, false); });
  await P.page.screenshot({ path: `${SHOTS}/handy.png` });
  await P.page.locator('.net-chat-btn').tap();
  await P.page.waitForTimeout(300);
  await P.page.screenshot({ path: `${SHOTS}/handy-chat.png` });
  const L = await player('ul', 'Lio', 'elf', 'ranger', { ...devices['iPhone 13 landscape'], locale: 'de-DE' });
  await L.page.waitForTimeout(3500);
  await L.page.evaluate(() => { const g = window.emberfall; g.net.session.hud.chat({ name: 'Borin', text: 'Wer kommt mit in die Katakomben?' }, false); });
  await L.page.screenshot({ path: `${SHOTS}/handy-quer.png` });
}
if (SHOTS) { await A.page.bringToFront(); await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(200); await A.page.screenshot({ path: `${SHOTS}/chat-offen.png` }); await A.page.keyboard.press('Escape'); }
// Abmelden trennt
await C.page.evaluate(() => window.emberfall.scenes.go('title'));
await C.page.waitForTimeout(500);
ok((await net(C)).status === 'off', 'Spiel verlassen trennt die Verbindung');
ok(errors.length === 0, 'keine Fehler: ' + errors.slice(0, 5).join(' || '));
await browser.close();
console.log(fails ? `${fails} FEHLER` : 'alles grün');
process.exit(fails ? 1 : 0);
