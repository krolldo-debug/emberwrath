// Automatischer Durchlauf Stufe 1 → 40 im echten Spiel, schneller als Echtzeit, mit Langeweile-Messung.
//   python3 -m http.server 8121 --bind 127.0.0.1   (im Repo-Ordner)
//   node tools/durchlauf/start.mjs [--class=warrior] [--to=40] [--hours=14] [--out=start.json] [--shots=ordner] [--v] [--from=<questId>]
// Ein neuer Held (Stufe 1, Startausrüstung) spielt mit tools/durchlauf/bot.js alle Quests bis Stufe 40.
// Zusätzlich zu run.mjs wird gemessen, wo es zäh wird:
//   - je Quest: Art der Ziele, Dauer, Zone, Laufen/Kämpfen-Anteil
//   - Zeitleiste der „Neuigkeiten“ (Stufe, neue Fähigkeit, neue Zone, Boss, Dungeon, bessere Ausrüstung, Reittier)
//     und die längsten Strecken ohne Neuigkeit
//   - 5-Minuten-Fenster: Kills, Quests, EP, Laufen/Kämpfen/Leerlauf
//   - Serien gleichartiger Quests (z. B. dreimal hintereinander „töte X“)
// Mit --shots=<ordner> entstehen Bildschirmfotos (Handy quer) bei jeder neuen Zone und Stufe 1–12,
// mit --early=<s> zusätzlich alle 8 Spielsekunden bis zu dieser Zeit (erste Minuten).
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
import { writeFileSync, mkdirSync } from 'node:fs';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const cls = opt.class ?? 'warrior', hours = Number(opt.hours ?? 14), to = Number(opt.to ?? 40), out = opt.out ?? `start-${cls}.json`;
const base = opt.url ?? 'http://127.0.0.1:8121';
const shots = opt.shots ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, locale: 'de-DE', deviceScaleFactor: 1 })).newPage();
const errors = [];
p.on('pageerror', (e) => { errors.push(e.message); console.log('ERR', e.message, e.stack?.split('\n').slice(1, 3).join(' | ')); });
p.on('console', (m) => { const t = m.text(); if (t.startsWith('[bot]')) console.log(t.slice(6)); else if ((m.type() === 'error' || m.type() === 'warning') && !t.startsWith('Canvas2D')) { errors.push(t); if (errors.length < 30) console.log('KONSOLE', m.type(), t.slice(0, 200)); } });
await p.goto(`${base}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 60000 });

await p.evaluate(async ({ cls, verbose, to, wantShots, early, from }) => {
  const g = window.emberfall; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (s) => console.log('[bot] ' + s);
  g.prefs.set('muted', true); g.prefs.set('guidePath', true);
  const acc = g.save.createAccount('Durchlauf'); g.login(acc.id);
  g.newGame({ character: { name: 'Durchlauf', raceId: 'human', classId: cls } });
  await wait(2500);
  const s = g.state, c = g.scenes.current.content;
  const { QUESTS_STARS } = await import('/src/progression/questsStars.js');
  const star = new Set(Object.keys(QUESTS_STARS));
  const ids = c.all('quest').filter((d) => !star.has(d.id) && !d.retired && (d.level ?? 1) <= to).map((d) => d.id);
  const { talentsFor } = await import('/src/character/talents.js');
  // --from=<questId>: alle Quests mit kleinerer Stufe gelten als erledigt, Held auf (Stufe der Quest − 1) mit
  // Ausrüstung dieser Stufe (ungewöhnlich, Waffe selten), Start beim Questgeber. Für gezielte Boss- und Abschnittsprüfungen.
  if (from) {
    const xp = await import('/src/progression/xp.js');
    const fd = c.find('quest', from), lv = Math.max(1, (fd.level ?? 2) - 1);
    const q = s.slices.quests;
    for (const d of c.all('quest')) if (!star.has(d.id) && !d.repeatable && (d.level ?? 1) < fd.level && !q.completed.includes(d.id)) q.completed.push(d.id);
    const need = (id) => { for (const r of c.find('quest', id)?.requires ?? []) { if (!q.completed.includes(r)) q.completed.push(r); need(r); } };
    need(from);
    q.active = {};
    for (let k = 0; k < 200 && s.slices.progress.level < lv; k++) s.commit('progress:grantXp', { amount: xp.totalXpForLevel(s.slices.progress.level + 1) - s.slices.progress.xp, source: 'durchlauf' });
    for (let pass = 0; pass < 6; pass++) for (const id of Object.keys(talentsFor(cls))) for (let k = 0; k < 5; k++) if (!s.commit('character:learnTalent', { id })?.ok) break;
    const { WAYSTONES } = await import('/src/world/waystones.js');
    s.slices.world.flags ??= {};
    for (const w of WAYSTONES) { if (!['sternhafen', 'drifting_gardens', 'splitterweiten'].includes(w.zoneId)) s.slices.world.flags['waystone:' + w.zoneId] = true; }
    const { pickRewardGear } = await import('/src/progression/loot.js');
    const inv = s.slices.inventory;
    for (const slot of Object.keys(inv.equipment)) {
      const id = pickRewardGear({ ilvl: lv, rarity: slot === 'weapon' ? 'rare' : 'uncommon', slot }, cls, 0);
      if (id && c.find('item', id)) inv.equipment[slot] = id;
    }
    if (lv >= 20) s.slices.character.mounts = { owned: ['steppe_horse'], active: 'steppe_horse', riding: false };
    s.bus?.emit?.('state:changed');
    g.scenes.current.travel(c.find('npc', fd.giver)?.zoneId ?? 'emberhollow', 'start');
    await wait(1500);
  }
  const { createBot } = await import('/tools/durchlauf/bot.js?' + Date.now());
  const bot = createBot(g, { questIds: ids, log, verbose });
  const R = bot.R;

  // --- Langeweile-Messung
  const M = { novelty: [], windows: [], quests: {}, shots: [], gold: {}, xpSrc: { quest: 0, kill: 0, other: 0 } };
  const nov = (what, detail) => { M.novelty.push({ t: Math.round(R.time), lv: s.slices.progress.level, what, detail }); };
  const seenZones = new Set();
  let win = { t0: 0, kills: 0, quests: 0, xp: 0, walk: 0, fight: 0, idle: 0, ride: 0 };
  let last = { walk: 0, fight: 0, idle: 0, ride: 0 };
  let shotReq = null, nextEarly = 0;
  g.bus.on('enemy:killed', (e) => { win.kills++; });
  g.bus.on('xp:gained', (e) => { win.xp += e?.amount ?? 0; const src = /quest/.test(e?.source ?? '') ? 'quest' : /kill|enemy/.test(e?.source ?? '') ? 'kill' : 'other'; M.xpSrc[src] += e?.amount ?? 0; });
  g.bus.on('quest:accepted', (e) => {
    const d = c.find('quest', e.questId);
    M.quests[e.questId] = { acc: R.time, lv: s.slices.progress.level, zone: g.scenes.current.zone?.def?.id, kinds: (d?.objectives ?? []).map((o) => o.kind + (o.count > 1 ? '×' + o.count : '')), main: !!d?.main, title: d?.title, w0: R.walking + R.mounted, f0: R.fighting };
  });
  g.bus.on('quest:completed', (e) => {
    win.quests++;
    const q = M.quests[e.questId]; if (!q) return;
    q.dur = Math.round(R.time - q.acc); q.walk = Math.round(R.walking + R.mounted - q.w0); q.fight = Math.round(R.fighting - q.f0); q.done = Math.round(R.time);
    delete q.w0; delete q.f0;
  });
  g.bus.on('level:up', (e) => {
    const lv = e?.level ?? s.slices.progress.level;
    M.gold[lv] = s.slices.wallet?.gold;
    nov('Stufe', lv);
    // Talentpunkt setzen wie ein Spieler: Baum von oben nach unten
    for (let pass = 0; pass < 2; pass++) for (const id of Object.keys(talentsFor(cls))) if (s.commit('character:learnTalent', { id })?.ok) { pass = 9; break; }
    if (wantShots && lv <= 12) shotReq = `stufe-${String(lv).padStart(2, '0')}`;
    // Reittier: ab 20, sobald das Gold reicht (Steppenpferd bei Orla)
  });
  g.bus.on('character:unlock', (e) => nov('Freischaltung', e?.id ?? e?.kind ?? JSON.stringify(e).slice(0, 60)));
  g.bus.on('boss:defeated', (e) => nov('Boss', e?.bossId));
  g.bus.on('item:equipped', (e) => { const d = c.find('item', e?.itemId); if (d && ['rare', 'epic', 'legendary'].includes(d.rarity)) nov('Ausrüstung', `${e.itemId} (${d.rarity})`); });
  g.bus.on('mount:learned', (e) => nov('Reittier', e?.mountId));
  g.bus.on('achievement:unlocked', (e) => nov('Erfolg', e?.id));
  g.bus.on('zone:enter', (e) => {
    if (seenZones.has(e.zoneId)) return; seenZones.add(e.zoneId);
    nov('Zone', e.zoneId);
    if (wantShots) shotReq = `zone-${e.zoneId}`;
  });

  g.loop.running = false; clearInterval(g.loop.watch);
  const DT = 1 / 60;
  let steps = 0, lastLog = 0;
  window.__durch = { R, M };
  window.__step = (max) => {
    for (let k = 0; k < max; k++) {
      try { bot.tick(); g.update(DT); } catch (e) { R.errors.push({ t: R.time, what: 'Fehler', msg: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 3).join(' | ') }); if (R.errors.length > 400) return { done: true }; }
      steps++;
      if (R.time - win.t0 >= 300) {
        const cur = { walk: R.walking, fight: R.fighting, idle: R.idle, ride: R.mounted };
        M.windows.push({ t: Math.round(win.t0), lv: s.slices.progress.level, zone: g.scenes.current.zone?.def?.id, kills: win.kills, quests: win.quests, xp: win.xp, walk: Math.round(cur.walk - last.walk), ride: Math.round(cur.ride - last.ride), fight: Math.round(cur.fight - last.fight), idle: Math.round(cur.idle - last.idle) });
        last = cur; win = { t0: R.time, kills: 0, quests: 0, xp: 0 };
      }
      if (g.scenes.current.pendingTravel) break;
      if (early && R.time >= nextEarly && R.time < early) { nextEarly += 8; shotReq = `frueh-${String(Math.round(R.time)).padStart(4, '0')}`; }
      if (shotReq) { const n = shotReq; shotReq = null; return { shot: n }; }
      if (s.slices.progress.level >= to && !bot.R.done) {
        // Stufe erreicht: noch offene Hauptquests der Stufe fertig spielen, dann Ende
        const open = c.all('quest').some((d) => ids.includes(d.id) && d.main && (d.level ?? 1) <= to && !s.slices.quests.completed.includes(d.id));
        if (!open) R.done = true;
      }
      if (R.done) return { done: true };
    }
    if (steps - lastLog > 36000) { lastLog = steps; log(`… ${(R.time / 3600).toFixed(2)} h, Stufe ${s.slices.progress.level}, Zone ${g.scenes.current.zone?.def?.id}, Quests ${s.slices.quests.completed.length}`); }
    // Reittier kaufen, sobald möglich
    const m = s.slices.character.mounts;
    const gold = s.slices.wallet?.gold ?? 0;
    if (s.slices.progress.level >= 20 && !m.owned.length && gold >= 10000 && s.slices.quests.completed.includes('q_first_ride')) {
      s.commit('wallet:addGold', { amount: -10000, source: 'durchlauf' });
      s.commit('mount:learn', { mountId: 'steppe_horse' }); s.commit('mount:select', { mountId: 'steppe_horse' });
    }
    return { done: false };
  };
  window.__result = () => {
    const done = s.slices.quests.completed.filter((x) => ids.includes(x));
    return {
      cls, time: R.time, level: s.slices.progress.level, done: done.length, total: ids.length,
      missing: ids.filter((x) => !done.includes(x)).map((id) => ({ id, lv: c.find('quest', id)?.level, status: s.slices.quests.active[id]?.status ?? 'nicht angenommen' })),
      blocked: R.blocked, runs: R.runs, hired: R.hired, waystone: R.waystone, levels: R.levels, zones: R.zones, bosses: R.bosses, deaths: R.deaths, stuck: R.stuck, errors: R.errors.slice(0, 80), events: R.events.slice(0, 80),
      kills: R.kills, bounties: R.bounties, idle: R.idle, mounted: R.mounted, walking: R.walking, fighting: R.fighting,
      equipment: s.slices.inventory.equipment, gold: M.gold, xpSrc: M.xpSrc, novelty: M.novelty, windows: M.windows, quests: M.quests, mounts: s.slices.character.mounts,
    };
  };
}, { cls, verbose: !!opt.v, to, wantShots: !!shots, early: Number(opt.early ?? 0), from: opt.from ?? null });

const t0 = Date.now();
let lastDump = 0;
for (;;) {
  const r = await p.evaluate(() => window.__step(600));
  if (r.shot && shots) {
    await p.evaluate(() => { window.emberfall.render(); });
    await new Promise((res) => setTimeout(res, 60));
    await p.screenshot({ path: `${shots}/${r.shot}.png` });
  }
  if (r.done) break;
  const tm = await p.evaluate(() => window.__durch.R.time);
  if (tm > hours * 3600) break;
  if (tm - lastDump > 1800) { lastDump = tm; writeFileSync(out, JSON.stringify(await p.evaluate(() => window.__result()), null, 1)); }
}
const res = await p.evaluate(() => window.__result());
res.pageErrors = errors.slice(0, 50);
res.realSeconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`\n${res.done}/${res.total} Quests, Stufe ${res.level}, ${(res.time / 3600).toFixed(2)} h Spielzeit, ${res.deaths.length} Tode, ${res.stuck.length}× fest, ${res.errors.length} Fehler`);
await b.close();
