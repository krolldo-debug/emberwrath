# Titelbild der Startseite, Teil 2 (aufgerufen von titel-held.mjs): eigene Heldenfigur in Szenenpixeln, Glutwelle des
# Erdspalters, Ebenen als WebP, Standbild, Maße (JSON auf stdout).
# Der Held: Krieger in der Rüstung des Aschenfürsten – Harnisch, Schulterpanzer, Beintaschen und Kniekacheln in Gold,
# Helm, Arme, Beinschienen, Stulpen und Sabatons dunkel (Obsidian), Umhang und Wappenrock rot, Flammenkrone auf dem
# Topfhelm; Zweihänder Königsfall: Klinge aus Aschestahl mit Glutschneide und Runen, Flügelparier, Glutstein.
# Farben nach character/gearLook.js. Gezeichnet aus Teilen (Vielecke in ganzen Pixeln, gerichtetes Licht von rechts in
# 4 Tönen je Material, dunkle Innenkanten, Außenkontur, warme Kante vom Glutlicht). Jede Pose ist ein eigenes Bild;
# nichts wird zur Laufzeit gedreht oder skaliert.
import math, sys, os, json, hashlib
import numpy as np
from PIL import Image

def hexc(h): h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
MAT = {
    'gold': ['#2a1206', '#663410', '#a2621c', '#dc9c3a', '#ffe496'],
    'obs': ['#07040a', '#140e1c', '#231a30', '#372a4a', '#66548a'],
    'red': ['#200406', '#4a0a12', '#7a1420', '#a82232', '#d84a48'],
    'lea': ['#0e0809', '#1e1418', '#2e2026', '#443038', '#5e4650'],
    'steel': ['#1c1a24', '#3c3848', '#6a6478', '#b0aac0', '#f4f0fa'],
    'emb': ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'],
    'hot': ['#7a2208', '#c8420c', '#f07a1c', '#ffc860', '#fff4c8'],
    'void': ['#06030a', '#06030a', '#0e0812', '#0e0812', '#0e0812'],
}
OUTLINE = hexc('#0c0609')
W, H = 150, 176
FX, FY = 66, 166


class Fig:
    def __init__(s):
        s.mat = np.full((H, W), None, dtype=object)
        s.tone = np.zeros((H, W), dtype=np.int8)
        s.part = np.zeros((H, W), dtype=np.int16)
        s.np = 0
        s.line = {0: False}

    # Teil aus Maske: Schattierung gerichtet (Licht von rechts oben), Ton 1..4
    def put(s, mask, mat, light=(1.0, -0.55), hi=1, mid=3, flat=None, fixed=None, line=True, shade='cyl', cut=(0.25, 0.55), r=4.0, dcuts=(0.3, 0.66, 0.86), bh=4):
        s.np += 1; s.line[s.np] = line
        ys, xs = np.nonzero(mask)
        lx, ly = light; n = math.hypot(lx, ly); lx, ly = lx / n, ly / n
        rows = {}
        for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
        if shade == 'dome' and fixed is None: dome_t = dome(mask, r=r, cuts=dcuts)
        for y, x in zip(ys, xs):
            if fixed is not None:
                t = fixed
            elif shade == 'dome':
                t = int(dome_t[y, x])
            elif shade in ('lame', 'chest'):
                xs_ = rows[y]; a, b = min(xs_), max(xs_)
                u = (x - a + 0.5) / (b - a + 1)
                col = ys[xs == x]; top, bot = col.min(), col.max()
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
                xs_ = rows[y]; a, b = min(xs_), max(xs_)
                r = (x - a + 0.5) / (b - a + 1)
                t = 4 if (x == b and b - a >= 3) or r > 0.86 else 3 if r > cut[1] else 2 if r > cut[0] else 1
                if y > 0 and not mask[y - 1, x] and t < 4: t += 1
                if y + 1 < H and not mask[y + 1, x] and t > 1: t -= 1
            else:
                k = 1
                while k < 30:
                    xx, yy = int(round(x + lx * k)), int(round(y + ly * k))
                    if xx < 0 or yy < 0 or xx >= W or yy >= H or not mask[yy, xx]: break
                    k += 1
                t = 4 if k <= hi else 3 if k <= mid else 2 if k <= (flat or 7) else 1
            s.mat[y, x] = mat; s.tone[y, x] = t; s.part[y, x] = s.np

    def px(s, x, y, mat, t):
        if 0 <= x < W and 0 <= y < H: s.mat[y, x] = mat; s.tone[y, x] = t

    def render(s, outline=True):
        im = np.zeros((H, W, 4), np.uint8)
        for y in range(H):
            for x in range(W):
                m = s.mat[y, x]
                if m is None: continue
                t = s.tone[y, x]
                # Innenkante: Teil, das vorn liegt, bekommt an der Grenze zu einem hinteren Teil seinen dunkelsten Ton
                p = s.part[y, x]
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and s.mat[yy, xx] is not None and 0 < s.part[yy, xx] < p and s.line[p]:
                        t = 0; break
                im[y, x, :3] = hexc(MAT[m][t]); im[y, x, 3] = 255
        # Glutlicht von rechts (Klinge, Lavastrom): äußerste rechte Kante warm
        RIM = {'gold': '#ffd27a', 'obs': '#8a4a3a', 'red': '#e0583a', 'lea': '#6a3a2a'}
        a0 = im[:, :, 3] > 0
        for y in range(H):
            for x in range(W - 1):
                m = s.mat[y, x]
                if a0[y, x] and not a0[y, x + 1] and m in RIM and s.tone[y, x] > 0:
                    im[y, x, :3] = hexc(RIM[m])
        if outline:
            a = im[:, :, 3] > 0
            o = np.zeros_like(a)
            o[1:, :] |= a[:-1, :]; o[:-1, :] |= a[1:, :]; o[:, 1:] |= a[:, :-1]; o[:, :-1] |= a[:, 1:]
            o &= ~a
            im[o] = (*OUTLINE, 255)
        return im


LIGHT = np.array([0.6, -0.55, 0.58]); LIGHT = LIGHT / np.linalg.norm(LIGHT)
def dome(mask, r=4.0, cuts=(0.3, 0.66, 0.86)):
    """Wölbung aus dem Abstand zum Rand -> Normale -> Licht (rechts oben vorn) -> Töne 1..4."""
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
    s = r * 0.9
    n = np.stack([-gx * s, -gy * s, np.ones_like(hd)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    v = n @ LIGHT
    return np.select([v < cuts[0], v < cuts[1], v < cuts[2]], [1, 2, 3], 4)


def poly(pts):
    """Polygon in Figurkoordinaten (x vor/rechts, h nach oben) -> Maske (Pixelmitten)."""
    P = [(FX + x, FY - h) for x, h in pts]
    m = np.zeros((H, W), bool)
    xs = [p[0] for p in P]; ys = [p[1] for p in P]
    for y in range(max(0, int(min(ys)) - 1), min(H, int(max(ys)) + 2)):
        cy = y + 0.5
        cuts = []
        for i in range(len(P)):
            (x1, y1), (x2, y2) = P[i], P[(i + 1) % len(P)]
            if (y1 <= cy < y2) or (y2 <= cy < y1):
                cuts.append(x1 + (cy - y1) * (x2 - x1) / (y2 - y1))
        cuts.sort()
        for a, b in zip(cuts[::2], cuts[1::2]):
            for x in range(max(0, math.ceil(a - 0.5)), min(W, math.floor(b - 0.5) + 1)):
                m[y, x] = True
    return m


def seg(a, b, wa, wb):
    """Glied von a nach b (Figurkoordinaten), Breite wa -> wb, als Viereck."""
    (x1, h1), (x2, h2) = a, b
    dx, dh = x2 - x1, h2 - h1; L = math.hypot(dx, dh) or 1
    nx, nh = -dh / L, dx / L
    return poly([(x1 + nx * wa / 2, h1 + nh * wa / 2), (x2 + nx * wb / 2, h2 + nh * wb / 2), (x2 - nx * wb / 2, h2 - nh * wb / 2), (x1 - nx * wa / 2, h1 - nh * wa / 2)])


def ellipse(cx, ch, rx, rh):
    m = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W):
            u, v = (x + 0.5 - (FX + cx)) / rx, (FY - (y + 0.5) - ch) / rh
            if u * u + v * v <= 1: m[y, x] = True
    return m


def ik(sh, hand, l1, l2, bend=-1):
    (sx, sy), (hx, hy) = sh, hand
    dx, dy = hx - sx, hy - sy; d = min(math.hypot(dx, dy), l1 + l2 - 0.01)
    a = math.atan2(dy, dx)
    c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d); c = max(-1, min(1, c))
    e = a + bend * math.acos(c)
    return (sx + l1 * math.cos(e), sy + l1 * math.sin(e))


def at(fig, x, h):
    return FX + x, FY - h


# ------------------------------------------------------------------------------------------- Schwert
def sword(fig, grip, ang):
    """Königsfall. grip: Mitte des Griffs (x, h); ang: Richtung Griff->Spitze in Grad (0 = vorwärts, -90 = nach unten)."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a); vx, vh = -uh, ux
    gx, gh = grip
    P = lambda u, v: (gx + ux * u + vx * v, gh + uh * u + vh * v)
    fig.put(poly([P(-11.5, 0), P(-8.5, -3), P(-5.5, 0), P(-8.5, 3)]), 'gold', shade='dome', r=1.5)
    fig.put(poly([P(-9.6, -1), P(-7.4, -1), P(-7.4, 1), P(-9.6, 1)]), 'emb', fixed=4, line=False)
    fig.put(poly([P(-6, -1.6), P(5, -1.6), P(5, 1.6), P(-6, 1.6)]), 'red', fixed=2)
    for u in (-3, 0, 3):
        m = poly([P(u - 0.5, -1.6), P(u + 0.5, -1.6), P(u + 0.5, 1.6), P(u - 0.5, 1.6)])
        for y, x in zip(*np.nonzero(m)): fig.tone[y, x] = 1
    blade = poly([P(7, -3.5), P(46, -3.5), P(54, 0), P(46, 3.5), P(7, 3.5)])
    fig.put(blade, 'steel', fixed=2)
    for y, x in zip(*np.nonzero(blade)):
        if not (blade[y, x - 1] and blade[y, x + 1] and blade[y - 1, x] and blade[y + 1, x]):
            fig.mat[y, x] = 'hot'; fig.tone[y, x] = 3
    fuller = poly([P(10, -0.6), P(40, -0.6), P(40, 0.6), P(10, 0.6)])
    for y, x in zip(*np.nonzero(fuller)): fig.mat[y, x] = 'steel'; fig.tone[y, x] = 1
    for u in range(15, 40, 8):
        m = poly([P(u - 1.1, -0.6), P(u + 1.1, -0.6), P(u + 1.1, 0.6), P(u - 1.1, 0.6)])
        for y, x in zip(*np.nonzero(m)): fig.mat[y, x] = 'hot'; fig.tone[y, x] = 2
    side = poly([P(8, 1.2), P(42, 1.2), P(42, 2.4), P(8, 2.4)])
    for y, x in zip(*np.nonzero(side)):
        if fig.mat[y, x] == 'steel' and fig.tone[y, x] == 2: fig.tone[y, x] = 3
    # Parierstange mit Flügeln, Mitte mit Glutstein
    fig.put(poly([P(5, -9), P(4, -10), P(6, -10.5), P(8, -9), P(8, 9), P(6, 10.5), P(4, 10), P(5, 9), P(5, 3), P(5, -3)]), 'gold', light=(1, -1), hi=1, mid=2, flat=3)
    fig.put(poly([P(4.6, -1.2), P(7.6, -1.2), P(7.6, 1.2), P(4.6, 1.2)]), 'emb', fixed=4, line=False)
    fire = poly([P(16, -3.5), P(46, -3.5), P(54, 0), P(46, 3.5), P(16, 3.5)]) & blade
    return blade, fire


# ------------------------------------------------------------------------------------------- Umhang
def cape(fig, phase, lift=0, billow=0):
    """Umhang hinter dem Körper, weht nach hinten (links). phase 0..1: eigener Zyklus; billow: weht auf (Pixel)."""
    t = phase * 2 * math.pi
    back = []
    for hh in range(76, 3, -4):
        k = (76 - hh) / 72
        back.append((-9 - k * (19 + billow) - 1.8 * math.sin(t - k * 5) * k * k, hh + (lift if hh > 60 else 0) + billow * 0.45 * k * k))
    hem = []
    for i in range(9):
        k = i / 8
        x = back[-1][0] + k * (back[-1][0] * -1 - 4)
        hem.append((x, 3 + 1.5 * math.sin(t * 1 + k * 9) * (1 - k * 0.6) + billow * 0.45 * (1 - k) ** 2))
    pts = [(-2, 77 + lift)] + back + hem + [(-2, 6)]
    m = poly(pts)
    fig.put(m, 'red', fixed=2)
    ys, xs = np.nonzero(m)
    rows = {}
    for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
    for y, x in zip(ys, xs):
        a0, b0 = min(rows[y]), max(rows[y])
        u = (x - a0) / max(1, b0 - a0)
        depth = (y - ys.min()) / max(1, ys.max() - ys.min())
        f = math.sin((u * 2.6 + depth * 0.5) * 2 * math.pi + t * 0.5 + depth * 2)
        tone = 2 + (1 if f > 0.45 else -1 if f < -0.35 else 0)
        if x - a0 < 1: tone = 1
        if y + 1 < H and not m[y + 1, x]: tone = 4 if (x + y) % 2 == 0 else 3
        fig.tone[y, x] = tone
        if y + 1 < H and not m[y + 1, x]: fig.mat[y, x] = 'gold'


# ------------------------------------------------------------------------------------------- Körper
def body(fig, breath=0, crouch=0, lean=0, hands=((16, 52), (16, 47)), after_far=None, crown=0, knee=0, head=0):
    """knee: Knie nach vorn gebeugt (Pixel), head: Kopf in den Nacken (1 = Helm 1 Pixel zurück, Blick nach oben)."""
    b = breath; c = crouch
    def up(x, h):
        if h >= 46: return (x + lean * (h - 46) / 30, h + b - c)
        return (x, h - c * h / 46)
    U = lambda pts: [up(x, h) for x, h in pts]
    def dot(x, h, mat, t):
        X, Y = up(x, h); fig.px(int(round(FX + X)), int(round(FY - Y)), mat, t)
    # hinterer Arm: Oberarm hinter dem Körper, Unterarm und Hand vorn
    hf = hands[1]
    shF = up(-3, 70)
    ef = ik(shF, hf, 14, 14, bend=-1)
    fig.put(seg(shF, ef, 6, 5), 'obs')
    fig.put(seg(ef, hf, 5, 5), 'obs')
    fig.put(poly(U([(-11, 67), (-10, 76), (-5, 78), (-4, 67)])), 'gold')
    if after_far: after_far()
    # Beine (Beinschienen dunkel, Kniekacheln gold), Sabatons
    kz = 24 - c * 0.5 - knee * 0.5
    kb = knee
    fig.put(seg(up(-3, 42), (-6 + kb, kz), 8, 7), 'obs')
    fig.put(seg((-6 + kb, kz), (-8, 7), 7, 6), 'obs')
    fig.put(poly([(-9 + kb, kz + 3), (-4 + kb, kz + 3), (-3 + kb, kz - 1), (-5 + kb, kz - 3), (-9 + kb, kz - 2)]), 'gold')
    fig.put(poly([(-14, 0), (-3, 0), (-4, 3), (-6, 7), (-12, 7)]), 'obs')
    fig.put(seg(up(3, 42), (5 + kb, kz), 9, 8), 'obs')
    fig.put(seg((5 + kb, kz), (6, 7), 8, 7), 'obs')
    fig.put(poly([(1 + kb, kz + 3), (8 + kb, kz + 3), (9 + kb, kz - 1), (7 + kb, kz - 4), (2 + kb, kz - 3)]), 'gold')
    fig.put(poly([(1, 0), (15, 0), (14, 3), (10, 6), (9, 8), (2, 8)]), 'obs')
    fig.put(poly([(2, 8), (10, 8), (10, 10), (2, 10)]), 'gold', fixed=2)
    # Wappenrock vorn (schmal), Beintaschen in zwei Reifen
    fig.put(poly(U([(3, 45), (2, 27), (6, 25), (10, 27), (9, 45)])), 'red', cut=(0.2, 0.6))
    for x in range(2, 10):
        for hh in (26, 27):
            X, Y = up(x, hh); X, Y = int(round(FX + X)), int(round(FY - Y))
            if fig.mat[Y, X] == 'red': fig.mat[Y, X] = 'gold'; fig.tone[Y, X] = 3 if hh == 27 else 2
    fig.put(poly(U([(-10, 45), (-11, 34), (-5, 32), (2, 34), (2, 45)])), 'gold', shade='lame', bh=4)
    # Brustharnisch: Brust wölbt sich nach vorn, darunter ein Bauchreif
    fig.put(poly(U([(-8, 52), (-9, 60), (-8, 71), (-4, 76), (5, 76), (10, 71), (11, 63), (9, 55), (8, 52)])), 'gold', shade='chest')
    fig.put(poly(U([(-8, 48), (8, 48), (9, 53), (-8, 53)])), 'gold', shade='lame', bh=3)
    fig.put(poly(U([(-8, 45), (9, 45), (9, 48), (-8, 48)])), 'lea', fixed=2)
    fig.put(poly(U([(5, 45), (8, 45), (8, 48), (5, 48)])), 'gold', fixed=3, line=False)
    for x, h, t in ((5, 64, 4), (4, 63, 3), (6, 63, 3), (5, 62, 2), (3, 65, 3), (7, 65, 3), (5, 65, 3)):
        dot(x, h, 'emb', t)
    # Halsberge, Helm (Topfhelm: Sehschlitz, Atemlöcher, Mittelgrat), Flammenkrone
    fig.put(poly(U([(-4, 75), (5, 75), (5, 79), (-4, 79)])), 'obs', fixed=2)
    hx, hs = -head, head            # Helm zurück, Sehschlitz höher (Blick nach oben)
    HU = lambda pts: U([(x + hx, h) for x, h in pts])
    hdot = lambda x, h, m, t: dot(x + hx, h, m, t)
    helm = poly(HU([(-5, 78), (-6, 83), (-6, 88), (-4, 90), (3, 90), (6, 89), (8, 86), (8, 80), (6, 78)]))
    fig.put(helm, 'obs', cut=(0.3, 0.7))
    for x in range(1, 9): hdot(x, 85 + hs, 'void', 0)
    for x in range(2, 9): hdot(x, 84 + hs, 'obs', 4 if x > 3 else 3)
    for hh in list(range(79, 84 + hs)) + [86 + hs, 87, 88]: hdot(6, hh, 'gold', 3 if hh > 82 else 2)
    for x, h in ((4, 81), (4, 80), (8, 81)): hdot(x, h, 'void', 0)
    fig.put(poly(HU([(-6, 89), (7, 89), (7, 92), (-6, 92)])), 'gold')
    hdot(0, 90, 'emb', 4); hdot(4, 90, 'emb', 4); hdot(-4, 90, 'emb', 3)
    CR = ((0, 0, 0, 0), (1, -1, 0, 1), (0, 1, -1, 0), (-1, 0, 1, -1))[crown % 4]
    for (x0, hgt), dh in zip(((-5, 3), (-1, 5), (3, 4), (6, 2)), CR):
        hgt += dh
        for k in range(hgt):
            for dx in range(2 if k < hgt - 2 else 1):
                hdot(x0 + dx, 92 + k, 'emb', 4 if k == hgt - 1 else 3 if k >= 1 else 2)
    # vordere Schulter: großer Panzer in zwei Lagen
    fig.put(poly(U([(-10, 66), (-11, 72), (-8, 78), (-2, 80), (4, 78), (6, 72), (4, 66)])), 'gold', shade='lame', bh=8)
    fig.put(poly(U([(-9, 60), (-10, 66), (-4, 67.5), (3, 66.5), (4, 61)])), 'gold', shade='lame', bh=3)
    # vorderer Arm: Oberarm, Ellbogenkachel, Unterarm mit Stulpe
    hn = hands[0]
    shN = up(-3, 64)
    en = ik(shN, hn, 13, 14, bend=-1)
    ua, fa = seg(shN, en, 7, 7), seg(en, hn, 7, 6)
    fig.put(ua, 'obs', cut=(0.2, 0.45)); edge(fig, ua)
    fig.put(fa, 'obs', cut=(0.2, 0.45)); edge(fig, fa)
    # Stulpe: goldgesäumter Rand vor dem Handschuh
    lerp = lambda a, z, k: (a[0] + (z[0] - a[0]) * k, a[1] + (z[1] - a[1]) * k)
    fig.put(seg(lerp(en, hn, 0.6), lerp(en, hn, 0.74), 8, 8), 'obs', cut=(0.2, 0.5))
    rim = seg(lerp(en, hn, 0.58), lerp(en, hn, 0.76), 8.6, 8.6)
    fig.put(rim, 'gold', cut=(0.2, 0.5))
    for y, x in zip(*np.nonzero(rim)):
        if y > 0 and not rim[y - 1, x]: fig.tone[y, x] = 4
    # Ellbogenkachel: gewölbte Goldplatte mit Flügel nach außen
    ex, eh = en
    fig.put(poly([(ex - 1, eh + 5), (ex - 6.5, eh + 1), (ex - 5, eh - 4), (ex, eh - 1)]), 'gold', light=(1, -1), hi=1, mid=3, flat=4)
    fig.put(ellipse(ex, eh, 4.6, 4.3), 'gold', shade='dome', r=2.6, dcuts=(0.12, 0.4, 0.7))
    return hn, hf


def edge(fig, mask):
    """Helle Kante oben am Glied (1 Pixel, Kontrast gegen die dunkle Brust/Kontur)."""
    for y, x in zip(*np.nonzero(mask)):
        if y > 0 and not mask[y - 1, x] and fig.mat[y, x] == 'obs': fig.tone[y, x] = 4


def hand(fig, p, trim=False):
    m = ellipse(p[0], p[1], 3.3, 2.9)
    fig.put(m, 'obs', shade='dome', r=1.6, dcuts=(0.25, 0.55, 0.8))
    if trim:   # Panzerhandschuh: Handrücken als Goldplatte, darunter die dunklen Finger
        ys = np.nonzero(m)[0]; top, bot = ys.min(), ys.max()
        for y, x in zip(*np.nonzero(m)):
            if y - top <= (bot - top) * 0.6:
                fig.mat[y, x] = 'gold'
                fig.tone[y, x] = 4 if not m[y - 1, x] else 3 if not m[y, x - 1] or (y - top) < 2 else 2


# ------------------------------------------------------------------------------------------- Flammen der Klinge
def _lattice(seed, n):
    r = np.random.default_rng(seed); return r.random((n, n))
LAT = _lattice(7, 64)
def vnoise(x, y, per=16):
    """Wertrauschen, in y mit Periode per (Gitter) wiederholend."""
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    g = lambda i, j: LAT[i % 64, j % per]
    a = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx
    b = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx
    return a * (1 - fy) + b * fy

FLAME = ['#5a1206', '#a8300a', '#e8641a', '#ffb648', '#fff2c0']
def flame(blade, t, n, R=4.4):
    """Flammen um die Klinge (Maske blade), Bild t von n (Schleife). Harte Stufen, äußerster Kranz dunkelrot."""
    by, bx = np.nonzero(blade)
    if len(bx) == 0: return np.zeros((H, W, 4), np.uint8)
    y0, y1 = max(0, by.min() - 16), min(H, by.max() + 4)
    x0, x1 = max(0, bx.min() - 10), min(W, bx.max() + 11)
    Y, X = np.mgrid[y0:y1, x0:x1]
    d = np.full(Y.shape, 99.0)
    for qx, qy in zip(bx[::1], by[::1]):
        dy = qy - Y; dx = np.abs(X - qx)
        c = dx * 1.0 + np.where(dy > 0, dy * 0.42, -dy * 1.8)
        d = np.minimum(d, c)
    per = 16
    sh = t / n * per
    nz = vnoise(X * 0.42, Y * 0.30 + sh, per) * 0.65 + vnoise(X * 0.9 + 9, Y * 0.62 + sh * 2, per) * 0.35
    heat = 1 - d / R + (nz - 0.5) * 1.5
    out = np.zeros((H, W, 4), np.uint8)
    lv = np.select([heat > 0.78, heat > 0.6, heat > 0.42, heat > 0.25, heat > 0.12], [4, 3, 2, 1, 0], -1)
    for k in range(5):
        m = lv == k
        out[y0:y1, x0:x1][m] = (*hexc(FLAME[k]), 255)
    out[blade] = 0
    return out


# ------------------------------------------------------------------------------------------- Posen
GROUND = FY + 2     # ab dieser Bildzeile (2 unter der Fußsohle) steckt die Klinge im Boden


def hands_of(p):
    (gx, gh), ang = p['grip'], p['ang']
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a)
    hA = (gx - 2.6 * ux, gh - 2.6 * uh); hB = (gx + 2.6 * ux, gh + 2.6 * uh)
    return (hA, hB) if p.get('near', 'A') == 'A' else (hB, hA)


def layers(p, cape_phase=None, crown=0):
    """Pose -> (Körper [mit Umhang, falls cape_phase], Schwert mit vorderer Hand, Flammenmaske, Klingenmaske)."""
    near_hand, far_hand = hands_of(p)
    fb = Fig()
    if cape_phase is not None: cape(fb, cape_phase, lift=p.get('breath', 0) - p.get('crouch', 0), billow=p.get('wehen', 0))
    body(fb, p.get('breath', 0), p.get('crouch', 0), p.get('lean', 0), hands=(near_hand, far_hand), after_far=lambda: hand(fb, far_hand), crown=crown,
         knee=p.get('knee', 0), head=p.get('kopf', 0))
    fs = Fig()
    blade, fire = sword(fs, p['grip'], p['ang'])
    hand(fs, near_hand, trim=True)
    ib, isw = fb.render(), fs.render()
    g = p.get('boden', GROUND)                     # was unter dieser Zeile liegt, steckt im Boden
    ib[GROUND:] = 0; isw[g:] = 0
    fire[g:] = False; blade[g:] = False
    return ib, isw, fire, blade


def cape_only(phase):
    f = Fig(); cape(f, phase); im = f.render(); im[GROUND:] = 0; return im


def smear(p0, p1):
    """Hiebbogen: Sichel zwischen zwei Klingenwinkeln um den Griffweg, vorn breit und weißgelb, hinten schmal und rot."""
    out = np.zeros((H, W, 4), np.uint8)
    cx, ch = 2, 58                     # Drehpunkt etwa zwischen Schulter und Händen
    lo, hi = sorted((math.radians(p0), math.radians(p1)))
    for y in range(H):
        for x in range(W):
            dx, dh = x + 0.5 - FX - cx, FY - (y + 0.5) - ch
            r = math.hypot(dx, dh); a = math.atan2(dh, dx)
            if not (lo <= a <= hi): continue
            k = (a - lo) / (hi - lo)           # 0 = vorn (Klinge jetzt), 1 = hinten
            w = 9 * (1 - k) ** 1.5
            if w < 1 or not (52 - w <= r <= 52): continue
            q = (52 - r) / max(w, 1)           # 0 außen .. 1 innen
            lv = 4 if q < 0.3 and k < 0.5 else 3 if q < 0.6 else 2 if k < 0.7 else 1
            if k > 0.55 and (x + y) % 2: continue
            out[y, x] = (*hexc(FLAME[lv]), 255)
    out[GROUND:] = 0
    return out


def ring(p, k):
    """Schlachtruf: harter Funkenring um den Helm, Bild k (0..2) wächst und kühlt ab; dazu kurze Strahlen."""
    out = np.zeros((H, W, 4), np.uint8)
    cx, ch = 1 - p.get('kopf', 0), 86
    def put(x, y, lv):
        x, y = int(round(FX + cx + x)), int(round(FY - ch - y))
        if 0 <= x < W and 0 <= y < H: out[y, x] = (*hexc(FLAME[lv]), 255)
    r = (10, 14, 18)[k]
    lv_out, lv_in = ((4, 3), (3, 2), (2, 1))[k]
    n = int(2 * math.pi * r * 1.2)
    for i in range(n):
        a = 2 * math.pi * i / n
        if k == 2 and (i // 3) % 2: continue                 # zuletzt zerfällt der Kranz
        put(r * math.cos(a), r * math.sin(a), lv_out)
        if k < 2: put((r - 1) * math.cos(a), (r - 1) * math.sin(a), lv_in)
    for j in range(8):                                         # Strahlen, versetzt je Bild
        a = 2 * math.pi * (j + 0.5 * k) / 8
        for q in range(2 + (k == 1)):
            put((r + 2 + q) * math.cos(a), (r + 2 + q) * math.sin(a), max(0, lv_in - q))
    return out


def over(a, b):
    """b über a (beide RGBA, deckend oder leer)."""
    r = a.copy(); m = b[:, :, 3] > 0; r[m] = b[m]; return r


POSEN = {
    'ruhe': dict(grip=(17, 49), ang=-90),
    'zug': dict(grip=(17, 56), ang=-90),
    'h1': dict(grip=(18, 62), ang=-35, near='B'),
    'h2': dict(grip=(16, 70), ang=10, near='B'),
    'schrei': dict(grip=(14, 76), ang=40, near='B', kopf=1, wehen=12),
    'h3': dict(grip=(12, 70), ang=45, near='B'),
    'auf': dict(grip=(4, 72), ang=135, near='B', lean=-1),
    'aus': dict(grip=(-2, 78), ang=150, near='B', lean=-2),
    'hieb': dict(grip=(19, 70), ang=15, near='B', lean=1),
    # Einschlag: Knie gebeugt, Oberkörper vor, Spitze 3 Pixel hinter der Bodenkante (FY + 1)
    'ein': dict(grip=(22, 34), ang=-45, near='B', crouch=4, lean=4, knee=3, boden=FY + 1),
    'ein2': dict(grip=(22, 35), ang=-45, near='B', crouch=2, lean=2, knee=2, boden=FY + 1),
}
# Momente: (Pose, Dauer ms, Flammen größer?, Besonderes). Flammen laufen im Halten weiter (je 100 ms ein Bild).
MOMENTE = {
    'schrei': [('zug', 110), ('h1', 80), ('h2', 80), ('schrei', 1400, 'gross', 'hit'), ('h2', 90), ('h1', 90), ('zug', 120)],
    'schlag': [('zug', 100), ('h1', 70), ('h3', 70), ('auf', 80), ('aus', 400, 'gross'), ('hieb', 60, None, 'bogen'), ('ein', 520, 'gross', 'hit'), ('ein2', 260), ('zug', 150)],
}
FLAMME_N, FLAMME_MS = 6, 100     # Flammenschleife
ATEM = [0, 0, 1, 1, 1, 0]        # Brust und Schultern, je 180 ms
ATEM_MS = 180
UMHANG_N, UMHANG_MS = 8, 170
WELLE_MS, WELLE_V = 60, 300      # Glutwelle: Bilddauer, Geschwindigkeit (Szenenpixel/s)


def main():
    TMP, IMG = sys.argv[1], sys.argv[2]
    cfg = json.load(open(os.path.join(TMP, 'szene.json')))
    SZ, tops = cfg['SZ'], cfg['tops']
    sizes = {}
    def webp(im, name, opaque=False):
        p = os.path.join(IMG, name); (im.convert('RGB') if opaque else im).save(p, 'WEBP', lossless=True, quality=100, method=6); sizes[name] = os.path.getsize(p)
    L = lambda n: Image.open(os.path.join(TMP, n)).convert('RGBA')
    A = lambda a: Image.fromarray(a)

    # ---- Ruhe: Umhang, Körper (Atem, Krone), Flammen, Schwert mit Hand (steht fest)
    R = POSEN['ruhe']
    umhang = [cape_only(i / UMHANG_N) for i in range(UMHANG_N)]
    koerper = []
    for i, b in enumerate(ATEM):
        ib, isw, fire, blade = layers(dict(R, breath=b), crown=i % 4)
        koerper.append(ib)
    _, klinge, fire0, blade0 = layers(R)
    flammen = [flame(fire0, i, FLAMME_N, R=5.0) for i in range(FLAMME_N)]

    # ---- Momente: ganze Bilder (Umhang, Körper, Flammen, Schwert); gleiche Bilder nur einmal
    uniq, keys, seqs, klingen, hits = [], {}, {}, [], {}
    def frame_of(im, bl):
        h = hashlib.md5(im.tobytes()).hexdigest()
        if h not in keys:
            keys[h] = len(uniq); uniq.append(im)
            ys, xs = np.nonzero(bl)
            if len(xs):
                # Klingenstrecke (Anfang, Ende) für Funken: die zwei am weitesten entfernten Punkte, grob
                i0 = np.argmin(xs + ys * 0.01); i1 = np.argmax(xs + ys * 0.01)
                pts = list(zip(xs.tolist(), ys.tolist()))
                a = min(pts, key=lambda q: q[1]); z = max(pts, key=lambda q: q[1])
                if abs(a[1] - z[1]) < 6: a = min(pts, key=lambda q: q[0]); z = max(pts, key=lambda q: q[0])
                klingen.append([a[0], a[1], z[0], z[1]])
            else:
                klingen.append(None)
        return keys[h]
    impact = None
    for name, seq in MOMENTE.items():
        out, tms = [], 0
        for step in seq:
            pn, ms = step[0], step[1]
            big = len(step) > 2 and step[2] == 'gross'
            tag = step[3] if len(step) > 3 else None
            p = POSEN[pn]
            n = max(1, round(ms / FLAMME_MS)) if big else 1
            for k in range(n):
                cph = int(tms // UMHANG_MS) % UMHANG_N
                q = dict(p, wehen=max(4, p['wehen'] - k)) if 'wehen' in p else p    # Umhang fällt im Halten langsam zurück
                ib, isw, fire, blade = layers(q, cape_phase=cph / UMHANG_N)
                fl = flame(fire, (len(out) + k) % FLAMME_N, FLAMME_N, R=5.6 if big else 4.4)
                im = over(over(ib, fl), isw)
                if tag == 'bogen': im = over(over(ib, smear(15, 120)), isw)
                if tag == 'hit' and name == 'schrei' and k < 3: im = over(ring(p, k), im)
                if tag == 'hit' and k == 0: hits[name] = len(out)
                out.append([frame_of(im, blade), round(ms / n)])
                tms += round(ms / n)
            if tag == 'hit' and name == 'schlag':
                ys, xs = np.nonzero(blade[:GROUND])
                low = ys.max(); impact = int(round(xs[ys == low].mean())) - FX
        seqs[name] = out

    # ---- gemeinsamer Rahmen über alle Heldenbilder
    allims = umhang + koerper + flammen + [klinge] + uniq
    x0, y0, x1, y1 = W, H, 0, 0
    for im in allims:
        a = np.nonzero(im[:, :, 3])
        if len(a[0]): y0, y1, x0, x1 = min(y0, a[0].min()), max(y1, a[0].max() + 1), min(x0, a[1].min()), max(x1, a[1].max() + 1)
    fw, fh = int(x1 - x0), int(y1 - y0)
    def strip(ims, name):
        st = Image.new('RGBA', (fw * len(ims), fh))
        for i, im in enumerate(ims): st.paste(A(im[y0:y1, x0:x1]), (i * fw, 0))
        webp(st, name)
    strip(umhang, 'titel-held-umhang.webp'); strip(koerper, 'titel-held-koerper.webp')
    strip(flammen, 'titel-held-flamme.webp'); strip([klinge], 'titel-held-klinge.webp')
    strip(uniq, 'titel-held-momente.webp')
    kl = [[k[0] - x0, k[1] - y0, k[2] - x0, k[3] - y0] if k else None for k in klingen]
    ys, xs = np.nonzero(fire0)
    kl_ruhe = [int(xs.min() - x0), int(ys.min() - y0), int(xs.max() - x0), int(ys.max() - y0)]

    # ---- Vordergrund: Schatten des Helden (feste Stufen), Glut darunter aus
    HX, FYs = SZ['HX'], SZ['FY']
    nah, ng = L('szene-nah.png'), L('szene-nahGlut.png'); px, gp = nah.load(), ng.load()
    for dy, hw, k in [(-1, 14, 0.55), (0, 18, 0.5), (1, 16, 0.55), (2, 11, 0.65)]:
        for x in range(HX - hw - 4, HX + hw - 2):
            y = FYs + dy
            r, g, b_, a = px[x, y]
            if a: px[x, y] = (int(r * k), int(g * k), int(b_ * k), a)
            gp[x, y] = (0, 0, 0, 0)
    top = min(tops)
    SZ['NT'] = top
    webp(nah.crop((0, top, nah.width, nah.height)), 'titel-nah.webp'); webp(ng.crop((0, top, ng.width, ng.height)), 'titel-nah-glut.webp')
    cut = FYs + 10
    webp(L('szene-fern.png').crop((0, 0, SZ['W'], cut)), 'titel-fern.webp', True)
    webp(L('szene-fernGlut.png').crop((0, 0, SZ['W'], cut)), 'titel-fern-glut.webp')
    webp(L('szene-mitte.png').crop((0, 0, SZ['W'], cut)), 'titel-mitte.webp'); webp(L('szene-mitteGlut.png').crop((0, 0, SZ['W'], cut)), 'titel-mitte-glut.webp')
    webp(L('szene-lava.png'), 'titel-strom.webp'); webp(L('szene-lavaGlut.png'), 'titel-strom-glut.webp')

    # ---- Glutwelle des Erdspalters: läuft vom Einschlag über die Fugen der Kruste (nicht entlang der Kante).
    # Jede Fuge glüht, wenn die Welle sie erreicht, weißgelb -> orange -> rot auf und erlischt; weiter weg schwächer.
    # Bilder zu WELLE_MS, gestapelt; nur die Pixel, die gerade glühen.
    X0, Y0 = HX + impact, FYs + 1
    fuge = np.asarray(L('szene-nahFuge.png'))[:, :, 3] > 0
    rng = np.random.default_rng(11)
    pts = {}
    ys, xs = np.nonzero(fuge)
    for y, x in zip(ys, xs):
        if y < Y0 + 1 or abs(x - X0) > 190: continue
        pts[(x, y)] = math.hypot(x - X0, (y - Y0) * 2.4)
    # frischer Spalt vom Einschlag hinunter in die nächsten Fugen
    for dx0 in (-1, 1):
        x, y = X0, Y0
        for k in range(9):
            y += 1
            if rng.random() < 0.6: x += dx0
            pts[(x, y)] = min(pts.get((x, y), 99), k * 0.8)
    for x in range(X0 - 2, X0 + 3): pts[(x, Y0)] = 0
    # Verzögerung leicht verrauscht je Fugenzelle (keine perfekte Ellipse)
    jit = {}
    def delay(x, y, dd):
        c = (x // 6, y // 4)
        if c not in jit: jit[c] = rng.random() * 0.05
        return dd / WELLE_V + jit[c]
    PEAK = lambda dd: 4 if dd < 45 else 3 if dd < 110 else 2
    tmax = max(delay(x, y, dd) for (x, y), dd in pts.items()) + 0.75
    nfr = int(math.ceil(tmax * 1000 / WELLE_MS))
    frames = []
    for f in range(nfr):
        t = f * WELLE_MS / 1000
        fr = {}
        for (x, y), dd in pts.items():
            age = t - delay(x, y, dd)
            if age < 0: continue
            lv = PEAK(dd) - (0 if age < 0.07 else 1 if age < 0.2 else 2 if age < 0.4 else 3 if age < 0.62 else 9)
            if lv >= 0: fr[(x, y)] = lv
        frames.append(fr)
    allp = [q for fr in frames for q in fr]
    wx0, wx1 = min(x for x, _ in allp), max(x for x, _ in allp) + 1
    wy0, wy1 = min(y for _, y in allp), max(y for _, y in allp) + 1
    ww, wh = wx1 - wx0, wy1 - wy0
    welle = Image.new('RGBA', (ww, wh * nfr))
    for i, fr in enumerate(frames):
        for (x, y), lv in fr.items(): welle.putpixel((x - wx0, y - wy0 + i * wh), (*hexc(FLAME[lv]), 255))
    webp(welle, 'titel-welle.webp')

    # ---- Standbild: alle Ebenen in Ruhe, Held Bild 0
    po = L('szene-fern.png').crop((0, 0, SZ['W'], SZ['H'])); po.alpha_composite(L('szene-fernGlut.png'))
    lv, lg = L('szene-lava.png'), L('szene-lavaGlut.png')
    po.alpha_composite(lv.crop((0, 0, lv.width, SZ['LH2'])), (0, SZ['LT'])); po.alpha_composite(lg.crop((0, 0, lg.width, SZ['LH2'])), (0, SZ['LT']))
    po.alpha_composite(L('szene-mitte.png')); po.alpha_composite(L('szene-mitteGlut.png'))
    po.alpha_composite(nah); po.alpha_composite(ng)
    hero = over(over(over(umhang[0], koerper[0]), flammen[0]), klinge)
    po.alpha_composite(A(hero), (HX - FX, FYs - FY))
    p = os.path.join(IMG, 'titel.webp'); po.convert('RGB').save(p, 'WEBP', lossless=True, quality=100, method=6); sizes['titel.webp'] = os.path.getsize(p)
    po.convert('RGB').save(os.path.join(TMP, 'vorschau.png'))

    meta = {
        'szene': SZ,
        'held': {'w': fw, 'h': fh, 'fx': int(FX - x0), 'fy': int(FY - y0)},
        'ruhe': {'atem': len(ATEM), 'atemMs': ATEM_MS, 'umhang': UMHANG_N, 'umhangMs': UMHANG_MS, 'flamme': FLAMME_N, 'flammeMs': FLAMME_MS, 'klinge': kl_ruhe},
        'momente': {k: {'f': v, 'hit': hits.get(k, 0)} for k, v in seqs.items()},
        'klingen': kl,
        'welle': {'x': wx0, 'y': wy0, 'w': ww, 'h': wh, 'n': nfr, 'ms': WELLE_MS, 'v': WELLE_V, 'x0': X0},
    }
    print(json.dumps({'meta': meta, 'sizes': sizes}, default=int))


if __name__ == '__main__':
    main()
