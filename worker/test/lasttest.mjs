// Lasttest des Welt-Servers: viele Bot-Spieler per WebSocket gegen `wrangler dev` + mockauth.mjs.
//   node worker/test/mockauth.mjs &
//   npx wrangler dev --var SUPABASE_URL:http://127.0.0.1:54399 --var SUPABASE_SERVICE_ROLE_KEY:sb_secret_test
//   node worker/test/lasttest.mjs --bots 60 --seconds 60 [--zone emberhollow] [--move 0.7] [--same-ip] [--ramp 3000]
// Jeder Bot verhält sich wie ein Spieler: Anmeldung, 8 Zustände/s beim Laufen (sonst alle 5 s), ab und zu Kampfereignisse,
// Chat und Aussehen. Gemessen werden Anmeldungen (Welt, voll, abgewiesen), Nachrichten je Sekunde in beide Richtungen,
// Verzögerung vom Senden eines Zustands bis zur Ankunft bei den anderen (Zeitstempel im Zustand), Lücken (verworfene
// Zustände), Ratelimit-Treffer (HTTP 429) und die CPU-Zeit des workerd-Prozesses (alle Durable Objects zusammen).
// Ergebnis als Text und, mit --json <datei>, als JSON.
import WebSocket from 'ws';
import fs from 'node:fs';
import { SEND_HZ, IDLE_RESEND_S } from '../../src/net/protocol.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const BOTS = Number(arg('bots', 60)), SECONDS = Number(arg('seconds', 60)), ZONE = arg('zone', 'emberhollow');
const MOVE = Number(arg('move', 0.7)), RAMP = Number(arg('ramp', 3000)), SAME_IP = arg('same-ip', false) === true;
const HOST = arg('host', '127.0.0.1:8787'), MOCK = arg('mock', 'http://127.0.0.1:54399'), OUT = arg('json', null);
const W = `ws://${HOST}/net/ws`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = (n) => `${String(n).padStart(8, '0')}-1000-4000-8000-000000000000`;
const tok = async (sub) => (await (await fetch(`${MOCK}/mint?sub=${sub}&email=bot${sub.slice(0, 8)}@x.de`)).json()).token;
const NAMES = ['Arin', 'Brana', 'Corvin', 'Dalia', 'Eskel', 'Fenna', 'Garrik', 'Hela', 'Ivor', 'Jora', 'Kael', 'Liska'];
const CLASSES = ['warrior', 'mage', 'ranger', 'rogue'];

// CPU-Zeit (ms) aller workerd-Prozesse (die Durable Objects laufen darin), aus /proc (nur Linux)
function workerdCpuMs() {
  let t = 0, found = 0;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0];
      if (!/[\\/]workerd$/.test(cmd)) continue;
      const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
      t += (Number(f[11]) + Number(f[12])) * 10; // Ticks à 10 ms
      found++;
    } catch { /* Prozess weg */ }
  }
  return found ? t : NaN;
}

const stats = { welcome: 0, full: 0, auth: 0, http: {}, kicked: 0, replaced: 0, sent: 0, recv: 0, recvBytes: 0, states: 0, lat: [], gaps: 0, worlds: {}, chat: 0, looks: 0 };
const bots = [];

// Wie der Client (src/net/NetClient.js): bei Fehlschlag (429, Netz) mit wachsender Wartezeit und Zufall erneut versuchen
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
async function botWithRetry(i, token) {
  for (let attempt = 0; ; attempt++) {
    const b = await bot(i, token);
    b.attempts = attempt + 1;
    if (b.id != null || attempt >= 5 || b.failed !== 'http') return b;
    await wait(BACKOFF_MS[attempt] * (0.8 + Math.random() * 0.4));
  }
}

function bot(i, token) {
  return new Promise((res) => {
    const headers = { 'CF-Connecting-IP': SAME_IP ? '203.0.113.7' : `198.51.${(i >> 8) & 255}.${i & 255}` };
    const ws = new WebSocket(`${W}?zone=${ZONE}&world=auto`, { headers });
    const b = { i, ws, id: null, world: null, moving: Math.random() < MOVE, x: 400 + (i % 10) * 30, y: 300 + Math.floor(i / 10) * 30, seq: 0, lastSeen: new Map(), timers: [] };
    const name = `${NAMES[i % NAMES.length]}${i}`.replace(/\d/g, (d) => 'abcdefghij'[d]);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', v: 2, token, char: { id: `c${i}`, name, level: 1 + (i % 40) }, look: { raceId: 'human', classId: CLASSES[i % 4], appearance: { variant: i % 4 } }, s: [b.x, b.y, 1, 'idle', 0, 0, Date.now()] }));
    });
    ws.on('message', (d) => {
      const now = Date.now();
      const s = d.toString();
      stats.recv++; stats.recvBytes += s.length;
      if (s === 'pong') return;
      const m = JSON.parse(s);
      if (m.t === 'welcome') { b.id = m.id; b.world = m.world; stats.welcome++; stats.worlds[m.world] = (stats.worlds[m.world] ?? 0) + 1; res(b); }
      else if (m.t === 'full') { stats.full++; res(b); }
      else if (m.t === 'bye') { if (m.reason === 'auth') stats.auth++; else if (m.reason === 'kick') stats.kicked++; else if (m.reason === 'replaced') stats.replaced++; res(b); }
      else if (m.t === 'u') {
        for (const e of m.s) {
          if (e[0] === b.id) continue;
          stats.states++;
          stats.lat.push(now - e[7]);
          // e[5] = laufende Nummer des Senders: Sprünge > 1 heißen, dass ein Zustand unterwegs ersetzt oder verworfen wurde
          const prev = b.lastSeen.get(e[0]);
          if (prev != null && e[5] > prev + 1) stats.gaps += e[5] - prev - 1;
          b.lastSeen.set(e[0], e[5]);
        }
      } else if (m.t === 'chat') stats.chat++;
      else if (m.t === 'look') stats.looks++;
    });
    ws.on('unexpected-response', (req, r) => { b.failed = 'http';
      // 429 vom Worker (NET_LIMITER, JSON) oder vom Shard (zu viele offene Anmeldungen je Adresse, Text)
      let body = ''; r.on('data', (c) => { body += c; }); r.on('end', () => { const k = r.statusCode === 429 ? (body.includes('rate_limited') ? '429 NET_LIMITER' : '429 Shard') : String(r.statusCode); stats.http[k] = (stats.http[k] ?? 0) + 1; res(b); });
    });
    ws.on('error', () => res(b));
    ws.on('close', () => res(b));
  });
}

function drive(b) {
  if (b.id == null) return;
  const send = (m) => { try { b.ws.send(JSON.stringify(m)); stats.sent++; } catch { /* zu */ } };
  const step = () => {
    b.seq++;
    if (b.moving) { b.x += Math.round(Math.cos(b.seq / 9 + b.i) * 6); b.y += Math.round(Math.sin(b.seq / 11 + b.i) * 6); }
    const fight = b.moving && b.seq % 24 === 0;
    send({ t: 's', s: [b.x, b.y, b.seq % 40 < 20 ? 1 : -1, fight ? 'atk1' : b.moving ? 'run' : 'idle', b.seq, fight ? 4 : 0, Date.now()],
      ...(fight ? { fx: [['a', Date.now(), 0, 785, 2, b.x, b.y, 8, 7]] } : {}) });
  };
  b.timers.push(setInterval(step, b.moving ? 1000 / SEND_HZ : IDLE_RESEND_S * 1000));
  // Chat etwa alle 40 s, Aussehen etwa alle 90 s, Ping alle 20 s wie der Client
  b.timers.push(setInterval(() => { if (Math.random() < 0.25) send({ t: 'chat', text: `Hallo aus Welt ${b.world}` }); }, 10_000));
  b.timers.push(setInterval(() => { if (Math.random() < 0.2) send({ t: 'look', level: 1 + (b.i % 40), look: { raceId: 'human', classId: CLASSES[b.i % 4], appearance: { variant: (b.seq >> 4) % 4 } } }); }, 18_000));
  b.timers.push(setInterval(() => { try { b.ws.send('ping'); } catch { /* zu */ } }, 20_000));
}

const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log(`Lasttest: ${BOTS} Bots, ${SECONDS} s, Zone ${ZONE}, ${Math.round(MOVE * 100)} % laufen, ${SAME_IP ? 'eine gemeinsame Adresse' : 'je Bot eigene Adresse'}`);
const tokens = await Promise.all(Array.from({ length: BOTS }, (_, i) => tok(uid(i + 1))));
const cpu0 = workerdCpuMs();
const t0 = Date.now();
const joins = [];
for (let i = 0; i < BOTS; i++) {
  joins.push(botWithRetry(i, tokens[i]).then((b) => { bots.push(b); return b; }));
  await wait(RAMP / BOTS);
}
const joined = await Promise.all(joins);
const joinMs = Date.now() - t0;
console.log(`Anmeldung fertig nach ${joinMs} ms (höchstens ${Math.max(...joined.map((b) => b.attempts))} Versuche je Bot): ${stats.welcome} drin, ${stats.full} voll, ${stats.auth} abgewiesen, HTTP ${JSON.stringify(stats.http)}, Welten ${JSON.stringify(stats.worlds)}`);
const cpu1 = workerdCpuMs();
for (const b of joined) drive(b);
// Messung erst nach 3 s Einschwingen
await wait(3000);
Object.assign(stats, { sent: 0, recv: 0, recvBytes: 0, states: 0, lat: [], gaps: 0, chat: 0, looks: 0 });
const cpu2 = workerdCpuMs(), m0 = Date.now();
await wait(SECONDS * 1000);
const secs = (Date.now() - m0) / 1000, cpu3 = workerdCpuMs();
for (const b of joined) { b.timers.forEach(clearInterval); try { b.ws.close(); } catch { /* zu */ } }
const open = joined.filter((b) => b.ws.readyState === WebSocket.OPEN || b.ws.readyState === WebSocket.CLOSING).length;

const r = {
  bots: BOTS, seconds: Math.round(secs), zone: ZONE, moving: joined.filter((b) => b.id != null && b.moving).length, sameIp: SAME_IP,
  joined: stats.welcome, maxAttempts: Math.max(...joined.map((b) => b.attempts)), full: stats.full, rejected: stats.auth, http: stats.http, worlds: stats.worlds, kicked: stats.kicked, replaced: stats.replaced,
  joinMs, joinCpuMs: Math.round(cpu1 - cpu0),
  inPerS: Math.round(stats.sent / secs), outPerS: Math.round(stats.recv / secs), outKBperS: Math.round(stats.recvBytes / secs / 1024),
  statesPerS: Math.round(stats.states / secs),
  latencyMs: { p50: pct(stats.lat, 0.5), p95: pct(stats.lat, 0.95), p99: pct(stats.lat, 0.99), max: pct(stats.lat, 1) },
  gaps: stats.gaps, chatDelivered: stats.chat, looksDelivered: stats.looks,
  cpuMsPerS: Math.round((cpu3 - cpu2) / secs), cpuPercent: Math.round((cpu3 - cpu2) / secs / 10),
  stillOpenAtEnd: open,
};
console.log(`Nachrichten an den Server: ${r.inPerS}/s · vom Server: ${r.outPerS}/s (${r.outKBperS} KB/s) · Fremdzustände empfangen: ${r.statesPerS}/s`);
console.log(`Verzögerung Senden→Ankunft: p50 ${r.latencyMs.p50} ms · p95 ${r.latencyMs.p95} ms · p99 ${r.latencyMs.p99} ms · max ${r.latencyMs.max} ms`);
console.log(`Lücken (ersetzte/verworfene Zustände): ${r.gaps} · Chat zugestellt: ${r.chatDelivered} · Aussehen: ${r.looksDelivered} · rausgeworfen: ${r.kicked}`);
console.log(`CPU workerd: ${r.cpuMsPerS} ms/s (${r.cpuPercent} % eines Kerns) · Anmeldung: ${r.joinCpuMs} ms CPU`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
await wait(300);
process.exit(0);
