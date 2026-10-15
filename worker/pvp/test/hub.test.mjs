// node worker/pvp/test/hub.test.mjs – Server-Kern der Glutarena mit nachgebauten Verbindungen, Speicher und Uhr
import { ArenaHub } from '../hub.js';
import { TIMING, PVP_MIN_LEVEL, DAILY_REWARDS, BOT_RATING_CAP, START_RATING } from '../../../src/pvp/rules.js';
import { PVP_VERSION } from '../../../src/pvp/protocol.js';
import { arenaStats, maxHitDamage } from '../../../src/pvp/arenaStats.js';

let fails = 0;
const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails++; };
let clock = Date.UTC(2026, 9, 20, 12);
const now = () => clock;
const sock = (name) => ({ name, out: [], closed: null, send(s) { this.out.push(JSON.parse(s)); }, close(code) { this.closed = code; }, last(t) { return [...this.out].reverse().find((m) => m.t === t); }, all(t) { return this.out.filter((m) => m.t === t); } });
const verify = async (tok) => (tok?.startsWith('ok:') ? { uid: tok.slice(3) } : null);
const memStore = () => { const m = new Map(); return { m, get: async (k) => structuredClone(m.get(k)), put: async (k, v) => { m.set(k, structuredClone(v)); } }; };
const send = (hub, s, msg) => hub.message(s, JSON.stringify(msg));
const hubOf = (store = memStore(), extra = {}) => new ArenaHub({ verify, store, now, rnd: () => 0.5, ...extra });

async function join(hub, name, uid, { classId = 'warrior', raceId = 'human', level = 30, queue = true } = {}) {
  const s = sock(name);
  hub.open(s);
  await send(hub, s, { t: 'hello', v: PVP_VERSION, token: `ok:${uid}`, char: { id: 'c' + uid, name, level, classId, raceId } });
  if (queue) await send(hub, s, { t: 'queue' });
  return s;
}
// beide bereit, Gong abgelaufen: Kampf läuft
async function fight(hub, a, b) {
  const id = a.last('match').id;
  await send(hub, a, { t: 'ready', id });
  await send(hub, b, { t: 'ready', id });
  clock += TIMING.countdownMs + 10;
  await hub.tick();
  for (const [s, x] of [[a, 100], [b, 130]]) await send(hub, s, { t: 's', s: [x, 100, 0, 0, 1, 0] });
  return id;
}

// ---------------------------------------------------------------- Anmeldung
{
  const hub = hubOf();
  const low = await join(hub, 'Klein', 'u0', { level: PVP_MIN_LEVEL - 1, queue: false });
  ok(low.last('bye')?.reason === 'level' && low.closed, `unter Stufe ${PVP_MIN_LEVEL}: abgewiesen`);
  const bad = sock('x'); hub.open(bad);
  await send(hub, bad, { t: 'hello', v: PVP_VERSION, token: 'falsch', char: { id: 'c1' } });
  ok(bad.last('bye')?.reason === 'auth', 'ungültiges Token: abgewiesen');
  const old = sock('y'); hub.open(old);
  await send(hub, old, { t: 'hello', v: PVP_VERSION + 1, token: 'ok:u9', char: { id: 'c9' } });
  ok(old.last('bye')?.reason === 'version', 'falsche Version: abgewiesen');
  const a = await join(hub, 'Aria', 'u1', { queue: false });
  ok(a.out[0]?.t === 'welcome' && a.out[0].me.rating === START_RATING, 'welcome mit Startwertung');
}

// ---------------------------------------------------------------- Herausforderer
{
  const store = memStore();
  const hub = hubOf(store);
  const a = await join(hub, 'Aria', 'u1');
  ok(a.last('queued'), 'Suche läuft');
  clock += TIMING.botAfterMs - 1000; await hub.tick();
  ok(!a.last('bot'), 'vor 20 s kein Herausforderer');
  clock += 1500; await hub.tick();
  const bot = a.last('bot');
  ok(bot?.foe?.bot && bot.foe.level === 40 && bot.foe.name !== 'Aria', 'nach 20 s Herausforderer: ' + bot?.foe?.name);
  clock += 3000;
  await send(hub, a, { t: 'botresult', id: bot.id, score: 1, hp: 50 });
  ok(a.last('end')?.result === 'void' && a.last('end').delta === 0, 'Sieg nach 3 s: ungültig, keine Wertung');

  await send(hub, a, { t: 'queue' });
  clock += TIMING.botAfterMs + 10; await hub.tick();
  const bot2 = a.last('bot');
  clock += 40_000;
  await send(hub, a, { t: 'botresult', id: bot2.id, score: 1, hp: 30 });
  const e = a.last('end');
  ok(e?.result === 'win' && e.delta > 0 && e.delta <= 20 && e.gold > 0, `Sieg gegen Herausforderer: +${e?.delta} Wertung (halbe), +${e?.gold} Gold`);
  await send(hub, a, { t: 'botresult', id: bot2.id, score: 1, hp: 30 });
  ok(a.all('end').length === 2, 'Ergebnis zählt nur einmal');

  // Obergrenze: Herausforderer bringen niemanden über BOT_RATING_CAP
  const key = [...store.m.keys()].find((k) => k.startsWith('r:'));
  const rec = store.m.get(key); rec.rating = BOT_RATING_CAP - 2; rec.games = 50; store.m.set(key, rec);
  const a2 = await join(hub, 'Aria', 'u1');
  ok(a.last('bye')?.reason === 'replaced', 'zweite Verbindung desselben Kontos ersetzt die erste');
  clock += TIMING.botAfterMs + 10; await hub.tick();
  const bot3 = a2.last('bot');
  clock += 40_000;
  await send(hub, a2, { t: 'botresult', id: bot3.id, score: 1, hp: 30 });
  ok(a2.last('end')?.me.rating <= BOT_RATING_CAP, `Wertung bleibt bis ${BOT_RATING_CAP}: ${a2.last('end')?.me.rating}`);

  // Verbindung weg mitten im Kampf gegen einen Herausforderer: Niederlage
  await send(hub, a2, { t: 'queue' });
  clock += TIMING.botAfterMs + 10; await hub.tick();
  clock += 10_000;
  const before = store.m.get(key).losses;
  await hub.close(a2);
  ok(store.m.get(key).losses === before + 1, 'Schließen im Kampf gegen Herausforderer zählt als Niederlage');
}

// ---------------------------------------------------------------- Echter Kampf
{
  const store = memStore();
  const hub = hubOf(store);
  const a = await join(hub, 'Aria', 'u1', { classId: 'warrior' });
  const b = await join(hub, 'Borin', 'u2', { classId: 'mage' });
  await hub.tick();
  ok(a.last('match')?.foe.name === 'Borin' && b.last('match')?.foe.name === 'Aria', 'zwei Suchende mit gleicher Wertung: sofort gepaart');
  ok(!a.last('bot') && !b.last('bot'), 'kein Herausforderer, wenn ein echter Gegner da ist');
  const id = a.last('match').id;
  await send(hub, a, { t: 'hit', d: 50 });
  ok(!a.last('hp'), 'Treffer vor dem Gong zählt nicht');
  await fight(hub, a, b);
  ok(a.last('go') && b.last('go'), 'beide bereit: Gong');
  const stA = arenaStats('warrior', 'human'), stB = arenaStats('mage', 'human');
  await send(hub, a, { t: 'hit', d: 60 });
  const hp1 = b.last('hp');
  ok(hp1?.side === 'b' && hp1.hp < stB.maxHp && a.last('hp')?.hp === hp1.hp, `Treffer: Leben bei beiden gleich (${hp1?.hp}/${stB.maxHp})`);
  await send(hub, a, { t: 'hit', d: 60 });
  ok(b.all('hp').length === 1, 'kein zweiter Treffer in der Unverwundbarkeit (0,6 s)');
  clock += 700;
  await send(hub, a, { t: 'hit', d: 1e6 });
  const hp2 = b.last('hp');
  const cap = maxHitDamage(stA) * 1.8 * (1 - stB.damageReduction);
  ok(hp2 && hp1.hp - hp2.hp <= Math.ceil(cap * 1.01), `Riesentreffer wird gekappt: −${hp1.hp - hp2.hp} (höchstens ${Math.round(cap)})`);
  // Budget: viele Treffer schnell hintereinander laufen leer
  let landed = 0;
  for (let i = 0; i < 30; i++) { clock += 650; const n = b.all('hp').length; await send(hub, a, { t: 'hit', d: maxHitDamage(stA) }); if (b.all('hp').length > n) landed++; if (b.last('end')) break; }
  ok(landed < 30, `Schadensbudget greift (${landed} von 30 Höchsttreffern im Abstand von 0,65 s)`);
  // Abstand: zu weit weg trifft nichts
  if (!b.last('end')) {
    await send(hub, b, { t: 's', s: [100 + 2000, 100, 0, 0, 1, 0] });
    clock += 5000;
    const n = b.all('hp').length;
    await send(hub, a, { t: 'hit', d: 10 });
    ok(b.all('hp').length === n, 'Treffer über große Entfernung zählt nicht');
    await send(hub, b, { t: 's', s: [130, 100, 0, 0, 1, 0] });
  }
  for (let i = 0; i < 200 && !b.last('end'); i++) { clock += 1500; await send(hub, a, { t: 'hit', d: maxHitDamage(stA) / 2 }); }
  const ea = a.last('end'), eb = b.last('end');
  ok(ea?.result === 'win' && eb?.result === 'loss' && ea.reason === 'ko', 'K.o.: Sieg und Niederlage');
  ok(ea.delta > 0 && eb.delta < 0 && ea.me.rating === START_RATING + ea.delta, `Wertung ${ea.delta > 0 ? '+' : ''}${ea.delta} / ${eb.delta}`);
  ok(ea.gold > eb.gold && eb.gold > 0, `Gold: Sieger ${ea.gold}, Verlierer ${eb.gold}`);
  const top = await hub.publicTop();
  ok(top[0]?.name === 'Aria' && top.length === 2 && !('k' in top[0]), 'Bestenliste ohne Kontoschlüssel');
  await send(hub, a, { t: 'hit', d: 50 });
  ok(a.all('end').length === 1, 'nach dem Ende keine Treffer mehr');
}

// ---------------------------------------------------------------- Zeit, Abbruch, Nichtantreten
{
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  await fight(hub, a, b);
  await send(hub, a, { t: 'hit', d: 40 });
  clock += TIMING.matchMs; await hub.tick();
  ok(a.last('end')?.result === 'win' && a.last('end').reason === 'time', 'Zeit um: mehr Leben gewinnt');
}
{
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  const id = a.last('match').id;
  await send(hub, a, { t: 'ready', id });
  clock += TIMING.readyMs + 10; await hub.tick();
  ok(a.last('end')?.result === 'void' && a.last('end').delta === 0, 'Gegner nicht angetreten: keine Wertung für den Anwesenden');
  ok(b.last('end')?.result === 'loss' && b.last('end').delta < 0, 'wer nicht antritt, verliert');
}
{
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  await fight(hub, a, b);
  clock += 8000;
  await hub.close(b);
  clock += 2000; await hub.tick();
  ok(!a.last('end'), 'Verbindungsabbruch: kurze Gnadenfrist');
  const b2 = await join(hub, 'Borin', 'u2', { queue: false });
  ok(b2.last('match')?.resume && b2.all('hp').length === 2, 'wieder verbunden: Kampf geht weiter');
  await hub.close(b2);
  clock += TIMING.graceMs + 10; await hub.tick();
  ok(a.last('end')?.result === 'win' && a.last('end').reason === 'left', 'nach der Frist: Sieg für den Gebliebenen');
}
{
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  await fight(hub, a, b);
  clock += 8000;
  await send(hub, b, { t: 'leave' });
  ok(a.last('end')?.result === 'win' && b.last('end')?.result === 'loss', 'Aufgeben: Niederlage');
}

// ---------------------------------------------------------------- Sicherheit
{
  // Unverwundbarkeit nur mit eigener Fähigkeit und nach Abklingzeit
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1', { classId: 'mage' });
  const b = await join(hub, 'Borin', 'u2', { classId: 'warrior' });
  await hub.tick();
  await fight(hub, a, b);
  let landed = 0;
  for (let i = 0; i < 20; i++) {
    clock += 700;
    await send(hub, b, { t: 's', s: [130, 100, 0, 0, 1, 0], fx: [['k', 0, 'shadow_step'], ['k', 0, 'blink']] });
    const n = b.all('hp').length;
    await send(hub, a, { t: 'hit', d: 20 });
    if (b.all('hp').length > n) landed++;
  }
  ok(landed === 20, `fremde Fähigkeiten machen nicht unverwundbar (${landed} von 20 Treffern)`);
  const a2 = await join(hub, 'Cara', 'u3', { classId: 'mage' });
  const b2 = await join(hub, 'Dorn', 'u4', { classId: 'rogue' });
  await hub.tick();
  await fight(hub, a2, b2);
  landed = 0;
  for (let i = 0; i < 20; i++) {
    clock += 700;
    await send(hub, b2, { t: 's', s: [130, 100, 0, 0, 1, 0], fx: [['k', 0, 'shadow_step']] });
    const n = b2.all('hp').length;
    await send(hub, a2, { t: 'hit', d: 20 });
    if (b2.all('hp').length > n) landed++;
  }
  ok(landed >= 15, `Schattenschritt nur nach Abklingzeit (${landed} von 20 Treffern)`);
}
{
  // Dauerschaden: nur Schurken, klein, eigenes Budget
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1', { classId: 'mage' });
  const b = await join(hub, 'Borin', 'u2', { classId: 'warrior' });
  await hub.tick();
  await fight(hub, a, b);
  for (let i = 0; i < 10; i++) { clock += 100; await send(hub, a, { t: 'hit', d: 1e5, dot: true }); }
  ok(!b.last('hp'), 'Magier kann keinen Dauerschaden melden');
  const r = await join(hub, 'Rika', 'u3', { classId: 'rogue' });
  const w = await join(hub, 'Wulf', 'u4', { classId: 'warrior' });
  await hub.tick();
  await fight(hub, r, w);
  for (let i = 0; i < 20; i++) { clock += 100; await send(hub, r, { t: 'hit', d: 1e5, dot: true }); }
  const ticks = w.all('hp');
  const stR = arenaStats('rogue', 'human');
  const big = Math.max(...ticks.map((x) => x.dmg));
  ok(ticks.length <= 9 && big <= Math.ceil(stR.power * 0.145 * 0.35 * 1.25 * 1.01 + 1), `Gifttakte begrenzt: ${ticks.length} Takte in 2 s, höchstens ${big}`);
}
{
  // Absprache: Zweitkonto gibt sofort auf
  const hub = hubOf();
  const a = await join(hub, 'Haupt', 'u1');
  const b = await join(hub, 'Zweit', 'u2');
  await hub.tick();
  const id = a.last('match').id;
  await send(hub, a, { t: 'ready', id });
  await send(hub, b, { t: 'leave' });
  ok(a.last('end')?.delta === 0 && a.last('end').gold === 0 && b.last('end')?.delta < 0, 'Aufgeben vor dem Gong: kein Sieg für den anderen');
  const c = await join(hub, 'Haupt2', 'u3');
  const d = await join(hub, 'Zweit2', 'u4');
  await hub.tick();
  await fight(hub, c, d);
  clock += 2000;
  await send(hub, d, { t: 'leave' });
  ok(c.last('end')?.delta === 0, 'Aufgeben in den ersten Sekunden: kein Sieg für den anderen');
  // dasselbe Paar höchstens zweimal am Tag gewertet
  let rated = 0;
  for (let i = 0; i < 4; i++) {
    await send(hub, c, { t: 'queue' }); await send(hub, d, { t: 'queue' });
    await hub.tick();
    if (!c.last('match') || c.last('end')?.id === c.last('match').id) { clock += TIMING.botAfterMs + 10; await hub.tick(); break; }
    await fight(hub, c, d);
    clock += 8000;
    await send(hub, d, { t: 'leave' });
    if (c.last('end')?.delta > 0) rated++;
  }
  ok(rated <= 1, `dasselbe Paar wird nicht beliebig oft gewertet (${rated} weitere)`);
}
{
  // Gespeicherter Charakter zählt; sonst Angaben des Clients, aber höchstens 8 Helden je Konto und Saison
  const hub = hubOf(memStore(), { profile: async (uid, cid) => (cid === 'cu1' ? { name: 'Echt', level: 30, classId: 'mage', raceId: 'elf' } : null) });
  const a = await join(hub, 'Falsch', 'u1', { queue: false, level: 5 });
  ok(a.out[0]?.t === 'welcome' && hub.conns.get(a).char.name === 'Echt' && hub.conns.get(a).char.classId === 'mage', 'gespeicherter Charakter: Name, Stufe und Klasse vom Server');
  const n = sock('n'); hub.open(n);
  await send(hub, n, { t: 'hello', v: PVP_VERSION, token: 'ok:u2', char: { id: 'neu1', name: 'Neuling', level: 20, classId: 'rogue', raceId: 'elf' } });
  ok(n.out[0]?.t === 'welcome', 'Charakter noch nicht in der Cloud: trotzdem Zutritt');
  let last = null;
  for (let i = 2; i <= 9; i++) { last = sock('n' + i); hub.open(last); await send(hub, last, { t: 'hello', v: PVP_VERSION, token: 'ok:u2', char: { id: 'neu' + i, name: 'Held' + i, level: 20, classId: 'rogue', raceId: 'elf' } }); }
  ok(last.last('bye')?.reason === 'many', 'neunter Held desselben Kontos: abgewiesen');
  const back = sock('b'); hub.open(back);
  await send(hub, back, { t: 'hello', v: PVP_VERSION, token: 'ok:u2', char: { id: 'neu1', name: 'Neuling', level: 20, classId: 'rogue', raceId: 'elf' } });
  ok(back.out[0]?.t === 'welcome', 'bekannter Held desselben Kontos: weiter Zutritt');
}
{
  // Bestenliste über die Verbindung ohne Kontoschlüssel und gedrosselt
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1', { queue: false });
  for (let i = 0; i < 5; i++) await send(hub, a, { t: 'top' });
  ok(a.all('top').length === 1, 'top höchstens alle 2 s');
  ok(a.last('top').list.every((x) => !('k' in x)), 'top ohne Kontoschlüssel');
}
{
  // zweites Fenster mitten im Kampf: alter Kämpfer gilt als weg, Wiederverbinden übernimmt
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  await fight(hub, a, b);
  clock += 8000;
  const b2 = await join(hub, 'Borin', 'u2', { queue: false });
  ok(b.last('bye')?.reason === 'replaced' && b2.last('match')?.resume, 'zweites Fenster übernimmt den Kampf');
  const b3s = sock('b3'); hub.open(b3s);
  await send(hub, b3s, { t: 'hello', v: PVP_VERSION, token: 'ok:u2', char: { id: 'anders', name: 'Anders', level: 30, classId: 'mage', raceId: 'elf' } });
  clock += TIMING.graceMs + 10; await hub.tick();
  ok(a.last('end')?.result === 'win', 'anderer Charakter im zweiten Fenster: Kampf verloren nach der Frist');
}

// ---------------------------------------------------------------- Wertungsfenster, Tagesbelohnung, Takt
{
  const store = memStore();
  const hub = hubOf(store);
  const a = await join(hub, 'Hoch', 'u1');
  hub.conns.get(a).rec.rating = 1600;
  const b = await join(hub, 'Neu', 'u2');
  await hub.tick();
  ok(!a.last('match'), 'großer Wertungsunterschied: erst nicht gepaart');
  clock += 15_000; await hub.tick();
  ok(!a.last('match') && !a.last('bot'), 'nach 15 s noch immer nicht');
  clock += 5_100; await hub.tick();
  ok(a.last('bot') && b.last('bot'), 'nach 20 s je ein Herausforderer statt eines unfairen Kampfes');
}
{
  const hub = hubOf();
  const a = await join(hub, 'Aria', 'u1');
  let golds = 0;
  for (let i = 0; i < DAILY_REWARDS + 2; i++) {
    if (i) await send(hub, a, { t: 'queue' });
    clock += TIMING.botAfterMs + 10; await hub.tick();
    const id = a.last('bot').id;
    clock += 30_000;
    await send(hub, a, { t: 'botresult', id, score: 0, hp: 0 });
    if (a.last('end').gold > 0) golds++;
  }
  ok(golds === DAILY_REWARDS, `Gold nur für die ersten ${DAILY_REWARDS} Kämpfe am Tag (${golds})`);
  ok(a.last('end').me.daily === DAILY_REWARDS, 'Tageszähler wird gemeldet');
}
{
  // Ein Takt, der auf den Speicher wartet, läuft nicht doppelt
  let release;
  const store = memStore();
  const slow = { ...store, put: (k, v) => (k.startsWith('r:') ? new Promise((r) => { release = () => { store.put(k, v).then(r); }; }) : store.put(k, v)) };
  const hub = hubOf(slow);
  const a = await join(hub, 'Aria', 'u1');
  const b = await join(hub, 'Borin', 'u2');
  await hub.tick();
  const id = a.last('match').id;
  await send(hub, a, { t: 'ready', id });
  clock += TIMING.readyMs + 10;
  const t1 = hub.tick();
  const t2 = hub.tick();
  await new Promise((r) => setTimeout(r, 0));
  while (release) { const r = release; release = null; r(); await new Promise((x) => setTimeout(x, 0)); }
  await Promise.all([t1, t2]);
  ok(b.all('end').length === 1 && a.all('end').length === 1, 'zwei Takte gleichzeitig: Kampf endet einmal');
}

console.log(fails ? `${fails} Fehler` : 'alle Prüfungen bestanden');
process.exit(fails ? 1 : 0);
