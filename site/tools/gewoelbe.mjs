// Hintergrund „Gewölbe“ für Support und Newsletter: das Titelbild des Spiels (Bögen, Fackeln, Glut) ohne Spieloberfläche.
// Aufruf: node gewoelbe.mjs OUT.png [Breite Höhe] (1920 × 1080 → 960 × 540, 2560 × 1080 → 1280 × 540);
// danach verlustfrei als img/gewoelbe.webp bzw. img/gewoelbe-breit.webp speichern. Server :8103 = Ordner emberfall/.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [out, w = 1920, h = 1080] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:8103/index.html');
await p.waitForFunction(() => window.emberfall?.scenes.currentId === 'title');
await p.evaluate(() => { window.emberfall.prefs.set('quality', 'high'); window.dispatchEvent(new Event('resize')); });
await p.addStyleTag({ content: '#ui{display:none!important}' });
await p.waitForTimeout(2500);
const url = await p.evaluate(() => window.emberfall.view.toDataURL('image/png'));
const fs = await import('node:fs'); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(await p.evaluate(() => [window.emberfall.view.width, window.emberfall.view.height]));
await b.close();
