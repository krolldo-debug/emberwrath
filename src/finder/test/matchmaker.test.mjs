// Node-Test der Gruppenbildung: node src/finder/test/matchmaker.test.mjs
import assert from 'node:assert/strict';
import { Matchmaker } from '../matchmaker.js';
import { fillWithMercs } from '../mercs.js';

let now = 0;
const clock = () => now;
const T = { botFillMs: [8000, 8000], humanWaitMs: 45000, partialMs: 20000, readyMs: 30000, statsMs: 4000 };
const P = (id, role = 'dps', classId = role === 'tank' ? 'warrior' : 'mage', dungeonId = 'catacombs') => ({ id, name: `Spieler${id}`, level: 5, classId, raceId: 'human', role, dungeonId });
const msgs = (ev, t) => ev.filter((e) => e.msg.t === t);

// 1. Allein in der Suche: nach 8 s Söldner-Gruppe (1 Tank + 1 Schaden dazu)
{
  now = 0;
  const mm = new Matchmaker({ now: clock, timing: T, seed: () => 42 });
  mm.add(P('a'));
  now = 7000; assert.equal(mm.tick().length, 0);
  now = 8000; const ev = mm.tick();
  const p = msgs(ev, 'proposal');
  assert.equal(p.length, 1);
  const g = p[0].msg.group;
  assert.equal(g.members.length, 3);
  assert.equal(g.members[0].role, 'tank');
  assert.equal(g.members.filter((m) => m.kind === 'merc').length, 2);
  assert.equal(g.members.filter((m) => m.kind === 'player').length, 1);
  const start = mm.accept('a', g.id, true);
  assert.equal(msgs(start, 'start').length, 1);
  assert.equal(mm.tickets.size, 0);
  console.log('ok  Söldner füllen nach kurzer Suche');
}
// 2. Ohne humanGroups: zwei Spieler bekommen je eine eigene Gruppe, Zahlen sind trotzdem echt
{
  now = 0;
  const mm = new Matchmaker({ now: clock, timing: T });
  mm.add(P('a', 'tank')); mm.add(P('b'));
  assert.equal(mm.stats('catacombs').searching, 2);
  now = 8000; const ev = msgs(mm.tick(), 'proposal');
  assert.equal(ev.length, 2);
  assert.notEqual(ev[0].msg.group.id, ev[1].msg.group.id);
  console.log('ok  ohne geteilte Gegner: eigene Gruppen');
}
// 3. Mit humanGroups: 1 Tank + 2 Schaden -> sofort echte Gruppe, keine Söldner
{
  now = 0;
  const mm = new Matchmaker({ humanGroups: true, now: clock, timing: T });
  mm.add(P('t', 'tank')); mm.add(P('d1')); mm.add(P('d2', 'dps', 'rogue'));
  const ev = msgs(mm.tick(), 'proposal');
  assert.equal(ev.length, 3);
  const g = ev[0].msg.group;
  assert.equal(g.members.filter((m) => m.kind === 'merc').length, 0);
  mm.accept('t', g.id, true); mm.accept('d1', g.id, true);
  const s = mm.accept('d2', g.id, true);
  assert.equal(msgs(s, 'start').length, 3);
  console.log('ok  echte Spieler zuerst');
}
// 4. humanGroups: zwei passende Spieler warten länger, nach partialMs Teilgruppe + 1 Söldner
{
  now = 0;
  const mm = new Matchmaker({ humanGroups: true, now: clock, timing: T });
  mm.add(P('t', 'tank')); mm.add(P('d1'));
  now = 8000; assert.equal(msgs(mm.tick(), 'proposal').length, 0, 'nicht nach 8 s auffüllen, wenn andere suchen');
  now = 20000; const ev = msgs(mm.tick(), 'proposal');
  assert.equal(ev.length, 2);
  assert.equal(ev[0].msg.group.members.filter((m) => m.kind === 'merc').length, 1);
  console.log('ok  Teilgruppe nach 20 s');
}
// 5. Ablehnen: der andere sucht weiter mit alter Wartezeit
{
  now = 0;
  const mm = new Matchmaker({ humanGroups: true, now: clock, timing: T });
  mm.add(P('t', 'tank')); mm.add(P('d1')); mm.add(P('d2'));
  const g = msgs(mm.tick(), 'proposal')[0].msg.group;
  const ev = mm.accept('d1', g.id, false);
  assert.equal(msgs(ev, 'requeued').length, 2);
  assert.equal(mm.tickets.size, 2);
  assert.equal(mm.tickets.get('t').since, 0);
  console.log('ok  Ablehnen -> weiter suchen');
}
// 6. Bereitschaft läuft ab
{
  now = 0;
  const mm = new Matchmaker({ now: clock, timing: T });
  mm.add(P('a'));
  now = 8000; mm.tick();
  now = 38001; const ev = mm.tick();
  assert.equal(msgs(ev, 'cancelled').length, 1);
  assert.equal(mm.tickets.size, 0);
  console.log('ok  Bereitschaft abgelaufen');
}
// 7. Söldner: Tank ist Krieger, Namen eindeutig, gleicher Samen -> gleiche Söldner
{
  const a = fillWithMercs([{ name: 'Zolva', role: 'dps', classId: 'mage', level: 12 }], { seed: 7 });
  const b = fillWithMercs([{ name: 'Zolva', role: 'dps', classId: 'mage', level: 12 }], { seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a[0].role, 'tank'); assert.equal(a[0].classId, 'warrior');
  const names = new Set();
  for (let s = 0; s < 500; s++) for (const m of fillWithMercs([{ name: 'X', role: 'tank', classId: 'warrior', level: 30 }], { seed: s })) {
    assert.ok(m.level >= 29 && m.level <= 32, `Stufe ${m.level}`);
    names.add(m.name);
  }
  assert.ok(names.size > 60);
  console.log('ok  Söldner reproduzierbar, Stufe passend,', names.size, 'Namen');
}
