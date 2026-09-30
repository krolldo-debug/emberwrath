import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [q, outDir, ...files] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
for (const f of files) {
  const src = 'data:image/png;base64,' + readFileSync(f).toString('base64');
  const url = await p.evaluate(async ({ src, q }) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/webp', +q); }, { src, q });
  const out = `${outDir}/${f.split('/').pop().replace('.png', '.webp')}`;
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
