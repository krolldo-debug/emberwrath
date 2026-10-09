// Kurze Kampfanimation je Klasse für den Klassenbereich der Startseite (index.html, site.js „playFight“).
// Echte Spiellogik und -grafik: Held mit Stufe-40-Ausrüstung, Tasten und Klicks nach Drehbuch, die Simulation
// wird Schritt für Schritt (60 Hz) von Hand getaktet. Gezeichnet werden nur Held, Geschosse und die neu
// entstandenen Effekte, ohne Boden, Licht und Umgebungspartikel, auf durchsichtigem Grund und in Weltpixeln.
// Ergebnis: kampf-<klasse>.png, ein waagerechter Streifen gleich großer Bilder, und kampf.json mit Maßen und Bildzahl.
// Ein unverwundbarer Gegner (je Klasse eigener Typ) steht vor dem Helden, damit Treffer echte Funken erzeugen.
// Aufruf: node klassen-kampf.mjs OUT [klassen] [URL]; Standard-URL :8103 = Server im Ordner emberfall/.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT = 'kampf', only, URL = 'http://localhost:8103/index.html'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const SOV = ['rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet'];
// Gleicher Rahmen für alle Klassen (links, oben, rechts, unten ab den Füßen), damit das Feld beim Wechsel nicht springt
const BOX = [46, 70, 90, 24];
const FPS = 12, STEPS = 60 / FPS;
// Drehbuch: [Bild, Aktion]; Aktion = 'attack' (Linksklick) oder skill1..skill4 (Q, R, T, G)
const CLASSES = {
  warrior: { foeType: 'ash_golem', foe: true, dist: 36, box: BOX, race: 'human', gear: [...SOV, 'kingsbane'], frames: 32, plan: [[0, 'attack'], [4, 'attack'], [8, 'attack'], [14, 'skill1'], [24, 'skill4']] },
  rogue: { foeType: 'cinder_cultist', foe: true, dist: 28, box: BOX, race: 'emberborn', gear: ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'], frames: 30, plan: [[0, 'attack'], [3, 'attack'], [6, 'attack'], [11, 'skill2'], [20, 'attack'], [23, 'attack']] },
  ranger: { foeType: 'skeleton', foe: true, dist: 64, box: BOX, race: 'elf', gear: ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'], frames: 30, plan: [[0, 'attack'], [4, 'skill2'], [12, 'skill1'], [20, 'skill4']] },
  mage: { foeType: 'temple_guardian', foe: true, dist: 50, box: BOX, race: 'elf', gear: ['staff_of_last_ash', 'colossus_robe', 'colossus_gloves', 'colossus_slippers'], frames: 30, plan: [[0, 'attack'], [5, 'attack'], [10, 'skill3'], [18, 'skill4']] },
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const meta = {};
for (const [cls, c] of Object.entries(CLASSES).filter(([k]) => !only || only.split(',').includes(k))) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', cls, e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  // Volle Qualität: Figuren mit doppelter Detailauflösung (CONFIG.spriteRes 2) wie die Heldenbilder der Website
  await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
  const r = await p.evaluate(async ({ cls, c, FPS, STEPS }) => {
    const g = window.emberfall, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Zolva'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: c.race, classId: cls } });
    await wait(600);
    for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
    for (const id of c.gear) {
      g.state.commit('inventory:add', { itemId: id, qty: 1 });
      const slot = g.state.slices.inventory.slots.findIndex((s) => s?.itemId === id);
      if (slot >= 0) g.state.commit('inventory:equip', { slot });
    }
    await wait(800);
    const s = g.scenes.current, w = s.world, h = w.hero, inp = g.input;
    // Ruhige Bühne: keine Gegner, kein Nachschub, keine Umgebungspartikel
    const type = c.foeType ?? w.enemies.find((e) => !e.def?.boss && !e.def?.elite)?.type;
    for (const e of w.enemies) e.removed = true;
    w.spawner.update = () => {};
    for (const k of ['spawn', 'embers']) { const f = w.particles[k].bind(w.particles); w.particles[k] = (...a) => (new Error().stack.includes('ambientParticles') ? null : f(...a)); }
    g.loop.running = false;
    await new Promise((res) => requestAnimationFrame(res));
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    w.particles.active.splice(0);
    const old = new Set([...w.entities, ...w.effects]);
    const x0 = h.x, y0 = h.y;
    // Unsichtbares Ziel: Treffer erzeugen echte Funken und Einschläge, der Gegner selbst wird nicht gezeichnet
    const dummy = w.spawnEnemy(type, x0 + c.dist, y0);
    // Nur Zeitgeber und Animation laufen (kein Angriff, keine Bewegung); Trefferblitz gedämpft, keine Lebensleiste
    dummy.update = (dt) => { dummy.tickTimers(dt); dummy.flash = Math.min(dummy.flash, 0.025); dummy.hpBarTimer = 0; dummy.facing = -1; };
    dummy.maxHp = 1e9;
    Object.defineProperty(dummy, 'isEngaged', { value: false, configurable: true, writable: true });
    const keepDummy = () => { dummy.x = x0 + c.dist; dummy.y = y0; dummy.hp = dummy.maxHp; dummy.dead = false; dummy.removed = false; };
    const step = () => {
      keepDummy(); h.hp = h.maxHp; h.resource = h.maxResource;
      for (const a of h.abilities ?? []) a.cdLeft = 0;
      inp.pointer.x = x0 + c.dist - s.camera.x; inp.pointer.y = y0 - 6 - s.camera.y;
      inp.pointer.active = true; inp.pointer.lastMove = inp.time; inp.usingTouch = false;
      g.update(1 / 60);
    };
    // Zeichenfläche großzügig um den Startpunkt; ausgeschnitten wird der feste Rahmen BOX
    const R = g.view.width / (await import('/src/config.js')).CONFIG.viewWidth;   // Bildpunkte je Weltpixel (2)
    const W = 240, H = 140, ox = 70, oy = 100, cx0 = Math.round(x0 - ox), cy0 = Math.round(y0 - oy);
    const frames = [];
    const draw = () => {
      const cv = document.createElement('canvas'); cv.width = W * R; cv.height = H * R;
      const x = cv.getContext('2d'); x.setTransform(R, 0, 0, R, 0, 0); x.imageSmoothingEnabled = false;
      dummy.flash = Math.min(dummy.flash, 0.025); dummy.hpBarTimer = 0; dummy.hp = dummy.maxHp;
      const show = (e) => !old.has(e) && !/FloatingText|SoulWisp/.test(e.constructor?.name);
      const ents = w.entities.filter(show), fx = w.effects.filter(show);
      const ds = [...ents, h, ...(c.foe ? [dummy] : []), ...w.projectiles].sort((a, b2) => a.sortY - b2.sortY);
      for (const d of ds) d.render(x, cx0, cy0);
      w.particles.drawLit(x, cx0, cy0);
      for (const d of ds) d.renderEmissive?.(x, cx0, cy0);
      w.particles.drawEmissive(x, cx0, cy0);
      for (const e of fx) e.renderEmissive?.(x, cx0, cy0);
      frames.push(cv);
    };
    const plan = new Map(c.plan);
    for (let i = 0; i < c.frames; i++) {
      const a = plan.get(i);
      if (a) inp.press(a);
      for (let k = 0; k < STEPS; k++) { step(); if (k === 1 && a) inp.release(a); }
      h.x = x0; h.y = y0; h.facing = 1;
      draw();
    }
    // Ruhige Endstellung wie im Spiel: kurz ausklingen lassen
    for (let i = 0; i < 6; i++) { for (let k = 0; k < STEPS; k++) step(); h.x = x0; h.y = y0; h.facing = 1; draw(); }
    const fight = frames.splice(0);
    // Abwarten, bis Held wieder ruht und alle Effekte verklungen sind (höchstens 4 s)
    const busy = () => h.animator.name !== 'idle' || w.projectiles.length > 0 || w.effects.some((e) => !old.has(e) && !/FloatingText|SoulWisp/.test(e.constructor?.name)) || w.entities.some((e) => !old.has(e) && !/FloatingText|SoulWisp/.test(e.constructor?.name));
    const settle = () => { for (let i = 0; i < 240 && busy(); i++) { step(); h.x = x0; h.y = y0; h.facing = 1; } h.buffs = []; w.particles.active.splice(0); for (let i = 0; i < 90; i++) step(); h.x = x0; h.y = y0; h.facing = 1; };
    // Glanzkreuz auf der Waffe hängt an performance.now: in Ruhe- und Fähigkeitsbildern festhalten, damit nichts aufblitzt
    const pn = performance.now.bind(performance);
    let T = pn() / 1000;
    for (let k = 0; k < 400; k++, T += 0.013) if ([1.6, 2.4].every((per) => ((T + (h.id ?? 0) * 0.37) % per) / 0.4 >= 1.05)) break;
    const still = () => { performance.now = () => T * 1000; try { draw(); } finally { performance.now = pn; } };
    // Einzelne Fähigkeiten (Reihenfolge wie auf der Seite = skill1..skill4): ab Ruhe drücken, bis wieder Ruhe ist
    const skills = [];
    for (const a of ['skill1', 'skill2', 'skill3', 'skill4']) {
      settle();
      for (let i = 0; i < 28; i++) {
        if (i === 1) inp.press(a);
        // Sprengfalle: der Gegner läuft nicht hinein, also liegt sie gleich unter ihm
        for (const e of w.entities) if (!old.has(e) && e.constructor?.name === 'FireTrap' && !e.__moved) { e.x = x0 + c.dist - 2; e.y = y0 + 2; e.__moved = true; }
        for (let k = 0; k < STEPS; k++) { step(); if (i === 1 && k === 1) inp.release(a); }
        h.x = x0; h.y = y0; h.facing = 1;
        still();
        if (i >= 10 && !busy()) break;
      }
      skills.push(frames.splice(0));
    }
    // Ruheschleife: ganzzahlige Zahl von Atemzügen des Helden (4 Bilder bei 6 fps) und des Gegners
    settle();
    const cyc = (an) => Math.max(1, Math.round((an?.current?.duration ?? 0) * FPS));
    const hc = cyc(h.animator), dc = c.foe ? cyc(dummy.animator) : 1;
    const lcm = (a, b2) => { let x = a, y = b2; while (y) [x, y] = [y, x % y]; return (a * b2) / x; };
    let N = lcm(hc, dc); if (N > 48) N = 24; while (N < 18) N *= 2;
    for (let i = 0; i < N; i++) { for (let k = 0; k < STEPS; k++) step(); h.x = x0; h.y = y0; h.facing = 1; still(); }
    const idle = frames.splice(0);
    // Fester Rahmen um den Standpunkt (box: links, oben, rechts, unten relativ zu den Füßen)
    const [bl, bt, br, bb] = c.box;
    const x1 = ox - bl, y1 = oy - bt, x2 = ox + br - 1, y2 = oy + bb - 1;
    const fw = x2 - x1 + 1, fh = y2 - y1 + 1;
    const toStrip = (fr) => {
      const strip = document.createElement('canvas'); strip.width = fw * R * fr.length; strip.height = fh * R;
      const sx = strip.getContext('2d');
      fr.forEach((cv, i) => sx.drawImage(cv, x1 * R, y1 * R, fw * R, fh * R, i * fw * R, 0, fw * R, fh * R));
      return strip.toDataURL('image/png');
    };
    return { url: toStrip(fight), idle: toStrip(idle), skills: skills.map(toStrip), counts: { fight: fight.length, idle: idle.length, skills: skills.map((f) => f.length), hc, dc }, fw, fh, R, n: fight.length, foot: { x: ox - x1, y: oy - y1 } };
  }, { cls, c: { ...c, foeType: process.env.FOE ?? c.foeType }, FPS, STEPS });
  const save = (f, url) => writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
  save(`kampf-${cls}.png`, r.url); save(`ruhe-${cls}.png`, r.idle);
  r.skills.forEach((u, i) => save(`kampf-${cls}-${i + 1}.png`, u));
  meta[cls] = { w: r.fw, h: r.fh, res: r.R, fps: FPS, foot: r.foot, ...r.counts };
  console.log(cls, JSON.stringify(meta[cls]));
  await ctx.close();
}
writeFileSync(`${OUT}/kampf.json`, JSON.stringify(meta, null, 1));
await b.close();
