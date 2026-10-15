// Symbole der Services im Shop (site/shop.html) direkt aus den Spielsymbolen (src/gfx/Icons.js), Feinfassung res 2 = 52 × 52
// (docs/STYLE.md „Feinraster“ §6; SVC_RES=1 für die alte 26er). Anzeige ganzzahlig: 52 bzw. 104 CSS-px (shop.css .svc img).
//   npx http-server . -p 8102 -s &     dann   node site/tools/shop-icons.mjs site/img
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'icons'; mkdirSync(OUT, { recursive: true });
// Heldenplatz: heller Beinschlüssel (key_bone) statt Eisenschlüssel – der graue Schlüssel ging auf dem dunklen Kartengrund unter.
const ICONS = { 'svc-rename': 'scroll', 'svc-race': 'ui_character', 'svc-slot': 'key_bone' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
await p.goto(`${process.env.EW_URL ?? 'http://localhost:8102'}/index.html`);
await p.waitForFunction(() => window.emberfall?.scenes?.currentId, null, { timeout: 30000 });
const urls = await p.evaluate(async ([ICONS, RES]) => {
  const { iconCanvas } = await import('/src/gfx/Icons.js');
  return Object.fromEntries(Object.entries(ICONS).map(([f, id]) => [f, iconCanvas(id, RES).toDataURL('image/png')]));
}, [ICONS, +(process.env.SVC_RES ?? 2)]);
for (const [f, url] of Object.entries(urls)) writeFileSync(`${OUT}/${f}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(urls).join(', '));
await b.close();
