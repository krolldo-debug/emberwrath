// Protokolltest zum Sicherheitsbericht (05.10.): S2, S3, S5, S6, S7, S8, S9, S11, S12, S4 gegen `wrangler dev`.
// Start wie worker/test/moderation.mjs (wrangler dev mit SHARD_CAPACITY:3 und SUPABASE_SERVICE_ROLE_KEY, mockauth.mjs).
import WebSocket from 'ws';
const W = 'ws://127.0.0.1:8787/net', M = 'http://127.0.0.1:54399';
const uid = (n) => `0000003${n}-0000-4000-8000-000000000000`;
const tok = async (sub, opts = {}) => (await (await fetch(`${M}/mint?sub=${sub}&email=x@x.de&alg=${opts.alg ?? 'ES256'}${opts.extra ? `&extra=${encodeURIComponent(JSON.stringify(opts.extra))}` : ''}`)).json()).token;
const get = async (p) => (await fetch(`${M}${p}`)).json();
let fails = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now() % 100000;
const Z = (n) => `sec${n}x${run}`;
function conn(token, { zone = Z(1), world = 1, char = null, ip = '', hello = true, path = 'ws' } = {}) {
  return new Promise((res) => {
    const ws = new WebSocket(`${W}/${path}?zone=${zone}&world=${world}`, ip ? { headers: { 'CF-Connecting-IP': ip } } : {});
    const c = { ws, msgs: [], closed: null, send: (m) => ws.send(JSON.stringify(m)), last: (t) => c.msgs.filter((m) => m.t === t).at(-1), all: (t) => c.msgs.filter((m) => m.t === t) };
    ws.on('open', () => {
      if (!hello) return res(c);
      c.send({ t: 'hello', v: 2, token, char: char ?? { id: 'c1', name: 'Held', level: 5 }, look: { raceId: 'elf', classId: 'mage' }, s: [100, 200, 1, 'idle', 0, 0, 1] });
    });
    ws.on('message', (d) => { const s = d.toString(); const m = s === 'pong' ? { t: 'pong' } : JSON.parse(s); c.msgs.push(m); if (['welcome', 'bye', 'full'].includes(m.t)) setTimeout(() => res(c), 80); });
    ws.on('unexpected-response', (req, r) => { c.closed = r.statusCode; res(c); });
    ws.on('close', (code) => { c.closed ??= code; res(c); });
    ws.on('error', () => {});
  });
}
await get('/test/reset');

// S8: Token-Angaben werden alle geprüft
for (const [extra, what] of [[{ aud: 'other' }, 'falsches aud'], [{ role: 'service_role' }, 'Rolle service_role'], [{ iss: 'https://evil/auth/v1' }, 'fremder Aussteller'], [{ is_anonymous: true }, 'anonyme Anmeldung'], [{ nbf: Math.floor(Date.now() / 1000) + 3600 }, 'nbf in der Zukunft'], [{ role: null }, 'ohne Rolle']]) {
  const c = await conn(await tok(uid(9), { extra }));
  ok(c.last('bye')?.reason === 'auth', `abgewiesen: ${what}`);
}

// S7: gefälschtes HS256-Token fragt Supabase höchstens einmal, andere Algorithmen nie
const before = (await get('/log')).filter((p) => p === '/auth/v1/user').length;
const fakeHs = (await tok(uid(8), { alg: 'HS256' })).replace(/\.[^.]+$/, '.ZmFrZQ');
for (let i = 0; i < 3; i++) await conn(fakeHs);
const noneTok = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid(8), role: 'authenticated', aud: 'authenticated', exp: 9e9 })).toString('base64url')}.`;
await conn(noneTok);
const after = (await get('/log')).filter((p) => p === '/auth/v1/user').length;
ok(after - before === 1, `gefälschte Tokens: ${after - before} Nachfrage(n) bei Supabase (erwartet 1)`);

// S5: Namen mit Sonderzeichen
const fw = await conn(await tok(uid(7)), { char: { id: 'c7', name: 'Ａｄｍｉｎ', level: 3 }, zone: Z(5) });
const fwn = fw.last('notice');
ok(fwn?.kind === 'name' && fwn.reason === 'zeichen' && /^Abenteurer /.test(fwn.name), `„Ａｄｍｉｎ“ -> ${fwn?.reason}, sichtbar als „${fwn?.name}“`);
const ac = await conn(await tok(uid(6)), { char: { id: 'c6', name: 'Admín', level: 3 }, zone: Z(5) });
ok(ac.last('notice')?.reason === 'reserviert', '„Admín“ reserviert');
// S6: Chat
ac.send({ t: 'chat', text: 'ｆｕｃｋ und schau auf evil . com' });
await wait(200);
const seen = fw.last('chat')?.text ?? '';
ok(!/ｆｕｃｋ|fuck/i.test(seen) && seen.includes('[Link entfernt]'), 'Chat gefiltert: ' + seen);
fw.ws.close(); ac.ws.close();

// S3: Aussehen gedrosselt, nur echte Gegenstände
const a = await conn(await tok(uid(1)), { zone: Z(2) });
const b = await conn(await tok(uid(2)), { zone: Z(2) });
await wait(100);
// Spam mit jedes Mal anderem Aussehen: höchstens eins sofort, eins nachgereicht
for (let i = 0; i < 20; i++) a.send({ t: 'look', level: 5, look: { raceId: 'elf', classId: 'mage', appearance: { variant: i + 1 }, items: { weapon: i % 2 ? 'iron_sword' : 'notched_blade' } } });
await wait(1800);
const looks = b.all('look');
ok(looks.length >= 1 && looks.length <= 2 && looks.at(-1).look.appearance.variant === 20, `20 Aussehen in einer Sekunde -> ${looks.length} weitergegeben, das letzte zuletzt`);
a.send({ t: 'look', level: 5, look: { raceId: 'elf', classId: 'mage', items: { weapon: 'nope_item', head: 'iron_sword', chest: 'varkhul_helm', hands: 'x'.repeat(5000) } } });
await wait(1700);
const lk = b.last('look')?.look;
ok(lk && lk.items.weapon === null && lk.items.head === null && lk.items.chest === null && lk.items.hands === null && !('gear' in lk), 'unbekannte oder falsch platzierte Gegenstände verworfen, keine fertige Optik mehr');
a.send({ t: 'look', level: 5, look: { raceId: 'elf', classId: 'mage', items: { weapon: 'iron_sword', head: 'varkhul_helm' } } });
await wait(1700);
ok(b.last('look')?.look.items.weapon === 'iron_sword' && b.last('look').look.items.head === 'varkhul_helm', 'echte Gegenstände kommen an');

// S12: Chatgrenze gilt je Konto, auch nach Neuverbinden
for (let i = 0; i < 3; i++) a.send({ t: 'chat', text: `hallo ${i}` });
await wait(150);
a.ws.close();
await wait(150);
const a2 = await conn(await tok(uid(1)), { zone: Z(2) });
a2.send({ t: 'chat', text: 'gleich nach dem Neuverbinden' });
await wait(200);
ok(!b.all('chat').some((m) => m.text.includes('Neuverbinden')), 'Chatgrenze bleibt nach Neuverbinden bestehen');

// S2: ein Konto, ein Shard (anderes Gebiet derselben Welt und andere Welt)
const elsewhere = await conn(await tok(uid(1)), { zone: Z(3) });
await wait(400);
ok(elsewhere.msgs[0]?.t === 'welcome' && a2.last('bye')?.reason === 'replaced', 'Anmeldung im anderen Gebiet meldet die alte ab (ersetzt)');
const otherWorld = await conn(await tok(uid(1)), { zone: Z(3), world: 2 });
await wait(400);
ok(otherWorld.msgs[0]?.t === 'welcome' && elsewhere.last('bye')?.reason === 'replaced', 'Anmeldung in anderer Welt meldet die alte ab');

// S9: gleichzeitige Anmeldungen überholen die Obergrenze (3) nicht (wrangler dev setzt für alle dieselbe Adresse,
// daher nimmt der Shard nur 4 gleichzeitig unangemeldet an, die fünfte bekommt 429)
const zcap = Z(4);
const many = await Promise.all([1, 2, 3, 4, 5].map((n) => tok(uid(`5${n}`)).then((t) => conn(t, { zone: zcap }))));
const welcomed = many.filter((c) => c.msgs[0]?.t === 'welcome').length;
ok(welcomed === 3, `5 gleichzeitige Anmeldungen bei Platz für 3: ${welcomed} angenommen (übrige: ${many.filter((c) => c.msgs[0]?.t !== 'welcome').map((c) => c.msgs.map((m) => m.t).join('+') || c.closed).join(', ')})`);
// gleichzeitig zweimal dasselbe Konto: nur eine Verbindung bleibt
const zdup = Z(6);
const t6 = await tok(uid(66));
const dup = await Promise.all([conn(t6, { zone: zdup }), conn(t6, { zone: zdup })]);
await wait(300);
const alive = dup.filter((c) => c.msgs.some((m) => m.t === 'welcome') && !c.msgs.some((m) => m.t === 'bye')).length;
ok(alive === 1, `dasselbe Konto zweimal gleichzeitig: ${alive} Verbindung bleibt`);

// S4: Dungeonsuche, unangemeldete Verbindungen je Adresse
const fs = await Promise.all(Array.from({ length: 6 }, () => conn('', { path: 'finder', hello: false, ip: '10.7.7.7' })));
ok(fs.filter((c) => c.closed === 429).length === 2, `Dungeonsuche: je Adresse höchstens 4 offen (abgewiesen: ${fs.filter((c) => c.closed === 429).length})`);
for (const c of fs) c.ws.close();

// S11: Sperre wirkt ohne Neuverbinden und bleibt bei Störung
const obs = await conn(await tok(uid(3)), { zone: Z(2) });
await get(`/test/mute?uid=${uid(2)}&reason=Test`);
console.log('… warte auf die minütliche Prüfung (bis 70 s)');
let muted = false;
for (let i = 0; i < 70 && !muted; i++) { await wait(1000); muted = b.msgs.some((m) => m.t === 'notice' && m.kind === 'muted'); }
ok(muted, 'Sperre greift ohne Neuverbinden');
await get('/test/fail?on=1');
b.send({ t: 'chat', text: 'gesperrt aber Supabase weg' });
await wait(300);
ok(!obs.all('chat').some((m) => m.text.includes('Supabase weg')) && b.all('notice').length >= 2, 'bei Störung bleibt die bekannte Sperre');
await get('/test/fail?on=0');

for (const c of [obs, b, a2, elsewhere, otherWorld, ...many, ...dup]) c.ws.close();
await wait(100);
console.log(fails ? `${fails} FEHLER` : 'alles ok');
process.exit(fails ? 1 : 0);
