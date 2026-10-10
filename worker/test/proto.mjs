import WebSocket from 'ws';
const W = 'ws://127.0.0.1:8787/net/ws', M = 'http://127.0.0.1:54399';
const tok = async (sub, alg = 'ES256', ttl = 3600) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub}@x.de&alg=${alg}&ttl=${ttl}`)).json()).token;
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
function conn(token, name, { world = 'auto', zone = 'emberhollow', exclude = '' } = {}) {
  return new Promise((res) => {
    const ws = new WebSocket(`${W}?zone=${zone}&world=${world}${exclude ? `&exclude=${exclude}` : ''}`);
    const c = { ws, msgs: [], name, closed: null };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 2, token, char: { id: 'c_' + name, name, level: 7 }, look: { raceId: 'elf', classId: 'mage', appearance: { variant: 1 } }, s: [100, 200, 1, 'idle', 0, 0, 1] })));
    ws.on('message', (d) => { const s = d.toString(); const m = s === 'pong' ? { t: 'pong' } : JSON.parse(s); c.msgs.push(m); if (m.t === 'welcome' || m.t === 'full' || m.t === 'bye') res(c); });
    ws.on('close', (code) => { c.closed = code; res(c); });
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const a = await conn(await tok('ua'), 'Aria');
ok(a.msgs[0]?.t === 'welcome' && a.msgs[0].world === 1 && a.msgs[0].players.length === 0, 'A betritt Welt 1 allein');
const b = await conn(await tok('ub', 'HS256'), 'Borin');
ok(b.msgs[0]?.t === 'welcome' && b.msgs[0].players.length === 1 && b.msgs[0].players[0].name === 'Aria', 'B (Rückfall /auth/v1/user) sieht A');
await wait(100);
ok(a.msgs.some((m) => m.t === 'join' && m.p.name === 'Borin'), 'A bekommt join von B');
b.ws.send(JSON.stringify({ t: 's', s: [140, 210, -1, 'run', 3, 0, 5000] }));
await wait(250);
const u = a.msgs.find((m) => m.t === 'u');
ok(u && u.s[0][1] === 140 && u.s[0][4] === 'run', 'A bekommt Zustand von B gebündelt');
// Kampfereignisse (nur Anzeige) reisen mit dem Zustand; Unsinn fällt weg, Werte werden begrenzt
b.ws.send(JSON.stringify({ t: 's', s: [140, 210, 1, 'atk1', 4, 4, 5100], fx: [['a', 5100, 0, 785, 2, 300, 210, 8, 7], ['k', 5100, 'arrow_rain', 9999, 0, 0, 0, 0, 0], ['x', 1], ['k', 5100, 'Böse<script>', 0, 0], 'kaputt'] }));
b.ws.send(JSON.stringify({ t: 's', s: [140, 210, 1, 'atk1', 5, 4, 5130], fx: [['k', 5130, 'volley', 0, 1, 0, 0, 0, 0]] }));
await wait(250);
const fx = a.msgs.filter((m) => m.t === 'u' && m.fx).flatMap((m) => m.fx);
const evs = fx.filter((f) => f[0] === b.msgs[0].id).flatMap((f) => f.slice(1));
ok(evs.length === 3 && evs[0][2] === 0 && evs[0][3] === 785 && evs[0][8] === 7 && evs[1][2] === 'arrow_rain' && evs[1][3] === 3142 && evs[2][2] === 'volley',
  'Kampfereignisse kommen bereinigt und vollständig an: ' + JSON.stringify(evs));
b.ws.send(JSON.stringify({ t: 'chat', text: 'Hallo\u0000 <b>Welt</b>   ' }));
await wait(150);
const ch = a.msgs.find((m) => m.t === 'chat');
ok(ch && ch.text === 'Hallo <b>Welt</b>' && ch.name === 'Borin', 'Chat kommt bereinigt an: ' + ch?.text);
b.ws.send(JSON.stringify({ t: 'look', level: 9, look: { raceId: 'dwarf', classId: 'warrior', items: { weapon: 'iron_sword' } } }));
await wait(1700); // Aussehen höchstens alle 1,5 s
ok(a.msgs.some((m) => m.t === 'look' && m.level === 9 && m.look.raceId === 'dwarf'), 'Aussehen-Änderung kommt an');
const bad = await conn('eyJhbGciOiJFUzI1NiIsImtpZCI6ImsxIn0.eyJzdWIiOiJ4In0.AAAA', 'Fake');
ok(bad.msgs.some((m) => m.t === 'bye' && m.reason === 'auth') || bad.closed, 'gefälschtes Token abgewiesen');
const exp = await conn(await tok('ux', 'ES256', -120), 'Alt');
ok(exp.msgs.some((m) => m.t === 'bye' && m.reason === 'auth'), 'abgelaufenes Token abgewiesen');
const c = await conn(await tok('uc'), 'Cara');
ok(c.msgs[0]?.t === 'welcome' && c.msgs[0].world === 1, 'C in Welt 1 (3/3)');
const d = await conn(await tok('ud'), 'Dorn');
ok(d.msgs[0]?.t === 'welcome' && d.msgs[0].world === 2, `D automatisch in Welt 2 (bekam ${d.msgs[0]?.t} ${d.msgs[0]?.world})`);
const e = await conn(await tok('ue'), 'Eda', { world: 1 });
ok(e.msgs[0]?.t === 'full', `E will Welt 1 (voll) -> ${e.msgs[0]?.t} ${e.msgs[0]?.world ?? ''}`);
// Wiederverbinden desselben Kontos ersetzt die alte Verbindung
const a2 = await conn(await tok('ua'), 'Aria', { world: 1 });
await wait(200);
ok(a.msgs.some((m) => m.t === 'bye' && m.reason === 'replaced'), 'alte Verbindung von A ersetzt');
ok(a2.msgs[0]?.t === 'welcome' && a2.msgs[0].world === 1, 'neue Verbindung von A in Welt 1');
ok(b.msgs.some((m) => m.t === 'leave') && b.msgs.filter((m) => m.t === 'join' && m.p.name === 'Aria').length >= 1, 'B sieht leave + join von A');
// Ping
a2.ws.send('ping'); await wait(100); ok(a2.msgs.some((m) => m.t === 'pong'), 'ping -> pong');
// Flut: Rate-Limit
for (let i = 0; i < 500; i++) b.ws.send(JSON.stringify({ t: 's', s: [i, 1, 1, 'run', i, 0, 6000 + i] }));
await wait(1500);
console.log('b closed', b.closed, b.msgs.filter(m=>m.t==='bye'));
ok(b.closed === 4000 || b.msgs.some((m) => m.t === 'bye' && m.reason === 'kick'), 'Nachrichtenflut wird getrennt');
const st = await (await fetch('http://127.0.0.1:8787/net/status')).json();
console.log('status', JSON.stringify(st));
for (const x of [a2, c, d, e]) x.ws.close();
await wait(300);
const w = await (await fetch('http://127.0.0.1:8787/net/worlds?zone=emberhollow')).json();
console.log('worlds', JSON.stringify(w));
const bogus = await new Promise((r) => { const ws = new WebSocket(`${W}?zone=..%2Fx`); ws.on('unexpected-response', (q, res) => r(res.statusCode)); ws.on('open', () => r('open')); ws.on('error', () => r('err')); });
ok(bogus === 400, 'ungültige Zone abgewiesen');
const foreign = await new Promise((r) => { const ws = new WebSocket(`${W}?zone=emberhollow`, { headers: { Origin: 'https://evil.example' } }); ws.on('unexpected-response', (q, res) => r(res.statusCode)); ws.on('open', () => r('open')); ws.on('error', () => r('err')); });
ok(foreign === 403, 'fremde Seite (Origin) abgewiesen: ' + foreign);
console.log(fails ? `${fails} FEHLER` : 'alles grün');
process.exit(fails ? 1 : 0);
