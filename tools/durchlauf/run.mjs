// Automatischer Durchlauf Sternenglut Teil 1 (Stufe 40 → 50) im echten Spiel, schneller als Echtzeit.
//   python3 -m http.server 8121 --bind 127.0.0.1   (im Repo-Ordner)
//   node tools/durchlauf/run.mjs [--class=warrior] [--hours=16] [--out=durchlauf.json] [--gear=uncommon|rare]
// Ein frischer Charakter wird auf Stufe 40 gesetzt (alle Quests bis 40 erledigt, Reittier, Ausrüstung Stufe 40),
// dann spielt tools/durchlauf/bot.js alle Quests der Erweiterung. Ergebnis: Spielzeit je Stufe, Tode, Bosskämpfe,
// Stellen, an denen der Bot feststeckte, Quests, die nicht fertig wurden, und Fehler aus der Konsole.
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
import { writeFileSync } from 'node:fs';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const cls = opt.class ?? 'warrior', hours = Number(opt.hours ?? 16), out = opt.out ?? `durchlauf-${cls}.json`;
const base = opt.url ?? 'http://127.0.0.1:8121';

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, locale: 'de-DE' })).newPage();
const errors = [];
p.on('pageerror', (e) => { errors.push(e.message); console.log('ERR', e.message, e.stack?.split('\n').slice(1, 3).join(' | ')); });
p.on('console', (m) => { const t = m.text(); if (t.startsWith('[bot]')) console.log(t.slice(6)); else if ((m.type() === 'error' || m.type() === 'warning') && !t.startsWith('Canvas2D')) { errors.push(t); if (errors.length < 30) console.log('KONSOLE', m.type(), t.slice(0, 200)); } });
await p.goto(`${base}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 60000 });

const res = await p.evaluate(async ({ cls, hours, gearRarity, from, verbose, pos }) => {
  const g = window.emberfall; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (s) => console.log('[bot] ' + s);
  g.prefs.set('muted', true); g.prefs.set('guidePath', true); g.prefs.set('quality', 'low');
  const xp = await import('/src/progression/xp.js'); xp.setStarsOpen(true);
  const acc = g.save.createAccount('Durchlauf'); g.login(acc.id);
  g.newGame({ character: { name: 'Durchlauf', raceId: 'human', classId: cls } });
  await wait(1500);
  const s = g.state, c = g.scenes.current.content;
  // Stufe 40
  for (let i = 0; i < 200 && s.slices.progress.level < 40; i++) {
    const need = xp.totalXpForLevel(s.slices.progress.level + 1) - s.slices.progress.xp;
    s.commit('progress:grantXp', { amount: Math.max(1, need), source: 'durchlauf' });
  }
  // Alle Quests bis 40 erledigt
  const { QUESTS_STARS } = await import('/src/progression/questsStars.js');
  const star = Object.keys(QUESTS_STARS);
  const q = s.slices.quests;
  for (const d of c.all('quest')) if (!star.includes(d.id) && !d.repeatable && !q.completed.includes(d.id)) q.completed.push(d.id);
  q.active = {};
  // --from=<questId>: alle Sternenglut-Quests davor gelten als erledigt, Stufe passend, Start beim Questgeber
  let startZone = 'cinder_peaks';
  if (from) {
    const i = star.indexOf(from);
    for (const id of star.slice(0, i)) if (!q.completed.includes(id) && !QUESTS_STARS[id].repeatable) q.completed.push(id);
    const need = (id) => { for (const r of QUESTS_STARS[id]?.requires ?? []) { if (!q.completed.includes(r)) q.completed.push(r); need(r); } };
    need(from);
    const lv = Math.max(40, (QUESTS_STARS[from].level ?? 41) - 1);
    for (let k = 0; k < 200 && s.slices.progress.level < lv; k++) s.commit('progress:grantXp', { amount: xp.totalXpForLevel(s.slices.progress.level + 1) - s.slices.progress.xp, source: 'durchlauf' });
    startZone = c.find('npc', QUESTS_STARS[from].giver)?.zoneId ?? startZone;
  }
  // Talentpunkte bis 40 verteilt (wie ein Spieler, der jede Stufe einen Punkt setzt): Baum von oben nach unten
  const { talentsFor } = await import('/src/character/talents.js');
  for (let pass = 0; pass < 6; pass++) for (const id of Object.keys(talentsFor(cls))) for (let k = 0; k < 5; k++) if (!s.commit('character:learnTalent', { id })?.ok) break;
  // Wegsteine bis Stufe 40 sind entdeckt (wer 40 ist, war überall)
  const { WAYSTONES } = await import('/src/world/waystones.js');
  s.slices.world.flags ??= {};
  for (const w of WAYSTONES) if (!['sternhafen', 'drifting_gardens', 'splitterweiten'].includes(w.zoneId)) s.slices.world.flags['waystone:' + w.zoneId] = true;
  // Reittier
  s.slices.character.mounts = { owned: ['steppe_horse'], active: 'steppe_horse', riding: false };
  // Ausrüstung Stufe 40: je Platz das beste Teil bis Stufe 40 in der gewählten Seltenheit (Waffe eine Stufe besser)
  const { itemScore } = await import('/src/progression/items.js');
  const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const inv = s.slices.inventory;
  const worn = {};
  const { pickRewardGear } = await import('/src/progression/loot.js');
  for (const slot of Object.keys(inv.equipment)) {
    const rarity = RAR[RAR.indexOf(gearRarity) + (slot === 'weapon' ? 1 : 0)];
    const id = pickRewardGear({ ilvl: 40, rarity, slot }, cls, 0);
    const d = id && c.find('item', id);
    if (d) { inv.equipment[slot] = id; worn[slot] = `${id} (${d.rarity}, ${d.reqLevel})`; }
  }
  // Tränke: die besten bis Stufe 40
  const pots = c.all('item').filter((d) => d.type === 'potion' && (d.reqLevel ?? 1) <= 40).sort((a, b) => (b.heal ?? b.value ?? 0) - (a.heal ?? a.value ?? 0));
  const hp = pots.find((d) => /potion/.test(d.id) && !/mana/.test(d.id));
  if (hp) { const i = inv.slots.findIndex((x) => !x); inv.slots[i] = { itemId: hp.id, qty: 20 }; }
  s.bus?.emit?.('state:changed');
  const { createBot } = await import('/tools/durchlauf/bot.js?' + Date.now());
  const bot = createBot(g, { questIds: star, log, verbose });
  g.scenes.current.travel(startZone, 'start', pos ? { x: pos[0] * 16 + 8, y: pos[1] * 16 + 8 } : null);
  window.__g = g;
  // eigene Schleife: feste Schritte, so schnell es geht
  g.loop.running = false; clearInterval(g.loop.watch);
  const DT = 1 / 60, max = hours * 3600;
  let last = 0, steps = 0;
  window.__durch = bot.R;
  while (!bot.R.done && bot.R.time < max) {
    for (let k = 0; k < 600; k++) {
      try { bot.tick(); g.update(DT); } catch (e) { bot.R.errors.push({ t: bot.R.time, what: 'Fehler', msg: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 3).join(' | ') }); if (bot.R.errors.length > 400) break; }
      steps++;
      if (g.scenes.current.pendingTravel) break;
    }
    if (steps - last > 36000) { last = steps; g.render(); log(`… ${(bot.R.time / 3600).toFixed(2)} h, Stufe ${s.slices.progress.level}, Zone ${g.scenes.current.zone?.def?.id}, Quests fertig ${s.slices.quests.completed.filter((x) => star.includes(x)).length}/${star.length}`); }
    await wait(0);
  }
  const done = s.slices.quests.completed.filter((x) => star.includes(x));
  const R = bot.R;
  return {
    cls, worn, talents: s.slices.character.talents, hpPotion: hp?.id, time: R.time, level: s.slices.progress.level, xp: s.slices.progress.xp,
    done: done.length, total: star.length, missing: star.filter((x) => !done.includes(x)).map((id) => ({ id, status: (s.slices.quests.active[id]?.status) ?? 'nicht angenommen', progress: s.slices.quests.active[id]?.progress })),
    blocked: R.blocked, runs: R.runs, equipment: s.slices.inventory.equipment, hired: R.hired, waystone: R.waystone, levels: R.levels, zones: R.zones, bosses: R.bosses, deaths: R.deaths, stuck: R.stuck, errors: R.errors.slice(0, 80), events: R.events.slice(0, 80),
    kills: R.kills, bounties: R.bounties, idle: R.idle, mounted: R.mounted, walking: R.walking, fighting: R.fighting, quests: R.quests,
  };
}, { cls, hours, gearRarity: opt.gear ?? 'uncommon', from: opt.from ?? null, verbose: !!opt.v, pos: opt.pos ? opt.pos.split(',').map(Number) : null });
res.pageErrors = errors.slice(0, 50);
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`\n${res.done}/${res.total} Quests, Stufe ${res.level}, ${(res.time / 3600).toFixed(2)} h Spielzeit, ${res.deaths.length} Tode, ${res.stuck.length}× fest, ${res.errors.length} Fehler`);
await b.close();
