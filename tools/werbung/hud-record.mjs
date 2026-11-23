// Spielszenen MIT Spieloberfläche aufnehmen (Handy quer, 956 × 440 bei doppelter Pixeldichte), Bild für Bild.
// Grundlage: /mnt/project-files/appstore/werkzeug/store-bilder.mjs (Szenenaufbau der App-Store-Bilder). Nach dem Aufbau
// hält das Werkzeug die Spielschleife an und rechnet selbst: zwei Spielschritte (1/60 s) je Bild, dann ein Bildschirmfoto.
// So entsteht ein ruckelfreies Video mit 30 Bildern je Sekunde in Echtzeit-Tempo, unabhängig davon, wie lange ein Foto dauert.
//   Spielstand nach /tmp/ef-main (git archive origin/main | tar -x -C /tmp/ef-main), dann
//   PORT=8863 node tools/werbung/hud-record.mjs ZIELORDNER [szene] [sekunden=8]     → ZIELORDNER/<szene>/fNNNN.png
import { startServer, launch } from '/mnt/project-files/videos/rohmaterial/werkzeug/roh-lib.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const [OUT = '/tmp/hud', ONLY = '', SEK = '8'] = process.argv.slice(2);
const PORT = process.env.PORT ?? 8811;
const GEAR = {
  warrior: ['human', ['rimeforged_coif', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons', 'sovereign_signet', 'kingsbane']],
  rogue: ['emberborn', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots']],
  ranger: ['elf', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots']],
  mage: ['elf', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers']],
};
// from/route: Startpunkt und Wegpunkte, die der Held wie ein Spieler mit Richtungstasten abläuft; clear: [x, y, Radius] ohne Gegner
const SC = [
  { name: 'boss-malgareth', cls: 'mage', zone: 'ashen_throne', boss: true, party: [['warrior', 'tank', 'human'], ['ranger', 'dps', 'elf']], skills: ['skill1', 'skill2', 'skill3'], pos: [[-70, 80], [70, 70], [10, 105]] },
  { name: 'boss-ignaroth', cls: 'warrior', zone: 'molten_forge', boss: true, party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], skills: ['skill2', 'skill1'], pos: [[-50, 60], [70, 75], [-5, 110]] },
  { name: 'boss-skalvyr', cls: 'warrior', zone: 'rime_caverns', boss: true, party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], skills: ['skill2', 'skill1'], pos: [[-50, 60], [70, 75], [-5, 110]] },
  { name: 'wald', cls: 'ranger', zone: 'ashwood', fight: true, far: true, skills: ['skill2', 'skill1', 'skill3'], pos: [[-70, 30]] },
  { name: 'gruppe', cls: 'warrior', zone: 'molten_forge', fight: true, party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], skills: ['skill2', 'skill1'], pos: [[-40, 20], [-70, 55], [-10, 70]] },
  { name: 'frost', cls: 'rogue', zone: 'frostspire', fight: true, far: true, skills: ['skill2', 'skill1', 'skill3'], pos: [[-40, 20]] },
  { name: 'reiten', cls: 'ranger', zone: 'ember_wastes', mount: 'cinder_drake', ride: true, from: [1060, 805], route: [[1200, 805], [1360, 805], [1520, 805], [1700, 805], [1900, 805]], clear: [1330, 775, 620] },
  { name: 'reiten-steppe', cls: 'warrior', zone: 'ashen_steppe', mount: 'ember_charger', ride: true, from: [2450, 870], route: [[2300, 870], [2140, 862], [2000, 862], [1860, 868], [1720, 870], [1500, 870]], clear: [2000, 880, 620] },
  { name: 'stadt-weg', cls: 'warrior', zone: 'sternhafen', from: [968, 870], route: [[900, 900], [820, 960], [760, 1040]] },
  { name: 'stadt', cls: 'warrior', zone: 'emberhollow', shift: [-20, -25] },
  // Drehbuch-Szenen der Videos „Live-Kommentar“, „Malgareths Bitte“, „Haltestelle“: hp = Stützpunkte [Sekunde, Anteil] für das
  // Leben des Bosses (gleiche Sekunde zweimal = Sprung), kill = Sekunde des Sieges, dodge = [Sekunde, Richtung] Ausweichrolle
  { name: 'k-skalvyr', sek: 19.5, cls: 'warrior', zone: 'rime_caverns', boss: true, party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], skills: ['skill2', 'skill1'], pos: [[-50, 60], [70, 75], [-5, 110]],
    hp: [[0, 0.64], [4.6, 0.6], [14.0, 0.05]], kill: 14.15, dodge: [[8.75, 'left']] },
  { name: 'm-malgareth', sek: 26.6, cls: 'mage', zone: 'ashen_throne', boss: true, party: [['warrior', 'tank', 'human'], ['ranger', 'dps', 'elf']], skills: ['skill1', 'skill2', 'skill3'], pos: [[-70, 80], [70, 70], [10, 105]],
    hp: [[0, 0.92], [8, 0.8], [21.6, 0.04]], kill: 21.85 },
  { name: 'b-ignaroth', sek: 17.5, cls: 'warrior', zone: 'molten_forge', boss: true, party: [['mage', 'dps', 'elf'], ['ranger', 'dps', 'elf']], skills: ['skill2', 'skill1'], pos: [[-50, 60], [70, 75], [-5, 110]],
    hp: [[0, 0.98], [4.0, 0.88], [4.0, 0.52], [7.6, 0.43], [7.6, 0.1], [12.6, 0.02]], kill: 12.85 },
];
const srv = await startServer();
const b = await launch();
for (const sc of SC) {
  if (ONLY && !ONLY.split(',').includes(sc.name)) continue;
  const ctx = await b.newContext({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 EmberwrathApp/ios' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title', null, { timeout: 30000 });
  await p.addStyleTag({ content: '.ef-guide,.ef-guide-layer,.ef-toasts,.ef-unlock,.net-chat-log,.fd-chat{display:none!important}' });
  const [race, gear] = GEAR[sc.cls];
  const info = await p.evaluate(async ({ sc, race, gear, GEAR }) => {
    const g = window.emberfall; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.prefs.set('muted', true); g.prefs.set('quality', 'high'); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Zolva'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: race, classId: sc.cls } });
    await wait(800);
    for (let i = 0; i < 20 && document.querySelector('.intro'); i++) { document.querySelector('.intro-skip')?.click(); await wait(150); }   // Intro-Film überspringen
    for (let i = 0; i < 40; i++) g.state.commit('progress:grantXp', { amount: 5e7, source: 'shot' });
    g.state.commit('wallet:addGold', { amount: 48260, source: 'shot' });
    for (const id of gear) { g.state.commit('inventory:add', { itemId: id, qty: 1 }); const s = g.state.slices.inventory.slots.findIndex((x) => x?.itemId === id); if (s >= 0) g.state.commit('inventory:equip', { slot: s }); }
    if (sc.mount) {
      const q = g.state.slices.quests; if (q && !(q.completed ?? []).includes('q_first_ride')) (q.completed ??= []).push('q_first_ride');
      g.state.commit('mount:learn', { mountId: sc.mount }); g.state.commit('mount:select', { mountId: sc.mount });
    }
    if (sc.party) {
      const members = [{ kind: 'player', role: sc.cls === 'warrior' ? 'tank' : 'dps', classId: sc.cls, raceId: race, level: 40, name: 'Zolva' }];
      const names = ['Brannoc', 'Ilvaine'];
      sc.party.forEach(([cls, role, r], i) => members.push({ kind: 'merc', id: 'm' + i, name: names[i], level: 40, role, classId: cls, raceId: r, look: { variant: i + 1, hairStyle: null, dye: null }, gearSeed: 7 + i * 13, style: { reaction: 0.2, skill: 0.9, chatty: 0, caps: 0, lang: 'de' } }));
      g.finder.group = { id: 'g1', dungeonId: sc.zone, members }; g.finder.state = 'active';
    }
    g.scenes.current.travel(sc.zone, 'start');
    await wait(3500);
    const w = g.scenes.current.world, h = w.hero;
    if (sc.party) {
      const [{ getHeroSprites }, { resolveGear }, { spriteStyle }] = await Promise.all([import('/src/sprites/hero.js'), import('/src/character/gearLook.js'), import('/src/character/cosmetics.js')]);
      for (const c of w.actors.filter((a) => a.companion)) {
        const cls = c.member?.classId ?? c.cls?.id, ids = GEAR[cls]?.[1]; if (!ids) continue;
        const eq = {}; for (const id of ids) { const dd = g.content.get('item', id); if (dd?.slot) eq[dd.slot] = id; }
        c.equipment = eq; const look = c.member?.look ?? {};
        c.refreshLook = () => c.setAnims(getHeroSprites(c.raceId, cls, look.variant ?? 0, resolveGear(eq, g.content), spriteStyle(look))); c.refreshLook();
      }
    }
    let target = null;
    const alive = w.enemies.filter((e) => !e.dead && e.hp > 0);
    if (sc.boss) target = alive.find((e) => e.def?.boss) ?? null;
    else if (sc.fight || sc.ride) {
      let best = 0; for (const e of alive) { if ((sc.far || sc.ride) && Math.hypot(e.x - h.x, e.y - h.y) < 300) continue; const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 70).length; if (n > best) { best = n; target = e; } }
    }
    const comps = w.actors.filter((a) => a.companion);
    if (sc.clear) {
      for (const e of w.enemies) if (Math.hypot(e.x - sc.clear[0], e.y - sc.clear[1]) < sc.clear[2]) { e.dead = true; e.removed = true; }
      w.enemies = w.enemies.filter((e) => !e.removed); w.actors = w.actors.filter((a) => !a.removed);
    }
    if (sc.from) { const q = w.dungeon.nearestFree(sc.from[0], sc.from[1]); h.x = q.x; h.y = q.y; await wait(300); }
    if (sc.ride) {
      await wait(400); g.input.press('mount'); await wait(100); g.input.release('mount'); await wait(1800);
    } else if (target) {
      const pos = sc.pos ?? [[-40, 20]];
      h.x = target.x + pos[0][0]; h.y = target.y + pos[0][1];
      for (const e of alive) if (Math.hypot(e.x - target.x, e.y - target.y) < 120) { if (!sc.boss) e.maxHp = Math.max(e.maxHp, 5e5); e.hp = e.maxHp * (sc.hp ? sc.hp[0][1] : sc.boss ? 0.63 : 0.8); }
      comps.forEach((c, i) => { const q = pos[i + 1] ?? [i * 40, 30]; c.x = target.x + q[0]; c.y = target.y + q[1]; });
      await wait(900);
    } else {
      if (sc.shift) { h.x += sc.shift[0]; h.y += sc.shift[1]; }
      await wait(1800);
    }
    // Ab hier rechnet das Werkzeug: Schleife anhalten, je Bild zwei Spielschritte und einmal zeichnen
    g.loop.running = false;
    const order = [...(sc.skills ?? []), 'attack', 'attack', 'attack'];
    let n = 0, held = null, lastX = h.x, lastY = h.y, still = 0, wp = 0, killed = false, roll = null;
    const GEGEN = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const klang = (window.__klang = []), play = g.sfx.play.bind(g.sfx);     // Spielklänge mitschreiben (Zeit in Sekunden ab Aufnahmebeginn)
    g.sfx.play = (name, opts = {}) => { klang.push([+(n / 60).toFixed(4), name, JSON.parse(JSON.stringify(opts ?? {}))]); return play(name, opts); };
    window.__bild = () => {
      for (let k = 0; k < 2; k++) {
        if (order.length && (sc.boss || sc.fight)) {                 // Tastenfolge wie ein Spieler: drücken, loslassen, Pause
          const ph = n % 14;
          if (ph === 0) { held = order[Math.floor(n / 14) % order.length]; g.input.press(held); }
          if (ph === 4 && held) { g.input.release(held); held = null; }
        }
        if (sc.route && still > 6) { for (const a of ['left', 'right', 'up', 'down']) if (g.input.down.has(a)) g.input.release(a); sc.route = null; }   // Hindernis: stehen bleiben statt gegen die Wand laufen
        if (sc.route) {
          let q = sc.route[wp]; if (q && Math.hypot(q[0] - h.x, q[1] - h.y) < 10) q = sc.route[++wp];
          const want = new Set();
          if (q) { const dx = q[0] - h.x, dy = q[1] - h.y, d = Math.hypot(dx, dy); if (Math.abs(dx) > d * 0.38) want.add(dx > 0 ? 'right' : 'left'); if (Math.abs(dy) > d * 0.38) want.add(dy > 0 ? 'down' : 'up'); }
          for (const a of ['left', 'right', 'up', 'down']) { if (want.has(a) && !g.input.down.has(a)) g.input.press(a); if (!want.has(a) && g.input.down.has(a)) g.input.release(a); }
        }
        const t = n / 60;
        if (sc.hp && target && !target.dead) {                         // Leben des Bosses nach Drehbuch
          if (sc.kill != null && t >= sc.kill) {                       // Sieg zur festen Zeit, auch mitten in einem Phasenwechsel
            killed = true; target.hp = 1; target.hurtable = true; target.invuln = 0;
            target.takeHit?.({ damage: 99999999, dirX: 0, dirY: 1, knockback: 0, source: h });
          } else {
            let f = sc.hp[0][1];
            for (let i = 0; i < sc.hp.length - 1; i++) { const [a, fa] = sc.hp[i], [b2, fb] = sc.hp[i + 1]; if (t >= a && t < b2) f = fa + (fb - fa) * (t - a) / (b2 - a); else if (t >= b2) f = fb; }
            target.hp = Math.max(1, target.maxHp * f);
          }
        }
        for (const [at, dir] of sc.dodge ?? []) if (!roll && Math.abs(t - at) < 0.5 / 60) roll = { n0: n, dir, x: h.x, y: h.y };
        if (roll) {                                                    // Ausweichrolle, danach zurück an den Platz
          const k = n - roll.n0, back = GEGEN[roll.dir];
          if (k === 0) { g.input.press(roll.dir); g.input.press('dodge'); }
          if (k === 5) { g.input.release('dodge'); g.input.release(roll.dir); }
          if (k === 46) g.input.press(back);
          if (k > 46 && (Math.hypot(h.x - roll.x, h.y - roll.y) < 5 || k > 110)) { g.input.release(back); roll = null; }
        }
        g.update(1 / 60); n++;
        for (const a of [h, ...comps]) a.hp = Math.max(a.hp, a.maxHp * 0.55);
      }
      g.scenes.current.hurtFlash = 0;
      g.render();
      still = Math.hypot(h.x - lastX, h.y - lastY) < 0.05 ? still + 1 : 0; lastX = h.x; lastY = h.y;
      return { still, x: Math.round(h.x), y: Math.round(h.y), hp: target ? +(target.hp / target.maxHp).toFixed(4) : null, tot: !!(target && (target.dead || target.hp <= 0)) };
    };
    return { zone: sc.zone, target: target?.def?.name ?? target?.name ?? null, hero: [Math.round(h.x), Math.round(h.y)] };
  }, { sc, race, gear, GEAR });
  const dir = `${OUT}/${sc.name}`; mkdirSync(dir, { recursive: true });
  const frames = Math.round((sc.sek ?? +SEK) * 30);
  let blocked = -1; const log = [];
  for (let i = 0; i < frames; i++) {
    const s = await p.evaluate(() => window.__bild()); log.push(s);
    if (s.still === 7 && blocked < 0 && sc.route) blocked = i;          // Held kommt nicht mehr voran (Hindernis): merken
    await p.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
  }
  writeFileSync(`${dir}/log.json`, JSON.stringify(log));
  writeFileSync(`${dir}/sfx.json`, JSON.stringify(await p.evaluate(() => window.__klang)));
  console.log(sc.name, JSON.stringify(info), frames, 'Bilder', blocked >= 0 ? `ACHTUNG: ab Bild ${blocked} kein Vorankommen` : '');
  await ctx.close();
}
await b.close();
srv?.kill();
