# Bosskino der Startseite, Teil 2 (aufgerufen von bosskino.mjs): vier Bosse als eigene Pixel-Art in Seitenansicht, je in
# seinem Gebiet mit Parallaxebenen, Ruhe in Ebenen mit eigenen Zyklen und einer Signatur-Attacke als ganze Bilder.
# Gleiches Prinzip wie das Titelbild (titel-held.py): ein Szenenraster je Bühne (SW × SH Szenenpixel), alles 1:1 darin,
# Teile aus Vielecken in ganzen Pixeln, gerichtetes Licht in 4 Tönen je Material, dunkle Innenkanten, Außenkontur,
# harte Glutstufen statt Alpha-Schein. Nichts wird zur Laufzeit gedreht oder skaliert.
# Farben nach den Boss-Sprites des Spiels (src/sprites/ash_sovereign.js, barrow_king.js, rot_mother.js, frost_wyrm.js).
# Aufbau: dieses Modul hält Werkzeuge (Figur, Formen, Flammen, Szenenpuffer, Fugenwelle, Atlas); je Boss ein Modul
# bosskino_<boss>.py mit build() -> dict(Ebenen, Figur, Attacke). main() packt je Boss einen Atlas (bosskino-<boss>.webp),
# das Standbild (bosskino.webp) und gibt die Maße als JSON aus.
import math, sys, os, json, hashlib, importlib
import numpy as np
from PIL import Image

def hexc(h): h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

# Szenenraster (für alle Bühnen gleich): Breite, Höhe, Bodenlinie (Füße), Rand für Parallaxe
SW, SH, FY = 560, 216, 190
BOSSE = ['malgareth', 'ulgrim', 'faeulnis', 'skalvyr']

# Materialien: Ton 0 = Innenkante, 1..4 Schatten -> Licht
MAT = {}
def ramp(name, cols): MAT[name] = cols


class Fig:
    """Figur in eigenem Raster (W × H), Ursprung (FX, FY) = Boden unter der Figur; x nach vorn (rechts), h nach oben."""
    def __init__(s, W, H, FX, FY, scale=1.0):
        s.W, s.H, s.FX, s.FY, s.S = W, H, FX, FY, scale
        s.mat = np.full((H, W), None, dtype=object)
        s.tone = np.zeros((H, W), dtype=np.int8)
        s.part = np.zeros((H, W), dtype=np.int16)
        s.np = 0
        s.line = {0: False}
        s.rim = {}
        s.gap = {}

    # ---------------- Formen (Figurkoordinaten -> Maske)
    def poly(s, pts):
        P = [(s.FX + x * s.S, s.FY - h * s.S) for x, h in pts]
        m = np.zeros((s.H, s.W), bool)
        ys = [p[1] for p in P]
        for y in range(max(0, int(min(ys)) - 1), min(s.H, int(max(ys)) + 2)):
            cy = y + 0.5
            cuts = []
            for i in range(len(P)):
                (x1, y1), (x2, y2) = P[i], P[(i + 1) % len(P)]
                if (y1 <= cy < y2) or (y2 <= cy < y1):
                    cuts.append(x1 + (cy - y1) * (x2 - x1) / (y2 - y1))
            cuts.sort()
            for a, b in zip(cuts[::2], cuts[1::2]):
                x0, x1 = max(0, math.ceil(a - 0.5)), min(s.W, math.floor(b - 0.5) + 1)
                if x1 > x0: m[y, x0:x1] = True
        return m

    def seg(s, a, b, wa, wb):
        (x1, h1), (x2, h2) = a, b
        dx, dh = x2 - x1, h2 - h1; L = math.hypot(dx, dh) or 1
        nx, nh = -dh / L, dx / L
        return s.poly([(x1 + nx * wa / 2, h1 + nh * wa / 2), (x2 + nx * wb / 2, h2 + nh * wb / 2), (x2 - nx * wb / 2, h2 - nh * wb / 2), (x1 - nx * wa / 2, h1 - nh * wa / 2)])

    def ell(s, cx, ch, rx, rh):
        Y, X = np.mgrid[0:s.H, 0:s.W]
        u = (X + 0.5 - (s.FX + cx * s.S)) / (rx * s.S); v = (s.FY - (Y + 0.5) - ch * s.S) / (rh * s.S)
        return u * u + v * v <= 1

    def at(s, x, h): return int(round(s.FX + x * s.S)), int(round(s.FY - h * s.S))

    # ---------------- Teile
    def put(s, mask, mat, light=(1.0, -0.55), hi=1, mid=3, flat=None, fixed=None, line=True, shade='cyl', cut=(0.25, 0.55), r=4.0, dcuts=(0.3, 0.66, 0.86), bh=4, rim=True):
        s.np += 1; s.line[s.np] = line; s.rim[s.np] = rim
        ys, xs = np.nonzero(mask)
        if len(xs) == 0: return mask
        if fixed is not None:
            s.mat[ys, xs] = mat; s.tone[ys, xs] = fixed; s.part[ys, xs] = s.np
            return mask
        lx, ly = light; n = math.hypot(lx, ly); lx, ly = lx / n, ly / n
        rows = {}
        for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
        rmin = {y: min(v) for y, v in rows.items()}; rmax = {y: max(v) for y, v in rows.items()}
        if shade == 'dome': dome_t = dome(mask, r=r, cuts=dcuts)
        cols = {}
        if shade in ('lame', 'chest'):
            for y, x in zip(ys, xs): cols.setdefault(x, []).append(y)
        for y, x in zip(ys, xs):
            if shade == 'dome':
                t = int(dome_t[y, x])
            elif shade in ('lame', 'chest'):
                a, b = rmin[y], rmax[y]
                u = (x - a + 0.5) / (b - a + 1)
                top, bot = min(cols[x]), max(cols[x])
                if shade == 'lame':
                    k = y - top; pos = k % bh
                    t = 4 if pos == 0 and u > 0.35 else 3 if pos <= 1 else 1 if pos == bh - 1 else 2
                    if u < 0.2 and t > 1: t -= 1
                    if u > 0.8 and t == 2: t = 3
                else:
                    v = (y - top) / max(1, bot - top)
                    t = 1 if u < 0.18 else 2 if u < 0.45 else 3
                    if 0.68 <= u < 0.8 and v < 0.6: t = 4
                    if v > 0.78 and t > 1: t -= 1
                    if y - top == 0 and t < 4: t += 1
            elif shade == 'cyl':
                a, b = rmin[y], rmax[y]
                rr = (x - a + 0.5) / (b - a + 1)
                t = 4 if (x == b and b - a >= 3) or rr > 0.86 else 3 if rr > cut[1] else 2 if rr > cut[0] else 1
                if y > 0 and not mask[y - 1, x] and t < 4: t += 1
                if y + 1 < s.H and not mask[y + 1, x] and t > 1: t -= 1
            elif shade == 'vcyl':          # senkrecht: oben hell, unten dunkel
                top = y
                while top > 0 and mask[top - 1, x]: top -= 1
                bot = y
                while bot + 1 < s.H and mask[bot + 1, x]: bot += 1
                rr = (y - top + 0.5) / (bot - top + 1)
                t = 4 if rr < 0.14 else 3 if rr < cut[0] + 0.15 else 2 if rr < cut[1] + 0.15 else 1
            else:
                k = 1
                while k < 30:
                    xx, yy = int(round(x + lx * k)), int(round(y + ly * k))
                    if xx < 0 or yy < 0 or xx >= s.W or yy >= s.H or not mask[yy, xx]: break
                    k += 1
                t = 4 if k <= hi else 3 if k <= mid else 2 if k <= (flat or 7) else 1
            s.mat[y, x] = mat; s.tone[y, x] = t; s.part[y, x] = s.np
        return mask

    def sprite(s, x, h, rows, legend, line=True):
        """Handgesetzte Pixel: rows (Zeichenketten), oben links bei Figurpunkt (x, h); legend: Zeichen -> (Material, Ton)."""
        s.np += 1; s.line[s.np] = line; s.rim[s.np] = True
        X0, Y0 = s.at(x, h)
        m = np.zeros((s.H, s.W), bool)
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch not in legend: continue
                X, Y = X0 + i, Y0 + j
                if 0 <= X < s.W and 0 <= Y < s.H:
                    s.mat[Y, X], s.tone[Y, X] = legend[ch]; s.part[Y, X] = s.np; m[Y, X] = True
        return m

    def px(s, x, y, mat, t):
        if 0 <= x < s.W and 0 <= y < s.H: s.mat[y, x] = mat; s.tone[y, x] = t

    def dot(s, x, h, mat, t):
        X, Y = s.at(x, h); s.px(X, Y, mat, t)

    def recolor(s, mask, mat=None, tone=None, only=None):
        for y, x in zip(*np.nonzero(mask)):
            if s.mat[y, x] is None or (only and s.mat[y, x] not in only): continue
            if mat: s.mat[y, x] = mat
            if tone is not None: s.tone[y, x] = tone(s.tone[y, x]) if callable(tone) else tone

    def render(s, outline='#0c0609', rim=None, rim_back=None, inner=True):
        """rim: {mat: farbe} warme Kante vorn (rechts); rim_back: {mat: farbe} Gegenlicht hinten (links)."""
        H, W = s.H, s.W
        im = np.zeros((H, W, 4), np.uint8)
        filled = s.mat != None
        for y, x in zip(*np.nonzero(filled)):
            m = s.mat[y, x]; t = s.tone[y, x]
            p = s.part[y, x]
            if inner and s.line.get(p):
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and s.mat[yy, xx] is not None and 0 < s.part[yy, xx] < p - s.gap.get(p, 0):
                        t = 0; break
            im[y, x, :3] = hexc(MAT[m][t]); im[y, x, 3] = 255
        a0 = im[:, :, 3] > 0
        for side, R in ((1, rim), (-1, rim_back)):
            if not R: continue
            for y, x in zip(*np.nonzero(a0)):
                xx = x + side
                if 0 <= xx < W and a0[y, xx]: continue
                m = s.mat[y, x]
                if m in R and s.tone[y, x] > 0 and s.rim.get(s.part[y, x], True): im[y, x, :3] = hexc(R[m])
        if outline:
            a = im[:, :, 3] > 0
            o = np.zeros_like(a)
            o[1:, :] |= a[:-1, :]; o[:-1, :] |= a[1:, :]; o[:, 1:] |= a[:, :-1]; o[:, :-1] |= a[:, 1:]
            o &= ~a
            im[o] = (*hexc(outline), 255)
        return im


LIGHT = np.array([0.6, -0.55, 0.58]); LIGHT = LIGHT / np.linalg.norm(LIGHT)
def dome(mask, r=4.0, cuts=(0.3, 0.66, 0.86), light=None):
    """Wölbung aus dem Abstand zum Rand -> Normale -> Licht (rechts oben vorn) -> Töne 1..4."""
    L = LIGHT if light is None else light
    D = np.zeros(mask.shape); cur = mask.copy(); k = 0
    while cur.any():
        k += 1; D[cur] = k
        e = cur.copy()
        e[1:, :] &= cur[:-1, :]; e[:-1, :] &= cur[1:, :]; e[:, 1:] &= cur[:, :-1]; e[:, :-1] &= cur[:, 1:]
        if k % 2 == 0:
            e[1:, 1:] &= cur[:-1, :-1]; e[:-1, :-1] &= cur[1:, 1:]; e[1:, :-1] &= cur[:-1, 1:]; e[:-1, 1:] &= cur[1:, :-1]
        cur = e
    h = np.clip((D - 0.5) / r, 0, 1); hd = np.sqrt(1 - (1 - h) ** 2) * mask
    gx = np.zeros_like(hd); gy = np.zeros_like(hd)
    gx[:, 1:-1] = (hd[:, 2:] - hd[:, :-2]) / 2; gy[1:-1, :] = (hd[2:, :] - hd[:-2, :]) / 2
    sc = r * 0.9
    n = np.stack([-gx * sc, -gy * sc, np.ones_like(hd)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    v = n @ L
    return np.select([v < cuts[0], v < cuts[1], v < cuts[2]], [1, 2, 3], 4)


def ik(sh, hand, l1, l2, bend=-1):
    (sx, sy), (hx, hy) = sh, hand
    dx, dy = hx - sx, hy - sy; d = max(0.01, min(math.hypot(dx, dy), l1 + l2 - 0.01))
    a = math.atan2(dy, dx)
    c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d); c = max(-1, min(1, c))
    e = a + bend * math.acos(c)
    return (sx + l1 * math.cos(e), sy + l1 * math.sin(e))


def lerp(a, z, k): return (a[0] + (z[0] - a[0]) * k, a[1] + (z[1] - a[1]) * k)
def rot(p, c, ang):
    a = math.radians(ang); x, h = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - h * math.sin(a), c[1] + x * math.sin(a) + h * math.cos(a))


def over(a, b):
    r = a.copy(); m = b[:, :, 3] > 0; r[m] = b[m]; return r


def flip(im): return im[:, ::-1].copy()


# ------------------------------------------------------------------------------------------- Rauschen, Flammen
_LAT = np.random.default_rng(7).random((64, 64))
def vnoise(x, y, per=16):
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    g = lambda i, j: _LAT[i % 64, j % per]
    a = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx
    b = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx
    return a * (1 - fy) + b * fy

def hash2(x, y, s=0):
    v = np.sin(np.asarray(x) * 127.1 + np.asarray(y) * 311.7 + s * 74.7) * 43758.5453
    return v - np.floor(v)

FLAME = ['#5a1206', '#a8300a', '#e8641a', '#ffb648', '#fff2c0']
GHOST = ['#0b3a40', '#127272', '#22b0a4', '#7ef0d6', '#e8fff8']
SPORE = ['#0e4a1c', '#22882e', '#5ad040', '#b4f478', '#f4ffd8']
FROST = ['#0a3050', '#1670a0', '#34b8e4', '#9aeefc', '#ffffff']

def flame(src, t, n, R=4.4, pal=FLAME, up=0.42, side=1.0, rise=1.8, gain=1.5, shape=None):
    """Flammen um eine Maske (src), Bild t von n (Schleife). Harte Stufen, äußerster Kranz dunkel. Rückgabe RGBA wie src."""
    H, W = src.shape
    by, bx = np.nonzero(src)
    out = np.zeros((H, W, 4), np.uint8)
    if len(bx) == 0: return out
    y0, y1 = max(0, by.min() - int(R * 4)), min(H, by.max() + 4)
    x0, x1 = max(0, bx.min() - int(R * 2.5)), min(W, bx.max() + int(R * 2.5))
    Y, X = np.mgrid[y0:y1, x0:x1]
    d = np.full(Y.shape, 99.0)
    step = max(1, len(bx) // 900)
    for qx, qy in zip(bx[::step], by[::step]):
        dy = qy - Y; dx = np.abs(X - qx)
        c = dx * side + np.where(dy > 0, dy * up, -dy * rise)
        d = np.minimum(d, c)
    per = 16
    sh = t / n * per
    nz = vnoise(X * 0.42, Y * 0.30 + sh, per) * 0.65 + vnoise(X * 0.9 + 9, Y * 0.62 + sh * 2, per) * 0.35
    heat = 1 - d / R + (nz - 0.5) * gain
    lv = np.select([heat > 0.78, heat > 0.6, heat > 0.42, heat > 0.25, heat > 0.12], [4, 3, 2, 1, 0], -1)
    for k in range(5):
        m = lv == k
        out[y0:y1, x0:x1][m] = (*hexc(pal[k]), 255)
    out[src] = 0
    return out


def fire(w, h, t, n, pal=FLAME, hw=0.42, seed=0, speed=1.0, lick=1.0, core=0.45):
    """Freie Flamme (w × h, Fuß unten Mitte), Bild t von n als Schleife: Zungen aus Rauschen, das nach oben wandert,
    Breite nimmt nach oben ab, harte Stufen (außen dunkelrot, innen weißgelb)."""
    Y, X = np.mgrid[0:h, 0:w]
    up = (h - 1 - Y) / max(1, h - 1)                     # 0 unten .. 1 oben
    per = 16
    sh = t / n * per * speed
    sway = w * 0.1 * np.sin(up * 5.5 + 2 * math.pi * t / n + seed) * up
    u = np.abs(X + 0.5 - w / 2 - sway) / (w * hw)
    n1 = vnoise(X * 0.34 + seed * 7.3, (Y * 0.22 + sh) % per, per)
    n2 = vnoise(X * 0.8 + seed * 3.1 + 11, (Y * 0.5 + sh * 2) % per, per)
    nz = n1 * 0.65 + n2 * 0.35
    width = (1 - up ** 1.3) * (0.75 + 0.5 * nz)
    heat = 1 - u / np.maximum(0.05, width) - up * 0.35 + (nz - 0.5) * lick
    heat = np.where(up > 0.97, -1, heat)
    lv = np.select([heat > 1 - core * 0.45, heat > 1 - core * 0.75, heat > 0.32, heat > 0.15, heat > 0.02], [4, 3, 2, 1, 0], -1)
    out = np.zeros((h, w, 4), np.uint8)
    for k in range(5):
        out[lv == k] = (*hexc(pal[k]), 255)
    return out


# ------------------------------------------------------------------------------------------- Szenenpuffer
class Buf:
    def __init__(s, w=SW, h=SH):
        s.w, s.h = w, h; s.a = np.zeros((h, w, 4), np.uint8)
    def set(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h: s.a[y, x] = (*hexc(c), 255) if isinstance(c, str) else c
    def get(s, x, y):
        if 0 <= x < s.w and 0 <= y < s.h: return s.a[y, x]
        return (0, 0, 0, 0)
    def rect(s, x0, y0, x1, y1, c):
        x0, x1 = max(0, int(x0)), min(s.w, int(x1) + 1); y0, y1 = max(0, int(y0)), min(s.h, int(y1) + 1)
        if x1 > x0 and y1 > y0: s.a[y0:y1, x0:x1] = (*hexc(c), 255) if isinstance(c, str) else c
    def mask(s, m, c):
        s.a[m] = (*hexc(c), 255) if isinstance(c, str) else c
    def paste(s, im, x, y):
        """RGBA-Bild (deckend/leer) an x, y einsetzen."""
        h, w = im.shape[:2]
        X0, Y0 = max(0, x), max(0, y); X1, Y1 = min(s.w, x + w), min(s.h, y + h)
        if X1 <= X0 or Y1 <= Y0: return
        sub = im[Y0 - y:Y1 - y, X0 - x:X1 - x]
        m = sub[:, :, 3] > 0
        s.a[Y0:Y1, X0:X1][m] = sub[m]
    def poly(s, pts):
        m = np.zeros((s.h, s.w), bool)
        ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys)) - 1), min(s.h, int(max(ys)) + 2)):
            cy = y + 0.5; cuts = []
            for i in range(len(pts)):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
                if (y1 <= cy < y2) or (y2 <= cy < y1): cuts.append(x1 + (cy - y1) * (x2 - x1) / (y2 - y1))
            cuts.sort()
            for a, b in zip(cuts[::2], cuts[1::2]):
                x0, x1 = max(0, math.ceil(a - 0.5)), min(s.w, math.floor(b - 0.5) + 1)
                if x1 > x0: m[y, x0:x1] = True
        return m
    def ell(s, cx, cy, rx, ry):
        Y, X = np.mgrid[0:s.h, 0:s.w]
        return ((X + 0.5 - cx) / rx) ** 2 + ((Y + 0.5 - cy) / ry) ** 2 <= 1


def chk(x, y): return (x + y) & 1
BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16 + 1 / 32

def bands(h, w, y0, y1, cols, gamma=1.0):
    """Farbbänder senkrecht (oben -> unten) mit Bayer-Übergängen, als RGBA."""
    out = np.zeros((h, w, 4), np.uint8)
    Y, X = np.mgrid[0:h, 0:w]
    t = np.clip((Y - y0) / max(1, y1 - y0), 0, 1) ** gamma * (len(cols) - 1)
    i0 = np.floor(t).astype(int); fr = t - i0
    i = np.minimum(len(cols) - 1, i0 + (fr > BAYER4[Y % 4, X % 4]))
    C = np.array([(*hexc(c), 255) for c in cols], np.uint8)
    return C[i]


def edge_of(m):
    """Randpixel einer Maske (4er-Nachbarschaft, außerhalb gilt als leer)."""
    p = np.pad(m, 1)
    inner = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m & ~inner


def outline_mask(m):
    o = np.zeros_like(m)
    o[1:, :] |= m[:-1, :]; o[:-1, :] |= m[1:, :]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o & ~m


def shade_mask(m, cols, light=(-1, -1), r=3.0):
    """Fläche m mit Rampe cols (dunkel -> hell) gewölbt schattieren (Licht von light), Ergebnis RGBA."""
    L = np.array([light[0], light[1], 1.2]); L = L / np.linalg.norm(L)
    t = dome(m, r=r, cuts=(0.3, 0.62, 0.86), light=np.array([-L[0], L[1], L[2]]) if False else L)
    out = np.zeros((*m.shape, 4), np.uint8)
    for k in range(1, 5):
        mm = m & (t == k)
        out[mm] = (*hexc(cols[min(len(cols) - 1, k - 1)]), 255)
    return out


# ------------------------------------------------------------------------------------------- Boden und Mauern
def floor(y0, y1, rows, ramp, vx=SW / 2, vy=-260, tile=40, seed=1, w=SW, rough=0.5, chips=0.08):
    """Bodenplatten in Seitenansicht mit Fluchtpunkt (vx, vy): Zeilen von y0 an (Höhen rows), Fugen 1 Pixel.
    ramp: 5 Farben dunkel -> hell. Rückgabe (RGBA, Fugenmaske, Plattennummer)."""
    h = SH
    out = np.zeros((h, w, 4), np.uint8); seam = np.zeros((h, w), bool); tid = np.full((h, w), -1, np.int32)
    C = np.array([(*hexc(c), 255) for c in ramp], np.uint8)
    y = y0; r = 0
    rng = np.random.default_rng(seed)
    while y < y1:
        rh = rows[min(r, len(rows) - 1)]
        yb = min(y1, y + rh)
        ym = (y + yb) / 2
        k = (ym - vy) / (y1 - vy)
        tw = tile * k
        off = (r % 2) * 0.5 + rng.random() * 0.3
        for yy in range(y, yb):
            kk = (yy + 0.5 - vy) / (ym - vy)
            for x in range(w):
                # Spaltenindex im Plattenraster dieser Zeile, Fugen laufen zum Fluchtpunkt
                xm = vx + (x + 0.5 - vx) / kk
                u = (xm - vx) / tw + off + 50
                ci = int(math.floor(u)); fu = u - ci
                t = r * 1000 + ci
                hs = hash2(ci, r, seed)
                base = 1 + int(hs * 2.2)
                n = hash2(x, yy, seed + 3)
                if yy == y:
                    seam[yy, x] = True; tid[yy, x] = t; out[yy, x] = C[0]; continue
                du = 1.0 / (kk * tw)
                if fu < du:
                    seam[yy, x] = True; tid[yy, x] = t; out[yy, x] = C[0]; continue
                tone = base
                if yy == y + 1: tone = min(4, base + 1)
                if yy == yb - 1 and tone > 0: tone -= 1
                if fu < 2 * du and tone < 4: tone = min(4, tone + 1)
                if n < chips: tone = max(0, tone - 1)
                elif n > 1 - chips * rough: tone = min(4, tone + 1)
                out[yy, x] = C[tone]; tid[yy, x] = t
        y = yb; r += 1
    return out, seam, tid


def bricks(x0, y0, x1, y1, bw, bh, ramp, seed=2, mortar=None):
    """Mauerwerk (RGBA SW × SH), Steine bw × bh, versetzt; ramp 4–5 Farben."""
    out = np.zeros((SH, SW, 4), np.uint8)
    C = np.array([(*hexc(c), 255) for c in ramp], np.uint8)
    M = (*hexc(mortar or ramp[0]), 255)
    for y in range(max(0, y0), min(SH, y1)):
        r = (y - y0) // bh; fy = (y - y0) % bh
        off = (r % 2) * bw // 2
        for x in range(max(0, x0), min(SW, x1)):
            c = (x - x0 + off) // bw; fx = (x - x0 + off) % bw
            if fy == bh - 1 or fx == 0: out[y, x] = M; continue
            hs = hash2(c, r, seed); base = 1 + int(hs * 2)
            t = base
            if fy == 0: t = min(len(ramp) - 1, base + 1)
            if fx == bw - 1 or fy == bh - 2: t = max(1, base - 1)
            n = hash2(x, y, seed + 5)
            if n < 0.06: t = max(1, t - 1)
            out[y, x] = C[t]
    return out


def stamp(dst, src):
    m = src[:, :, 3] > 0; dst[m] = src[m]; return dst


# ------------------------------------------------------------------------------------------- Fugenwelle
def seam_wave(seams, x0, y0, v, ms, pal, peak=lambda d: 4 if d < 45 else 3 if d < 110 else 2, ages=(0.07, 0.2, 0.4, 0.62),
              yscale=2.4, maxd=260, direction=0, extra=None, seed=11, jitter=0.05):
    """Glut läuft vom Punkt (x0, y0) über die Fugen (Maske seams). direction: -1 nur nach links, 1 nur rechts, 0 beide.
    Rückgabe: (Bildstreifen RGBA, Rahmen x, y, w, h, Bilderzahl)."""
    rng = np.random.default_rng(seed)
    pts = {}
    ys, xs = np.nonzero(seams)
    for y, x in zip(ys, xs):
        if y < y0 or abs(x - x0) > maxd: continue
        if direction and (x - x0) * direction < -6: continue
        pts[(x, y)] = math.hypot(x - x0, (y - y0) * yscale)
    if extra:
        for (x, y), dd in extra.items(): pts[(x, y)] = min(pts.get((x, y), 999), dd)
    jit = {}
    def delay(x, y, dd):
        c = (x // 6, y // 4)
        if c not in jit: jit[c] = rng.random() * jitter
        return dd / v + jit[c]
    tmax = max(delay(x, y, dd) for (x, y), dd in pts.items()) + ages[-1] + 0.1
    nfr = int(math.ceil(tmax * 1000 / ms))
    frames = []
    for f in range(nfr):
        t = f * ms / 1000; fr = {}
        for (x, y), dd in pts.items():
            age = t - delay(x, y, dd)
            if age < 0: continue
            k = 0
            while k < len(ages) and age >= ages[k]: k += 1
            lv = peak(dd) - k if k < len(ages) else -1
            if lv >= 0: fr[(x, y)] = lv
        frames.append(fr)
    allp = [q for fr in frames for q in fr]
    wx0, wx1 = min(x for x, _ in allp), max(x for x, _ in allp) + 1
    wy0, wy1 = min(y for _, y in allp), max(y for _, y in allp) + 1
    ww, wh = wx1 - wx0, wy1 - wy0
    out = np.zeros((wh * nfr, ww, 4), np.uint8)
    for i, fr in enumerate(frames):
        for (x, y), lv in fr.items(): out[y - wy0 + i * wh, x - wx0] = (*hexc(pal[lv]), 255)
    return out, dict(x=int(wx0), y=int(wy0), w=int(ww), h=int(wh), n=nfr, ms=ms)


# ------------------------------------------------------------------------------------------- Atlas
def crop(im):
    a = np.nonzero(im[:, :, 3])
    if not len(a[0]): return im[:1, :1], 0, 0
    y0, y1, x0, x1 = a[0].min(), a[0].max() + 1, a[1].min(), a[1].max() + 1
    return im[y0:y1, x0:x1], int(x0), int(y0)


def common_crop(ims):
    x0, y0, x1, y1 = 10 ** 6, 10 ** 6, 0, 0
    for im in ims:
        a = np.nonzero(im[:, :, 3])
        if len(a[0]): y0, y1, x0, x1 = min(y0, a[0].min()), max(y1, a[0].max() + 1), min(x0, a[1].min()), max(x1, a[1].max() + 1)
    return int(x0), int(y0), int(x1), int(y1)


class Atlas:
    """Einfacher Regalpacker: Bilder (RGBA) in Reihen, Rückgabe Rechtecke [x, y, w, h]."""
    def __init__(s, width=1024):
        s.items = []; s.width = width
    def add(s, name, im):
        s.items.append((name, im))
    def pack(s):
        order = sorted(range(len(s.items)), key=lambda i: -s.items[i][1].shape[0])
        x = y = rowh = 0; rects = {}
        W = max(s.width, max(im.shape[1] for _, im in s.items))
        for i in order:
            name, im = s.items[i]; h, w = im.shape[:2]
            if x + w > W: x = 0; y += rowh; rowh = 0
            rects[name] = [x, y, w, h]; x += w; rowh = max(rowh, h)
        Ht = y + rowh
        out = np.zeros((Ht, W, 4), np.uint8)
        for name, im in s.items:
            X, Y, w, h = rects[name]; out[Y:Y + h, X:X + w] = im
        return out, rects


def strip(ims):
    h, w = ims[0].shape[:2]
    out = np.zeros((h, w * len(ims), 4), np.uint8)
    for i, im in enumerate(ims): out[:, i * w:(i + 1) * w] = im
    return out


def dedupe(frames):
    """Liste ganzer Bilder -> (eindeutige Bilder, Indizes)."""
    uniq, keys, idx = [], {}, []
    for im in frames:
        h = hashlib.md5(im.tobytes()).hexdigest()
        if h not in keys: keys[h] = len(uniq); uniq.append(im)
        idx.append(keys[h])
    return uniq, idx


def save_webp(arr, path, opaque=False):
    im = Image.fromarray(arr)
    if opaque: im = im.convert('RGB')
    im.save(path, 'WEBP', lossless=True, quality=100, method=6)
    return os.path.getsize(path)


# ------------------------------------------------------------------------------------------- Zusammenbau je Boss
def compose(B, t_ms=0):
    """Standbild der Bühne (alle Ebenen, Figur in Ruhe Bild 0) in vollem Szenenraster."""
    img = np.zeros((SH, SW, 4), np.uint8); img[:, :, 3] = 255
    for L in B['layers']:
        if L.get('poster', True) is False: continue
        sub = L['img']; x, y = L['x'], L['y']
        h, w = sub.shape[:2]
        m = sub[:, :, 3] > 0
        img[y:y + h, x:x + w][m] = sub[m]
        if L['name'] == B['meta'].get('schaleNach'):
            sw_ = B['meta']['schale']['w']
            for x, y in B['meta'].get('schalen', []):
                fr = B['fx']['schale'][:, :sw_]
                mm = fr[:, :, 3] > 0
                img[y:y + fr.shape[0], x:x + sw_][mm] = fr[mm]
        if L['name'] == B.get('figure_after', 'boden'):
            F = B['figure']
            fr = F['poster']
            fh, fw = fr.shape[:2]
            X, Y = F['x'], F['y']
            X0, Y0 = max(0, X), max(0, Y); X1, Y1 = min(SW, X + fw), min(SH, Y + fh)
            sub2 = fr[Y0 - Y:Y1 - Y, X0 - X:X1 - X]; mm = sub2[:, :, 3] > 0
            img[Y0:Y1, X0:X1][mm] = sub2[mm]
    return img


def finish(name, FXo, FYo, BX, parts, moment, hit_idx, imp_px, Ld, order, fx, meta, poster_parts=None, nach=None):
    """Gemeinsamer Abschluss je Boss. parts: [(Name, [Bilder], Ruhe-Eintrag)] in Zeichenreihenfolge (Figurraster, Blick
    rechts); moment: [(Bild, ms)]; imp_px: Spalte des Einschlags im Figurraster. Spiegelt alles (Blick nach links),
    schneidet auf einen gemeinsamen Rahmen, legt die Figur mit dem Fußpunkt auf (BX, FY)."""
    uniq, idx = dedupe([im for im, _ in moment])
    allims = [im for _, ims, _ in parts for im in ims] + uniq
    x0, y0, x1, y1 = common_crop(allims)
    cut = lambda im: flip(im[y0:y1, x0:x1])
    fx_ = (x1 - 1) - FXo; fy_ = FYo - y0
    FXs, FYs = BX - fx_, FY - fy_
    sheets = {n: strip([cut(i) for i in ims]) for n, ims, _ in parts}
    sheets['moment'] = strip([cut(i) for i in uniq])
    po = None
    for n, ims, _ in parts:
        if poster_parts and n not in poster_parts: continue
        po = cut(ims[0]) if po is None else over(po, cut(ims[0]))
    imp_scene = int(FXs + (x1 - 1 - imp_px))
    m = dict(meta)
    m.update({'name': name, 'fig': {'x': int(FXs), 'y': int(FYs), 'w': int(x1 - x0), 'h': int(y1 - y0)},
              'ruhe': [dict(r, r=n) for n, _, r in parts],
              'moment': {'f': [[i, ms] for i, (_, ms) in zip(idx, moment)], 'hit': hit_idx}})
    layers = []
    for n in order:
        if n not in Ld: continue
        dd = Ld[n]
        a = np.nonzero(dd['img'][:, :, 3])
        if not len(a[0]): continue
        ya, yb, xa, xb = a[0].min(), a[0].max() + 1, a[1].min(), a[1].max() + 1
        e = dict(name=n, img=dd['img'][ya:yb, xa:xb], x=int(xa), y=int(ya), f=dd['f'])
        if 'glow' in dd: e['glow'] = dd['glow']
        layers.append(e)
    names = [L['name'] for L in layers]
    m['nach'] = nach if nach in names else [n for n in names if n != 'vorn'][-1]
    return {'layers': layers, 'figure': {'sheets': sheets, 'meta': {}, 'poster': po, 'x': int(FXs), 'y': int(FYs)},
            'fx': fx, 'meta': m, 'figure_after': m['nach'], 'previews': {'moment': sheets['moment']}}, imp_scene


def main():
    IMG, TMP = sys.argv[1], sys.argv[2]
    only = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else BOSSE
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    sizes, meta = {}, {'szene': {'W': SW, 'H': SH, 'FY': FY}, 'bosse': {}}
    for name in only:
        mod = importlib.import_module('bosskino_' + name)
        B = mod.build()
        atlas = Atlas(1024)
        lay = []
        for L in B['layers']:
            atlas.add('L:' + L['name'], L['img'])
        F = B['figure']
        for k, im in F['sheets'].items(): atlas.add('F:' + k, im)
        for k, im in B.get('fx', {}).items(): atlas.add('X:' + k, im)
        arr, rects = atlas.pack()
        path = os.path.join(IMG, f'bosskino-{name}.webp')
        sizes[f'bosskino-{name}.webp'] = save_webp(arr, path)
        Image.fromarray(arr).save(os.path.join(TMP, f'atlas-{name}.png'))
        m = B['meta']
        m['layers'] = [dict({k: v for k, v in L.items() if k not in ('img', 'poster')}, r=rects['L:' + L['name']]) for L in B['layers']]
        m['figur'] = dict(F['meta'], r={k: rects['F:' + k] for k in F['sheets']})
        m['fxr'] = {k: rects['X:' + k] for k in B.get('fx', {})}
        meta['bosse'][name] = m
        po = compose(B)
        Image.fromarray(po).convert('RGB').save(os.path.join(TMP, f'standbild-{name}.png'))
        if name == 'malgareth':
            sizes['bosskino.webp'] = save_webp(po, os.path.join(IMG, 'bosskino.webp'), opaque=True)
        for k, im in B.get('previews', {}).items():
            Image.fromarray(im).save(os.path.join(TMP, f'{name}-{k}.png'))
    print(json.dumps({'meta': meta, 'sizes': sizes}, default=int))


if __name__ == '__main__':
    main()
