import { hash2 } from '../../core/math.js';

// Mauern, Terrassen und Treppen der Sternenstadt (level.paintedCliffs im Biom astral; world/Outdoor.js ruft
// pal.paintCliffs je Chunk, in Weltpixeln). '#'-Kacheln sind Mauerkörper (fest). Je Spalte bildet ein senkrechter
// '#'-Lauf eine nach Süden blickende Mauer: ab zwei Kacheln Stützmauer (32 px: Sockel, Quader, Gesims,
// Zinnenbrüstung), eine Kachel allein = Brüstung (16 px); die Kacheln eines längeren Laufs über der Wand sind die
// Mauerkrone von oben (Nord-Süd-Mauern, Zinnen an den freien Rändern). Alles Gemalte liegt in den festen Kacheln:
// Figuren davor verdecken die Wand, Figuren dahinter stehen ganz darüber – keine Sortierfehler.
// level.ramparts (Kacheln): stairs [[x, y, w, h]] begehbare Treppen nach Norden hinauf,
//   floors [{ r: [x, y, w, h], k: 'flag' | 'walk' | 'herring' | 'rose' | 'cobble' | 'earth' | 'gravel' | 'worn', pw? }] Beläge auf
//   Pflaster/Sand (Gras bleibt); earth/gravel/worn = Weg mit Grasrand, pw = Wegbreite in Kacheln,
//   quays: true = Steineinfassung an Wasserbecken ('~'), stone: 'rubble' = grauer Bruchstein statt Sternkalk.
// Licht von oben links: Wandflächen im Halbschatten, Kronen und Gesimse hell, Schlagschatten unter und rechts
// der Mauern (nur abdunkeln, damit die Ebene im Feinraster affin bleibt). Deterministisch aus Weltkoordinaten.

const rgb = (h) => (parseInt(h.slice(1), 16));
// Sternkalk: heller, warmer Kalkstein im Morgenlicht (hebt sich vom kühlen Pflaster ab): 0 dunkel … 8 hell
const ST_KALK = ['#221a28', '#33283a', '#4a3a4e', '#625064', '#7e687a', '#9c8692', '#baa4aa', '#d6c2c2', '#f0e2da'].map(rgb);
// Grauer Bruchstein der Fachwerk-Altstadt (level.ramparts.stone = 'rubble'); ST ist die Palette der gerade gemalten Karte
const ST_RUB = ['#16131a', '#1e1a1e', '#2e292c', '#423b3c', '#58504e', '#706662', '#8a7e76', '#a69a8e', '#c0b4a6'].map(rgb);
let ST = ST_KALK;
const MOSS = ['#22362e', '#34503c', '#4c6c4a', '#6e8e5a'].map(rgb);
const IVY = ['#1c3026', '#2c4a32', '#44683e', '#668e4c', '#8eb262'].map(rgb);
const GOLD = ['#5a3a14', '#9a6a24', '#d8a440', '#f6d888'].map(rgb);
const FLAG = ['#2a2638', '#3c3650', '#4e4864', '#605a78', '#746e8c', '#8a84a2', '#a29cb8'].map(rgb);
const BRICK = ['#2a2028', '#3e2e38', '#523c46', '#644a52', '#765a60', '#886a6e', '#9c7e7e'].map(rgb);
const SAND = ['#2a2430', '#3c3440', '#504650', '#645862', '#786a72', '#8e7e84', '#a49498'].map(rgb);
const STAR = ['#3c2868', '#6c52a8', '#b49ae0'].map(rgb);
// Mittelalter: Kopfsteinpflaster, Innenräume (Holz, Bruchstein, Backstein)
const COB = ['#1a161c', '#28222a', '#383038', '#484048', '#5a5058', '#6e646a', '#847a7c'].map(rgb);
const EARTH = ['#16110f', '#221a16', '#30261e'].map(rgb);
const OAK = ['#140c0a', '#22140f', '#321e16', '#46291c', '#5a3624', '#70452e', '#88573a', '#a06c48'].map(rgb);
const DAUB = ['#3a2c2a', '#5a4638', '#7c6450', '#9c826a', '#b8a084', '#d0ba9c', '#e4d2b4'].map(rgb);
const RUB = ['#1e1a1e', '#2e292c', '#423b3c', '#58504e', '#706662', '#8a7e76', '#a69a8e'].map(rgb);
const BRK = ['#24100e', '#3a1a14', '#542519', '#6e321f', '#884228', '#a05634', '#b86e46'].map(rgb);
const LIME = ['#3a3436', '#5a5254', '#7a7272', '#9a9290', '#b8b0aa', '#d2cac0', '#e8e0d4'].map(rgb);
const TERRA = ['#2a140e', '#442016', '#5e2e1e', '#783c26', '#904c30', '#a8603c', '#bc7448'].map(rgb);
const WOOL = ['#2a0e14', '#4a1820', '#6e2228', '#923232', '#2a2a4a', '#3c3c66', '#c49a4a', '#e0c070'].map(rgb);
const SKY = ['#2a3448', '#4a6080', '#7a98b8', '#b4cce0'].map(rgb);
const VOID = rgb('#0b0910');
const RSH = ['#120e14', '#1c1720', '#28212c', '#363040', '#463e4e', '#585060', '#6c6474'].map(rgb);
const RCL = ['#2a0e0a', '#441812', '#5e2418', '#7a3220', '#94422a', '#ac5838', '#c4724a'].map(rgb);
const RSL = ['#0e1016', '#161a24', '#202634', '#2c3444', '#3a4456', '#4c566a', '#626c80'].map(rgb);
const LAMPW = ['#3a2614', '#d8984a', '#f6c87a'].map(rgb);
const RDB = ['#3a2c2a', '#5a4638', '#7c6450', '#9c826a', '#b8a084'].map(rgb);
// Wege der Altstadt: Gras am Rand, festgetretene Erde, Kies
const GRS = ['#141c14', '#1c2a1a', '#263820', '#304628', '#3c5630', '#4a683a', '#5c7c46'].map(rgb);
const DIRT = ['#1a1310', '#261c16', '#33261c', '#423224', '#52402e', '#64503a', '#786248'].map(rgb);
const GRAV = ['#201c20', '#2e2a2c', '#3e3a3a', '#504a48', '#625a56', '#766c66', '#8c827a'].map(rgb);

const PREP = new WeakMap();
function prep(map) {
  let R = PREP.get(map);
  if (R) return R;
  const w = map.w, h = map.h, rows = map.rows, cfg = map.level.ramparts ?? {};
  const wall = new Uint8Array(w * h), top = new Int16Array(w * h), bot = new Int16Array(w * h), water = new Uint8Array(w * h);
  const need = new Uint8Array(w * h);                 // Kacheln, in denen der Maler etwas tut
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rows[y][x]; wall[y * w + x] = c === '#' ? 1 : 0; water[y * w + x] = c === '~' ? 1 : 0; }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!wall[y * w + x]) { y++; continue; }
      const ya = y;
      while (y < h && wall[y * w + x]) y++;
      for (let yy = ya; yy < y; yy++) { top[yy * w + x] = ya; bot[yy * w + x] = y - 1; }
    }
  }
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) need[y * w + x] = 1; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (wall[i]) { mark(x, y); mark(x + 1, y); mark(x, y + 1); mark(x + 1, y + 1); }
    if (cfg.quays && water[i]) mark(x, y);
  }
  const rect = ([x, y, rw, rh]) => { for (let j = y; j < y + rh; j++) for (let k = x; k < x + rw; k++) mark(k, j); return { x0: x * 16, y0: y * 16, x1: (x + rw) * 16, y1: (y + rh) * 16 }; };
  const stairs = (cfg.stairs ?? []).map(rect);
  const floors = (cfg.floors ?? []).map((f) => ({ ...rect(f.r), k: f.k, pw: f.pw }));
  // Innenräume: r = Raum samt Mauern (Rückwand 3 Kacheln hoch), s = Stil, win = Fensterspalten der Rückwand, rug = Teppich
  const rooms = (cfg.rooms ?? []).map((o) => ({ ...rect(o.r), rows, tx: o.r[0], ty: o.r[1], tw: o.r[2], th: o.r[3], s: o.s ?? 'A', win: o.win ?? [], rug: o.rug ? rect(o.rug) : null }));
  const darks = (cfg.dark ?? []).map(rect);
  const roofs = (cfg.roofs ?? []).map(rect);
  // Beläge liegen auf Pflaster und Sand; Deko-Kacheln nehmen den Boden ihrer Nachbarn (wie world/Outdoor.js)
  const pave = new Uint8Array(w * h), soil = (c) => (c === ':' || c === '.' ? 1 : c === ',' || c === '~' || c === '#' || c === '_' ? -1 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s0 = soil(rows[y][x]);
    if (s0) { pave[y * w + x] = s0 > 0 ? 1 : 0; continue; }
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) n += soil(rows[y + dy][x + dx]);
    pave[y * w + x] = n >= 0 ? 1 : 0;
  }
  R = { w, h, rows, wall, top, bot, water, need, pave, stairs, floors, rooms, darks, roofs, quays: !!cfg.quays, stone: cfg.stone === 'rubble' ? ST_RUB : ST_KALK };
  PREP.set(map, R);
  return R;
}

const isWall = (R, x, y) => x >= 0 && y >= 0 && x < R.w && y < R.h && R.wall[y * R.w + x] === 1;
// gehört die Nachbarspalte zur selben Wandfläche (Wand mit gleichem Fuß)?
const sameFace = (R, x, y, foot) => isWall(R, x, y) && (R.bot[y * R.w + x] + 1) * 16 === foot;
const cl = (v) => (v < 0 ? 0 : v > 8 ? 8 : v);

// Quadermauerwerk: Steinlage c (von unten), Zeile ly in der Lage (0 = Fuge), Blöcke 6–20 px; liefert Stufe in ST
function ashlar(px, t, base, ch, seed) {
  const c = Math.floor(t / ch), ly = t - c * ch;
  const u = px + ((c * 7 + base) % 10), b = Math.floor(u / 10), lb = u - b * 10;
  const merge = hash2(b, c + base, seed) < 0.32;
  if (ly === 0) return 2;
  if (lb === 0 && !merge) return 2;
  const hb = hash2(merge ? b - 1 : b, c + base, seed + 1);
  let s = hb < 0.16 ? 4 : hb > 0.86 ? 6 : 5;
  if (ly === ch - 1) s++;
  else if (ly === 1) s--;
  if (lb === 1 && !merge) s++;
  if (hash2(px, t + base * 31, seed + 2) < 0.05) s--;
  return s;
}

// Efeu: Vorhänge aus Blättern hängen von der Mauerkrone (d = Pixel unter der Oberkante); -1 = kein Efeu
function ivyAt(px, d, foot, len) {
  const cell = Math.floor(px / 23), hc = hash2(cell, foot, 611);
  if (hc > 0.34) return -1;
  const cx = cell * 23 + 4 + Math.floor(hash2(cell, foot, 613) * 14), half = 2 + Math.floor(hash2(cell, foot, 615) * 3);
  const dx = px - cx;
  if (Math.abs(dx) > half) return -1;
  const L = Math.min(len, 6 + Math.floor(hash2(cell, foot, 612) * len));
  const Lc = L * (1 - (Math.abs(dx) / (half + 1)) ** 2 * 0.7) + (hash2(px, foot, 616) - 0.5) * 6;
  if (d >= Lc) return -1;
  const n = hash2(px, d + foot * 7, 614);
  if (n > 0.86 - (d / L) * 0.3) return -1;
  // Blätter: oben links heller, unten und rechts dunkler
  const v = (n < 0.25 ? 3 : n < 0.6 ? 2 : 1) + (dx < 0 && n < 0.4 ? 1 : 0) - (d > Lc - 2 ? 1 : 0);
  return Math.max(0, Math.min(4, v));
}

// Wappenschild (violett, Goldstern) oder Kellergitter in der Quaderfläche, selten; Rückgabe Farbe oder -1
function emblem(px, t, foot, mid) {
  const cell = Math.floor(px / 97), hc = hash2(cell, foot, 621);
  if (hc > 0.24) return -1;
  const cx = cell * 97 + 20 + Math.floor(hash2(cell, foot, 622) * 56), dx = px - cx, dy = t - mid;
  if (hc < 0.1 && mid > 14) {
    // Kellergitter: Rundbogen 9×11 über dem Sockel
    const gy = t - 6;
    if (Math.abs(dx) > 5 || gy < 0 || gy > 11) return -1;
    const ax = Math.abs(dx), arch = gy > 7 ? Math.hypot(dx, gy - 7) : ax;
    if (arch > 5.4) return -1;
    if (arch > 4.2) return gy > 7 ? ST[6] : dx < 0 ? ST[6] : ST[3];
    return ax % 2 === 0 && gy > 0 ? ST[3] : gy === 0 ? ST[4] : ST[0];
  }
  if (Math.abs(dx) > 4 || dy > 4 || dy < -5) return -1;
  const w = dy > 0 ? 4 - Math.floor((dy + 1) / 2) : 4;
  if (Math.abs(dx) > w) return -1;
  if (Math.abs(dx) === w || dy === -5) return dx < 0 || dy === -5 ? GOLD[3] : GOLD[1];
  const ax = Math.abs(dx), ay = Math.abs(dy + 1);
  if ((ax === 0 && ay <= 2) || (ay === 0 && ax <= 2) || (ax === 1 && ay === 1)) return ax + ay === 0 ? GOLD[3] : GOLD[2];
  return dx < 0 ? STAR[1] : STAR[0];
}

// Zinnenbrüstung: m = Zeile über der Brüstungsbasis (0 = Fenster-Sohlbank), Rückgabe Farbe
function merlon(px, m, H, foot, endL, endR, pier) {
  const mx = ((px % 10) + 10) % 10, gap = mx >= 6 && !endL && !endR && !pier;
  if (gap) return m === 0 ? ST[7] : m === 1 ? ST[0] : ST[1];
  if (m === H - 1) return ST[8];
  const slit = hash2(Math.floor(px / 10), foot, 631) < 0.22 && mx === 3 && m >= 1 && m <= H - 3 && !pier;
  if (slit) return ST[0];
  if (mx === 0 || endL) return ST[6];
  if (mx === 5 || endR) return ST[3];
  return ST[5];
}

// Aufbau einer Wandfläche nach Höhe (von unten): Sockel, Quaderlagen, Gesims, Brüstung, Zinnen
const LAYOUT = {
  48: { plinth: 5, body: 35, ch: 5, cornice: 38, base: 41 },
  32: { plinth: 4, body: 20, ch: 4, cornice: 23, base: 25 },
};

function faceColor(R, px, py, tx, ty, t, fh, foot) {
  const lx = px & 15;
  const lf = sameFace(R, tx - 1, ty, foot), rf = sameFace(R, tx + 1, ty, foot);
  const endL = !lf && lx < 2, endR = !rf && lx > 13;
  let c;
  const L = LAYOUT[fh];
  if (L) {
    // Strebepfeiler alle ~80 px (nur mitten in einer Wand)
    const bc = Math.floor((px - 36) / 80), bx = bc * 80 + 36 + 34, bl = px - bx;
    const pierOk = hash2(bc, foot, 607) < 0.75 && sameFace(R, (bx - 18) >> 4, ty, foot) && sameFace(R, (bx + 28) >> 4, ty, foot);
    const pier = pierOk && bl >= 0 && bl < 12, pierSh = pierOk && bl >= 12 && bl < 16;
    if (t <= 1) c = ST[t === 0 ? 0 : 2];
    else if (t <= L.plinth) c = ST[t === L.plinth ? 7 : t === 2 ? 3 : ((px + (t & 1) * 8) % 16 === 0 ? 3 : 5)];
    else if (t <= L.body) {
      const e = pier ? -1 : emblem(px, t, foot, Math.round((L.plinth + L.body) / 2));
      if (e >= 0 && !endL && !endR) c = e;
      else {
        let s = ashlar(px + (pier ? 3 : 0), t - L.plinth - 1, pier ? 5 : 3, L.ch, pier ? 691 : 601) - 1;
        if (pier) s = bl === 0 ? 8 : bl === 1 ? 7 : bl >= 10 ? (bl === 11 ? 2 : 3) : s + 2;
        if (pierSh) s -= bl < 14 ? 3 : 2;
        if (t < L.plinth + 5 && hash2(px, py, 602) < (L.plinth + 5 - t) / 10) s--;
        // Wasserspur unter dem Speier
        const sp = Math.floor(px / 37), spx = sp * 37 + 18;
        if (!pier && hash2(sp, foot, 603) < 0.35 && px >= spx && px <= spx + 1 && t > L.body - 12) s = Math.min(s, 3);
        c = ST[cl(s)];
      }
      if (t <= L.plinth + 3 && hash2(px >> 1, foot + t, 604) < 0.2) c = MOSS[1 + (hash2(px, t, 605) * 3 | 0)];
    } else if (t <= L.cornice - 2) c = ST[pier ? 4 : 2];
    else if (t === L.cornice - 1) c = ST[pier ? 7 : 6];
    else if (t === L.cornice) c = ST[8];
    else if (t <= L.base) c = pier ? ST[bl <= 1 ? 8 : bl >= 10 ? 3 : 6] : ST[t === L.cornice + 1 ? 3 : 5];
    else c = pier && t === fh - 1 ? ST[8] : merlon(px, t - L.base - 1, fh - L.base - 1, foot, endL || (pier && bl <= 1), endR || (pier && bl >= 10), pier);
    // Wasserspeier unter dem Gesims
    { const sp = Math.floor(px / 37), spx = sp * 37 + 18; if (!pier && hash2(sp, foot, 603) < 0.35 && (t === L.cornice - 1 || t === L.cornice - 2) && px >= spx && px <= spx + 1) c = t === L.cornice - 1 ? ST[4] : ST[0]; }
    const iv = pier ? -1 : ivyAt(px, fh - 1 - t, foot, fh - 10);
    if (iv >= 0) c = IVY[iv];
  } else {
    if (t === 0) c = ST[0];
    else if (t <= 8) { const s = ashlar(px, t - 1, 7, 4, 641) - 1; c = ST[cl(s)]; }
    else if (t === 9) c = ST[7];
    else c = merlon(px, t - 10, 6, foot, endL, endR, false);
    const iv = ivyAt(px, 15 - t, foot + 7, 10);
    if (iv >= 0) c = IVY[iv];
  }
  if (endL && t < fh - 6) c = lx === 0 ? ST[7] : ST[5];
  if (endR && t < fh - 6) c = lx === 15 ? ST[0] : ST[2];
  return c;
}

// Mauerkrone von oben (Kacheln eines langen Laufs über der Wandfläche): Plattenweg, Zinnen an freien Rändern
function capColor(R, px, py, tx, ty, ya) {
  const lx = px & 15, ly = py - ya * 16;
  const lt = !isWall(R, tx - 1, ty), rt = !isWall(R, tx + 1, ty);
  if (ly <= 1 && !isWall(R, tx, ya - 1)) return ly === 0 ? ST[8] : ST[6];
  const seg = ((py % 10) + 10) % 10 < 6;
  if (lt && lx < 4) return lx === 0 ? ST[6] : lx === 3 ? ST[3] : seg ? ST[8] : ST[5];
  if (rt && lx > 11) return lx === 15 ? ST[1] : lx === 12 ? ST[4] : seg ? ST[7] : ST[4];
  // Platten 8×6, versetzt
  const r = Math.floor(py / 6), u = px + (r & 1) * 4, b = Math.floor(u / 8), lu = u - b * 8, lv = py - r * 6;
  if (lu === 0 || lv === 0) return ST[3];
  const hb = hash2(b, r, 651);
  let s = hb < 0.2 ? 4 : hb > 0.85 ? 6 : 5;
  if (lv === 1 || lu === 1) s++;
  if (lt && lx === 4) s -= 2;
  return ST[cl(s)];
}

function stairColor(S, px, py) {
  const lx = px - S.x0, W = S.x1 - S.x0, s = S.y1 - 1 - py;
  if (lx < 4 || lx >= W - 4) {
    const post = s % 16;
    if (post <= 2 && s > 2) return post === 0 ? ST[3] : ST[8];
    if (s <= 2) return s === 0 ? ST[1] : ST[4];
    if (lx < 4) return lx === 0 ? ST[6] : lx === 3 ? ST[3] : ST[7];
    const k = lx - (W - 4);
    return k === 0 ? ST[6] : k === 3 ? ST[1] : ST[5];
  }
  const st = Math.floor(s / 5), k = s - st * 5;
  if (k <= 1) return ST[k === 0 ? 2 : 4];
  if (k === 2) return ST[7];
  const u = lx + st * 5, j = u % 14;
  if (j === 0) return ST[4];
  let v = 6;
  if (lx === 4 || lx === 5) v--;
  if (hash2(px, py, 661) < 0.06) v--;
  return ST[v];
}

// ------------------------------------------------------------ Innenräume
const inR = (A, px, py) => px >= A.x0 && px < A.x1 && py >= A.y0 && py < A.y1;
function roomColor(O, px, py, tx, ty) {
  const s = O.s, lx = px - O.x0, x1 = O.x1 - 1, fy = O.y0 + 48;    // fy = Fuß der Rückwand
  const side = tx === O.tx || tx === O.tx + O.tw - 1, front = ty === O.ty + O.th - 1;
  if (py < fy && !side) return backWall(O, px, py, fy - 1 - py, lx);
  if ((side || front) && O.rows[ty][tx] === '#') {
    // Mauerkrone von oben: außen dunkel, innen helle Kante
    const ex = tx === O.tx ? 15 - (px & 15) : tx === O.tx + O.tw - 1 ? px & 15 : 99, ey = front ? 15 - (py & 15) : 99;
    const e = Math.min(ex, ey);
    const P = s === 'B' ? RUB : s === 'C' ? BRK : OAK;
    const inner = front ? (py & 15) : (tx === O.tx ? px & 15 : 15 - (px & 15));
    if (inner > 12 && !(front && side)) return P[inner > 14 ? 6 : 5];
    if (e < 2) return P[1];
    if (s === 'C') return ((py >> 2) + ((px >> 3) & 1)) & 1 ? P[3] : P[4];
    if (s === 'B') return hash2(px >> 2, py >> 2, 931) < 0.5 ? P[3] : P[4];
    return (px + py) % 7 === 0 ? P[2] : P[3];
  }
  // Boden (Lichtschein der Fenster als hellere Stufe, siehe floorLit)
  const c0 = roomFloor(O, s, px, py, fy);
  return O.win.some((wx) => { const d = py - fy, cx = wx * 16 + 8 + d * 0.35; return d < 40 && Math.abs(px - cx) < 7 - d * 0.06; }) ? lift(c0) : c0;
}
function lift(c) {
  const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  return (Math.min(255, r * 1.18 + 10) << 16) | (Math.min(255, g * 1.18 + 10) << 8) | Math.min(255, b * 1.2 + 14);
}
function roomFloor(O, s, px, py, fy) {
  if (O.rug && inR(O.rug, px, py)) return rugColor(O.rug, px, py);
  if (s === 'A') {                                                  // Dielen
    const r = Math.floor((py - fy) / 5), lv = (py - fy) - r * 5, u = px + hash2(r, 0, 941) * 40 | 0, b = Math.floor(u / 34), lu = u - b * 34;
    if (lv === 0 || lu === 0) return OAK[1];
    let i = hash2(b, r, 942) < 0.3 ? 3 : hash2(b, r, 943) > 0.75 ? 5 : 4;
    if (lv === 1) i++;
    if (hash2(px >> 1, py, 944) < 0.05) i--;
    if ((lu === 3 || lu === 30) && lv === 2) i = 1;                // Nägel
    return OAK[i];
  }
  if (s === 'B') {                                                  // Steinplatten, unregelmäßig
    const PW = 18, PH = 12, r = Math.floor((py - fy) / PH), u = px + ((r * 7) % PW), b = Math.floor(u / PW), lu = u - b * PW, lv = (py - fy) - r * PH;
    if (lu === 0 || lv === 0) return RUB[1];
    let i = hash2(b, r, 951) < 0.3 ? 3 : hash2(b, r, 952) > 0.75 ? 5 : 4;
    if (lv === 1 || lu === 1) i++;
    if (lv === PH - 1) i--;
    if (hash2(px, py, 953) < 0.04) i--;
    return RUB[i];
  }
  const bx = px >> 3, by = (py - fy) >> 3, ux = px & 7, uy = (py - fy) & 7;      // Tonfliesen
  if (ux === 0 || uy === 0) return LIME[2];
  let i = ((bx + by) & 1) ? 4 : 3;
  if (hash2(bx, by, 961) < 0.2) i--;
  if (ux === 1 || uy === 1) i++;
  if (ux === 7 || uy === 7) i--;
  return TERRA[i];
}
function rugColor(A, px, py) {
  const lx = px - A.x0, ly = py - A.y0, w = A.x1 - A.x0, h = A.y1 - A.y0, e = Math.min(lx, ly, w - 1 - lx, h - 1 - ly);
  if (e === 0) return WOOL[0];
  if (e < 3) return (((lx + ly) >> 1) & 1) ? WOOL[6] : WOOL[1];
  if (e < 5) return WOOL[3];
  const cx = w / 2, cy = h / 2, d = Math.abs(lx - cx) / (w / 2 - 5) + Math.abs(ly - cy) / (h / 2 - 5);
  if (d < 0.35) return WOOL[7];
  if (d < 0.5) return WOOL[6];
  if (Math.abs(d - 0.75) < 0.08) return WOOL[5];
  return ((lx >> 2) + (ly >> 2)) & 1 ? WOOL[2] : WOOL[3];
}
// Rückwand von vorn, t = Höhe über dem Boden (0..47)
function backWall(O, px, py, t, lx) {
  const s = O.s;
  // Fenster
  for (const wx of O.win) {
    const cx = wx * 16 + 8, dx = px - cx;
    if (Math.abs(dx) <= 7 && t >= 17 && t <= 37) {
      if (Math.abs(dx) >= 6 || t === 17 || t === 37) return s === 'A' ? OAK[2] : s === 'B' ? RUB[2] : LIME[2];
      if (t === 18) return s === 'A' ? OAK[5] : LIME[5];
      if (s === 'B' && t > 32 && Math.abs(dx) > 5 - (37 - t)) return RUB[3];
      if (dx === 0 || t === 27) return OAK[1];                     // Sprossen
      if (s !== 'A' && ((dx + t) & 3) === 0 && t > 18) return OAK[2];
      return t > 31 ? SKY[3] : t > 24 ? SKY[2] : SKY[1];
    }
  }
  if (t < 2) return s === 'C' ? LIME[1] : OAK[2];                  // Fußleiste
  if (t >= 43) return t >= 46 ? OAK[1] : t >= 44 ? OAK[3] : OAK[4]; // Deckenbalken
  if (t >= 40 && (lx % 32) < 6) return OAK[2];                       // Balkenköpfe
  if (s === 'A') {
    if (t < 14) {                                                   // Täfelung
      const b = lx % 12;
      if (t === 13) return OAK[6];
      if (b === 0) return OAK[2];
      return b === 1 ? OAK[5] : t < 3 ? OAK[3] : OAK[4];
    }
    const post = lx % 48;
    if (post < 4) return post === 0 ? OAK[5] : post === 3 ? OAK[2] : OAK[3];
    if (t > 37 && t < 40) return OAK[3];
    const n = hash2(px >> 1, py >> 1, 971);
    let i = 5;
    if (t > 34) i = 4;
    if (n < 0.06) i--;
    return DAUB[i];
  }
  if (s === 'B') {
    // Wandteppich in der Mitte
    const mid = (O.x1 - O.x0) / 2, dx = lx - mid;
    if (Math.abs(dx) < 15 && t > 10 && t < 40) {
      if (t > 38) return OAK[3];
      if (Math.abs(dx) > 13) return WOOL[6];
      if (t < 13 && ((lx >> 1) & 1)) return WOOL[6];
      if (Math.abs(dx) + Math.abs(t - 25) < 6) return WOOL[7];
      return (Math.abs(dx) + Math.abs(t - 25)) % 6 < 1 ? WOOL[6] : WOOL[4];
    }
    const r = Math.floor(t / 7), u = lx + ((r * 11) % 17), b = Math.floor(u / (12 + (r % 3) * 3)), lu = u % (12 + (r % 3) * 3), lv = t - r * 7;
    if (lv === 0 || lu === 0) return RUB[1];
    let i = hash2(b, r, 981) < 0.3 ? 3 : hash2(b, r, 982) > 0.75 ? 5 : 4;
    if (lv === 6 || lu === 1) i++;
    if (lv === 1) i--;
    return RUB[i];
  }
  // C: Backstein unten, Kalkputz oben mit gemaltem Fries
  if (t < 16) {
    const r = t >> 2, u = lx + (r & 1) * 4, lu = u & 7, lv = t & 3;
    if (t === 15) return LIME[4];
    if (lu === 0 || lv === 0) return LIME[2];
    return hash2(u >> 3, r, 991) < 0.3 ? BRK[3] : BRK[4];
  }
  if (t > 35 && t < 39) return ((lx >> 2) & 1) ? BRK[4] : LIME[5];
  return hash2(px >> 1, py >> 1, 992) < 0.05 ? LIME[4] : LIME[5];
}

// Dachlandschaft der verdeckten Hinterhäuser: Bänder aus Dachflächen (First oben, Traufe unten), Abschnitte
// verschiedener Deckung, gelegentlich Schornsteine. Bänder 40 px hoch, je Band versetzt.
function roofscape(A, px, py) {
  const BH = 48, band = Math.floor((py - A.y0 + 20) / BH), v = (py - A.y0 + 20) - band * BH;
  let u = px + band * 37, seg = 0, sw = 0;
  for (let k = 0; ; k++) { sw = 48 + Math.floor(hash2(band, k, 1101) * 5) * 16; if (u < sw) { seg = k; break; } u -= sw; }
  const t = hash2(band, seg, 1102), P = t < 0.55 ? RSH : t < 0.85 ? RCL : RSL;
  const lift = Math.floor(hash2(band, seg, 1103) * 4) * 2, vv = v - lift;
  if (vv < 0) return RSH[0];
  if (vv < 2) return P[vv < 1 ? 6 : 5];                         // First
  if (vv > 37) {                                                 // Rückwand im Schatten, ab und zu ein Licht
    const wx = (u + 7) % 22;
    if (vv > 40 && vv < 46 && wx < 4 && hash2(Math.floor((u + 7) / 22), band * 31 + seg, 1108) < 0.3) return vv < 41.5 ? RDB[1] : LAMPW[(vv & 1) + 1];
    return vv > 46 ? RSH[0] : RDB[vv > 43 ? 0 : 1];
  }
  if (vv > 34) return vv > 36 ? RSH[0] : P[1];                   // Traufe
  if (u < 1 || u > sw - 1.5) return P[0];                        // Brandmauer-Fuge
  if (hash2(band, seg, 1104) < 0.4) { const cx = 12 + Math.floor(hash2(band, seg, 1105) * (sw - 30)); if (u >= cx && u < cx + 8 && vv < 16) return vv < 2 ? RDB[4] : u < cx + 2 ? RDB[3] : u > cx + 6 ? RDB[0] : RDB[2]; }
  const r = Math.floor(vv / 3), lv = vv - r * 3, uu = u + (r & 1) * 2, b = Math.floor(uu / 4);
  if (lv === 0) return P[1];
  let i = hash2(b, r + band * 50, 1106) < 0.25 ? 2 : 3;
  if (vv < 12) i++;
  if (vv > 26) i--;
  if (P === RSH && hash2(Math.floor(u / 10), r, 1107) < 0.06) return MOSS[1];
  return P[i];
}

// Kopfsteinpflaster: Voronoi-Steine mit Licht oben links, Fugen aus Erde und Moos
function cobble(px, py) {
  const CW = 7, CH = 6, gx = Math.floor(px / CW), gy = Math.floor(py / CH);
  let d1 = 1e9, d2 = 1e9, best = 0, bcx = 0, bcy = 0;
  for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = (gx + k) * CW + 1 + hash2(gx + k, gy + j, 1011) * (CW - 2), cy = (gy + j) * CH + 1 + hash2(gx + k, gy + j, 1012) * (CH - 2);
    const d = (px - cx) ** 2 + ((py - cy) * 1.15) ** 2;
    if (d < d1) { d2 = d1; d1 = d; best = (gx + k) * 977 + gy + j; bcx = cx; bcy = cy; } else if (d < d2) d2 = d;
  }
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  if (edge < 1.1) return hash2(px, py, 1013) < 0.08 ? MOSS[1] : EARTH[edge < 0.5 ? 0 : 1];
  const tone = hash2(best, 7, 1014);
  let i = tone < 0.3 ? 3 : tone > 0.9 ? 5 : 4;
  const lx = px - bcx, ly = py - bcy;
  if (lx + ly < -2.5 && edge > 1.6) i++;
  else if (lx + ly > 2.5) i--;
  if (edge < 1.7) i--;
  return COB[Math.max(1, Math.min(6, i))];
}

// Weicher Wertrausch (bilinear zwischen Gitterpunkten im Abstand sc), 0…1
function vnoise(x, y, sc, seed) {
  const gx = x / sc, gy = y / sc, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
// Gras mit Halmen (Licht oben links), fein gesprenkelt
function grassAt(px, py) {
  const h = hash2(px, py, 1101), b = vnoise(px, py, 10, 1102) + (((px + py) & 1) ? 0.05 : -0.05);
  let i = b < 0.3 ? 3 : b > 0.8 ? 5 : 4;
  if (h < 0.12) i += 1; else if (h > 0.9) i -= 1;
  if (hash2(px, py >> 1, 1103) < 0.05) i = 6;
  return GRS[Math.max(1, Math.min(6, i))];
}
// Festgetretene Erde mit Kieseln und Spurrillen
function dirtAt(px, py, ruts) {
  const h = hash2(px >> 1, py >> 1, 1111), n = vnoise(px, py, 14, 1112) + (((px + py) & 1) ? 0.04 : -0.04);
  let i = n < 0.35 ? 3 : n > 0.68 ? 5 : 4;
  if (ruts && ruts(px, py)) i -= 1;
  if (h < 0.06) return GRAV[hash2(px, py, 1113) < 0.5 ? 5 : 3];
  if (h > 0.96) i -= 1;
  return DIRT[Math.max(1, Math.min(6, i))];
}
// Kies: kleine Steinchen in drei Tönen
function gravelAt(px, py) {
  const h = hash2(px, py, 1121), q = hash2(px >> 1, py >> 1, 1122);
  let i = q < 0.25 ? 3 : q > 0.8 ? 5 : 4;
  if (h < 0.15) i -= 1; else if (h > 0.88) i += 1;
  return GRAV[Math.max(1, Math.min(6, i))];
}
// Weg in einer Gasse (Rechteck F): Mitte k ('earth' | 'gravel' | 'worn'), zum Rand hin Gras (unregelmäßig, dezent).
// Die Wegmitte schlängelt sich leicht; Breite F.pw Kacheln (Standard: Gassenbreite − 1).
function laneColor(F, px, py) {
  const hor = F.x1 - F.x0 >= F.y1 - F.y0, u = hor ? px : py, v = hor ? py : px, a = hor ? F.y0 : F.x0, b = hor ? F.y1 : F.x1;
  const mid = (a + b) / 2 + Math.sin(u * 0.035 + a) * 3 + Math.sin(u * 0.11) * 1.2;
  const half = ((F.pw ?? (b - a) / 16 - 1) * 16) / 2;
  const edge = half + (hash2(u >> 2, a, 1131) - 0.5) * 5 + Math.sin(u * 0.2) * 1.5, d = Math.abs(v - mid);
  if (d > edge + 2) return grassAt(px, py);
  if (d > edge) return hash2(px, py, 1132) < (d - edge) / 2 ? grassAt(px, py) : (F.k === 'gravel' ? gravelAt(px, py) : dirtAt(px, py));
  if (F.k === 'gravel') return gravelAt(px, py);
  if (F.k === 'worn') {
    // altes Pflaster, in der Mitte ausgetreten zu Erde, Gras in den Fugen
    const c = cobble(px, py);
    const wn = vnoise(px, py, 18, 1133) + (((px + py) & 1) ? 0.03 : -0.03) - (d / half) * 0.35;
    if (wn > 0.42) return dirtAt(px, py);
    return c === EARTH[0] || c === EARTH[1] ? (hash2(px, py, 1134) < 0.5 ? GRS[3] : c) : c;
  }
  const rut = (x, y) => { const w = hor ? y : x; return Math.abs(Math.abs(w - mid) - half * 0.5) < 1.2; };
  return dirtAt(px, py, rut);
}

function floorColor(F, px, py) {
  if (F.k === 'cobble') return cobble(px, py);
  if (F.k === 'earth' || F.k === 'gravel' || F.k === 'worn') return laneColor(F, px, py);
  if (F.k === 'herring') {
    // Korbgeflecht aus Ziegeln (8×8: zwei liegende bzw. zwei stehende Ziegel im Wechsel)
    const bx = px >> 3, by = py >> 3, ux = px & 7, uy = py & 7, hor = ((bx + by) & 1) === 0;
    const a = hor ? uy & 3 : ux & 3, b = hor ? ux : uy;
    if (a === 0) return BRICK[1];
    const id = hor ? (uy >> 2) : (ux >> 2), hb = hash2(bx * 2 + id, by, 671);
    let s = hb < 0.25 ? 3 : hb > 0.8 ? 5 : 4;
    if (a === 1 || b === 0) s++;
    if (b === 7) s--;
    return BRICK[s];
  }
  if (F.k === 'rose') {
    const cx = (F.x0 + F.x1) / 2 - 0.5, cy = (F.y0 + F.y1) / 2 - 0.5, R = Math.min(F.x1 - F.x0, F.y1 - F.y0) / 2 - 2;
    const dx = px - cx, dy = py - cy, r = Math.hypot(dx, dy);
    if (r < R) {
      if (r > R - 2) return r > R - 1 ? ST[3] : GOLD[2];
      if (r > R - 5) return ((Math.floor(Math.atan2(dy, dx) / (Math.PI / 16)) & 1) ? ST[7] : ST[6]);
      if (r > R - 6) return GOLD[1];
      const a = Math.atan2(dy, dx), ray = Math.abs(Math.sin(a * 4)) * r;
      if (r < 4) return r < 2 ? GOLD[3] : GOLD[2];
      if (ray < 1.6) return GOLD[2];
      if (Math.abs(Math.sin(a * 4 + Math.PI / 4)) * r < 1.2 && r < R * 0.6) return STAR[2];
      return (Math.floor(r / 3) & 1) ? STAR[1] : STAR[0];
    }
  }
  // Steinplatten (Hof, Platz) bzw. schmale Wehrgang-Platten
  const walk = F.k === 'walk', PW = walk ? 16 : 12, PH = walk ? 6 : 8;
  const r = Math.floor(py / PH), u = px + ((r * 5) % PW), b = Math.floor(u / PW), lu = u - b * PW, lv = py - r * PH;
  if (lu === 0 || lv === 0) return hash2(px, py, 681) < 0.1 ? MOSS[2] : (walk ? SAND : FLAG)[1];
  const P = walk ? SAND : FLAG, hb = hash2(b, r, 682 + (walk ? 1 : 0));
  let s = hb < 0.2 ? 2 : hb > 0.8 ? 4 : 3;
  if (lv === 1 || lu === 1) s++;
  if (lv === PH - 1) s--;
  if (hash2(px, py, 683) < 0.04) s--;
  return P[Math.max(0, Math.min(6, s))];
}

// Einfassung der Wasserbecken (auf den Wasserkacheln, das Ufer bleibt frei begehbar)
function quayColor(R, px, py, tx, ty) {
  const lx = px & 15, ly = py & 15, w = R.w;
  const land = (x, y) => x >= 0 && y >= 0 && x < w && y < R.h && !R.water[y * w + x] && R.rows[y][x] !== '_';
  if (land(tx, ty - 1) && ly < 6) return [ST[8], ST[6], ST[5], ST[4], ST[3], ST[1]][ly];
  if (land(tx, ty + 1) && ly > 12) return [ST[4], ST[6], ST[7]][ly - 13];
  if (land(tx - 1, ty) && lx < 3) return [ST[7], ST[5], ST[2]][lx];
  if (land(tx + 1, ty) && lx > 12) return [ST[2], ST[4], ST[5]][lx - 13];
  return -1;
}

// Schlagschatten auf begehbarem Boden: unter dem Wandfuß und rechts neben Mauern
function shadeAt(R, px, tx, ty, lx, ly) {
  let k = 0;
  if (ly < 6 && isWall(R, tx, ty - 1)) k = ly < 3 ? 0.5 : 0.28;
  else if (ly < 3 && lx < 4 && isWall(R, tx - 1, ty - 1)) k = 0.22;
  if (lx < 4 && isWall(R, tx - 1, ty)) k = Math.max(k, lx < 2 ? 0.38 : 0.2);
  return k;
}

function put(d, i, c) { d[i] = c >> 16; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; }
function dark(d, i, k) { d[i] *= 1 - k; d[i + 1] *= 1 - k; d[i + 2] *= 1 - k * 0.8; }

export function* paintRamparts(ctx, x0, y0, cw, ch, map) {
  const R = prep(map), w = R.w, h = R.h;
  let any = false;
  for (let ty = Math.max(0, y0 >> 4); ty <= Math.min(h - 1, (y0 + ch - 1) >> 4) && !any; ty++) for (let tx = Math.max(0, x0 >> 4); tx <= Math.min(w - 1, (x0 + cw - 1) >> 4); tx++) if (R.need[ty * w + tx]) { any = true; break; }
  if (!any) return;
  const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
  for (let ly = 0; ly < ch; ly++) {
    const py = y0 + ly, ty = py >> 4;
    ST = R.stone;                                     // je Zeile neu (Chunks verschiedener Karten wechseln sich ab)
    if (ty < 0 || ty >= h) continue;
    for (let lx = 0; lx < cw; lx++) {
      const px = x0 + lx, tx = px >> 4;
      if (tx < 0 || tx >= w) continue;
      const ti = ty * w + tx;
      if (!R.need[ti]) continue;
      const i = (ly * cw + lx) * 4;
      let room = null;
      for (const O of R.rooms) if (inR(O, px, py)) { room = O; break; }
      if (room) {
        const c = roomColor(room, px, py, tx, ty);
        if (c >= 0) put(d, i, c);
        if (!R.wall[ti]) { const k = shadeAt(R, px, tx, ty, px & 15, py & 15); if (k > 0) dark(d, i, k); }
        continue;
      }
      if (R.darks.some((A) => inR(A, px, py))) { put(d, i, VOID); continue; }
      if (R.wall[ti]) { const A = R.roofs.find((Q) => inR(Q, px, py)); if (A) { put(d, i, roofscape(A, px, py)); continue; } }
      if (R.wall[ti]) {
        const ya = R.top[ti], yb = R.bot[ti], run = yb - ya + 1, foot = (yb + 1) * 16, t = foot - 1 - py, fh = run >= 3 ? 48 : run === 2 ? 32 : 16;
        put(d, i, t < fh ? faceColor(R, px, py, tx, ty, t, fh, foot) : capColor(R, px, py, tx, ty, ya));
        continue;
      }
      let c = -1;
      for (const S of R.stairs) if (px >= S.x0 && px < S.x1 && py >= S.y0 && py < S.y1) { c = stairColor(S, px, py); break; }
      if (c < 0 && R.water[ti]) { if (R.quays) c = quayColor(R, px, py, tx, ty); }
      else if (c < 0) {
        // spätere Beläge liegen oben (Rosette auf dem Platz)
        if (R.pave[ti]) for (let k = R.floors.length - 1; k >= 0; k--) { const F = R.floors[k]; if (px >= F.x0 && px < F.x1 && py >= F.y0 && py < F.y1) { c = floorColor(F, px, py); break; } }
      }
      if (c >= 0) put(d, i, c);
      const k = R.water[ti] ? 0 : shadeAt(R, px, tx, ty, px & 15, py & 15);
      if (k > 0) dark(d, i, k);
    }
    if ((ly & 31) === 31) yield;
  }
  ctx.putImageData(img, 0, 0);
}
