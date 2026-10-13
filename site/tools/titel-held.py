# Titelbild der Startseite, Teil 2 (aufgerufen von titel-held.mjs): eigene Heldenfigur, Glutwelle des Erdspalters,
# Ebenen als WebP, Standbild, Maße (JSON auf stdout).
# Feinraster (docs/STYLE.md „Feinraster“): Formen in Szenenpixeln (Figurkoordinaten), gerastert mit Q = 2 Feinpixeln je
# Szenenpixel; Details (Glanzlinien, Sehschlitz, Nähte, Faltenkanten, Kronenflammen) sind einzelne Feinpixel, Umriss
# und Innenkanten 1 Feinpixel. Nichts wird hochskaliert.
# Der Held: Krieger in der Rüstung des Aschenfürsten – Harnisch, Schulterpanzer, Beintaschen und Kniekacheln in Gold,
# Helm, Arme, Beinschienen, Stulpen und Sabatons dunkel (Obsidian), Umhang und Wappenrock rot, Flammenkrone auf dem
# Topfhelm (Sehschlitz mit glühendem Auge unter der Brauenkante); Zweihänder Königsfall: Klinge aus Aschestahl mit
# Glutschneide (nur die Schneidenkante glüht), Hohlkehle mit Runen, Flügelparier, Glutstein.
# Metall in 5 Stufen + Glanzlinie (1 Feinpixel) + Glanzpunkt, Stoff mit zweifarbigen Faltenkanten, Leder mit Punktnaht.
# Farben nach character/gearLook.js. Gerichtetes Licht von rechts oben (Glut des Stroms und der Klinge), warme Kante
# rechts. Jede Pose ist ein eigenes Bild; nichts wird zur Laufzeit gedreht oder skaliert.
import math, sys, os, json, hashlib
import numpy as np
from PIL import Image

Q = 2                       # Feinpixel je Szenenpixel


def hexc(h): h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
# Rampen: 0 = Innenkante, 1..5 Töne (Metall), 6 = Glanz; Stoff/Leder/Glut 0..4
MAT = {
    'gold': ['#2a1206', '#663410', '#a2621c', '#dc9c3a', '#f2be56', '#ffe496', '#fffbe6'],
    'obs': ['#07040a', '#140e1c', '#231a30', '#372a4a', '#4c3c66', '#66548a', '#a090cc'],
    'steel': ['#1c1a24', '#3c3848', '#6a6478', '#8e889e', '#b0aac0', '#dcd8e8', '#ffffff'],
    'red': ['#200406', '#4a0a12', '#7a1420', '#a82232', '#d84a48'],
    'lea': ['#0e0809', '#1e1418', '#2e2026', '#443038', '#5e4650'],
    'emb': ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffd890'],
    'hot': ['#7a2208', '#c8420c', '#f07a1c', '#ffc860', '#fff4c8'],
    'void': ['#06030a', '#06030a', '#0e0812', '#0e0812', '#0e0812'],
}
MATS = list(MAT)
MI = {m: i for i, m in enumerate(MATS)}
METAL = {'gold', 'obs', 'steel'}
LUT = np.zeros((len(MATS), 7, 3), np.uint8)
TMAX = np.zeros(len(MATS), np.int8)
for m, r in MAT.items():
    for k in range(7): LUT[MI[m], k] = hexc(r[min(k, len(r) - 1)])
    TMAX[MI[m]] = len(r) - 1
RIM = {'gold': '#ffd27a', 'obs': '#8a4a3a', 'red': '#e0583a', 'lea': '#6a3a2a'}
RIMLUT = np.zeros((len(MATS), 3), np.uint8); RIMOK = np.zeros(len(MATS), bool)
for m, c in RIM.items(): RIMLUT[MI[m]] = hexc(c); RIMOK[MI[m]] = True
OUTLINE = hexc('#0c0609')
W, H = 150 * Q, 176 * Q
FX, FY = 66 * Q, 166 * Q
LX, LH = 1.0 / math.hypot(1, 0.55), 0.55 / math.hypot(1, 0.55)     # Licht (Figurkoordinaten, h nach oben)
YY, XX = np.mgrid[0:H, 0:W]
FXC, FHC = (XX + 0.5 - FX) / Q, (FY - (YY + 0.5)) / Q                  # Feinpixelmitten in Figurkoordinaten


def shift(a, dy, dx, fill=0):
    """out[y, x] = a[y + dy, x + dx] (außerhalb: fill)."""
    o = np.full_like(a, fill)
    ys, ye = max(0, -dy), H - max(0, dy); xs, xe = max(0, -dx), W - max(0, dx)
    o[ys:ye, xs:xe] = a[ys + dy:ye + dy, xs + dx:xe + dx]
    return o


def extents(mask):
    rmin = mask.argmax(1); rmax = W - 1 - mask[:, ::-1].argmax(1)
    cmin = mask.argmax(0); cmax = H - 1 - mask[::-1, :].argmax(0)
    return rmin, rmax, cmin, cmax


class Fig:
    def __init__(s):
        s.mat = np.full((H, W), -1, np.int8)
        s.tone = np.zeros((H, W), np.int8)
        s.part = np.zeros((H, W), np.int16)
        s.np = 0
        s.line = [False]

    # Teil aus Maske: Schattierung gerichtet (Licht von rechts oben), Töne 1..5, Glanz 6 (nur Metall)
    def put(s, mask, mat, light=(1.0, -0.55), hi=1, mid=3, flat=None, fixed=None, line=True, shade='cyl', cut=(0.25, 0.55), r=4.0, dcuts=(0.3, 0.66, 0.86), bh=4):
        s.np += 1; s.line.append(line)
        ys, xs = np.nonzero(mask)
        if len(ys) == 0: return
        if fixed is not None:
            t = np.full(len(ys), fixed)
        elif shade == 'dome':
            t = dome(mask, r=r * Q, cuts=dcuts)[ys, xs]
        elif shade in ('lame', 'chest', 'cyl'):
            rmin, rmax, cmin, cmax = extents(mask)
            a, b = rmin[ys], rmax[ys]; top, bot = cmin[xs], cmax[xs]
            u = (xs - a + 0.5) / (b - a + 1)
            if shade == 'lame':
                bf = bh * Q; pos = (ys - top) % bf
                t = np.select([pos == 0, pos == 1, pos == 2, pos == bf - 1, pos == bf - 2], [np.where(u > 0.35, 6, 4), np.where(u > 0.35, 5, 4), 4, 1, 2], 3)
                t = np.where((u < 0.2) & (t > 1) & (t < 6), t - 1, t)
                t = np.where((u > 0.8) & (t == 2), 3, t)
            elif shade == 'chest':
                v = (ys - top) / np.maximum(1, bot - top)
                t = np.select([u < 0.18, u < 0.45], [1, 2], 3)
                st = (u >= 0.64) & (u < 0.84) & (v < 0.6)
                t = np.where(st, np.where((u >= 0.69) & (u < 0.79), 5, 4), t)
                gx = a + np.floor(0.74 * (b - a + 1)).astype(int)
                t = np.where(st & (xs == gx), 6, t)
                t = np.where((v > 0.78) & (t > 1), t - 1, t)
                t = np.where((ys == top) & (t < 5), t + 1, t)
            else:
                t = np.select([u <= cut[0], u <= cut[1], u <= 0.72, u <= 0.86], [1, 2, 3, 4], 5)
                t = np.where((xs == b) & (b - a >= 3 * Q), 5, t)
                g = a + np.ceil(0.86 * (b - a + 1) - 0.5).astype(int)        # erste Spalte im Glanzband
                t = np.where((xs == g) & (b - a >= 4 * Q) & (t == 5), 6, t)
                above = shift(mask, -1, 0, False)[ys, xs]; below = shift(mask, 1, 0, False)[ys, xs]
                t = np.where(~above & (t < 5), t + 1, t)
                t = np.where(~below & (t > 1) & (t < 6), t - 1, t)
        else:
            lx, ly = light; n = math.hypot(lx, ly); lx, ly = lx / n, ly / n
            K = np.full(len(ys), 60); alive = np.ones(len(ys), bool)
            for k in range(1, 61):
                xx = np.round(xs + lx * k).astype(int); yy = np.round(ys + ly * k).astype(int)
                ins = (xx >= 0) & (yy >= 0) & (xx < W) & (yy < H)
                ins[ins] = mask[yy[ins], xx[ins]]
                hit = alive & ~ins; K[hit] = k; alive &= ins
                if not alive.any(): break
            t = np.select([K <= 1, K <= hi * Q, K <= mid * Q, K <= (flat or 7) * Q], [5, 4, 3, 2], 1)
        if mat not in METAL: t = np.minimum(t, 4)
        s.mat[ys, xs] = MI[mat]; s.tone[ys, xs] = t; s.part[ys, xs] = s.np

    def set(s, mask, mat, t):
        s.mat[mask] = MI[mat]; s.tone[mask] = t

    def render(s, outline=True):
        has = s.mat >= 0
        t = np.minimum(s.tone, TMAX[np.maximum(s.mat, 0)])
        # Innenkante: Teil, das vorn liegt, bekommt an der Grenze zu einem hinteren Teil seinen dunkelsten Ton (1 Feinpixel)
        P = s.part; L = np.array(s.line)[P]
        edge = np.zeros_like(has)
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            q = shift(P, dy, dx, 0)
            edge |= has & (q > 0) & (q < P) & L
        t = np.where(edge, 0, t)
        im = np.zeros((H, W, 4), np.uint8)
        m = np.maximum(s.mat, 0)
        im[..., :3] = LUT[m, t]; im[..., 3] = np.where(has, 255, 0)
        im[~has] = 0
        # Glutlicht von rechts (Klinge, Lavastrom): äußerste rechte Kante warm (1 Feinpixel)
        rim = has & ~shift(has, 0, 1, False) & RIMOK[m] & (s.tone > 0)
        im[rim, :3] = RIMLUT[m[rim]]
        if outline:
            a = im[:, :, 3] > 0
            o = shift(a, 1, 0, False) | shift(a, -1, 0, False) | shift(a, 0, 1, False) | shift(a, 0, -1, False)
            o &= ~a
            im[o] = (*OUTLINE, 255)
        return im


LIGHT = np.array([0.6, -0.55, 0.58]); LIGHT = LIGHT / np.linalg.norm(LIGHT)
def dome(mask, r=4.0, cuts=(0.3, 0.66, 0.86)):
    """Wölbung aus dem Abstand zum Rand -> Normale -> Licht (rechts oben vorn) -> Töne 1..5, Glanzpunkt 6."""
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
    c4 = cuts[2] + (1 - cuts[2]) * 0.5
    t = np.select([v < cuts[0], v < cuts[1], v < cuts[2], v < c4], [1, 2, 3, 4], 5)
    vm = np.where(mask, v, -9)
    if mask.any():
        y, x = np.unravel_index(np.argmax(vm), vm.shape)
        if t[y, x] == 5: t[y, x] = 6
    return t


def poly(pts):
    """Polygon in Figurkoordinaten (x vor/rechts, h nach oben) -> Maske (Feinpixelmitten)."""
    P = [(FX + x * Q, FY - h * Q) for x, h in pts]
    m = np.zeros((H, W), bool)
    ys = [p[1] for p in P]
    for y in range(max(0, int(min(ys)) - 1), min(H, int(max(ys)) + 2)):
        cy = y + 0.5
        cuts = []
        for i in range(len(P)):
            (x1, y1), (x2, y2) = P[i], P[(i + 1) % len(P)]
            if (y1 <= cy < y2) or (y2 <= cy < y1):
                cuts.append(x1 + (cy - y1) * (x2 - x1) / (y2 - y1))
        cuts.sort()
        for a, b in zip(cuts[::2], cuts[1::2]):
            x0, x1 = max(0, math.ceil(a - 0.5)), min(W, math.floor(b - 0.5) + 1)
            if x1 > x0: m[y, x0:x1] = True
    return m


def seg(a, b, wa, wb):
    """Glied von a nach b (Figurkoordinaten), Breite wa -> wb, als Viereck."""
    (x1, h1), (x2, h2) = a, b
    dx, dh = x2 - x1, h2 - h1; L = math.hypot(dx, dh) or 1
    nx, nh = -dh / L, dx / L
    return poly([(x1 + nx * wa / 2, h1 + nh * wa / 2), (x2 + nx * wb / 2, h2 + nh * wb / 2), (x2 - nx * wb / 2, h2 - nh * wb / 2), (x1 - nx * wa / 2, h1 - nh * wa / 2)])


def ellipse(cx, ch, rx, rh):
    return ((FXC - cx) / rx) ** 2 + ((FHC - ch) / rh) ** 2 <= 1


def fpx(x, h):
    """Maske eines einzelnen Feinpixels am Figurpunkt (x, h)."""
    m = np.zeros((H, W), bool)
    X, Y = int(math.floor(FX + x * Q)), int(math.floor(FY - h * Q))
    if 0 <= X < W and 0 <= Y < H: m[Y, X] = True
    return m


def ik(sh, hand, l1, l2, bend=-1):
    (sx, sy), (hx, hy) = sh, hand
    dx, dy = hx - sx, hy - sy; d = min(math.hypot(dx, dy), l1 + l2 - 0.01)
    a = math.atan2(dy, dx)
    c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d); c = max(-1, min(1, c))
    e = a + bend * math.acos(c)
    return (sx + l1 * math.cos(e), sy + l1 * math.sin(e))


def toprow(mask):
    return mask & ~shift(mask, -1, 0, False)


def gem(fig, m):
    """Glutstein in Maske m: Saum dunkel, Kern hell, Glanzpunkt rechts oben (heiß)."""
    fig.put(m, 'emb', fixed=3, line=False)
    sc = np.where(m, FXC * LX + FHC * LH, -99)
    if not m.any(): return
    edge = m & ~(shift(m, 1, 0, False) & shift(m, -1, 0, False) & shift(m, 0, 1, False) & shift(m, 0, -1, False))
    lo = m & edge & (sc < np.median(sc[m]))
    fig.set(lo, 'emb', 2)
    y, x = np.unravel_index(np.argmax(sc), sc.shape)
    fig.mat[y, x] = MI['hot']; fig.tone[y, x] = 4


# ------------------------------------------------------------------------------------------- Schwert
GLYPH = [1, 3, 4, 0]     # Kerbe je Rune (Feinzeile), damit jedes Zeichen anders aussieht
def sword(fig, grip, ang):
    """Königsfall. grip: Mitte des Griffs (x, h); ang: Richtung Griff->Spitze in Grad (0 = vorwärts, -90 = nach unten)."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a); vx, vh = -uh, ux
    gx, gh = grip
    du = (FXC - gx) * ux + (FHC - gh) * uh
    dv = (FXC - gx) * vx + (FHC - gh) * vh
    side = 1 if vx * LX + vh * LH >= 0 else -1                    # Seite der Klinge, die zum Licht zeigt
    sv = dv * side                                                # > 0: Lichtseite
    P = lambda u, v: (gx + ux * u + vx * v, gh + uh * u + vh * v)
    # Knauf: Raute mit Glutstein
    fig.put((np.abs(du + 8.5) + np.abs(dv) <= 3.0), 'gold', shade='dome', r=1.5)
    gem(fig, (np.abs(du + 8.5) <= 1.25) & (np.abs(dv) <= 1.0))
    # Griff: rot gewickelt (schräge Wicklung je Feinpixel), Lichtseite heller
    grip_m = (du >= -6) & (du <= 5) & (np.abs(dv) <= 1.6)
    fig.put(grip_m, 'red', fixed=2)
    wrap = ((np.floor(du * Q) + np.floor(dv * Q * 0.5)) % 3) == 0
    fig.set(grip_m & wrap, 'red', 1)
    fig.set(grip_m & ~wrap & (sv > 0.7), 'red', 3)
    fig.set(grip_m & ~wrap & (sv > 1.1), 'red', 4)
    # Klinge: Aschestahl, Schneide auf der Schattenseite glühend (nur die Kante), Lichtseite mit Glanzlinie
    hw = np.where(du <= 46, 3.5, 3.5 * np.clip((54 - du) / 8, 0, 1))
    blade = (du >= 7) & (du <= 54) & (np.abs(dv) <= hw + 0.01)
    fig.put(blade, 'steel', fixed=3)
    e = hw - np.abs(dv)
    st = np.where(sv > 0, 3, 2)
    st = np.where(e < hw * 0.45, np.where(sv > 0, 4, 1), st)                  # Fase
    ful = (du >= 10) & (du <= 41) & (np.abs(dv) < 0.62)                       # Hohlkehle
    st = np.where(ful, 1, st)
    st = np.where((du > 41) & (np.abs(dv) < 0.3), 4, st)                       # Mittelgrat zur Spitze
    st = np.where(du < 10, np.where(sv > 0, 3, 2), st)                         # Fehlschärfe: matt
    fig.set(blade, 'steel', 0); fig.tone[blade] = st[blade]
    e1 = blade & (e < 0.5)                                                    # Schneiden (1 Feinpixel)
    fig.set(e1 & (sv > 0), 'steel', 6)
    fig.set(e1 & (sv <= 0) & (du >= 11), 'hot', 2)
    fig.set(e1 & (sv <= 0) & (du >= 11) & ((np.floor(du * Q) % 9 == 0) | (du > 49)), 'hot', 3)
    for i, uc in enumerate((15, 21, 27, 33, 39)):                             # Runen: glühende Zeichen, Kern hell
        sp = blade & ful & (np.abs(du - uc) <= 1.3)
        k = np.floor((du - uc + 1.3) * Q).astype(int)
        fig.set(sp, 'emb', 3)
        fig.set(sp & (k == GLYPH[i % 4]) & ((dv > 0) == (i % 2 == 0)), 'steel', 1)
        fig.set(sp & (np.abs(du - uc) < 0.3), 'hot', 3)
    # Parierstange mit Flügeln, Mitte mit Glutstein
    fig.put(poly([P(5, -9), P(4, -10), P(6, -10.5), P(8, -9), P(8, 9), P(6, 10.5), P(4, 10), P(5, 9), P(5, 3), P(5, -3)]), 'gold', light=(1, -1), hi=1, mid=2, flat=3)
    gem(fig, (np.abs(du - 6.1) <= 1.4) & (np.abs(dv) <= 1.2))
    fire = blade & (du >= 16)
    return blade, fire


# ------------------------------------------------------------------------------------------- Umhang
def cape(fig, phase, lift=0, billow=0):
    """Umhang hinter dem Körper, weht nach hinten (links). phase 0..1: eigener Zyklus; billow: weht auf (Szenenpixel).
    Falten als Bänder mit zweifarbigen Kanten (heller Grat, dunkle Kerbe je 1 Feinpixel), Goldsaum mit Glanzlinie."""
    t = phase * 2 * math.pi
    back = []
    for hh in range(76, 3, -2):
        k = (76 - hh) / 72
        back.append((-9 - k * (19 + billow) - 1.8 * math.sin(t - k * 5) * k * k, hh + (lift if hh > 60 else 0) + billow * 0.45 * k * k))
    hem = []
    for i in range(17):
        k = i / 16
        x = back[-1][0] + k * (back[-1][0] * -1 - 4)
        hem.append((x, 3 + 1.5 * math.sin(t * 1 + k * 9) * (1 - k * 0.6) + billow * 0.45 * (1 - k) ** 2))
    pts = [(-2, 77 + lift)] + back + hem + [(-2, 6)]
    m = poly(pts)
    fig.put(m, 'red', fixed=2)
    ys, xs = np.nonzero(m)
    rmin, rmax, cmin, cmax = extents(m)
    a0, b0 = rmin[ys], rmax[ys]
    u = (xs - a0) / np.maximum(1, b0 - a0)
    depth = (ys - ys.min()) / max(1, ys.max() - ys.min())
    f = np.sin((u * 2.6 + depth * 0.5) * 2 * math.pi + t * 0.5 + depth * 2)
    tone = np.select([f > 0.82, f > 0.42, f > -0.35, f > -0.8], [4, 3, 2, 1], 0)
    tone = np.where(xs - a0 < Q, 1, tone)
    b1 = ~shift(m, 1, 0, False)[ys, xs]; b2 = ~shift(m, 2, 0, False)[ys, xs]; b3 = ~shift(m, 3, 0, False)[ys, xs]
    fig.tone[ys, xs] = tone
    # Goldsaum: zwei Feinpixel, oben Glanz; darüber eine dunkle Kerbe
    hemm = np.zeros_like(m); hemm[ys[b2], xs[b2]] = True
    fig.mat[hemm] = MI['gold']
    fig.tone[ys[b1], xs[b1]] = 3
    top = b2 & ~b1
    fig.tone[ys[top], xs[top]] = np.where((xs[top] + ys[top]) % 7 == 0, 6, 5)
    dk = b3 & ~b2
    fig.tone[ys[dk], xs[dk]] = 1


# ------------------------------------------------------------------------------------------- Körper
def body(fig, breath=0, crouch=0, lean=0, hands=((16, 52), (16, 47)), after_far=None, crown=0, knee=0, head=0):
    """knee: Knie nach vorn gebeugt (Szenenpixel), head: Kopf in den Nacken (1 = Helm 1 Pixel zurück, Blick nach oben)."""
    b = breath; c = crouch
    def up(x, h):
        if h >= 46: return (x + lean * (h - 46) / 30, h + b - c)
        return (x, h - c * h / 46)
    U = lambda pts: [up(x, h) for x, h in pts]
    def dot(x, h, mat, t):
        X, Y = up(x, h); fig.set(fpx(X, Y), mat, t)
    # hinterer Arm: Oberarm hinter dem Körper, Unterarm und Hand vorn
    hf = hands[1]
    shF = up(-3, 70)
    ef = ik(shF, hf, 14, 14, bend=-1)
    fig.put(seg(shF, ef, 6, 5), 'obs')
    fig.put(seg(ef, hf, 5, 5), 'obs')
    fig.put(poly(U([(-11, 67), (-10, 76), (-5, 78), (-4, 67)])), 'gold')
    if after_far: after_far()
    # Beine (Beinschienen dunkel, Kniekacheln gold), Sabatons mit Folgeplatten
    kz = 24 - c * 0.5 - knee * 0.5
    kb = knee
    fig.put(seg(up(-3, 42), (-6 + kb, kz), 8, 7), 'obs')
    fig.put(seg((-6 + kb, kz), (-8, 7), 7, 6), 'obs')
    fig.put(poly([(-9 + kb, kz + 3), (-4 + kb, kz + 3), (-3 + kb, kz - 1), (-5 + kb, kz - 3), (-9 + kb, kz - 2)]), 'gold')
    sab = poly([(-14, 0), (-3, 0), (-4, 3), (-6, 7), (-12, 7)])
    fig.put(sab, 'obs')
    sab2 = poly([(1, 0), (15, 0), (14, 3), (10, 6), (9, 8), (2, 8)])
    fig.put(seg(up(3, 42), (5 + kb, kz), 9, 8), 'obs')
    fig.put(seg((5 + kb, kz), (6, 7), 8, 7), 'obs')
    fig.put(poly([(1 + kb, kz + 3), (8 + kb, kz + 3), (9 + kb, kz - 1), (7 + kb, kz - 4), (2 + kb, kz - 3)]), 'gold')
    fig.put(sab2, 'obs')
    for sm, rows in ((sab, (3.0, 5.0)), (sab2, (3.0, 5.5))):        # Folgeplatten: dunkle Fuge, darüber Glanz
        for hh in rows:
            ln = sm & (FHC >= hh) & (FHC < hh + 0.5)
            fig.set(ln, 'obs', 1)
            fig.set(shift(ln, 1, 0, False) & sm & ~ln, 'obs', 5)
    fig.put(poly([(2, 8), (10, 8), (10, 10), (2, 10)]), 'gold', fixed=3)
    fig.set(toprow(poly([(2, 8), (10, 8), (10, 10), (2, 10)])), 'gold', 5)
    # Wappenrock vorn (schmal) mit zwei Falten, Beintaschen in zwei Reifen
    tab = poly(U([(3, 45), (2, 27), (6, 25), (10, 27), (9, 45)]))
    fig.put(tab, 'red', cut=(0.2, 0.6))
    rmin, rmax, _, _ = extents(tab)
    tu = (XX - rmin[:, None] + 0.5) / np.maximum(1, rmax - rmin + 1)[:, None]
    for c0 in (0.36, 0.68):
        fig.set(tab & (tu >= c0) & (tu < c0 + 1.0 / max(1, 8)) & (FHC < 42), 'red', 1)
        fig.set(tab & (tu >= c0 - 0.13) & (tu < c0) & (FHC < 42), 'red', 4 if c0 > 0.5 else 3)
    band = tab & (FHC >= up(0, 25.5)[1]) & (FHC < up(0, 27.5)[1])
    bys = np.nonzero(band)[0]
    if len(bys):
        r0 = bys.min()
        for k, tt in enumerate((5, 4, 3, 2)): fig.set(band & (YY == r0 + k), 'gold', tt)
    fig.put(poly(U([(-10, 45), (-11, 34), (-5, 32), (2, 34), (2, 45)])), 'gold', shade='lame', bh=4)
    # Brustharnisch: Brust wölbt sich nach vorn, darunter ein Bauchreif
    fig.put(poly(U([(-8, 52), (-9, 60), (-8, 71), (-4, 76), (5, 76), (10, 71), (11, 63), (9, 55), (8, 52)])), 'gold', shade='chest')
    fig.put(poly(U([(-8, 48), (8, 48), (9, 53), (-8, 53)])), 'gold', shade='lame', bh=3)
    # Gürtel: Leder mit Punktnaht, Schnalle mit Dorn
    belt = poly(U([(-8, 45), (9, 45), (9, 48), (-8, 48)]))
    fig.put(belt, 'lea', fixed=2)
    fig.set(toprow(belt), 'lea', 3)
    fig.set(belt & ~shift(belt, 1, 0, False), 'lea', 1)
    by = np.nonzero(belt)[0]
    if len(by):
        mid = (by.min() + by.max()) // 2
        fig.set(belt & (YY == mid) & (XX % 2 == 0), 'lea', 4)
    buck = poly(U([(5, 44.5), (8.5, 44.5), (8.5, 48.5), (5, 48.5)]))
    fig.put(buck, 'gold', fixed=3, line=False)
    inner = buck & shift(buck, 1, 0, False) & shift(buck, -1, 0, False) & shift(buck, 0, 1, False) & shift(buck, 0, -1, False)
    inner &= shift(inner, 0, 1, False) | shift(inner, 0, -1, False)
    fig.set(inner, 'lea', 0)
    fig.set(toprow(buck), 'gold', 6)
    fig.set(buck & ~shift(buck, 1, 0, False), 'gold', 2)
    # Glutstein auf der Brust in Goldfassung
    gx, gh = up(5, 64)
    fig.put(ellipse(gx, gh, 2.0, 2.0), 'gold', fixed=2, line=False)
    fig.set(toprow(ellipse(gx, gh, 2.0, 2.0)), 'gold', 5)
    gem(fig, ellipse(gx, gh, 1.3, 1.3))
    # Halsberge, Helm (Topfhelm: Sehschlitz mit Auge, Brauenkante, Atemlöcher, Mittelgrat), Flammenkrone
    fig.put(poly(U([(-4, 75), (5, 75), (5, 79), (-4, 79)])), 'obs', fixed=2)
    fig.set(toprow(poly(U([(-4, 75), (5, 75), (5, 79), (-4, 79)]))), 'obs', 4)
    hx, hs = -head, head            # Helm zurück, Sehschlitz höher (Blick nach oben)
    HU = lambda pts: U([(x + hx, h) for x, h in pts])
    hdot = lambda x, h, m, t: dot(x + hx, h, m, t)
    helm = poly(HU([(-5, 78), (-6, 83), (-6, 88), (-4, 90), (3, 90), (6, 89), (8, 86), (8, 80), (6, 78)]))
    fig.put(helm, 'obs', cut=(0.3, 0.7))
    rect = lambda x0, h0, x1, h1: poly(HU([(x0, h0), (x1, h0), (x1, h1), (x0, h1)])) & helm
    fig.set(toprow(helm) & (FXC > up(0.5 + hx, 89)[0]), 'obs', 4)                                  # Lichtkante oben
    for hh in (82.6,):                                                                             # Wangenspange
        sp = rect(-5.5, hh, 8.5, hh + 0.5)
        fig.set(sp, 'obs', 4); fig.set(shift(sp, -1, 0, False) & helm & ~sp, 'obs', 1)
    for x, h in ((-4.6, 86.6), (-4.6, 80.6), (-2.1, 82.9)):                                        # Nieten
        hdot(x, h, 'obs', 5); hdot(x, h - 0.5, 'obs', 1)
    slit = rect(0.5, 84.5 + hs, 9, 85.5 + hs)
    fig.set(slit, 'void', 0)
    fig.set(shift(slit, 1, 0, False) & helm & ~slit & (FXC > up(1.0 + hx, 85)[0]), 'obs', 6)       # Brauenkante: Glanzlinie
    fig.set(shift(slit, 2, 0, False) & helm & ~slit & ~shift(slit, 1, 0, False) & (FXC > up(1.0 + hx, 85)[0]), 'obs', 4)
    fig.set(shift(slit, -1, 0, False) & helm & ~slit & (FXC > up(1.5 + hx, 85)[0]), 'obs', 2)       # Unterkante im Schatten
    eye = rect(4.5, 84.5 + hs, 7.5, 85.5 + hs)                                                    # Auge: Glut im Schlitz, Kern vorn
    fig.set(eye, 'emb', 1)
    eu = eye & (FHC > up(0, 85.0 + hs)[1])
    fig.set(eu & (FXC > up(5.0 + hx, 85)[0]), 'emb', 3); fig.set(eu & (FXC > up(6.0 + hx, 85)[0]), 'emb', 4); fig.set(eu & (FXC > up(6.5 + hx, 85)[0]), 'hot', 4)
    fig.set(eye & ~eu & (FXC > up(6.0 + hx, 85)[0]), 'emb', 2)
    ridge = rect(6.0, 78.6, 6.5, 84.5 + hs) | rect(6.0, 85.5 + hs, 6.5, 88.6)                    # Mittelgrat: Gold, rechts Fase
    fig.set(ridge, 'gold', 5); fig.set(shift(ridge, 0, -1, False) & helm & ~ridge & ~slit, 'gold', 2)
    fig.set(rect(6.0, 87.6, 6.5, 88.6), 'gold', 6)
    for x, h in ((3.6, 81.3), (4.6, 81.3), (3.6, 80.3), (4.6, 80.3), (7.6, 81.3), (7.6, 80.3)): hdot(x, h, 'void', 0)
    crownband = poly(HU([(-6, 89), (7, 89), (7, 92), (-6, 92)]))
    fig.put(crownband, 'gold')
    fig.set(toprow(crownband), 'gold', 6)
    for gxx, dim in ((0, False), (4, False), (-4, True)):
        gm = poly(HU([(gxx - 0.5, 90.0), (gxx + 0.5, 90.0), (gxx + 0.5, 91.0), (gxx - 0.5, 91.0)]))
        fig.set(gm, 'emb', 2 if dim else 3)
        fig.set(gm & (FXC > up(gxx + hx, 90)[0]) & (FHC > up(0, 90.5)[1]), 'hot' if not dim else 'emb', 4 if not dim else 3)
    # Flammenkrone: vier Zacken als Flammen, Kern hell, Saum orange, Rand rot; Spitzen flackern feinpixelweise
    CR = ((0, 0, 0, 0), (2, -1, 0, 1), (0, 2, -1, 1), (-1, 0, 2, -1))[crown % 4]
    for (x0, hgt), dh in zip(((-5, 3), (-1, 5), (3, 4), (6, 2)), CR):
        top = 92 + hgt + dh / Q; L = top - 92; cx = x0 + 1.0
        fl = poly(HU([(cx - 1.0, 91.6), (cx - 1.0, 92 + 0.35 * L), (cx - 0.55, 92 + 0.75 * L), (cx + 0.1, top), (cx + 0.55, 92 + 0.6 * L), (cx + 1.0, 92 + 0.3 * L), (cx + 1.0, 91.6)]))
        fig.put(fl, 'emb', fixed=3, line=False)
        rmin, rmax, cmin, _ = extents(fl)
        fu = (XX - rmin[:, None] + 0.5) / np.maximum(1, rmax - rmin + 1)[:, None]
        fig.set(fl & (fu < 0.34), 'emb', 2)
        fig.set(fl & (fu > 0.38) & (fu < 0.8) & (FHC > up(0, 92.4)[1]), 'emb', 4)
        ys_ = np.nonzero(fl)[0]
        if len(ys_):
            t0 = ys_.min()
            fig.set(fl & (YY <= t0 + 1), 'hot', 4)
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
    fig.set(toprow(rim) & (fig.part == fig.np), 'gold', 6)
    # Ellbogenkachel: gewölbte Goldplatte mit Flügel nach außen
    ex, eh = en
    fig.put(poly([(ex - 1, eh + 5), (ex - 6.5, eh + 1), (ex - 5, eh - 4), (ex, eh - 1)]), 'gold', light=(1, -1), hi=1, mid=3, flat=4)
    fig.put(ellipse(ex, eh, 4.6, 4.3), 'gold', shade='dome', r=2.6, dcuts=(0.12, 0.4, 0.7))
    return hn, hf


def edge(fig, mask):
    """Helle Kante oben am Glied (1 Feinpixel, Glanz gegen die dunkle Brust/Kontur)."""
    m = toprow(mask) & (fig.mat == MI['obs']) & (fig.part == fig.np)
    fig.tone[m] = 5


def hand(fig, p, trim=False):
    m = ellipse(p[0], p[1], 3.3, 2.9)
    fig.put(m, 'obs', shade='dome', r=1.6, dcuts=(0.25, 0.55, 0.8))
    ys, xs = np.nonzero(m)
    top, bot = ys.min(), ys.max()
    if trim:   # Panzerhandschuh: Handrücken als Goldplatte, darunter die dunklen Finger mit Fugen
        plate = m & (YY - top <= (bot - top) * 0.6)
        fig.mat[plate] = MI['gold']
        fig.tone[plate] = 3
        fig.tone[plate & (YY - top < 2 * Q)] = 4
        fig.tone[plate & ~shift(m, 0, -1, False)] = 4
        fig.tone[toprow(m) & plate] = 5
        sc = np.where(plate, FXC * LX + FHC * LH, -99)
        y, x = np.unravel_index(np.argmax(sc), sc.shape); fig.tone[y, x] = 6
        fing = m & ~plate
        fig.tone[fing & ((XX - xs.min()) % 3 == 2)] = 1
    else:
        fig.tone[m & (YY > (top + bot) / 2) & ((XX - xs.min()) % 3 == 2)] = 1


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
    """Flammen um die Klinge (Maske blade), Bild t von n (Schleife). Harte Stufen, äußerster Kranz dunkelrot, Kern
    hell. Abstand: waagerecht 1, nach oben 0,42, nach unten 1,8 je Feinpixel (exakt über zwei Durchläufe)."""
    by, bx = np.nonzero(blade)
    if len(bx) == 0: return np.zeros((H, W, 4), np.uint8)
    y0, y1 = max(0, by.min() - 16 * Q), min(H, by.max() + 4 * Q)
    x0, x1 = max(0, bx.min() - 10 * Q), min(W, bx.max() + 11 * Q)
    g = np.where(blade[y0:y1, x0:x1], 0.0, 1e9)
    for y in range(g.shape[0] - 2, -1, -1): g[y] = np.minimum(g[y], g[y + 1] + 0.42)
    for y in range(1, g.shape[0]): g[y] = np.minimum(g[y], g[y - 1] + 1.8)
    for x in range(1, g.shape[1]): g[:, x] = np.minimum(g[:, x], g[:, x - 1] + 1)
    for x in range(g.shape[1] - 2, -1, -1): g[:, x] = np.minimum(g[:, x], g[:, x + 1] + 1)
    Y, X = np.mgrid[y0:y1, x0:x1]
    per = 16
    sh = t / n * per
    nz = vnoise(X * 0.42 / Q, Y * 0.30 / Q + sh, per) * 0.65 + vnoise(X * 0.9 / Q + 9, Y * 0.62 / Q + sh * 2, per) * 0.35
    heat = 1 - g / (R * Q) + (nz - 0.5) * 1.5
    out = np.zeros((H, W, 4), np.uint8)
    lv = np.select([heat > 0.78, heat > 0.6, heat > 0.42, heat > 0.25, heat > 0.12], [4, 3, 2, 1, 0], -1)
    for k in range(5):
        m = lv == k
        out[y0:y1, x0:x1][m] = (*hexc(FLAME[k]), 255)
    out[blade] = 0
    return out


# ------------------------------------------------------------------------------------------- Posen
GROUND = FY + 2 * Q     # ab dieser Feinzeile (2 Szenenpixel unter der Fußsohle) steckt die Klinge im Boden


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
    """Hiebbogen: Sichel zwischen zwei Klingenwinkeln um den Griffweg, vorn breit und weißgelb, hinten schmal und rot;
    dicht je Szenenpixel (kein Feinraster-Sprenkel, sonst flimmert es)."""
    out = np.zeros((H, W, 4), np.uint8)
    cx, ch = 2, 58                     # Drehpunkt etwa zwischen Schulter und Händen
    lo, hi = sorted((math.radians(p0), math.radians(p1)))
    dx, dh = FXC - cx, FHC - ch
    r = np.hypot(dx, dh); a = np.arctan2(dh, dx)
    k = (a - lo) / (hi - lo)
    w = 9 * np.clip(1 - k, 0, 1) ** 1.5
    m = (a >= lo) & (a <= hi) & (w >= 1) & (r >= 52 - w) & (r <= 52)
    q = (52 - r) / np.maximum(w, 1)
    lv = np.select([(q < 0.3) & (k < 0.5), q < 0.6, k < 0.7], [4, 3, 2], 1)
    m &= ~((k > 0.55) & (((XX // Q) + (YY // Q)) % 2 == 1))
    for j in range(5): out[m & (lv == j)] = (*hexc(FLAME[j]), 255)
    out[GROUND:] = 0
    return out


def ring(p, k):
    """Schlachtruf: harter Funkenring um den Helm, Bild k (0..2) wächst und kühlt ab; dazu kurze Strahlen (Feinpixel)."""
    out = np.zeros((H, W, 4), np.uint8)
    cx, ch = 1 - p.get('kopf', 0), 86
    def put(x, y, lv):
        X, Y = int(math.floor(FX + (cx + x) * Q)), int(math.floor(FY - (ch + y) * Q))
        if 0 <= X < W and 0 <= Y < H and lv >= 0: out[Y, X] = (*hexc(FLAME[lv]), 255)
    r = (10, 14, 18)[k]
    lv_out, lv_in = ((4, 3), (3, 2), (2, 1))[k]
    n = int(2 * math.pi * r * Q * 1.5)
    for i in range(n):
        a = 2 * math.pi * i / n
        if k == 2 and (i // (3 * Q)) % 2: continue                 # zuletzt zerfällt der Kranz
        put(r * math.cos(a), r * math.sin(a), lv_out)
        put((r - 0.5) * math.cos(a), (r - 0.5) * math.sin(a), lv_out if k == 0 else lv_in)
        if k < 2: put((r - 1) * math.cos(a), (r - 1) * math.sin(a), lv_in)
    for j in range(8):                                         # Strahlen, versetzt je Bild
        a = 2 * math.pi * (j + 0.5 * k) / 8
        for q in range((2 + (k == 1)) * Q):
            put((r + 2 + q / Q) * math.cos(a), (r + 2 + q / Q) * math.sin(a), max(0, lv_in - q // Q))
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
    # Einschlag: Knie gebeugt, Oberkörper vor, Spitze hinter der Bodenkante (FY + 1 Szenenpixel)
    'ein': dict(grip=(22, 34), ang=-45, near='B', crouch=4, lean=4, knee=3, boden=FY + Q),
    'ein2': dict(grip=(22, 35), ang=-45, near='B', crouch=2, lean=2, knee=2, boden=FY + Q),
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
    assert SZ['Q'] == Q
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
                pts = list(zip(xs.tolist(), ys.tolist()))
                a = min(pts, key=lambda q: q[1]); z = max(pts, key=lambda q: q[1])
                if abs(a[1] - z[1]) < 6 * Q: a = min(pts, key=lambda q: q[0]); z = max(pts, key=lambda q: q[0])
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

    # ---- Vordergrund: Schatten des Helden (feste Stufen, Feinzeilen), Glut darunter aus
    HXF, FYF = SZ['HX'] * Q, SZ['FY'] * Q
    nah, ng = L('szene-nah.png'), L('szene-nahGlut.png'); px, gp = nah.load(), ng.load()
    for dy, hw, k in [(-2, 26, 0.55), (-1, 30, 0.55), (0, 34, 0.5), (1, 36, 0.5), (2, 34, 0.55), (3, 30, 0.55), (4, 23, 0.65), (5, 17, 0.65)]:
        for x in range(HXF - hw - 8, HXF + hw - 4):
            y = FYF + dy
            r, g, b_, a = px[x, y]
            if a: px[x, y] = (int(r * k), int(g * k), int(b_ * k), a)
            gp[x, y] = (0, 0, 0, 0)
    top = min(tops)
    webp(nah.crop((0, top, nah.width, nah.height)), 'titel-nah.webp'); webp(ng.crop((0, top, ng.width, ng.height)), 'titel-nah-glut.webp')
    cut = (SZ['FY'] + 10) * Q
    WF, HF = SZ['W'] * Q, SZ['H'] * Q
    webp(L('szene-fern.png').crop((0, 0, WF, cut)), 'titel-fern.webp', True)
    webp(L('szene-fernGlut.png').crop((0, 0, WF, cut)), 'titel-fern-glut.webp')
    webp(L('szene-mitte.png').crop((0, 0, WF, cut)), 'titel-mitte.webp'); webp(L('szene-mitteGlut.png').crop((0, 0, WF, cut)), 'titel-mitte-glut.webp')
    webp(L('szene-lava.png'), 'titel-strom.webp'); webp(L('szene-lavaGlut.png'), 'titel-strom-glut.webp')

    # ---- Glutwelle des Erdspalters: läuft vom Einschlag über die Fugen der Kruste (nicht entlang der Kante).
    # Jede Fuge glüht, wenn die Welle sie erreicht, weißgelb -> orange -> rot auf und erlischt; weiter weg schwächer.
    # Bilder zu WELLE_MS, gestapelt; nur die Feinpixel, die gerade glühen. Abstände in Szenenpixeln.
    X0, Y0 = HXF + impact, FYF + Q
    fuge = np.asarray(L('szene-nahFuge.png'))[:, :, 3] > 0
    rng = np.random.default_rng(11)
    pts = {}
    ys, xs = np.nonzero(fuge)
    for y, x in zip(ys, xs):
        if y < Y0 + Q or abs(x - X0) > 190 * Q: continue
        pts[(x, y)] = math.hypot((x - X0) / Q, (y - Y0) / Q * 2.4)
    # frischer Spalt vom Einschlag hinunter in die nächsten Fugen (feine Zickzacklinie)
    for dx0 in (-1, 1):
        x, y = X0, Y0
        for k in range(9 * Q):
            y += 1
            if rng.random() < 0.6: x += dx0
            pts[(x, y)] = min(pts.get((x, y), 99), k * 0.8 / Q)
    for x in range(X0 - 2 * Q, X0 + 2 * Q + 1): pts[(x, Y0)] = 0
    # Verzögerung leicht verrauscht je Fugenzelle (keine perfekte Ellipse)
    jit = {}
    def delay(x, y, dd):
        c = (x // (6 * Q), y // (4 * Q))
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
    wa = np.zeros((wh * nfr, ww, 4), np.uint8)
    FL = [(*hexc(c), 255) for c in FLAME]
    for i, fr in enumerate(frames):
        for (x, y), lv in fr.items(): wa[y - wy0 + i * wh, x - wx0] = FL[lv]
    webp(A(wa), 'titel-welle.webp')

    # ---- Standbild: alle Ebenen in Ruhe, Held Bild 0
    po = L('szene-fern.png').crop((0, 0, WF, HF)); po.alpha_composite(L('szene-fernGlut.png'))
    lv, lg = L('szene-lava.png'), L('szene-lavaGlut.png')
    po.alpha_composite(lv.crop((0, 0, lv.width, SZ['LH2'])), (0, SZ['LT'])); po.alpha_composite(lg.crop((0, 0, lg.width, SZ['LH2'])), (0, SZ['LT']))
    po.alpha_composite(L('szene-mitte.png')); po.alpha_composite(L('szene-mitteGlut.png'))
    po.alpha_composite(nah); po.alpha_composite(ng)
    hero = over(over(over(umhang[0], koerper[0]), flammen[0]), klinge)
    po.alpha_composite(A(hero), (HXF - FX, FYF - FY))
    p = os.path.join(IMG, 'titel.webp'); po.convert('RGB').save(p, 'WEBP', lossless=True, quality=100, method=6); sizes['titel.webp'] = os.path.getsize(p)
    po.convert('RGB').save(os.path.join(TMP, 'vorschau.png'))

    # Maße für titel.js: alles in Feinpixeln (Q = Feinpixel je Szenenpixel)
    sz = {'Q': Q, 'W': WF, 'H': HF, 'FY': FYF, 'HX': HXF, 'HOR': SZ['HOR'] * Q, 'FX': SZ['FX'] * Q, 'LH': SZ['LH'], 'LT': SZ['LT'], 'LH2': SZ['LH2'], 'NT': top}
    meta = {
        'szene': sz,
        'held': {'w': fw, 'h': fh, 'fx': int(FX - x0), 'fy': int(FY - y0)},
        'ruhe': {'atem': len(ATEM), 'atemMs': ATEM_MS, 'umhang': UMHANG_N, 'umhangMs': UMHANG_MS, 'flamme': FLAMME_N, 'flammeMs': FLAMME_MS, 'klinge': kl_ruhe},
        'momente': {k: {'f': v, 'hit': hits.get(k, 0)} for k, v in seqs.items()},
        'klingen': kl,
        'welle': {'x': wx0, 'y': wy0, 'w': ww, 'h': wh, 'n': nfr, 'ms': WELLE_MS, 'v': WELLE_V * Q, 'x0': X0},
    }
    print(json.dumps({'meta': meta, 'sizes': sizes}, default=int))


if __name__ == '__main__':
    main()
