// Reittier-Parade der Startseite: jedes Reittier mit eigener Gangart statt des gemeinsamen Spiel-Laufzyklus.
// Pferde galoppieren (Schwebephase), Wölfe und der Höllenhund springen (Hinterläufe zusammen, dann Vorderläufe),
// der Frostelch trabt mit hohem Knie, Drachen fliegen mit vollem Flügelschlag und angezogenen Krallen.
// Gezeichnet wird mit dem echten Reittier-Raster aus src/sprites/mounts.js. Die Datei wird beim Laden um zwei
// Stellschrauben ergänzt (Flügelausschlag, Beinphasen, angezogene Beine), sonst bleibt sie unverändert.
// Ergebnis je Reittier: gang-<id>.png (waagerechter Streifen, gleicher Fußpunkt) und gang.json (Maße, Bilder, fps, Flughöhe).
//   npx http-server . -p 8102 -s &     (Module direkt aus dem Projektordner)
//   node site/tools/reittiere-gang.mjs site/img [ids]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'gang'; mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3]?.split(',');
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
const P = Math.PI;
// Gangarten: n Bilder je Zyklus, fps, Beinphasen [hinten nah, vorne nah, hinten fern, vorne fern], Schritt/Hub,
// bob(ph) = Rumpf auf und ab, nod(ph) = Kopfnicken, fly = Flughöhe (Weltpixel) und Flügelausschlag
const GAITS = {
  gallop: { n: 8, fps: 14, lp: [0, 0.62 * P, 0.24 * P, 0.86 * P], stride: 1.45, lift: 1.5, bob: (ph) => -1.2 * Math.sin(ph + 0.6) - 0.3, nod: (ph) => 1.4 * Math.sin(ph + 1.2) },
  bound: { n: 8, fps: 15, lp: [0, 0.78 * P, 0.1 * P, 0.9 * P], stride: 1.6, lift: 1.4, bob: (ph) => -1.6 * Math.sin(ph + 0.4), nod: (ph) => 1.2 * Math.sin(ph + 0.9) },
  trot: { n: 8, fps: 10, lp: [0, P, P, 0], stride: 1.0, lift: 1.8, bob: (ph) => -0.9 * Math.abs(Math.sin(ph)), nod: (ph) => 0.6 * Math.sin(ph * 2) },
  scuttle: { n: 6, fps: 16, stride: 1.1, lift: 1.1, bob: (ph) => -0.5 * Math.abs(Math.sin(ph * 2)), nod: () => 0 },
  stalk: { n: 8, fps: 9, stride: 1.25, lift: 1.4, bob: (ph) => -1.0 * Math.abs(Math.sin(ph)), nod: (ph) => 2.2 * Math.sin(ph * 2) },
  fly: { n: 10, fps: 10, fly: 16, flap: 13, flapOff: 4, tuck: 3.2, bob: (ph) => -3 * Math.sin(ph), nod: (ph) => 0.8 * Math.sin(ph + 1) },
};
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
  rep('const flap = walk ? Math.sin(ph) * 1.8 : Math.sin(ph * 0.5) * 0.4;', 'const flap = pose.flap ?? (walk ? Math.sin(ph) * 1.8 : Math.sin(ph * 0.5) * 0.4);');
  rep('const [fx, lift] = walk ? footAt(ph + L.ph, B.stride, B.lift) : [0, 0];', 'const [fx, lift] = pose.tuck ? [L.fore ? 1.2 : -2.2, pose.tuck] : walk ? footAt(ph + L.ph, B.stride, B.lift) : [0, 0];');
  rep('legs.push({ root: dy(B.hip), ph: 0, near: true, fore: false }, { root: dy(B.sh), ph: Math.PI / 2, near: true, fore: true },\n      { root: dy(B.hip), ph: Math.PI, near: false, fore: false }, { root: dy(B.sh), ph: Math.PI * 1.5, near: false, fore: true });',
    'legs.push({ root: dy(B.hip), ph: pose.lp?.[0] ?? 0, near: true, fore: false }, { root: dy(B.sh), ph: pose.lp?.[1] ?? Math.PI / 2, near: true, fore: true },\n      { root: dy(B.hip), ph: pose.lp?.[2] ?? Math.PI, near: false, fore: false }, { root: dy(B.sh), ph: pose.lp?.[3] ?? Math.PI * 1.5, near: false, fore: true });');
  s += '\nexport { makeFrame, BODY, RideFrame };\n';
  route.fulfill({ body: s, contentType: 'text/javascript' });
});
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const GA = Object.fromEntries(Object.entries(GAITS).map(([k, g]) => [k, { ...g, bob: g.bob.toString(), nod: g.nod.toString() }]));
const res = await p.evaluate(async ({ RIDERS, ONLY, GA }) => {
  const g = window.emberfall;
  const { resolveGear } = await import('/src/character/gearLook.js');
  const { getHeroSprites } = await import('/src/sprites/hero.js');
  const { makeFrame, BODY, RideFrame } = await import('/src/sprites/mounts.js');
  const out = {}, meta = {}, log = [];
  const S = 600, AX = 300, AY = 420, RES = 2;
  for (const [mountId, [raceId, classId, gear, gaitId]] of Object.entries(RIDERS)) {
    if (ONLY && !ONLY.includes(mountId)) continue;
    const G = GA[gaitId], bob = eval(G.bob), nod = eval(G.nod);
    const equipment = {};
    for (const id of gear) { const d = g.content.get('item', id); if (d) equipment[d.slot] = id; else log.push('fehlt ' + id); }
    const rider = getHeroSprites(raceId, classId, 0, resolveGear(equipment, g.content), null, RES).ride;
    const def = g.content.find('mount', mountId);
    const B0 = BODY[def.sprite];
    const B = { ...B0, stride: B0.stride * (G.stride ?? 1), lift: B0.lift * (G.lift ?? 1) };
    const cs = [], lifts = [];
    for (let i = 0; i < G.n; i++) {
      const ph = (i / G.n) * Math.PI * 2;
      const pose = G.fly
        ? { walk: false, ph, bob: 0, nod: nod(ph), flap: (G.flapOff ?? 0) + Math.sin(ph) * G.flap, tuck: G.tuck }
        : { walk: true, ph, bob: Math.round(bob(ph) * 2) / 2, nod: nod(ph), lp: G.lp };
      const m = makeFrame(B, def.look, pose, RES);
      const fr = new RideFrame(m, rider.frames[Math.floor((i / G.n) * 2) % rider.frames.length]);
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      // Flug: ganze Figur hebt und senkt sich mit dem Flügelschlag (Weltpixel, auf halbe Pixel gerundet)
      const dy = G.fly ? Math.round(bob(ph) * 2) / 2 : 0;
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
      cs.push(c); lifts.push(dy);
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
    meta[mountId] = { w: w / RES, h: h / RES, res: RES, frames: cs.length, fps: G.fps, gait: gaitId, foot: { x: (AX - x0) / RES, y: (AY - y0) / RES }, fly: G.fly ?? 0, name: def.name };
  }
  return { out, meta, log };
}, { RIDERS, ONLY, GA });
for (const [f, url] of Object.entries(res.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
if (res.log.length) console.log(res.log.join('\n'));
writeFileSync(`${OUT}/gang.json`, JSON.stringify(res.meta, null, 1));
console.log(JSON.stringify(res.meta));
await b.close();
