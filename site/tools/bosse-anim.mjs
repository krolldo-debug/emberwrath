// Lebende Bosse für die Startseite: je Boss zwei waagrechte Streifen aus den echten Spiel-Sprites.
//   boss-<name>-ruhe.png  ein voller, nahtloser Durchlauf der Ruheschleife ('idle')
//   boss-<name>-wut.png   der eindrucksvollste Angriff (Brüllen, Flammenschwung ...), einmal abgespielt
// Beide Streifen teilen Rahmengröße UND Fußpunkt (gemeinsamer Rahmen über alle Frames beider Animationen),
// damit die Seite zwischen ihnen umschalten kann, ohne dass die Figur springt. Auflösung wie die
// Standbilder boss-*.png (Spielauflösung res 1, nur die Frame-Leinwand ohne Leucht-Ebene, wie in render40.mjs).
// Maße, Frames und fps landen zusätzlich in bosse-anim.json.
//   npx http-server . -p 8102 -s &     (Module direkt aus dem Projektordner)
//   node site/tools/bosse-anim.mjs site/img
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'bosse'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.EW_URL ?? 'http://localhost:8102';
// ruhe: Schleife; wut: eine oder mehrere Animationen hintereinander (Ausholen + Schlag)
const BOSSE = {
  ulgrim: { mod: ['/src/sprites/barrow_king.js', 'createUlgrimSprites'], ruhe: 'idle', wut: ['roar'] },
  rotmother: { mod: ['/src/sprites/rot_mother.js', 'createRotMotherSprites'], ruhe: 'idle', wut: ['roar'] },
  skalvyr: { mod: ['/src/sprites/frost_wyrm.js', 'createSkalvyrSprites'], ruhe: 'idle', wut: ['roar'] },
  // Das Standbild zeigt die geflügelte zweite Gestalt, also auch hier Gestalt 2: Flammenklinge ausholen, Feuersichel
  malgareth: { mod: ['/src/sprites/ash_sovereign.js', 'createMalgarethSprites'], ruhe: 'idle_2', wut: ['waveWindup_2', 'wave_2'] },
};
const ONLY = process.argv[3]?.split(',');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${BASE}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const res = await p.evaluate(async ({ BOSSE, ONLY }) => {
  const out = {}, meta = {}, log = [];
  const S = 600, AX = 300, AY = 420;
  const anim = (set, k) => (typeof set[k] === 'function' ? set[k]() : set[k]);
  // Frame am Fußpunkt (AX, AY) auf eine große Fläche legen: Leinwand-Anker ax/ay sind in Texeln
  const lege = (fr) => {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(fr.canvas, AX - fr.ax, AY - fr.ay);
    return c;
  };
  for (const [name, { mod: [path, fn], ruhe, wut }] of Object.entries(BOSSE)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const set = (await import(path))[fn]();
    const aRuhe = anim(set, ruhe);
    const aWut = wut.map((k) => anim(set, k));
    if (!aRuhe || aWut.some((a) => !a)) { log.push('fehlt bei ' + name); continue; }
    const csRuhe = aRuhe.frames.map(lege);
    // Bei mehreren Wut-Teilen behält jeder Frame die Dauer seiner eigenen Animation (ms je Frame)
    const csWut = [], ms = [];
    for (const a of aWut) for (const fr of a.frames) { csWut.push(lege(fr)); ms.push(Math.round(1000 / a.fps)); }
    // Gemeinsamer Rahmen über beide Animationen
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const c of [...csRuhe, ...csWut]) {
      const d = c.getContext('2d').getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x0 <= 0 || y0 <= 0 || x1 >= S - 1 || y1 >= S - 1) log.push(name + ': Figur stößt an den Rand der Fläche');
    const pad = 1, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
    const streifen = (cs) => {
      const sheet = document.createElement('canvas'); sheet.width = w * cs.length; sheet.height = h;
      const sx = sheet.getContext('2d'); sx.imageSmoothingEnabled = false;
      cs.forEach((c, i) => sx.drawImage(c, x0 - pad, y0 - pad, w, h, i * w, 0, w, h));
      return sheet.toDataURL('image/png');
    };
    out[`boss-${name}-ruhe.png`] = streifen(csRuhe);
    out[`boss-${name}-wut.png`] = streifen(csWut);
    const fpsWut = aWut[aWut.length - 1].fps;
    meta[name] = {
      w, h, res: aRuhe.frames[0].res ?? 1,
      idle: { frames: csRuhe.length, fps: aRuhe.fps, name: ruhe },
      wut: { frames: csWut.length, fps: fpsWut, name: wut.join('+'), ...(aWut.length > 1 ? { ms } : {}) },
      foot: { x: AX - x0 + pad, y: AY - y0 + pad },
    };
  }
  return { out, meta, log };
}, { BOSSE, ONLY });
for (const [f, url] of Object.entries(res.out)) writeFileSync(`${OUT}/${f}`, Buffer.from(url.split(',')[1], 'base64'));
writeFileSync(`${OUT}/bosse-anim.json`, JSON.stringify(res.meta, null, 2) + '\n');
console.log(res.log.join('\n')); console.log(JSON.stringify(res.meta));
await b.close();
