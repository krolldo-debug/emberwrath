// Malwerkzeuge für die handgezeichneten Bosse (Neuzeichnung 03.11.: Ulgrim, Malgareth, Ignaroth, Nerith, Skalvyr,
// Mutter Fäulnis). Wie die Sternenglut-Bosse: Licht von links oben, je Material 5–6 harte Stufen, dunkle Innenkontur
// zwischen überlappenden Teilen, helle Lichtkante, Kernschatten auf der abgewandten Seite (docs/STYLE.md).
//
// Ein Maler p braucht nur zwei Dinge:
//   p.each(x0, y0, x1, y1, fn)  ruft fn(x, y) für jede Texelmitte im Bereich (Weltkoordinaten), fn → Farbe | null
//   p.pdot(x, y, c)             setzt das Texel, in dem der Weltpunkt (x, y) liegt
// und p.step (Weltmaß eines Texels). FineCanvas (gfx/Fine.js) hat each/dot/step; die Bosse mit eigenem Puffer geben
// ihren Stiften each/pdot (siehe dort). Alle Formen werden in jeder Auflösung neu abgetastet – keine Hochskalierung.

export const LX = -0.6, LY = -0.8;   // Lichtrichtung (zur Lichtquelle hin: links oben)

export const dotp = (p, x, y, c) => { if (c) (p.pdot ? p.pdot(x, y, c) : p.dot(x, y, c)); };

// Feine Linie (ein Texel stark)
export function hair(p, x0, y0, x1, y1, c) {
  if (!c) return;
  const s = (p.step ?? 0.5) * 0.7, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / s));
  for (let i = 0; i <= n; i++) dotp(p, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}
// Linie mit Stärke w (Weltpixel)
export function thick(p, x0, y0, x1, y1, w, c) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, r = w / 2;
  p.each(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
    return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= r ? (typeof c === 'function' ? c(x, y, t) : c) : null;
  });
}

// Gefülltes Vieleck; c = Farbe oder fn(x, y) → Farbe
export function poly(p, pts, c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  p.each(x0, y0, x1, y1, (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? (typeof c === 'function' ? c(x, y) : c) : null;
  });
}

// Platte: dunkle Innenkontur rundum, Lichtkante auf den zum Licht gewandten Rändern, Stufen nach Lage zum Licht,
// Kernschatten an den abgewandten Rändern. ramp: dunkel → hell (≥ 5).
// o.edge Lichtkante, o.flat Verlaufsstärke, o.line Konturbreite (0 = keine), o.glint false = kein Glanzfleck,
// o.core Breite des Kernschattens, o.lift verschiebt alle Stufen (+ heller, − dunkler)
export function plate(p, pts, ramp, o = {}) {
  const n = ramp.length, edge = o.edge ?? 0.9, k = o.flat ?? 1, line = o.line ?? 0.5, lift = o.lift ?? 0;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let R = 1;
  for (const [x, y] of pts) R = Math.max(R, Math.hypot(x - cx, y - cy));
  const segs = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let nx = dy / L, ny = -dx / L;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    return { a, dx, dy, L, f: nx * LX + ny * LY };
  });
  const core = o.core ?? Math.min(2.4, R * 0.28);
  poly(p, pts, (x, y) => {
    let best = Infinity, f = 0, dS = Infinity, dL = Infinity;
    for (const s of segs) {
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / (s.L * s.L)));
      const d = Math.hypot(x - s.a[0] - s.dx * t, y - s.a[1] - s.dy * t);
      if (d < best) { best = d; f = s.f; }
      if (s.f > 0.3) dL = Math.min(dL, d); else if (s.f < -0.2) dS = Math.min(dS, d);
    }
    if (line && best < line) return ramp[0];
    if (f > 0.3 && best < line + edge * 0.6) return ramp[n - 1];
    const t = (((x - cx) * LX + (y - cy) * LY) / R) * 0.62 * k + 0.5 + lift * 0.18;
    if (t > 0.9 && o.glint !== false) return ramp[n - 1];
    const m = n - 2;
    let i = 1 + Math.max(0, Math.min(m - 1, Math.floor((t + 0.06) * m)));
    if (dS < core + line) i = Math.max(1, i - 1);
    else if (dL < 1.6 + line && i < n - 2) i++;
    return ramp[i];
  });
}

// Runder Strang (Arm, Bein, Schaft, Schwanz): Breite w0 → w1, quer schattiert wie ein Zylinder, Glanzstreifen auf der
// Lichtseite, Kernschatten auf der abgewandten Seite, Ränder mit dunkler Kontur. o.caps false = offene Enden.
export function bar(p, x0, y0, x1, y1, w0, w1, ramp, o = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  let nx = -dy / L, ny = dx / L;
  const pts = [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]];
  if (o.flatShade) return plate(p, pts, ramp, o);
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  const n = ramp.length, line = o.line ?? 0.5, lift = o.lift ?? 0;
  const pick = (i) => ramp[Math.max(1, Math.min(n - 1, i + lift))];
  poly(p, pts, (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (L * L)));
    const hw = (w0 + (w1 - w0) * t) / 2, u = ((x - x0) * nx + (y - y0) * ny) / Math.max(0.5, hw);
    const along = t * L;
    if (line && (hw - Math.abs(u) * hw < line || (o.caps !== false && (along < line || L - along < line)))) return ramp[0];
    if (u > 0.5 && hw > 1.6) return pick(n - 1 - (u > 0.82 ? 1 : 0));
    if (u > 0.05) return pick(n - 3);
    if (u > -0.55) return pick(Math.max(1, n - 4));
    return ramp[1];
  });
}

// Kugel/Buckel: Licht von links oben, dunkler Rand unten rechts, Glanzpunkt
export function orb(p, cx, cy, rx, ry, ramp, o = {}) {
  const n = ramp.length, line = o.line ?? true;
  p.each(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) return null;
    const l = u * LX + v * LY;   // > 0 zum Licht
    if (line && d > 0.8 && l < 0.2) return ramp[0];
    if (d < 0.1 && l > 0.15 && o.glint !== false) return ramp[n - 1];
    const t = l * 0.55 + 0.5 - d * 0.2;
    return ramp[1 + Math.max(0, Math.min(n - 3, Math.floor(t * (n - 2) + 0.3)))];
  });
}

// Facettierter Kristall/Dorn/Zahn von der Basis zur Spitze: Lichtseite und Schattenseite getrennt
export function gem(p, x0, y0, x1, y1, w, ramp) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  let nx = -dy / L, ny = dx / L;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  const h = w / 2, n = ramp.length;
  poly(p, [[x0 + nx * h, y0 + ny * h], [x1, y1], [x0, y0]], (x, y) => ((x - x0) * nx + (y - y0) * ny < 0.45 ? ramp[n - 1] : ramp[n - 2]));
  poly(p, [[x0, y0], [x1, y1], [x0 - nx * h, y0 - ny * h]], (x, y) => {
    const o = -((x - x0) * nx + (y - y0) * ny);
    return o > h * (1 - ((x - x0) * dx + (y - y0) * dy) / (L * L)) - 0.6 ? ramp[0] : ramp[1];
  });
}

// Gebogenes Horn/Geweihstange/Kralle entlang einer quadratischen Kurve, Breite w0 → w1, rund schattiert
export function hornQ(p, x0, y0, cx, cy, x1, y1, w0, w1, ramp, o = {}) {
  const N = o.n ?? 8;
  let px = x0, py = y0;
  for (let i = 1; i <= N; i++) {
    const t = i / N, a = 1 - t;
    const x = a * a * x0 + 2 * a * t * cx + t * t * x1, y = a * a * y0 + 2 * a * t * cy + t * t * y1;
    const t0 = (i - 1) / N;
    bar(p, px, py, x, y, w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t, ramp, { caps: i === N, lift: o.lift ?? 0, line: o.line });
    px = x; py = y;
  }
}

// Polygon zur Mitte hin um d einrücken (für Zierränder, gut genug für konvexe Formen)
export function inset(pts, d) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => { const L = Math.hypot(x - cx, y - cy) || 1; return [x + (cx - x) / L * d, y + (cy - y) / L * d]; });
}
// Linienzug in einer Farbe; c2 = Schattenlinie 0,5 darunter (Prägung)
export function trace(p, pts, c, closed = true, c2 = null) {
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    if (c2) hair(p, x0, y0 + 0.5, x1, y1 + 0.5, c2);
    hair(p, x0, y0, x1, y1, c);
  }
}
// Niet: dunkler Punkt rechts unten, Glanzpunkt links oben
export function rivet(p, x, y, ramp) { dotp(p, x + 0.5, y + 0.5, ramp[0]); dotp(p, x, y, ramp[ramp.length - 1]); }

// Stoffbahn: Polygon mit senkrechten Falten (Licht-/Schattenbahnen), Saum unten dunkler. fold = Faltenabstand,
// phase verschiebt die Falten (Wehen), dir = Hauptrichtung der Falten (Winkel, Standard senkrecht).
export function cloth(p, pts, ramp, { fold = 4.5, phase = 0, line = 0.5, hem = null, seed = 0 } = {}) {
  const n = ramp.length;
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity;
  for (const [x, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); }
  const segs = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { a, dx: b[0] - a[0], dy: b[1] - a[1] }; });
  poly(p, pts, (x, y) => {
    let best = Infinity;
    for (const s of segs) {
      const L2 = s.dx * s.dx + s.dy * s.dy || 1, t = Math.max(0, Math.min(1, ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / L2));
      best = Math.min(best, Math.hypot(x - s.a[0] - s.dx * t, y - s.a[1] - s.dy * t));
    }
    if (line && best < line) return ramp[0];
    const v = (y - y0) / Math.max(1, y1 - y0);
    const w = Math.sin(((x - x0) / fold) * Math.PI + phase + v * 1.3 + Math.sin(seed + (x - x0) * 0.13) * 0.8);
    let i = w > 0.62 ? n - 2 : w > 0.05 ? n - 3 : w > -0.6 ? n - 4 : 1;
    if (w > 0.9 && v < 0.7) i = n - 1;
    if (v > 0.85) i = Math.max(1, i - 1);
    if (hem && y1 - y < hem) i = Math.max(1, i - 1);
    return ramp[Math.max(1, Math.min(n - 1, i))];
  });
}

// Strähnen (Haar, Bart, Moos, Algen): jede Strähne ein spitz zulaufender Strang mit Glanzlinie
export function strands(p, list, ramp) {
  for (const s of list) {
    const { x, y, len, a, w, bend = 0, lit = 0.5 } = s;
    let px = x, py = y;
    const N = Math.max(3, Math.ceil(len / 3));
    for (let i = 1; i <= N; i++) {
      const t = i / N, ang = a + bend * t;
      const qx = px + Math.cos(ang) * len / N, qy = py + Math.sin(ang) * len / N;
      const ww = w * (1 - t * 0.85);
      const k = Math.max(1, Math.min(ramp.length - 2, Math.round(1 + lit * (ramp.length - 3) - t * 0.6)));
      thick(p, px, py, qx, qy, ww + 0.6, ramp[0]);
      thick(p, px, py, qx, qy, ww, ramp[k]);
      if (ww > 1.2) hair(p, px - 0.4, py, qx - 0.4, qy, ramp[Math.min(ramp.length - 1, k + 1)]);
      px = qx; py = qy;
    }
  }
}
