// Bossbühnen der Startseite: die vier Bosse kämpfen auf einer kleinen Bühne aus den echten Grafiken ihres Gebiets.
// Teil 1 (diese Datei): lädt die Spielgrafiken direkt aus src/ (kein Spielstart) und legt sie als PNG + JSON ab:
//   Bossfigur je Animation und Bild (Figur und Leuchtebene getrennt, transparenter Grund, 1 Bildpunkt = 1 Weltpixel,
//   Fußpunkt ax/ay, Ankerpunkte meta wie Klingenspitze), Kachelsatz des Gebiets (Bodenkacheln 32×32, Wandfront oben/unten
//   16×16, Mauerkrone, Kantenfarben) und alle Gebiets-Requisiten (Sprite, Fußpunkt, Leuchtebene).
// Teil 2 (bosse-buehne.py, wird am Ende aufgerufen): baut daraus je Boss die Bühne im Format 4:3 und zeichnet alle
//   Angriffseffekte selbst als Pixel-Art am ganzzahligen Raster (begrenzte Palette, Warnflächen als gefüllte Bodenmarken mit
//   stufigem Pulsieren). Ausgabe je Boss in ZIELORDNER:
//     boss-<name>-boden.webp  hintere Ebenen: Wand (oberes Drittel), Bodenkacheln in Reihen (nach hinten dunkler),
//                             Schattenoval unter dem Boss; deckend, verlustfrei
//     boss-<name>-kampf.webp  waagerechter Streifen aus n Bildern à w×h, transparent: Boss, Warnflächen, Angriffe,
//                             Splitter, Lichtschein; nahtlose Schleife bei 12 fps (Ruhe → Warnung → Angriff → Ausklingen)
//     boss-<name>-vorn.webp   transparente Vorderebene mit Requisiten des Gebiets, über dem Streifen zu zeichnen
//     boss-<name>-bild.webp   Standbild = boden + Bild 0 + vorn (ohne JavaScript)
//   Maße in site/tools/bosse-buehne.json (je Boss w, h, frames, fps, foot).
// Aufruf (Server im Repo-Wurzelordner, z. B. python3 -m http.server 8121):
//   node site/tools/bosse-buehne.mjs [ZIELORDNER=site/img] [bosse=ulgrim,rotmother,skalvyr,malgareth] [BASIS-URL=http://127.0.0.1:8121]
//   Zwischendateien und Kontrollbilder nach $ZW (Standard /tmp/bosse-buehne): <name>/assets.json, kontakt-<name>.png
//   (jedes 3. Bild ×2), vorschau-<name>.webp (animierte ×3-Vorschau aller Ebenen), vorschau-<name>-NNN.png (Einzelbilder ×3
//   an den Angriffsstellen). NUR_BAU=1 überspringt Teil 1 und baut aus vorhandenen assets.json neu.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [OUT = resolve(HERE, '../img'), ONLY, BASE = 'http://127.0.0.1:8121'] = process.argv.slice(2);
const ZW = process.env.ZW ?? '/tmp/bosse-buehne';
mkdirSync(OUT, { recursive: true }); mkdirSync(ZW, { recursive: true });

// Quelle je Boss: Spritefabrik, Kachelsatz, Animationen (Ruhe, Ausholen, Schlag), Leuchtebene (glow / glowEnraged)
const BOSSE = {
  ulgrim: {
    mod: '/src/sprites/barrow_king.js', fn: 'createUlgrimSprites', glow: 'glowEnraged',
    biome: ['/src/sprites/biomes_barrow_spore.js', 'barrow'],
    anims: ['idle', 'sweepWindup', 'sweep', 'backsweep', 'chopWindup', 'chop'],
  },
  rotmother: {
    mod: '/src/sprites/rot_mother.js', fn: 'createRotMotherSprites', glow: 'glowEnraged',
    biome: ['/src/sprites/biomes_barrow_spore.js', 'spore'],
    anims: ['idle', 'plungeWindup', 'plunge'],
  },
  skalvyr: {
    mod: '/src/sprites/frost_wyrm.js', fn: 'createSkalvyrSprites', glow: 'glow',
    biome: ['/src/sprites/biomes_rime_throne.js', 'rime'],
    anims: ['idle', 'callWindup', 'roar'],
  },
  malgareth: {
    mod: '/src/sprites/ash_sovereign.js', fn: 'createMalgarethSprites', glow: 'glow',
    biome: ['/src/sprites/biomes_rime_throne.js', 'throne'],
    anims: ['idle_2', 'waveWindup_2', 'wave_2'],
  },
};
const names = Object.keys(BOSSE).filter((k) => !ONLY || ONLY.split(',').includes(k));

if (!process.env.NUR_BAU) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
  await p.goto(`${BASE}/__leer`);
  for (const name of names) {
    const res = await p.evaluate(async (sc) => {
      const png = (cv) => (cv ? cv.toDataURL('image/png') : null);
      const M = await import(sc.mod), S = M[sc.fn]();
      const anims = {};
      for (const a of sc.anims) {
        const A = S[a];
        anims[a] = { fps: A.fps, loop: A.loop, frames: A.frames.map((f) => ({
          img: png(f.canvas), ax: f.ax, ay: f.ay, meta: f.meta ?? {},
          glow: png(f[sc.glow]?.canvas ?? f.glow?.canvas), gax: (f[sc.glow] ?? f.glow)?.ax, gay: (f[sc.glow] ?? f.glow)?.ay,
        })) };
      }
      // Effekt-Sprites des Bosses (Skalvyr: Eiszapfen, kleiner Frostriss)
      const fx = {};
      if (S.fx?.icicle) fx.icicle = { img: png(S.fx.icicle.canvas), ax: S.fx.icicle.ax, ay: S.fx.icicle.ay, glow: png(S.fx.icicle.glow?.canvas) };
      if (S.fx?.crackSmall) fx.crackSmall = { img: png(S.fx.crackSmall), ax: S.fx.crackSmall.width >> 1, ay: S.fx.crackSmall.height >> 1, glow: null };
      const BM = await import(sc.biome[0]), T = BM.createBiomeTiles3(sc.biome[1]);
      const spr = (o) => { const s = o.sprite ?? o; return { img: png(s.canvas), ax: s.ax, ay: s.ay, glow: png(o.glow) }; };
      const props = {};
      for (const [k, v] of Object.entries(T.props)) props[k] = (Array.isArray(v) ? v : [v]).map(spr);
      const { createPropSprites } = await import('/src/sprites/props.js');
      props.dungeonBones = createPropSprites().bonePiles.map((s) => ({ img: png(s.canvas), ax: s.ax, ay: s.ay, glow: null }));
      return {
        anims, fx,
        tiles: { floor: T.floor.map(png), upper: T.faces.upper.map(png), lower: T.faces.lower.map(png), top: png(T.top), edge: T.topEdge, edgeLight: T.topEdgeLight },
        props,
      };
    }, BOSSE[name]);
    mkdirSync(`${ZW}/${name}`, { recursive: true });
    writeFileSync(`${ZW}/${name}/assets.json`, JSON.stringify(res));
    console.log(name, 'Grafiken:', Object.entries(res.anims).map(([k, v]) => `${k}(${v.frames.length})`).join(' '), '| Requisiten:', Object.keys(res.props).join(' '));
  }
  await b.close();
}

// Teil 2: Bühne bauen (Python, Pillow + numpy)
for (const name of names) {
  if (!existsSync(`${ZW}/${name}/assets.json`)) throw new Error('assets.json fehlt: ' + name);
  const out = execFileSync('python3', [resolve(HERE, 'bosse-buehne.py'), name, `${ZW}/${name}/assets.json`, OUT, ZW, resolve(HERE, 'bosse-buehne.json')], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  process.stdout.write(out);
}
