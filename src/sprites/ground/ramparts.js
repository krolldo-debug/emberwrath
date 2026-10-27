import { hash2 } from '../../core/math.js';

// Mauern, Terrassen und Treppen der Sternenstadt (level.paintedCliffs im Biom astral; world/Outdoor.js ruft
// pal.paintCliffs je Chunk, in Weltpixeln). '#'-Kacheln sind Mauerkörper (fest). Je Spalte bildet ein senkrechter
// '#'-Lauf eine nach Süden blickende Mauer: ab zwei Kacheln Stützmauer (32 px: Sockel, Quader, Gesims,
// Zinnenbrüstung), eine Kachel allein = Brüstung (16 px); die Kacheln eines längeren Laufs über der Wand sind die
// Mauerkrone von oben (Nord-Süd-Mauern, Zinnen an den freien Rändern). Alles Gemalte liegt in den festen Kacheln:
// Figuren davor verdecken die Wand, Figuren dahinter stehen ganz darüber – keine Sortierfehler.
// level.ramparts (Kacheln): stairs [[x, y, w, h]] begehbare Treppen nach Norden hinauf,
//   floors [{ r: [x, y, w, h], k: 'flag' | 'walk' | 'herring' | 'rose' }] Beläge auf Pflaster/Sand (Gras bleibt),
//   quays: true = Steineinfassung an Wasserbecken ('~').
// Licht von oben links: Wandflächen im Halbschatten, Kronen und Gesimse hell, Schlagschatten unter und rechts
// der Mauern (nur abdunkeln, damit die Ebene im Feinraster affin bleibt). Deterministisch aus Weltkoordinaten.

const rgb = (h) => (parseInt(h.slice(1), 16));
// Sternkalk: heller, warmer Kalkstein im Morgenlicht (hebt sich vom kühlen Pflaster ab): 0 dunkel … 8 hell
const ST = ['#221a28', '#33283a', '#4a3a4e', '#625064', '#7e687a', '#9c8692', '#baa4aa', '#d6c2c2', '#f0e2da'].map(rgb);
const MOSS = ['#22362e', '#34503c', '#4c6c4a', '#6e8e5a'].map(rgb);
const IVY = ['#1c3026', '#2c4a32', '#44683e', '#668e4c', '#8eb262'].map(rgb);
const GOLD = ['#5a3a14', '#9a6a24', '#d8a440', '#f6d888'].map(rgb);
const FLAG = ['#2a2638', '#3c3650', '#4e4864', '#605a78', '#746e8c', '#8a84a2', '#a29cb8'].map(rgb);
const BRICK = ['#2a2028', '#3e2e38', '#523c46', '#644a52', '#765a60', '#886a6e', '#9c7e7e'].map(rgb);
const SAND = ['#2a2430', '#3c3440', '#504650', '#645862', '#786a72', '#8e7e84', '#a49498'].map(rgb);
const STAR = ['#3c2868', '#6c52a8', '#b49ae0'].map(rgb);

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
  const floors = (cfg.floors ?? []).map((f) => ({ ...rect(f.r), k: f.k }));
  // Beläge liegen auf Pflaster und Sand; Deko-Kacheln nehmen den Boden ihrer Nachbarn (wie world/Outdoor.js)
  const pave = new Uint8Array(w * h), soil = (c) => (c === ':' || c === '.' ? 1 : c === ',' || c === '~' || c === '#' || c === '_' ? -1 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s0 = soil(rows[y][x]);
    if (s0) { pave[y * w + x] = s0 > 0 ? 1 : 0; continue; }
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) n += soil(rows[y + dy][x + dx]);
    pave[y * w + x] = n >= 0 ? 1 : 0;
  }
  R = { w, h, rows, wall, top, bot, water, need, pave, stairs, floors, quays: !!cfg.quays };
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

function floorColor(F, px, py) {
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
    if (ty < 0 || ty >= h) continue;
    for (let lx = 0; lx < cw; lx++) {
      const px = x0 + lx, tx = px >> 4;
      if (tx < 0 || tx >= w) continue;
      const ti = ty * w + tx;
      if (!R.need[ti]) continue;
      const i = (ly * cw + lx) * 4;
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
