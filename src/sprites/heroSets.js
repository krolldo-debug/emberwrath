// Klassen-Skinsets am Helden (Thread A, 11.10.): Zusatzzeichnungen für Teile mit look.set (character/skinSets.js).
// sprites/hero.js ruft die Haken im feinen Raster (Stufe ≥ 2) auf und reicht sein Werkzeug als K herein
// (band, lit, matShade, dimRamp, LX, LY, lerp, clamp, torsoSpan, hash). Glühende Stellen kommen als Leuchtpunkte in G
// (frame.glows, mit pulse = sanftes Pulsieren im Emissive-Pass) – die Sprites selbst bleiben deckend, harte Kanten.
import { SET_RAMPS as C } from '../character/skinSets.js';

const TAU = Math.PI * 2;
export const SPIRIT = C.spirit;

// ------------------------------------------------------------------------------------------------ Rumpf
export function setTorso(R, G, L, P, sk, K) {
  const s = L.chest.set, { topY, hipY, B } = sk;
  const span = (y) => K.torsoSpan(sk, y);
  const midX = (y) => sk.cxAt(y) + B.front * 0.35 + 0.5;
  if (s === 'glutthron') {
    // Goldene Brustkante (V vom Hals zur Brustmitte), glühende Naht im Brustpanzer, Sonnenwappen mit Glutkern
    const [xa0, xb0] = span(topY + 0.3);
    const cx = midX(topY + 3.6);
    R.fline(xa0 + 1.2, topY + 0.4, cx - 0.2, topY + 2.6, 0.5, (t) => C.gold[t < 0.5 ? 3 : 2]);
    R.fline(xb0 - 0.4, topY + 0.4, cx + 0.4, topY + 2.6, 0.5, C.gold[2]);
    for (let y = topY + 4.6; y < hipY - 2.2; y += 0.5) R.dot(cx + 0.1 + Math.sin(y * 3.1) * 0.25, y, C.ember[y % 1 < 0.5 ? 3 : 2]);
    R.fstamp(cx - 1.4, topY + 1.9, ['...a...', '.a.b.a.', '..bcb..', 'abcdcba', '..bcb..', '.a.b.a.', '...a...'], { a: C.gold[2], b: C.gold[3], c: C.ember[3], d: C.ember[4] });
    sk.G.push({ x: Math.round(cx + 0.2), y: Math.round(topY + 3.4), color: C.ember[3], r: 1.6, pulse: 1 });
    // Bauchreifen mit Goldkante
    for (const k of [0.62, 0.78]) {
      const y = K.lerp(topY, hipY + 1, k) + 0.1;
      const [xa, xb] = span(y);
      R.fline(xa + 0.4, y, xb - 0.3, y, 0.3, C.gold[2]);
    }
  } else if (s === 'mondsichel') {
    // Mondsichel-Schnalle auf dem Brustgurt (der Gurt kommt vom Lederwams), Geisterstein darin
    const [xa0] = span(topY + 0.5), [, xb1] = span(hipY - 2);
    const cx = K.lerp(xa0 + 0.6, xb1 - 0.8, 0.5), cy = K.lerp(topY + 0.6, hipY - 2, 0.5);
    R.ellipse(cx, cy, 1.05, 1.05, (nx, ny) => ((nx - 0.55) ** 2 + (ny + 0.15) ** 2 < 0.6 ? null : ny < -0.2 ? C.moon[4] : C.moon[3]));
    R.dot(cx + 0.45, cy - 0.05, C.spirit[4]);
    sk.G.push({ x: Math.round(cx), y: Math.round(cy), color: C.spirit[3], r: 1.2, pulse: 1 });
    // Geisterschärpe um die Hüfte
    const sy = hipY - 0.6, [sa, sb] = span(sy);
    R.fline(sa + 0.3, sy, sb - 0.2, sy - 0.3, 0.55, (t) => C.spirit[t > 0.6 ? 3 : 2]);
  } else if (s === 'hirschkoenig') {
    // Goldranken über der Brust, Blattwappen mit Seelenblatt
    const cx = midX(topY + 3.4), cy = topY + 3.6;
    const [xa0] = span(topY + 1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, x = K.lerp(xa0 + 0.8, cx - 0.4, t), y = topY + 1 + Math.sin(t * Math.PI) * -0.6 + t * 1.6;
      R.dot(x, y, C.gold[t < 0.5 ? 3 : 2]);
      if (i % 3 === 1) R.dot(x + 0.2, y - 0.6, C.gold[2]);
    }
    R.fstamp(cx - 0.8, cy - 1.4, ['..a..', '.aba.', 'abcba', 'abcba', '.aba.', '..d..'], { a: C.leaf[1], b: C.leaf[2], c: C.leaf[3], d: C.gold[2] });
    sk.G.push({ x: Math.round(cx), y: Math.round(cy), color: C.leaf[3], r: 1.2, pulse: 1 });
  } else if (s === 'sternenfeuer') {
    // Sternenhimmel im Stoff (einzelne Feinpixel), goldene Mittelborte mit Glutrunen, Sternbrosche
    starfield(R, sk.cxAt(topY) - B.back, topY + 0.5, sk.cxAt(hipY) + B.front, hipY - 0.5, (x, y) => {
      const [xa, xb] = span(y);
      return x > xa + 0.3 && x < xb - 0.3;
    }, K, 0);
    const cx = midX(topY + 3);
    for (let y = topY + 4.6; y <= hipY - 1.6; y += 1.2) R.dot(midX(y) + 0.75, y, C.ember[3]);
    star4(R, cx - 0.2, topY + 2.9, 1.5, C.star);
    sk.G.push({ x: Math.round(cx), y: Math.round(topY + 3), color: C.star[3], r: 1.6, pulse: 1 });
  }
}

// ------------------------------------------------------------------------------------------------ Schulter
export function setPauldron(R, L, sk, K) {
  const s = L.chest.set;
  const x = sk.shN.x, y = sk.topY + 0.4;
  if (s === 'glutthron') {
    const A = C.nightsteel, Gd = C.gold;
    // Zwei Lamellen über dem Oberarm, darüber die Schulterkuppel mit Goldsaum
    for (let i = 1; i >= 0; i--) {
      const ly = y + 2.3 + i * 1.0, rw = 2.6 - i * 0.3, rh = 1.2;
      R.ellipse(x + 0.4 + i * 0.2, ly, rw, rh, (nx, ny, d) => {
        if (ny < -0.1) return null;
        if (d > 0.6 && ny > 0.3) return Gd[nx < 0 ? 3 : 2];
        return K.band(A, Math.min(2 + (nx * K.LX + ny * K.LY) * 2, A.length - 2));
      });
    }
    R.ellipse(x + 0.2, y + 1.3, 3.0, 2.0, (nx, ny, d) => {
      if (ny > 0.6) return null;
      if (d > 0.66) return ny > 0.2 ? Gd[2] : nx < 0 ? Gd[4] : Gd[3];
      const l = nx * K.LX + ny * K.LY;
      return K.band(A, Math.min(2.6 + l * 2 + (l > 0.4 && d > 0.1 && d < 0.5 ? 1.4 : 0), A.length - 1));
    });
    // Zwei Golddornen nach oben hinten
    for (const [dx, h, back] of [[-1.5, 3.0, 1.5], [0.1, 3.6, 1.1]]) {
      let px = x + dx, py = y + 0.6;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6, nx = x + dx - back * t * t, ny = y + 0.6 - h * t;
        R.fline(px, py, nx, ny, 1.1 * (1 - t) + 0.3, t > 0.7 ? Gd[4] : Gd[t < 0.35 ? 2 : 3]);
        px = nx; py = ny;
      }
    }
    // Glutstein in Goldfassung
    R.ellipse(x + 0.5, y + 1.2, 0.75, 0.7, (nx, ny, d) => (d > 0.75 ? Gd[3] : nx + ny < -0.4 ? C.ember[4] : C.ember[3]));
    sk.G?.push({ x: Math.round(x + 0.5), y: Math.round(y + 1), color: C.ember[3], r: 1.3, pulse: 1, set: s });
  } else if (s === 'mondsichel') {
    const A = C.midnight, Mo = C.moon;
    // Lederkappe mit Mondsilberkante, darauf eine geschwungene Silberfinne nach hinten
    R.ellipse(x + 0.2, y + 1.2, 2.6, 1.6, (nx, ny, d) => {
      if (ny > 0.6) return null;
      if (d > 0.84) return ny > 0.1 ? Mo[1] : Mo[2];
      return K.band(A, 2.4 + (nx * K.LX + ny * K.LY) * 1.8);
    });
    let px = x + 0.6, py = y + 0.2;
    for (let i = 1; i <= 7; i++) {
      const t = i / 7, nx = x + 0.6 - t * 3.0, ny = y + 0.2 - Math.sin(t * 2.4) * 1.6 + t * 0.4;
      R.fline(px, py, nx, ny, 0.8 * (1 - t) + 0.3, Mo[t < 0.5 ? 2 : t < 0.85 ? 3 : 4]);
      px = nx; py = ny;
    }
  } else if (s === 'hirschkoenig') {
    // Lederkappe mit Goldkante und Blattspange (der Federkragen liegt hinten, setBack)
    R.ellipse(x + 0.2, y + 1.1, 2.4, 1.5, (nx, ny, d) => {
      if (ny > 0.6) return null;
      if (d > 0.75) return ny > 0.1 ? C.gold[1] : C.gold[3];
      return K.band(C.bark, 2.3 + (nx * K.LX + ny * K.LY) * 1.6);
    });
    R.ellipse(x + 0.5, y + 1.0, 0.75, 0.7, (nx, ny, d) => (d > 0.7 ? C.gold[2] : nx + ny < -0.3 ? C.leaf[4] : C.leaf[3]));
  } else if (s === 'sternenfeuer') {
    // Hoher Stehkragen hinter dem Kopf (Goldkante), kleine runde Schulter mit Glutstein
    const A = C.indigo, nx0 = sk.neck.x;
    R.each(nx0 - 4.2, sk.topY - 4.5, nx0 - 0.5, sk.topY + 1, (px, py, F, Gi) => {
      const u = (px - (nx0 - 4.2)) / 3.7, top = sk.topY - 1.2 - (1 - u) * 3.2;
      if (py < top) return;
      const edge = py < top + 0.5;
      R.put(F, Gi, edge ? C.gold[u < 0.5 ? 3 : 2] : K.band(A, 1.6 + u * 1.2));
    });
    R.ellipse(x, y + 1, 2.4, 1.6, (nx, ny, d) => (d > 0.72 ? C.gold[ny > 0 ? 1 : 3] : K.band(A, 2.4 + (nx * K.LX + ny * K.LY) * 1.4)));
    R.ellipse(x + 0.2, y + 1.0, 0.6, 0.6, (nx, ny) => (nx + ny < -0.3 ? C.ember[4] : C.ember[3]));
  }
}

// ------------------------------------------------------------------------------------------------ Rücken
// Hinter dem Rumpf (nach dem Umhang): Federkragen des Hirschkönigs fällt über Schultern und Rücken
export function setBack(R, L, P, sk, K) {
  if (L.chest.set !== 'hirschkoenig' || !L.featherMantle) return;
  const F = C.feather, { topY, B } = sk;
  const x0 = sk.cxAt(topY) - B.back + 0.4;
  for (const [row, n, len] of [[0, 6, 6.2], [1, 5, 4.6], [2, 4, 3.0]]) {
    for (let i = 0; i < n; i++) {
      const bx = x0 + 0.2 + i * 0.95 - row * 0.2, by = topY - 0.4 + row * 1.1;
      const sway = Math.sin(P.wave + i * 0.8) * 0.3;
      const ex = bx - 1.6 - (n - i) * 0.25 - P.cape * 2 + sway, ey = by + len - i * 0.25;
      R.fline(bx, by, ex, ey, 1.25, (t) => (t > 0.86 ? F[3] : F[row === 0 ? 1 : 2]));
      R.fline(bx + 0.3, by + 0.1, ex + 0.25, ey - 0.4, 0.25, F[0]);
    }
  }
}

// ------------------------------------------------------------------------------------------------ Umhang
// Zusatzfarbe je Feinpixel des Umhangs: k = 0 oben .. 1 Saum, hemD = Abstand zum Saum (Weltpixel), u = 0 Außen .. 1 Körper
export function setCapeColor(L, x, y, k, hemD, u, P, F, Gi, K) {
  const s = L.chest.set;
  if (s === 'glutthron') {
    // Goldband über dem Saum, darunter glühende Fransen
    if (hemD < 0.55) return (Math.floor(x * 2 + P.wave) & 1) ? C.ember[3] : C.ember[2];
    if (hemD < 0.9) return C.ember[1];
    if (hemD > 1.6 && hemD < 2.05) return C.gold[u < 0.3 ? 3 : 2];
    return null;
  }
  if (s === 'hirschkoenig') {
    if (hemD < 0.5 && Math.abs(Math.sin(x * 2.2)) > 0.7) return C.leaf[2];
    if (hemD > 1.2 && hemD < 1.55) return C.gold[2];
    return null;
  }
  if (s === 'sternenfeuer') {
    if (hemD < 0.45) return C.gold[2];
    const h = K.hash(F, Gi);
    if (k > 0.05 && h > 0.985) return C.star[h > 0.995 ? 4 : 3];
    if (hemD > 1.0 && hemD < 1.35 && (Math.floor(x * 3) % 4 === 0)) return C.ember[3];
    return null;
  }
  return null;
}
// Leuchtpunkte am Saum (Glutfransen, Seelenblätter, Sterne)
export function setCapeGlows(L, G, hemPts) {
  const s = L.chest.set;
  const col = s === 'glutthron' ? C.ember[3] : s === 'hirschkoenig' ? C.leaf[3] : s === 'sternenfeuer' ? C.star[3] : null;
  if (!col) return;
  const fx = SET_PARTICLE[s] ? s : null;
  for (const [x, y] of hemPts) G.push({ x: Math.round(x), y: Math.round(y), color: col, r: 1.4, pulse: 1, set: s, fx });
}

// ------------------------------------------------------------------------------------------------ Schal (Schurke)
export function setScarfTips(R, G, L, tip) {
  if (L.chest.set !== 'mondsichel') return;
  R.ellipse(tip.x, tip.y, 0.55, 0.55, C.spirit[3]);
  R.dot(tip.x - 0.3, tip.y - 0.2, C.spirit[4]);
  G.push({ x: Math.round(tip.x), y: Math.round(tip.y), color: C.spirit[3], r: 1.2, pulse: 1, set: 'mondsichel', fx: 'mondsichel' });
}

// ------------------------------------------------------------------------------------------------ Kopf
// Hinter dem Kopf (vor Haar/Kopf gezeichnet): Geweih (Waldläufer), Runenreif (Glutmagier)
export function setHeadBack(R, G, L, P, sk, g, K) {
  const h = L.setHead;
  if (!h) return;
  const { x0, y0 } = g;
  if (h.set === 'hirschkoenig') {
    // Geweih: zwei Stangen mit Enden, fernes dunkler; hinten am Kopf, nach oben und hinten geschwungen
    antler(R, x0 + 2.6, y0 + 1.2, K.dimRamp(C.antler), 0.85, -1);
  } else if (h.set === 'sternenfeuer') {
    haloRing(R, G, g, false);
  }
}

// Über dem Kopf (nach Helm/Kapuze)
export function setHeadFront(R, G, L, P, sk, g, K) {
  const h = L.setHead;
  if (!h) return;
  const { x0, y0 } = g;
  if (h.set === 'glutthron') {
    // Goldene Widderhörner nach hinten geschwungen, goldene Maskenkante, Glut-Sehschlitz
    sweptHorn(R, x0 + 1.4, y0 + 2.0, K.dimRamp(C.gold), 0.95);
    sweptHorn(R, x0 + 5.0, y0 + 1.0, C.gold, 1.2);
    R.fline(x0 + 5.6, y0 - 0.6, x0 + 6.0, y0 + 3.9, 0.55, (t) => C.gold[t < 0.4 ? 4 : 3]);   // Goldgrat
    if (R.s >= 2) {
      R.fline(x0 + 0.2, y0 + 3.7, x0 + 9.0, y0 + 3.9, 0.7, (t) => C.gold[t < 0.3 ? 4 : t < 0.7 ? 3 : 2]);   // Stirnband
      R.fline(x0 + 9.2, y0 + 4.0, x0 + 8.6, y0 + 8.6, 0.55, C.gold[2]);                            // Kante der Gesichtsplatte
      for (const t of [0.15, 0.4, 0.65]) R.dot(K.lerp(x0 + 0.4, x0 + 8.8, t), y0 + 3.75, C.ember[3]);
    }
    R.fline(x0 + 4.8, y0 + 4.7, x0 + 9.2, y0 + 4.9, 0.7, C.ember[3]);                        // Sehschlitz
    R.fline(x0 + 6.0, y0 + 4.8, x0 + 8.6, y0 + 4.9, 0.3, C.ember[4]);
    if (R.s >= 2) {
      R.fline(x0 + 7.4, y0 + 5.2, x0 + 7.5, y0 + 8.4, 0.45, C.ember[2]);                        // senkrechter Schlitz (T)
      R.fline(x0 + 0.4, y0 + 8.6, x0 + 8.4, y0 + 8.9, 0.8, (t) => C.gold[t < 0.5 ? 2 : 3]);
    }
    G.push({ x: Math.round(x0 + 7.4), y: Math.round(y0 + 4.8), color: C.ember[3], r: 1.8, pulse: 1, set: 'glutthron' });
  } else if (h.set === 'mondsichel') {
    // Kapuze: Mondsilber-Sichel an der Stirn, Geisteraugen im Schatten
    const cx = x0 + 7.2, cy = y0 + 2.0;
    R.ellipse(cx, cy, 1.25, 1.25, (nx, ny) => ((nx - 0.5) ** 2 + (ny + 0.1) ** 2 < 0.55 ? null : C.moon[ny < 0 ? 4 : 3]));
    R.fline(x0 + 6.7, y0 + 4.9, x0 + 7.3, y0 + 4.95, 0.45, C.spirit[4]);
    R.fline(x0 + 8.2, y0 + 4.95, x0 + 8.6, y0 + 4.95, 0.45, C.spirit[3]);
    G.push({ x: Math.round(x0 + 7.5), y: Math.round(y0 + 5), color: C.spirit[3], r: 1.4, pulse: 1, set: 'mondsichel' });
    // Saum der Gesichtsöffnung in Mondsilber
    for (let a = -1.4; a < 1.3; a += 0.12) R.dot(x0 + 6.9 + Math.cos(a + Math.PI) * 2.45 + 0.2, y0 + 5.4 + Math.sin(a) * 2.9, C.moon[1]);
  } else if (h.set === 'hirschkoenig') {
    antler(R, x0 + 5.0, y0 + 0.8, C.antler, 1, 1);
    // Blätterkranz um die Stirn
    for (let i = 0; i < 6; i++) {
      const lx = K.lerp(x0 + 1.4, x0 + 8.4, i / 5), ly = y0 + 2.6 + Math.sin(i * 1.7) * 0.25;
      R.ellipse(lx, ly, 0.8, 0.5, (nx, ny) => (ny < 0 ? C.leaf[i & 1 ? 2 : 3] : C.leaf[1]));
    }
    R.ellipse(x0 + 7.6, y0 + 2.6, 0.6, 0.6, (nx, ny) => (nx + ny < -0.3 ? C.leaf[4] : C.leaf[3]));   // Seelenblatt an der Stirn
    G.push({ x: Math.round(x0 + 7.6), y: Math.round(y0 + 2.6), color: C.leaf[3], r: 1.2, pulse: 1, set: 'hirschkoenig' });
  } else if (h.set === 'sternenfeuer') {
    haloRing(R, G, g, true);
    // Stirnreif mit Stern
    R.fline(x0 + 3.0, y0 + 2.9, x0 + 8.7, y0 + 3.3, 0.55, (t) => C.gold[t < 0.4 ? 2 : 3]);
    star4(R, x0 + 8.0, y0 + 2.9, 1.3, C.star);
    G.push({ x: Math.round(x0 + 8), y: Math.round(y0 + 3), color: C.star[3], r: 1.4, pulse: 1, set: 'sternenfeuer' });
  }
}

// ------------------------------------------------------------------------------------------------ Hände, Füße
export function setHand(R, L, x, y, far) {
  const s = L.setHands;
  if (!s || far) return;
  if (s === 'glutthron') { R.dot(x + 0.6, y - 0.6, C.ember[3]); R.dot(x + 0.8, y + 0.1, C.ember[2]); }
  else if (s === 'mondsichel') { R.fline(x + 0.7, y - 0.6, x + 1.5, y - 1.5, 0.3, C.moon[3]); R.fline(x + 0.8, y + 0.0, x + 1.7, y - 0.7, 0.3, C.moon[3]); }
  else if (s === 'sternenfeuer') R.dot(x - 0.2, y - 0.5, C.star[4]);
}
export function setBoot(R, L, ax, ay, near) {
  const s = L.setFeet;
  if (!s || !near) return;
  if (s === 'glutthron') { R.fline(ax + 0.4, ay - 0.5, ax + 2.6, ay + 0.2, 0.4, C.gold[3]); }
  else if (s === 'mondsichel') R.dot(ax + 0.8, ay - 0.2, C.moon[4]);
  else if (s === 'hirschkoenig') { for (let i = 0; i < 4; i++) R.fline(ax - 1.2 + i * 0.6, ay - 1.6, ax - 1.4 + i * 0.6, ay - 2.6, 0.45, C.feather[i & 1 ? 2 : 3]); }
  else if (s === 'sternenfeuer') R.dot(ax + 1.6, ay - 0.1, C.gold[3]);
}

// ------------------------------------------------------------------------------------------------ Waffen
export function setWeapon(R, G, w, hx, hy, ang, far, K) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const at = (u, v = 0) => ({ x: hx + dx * u - dy * v, y: hy + dy * u + dx * v });
  if (w.set === 'glutthron') {
    // Flügel-Parierstange (gold), nach vorne geschwungen, Glutstein
    for (const sgn of [-1, 1]) {
      let p = at(1.2, 0);
      for (let i = 1; i <= 7; i++) {
        const t = i / 7, q = at(1.2 + t * t * 2.0, sgn * t * 4.6);
        R.fline(p.x, p.y, q.x, q.y, 0.9 * (1 - t * 0.6), (far ? K.dimRamp(C.gold) : C.gold)[t > 0.7 ? 4 : 3]);
        p = q;
      }
    }
  } else if (w.set === 'sternenfeuer') {
    // Gefangener Stern: vierstrahliger Stern im Goldring über dem Stabkopf
    const c = at(16.6);
    if (!far) {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        R.dot(c.x + Math.cos(a) * 2.6, c.y + Math.sin(a) * 2.6, C.gold[(i % 10) < 5 ? 3 : 2]);
      }
      star4(R, c.x, c.y, 2.3, C.star);
      G.push({ x: Math.round(c.x), y: Math.round(c.y), color: C.star[3], r: 3, pulse: 1, set: 'sternenfeuer' });
    }
  } else if (w.set === 'hirschkoenig') {
    // Blätter an den Wurfarmen (am Bogen selbst, siehe setBowLeaves)
  } else if (w.set === 'mondsichel') {
    if (!far) G.push({ ...at(5), color: C.spirit[3], r: 1.2, pulse: 1, set: 'mondsichel' });
  }
}
// Seelenblätter an den Bogenenden
export function setBowLeaves(R, G, w, pts) {
  if (w.set !== 'hirschkoenig') return;
  for (const p of [pts[2], pts[pts.length - 3]]) {
    R.ellipse(p.x - 0.3, p.y, 0.9, 0.55, (nx, ny) => (ny < 0 ? C.leaf[3] : C.leaf[2]));
    R.dot(p.x - 0.6, p.y - 0.2, C.leaf[4]);
    G.push({ x: Math.round(p.x), y: Math.round(p.y), color: C.leaf[3], r: 1.2, pulse: 1, set: 'hirschkoenig' });
  }
}

// ------------------------------------------------------------------------------------------------ Hilfsformen
// Schwebender Runenreif über dem Kopf (Sternenfeuer): flache Ellipse, hintere Hälfte vor dem Kopf gezeichnet (front = false),
// vordere danach; vier Glutrunen darauf. Im Spiel kreisen die Runen (Hero.js, glows mit orbit).
function haloRing(R, G, g, front) {
  const cx = g.x0 + 4.4, cy = g.y0 - 2.0, rx = 4.6, ry = 1.1;
  const n = R.s >= 2 ? 96 : 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, sy = Math.sin(a);
    if ((sy > 0) !== front) continue;
    const px = cx + Math.cos(a) * rx, py = cy + sy * ry;
    R.dot(px, py, front ? C.gold[3] : C.gold[1]);
  }
  if (!front) return;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    if (R.s >= 2) R.ellipse(px, py, 0.6, 0.6, (nx, ny) => (nx + ny < -0.3 ? C.ember[4] : C.ember[3]));
    else R.dot(px, py, C.ember[3]);
  }
  G.push({ x: Math.round(cx), y: Math.round(cy), color: C.ember[3], r: 1, set: 'sternenfeuer', orbit: { rx, ry, n: 4 } });
}
function star4(R, cx, cy, r, A) {
  R.each(cx - r - 0.5, cy - r - 0.5, cx + r + 0.5, cy + r + 0.5, (x, y, F, G) => {
    const ax = Math.abs(x - cx), ay = Math.abs(y - cy);
    const d = Math.sqrt(ax) + Math.sqrt(ay);
    if (d > Math.sqrt(r) * 1.05) return;
    R.put(F, G, d < Math.sqrt(r) * 0.45 ? A[4] : d < Math.sqrt(r) * 0.75 ? A[3] : A[2]);
  });
}
function starfield(R, x0, y0, x1, y1, inside, K, seed) {
  R.each(x0, y0, x1, y1, (x, y, F, G) => {
    if (!inside(x, y)) return;
    const h = K.hash(F + seed * 31, G);
    if (h > 0.975) R.put(F, G, C.star[h > 0.992 ? 4 : 3]);
  });
}
function ramHorn(R, bx, by, A, tipC, k) {
  // nach hinten oben, dann nach hinten unten eingerollt (Widder), Spitze glühend
  let px = bx, py = by;
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    const a = -1.2 - t * 2.6;
    const rad = 2.8 * k * (1 - t * 0.35);
    const x = bx - 1.2 * k + Math.cos(a) * rad - t * 1.6 * k, y = by - 0.6 * k + Math.sin(a) * rad * 0.9 + t * 0.6;
    R.fline(px, py, x, y, (1.5 - t * 1.05) * k, t > 0.86 ? tipC[t > 0.95 ? 4 : 3] : A[t < 0.25 ? 2 : (i & 1) ? 3 : 4]);
    px = x; py = y;
  }
}
// Hohes Horn: von der Schläfe steil nach oben hinten, Spitze nach vorne gebogen
function sweptHorn(R, bx, by, A, k) {
  let px = bx, py = by;
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    const x = bx - Math.sin(t * 2.2) * 3.0 * k + t * t * 1.4 * k, y = by - t * 6.4 * k;
    R.fline(px, py, x, y, (R.s >= 2 ? 1.7 - t * 1.35 : 1.1 - t * 0.8) * k, A[t < 0.2 ? 2 : t < 0.7 ? 3 : 4]);
    if (t < 0.6 && R.s >= 2) R.fline(px + 0.4, py, x + 0.4, y, 0.3, A[1]);
    px = x; py = y;
  }
}
// Geweih: Stange steigt schräg nach außen oben (nah = nach vorne, fern = nach hinten), Enden zeigen nach oben
function antler(R, bx, by, A, k, dir) {
  const beam = [[0, 0], [1.0, -2.0], [2.2, -3.8], [3.0, -5.8], [3.3, -7.4]];
  const at = (t) => {
    const f = t * (beam.length - 1), i = Math.min(beam.length - 2, Math.floor(f)), u = f - i;
    return [bx + (beam[i][0] + (beam[i + 1][0] - beam[i][0]) * u) * k * dir, by + (beam[i][1] + (beam[i + 1][1] - beam[i][1]) * u) * k];
  };
  let [px, py] = at(0);
  for (let i = 1; i <= 20; i++) {
    const t = i / 20, [x, y] = at(t);
    R.fline(px, py, x, y, (1.35 - t * 0.65) * k, A[t > 0.85 ? 4 : t > 0.3 ? 3 : 2]);
    px = x; py = y;
  }
  // Enden: nach oben, leicht zur Mitte geneigt
  for (const [t0, len, lean] of [[0.28, 2.8, -0.6], [0.6, 2.4, -0.3]]) {
    const [sx, sy] = at(t0);
    let qx = sx, qy = sy;
    for (let j = 1; j <= 6; j++) {
      const t = j / 6;
      const nx = sx + (lean * t + t * t * 0.4) * k * dir, ny = sy - len * k * t;
      R.fline(qx, qy, nx, ny, (1.05 - t * 0.5) * k, A[t > 0.7 ? 4 : 3]);
      qx = nx; qy = ny;
    }
  }
}

// ------------------------------------------------------------------------------------------------ Im Spiel (Emissive-Pass)
// Leuchtpunkte der Sets: pulse = sanftes Pulsieren (jeder Punkt mit eigener Phase), orbit = Runen kreisen auf einer Ellipse
// (hintere Hälfte schwächer). Genutzt von entities/Hero.js und net/RemotePlayer.js. q = Feinraster des Spielbilds.
export function drawSetGlow(ctx, g, x, y, t, q = 1, alpha = 1) {
  const P = 1 / q;
  if (g.orbit) {
    const { rx, ry, n } = g.orbit;
    for (let i = 0; i < n; i++) {
      const a = t * 1.6 + (i / n) * TAU;
      const px = Math.round((x + Math.cos(a) * rx) * q) / q, py = Math.round((y + Math.sin(a) * ry) * q) / q;
      const front = Math.sin(a) > 0;
      ctx.globalAlpha = (front ? 0.95 : 0.4) * alpha;
      ctx.fillStyle = front ? '#ffd890' : g.color;
      ctx.fillRect(px, py, P, P);
      if (front) {
        ctx.globalAlpha = 0.45 * alpha;
        ctx.fillStyle = g.color;
        ctx.fillRect(px - P, py, 3 * P, P); ctx.fillRect(px, py - P, P, 3 * P);
      }
    }
    return;
  }
  const k = 0.5 + 0.5 * Math.sin(t * 3.1 + x * 0.7 + y * 1.3);
  const r = Math.max(1, Math.min(4, Math.round(g.r + k)));
  ctx.globalAlpha = (0.1 + k * 0.16) * alpha;
  ctx.fillStyle = g.color;
  ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
  ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
  ctx.globalAlpha = (0.6 + k * 0.4) * alpha;
  ctx.fillRect(x, y, 1, 1);
}

// Partikel an Leuchtpunkten mit fx (Umhangsaum, Schalenden): Glutfunken steigen, Geisterlicht verweht,
// Seelenblätter sinken, Sterne funkeln. rate = Partikel je Sekunde und Punkt.
const SET_PARTICLE = {
  glutthron: { rate: 2.2, make: (x, y, r) => ({ x, y, vx: r(-3, 3), rise: r(14, 26), wobble: 14, life: r(0.5, 0.9), colors: ['#fff0b0', '#ffb640', '#f07a1c', '#c8420c', '#7a2208'], emissive: true }) },
  mondsichel: { rate: 1.6, make: (x, y, r) => ({ x, y, vx: r(-6, -2), vy: r(-1, 1), rise: r(2, 6), life: r(0.4, 0.8), colors: ['#d0fff6', '#4ad8cc', '#1a8a8a'], emissive: true }) },
  hirschkoenig: { rate: 1.0, make: (x, y, r) => ({ x, y: y - r(0, 6), vx: r(-4, 4), rise: r(-8, -3), wobble: 18, life: r(0.8, 1.4), colors: ['#e6ffe0', '#7ef08a', '#2ea84a'], emissive: true }) },
  sternenfeuer: { rate: 1.2, make: (x, y, r) => ({ x: x + r(-2, 2), y: y - r(0, 10), vx: r(-1, 1), rise: r(2, 6), life: r(0.3, 0.6), colors: ['#ffffff', '#fff0a8', '#e0b444'], emissive: true }) },
};
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
// glows des aktuellen Frames, Weltposition des Fußpunkts (x, y), Blickrichtung f; state.acc hält die Restzeit je Punkt
export function spawnSetParticles(particles, glows, x, y, f, res, dt, state) {
  if (!particles || !glows) return;
  state.acc ??= 0;
  state.acc += dt;
  let n = 0;
  for (const g of glows) {
    const P = g.fx && SET_PARTICLE[g.fx];
    if (!P) continue;
    n++;
    if (Math.random() > P.rate * state.acc) continue;
    particles.spawn(P.make(x + g.x * f - (f < 0 ? 1 / (res ?? 1) : 0), y + g.y, rnd));
  }
  if (n) state.acc = 0;
}
