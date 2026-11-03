# Werkzeugkasten für die Szenen der Startseite (titel-riss.py): Szenen in Szenenpixeln (numpy RGB), harte Rampen,
# Bayer-Raster, Rauschen, Bausteine für Himmel, Kämme, schwebende Inseln. Kein Alpha, keine weichen Verläufe.
import json, math, os
import numpy as np
from PIL import Image

BAYER = (np.array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]).reshape(4, 4) + 0.5) / 16


def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def ramp(*hs): return np.array([hexc(h) for h in hs], np.uint8)


def bay(h, w, ox=0, oy=0):
    yy, xx = np.mgrid[0:h, 0:w]
    return BAYER[(yy + oy) & 3, (xx + ox) & 3]


def quant(t, r, h=None, w=None, ox=0, oy=0):
    """t 0..1 (Array) -> Farben aus Rampe r, Stufen gerastert."""
    hh, ww = t.shape
    k = np.floor(np.clip(t, 0, 1) * (len(r) - 1) + bay(hh, ww, ox, oy)).astype(int)
    return r[np.clip(k, 0, len(r) - 1)]


def hash2(x, y, s=0):
    n = (np.asarray(x, np.int64) * 374761393 + np.asarray(y, np.int64) * 668265263 + s * 1442695041) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffffff) / float(0xffffff)


def vnoise(x, y, s=0):
    x0, y0 = np.floor(x), np.floor(y); fx, fy = x - x0, y - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = hash2(x0, y0, s), hash2(x0 + 1, y0, s); c, d = hash2(x0, y0 + 1, s), hash2(x0 + 1, y0 + 1, s)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def fbm(x, y, s=0, o=4):
    v, a, f, n = 0, 0.5, 1, 0
    for i in range(o): v = v + a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03
    return v / n


def line1d(w, s, scale, oct=4):
    x = np.arange(w, dtype=float)
    return fbm(x / scale, np.zeros(w) + 0.5, s, oct)


class Scene:
    """Szene in Szenenpixeln; render(q) vergrößert ganzzahlig, Feinlage (Figuren) wird danach gestempelt."""
    def __init__(self, w, h, q=2):
        self.w, self.h, self.q = w, h, q
        self.c = np.zeros((h, w, 3), np.uint8)
        self.fine = []                      # (array RGBA, x, y) in Feinpixeln

    def grid(self):
        return np.mgrid[0:self.h, 0:self.w]

    def put(self, mask, col):
        if col.ndim == 1: self.c[mask] = col
        else: self.c[mask] = col[mask]

    def stamp(self, a, x, y):
        self.fine.append((a, x, y))

    def render(self):
        q = self.q
        big = np.repeat(np.repeat(self.c, q, 0), q, 1)
        H, W = big.shape[:2]
        for a, x, y in self.fine:
            h, w = a.shape[:2]
            x0, y0 = max(0, x), max(0, y); x1, y1 = min(W, x + w), min(H, y + h)
            if x1 <= x0 or y1 <= y0: continue
            sub = a[y0 - y:y1 - y, x0 - x:x1 - x]
            m = sub[..., 3] > 127
            big[y0:y1, x0:x1][m] = sub[..., :3][m]
        return big


def save(arr, path, scale=1):
    im = Image.fromarray(arr)
    if scale != 1: im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(path)

import numpy as np

EMBER = ramp('#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0')


def sky(S, stops, y0=0, y1=None, ox=0):
    """Himmel in Farbbändern: stops = Rampe von oben nach unten, gerastert."""
    y1 = y1 or S.h
    yy, xx = S.grid()
    t = (yy - y0) / max(1, (y1 - y0))
    m = (yy >= y0) & (yy < y1)
    S.put(m, quant(t, stops))


def ridge(S, base, amp, scale, seed, col, oct=4, sharp=False, fill_to=None):
    """Bergkette: Oberkante base - amp*noise; füllt bis fill_to (Standard Bildende). Gibt Höhenlinie zurück."""
    n = line1d(S.w, seed, scale, oct)
    if sharp: n = 1 - np.abs(2 * n - 1)
    top = np.round(base - amp * n).astype(int)
    yy, xx = S.grid()
    m = yy >= top[None, :]
    if fill_to is not None: m &= yy < fill_to
    S.put(m, col if np.ndim(col) == 1 else col)
    return top


def voronoi_xy(gxp, gyp, cell, seed, jitter=0.85):
    gx, gy = gxp / cell, gyp / cell
    cx, cy = np.floor(gx), np.floor(gy)
    d1 = np.full(gx.shape, 9.0); d2 = np.full(gx.shape, 9.0); idv = np.zeros(gx.shape)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            px_ = cx + dx + 0.5 + (hash2(cx + dx, cy + dy, seed) - 0.5) * jitter
            py_ = cy + dy + 0.5 + (hash2(cx + dx, cy + dy, seed + 5) - 0.5) * jitter
            d = np.hypot(gx - px_, gy - py_)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            idv = np.where(closer, hash2(cx + dx, cy + dy, seed + 9), idv)
            d1 = np.minimum(d1, d)
    return d1, d2, idv


def halo(S, cx, cy, rx, ry, cols, mask=None, add=False):
    """Harter Lichthof: konzentrische Ellipsenbänder (außen -> innen cols), Kanten im Raster gestuft."""
    yy, xx = S.grid()
    d = np.hypot((xx - cx) / rx, (yy - cy) / ry)
    b = bay(S.h, S.w)
    n = len(cols)
    for i, c in enumerate(cols):
        r = 1 - i / n
        m = d + (b - 0.5) * 0.06 < r
        if mask is not None: m &= mask
        S.c[m] = mix(S.c[m], c, add)


def mix(a, c, add):
    if add is False: return c
    return np.clip(a.astype(int) * (1 - add) + c.astype(int) * add, 0, 255).astype(np.uint8)


def stars(S, mask, density, seed, cols):
    yy, xx = S.grid()
    h = hash2(xx, yy, seed)
    m = mask & (h < density)
    k = (hash2(xx, yy, seed + 1) * len(cols)).astype(int)
    S.c[m] = np.array(cols)[k][m]
    # wenige Kreuzsterne
    big = mask & (h < density * 0.06)
    for y, x in zip(*np.nonzero(big)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            if 0 <= y + dy < S.h and 0 <= x + dx < S.w: S.c[y + dy, x + dx] = cols[0]
        S.c[y, x] = cols[-1]


def island(S, cx, top, w, depth, seed, grass, cliff, keel, under=None, light_side=1):
    """Schwebende Insel: flache Oberseite (Ellipse), zackiger Kiel nach unten. Gibt Maske zurück."""
    yy, xx = S.grid()
    x = np.arange(S.w)
    hw = w / 2
    inside = np.abs(x - cx) < hw
    u = np.clip(1 - ((x - cx) / hw) ** 2, 0, 1)
    edge_top = top - np.sqrt(u) * (w * 0.05) + (line1d(S.w, seed, 9, 3) - 0.5) * 3
    bot = top + 3 + depth * (u ** 0.8) * (0.55 + 0.6 * line1d(S.w, seed + 2, 4, 3))
    m = inside[None, :] & (yy >= np.round(edge_top)[None, :]) & (yy <= np.round(bot)[None, :])
    grass_d = 3 + np.round(line1d(S.w, seed + 4, 6, 2) * 3)
    gm = m & (yy < (np.round(edge_top) + grass_d)[None, :])
    # Klippe: Schattierung von Lichtseite
    sh = np.clip(0.75 - (yy - edge_top[None, :]) / (depth + 6) * 0.9 + light_side * (xx - cx) / (w * 2.2), 0, 1)
    S.c[m] = quant(sh, cliff)[m]
    deep = m & (yy > (edge_top + depth * 0.45)[None, :])
    S.c[deep] = quant(sh * 0.6, keel)[deep]
    gsh = np.clip(0.55 + light_side * (xx - cx) / (w * 1.5) + 0.25 * vnoise(xx / 5, yy / 3, seed), 0, 1)
    S.c[gm] = quant(gsh, grass)[gm]
    return m, edge_top
