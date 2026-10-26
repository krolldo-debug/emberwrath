// Bilder der Dungeonsuche (11.10.): ein Wappen je Dungeon für die Liste und ein kleines Eingangsbild für die
// Vorschau rechts. Alles im Code gezeichnet (keine Bilddateien im Spielpaket), harte Pixelkanten, kein Alpha.
// API: dungeonEmblem(id, scale) -> Data-URL 16×16 · dungeonScene(id) -> Data-URL 112×64 (Anzeige ×2)
const cache = new Map();
const O = '#0b0710';

// Stimmung je Dungeon: Himmel/Höhle (oben nach unten), Boden, Stein, Leuchten im Tor, Akzent
const THEMES = {
  catacombs: { sky: ['#0c0a12', '#16121e', '#201a2a'], ground: ['#2a2230', '#1a141e'], stone: ['#2a2632', '#4a4454', '#6e6878'], glow: ['#123024', '#2a7a4e', '#8af0b0'], accent: '#d8d0b8' },
  sunken_temple: { sky: ['#06121a', '#0a1e2a', '#10303a'], ground: ['#1a5a6a', '#0e3a4a'], stone: ['#1e3a3a', '#3a6460', '#6a9a8a'], glow: ['#0a2a3a', '#2a8aa0', '#a0f0f0'], accent: '#e0f4f0' },
  molten_forge: { sky: ['#140606', '#260c08', '#3a140a'], ground: ['#e8742c', '#9a2a10'], stone: ['#241614', '#4a2c22', '#6e4636'], glow: ['#5a1408', '#e05a14', '#ffd27a'], accent: '#ffb040' },
  howling_barrow: { sky: ['#080a18', '#101830', '#1c2842'], ground: ['#2e3a2a', '#1c241a'], stone: ['#3a3c40', '#5e6266', '#8a9094'], glow: ['#1a2440', '#4a7ac0', '#c8e4ff'], accent: '#e8ecf4' },
  spore_hollow: { sky: ['#0c0a10', '#161424', '#22182e'], ground: ['#2a3a1a', '#18220e'], stone: ['#2a2a22', '#4a4a36', '#6e6e4e'], glow: ['#2a3a0a', '#8ab020', '#e8ff7a'], accent: '#c890f0' },
  rime_caverns: { sky: ['#0a1426', '#142a46', '#1e4262'], ground: ['#c8dcec', '#7a9ab8'], stone: ['#2a3e5a', '#4a6a8e', '#8ab0d0'], glow: ['#1a3a5a', '#5ab0e0', '#e0f8ff'], accent: '#ffffff' },
  ashen_throne: { sky: ['#1a0408', '#3a0a0c', '#5a1a10'], ground: ['#2a1a18', '#140c0c'], stone: ['#1e1418', '#3a2a2e', '#5e4a4a'], glow: ['#5a1a08', '#e8742c', '#fff0a0'], accent: '#e8c25a' },
  random: { sky: ['#0a0612', '#140c22', '#201434'], ground: ['#24182e', '#140c1c'], stone: ['#2a2234', '#463a54', '#6a5c7a'], glow: ['#2a0c4a', '#7a3ad0', '#e0b8ff'], accent: '#e8c25a' },
};

// ------------------------------------------------------------------ Wappen (16×16)
const EP = { o: O, w: '#e2e8f2', s: '#9ea9bf', t: '#454c5e', g: '#e8c25a', d: '#8a5a18', h: '#fff4c0', b: '#2a8aa0', c: '#a0f0f0', n: '#145a6a', e: '#f07a1c', y: '#ffd27a', r: '#98182a', m: '#c890f0', p: '#6a3aa0', l: '#8ab020', k: '#4a3a2a', i: '#e0f8ff', u: '#5ab0e0', v: '#2a5a8e', f: '#3a2a2e' };
const EMBLEMS = {
  // Schädel über gekreuzten Knochen
  catacombs: [
    '................', '.....oooooo.....', '....owwwwwwo....', '...owwwwwwwso...', '...owoowwoowso..', '...owoowwoowso..',
    '...owwwoowwwso..', '....owwwwwwso...', '....owowowso....', '.oo..oooooo..oo.', 'owwoo......oowwo', '.oowwoo..oowwoo.',
    '...oowwoowwoo...', '.oowwoo..oowwoo.', 'owwoo......oowwo', '.oo..........oo.',
  ],
  // Welle unter einem Tempelgiebel
  sunken_temple: [
    '................', '.......oo.......', '.....oossoo.....', '...oossssssoo...', '.oossssssssssoo.', 'oooooooooooooooo',
    '.osoossoossoosso', '.osoossoossoosso', '.osoossoossoosso', '.osoossoossoosso', 'oooooooooooooooo', 'obbbccbbbbccbbbo',
    'occbbbbccbbbbcco', 'onnbbnnnnbbnnbno', '.oonnnoonnnoonn.', '..oo..oo..oo....',
  ],
  // Amboss mit Flamme
  molten_forge: [
    '.......oo.......', '......oyeo......', '.....oyyeo......', '.....oeyyeo.....', '....oeyyyeo.....', '....oeehyeeo....',
    '.....oeeeeo.....', 'ooooooooooooooo.', 'osssssssssssssso', '.otttssssssstto.', '...ottsssstto...', '....oottttoo....',
    '....ossssssto...', '...osssssssso...', '..oooooooooooo..', '................',
  ],
  // Eiserne Krone des Hügelkönigs
  howling_barrow: [
    '................', '................', '.o...o....o...o.', 'oso.oso..oso.oso', 'oso.oso..oso.oso', 'ossoossoossoosso',
    'osssssssssssssso', 'osswssbssbsswsso', 'osssssssssssssso', 'otttttttttttttto', 'oooooooooooooooo', '................',
    '................', '................', '................', '................',
  ],
  // Giftpilz mit Sporen
  spore_hollow: [
    '..m.........m...', '.......m........', '.....oooooo.....', '...oommppppoo...', '..ommpmmpppmmo..', '.ommpppmmpppmmo.',
    '.ompmmpppmmpppo.', 'oppppppppppppppo', 'oooooooooooooooo', '.....owwwwo.....', '.....owwwso.....', '.....owwwso..m..',
    '....owwwwsso....', '.m..owwwwsso....', '..ollllllllllo..', '..oooooooooooo..',
  ],
  // Eiskristall
  rime_caverns: [
    '.......oo.......', '......oiio......', '...oo.oiuo.oo...', '...oioouuooio...', '....oiouuoio....', '.oo..oiuuio..oo.',
    'oiiooouiiuoooiio', 'ouuuuuiiiiuuuuuo', 'ouuuuuiiiiuuuuuo', 'oiiooouiiuoooiio', '.oo..oiuuio..oo.', '....oiouuoio....',
    '...oioouuooio...', '...oo.oiuo.oo...', '......oiio......', '.......oo.......',
  ],
  // Brennende Krone über dem Thron
  ashen_throne: [
    '...e...e...e....', '..eye.eye.eye...', '..oyo.oyo.oyo...', '.o.o.o.o.o.o.o..', 'ogoogoogoogoogo.', 'oggogggggggoggo.',
    'oghgggrgggrgggo.', 'oggggggggggggdo.', 'oddddddddddddo..', 'oooooooooooooo..', '..offffffffffo..', '..ofoooooooofo..',
    '..ofo......ofo..', '..ofo......ofo..', '..ooo......ooo..', '................',
  ],
};

export function dungeonEmblem(id, scale = 2) {
  const art = EMBLEMS[id];
  if (!art) return null;
  const key = `e|${id}|${scale}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 16 * scale; c.height = 16 * scale;
  const x = c.getContext('2d');
  art.forEach((row, py) => [...row.slice(0, 16)].forEach((ch, px) => {
    if (ch === '.' || !EP[ch]) return;
    x.fillStyle = EP[ch]; x.fillRect(px * scale, py * scale, scale, scale);
  }));
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ Eingangsbild (112×64)
const W = 112, H = 64;

function painter(ctx) {
  const p = {
    px(x, y, c) { if (x >= 0 && y >= 0 && x < W && y < H) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); } },
    rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); },
    // Schachbrett-Raster als harter Übergang zwischen zwei Farbflächen
    dither(x, y, w, h, c, phase = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i + j + phase) % 2 === 0) p.px(x + i, y + j, c); },
  };
  return p;
}

// Kleiner, fester Zufall: jedes Bild sieht bei jedem Öffnen gleich aus
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Torbogen: außen 36 breit, Rundung oben; innen 20 breit. Mitte bei x = 56, unten bei y = 50.
const GX = 56, GB = 50, OR = 18, IR = 10, OH = 38, IH = 28;
const inOuter = (x, y) => Math.abs(x + 0.5 - GX) <= OR && y < GB && (y >= GB - OH + OR || (x + 0.5 - GX) ** 2 + (y + 0.5 - (GB - OH + OR)) ** 2 <= OR * OR);
const inInner = (x, y) => Math.abs(x + 0.5 - GX) <= IR && y < GB && (y >= GB - IH + IR || (x + 0.5 - GX) ** 2 + (y + 0.5 - (GB - IH + IR)) ** 2 <= IR * IR);

function drawSky(p, t) {
  const [a, b, c] = t.sky;
  p.rect(0, 0, W, 16, a); p.dither(0, 16, W, 2, b);
  p.rect(0, 18, W, 14, b); p.dither(0, 32, W, 2, c);
  p.rect(0, 34, W, 14, c);
}

function drawGround(p, t) {
  p.rect(0, 46, W, H - 46, t.ground[1]);
  p.rect(0, 46, W, 3, t.ground[0]);
  p.dither(0, 49, W, 2, t.ground[0], 1);
}

function drawGate(p, t, rand) {
  const [sd, sm, sl] = t.stone, [gd, gm, gb] = t.glow;
  for (let y = GB - OH - 1; y <= GB; y++) for (let x = GX - OR - 1; x <= GX + OR + 1; x++) {
    if (inOuter(x, y)) {
      if (inInner(x, y)) continue;
      // Steinblöcke: Fugen alle 5 Zeilen, versetzte Stoßfugen
      const row = Math.floor((y - (GB - OH)) / 5), joint = (y - (GB - OH)) % 5 === 0, vj = (x + row * 4) % 9 === 0;
      let c = joint || vj ? sd : sm;
      if (!joint && !vj && ((y - (GB - OH)) % 5 === 1 || (x + row * 4) % 9 === 1)) c = sl;
      if (!joint && !vj && rand() < 0.06) c = sd;
      p.px(x, y, c);
    } else if (inOuter(x + 1, y) || inOuter(x - 1, y) || inOuter(x, y + 1) || inOuter(x, y - 1)) p.px(x, y, O);
  }
  // Öffnung: Leuchten von dunkel (oben) nach hell (unten), harte Stufen mit Raster
  for (let y = GB - IH; y < GB; y++) for (let x = GX - IR; x <= GX + IR; x++) {
    if (!inInner(x, y)) continue;
    // Licht aus der Tiefe: Bögen um die Mitte der Schwelle, harte Stufen mit einer Rasterzeile dazwischen
    const e = Math.hypot((x + 0.5 - GX) / (IR * 1.25), (GB - y - 0.5) / (IH * 0.95));
    let c = e < 0.42 ? gb : e < 0.78 ? gm : gd;
    if (e >= 0.42 && e < 0.5 && (x + y) % 2 === 0) c = gb;
    if (e >= 0.78 && e < 0.86 && (x + y) % 2 === 0) c = gm;
    p.px(x, y, c);
  }
  // Innenkante dunkel, Schlussstein hell
  for (let y = GB - IH - 1; y < GB; y++) for (let x = GX - IR - 1; x <= GX + IR + 1; x++) if (!inInner(x, y) && inOuter(x, y) && (inInner(x + 1, y) || inInner(x - 1, y) || inInner(x, y + 1))) p.px(x, y, sd);
  p.rect(GX - 2, GB - OH - 1, 4, 6, O); p.rect(GX - 1, GB - OH, 2, 4, sl);
  // Stufen und Lichtschein auf dem Boden
  p.rect(GX - 13, GB, 26, 2, sm); p.rect(GX - 13, GB, 26, 1, sl); p.rect(GX - 16, GB + 2, 32, 2, sd); p.rect(GX - 16, GB + 2, 32, 1, sm);
  p.rect(GX - 13, GB + 4, 26, 1, O);
  for (let y = GB + 5; y < H; y++) { const w = 18 - (y - GB - 5) * 2; if (w > 0) p.dither(GX - w, y, w * 2, 1, gm, y); }
}

const SCENES = {
  catacombs(p, t, r) {
    // Säulen im Gewölbe, Kerzen, Schädelreihe über dem Tor
    for (const cx of [10, 30, 82, 102]) { p.rect(cx - 3, 6, 6, 40, t.stone[0]); p.rect(cx - 3, 6, 1, 40, t.stone[1]); p.rect(cx - 5, 4, 10, 3, t.stone[1]); p.rect(cx - 5, 44, 10, 2, t.stone[1]); }
    for (const cx of [20, 92]) { p.rect(cx, 40, 2, 6, t.accent); p.px(cx, 38, '#ffd27a'); p.px(cx + 1, 39, '#f07a1c'); p.px(cx, 39, '#ffd27a'); }
    for (const sx of [GX - 9, GX - 2, GX + 5]) { p.rect(sx, GB - OH - 6, 4, 3, t.accent); p.px(sx + 1, GB - OH - 5, O); p.px(sx + 2, GB - OH - 5, O); p.rect(sx + 1, GB - OH - 3, 2, 1, t.accent); }
    for (const [bx, by] of [[14, 52], [96, 54], [24, 57]]) { p.rect(bx, by, 5, 1, t.accent); p.px(bx - 1, by - 1, t.accent); p.px(bx + 5, by + 1, t.accent); }
  },
  sunken_temple(p, t, r) {
    // Lichtfahnen von oben, Säulen, Wasser bis über die Stufen
    for (const lx of [16, 40, 74, 96]) for (let y = 0; y < 44; y++) if ((y + lx) % 3 !== 0) p.px(lx + Math.floor(y / 4), y, t.sky[2]);
    for (const cx of [GX - 26, GX + 26]) { p.rect(cx - 3, 14, 6, 34, t.stone[1]); p.rect(cx - 3, 14, 2, 34, t.stone[2]); p.rect(cx + 2, 14, 1, 34, t.stone[0]); p.rect(cx - 5, 11, 10, 3, t.stone[2]); }
  },
  sunken_temple_front(p, t) {
    p.rect(0, 52, W, H - 52, t.ground[1]);
    for (let y = 52; y < H; y += 3) for (let x = (y * 7) % 11; x < W; x += 13) p.rect(x, y, 5, 1, t.ground[0]);
    for (let x = 0; x < W; x += 2) p.px(x, 52, t.accent);
  },
  molten_forge(p, t, r) {
    // Schlote im Hintergrund, Lavastrom, Funken
    for (const [cx, h] of [[12, 30], [26, 22], [88, 26], [102, 34]]) { p.rect(cx - 4, 46 - h, 8, h, '#1a0c0a'); p.rect(cx - 5, 46 - h, 10, 2, '#2a1610'); p.px(cx, 44 - h, '#e05a14'); }
    for (let i = 0; i < 26; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * 44); p.px(x, y, r() < 0.5 ? '#ffd27a' : '#f07a1c'); }
  },
  molten_forge_front(p, t) {
    p.rect(0, 57, W, 7, t.ground[1]);
    for (let x = 0; x < W; x++) { const y = 57 + Math.round(Math.sin(x / 6) * 1.5); p.px(x, y, t.ground[0]); p.px(x, y + 1, t.ground[0]); if (x % 7 === 0) p.px(x, y + 3, '#ffd27a'); }
  },
  howling_barrow(p, t, r) {
    // Mond, Sterne, Grabhügel mit Menhiren, das Tor sitzt im Hügel
    for (let i = 0; i < 30; i++) p.px(Math.floor(r() * W), Math.floor(r() * 26), r() < 0.3 ? t.accent : '#6a7aa0');
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) p.px(92 + x, 10 + y, (x + 2) ** 2 + (y + 1) ** 2 <= 9 ? '#c8d0e0' : '#e8ecf4');
    for (let x = 0; x < W; x++) { const top = 22 + Math.round(((x - GX) / 40) ** 2 * 18); for (let y = Math.max(top, 0); y < 48; y++) p.px(x, y, y === top ? '#4a5a3a' : '#2a3424'); }
    for (const [sx, h] of [[8, 14], [18, 10], [96, 12], [106, 16]]) { p.rect(sx, 48 - h, 4, h, t.stone[1]); p.rect(sx, 48 - h, 1, h, t.stone[2]); p.rect(sx + 3, 48 - h, 1, h, t.stone[0]); }
  },
  spore_hollow(p, t, r) {
    // Riesenpilze links und rechts, schwebende Sporen
    const shroom = (cx, top, w, cap) => {
      p.rect(cx - 2, top + 5, 4, 48 - top - 5, '#c8c0a8'); p.rect(cx - 2, top + 5, 1, 48 - top - 5, '#e8e0c8');
      for (let y = 0; y < 7; y++) { const hw = Math.round(w * Math.sqrt(1 - ((6 - y) / 7) ** 2)); p.rect(cx - hw, top + y, hw * 2, 1, y === 0 ? '#e8b0ff' : cap); }
      p.rect(cx - w, top + 6, w * 2, 1, '#3a1a4a');
      for (let i = 0; i < 4; i++) p.px(cx - w + 2 + Math.floor(r() * (w * 2 - 4)), top + 2 + Math.floor(r() * 3), '#e8b0ff');
    };
    shroom(14, 14, 11, '#8a4ab0'); shroom(32, 30, 6, '#6a3aa0'); shroom(98, 10, 12, '#8a4ab0'); shroom(82, 32, 5, '#6a3aa0');
    for (let i = 0; i < 24; i++) p.px(Math.floor(r() * W), Math.floor(r() * 46), r() < 0.5 ? '#e8ff7a' : t.accent);
  },
  rime_caverns(p, t, r) {
    // Eiszapfen von der Decke, Kristalle, Schnee
    for (let x = 0; x < W; x += 3) { const h = 3 + Math.floor(r() * 9); for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round(2 * (1 - y / h))); p.rect(x, y, w, 1, y < 2 ? '#e0f8ff' : '#8ab0d0'); } }
    for (const [cx, h] of [[14, 12], [22, 7], [92, 10], [100, 14]]) for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round(3 * (y / h))); p.rect(cx - w, 48 - h + y, w * 2, 1, y % 3 ? '#5ab0e0' : '#e0f8ff'); }
    for (let i = 0; i < 18; i++) p.px(Math.floor(r() * W), 12 + Math.floor(r() * 34), '#ffffff');
  },
  ashen_throne(p, t, r) {
    // Zackige Türme, Banner am Tor, fallende Asche
    for (const [cx, h] of [[8, 34], [20, 24], [92, 26], [104, 36]]) { p.rect(cx - 4, 46 - h, 8, h, '#140608'); for (let i = 0; i < 4; i++) p.px(cx - 3 + i * 2, 45 - h, '#140608'); p.px(cx, 40 - h + 8, '#e8742c'); }
    for (const bx of [GX - 26, GX + 22]) { p.rect(bx, 16, 4, 22, '#98182a'); p.rect(bx, 16, 1, 22, '#c8303a'); p.px(bx + 1, 38, '#98182a'); p.px(bx + 2, 38, '#98182a'); p.rect(bx + 1, 22, 2, 2, t.accent); p.rect(bx - 1, 15, 6, 1, t.stone[2]); }
    for (let i = 0; i < 30; i++) p.px(Math.floor(r() * W), Math.floor(r() * 46), r() < 0.35 ? '#e8742c' : '#6a5050');
  },
  random(p, t, r) {
    // Halle der Portale: Säulen mit violetten Feuerschalen, schwebende Funken, Runenkreis am Boden
    for (let i = 0; i < 22; i++) p.px(Math.floor(r() * W), Math.floor(r() * 44), r() < 0.5 ? '#7a3ad0' : '#3a2a5a');
    for (const cx of [14, 98]) {
      p.rect(cx - 3, 22, 6, 26, t.stone[1]); p.rect(cx - 3, 22, 1, 26, t.stone[2]); p.rect(cx + 2, 22, 1, 26, t.stone[0]);
      p.rect(cx - 6, 18, 12, 4, t.stone[2]); p.rect(cx - 6, 21, 12, 1, t.stone[0]);
      p.rect(cx - 4, 14, 8, 4, '#7a3ad0'); p.rect(cx - 3, 11, 6, 3, '#b07af0'); p.rect(cx - 1, 8, 3, 3, '#e0b8ff'); p.px(cx, 6, '#e0b8ff');
    }
    for (const cx of [34, 78]) { p.rect(cx - 2, 30, 4, 18, t.stone[0]); p.rect(cx - 2, 30, 1, 18, t.stone[1]); p.rect(cx - 3, 28, 6, 2, t.stone[1]); }
  },
  random_front(p, t) {
    for (let a = 0; a < 64; a++) { const k = (a / 64) * Math.PI * 2; p.px(Math.round(GX + Math.cos(k) * 30), Math.round(58 + Math.sin(k) * 4), a % 4 === 0 ? '#e0b8ff' : t.glow[1]); }
    for (let a = 0; a < 40; a++) { const k = a / 40 * Math.PI * 5, rr = 1 + a / 40 * 8; p.px(Math.round(GX + Math.cos(k) * rr), Math.round(GB - 11 + Math.sin(k) * rr * 0.9), '#e0b8ff'); }
  },
};

export function dungeonScene(id) {
  const key = `s|${id}`;
  if (cache.has(key)) return cache.get(key);
  const t = THEMES[id] ?? THEMES.random;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const p = painter(c.getContext('2d'));
  const seed = [...String(id)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  drawSky(p, t);
  drawGround(p, t);
  const sid = SCENES[id] ? id : 'random';
  // Hintergrund, Tor, dann Vordergrund (Wasser, Lava, Wirbel im Tor)
  SCENES[sid](p, t, rng(seed));
  drawGate(p, t, rng(seed + 1));
  SCENES[`${sid}_front`]?.(p, t, rng(seed + 2));
  // Rahmen: eine dunkle Pixelkante
  p.rect(0, 0, W, 1, O); p.rect(0, H - 1, W, 1, O); p.rect(0, 0, 1, H, O); p.rect(W - 1, 0, 1, H, O);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
