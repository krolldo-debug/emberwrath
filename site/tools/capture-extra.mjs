import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2] ?? 'shots';
const URL = process.argv[3] ?? 'http://localhost:8101/emberfall.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// Charaktererstellung (Desktop)
{
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  await p.evaluate(() => { const g = window.emberfall; const a = g.save.createAccount('Demo'); g.login(a.id); g.scenes.go('characterCreate'); });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${OUT}/erstellung.png` });
  await p.close();
}
// Handy hochkant mit Touch-Steuerung
{
  const ctx = await b.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  await p.evaluate(async () => {
    const g = window.emberfall; g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const a = g.save.createAccount('Demo'); g.login(a.id);
    g.newGame({ character: { name: 'Zolva', raceId: 'elf', classId: 'mage' } });
    await new Promise((r) => setTimeout(r, 600));
    g.state.commit('progress:grantXp', { amount: 5e6 });
    for (const id of ['worldstaff', 'arcane_robe', 'shadowstep_boots']) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      g.state.commit('inventory:equip', { slot });
    }
    g.scenes.current.travel('sunken_temple', 'start');
    await new Promise((r) => setTimeout(r, 2500));
    document.querySelectorAll('.ui-toasts, .ui-panels').forEach((e) => e.replaceChildren());
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const w = window.emberfall.scenes.current.world, h = w.hero; const t = [...w.enemies].filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; if (t) { h.x = t.x - 30; h.y = t.y + 10; } });
  await p.waitForTimeout(1800);
  await p.addStyleTag({ content: '.ef-unlock, .unlock-card, [class*=unlock]{display:none!important}' });
  await p.evaluate(() => document.querySelectorAll('.ui-toasts').forEach((e) => e.replaceChildren()));
  await p.screenshot({ path: `${OUT}/handy.png` });
  await ctx.close();
}
await b.close();
