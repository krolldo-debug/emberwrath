// Spielklänge zu einem Schnitt offline rendern, mit den echten Klangmodulen des Spiels (wie in der Reels-Kampagne).
//   PORT=8863 node tools/werbung/klang.mjs ereignisse.json ZIEL.wav
// ereignisse.json: { dauer, events: [{ t, name, opts }] }  (Zeiten im fertigen Video; Namen wie in sfx.json der Aufnahmen)
import { readFileSync } from 'node:fs';
import { startServer, launch } from '/mnt/project-files/videos/rohmaterial/werkzeug/roh-lib.mjs';
import { openAudioPage, renderStem, writeWav } from '/mnt/project-files/marketing/tools/tiktok-audio.mjs';
const [file, out] = process.argv.slice(2);
const E = JSON.parse(readFileSync(file, 'utf8'));
const srv = await startServer();
const browser = await launch();
const page = await openAudioPage(browser, Number(process.env.PORT ?? 8811));
writeWav(out, await renderStem(page, { kind: 'sfx', events: E.events, dur: E.dauer + 0.5, seed: 3 }));
await browser.close();
srv?.kill();
console.log('Spielklänge', E.events.length, 'Ereignisse →', out);
