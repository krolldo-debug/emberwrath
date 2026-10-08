import { createRng, hash2 } from '../../core/math.js';
import { MapBuilder } from '../levels.js';
import { rim, inRect, inEll } from '../levels2.js';
import { near, box, each, GROUND, blob, roadNet, foe, strew, circle } from '../mapkit.js';

// ---------------------------------------------------------------- Die Glutöde (36–40)
// 160 × 104 Kacheln, Asche-Ocker mit Lava als Akzent. Gliederung:
//  - Ankunft am Westrand (Frostzinnen) mitten in den Aschedünen; ein Pilgerpfad mit Steinmännern
//    windet sich am Ascheschlot (Krater, Obelisk 2) vorbei hinab zum alten Tempelbezirk.
//  - Letzte Bastion: Ruinenhof eines Felsentempels (Fassade im Basalt, Säulengang, alter Brunnen),
//    Breschen mit Barrikaden geschlossen, drei Tore (Dünen, Stadt, Obsidianfeld).
//  - Ruinenstadt Altglut: gewachsene Stadt entlang des Flammenwegs (Hauptachse vom Tempelbezirk
//    über Brunnenplatz, Glutbrücke und Scherbenmarkt zum Osttor und weiter zum Aschethron).
//    Krumme Gassen, Plätze verschiedener Größe (Säulenplatz, Brunnenplatz, Glutkai, Markt,
//    Tempelvorplatz), eingestürzte Viertel im Nordwesten und Südosten. Ein Lavastrom teilt die Stadt.
//  - Obsidianfeld (Südwest): natürlich gewachsene Nadeln, Lavaadern mit Krustenfurten, Herz mit Anker.
//  - Verbrannte Vorstadt mit Aschefriedhof (Süd), Geysirfeld am Glutsee (Südost),
//    Schlackenlager der Kultisten (Ost), Prozessionsweg, Kolossfeld und Throntor (Nordost).
// Bodenzeichen: ',' Aschesand, '.' Ocker/Brandboden, ':' Pflaster, '~' Lava, '#' Fels.

const W = 160, H = 104;

export function buildEmberWastes() {
  const m = new MapBuilder(W, H, ',');
  const rng = createRng(4040);
  rim(m, rng, W, H);
  const net = roadNet(m);
  const road = net.road;
  const put = (x, y, ch) => m.set(x, y, ch);
  const get = (x, y) => m.get(x, y);
  const pave = (pts, w) => { m.path(pts, w, ':', [',', '.', '~', 'z']); net.mask.path(pts, w + 1.2, 'R'); };
  const dirt = (pts, w) => road(pts, w, '.', [',']);
  const clear = [];           // Flächen ohne Streudeko
  const keep = (f) => clear.push(f);
  const chests = [];

  // Glattes Wertrauschen (0..1) für Gelände und Wegschwünge
  const vn = (x, y, s, seed) => {
    const fx = x / s, fy = y / s, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  // Polylinie schwingen lassen: Zwischenpunkte quer versetzt, Enden fest
  const wob = (pts, amp, seed, step = 4) => {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.round(L / step));
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      for (let s = 1; s <= n; s++) {
        const t = s / n, o = s < n ? (vn(i * 37 + s * 5, seed % 89, 2.2, seed) - 0.5) * 2 * amp * Math.sin(Math.PI * t) : 0;
        out.push([ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o]);
      }
    }
    return out;
  };

  // ------------------------------------------------------------ Gelände
  // Basalthochland im Norden hinter der Stadt (zerklüftete Kante), Felsmassiv am Throntor
  for (let x = 44; x < 122; x++) {
    const top = 7 + Math.round(hash2(x >> 2, 1, 4041) * 3 + Math.sin(x * 0.19) * 2 + (x > 112 ? (x - 112) * 0.6 : 0));
    for (let y = 0; y <= top; y++) put(x, y, '#');
  }
  m.rect(116, 0, 44, 4, '#');
  for (let y = 4; y < 14; y++) for (let x = 116; x < 160; x++) {
    const half = 7 + (y - 4) * 1.4 + hash2(x, y, 4042) * 1.5;
    if (Math.abs(x - 138) > half) put(x, y, '#');
  }
  for (let x = 134; x <= 142; x++) put(x, 4, ',');
  // Grat zwischen Tempelviertel und Kolossfeld (geschwungen)
  for (let y = 10; y < 43; y++) {
    const c = 119 + Math.round(Math.sin(y * 0.22) * 1.5), w = 2 + Math.round(vn(1, y, 3, 4043) * 3);
    for (let x = c - 1; x < c - 1 + w; x++) put(x, y, '#');
  }
  blob(m, rng, 128, 43, 7, 2.6, '#', null, 3);
  blob(m, rng, 151, 49, 8, 4, '#', null, 3);
  blob(m, rng, 157, 30, 3, 6, '#', null, 2);
  // Basaltkuppen in den Dünen
  blob(m, rng, 36, 8, 4, 2.4, '#', null, 2);
  blob(m, rng, 41, 21, 2.6, 2, '#', null, 1);
  blob(m, rng, 4, 34, 2.4, 3, '#', null, 1);
  blob(m, rng, 149, 39, 2.6, 1.6, '#', null, 1);

  // Ocker/Brandboden: Stadt, Lager, Gruben, Geysirfeld, Kolossfeld; Dünenflanken in Flecken
  blob(m, rng, 82, 46, 37, 31, '.', [','], 8);
  blob(m, rng, 138, 64, 18, 8, '.', [','], 5);
  blob(m, rng, 128, 86, 28, 13, '.', [','], 6);
  blob(m, rng, 138, 29, 17, 13, '.', [','], 5);
  blob(m, rng, 70, 88, 14, 7, '.', [','], 4);
  for (let y = 3; y < 64; y++) for (let x = 3; x < 46; x++) if (get(x, y) === ',' && vn(x, y, 6, 4060) > 0.68) put(x, y, '.');

  // ------------------------------------------------------------ Lava
  const river = [[84, 0], [83, 9], [80, 17], [83, 25], [81, 35], [83, 43], [82, 51], [84, 60], [82, 68], [86, 77], [96, 85], [110, 89], [122, 91]];
  m.path(wob(river.slice(0, 3), 1, 4061), 3.2, '~', [',', '.', '#']);
  m.path(wob(river.slice(2), 1.2, 4062), 3.6, '~', [',', '.']);
  // Nebenarm: vom Strom nach Südwesten bis ins Obsidianfeld
  const arm = wob([[82, 68], [72, 73], [62, 77], [54, 81], [47, 87], [43, 91]], 1.4, 4063);
  m.path(arm, 2.4, '~', [',', '.']);
  blob(m, rng, 133, 91, 15, 6.5, '~', [',', '.'], 5);
  m.ellipse(128, 62, 2.6, 1.4, '~'); m.ellipse(156, 57, 2, 1.2, '~'); m.ellipse(133, 72, 2.4, 1.2, '~');
  m.ellipse(112, 79, 2, 1, '~'); m.ellipse(152, 81, 2.4, 1.2, '~');
  const lavaAt = (x, y) => get(x, y) === '~';

  // Brücke über einen Nord-Süd-Strom: Pflaster, Brüstungen (m) und Pfeilerfront (e)
  const bridgeEW = (x0, x1, y0, y1) => {
    const wasLava = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0 - 1; y <= y1 + 2; y++) if (lavaAt(x, y)) wasLava.add(y * W + x);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) put(x, y, ':');
    for (let x = x0; x <= x1; x++) {
      if (wasLava.has((y0 - 1) * W + x)) put(x, y0 - 1, 'm');
      if (wasLava.has((y1 + 1) * W + x)) put(x, y1 + 1, 'm');
      if (wasLava.has((y1 + 2) * W + x)) put(x, y1 + 2, 'e');
    }
    net.mask.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, 'R');
  };
  // Brücke über einen Ost-West-Strom: seitliche Brüstungen (j)
  const bridgeNS = (x0, x1, y0, y1) => {
    const wasLava = new Set();
    for (let y = y0; y <= y1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (lavaAt(x, y)) wasLava.add(y * W + x);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ':');
    for (let y = y0; y <= y1; y++) {
      if (wasLava.has(y * W + x0 - 1)) put(x0 - 1, y, 'j');
      if (wasLava.has(y * W + x1 + 1)) put(x1 + 1, y, 'j');
    }
    net.mask.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, 'R');
  };
  // Furt aus erkalteter Kruste (z) – auch für Gänge, die Lavaadern kreuzen
  const ford = (pts, w, ch = '.', over = ['~']) => {
    const before = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lavaAt(x, y)) before.add(y * W + x);
    m.path(pts, w, ch, over);
    net.mask.path(pts, w + 1.2, 'R');
    for (const k of before) {
      const x = k % W, y = (k / W) | 0;
      if (get(x, y) === ch && hash2(x, y, 4044) < 0.55) put(x, y, 'z');
    }
  };

  // ------------------------------------------------------------ Bauten: Hilfen
  // Ruinenhaus: Nordmauer H (hoch), Südmauer i (niedrig), Seiten I, Ecken J; Tür, Breschen (r)
  const occ = new Uint8Array(W * H);
  const house = (x0, y0, w, h, { door = null, breaches = 2, yard = false } = {}) => {
    const x1 = x0 + w - 1, y1 = y0 + h - 1;
    m.rect(x0 + 1, y0 + 1, w - 2, h - 2, '.');
    for (let x = x0; x <= x1; x++) { put(x, y0, 'H'); put(x, y1, 'i'); }
    for (let y = y0 + 1; y < y1; y++) { put(x0, y, 'I'); put(x1, y, 'I'); }
    put(x0, y0, 'J'); put(x1, y0, 'J');
    const out = (side) => side === 'n' ? [[x0 + 1, y0 - 1], [x1 - 1, y0 - 1]] : side === 's' ? [[x0 + 1, y1 + 1], [x1 - 1, y1 + 1]] : side === 'w' ? [[x0 - 1, y0 + 1], [x0 - 1, y1 - 1]] : [[x1 + 1, y0 + 1], [x1 + 1, y1 - 1]];
    const sides = [];
    for (const s of ['s', 'n', 'w', 'e']) {
      const [[ax, ay], [bx, by]] = out(s);
      let pav = 0, free = 0;
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { if (get(x, y) === ':') pav++; if (GROUND.has(get(x, y))) free++; }
      sides.push({ s, pav, free });
    }
    sides.sort((a, b) => b.pav - a.pav || b.free - a.free);
    const ds = door ?? sides[0].s;
    const opening = (s, len, ch) => {
      if (s === 'n' || s === 's') {
        const y = s === 'n' ? y0 : y1, x = x0 + 1 + Math.floor((w - 2 - len) / 2 + (rng.next() - 0.5) * Math.max(0, w - 4 - len));
        for (let i = 0; i < len; i++) put(Math.min(x1 - 1, Math.max(x0 + 1, x + i)), y, ch);
      } else {
        const x = s === 'w' ? x0 : x1, y = y0 + 1 + Math.floor((h - 2 - len) / 2 + (rng.next() - 0.5) * Math.max(0, h - 4 - len));
        for (let i = 0; i < len; i++) put(x, Math.min(y1 - 1, Math.max(y0 + 1, y + i)), ch);
      }
    };
    opening(ds, 2, ':');
    // zweiter Ausgang, damit Häuser keine Sackgassen bilden
    const second = sides.find((s) => s.s !== ds && s.free >= 2);
    if (second) opening(second.s, 1, '.');
    for (let i = 0; i < breaches; i++) opening(rng.pick(['n', 's', 'w', 'e'].filter((s) => s !== ds)), rng.int(1, 2), 'r');
    if (yard && w >= 9 && h >= 7) {
      const vx = x0 + Math.floor(w / 2) + rng.int(-1, 1);
      for (let y = y0 + 1; y < y1; y++) put(vx, y, 'I');
      put(vx, y0 + 1 + rng.int(1, h - 4), '.'); put(vx, y1 - 1, '.');
      put(vx + 2 + rng.int(0, Math.max(0, x1 - vx - 4)), y0 + 2, 'd');
    }
    keep((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  };
  // Eingestürztes Haus: Eckpfeiler, Mauerstümpfe, Schutt
  const collapsed = (x0, y0, w, h) => {
    const x1 = x0 + w - 1, y1 = y0 + h - 1, sd = x0 * 7 + y0;
    m.rect(x0, y0, w, h, '.');
    put(x0, y0, 'J'); put(x1, y0, 'J');
    for (let x = x0 + 1; x < x1; x++) { const k = hash2(x, y0, 4045 + sd); if (k < 0.5) put(x, y0, 'H'); else if (k < 0.72) put(x, y0, 'r'); }
    for (let y = y0 + 1; y < y1; y++) {
      if (hash2(x0, y, 4047 + sd) < 0.45) put(x0, y, 'I');
      if (hash2(x1, y, 4048 + sd) < 0.3) put(x1, y, 'I'); else if (hash2(x1, y, 4049 + sd) < 0.2) put(x1, y, 'r');
    }
    for (let x = x0 + 1; x < x1; x++) { const k = hash2(x, y1, 4050 + sd); if (k < 0.3) put(x, y1, 'i'); else if (k < 0.45) put(x, y1, 'r'); }
    // Schutthaufen im Inneren, manchmal eine umgestürzte Säule
    const n = 1 + (w * h > 30 ? 1 : 0);
    for (let i = 0; i < n; i++) put(x0 + 1 + rng.int(0, w - 3), y0 + 1 + rng.int(0, Math.max(0, h - 3)), rng.chance(0.75) ? 'r' : 'l');
    keep((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  };
  // Baufreiheit: Haus samt 1 Kachel Rand nur auf Boden, nicht auf Straßen, nicht an der Lava
  const reserved = [];
  const canBuild = (x0, y0, w, h, inside) => {
    if (x0 < 4 || y0 < 4 || x0 + w > W - 4 || y0 + h > H - 4) return false;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (occ[y * W + x]) return false;
      const c = get(x, y), edge = y === y0 - 1 || y === y0 + h || x === x0 - 1 || x === x0 + w;
      if (c === '~' || c === 'z') return false;
      if (!edge && (c !== ',' && c !== '.')) return false;
      if (!edge && net.onRoad(x, y)) return false;
      if (reserved.some((f) => f(x, y))) return false;
      if (inside && !inside(x, y)) return false;
    }
    return true;
  };
  const claim = (x0, y0, w, h, pad = 0) => { for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) if (m.in(x, y)) occ[y * W + x] = 1; };
  // Bau je nach Viertel: intakt, mit Hof oder eingestürzt
  let ruinOf = () => 0.15;
  const build = (x0, y0, w, h) => {
    claim(x0, y0, w, h, hash2(x0, y0, 4064) < 0.15 ? 1 : 0);
    if (rng.next() < ruinOf(x0 + w / 2, y0 + h / 2)) collapsed(x0, y0, w, h);
    else house(x0, y0, w, h, { breaches: rng.int(1, 3), yard: w >= 9 && h >= 7 && rng.chance(0.6) });
  };
  // Häuser entlang einer Straße (beidseitig, Flucht leicht versetzt)
  const lots = (pts, sw, inside, { gap = [1, 2], sides = [1, -1] } = {}) => {
    const hw = sw / 2 + 0.7;
    for (const side of sides) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        let s = rng.range(0, 2);
        while (s < L) {
          const t = s / L, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
          const horiz = Math.abs(bx - ax) >= Math.abs(by - ay);
          const w = rng.int(4, 8), h = rng.int(4, 7);
          let done = false;
          for (let back = rng.int(-1, 0); back <= 2 && !done; back++) {
            let x0, y0;
            if (horiz) { x0 = Math.round(px - w / 2); y0 = side > 0 ? Math.round(py + hw + back) : Math.round(py - hw - back) - h + 1; }
            else { y0 = Math.round(py - h / 2); x0 = side > 0 ? Math.round(px + hw + back) : Math.round(px - hw - back) - w + 1; }
            if (canBuild(x0, y0, w, h, inside)) { build(x0, y0, w, h); s += (horiz ? w : h) + rng.int(gap[0], gap[1]); done = true; }
          }
          if (!done) s += 1.5;
        }
      }
    }
  };
  // Restflächen eines Viertels auffüllen (Zufallsproben, Gassen bleiben frei)
  const fill = (r, tries, inside) => {
    for (let k = 0; k < tries; k++) {
      const w = rng.int(4, 8), h = rng.int(4, 7);
      const x0 = rng.int(r.x, r.x + r.w - w), y0 = rng.int(r.y, r.y + r.h - h);
      if (canBuild(x0, y0, w, h, inside)) build(x0, y0, w, h);
    }
  };

  // ------------------------------------------------------------ Questobjekte (Thread C)
  // Obelisk 1 am Lavafluss (Glutkai), 2 am Krater (Ascheschlot), 3 am Thronweg (Kolossfeld)
  const obelisks = [[79, 59], [22, 16], [145, 26]];
  const anchors = [[23, 84], [108, 24], [62, 95]];
  const crownShrine = { x: 132, y: 10 };
  const crater = { x: 14, y: 5, w: 17, h: 13 };

  // ------------------------------------------------------------ Aschedünen: Ankunft und Pilgerpfad
  // Frostzinnen-Straße (West) -> Steinmänner -> Westtor des Tempelbezirks
  const pilgrim = wob([[0, 20], [7, 21], [12, 25], [13, 31], [10, 37], [11, 43], [14, 48], [17, 51]], 1.3, 4065);
  dirt(pilgrim, 2.4);
  put(3, 20, '3');
  keep((x, y) => x <= 8 && y >= 15 && y <= 25);
  // Steinmänner entlang des Pfads (abwechselnd links/rechts)
  const cairnAt = (pts, every, off, seed) => {
    let acc = 0, side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay);
      acc += L;
      if (acc >= every) {
        acc = 0; side = -side;
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        const x = Math.round(bx + nx * off * side), y = Math.round(by + ny * off * side);
        if (GROUND.has(get(x, y)) && !net.onRoad(x, y)) put(x, y, 'O');
      }
    }
  };
  cairnAt(pilgrim, 6, 2.6, 1);
  // Abzweig zum Ascheschlot und weiter nach Nordosten zur Stadt (Eingestürztes Viertel)
  const toCrater = wob([[12, 25], [17, 21], [22, 18]], 1, 4066);
  dirt(toCrater, 2);
  const dunesNE = wob([[22, 18], [30, 20], [37, 26], [43, 28], [48, 29]], 1.6, 4067);
  dirt(dunesNE, 2);
  cairnAt(dunesNE, 7, 2.4, 2);

  // Ascheschlot: Krater mit Lavaauge, Obsidianrand, Obelisk 2 am Südrand
  m.ellipse(22, 10, 7, 4.6, '.', [',']);
  m.ellipse(22, 9, 3.4, 2.1, '~');
  circle(m, 22, 9.5, 5.6, 3.6, 12, 'o', 0.2);
  each([[21, 13], [22, 13], [23, 13], [21, 14], [22, 14], [23, 14]], (x, y) => put(x, y, '.'));
  // Versteckte Senke im Nordwesten (Felsring, schmaler Spalt): Truhe
  m.rect(2, 2, 11, 9, '#');
  m.rect(5, 4, 5, 4, ',');
  put(10, 6, ','); put(11, 6, ','); put(12, 6, ',');
  chests.push({ x: 7, y: 5 });
  put(6, 7, 'y'); put(9, 4, 'd');
  keep((x, y) => x >= 3 && x <= 13 && y <= 10);
  // Verschüttete Karawane am Nordostpfad, Wanderdünen mit Statuenresten
  each([[33, 22], [35, 23]], (x, y) => put(x, y, 'x')); put(34, 25, 'y'); put(31, 23, 'u');
  put(8, 29, 'u'); put(39, 13, 'l'); put(28, 31, 'h');
  // Säulenstumpf-Paar als Torweg zum Tempelbezirk
  put(15, 46, 'l'); put(9, 41, 'l');

  // ------------------------------------------------------------ Letzte Bastion: Ruinenhof im Tempelbezirk
  // Felsentempel: Fassade (D) im Basaltsporn, davor ein ovaler Hof mit Säulengang und altem Brunnen.
  const bastion = { x: 14, y: 37, w: 33, h: 27 };
  const BC = { x: 30, y: 52, rx: 15, ry: 10.5 };
  blob(m, rng, 30, 37, 9, 4.2, '#', null, 3);
  m.rect(23, 38, 15, 4, '#');
  m.ellipse(BC.x, BC.y, BC.rx - 0.6, BC.ry - 0.6, '.');
  m.ellipse(BC.x, BC.y + 0.5, BC.rx - 3.5, BC.ry - 3.2, ':');
  m.rect(26, 42, 9, 2, ':');
  for (let y = 41; y < 63; y++) for (let x = 15; x < 46; x++) if (get(x, y) === ':' && hash2(x, y, 4068) < 0.1) put(x, y, '.');
  // Umfassung: Tempelmauern (Nord H, Süd i, Seiten I) auf dem Ovalrand; Breschen mit Barrikaden (V)
  const onRim = (x, y) => {
    const d = ((x - BC.x) / BC.rx) ** 2 + ((y - BC.y) / BC.ry) ** 2;
    return d <= 1 && (((x - BC.x) / (BC.rx - 1)) ** 2 + ((y - BC.y) / (BC.ry - 1)) ** 2 > 1);
  };
  for (let y = 40; y <= 63; y++) for (let x = 14; x <= 46; x++) {
    if (!onRim(x, y) || get(x, y) === '#') continue;
    const dx = (x - BC.x) / BC.rx, dy = (y - BC.y) / BC.ry;
    put(x, y, Math.abs(dy) > Math.abs(dx) * 1.1 ? (dy < 0 ? 'H' : 'i') : 'I');
  }
  // Tore: West (Dünen), Ost (Stadt), Süd (Obsidianfeld); Torpfeiler Q
  const gateW = [15, 51], gateE = [45, 52], gateS = [30, 62];
  for (let d = -1; d <= 1; d++) { put(gateW[0], gateW[1] + d, ':'); put(gateW[0] + 1, gateW[1] + d, ':'); put(gateE[0], gateE[1] + d, ':'); put(gateE[0] - 1, gateE[1] + d, ':'); put(gateS[0] + d, gateS[1], ':'); put(gateS[0] + d, gateS[1] - 1, ':'); }
  each([[16, 49], [16, 53], [44, 50], [44, 54], [28, 62], [32, 62]], (x, y) => put(x, y, 'Q'));
  // Eingestürzte Abschnitte, mit Barrikaden geschlossen
  each([[20, 43], [21, 43], [39, 43], [40, 59], [41, 59], [19, 60], [43, 46]], (x, y) => put(x, y, 'V'));
  // Fassade, Banner, Kohlebecken
  put(30, 42, 'D');
  each([[24, 43], [36, 43]], (x, y) => put(x, y, 'P'));
  each([[26, 44], [34, 44]], (x, y) => put(x, y, 'q'));
  // Säulengang (Ost- und Westseite des Hofs)
  each([[19, 47], [19, 51], [19, 55], [41, 48], [41, 52], [41, 56]], (x, y) => put(x, y, 'L'));
  // Alter Brunnen in der Hofmitte, Wegstein davor (2 × 2 frei, Spawn darunter)
  put(30, 55, 'W');
  const waystone = { x: 30, y: 46 };
  put(30, 48, '5');
  // Kommandoposten (Corvane vor der Fassade), Quartiermeisterei im Westgang, Pilgerecke am Osttor
  put(27, 46, 'A');
  put(22, 57, 'T'); put(24, 59, 'F'); put(26, 58, 'M'); each([[21, 54], [22, 60]], (x, y) => put(x, y, 'x'));
  put(38, 57, 'T'); put(39, 54, 'B'); put(37, 52, 'q');
  put(26, 50, '1'); put(34, 50, '2');
  keep(box(bastion, 1));

  // ------------------------------------------------------------ Flammenweg (Hauptachse) und Gassen
  // Der alte Prozessionsweg vom Tempelbezirk zum Aschethron trägt die Stadt.
  const MA = wob([[45, 52], [51, 51], [57, 48], [62, 45]], 1, 4070);
  const MA2 = wob([[70, 46], [76, 49]], 0.5, 4071);
  const MA3 = wob([[89, 49], [95, 47], [100, 46]], 0.6, 4072);
  const MA4 = wob([[104, 47], [110, 49], [117, 50]], 0.8, 4073);
  for (const p of [MA, MA2, MA3, MA4]) pave(p, 3);
  bridgeEW(77, 88, 48, 50);                     // Glutbrücke
  // Brunnenplatz (groß, unregelmäßig)
  const fountainSq = { x: 58, y: 37, w: 16, h: 13 };
  m.ellipse(66, 43, 7.6, 5.8, ':', [',', '.']); m.ellipse(62, 46, 4, 3, ':', [',', '.']); m.ellipse(70, 40, 3.5, 2.6, ':', [',', '.']);
  for (let y = 36; y < 51; y++) for (let x = 57; x < 75; x++) if (get(x, y) === ':' && hash2(x, y, 4049) < 0.1) put(x, y, '.');
  put(66, 43, 'W');
  each([[60, 39], [72, 39], [60, 47]], (x, y) => put(x, y, 'l'));
  each([[63, 38], [69, 38]], (x, y) => put(x, y, 'q'));
  put(71, 46, 'u');
  reserved.push((x, y) => inEll(x, y, 66, 43, 9, 7));
  keep((x, y) => inEll(x, y, 66, 43, 8.5, 6.5));
  // Scherbenmarkt (klein, dreieckig) vor dem Tempel
  const market = { x: 96, y: 41, w: 11, h: 9 };
  m.ellipse(101, 45.5, 5, 3.6, ':', [',', '.']); m.ellipse(104, 43, 3, 2, ':', [',', '.']);
  each([[98, 44], [103, 47]], (x, y) => put(x, y, 'X'));
  put(100, 47, 'x');
  reserved.push((x, y) => inEll(x, y, 101, 45, 6.5, 5));
  keep((x, y) => inEll(x, y, 101, 45, 6, 4.5));
  // Säulenplatz (klein) im Nordviertel
  m.ellipse(62, 23, 3.6, 2.8, ':', [',', '.']);
  each([[59, 21], [65, 21], [59, 25], [65, 25]], (x, y) => put(x, y, 'L'));
  put(62, 23, 'S');
  reserved.push((x, y) => inEll(x, y, 62, 23, 5, 4));
  keep((x, y) => inEll(x, y, 62, 23, 4.5, 3.6));
  // Glutkai am Lavafluss (Obelisk 1)
  const quay = { x: 72, y: 55, w: 9, h: 10 };
  m.ellipse(77, 59.5, 4.4, 4.6, ':', [',', '.']);
  for (let y = 55; y <= 64; y++) for (let x = 73; x <= 81; x++) if (get(x, y) === ':' && hash2(x, y, 4052) < 0.12) put(x, y, '.');
  each([[74, 56], [74, 63]], (x, y) => put(x, y, 'l'));
  put(76, 62, 'q');
  reserved.push((x, y) => inEll(x, y, 77, 59.5, 6, 6));
  keep((x, y) => inEll(x, y, 77, 59.5, 5, 5));

  // Gassen (krumm, 1,6–2 breit). Nord: Brunnenplatz -> Säulenplatz -> Nordbrücke -> Tempel
  const N1 = wob([[64, 37], [61, 31], [62, 26]], 1.4, 4074);
  const N2 = wob([[65, 22], [70, 19], [76, 23]], 1.2, 4075);
  pave(N1, 2); pave(N2, 2);
  bridgeEW(77, 87, 23, 24);                     // Nordbrücke
  const N3 = wob([[88, 24], [93, 27], [96, 33], [99, 38]], 1.3, 4076);
  pave(N3, 2);
  // Süd: Brunnenplatz -> Glutkai -> Krustenfurt -> Ostgasse -> Flammenweg (Schleife)
  const S1 = wob([[63, 48], [66, 53], [72, 57]], 1, 4077);
  const S2 = wob([[78, 64], [79, 67]], 0.3, 4078);
  pave(S1, 2); pave(S2, 2);
  ford([[79, 67.5], [90, 67.5]], 2.2);           // Krustenfurt
  const S3 = wob([[90, 67], [96, 66], [102, 62], [107, 57], [110, 50]], 1.5, 4079);
  pave(S3, 2);
  // Nordwest: Flammenweg -> eingestürztes Viertel -> Dünenpfad
  const NW1 = wob([[51, 50], [49, 42], [50, 35], [49, 29], [47, 29]], 1.2, 4080);
  dirt(NW1, 1.8);
  // Südwest: Flammenweg -> Vorstadt (Furt über den Nebenarm)
  const SW1 = wob([[51, 52], [50, 60], [53, 68], [58, 73], [62, 74]], 1.4, 4082);
  dirt(SW1, 2);
  // Oststadt: Markt -> Südosten (Brandviertel) -> Südbrücke
  const SE1 = wob([[102, 62], [104, 69], [101, 76], [100, 82]], 1.4, 4083);
  dirt(SE1, 2);
  bridgeNS(99, 101, 82, 90);                    // Südbrücke über den Strom

  // Stadtgrenze (Mauerreste mit Torpfeilern an West- und Osttor)
  const cityIn = (x, y) => inEll(x, y, 82, 45, 46, 42) && x >= 47 && x <= 117 && y >= 10 && y <= 79;
  each([[47, 49], [47, 55], [117, 47], [117, 53]], (x, y) => put(x, y, 'Q'));
  for (let y = 40; y <= 60; y++) if (y < 48 || y > 56) { const x = 47 + (y % 7 === 0 ? 1 : 0); if (get(x, y) === ',' || get(x, y) === '.') put(x, y, hash2(x, y, 4084) < 0.6 ? 'I' : 'r'); }
  for (let y = 44; y <= 58; y++) if (y < 46 || y > 55) { if (get(117, y) === ',' || get(117, y) === '.') put(117, y, hash2(117, y, 4085) < 0.6 ? 'I' : 'r'); }

  // Tempel der Ersten Flamme (NO): Vorhalle am Fels, Säulenschiff, Ausgang zum Markt
  const temple = { x: 97, y: 13, w: 18, h: 28 };
  m.rect(97, 13, 18, 28, '.');
  for (let x = 97; x <= 114; x++) { put(x, 13, '#'); put(x, 40, 'i'); }
  for (let y = 14; y < 40; y++) { put(97, y, 'I'); put(114, y, 'I'); }
  put(97, 40, 'J'); put(114, 40, 'J');
  for (let y = 14; y <= 17; y++) for (let x = 98; x <= 113; x++) put(x, y, '#');
  put(105, 18, 'D');
  m.rect(104, 19, 3, 21, ':');
  m.rect(99, 28, 15, 3, ':');
  for (const y of [21, 24, 27, 32, 35, 38]) { put(101, y, 'L'); put(110, y, 'L'); }
  for (let y = 33; y <= 35; y++) put(97, y, ':');
  for (let x = 104; x <= 106; x++) put(x, 40, ':');
  put(113, 37, 'r'); put(113, 38, 'r');
  put(99, 20, 'u'); put(112, 22, 'q'); put(98, 22, 'q'); put(100, 37, 'y'); put(112, 33, 'l');
  m.rect(104, 41, 3, 2, ':');
  // Sakristei hinter dem Tempel (Engstelle Ostseite): Truhe
  put(114, 21, '.');
  m.rect(115, 18, 2, 6, '.');
  for (let y = 14; y <= 17; y++) { put(115, y, '#'); put(116, y, '#'); }
  for (let y = 24; y <= 40; y++) { put(115, y, '#'); put(116, y, '#'); }
  chests.push({ x: 116, y: 19 });
  reserved.push((x, y) => x >= 95 && x <= 117 && y >= 12 && y <= 42);
  keep(box(temple, 1));

  // Häuser: zuerst entlang Flammenweg und Gassen, dann Viertel auffüllen.
  // Eingestürztes Viertel (NW) und Brandviertel (SO) fast nur Trümmer.
  const fallenQ = (x, y) => x < 62 && y < 36;
  const burntQ = (x, y) => x > 98 && y > 58;
  ruinOf = (x, y) => fallenQ(x, y) ? 0.8 : burntQ(x, y) ? 0.65 : 0.12;
  for (const [p, w] of [[MA, 3], [MA2, 3], [MA3, 3], [MA4, 3], [N1, 2], [N2, 2], [N3, 2], [S1, 2], [S3, 2], [NW1, 1.8], [SW1, 2], [SE1, 2]]) lots(p, w, cityIn);
  fill({ x: 48, y: 11, w: 30, h: 66 }, 2500, cityIn);
  fill({ x: 87, y: 11, w: 30, h: 68 }, 2500, cityIn);
  // Schuttfelder in den eingestürzten Vierteln
  for (let y = 11; y < 79; y++) for (let x = 48; x < 117; x++) {
    if (!(fallenQ(x, y) || burntQ(x, y)) || !cityIn(x, y) || occ[y * W + x] || net.onRoad(x, y)) continue;
    if ((get(x, y) === ',' || get(x, y) === '.') && hash2(x, y, 4086) < 0.07) put(x, y, hash2(x, y, 4087) < 0.7 ? 'r' : 'l');
  }

  // ------------------------------------------------------------ Obsidianfeld (SW)
  // Gewachsene Nadeln (Rauschen), Lavaadern, verschlungene Gänge mit Krustenfurten, Herz mit Anker
  const MZ = { x: 3, y: 65, w: 43, h: 36 };
  const inMZ = (x, y) => x >= 3 && x <= 45 && y >= 65 && y <= 100;
  for (let y = 65; y <= 100; y++) for (let x = 3; x <= 45; x++) {
    const edge = Math.min(x - 3, 45 - x, y - 65, 100 - y);
    const n = vn(x, y, 3.2, 4090) * 0.65 + vn(x, y, 8, 4091) * 0.35 + (edge < 3 ? (3 - edge) * 0.12 : 0);
    if (y < 68 && x >= 26 && x <= 34) continue;            // Vorfeld am Südtor
    put(x, y, n > 0.74 ? '#' : n > 0.46 ? 'N' : vn(x, y, 5, 4092) > 0.6 ? '.' : ',');
  }
  // Lavaadern (vom Nebenarm gespeist)
  const vein1 = wob([[45, 91], [38, 93], [30, 96], [21, 93], [12, 96], [6, 92]], 1.2, 4093);
  const vein2 = wob([[16, 66], [19, 72], [15, 78], [17, 84], [13, 89]], 1, 4094);
  m.path(vein1, 1.6, '~'); m.path(vein2, 1.3, '~');
  // Gänge
  const carve = (pts, w) => ford(pts, w, '.', ['~', 'N', '#', ',']);
  const P = { n: [30, 66], a: [27, 73], b: [39, 74], heart: [23, 84], c: [11, 79], d: [8, 95], e: [35, 88], x: [46, 90], f: [24, 97], g: [40, 98] };
  const G = (a, b, w, s) => carve(wob([P[a], P[b]], 1.8, s, 3), w);
  G('n', 'a', 2.4, 4101); G('a', 'b', 2, 4102); G('a', 'heart', 2.2, 4103); G('a', 'c', 2, 4104);
  G('c', 'heart', 2, 4105); G('heart', 'e', 2.2, 4106); G('e', 'x', 2.4, 4107); G('e', 'g', 2, 4108); G('heart', 'f', 1.8, 4109);
  carve(wob([P.c, [9, 87], [8, 92]], 1, 4110, 3), 1.6);
  // Schatzwinkel: nur über einen 1 Kachel breiten Spalt
  m.ellipse(7, 96.5, 2, 1.6, '.'); put(8, 93, '.'); put(8, 94, '.'); put(7, 94, 'N'); put(9, 94, 'N');
  put(8, 95, '.');
  chests.push({ x: 6, y: 97 });
  // Lichtungen
  m.ellipse(P.heart[0], P.heart[1], 4.6, 3.8, '.', [',', '.', 'N', '#', '~', 'z']);
  m.ellipse(P.b[0], P.b[1], 3.2, 2.6, '.', [',', '.', 'N', '#']);
  m.ellipse(P.g[0], P.g[1], 3, 2, '.', [',', '.', 'N', '#']);
  m.ellipse(P.f[0], P.f[1], 2.6, 2, '.', [',', '.', 'N', '#']);
  m.ellipse(P.c[0], P.c[1], 3, 2.6, '.', [',', '.', 'N', '#']);
  put(39, 73, 'u'); put(24, 98, 'y'); put(41, 99, 'y'); put(12, 79, 'y');
  // Zugang vom Südtor der Bastion
  dirt([[30, 62], [30, 67]], 2.4);
  keep((x, y) => inMZ(x, y));

  // ------------------------------------------------------------ Verbrannte Vorstadt und Aschefriedhof (S)
  const SV = wob([[62, 74], [58, 79]], 0.6, 4111);
  dirt(SV, 2);
  ford([[58, 79], [55, 85]], 2.4);                // Furt über den Nebenarm
  const SV2 = wob([[55, 85], [60, 87], [68, 88], [77, 91], [88, 93], [99, 91]], 1.4, 4112);
  dirt(SV2, 2.2);
  dirt(wob([[46, 90], [50, 88], [55, 85]], 0.8, 4113), 2);
  const SV3 = wob([[100, 82], [108, 79], [120, 79], [132, 80], [142, 77]], 1.6, 4114);
  dirt(SV3, 2.2);
  dirt(wob([[142, 77], [140, 68], [136, 58], [130, 52]], 1.4, 4115), 2.2);
  cairnAt(SV2, 9, 2.6, 3); cairnAt(SV3, 9, 2.6, 4);
  // Gehöfte und Scheunen (verbrannt)
  for (const [x, y, w, h, c] of [[64, 80, 7, 5, 1], [73, 78, 8, 6, 0], [86, 95, 6, 5, 1], [79, 96, 6, 5, 0], [90, 80, 7, 5, 1], [70, 85, 6, 4, 1], [84, 84, 7, 5, 0], [47, 76, 6, 5, 1], [94, 86, 5, 4, 1]]) {
    if (canBuild(x, y, w, h)) { claim(x, y, w, h); c ? collapsed(x, y, w, h) : house(x, y, w, h, { breaches: 2 }); }
  }
  // Aschefriedhof um den dritten Phasenanker: Stelen in Reihen, Knochen, Kohlebecken am Eingang
  m.ellipse(62, 95, 7, 4.2, '.', [',']);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
    const x = 57 + i * 2 + (r % 2), y = 92 + r * 3;
    if (Math.abs(x - 62) <= 1 && Math.abs(y - 95) <= 1) continue;
    if (get(x, y) === '.' && !net.onRoad(x, y)) put(x, y, 'Y');
  }
  each([[57, 90], [67, 90]], (x, y) => put(x, y, 'q'));
  each([[50, 94], [69, 98]], (x, y) => put(x, y, 'y'));
  each([[50, 89], [79, 88], [88, 89], [92, 99]], (x, y) => put(x, y, 'd'));
  put(76, 99, 'u');
  // Aschehain: verkohlte Baumgruppe mit Knochen zwischen Vorstadt und Strom
  each([[88, 77], [91, 76], [93, 79], [86, 80], [95, 76], [90, 74]], (x, y) => { if (GROUND.has(get(x, y)) && !net.onRoad(x, y)) put(x, y, 'd'); });
  put(92, 78, 'y');
  keep((x, y) => inEll(x, y, 62, 95, 8, 5));

  // ------------------------------------------------------------ Prozessionsweg, Kolossfeld, Throntor
  const PW = [[117, 50], [124, 50], [130, 49], [135, 46], [138, 41], [138, 8]];
  m.path(PW, 5, ':', [',', '.', '~', 'z', '#']); net.mask.path(PW, 6.2, 'R');
  m.ellipse(138, 9, 9, 4.4, ':', [',', '.']);
  // Statuenspalier mit Kohlebecken, beidseitig quer zur Achse
  {
    let acc = 3, n = 0;
    for (let i = 0; i < PW.length - 1; i++) {
      const [ax, ay] = PW[i], [bx, by] = PW[i + 1], L = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / L, ny = (bx - ax) / L;
      for (let s = 0; s < L; s += 1) {
        acc += 1; if (acc < 6 || ay + (by - ay) * (s / L) < 14) continue;
        acc = 0; n++;
        const px = ax + (bx - ax) * (s / L), py = ay + (by - ay) * (s / L);
        for (const side of [1, -1]) {
          const x = Math.round(px + nx * 4 * side), y = Math.round(py + ny * 4 * side);
          if (get(x, y) === ',' || get(x, y) === '.') put(x, y, n % 2 ? 'S' : 'q');
        }
      }
    }
  }
  each([[133, 7], [143, 7], [145, 11]], (x, y) => put(x, y, 'q'));
  put(138, 4, 'R'); put(138, 8, '4');
  const gate = { x: 126, y: 1, w: 25, h: 12 };
  const field = { x: 122, y: 14, w: 36, h: 30 };
  put(127, 22, 'C'); put(150, 34, 'C'); put(128, 38, 'u'); put(152, 24, 'u');
  each([[124, 30], [146, 18], [131, 34], [154, 29], [125, 40]], (x, y) => put(x, y, 'y'));
  each([[147, 41], [123, 17], [155, 37]], (x, y) => put(x, y, 'l'));
  // Felsnische hinter dem Kolosshaupt (Engstelle, Truhe)
  m.rect(150, 13, 8, 6, '#');
  m.rect(152, 15, 4, 2, '.');
  put(151, 16, '.'); put(150, 16, '.'); put(149, 16, '.');
  chests.push({ x: 154, y: 15 });

  // ------------------------------------------------------------ Schlackenlager der Kultisten und Geysirfeld
  // Lager: Zelte um ein Glutfeuer zwischen Schlackenhalden, Kisten, Bannerstangen
  const camp = { x: 136, y: 58, w: 18, h: 12 };
  m.ellipse(145, 64, 8, 5, '.', [',']);
  each([[140, 61], [149, 61], [144, 68]], (x, y) => put(x, y, 'T'));
  put(145, 64, 'q'); put(141, 66, 'q'); each([[138, 64], [151, 66]], (x, y) => put(x, y, 'P'));
  each([[150, 63], [139, 68]], (x, y) => put(x, y, 'x'));
  each([[124, 59], [134, 70], [156, 63], [127, 67]], (x, y) => put(x, y, 'h'));
  keep(box(camp, 0));
  // Geysire am Glutsee, Furt zur Insel (Truhe zwischen Kolosstrümmern)
  const geys = [[108, 76], [116, 84], [124, 76], [138, 78], [146, 84], [152, 90], [150, 97], [114, 97], [106, 95], [121, 99], [143, 99], [156, 76]];
  each(geys, (x, y) => { if (GROUND.has(get(x, y))) put(x, y, 'g'); });
  ford([[132, 81], [132, 88]], 2.2);
  m.ellipse(132, 90.5, 4.2, 2.2, '.', ['~']);
  chests.push({ x: 134, y: 91 });
  put(130, 91, 'u');

  // ------------------------------------------------------------ Gegner
  // Erreichbarkeit vom Start (für die Platzierung): Boden und Kruste, keine Deko
  const walk = (x, y) => GROUND.has(get(x, y)) || get(x, y) === 'z';
  const reach = new Uint8Array(W * H);
  {
    const q = [[26, 50]]; reach[50 * W + 26] = 1;
    for (let k = 0; k < q.length; k++) {
      const [x, y] = q[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!m.in(nx, ny) || reach[ny * W + nx] || !walk(nx, ny)) continue;
        reach[ny * W + nx] = 1; q.push([nx, ny]);
      }
    }
  }
  // Marke auf den nächsten erreichbaren 3 × 3-Boden setzen
  const F = (list, ch) => each(list, (x, y) => {
    for (let r = 0; r <= 6; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const tx = x + i, ty = y + j;
      if (!m.in(tx, ty) || !reach[ty * W + tx]) continue;
      let ok = true;
      for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (!GROUND.has(get(tx + a, ty + b))) { ok = false; break; }
      if (ok) { put(tx, ty, ch); return; }
    }
    foe(m, x, y, ch);
  });
  // a Aschegeist, k Schlackenritter, s Magmaschlange, c Glutadept, b Aschebombardier, p Phasengeist, Z Glutkoloss
  // Aschedünen: Geister, Bombardiere; Adepten am Kraterobelisken
  F([[34, 6], [30, 14], [38, 17], [12, 8], [26, 26], [40, 32], [20, 34]], 'a');
  F([[31, 9], [36, 36], [44, 22]], 'b');
  F([[17, 14], [27, 14]], 'c');
  // Eingestürztes Viertel (NW): Geister und Phasengeister im Schutt
  F([[52, 18], [57, 30], [66, 14], [72, 30]], 'a');
  F([[50, 24], [70, 22]], 'p');
  // Weststadt um Brunnenplatz und Flammenweg: Ritter, Bombardier
  F([[58, 52], [68, 51], [72, 38], [52, 62], [62, 66]], 'k');
  F([[56, 40], [70, 62]], 'b');
  F([[60, 58], [50, 70]], 'p');
  // Strom: Schlangen an den Ufern, Ritter an den Brückenköpfen; Adepten am Kaiobelisken
  F([[78, 40], [86, 18], [86, 58], [79, 73], [87, 38]], 's');
  F([[90, 50], [75, 26]], 'k');
  F([[74, 60], [80, 55]], 'c');
  // Tempel: Adepten, Phasengeister am Anker, Wächterritter
  F([[103, 21], [102, 33], [109, 31], [105, 37]], 'c');
  F([[101, 26], [112, 28], [113, 22]], 'p');
  F([[99, 38]], 'k');
  // Oststadt, Markt und Brandviertel
  F([[92, 32], [96, 54], [112, 44], [93, 62]], 'k');
  F([[90, 22], [108, 66], [113, 74]], 'b');
  F([[105, 72], [91, 74]], 'a');
  F([[110, 58]], 'p');
  // Obsidianfeld: Phasengeister um das Herz, Schlangen an den Adern, Geister in den Lichtungen
  F([[18, 83], [28, 81], [24, 89], [30, 86]], 'p');
  F([[38, 74], [11, 80], [40, 97], [36, 88]], 'p');
  F([[30, 95], [16, 75]], 's');
  F([[27, 73], [23, 96]], 'a');
  // Vorstadt und Friedhof: Phasengeister am Anker, Ritter, Geister
  F([[56, 97], [68, 97], [62, 90]], 'p');
  F([[74, 89], [86, 92], [67, 84]], 'k');
  F([[80, 84], [93, 96], [50, 92]], 'a');
  // Geysirfeld: Schlangen, Bombardiere, Ritter
  F([[118, 87], [146, 87], [110, 92], [124, 97], [141, 96]], 's');
  F([[114, 76], [128, 76], [148, 79]], 'b');
  F([[104, 82], [131, 84]], 'k');
  // Schlackenlager: Bombardiere, Adepten, Ritter
  F([[143, 61], [147, 67], [152, 69]], 'b');
  F([[140, 64], [149, 64], [128, 62]], 'c');
  F([[134, 66], [155, 60]], 'k');
  // Prozessionsweg: Ritterwachen, Phasengeister
  F([[123, 50], [129, 49], [138, 38], [138, 31]], 'k');
  F([[121, 48], [138, 24]], 'p');
  // Kolossfeld
  F([[131, 25], [146, 32], [151, 28]], 'a');
  F([[126, 35], [148, 21]], 'k');
  F([[146, 38]], 'b');
  F([[150, 23]], 'c');
  foe(m, 128, 29, 'Z');

  // ------------------------------------------------------------ Streudeko
  const dunes = (x, y) => x < 47 && y < 64 && !inRect(x, y, bastion);
  const city = (x, y) => cityIn(x, y);
  const southFields = (x, y) => y >= 72 && x >= 46 && x < 100;
  const pits = (x, y) => x >= 118 && y >= 54 && y < 73;
  const geyserF = (x, y) => x >= 100 && y >= 73;
  const fieldA = (x, y) => inRect(x, y, field);
  keep(box(gate, 1));
  keep(box(crater, 0));
  keep((x, y) => Math.abs(x - crownShrine.x) <= 2 && Math.abs(y - crownShrine.y) <= 2);
  keep((x, y) => anchors.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2));
  keep((x, y) => obelisks.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2));
  keep((x, y) => chests.some((c) => Math.abs(x - c.x) <= 1 && Math.abs(y - c.y) <= 1));
  keep((x, y) => Math.abs(x - 138) <= 4 && y < 44);
  keep((x, y) => inEll(x, y, 128, 29, 6, 4));
  strew(m, net, rng, (x, y) => clear.some((f) => f(x, y)), (x, y, g, free) => {
    if (near(m, x, y, '~', 1)) return free && rng.chance(0.05) ? 'o' : null;
    if (dunes(x, y)) {
      if (free && vn(x, y, 7, 4120) > 0.62 && rng.chance(0.09)) return 'E';
      if (vn(x, y, 7, 4120) > 0.55 && rng.chance(0.05)) return 'n';
      if (free && rng.chance(0.007)) return 'd';
      if (free && rng.chance(0.006)) return 'y';
      if (free && rng.chance(0.004)) return 'O';
      return null;
    }
    if (city(x, y)) {
      if (!free) return null;
      if (rng.chance(0.02)) return 'r';
      if (rng.chance(0.006)) return 'l';
      if (rng.chance(0.005)) return 'y';
      if (rng.chance(0.004)) return 'd';
      return null;
    }
    if (pits(x, y)) {
      if (!free) return null;
      if (rng.chance(0.04)) return 'o';
      if (rng.chance(0.006)) return 'y';
      return null;
    }
    if (geyserF(x, y)) {
      if (!free) return null;
      if (rng.chance(0.012)) return 'g';
      if (rng.chance(0.02)) return 'o';
      return null;
    }
    if (fieldA(x, y)) {
      if (!free) return null;
      if (rng.chance(0.012)) return 'y';
      if (rng.chance(0.01)) return 'o';
      if (rng.chance(0.006)) return 'l';
      if (rng.chance(0.006)) return 'r';
      return null;
    }
    if (southFields(x, y)) {
      if (free && rng.chance(0.014)) return 'E';
      if (rng.chance(0.012)) return 'n';
      if (free && rng.chance(0.012)) return 'd';
      if (free && rng.chance(0.008)) return 'r';
      if (free && rng.chance(0.005)) return 'y';
      return null;
    }
    if (rng.chance(0.02)) return 'n';
    if (free && rng.chance(0.006)) return 'y';
    return null;
  }, ',.');

  // ------------------------------------------------------------ Eskorte: kürzester Weg über Pflaster
  // Dijkstra (Pflaster billig) von Aldo bis vor den Kronschrein, alle ≤ 8 Kacheln ein Wegpunkt.
  const escortPath = (() => {
    const from = [38, 53], to = [134, 11];
    const cost = (x, y) => { const c = get(x, y); return c === ':' ? 1 : c === '.' || c === ',' ? 3 : c === 'z' ? 2 : 0; };
    const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
    const heap = [[0, from[1] * W + from[0]]]; dist[heap[0][1]] = 0;
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
    while (heap.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      const x = k % W, y = (k / W) | 0;
      if (x === to[0] && y === to[1]) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, c = cost(nx, ny);
        if (!c) continue;
        // Abstand zu Deko/Mauern halten (Begleiter sind breiter als eine Kachel)
        let pen = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (!cost(nx + a, ny + b)) pen += 2;
        const nk = ny * W + nx, nd = d + c + pen;
        if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push([nd, nk]); }
      }
    }
    const cells = [];
    for (let k = to[1] * W + to[0]; k >= 0; k = prev[k]) cells.push([k % W, (k / W) | 0]);
    cells.reverse();
    const pts = [];
    for (let i = 0; i < cells.length; i += 8) pts.push(cells[i]);
    if (pts[pts.length - 1] !== cells[cells.length - 1]) pts.push(cells[cells.length - 1]);
    return pts;
  })();
  const amb = (f) => Math.round((escortPath.length - 1) * f);

  return {
    name: 'Die Glutöde',
    kind: 'outdoor',
    biome: 'wastes',
    decorSet: 'decor_wastes',
    map: m.rows(),
    solid: 'wvUHIJiNmejQV',
    decor: {
      h: 'charredRuins', o: 'obsidianShards', n: 'ashDunes', g: 'emberGeysers', d: 'scorchedTrees', y: 'bonePiles',
      w: 'bastionWall', v: 'bastionWallV', G: 'bastionGate', U: 'bastionTower', T: 'tent', P: 'bannerPole', F: 'forge',
      K: 'forge', x: 'crates', R: 'throneGate',
      H: 'ruinWall', i: 'ruinWallLow', I: 'ruinWallV', J: 'ruinPier', r: 'rubble', l: 'columnStumps', L: 'column',
      S: 'statues', u: 'fallenStatues', W: 'fountain', N: 'obsidianNeedles', q: 'brazier', m: 'bridgeRail', e: 'bridgePier',
      j: 'bridgeRailV', z: 'lavaCrust', E: 'ashDrifts', C: 'colossusRemains', D: 'templeFacade', Q: 'gatePylon', X: 'marketStalls',
      O: 'cairns', V: 'barricades', Y: 'steles',
    },
    points: { 1: 'start', 2: 'respawn', 3: 'from_frostspire', 4: 'from_ashen_throne', 5: 'waystone' },
    waystone,
    chests,
    npcs: { A: 'marshal_corvane', B: 'pilgrim_aldo', M: 'quartermaster_ryn' },
    enemies: {
      a: { type: 'ash_wraith' }, k: { type: 'cinder_knight' }, s: { type: 'magma_serpent' },
      c: { type: 'ember_cultist_adept' }, Z: { type: 'waste_colossus' },
      b: { type: 'cinder_bombardier' }, p: { type: 'phase_wraith' },
    },
    // Eskorte (Thread C, escort_pilgrims): Aldo am Osttor -> Flammenweg -> Prozessionsweg -> Kronschrein
    questRoutes: {
      escort_pilgrims: {
        kind: 'escort',
        path: escortPath,
        ambush: [{ at: amb(0.3), type: 'cinder_bombardier', n: 3 }, { at: amb(0.62), type: 'cinder_bombardier', n: 3 }, { at: amb(0.85), type: 'cinder_bombardier', n: 2 }],
      },
    },
    respawn: 45,
    areas: [
      { id: 'last_bastion', name: 'Letzte Bastion', ...bastion, noMount: true, town: true },
      { id: 'ash_dunes', name: 'Aschedünen', x: 3, y: 3, w: 44, h: 34 },
      { id: 'ash_crater', name: 'Ascheschlot', ...crater },
      { id: 'fallen_quarter', name: 'Eingestürztes Viertel', x: 48, y: 11, w: 26, h: 24 },
      { id: 'ember_quay', name: 'Glutkai', ...quay },
      { id: 'altglut_west', name: 'Altglut · Weststadt', x: 47, y: 35, w: 30, h: 42 },
      { id: 'fountain_square', name: 'Brunnenplatz', ...fountainSq },
      { id: 'ember_bridge', name: 'Glutbrücke', x: 77, y: 44, w: 12, h: 10 },
      { id: 'altglut_east', name: 'Altglut · Oststadt', x: 87, y: 41, w: 31, h: 18 },
      { id: 'shard_market', name: 'Scherbenmarkt', ...market },
      { id: 'burnt_quarter', name: 'Brandviertel', x: 87, y: 59, w: 31, h: 21 },
      { id: 'flame_temple', name: 'Tempel der Ersten Flamme', ...temple },
      { id: 'obsidian_maze', name: 'Obsidianfeld', ...MZ },
      { id: 'ash_outskirts', name: 'Verbrannte Vorstadt', x: 46, y: 72, w: 54, h: 29 },
      { id: 'ash_cemetery', name: 'Aschefriedhof', x: 54, y: 90, w: 16, h: 11 },
      { id: 'slag_pits', name: 'Schlackenlager', x: 119, y: 54, w: 39, h: 18 },
      { id: 'geyser_field', name: 'Geysirfeld am Glutsee', x: 100, y: 73, w: 58, h: 29 },
      { id: 'procession_way', name: 'Prozessionsweg', x: 117, y: 44, w: 26, h: 10 },
      { id: 'colossus_field', name: 'Kolossfeld', ...field },
      { id: 'throne_gate', name: 'Throntor', ...gate },
    ],
    objects: [
      { id: 'ember_obelisk_1', kind: 'shrine', decor: 'emberObelisk', name: 'Obelisk am Lavafluss', prompt: 'Obelisk am Lavafluss löschen', x: obelisks[0][0], y: obelisks[0][1] },
      { id: 'ember_obelisk_2', kind: 'shrine', decor: 'emberObelisk', name: 'Obelisk am Krater', prompt: 'Obelisk am Krater löschen', x: obelisks[1][0], y: obelisks[1][1] },
      { id: 'ember_obelisk_3', kind: 'shrine', decor: 'emberObelisk', name: 'Obelisk am Thronweg', prompt: 'Obelisk am Thronweg löschen', x: obelisks[2][0], y: obelisks[2][1] },
      ...anchors.map(([x, y], i) => ({ id: `phase_anchor_${i + 1}`, kind: 'shrine', decor: 'phaseAnchor', name: 'Phasenanker', prompt: 'Phasenanker zerschlagen', x, y })),
      { id: 'crown_shrine', kind: 'shrine', decor: 'crownShrine', name: 'Kronschrein', prompt: 'Am Kronschrein beten', ...crownShrine },
    ],
    portals: [
      { id: 'to_frostspire', x: 0.6, y: 20, range: 26, visual: 'road', dir: [-1, 0],
        to: { zoneId: 'frostspire', spawnId: 'from_ember_wastes' }, prompt: 'Hinauf in die Frostzinnen' },
      { id: 'to_ashen_throne', x: 138, y: 5.2, range: 26, requires: { level: 38 },
        to: { zoneId: 'ashen_throne', spawnId: 'start' }, prompt: 'Den Aschethron betreten' },
    ],
    signText: 'Ost: Flammenweg durch Altglut zum Aschethron · Süd: Obsidianfeld · West: Pilgerpfad in die Frostzinnen',
  };
}
