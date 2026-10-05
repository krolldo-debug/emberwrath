// node worker/finder/test/hub.test.mjs – Server-Kern der Dungeonsuche mit nachgebauten Verbindungen und Uhr
import { FinderHub } from '../hub.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
let clock = 1_000_000;
const now = () => clock;
const wait = () => new Promise((r) => setTimeout(r, 0));
const sock = (name) => ({ name, out: [], closed: null, send(s) { this.out.push(JSON.parse(s)); }, close(code) { this.closed = code; }, last(t) { return [...this.out].reverse().find((m) => m.t === t); } });
const verify = async (tok) => (tok?.startsWith('ok:') ? { uid: tok.slice(3) } : null);

async function join(hub, name, uid, { classId = 'mage', role = 'dps', dungeonId = 'catacombs', v = 1 } = {}) {
  const s = sock(name);
  hub.open(s);
  // wie der Client: hello und queue direkt hintereinander, ohne auf welcome zu warten
  const p = hub.message(s, JSON.stringify({ t: 'hello', v, token: `ok:${uid}`, char: { id: 'c' + uid, name, level: 6, classId, raceId: 'human' } }));
  await hub.message(s, JSON.stringify({ t: 'queue', dungeonId, role }));
  await p;
  await wait();
  return s;
}

{
  const hub = new FinderHub({ verify, now });
  const a = await join(hub, 'Aria', 'u1');
  ok(a.out[0]?.t === 'welcome' && a.last('queued')?.dungeonId === 'catacombs', 'hello + queue ohne Warten: welcome, dann queued');
  clock += 5000; hub.tick();
  ok(!a.last('proposal'), 'nach 5 s noch keine Gruppe (Suche nach echten Spielern)');
  ok(a.last('stats')?.searching === 1, 'Suchstand wird gemeldet');
  clock += 9000; hub.tick();
  const pr = a.last('proposal');
  ok(pr && pr.you && pr.group.members.length === 3, 'nach 14 s Gruppe mit Söldnern');
  ok(pr.group.members.filter((m) => m.kind === 'merc').length === 2 && pr.group.members.find((m) => m.role === 'tank')?.classId === 'warrior', '2 Söldner, Tank ist Krieger');
  ok(pr.group.members.find((m) => m.kind === 'player')?.ticketId === pr.you, 'you markiert den eigenen Platz');
  await hub.message(a, JSON.stringify({ t: 'accept', groupId: pr.group.id, ok: true }));
  ok(a.last('start')?.group.id === pr.group.id, 'bereit -> start');
  ok(hub.mm.tickets.size === 0, 'Ticket nach dem Start entfernt');
  hub.close(a);
  ok(hub.size === 0, 'Verbindung aufgeräumt');
}

{
  const hub = new FinderHub({ verify, now });
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  ok(b.last('queued')?.searching === 2, 'zweiter Suchender sieht 2 echte Spieler');
  const a2 = await join(hub, 'Aria', 'u1');
  ok(a.last('bye')?.reason === 'replaced' && a.closed, 'gleiches Konto: alte Suche wird ersetzt');
  ok(hub.mm.tickets.size === 2 && hub.size === 2, 'nur ein Ticket pro Konto');
  await hub.message(a2, JSON.stringify({ t: 'cancel' }));
  ok(hub.mm.tickets.size === 1, 'cancel meldet ab');
  clock += 20000; hub.tick();
  const pr = b.last('proposal');
  ok(pr, 'Borin bekommt eine Gruppe');
  clock += 31000; hub.tick();
  ok(b.last('cancelled')?.reason === 'timeout', 'Bereitschaft abgelaufen -> cancelled timeout');
}

{
  const hub = new FinderHub({ verify, now });
  const bad = sock('Fake'); hub.open(bad);
  await hub.message(bad, JSON.stringify({ t: 'hello', v: 1, token: 'nope', char: {} }));
  ok(bad.last('bye')?.reason === 'auth' && bad.closed, 'ungültiges Token abgewiesen');
  const old = sock('Alt'); hub.open(old);
  await hub.message(old, JSON.stringify({ t: 'hello', v: 99, token: 'ok:u9' }));
  ok(old.last('bye')?.reason === 'version', 'falsche Version abgewiesen');
  const silent = sock('Still'); hub.open(silent);
  clock += 11000; hub.tick();
  ok(silent.closed, 'ohne hello nach 10 s getrennt');
  const m = await join(hub, 'Mira', 'u3', { classId: 'mage', role: 'tank' });
  ok(hub.mm.tickets.values().next().value?.role === 'dps', 'Magier kann nicht Tank sein -> Schaden');
  const x = await join(hub, 'Xan', 'u4', { dungeonId: '../etc' });
  ok(x.last('cancelled')?.reason === 'invalid', 'ungültiger Dungeon abgewiesen');
  for (let i = 0; i < 40; i++) await hub.message(m, JSON.stringify({ t: 'noise' }));
  ok(!m.closed, 'Flut wird gedrosselt, nicht getrennt');
}

{
  const hub = new FinderHub({ verify, now, humanGroups: true });
  const t = await join(hub, 'Tork', 'u1', { classId: 'warrior', role: 'tank' });
  const a = await join(hub, 'Aria', 'u2');
  const b = await join(hub, 'Borin', 'u3', { classId: 'ranger' });
  hub.tick();
  const pr = t.last('proposal');
  ok(pr && pr.group.members.every((m) => m.kind === 'player'), 'humanGroups: drei echte Spieler sofort zusammen');
  ok(a.last('proposal')?.you !== b.last('proposal')?.you, 'jeder bekommt sein eigenes you');
  await hub.message(a, JSON.stringify({ t: 'accept', groupId: pr.group.id, ok: false }));
  ok(t.last('requeued') && b.last('requeued') && a.last('cancelled')?.reason === 'declined', 'Ablehnen: die anderen suchen weiter');
}

// Name und Stufe vom Server (Speicherstand), gesperrte Namen
{
  const profiles = { u1: { name: 'Aria', level: 12 } };
  const slow = async (uid) => { await new Promise((r) => setTimeout(r, 20)); return profiles[uid] ?? null; };
  const hub = new FinderHub({ verify, profile: slow, now, humanGroups: true });
  const s1 = sock('fake');
  hub.open(s1);
  const p = hub.message(s1, JSON.stringify({ t: 'hello', v: 1, token: 'ok:u1', char: { id: 'c1', name: 'Admin', level: 99, classId: 'mage', raceId: 'human' } }));
  await hub.message(s1, JSON.stringify({ t: 'queue', dungeonId: 'catacombs', role: 'dps' }));
  await p; await wait();
  const t1 = [...hub.mm.tickets.values()][0];
  ok(s1.last('queued') && t1?.name === 'Aria' && t1.level === 13, `Speicherstand gewinnt: ${t1?.name} Stufe ${t1?.level} (Client wollte Admin 99)`);
  const s2 = sock('admin');
  hub.open(s2);
  const p2 = hub.message(s2, JSON.stringify({ t: 'hello', v: 1, token: 'ok:u2', char: { id: 'c2', name: 'Ａｄｍｉｎ', level: 99, classId: 'mage', raceId: 'human' } }));
  await hub.message(s2, JSON.stringify({ t: 'queue', dungeonId: 'catacombs', role: 'dps' }));
  await p2; await wait();
  const t2 = [...hub.mm.tickets.values()].find((t) => t.id !== t1.id);
  ok(t2?.name === 'Abenteurer' && t2.level === 40, `ohne Speicherstand: Name „${t2?.name}“, Stufe ${t2?.level}`);
}

console.log(fails ? `${fails} Fehler` : 'alles grün');
process.exit(fails ? 1 : 0);
