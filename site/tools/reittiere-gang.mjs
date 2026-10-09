// Reittier-Parade der Startseite: jedes Reittier mit eigener Gangart statt des gemeinsamen Spiel-Laufzyklus.
// Pferde: Vier-Takt-Galopp mit Schwebephase und nickendem Hals. Wolf/Höllenhund: Sprungbogen (Absprung, Flug
// 6 Weltpixel hoch, Landung vorne, kurze geduckte Bodenphase). Elch: diagonaler Trab mit hohem Knie.
// Käfer: schneller Dreifuß-Gang mit Wippen. Sumpfschreiter: staksiger Hochschritt. Drachen: kräftiger
// Flügelschlag, Körper hebt sich im Abschlag (die Flughöhe setzt die Seite selbst, Wert in fly).
// Gezeichnet wird mit dem echten Reittier-Raster aus src/sprites/mounts.js; beim Laden (page.route) werden
// Stellschrauben ergänzt: Fußstellung je Bein (pose.feet, auch im Sechsbein-Pfad des Käfers), Rumpfneigung
// (pose.pitch), Flügelausschlag und angezogene Krallen der Drachen.
// Ergebnis je Reittier: gang-<id>.png (waagerechter Streifen, RES 2, gleicher Fußpunkt; Sprung-/Schwebehöhe
// ist eingebacken) und gang.json (w, h, res, frames, fps, gait, foot, fly, name, lift = Höhe über Boden je Bild).
//   npx http-server . -p 8102 -s &     (Module direkt aus dem Projektordner)
//   node site/tools/reittiere-gang.mjs site/img [ids]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'gang'; mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3]?.split(',');
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
// Gangarten (läuft im Browser, B = Körperbau aus mounts.js). frame(u, B) mit u = 0..1 im Zyklus liefert:
//   L = Höhe der ganzen Figur über dem Boden (Weltpixel, eingebacken), bob = Rumpf tiefer (+) / höher (-),
//   pitch = Neigung (Weltpixel je Weltpixel nach vorne, + = Brust tiefer), nod = Kopf/Hals tiefer (+),
//   feet = je Bein [vor/zurück, Höhe über Figurboden] in Reihenfolge des Beinarrays in mounts.js.
const GAITCODE = `
const TAU = Math.PI * 2, fr = (v) => ((v % 1) + 1) % 1;
// Bein mit Aufsetzen bei u = t0: Stand (vorne -> hinten) für duty, dann Schwung angehoben nach vorne
const leg = (u, t0, duty, S, H, k = 0.7) => {
  const q = fr(u - t0);
  if (q < duty) return [S * (1 - 2 * q / duty), 0];
  const s = (q - duty) / (1 - duty);
  return [-S * Math.cos(Math.PI * s), H * Math.pow(Math.sin(Math.PI * s), k)];
};
const lerp = (a, b, t) => a + (b - a) * t;
// Schlüsselbilder zyklisch interpolieren
const keys = (K, u) => {
  const x = u * K.length, i = Math.floor(x) % K.length, t = x - Math.floor(x), A = K[i], Z = K[(i + 1) % K.length];
  const m = (a, z) => Array.isArray(a) ? a.map((v, j) => m(v, z[j])) : lerp(a, z, t);
  return Object.fromEntries(Object.keys(A).map((k) => [k, m(A[k], Z[k])]));
};
const len = (B) => B.up + B.low;
return {
  // Vier-Takt-Galopp: hinten fern, hinten nah, vorne fern, vorne nah, dann Schwebephase (Beine gesammelt)
  gallop: { n: 12, fps: 15, frame(u, B) {
    const S = B.stride * 1.35, H = len(B) * 0.42, D = 0.32;
    const feet = [leg(u, 0.12, D, S, H), leg(u, 0.44, D, S, H * 1.15), leg(u, 0, D, S, H), leg(u, 0.32, D, S, H * 1.15)];
    const a = fr(u - 0.76), L = a < 0.24 ? 3 * Math.sin(Math.PI * a / 0.24) : 0;
    return { L, feet, bob: 0.9 * Math.cos(TAU * (u - 0.4)) - 0.2, pitch: -0.11 * Math.cos(TAU * (u - 0.12)), nod: 2.2 * Math.sin(TAU * (u - 0.29)) };
  } },
  // Trab: diagonale Paare (hinten nah + vorne fern, vorne nah + hinten fern), kurzer Schwebemoment, hohes Knie vorne
  trot: { n: 10, fps: 10, frame(u, B) {
    const S = B.stride * 1.05, D = 0.4, t0 = 0.05, Hf = len(B) * 0.48, Hh = len(B) * 0.3;
    const fore = (t) => { const [x, y] = leg(u, t, D, S, Hf, 0.5); return [y > 0 ? x * 0.55 + y * 0.35 : x, y]; };
    const feet = [leg(u, t0, D, S, Hh), fore(t0 + 0.5), leg(u, t0 + 0.5, D, S, Hh), fore(t0)];
    const q = fr(u - t0) % 0.5, L = q >= D ? 1.2 * Math.sin(Math.PI * (q - D) / (0.5 - D)) : 0;
    return { L, feet, bob: 1.3 * Math.sin(Math.PI * q / D) * (q < D ? 1 : 0) - 0.4, pitch: 0.03 * Math.sin(TAU * (u - t0)), nod: 0.9 * Math.sin(2 * TAU * (u - t0)) };
  } },
  // Krabbeln: Dreifuß-Gang (zwei Dreiergruppen im Wechsel), schnell, leichtes Wippen und Schaukeln
  scuttle: { n: 8, fps: 18, frame(u, B) {
    const S = 3.6, H = 3.6, D = 0.5;
    const A = (t) => leg(u, t, D, S, H, 0.6);
    // Beinarray: [hinten nah, hinten fern, Mitte nah, Mitte fern, vorne nah, vorne fern]
    const feet = [A(0), A(0.5), A(0.5), A(0), A(0), A(0.5)];
    return { L: 0, feet, bob: 1.1 * Math.cos(2 * TAU * u) + 0.1, pitch: 0.07 * Math.sin(TAU * u), nod: 0 };
  } },
  // Staksen: langsamer, hoher Vogelschritt, Rumpf hebt sich über dem Standbein, Kopf pumpt
  stalk: { n: 12, fps: 8, frame(u, B) {
    const S = B.stride * 1.15, H = len(B) * 0.5, D = 0.58;
    const st = (t) => { const [x, y] = leg(u, t, D, S, H, 0.5); return [y > 0 ? x * 0.7 + y * 0.25 : x, y]; };
    const feet = [st(0), st(0.5)];
    return { L: 0, feet, bob: -1.6 * Math.cos(2 * TAU * (u - 0.29)) + 0.4, pitch: 0.04 * Math.sin(2 * TAU * u), nod: 2.6 * Math.sin(2 * TAU * (u - 0.29)) };
  } },
  // Sprung: Sammeln, Absprung (Hinterläufe gestreckt), Flug (gestreckt, dann Hinterläufe angezogen),
  // Landung auf den Vorderläufen, kurze geduckte Bodenphase
  bound: { n: 12, fps: 14, frame(u, B) {
    const k = len(B) / 9.8;
    const K = [
      { L: 0, bob: 1.6, pitch: 0.0, nod: 0.6, h: [3, 0], f: [-2.5, 0.6] },
      { L: 0, bob: 0.4, pitch: -0.13, nod: -1, h: [-1.5, 0], f: [2, 3.5] },
      { L: 2, bob: -0.2, pitch: -0.16, nod: -1.2, h: [-5, 0], f: [4, 3] },
      { L: 4.5, bob: -0.4, pitch: -0.07, nod: -0.6, h: [-6.5, 1], f: [5.5, 2] },
      { L: 6, bob: -0.4, pitch: 0, nod: 0, h: [-6.5, 1.5], f: [6.5, 1.5] },
      { L: 6, bob: -0.2, pitch: 0.05, nod: 0.3, h: [-3, 3.5], f: [6, 0.5] },
      { L: 4.5, bob: 0, pitch: 0.1, nod: 0.6, h: [-0.5, 4], f: [5, 0] },
      { L: 2.5, bob: 0, pitch: 0.14, nod: 1, h: [0.5, 4], f: [4, 0] },
      { L: 0.5, bob: 0.3, pitch: 0.15, nod: 1.3, h: [1, 3.5], f: [3, 0] },
      { L: 0, bob: 1.4, pitch: 0.12, nod: 1.6, h: [1.5, 2.5], f: [1.5, 0] },
      { L: 0, bob: 2.2, pitch: 0.04, nod: 1.2, h: [3, 0], f: [0, 0] },
      { L: 0, bob: 2.2, pitch: 0, nod: 0.8, h: [3.5, 0], f: [-1.5, 0] },
    ];
    const P = keys(K, u), air = (y) => y > 0.2 || P.L > 0.2;
    const sc = ([x, y]) => [x * k, y * k];
    const feet = [sc(P.h), sc(P.f), sc([P.h[0] + 1.3, P.h[1]]), sc([P.f[0] - 1.5, P.f[1] + (air(P.f[1]) ? 0.8 : 0)])];
    return { L: P.L, feet, bob: P.bob * k, pitch: P.pitch, nod: P.nod * k };
  } },
  // Flug: kräftiger Flügelschlag (flap + = Schwinge unten), Körper steigt im Abschlag, sinkt im Aufschlag
  fly: { n: 12, fps: 12, fly: 16, frame(u, B) {
    const ph = TAU * u;
    return { L: 2.6 * (1 + Math.sin(ph - 0.5)), fly: true, flap: 3 + Math.sin(ph) * 16, tuck: 3.2, nod: 1.2 * Math.sin(ph + 1), bob: 0 };
  } },
};`;
const SOV = ['sovereign_helm', 'sovereign_plate', 'sovereign_gauntlets', 'sovereign_sabatons'];
// Reiter wie in ritte.mjs (Volk, Klasse, Ausrüstung), dazu Gangart
const RIDERS = {
  rime_drake: ['dwarf', 'ranger', ['skalvyr_rib_bow', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'], 'fly'],
  hellhound: ['dwarf', 'warrior', ['tyrant_helm', 'tyrant_plate', 'tyrant_gauntlets', 'tyrant_sabatons', 'crown_of_embers_blade'], 'bound'],
  cinder_drake: ['human', 'warrior', [...SOV, 'kingsbane'], 'fly'],
  nightmare_steed: ['emberborn', 'rogue', ['veilpiercer', 'wyrmscale_cap', 'wyrmscale_jerkin', 'wyrmscale_grips', 'wyrmscale_boots'], 'gallop'],
  ember_charger: ['human', 'warrior', ['tyrant_helm', 'khar_hauberk', 'khar_grips', 'khar_boots', 'kingsbane'], 'gallop'],
  frost_elk: ['elf', 'ranger', ['dawnstring', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'], 'trot'],
  bone_stallion: ['dwarf', 'warrior', ['rimeforged_coif', 'hillking_cuirass', 'hillking_gauntlets', 'kingsbane'], 'gallop'],
  spore_beetle: ['elf', 'mage', ['staff_of_last_ash', 'rotmother_hood', 'rotmother_robe', 'rotmother_gloves'], 'scuttle'],
  ash_wolf: ['dwarf', 'mage', ['staff_of_last_ash', 'colossus_hood', 'colossus_robe', 'colossus_gloves', 'colossus_slippers'], 'bound'],
  marsh_strider: ['elf', 'rogue', ['veilpiercer', 'bogdread_hood', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'], 'stalk'],
  steppe_horse: ['human', 'ranger', ['dawnstring', 'jarl_cap', 'bogdread_jerkin', 'bogdread_grips', 'bogdread_boots'], 'gallop'],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
// Stellschrauben in sprites/mounts.js (nur für diese Aufnahme)
await p.route('**/src/sprites/mounts.js', async (route) => {
  let s = await (await route.fetch()).text();
  const rep = (a, z) => { if (!s.includes(a)) throw new Error('Stelle fehlt: ' + a.slice(0, 50)); s = s.replace(a, z); };
  // Drache: Flügelausschlag und angezogene Krallen von außen
  rep('const flap = walk ? Math.sin(ph) * 1.8 : Math.sin(ph * 0.5) * 0.4;', 'const flap = pose.flap ?? (walk ? Math.sin(ph) * 1.8 : Math.sin(ph * 0.5) * 0.4);');
  rep('const [fx, lift] = walk ? footAt(ph + L.ph, B.stride, B.lift) : [0, 0];', 'const [fx, lift] = pose.tuck ? [L.fore ? 1.2 : -2.2, pose.tuck] : walk ? footAt(ph + L.ph, B.stride, B.lift) : [0, 0];');
  // Übrige Reittiere (auch der Käfer mit eigenem Sechsbein-Pfad): Rumpfneigung und Fußstellung je Bein von außen
  rep('const bob = pose.bob, dy = (p) => [p[0], p[1] + bob];', 'const bob = pose.bob, dy = (p) => [p[0], p[1] + bob + p[0] * (pose.pitch ?? 0)];');
  rep('legs.push({ root: [rx, B.hip[1] + bob], ph: i * 2.1, near: true, i }, { root: [rx - 0.8, B.hip[1] + bob], ph: i * 2.1 + Math.PI, near: false, i });',
    'legs.push({ root: dy([rx, B.hip[1]]), ph: i * 2.1, near: true, i }, { root: dy([rx - 0.8, B.hip[1]]), ph: i * 2.1 + Math.PI, near: false, i });');
  rep('const [fx, lift] = pose.walk ? footAt(pose.ph + L.ph, B.stride, B.lift) : [0, 0];', 'const [fx, lift] = pose.feet ? pose.feet[legs.indexOf(L)] : pose.walk ? footAt(pose.ph + L.ph, B.stride, B.lift) : [0, 0];');
  s += '\nexport { makeFrame, BODY, RideFrame };\n';
  route.fulfill({ body: s, contentType: 'text/javascript' });
});
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const res = await p.evaluate(async ({ RIDERS, ONLY, GAITCODE }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const { makeFrame, BODY, RideFrame } = await import('/src/sprites/mounts.js');
  const out = {}, meta = {}, log = [];
  const GAITS = new Function(GAITCODE)();
  const S = 600, AX = 300, AY = 420, RES = 2;
  for (const [mountId, [raceId, classId, gear, gaitId]] of Object.entries(RIDERS)) {
    if (ONLY && !ONLY.includes(mountId)) continue;
    const G = GAITS[gaitId];
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push('fehlt ' + id); }
    const rider = getHeroSprites(raceId, classId, 0, resolveGear(equipment, g.content), null, RES).ride;
    const def = g.content.find('mount', mountId);
    const B = BODY[def.sprite];
    const cs = [], lifts = [], h2 = (v) => Math.round(v * 2) / 2;
    for (let i = 0; i < G.n; i++) {
      const u = i / G.n, ph = u * Math.PI * 2, P = G.frame(u, B);
      const pose = P.fly
        ? { walk: false, ph, bob: 0, nod: P.nod, flap: P.flap, tuck: P.tuck }
        : { walk: true, ph, bob: h2(P.bob), nod: P.nod, pitch: P.pitch, feet: P.feet };
      const m = makeFrame(B, def.look, pose, RES);
      const fr = new RideFrame(m, rider.frames[Math.floor(u * 2) % rider.frames.length]);
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      // Ganze Figur über dem Boden (Sprung, Schwebephase, Flügelschlag-Hub), auf halbe Weltpixel gerundet
      const lift = h2(P.L), dy = -lift;
      x.setTransform(RES, 0, 0, RES, 0, 0);
      fr.draw(x, AX / RES, AY / RES + dy, {});
      // Leuchtpunkte (Augen, Glut, Schatten) genau wie Hero.renderEmissive im Spiel
      for (const gl of fr.glows ?? []) {
        const gx = Math.round(AX / RES + gl.x), gy = Math.round(AY / RES + dy + gl.y), r = Math.max(1, Math.min(4, Math.round(gl.r)));
        x.globalAlpha = 0.2; x.fillStyle = gl.color;
        x.fillRect(gx - r, gy - r + 1, r * 2 + 1, r * 2 - 1); x.fillRect(gx - r + 1, gy - r, r * 2 - 1, r * 2 + 1);
        x.globalAlpha = 0.9; x.fillRect(gx, gy, 1, 1); x.globalAlpha = 1;
      }
      x.setTransform(1, 0, 0, 1, 0, 0);
      cs.push(c); lifts.push(lift);
    }
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of cs) {
      const d = c.getContext('2d').getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    // Rahmen in ganzen Weltpixeln (gerade Bildpunktzahl), Fußpunkt bleibt auf einem Weltpixel
    const pad = 2;
    x0 = AX - Math.ceil((AX - x0 + pad) / RES) * RES; y0 = AY - Math.ceil((AY - y0 + pad) / RES) * RES;
    x1 = AX + Math.ceil((x1 - AX + pad) / RES) * RES; y1 = AY + Math.max(2, Math.ceil((y1 - AY + pad) / RES)) * RES;
    const w = x1 - x0, h = y1 - y0;
    const sheet = document.createElement('canvas'); sheet.width = w * cs.length; sheet.height = h;
    const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
    cs.forEach((c, i) => sx.drawImage(c, x0, y0, w, h, i * w, 0, w, h));
    out[`gang-${mountId}.png`] = sheet.toDataURL('image/png');
    meta[mountId] = { w: w / RES, h: h / RES, res: RES, frames: cs.length, fps: G.fps, gait: gaitId, foot: { x: (AX - x0) / RES, y: (AY - y0) / RES }, fly: G.fly ?? 0, name: def.name, lift: lifts };
  }
  return { out, meta, log };
}, { RIDERS, ONLY, GAITCODE });
for (const [f, url] of Object.entries(res.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
if (res.log.length) console.log(res.log.join('\n'));
writeFileSync(`${OUT}/gang.json`, JSON.stringify(res.meta, null, 1));
console.log(JSON.stringify(res.meta));
await b.close();
