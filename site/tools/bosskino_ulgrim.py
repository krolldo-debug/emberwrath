# Bosskino: Ulgrim, der Hügelkönig (Stufe 26) im Heulenden Hügelgrab.
# Figur: uralter Grabkönig, gebeugt, ausgedörrte Haut, Geisterflammen in den Augen, langer fahler Bart, Muskelpanzer und
# Schulterschalen aus nachgedunkelter Bronze mit Grünspan, Lederschurz, zerschlissener Umhang mit Geistersaum,
# Geweihkrone auf einem Bronzereif (an den Enden Geisterfeuer), großes Runenschwert mit Blattklinge
# (Farben: barrow_king.js). Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Attacke „Geisterriss“: Schwert aus dem Boden reißen, Hieb, Klinge hoch, Halten, Stoß in den Boden; ein Riss läuft
# türkis glühend über den Boden nach vorn, aus ihm schlagen Geisterflammen.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, ik, lerp, over, flip, flame, hash2, hexc, GHOST, Buf, bands, chk, BAYER4,
                      seam_wave, strip, outline_mask, edge_of, floor, bricks, stamp, finish, SW, SH, FY)

MAT.update({
    'brz': ['#170f08', '#3a2710', '#634520', '#93702f', '#c49a4a'],
    'brzd': ['#0e0905', '#22160a', '#3a2710', '#5a4020', '#7a5a2c'],
    'ver': ['#0c1e1c', '#15302c', '#22504a', '#337564', '#56a088'],
    'uskin': ['#1c1714', '#3c322a', '#665748', '#958267', '#c6b693'],
    'ubeard': ['#2a2a2a', '#66645e', '#95928a', '#c4c0b4', '#e8e4da'],
    'ant': ['#2e261e', '#5a4c3c', '#8a7a62', '#b8a888', '#e2d6b8'],
    'ucape': ['#05080a', '#0a1014', '#142028', '#1f3440', '#2d4a54'],
    'ucloth': ['#0a0809', '#120e10', '#221a1c', '#342628', '#48363a'],
    'ulea': ['#0e0705', '#1a0d0b', '#3a1a12', '#5e2e1c', '#8a4828'],
    'gh': ['#0b3a40', '#127272', '#22b0a4', '#7ef0d6', '#e8fff8'],
    'uvoid': ['#050608'] * 5,
})
RIM_F = {'brz': '#f0d48e', 'brzd': '#93702f', 'uskin': '#e2d6b8', 'ubeard': '#ffffff', 'ant': '#ffffff', 'ver': '#8cc8a8', 'ulea': '#8a4828'}
RIM_B = {'brz': '#7ef0d6', 'brzd': '#22b0a4', 'ucape': '#22b0a4', 'ubeard': '#7ef0d6', 'ant': '#7ef0d6', 'uskin': '#7ef0d6', 'ver': '#7ef0d6', 'ucloth': '#127272', 'ulea': '#22b0a4'}

W, H, FX, FY0 = 320, 230, 160, 222
S = 0.98
GROUND = FY0 + 1
def new(): return Fig(W, H, FX, FY0, S)


def cape(f, ph, lean=0, billow=0):
    t = ph * 2 * math.pi
    back = []
    for hh in range(108, 4, -5):
        k = (108 - hh) / 104
        back.append((-12 - k * (18 + billow) - 2.2 * math.sin(t - k * 5) * k * k + lean * hh / 108, hh + billow * 0.4 * k * k))
    hem = []
    xe = back[-1][0]
    for i in range(13):
        k = i / 12
        jag = (5 if i % 2 else 0) + 2 * math.sin(t + i)
        hem.append((xe + k * (-xe - 6), 6 + jag * (1 - k * 0.3)))
    m = f.poly([(-4 + lean, 110)] + back + hem + [(-6, 14)])
    f.put(m, 'ucape', fixed=2)
    ys, xs = np.nonzero(m)
    rows = {}
    for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
    yt, yb = ys.min(), ys.max()
    for y, x in zip(ys, xs):
        a0, b0 = min(rows[y]), max(rows[y])
        u = (x - a0) / max(1, b0 - a0); dep = (y - yt) / max(1, yb - yt)
        fo = math.sin((u * 2.8 + dep * 0.5) * 2 * math.pi + t * 0.5 + dep * 2)
        f.tone[y, x] = 2 + (1 if fo > 0.5 else -1 if fo < -0.3 else 0)
        if x - a0 < 1: f.tone[y, x] = 1
        # Löcher und Geistersaum unten
        below = y + 1 >= f.H or not m[y + 1, x]
        if below: f.mat[y, x] = 'gh'; f.tone[y, x] = 2 if (x + y) % 3 else 3
        elif hash2(x // 2, y // 3, 4) < 0.05 and dep > 0.4: f.mat[y, x] = None
    return m


def sword(f, grip, ang):
    """Runenschwert mit Blattklinge (Bronze, türkise Runen)."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a); vx, vh = -uh, ux
    gx, gh = grip
    P = lambda u, v: (gx + ux * u + vx * v, gh + uh * u + vh * v)
    f.put(f.poly([P(-12, 0), P(-9.5, -3), P(-7, 0), P(-9.5, 3)]), 'brz', shade='dome', r=1.5)
    f.put(f.poly([P(-8, -1.7), P(5, -1.7), P(5, 1.7), P(-8, 1.7)]), 'ulea', fixed=2)
    for u in (-5, -2, 1, 4):
        f.recolor(f.poly([P(u - 0.5, -1.7), P(u + 0.5, -1.7), P(u + 0.5, 1.7), P(u - 0.5, 1.7)]), tone=1)
    L = 92
    up, dn = [], []
    for k in range(61):
        u = 8 + (L - 8) * k / 60
        q = (u - 8) / (L - 8)
        w = 3.6 + 2.8 * math.sin(min(1, q / 0.8) * math.pi * 0.85) if q < 0.86 else (1 - q) / 0.14 * 4.2
        up.append(P(u, w)); dn.append(P(u, -w))
    blade = f.poly(up + dn[::-1])
    f.put(blade, 'brz', shade='cyl', cut=(0.3, 0.62))
    for y, x in zip(*np.nonzero(edge_of(blade))):
        f.mat[y, x] = 'brz'; f.tone[y, x] = 4
    # Hohlkehle dunkel, darin Runen (türkis)
    for k in np.linspace(14, L - 20, 150):
        X, Y = f.at(*P(k, 0))
        if 0 <= Y < f.H and blade[Y, X]: f.mat[Y, X] = 'brzd'; f.tone[Y, X] = 1
    for u0 in range(18, L - 22, 9):
        for j, (du, dv) in enumerate(((0, 0), (1, 0), (2, 0), (1, 1), (1, -1))):
            X, Y = f.at(*P(u0 + du, dv * 0.9))
            if 0 <= Y < f.H and blade[Y, X]: f.mat[Y, X] = 'gh'; f.tone[Y, X] = 3 if j < 3 else 2
    # Grünspan-Flecken
    for y, x in zip(*np.nonzero(blade)):
        if f.mat[y, x] == 'brz' and f.tone[y, x] <= 2 and hash2(x // 2, y // 2, 7) < 0.12: f.mat[y, x] = 'ver'; f.tone[y, x] = 1
    f.put(f.poly([P(5, -11), P(3, -12), P(5, -13), P(8, -9), P(8, 9), P(5, 13), P(3, 12), P(5, 11), P(5, 3), P(5, -3)]), 'brz', light=(1, -1), hi=1, mid=2, flat=3)
    f.put(f.ell(*P(6.5, 0), 1.6, 1.6), 'gh', fixed=4, line=False)
    tip = f.poly([P(L - 30, -6), P(L, 0), P(L - 30, 6)]) & blade
    return blade, tip


def hands_of(p):
    (gx, gh), ang = p['grip'], p['ang']
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a)
    hA = (gx - 3.2 * ux, gh - 3.2 * uh); hB = (gx + 3.2 * ux, gh + 3.2 * uh)
    return (hA, hB) if p.get('near', 'A') == 'A' else (hB, hA)


def hand(f, p, far=False):
    m = f.ell(p[0], p[1], 4.2, 3.8)
    f.put(m, 'uskin' if not far else 'brzd', shade='dome', r=2, dcuts=(0.25, 0.55, 0.8))
    # Stulpe
    return m


HEAD = [
    '......aabbbb.......',
    '....aabbbbcccc.....',
    '...abbbbcccccdd....',
    '..abbbbccccccddd...',
    '..abbbcccccccdddd..',
    '.aabbbccccdddddddd.',
    '.abbbbccvvvvvvdddd.',
    '.abbbccvvvgggvcdd..',
    '.abbbcccvvvvvccddd.',
    '.aabbbcccccbbcdddd.',
    '..abbbccccbcccddddd',
    '..abbccccccbbccddd.',
    '..aabbccccbbcccdd..',
    '..aabbbccccvvvvvd..',
    '...abwwxxxxyyyyyy..',
    '...awwxxyyyyyyzzz..',
    '...wwxxyyzyyyzzz...',
    '..wwxxyyzyyyzzzz...',
    '..wxxyyzyyyzzzz....',
    '..wxxyyzyyzzzz.....',
    '..wxxyyzyyzzz......',
    '...wxyyzyyzz.......',
    '...wxyyzyzzz.......',
    '...wxxyzyzz........',
    '....wxyzyz.........',
    '....wxyzyz.........',
    '....wxyzy..........',
    '.....wxyz..........',
    '.....wxy...........',
    '......wy...........',
    '......w............',
]
HLEG = {'a': ('uskin', 1), 'b': ('uskin', 2), 'c': ('uskin', 3), 'd': ('uskin', 4), 'v': ('uvoid', 0), 'g': ('gh', 4),
        'w': ('ubeard', 1), 'x': ('ubeard', 2), 'y': ('ubeard', 3), 'z': ('ubeard', 4)}


def antlers(f, U, base, sway=0.0):
    """Geweih aus Ästen (Segmente), zwei Stangen nach oben hinten und vorn; Rückgabe: Spitzen (für Geisterflammen)."""
    tips = []
    mask = np.zeros((f.H, f.W), bool)
    def branch(p, ang, L, w, depth):
        a = math.radians(ang + sway * (3 - depth))
        q = (p[0] + L * math.cos(a), p[1] + L * math.sin(a))
        mask_ = f.seg(U([p])[0], U([q])[0], w, max(1.2, w * 0.7))
        nonlocal mask
        mask |= mask_
        if depth == 0: tips.append(q); return
        branch(q, ang + 8, L * 0.8, w * 0.75, depth - 1)
        branch(lerp(p, q, 0.6), ang + (44 if ang < 90 else -44), L * 0.6, w * 0.7, 0 if depth < 3 else 1)
    bx, bh = base
    branch((bx - 4, bh), 116, 15, 4.4, 3)
    branch((bx + 5, bh), 70, 14, 4.0, 3)
    f.put(mask, 'ant', light=(1, -1), hi=1, mid=2, flat=4)
    return tips, mask


def body(f, p):
    b = p.get('breath', 0); c = p.get('crouch', 0); lean = p.get('lean', 0) + 6; head = p.get('kopf', 0)
    HIP = 62
    def up(x, h):
        if h >= HIP - 4: return (x + lean * (h - HIP + 4) / 44, h + b - c)
        return (x, h - c * h / HIP)
    U = lambda pts: [up(x, h) for x, h in pts]
    nh, fh = p['hands']
    # hinterer Arm
    shF = up(-6, 98)
    ef = ik(shF, fh, 22, 22, bend=-1)
    f.put(f.seg(shF, ef, 10, 9), 'brzd'); f.put(f.seg(ef, fh, 9, 8), 'ucloth')
    hand(f, fh, far=True)
    # Beine
    fF, fN = -18 + p.get('fF', 0), 18 + p.get('fN', 0)
    kF = ik(up(-5, 60), (fF, 6), 30, 30, bend=1); kN = ik(up(6, 60), (fN, 6), 30, 30, bend=1)
    f.put(f.seg(up(-5, 60), kF, 14, 12), 'ucloth'); f.put(f.seg(kF, (fF, 7), 12, 10), 'brzd')
    f.put(f.poly([(fF - 8, 0), (fF + 10, 0), (fF + 8, 4), (fF + 3, 8), (fF - 6, 9)]), 'brzd')
    f.put(f.seg(up(6, 60), kN, 15, 13), 'ucloth', cut=(0.2, 0.5))
    f.put(f.seg(kN, (fN, 7), 13, 11), 'brz', cut=(0.2, 0.5))
    f.put(f.poly([(fN - 7, 0), (fN + 13, 0), (fN + 11, 3), (fN + 5, 8), (fN - 6, 10)]), 'ulea')
    f.put(f.ell(kN[0] + 2, kN[1], 5.5, 5), 'brz', shade='dome', r=2.5)
    # Lederschurz in Streifen, Bronzebeschläge
    for i, x0 in enumerate(range(-12, 15, 5)):
        L = 22 + (i % 2) * 4
        f.put(f.poly(U([(x0, 66)]) + [(x0 + 0.3, 66 - L - c * 0.5), (x0 + 4.2, 66 - L - c * 0.5)] + U([(x0 + 4.5, 66)])), 'ulea', cut=(0.25, 0.6))
        X, Y = f.at(x0 + 2.2, 66 - L - c * 0.5 + 2)
        f.px(X, Y, 'brz', 4)
    f.put(f.poly(U([(-14, 64), (16, 64), (17, 71), (-14, 71)])), 'brz', shade='lame', bh=7)
    f.put(f.poly(U([(5, 63), (11, 63), (11, 72), (5, 72)])), 'gh', fixed=2, line=False)
    f.dot(*up(8, 67), 'gh', 4)
    # Muskelpanzer
    chest = f.poly(U([(-15, 70), (-19, 82), (-20, 96), (-15, 106), (-6, 111), (7, 110), (15, 104), (20, 92), (19, 80), (15, 70)]))
    f.put(chest, 'brz', shade='chest')
    for y, x in zip(*np.nonzero(chest)):
        if f.tone[y, x] <= 2 and hash2(x // 3, y // 2, 2) < 0.22: f.mat[y, x] = 'ver'; f.tone[y, x] = 1
    for hh in range(78, 104, 1):   # Brustbogen
        X, Y = f.at(*up(6 + 6 * math.sin((hh - 78) / 26 * math.pi), hh))
        if chest[Y, X]: f.tone[Y, X] = 1
    # Kopf: weit vorn, gebeugt; Geweihkrone
    hx0 = 9 - head
    hx_, hh_ = up(hx0 - 10, 130)
    f.sprite(hx_, hh_, HEAD, HLEG)
    f.put(f.poly(U([(hx0 - 9, 126), (hx0 + 9, 126.5), (hx0 + 9, 130.5), (hx0 - 9, 130)])), 'brz', shade='cyl', cut=(0.2, 0.55))
    for x in (-5, 0, 5): f.dot(*up(hx0 + x, 128.5), 'gh', 3)
    tips, amask = antlers(f, U, (hx0, 130), sway=p.get('sway', 0))
    # Schulterschale (Kuppel), Grünspan
    sm = f.ell(*up(-4, 104), 13, 10)
    sm &= ~f.ell(*up(-4, 92), 15, 6)
    f.put(sm, 'brz', shade='dome', r=4, dcuts=(0.2, 0.5, 0.78))
    for y, x in zip(*np.nonzero(sm)):
        if f.tone[y, x] <= 2 and hash2(x // 2, y // 2, 9) < 0.25: f.mat[y, x] = 'ver'; f.tone[y, x] = 1
    for y, x in zip(*np.nonzero(edge_of(sm))):
        if f.mat[y, x] in ('brz', 'ver') and y > np.nonzero(sm)[0].mean(): f.mat[y, x] = 'brz'; f.tone[y, x] = 4
    # vorderer Arm
    shN = up(-4, 98)
    en = ik(shN, nh, 21, 21, bend=-1)
    f.put(f.seg(shN, en, 11, 10), 'ucloth', cut=(0.2, 0.45))
    f.put(f.seg(en, nh, 10, 10), 'brz', cut=(0.2, 0.45))
    f.put(f.seg(lerp(en, nh, 0.55), lerp(en, nh, 0.8), 12, 12), 'brz', cut=(0.2, 0.5))
    f.put(f.ell(en[0], en[1], 5, 5), 'brz', shade='dome', r=2.5)
    return tips, amask


POSEN = {
    'ruhe': dict(grip=(26, 64), ang=-86, near='A'),
    'zug': dict(grip=(28, 76), ang=-60, lean=1, crouch=1),
    'h1': dict(grip=(-2, 96), ang=160, near='B', lean=-4, sway=1),
    'hieb': dict(grip=(32, 84), ang=6, near='B', lean=5, fN=4),
    'h2': dict(grip=(12, 120), ang=92, near='B', lean=-3, kopf=1, sway=-1),
    'aus': dict(grip=(10, 124), ang=96, near='B', lean=-4, kopf=1, sway=-1.5, wehen=8),
    'stoss': dict(grip=(30, 50), ang=-86, near='A', crouch=12, lean=10, fN=4, fF=-4, boden=FY0 + 1),
    'stoss2': dict(grip=(30, 54), ang=-86, near='A', crouch=8, lean=7, fN=4, fF=-4, boden=FY0 + 1),
}


def figure(p, ph=0.0, ft=0, big=False, smear=None):
    nh, fh = hands_of(p)
    p = dict(p, hands=(nh, fh))
    fb = new(); cape(fb, ph, lean=(p.get('lean', 0) + 3) * 0.7, billow=p.get('wehen', 0))
    back = fb.render(rim_back=RIM_B)
    fk = new(); tips, amask = body(fk, p)
    bd = fk.render(rim=RIM_F, rim_back=RIM_B)
    # Geisterfeuer an den Geweihspitzen und in den Augen
    src = np.zeros((H, W), bool)
    for q in tips:
        X, Y = fk.at(*q)
        if 0 <= Y < H and 0 <= X < W: src[Y, X] = True; src[min(H - 1, Y + 1), X] = True
    gf = flame(src, ft, 6, R=3.6 if not big else 5.0, pal=GHOST, up=0.3, rise=1.3)
    bd = over(gf, bd)
    fs = new(); blade, tip = sword(fs, p['grip'], p['ang']); hand(fs, nh)
    sw = fs.render(rim=RIM_F, rim_back=RIM_B)
    g = p.get('boden', GROUND)
    back[GROUND:] = 0; bd[GROUND:] = 0; sw[g:] = 0; blade[g:] = False
    im = over(over(back, bd), sw)
    if smear is not None: im = over(over(back, bd), over(smear, sw))
    return im, back, bd, sw, blade


def smear_arc(p0, p1, c=(4, 96), R=104, wmax=12):
    out = np.zeros((H, W, 4), np.uint8)
    lo, hi = sorted((math.radians(p0), math.radians(p1)))
    for y in range(H):
        for x in range(W):
            dx, dh = (x + 0.5 - FX) / S - c[0], (FY0 - (y + 0.5)) / S - c[1]
            r = math.hypot(dx, dh); a = math.atan2(dh, dx)
            if not (lo <= a <= hi): continue
            k = (hi - a) / (hi - lo) if p0 > p1 else (a - lo) / (hi - lo)
            w = wmax * (1 - k) ** 1.4
            if w < 1 or not (R - w <= r <= R): continue
            q = (R - r) / max(w, 1)
            lv = 4 if q < 0.3 and k < 0.5 else 3 if q < 0.6 else 2 if k < 0.7 else 1
            if k > 0.55 and (x + y) % 2: continue
            out[y, x] = (*hexc(GHOST[lv]), 255)
    out[GROUND:] = 0
    return out


# ------------------------------------------------------------------------------------------- Hügelgrab
BX = 360
STONE = ['#05070a', '#0b1015', '#11181e', '#182129', '#212c35']
RS0 = ['#06080a', '#10161c', '#1a232b', '#26323c', '#34444f']
EARTH = ['#06070a', '#0e1013', '#15181c', '#1d2126', '#272c32']


def tint(img, seam, cx, w, y0, y1, add):
    for y in range(y0, y1):
        for x in range(max(0, int(cx - 2 * w)), min(SW, int(cx + 2 * w))):
            if seam[y, x] or img[y, x, 3] == 0: continue
            k = 1 - abs(x - cx) / w - (y - y0) / (y1 - y0) * 0.35
            if k <= 0: continue
            lv = 2 if k > 0.55 else 1
            if k < 0.25 and BAYER4[y % 4, x % 4] > k * 4: continue
            img[y, x, :3] = np.minimum(255, img[y, x, :3].astype(int) + np.array(add) * lv)


def scene():
    L = {}
    # Ferne: Grabkammerwand mit Nischen (Schädel, Urnen), Runensteine, Wurzeln von der Decke
    F = bands(SH, SW, 0, 120, ['#020305', '#04060a', '#070a0e', '#0a0f14'])
    stamp(F, bricks(0, 18, SW, 176, 18, 8, STONE, seed=21))
    G = np.zeros((SH, SW, 4), np.uint8)
    rng = np.random.default_rng(5)
    B = Buf()
    for row, y0 in enumerate((44, 96)):
        for k, x0 in enumerate(range(14 + row * 22, SW - 20, 44)):
            w, h = 22, 16
            F[y0:y0 + h, x0:x0 + w] = (*hexc('#030405'), 255)
            F[y0 - 1, x0 - 1:x0 + w + 1] = (*hexc('#2a3640'), 255)
            F[y0 + h, x0 - 1:x0 + w + 1] = (*hexc('#1a242c'), 255)
            kind = (k + row) % 3
            cx, by = x0 + w // 2, y0 + h - 1
            if kind == 0:     # Schädel
                for dx, dy, c in ((-3, -6, '#8a7a62'), (-2, -7, '#b8a888'), (-1, -7, '#b8a888'), (0, -7, '#b8a888'), (1, -7, '#b8a888'), (2, -6, '#8a7a62'),
                                  (-3, -5, '#8a7a62'), (-2, -5, '#050608'), (-1, -5, '#b8a888'), (0, -5, '#050608'), (1, -5, '#b8a888'), (2, -5, '#8a7a62'),
                                  (-2, -4, '#8a7a62'), (-1, -4, '#b8a888'), (0, -4, '#b8a888'), (1, -4, '#8a7a62'), (-1, -3, '#5a4c3c'), (0, -3, '#8a7a62'),
                                  (-6, 0, '#5a4c3c'), (-5, 0, '#8a7a62'), (4, 0, '#8a7a62'), (5, 0, '#5a4c3c')):
                    F[by + dy, cx + dx] = (*hexc(c), 255)
                if rng.random() < 0.6: G[by - 5, cx - 2] = (*hexc(GHOST[2]), 255); G[by - 5, cx] = (*hexc(GHOST[2]), 255)
            elif kind == 1:   # Urne
                for dy in range(0, 10):
                    hw = [3, 4, 5, 5, 5, 4, 3, 2, 3, 3][dy]
                    for dx in range(-hw, hw + 1):
                        t = 0 if dx < -hw + 2 else 1 if dx < 1 else 2
                        F[by - dy, cx + dx] = (*hexc(['#3a1a12', '#5e2e1c', '#8a4828'][t]), 255)
            else:             # Kerze mit Geisterlicht
                F[by - 4:by + 1, cx] = (*hexc('#8a7a62'), 255)
                G[by - 6, cx] = (*hexc(GHOST[4]), 255); G[by - 7, cx] = (*hexc(GHOST[3]), 255); G[by - 5, cx] = (*hexc(GHOST[3]), 255)
    # Wurzeln von der Decke
    for x0 in range(6, SW, 31):
        L_ = 10 + int(hash2(x0, 1, 3) * 30)
        x = x0
        for y in range(0, L_):
            if hash2(y, x0, 2) < 0.3: x += 1 if hash2(x0, y, 5) < 0.5 else -1
            F[y, x] = (*hexc('#1a1410' if y < L_ - 4 else '#2a2018'), 255)
    # Grabtor hinter dem König: Rundbogen aus Steinblöcken mit Runen, darin Geisterlicht in harten Stufen
    cx, cy, R = BX + 4, 92, 54
    Y, X = np.mgrid[0:SH, 0:SW]
    inside = ((X + 0.5 - cx) ** 2 + (Y + 0.5 - cy) ** 2 <= R * R) | ((np.abs(X + 0.5 - cx) <= R) & (Y >= cy) & (Y < 170))
    ring = ((X + 0.5 - cx) ** 2 + (Y + 0.5 - cy) ** 2 <= (R + 9) ** 2) | ((np.abs(X + 0.5 - cx) <= R + 9) & (Y >= cy) & (Y < 170))
    ring &= ~inside
    PORT = ['#04161a', '#062a30', '#0b3a40', '#0f5658', '#127272', '#22b0a4', '#7ef0d6']
    d = np.hypot(X + 0.5 - cx, np.maximum(0, (Y + 0.5 - 150)) * 0.0 + (Y + 0.5 - 132) * 0.8)
    dd = d / (R * 1.1) + (BAYER4[Y % 4, X % 4] - 0.5) * 0.08
    lvl = np.select([dd < 0.3, dd < 0.48, dd < 0.62, dd < 0.76, dd < 0.88, dd < 0.97], [6, 5, 4, 3, 2, 1], 0)
    for k in range(7):
        m_ = inside & (lvl == k)
        G[m_] = (*hexc(PORT[k]), 255); F[m_] = (*hexc(PORT[max(0, k - 2)]), 255)
    # Bogensteine
    ang = np.arctan2(Y + 0.5 - cy, X + 0.5 - cx)
    blk = np.where(Y < cy, np.floor((ang + math.pi) / (math.pi / 9)), np.floor((Y - cy) / 12) + 40)
    rr = np.hypot(X + 0.5 - cx, Y + 0.5 - cy)
    for y, x in zip(*np.nonzero(ring)):
        b_ = int(blk[y, x])
        seamp = (Y[y, x] < cy and abs(((ang[y, x] + math.pi) / (math.pi / 9)) % 1) < 0.06) or (Y[y, x] >= cy and (y - cy) % 12 == 0)
        t = 1 + int(hash2(b_, 3, 2) * 2)
        inner_edge = (Y[y, x] < cy and rr[y, x] < R + 2) or (Y[y, x] >= cy and abs(abs(x + 0.5 - cx) - R) < 2)
        F[y, x] = (*hexc('#030405' if seamp else (RS0[t + 1] if inner_edge else RS0[t])), 255)
        if inner_edge and not seamp: G[y, x] = (*hexc('#127272'), 255)
    # Runen im Bogen
    for i in range(9):
        a = math.pi + (i + 0.5) * math.pi / 9
        gx, gy = int(cx + math.cos(a) * (R + 4.5)), int(cy + math.sin(a) * (R + 4.5))
        for dx, dy in ((0, -1), (0, 0), (0, 1), (1, -1 if i % 2 else 1)):
            F[gy + dy, gx + dx] = (*hexc('#127272'), 255); G[gy + dy, gx + dx] = (*hexc(GHOST[3]), 255)
    L['fern'] = dict(img=F, f=0.15)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=2.7, lo=0.5, steps=3))
    # Mitte: Runensteine und Grabsteine, Steinpfeiler, hinterer Boden
    M = np.zeros((SH, SW, 4), np.uint8); MG = np.zeros((SH, SW, 4), np.uint8)
    bf, bseam, _ = floor(166, SH, [3, 3, 4, 4, 5, 6, 7, 8, 9], EARTH, vx=BX, vy=40, tile=26, seed=23, chips=0.14)
    tint(bf, bseam, BX + 4, 60, 166, 190, (0, 12, 12))
    stamp(M, bf)
    RS = ['#06080a', '#10161c', '#1a232b', '#26323c', '#34444f']
    def runestone(cx, h, w, glyph_seed, tilt=0):
        m = B.poly([(cx - w, 168), (cx - w + 1, 168 - h + 6), (cx - w + 4 + tilt, 168 - h), (cx + w - 4 + tilt, 168 - h + 1), (cx + w, 168 - h + 8), (cx + w, 168)])
        sh = np.zeros((SH, SW, 4), np.uint8)
        ys, xs = np.nonzero(m)
        for y, x in zip(ys, xs):
            u = (x - (cx - w)) / (2 * w)
            t = 1 if u < 0.25 else 2 if u < 0.6 else 3
            if hash2(x // 2, y // 3, glyph_seed) < 0.1: t = max(1, t - 1)
            M[y, x] = (*hexc(RS[t]), 255)
        M[outline_mask(m) & ~m & (np.arange(SH)[:, None] < 168)] = (*hexc('#030405'), 255)
        # Glyphen
        r = np.random.default_rng(glyph_seed)
        gy = 168 - h + 10
        while gy < 160:
            gx = cx - 2 + int(r.integers(-1, 2))
            pat = r.integers(0, 4)
            pts = [(0, 0), (0, 1), (0, 2), (0, 3)] + [[(1, 0), (2, 1)], [(-1, 1), (1, 1)], [(1, 2), (2, 3)], [(-1, 0), (1, 3)]][pat]
            for dx, dy in pts:
                M[gy + dy, gx + dx] = (*hexc('#127272'), 255); MG[gy + dy, gx + dx] = (*hexc(GHOST[3]), 255)
            gy += 7
    for cx, h, w, s_ in ((60, 58, 9, 1), (208, 44, 8, 2), (500, 64, 10, 3), (546, 40, 7, 4)):
        runestone(cx, h, w, s_)
    # Grabhügel-Pfeiler mit Schädel oben
    for x0 in (120, 452):
        for y in range(30, 168):
            for x in range(x0, x0 + 16):
                u = (x - x0) / 16; t = 1 if u < 0.25 else 2 if u < 0.7 else 3
                if (y - 30) % 12 == 11: t = 0
                M[y, x] = (*hexc(RS[t]), 255)
        M[28:31, x0 - 3:x0 + 19] = (*hexc(RS[3]), 255)
    braz = []
    for bx_, by_ in ((92, 152), (262, 152), (530, 150)):
        for k in range(16):
            y = by_ + 4 + k
            for dx in (-5 + k // 4, 5 - k // 4):
                M[y, bx_ + dx] = (*hexc('#26323c'), 255)
        for dx in range(-6, 7):
            for dy in range(0, 4):
                if abs(dx) <= 6 - dy: M[by_ + dy, bx_ + dx] = (*hexc(RS0[3 - min(3, dy)]), 255)
        for dx in range(-4, 5): MG[by_ - 1, bx_ + dx] = (*hexc(GHOST[3] if abs(dx) < 2 else GHOST[2]), 255)
        braz.append((bx_, by_))
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=3.3, lo=0.45, steps=3))
    # Boden: Grabplatten und Erde, Knochen; Fugen glimmen kalt nahe dem Boss
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#05060a', '#0f1318', '#161c22', '#1e262e', '#28323b'], vx=BX - 30, vy=-40, tile=30, seed=31, chips=0.12)
    for x in range(SW): Bd[FY - 4, x] = (*hexc('#2e3c46' if hash2(x, 1, 2) > 0.2 else '#22303a'), 255)
    tint(Bd, seam, BX + 4, 50, FY - 4, SH, (0, 12, 12))
    BG = np.zeros((SH, SW, 4), np.uint8)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        far = abs(x - BX) / 80 + (y - FY) / 30
        if far < 1.0 and y < FY + 16:
            Bd[y, x] = (*hexc('#0b3a40'), 255)
            if far < 0.5: BG[y, x] = (*hexc(GHOST[1]), 255)
    # Knochen auf dem Boden
    for bx_, by_, ln in ((70, FY + 6, 7), (150, FY + 14, 9), (250, FY + 4, 6), (470, FY + 10, 8), (520, FY + 20, 7)):
        for k in range(ln):
            Bd[by_, bx_ + k] = (*hexc('#8a7a62' if k % (ln - 1) else '#b8a888'), 255)
        Bd[by_ - 1, bx_] = Bd[by_ + 1, bx_] = Bd[by_ - 1, bx_ + ln - 1] = Bd[by_ + 1, bx_ + ln - 1] = (*hexc('#b8a888'), 255)
    for dy, hw, k in [(-3, 26, 0.6), (-2, 34, 0.55), (-1, 38, 0.55), (0, 34, 0.6), (1, 26, 0.7)]:
        y = FY + dy
        for x in range(BX - hw, BX + hw):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
            BG[y, x] = 0
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=2.9, lo=0.4, steps=3))
    # Vordergrund: Grabstein links, Schädelhaufen rechts (Schattenrisse mit kalter Kante)
    V = Buf()
    vm = V.poly([(4, SH), (6, 172), (10, 166), (18, 164), (26, 167), (30, 174), (31, SH)])
    vm |= V.poly([(504, SH), (512, 200), (522, 194), (534, 192), (546, 196), (556, 204), (562, SH)])
    V.a[vm] = (*hexc('#030405'), 255)
    e = outline_mask(~vm) & vm
    top_e = e & ~np.roll(vm, 1, axis=0)
    V.a[top_e] = (*hexc('#1a3038'), 255)
    for y, x in zip(*np.nonzero(top_e)):
        if hash2(x, y, 9) < 0.3: V.a[y, x] = (*hexc('#22b0a4'), 255)
    # Kreuz-Ritzung im Grabstein
    for y in range(176, 196): V.set(18, y, '#0b1418')
    for x in range(13, 24): V.set(x, 181, '#0b1418')
    L['vorn'] = dict(img=V.a, f=1.35)
    return L, seam, braz


def crack_mask(x0, y0, x_end, seed=3):
    """Gezackter Riss vom Einschlag nach links über die Bodenplatten, mit Verästelungen."""
    rng = np.random.default_rng(seed)
    m = np.zeros((SH, SW), bool)
    x, y = x0, y0
    while x > x_end:
        m[y, x] = True
        x -= 1
        if rng.random() < 0.35: y += rng.choice([-1, 1])
        y = int(min(FY + 6, max(FY - 2, y)))
        if rng.random() < 0.05:
            bx_, by_ = x, y
            for k in range(int(rng.integers(4, 14))):
                by_ += 1; bx_ += rng.choice([-1, 0, 0, 1]) - 0
                if by_ < SH: m[by_, bx_] = True
    return m


UMH_N, UMH_MS = 8, 180
MOMENT = [('zug', 140), ('h1', 110), ('hieb', 70, 'bogen1'), ('hieb', 140), ('h2', 110), ('aus', 520, 'gross'), ('stoss', 640, 'hit'), ('stoss2', 300), ('zug', 200)]


def build():
    R = POSEN['ruhe']
    idle = []
    seq_b = [0, 0, 1, 1, 1, 0]
    for i in range(UMH_N):
        p = dict(R, breath=1 if i in (3, 4, 5, 6) else 0, sway=0.6 * math.sin(i / UMH_N * 2 * math.pi))
        im, *_ = figure(p, ph=i / UMH_N, ft=i % 6)
        idle.append(im)
    frames = []
    hit_idx, imp_px = 0, FX
    ph = 0
    for st in MOMENT:
        pn, ms = st[0], st[1]; tag = st[2] if len(st) > 2 else None
        p = POSEN[pn]
        n = max(1, round(ms / 100)) if tag in ('gross', 'hit') else 1
        for k in range(n):
            sm = smear_arc(160, 6) if tag == 'bogen1' else None
            im, back, bd, sw, blade = figure(p, ph=(len(frames) % 8) / 8, ft=len(frames) % 6, big=tag in ('gross', 'hit'), smear=sm)
            if tag == 'hit' and k == 0:
                hit_idx = len(frames)
                ys, xs = np.nonzero(blade[:GROUND + 1]); imp_px = int(round(xs[ys == ys.max()].mean()))
            frames.append((im, round(ms / n)))
    Ld, seam, braz = scene()
    fx = {}
    B, imp = finish('ulgrim', FX, FY0, BX, [('koerper', idle, dict(n=UMH_N, ms=UMH_MS))], frames, hit_idx, imp_px, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#e8fff8', '#7ef0d6', '#127272'], 'fokus': [310, BX - 26], 'teilchen': 'geist', 'dichte': 3.0, 'dauer': 9.0, 'start': 2.2})
    # Riss und Geisterflammen
    crack = crack_mask(imp - 2, FY - 1, 14)
    allseam = seam | crack
    wave, wm = seam_wave(allseam, imp, FY - 2, v=300, ms=60, pal=GHOST, direction=-1, maxd=420, peak=lambda d: 4 if d < 80 else 3 if d < 220 else 2,
                         extra={(int(x), int(y)): abs(x - imp) * 0.9 for y, x in zip(*np.nonzero(crack))}, ages=(0.09, 0.3, 0.6, 1.0))
    # Riss bleibt kurz offen: dunkle Spalte mit glühendem Rand (eigene Folge, 3 Stufen)
    fx['welle'] = wave
    fx['geist'] = strip([feuer(18, 46, i, 6, pal=GHOST, seed=4, hw=0.36) for i in range(6)])
    fx['geist2'] = strip([feuer(12, 26, i, 6, pal=GHOST, seed=6, hw=0.36) for i in range(6)])
    from bosskino_malgareth import impact_star
    fx['blitz'] = strip(impact_star(pal=GHOST))
    ev = [dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'),
          dict(k='bild', r='blitz', at=0, x=imp - 12, y=FY - 18, w=25, h=22, n=4, ms=60, quer=True, z='vorn'),
          dict(k='funken', at=0, x=imp, y=FY - 2, n=26, r=4, vx=40, vy=110, g=240, c=GHOST[::-1][:4]),
          dict(k='funken', at=0, x=imp, y=FY - 1, n=16, r=8, vx=30, vy=40, g=80, c=['#4a5a62', '#323e46', '#232c32'])]
    # Geisterflammen schlagen nacheinander aus dem Riss (wie die Welle: 300 px/s)
    ys, xs = np.nonzero(crack)
    for i, x in enumerate(range(imp - 20, 20, -26)):
        yy = int(ys[np.argmin(np.abs(xs - x))])
        big = i % 2 == 0
        w_, h_ = (18, 46) if big else (12, 26)
        reps = 3
        ev.append(dict(k='bild', r='geist' if big else 'geist2', at=int((imp - x) / 300 * 1000), x=x - w_ // 2, y=yy + 2 - h_, w=w_, h=h_, n=6 * reps, ms=70, quer=True, loop=6, z='vorn'))
    B['meta']['ereignisse'] = ev
    fx['schale'] = strip([feuer(16, 22, i, 6, pal=GHOST, seed=8, hw=0.36) for i in range(6)])
    B['meta'].update({'schalen': [[int(x - 8), int(y - 21)] for x, y in braz], 'schale': {'w': 16, 'h': 22, 'n': 6, 'ms': 90}, 'schaleNach': 'mitte-glut'})
    B['meta']['warn'] = {'x0': 14, 'x1': imp - 4, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 600, 'c': ['#0b3a40', '#127272', '#7ef0d6']}
    return B
