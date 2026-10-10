# Bosskino: Malgareth, der Aschenfürst (Finale, Stufe 40) im Saal des Aschethrons.
# Figur: Plattenrüstung aus gebleichtem Knochen und Asche mit glutgeschmiedeten Kanten, glühendes Herz im Kürass, hohe
# Glutkrone mit Flammen, aschfahles hageres Gesicht mit weißglühendem Auge, Aschebart, karminroter Königsmantel,
# Schwingen aus Rauch mit Glutrippen, Flammberg aus schwarzem Glas mit glühender Schneide (Farben: ash_sovereign.js).
# Gezeichnet mit Blick nach rechts, im Bild gespiegelt (er blickt nach links in den Saal).
# Attacke „Aschewelle“: Klinge über den Kopf, Halten, Schlag in den Boden, eine Flammenwand läuft über den Boden nach
# vorn, Glut durch die Fugen der Bodenplatten.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, ik, lerp, rot, over, flip, flame, vnoise, hash2, hexc, FLAME, Buf, bands, chk, BAYER4,
                      seam_wave, common_crop, strip, dedupe, outline_mask, edge_of, floor, bricks, stamp, SW, SH, FY)

MAT.update({
    'bone': ['#1e1918', '#4a403b', '#857a72', '#b8ad9f', '#ede6da'],
    'boned': ['#120e0e', '#2a2422', '#4a413d', '#6e645d', '#968a80'],
    'trim': ['#140d0b', '#54392b', '#8a4a22', '#c4652a', '#f6a457'],
    'robe': ['#1e070c', '#3c0d15', '#5e141d', '#851f25', '#ae3330'],
    'robed': ['#12040a', '#2a0a10', '#3c0d15', '#5e141d', '#7a1a22'],
    'skin': ['#1c1518', '#4e3c44', '#7e6a70', '#ad9a98', '#d8cabe'],
    'beard': ['#0a0708', '#241c1e', '#3e3234', '#62504e', '#8e7468'],
    'hair': ['#0a0809', '#141114', '#262024', '#3c3438', '#5a5058'],
    'blk': ['#0b0909', '#1a1615', '#2c2624', '#463d3a', '#6c625c'],
    'crown': ['#160c09', '#33190f', '#5e2a14', '#c4561c', '#ffab52'],
    'emb': ['#5a1406', '#a8300a', '#f0661a', '#ffb048', '#fff0c0'],
    'smk': ['#0a0607', '#24120f', '#381c17', '#4e281e', '#6e3a26'],
    'smkd': ['#060404', '#140b0a', '#20110e', '#2e1813', '#40221a'],
    'lea': ['#0e0809', '#1e1418', '#2e2026', '#443038', '#5e4650'],
    'void': ['#07040a'] * 5,
})
RIM_F = {'bone': '#fff4e0', 'boned': '#b8ad9f', 'trim': '#ffd27a', 'robe': '#e0583a', 'skin': '#f6f2e8', 'beard': '#d8d0c4', 'crown': '#ffd27a'}
RIM_B = {'bone': '#ffb048', 'boned': '#c4652a', 'robe': '#f0661a', 'robed': '#c8420c', 'smk': '#a8300a', 'smkd': '#7a2208', 'hair': '#a8300a',
         'beard': '#f0a050', 'trim': '#ffb048', 'skin': '#ffb048', 'crown': '#ffd27a'}

W, H, FX, FY0 = 300, 200, 170, 194
S = 0.86


def new(): return Fig(W, H, FX, FY0, S)


# ------------------------------------------------------------------------------------------- Schwingen
def wing(f, root, flap=0.0, spread=0.0, far=False, phase=0.0):
    """Fledermausschwinge aus Rauch: Oberarm nach oben hinten, fünf Finger, Haut dazwischen, Glutrippen."""
    m = 'smkd' if far else 'smk'
    a0 = 108 + flap * 18 + spread * 8 + (10 if far else 0)
    E = (root[0] + 40 * math.cos(math.radians(a0)), root[1] + 40 * math.sin(math.radians(a0)))
    fan = [(128, 76), (152, 88), (176, 84), (200, 72), (226, 56)]
    tips = []
    for i, (a, L) in enumerate(fan):
        aa = a + flap * (14 - i * 3) + spread * (6 + i * 7) + (6 if far else 0)
        Ls = L * (1 + 0.04 * math.sin(phase * 2 * math.pi + i))
        tips.append((E[0] + Ls * math.cos(math.radians(aa)), E[1] + Ls * math.sin(math.radians(aa))))
    low = (root[0] - 6, root[1] - 30)
    pts = [root, E, tips[0]]
    for i in range(len(tips) - 1):
        A, B_ = tips[i], tips[i + 1]
        for k in (0.33, 0.66):
            P = lerp(A, B_, k)
            dep = (0.28 if k == 0.33 else 0.26) * (1 + 0.15 * math.sin(phase * 2 * math.pi + i * 1.7))
            pts.append(lerp(P, E, dep))
        pts.append(B_)
    pts.append(lerp(tips[-1], low, 0.5)); pts.append(low)
    mem = f.poly(pts)
    f.put(mem, m, fixed=2)
    # Falten: je Feld von der vorderen Rippe (hell) zur Hinterkante (dunkel)
    ys, xs = np.nonzero(mem)
    ex, ey = f.FX + E[0] * f.S, f.FY - E[1] * f.S
    ang = [math.atan2(-(t[1] - E[1]), t[0] - E[0]) for t in tips]
    for y, x in zip(ys, xs):
        a = math.atan2(y + 0.5 - ey, x + 0.5 - ex)
        # Winkel relativ zu den Fingern (Bildkoordinaten: y nach unten)
        best = None
        for i in range(len(ang) - 1):
            a1, a2 = ang[i], ang[i + 1]
            lo, hi = min(a1, a2), max(a1, a2)
            if lo <= a <= hi: best = (i, (a - a1) / (a2 - a1 + 1e-9)); break
        if best is None: continue
        i, u = best
        t = 3 if u < 0.18 else 2 if u < 0.55 else 1
        if far: t = max(1, t - 1)
        f.tone[y, x] = t
    # Ausgefranste Hinterkante: einzelne Pixel fehlen, einzelne glimmen
    em = edge_of(mem)
    for y, x in zip(ys, xs):
        if em[y, x] and y > f.FY - root[1] * f.S + 4:
            hsh = hash2(x, y, 3 if far else 5)
            if hsh < 0.22: f.mat[y, x] = None
            elif hsh < 0.34 and not far: f.mat[y, x] = 'emb'; f.tone[y, x] = 1
    # Knochen: Oberarm und Finger, dünn, glutgeädert
    bm = 'boned' if far else 'bone'
    f.put(f.seg(root, E, 5, 4), bm, cut=(0.3, 0.6))
    f.put(f.ell(E[0], E[1], 3, 3), bm, shade='dome', r=1.5)
    # Kralle am Gelenk
    f.put(f.poly([(E[0] - 1, E[1] + 2), (E[0] + 3, E[1] + 9), (E[0] + 2, E[1] + 1)]), 'bone' if not far else 'boned', fixed=3)
    for i, T in enumerate(tips):
        sk = f.seg(E, T, 2.6 - i * 0.15, 1.2)
        f.put(sk, bm, fixed=2 if far else 3, line=False)
        if not far:
            # Glutader auf der Rippe, zur Spitze hin heller
            for k in np.linspace(0.15, 0.95, 40):
                P = lerp(E, T, k)
                X, Y = f.at(*P)
                if 0 <= X < f.W and 0 <= Y < f.H and f.mat[Y, X] in ('bone', 'smk'):
                    f.mat[Y, X] = 'emb'; f.tone[Y, X] = 1 if k < 0.45 else 2 if k < 0.8 else 3
    return mem


# ------------------------------------------------------------------------------------------- Umhang
def cape(f, ph, lift=0, billow=0, lean=0):
    t = ph * 2 * math.pi
    back = []
    for hh in range(112, 2, -5):
        k = (112 - hh) / 110
        back.append((-12 - k * (26 + billow) - 2.4 * math.sin(t - k * 5) * k * k + lean * (hh / 112), hh + (lift if hh > 90 else 0) + billow * 0.5 * k * k))
    hem = []
    x_end = back[-1][0]
    for i in range(10):
        k = i / 9
        x = x_end + k * (-x_end - 8)
        hem.append((x, 3 + 2.0 * math.sin(t + k * 9) * (1 - k * 0.6) + billow * 0.45 * (1 - k) ** 2))
    pts = [(-4 + lean, 113 + lift)] + back + hem + [(-6, 10)]
    m = f.poly(pts)
    f.put(m, 'robe', fixed=2)
    ys, xs = np.nonzero(m)
    rows = {}
    for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
    y_top, y_bot = ys.min(), ys.max()
    for y, x in zip(ys, xs):
        a0, b0 = min(rows[y]), max(rows[y])
        u = (x - a0) / max(1, b0 - a0)
        depth = (y - y_top) / max(1, y_bot - y_top)
        fo = math.sin((u * 3.2 + depth * 0.6) * 2 * math.pi + t * 0.5 + depth * 2.4)
        tone = 2 + (1 if fo > 0.5 else -1 if fo < -0.3 else 0)
        if x - a0 < 1: tone = 1
        f.tone[y, x] = tone
        if y + 1 < f.H and not m[y + 1, x]:
            f.mat[y, x] = 'trim'; f.tone[y, x] = 3 if (x + y) % 2 == 0 else 4
        elif y + 2 < f.H and not m[y + 2, x]:
            f.mat[y, x] = 'trim'; f.tone[y, x] = 2
    return m


# ------------------------------------------------------------------------------------------- Schwert
def sword(f, grip, ang, glow=1.0):
    """Flammberg aus schwarzem Glas. grip: Mitte des Griffs, ang: Richtung Griff -> Spitze (Grad, 0 = vorn, -90 = unten)."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a); vx, vh = -uh, ux
    gx, gh = grip
    P = lambda u, v: (gx + ux * u + vx * v, gh + uh * u + vh * v)
    # Knauf, Griff (lang, zweihändig)
    f.put(f.poly([P(-15, 0), P(-12, -3.4), P(-9, 0), P(-12, 3.4)]), 'trim', shade='dome', r=1.5)
    f.put(f.poly([P(-12.6, -1), P(-11, -1), P(-11, 1), P(-12.6, 1)]), 'emb', fixed=4, line=False)
    f.put(f.poly([P(-10, -1.8), P(6, -1.8), P(6, 1.8), P(-10, 1.8)]), 'lea', fixed=2)
    for u in (-7, -4, -1, 2, 5):
        mm = f.poly([P(u - 0.5, -1.8), P(u + 0.5, -1.8), P(u + 0.5, 1.8), P(u - 0.5, 1.8)])
        f.recolor(mm, tone=1)
    # Klinge: gewellte Schneiden (Flammberg)
    L = 112
    up, dn = [], []
    for k in range(0, 101):
        u = 9 + (L - 9) * k / 100
        wv = 1.3 * math.sin(u / 6.0) if u < L - 16 else 0
        w = 5.2 if u < L - 18 else 5.2 * (L - u) / 18
        up.append(P(u, w + wv)); dn.append(P(u, -w + wv))
    blade = f.poly(up + dn[::-1])
    f.put(blade, 'blk', fixed=2)
    for y, x in zip(*np.nonzero(edge_of(blade))):
        f.mat[y, x] = 'emb'; f.tone[y, x] = 3 if glow >= 1 else 2
    # Mittelgrat hell, Glutrisse
    for k in np.linspace(12, L - 20, 160):
        X, Y = f.at(*P(k, 1.3 * math.sin(k / 6.0)))
        if 0 <= Y < f.H and blade[Y, X]: f.mat[Y, X] = 'blk'; f.tone[Y, X] = 4
        X, Y = f.at(*P(k, 1.3 * math.sin(k / 6.0) - 1.2))
        if 0 <= Y < f.H and blade[Y, X] and f.mat[Y, X] == 'blk': f.tone[Y, X] = 3
    for u0 in (24, 46, 70, 88):
        for j in range(5):
            X, Y = f.at(*P(u0 + j, 2.5 - j * 0.9 + 1.3 * math.sin(u0 / 6)))
            if 0 <= Y < f.H and blade[Y, X] and f.mat[Y, X] == 'blk': f.mat[Y, X] = 'emb'; f.tone[Y, X] = 2 if j % 2 else 1
    # Parierstange: breit, Enden nach vorn gebogen, Mitte mit Glutstein
    f.put(f.poly([P(6, -13), P(4, -15), P(7, -16), P(9, -12), P(9, 12), P(7, 16), P(4, 15), P(6, 13), P(6, 3), P(6, -3)]), 'trim', light=(1, -1), hi=1, mid=2, flat=3)
    f.put(f.poly([P(5.6, -1.6), P(9.4, -1.6), P(9.4, 1.6), P(5.6, 1.6)]), 'emb', fixed=4, line=False)
    fire = f.poly([P(20, -6.5), P(L - 14, -6.5), P(L, 0), P(L - 14, 6.5), P(20, 6.5)]) & blade
    return blade, fire


def hands_of(p):
    (gx, gh), ang = p['grip'], p['ang']
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a)
    hA = (gx - 3.6 * ux, gh - 3.6 * uh); hB = (gx + 3.6 * ux, gh + 3.6 * uh)
    return (hA, hB) if p.get('near', 'A') == 'A' else (hB, hA)


def hand(f, p, trim=True, far=False):
    m = f.ell(p[0], p[1], 4.4, 3.9)
    f.put(m, 'boned' if far else 'bone', shade='dome', r=2, dcuts=(0.25, 0.55, 0.8))
    if trim:
        ys = np.nonzero(m)[0]; top, bot = ys.min(), ys.max()
        for y, x in zip(*np.nonzero(m)):
            if y - top <= (bot - top) * 0.45:
                f.mat[y, x] = 'trim'; f.tone[y, x] = 4 if not m[y - 1, x] else 3
    return m


# ------------------------------------------------------------------------------------------- Körper
def body(f, p, crown_t=0, crown_n=6, flames=None):
    b = p.get('breath', 0); c = p.get('crouch', 0); lean = p.get('lean', 0); head = p.get('kopf', 0)
    HIP = 70
    def up(x, h):
        if h >= HIP - 4: return (x + lean * (h - HIP + 4) / 46, h + b - c)
        return (x + lean * 0 , h - c * h / HIP)
    U = lambda pts: [up(x, h) for x, h in pts]
    near_hand, far_hand = p['hands']
    # ---- hinterer Arm (Oberarm hinter dem Körper)
    shF = up(-6, 104)
    ef = ik(shF, far_hand, 24, 24, bend=-1)
    f.put(f.seg(shF, ef, 11, 10), 'boned')
    f.put(f.seg(ef, far_hand, 10, 9), 'boned')
    hand(f, far_hand, far=True)
    # ---- Beine: Beinschienen Knochenplatte, Kniekacheln glutgeschmiedet
    kneeF = ik(up(-5, 66), (-20 + p.get('fF', 0), 6), 33, 33, bend=1)
    kneeN = ik(up(6, 66), (20 + p.get('fN', 0), 6), 33, 33, bend=1)
    f.put(f.seg(up(-5, 66), kneeF, 16, 13), 'boned')
    f.put(f.seg(kneeF, (-20 + p.get('fF', 0), 7), 13, 11), 'boned')
    fx0 = -20 + p.get('fF', 0)
    f.put(f.poly([(fx0 - 9, 0), (fx0 + 11, 0), (fx0 + 9, 4), (fx0 + 4, 9), (fx0 - 6, 10), (fx0 - 9, 6)]), 'boned')
    f.put(f.ell(kneeF[0] + 1, kneeF[1], 6, 5.5), 'boned', shade='dome', r=2.5)
    # vorderes Bein
    thN = f.seg(up(6, 66), kneeN, 17, 14)
    f.put(thN, 'bone', cut=(0.2, 0.5))
    shin = f.seg(kneeN, (20 + p.get('fN', 0), 7), 14, 12)
    f.put(shin, 'bone', cut=(0.2, 0.5))
    fx1 = 20 + p.get('fN', 0)
    f.put(f.poly([(fx1 - 8, 0), (fx1 + 15, 0), (fx1 + 13, 3), (fx1 + 7, 8), (fx1 + 4, 11), (fx1 - 6, 11), (fx1 - 8, 6)]), 'bone')
    f.put(f.poly([(fx1 - 7, 10), (fx1 + 5, 10), (fx1 + 5, 13), (fx1 - 7, 13)]), 'trim', fixed=3)
    # Kniekachel mit Flügel
    kx, kh = kneeN
    f.put(f.poly([(kx - 1, kh + 7), (kx - 9, kh + 2), (kx - 7, kh - 5), (kx, kh - 1)]), 'trim', light=(1, -1), hi=1, mid=3, flat=4)
    f.put(f.ell(kx + 2, kh, 6.5, 6), 'bone', shade='dome', r=3, dcuts=(0.15, 0.45, 0.75))
    f.dot(kx + 3, kh, 'emb', 3); f.dot(kx + 3, kh + 1, 'emb', 2)
    # ---- Wappenrock vorn (karmin, bis fast zum Boden), schwingt leicht
    sw = p.get('rock', 0)
    rock = f.poly(U([(-6, 72), (12, 72), (13, 50)]) + [(14 + sw, 30), (13 + sw * 1.5, 12), (6 + sw * 1.5, 10), (-1 + sw, 12), (-3 + sw, 30)] + U([(-5, 50)]))
    f.put(rock, 'robe', cut=(0.25, 0.6))
    ys, xs = np.nonzero(rock)
    for y, x in zip(ys, xs):
        if not rock[min(f.H - 1, y + 1), x] or not rock[min(f.H - 1, y + 2), x]: f.mat[y, x] = 'trim'; f.tone[y, x] = 3
    # Wappen auf dem Rock: Krone in Glutgold
    cx, ch = up(5, 46)
    for dx, dh in ((-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (-3, 1), (0, 1), (3, 1), (-3, 2), (0, 2), (3, 2), (0, 3), (-3, -1), (3, -1), (-2, -1), (2, -1), (-1, -1), (0, -1), (1, -1)):
        f.dot(cx + dx, ch + dh, 'trim', 4 if dh >= 1 else 3)
    # ---- Beintaschen (Lamellen) und Gürtel
    f.put(f.poly(U([(-13, 76), (-15, 58), (-6, 54), (4, 57), (4, 76)])), 'bone', shade='lame', bh=7)
    f.put(f.poly(U([(-13, 72), (14, 72), (15, 78), (-13, 78)])), 'lea', fixed=2)
    f.put(f.poly(U([(7, 71), (13, 71), (13, 79), (7, 79)])), 'trim', fixed=3, line=False)
    f.dot(*up(10, 75), 'emb', 4)
    # ---- Kürass: Brust nach vorn gewölbt, Bauchreifen
    f.put(f.poly(U([(-14, 78), (15, 78), (17, 86), (-15, 86)])), 'bone', shade='lame', bh=8)
    chest = f.poly(U([(-15, 84), (-18, 96), (-16, 108), (-9, 114), (9, 114), (18, 108), (22, 98), (19, 88), (16, 84)]))
    f.put(chest, 'bone', shade='chest')
    # glutgeschmiedete Kanten: Brustgrat und unterer Rand
    for hh in range(88, 112):
        X, Y = f.at(*up(9 + (hh - 88) * 0.12, hh))
        if chest[Y, X]: f.mat[Y, X] = 'trim'; f.tone[Y, X] = 2
    # glühendes Herz mit Rissen
    hx, hh = up(12, 99)
    for dx, dh, t in ((0, 0, 4), (1, 0, 4), (0, 1, 4), (1, 1, 3), (-1, 0, 3), (2, 0, 3), (0, -1, 3), (1, -1, 3), (0, 2, 2), (1, 2, 2), (-1, 1, 2), (2, 1, 2),
                      (-2, 2, 1), (-3, 3, 1), (3, -2, 1), (4, -3, 1), (-1, -3, 1), (-1, -4, 1), (3, 3, 1), (4, 5, 1)):
        f.dot(hx + dx, hh + dh, 'emb', t)
    # ---- hoher Kragen hinter dem Kopf (Knochen, Glutkante), Dornen
    f.put(f.poly(U([(-15, 106), (-18, 124), (-13, 130), (-7, 118), (3, 112)])), 'bone', light=(1, -1), hi=1, mid=2, flat=4)
    for x0, h0, L in ((-17, 124, 8), (-13, 129, 6)):
        f.put(f.poly(U([(x0 - 1.5, h0), (x0 - 3, h0 + L), (x0 + 1.5, h0)])), 'trim', fixed=3)
    # ---- Kopf (im Profil, vor der Schulter): Haar hinten, hageres Gesicht, glühendes Auge, Bart, Krone
    hx0 = 7 - head
    HU = lambda pts: U([(x + hx0, h) for x, h in pts])
    hdot = lambda x, h, m, t: f.dot(*up(x + hx0, h), m, t)
    HEAD = [
        '....kkkllllmmm........',
        '...kkllllmmmmcc.......',
        '..kkllllmmmbbccd......',
        '..kllllmmmbbbcccd.....',
        '.kkllllmmbbbbcccdd....',
        '.kklllmmbbbbbccccd....',
        '.kklllmmbbbbccddddd...',
        '.kkllmmbbbvvvvvvdddd..',
        '.kklllmbbvvvfeefdddd..',
        '.kklllmbbbvvveeccdd...',
        '.kkllmmbbbbbvvcdddd...',
        '.kkllmmbaabbbccccddd..',
        '.kkllmmbaaabbbccccdddd',
        '.kklllmbbaabbbcccddd..',
        '.kklllmbbbabbbccdd....',
        '.kklllmbbbbabbcccc....',
        '.kkllmmbbbbbbbvvvvc...',
        '.kkllmmbbbbbbcccccd...',
        '..kkllmbbbbbccccdd....',
        '..kkllmmbbbbcccd......',
        '...kklmm..............',
        '...kklm...............',
        '....kl................',
    ]
    BEARD = [
        '.......wwxxyy....',
        '.....wwxxyyyzz...',
        '....wwxxyyzyyzz..',
        '....wxxyyzyyyzz..',
        '...wwxxyyzyyzz...',
        '...wxxyyyzyyzz...',
        '...wxxyyzyyzz....',
        '...wxxyyzyyz.....',
        '....wxxyzyyz.....',
        '....wxxyzyz......',
        '....wxyyzyz......',
        '.....wxyzy.......',
        '.....wxyfy.......',
        '.....wxfe........',
        '......wfe........',
        '......f.f........',
        '.......e.........',
    ]
    LEG = {'a': ('skin', 1), 'b': ('skin', 2), 'c': ('skin', 3), 'd': ('skin', 4), 'e': ('emb', 4), 'f': ('emb', 3), 'v': ('void', 0),
           'k': ('hair', 1), 'l': ('hair', 2), 'm': ('hair', 3), 'w': ('beard', 1), 'x': ('beard', 2), 'y': ('beard', 3), 'z': ('beard', 4)}
    hx_, hh_ = up(hx0 - 9, 141)
    f.sprite(hx_, hh_, HEAD, LEG)
    beard_at = up(hx0 - 2, 121)
    # Krone: Reif mit Glutsteinen, hohe Zacken mit Lücken
    f.put(f.poly(HU([(-7, 139), (10, 139), (10, 144.5), (-7, 144.5)])), 'crown', shade='cyl', cut=(0.2, 0.55))
    for x in (-4, 1.5, 7): hdot(x, 141.5, 'emb', 4); hdot(x, 142.5, 'emb', 3)
    spikes = [(-6, 144, 9), (-1.5, 144, 15), (3.5, 144, 18), (8.5, 144, 11)]
    smask = np.zeros((f.H, f.W), bool)
    for x0, h0, L in spikes:
        sm = f.poly(HU([(x0 - 1.4, h0), (x0 + 0.2, h0 + L), (x0 + 1.4, h0)]))
        f.put(sm, 'crown', light=(1, -1), hi=1, mid=2, flat=3); smask |= sm
        hdot(x0, h0 + L - 2, 'emb', 4)
    # ---- vordere Schulter: großer Panzer in drei Lagen mit Dornen
    f.put(f.poly(U([(-21, 100), (-23, 108), (-18, 116), (-8, 118), (2, 116), (7, 109), (6, 100)])), 'bone', shade='lame', bh=6)
    f.put(f.poly(U([(-20, 93), (-21, 100.5), (-7, 102), (6, 101), (8, 94)])), 'bone', shade='lame', bh=4)
    f.put(f.poly(U([(-17, 87), (-18, 93), (-6, 94.5), (7, 93.5), (8, 88)])), 'bone', shade='lame', bh=3)
    for x0, h0, L, ang in ((-18, 115, 12, 122), (-12, 117.5, 15, 112), (-5, 118, 10, 100)):
        a = math.radians(ang)
        tip = (x0 + L * math.cos(a), h0 + L * math.sin(a))
        f.put(f.poly(U([(x0 - 2.4, h0 - 1), tip, (x0 + 2.4, h0 - 1)])), 'bone', light=(1, -1), hi=1, mid=2, flat=4)
        X, Y = f.at(*up(*tip)); f.px(X, Y + 1, 'trim', 4); f.px(X, Y + 2, 'trim', 3)
    for k in range(18):
        X, Y = f.at(*up(-21 + k * 1.6, 100 - (k % 4 == 0)))
        if f.mat[Y, X] == 'bone': f.mat[Y, X] = 'trim'; f.tone[Y, X] = 3
    # ---- vorderer Arm
    shN = up(-4, 100)
    en = ik(shN, near_hand, 23, 23, bend=-1)
    ua, fa = f.seg(shN, en, 12, 11), f.seg(en, near_hand, 11, 10)
    f.put(ua, 'bone', cut=(0.2, 0.45))
    f.put(fa, 'bone', cut=(0.2, 0.45))
    rim = f.seg(lerp(en, near_hand, 0.55), lerp(en, near_hand, 0.75), 14, 14)
    f.put(rim, 'trim', cut=(0.2, 0.5))
    f.put(f.seg(lerp(en, near_hand, 0.7), lerp(en, near_hand, 0.88), 13, 13), 'bone', cut=(0.2, 0.5))
    ex, eh = en
    f.put(f.poly([(ex - 1, eh + 7), (ex - 9, eh + 2), (ex - 7, eh - 6), (ex, eh - 1)]), 'trim', light=(1, -1), hi=1, mid=3, flat=4)
    f.put(f.ell(ex, eh, 6, 5.6), 'bone', shade='dome', r=3, dcuts=(0.12, 0.4, 0.7))
    # Bart (Asche, die Spitzen glimmen) fällt vor Brust und Arm
    f.sprite(beard_at[0], beard_at[1], BEARD, LEG)
    # Kronenflammen: gehören zum Körperbild (wandern mit dem Atem)
    return smask


# ------------------------------------------------------------------------------------------- Posen
GROUND = FY0 + 1


def figure(p, wing_ph=0.0, cape_ph=0.0, crown_t=0, crown_n=6, flame_t=None, big=False, parts=False):
    """Pose -> (hinten [Schwingen, Umhang], Körper [mit Kronenflammen], Schwert mit Hand, Klingenmaske, Feuermaske)."""
    nh, fh = hands_of(p)
    if 'fh' in p: fh = p['fh']
    p = dict(p, hands=(nh, fh))
    fb = new()
    wing(fb, (-12 + p.get('lean', 0) * 0.9, 106 + p.get('breath', 0) - p.get('crouch', 0)), flap=p.get('flap', 0) + 0.3 * math.sin(wing_ph * 2 * math.pi) - 0.15, spread=p.get('spread', 0), far=True, phase=wing_ph)
    cape(fb, cape_ph, lift=p.get('breath', 0) - p.get('crouch', 0), billow=p.get('wehen', 0), lean=p.get('lean', 0) * 0.7)
    wing(fb, (-8 + p.get('lean', 0) * 0.9, 104 + p.get('breath', 0) - p.get('crouch', 0)), flap=p.get('flap', 0) + 0.3 * math.sin(wing_ph * 2 * math.pi + 0.5), spread=p.get('spread', 0), phase=wing_ph + 0.1)
    back = fb.render(rim=None, rim_back=RIM_B)
    fk = new()
    smask = body(fk, p)
    bodyim = fk.render(rim=RIM_F, rim_back=RIM_B)
    # Kronenflammen über den Zacken
    cf = flame(smask, crown_t, crown_n, R=4.6 if big else 3.2, up=0.3, rise=1.4)
    bodyim = over(cf, bodyim)
    fs = new()
    blade, fire = sword(fs, p['grip'], p['ang'])
    hand(fs, nh)
    swim = fs.render(rim=RIM_F, rim_back=RIM_B)
    g = p.get('boden', GROUND)
    for im in (back, bodyim): im[GROUND:] = 0
    swim[g:] = 0; fire[g:] = False; blade[g:] = False
    return back, bodyim, swim, blade, fire


def full(p, wing_ph=0, cape_ph=0, crown_t=0, flame_t=0, big=False):
    back, bd, sw, blade, fire = figure(p, wing_ph, cape_ph, crown_t, big=big)
    fl = flame(fire, flame_t, 6, R=6.2 if big else 4.6)
    return over(over(over(back, bd), fl), sw), blade


POSEN = {
    'ruhe': dict(grip=(26, 60), ang=-32, fh=(-22, 64), crouch=2),
    'zug': dict(grip=(26, 72), ang=-20, lean=-2, crouch=1, flap=0.2),
    'h1': dict(grip=(18, 104), ang=70, near='B', lean=-3, flap=0.5, spread=0.4),
    'h2': dict(grip=(6, 134), ang=125, near='B', lean=-6, kopf=1, flap=0.9, spread=0.9, wehen=10),
    'aus': dict(grip=(0, 138), ang=150, near='B', lean=-7, kopf=1, flap=1.0, spread=1.0, wehen=14),
    'hieb': dict(grip=(34, 108), ang=20, near='B', lean=4, flap=0.2, spread=0.4, wehen=8),
    'ein': dict(grip=(46, 40), ang=-40, near='B', crouch=13, lean=15, kopf=-1, fN=6, fF=-4, flap=-0.8, spread=0.3, wehen=6, boden=FY0 + 1),
    'ein2': dict(grip=(44, 44), ang=-42, near='B', crouch=9, lean=10, fN=6, fF=-4, flap=-0.4, spread=0.1, boden=FY0 + 1),
    'auf': dict(grip=(34, 64), ang=-55, crouch=2, lean=2, flap=0.0),
}
for k, v in POSEN.items():
    if 'fh' not in v: pass




# ------------------------------------------------------------------------------------------- Hiebbogen
def smear(p0, p1, c=(4, 110), R=118, wmax=12):
    f = new(); out = np.zeros((H, W, 4), np.uint8)
    lo, hi = sorted((math.radians(p0), math.radians(p1)))
    for y in range(H):
        for x in range(W):
            dx, dh = (x + 0.5 - FX) / S - c[0], (FY0 - (y + 0.5)) / S - c[1]
            r = math.hypot(dx, dh); a = math.atan2(dh, dx)
            if not (lo <= a <= hi): continue
            k = (a - lo) / (hi - lo)
            w = wmax * (1 - k) ** 1.4
            if w < 1 or not (R - w <= r <= R): continue
            q = (R - r) / max(w, 1)
            lv = 4 if q < 0.3 and k < 0.5 else 3 if q < 0.6 else 2 if k < 0.7 else 1
            if k > 0.55 and (x + y) % 2: continue
            out[y, x] = (*hexc(FLAME[lv]), 255)
    out[GROUND:] = 0
    return out


def impact_star(pal=FLAME, w=25, h=22):
    """Einschlag: harter Lichtstern, dann Glutkranz und zerfallender Bogen (4 Bilder, Fußpunkt unten Mitte)."""
    out = []
    cx, cy = w // 2, h - 3
    for k in range(4):
        im = np.zeros((h, w, 4), np.uint8)
        def put(x, y, lv):
            x, y = int(round(cx + x)), int(round(cy + y))
            if 0 <= x < w and 0 <= y < h and lv >= 0: im[y, x] = (*hexc(pal[lv]), 255)
        if k == 0:
            for i in range(-9, 10): put(i, 0, 4 if abs(i) < 4 else 3 if abs(i) < 7 else 2)
            for j in range(1, 14): put(0, -j, 4 if j < 5 else 3 if j < 9 else 2)
            for j in range(1, 6): put(j, -j, 3 if j < 3 else 2); put(-j, -j, 3 if j < 3 else 2)
            for x, y in ((1, -1), (-1, -1), (1, 0), (0, -2), (1, -2), (-1, -2)): put(x, y, 4)
        else:
            r = (5, 8, 11)[k - 1]
            n = int(math.pi * r * 1.6)
            for i in range(n + 1):
                a = math.pi * i / n
                if k == 3 and (i // 2) % 2: continue
                put(r * math.cos(a), -r * math.sin(a) * 0.8, (4, 3, 2)[k - 1])
                if k < 3: put((r - 1) * math.cos(a), -(r - 1) * math.sin(a) * 0.8, (3, 2, 1)[k - 1])
            for j in range(k + 1): put(-j * 2 - 3, 0, 2); put(j * 2 + 3, 0, 2)
        out.append(im)
    return out


# ------------------------------------------------------------------------------------------- Saal des Aschethrons
BX = 352            # Fußpunkt des Bosses in der Szene (x)
SUN = (370, 66, 54)  # Glutsonne hinter dem Thron: Mitte, Radius
OBSI = ['#07040a', '#0e0912', '#140c17', '#1b111d', '#251624']
FLOORC = ['#07040a', '#120b11', '#1a1017', '#23151d', '#2f1c22']
EMB = MAT['emb']


def sheen(img, seam, cx, w, y0, y1):
    """Spiegelung der Glutsonne im polierten Obsidian: Platten nahe cx eine Stufe wärmer, Rand gerastert."""
    for y in range(y0, y1):
        for x in range(max(0, int(cx - 2 * w)), min(SW, int(cx + 2 * w))):
            if seam[y, x] or img[y, x, 3] == 0: continue
            k = 1 - abs(x - cx) / w - (y - y0) / (y1 - y0) * 0.35
            if k <= 0: continue
            lv = 2 if k > 0.55 else 1
            if k < 0.25 and BAYER4[y % 4, x % 4] > k * 4: continue
            r, g, b, _ = img[y, x]
            img[y, x, :3] = (min(255, r + 18 * lv), min(255, g + 6 * lv), min(255, b + 2 * lv))


def scene():
    L = {}
    # ---- Ferne: Rückwand, Friese, Glutsonne, Thron (Tiefe 0,15)
    F = bands(SH, SW, 0, 150, ['#030106', '#07030a', '#0b050e', '#110710', '#170a12'])
    wall = bricks(0, 26, SW, 168, 22, 9, OBSI, seed=4)
    stamp(F, wall)
    G = np.zeros((SH, SW, 4), np.uint8)
    def frieze(y, h, col=('#2a1408', '#5a3010', '#8a4a18')):
        F[y:y + h, :] = (*hexc('#0a0508'), 255)
        F[y, :] = (*hexc(col[2]), 255); F[y + h - 1, :] = (*hexc(col[0]), 255)
        for x in range(SW):           # Mäander
            u = x % 8
            pat = [(1, 1, 1, 1, 1, 0, 0, 0), (1, 0, 0, 0, 1, 0, 1, 1), (1, 0, 1, 1, 1, 0, 1, 0), (1, 0, 0, 0, 0, 0, 1, 0)]
            for j in range(min(4, h - 3)):
                if pat[j][u]: F[y + 2 + j, x] = (*hexc(col[1]), 255)
    frieze(24, 8); frieze(150, 7)
    # Glutsonne: Ringe in harten Stufen mit Bayer-Kante, Strahlen
    cx, cy, R = SUN
    Y, X = np.mgrid[0:SH, 0:SW]
    d = np.hypot(X + 0.5 - cx, (Y + 0.5 - cy) * 1.0)
    SUNC = ['#2a0a06', '#4a1008', '#7a1e08', '#b8380c', '#e86418', '#ffa040', '#ffd890']
    dd = d / R + (BAYER4[Y % 4, X % 4] - 0.5) * 0.06
    lvl = np.select([dd < 0.42, dd < 0.6, dd < 0.74, dd < 0.86, dd < 0.95, dd < 1.0, dd < 1.25], [6, 5, 4, 3, 2, 1, 0], -1)
    ang = np.arctan2(Y + 0.5 - cy, X + 0.5 - cx)
    ray = (np.cos(ang * 16) > 0.86) & (dd >= 1.0) & (dd < 1.55)
    lvl = np.where(ray & (lvl < 1), np.where(dd < 1.3, 1, 0), lvl)
    sunm = lvl >= 0
    for k in range(7):
        m = lvl == k
        G[m] = (*hexc(SUNC[k]), 255)
    # Sonne im Grundbild gedämpft (Pulsieren über die Glut-Ebene)
    for k in range(7):
        m = lvl == k
        F[m] = (*hexc(SUNC[max(0, k - 2)]), 255)
    # Thron: Schattenriss vor der Sonne (hohe Lehne, Hörner, Zacken), Kanten glühen vom Gegenlicht
    T = Buf()
    tx = cx - 2
    back = [(tx - 26, 168), (tx - 26, 92), (tx - 34, 80), (tx - 23, 84), (tx - 19, 66), (tx - 12, 76), (tx - 5, 50), (tx, 64), (tx + 5, 50), (tx + 12, 76), (tx + 19, 66),
            (tx + 23, 84), (tx + 34, 80), (tx + 26, 92), (tx + 26, 168)]
    tm = T.poly(back)
    tm |= T.poly([(tx - 46, 168), (tx - 46, 120), (tx - 36, 116), (tx + 36, 116), (tx + 46, 120), (tx + 46, 168)])   # Armlehnen
    tm |= T.poly([(tx - 58, 172), (tx - 58, 160), (tx + 58, 160), (tx + 58, 172)])
    tm |= T.poly([(tx - 70, 180), (tx - 70, 170), (tx + 70, 170), (tx + 70, 180)])
    TH = ['#0a0508', '#130b10', '#1c1016', '#2a161a']
    F[tm] = (*hexc(TH[1]), 255)
    # Rahmen der Lehne: Mittelfeld dunkler, Goldleisten
    inner = T.poly([(tx - 18, 160), (tx - 18, 96), (tx - 9, 86), (tx, 78), (tx + 9, 86), (tx + 18, 96), (tx + 18, 160)])
    F[inner] = (*hexc(TH[0]), 255)
    F[outline_mask(inner) & tm] = (*hexc('#5a3010'), 255)
    for yy in (116, 117): F[yy, tx - 46:tx + 47][tm[yy, tx - 46:tx + 47]] = (*hexc('#5a3010'), 255)
    for yy in (160, 170): F[yy, tx - 70:tx + 71][tm[yy, tx - 70:tx + 71]] = (*hexc('#3a1e10'), 255)
    em = outline_mask(~tm) & tm
    sunlit = em & (d < R * 1.5)
    F[em] = (*hexc('#2a1210'), 255)
    F[sunlit] = (*hexc('#8a3010'), 255)
    G[tm] = 0
    G[sunlit] = (*hexc('#c8420c'), 255)
    # Thronlehne innen: zwei Glutrisse
    for k in range(24):
        y = 90 + k * 3
        for xx, ph in ((tx - 9, 0), (tx + 9, 1)):
            if hash2(k, ph, 2) < 0.6:
                F[y:y + 2, xx + (k % 2)] = (*hexc('#3a1208'), 255); G[y:y + 2, xx + (k % 2)] = (*hexc(EMB[1]), 255)
    L['fern'] = dict(img=F, f=0.15)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=3.6, lo=0.55, steps=3))
    # ---- Mitte: Säulen, Banner, Feuerschalen, hinterer Boden (Tiefe 0,45)
    M = np.zeros((SH, SW, 4), np.uint8); MG = np.zeros((SH, SW, 4), np.uint8)
    back_floor, bseam, _ = floor(168, SH, [3, 3, 4, 4, 5, 5, 6, 7, 8, 9], FLOORC, vx=cx, vy=40, tile=30, seed=7)
    sheen(back_floor, bseam, cx, 46, 168, 190)
    stamp(M, back_floor)
    # Glut vom Thron auf dem hinteren Boden: Fugen nahe der Mitte glimmen
    for y, x in zip(*np.nonzero(bseam)):
        dx = abs(x - cx)
        if dx < 120 and y > 172:
            M[y, x] = (*hexc('#3a1208' if dx > 60 else '#5a1a0c'), 255)
            if dx < 60 and chk(x, y): MG[y, x] = (*hexc(EMB[1]), 255)
    PIL = ['#06030a', '#0f0913', '#19101c', '#241626', '#33202e']
    def column(x0, w, top=0, bot=172):
        for y in range(top, bot):
            for x in range(x0, x0 + w):
                u = (x - x0 + 0.5) / w
                t = 1 if u < 0.2 else 2 if u < 0.55 else 3 if u < 0.85 else 2
                if x == x0 + w - 1: t = 1
                M[y, x] = (*hexc(PIL[t]), 255)
            if (y - top) % 26 in (0, 1):
                pass
        for yy in (bot - 8, bot - 7, 34, 35, 36):
            for x in range(x0 - 2, x0 + w + 2):
                u = (x - x0 + 2.5) / (w + 4)
                M[yy, x] = (*hexc(['#2a1408', '#5a3010', '#8a4a18', '#c4752a'][min(3, int(u * 3.2) if u < 0.9 else 1)]), 255)
        for x in range(x0 - 4, x0 + w + 4):
            for yy in range(bot - 6, bot):
                M[yy, x] = (*hexc(PIL[2 if yy == bot - 6 else 1]), 255)
            for yy in range(26, 34):
                M[yy, x] = (*hexc(PIL[3 if yy == 26 else 1]), 255)
    for x0 in (28, 172, 488):
        column(x0, 24)
    # Banner: karmin, Goldsaum, Krone, unten geschlitzt
    BAN = ['#1e070c', '#3c0d15', '#5e141d', '#851f25', '#ae3330']
    def banner(x0, w=20, top=38, L=74, seed=1):
        for y in range(top, top + L + 8):
            for x in range(x0, x0 + w):
                u = (x - x0 + 0.5) / w
                cut = top + L + (abs(x - x0 - w / 2 + 0.5) / (w / 2)) * 8 - 8
                if y > cut + 8 - abs(((x - x0) % 10) - 5) * 1.6: continue
                fo = math.sin(u * 2 * math.pi * 1.5 + seed)
                t = 2 + (1 if fo > 0.5 else -1 if fo < -0.4 else 0)
                if x == x0 or x == x0 + w - 1: t = 1
                col = BAN[t]
                if x in (x0 + 1, x0 + w - 2) or y in (top, top + 1): col = '#8a4a18' if y > top else '#c4752a'
                M[y, x] = (*hexc(col), 255)
        # Krone
        cx0, cy0 = x0 + w // 2, top + 24
        for dx, dy in ((-4, 0), (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, 0), (-4, -1), (-4, -2), (-4, -3), (0, -1), (0, -2), (0, -3), (0, -4), (4, -1), (4, -2), (4, -3),
                       (-2, -1), (2, -1), (-3, 1), (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1)):
            M[cy0 + dy, cx0 + dx] = (*hexc('#e8a040' if dy <= -3 else '#c4752a'), 255)
        # Stange
        for x in range(x0 - 3, x0 + w + 3): M[top - 2, x] = (*hexc('#5a3010'), 255); M[top - 1, x] = (*hexc('#2a1408'), 255)
    for x0, s in ((96, 1), (232, 2), (528, 3)):
        banner(x0, seed=s)
    # Feuerschalen auf Dreifüßen: Schale in Mitte, Flamme als eigene Bildfolge
    braziers = []
    for bx_, by_ in ((78, 150), (444, 150)):
        for k in range(18):
            y = by_ + 4 + k
            for dx in (-6 + k // 3, 6 - k // 3, 0):
                M[y, bx_ + dx] = (*hexc('#5a3010' if dx else '#2a1408'), 255)
        for dx in range(-6, 7):
            for dy in range(0, 5):
                if abs(dx) <= 6 - dy:
                    M[by_ + dy, bx_ + dx] = (*hexc(['#c4752a', '#8a4a18', '#5a3010', '#2a1408', '#2a1408'][dy]), 255)
        for dx in range(-5, 6): MG[by_ - 1, bx_ + dx] = (*hexc(EMB[3] if abs(dx) < 3 else EMB[2]), 255)
        braziers.append((bx_, by_))
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=4.1, lo=0.66, steps=3))
    # ---- Boden: Thronpodest vorn (Tiefe 1): große Platten, Glutfugen nahe dem Boss
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#07040a', '#150d13', '#1f141a', '#2a1a21', '#3a2428'], vx=BX - 30, vy=-40, tile=34, seed=11)
    sheen(Bd, seam, SUN[0], 40, FY - 4, SH)
    # Kante oben vom Thron angestrahlt
    for x in range(SW):
        Bd[FY - 4, x] = (*hexc('#4a2a22' if hash2(x, 1, 2) > 0.2 else '#33201e'), 255)
    BG = np.zeros((SH, SW, 4), np.uint8)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        far = abs(x - BX) / 90 + (y - FY) / 30
        lv = 0 if far < 0.5 else 1 if far < 1.3 else 2
        deep = y > FY + 18
        Bd[y, x] = (*hexc('#3a1410' if lv == 2 or deep else EMB[1]), 255)
        if lv < 2 and not deep: BG[y, x] = (*hexc(EMB[3] if lv == 0 else EMB[2]), 255)
    # Schatten des Bosses (feste Stufen)
    for dy, hw, k in [(-3, 30, 0.6), (-2, 40, 0.55), (-1, 44, 0.55), (0, 40, 0.6), (1, 30, 0.7)]:
        y = FY + dy
        for x in range(BX - hw, BX + hw):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
            BG[y, x] = 0
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=3.4, lo=0.6, steps=3))
    # ---- Vordergrund (Tiefe 1,35): Säulentrümmer links, Kette rechts oben, Schattenrisse mit Glutkante
    V = Buf()
    vm = V.poly([(-10, SH), (-10, 176), (4, 172), (10, 178), (18, 174), (26, 184), (34, 192), (44, 200), (50, SH)])
    vm |= V.poly([(500, SH), (512, 196), (530, 190), (548, 194), (566, SH)])
    V.a[vm] = (*hexc('#07040a'), 255)
    e = outline_mask(~vm) & vm
    top_e = e & ~np.roll(vm, 1, axis=0)
    V.a[top_e] = (*hexc('#3a1a14'), 255)
    for y, x in zip(*np.nonzero(top_e)):
        if hash2(x, y, 9) < 0.25: V.a[y, x] = (*hexc('#7a2a10'), 255)
    # Kette
    for k in range(64):
        y = k; x = 536 + int(round(2 * math.sin(k / 9)))
        if k % 4 < 3:
            V.set(x, y, '#2a1814'); V.set(x + 1, y, '#120a0c' if k % 4 else '#4a2a20')
        else:
            V.set(x - 1, y, '#2a1814'); V.set(x + 2, y, '#2a1814')
    L['vorn'] = dict(img=V.a, f=1.35)
    return L, seam, braziers


def layer_list(Ld, order):
    out = []
    for n in order:
        if n not in Ld: continue
        d = Ld[n]
        im, x, y = None, 0, 0
        a = np.nonzero(d['img'][:, :, 3])
        y0, y1, x0, x1 = a[0].min(), a[0].max() + 1, a[1].min(), a[1].max() + 1
        e = dict(name=n, img=d['img'][y0:y1, x0:x1], x=int(x0), y=int(y0), f=d['f'])
        if 'glow' in d: e['glow'] = d['glow']
        if n.endswith('-glut'): e['poster'] = True
        out.append(e)
    return out


# ------------------------------------------------------------------------------------------- Bauen
UMH_N, UMH_MS = 8, 170
FLA_N, FLA_MS = 6, 100
ATEM = [0, 0, 0, 1, 1, 1]
ATEM_MS = 240
MOMENT = [('zug', 130), ('h1', 90), ('h2', 90), ('aus', 600, 'gross'), ('hieb', 70, None, 'bogen'), ('ein', 700, 'gross', 'hit'), ('ein2', 300), ('auf', 220)]


def build():
    R = POSEN['ruhe']
    # ---- Ruhe: hinten (Schwingen, Umhang), Körper (Atem), Kronenflammen, Klingenflammen, Schwert
    backs, bodies = [], []
    for i in range(UMH_N):
        b, _, _, _, _ = figure(R, wing_ph=i / UMH_N, cape_ph=i / UMH_N)
        backs.append(b)
    crowns = []
    for br in (0, 1):
        fk = new(); nh, fh = hands_of(R); fh = R['fh']
        smask = body(fk, dict(R, breath=br, hands=(nh, fh)))
        bodies.append(fk.render(rim=RIM_F, rim_back=RIM_B))
        if br == 0:
            for i in range(FLA_N): crowns.append(flame(smask, i, FLA_N, R=3.2, up=0.3, rise=1.4))
            top0 = np.nonzero(smask)[0].min()
        else:
            krone_dy = [0, int(np.nonzero(smask)[0].min() - top0)]
    fs = new(); blade, fire = sword(fs, R['grip'], R['ang']); hand(fs, hands_of(R)[0])
    klinge = fs.render(rim=RIM_F, rim_back=RIM_B)
    flammen = [flame(fire, i, FLA_N, R=4.6) for i in range(FLA_N)]
    # ---- Moment: ganze Bilder
    frames, seq, tms, hit = [], [], 0, 0
    cph = 0
    for step in MOMENT:
        pn, ms = step[0], step[1]
        big = len(step) > 2 and step[2] == 'gross'
        tag = step[3] if len(step) > 3 else None
        p = POSEN[pn]
        n = max(1, round(ms / FLA_MS)) if big else 1
        for k in range(n):
            q = dict(p, wehen=max(4, p['wehen'] - k)) if 'wehen' in p else p
            ph = (tms // UMH_MS) % UMH_N / UMH_N
            im, bl = full(q, wing_ph=ph, cape_ph=ph, crown_t=len(frames) % 6, flame_t=len(frames) % 6, big=big)
            if tag == 'bogen':
                back, bd, sw, _, _ = figure(q, ph, ph, len(frames) % 6)
                im = over(over(over(back, bd), smear(30, 150)), sw)
            if tag == 'hit' and k == 0:
                hit = len(frames)
                ys, xs = np.nonzero(bl[:GROUND + 1])
                low = ys.max(); imp_x = int(round(xs[ys == low].mean()))
            frames.append(im); seq.append(round(ms / n)); tms += round(ms / n)
    uniq, idx = dedupe(frames)
    # ---- gemeinsamer Rahmen, gespiegelt (Blick nach links)
    allims = backs + bodies + crowns + flammen + [klinge] + uniq
    x0, y0, x1, y1 = common_crop(allims)
    fw, fh_ = x1 - x0, y1 - y0
    cut = lambda im: flip(im[y0:y1, x0:x1])
    # Fußpunkt im Ausschnitt nach Spiegelung
    fx = (x1 - 1) - FX           # Spalte von FX im gespiegelten Ausschnitt
    fy = FY0 - y0
    sheets = {
        'hinten': strip([cut(i) for i in backs]), 'koerper': strip([cut(i) for i in bodies]),
        'krone': strip([cut(i) for i in crowns]), 'flamme': strip([cut(i) for i in flammen]),
        'klinge': cut(klinge), 'moment': strip([cut(i) for i in uniq]),
    }
    FXs, FYs = BX - fx, FY - fy        # Szenenstelle des Ausschnitts
    imp_scene = FXs + (x1 - 1 - imp_x)
    poster = over(over(over(over(cut(backs[0]), cut(bodies[0])), cut(crowns[0])), cut(flammen[0])), cut(klinge))
    # Funken an der Klinge (Ruhe): Rahmen der Feuermaske in Szenenpixeln
    ys, xs = np.nonzero(fire[y0:y1, x0:x1][:, ::-1])
    kl = [int(FXs + xs.min()), int(FYs + ys.min()), int(FXs + xs.max()), int(FYs + ys.max())]
    # ---- Szene
    Ld, seam, braziers = scene()
    layers = layer_list(Ld, ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'])
    # ---- Effekte: Fugenwelle nach links, Flammenwand, Feuerschalen
    wave, wmeta = seam_wave(seam, imp_scene, FY - 3, v=260, ms=60, pal=FLAME, direction=-1, maxd=420,
                            peak=lambda d: 4 if d < 60 else 3 if d < 180 else 2)
    fx_ = {'welle': wave}
    def fire_strip(w, h, base, R, n=6, rise=0.16):
        """Flammensäule: Bilder gleicher Größe (w × h), Fuß unten Mitte; oben frei auslaufend (kein gerader Schnitt)."""
        HH = h * 2
        src = np.zeros((HH, w), bool); src[HH - 3:HH - 1, (w - base) // 2:(w + base) // 2] = True
        fr = [flame(src, i, n, R=R, up=0.15, side=1.6, rise=rise, gain=1.9) for i in range(n)]
        for im in fr: im[:HH - h] = 0
        return [im[HH - h:] for im in fr]
    fx_['wand'] = strip([feuer(44, 72, i, 6, seed=1) for i in range(6)])
    fx_['wand2'] = strip([feuer(26, 40, i, 6, seed=2) for i in range(6)])
    fx_['wand3'] = strip([feuer(16, 22, i, 6, seed=3) for i in range(6)])
    bra = []
    for i in range(6): bra.append(feuer(16, 20, i, 6, seed=5, hw=0.38))
    fx_['schale'] = strip(bra)
    fx_['blitz'] = strip(impact_star())
    sch = [[int(x - 8), int(y - 19)] for x, y in braziers]
    FUNKEN = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a']
    STAUB = ['#6a5040', '#4e3a30', '#3a2a24']
    meta = {
        'name': 'malgareth', 'glut': ['#fff2c0', '#ffb648', '#c8420c'],
        'fokus': [300, BX - 22],
        'fig': {'x': int(FXs), 'y': int(FYs), 'w': int(fw), 'h': int(fh_)},
        'ruhe': [dict(r='hinten', n=UMH_N, ms=UMH_MS), dict(r='koerper', seq=ATEM, ms=ATEM_MS), dict(r='krone', n=FLA_N, ms=FLA_MS, dy=krone_dy, von='koerper'),
                 dict(r='flamme', n=FLA_N, ms=FLA_MS), dict(r='klinge', n=1, ms=1000)],
        'moment': {'f': [[i, m] for i, m in zip(idx, seq)], 'hit': hit},
        'warn': {'x0': 8, 'x1': int(imp_scene) - 6, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 700, 'c': ['#7a1a08', '#c8420c', '#ffb648']},
        'ereignisse': [
            dict(k='bild', r='welle', at=0, x=wmeta['x'], y=wmeta['y'], w=wmeta['w'], h=wmeta['h'], n=wmeta['n'], ms=wmeta['ms'], z='boden'),
            dict(k='bild', r='blitz', at=0, x=int(imp_scene) - 12, y=FY - 18, w=25, h=22, n=4, ms=60, quer=True, z='vorn'),
            dict(k='wand', r='wand', r2='wand2', r3='wand3', at=40, x=int(imp_scene) - 6, y=FY + 3, dir=-1, v=200, weg=int(imp_scene) + 10, w=44, h=72, w2=26, h2=40, w3=16, h3=22, n=6, ms=80, abst=7, nach=620, z='vorn'),
            dict(k='funken', at=0, x=int(imp_scene), y=FY - 2, n=28, r=4, vx=50, vy=120, g=280, c=FUNKEN),
            dict(k='funken', at=0, x=int(imp_scene), y=FY - 1, n=18, r=8, vx=34, vy=45, g=80, c=STAUB),
        ],
        'schalen': sch, 'schale': {'w': 16, 'h': 20, 'n': 6, 'ms': 90}, 'schaleNach': 'mitte-glut',
        'teilchen': 'asche', 'dichte': 2.2,
        'nach': 'boden-glut',
        'dauer': 9.5, 'start': 2.4,
    }
    return {'layers': layers, 'figure': {'sheets': sheets, 'meta': {'fx': int(fx), 'fy': int(fy)}, 'poster': poster, 'x': int(FXs), 'y': int(FYs)},
            'fx': fx_, 'meta': meta, 'figure_after': 'boden-glut',
            'previews': {'moment': strip([cut(i) for i in uniq])}}
