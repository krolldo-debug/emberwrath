// Protokolltest Chat-Moderation (Wortfilter, Melden, Sperre) gegen `wrangler dev` + mockauth.mjs (mit PostgREST-Nachbau).
// wrangler dev --var SUPABASE_URL:http://127.0.0.1:54399 --var SHARD_CAPACITY:3 --var SUPABASE_SERVICE_ROLE_KEY:sb_secret_test
import WebSocket from 'ws';
const W = 'ws://127.0.0.1:8787/net/ws', M = 'http://127.0.0.1:54399';
const uid = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const tok = async (sub) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub.slice(0, 8)}@x.de`)).json()).token;
const get = async (p) => (await fetch(`${M}${p}`)).json();
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const zone = `modtest${Date.now() % 100000}`;
function conn(token, name) {
  return new Promise((res) => {
    const ws = new WebSocket(`${W}?zone=${zone}&world=1`);
    const c = { ws, msgs: [], name, send: (m) => ws.send(JSON.stringify(m)), last: (t) => c.msgs.filter((m) => m.t === t).at(-1) };
    ws.on('open', () => c.send({ t: 'hello', v: 1, token, char: { id: 'c_' + name, name, level: 7 }, look: { raceId: 'elf', classId: 'mage' }, s: [100, 200, 1, 'idle', 0, 0, 1] }));
    ws.on('message', (d) => { const s = d.toString(); const m = s === 'pong' ? { t: 'pong' } : JSON.parse(s); c.msgs.push(m); if (m.t === 'welcome' || m.t === 'bye') res(c); });
    ws.on('close', () => res(c));
  });
}

await get('/test/reset');
const a = await conn(await tok(uid(1)), 'Aria');
const b = await conn(await tok(uid(2)), 'Borin');
const wa = a.msgs[0], wb = b.msgs[0];
ok(wa.t === 'welcome' && /^[0-9a-f]{16}$/.test(wa.k), 'welcome enthält Ignorier-Schlüssel k');
ok(wb.players[0]?.k === wa.k && wb.players[0].k !== uid(1), 'andere sehen k, nicht die Konto-ID');
const bId = wb.self ?? wb.id;
await wait(100);

// Wortfilter
b.send({ t: 'chat', text: 'du Hurensohn, schau auf www.gold-billig.ru' });
await wait(150);
let ch = a.last('chat');
ok(ch && !/huren/i.test(ch.text) && ch.text.includes('*') && ch.text.includes('[Link entfernt]'), 'Filter: ' + ch?.text);
b.send({ t: 'chat', text: 'h i t l e r' });
await wait(150);
ok(a.last('chat')?.text === '[Nachricht vom Filter entfernt]', 'gesperrt geschriebenes Wort entfernt');
await wait(1300);
b.send({ t: 'chat', text: 'Spaß in der Mongolei, du Opfer' });
await wait(150);
ok(a.last('chat')?.text === 'Spaß in der Mongolei, du Opfer', 'harmloser Satz bleibt: ' + a.last('chat')?.text);

// Melden
const bNet = a.last('chat').id;
a.send({ t: 'report', id: bNet, reason: 'beleidigung', note: 'beleidigt <b>alle</b>', goodFaith: true });
await wait(300);
ok(a.last('reported')?.ok === true && a.last('reported').id === bNet, 'Meldung bestätigt');
let reps = await get('/test/reports');
let r = reps.at(-1);
ok(r && r.reporter_id === uid(1) && r.reported_id === uid(2) && r.reason === 'beleidigung' && r.good_faith === true && r.zone === zone && r.world === 1, 'Meldung gespeichert (Konten, Grund, Gebiet)');
ok(r?.messages?.length === 3 && r.messages[0].text.includes('Hurensohn') && r.messages[0].shown?.includes('*'), 'Beleg: Originaltext + gefilterte Anzeige vom Server');
a.send({ t: 'report', id: bNet, reason: 'quatsch' });
await wait(150);
ok(a.last('reported')?.ok === false && a.last('reported').error === 'reason', 'ungültiger Grund abgelehnt');
a.send({ t: 'report', id: wa.self ?? wa.id, reason: 'spam' });
await wait(150);
ok(a.last('reported')?.error === 'target', 'sich selbst melden abgelehnt');

// Gemeldete Person ist schon weg: Meldung geht trotzdem
b.ws.close();
await wait(300);
a.send({ t: 'report', id: bNet, reason: 'hass', goodFaith: true });
await wait(300);
ok(a.last('reported')?.ok === true && (await get('/test/reports')).at(-1).reason === 'hass', 'Meldung nach Verlassen des Gebiets möglich');

// Supabase gestört: Warteschlange
await get('/test/fail?on=1');
const c = await conn(await tok(uid(3)), 'Cara');
c.send({ t: 'chat', text: 'spam spam' });
await wait(150);
const cNet = c.msgs[0].id;
ok(a.last('chat')?.id === cNet && a.last('chat').text === 'spam spam', `Cara (${cNet}) chattet: ${JSON.stringify(a.last('chat'))}`);
const before = (await get('/test/reports')).length;
a.send({ t: 'report', id: cNet, reason: 'spam', goodFaith: true });
await wait(300);
ok(a.last('reported')?.ok === true && (await get('/test/reports')).length === before, 'bei Störung trotzdem bestätigt (in Warteschlange)');
// Ratenbegrenzung (bisher 3 angenommen inkl. Warteschlange, Grenze 6)
for (let i = 0; i < 4; i++) a.send({ t: 'report', id: cNet, reason: 'spam', goodFaith: true });
await wait(300);
const answers = a.msgs.filter((m) => m.t === 'reported').slice(-4);
ok(answers.filter((m) => m.error === 'rate').length === 1 && answers.filter((m) => m.ok).length === 3, 'Grenze: 6 Meldungen in 10 Minuten, die 7. -> rate');
await get('/test/fail?on=0');
console.log('… warte auf Alarm (bis 90 s)');
let flushed = false;
for (let i = 0; i < 90 && !flushed; i++) { await wait(1000); flushed = (await get('/test/reports')).length > before; }
const all = await get('/test/reports');
ok(flushed && all.length === before + 4 && all.at(-1).reported_id === uid(3), `Warteschlange nach Störung nachgesendet (${all.length - before} von 4)`);

// Chatsperre
await get(`/test/mute?uid=${uid(3)}&reason=Spam`);
c.ws.close();
await wait(200);
const c2 = await conn(await tok(uid(3)), 'Cara');
await wait(150);
ok(c2.msgs.some((m) => m.t === 'notice' && m.kind === 'muted' && m.reason === 'Spam'), 'Sperre wird beim Betreten gemeldet');
const n = a.msgs.filter((m) => m.t === 'chat').length;
c2.send({ t: 'chat', text: 'ich darf nicht' });
await wait(200);
ok(a.msgs.filter((m) => m.t === 'chat').length === n && c2.msgs.filter((m) => m.t === 'notice').length >= 2, 'gesperrte Person kann nicht schreiben');

for (const x of [a, c2]) x.ws.close();
await wait(100);
console.log(fails ? `${fails} FEHLER` : 'alles ok');
process.exit(fails ? 1 : 0);
