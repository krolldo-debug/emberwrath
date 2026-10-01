import { PixelCanvas } from './PixelCanvas.js';

// Fähigkeits-Embleme in 48×48 (HUD-Leiste, Fähigkeitenbuch). Echte Pixel-Art:
// harte Pixel, wenige Rampen (dunkel -> hell), Licht von oben links (docs/STYLE.md).
// Aufbau je Icon: Klassen-Hintergrund (radiales Glühen, gerastert) -> Symbol auf eigener
// Ebene mit 1-px-Umriss und Schlagschatten -> Funken -> gemeinsamer Bronze-Rahmen mit Nieten.
//   SKILL_ART[id](p)  zeichnet auf p = new PixelCanvas(48, 48)

export const SKILL_ART_SIZE = 48;
const N = 48;

// ---------------------------------------------------------------- Rampen (dunkel -> hell)
const R = {
  steel: ['#222a42', '#3e4e72', '#6a82b0', '#aec2e6', '#f6faff'],
  iron: ['#262a36', '#454c5e', '#69738a', '#9ea9bf', '#e2e8f2'],
  bronze: ['#2a1a0c', '#5a3a1a', '#8a5e2a', '#c0904a', '#f4d898'],
  gold: ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0'],
  bone: ['#463d30', '#80755c', '#bcae8e', '#e6dcc0', '#fffbef'],
  wood: ['#2a1810', '#4a2c1a', '#6e4428', '#946038', '#c08a52'],
  leather: ['#1f130f', '#36231a', '#523628', '#724e38', '#94704e'],
  ash: ['#241c18', '#3e3028', '#5e4a3a', '#86705a', '#b49e80'],
  rock: ['#140c0a', '#2a1a14', '#46301f', '#6a4a30', '#94704a'],
  red: ['#2a0508', '#5a0c14', '#98182a', '#d0303c', '#ff8070'],
  ember: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640'],
  fire: ['#c8420c', '#f07a1c', '#ffb640', '#fff0b0', '#ffffff'],
  purple: ['#1a0a2e', '#3a1466', '#6a2cb0', '#a060f0', '#e8c8ff'],
  arcane: ['#3a1466', '#6a2cb0', '#a060f0', '#d8a8ff', '#ffffff'],
  shade: ['#0e0818', '#1e1232', '#34205a', '#56388c', '#8c6ac8'],
  green: ['#0a2410', '#16461e', '#2a7a34', '#56b850', '#b8f090'],
  venom: ['#0e2a0a', '#2a6a16', '#4ea82a', '#8ee040', '#e4ffa0'],
  moss: ['#12200e', '#22381a', '#3a5a2a', '#5e8440', '#9ac070'],
};
// Hintergrund je Klasse: fast schwarz am Rand -> Klassenfarbe in der Mitte
const BG = {
  warrior: ['#0c0406', '#22070a', '#420b10', '#6a1218', '#962226'],
  rogue: ['#07040c', '#140a22', '#25123e', '#3a1c62', '#582c8e'],
  ranger: ['#050905', '#0d170c', '#182a15', '#284222', '#3e6230'],
  mage: ['#0b0404', '#240a05', '#461608', '#70280c', '#a04212'],
};
const OL = '#0b0710';
const WHITE = '#ffffff';

// ---------------------------------------------------------------- Zeichenhilfen
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (ramp, t) => ramp[clamp(Math.round(t), 0, ramp.length - 1)];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Gerasterte Stufe: t (0..len-1) mit 4×4-Bayer-Dither zwischen benachbarten Stufen
const dith = (ramp, t, x, y) => {
  t = clamp(t, 0, ramp.length - 1);
  const k = Math.floor(t);
  return ramp[Math.min(ramp.length - 1, t - k > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? k + 1 : k)];
};
const layer = () => new PixelCanvas(N, N);

function fill(p, fn) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = fn(x + 0.5, y + 0.5, x, y);
    if (c) p.px(x, y, c);
  }
}
function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
// Achsen-Raster: u entlang (0..L), v quer; lv > 0 = beleuchtete (obere/linke) Seite
function axis(p, x0, y0, x1, y1, fn) {
  const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
  const s = nx + ny > 0.001 ? -1 : nx + ny < -0.001 ? 1 : (nx < 0 || ny < 0 ? 1 : -1);
  fill(p, (px, py, x, y) => {
    const ox = px - x0, oy = py - y0, u = ox * dx + oy * dy, v = ox * nx + oy * ny;
    return fn(u, v, L, v * s, x, y);
  });
}
// Klinge: gerade Schneiden, Spitze läuft auf den letzten `tip` Pixeln zu
function blade(p, x0, y0, x1, y1, hw, ramp, { tip = 7, edge = null } = {}) {
  axis(p, x0, y0, x1, y1, (u, v, L, lv) => {
    if (u < 0 || u > L) return null;
    const w = u > L - tip ? hw * (L - u) / tip + 0.35 : hw;
    if (Math.abs(v) > w) return null;
    if (edge && lv < -w + 1.2) return edge;
    if (lv > w - 1) return ramp[4];
    if (Math.abs(v) < 0.55) return u > L - tip ? ramp[4] : ramp[3];
    return lv > 0 ? ramp[3] : (lv < -w + 1 ? ramp[1] : ramp[2]);
  });
}
// Zylinder (Griff, Schaft, Stiel)
function rod(p, x0, y0, x1, y1, r, ramp, bands = 0) {
  axis(p, x0, y0, x1, y1, (u, v, L, lv) => {
    if (u < 0 || u > L || Math.abs(v) > r) return null;
    if (bands && Math.floor(u / bands) % 2 === 1) return pick(ramp, 1.5 + lv / r * 1.3);
    return pick(ramp, 2.2 + lv / r * 1.6);
  });
}
// Kugel mit Licht von oben links
function ball(p, cx, cy, r, ramp, spec = true) {
  fill(p, (x, y) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > r) return null;
    return pick(ramp, 2.2 + (-dx - dy) / (r * 1.41) * 1.6 - (d / r) * 0.9);
  });
  if (spec) p.px(Math.round(cx - r * 0.45 - 0.5), Math.round(cy - r * 0.45 - 0.5), ramp[4]);
}
// Flamme (Tropfen nach oben), Kern hell
function flame(p, cx, by, h, w, ramp = R.fire, wob = 0) {
  fill(p, (x, y) => {
    const t = (by - y) / h; // 0 unten .. 1 Spitze
    if (t < -0.25 || t > 1) return null;
    const prof = t < 0 ? Math.sqrt(1 - (t / 0.25) ** 2) : Math.pow(1 - t, 0.8) * (0.8 + 0.4 * Math.sin(t * 3.1));
    const xx = x - cx - Math.sin(t * 5 + wob) * t * w * 0.35;
    const hw = w * prof;
    if (Math.abs(xx) > hw) return null;
    const c = 1 - Math.abs(xx) / hw;
    return pick(ramp, c * 3.2 + (1 - Math.abs(t - 0.15)) * 1.2 - 0.6);
  });
}

// Symbol-Ebene aufs Icon stempeln: Schlagschatten (unten rechts), 1-px-Umriss, dann Pixel
function stamp(p, L, shadow) {
  const d = L.ctx.getImageData(0, 0, N, N).data;
  const m = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? m[y * N + x] : 0);
  const ring = (x, y) => !at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1));
  if (shadow) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!at(x, y) && !ring(x, y) && (at(x - 2, y - 2) || ring(x - 1, y - 1))) p.px(x, y, shadow);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ring(x, y)) p.px(x, y, OL);
  p.ctx.drawImage(L.canvas, 0, 0);
}
function sym(p, bg, draw) { const L = layer(); draw(L); stamp(p, L, bg[0]); }

// Hintergrund: radiales Glühen in Klassenfarbe, gerastert bis fast schwarz am Rand
function back(p, bg, cx = 22, cy = 21, k = 1) {
  fill(p, (x, y, ix, iy) => {
    const d = Math.hypot(x - cx, (y - cy) * 1.05);
    return dith(bg, (4.1 - d / 6.2) * k, ix, iy);
  });
}
// Weicher Lichtschein (ohne Umriss) – gerastert in eine Rampe
function glow(p, cx, cy, r, ramp, top = 2.6) {
  fill(p, (x, y, ix, iy) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) return null;
    const t = top * (1 - d / r) * 1.4 - 0.4;
    return t < 0 ? null : dith(ramp, t, ix, iy);
  });
}
// Funke: heller Kern mit Kreuz
function spark(p, x, y, c = WHITE, arm = null, big = false) {
  p.px(x, y, c);
  if (arm) { p.px(x - 1, y, arm); p.px(x + 1, y, arm); p.px(x, y - 1, arm); p.px(x, y + 1, arm); }
  if (big && arm) { p.px(x - 2, y, arm); p.px(x + 2, y, arm); p.px(x, y - 2, arm); p.px(x, y + 2, arm); }
}
// Gemeinsamer Rahmen: dunkle Außenkante, 2 px Bronze-Fase (oben links hell), Innenschatten, Nieten
function frame(p) {
  const B = R.bronze;
  for (let i = 0; i < N; i++) {
    p.px(i, 0, OL); p.px(0, i, OL); p.px(i, N - 1, OL); p.px(N - 1, i, OL);
  }
  for (let i = 1; i < N - 1; i++) {
    p.px(i, 1, i < 3 ? B[3] : B[3]); p.px(1, i, B[3]);
    p.px(i, N - 2, B[1]); p.px(N - 2, i, B[1]);
    p.px(i, 2, B[2]); p.px(2, i, B[2]);
    p.px(i, N - 3, B[0]); p.px(N - 3, i, B[0]);
  }
  p.px(1, N - 2, B[2]); p.px(N - 2, 1, B[2]); p.px(2, N - 3, B[1]); p.px(N - 3, 2, B[1]);
  // Innenschatten: oben/links dunkel (Kante wirft Schatten), unten/rechts schmaler Lichtsaum
  for (let i = 3; i < N - 3; i++) { p.px(i, 3, OL); p.px(3, i, OL); }
  // Glanzlichter auf der Fase
  for (const [x, y] of [[6, 1], [7, 1], [1, 6], [1, 7], [20, 1], [1, 20]]) p.px(x, y, B[4]);
  // Nieten in den Ecken (3×3, Licht oben links)
  for (const [x, y] of [[1, 1], [N - 4, 1], [1, N - 4], [N - 4, N - 4]]) {
    p.rect(x, y, 3, 3, B[1]); p.px(x, y, B[3]); p.px(x + 1, y, B[2]); p.px(x, y + 1, B[2]);
    p.px(x + 1, y + 1, B[4]); p.px(x + 2, y + 2, B[0]);
  }
  for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) p.px(x, y, '#000000');
}

// Kapuzengestalt von vorn (Schattenschritt). ramp = null -> flaches Nachbild in `flat`.
function hood(p, cx, ramp, flat) {
  const out = [[cx, 7], [cx + 6, 12], [cx + 10, 22], [cx + 10, 31], [cx + 14, 36], [cx + 15, 44], [cx - 15, 44], [cx - 14, 36], [cx - 10, 31], [cx - 10, 22], [cx - 6, 12]];
  fill(p, (x, y) => {
    if (!inPoly(out, x, y)) return null;
    if (!ramp) return flat;
    const dx = x - cx;
    // Gesichtsöffnung
    const fe = ((dx) / 6) ** 2 + ((y - 25) / 7.5) ** 2;
    if (fe <= 1 && y < 33) {
      if (y > 23.5 && y < 26 && (Math.abs(dx + 3) < 1.6 || Math.abs(dx - 3) < 1.6)) return y < 24.6 ? '#ffffff' : '#c898ff';
      return fe > 0.78 && dx < 0 ? ramp[1] : '#06030a';
    }
    if (fe <= 1.45 && y < 34) return dx < 0 ? ramp[4] : ramp[2];
    // Schultern / Umhang mit Falten, Licht von links
    const fold = y > 34 && (Math.abs(dx + 5) < 0.7 || Math.abs(dx - 6) < 0.7);
    if (fold) return ramp[1];
    return pick(ramp, 3 - (dx + 4) / 7 - (y - 10) / 26);
  });
  if (ramp) { p.px(cx - 1, 9, ramp[4]); p.px(cx - 2, 10, ramp[4]); p.px(cx - 3, 11, ramp[4]); }
}

// ---------------------------------------------------------------- Embleme
export const SKILL_ART = {
  // ===== Krieger: Blutrot, Stahl ===========================================
  skill_whirlwind(p) {
    const bg = BG.warrior;
    back(p, bg);
    // zwei Wirbel-Sicheln um die Mitte
    sym(p, bg, (L) => fill(L, (x, y) => {
      const dx = x - 24, dy = y - 24, d = Math.hypot(dx, dy);
      for (const [a0, r0, th] of [[0, 15.5, 5], [Math.PI, 15.5, 5]]) {
        let a = Math.atan2(dy, dx) - a0; a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const t = 1 - a / 3.6; // 1 = Kopf der Sichel
        if (t < 0) continue;
        const w = 0.6 + th * t * 0.5, rr = r0 - (1 - t) * 3;
        const off = d - rr;
        if (Math.abs(off) > w) continue;
        if (off < -w + 1.2 && t > 0.35) return t > 0.75 ? WHITE : R.steel[4];
        return pick(R.red, 1.2 + t * 3 - (off > w - 1.2 ? 1 : 0));
      }
      return null;
    }));
    // Zweihänder diagonal
    sym(p, bg, (L) => {
      blade(L, 17, 31, 37, 11, 2.6, R.steel, { tip: 6 });
      rod(L, 11, 37, 17, 31, 1.6, R.leather, 2);
      rod(L, 13.5, 26.5, 21.5, 34.5, 1.6, R.gold);
      ball(L, 10.5, 37.5, 2.2, R.gold);
    });
    spark(p, 37, 10, WHITE, R.steel[3]); spark(p, 9, 13, R.red[4]); spark(p, 39, 37, R.red[4]);
    frame(p);
  },
  skill_shout(p) {
    const bg = BG.warrior;
    back(p, bg, 30, 21);
    // Schallwellen nach rechts
    sym(p, bg, (L) => fill(L, (x, y) => {
      const dx = x - 27, dy = y - 21, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (dx < 2 || x > 43.5) return null;
      for (const [r, c, lim] of [[9, WHITE, 0.95], [13.5, R.red[4], 0.85], [18, R.red[3], 0.72]]) {
        if (Math.abs(d - r) < 1.3 && Math.abs(a) < lim) return Math.abs(a) > lim - 0.22 ? R.red[2] : c;
      }
      return null;
    }));
    // Kriegshorn: Mundstück unten links, Bogen nach oben, Trichter zeigt nach rechts
    sym(p, bg, (L) => {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, it = 1 - t;
        const x = it * it * 9 + 2 * it * t * 6 + t * t * 26, y = it * it * 42 + 2 * it * t * 17 + t * t * 21;
        pts.push([x, y, 1.5 + t * t * 6.4, t]);
      }
      fill(L, (x, y) => {
        let best = null;
        for (const [cx, cy, r, t] of pts) {
          const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
          if (d <= r) {
            const band = (t > 0.44 && t < 0.5) || (t > 0.74 && t < 0.79) || t < 0.07;
            const lit = (-dx - dy) / (r * 1.41);
            best = band ? pick(R.gold, 2.4 + lit * 1.8) : pick(R.bone, 2.2 + lit * 1.9);
          }
        }
        return best;
      });
      // Trichterrand (Goldring) und dunkle Öffnung
      fill(L, (x, y) => {
        const e = ((x - 27.5) / 3.6) ** 2 + ((y - 21) / 8.2) ** 2;
        if (e > 1) return null;
        if (e > 0.62) return y < 17 ? R.gold[4] : y < 25 ? R.gold[3] : R.gold[2];
        return y < 18 || x < 26.5 ? '#160406' : e > 0.3 ? R.red[1] : R.red[2];
      });
    });
    spark(p, 41, 7, WHITE); spark(p, 39, 37, R.red[4]); spark(p, 18, 8, R.red[4], R.red[2]);
    frame(p);
  },
  skill_charge(p) {
    const bg = BG.warrior;
    back(p, bg, 26, 22);
    // Tempo-Streifen hinter dem Schild
    sym(p, bg, (L) => {
      for (const [y, x0, x1, t] of [[13, 7, 22, 2], [20, 4, 20, 2], [27, 6, 21, 2], [34, 9, 22, 2]]) {
        for (let x = x0; x <= x1; x++) {
          const f = (x - x0) / (x1 - x0);
          L.px(x, y, f > 0.6 ? WHITE : f > 0.3 ? R.red[4] : R.red[3]);
          if (f > 0.15) L.px(x, y + 1, f > 0.6 ? R.steel[3] : R.red[2]);
        }
      }
    });
    // Wappenschild, leicht gedreht nach rechts
    sym(p, bg, (L) => {
      const sh = [[18, 9], [39, 9], [40, 22], [36, 32], [28, 40], [21, 33], [17, 23]];
      fill(L, (x, y) => {
        if (!inPoly(sh, x, y)) return null;
        // Rand 2 px (Stahl), Feld rot, Diagonalbalken
        const inner = inPoly([[20.5, 11.5], [36.8, 11.5], [37.6, 22], [34.3, 30.5], [28, 36.7], [22.7, 31.3], [19.6, 22.6]], x, y);
        if (!inner) return pick(R.steel, 3.3 - (x + y - 30) / 22);
        const lit = 3 - (x + y - 30) / 16;
        if (Math.abs((x - 20) - (y - 11) * 0.9) < 2.4) return pick(R.gold, lit + 0.3);
        return pick(R.red, lit - 0.4);
      });
      ball(L, 28.5, 22.5, 3.2, R.steel);
      for (const [x, y] of [[20, 11], [37, 11]]) L.px(x, y, R.steel[4]);
    });
    spark(p, 42, 14, WHITE, R.steel[3]); spark(p, 43, 28, R.red[4]); spark(p, 39, 37, WHITE);
    frame(p);
  },
  skill_earthshatter(p) {
    const bg = BG.warrior;
    back(p, bg, 24, 30);
    // Lichtsäule aus dem Riss (ohne Umriss)
    glow(p, 24, 30, 15, ['#5a1408', '#a03a0c', '#e07018', '#ffb640'], 2.2);
    // Schollen links/rechts
    sym(p, bg, (L) => {
      const left = [[4, 30], [21, 26], [23, 33], [21, 44], [4, 44]];
      const right = [[27, 27], [44, 31], [44, 44], [26, 44], [25, 35]];
      fill(L, (x, y) => {
        const inL = inPoly(left, x, y), inR = inPoly(right, x, y);
        if (!inL && !inR) return null;
        const top = inL ? 30 - (x - 4) * 4 / 17 : 27 + (x - 27) * 4 / 17;
        if (y - top < 1.6) return R.ash[4];
        if (y - top < 3.2) return R.ash[3];
        const crackLine = (Math.abs(x - (inL ? 12 : 35) - (y - 36) * 0.5) < 0.6 && y > top + 4);
        if (crackLine) return R.rock[0];
        return pick(R.rock, 3.3 - (y - top) / 5 - (inR ? 0.8 : 0));
      });
    });
    // Glühender Spalt (Zickzack), auf den Schollen
    sym(p, bg, (L) => {
      const z = [[24, 24], [22, 29], [25.5, 33], [22.5, 38], [24.5, 44]];
      fill(L, (x, y) => {
        for (let i = 0; i < z.length - 1; i++) {
          const [ax, ay] = z[i], [bx, by] = z[i + 1];
          const l = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / l, uy = (by - ay) / l;
          const u = (x - ax) * ux + (y - ay) * uy; if (u < -0.5 || u > l + 0.5) continue;
          const v = Math.abs((x - ax) * -uy + (y - ay) * ux), w = 2.2 - (y - 24) / 24;
          if (v < w * 0.45) return y < 33 ? WHITE : R.fire[3];
          if (v < w) return y < 33 ? R.fire[3] : R.fire[2];
        }
        return null;
      });
    });
    // Kriegshammer schlägt ein
    sym(p, bg, (L) => {
      rod(L, 25, 16, 38, 5, 1.5, R.wood, 3);
      fill(L, (x, y) => {
        const u = (x - 22) * 0.86 + (y - 15) * 0.5, v = (x - 22) * -0.5 + (y - 15) * 0.86;
        if (Math.abs(u) > 5.3 || Math.abs(v) > 8.8) return null;
        if (Math.abs(v) > 7.3) return v < 0 ? R.iron[4] : R.iron[1];
        if (Math.abs(v) < 1.6) return pick(R.gold, 3 - u / 3);
        return pick(R.iron, 3 - (u + v * 0.3) / 3.2);
      });
    });
    // Brocken
    sym(p, bg, (L) => { for (const [x, y, r] of [[9, 20, 2.2], [39, 20, 2.6], [33, 13, 1.6], [12, 12, 1.5]]) ball(L, x, y, r, R.ash); });
    for (const [x, y] of [[16, 24], [31, 22], [27, 17], [20, 19]]) spark(p, x, y, R.fire[3]);
    spark(p, 24, 23, WHITE, R.fire[3]);
    frame(p);
  },

  // ===== Schurke: Schatten-Violett, Gift-Grün ===============================
  skill_shadow(p) {
    const bg = BG.rogue;
    back(p, bg, 30, 22);
    // Nachbilder (flach, ohne Umriss) zeigen den Sprung nach rechts
    const g1 = layer(); hood(g1, 13, null, bg[2]);
    const g2 = layer(); hood(g2, 20, null, bg[3]);
    p.ctx.drawImage(g1.canvas, 0, 0); p.ctx.drawImage(g2.canvas, 0, 0);
    for (const [y, x0, x1] of [[16, 6, 15], [27, 4, 12], [37, 7, 16]]) for (let x = x0; x <= x1; x++) if ((x - x0) % 5 < 4) p.px(x, y, x > x1 - 3 ? R.shade[4] : R.shade[3]);
    // Kapuzengestalt mit glühenden Augen
    sym(p, bg, (L) => hood(L, 29, R.shade));
    spark(p, 41, 9, R.purple[4], R.purple[3]); spark(p, 43, 30, R.purple[4]); spark(p, 10, 9, R.purple[3]);
    frame(p);
  },
  skill_knives(p) {
    const bg = BG.rogue;
    back(p, bg, 24, 26);
    const ox = 24, oy = 43;
    for (const a of [-44, 44, -22, 22, 0]) {
      const r = a * Math.PI / 180, sx = Math.sin(r), cy = -Math.cos(r);
      const at = (d) => [ox + sx * d, oy + cy * d];
      sym(p, bg, (L) => {
        const [g0x, g0y] = at(4), [g1x, g1y] = at(10), [tx, ty] = at(30);
        rod(L, g0x, g0y, g1x, g1y, 1.3, R.leather, 2);
        blade(L, g1x, g1y, tx, ty, 2.3, R.steel, { tip: 7 });
        const [gx, gy] = at(10);
        rod(L, gx - cy * 4, gy + sx * 4, gx + cy * 4, gy - sx * 4, 1.2, R.gold);
      });
    }
    for (const [x, y] of [[24, 12], [12, 19], [37, 17]]) spark(p, x, y, WHITE, R.purple[3]);
    spark(p, 7, 9, R.purple[4]); spark(p, 42, 8, R.purple[4]);
    frame(p);
  },
  skill_poison_blades(p) {
    const bg = BG.rogue;
    back(p, bg, 24, 24);
    glow(p, 24, 25, 15, ['#0e2a0a', '#16461e', '#2a6a16'], 1.1);
    for (const s of [1, -1]) {
      sym(p, bg, (L) => {
        const hx = 24 - s * 15, tx = 24 + s * 15;
        rod(L, hx - s * 4, 43, hx, 38, 1.5, R.leather, 2);
        blade(L, hx + s * 2, 36, tx, 7, 2.6, R.steel, { tip: 7, edge: R.venom[3] });
        rod(L, hx - s * 2.5, 33.5, hx + s * 4.5, 40.5, 1.3, R.gold);
        ball(L, hx - s * 4.5, 43.5, 1.7, R.gold, false);
      });
    }
    // Gifttropfen
    sym(p, bg, (L) => {
      for (const [x, y, r] of [[30, 17, 1.6], [17, 22, 1.8], [33, 30, 2.2], [24, 39, 2.4]]) {
        fill(L, (px, py) => {
          const dx = px - x, dy = py - y;
          const inside = dy >= 0 ? Math.hypot(dx, dy) <= r : Math.abs(dx) <= r * (1 + dy / (r * 2.2));
          if (!inside || dy < -r * 2.2) return null;
          return pick(R.venom, 2.6 + (-dx - dy * 0.6) / r * 1.2);
        });
        L.px(Math.round(x - r * 0.5 - 0.5), Math.round(y - 0.5), R.venom[4]);
      }
    });
    for (const [x, y] of [[12, 14], [37, 13], [8, 30], [41, 36]]) p.px(x, y, R.venom[3]);
    spark(p, 24, 22, WHITE, R.steel[3]);
    frame(p);
  },
  skill_assassinate(p) {
    const bg = BG.rogue;
    back(p, bg, 24, 28);
    // Schädel
    sym(p, bg, (L) => {
      fill(L, (x, y) => {
        const dx = x - 24, dy = y - 30;
        const cran = Math.hypot(dx / 11.5, dy / 10.5) <= 1 && y < 37;
        const jaw = Math.abs(dx) < 7.2 - Math.max(0, y - 40) * 1.2 && y >= 33 && y < 43;
        if (!cran && !jaw) return null;
        // Augenhöhlen, Nase, Zähne
        const eye = (ex) => Math.hypot(x - ex, (y - 32) * 1.15) < 3.3;
        if (eye(19) || eye(29)) return (Math.hypot(x - (x < 24 ? 19 : 29), y - 32.5) < 1.3) ? R.red[4] : '#140810';
        if (Math.abs(dx) < 1.6 - (y - 36) * 0.4 && y > 35.3 && y < 38.5) return '#140810';
        if (y > 39.5 && y < 41.5 && Math.abs(dx) < 6 && Math.floor(x) % 2 === 0) return R.bone[0];
        if (y >= 39.3 && y < 39.8 + 0.2) return R.bone[1];
        return pick(R.bone, 3.3 - (dx + dy) / 9 - (y > 37 ? 0.7 : 0));
      });
    });
    // Blut aus der Wunde
    sym(p, bg, (L) => {
      fill(L, (x, y) => {
        if (Math.hypot(x - 25.5, y - 22.5) < 2.6 && y > 21) return R.red[3];
        if (Math.abs(x - 30.5) < 1.1 && y > 22 && y < 30) return y > 27 ? R.red[2] : R.red[3];
        if (Math.hypot(x - 30.5, y - 30) < 1.6) return R.red[3];
        return null;
      });
      L.px(25, 22, R.red[4]); L.px(30, 29, R.red[4]);
    });
    // Dolch von oben rechts in den Schädel
    sym(p, bg, (L) => {
      blade(L, 34, 9, 24.5, 24, 2.6, R.steel, { tip: 6 });
      rod(L, 31, 5, 38, 11, 1.4, R.gold);
      rod(L, 36, 5, 40, -1, 1.5, R.leather, 2);
      ball(L, 39.5, 5.5, 0.1, R.gold, false);
    });
    spark(p, 29, 12, WHITE); spark(p, 10, 14, R.purple[4], R.purple[3]); spark(p, 40, 20, R.red[4]);
    frame(p);
  },

  // ===== Waldläufer: Moosgrün, Holz =========================================
  skill_arrows(p) {
    const bg = BG.ranger;
    back(p, bg, 22, 24);
    for (const deg of [15, 75, 30, 60, 45]) {
      const a = deg * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a);
      sym(p, bg, (L) => arrow(L, 6 + uy * -0 + 0, 42, 6 + ux * 35, 42 + uy * 35));
    }
    spark(p, 41, 31, WHITE); spark(p, 18, 6, WHITE); spark(p, 33, 12, R.moss[4], R.moss[3]);
    frame(p);
  },
  skill_pierce(p) {
    const bg = BG.ranger;
    back(p, bg, 24, 24);
    // Lichtspur entlang der Flugbahn
    glow(p, 24, 24, 13, ['#22381a', '#3a5a2a', '#5e8440'], 1.8);
    // Zielscheibe
    sym(p, bg, (L) => {
      fill(L, (x, y) => {
        const dx = x - 23, dy = y - 25, d = Math.hypot(dx / 0.82, dy);
        if (d > 11) return null;
        const lit = -(dx + dy) / 22;
        if (d > 9.4) return pick(R.wood, 2.4 + lit * 2);
        if (d > 7) return pick(R.bone, 2.6 + lit * 1.6);
        if (d > 4.4) return pick(R.red, 2.6 + lit * 1.6);
        if (d > 2.2) return pick(R.bone, 2.8 + lit * 1.4);
        return R.red[3];
      });
      // Risse
      L.line(23, 25, 17, 18, R.wood[0]); L.line(23, 25, 31, 32, R.wood[0]); L.line(23, 25, 18, 33, R.wood[1]);
    });
    // Splitter hinter der Scheibe
    for (const [x, y] of [[36, 13], [39, 17], [34, 9]]) { p.rect(x, y, 2, 1, R.wood[4]); p.px(x, y + 1, R.wood[2]); }
    // Pfeil quer durch
    sym(p, bg, (L) => arrow(L, 5, 41, 43, 6, 1.6, 7, 4.2));
    // Tempo-Streifen
    for (const [x, y, l] of [[7, 32, 6], [12, 39, 5]]) for (let i = 0; i < l; i++) p.px(x + i, y - i, i > l - 3 ? WHITE : R.moss[4]);
    spark(p, 41, 7, WHITE, R.moss[4], true);
    frame(p);
  },
  skill_fire_trap(p) {
    const bg = BG.ranger;
    back(p, bg, 24, 24);
    glow(p, 24, 30, 14, ['#3a1206', '#7a2208', '#c8420c'], 1.8);
    // Hintere Hälfte des Fangeisens (Zahnkranz), dann Flamme, dann vordere Hälfte
    const jaw = (front) => (L) => fill(L, (x, y) => {
      const dx = (x - 24) / 18, dy = (y - 35) / 7, e = dx * dx + dy * dy;
      if (front !== (y >= 35)) return null;
      if (e <= 1 && e > 0.62) return pick(R.iron, (front ? 2.4 : 3.2) - dx * 1.2 - (e > 0.88 ? 0.8 : 0));
      // Zähne: Zacken über dem Ring, nach oben
      const ry = 35 - 7 * Math.sqrt(Math.max(0, 1 - dx * dx)) * (front ? -1 : 1) - (front ? 0.5 : 0);
      const ph = ((x - 24) / 3.2 + 100) % 1, th = 4.2 * (1 - Math.abs(ph - 0.5) * 2);
      if (Math.abs(dx) < 0.92 && y < ry - 1.6 && y > ry - 1.6 - th) return ph < 0.5 ? R.iron[4] : R.iron[2];
      return null;
    });
    sym(p, bg, jaw(false));
    sym(p, bg, (L) => { flame(L, 24, 35, 28, 8, R.fire, 0.6); flame(L, 16.5, 35, 14, 3.6, R.fire, 2); flame(L, 31.5, 35, 16, 3.8, R.fire, 4); });
    sym(p, bg, (L) => {
      jaw(true)(L);
      // Federn links/rechts + Kette
      for (const s of [-1, 1]) { rod(L, 24 + s * 17, 35, 24 + s * 21, 41, 1.6, R.iron); ball(L, 24 + s * 21, 41.5, 1.8, R.iron, false); }
      ball(L, 24, 40, 2.4, R.gold);
    });
    for (const [x, y] of [[12, 13], [36, 9], [30, 5], [10, 24], [39, 21]]) spark(p, x, y, R.fire[3]);
    spark(p, 21, 10, WHITE, R.fire[2]);
    frame(p);
  },
  skill_arrow_rain(p) {
    const bg = BG.ranger;
    back(p, bg, 24, 18);
    // Boden mit Zielkreis
    sym(p, bg, (L) => {
      fill(L, (x, y, ix, iy) => {
        if (y < 35) return null;
        const e = ((x - 24) / 17) ** 2 + ((y - 39) / 3.6) ** 2;
        if (e < 1 && e > 0.7) return R.ember[3];
        if (y < 36.5) return (ix % 3 === 0) ? R.moss[4] : R.moss[3];
        return dith(R.rock, 3.2 - (y - 35) / 3, ix, iy);
      });
    });
    // Pfeile mit der Spitze nach unten; Federn hell, Spitze groß
    const list = [[12, 5, 24], [36, 4, 23], [24, 12, 39], [8, 20, 38], [40, 21, 38]];
    for (const [x, y0, y1] of list) {
      for (let i = 1; i < 5; i++) p.px(x + 2.5 + 0.14 * i, y0 - i * 1.5, i < 3 ? R.moss[4] : R.moss[3]);
      sym(p, bg, (L) => arrow(L, x + 2.5, y0, x, y1, 1.3, 7, 3.6, R.bone, 5));
    }
    for (const [x, y] of [[24, 40], [8, 39], [40, 39]]) { p.px(x - 3, y, R.ash[4]); p.px(x + 3, y - 1, R.ash[3]); p.px(x - 4, y - 1, R.ash[3]); }
    spark(p, 24, 31, WHITE); spark(p, 37, 26, WHITE, R.moss[3]);
    frame(p);
  },
  // ===== Glutmagier: Glut-Orange, Arkan-Violett =============================
  skill_flame_nova(p) {
    const bg = BG.mage;
    back(p, bg, 24, 24, 0.85);
    glow(p, 24, 24, 9, ['#7a2208', '#c8420c', '#f07a1c'], 2.4);
    sym(p, bg, (L) => fill(L, (x, y) => {
      const dx = x - 24, dy = y - 24, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const tong = Math.max(0, Math.sin(a * 8 + 0.4)) ** 2 * 5;
      const r0 = 12, r1 = 15.5 + tong;
      if (d < r0 || d > r1 || x < 4.5 || y < 4.5 || x > 43.5 || y > 43.5) return null;
      const t = (d - r0) / (r1 - r0);
      return pick(R.fire, 4.2 - t * 4.4 - (dx + dy) / 40);
    }));
    sym(p, bg, (L) => ball(L, 24, 24, 4.5, ['#c8420c', '#f07a1c', '#ffb640', '#fff0b0', '#ffffff']));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; spark(p, Math.round(24 + Math.cos(a) * 8), Math.round(24 + Math.sin(a) * 8), R.fire[3]); }
    spark(p, 9, 9, WHITE, R.fire[2]); spark(p, 40, 39, R.fire[3]);
    frame(p);
  },
  skill_blink(p) {
    const bg = BG.mage;
    back(p, bg, 24, 24, 0.75);
    glow(p, 24, 24, 17, ['#1a0a2e', '#3a1466', '#6a2cb0'], 1.8);
    // Arkaner Wirbel (zwei Arme)
    sym(p, bg, (L) => fill(L, (x, y) => {
      const dx = x - 24, dy = y - 24, d = Math.hypot(dx, dy);
      if (d < 4 || d > 18.5) return null;
      const a = Math.atan2(dy, dx);
      for (const off of [0, Math.PI]) {
        let ph = (a + off - d * 0.24) % (2 * Math.PI); ph = (ph + 2 * Math.PI) % (2 * Math.PI);
        const w = 0.9 - d / 30;
        if (ph < w) return pick(R.arcane, 4 - d / 6 - (ph / w) * 1.3);
      }
      return null;
    }));
    // Vierzackiger Stern im Kern
    sym(p, bg, (L) => fill(L, (x, y) => {
      const dx = Math.abs(x - 24), dy = Math.abs(y - 24);
      const s = Math.pow(dx, 0.5) + Math.pow(dy, 0.5);
      if (s > 3.4) return null;
      return s < 1.8 ? WHITE : s < 2.7 ? R.arcane[3] : R.arcane[2];
    }));
    for (const [x, y] of [[9, 12], [38, 9], [41, 34], [12, 38], [33, 21]]) spark(p, x, y, WHITE, R.arcane[2]);
    frame(p);
  },
  skill_fireball(p) {
    const bg = BG.mage;
    back(p, bg, 28, 26, 0.85);
    // Feuerschweif nach links, Kugel rechts
    sym(p, bg, (L) => {
      fill(L, (x, y) => {
        const cx = 30, cy = 25, dx = x - cx, dy = y - cy;
        if (dx > 0 || x < 4.5) return null;
        const t = -dx / 25; if (t > 1) return null;
        const wob = Math.sin(dx * 0.55) * 1.6 * t + Math.sin(dx * 0.23 + 1) * 1.4 * t;
        const hw = 9.5 * (1 - t) ** 0.9 + 0.3, vv = dy - wob - t * 3;
        if (Math.abs(vv) > hw) return null;
        const c = 1 - Math.abs(vv) / hw;
        return pick(R.fire, c * 3.4 - t * 2.4 + 0.6);
      });
      ball(L, 30, 25, 9.5, ['#c8420c', '#f07a1c', '#ffb640', '#fff0b0', '#ffffff']);
      ball(L, 28.5, 23.5, 4.5, ['#ffb640', '#fff0b0', '#fff0b0', '#ffffff', '#ffffff'], false);
    });
    for (const [x, y] of [[8, 10], [13, 40], [42, 11], [6, 31]]) spark(p, x, y, R.fire[2]);
    spark(p, 41, 39, R.fire[3], R.fire[1]);
    frame(p);
  },
  skill_meteor(p) {
    const bg = BG.mage;
    back(p, bg, 20, 30, 0.85);
    // Glutschweif von oben rechts
    sym(p, bg, (L) => {
      axis(L, 18, 30, 44, 4, (u, v, Ln) => {
        if (u < 0 || u > Ln) return null;
        const t = u / Ln, hw = 9.5 * (1 - t) ** 1.1 + Math.sin(u * 0.7) * 1.1 * t;
        if (Math.abs(v) > hw) return null;
        const c = 1 - Math.abs(v) / hw;
        return pick(R.fire, c * 2.8 + 1.2 - t * 3.5);
      });
    });
    // Glühender Fels mit Lava-Adern
    sym(p, bg, (L) => {
      fill(L, (x, y) => {
        const dx = x - 18, dy = y - 30, a = Math.atan2(dy, dx);
        const r = 10 + Math.sin(a * 5) * 0.9 + Math.sin(a * 3 + 1) * 0.6;
        const d = Math.hypot(dx, dy);
        if (d > r) return null;
        return pick(R.rock, 2.7 + (-dx - dy) / 9 - (d / r) * 0.7 + (dx + dy > 6 ? -0.6 : 0));
      });
      // Lava-Adern
      for (const [a, b, c, d2, col] of [[13, 25, 18, 30, R.fire[3]], [18, 30, 16, 36, R.fire[2]], [18, 30, 24, 32, R.fire[2]], [21, 23, 18, 30, R.fire[3]]]) L.line(a, b, c, d2, col);
      L.px(18, 30, WHITE);
      // Glutrand auf der Flugseite (oben rechts)
      fill(L, (x, y) => {
        const dx = x - 18, dy = y - 30, d = Math.hypot(dx, dy);
        return (d > 8.2 && d < 10.4 && dx - dy > 7) ? R.fire[3] : null;
      });
    });
    for (const [x, y] of [[8, 16], [33, 37], [6, 43 - 3], [40, 20], [30, 8]]) spark(p, x, y, R.fire[3]);
    spark(p, 10, 23, WHITE); spark(p, 37, 28, WHITE, R.fire[2]);
    frame(p);
  },
};

// Pfeil: Schaft (Holz), Spitze (Stahl), Federn (rot) – von (x0,y0) Ende nach (x1,y1) Spitze
function arrow(L, x0, y0, x1, y1, sr = 1.2, hl = 6, hw = 3.4, fl = R.red, fln = 8) {
  const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const hx = x1 - ux * hl, hy = y1 - uy * hl;
  rod(L, x0, y0, hx + ux, hy + uy, sr, R.wood);
  // Federn
  axis(L, x0, y0, x0 + ux * fln, y0 + uy * fln, (u, v, l, lv) => {
    if (u < 0 || u > l) return null;
    const w = sr + 0.6 + (l - u) * (fln > 6 ? 0.28 : 0.2);
    if (Math.abs(v) > w || Math.abs(v) < sr - 0.2) return null;
    return lv > 0 ? fl[4] : fl[2];
  });
  // Spitze
  axis(L, hx, hy, x1, y1, (u, v, l, lv) => {
    if (u < -0.6 || u > l) return null;
    const w = hw * (1 - u / l) + 0.3;
    if (Math.abs(v) > w) return null;
    return lv > w * 0.3 ? R.steel[4] : lv > -w * 0.4 ? R.steel[3] : R.steel[1];
  });
}
