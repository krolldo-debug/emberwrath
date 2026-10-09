// Bossbühnen der Startseite: jeder der vier Bosse kämpft auf dem echten Boden seines Bossraums.
// Je Boss zwei Bilder (verlustfreie WebP, 1 Bildpunkt = 1 Weltpixel):
//   boss-<name>-boden.webp  Boden des Bossraums, so wie das Spiel ihn zeichnet (Kacheln, Deko, Raumlicht, Leuchten,
//                           Bloom), ohne Figuren und ohne UI. Das Licht des Bosses (coreLight) gehört zum Raumlicht.
//   boss-<name>-kampf.webp  waagerechter Streifen gleich großer Bilder (transparenter Grund) für genau diesen Boden:
//                           Boss, Warnflächen, Angriffe, Geschosse, Partikel, Leuchten, Lichtschein der Angriffe auf dem
//                           Boden und Brandspuren. Eine nahtlose Schleife bei 12 fps: Ruhe → Warnfläche → Angriff →
//                           Ausklingen → Ruhe.
// Verfahren: Die Spielschleife steht, die Simulation wird mit g.update(1/60) getaktet (5 Schritte je Bild). Jedes Bild
// wird vollständig mit World.render gezeichnet (Boden, Licht, Emissive-Pass, Bloom), nur mit unsichtbarem Helden.
// Der Kampfstreifen ist der Unterschied zum leeren Boden: je Bildpunkt die kleinste Deckkraft a und Farbe C, mit der
// C·a + Boden·(1−a) genau das Spielbild ergibt; wo Figur, Geschoss oder Partikel deckend liegen, ist a = 1 (die Figur
// bleibt auch auf leicht anderem Grund deckend). Damit färben Warnflächen und Angriffslicht den Boden mit.
// Erzwungene Attacken: beim Laden (page.route) bekommt die Angriffswahl der Bosse einen Schalter `__only`.
// Ziel der Angriffe ist der unverwundbare, unsichtbare Held an fester Stelle.
// Schleife: Ruheanimation und Glutpuls werden im Ausklingen sanft auf den Stand von Bild 0 gezogen; Partikel, die am
// Ende noch leben, werden in die ersten Bilder übertragen; Brandspuren verblassen im Ausklingen.
// Aufruf: node site/tools/bosse-buehne.mjs [ZIELORDNER=site/img] [bosse=ulgrim,rotmother,skalvyr,malgareth] [URL]
//   Standard-URL http://localhost:8104/index.html (Server im Repo-Ordner). Zwischenbilder nach $ZW (/tmp/bosse-buehne),
//   dort auch die Kontaktbilder kontakt-<name>.png (jedes 4. Bild, 3× vergrößert). Maße in site/tools/bosse-buehne.json.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = resolve(HERE, '../img'), ONLY, URL = 'http://localhost:8104/index.html'] = process.argv.slice(2);
const ZW = process.env.ZW ?? '/tmp/bosse-buehne';
mkdirSync(OUT, { recursive: true }); mkdirSync(ZW, { recursive: true });
const FPS = 12;

// Bühnen: Bühnenmaß w × h, Fußpunkt foot, Boss relativ zu seinem Platz im Raum (at), Held relativ zum Boss (hero),
// Phase (hp = Lebensanteil, der die Phase auslöst), Ruhe vor dem Angriff (pre, Bilder), Mindestruhe danach (post).
// plan: Angriffe nacheinander { only, wait (Bilder Pause davor), spots (Ziele neu setzen) }.
const BOSSE = {
  // Ulgrim, Phase 2: Schwungschlag → Rückhand → Grabspalter mit Geisterriss (volle Kombo)
  ulgrim: {
    zone: 'howling_barrow', w: 192, h: 160, foot: [84, 146], at: [0, 0], hero: [58, -16], hp: 0.45, grade: [1.3, 1.15],
    pre: 8, post: 12, plan: [{ only: 'sweep', combo: 2 }],
  },
  // Mutter Fäulnis, Phase 2: Wurzelbruch – Arme in den Boden, Warnkreise, Dornen brechen nacheinander hervor
  rotmother: {
    zone: 'spore_hollow', w: 192, h: 160, foot: [84, 146], at: [0, 0], hero: [80, -10], hp: 0.5, grade: [1.1, 1.12, 1.45],
    pre: 8, post: 12,
    plan: [{ only: 'roots', spots: [[54, -2], [94, -32], [-62, -12], [-34, 8], [96, 6]] }],
  },
  // Skalvyr, Phase 3 (glühende Adern): Eissplitter-Regen – Eiszapfen stürzen in markierte Kreise
  skalvyr: {
    zone: 'rime_caverns', w: 192, h: 160, foot: [100, 146], at: [0, 0], hero: [-70, 6], hp: 0.25, grade: [1.15, 1.08],
    pre: 8, post: 12,
    plan: [{ only: 'call', spots: [[-62, 4], [-34, -34], [-80, -24], [46, -40], [62, 6], [-14, 10], [88, -14]] }],
  },
  // Malgareth, Gestalt 2 (geflügelt): Aschenwelle als Fächer – drei Bahnen und Einschlagkreis
  malgareth: {
    zone: 'ashen_throne', w: 224, h: 216, foot: [100, 200], at: [0, 56], hero: [100, -34], hp: 0.5, grade: [1.25, 1.1],
    pre: 8, post: 12, plan: [{ only: 'wave' }],
  },
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const meta = existsSync(resolve(HERE, 'bosse-buehne.json')) ? JSON.parse(readFileSync(resolve(HERE, 'bosse-buehne.json'), 'utf8')) : {};
for (const [name, sc] of Object.entries(BOSSE).filter(([k]) => !ONLY || ONLY.split(',').includes(k))) {
  const dir = `${ZW}/${name}`;
  // NUR_STREIFEN=1: Simulation überspringen, vorhandene Zwischenbilder neu zu Streifen verarbeiten
  if (!process.env.NUR_STREIFEN) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', name, e.message));
  // Angriffswahl erzwingbar machen: __only ersetzt die Zufallsauswahl (nur für diese Aufnahme)
  await p.route(/\/src\/entities\/(Ulgrim|RotMother|Skalvyr|Malgareth)\.js$/, async (route) => {
    let s = await (await route.fetch()).text();
    const A = 'if (!opts.length) { this.cooldown = 0.3; return; }';
    if (!s.includes(A)) throw new Error('Stelle fehlt in ' + route.request().url());
    s = s.replace(A, 'if (this.__only) { opts.length = 0; opts.push([this.__only, 1]); this.__only = null; }\n    ' + A);
    route.fulfill({ body: s, contentType: 'text/javascript' });
  });
  await p.goto(URL);
  await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
  await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
  const info = await p.evaluate(async (sc) => {
    const FPS = 12;
    const g = window.emberfall, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.prefs.set('muted', true); g.prefs.set('guidePath', false);
    const acc = g.save.createAccount('Zolva'); g.login(acc.id);
    g.newGame({ character: { name: 'Zolva', raceId: 'human', classId: 'warrior' } });
    await wait(600);
    g.scenes.current.travel(sc.zone, 'start'); await wait(2500);
    const s = g.scenes.current, w = s.world, bo = w.boss, h = w.hero;
    g.loop.running = false;
    await new Promise((r) => requestAnimationFrame(r));
    const { CONFIG } = await import('/src/config.js');
    const log = [];
    // Bodenspuren des Raums merken (Grundzustand)
    const snapDecals = () => new Map([...w.decals.tiles].map(([k, d]) => { const c = document.createElement('canvas'); c.width = d.c.width; c.height = d.c.height; c.getContext('2d').drawImage(d.c, 0, 0); return [k, c]; }));
    const decals0 = snapDecals();
    // Mischt die Bodenspuren: Grundzustand, darüber Stand `snap` mit Deckkraft k (k = 0: genau der Grundzustand)
    const setDecals = (snap, k) => {
      for (const [key, d] of [...w.decals.tiles]) {
        const c0 = decals0.get(key), c1 = snap?.get(key);
        if (!c0 && !(c1 && k > 0)) { w.decals.tiles.delete(key); continue; }
        d.ctx.save(); d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.globalAlpha = 1; d.ctx.clearRect(0, 0, d.c.width, d.c.height);
        if (c0) d.ctx.drawImage(c0, 0, 0);
        if (c1 && k > 0) { d.ctx.globalAlpha = k; d.ctx.drawImage(c1, 0, 0); }
        d.ctx.restore();
      }
    };
    // Ruhige Bühne: keine anderen Gegner, kein Nachschub, keine Tiere, keine Umgebungspartikel
    for (const e of w.enemies) if (e !== bo) e.removed = true;
    w.spawner.update = () => {};
    for (const c of w.life?.list ?? []) c.removed = true;
    if (w.life) w.life.update = () => {};
    const P = w.particles, spawn0 = P.spawn.bind(P);
    let blockSpawn = false;
    P.spawn = (o) => {
      if (blockSpawn) return null;
      const st = new Error().stack;
      // Umgebung (Fackeln, Becken, Truhen, Tiere, Raumpartikel) bleibt ruhig; die Website legt eigene Teilchen darüber
      if (/ambientParticles|Prop\.update|Interactive\.js|Ambient\.js|Decor\.js/.test(st)) return null;
      const amb = st.includes('#ambient');
      const q = spawn0(o);
      if (q) { q.__fx = !amb; if (amb) q.decal = null; }
      return q;
    };
    // Bodenspuren: Umgebung des Bosses (Schleim, Reif) nie, in Ruhephasen gar nicht
    let blockDecals = false;
    for (const k of ['pixel', 'splat', 'scorch', 'stamp', 'stampFrame']) {
      const f = w.decals[k].bind(w.decals);
      w.decals[k] = (...a) => (blockDecals || new Error().stack.includes('#ambient') ? undefined : f(...a));
    }
    // Held: unsichtbar, unverwundbar, ohne eigenes Licht
    h.render = () => {}; h.renderEmissive = () => {}; h.takeHit = () => false;
    w.lights = w.lights.filter((l) => l.follow !== h);
    // Boss und Held an feste Stellen
    const B = { x: bo.home.x + sc.at[0], y: bo.home.y + sc.at[1] }, H = { x: B.x + sc.hero[0], y: B.y + sc.hero[1] };
    let hpFrac = 1, forcing = false;
    // Der Boss bleibt an seinem Platz: ohne Lauftempo steht er in der Verfolgung ruhig (Ruheanimation statt Laufen)
    bo.def = { ...bo.def, speed: 0 };
    const pin = () => {
      h.x = H.x; h.y = H.y; h.vx = h.vy = h.kbx = h.kby = 0; h.hp = h.maxHp; h.dead = false;
      bo.x = B.x; bo.y = B.y; bo.vx = bo.vy = 0; bo.kbx = bo.kby = 0;
      bo.hp = Math.round(bo.maxHp * hpFrac);
      for (const k in bo.timers ?? {}) bo.timers[k] = 99;
      if ('closeT' in bo) bo.closeT = 0;
      if (!forcing && bo.state === 'chase') bo.cooldown = 99;
    };
    let simT = 0;
    const step = () => { pin(); g.update(1 / 60); pin(); simT += 1 / 60; };
    const steps = (n) => { for (let i = 0; i < n; i++) step(); };
    // Kampf beginnen, Phase herbeiführen
    bo.engage(w);
    for (let i = 0; i < 600 && bo.state !== 'chase'; i++) step();
    hpFrac = sc.hp;
    // warten, bis der Boss nach allen Phasenwechseln 1 s lang ruhig verfolgt
    for (let i = 0, calm = 0; i < 2400 && calm < 60; i++) { step(); calm = bo.state === 'chase' ? calm + 1 : 0; }
    log.push(`Phase ${bo.phase}, Zustand ${bo.state}`);
    // Alles vom Phasenwechsel abräumen (Eiswände, Frostfelder, Wellen, Lichter, Partikel, Spuren)
    const clean = () => {
      for (const hz of bo.hazards ?? []) hz.removed = true;
      if (bo.hazards) bo.hazards = [];
      if (bo.pending) bo.pending = [];
      bo.next = null; bo.followUp = null;
      w.effects = w.effects.filter((e) => e === w.rune);
      w.entities = w.entities.filter((e) => !/Telegraph|Wave|Pillar|Field|Icicle|Spike|Lash|Rift|Cloud|Lob|Marker|Spear|Meteor|Patch|Fissure|Ring|Flare|Phantom|Shockwave/.test(e.constructor?.name ?? ''));
      w.projectiles.length = 0;
      w.combat.hitboxes = [];
      w.lights = w.lights.filter((l) => l.ttl === Infinity && !l.dead);
      P.active.length = 0;
      setDecals(null, 0);
    };
    clean(); steps(90); clean();
    // Dauerlichter (Raum, Boss) ruhig stellen: Flackern aus, Mittelwert der Helligkeit
    for (const l of w.lights) { l.intensity *= 1 - (l.flicker ?? 0) * 0.5; l.flicker = 0; }
    steps(30);
    // Zeichnen: eigene Zeichenfläche in Weltpixeln, Kamera auf den Bühnenausschnitt; Zeit der Deko eingefroren
    const W = sc.w, Hh = sc.h, cx = Math.round(B.x - sc.foot[0]), cy = Math.round(B.y - sc.foot[1]);
    const statics = [...w.props, ...w.entities];
    const T0 = w.time;
    for (const o of statics) o.__t0 = o.t;
    const F = Object.getPrototypeOf(g.font), fdraw = F.draw;
    // Licht der Angriffe (alle Lichter, die nicht zum Raum gehören): im Spiel hellt es den Boden multiplikativ auf, was
    // jeden Bildpunkt der Bodentextur verändert. Als weicher, additiver Schein (wie der Bloom des Spiels) bleibt es
    // lesbar und lässt sich klein speichern. glow = Stärke des Scheins, 0 = wie im Spiel (multiplikativ).
    const { getLightSprite } = await import('/src/sprites/effects.js');
    const roomLights = new Set(w.lights);
    const LS = w.lighting, apply0 = LS.apply.bind(LS);
    LS.apply = (c, camX, camY, lights) => {
      if (!sc.glow) return apply0(c, camX, camY, lights);
      const dyn = lights.filter((l) => !roomLights.has(l)), keep = dyn.map((l) => l.value);
      dyn.forEach((l) => { l.value = 0; });
      try { apply0(c, camX, camY, lights); } finally { dyn.forEach((l, i) => { l.value = keep[i]; }); }
      c.save(); c.globalCompositeOperation = 'lighter'; c.imageSmoothingEnabled = true;
      for (const l of dyn) {
        const r = l.radius; c.globalAlpha = Math.max(0, Math.min(1, l.value * sc.glow));
        c.drawImage(getLightSprite(64, l.color), l.x - camX - r, l.y - camY - r, r * 2, r * 2);
      }
      c.restore();
    };
    const renderFull = (fx) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      const ov = [CONFIG.viewWidth, CONFIG.viewHeight], tw = w.time, tt = statics.map((o) => o.t);
      CONFIG.viewWidth = W; CONFIG.viewHeight = Hh; w.time = T0;
      for (const o of statics) if (o.__t0 !== undefined) o.t = o.__t0;
      F.draw = () => {};
      bo.hpBarTimer = 0; bo.flash = 0;
      // Lichtschein der Warnflächen auf dem Boden: auf Wunsch gedämpft (spart viel Dateigröße, die Fläche selbst bleibt)
      const tl = w.entities.filter((e) => e.constructor?.name === 'Telegraph' && e.light).map((e) => [e.light, e.light.value]);
      for (const [l, v] of tl) l.value = v * (sc.teleLight ?? 1);
      try { fx?.before?.(); w.render(x, cx, cy); } finally {
        for (const [l, v] of tl) l.value = v;
        fx?.after?.(); F.draw = fdraw;
        CONFIG.viewWidth = ov[0]; CONFIG.viewHeight = ov[1]; w.time = tw;
        statics.forEach((o, i) => { if (o.__t0 !== undefined) o.t = tt[i]; });
      }
      return cv;
    };
    // Deckende Teile (Boss, Angriffe im Lit-Pass, Geschosse, Partikel) als Maske: dort ist der Streifen voll deckend
    const isFx = (e) => !statics.includes(e) && e.constructor?.name !== 'Telegraph' && e.constructor?.name !== 'FloatingText';
    const renderCover = () => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      const ds = [bo, ...w.entities.filter(isFx), ...w.projectiles].sort((a, c) => a.sortY - c.sortY);
      for (const d of ds) d.render(x, cx, cy);
      P.drawLit(x, cx, cy);
      return cv;
    };
    // Grundzustand (Boden): ohne Boss
    const bR = bo.render, bE = bo.renderEmissive;
    const hideBoss = { before: () => { bo.render = () => {}; bo.renderEmissive = () => {}; }, after: () => { bo.render = bR; bo.renderEmissive = bE; } };
    P.active.length = 0;
    const boden = renderFull(hideBoss).toDataURL('image/png');

    // ---------------------------------------------------------------- Aufnahme
    const frames = [];   // { T, C } Leinwände
    const shot = (clock) => {
      // clock: Ruhe-Takt (Animationszeit und Glutpuls nur fürs Zeichnen verschoben)
      const fx = clock ? { before: () => { clock.save = [bo.animator.time, bo.stateTime]; bo.animator.time += clock.da; bo.stateTime += clock.dg; }, after: () => { [bo.animator.time, bo.stateTime] = clock.save; } } : null;
      const T = renderFull(fx);
      fx?.before(); const C = renderCover(); fx?.after();
      frames.push({ T, C, st: bo.state, an: bo.animator.name });
    };
    const STEPS = 60 / 12;
    const frame = (clock) => { steps(STEPS); shot(clock); };
    const fxBusy = () => w.entities.some(isFx) || w.entities.some((e) => e.constructor?.name === 'Telegraph') || w.effects.some((e) => e !== w.rune) || w.projectiles.length > 0 || P.active.some((q) => q.__fx) || bo.state !== 'chase' || (bo.pending?.length ?? 0) > 0 || !!bo.next || !!bo.followUp;
    // Startwerte der Ruhe (Bild 0)
    blockDecals = true;
    const idle0 = { a: bo.animator.time, g: bo.stateTime, name: bo.animator.name };
    for (let i = 0; i < sc.pre; i++) frame();
    blockDecals = false;
    // Angriffe nach Plan
    const newOf = (cls, before) => w.entities.filter((e) => e.constructor?.name === cls && !before.has(e));
    for (const st of sc.plan) {
      for (let i = 0; i < 240 && fxBusy() && st !== sc.plan[0]; i++) frame();
      for (let i = 0; i < (st.wait ?? 0); i++) frame();
      const before = new Set(w.entities);
      forcing = true; bo.__only = st.only; bo.cooldown = 0;
      let k = 0;
      for (; k < 120 && bo.state === 'chase'; k++) step();
      forcing = false;
      if (bo.state === 'chase') log.push('Angriff startet nicht: ' + st.only);
      if (st.combo != null) bo.combo = st.combo;
      if (st.spots) {
        // Ziele (Warnkreise und ihre Gefahr) an feste Stellen der Bühne setzen; überzählige entfallen
        const tel = newOf('Telegraph', before), hz = w.entities.filter((e) => !before.has(e) && e.constructor?.name !== 'Telegraph' && 'delay' in e);
        hz.forEach((e, i) => {
          const t = tel.find((q) => Math.abs(q.x - e.x) < 0.01 && Math.abs(q.y - e.y) < 0.01);
          const sp = st.spots[i];
          if (!sp) { e.removed = true; if (t) { t.removed = true; t.light && (t.light.dead = true); } return; }
          e.x = B.x + sp[0]; e.y = B.y + sp[1];
          if (t) { t.x = e.x; t.y = e.y; if (t.light) { t.light.x = e.x; t.light.y = e.y; } }
        });
        log.push(`${st.only}: ${hz.length} Ziele, ${Math.min(hz.length, st.spots.length)} gesetzt`);
      }
      // Rest dieses Bildes auffüllen, dann aufnehmen
      steps(Math.max(0, STEPS - (k % STEPS)));
      shot();
    }
    // Angriff läuft, bis alles verklungen ist
    let n = 0;
    while (fxBusy() && n < 300) { frame(); n++; }
    if (fxBusy()) log.push('verklingt nicht: ' + JSON.stringify({ ent: w.entities.filter(isFx).map((e) => e.constructor.name), eff: w.effects.filter((e) => e !== w.rune).map((e) => e.constructor.name), proj: w.projectiles.length, fx: P.active.filter((q) => q.__fx).length, st: bo.state }));
    blockDecals = true;
    const decalsEnd = snapDecals();
    // Ausklingen: Bodenspuren verblassen, Ruhe-Takt wird auf Bild 0 gezogen
    const an = bo.animator, idleAnim = an.current, Ca = idleAnim.duration;
    const pulseW = { Ulgrim: bo.enraged ? 8 : 4.5, RotMother: bo.enraged ? 8 : 4, Skalvyr: bo.enraged ? 8 : 4, Malgareth: bo.enraged ? 9 : 5 }[bo.constructor.name] ?? 4;
    const Cg = (Math.PI * 2) / pulseW;
    const mod = (v, m) => ((v % m) + m) % m, wrapD = (d, m) => { d = mod(d, m); return d > m / 2 ? d - m : d; };
    // Länge des Ausklingens: so wählen, dass die nötige Verschiebung klein bleibt (Gesamtlänge 4–6 s)
    let best = null;
    const used = frames.length;
    for (let Pn = sc.post; Pn <= sc.post + 24; Pn++) {
      const tot = used + Pn; if (tot / FPS > 6.2 && best) break;
      const aEnd = an.time + Pn / FPS, gEnd = bo.stateTime + Pn / FPS;
      // Bild Pn-1 soll einen Schritt vor Bild 0 stehen
      const da = wrapD(idle0.a - (aEnd), Ca), dg = wrapD(idle0.g - gEnd, Cg);
      const cost = Math.abs(da) / Ca + Math.abs(dg) / Cg * 0.5 + (tot / FPS < 4 ? 1 : 0) + Math.max(0, tot / FPS - 5) * 0.4;
      if (!best || cost < best.cost) best = { Pn, da, dg, cost };
    }
    const fadeN = Math.min(best.Pn - 2, 14);
    for (let i = 0; i < best.Pn; i++) {
      const k = Math.min(1, (i + 1) / best.Pn), e = k * k * (3 - 2 * k);
      setDecals(decalsEnd, Math.max(0, 1 - (i + 1) / fadeN));
      frame(an.current === idleAnim ? { da: best.da * e, dg: best.dg * e } : { da: 0, dg: best.dg * e });
    }
    log.push(`Angriff ${used - sc.pre} Bilder, Ausklingen ${best.Pn} (Takt-Korrektur ${best.da.toFixed(2)} s / ${best.dg.toFixed(2)} s), Boss am Ende ${an.name}`);
    // Partikel, die das Ende überleben: weiterlaufen lassen (ohne neue) und in die ersten Bilder übertragen
    blockSpawn = true;
    const carry = [];
    for (let j = 0; j < frames.length && P.active.length; j++) {
      steps(STEPS);
      const keep = P.active.slice();
      const withP = renderFull(hideBoss);
      P.active = []; const noP = renderFull(hideBoss); P.active = keep;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
      const x = cv.getContext('2d'); x.drawImage(renderCoverParticles(), 0, 0);
      carry.push({ j, withP, noP, cov: cv });
    }
    function renderCoverParticles() { const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const x = cv.getContext('2d'); P.drawLit(x, cx, cy); return cv; }
    const px = (cv) => cv.getContext('2d').getImageData(0, 0, W, Hh).data;
    for (const c of carry) {
      const f = frames[c.j], T = f.T.getContext('2d'), d = T.getImageData(0, 0, W, Hh), a = px(c.withP), z = px(c.noP);
      for (let i = 0; i < d.data.length; i += 4) for (let ch = 0; ch < 3; ch++) d.data[i + ch] = Math.max(0, Math.min(255, d.data[i + ch] + a[i + ch] - z[i + ch]));
      T.putImageData(d, 0, 0);
      f.C.getContext('2d').drawImage(c.cov, 0, 0);
    }
    log.push(`${carry.length} Bilder mit übertragenen Partikeln`);
    window.__frames = frames.map((f) => ({ T: f.T.toDataURL('image/png'), C: f.C.toDataURL('image/png'), st: f.st, an: f.an }));
    return { boden, n: frames.length, log, W, H: Hh, states: frames.map((f) => f.st + ':' + f.an) };
  }, sc);
  console.log(name, info.n, 'Bilder', info.log.join(' | '));
  if (process.env.STATES) console.log(info.states.join(' '));
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/boden.png`, Buffer.from(info.boden.split(',')[1], 'base64'));
  for (let i = 0; i < info.n; i += 10) {
    const part = await p.evaluate(([a, z]) => window.__frames.slice(a, z), [i, i + 10]);
    part.forEach((f, k) => {
      const nn = String(i + k).padStart(3, '0');
      writeFileSync(`${dir}/t${nn}.png`, Buffer.from(f.T.split(',')[1], 'base64'));
      writeFileSync(`${dir}/c${nn}.png`, Buffer.from(f.C.split(',')[1], 'base64'));
    });
  }
  await ctx.close();
  }
  // Streifen bauen (Pillow + numpy): Unterschied zum Boden als kleinste Deckkraft, deckende Teile voll deckend
  const py = `
import sys, glob, json
import numpy as np
from PIL import Image
d, out, name = sys.argv[1], sys.argv[2], sys.argv[3]
gb, gc, gg = float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[8])
Q = int(sys.argv[6]); DROP = float(sys.argv[7])
# Farbgebung wie die Key-Art (Gamma, Helligkeit, Kontrast), auf Boden und Spielbild gleich angewandt
def grade(x):
    return np.clip(np.round((((x / 255) ** (1 / gg) * gb) - 0.5) * gc * 255 + 127.5), 0, 255)
B = grade(np.asarray(Image.open(d + '/boden.png').convert('RGB')).astype(np.float64))
Ts = sorted(glob.glob(d + '/t*.png'))
W, H = B.shape[1], B.shape[0]
strip = np.zeros((H, W * len(Ts), 4), np.uint8)
err = 0
for i, f in enumerate(Ts):
    T = grade(np.asarray(Image.open(f).convert('RGB')).astype(np.float64))
    cov = np.asarray(Image.open(f[:-8] + 'c' + f[-7:]).convert('RGBA'))[..., 3].astype(np.float64) / 255
    up = np.where(T > B, (T - B) / np.maximum(255 - B, 1e-6), 0)
    dn = np.where(T < B, (B - T) / np.maximum(B, 1e-6), 0)
    a = np.maximum(np.maximum(up, dn).max(axis=2), np.where(cov > 0.6, 1.0, cov))
    A = np.ceil(np.clip(a, 0, 1) * 255 - 1e-9)
    # Kleinstabweichungen (≤ 2 Stufen, nur Lichtsaum) entfallen; durchscheinende Bildpunkte in Stufen von 8 (Deckkraft
    # aufgerundet, Farbe neu berechnet): unsichtbar (≤ 4 Stufen Abweichung), spart gut ein Sechstel Dateigröße
    soft = A < 255
    A[(np.abs(T - B).max(axis=2) <= (DROP if Q > 1 else 0.5)) & (cov < 0.02)] = 0
    A[np.abs(T - B).max(axis=2) < 0.5] = 0
    if Q > 1: A = np.where(soft & (A > 0), np.minimum(255, np.ceil(A / Q) * Q), A)
    a8 = A / 255
    C = np.where(a8[..., None] > 0, B + (T - B) / np.maximum(a8[..., None], 1e-9), 0)
    if Q > 1: C = np.where(soft[..., None], np.round(C / Q) * Q, C)
    C = np.clip(np.round(C), 0, 255)
    o = np.dstack([C, A]).astype(np.uint8)
    o[A == 0] = 0
    back = (o[..., :3] * a8[..., None] + B * (1 - a8[..., None]))
    err = max(err, np.abs(back - T).max())
    strip[:, i * W:(i + 1) * W] = o
Image.fromarray(B.astype(np.uint8)).save(out + '/boss-' + name + '-boden.webp', lossless=True, method=6)
Image.fromarray(strip, 'RGBA').save(out + '/boss-' + name + '-kampf.webp', lossless=True, method=6)
# Kontaktbild: jedes 4. Bild auf dem Boden, 3× vergrößert, mit Bildnummer-Lücke
sel = list(range(0, len(Ts), 4)); cols = 6; rows = (len(sel) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (W * 3 + 6), rows * (H * 3 + 6)), (20, 16, 24))
bod = Image.fromarray(B.astype(np.uint8)).convert('RGBA')
for j, i in enumerate(sel):
    fr = Image.fromarray(strip[:, i * W:(i + 1) * W], 'RGBA')
    im = Image.alpha_composite(bod, fr).convert('RGB').resize((W * 3, H * 3), Image.NEAREST)
    sheet.paste(im, ((j % cols) * (W * 3 + 6), (j // cols) * (H * 3 + 6)))
sheet.save(d + '/../kontakt-' + name + '.png')
print(json.dumps({'frames': len(Ts), 'err': float(err)}))
`;
  const r = JSON.parse(execFileSync('python3', ['-c', py, dir, OUT, name, String(sc.grade?.[0] ?? 1), String(sc.grade?.[1] ?? 1), process.env.Q ?? '8', process.env.DROP ?? '2', String(sc.grade?.[2] ?? 1)]).toString().trim());
  const kb = (f) => (statSync(`${OUT}/${f}`).size / 1024).toFixed(0);
  meta[name] = { w: sc.w, h: sc.h, frames: r.frames, fps: FPS, foot: { x: sc.foot[0], y: sc.foot[1] } };
  console.log(`${name}: ${r.frames} Bilder (${(r.frames / FPS).toFixed(2)} s), Fuß ${sc.foot}, Boden ${kb(`boss-${name}-boden.webp`)} KB, Kampf ${kb(`boss-${name}-kampf.webp`)} KB, Rückrechnung max. Abweichung ${r.err.toFixed(2)}; Kontaktbild ${ZW}/kontakt-${name}.png`);
}
await b.close();
writeFileSync(resolve(HERE, 'bosse-buehne.json'), JSON.stringify(meta, null, 1) + '\n');
