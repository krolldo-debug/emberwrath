// 2,5D-Modellierer für organische Boss-Körper (Feinraster).
//
// Ein Körper besteht aus Kapseln (Strecke mit Radius von r0 nach r1) und gedrehten Ellipsoiden mit Tiefe z
// (größer = näher zum Betrachter). Je Texel gewinnt die vorderste Oberfläche; Formen derselben Gruppe dürfen
// weich verschmelzen (k > 0). Danach wird schattiert: Normale aus dem Höhenfeld, Licht von links oben vorn in
// harten Stufen der Materialrampe, dunkle Innenkontur an Tiefensprüngen und Gruppengrenzen, helle Lichtkante
// oben/links, Abdunklung in Hohlkehlen. Materialien können je Texel eine eigene Farbe malen (paint-Hook).
// Die Außenkontur setzt outlinePixels beim Zuschneiden (wie bei allen Figuren).
//
// Farben sind Uint32 (RGBA little endian, wie Fine.js). Leuchtfarben werden über setGlow(Farbe → [Phase 1, Phase 3])
// erkannt und in zwei Leuchtpuffer geschrieben (Phase 1–2 und Phase 3).

export const hex32 = (h) => (0xff000000 | (parseInt(h.slice(5, 7), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(1, 3), 16)) >>> 0;
export const ramp32 = (a) => a.map(hex32);

const L0 = -0.5, L1 = -0.62, L2 = 0.6, LN = Math.hypot(L0, L1, L2);
const LX = L0 / LN, LY = L1 / LN, LZ = L2 / LN;

export class Sculpt {
  constructor(W, H, res) {
    this.W = W; this.H = H; this.res = res;
    this.w = Math.round(W * res); this.h = Math.round(H * res);
    const N = this.w * this.h;
    this.Hb = new Float32Array(N); this.M = new Int16Array(N); this.G = new Int16Array(N);
    this.P = new Int32Array(N); this.A = new Float32Array(N);
    this.S = new Float64Array((this.w + 1) * (this.h + 1)); this.C = new Int32Array((this.w + 1) * (this.h + 1));
    this.out = new Uint32Array(N); this.g1 = new Uint32Array(N); this.g2 = new Uint32Array(N);
    this.glowMap = new Map();
    this.prims = []; this.gids = new Map();
  }
  setGlow(map) { this.glowMap = map; return this; }
  reset() {
    this.prims.length = 0; this.gids.clear();
    this.Hb.fill(-1e9); this.M.fill(-1); this.out.fill(0); this.g1.fill(0); this.g2.fill(0);
    this.x0 = this.w; this.y0 = this.h; this.x1 = -1; this.y1 = -1;
    return this;
  }
  #gid(g) { let v = this.gids.get(g); if (v === undefined) { v = this.gids.size; this.gids.set(g, v); } return v; }
  // Kapsel von (x0,y0,z0) nach (x1,y1,z1), Radius r0 → r1. o: g (Gruppe), k (Weichheit, 0 = hart), sz (Tiefenstauchung), seg (Gliederfugen)
  cap(x0, y0, z0, x1, y1, z1, r0, r1, mat, o = {}) {
    this.prims.push({ t: 0, x0, y0, z0, x1, y1, z1, r0, r1, mat, gid: this.#gid(o.g ?? 'm' + mat), k: o.k ?? 0, sz: o.sz ?? 1, seg: o.seg ?? 0, tag: o.tag ?? 0 });
    return this;
  }
  chain(pts, mat, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; this.cap(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3], mat, o); }
    return this;
  }
  // Ellipsoid, um rot (rad) in der Bildebene gedreht
  ell(x, y, z, rx, ry, rz, mat, o = {}) {
    const rot = o.rot ?? 0;
    this.prims.push({ t: 1, x, y, z, rx, ry, rz, c: Math.cos(rot), s: Math.sin(rot), mat, gid: this.#gid(o.g ?? 'm' + mat), k: o.k ?? 0, tag: o.tag ?? 0 });
    return this;
  }

  #raster() {
    const { w, h, res, Hb, M, G, P, A } = this;
    const prims = this.prims;
    for (let pi = 0; pi < prims.length; pi++) {
      const p = prims[pi];
      let bx0, by0, bx1, by1;
      if (p.t === 0) {
        const r = Math.max(p.r0, p.r1);
        bx0 = Math.min(p.x0, p.x1) - r; bx1 = Math.max(p.x0, p.x1) + r; by0 = Math.min(p.y0, p.y1) - r; by1 = Math.max(p.y0, p.y1) + r;
      } else {
        const ex = Math.hypot(p.rx * p.c, p.ry * p.s), ey = Math.hypot(p.rx * p.s, p.ry * p.c);
        bx0 = p.x - ex; bx1 = p.x + ex; by0 = p.y - ey; by1 = p.y + ey;
      }
      const i0 = Math.max(0, Math.floor(bx0 * res)), i1 = Math.min(w - 1, Math.ceil(bx1 * res));
      const j0 = Math.max(0, Math.floor(by0 * res)), j1 = Math.min(h - 1, Math.ceil(by1 * res));
      if (i0 > i1 || j0 > j1) continue;
      const dx = p.x1 - p.x0, dy = p.y1 - p.y0, L2 = dx * dx + dy * dy || 1e-6;
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) / res;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) / res;
          let hh, al;
          if (p.t === 0) {
            let t = ((x - p.x0) * dx + (y - p.y0) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const r = p.r0 + (p.r1 - p.r0) * t, ux = x - p.x0 - dx * t, uy = y - p.y0 - dy * t, d2 = ux * ux + uy * uy;
            if (d2 >= r * r) continue;
            hh = p.z0 + (p.z1 - p.z0) * t + Math.sqrt(r * r - d2) * p.sz; al = t;
          } else {
            const lx = (x - p.x) * p.c + (y - p.y) * p.s, ly = -(x - p.x) * p.s + (y - p.y) * p.c;
            const u = lx / p.rx, v = ly / p.ry, d = u * u + v * v;
            if (d >= 1) continue;
            hh = p.z + p.rz * Math.sqrt(1 - d); al = v;
          }
          const n = j * w + i, cur = Hb[n];
          if (p.k > 0 && cur > -1e8 && G[n] === p.gid) {
            const q = Math.max(p.k - Math.abs(cur - hh), 0) / p.k, sm = Math.max(cur, hh) + q * q * p.k * 0.25;
            Hb[n] = sm;
            if (hh > cur) { M[n] = p.mat; P[n] = pi; A[n] = al; }
          } else if (hh > cur) { Hb[n] = hh; M[n] = p.mat; G[n] = p.gid; P[n] = pi; A[n] = al; }
        }
      }
    }
  }

  // mats[i] = { ramp: Uint32[] dunkel→hell, line?, jump?, ao?, flat?, edge?, tex?(x,y,h,nx,ny,al,prim), paint?(x,y,h,nx,ny,al,prim,k) → Uint32|0 }
  render(mats) {
    this.#raster();
    const { w, h, res, Hb, M, G, P, A, S, C, out, prims } = this;
    // Summentabelle des Höhenfelds (nur belegte Texel) für die Hohlkehlen
    const W1 = w + 1;
    for (let j = 0; j < h; j++) {
      let rs = 0, rc = 0;
      for (let i = 0; i < w; i++) {
        const n = j * w + i;
        if (M[n] >= 0) { rs += Hb[n]; rc++; }
        S[(j + 1) * W1 + i + 1] = S[j * W1 + i + 1] + rs; C[(j + 1) * W1 + i + 1] = C[j * W1 + i + 1] + rc;
      }
    }
    const R = Math.max(2, Math.round(3 * res));
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = j * w + i, m = M[n];
      if (m < 0) continue;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      const mat = mats[m], ramp = mat.ramp, K = ramp.length, hc = Hb[n], g = G[n], pr = prims[P[n]];
      const hl = i > 0 && M[n - 1] >= 0 ? Hb[n - 1] : hc, hr = i < w - 1 && M[n + 1] >= 0 ? Hb[n + 1] : hc;
      const hu = j > 0 && M[n - w] >= 0 ? Hb[n - w] : hc, hd = j < h - 1 && M[n + w] >= 0 ? Hb[n + w] : hc;
      // Innenkontur: Nachbar deutlich weiter vorn oder andere Gruppe davor
      const jump = mat.jump ?? 2.2;
      let line = false;
      for (const q of [n - 1, n + 1, n - w, n + w]) {
        if (q < 0 || q >= w * h || M[q] < 0) continue;
        const dq = Hb[q] - hc;
        if (dq > jump || (G[q] !== g && dq > 0.3)) { line = true; break; }
      }
      if (line) { out[n] = mat.line ?? ramp[0]; continue; }
      // Lichtkante: oben/links an Außen- oder Gruppenkante
      const off = (q) => q < 0 || M[q] < 0 || (G[q] !== g && Hb[q] < hc - 0.3);
      const edgeLit = off(n - w) || (j > 1 && off(n - 2 * w)) || (i > 0 && off(n - 1)) || (i > 1 && off(n - 2));
      const cl = (v) => (v < -50 ? -50 : v > 50 ? 50 : v);
      let nx = -cl(hr - hl) * res / 2, ny = -cl(hd - hu) * res / 2, nz = mat.flat ?? 1.4;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      let v = nx * LX + ny * LY + nz * LZ; if (v < 0) v = 0;
      v = 0.18 + 0.82 * v;
      const a0 = Math.max(0, i - R), a1 = Math.min(w, i + R + 1), b0 = Math.max(0, j - R), b1 = Math.min(h, j + R + 1);
      const cnt = C[b1 * W1 + a1] - C[b0 * W1 + a1] - C[b1 * W1 + a0] + C[b0 * W1 + a0];
      if (cnt > 0) {
        const avg = (S[b1 * W1 + a1] - S[b0 * W1 + a1] - S[b1 * W1 + a0] + S[b0 * W1 + a0]) / cnt;
        if (avg > hc) v -= Math.min(0.35, (avg - hc) * (mat.ao ?? 0.06));
      }
      const x = (i + 0.5) / res, y = (j + 0.5) / res;
      if (mat.tex) v += mat.tex(x, y, hc, nx, ny, A[n], pr);
      let k = Math.floor(v * (K - 1) + 0.15);
      if (edgeLit && v > 0.45 && mat.edge !== false) k = Math.max(k, K - 2);
      if (k < 1) k = 1; else if (k > K - 1) k = K - 1;
      if (mat.paint) { const c = mat.paint(x, y, hc, nx, ny, A[n], pr, k); if (c) { out[n] = c; continue; } }
      out[n] = ramp[k];
    }
    this.x0 = Math.min(this.x0, x0); this.y0 = Math.min(this.y0, y0); this.x1 = Math.max(this.x1, x1); this.y1 = Math.max(this.y1, y1);
    return this;
  }

  // Pinsel für Feindetails nach dem Schattieren (Weltkoordinaten)
  put(x, y, c) {
    const i = Math.floor(x * this.res), j = Math.floor(y * this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return;
    const n = j * this.w + i;
    this.out[n] = c;
    if (i < this.x0) this.x0 = i; if (i > this.x1) this.x1 = i; if (j < this.y0) this.y0 = j; if (j > this.y1) this.y1 = j;
  }
  disc(x, y, r, c) {
    const s = 1 / this.res;
    for (let j = -r; j <= r; j += s) for (let i = -r; i <= r; i += s) if (i * i + j * j <= r * r) this.put(x + i, y + j, c);
  }
  // Leuchtkugel: Rand dunkel, Kern hell, Glanzpunkt oben links (ramp mit 6 Stufen)
  orb(x, y, r, ramp) {
    const s = 1 / this.res;
    for (let j = -r; j <= r; j += s) for (let i = -r; i <= r; i += s) {
      const d = Math.hypot(i, j) / r; if (d > 1) continue;
      const l = (-i * 0.6 - j * 0.8) / r;
      this.put(x + i, y + j, d > 0.8 ? ramp[1] : l > 0.35 && d < 0.55 ? ramp[5] : d < 0.5 ? ramp[4] : ramp[3]);
    }
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * this.res * 1.5) + 1;
    for (let k = 0; k <= n; k++) this.put(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, c);
  }
  // spitzer Dorn/Zahn mit Licht- und Schattenseite
  spike(x0, y0, x1, y1, wd, ramp) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-3, nx = -dy / L, ny = dx / L, K = ramp.length;
    for (let t = 0; t <= 1; t += 0.5 / (L * this.res)) for (let s = -1; s <= 1; s += 0.5 / (wd * this.res + 1)) {
      const hw = wd / 2 * (1 - t), x = x0 + dx * t + nx * s * hw, y = y0 + dy * t + ny * s * hw;
      const lit = nx * s * -0.6 + ny * s * -0.8 > 0;
      this.put(x, y, Math.abs(s) > 0.8 ? ramp[0] : lit ? ramp[K - 1] : ramp[Math.max(1, K - 3)]);
    }
  }

  // Leuchtpuffer aus den Leuchtfarben füllen (nach allen Pinselstrichen)
  glowPass() {
    const { out, g1, g2, glowMap, w } = this;
    if (!glowMap.size) return this;
    for (let j = Math.max(0, this.y0); j <= this.y1; j++) for (let i = Math.max(0, this.x0), n = j * w + i; i <= this.x1; i++, n++) {
      const c = out[n]; if (!c) continue;
      const gg = glowMap.get(c); if (!gg) continue;
      g1[n] = gg[0]; g2[n] = gg[1];
    }
    return this;
  }
}
