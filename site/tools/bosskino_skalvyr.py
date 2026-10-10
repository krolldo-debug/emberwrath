# Bosskino: Skalvyr, der Frostwurm (Stufe 37) in den Reifhöhlen.
# Figur: flügelloser Eisdrache mit Schlangenleib (Farben: frost_wyrm.js). Der Leib liegt in einer Welle am Boden, der
# Hals steigt wie bei einer Kobra auf; Kristallstacheln den Rücken entlang, Kristallhörner, im Brustkorb ein Frostherz
# hinter den Bauchplatten. Der Leib ist eine Röhre entlang einer Catmull-Rom-Kurve: Scheiben mit Licht von vorn oben in
# 4 Tönen, Schuppenraster längs der Bogenlänge, Bauchplatten unten. Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Attacke „Eiszapfenregen“: der Wurm bäumt sich bis unter die Decke auf und brüllt; die Decke bebt, Eiszapfen lösen sich,
# unter jedem wächst eine gestufte Bodenmarke, dann schlägt er ein und zerspringt, Reif läuft durch die Fugen.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, over, flip, hash2, hexc, FROST, Buf, bands, chk, BAYER4,
                      seam_wave, strip, outline_mask, edge_of, floor, bricks, stamp, finish, SW, SH, FY, dome)

MAT.update({
    'scl': ['#050a14', '#16304c', '#245070', '#3a7892', '#86c4d2'],
    'scld': ['#03060c', '#0a1424', '#12263e', '#1b3a58', '#3a7892'],
    'bel': ['#0e1c2a', '#40687e', '#6a94aa', '#9cc2d2', '#d2eaf2'],
    'crys': ['#0a1e36', '#25649c', '#3f9ccf', '#88d4ef', '#dcf8ff'],
    'horn': ['#0e1622', '#2e4258', '#4c6882', '#7c9cb2', '#bcd6e2'],
    'maw': ['#05040a', '#1c1028', '#341634', '#56203e', '#7c3252'],
    'teeth': ['#3a5468', '#5a7a92', '#c4e0ec', '#e8f6fc', '#f4fcff'],
    'fg': ['#0a3050', '#1670a0', '#34b8e4', '#9aeefc', '#ffffff'],
    'svoid': ['#03050a'] * 5,
})
RIM_F = {'scl': '#cfe8f2', 'bel': '#f4fdff', 'crys': '#ffffff', 'horn': '#e2f2fa', 'scld': '#86c4d2'}
RIM_B = {'scl': '#34b8e4', 'scld': '#1670a0', 'bel': '#9aeefc', 'crys': '#9aeefc', 'horn': '#9aeefc'}

W, H, FX, FY0 = 360, 230, 210, 222
S = 0.92
GROUND = FY0 + 1
def new(): return Fig(W, H, FX, FY0, S)


def catmull(pts, step=0.5):
    out = []
    n = len(pts)
    ext = lambda i: pts[0] if i < 0 else pts[-1] if i >= n else pts[i]
    for i in range(n - 1):
        p0, p1, p2, p3 = ext(i - 1), ext(i), ext(i + 1), ext(i + 2)
        L = math.hypot(p2[0] - p1[0], p2[1] - p1[1]); k = max(2, int(L / step))
        for s in range(k):
            t = s / k; t2, t3 = t * t, t * t * t
            cr = lambda a, b, c, d: 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            out.append((cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), i + t))
    out.append((*pts[-1], n - 1))
    return out


L3 = np.array([0.45, 0.75, 0.5]); L3 = L3 / np.linalg.norm(L3)


def tube(f, pts, rad, crest=None):
    """Leib als Röhre: Scheiben vom Schwanz zum Hals. rad(k) Radius am Steuerparameter k. Rückgabe: Rückenpunkte für Stacheln."""
    sp = catmull(pts)
    arc = 0; prev = None
    back = []
    nxt = 6
    part0 = f.np + 1
    for j, (x, h, k) in enumerate(sp):
        if prev: arc += math.hypot(x - prev[0], h - prev[1])
        nx_, nh_ = (sp[min(len(sp) - 1, j + 1)][0] - sp[max(0, j - 1)][0]), (sp[min(len(sp) - 1, j + 1)][1] - sp[max(0, j - 1)][1])
        ln = math.hypot(nx_, nh_) or 1; tx, th = nx_ / ln, nh_ / ln
        ux, uh = -th, tx                    # Normale (bei Lauf nach rechts: oben)
        if uh < 0: ux, uh = -ux, -uh
        prev = (x, h)
        r = rad(k)
        if j % 6 == 0:
            f.np += 1; f.line[f.np] = True; f.rim[f.np] = True; f.gap[f.np] = 4
        X0, Y0 = f.at(x, h)
        R = int(math.ceil(r * f.S)) + 1
        for yy in range(Y0 - R, Y0 + R + 1):
            for xx in range(X0 - R, X0 + R + 1):
                if not (0 <= xx < f.W and 0 <= yy < f.H): continue
                dx = (xx + 0.5 - f.FX) / f.S - x; dh = (f.FY - (yy + 0.5)) / f.S - h
                d2 = dx * dx + dh * dh
                if d2 > r * r: continue
                nz = math.sqrt(max(0, 1 - d2 / (r * r)))
                v = (dx / r) * L3[0] + (dh / r) * L3[1] + nz * L3[2]
                side = (dx * ux + dh * uh) / r          # +1 Rücken, -1 Bauch
                along = (dx * tx + dh * th)
                if side < -0.42 and r > 2.5:
                    mat = 'bel'
                    t = 4 if v > 0.8 else 3 if v > 0.55 else 2 if v > 0.25 else 1
                    if int((arc + along) / 3.2) % 2 == 0 and abs(((arc + along) / 3.2) % 1) < 0.3: t = max(1, t - 1)
                else:
                    mat = 'scl'
                    t = 4 if v > 0.84 else 3 if v > 0.58 else 2 if v > 0.25 else 1
                    # Schuppenraster: Rauten aus Bogenlänge und Umfangswinkel
                    g = (arc + along) / 3.0 + side * 2.2
                    g2 = (arc + along) / 3.0 - side * 2.2
                    if (g % 1 < 0.22 or g2 % 1 < 0.22) and t > 1: t -= 1
                f.mat[yy, xx] = mat; f.tone[yy, xx] = t; f.part[yy, xx] = f.np
        if arc >= nxt and r > 3:
            nxt = arc + 11
            back.append((x + ux * r * 0.92, h + uh * r * 0.92, ux, uh, r, k))
    for p in range(part0, f.np + 1): pass
    return back


def spikes(f, back, scale=1.0, skip=lambda k: False):
    for (x, h, ux, uh, r, k) in back:
        if skip(k): continue
        L = (4 + r * 0.75) * scale
        # nach hinten geneigt (gegen die Laufrichtung = -x)
        tip = (x + ux * L - 0.35 * L, h + uh * L)
        tx, th = uh, -ux
        m = f.poly([(x - tx * 3.4 - ux, h - th * 3.4 - uh), tip, (x + tx * 3.2 - ux, h + th * 3.2 - uh)])
        f.put(m, 'crys', light=(1, -1), hi=1, mid=2, flat=3)


def head(f, base, ang=0, jaw=0.0, eye=4):
    """Kopf: Schädel mit langer Schnauze, Kristallhörner nach hinten, Unterkiefer (jaw 0..1 offen), Auge."""
    a = math.radians(ang); c_, s_ = math.cos(a), math.sin(a)
    bx, bh = base
    sc = 1.65
    P = lambda x, h: (bx + sc * (x * c_ - h * s_), bh + sc * (x * s_ + h * c_))
    # Hörner (hinter dem Schädel)
    for (x0, h0, L, an, w) in ((-6, 6, 26, 158, 3.4), (-2, 8, 20, 140, 2.8)):
        aa = math.radians(an + ang); L *= sc
        tip = (P(x0, h0)[0] + L * math.cos(aa), P(x0, h0)[1] + L * math.sin(aa))
        mid = (P(x0, h0)[0] + L * 0.55 * math.cos(aa) + 2 * math.sin(aa), P(x0, h0)[1] + L * 0.55 * math.sin(aa) + 3)
        f.put(f.poly([P(x0, h0 - w), mid, tip, P(x0 + 2, h0 + w)]), 'crys', light=(1, -1), hi=1, mid=2, flat=4)
    # Unterkiefer
    ja = -28 * jaw
    J = lambda x, h: P(x * math.cos(math.radians(ja)) - h * math.sin(math.radians(ja)), x * math.sin(math.radians(ja)) + h * math.cos(math.radians(ja)))
    if jaw > 0.1:
        f.put(f.poly([P(-6, -2), P(8, 0), P(30, -1), P(30, 2)] + [J(30, -1), J(32, -3), J(8, -6), J(-6, -4)]), 'maw', fixed=2)
    jm = f.poly([J(-6, -1), J(8, -1), J(30, -1), J(33, -3), J(28, -6), J(8, -7), J(-6, -5)])
    f.put(jm, 'bel', shade='cyl', cut=(0.2, 0.5))
    for x in range(10, 30, 4):
        f.put(f.poly([J(x, -1), J(x + 1, 2.6), J(x + 2, -1)]), 'teeth', fixed=3, line=False)
    # Schädel und Schnauze
    sk = f.poly([P(-10, -4), P(-12, 4), P(-6, 10), P(6, 11), P(16, 8), P(30, 5), P(36, 2), P(35, -1), P(28, 0), P(8, -1), P(-4, -5)])
    f.put(sk, 'scl', shade='dome', r=4, dcuts=(0.22, 0.55, 0.82))
    if jaw > 0.1:
        for x in range(12, 32, 4):
            f.put(f.poly([P(x, 0), P(x + 1, -3.4), P(x + 2, 0)]), 'teeth', fixed=4, line=False)
    # Brauenkamm, Nüstern, Auge
    f.put(f.poly([P(0, 8), P(6, 12), P(16, 9), P(14, 7), P(4, 7)]), 'horn', light=(1, -1), hi=1, mid=2, flat=4)
    X, Y = f.at(*P(33, 3)); f.px(X, Y, 'svoid', 0)
    ex, ey = f.at(*P(9, 5))
    for dx, dy, t in ((0, 0, eye), (1, 0, max(2, eye - 1)), (-1, 0, 2), (0, 1, 1), (1, 1, 1), (-1, 1, 1)):
        f.px(ex + dx, ey + dy, 'fg', t)
    # Stirnkristall
    f.put(f.poly([P(-2, 9), P(2, 17), P(5, 10)]), 'crys', light=(1, -1), hi=1, mid=2, flat=3)
    return P(30, 0)


def heart(f, at, lv):
    X, Y = f.at(*at)
    for dx, dy, t in ((0, 0, 4), (1, 0, 3), (-1, 0, 3), (0, 1, 3), (0, -1, 3), (1, 1, 2), (-1, -1, 2), (1, -1, 2), (-1, 1, 2), (2, 0, 1), (-2, 0, 1), (0, 2, 1), (0, -2, 1)):
        if 0 <= X + dx < f.W and 0 <= Y + dy < f.H and f.mat[Y + dy, X + dx] == 'bel':
            f.mat[Y + dy, X + dx] = 'fg'; f.tone[Y + dy, X + dx] = max(0, min(4, t + lv - 2))


def figure(p, ph=0.0):
    """p: Pose (Kopf, Hals, Welle). Leib vom Schwanz (hinten links) zur Brust, dann Hals und Kopf."""
    f = new()
    wv = p.get('wave', 1.0); t = ph * 2 * math.pi
    rise = p.get('rise', 0)
    body = [(-166, 34 + 3 * math.sin(t)), (-150, 16 + 2 * math.sin(t + 1)), (-128, 8), (-104, 18 + 3 * math.sin(t + 2) * wv), (-82, 36 + 3 * math.sin(t + 3) * wv),
            (-60, 26 + 2 * math.sin(t + 4)), (-38, 13), (-16, 15 + rise * 0.15), (0, 28 + rise * 0.3)]
    hx, hh = p['kopf']
    neck = [(8 + p.get('nb', 0) * 0.5, 52 + rise * 0.5), (hx - 22 + p.get('nb', 0), hh - 34), (hx - 8, hh - 10)]
    pts = body + neck
    RAD = [2.0, 4, 6.5, 9, 11, 12.5, 13.5, 15, 16, 15, 13, 11]
    rad = lambda k: np.interp(k, range(len(RAD)), RAD)
    # Hinterbein-Klaue (hinten) und Schwanzspitze
    claw = lambda x0, far: f.put(f.poly([(x0 - 6, 22), (x0 + 6, 22), (x0 + 9, 4), (x0 + 13, 0), (x0 - 2, 0), (x0 - 6, 8)]), 'scld' if far else 'scl', light=(1, -1), hi=1, mid=2, flat=4)
    claw(-2 + p.get('fx', 0), True)
    back = tube(f, pts, rad)
    spikes(f, back, scale=1.0, skip=lambda k: k > 10.6)
    # vordere Klaue
    claw(8 + p.get('fx', 0), False)
    for x in (0, 4, 8):
        f.put(f.poly([(8 + p.get('fx', 0) + 9 + x * 0.5, 2), (8 + p.get('fx', 0) + 13 + x * 0.5, 0), (8 + p.get('fx', 0) + 9 + x * 0.5, 0)]), 'teeth', fixed=3, line=False)
    heart(f, (6, 36 + rise * 0.4), p.get('herz', 3))
    head(f, (hx, hh), ang=p.get('kw', -14), jaw=p.get('jaw', 0), eye=4)
    im = f.render(rim=RIM_F, rim_back=RIM_B)
    im[GROUND:] = 0
    return im


POSEN = {
    'ruhe': dict(kopf=(34, 118), kw=-16),
    'zug': dict(kopf=(26, 104), kw=-26, nb=-3, rise=-2),
    'h1': dict(kopf=(20, 124), kw=22, rise=10, jaw=0.4, nb=4),
    'aus': dict(kopf=(12, 128), kw=48, rise=16, jaw=1.0, nb=6, herz=5),
    'aus2': dict(kopf=(13, 127), kw=50, rise=16, jaw=1.0, nb=6, herz=4),
    'ab': dict(kopf=(26, 128), kw=0, rise=6, jaw=0.3),
}


# ------------------------------------------------------------------------------------------- Reifhöhlen
BX = 382
ICE = ['#03060c', '#081221', '#0d1b30', '#13263e', '#1b3450']


def scene():
    L = {}
    F = bands(SH, SW, 0, 170, ['#020409', '#03070d', '#050b14', '#07101c', '#0a1626'])
    G = np.zeros((SH, SW, 4), np.uint8)
    B = Buf()
    rng = np.random.default_rng(3)
    # Höhlenwand: große Felsschollen (Voronoi), oben die Decke mit Eiszapfen
    Y, X = np.mgrid[0:SH, 0:SW]
    seeds = np.stack([rng.uniform(0, SW, 60), rng.uniform(10, 175, 60)], 1)
    d1 = np.full((SH, SW), 1e9); d2 = np.full((SH, SW), 1e9); idx = np.zeros((SH, SW), int)
    for i, (sx, sy) in enumerate(seeds):
        d = (X - sx) ** 2 + ((Y - sy) * 1.6) ** 2
        m = d < d1
        d2 = np.where(m, d1, np.minimum(d2, d)); idx = np.where(m, i, idx); d1 = np.where(m, d, d1)
    edge = np.sqrt(d2) - np.sqrt(d1) < 2.2
    tone = (hash2(idx, 1, 3) * 2.2 + 1).astype(int)
    wall = Y < 176
    C = np.array([(*hexc(c), 255) for c in ICE], np.uint8)
    F[wall] = C[np.where(edge, 0, tone)][wall]
    # Oberkante jeder Scholle heller (Licht von oben)
    up_edge = wall & ~edge & np.roll(edge, 1, axis=0)
    F[up_edge] = C[np.minimum(4, tone + 1)][up_edge]
    # gefrorener Wasserfall hinter dem Wurm: senkrechte Eisbahnen, Licht in harten Stufen
    cx = BX - 6
    ICEF = ['#0a1e36', '#123a5a', '#1c5a80', '#2c80a8', '#4aa8d0', '#88d4ef', '#dcf8ff']
    for x in range(cx - 64, cx + 65):
        u = abs(x - cx) / 64
        top = int(8 + 10 * u * u + 3 * math.sin(x * 0.7))
        for y in range(top, 176):
            k = 1 - u * 0.85 - abs(y - 92) / 260
            stripe = math.sin(x * 0.55 + math.sin(x * 0.13) * 2) * 0.5 + 0.5
            v = k * 0.75 + stripe * 0.35 + (BAYER4[y % 4, x % 4] - 0.5) * 0.12
            lv = 6 if v > 0.95 else 5 if v > 0.82 else 4 if v > 0.68 else 3 if v > 0.52 else 2 if v > 0.36 else 1 if v > 0.2 else 0
            if u > 0.92 and BAYER4[y % 4, x % 4] < (u - 0.92) * 12: continue
            F[y, x] = (*hexc(ICEF[max(0, lv - 2)]), 255)
            if lv >= 3: G[y, x] = (*hexc(ICEF[lv]), 255)
    # Deckenzapfen (fern, klein)
    for x0 in range(3, SW, 9):
        L_ = 4 + int(hash2(x0, 3, 1) * 14)
        for y in range(0, L_):
            w = max(0, int((1 - y / L_) * 2.5))
            for dx in range(-w, w + 1):
                F[y, x0 + dx] = (*hexc(['#1b3450', '#2c5a7a', '#4a86a8'][min(2, 1 + (dx > 0))]), 255)
    L['fern'] = dict(img=F, f=0.15)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=3.8, lo=0.55, steps=3))
    # Mitte: Eissäulen (Stalagmiten), Kristallgruppen, hinterer Boden mit Schnee
    M = np.zeros((SH, SW, 4), np.uint8); MG = np.zeros((SH, SW, 4), np.uint8)
    bf, bs, _ = floor(166, SH, [3, 3, 4, 4, 5, 6, 7, 8, 9], ['#04080f', '#0b1626', '#122236', '#1a2f48', '#26405c'], vx=BX, vy=40, tile=28, seed=41, chips=0.12)
    stamp(M, bf)
    def stalag(x0, w, top, bot=170):
        for y in range(top, bot):
            k = (y - top) / (bot - top)
            hw = max(1, int(w * (0.3 + 0.7 * k ** 0.6)))
            for x in range(x0 - hw, x0 + hw + 1):
                u = (x - x0 + hw) / (2 * hw + 1)
                t = 1 if u < 0.25 else 2 if u < 0.6 else 3 if u < 0.85 else 2
                M[y, x] = (*hexc(['#060c16', '#0f1e32', '#1a3350', '#2c4e70'][t]), 255)
    def stalact(x0, w, L_):
        for y in range(0, L_):
            k = 1 - y / L_
            hw = max(0, int(w * k ** 0.8))
            for x in range(x0 - hw, x0 + hw + 1):
                u = (x - x0 + hw) / (2 * hw + 1)
                t = 1 if u < 0.3 else 2 if u < 0.7 else 3
                M[y, x] = (*hexc(['#060c16', '#1a3350', '#2c5a7a', '#4a86a8'][t]), 255)
    for x0, w, top in ((40, 9, 96), (176, 7, 118), (520, 10, 90)):
        stalag(x0, w, top)
    for x0, w, L_ in ((90, 6, 50), (150, 4, 34), (240, 7, 58), (300, 4, 30), (470, 6, 44), (548, 5, 36)):
        stalact(x0, w, L_)
    # Kristallgruppen (leuchten)
    def crystals(cx, by, n, seed):
        r = np.random.default_rng(seed)
        for i in range(n):
            h = int(r.integers(8, 22)); a = r.uniform(-0.5, 0.5); bx = cx + int(r.integers(-8, 9))
            for k in range(h):
                x = int(round(bx + a * k)); y = by - k
                w = max(0, int(2.5 * (1 - k / h) + 0.5))
                for dx in range(-w, w + 1):
                    c = ['#25649c', '#3f9ccf', '#88d4ef'][min(2, max(0, dx + 1))]
                    M[y, x + dx] = (*hexc(c), 255)
                    if dx >= 0 and k > h * 0.3: MG[y, x + dx] = (*hexc(FROST[2 + (dx > 0)]), 255)
    crystals(96, 168, 5, 1); crystals(262, 168, 4, 2); crystals(500, 168, 6, 3)
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=3.1, lo=0.5, steps=3))
    # Boden: Eis über Fels, Reiffugen, Schneeflecken
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#04080f', '#0f1c2e', '#172840', '#203654', '#2c4868'], vx=BX - 30, vy=-40, tile=32, seed=43, chips=0.1)
    for x in range(SW): Bd[FY - 4, x] = (*hexc('#6a94aa' if hash2(x, 1, 2) > 0.25 else '#40687e'), 255)
    BG = np.zeros((SH, SW, 4), np.uint8)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        Bd[y, x] = (*hexc('#0a1830'), 255)
    # Schneeflecken
    for y in range(FY - 3, SH):
        for x in range(SW):
            n = hash2(x // 5, y // 3, 9)
            if n > 0.86 and not seam[y, x]:
                Bd[y, x] = (*hexc('#9cc2d2' if n > 0.94 else '#6a94aa'), 255)
    for dy, hw, k in [(-3, 70, 0.65), (-2, 90, 0.6), (-1, 96, 0.6), (0, 90, 0.65), (1, 70, 0.75)]:
        y = FY + dy
        for x in range(BX - hw - 40, BX + hw - 40):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0)
    # Vordergrund: Eiskristalle links, verschneiter Fels rechts
    V = Buf()
    vm = V.poly([(-4, SH), (-4, 186), (8, 170), (12, 182), (18, 160), (22, 180), (30, 176), (36, SH)])
    vm |= V.poly([(500, SH), (510, 198), (526, 190), (544, 192), (558, 198), (564, SH)])
    V.a[vm] = (*hexc('#03050a'), 255)
    e = outline_mask(~vm) & vm
    V.a[e] = (*hexc('#1c3a58'), 255)
    top_e = e & ~np.roll(vm, 1, axis=0)
    V.a[top_e] = (*hexc('#9cc2d2'), 255)
    L['vorn'] = dict(img=V.a, f=1.35)
    return L, seam


def icicle(h=30, w=9):
    im = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        k = 1 - y / h
        hw = (w / 2) * k ** 0.7
        for x in range(w):
            u = (x + 0.5 - w / 2) / max(0.5, hw)
            if abs(u) > 1: continue
            t = 1 if u < -0.4 else 2 if u < 0.2 else 3 if u < 0.6 else 4
            if y < 3: t = 3
            im[y, x] = (*hexc(MAT['crys'][t]), 255)
    a = im[:, :, 3] > 0
    o = outline_mask(a)
    im[o] = (*hexc('#03050a'), 255)
    return im


def shatter(n=5, w=31, h=18):
    out = []
    rng = np.random.default_rng(2)
    shards = [(rng.uniform(-1, 1) * 55, -rng.uniform(30, 90), rng.integers(1, 4)) for _ in range(22)]
    for k in range(n):
        im = np.zeros((h, w, 4), np.uint8)
        t = (k + 1) * 0.05
        cx, cy = w // 2, h - 2
        for vx, vy, s in shards:
            x = int(cx + vx * t); y = int(cy + vy * t + 220 * t * t)
            if 0 <= y < h and 0 <= x < w:
                for dx in range(s):
                    if x + dx < w: im[y, x + dx] = (*hexc(['#dcf8ff', '#88d4ef', '#3f9ccf'][min(2, k // 2)]), 255)
        # Eiskrone: Splitter stehen kurz aus dem Boden, werden in Stufen kürzer
        if k < 4:
            for j, (ox, hh) in enumerate(((-9, 7), (-5, 11), (0, 15), (4, 10), (8, 6), (-2, 9), (6, 12))):
                L = max(0, hh - k * 4)
                for yy in range(L):
                    y = cy - yy
                    wd = 1 if yy > L * 0.5 else 2
                    for dx in range(wd):
                        x = cx + ox + dx + (yy // 4 if ox > 0 else -(yy // 4) if ox < 0 else 0)
                        if 0 <= x < w and 0 <= y < h:
                            im[y, x] = (*hexc('#ffffff' if yy > L - 3 else '#9aeefc' if dx == 0 else '#34b8e4'), 255)
        # Ring
        r = 3 + k * 2.4
        for i in range(24):
            a = math.pi * i / 23
            x, y = int(cx + r * math.cos(a) * 1.3), int(cy - r * math.sin(a) * 0.5)
            if 0 <= x < w and 0 <= y < h and (k < 3 or i % 2): im[y, x] = (*hexc(FROST[max(1, 4 - k)]), 255)
        out.append(im)
    return out


def build():
    R = POSEN['ruhe']
    idle = []
    N = 10
    for i in range(N):
        ph = i / N
        p = dict(R, kopf=(R['kopf'][0] + round(1.5 * math.sin(ph * 2 * math.pi)), R['kopf'][1] + round(2 * math.sin(ph * 2 * math.pi + 1))),
                 nb=1.5 * math.sin(ph * 2 * math.pi), herz=3 + (1 if i in (2, 3, 4) else 0))
        idle.append(figure(p, ph))
    MOM = [('zug', 160), ('zug', 120), ('h1', 110), ('aus', 120), ('aus', 900, 'hit'), ('aus2', 500), ('ab', 160), ('zug', 200)]
    frames, hit_idx = [], 0
    for st in MOM:
        pn, ms = st[0], st[1]
        if len(st) > 2 and st[2] == 'hit': hit_idx = len(frames)
        n = max(1, round(ms / 150)) if ms > 300 else 1
        for k in range(n):
            frames.append((figure(dict(POSEN[pn], jaw=POSEN[pn].get('jaw', 0) - (0.15 if k % 2 else 0)), (len(frames) % N) / N), round(ms / n)))
    Ld, seam = scene()
    fx = {'zapfen': icicle(40, 11), 'splitter': strip(shatter(6, 41, 24))}
    B, imp = finish('skalvyr', FX, FY0, BX, [('koerper', idle, dict(n=N, ms=160))], frames, hit_idx, FX + 40, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#ffffff', '#9aeefc', '#34b8e4'], 'fokus': [300, BX - 40], 'teilchen': 'schnee', 'dichte': 6, 'dauer': 9.5, 'start': 2.2})
    # Eiszapfen: Bodenmarke wächst (vor ms), dann Fall und Splitter; Reif läuft durch die Fugen vom ersten Einschlag
    rng = np.random.default_rng(7)
    xs = [300, 248, 202, 156, 112, 70, 30, 186, 270, 92]
    ev = []
    for i, x in enumerate(xs):
        at = 180 + i * 150
        ev.append(dict(k='zapfen', r='zapfen', r2='splitter', at=at, x=int(x), y=FY, vor=650, w=11, h=40, n=6, ms=60, sw=41, sh=24, mr=9 + (i % 3) * 2, z='vorn'))
    wave, wm = seam_wave(seam, 300, FY - 3, v=220, ms=70, pal=FROST, direction=0, maxd=320, peak=lambda d: 3 if d < 90 else 2, ages=(0.12, 0.35, 0.7, 1.1))
    fx['welle'] = wave
    ev.append(dict(k='bild', r='welle', at=180 + 650, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'))
    # Brüllen: Reif-Atem aus dem Maul steigt auf (Funken nach oben)
    B['meta']['ereignisse'] = ev
    B['meta']['warn'] = None
    return B
