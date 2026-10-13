// Titelbild der Startseite „Aufbruch zum Aschethron“ (site/titel.js zeichnet es live auf ein Canvas, Abschnitt .hero):
// Ein Krieger in der Rüstung des Aschenfürsten mit Königsfall steht vorn auf erstarrter Lavakruste und blickt über die
// Glutöde zum Aschethron.
// Feinraster wie im Spiel (docs/STYLE.md „Feinraster“): Komposition in Szenenpixeln (640 × 272), gezeichnet wird alles
// mit Q = 2 Feinpixeln je Szenenpixel (1280 × 544). Jede Ebene und der Held 1:1 im Feinraster (titel.js vergrößert
// ganzzahlig je Feinpixel). Keine Ebene wird skaliert oder perspektivisch verzerrt, nichts wird hochskaliert.
//   Ferne: Himmel in Farbbändern (Übergänge im Schachbrettraster), Dunst, Bergkette, Aschethron als Schattenriss
//   (hier gezeichnet: Mauern mit feinen Zinnen, Türme, Thronlehne mit Hörnern, Obsidiannadeln, Randlicht 1 Feinpixel;
//   Feuerschalen mit heißem Kern und Fensterschlitze in der Glut-Ebene).
//   Lavastrom: Lava-Generator des Aschethrons (makeLava mit den Werten von throneLiquid) im Feinraster abgetastet,
//   4 Bilder, als Band, das in Feinpixelstufen vom Aschethron nach vorn links läuft. Ebene und Vordergrund: derselbe
//   Generator ohne offene Schmelze – Krustenschollen mit Lichtfase, Fugen mit hellem Kern im roten Saum.
//   Silhouetten: Deko der Glutöde aus dem Spiel im Feinraster (createWastesDecor bei renderScale 2), 1:1.
//   Held: eigene Pixel-Art (tools/titel-held.py), handfein im Feinraster, Farben und Ausrüstung nach Harnisch, Krone,
//   Stulpen und Sabatons des Aschenfürsten und dem Zweihänder Königsfall aus dem Spiel (character/gearLook.js).
// Ergebnis in site/img (alles verlustfrei), Maße und Bildfolgen im Block META von site/titel.js (in Feinpixeln).
// Aufruf (Server im Repo-Ordner, z. B. python3 -m http.server 8123): node site/tools/titel-held.mjs [URL]
// Zwischenbilder und Vorschau nach $ZWISCHEN/titel-held (Standard /tmp).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const [BASE = 'http://localhost:8123'] = process.argv.slice(2);
const IMG = join(HERE, '../img'), JS = join(HERE, '../titel.js');
const TMP = join(process.env.ZWISCHEN ?? '/tmp', 'titel-held');
mkdirSync(TMP, { recursive: true });
// Szene in Szenenpixeln: Breite, Höhe, Fußlinie des Helden, Standpunkt, Horizont, Aschethron (x); LH Bilder des
// Lavastroms; Q Feinpixel je Szenenpixel
const SZ = { W: 640, H: 272, FY: 212, HX: 330, HOR: 146, FX: 384, LH: 4, Q: 2 };
const save = (f, url) => writeFileSync(join(TMP, f), Buffer.from(url.split(',')[1], 'base64'));

// ---------------------------------------------------------------------------------------------- 1. Szene (Browser)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.route(`${BASE}/__leer`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }));
await p.goto(`${BASE}/__leer`);
const res = await p.evaluate(async (SZ) => {
  const { W, H, FY, HX, HOR, FX, LH, Q } = SZ;
  const WF = W * Q, HF = H * Q;
  const { CONFIG } = await import('/src/config.js');
  CONFIG.renderScale = Q;                                  // Spiel-Deko im Feinraster bauen (fineRes() = 2)
  const D = await import('/src/sprites/decor_wastes.js');
  const { hash2 } = await import('/src/core/math.js');
  const { PAL } = await import('/src/gfx/Palette.js');
  const { vnoise } = await import('/src/sprites/outdoor.js');
  const { makeLava } = await import('/src/sprites/biomes.js');
  const deko = D.createWastesDecor();
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
  const chk = (x, y) => (x + y) & 1;                       // Schachbrett für Übergänge (in Feinpixeln)
  const sx = (X) => (X + 0.5) / Q;                         // Feinpixelmitte -> Szenenkoordinate
  const buf = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; const v = typeof c === 'string' ? rgb(c) : c; d.set([v[0], v[1], v[2], v[3] ?? 255], (y * w + x) * 4); };
    const get = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0]; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    return { w, h, d, set, get };
  };
  const cache = new Map();
  const pixels = (cv) => { let a = cache.get(cv); if (!a) { a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; cache.set(cv, a); } return a; };
  const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
  const EMB = PAL.ember.map(rgb);
  const EMBH = PAL.ember.map((h) => parseInt(h.slice(1), 16));
  const wave = (x, parts) => parts.reduce((s, [a, k, ph]) => s + a * Math.sin((2 * Math.PI * k * x) / W + ph), 0);
  // Sprite 1:1 im Feinraster stempeln (Fußpunkt in Feinpixeln), Farben umgefärbt
  const stamp = (B, e, fx, fy, { map, flip = false, G = null }) => {
    const s = e.sprite ?? e, cv = s.canvas, a = pixels(cv), w = cv.width;
    if ((s.res ?? 1) !== Q) throw new Error('Deko nicht im Feinraster');
    const ox = fx - (flip ? w - 1 - s.ax : s.ax), oy = fy - s.ay;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + (flip ? w - 1 - x : x)) * 4;
      if (a[i + 3] < 128) continue;
      B.set(ox + x, oy + y, map([a[i], a[i + 1], a[i + 2], 255], ox + x, oy + y));
    }
    if (G && e.glow) {                                     // feine Leuchtebene: gleicher Rand wie das Sprite
      const g = pixels(e.glow), gw = e.glow.width;
      for (let y = 0; y < e.glow.height; y++) for (let x = 0; x < gw; x++) {
        const i = (y * gw + (flip ? gw - 1 - x : x)) * 4;
        if (g[i + 3] >= 100 && B.get(ox + x, oy + y)[3]) G.set(ox + x, oy + y, EMB[3]);
      }
    }
  };
  // Lava-Generator des Spiels im Feinraster: Feld in Feinpixeln abgetastet, Schollen doppelt so groß angelegt
  // (gleiche Größe in Szenenpixeln), Spalten schmaler als ×2 – Fugen werden fein. Liefert Farbe, Glut und Stufe
  // (0 = Kruste, 1..4 = Glut emb[2]..emb[5]) je Feinpixel.
  // Kruste (still): ohne aufsteigende Blasen (wären einzelne Glutpunkte), Flächen flach statt Körnung – das
  // Zufallskorn crust[2] und der Zufallsglanz wall[4] fallen auf die Grundtöne, Licht oben links bleibt.
  const lavaAt = (opts, f = 0, still = true) => {
    const L = makeLava({ ...opts, cell: opts.cell * Q }), T = new Map(), sd = opts.seed;
    const flat = new Map(still ? [[opts.crust[2], opts.crust[1]], [opts.wall[4], opts.crust[3]]].map(([a, z]) => [parseInt(a.slice(1), 16), rgb(z)]) : []);
    const bubble = (cx, cy) => {
      if (!still || hash2(cx, cy, sd + 30) >= 0.35) return null;
      const bx = 3 + Math.floor(hash2(cx, cy, sd + 31) * 10), by = 3 + Math.floor(hash2(cx, cy, sd + 32) * 10);
      return new Set([[bx, by], [bx - 1, by], [bx + 1, by], [bx, by - 1]].map(([u, v]) => v * 16 + u));
    };
    return (X, Y) => {
      const cx = Math.floor(X / 16), cy = Math.floor(Y / 16), k = cx + ',' + cy;
      let t = T.get(k);
      if (!t) { t = [pixels(L.tile(cx, cy, f, 0)), pixels(L.glowTile(cx, cy, f, 0)), bubble(cx, cy)]; T.set(k, t); }
      let u = X - cx * 16, v = Y - cy * 16;
      if (t[2]?.has(v * 16 + u)) v += 2;
      const i = (v * 16 + u) * 4;
      let c = [t[0][i], t[0][i + 1], t[0][i + 2], 255];
      const n = (c[0] << 16) | (c[1] << 8) | c[2];
      if (flat.has(n)) c = flat.get(n);
      const lv = Math.max(0, EMBH.indexOf(n) - 1);
      return [c, t[1][i + 3] > 100 ? [t[1][i], t[1][i + 1], t[1][i + 2], 255] : null, lv];
    };
  };
  const BLACK5 = ['#000000', '#000000', '#000000', '#000000', '#000000'];

  // ================= Ferne: Himmel, Ascheschleier, Bergkette, Aschethron, vordere Kette
  const F = buf(WF, HF), FG = buf(WF, HF);
  const SKY = ['#060309', '#09040c', '#0d0610', '#130814', '#1b0a15', '#250d16', '#331117', '#441616', '#581c15', '#702514', '#8c3214'];
  const skyTop = 40, skyBot = HOR - 14;
  for (let Y = 0; Y < HF; Y++) {
    const t = Math.max(0, Math.min(1, (sx(Y) - skyTop) / (skyBot - skyTop)));
    const v = Math.pow(t, 2) * (SKY.length - 1), i0 = Math.floor(v), fr = v - i0;
    for (let X = 0; X < WF; X++) {
      const up = fr > 0.7 || (fr > 0.4 && chk(X, Y));
      F.set(X, Y, SKY[Math.min(SKY.length - 1, i0 + (up ? 1 : 0))]);
    }
  }
  // Ascheschleier: flache Bänder, eine Stufe heller, Oberkante im Schachbrett
  for (const [cy, seed, col] of [[HOR - 29, 9, '#4e1c16']]) {
    for (let X = 0; X < WF; X++) {
      const x = sx(X), th = 1.2 + 2.6 * vnoise(x / 34, seed, seed) - 0.8 * vnoise(x / 11, seed + 3, seed);
      if (th < 1.5) continue;
      const Y0 = Math.round(Q * (cy - th)), Y1 = Math.round(Q * (cy + th * 0.5));
      for (let Y = Y0; Y <= Y1; Y++) if (Y !== Y0 || chk(X, Y)) F.set(X, Y, col);
    }
  }
  // ferne Bergkette im Dunst: Kammlinie 1 Feinpixel heller, darunter eine gerasterte Zwischenstufe
  const hbc = (x) => HOR - 19 + wave(x, [[5, 2, 0.6], [3, 5, 2.1], [1.5, 11, 0.4], [0.7, 23, 1.3]]);
  for (let X = 0; X < WF; X++) {
    const Y0 = Math.round(Q * hbc(sx(X)));
    for (let Y = Y0; Y < HF; Y++) F.set(X, Y, Y === Y0 ? '#4d1d1b' : Y <= Y0 + 2 && chk(X, Y) ? '#43191a' : '#3b1518');
  }
  // Aschethron: Schattenriss, Maße in Szenenpixeln (h nach oben ab dem Fuß yb), gerastert in Feinpixeln
  const yb = HOR - 3;
  const SIL = ['#0d0609', '#140a0d', '#1c0e10', '#2a1412', '#3a1a14'];   // Körper, Kante, Randlicht, Glutsaum unten
  const fort = buf(WF, HF);
  const FXF = FX * Q + Q / 2;                                             // Mitte des Aschethrons in Feinpixeln
  const fillF = (X, Y) => fort.set(X, Y, SIL[0]);
  const rowY = (h) => Q * (yb - h);                                       // obere Feinzeile der Szenenhöhe h
  const rect = (x0, y0, x1, y1) => { for (let Y = rowY(y1); Y < rowY(y0) + Q; Y++) for (let X = Q * (FX + x0); X < Q * (FX + x1) + Q; X++) fillF(X, Y); };
  // Zinnen fein: 3 Feinpixel breit, 2 Lücke, 3 hoch
  const crenel = (x0, x1, top) => { for (let X = Q * (FX + x0); X < Q * (FX + x1) + Q; X++) if ((X - Q * (FX + x0)) % 5 < 3) for (let k = 1; k <= 3; k++) fillF(X, rowY(top) - k); };
  // Spitze: Breite läuft je Feinzeile stetig zu, Spitze 1 Feinpixel
  const spike = (cx, w, h0, h1, lean = 0) => {
    for (let Y = rowY(h1); Y < rowY(h0) + Q; Y++) {
      const h = yb + 0.5 - (Y + 0.5) / Q, k = Math.max(0, Math.min(1, (h1 - h) / (h1 - h0)));
      const c = FXF + Q * (cx + lean * (1 - k)), hw = Q * w * k + 0.5;
      for (let X = Math.floor(c - hw - 1); X <= Math.ceil(c + hw + 1); X++) if (Math.abs(X + 0.5 - c) <= hw) fillF(X, Y);
    }
  };
  rect(-36, 0, 36, 10); crenel(-36, 36, 10);              // Ringmauer
  rect(-32, 0, -24, 23); crenel(-32, -24, 23);            // Seitentürme
  rect(24, 0, 32, 20); crenel(24, 32, 20);
  rect(-15, 0, 15, 28); crenel(-15, 15, 28);              // Halle
  rect(-7, 0, 7, 38);                                      // Thronturm, oben die Lehne mit zwei Hörnern
  spike(0, 4, 38, 48); spike(-7, 2, 38, 44, 0.6); spike(7, 2, 38, 44, -0.6);
  spike(-44, 3, 0, 28); spike(-49, 1, 0, 16); spike(45, 3, 0, 23); spike(50, 1, 0, 13);   // Obsidiannadeln
  // Strebepfeiler der Halle (feine senkrechte Kanten) und Torbogen
  for (const x of [-12, -4, 4, 12]) rect(x, 0, x, 3);
  for (let Y = 0; Y < HF; Y++) for (let X = 0; X < WF; X++) {
    if (!fort.get(X, Y)[3]) continue;
    const hh = yb + 0.5 - (Y + 0.5) / Q;
    const edgeR = !fort.get(X + 1, Y)[3], edgeT = !fort.get(X, Y - 1)[3];
    const warm = hh < 3.5 || (hh < 6.5 && chk(X, Y));
    F.set(X, Y, warm ? (hh < 1.5 ? SIL[4] : SIL[3]) : edgeR ? SIL[2] : edgeT ? SIL[1] : SIL[0]);
  }
  // Fensterschlitze (1 Feinpixel breit, unten heiß) und Feuerschalen mit heißem Kern (Glut-Ebene, flackert in titel.js)
  for (const [x, y] of [[-28, 16], [28, 14], [-9, 20], [9, 20], [0, 31], [-3, 25], [3, 25], [-20, 6], [20, 6], [-30, 9], [-26, 9], [26, 8], [30, 8]]) {
    const X = FXF + Q * x, Y = rowY(y);
    FG.set(X, Y, EMB[2]); FG.set(X, Y + 1, EMB[3]); FG.set(X, Y + 2, EMB[4]);
  }
  for (const [cx, top] of [[-28, 25], [28, 22], [0, 49]]) {
    const X = FXF + Q * cx, Y = rowY(top) + 1;
    for (let k = -2; k <= 2; k++) F.set(X + k, Y, '#2a1412');                       // Schale
    for (let k = -1; k <= 1; k++) F.set(X + k, Y + 1, '#1c0e10');
    // Flamme: Saum orange, Kern hell, Spitze rot
    for (const [dx, dy, lv] of [[-1, -1, 3], [0, -1, 5], [1, -1, 3], [-1, -2, 2], [0, -2, 4], [1, -2, 3], [0, -3, 4], [0, -4, 3], [1, -5, 2], [-1, -3, 2]]) FG.set(X + dx, Y + dy, EMB[lv]);
  }
  // vordere Kette: dunkler, unten vom Lavalicht angestrahlt (Stufen im Schachbrett)
  const FRONT = ['#1a0b10', '#220e12', '#2c1114', '#3c1614'];
  const crag = (x) => 6 * Math.exp(-(((x - FX) / 36) ** 2));
  const hfc = (x) => HOR - 6 + wave(x, [[3, 3, 2.2], [2, 7, 0.7], [1, 17, 1.1], [0.5, 37, 0.2]]) - crag(x);
  const hfF = (X) => Math.round(Q * hfc(sx(X)));
  for (let X = 0; X < WF; X++) {
    const Y0 = hfF(X);
    for (let Y = Y0; Y < HF; Y++) {
      const fromBase = HOR - sx(Y);
      let i = Y === Y0 ? 2 : 0;
      if (fromBase < 3 || (fromBase < 5 && chk(X, Y))) i = 3; else if (fromBase < 7 || (fromBase < 9 && chk(X, Y))) i = Math.max(i, 1);
      F.set(X, Y, FRONT[i]);
    }
  }

  // ================= Lavastrom: Band in Feinpixelstufen vom Fuß des Aschethrons nach vorn links, Lava des Aschethrons
  const THRONE = { seed: 977, crust: ['#110506', '#1c0908', '#2a0f0b', '#3c150d', '#521d0f'], emb: PAL.ember, wall: ['#060509', '#0c0a11', '#131019', '#1b1724', '#252032', '#332c44', '#4a4062'], grout: '#040306', cell: 19, open: 0.3, crack: 1.9 };
  const river = new Map();   // X -> [Y0, Y1] in Feinpixeln
  // Quelle am Fuß des Aschethrons: 1 Feinpixel dünn, davor nur noch einzelne Glutpunkte (keine harte Kante)
  for (let X = Q * (FX - 7); X < Q * (FX + 2); X++) river.set(X, [Q * (HOR - 2) + 1, Q * (HOR - 2) + 1]);
  const embers = [];
  for (let x = FX + 3, k = 0; x <= FX + 21; x += 2 + (k % 2), k++) embers.push([Q * x + (k % 2), Q * (HOR - 2) + 1 - (k % 3 === 2 ? 1 : 0), k < 3 ? 3 : k < 5 ? 2 : 1]);
  {
    // je Szenenstufe (run Szenenpixel, eine Zeile tiefer) zwei Feinstufen: run Feinpixel, eine Feinzeile tiefer
    let X = Q * (FX - 8) + 1, Y = Q * (HOR - 1), n = 0;
    const steps = [[7, 2], [7, 2], [6, 3], [6, 3], [6, 4], [5, 4], [5, 5], [5, 5], [4, 6], [4, 6], [5, 7], [4, 7], [4, 8], [3, 8], [4, 9], [3, 9], [4, 10], [3, 10], [3, 11]];
    while (X > -20) {
      const i = Math.min(steps.length - 1, Math.floor(n / 8)), [run, th] = steps[i];
      const th2 = steps[Math.min(steps.length - 1, i + 1)][1];
      const thF = Math.round(Q * (th + (th2 - th) * ((n % 8) / 8)));             // Dicke wächst feinstufig
      for (let k = 0; k < run; k++) { river.set(X, [Y, Y + thF - 1]); X--; }
      Y++; n++;
    }
  }
  const LT = HOR - 3, LB = FY + 8;                   // Band der Strombilder in Szenenzeilen
  const LTF = LT * Q, LBF = LB * Q;
  // links vom Helden kühlt der Strom zu dunkler Kruste ab (dort steht die Überschrift); Übergang gerastert
  const cool = (x) => Math.max(0, Math.min(1, (x - 288) / 26));
  const COOL = ['#24100d', '#3a120c', '#5a1a0c'];
  const LAV = [], LAVG = [];
  for (let f = 0; f < LH; f++) {
    const L = buf(WF, LBF - LTF), LG = buf(WF, LBF - LTF), at = lavaAt(THRONE, f % 4, false);
    for (const [X, [Y0, Y1]] of river) {
      if (X < 0 || X >= WF) continue;
      if (Y1 > Y0) { L.set(X, Y0 - 2 - LTF, '#2a100e'); L.set(X, Y0 - 1 - LTF, '#3a1410'); L.set(X, Y1 + 1 - LTF, '#3a1410'); L.set(X, Y1 + 2 - LTF, '#2a100e'); }   // Krustensaum
      const cl = cool(sx(X));
      for (let Y = Y0; Y <= Y1; Y++) {
        let [c, g] = at(X + 1024, Y + 600), l = lum(c);
        if (X >= Q * (FX - 16) && l < 0.5) { c = EMB[(X > Q * (FX - 4) ? 1 : 2) + chk(X, Y)]; g = EMB[2]; l = 0.6; }   // Quelle: läuft glühend aus
        if (l >= (1 - cl) * 1.01) { L.set(X, Y - LTF, c); if (g) LG.set(X, Y - LTF, g); continue; }   // das Heißeste glüht am längsten
        L.set(X, Y - LTF, COOL[l > 0.55 ? 2 : l > 0.35 ? 1 : 0]);
        if (l > 0.7 && chk(X, Y)) LG.set(X, Y - LTF, EMB[1]);
      }
    }
    for (const [X, Y, lv] of embers) { L.set(X, Y - LTF, EMB[lv - 1]); LG.set(X, Y - LTF, EMB[lv]); }
    LAV.push(L); LAVG.push(LG);
  }

  // ================= Mitte: Ascheebene, vom Strom angestrahlt, feine Kruste; wenige Silhouetten
  const M = buf(WF, HF), MG = buf(WF, HF);
  const mcrust = lavaAt({ seed: 977, crust: BLACK5, emb: PAL.ember, wall: BLACK5, grout: '#000000', cell: 9, open: 0, crack: 0.75 });
  const ASH = ['#120b0c', '#181010', '#201512', '#2a1a15', '#362017', '#452818', '#583218'];
  const dcol = (X, Y) => { const r = river.get(X); if (!r) return 99 * Q; return Y < r[0] ? r[0] - Y : Y > r[1] ? Y - r[1] : 0; };
  // Abstand zum Strom (Feinpixel) auch über das Ende hinaus (läuft aus statt abzubrechen); abgekühlter Strom leuchtet schwächer
  const dist = (X, Y) => {
    let m = dcol(X, Y);
    if (m === 0) return 0;
    for (let dx = 1; dx <= 14 * Q; dx++) m = Math.min(m, dcol(X - dx, Y) + dx * 0.7, dcol(X + dx, Y) + dx * 0.7);
    return Math.round(m + (1 - cool(sx(X))) * 5 * Q);
  };
  for (let Y = Q * (HOR - 1); Y < HF; Y++) for (let X = 0; X < WF; X++) {
    if (Y < hfF(X) + Q && Y < Q * HOR) continue;
    const dF = dist(X, Y);
    if (dF === 0) continue;
    const dl = dF / Q, y = sx(Y);
    // ruhige Flecken statt Korn: Wertrauschen, Grenzen im Schachbrett
    const n = vnoise(X / 22, Y / 6, 11) * 0.65 + vnoise(X / 9, Y / 3, 12) * 0.35;
    const l = n > 0.64 || (n > 0.58 && chk(X, Y)) ? 0.3 : n < 0.34 || (n < 0.4 && chk(X, Y)) ? 0.15 : 0.23;
    let li = dl <= 1 ? 6 : dl <= 2 ? 5 : dl <= 4 ? 4 : dl <= 7 ? 3 : dl <= 12 ? 2 : 1;
    if (dl > 1 && dl <= 12 && chk(X, Y) && [3, 5, 8, 12].some((t) => dF === t * Q || dF === t * Q - 1)) li--;
    if (y < HOR + 2) li = Math.max(li, 3);
    if (l > 0.27 && li < 6) li++;
    if (l < 0.19 && li > 0) li--;
    M.set(X, Y, ASH[li]);
    if (y > HOR + 3 && dl > 1) {
      const [, seam, lv] = mcrust(X + 1800, Y + 400);
      if (seam) {
        const t = (y - HOR) / (FY - HOR), lvl = t < 0.25 ? -1 : t < 0.6 ? 0 : t < 0.85 ? 1 : 2;
        if (lvl >= 0) M.set(X, Y, ['#21100e', '#30130f', '#481a0e'][lvl]);
        if (lvl === 2 && (lv >= 3 || chk(X, Y))) MG.set(X, Y, EMB[lv >= 3 ? 2 : 1]);
      }
    }
  }
  // Silhouetten (Spiel-Deko im Feinraster 1:1): Obsidiannadeln und ein Säulenstumpf am Ufer
  const mids = [];
  const shore = (x, off) => { const r = river.get(Q * x); return r ? r[0] - Q * off : Q * (HOR + 6); };
  for (const [x, off, e, fl] of [[470, 3, deko.obsidianNeedles[2], false], [150, 5, deko.obsidianNeedles[0], true], [214, 4, deko.columnStumps[1], false]]) mids.push({ e, x: Q * x, y: shore(x, off), f: fl });
  mids.sort((a, c) => a.y - c.y);
  for (const o of mids) {
    stamp(M, o.e, o.x, o.y, { flip: o.f, G: MG, map: (c, X, Y) => {
      const l = lum(c), j = Math.min(4, Math.floor(l * 7));
      const lit = M.get(X + 1, Y)[3] === 0 || M.get(X, Y - 1)[3] === 0;
      return rgb((lit && l > 0.18 ? ['#2a1410', '#3a1a12', '#4a2214', '#5a2a16', '#6a3218'] : ['#0e0809', '#130b0c', '#190e0e', '#211211', '#2a1614'])[j]);
    } });
  }

  // ================= Nah: Felsplateau, Kante warm angestrahlt (Lichtkante 1 Feinpixel), Kruste mit Glutfugen
  const N = buf(WF, HF), NG = buf(WF, HF), NF = buf(WF, HF);   // NF: Fugen (für die Glutwelle des Erdspalters)
  const ROCK = ['#0a0608', '#100a0c', '#170f10', '#201413', '#2c1b17', '#3d2419', '#55301a', '#6e3e1e'];
  const topc = (x) => {
    const flat = Math.max(0, Math.min(1, (Math.abs(x - HX - 20) - 70) / 40));
    return FY - 3 + flat * wave(x, [[2, 2, 1.2], [1.2, 5, 0.3], [0.6, 13, 2.2]]) + Math.max(0, (x - HX - 110) * 0.06) + Math.max(0, (HX - 120 - x) * 0.05);
  };
  const crust = lavaAt({ seed: 4242, crust: ['#0b0709', '#120c0e', '#1a1213', '#241817', '#30201b'], emb: PAL.ember, wall: ROCK, grout: ROCK[0], cell: 13, open: 0, crack: 0.8 });
  const tops = [];
  for (let X = 0; X < WF; X++) {
    const T0 = Math.round(Q * topc(sx(X))); tops.push(T0);
    for (let Y = T0; Y < HF; Y++) {
      const dy = Y - T0;
      if (dy < 6) {
        // Kante: Lichtkante oben, dann gestufte Fase; gebrochen, wo Fugen der Kruste die Kante erreichen
        const notch = crust(X + 128, T0 + 6 + 128)[1] || crust(X + 128, T0 + 8 + 128)[1];
        const lv = dy === 0 ? (notch ? 4 : hash2(X >> 1, 7, 5) < 0.18 ? 6 : 7) : dy === 1 ? (notch ? 3 : 6) : dy === 2 ? (notch ? 2 : 5) : dy === 3 ? 4 : chk(X, Y) ? 3 : 2;
        N.set(X, Y, ROCK[lv]); continue;
      }
      const [c, seam, sl] = crust(X + 128, Y + 128);
      const deep = dy > 44 || (dy > 32 && chk(X, Y));
      if (seam) {
        NF.set(X, Y, '#ffffff');
        const far = Math.abs(sx(X) - HX) / 60 + dy / Q / 26;
        const lv = far < 0.6 ? 0 : far < 1.3 ? 1 : 2, core = sl >= 3;            // Kern der Fuge (heiß) / Saum
        if (lv === 2 || deep) N.set(X, Y, core ? '#4a1810' : '#3a1410');
        else { N.set(X, Y, core ? EMB[2] : EMB[1]); NG.set(X, Y, lv === 0 ? (core ? EMB[4] : EMB[3]) : (core ? EMB[3] : EMB[2])); }
      } else N.set(X, Y, deep ? [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 255] : c);
    }
  }

  const toUrl = (B) => { const c = document.createElement('canvas'); c.width = B.w; c.height = B.h; c.getContext('2d').putImageData(new ImageData(B.d, B.w, B.h), 0, 0); return c.toDataURL('image/png'); };
  const stack = (arr) => { const h = arr[0].h, c = document.createElement('canvas'); c.width = arr[0].w; c.height = h * arr.length; const x = c.getContext('2d'); arr.forEach((B, i) => x.putImageData(new ImageData(B.d, B.w, B.h), 0, i * h)); return c.toDataURL('image/png'); };
  return { fern: toUrl(F), fernGlut: toUrl(FG), lava: stack(LAV), lavaGlut: stack(LAVG), mitte: toUrl(M), mitteGlut: toUrl(MG), nah: toUrl(N), nahGlut: toUrl(NG), nahFuge: toUrl(NF), LT: LTF, LH2: LBF - LTF, tops };
}, SZ);
for (const [k, v] of Object.entries(res)) if (typeof v === 'string') save(`szene-${k}.png`, v);
Object.assign(SZ, { LT: res.LT, LH2: res.LH2 });
writeFileSync(join(TMP, 'szene.json'), JSON.stringify({ SZ, tops: res.tops }));
await b.close();
if (process.env.NURSZENE) process.exit(0);

// ---------------------------------------------------------------------------------------------- 2. Held, Glutwelle, Standbild (Python)
const out = JSON.parse(execFileSync('python3', [join(HERE, 'titel-held.py'), TMP, IMG], { maxBuffer: 1 << 26 }).toString());
let total = 0;
for (const [f, n] of Object.entries(out.sizes)) { total += n; console.log(`${f.padEnd(26)} ${(n / 1024).toFixed(1).padStart(7)} KB`); }
console.log(`zusammen ${(total / 1024).toFixed(1)} KB; Vorschau ${join(TMP, 'vorschau.png')}`);

// ---------------------------------------------------------------------------------------------- 3. Maße nach titel.js
const src = readFileSync(JS, 'utf8');
const block = `  // <titel-held.mjs> – von tools/titel-held.mjs geschrieben, nicht von Hand ändern\n  const META = ${JSON.stringify(out.meta)};\n  // </titel-held.mjs>`;
const next = src.replace(/  \/\/ <titel-held\.mjs>[\s\S]*?\/\/ <\/titel-held\.mjs>/, block);
if (next === src && !src.includes(block)) throw new Error('META-Block in titel.js nicht gefunden');
writeFileSync(JS, next);
