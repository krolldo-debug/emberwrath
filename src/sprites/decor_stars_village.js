import { createRng, hash2 } from '../core/math.js';
import { mk, fpoly, lump, canopy, pal32 } from './decor_ashwood.js';
import { col32 } from '../gfx/Fine.js';
import {
  PEARL, ROSE, GOLD, WOOD, LAMP, CRY, LEAF, BUSH, LAMP_LIGHT, CRY_LIGHT, P, G, Wd,
  pearlWall, plinth, cornice, roof, archWin, archDoor, footShade,
} from './decor_starcity.js';

// Siedlungen der Sternenscherben außerhalb der Hauptstadt (Grafik-Patch November): die Gärtnerhäuser von Morgentau
// (Treibende Gärten) und die Schürferhütten von Funkenruh (Splitterweiten). Gleiche Bauteile und Lichtrichtung wie
// Sternhafen (decor_starcity.js: Licht von links oben, Fassade frontal, schmale Schattenseite rechts), aber ländlich:
// Fachwerk über Perlsteinsockel, bemooste Dächer, Rosenranken, Blumenkästen; in Funkenruh Bretter, Teerpappe,
// Planen und Kristalllaternen. Alles Stufe B (fein).

const VERD = ['#0e2224', '#163634', '#1e4c48', '#2a6860', '#3c8878', '#58a890', '#88ccb0'];
const THATCH = ['#2a1c12', '#46301a', '#684622', '#8a5e2c', '#ac7a3a', '#cc9a50', '#e8bc70'];
const PLAST = ['#3a3040', '#5a4e5a', '#857a80', '#b0a4a4', '#d4c8c0', '#ece2d8', '#fff8ee'];
const TIMB = ['#160e12', '#2a1a1c', '#40282a', '#583834', '#704a40'];
const MOSS = ['#1c2834', '#2e434c', '#3d5a5a', '#507468', '#6c927c', '#97b896'];
const IRON = ['#141020', '#241e34', '#3a3250', '#585070', '#7a7290'];
const PLANK = ['#140c10', '#22161a', '#342222', '#4a302a', '#624034', '#7c5440', '#9a6c50'];
const TAR = ['#1a1826', '#2a2838', '#3c3a52', '#504e6a', '#6c6a88'];
const TARP = ['#1c2236', '#2a3450', '#3c4a6c', '#566690', '#7a8cb2', '#a6b6d2'];
const AMBER = ['#3a1408', '#7a2a0c', '#c4501a', '#f08a2c', '#ffc060', '#fff0c0'];
const Pl = pal32(PLAST), Tb = pal32(TIMB), Pk = pal32(PLANK), Tr = pal32(TAR);

// Fachwerkwand (ein Geschoss): Putzfelder hell, Balken dunkel, Streben als halbes Andreaskreuz
function timber(p, x0, x1, y0, y1, seed) {
  const posts = [x0, x0 + (x1 - x0) * 0.33, x0 + (x1 - x0) * 0.67 - 1, x1 - 2.5], fh = y1 - y0;
  p.scan(x0, y0, x1, y1, (x, y) => {
    const ly = y - y0;
    if (ly < 1.5 || y > y1 - 1.5) return Tb[ly < 0.5 ? 4 : 2];
    for (const px of posts) if (x >= px && x < px + 2.5) return Tb[x < px + 1 ? 4 : 2];
    const seg = x < posts[1] ? 0 : x < posts[2] ? 1 : 2;
    if (seg !== 1) {
      const a = seg === 0 ? posts[0] + 2.5 : posts[2] + 2.5, b = seg === 0 ? posts[1] : posts[3];
      const fx = (x - a) / (b - a), fy = (ly - 1.5) / (fh - 3);
      if (Math.abs(fy - (seg === 0 ? fx : 1 - fx)) < 0.09) return Tb[3];
    }
    let i = x > x1 - 5 ? 3 : 5;
    if (hash2(Math.floor(x / 2), Math.floor(y / 2), seed) < 0.06) i -= 1;
    if (ly < 3.5) i = Math.min(i, 4);
    return Pl[i];
  });
}

// Fenster mit Läden und Blumenkasten darunter (warm erleuchtet)
function cottageWin(p, g, x, y, w, h, shut, seed) {
  const L = pal32(LAMP), S = pal32(shut);
  p.scan(x - 1, y - 1, x + w + 1, y + h + 1, (xx, yy) => (xx < x || yy < y ? Tb[4] : xx > x + w || yy > y + h ? Tb[1] : 0));
  p.scan(x, y, x + w, y + h, (xx, yy) => {
    if (Math.abs(xx - (x + w / 2)) < 0.3 || Math.abs(yy - (y + h * 0.45)) < 0.25) return Tb[2];
    return xx < x + w / 2 && yy < y + h * 0.45 ? L[4] : L[3];
  });
  g.each(x, y, x + w, y + h, () => LAMP[3]);
  for (const sx of [x - 3.5, x + w + 1]) p.scan(sx, y - 0.5, sx + 2.5, y + h + 0.5, (xx, yy) => (Math.floor(yy) % 2 === 0 ? S[2] : xx < sx + 1 ? S[5] : S[4]));
  // Blumenkasten
  p.scan(x - 2.5, y + h + 1, x + w + 2.5, y + h + 3.5, (xx, yy) => (yy < y + h + 1.5 ? Wd[5] : xx > x + w + 1 ? Wd[1] : Wd[3]));
  for (let xx = x - 2; xx < x + w + 2; xx += 1) {
    const k = hash2(Math.floor(xx * 2), seed, 5101);
    p.dot(xx, y + h + 0.5 - (k < 0.5 ? 0.5 : 0), k < 0.45 ? BUSH[3] : BUSH[4]);
    if (k < 0.35) p.dot(xx + 0.5, y + h - 0.5 - (k < 0.15 ? 0.5 : 0), [LEAF[5], LEAF[4], GOLD[4], CRY[4]][Math.floor(k * 11) % 4]);
  }
}

// Rosenranke an der Hauswand: Stängel wachsen von unten hoch (dunkel), Blattbüschel und Blüten
function roseVine(p, x, bot, top, seed) {
  const rng = createRng(seed);
  for (let s = 0; s < 2; s++) {
    let vx = x + s * 3 - 1.5, vy = bot;
    while (vy > top + rng.range(0, 6)) {
      p.dot(vx, vy, BUSH[2]);
      vx += rng.range(-0.5, 0.5); vy -= 0.5;
      if (rng.next() < 0.55) {
        const lx = vx + rng.range(-2, 2), lyy = vy + rng.range(-0.5, 0.5);
        p.dot(lx, lyy, BUSH[rng.next() < 0.5 ? 3 : 4]); p.dot(lx + 0.5, lyy, BUSH[3]); p.dot(lx, lyy + 0.5, BUSH[2]);
        if (rng.next() < 0.3) { p.dot(lx, lyy - 0.5, LEAF[5]); p.dot(lx + 0.5, lyy - 0.5, LEAF[4]); p.dot(lx, lyy, LEAF[3]); }
      }
    }
  }
}

// Moospolster und Blütenblätter auf einem Dach (nach roof(): nur dort, wo schon Dach ist – Grenzen grob abgeschätzt)
function roofMoss(p, x0, x1, top, bot, ins, seed) {
  const rng = createRng(seed), H = bot - top;
  for (let i = 0; i < 18; i++) {
    const y = top + H * (0.55 + Math.sqrt(rng.next()) * 0.42), k = 1 - (y - top) / H;
    const a = x0 + ins * k + 3, b = x1 - ins * k - 3;
    const x = a + rng.next() * (b - a), r = 0.8 + rng.next() * 1.1;
    p.scan(x - r * 1.8, y - r * 0.7, x + r * 1.8, y + r * 0.7, (xx, yy) => {
      const d = ((xx - x) / (r * 1.8)) ** 2 + ((yy - y) / (r * 0.7)) ** 2;
      return d > 1 ? 0 : col32(MOSS[yy < y - r * 0.2 && xx < x ? 4 : d > 0.6 ? 2 : 3]);
    });
    if (rng.next() < 0.3) p.dot(x - 0.5, y - r * 0.5, LEAF[4]);
  }
}

function chimney(p, x, top, bot) {
  p.scan(x, top, x + 6, bot, (xx, y) => (y < top + 1 ? P[6] : xx < x + 2 ? P[5] : xx > x + 4.5 ? P[2] : P[4]));
  p.scan(x - 1, top - 1, x + 7, top + 1, (xx, y) => (y < top ? P[6] : P[3]));
}

// ---------------------------------------------------------------- Gärtnerhäuser (Morgentau)
// v0 Fachwerk mit Rosadach und Rosenranke, v1 Perlstein mit Grünspandach und Schuppen mit Gießkannen,
// v2 Fachwerk mit Strohdach (Goldgarten der Terrassen), Rundfenster im Giebel und Bienenkörben
function gardenCottage(v) {
  const W = 92, H = 98, cx = 42, bot = H - 2, seed = 5200 + v * 19;
  const R = [ROSE, VERD, THATCH][v];
  return mk(W, H, (p, g) => {
    const x0 = 14, x1 = 70, mid = bot - 24, wallTop = bot - 44;
    footShade(p, cx + 4, bot, 40, 3.5);
    // Schuppen rechts (v1) bzw. Bienenkörbe (v2) stehen hinter der Hauswand
    if (v === 1) {
      p.scan(x1, bot - 20, x1 + 16, bot - 2, (x, y) => {
        const lx = Math.floor((x - x1) / 3);
        return y > bot - 3 ? Wd[1] : (x - x1) % 3 < 0.5 ? Wd[1] : x > x1 + 14.5 ? Wd[2] : Wd[3 + (hash2(lx, 1, seed) < 0.4 ? 1 : 0)];
      });
      fpoly(p, [[x1 - 1, bot - 26], [x1 + 18, bot - 19], [x1 + 18, bot - 17], [x1 - 1, bot - 22]], (x, y) => pal32(VERD)[y < bot - 23 ? 5 : 3]);
      // Gießkannen
      for (const [gx, c] of [[x1 + 5, IRON[3]], [x1 + 11, GOLD[3]]]) {
        p.scan(gx - 2, bot - 7, gx + 2, bot - 2, (x) => col32(x < gx ? c : IRON[2]));
        p.fline(gx + 2, bot - 6, gx + 4.5, bot - 8, IRON[2], 0.5);
      }
    }
    if (v === 2) {
      for (const bx of [x1 + 7, x1 + 15]) {
        p.scan(bx - 1, bot - 4, bx + 1, bot - 1, () => Wd[2]);
        lump(p, bx, bot - 8, 4, 4.5, THATCH, { lo: 2, hi: 6 });
        for (let k = 0; k < 3; k++) p.scan(bx - 3.5, bot - 11 + k * 2.5, bx + 3.5, bot - 10.5 + k * 2.5, () => col32(THATCH[2]));
        p.dot(bx - 0.5, bot - 6, '#1a1008');
      }
    }
    // Erdgeschoss Perlstein, Obergeschoss Fachwerk (v1 ganz Perlstein)
    pearlWall(p, x0, x1, v === 1 ? wallTop : mid, bot - 4, seed);
    if (v !== 1) {
      timber(p, x0 - 1.5, x1 + 1.5, wallTop, mid, seed);
      p.scan(x0 - 2, mid - 1, x1 + 2, mid + 1, (x, y) => (y < mid ? Tb[4] : Tb[1]));
    } else cornice(p, x0 - 1, x1 + 1, mid - 1);
    plinth(p, x0 - 1, x1 + 1, bot - 4, bot);
    // Fenster und Tür
    const sh = [VERD, ROSE, VERD][v];
    archDoor(p, g, v === 1 ? x1 - 16 : x0 + 14, bot - 3, 10, 18);
    cottageWin(p, g, v === 1 ? x0 + 8 : x1 - 17, mid + 6, 8, 8, sh, seed + 1);
    cottageWin(p, g, x0 + 8, wallTop + 6, 7, 8, sh, seed + 2);
    cottageWin(p, g, x1 - 16, wallTop + 6, 7, 8, sh, seed + 3);
    // Dach: steiler Walm, bemoost; v2 Stroh mit dickem Rand
    roof(p, x0 - 6, x1 + 6, wallTop - 34, wallTop + 1, R, seed, 13);
    if (v !== 2) roofMoss(p, x0 - 6, x1 + 6, wallTop - 34, wallTop + 1, 13, seed + 7);
    else p.scan(x0 - 7, wallTop - 1, x1 + 7, wallTop + 2, (x, y) => pal32(THATCH)[y < wallTop ? 5 : y < wallTop + 1 ? 3 : 1]);
    // Gaube mit Rundfenster (v0, v2)
    if (v !== 1) {
      const gx = cx - 7, gy = wallTop - 20;
      p.scan(gx, gy, gx + 14, gy + 12, (x, y) => (x > gx + 12 ? Pl[3] : y < gy + 0.5 ? Pl[6] : Pl[5]));
      const ox = gx + 7, oy = gy + 6.5;
      p.scan(ox - 4, oy - 4, ox + 4, oy + 4, (x, y) => {
        const d = Math.hypot(x - ox, y - oy);
        return d > 3.6 ? 0 : d > 2.6 ? Tb[x < ox ? 4 : 2] : Math.abs(x - ox) < 0.3 || Math.abs(y - oy) < 0.3 ? Tb[2] : col32(x < ox && y < oy ? LAMP[4] : LAMP[3]);
      });
      g.oval(ox, oy, 2.4, 2.4, LAMP[3]);
      roof(p, gx - 3, gx + 17, gy - 8, gy + 1, R, seed + 2, 8);
    }
    chimney(p, v === 1 ? x0 + 4 : x1 - 12, wallTop - 42, wallTop - 20);
    // Rosenranke (v0 links, v1 an der Tür, v2 rechts)
    if (v === 0) roseVine(p, x0 + 2, bot - 3, wallTop - 4, seed + 11);
    if (v === 1) roseVine(p, x1 - 23, bot - 3, mid - 6, seed + 11);
    if (v === 2) roseVine(p, x1 - 1, bot - 3, wallTop + 2, seed + 11);
    // Laterne neben der Tür
    const lx = v === 1 ? x1 - 23 : x0 + 22;
    p.scan(lx, bot - 22, lx + 3, bot - 18, (x, y) => (y < bot - 21.5 ? col32(IRON[2]) : col32(LAMP[x < lx + 1.5 ? 4 : 3])));
    g.oval(lx + 1.5, bot - 20, 2, 2.4, LAMP[4]);
  }, { ax: cx, ay: bot, b: true, box: [-30, -22, v === 0 ? 30 : 36, 1], extra: { smoke: { dx: v === 1 ? -21 : 20, dy: -84, rate: 2 } },
    light: { dx: 0, dy: -18, radius: 64, color: LAMP_LIGHT, intensity: 0.55 } });
}

// Gartenbeet: niedrige Perlsteineinfassung, Erde, Reihen aus Blüten oder Kräutern (v0 Rosen, v1 Sternlilien, v2 Kräuter)
function gardenBed(v) {
  const W = 40, H = 22, cx = 20, bot = H - 2, rng = createRng(5300 + v);
  const bloom = [[LEAF[3], LEAF[4], LEAF[5]], [CRY[3], CRY[4], CRY[5]], [GOLD[3], GOLD[4], GOLD[5]]][v];
  return mk(W, H, (p) => {
    p.scan(2, 6, W - 2, bot, (x, y) => (y < 6.5 || x < 2.5 ? P[6] : y > bot - 1 || x > W - 3 ? P[2] : y < 8 || x < 4 || x > W - 4.5 || y > bot - 2.5 ? P[4] : col32(y % 3 < 1 ? '#2a1c22' : '#3a2a2c')));
    const plants = [];
    for (let row = 0; row < 2; row++) for (let x = 7 + row * 2.5; x < W - 6; x += 5) plants.push([x, 10 + row * 4, rng.next()]);
    for (const [x, y] of plants) lump(p, x, y - 1, 2.6, 2.2, BUSH, { lo: 1, hi: 5 });
    for (const [x, y, k] of plants) {
      if (v === 2 && k > 0.5) continue;
      for (const [ox, oy] of [[-1, -2.5], [1, -2], [0, -1]]) { p.dot(x + ox - 0.5, y + oy, bloom[0]); p.dot(x + ox, y + oy, bloom[1]); p.dot(x + ox, y + oy - 0.5, bloom[2]); }
    }
  }, { ax: cx, ay: bot, b: true, box: [-17, -6, 17, 1], extra: { low: true } });
}

// Ziehbrunnen des Dorfs: runde Perlsteinbrüstung, Holzgestell mit kleinem Rosadach, Eimer an der Kurbel
function villageWell() {
  const W = 40, H = 52, cx = 20, bot = H - 2;
  return mk(W, H, (p, g) => {
    footShade(p, cx, bot, 17, 2.6);
    // Brüstung (Zylinder, Quaderreihen)
    p.scan(cx - 13, bot - 14, cx + 13, bot - 1, (x, y) => {
      const rel = (x - cx) / 13, row = Math.floor((bot - y) / 4), ly = (bot - y) % 4;
      const seg = Math.floor((rel + 1) * 4 + (row & 1) * 0.5);
      let i = rel < -0.5 ? 6 : rel < 0 ? 5 : rel < 0.55 ? 4 : 3;
      if (ly < 0.5 || Math.abs((rel + 1) * 4 + (row & 1) * 0.5 - Math.round((rel + 1) * 4 + (row & 1) * 0.5)) < 0.05) i -= 2;
      if (hash2(seg, row, 5401) < 0.15) i -= 1;
      return P[Math.max(1, i)];
    });
    p.scan(cx - 13, bot - 17, cx + 13, bot - 13, (x, y) => (y < bot - 16.5 ? P[6] : Math.abs(x - cx) < 10 && y > bot - 15.5 ? col32(y < bot - 14.5 ? '#16304a' : '#20486a') : P[5]));
    g.each(cx - 6, bot - 15.5, cx + 6, bot - 14, () => '#4a92b8');
    // Gestell und Dach
    for (const px of [cx - 12, cx + 10]) p.scan(px, bot - 40, px + 2, bot - 15, (x) => Wd[x < px + 1 ? 5 : 2]);
    p.fline(cx - 11, bot - 32, cx + 11, bot - 32, Wd[3], 1);
    p.oval(cx + 12.5, bot - 32, 1.5, 1.5, IRON[2]);
    p.fline(cx, bot - 31, cx, bot - 24, '#b0a080', 0.5);
    p.scan(cx - 2.5, bot - 24, cx + 2.5, bot - 20, (x, y) => (y < bot - 23.5 ? col32(IRON[3]) : x < cx ? Wd[4] : Wd[2]));
    fpoly(p, [[cx, bot - 50], [cx - 17, bot - 39], [cx + 17, bot - 39]], (x, y) => {
      const row = Math.floor((y - (bot - 50)) / 2.5), u = (((x + (row & 1) * 1.5) % 3) + 3) % 3;
      return pal32(ROSE)[y > bot - 40 ? 1 : u < 0.5 ? 3 : x < cx ? 5 : 4];
    });
    roofMoss(p, cx - 17, cx + 17, bot - 50, bot - 39, 16, 5402);
  }, { ax: cx, ay: bot, b: true, box: [-13, -7, 13, 1] });
}

// ---------------------------------------------------------------- Schürferhütten (Funkenruh)
// Bretterhütte auf Feldsteinsockel, Pultdach mit Teerpappe (geflickt), Plane als Vordach über Kisten, Ofenrohr,
// Kristalllaterne am Dachbalken. v0 Vordach rechts, v1 Anbau links mit Erzsäcken und angelehnter Spitzhacke.
function minerHut(v) {
  const W = 86, H = 74, cx = v ? 46 : 36, bot = H - 2, seed = 5500 + v * 13;
  return mk(W, H, (p, g) => {
    const x0 = cx - 24, x1 = cx + 24, wallTop = bot - 30;
    footShade(p, cx + (v ? -6 : 8), bot, 40, 3.5);
    // Vordach / Anbau hinter der Hütte
    if (!v) {
      fpoly(p, [[x1 - 2, wallTop + 2], [x1 + 30, wallTop + 10], [x1 + 30, wallTop + 13], [x1 - 2, wallTop + 6]], (x, y) => {
        const fold = Math.floor((x - x1) / 6) & 1;
        return pal32(TARP)[y < wallTop + 5 + (x - x1) * 0.25 ? 4 - fold : 2 - fold];
      });
      for (const px of [x1 + 27]) p.scan(px, wallTop + 12, px + 1.5, bot - 1, (x) => Wd[x < px + 0.8 ? 4 : 2]);
      // Kisten und Fass unter dem Vordach
      const crate = (x, y, w, h) => p.scan(x, y, x + w, y + h, (xx, yy) => (yy < y + 0.6 ? Pk[6] : xx < x + 0.6 ? Pk[5] : xx > x + w - 0.6 || yy > y + h - 0.6 ? Pk[1] : Math.abs((xx - x) - (yy - y) * (w / h)) < 0.6 ? Pk[5] : Pk[3]));
      crate(x1 + 4, bot - 11, 10, 10); crate(x1 + 15, bot - 9, 9, 8); crate(x1 + 7, bot - 19, 9, 8);
      for (const [cxx, t] of [[x1 + 19, 3], [x1 + 21, 5]]) { p.fline(cxx, bot - 9, cxx + 0.5, bot - 9 - t, CRY[4], 1); g.dot(cxx, bot - 10, CRY[3]); }
    } else {
      p.scan(x0 - 20, wallTop + 8, x0 + 1, bot - 2, (x, y) => {
        const lx = Math.floor((x - x0) / 3);
        return y > bot - 3 ? Pk[1] : (x - x0) % 3 < 0.5 ? Pk[1] : Pk[2 + (hash2(lx, 2, seed) < 0.4 ? 1 : 0)];
      });
      fpoly(p, [[x0 + 2, wallTop + 2], [x0 - 22, wallTop + 9], [x0 - 22, wallTop + 12], [x0 + 2, wallTop + 6]], (x, y) => Tr[y < wallTop + 5 + (x0 - x) * 0.25 ? 4 : 2]);
      // Erzsäcke und Spitzhacke
      for (const [sx, sy] of [[x0 - 15, bot - 6], [x0 - 8, bot - 5], [x0 - 12, bot - 11]]) {
        lump(p, sx, sy, 4, 3.6, ['#2a2420', '#463a2e', '#62503c', '#7e6a4e', '#9a8664'], { lo: 1, hi: 4 });
        p.dot(sx - 0.5, sy - 3.5, CRY[4]); g.dot(sx - 0.5, sy - 3.5, CRY[3]);
      }
      p.fline(x0 - 3, bot - 2, x0 + 2, bot - 22, Wd[4], 1);
      p.fline(x0 - 2, bot - 22, x0 + 6, bot - 20, IRON[3], 1.2);
    }
    // Feldsteinsockel
    p.scan(x0 - 1, bot - 5, x1 + 1, bot, (x, y) => {
      const cell = Math.floor((x - x0) / 5 + (Math.floor((bot - y) / 2.5) & 1) * 0.5), ly = (bot - y) % 2.5;
      let i = x > x1 - 3 ? 2 : 4;
      if (ly < 0.5 || hash2(cell, Math.floor((bot - y) / 2.5), seed) < 0.18) i -= 2;
      return pal32(['#161a2a', '#242a3e', '#343c54', '#48526c', '#606c86', '#8490a8'])[i];
    });
    // Bretterwand (senkrecht), Licht links
    p.scan(x0, wallTop, x1, bot - 5, (x, y) => {
      const lx = Math.floor((x - x0) / 3.2), f = (x - x0) - lx * 3.2;
      if (f < 0.5) return Pk[1];
      let i = x > x1 - 4 ? 2 : 4 - (hash2(lx, 3, seed) < 0.3 ? 1 : 0);
      if (y - wallTop < 3) i = Math.min(i, 2);
      if (hash2(lx, Math.floor(y / 6), seed + 1) < 0.05) i -= 1;   // Astloch / Flicken
      return Pk[Math.max(1, i)];
    });
    for (const yy of [wallTop + 9, bot - 12]) p.scan(x0, yy, x1, yy + 1.5, (x, y) => Pk[y < yy + 0.6 ? 6 : 2]);
    // Tür (Bretter, Lichtspalt) und Fenster mit warmem Licht
    const dx = v ? x1 - 15 : x0 + 8;
    p.scan(dx, bot - 23, dx + 10, bot - 5, (x, y) => (y < bot - 22.5 || x < dx + 0.5 ? Pk[6] : x > dx + 9.5 ? Pk[1] : (x - dx) % 3.3 < 0.5 ? Pk[2] : Pk[4]));
    p.scan(dx + 10, bot - 22, dx + 11, bot - 5, () => col32(LAMP[3]));
    g.each(dx + 10, bot - 22, dx + 11, bot - 5, () => LAMP[3]);
    const wx = v ? x0 + 8 : x1 - 18;
    p.scan(wx - 1, wallTop + 11, wx + 11, wallTop + 21, (x, y) => (x < wx || y < wallTop + 12 ? Pk[6] : x > wx + 10 || y > wallTop + 20 ? Pk[1] : Math.abs(x - wx - 5) < 0.4 || Math.abs(y - wallTop - 16) < 0.3 ? Pk[2] : col32(x < wx + 5 && y < wallTop + 16 ? LAMP[4] : LAMP[3])));
    g.each(wx, wallTop + 12, wx + 10, wallTop + 20, () => LAMP[3]);
    // Pultdach mit Teerpappe in Bahnen, Flicken, Leisten
    const rt = wallTop - 16;
    fpoly(p, [[x0 - 6, wallTop + 2], [x0 - 4, rt], [x1 + 6, wallTop - 6], [x1 + 6, wallTop + 2]], (x, y) => {
      const lane = Math.floor((x - x0 + 6) / 9), lx = (x - x0 + 6) - lane * 9;
      if (lx < 0.6) return Tr[0];
      const roofY = rt + (x - x0 + 4) / (x1 - x0 + 10) * (wallTop - 6 - rt);
      if (y < roofY + 1) return Tr[4];
      if (y > wallTop) return Tr[0];
      if (hash2(lane, Math.floor(y / 5), seed + 4) < 0.12) return pal32(TARP)[3];   // Flicken aus Planenstoff
      return Tr[lx < 2 ? 4 : hash2(lane, Math.floor(y), seed + 5) < 0.12 ? 2 : 3];
    });
    for (const yy of [0.35, 0.7]) p.fline(x0 - 5, rt + (wallTop + 2 - rt) * yy, x1 + 5, wallTop - 6 + 8 * yy, Pk[4], 0.8);
    // Ofenrohr mit Hut
    const px = v ? x0 + 6 : x1 - 6;
    p.scan(px, rt - 10, px + 3, rt + 8, (x) => col32(x < px + 1 ? IRON[4] : IRON[2]));
    p.scan(px - 2, rt - 12, px + 5, rt - 10, (x, y) => col32(y < rt - 11.5 ? IRON[4] : IRON[1]));
    // Kristalllaterne am Dachbalken
    const lx = v ? x0 - 2 : x1 + 2;
    p.fline(lx, wallTop + 2, lx, wallTop + 6, IRON[2], 0.5);
    prism(p, g, lx, wallTop + 12, lx, wallTop + 6, 1.8);
  }, { ax: cx, ay: bot, b: true, box: [v ? -40 : -26, -16, v ? 26 : 50, 1], extra: { smoke: { dx: v ? -22 : 20, dy: -60, rate: 2 },
    lights: [{ dx: v ? -26 : 26, dy: -34, radius: 52, color: CRY_LIGHT, intensity: 0.6 }, { dx: 0, dy: -14, radius: 56, color: LAMP_LIGHT, intensity: 0.5 }] } });
}

// Kristallprisma (wie decor_astral.prism, hier lokal, um keinen Kreis zu bilden)
function prism(p, g, bx, by, tx, ty, hw) {
  fpoly(p, [[tx, ty], [bx - hw, by - 1.5], [bx, by + 1], [bx + hw, by - 1.5]], (x, y) => ((y - ty) / (by - ty) < 0.2 ? CRY[5] : x < bx ? CRY[4] : CRY[2]));
  p.fline(tx, ty + 0.5, bx, by, CRY[5], 0.5);
  g.fline(tx, ty + 1, bx, by - 1, CRY[3], 1);
}

// Werkbank der Schürfer: Holzbock mit Schraubstock, Kristallsplitter und Werkzeug
function workbench() {
  const W = 36, H = 22, cx = 18, bot = H - 2;
  return mk(W, H, (p, g) => {
    for (const lx of [5, W - 6]) p.scan(lx, bot - 9, lx + 2, bot, (x) => Pk[x < lx + 1 ? 5 : 2]);
    p.scan(2, bot - 12, W - 2, bot - 8, (x, y) => (y < bot - 11.5 ? Pk[6] : y > bot - 8.5 ? Pk[1] : x > W - 4 ? Pk[2] : Pk[4]));
    p.scan(6, bot - 16, 11, bot - 12, (x, y) => col32(y < bot - 15.5 ? IRON[4] : x < 8 ? IRON[3] : IRON[1]));
    for (const [x, t] of [[16, 3], [19, 5], [22, 2]]) prism(p, g, x, bot - 12, x + 0.5, bot - 12 - t, 1.2);
    p.fline(26, bot - 13, 31, bot - 13, IRON[3], 0.8); p.fline(30, bot - 14, 30, bot - 12, Pk[5], 1);
  }, { ax: cx, ay: bot, b: true, box: [-15, -5, 15, 1], extra: { low: true }, light: { dx: 0, dy: -14, radius: 30, color: CRY_LIGHT, intensity: 0.35 } });
}

// Morgentau (Satz decor_astral) und Funkenruh (Satz decor_shards) getrennt, damit jedes Gebiet nur seine Bauten baut
export function createGardenVillageDecor() {
  const c = [0, 1, 2].map(gardenCottage);
  return { gardenCottages: c, cottageRose: c[0], cottageVerd: c[1], cottageThatch: c[2], gardenBeds: [0, 1, 2].map(gardenBed), villageWell: villageWell() };
}
export function createMinerCampDecor() {
  const h = [0, 1].map(minerHut);
  return { minerHuts: h, minerHutA: h[0], minerHutB: h[1], workbench: workbench() };
}
