// Protokolltest: Name/Stufe vom Server, gesperrte Namen, Weltplatz erst nach Anmeldung, offene Verbindungen je Adresse.
// Start wie worker/test/moderation.mjs (wrangler dev mit SUPABASE_SERVICE_ROLE_KEY, mockauth.mjs).
import WebSocket from 'ws';
const W = 'ws://127.0.0.1:8787/net/ws', M = 'http://127.0.0.1:54399', H = 'http://127.0.0.1:8787';
const uid = (n) => `0000002${n}-0000-4000-8000-000000000000`;
const tok = async (sub) => (await (await fetch(`${M}/mint?sub=${sub}&email=${sub.slice(0, 8)}@x.de`)).json()).token;
const get = async (p) => (await fetch(`${M}${p}`)).json();
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const zone = `idtest${Date.now() % 100000}`;
function conn(token, char, { ip = '', hello = true, world = 1 } = {}) {
  return new Promise((res) => {
    const ws = new WebSocket(`${W}?zone=${zone}&world=${world}`, ip ? { headers: { 'CF-Connecting-IP': ip } } : {});
    const c = { ws, msgs: [], closed: null, send: (m) => ws.send(JSON.stringify(m)) };
    ws.on('open', () => { if (hello) c.send({ t: 'hello', v: 1, token, char, look: { raceId: 'elf', classId: 'mage' }, s: [100, 200, 1, 'idle', 0, 0, 1] }); else res(c); });
    ws.on('message', (d) => { const s = d.toString(); const m = s === 'pong' ? { t: 'pong' } : JSON.parse(s); c.msgs.push(m); if (m.t === 'welcome' || m.t === 'bye' || m.t === 'full') setTimeout(() => res(c), 100); });
    ws.on('unexpected-response', (req, r) => { c.closed = r.statusCode; res(c); });
    ws.on('close', (code) => { c.closed ??= code; res(c); });
    ws.on('error', () => {});
  });
}
await get('/test/reset');
await get(`/test/char?uid=${uid(1)}&id=c_real&name=Aria&level=12`);
// 1) Gespeicherter Charakter gewinnt gegen Client-Angaben
const a = await conn(await tok(uid(1)), { id: 'c_real', name: 'Admin', level: 999 });
const b = await conn(await tok(uid(2)), { id: 'c_new', name: 'Borin', level: 7 });
const seenA = b.msgs[0].players?.find((p) => p.id === a.msgs[0].id);
ok(seenA?.name === 'Aria' && seenA.level === 13, `Name aus dem Speicherstand, Stufe 999 -> Speicherstand 12 + 1: ${seenA?.name} ${seenA?.level}`);
// 2) Stufe beim Aufstieg: höchstens eine über dem Speicherstand
a.send({ t: 'look', level: 13, look: { raceId: 'elf', classId: 'mage' } });
await wait(150);
ok(b.msgs.filter((m) => m.t === 'look').at(-1)?.level === 13, 'Aufstieg um eine Stufe wird gezeigt');
a.send({ t: 'look', level: 30, look: { raceId: 'elf', classId: 'mage' } });
await wait(150);
ok(b.msgs.filter((m) => m.t === 'look').at(-1)?.level === 13, 'Sprung auf 30 wird auf 13 begrenzt');
// 3) Ohne Speicherstand: Client-Angaben, Stufe höchstens 40
const c = await conn(await tok(uid(3)), { id: 'c_x', name: 'Cara', level: 999 });
const seenC = a.msgs.filter((m) => m.t === 'join').map((m) => m.p).find((p) => p.name === 'Cara');
ok(seenC?.level === 40, 'ohne Speicherstand: Stufe auf 40 begrenzt: ' + seenC?.level);
c.ws.close();
// 4) Reservierter Name
const d = await conn(await tok(uid(4)), { id: 'c_y', name: 'GameMaster Thor', level: 5 });
const n = d.msgs.find((m) => m.t === 'notice' && m.kind === 'name');
const seenD = a.msgs.filter((m) => m.t === 'join').map((m) => m.p).at(-1);
ok(n?.reason === 'reserviert' && /^Abenteurer [0-9A-F]{4}$/.test(seenD?.name ?? '') && n.name === seenD.name, `„GameMaster Thor“ gesperrt, andere sehen „${seenD?.name}“`);
d.ws.close();
const e = await conn(await tok(uid(5)), { id: 'c_z', name: 'H1tl3r', level: 5 });
ok(e.msgs.find((m) => m.t === 'notice' && m.kind === 'name')?.reason === 'anstoessig', 'anstößiger Name gesperrt');
e.ws.close();
await wait(300);
// 5) Weltplatz erst nach Anmeldung: viele Verbindungen ohne gültige Anmeldung belegen keinen Platz
const before = (await (await fetch(`${H}/net/worlds?zone=${zone}`)).json()).worlds.find((w) => w.world === 1)?.n;
const fakes = await Promise.all(Array.from({ length: 6 }, (_, i) => conn('', null, { hello: false, world: 'auto', ip: `10.0.0.${i + 1}` })));
await wait(200);
const mid = (await (await fetch(`${H}/net/worlds?zone=${zone}`)).json()).worlds.find((w) => w.world === 1)?.n;
ok(before === 2 && mid === 2, `unangemeldete Verbindungen zählen nicht (vorher ${before}, danach ${mid})`);
const f = await conn(await tok(uid(6)), { id: 'c_f', name: 'Fenja', level: 3 }, { world: 'auto' });
ok(f.msgs[0]?.t === 'welcome' && f.msgs[0].world === 1, 'nächster Spieler kommt trotzdem in Welt 1');
for (const x of fakes) x.ws.close();
// 6) Offene Verbindungen je Adresse begrenzt
const same = await Promise.all(Array.from({ length: 6 }, () => conn('', null, { hello: false, ip: '10.9.9.9' })));
const refused = same.filter((x) => x.closed === 429).length;
ok(refused === 2, `je Adresse höchstens 4 offene Verbindungen (abgewiesen: ${refused} von 6)`);
for (const x of [...same, a, b, f]) x.ws.close();
await wait(100);
console.log(fails ? `${fails} FEHLER` : 'alles ok');
process.exit(fails ? 1 : 0);
