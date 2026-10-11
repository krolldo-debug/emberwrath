// Schreibt src/account/createArt.js: die Ebenen des Website-Titelbilds „Aufbruch zum Aschethron“ (site/img/titel-*.webp,
// erzeugt von site/tools/titel-held.mjs) als data-URLs für die Bühne der Charaktererstellung (src/account/CreateStage.js).
// Aufruf nach einer Änderung am Titelbild: node tools/erschaffung-bilder.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['fern', 'fern-glut', 'strom', 'strom-glut', 'mitte', 'mitte-glut', 'nah', 'nah-glut'];
const lines = NAMES.map((n) => {
  const b64 = readFileSync(resolve(root, `site/img/titel-${n}.webp`)).toString('base64');
  return `  '${n}': 'data:image/webp;base64,${b64}',`;
});
const out = `// Von tools/erschaffung-bilder.mjs geschrieben, nicht von Hand ändern.
// Ebenen des Titelbilds „Aufbruch zum Aschethron“ (site/img/titel-*.webp), Szene 640 × 272 Szenenpixel.
export const CREATE_ART = {
${lines.join('\n')}
};
`;
writeFileSync(resolve(root, 'src/account/createArt.js'), out);
console.log(`src/account/createArt.js: ${(out.length / 1024).toFixed(1)} KB`);
