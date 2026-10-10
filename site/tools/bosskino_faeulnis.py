# Bosskino: Mutter Fäulnis (Stufe 32) im Sporenschlund.
# Figur nach rot_mother.js: aufgeblähter, geäderter Pilzleib auf einem Teppich aus Wurzelsträngen, leuchtende
# Sporensäcke, kleine Pilze auf dem Rücken; vorn ein gekrümmter, fahler Oberkörper mit schmalem Schädel unter einem
# breiten Hut (Lamellen, Warzen, Hyphenfäden); zwei lange Rankenarme mit Dornen und Wurzelkrallen.
# Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Attacke „Wurzelbruch“: sie reißt beide Ranken hoch und rammt sie in den Boden; Wurzeldornen brechen nacheinander aus
# den Fugen, aus jedem Bruch quillt eine Sporenwolke in Pixelstufen, Gift läuft grün durch die Fugen.
import math
import numpy as np
from bosskino import (Fig, MAT, flip, hash2, hexc, SPORE, Buf, bands, BAYER4, seam_wave, strip, outline_mask,
                      floor, stamp, finish, SW, SH, FY, ik, rot, lerp)

MAT.update({
    'flesh': ['#140c16', '#3c2240', '#583656', '#7a5272', '#a07a90'],
    'fleshd': ['#0c060e', '#261628', '#3c2240', '#583656', '#7a5272'],
    'skin': ['#0e120e', '#4a5c48', '#6a8062', '#94a888', '#c4d2b0'],
    'arm': ['#0e120e', '#304032', '#4a5c48', '#6a8062', '#94a888'],
    'armd': ['#080c08', '#1c261e', '#304032', '#4a5c48', '#6a8062'],
    'face': ['#181a14', '#58604a', '#848c70', '#b0b698', '#dadcc0'],
    'cap': ['#0e070f', '#361634', '#522046', '#742e54', '#9a4660'],
    'gill': ['#120c16', '#3e3048', '#5c4a66', '#84708e', '#b4a2ba'],
    'bark': ['#0c0a08', '#2c2618', '#443a24', '#605234', '#847450'],
    'barkd': ['#080604', '#1a1610', '#2c2618', '#443a24', '#605234'],
    'sac': ['#103016', '#2e7c30', '#5aae44', '#a2de6c', '#e6ffbe'],
    'vein': ['#2e0e52', '#6224b0', '#a458f4', '#dea8ff', '#fff2ff'],
    'spot': ['#3a3428', '#6a5a46', '#a4927a', '#d6c8a6', '#f4ecd4'],
    'thorn': ['#1a1610', '#3a3428', '#6a604a', '#a0947a', '#d4caac'],
    'eye': SPORE,
    'void': ['#050307'] * 5,
})
RIM_F = {'flesh': '#c8a8b2', 'skin': '#dfe8c8', 'arm': '#b4c8a0', 'face': '#f4f4e0', 'cap': '#c2706c', 'bark': '#a09060', 'sac': '#f4ffd8'}
RIM_B = {'flesh': '#a458f4', 'fleshd': '#6224b0', 'cap': '#a458f4', 'bark': '#3a682a', 'barkd': '#264a20', 'skin': '#5ad040',
         'arm': '#5ad040', 'armd': '#22882e', 'gill': '#a458f4'}

W, H, FX, FY0 = 330, 230, 200, 222
S = 1.0
GROUND = FY0 + 1
def new(): return Fig(W, H, FX, FY0, S)


def tendril(f, pts, w0, w1, mat, shade='cyl'):
    """Strang aus Segmenten (Breite w0 -> w1), Teile ohne Innenkanten untereinander."""
    n = len(pts) - 1
    m = np.zeros((f.H, f.W), bool)
    for i in range(n):
        wa = w0 + (w1 - w0) * i / n; wb = w0 + (w1 - w0) * (i + 1) / n
        m |= f.seg(pts[i], pts[i + 1], wa, wb) | f.ell(pts[i + 1][0], pts[i + 1][1], wb / 2, wb / 2)
    f.put(m, mat, shade=shade)
    return m


def curve(a, b, bend, n=5):
    """Bogen von a nach b, Mitte um bend quer versetzt."""
    dx, dh = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dh) or 1
    nx, nh = -dh / L, dx / L
    return [(a[0] + dx * k / n + nx * bend * math.sin(math.pi * k / n), a[1] + dh * k / n + nh * bend * math.sin(math.pi * k / n)) for k in range(n + 1)]


def thorns(f, pts, every=2, size=4, side=1, mat='thorn'):
    for i in range(1, len(pts) - 1, every):
        (x0, h0), (x1, h1) = pts[i - 1], pts[i + 1]
        dx, dh = x1 - x0, h1 - h0; L = math.hypot(dx, dh) or 1
        nx, nh = -dh / L * side, dx / L * side
        x, h = pts[i]
        base = 2.6
        f.put(f.poly([(x - dx / L * base + nx * 2, h - dh / L * base + nh * 2), (x + nx * (size + 2) - dx / L * 2.5, h + nh * (size + 2) - dh / L * 2.5),
                      (x + dx / L * base + nx * 2, h + dh / L * base + nh * 2)]), mat, light=(1, -1), hi=1, mid=2, flat=3)


def arm(f, sh, hand, back=False, claw=0.0):
    """Rankenarm: Schulter -> Ellbogen (IK) -> Hand, Wurzelkrallen; Dornen außen."""
    mat = 'armd' if back else 'arm'
    el = ik(sh, hand, 46, 50, bend=1)
    up = curve(sh, el, 3, 3); lo = curve(el, hand, -3, 4)
    pts = up + lo[1:]
    tendril(f, pts, 13 if not back else 11, 6, mat)
    thorns(f, pts, every=2, size=4, side=1, mat='thorn' if not back else 'barkd')
    # Wurzelkrallen: drei Finger, gespreizt in Laufrichtung des Unterarms
    dx, dh = hand[0] - el[0], hand[1] - el[1]; L = math.hypot(dx, dh) or 1
    a0 = math.atan2(dh, dx)
    for k, da in enumerate((-0.7, 0.0, 0.7)):
        a = a0 + da * (1 - 0.5 * claw)
        L1 = 15 - abs(da) * 4
        mid = (hand[0] + math.cos(a) * L1 * 0.55, hand[1] + math.sin(a) * L1 * 0.55)
        tip = (mid[0] + math.cos(a + da * 0.5 + 0.4) * L1 * 0.5, mid[1] + math.sin(a + da * 0.5 + 0.4) * L1 * 0.5)
        tendril(f, [hand, mid, tip], 4, 1.4, 'barkd' if back else 'bark')
    return el


def head(f, c, lean, jaw=0.0, eye=4, hy=0.0):
    """Schmaler Schädel unter breitem Hut. c: Schädelmitte. lean dreht Hut und Gesicht."""
    hx, hh = c
    sc = 1.25
    R = lambda x, h: rot((hx + x * sc, hh + h * sc), (hx, hh), -lean * 0.8)
    # Hyphenfäden unter der Hutkante (hinten)
    for i, x in enumerate((-34, -26, -18, 22, 30)):
        L_ = 8 + (i * 5) % 9
        a = R(x, 2); b = (a[0] + hy * 1.5, a[1] - L_)
        f.put(f.seg(a, b, 1.2, 1.0), 'gill', fixed=3 if i % 2 else 2, line=False)
    # Schädel
    sk = f.poly([R(-7, -14), R(-9, 2), R(-6, 10), R(6, 10), R(10, 0), R(9, -8), R(4, -16), R(-2, -17)])
    f.put(sk, 'face', shade='dome', r=4, dcuts=(0.25, 0.55, 0.85))
    # Augen (Leuchten), Wangenschatten, Maul
    for ex, eh in ((5, 1), (-1, 1)):
        X, Y = f.at(*R(ex, eh))
        for dx, dy, t in ((0, 0, eye), (1, 0, max(1, eye - 1)), (0, 1, max(1, eye - 2))):
            f.px(X + dx, Y + dy, 'eye', t)
    if jaw > 0.1:
        f.put(f.poly([R(-3, -6), R(7, -6), R(6, -6 - 7 * jaw), R(-2, -6 - 8 * jaw)]), 'void', fixed=0, line=False)
    else:
        f.put(f.seg(R(-2, -8), R(6, -7), 1.2, 1.2), 'void', fixed=0, line=False)
    # Lamellen unter dem Hut
    gl = f.poly([R(-36, 4), R(34, 3), R(30, 8), R(-32, 9)])
    f.put(gl, 'gill', fixed=2)
    ys, xs = np.nonzero(gl)
    for y, x in zip(ys, xs):
        if x % 3 == 0: f.tone[y, x] = 3
        elif x % 3 == 2: f.tone[y, x] = 1
    # Hut: breite, flache Kuppel mit welliger Kante
    rim = [R(38, 4), R(30, 5), R(20, 3), R(8, 5), R(-6, 4), R(-20, 5), R(-32, 3), R(-40, 5)]
    top = [R(-36, 14), R(-24, 24), R(-8, 31), R(8, 32), R(22, 26), R(34, 16)]
    cap = f.poly(rim + top)
    f.put(cap, 'cap', shade='dome', r=7, dcuts=(0.28, 0.58, 0.84))
    # Warzen
    for x, h_ in ((-22, 18), (-6, 26), (10, 25), (24, 15), (-30, 10), (2, 17), (16, 11)):
        X, Y = f.at(*R(x, h_))
        for dx, dy, t in ((0, 0, 3), (1, 0, 4), (0, 1, 2), (1, 1, 2)):
            f.px(X + dx, Y + dy, 'spot', t)
    return R(8, -6)


def figure(p, ph=0.0):
    f = new()
    t = ph * 2 * math.pi
    br = p.get('breath', 0.0)
    lean = p.get('lean', 0)
    hip = (6, 38)
    Rt = lambda q: rot(q, hip, -lean)
    chest = Rt((22, 86)); neck = Rt((30, 114)); hc = Rt((36, 132))
    shF, shB = Rt((26, 100)), Rt((14, 104))
    hy = p.get('hy', 0.0)
    # hinterer Arm
    arm(f, shB, p['hb'], back=True, claw=p.get('claw', 0))
    # Wurzelteppich hinten
    for i, (x0, x1, b) in enumerate(((-110, -164, 6), (-80, -140, -5), (-40, -96, 4), (-20, 30, -4), (-120, -150, 3))):
        tendril(f, curve((x0, 10), (x1, 0), b, 4), 8, 2, 'barkd')
    # Leib
    body = f.ell(-52, 58 + br * 0.6, 70 + br, 50 + br) | f.ell(-104, 40, 34 + br, 32) | f.ell(-24, 46 + br * 0.4, 34, 36 + br) | f.ell(-70, 92 + br, 36, 26)
    cut = f.at(0, 8)[1]; body[cut:] = False
    f.put(body, 'flesh', shade='dome', r=18, dcuts=(0.3, 0.6, 0.86))
    # Fleckung: dunkle Flecken und helle Pusteln im Raster
    for y, x in zip(*np.nonzero(body)):
        n = hash2(x // 4, y // 3, 5)
        if n > 0.82 and f.tone[y, x] > 1 and (x + y) % 2 == 0: f.tone[y, x] -= 1
        elif n < 0.05 and f.tone[y, x] < 4: f.tone[y, x] += 1
    # Adern (violett, glimmen)
    for k, path in enumerate((((-100, 14), (-104, 48), (-92, 80), (-96, 98)), ((-66, 10), (-60, 44), (-70, 76), (-62, 104)),
                              ((-30, 12), (-34, 40), (-22, 66), (-30, 92)), ((-118, 30), (-112, 56), (-120, 76)))):
        for a, b in zip(path, path[1:]):
            f.put(f.seg(a, b, 1.6, 1.3), 'vein', fixed=1 + (p.get('vein', 0) + k) % 2, line=False)
    # Sporensäcke (Leuchten, pulsieren mit dem Atem)
    sl = p.get('sac', 0)
    for (x, h_, r_) in ((-88, 86, 15), (-56, 104, 11), (-118, 58, 10), (-26, 92, 8), (-74, 50, 7)):
        rr = r_ + (1 if sl > 0 and r_ > 9 else 0)
        m = f.ell(x, h_, rr, rr * 0.9)
        f.put(m, 'sac', shade='dome', r=max(2, rr * 0.5), dcuts=(0.2 - sl * 0.08, 0.45 - sl * 0.08, 0.75 - sl * 0.05))
        X, Y = f.at(x + rr * 0.3, h_ + rr * 0.35); f.px(X, Y, 'sac', 4); f.px(X + 1, Y, 'sac', 4)
    # Pilze auf dem Rücken
    for (x, h_, sh_, cw) in ((-112, 92, 10, 9), (-98, 104, 14, 12), (-40, 104, 9, 8), (-128, 74, 7, 7)):
        f.put(f.seg((x, h_ - 4), (x + 1, h_ + sh_), 3.2, 2.6), 'face', shade='cyl')
        f.put(f.poly([(x - cw, h_ + sh_), (x - cw * 0.6, h_ + sh_ + cw * 0.55), (x + cw * 0.5, h_ + sh_ + cw * 0.6), (x + cw, h_ + sh_ - 1)]), 'cap', shade='dome', r=2)
    # vordere Wurzeln über dem Leibrand
    for (x0, x1, b) in ((-6, 46, 4), (-60, -20, -3), (-96, -128, 3)):
        tendril(f, curve((x0, 12), (x1, 0), b, 4), 7, 2, 'bark')
    # Oberkörper: gekrümmt, fahl, Rippen
    tp = curve(Rt((-6, 38)), neck, -9, 8)
    tm = np.zeros((f.H, f.W), bool)
    for i in range(len(tp) - 1):
        k0, k1 = i / (len(tp) - 1), (i + 1) / (len(tp) - 1)
        wa = 40 - 22 * k0 + 6 * math.sin(math.pi * k0); wb = 40 - 22 * k1 + 6 * math.sin(math.pi * k1)
        tm |= f.seg(tp[i], tp[i + 1], wa, wb) | f.ell(tp[i + 1][0], tp[i + 1][1], wb / 2, wb / 2)
    f.put(tm, 'skin', shade='dome', r=8, dcuts=(0.28, 0.58, 0.85))
    for k in range(3):
        a = Rt((10 + k * 3, 66 + k * 9)); b = Rt((22 + k * 3, 70 + k * 9))
        f.put(f.seg(a, b, 1.2, 1.0), 'skin', fixed=1, line=False)
    head(f, hc, lean, jaw=p.get('jaw', 0), eye=p.get('eye', 4), hy=hy)
    arm(f, shF, p['hf'], claw=p.get('claw', 0))
    im = f.render(rim=RIM_F, rim_back=RIM_B)
    im[GROUND:] = 0
    return im


POSEN = {
    'ruhe': dict(lean=4, hf=(70, 30), hb=(56, 44)),
    'zug': dict(lean=-8, hf=(46, 150), hb=(28, 150), jaw=0.6, claw=0.6),
    'h1': dict(lean=-14, hf=(36, 178), hb=(18, 172), jaw=1.0, eye=4, claw=1.0, sac=1),
    'hieb': dict(lean=18, hf=(112, 64), hb=(98, 76), jaw=1.0, claw=0.5),
    'ein': dict(lean=30, hf=(118, 2), hb=(104, 4), breath=-2, jaw=0.6, sac=1, vein=1),
    'ein2': dict(lean=28, hf=(118, 2), hb=(104, 4), breath=-1, jaw=0.3, sac=1),
    'auf': dict(lean=12, hf=(88, 18), hb=(74, 26)),
}


# ------------------------------------------------------------------------------------------- Sporenschlund
BX = 372
VIO = ['#2e0e52', '#6224b0', '#a458f4', '#dea8ff', '#fff2ff']


def setp(A, x, y, c):
    x, y = int(x), int(y)
    if 0 <= x < A.shape[1] and 0 <= y < A.shape[0]: A[y, x] = (*hexc(c), 255) if isinstance(c, str) else c


def mushroom(A, G, x0, base, sh, sw, cw, ch, cols, gl, glow_cols, seed=0):
    """Pilz in Seitenansicht: Stiel (sw breit, sh hoch), Hut (cw halbe Breite, ch hoch), Lamellen unten leuchtend."""
    r = np.random.default_rng(seed)
    bend = r.uniform(-0.12, 0.12)
    for y in range(base - sh, base + 1):
        k = (base - y) / max(1, sh)
        cx = x0 + bend * (base - y) ** 1.2 * 0.3
        hw = sw * (1.0 - 0.25 * k) / 2
        for x in range(int(cx - hw), int(cx + hw) + 1):
            u = (x - (cx - hw)) / max(1, 2 * hw)
            setp(A, x, y, cols[1 if u < 0.3 else 2 if u < 0.75 else 3])
    tx = x0 + bend * sh ** 1.2 * 0.3; ty = base - sh
    for y in range(int(ty - ch), int(ty + 3)):
        v = (ty - y) / ch      # 1 oben .. 0 Kante
        if v >= 0:
            hw = cw * math.sqrt(max(0, 1 - v * v)) ** 0.8
        else:
            hw = cw * (1 + v * 0.6)
        for x in range(int(tx - hw), int(tx + hw) + 1):
            u = (x - tx) / max(1, hw)
            if v < 0:   # Lamellen
                c = glow_cols[1] if (x % 3 == 0) else glow_cols[0]
                setp(A, x, y, c)
                if gl and x % 3 == 0: setp(G, x, y, glow_cols[2] if v > -0.3 else glow_cols[1])
                continue
            lv = 0.55 * (u * 0.6 + 0.4) + v * 0.5 + (BAYER4[y % 4, x % 4] - 0.5) * 0.25
            setp(A, x, y, cols[4] if lv > 0.62 else cols[3] if lv > 0.3 else cols[2] if lv > 0.0 else cols[1])
        # Kante dunkel
        setp(A, int(tx - hw) - 0, y, cols[0]); setp(A, int(tx + hw), y, cols[0])
    for y in range(int(ty - ch), int(ty)):
        pass
    # leuchtende Tupfen
    if gl:
        for i in range(int(cw // 4)):
            x = int(tx + r.uniform(-0.7, 0.7) * cw); y = int(ty - r.uniform(0.2, 0.8) * ch)
            setp(A, x, y, glow_cols[3]); setp(G, x, y, glow_cols[3]); setp(G, x + 1, y, glow_cols[2])


def scene():
    L = {}
    F = bands(SH, SW, 0, 180, ['#050208', '#08040e', '#0c0614', '#10081a', '#160c20', '#1a1024'])
    G = np.zeros((SH, SW, 4), np.uint8)
    rng = np.random.default_rng(5)
    # Höhlendecke: hängende Hyphenfäden und Wurzelvorhänge
    for x in range(0, SW, 3):
        L_ = int(6 + hash2(x, 1, 4) * 40 + (30 if hash2(x // 9, 2, 4) > 0.7 else 0))
        for y in range(L_):
            if hash2(x, y // 3, 6) > 0.85: continue
            setp(F, x, y, '#1c1228' if y < L_ - 3 else '#2a1a3a')
        if hash2(x, 3, 1) > 0.8:
            setp(G, x, L_, VIO[2]); setp(F, x, L_, VIO[2])
    # Riesenpilze fern (Silhouetten, Lamellen glimmen violett)
    FC = ['#0a0612', '#140c20', '#1c1230', '#26183c', '#302048']
    for x0, base, sh, sw, cw, ch, sd in ((40, 176, 120, 14, 46, 26, 1), (150, 176, 84, 10, 30, 18, 2), (540, 176, 136, 16, 52, 28, 3), (250, 176, 60, 8, 22, 12, 4)):
        mushroom(F, G, x0, base, sh, sw, cw, ch, FC, True, ['#1a0e2c', '#3a1e60', VIO[1], VIO[2]], sd)
    # Brennpunkt: großer Leuchtpilz hinter der Mutter (grün), mit Sporenschein in Stufen
    cx, cy = BX - 30, 64
    for y in range(0, 176):
        for x in range(cx - 110, cx + 111):
            if not (0 <= x < SW): continue
            d = math.hypot((x - cx) / 1.25, y - cy)
            lv = 3 if d < 34 else 2 if d < 62 else 1 if d < 92 else 0
            if lv == 0: continue
            if lv == 1 and BAYER4[y % 4, x % 4] > 0.5: continue
            c = ['#120a1c', '#16202a', '#1a3026', '#1e4028'][lv]
            r_, g_, b_, a_ = F[y, x]
            if a_ and int(r_) + int(g_) + int(b_) < 3 * 0x30: F[y, x] = (*hexc(c), 255)
    mushroom(F, G, cx, 176, 104, 18, 64, 34, ['#0c140c', '#183018', '#264a20', '#3a682a', '#5a903a'], True, ['#0e2a12', '#22882e', '#5ad040', '#b4f478'], 7)
    for i in range(70):
        a = rng.uniform(0, 2 * math.pi); r = rng.uniform(20, 90)
        x, y = int(cx + math.cos(a) * r * 1.3), int(cy + math.sin(a) * r * 0.8)
        if 0 <= x < SW and 0 <= y < 170:
            c = SPORE[2] if r < 50 else SPORE[1]
            setp(F, x, y, c); setp(G, x, y, SPORE[3] if r < 40 else c)
    L['fern'] = dict(img=F, f=0.15)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=3.4, lo=0.45, steps=3))
    # Mitte: Pilzgruppen, Wurzelbögen, hinterer Boden
    M = np.zeros((SH, SW, 4), np.uint8); MG = np.zeros((SH, SW, 4), np.uint8)
    bf, _, _ = floor(166, SH, [3, 3, 4, 4, 5, 6, 7, 8, 9], ['#06040a', '#0e0a14', '#16101e', '#1e1628', '#281e34'], vx=BX, vy=40, tile=30, seed=31, chips=0.1)
    stamp(M, bf)
    # Wurzelbögen über die Wand
    for x0, x1, top, wd in ((-20, 120, 110, 5), (90, 230, 130, 4), (430, 600, 100, 6)):
        for i in range(80):
            k = i / 79
            x = x0 + (x1 - x0) * k; y = 170 - (170 - top) * math.sin(math.pi * k)
            for dy in range(-wd // 2, wd // 2 + 1):
                c = '#2c2618' if dy < 0 else '#1a1610' if dy > 0 else '#443a24'
                setp(M, x, y + dy, c); setp(M, x + 1, y + dy, c)
    MC = ['#0e070f', '#361634', '#522046', '#742e54', '#9a4660']
    GC = ['#0c140c', '#183018', '#264a20', '#3a682a', '#5a903a']
    for x0, sh, sw, cw, ch, cols, sd in ((84, 26, 5, 14, 8, MC, 11), (100, 16, 4, 9, 5, GC, 12), (196, 22, 5, 12, 7, GC, 13), (212, 12, 3, 7, 4, MC, 14),
                                        (480, 30, 6, 16, 9, MC, 15), (500, 18, 4, 10, 6, GC, 16), (14, 18, 4, 10, 6, GC, 17)):
        gc = ['#0e2a12', '#22882e', '#5ad040', '#b4f478'] if cols is GC else ['#1a0e2c', '#3a1e60', VIO[1], VIO[2]]
        mushroom(M, MG, x0, 170, sh, sw, cw, ch, cols, True, gc, sd)
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=2.9, lo=0.4, steps=3))
    # Boden: Erde mit Moos, Fugen für das Gift, glimmende Schleimpfützen
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#06040a', '#120e12', '#1c1618', '#26201e', '#322a24'], vx=BX - 30, vy=-40, tile=30, seed=37, chips=0.1)
    for x in range(SW): Bd[FY - 4, x] = (*hexc('#3a682a' if hash2(x, 1, 2) > 0.35 else '#264a20'), 255)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        Bd[y, x] = (*hexc('#0a0610'), 255)
    BG = np.zeros((SH, SW, 4), np.uint8)
    for y in range(FY - 3, SH):
        for x in range(SW):
            n = hash2(x // 6, y // 3, 7)
            if n > 0.88 and not seam[y, x]:
                Bd[y, x] = (*hexc('#264a20' if n < 0.95 else '#3a682a'), 255)
    for px, py, rw in ((120, FY + 6, 12), (240, FY + 14, 9), (60, FY + 18, 14), (470, FY + 10, 10)):
        for y in range(py - 2, py + 3):
            for x in range(px - rw, px + rw + 1):
                if ((x - px) / rw) ** 2 + ((y - py) / 2.5) ** 2 <= 1:
                    c = '#22882e' if abs(x - px) < rw * 0.6 else '#0e4a1c'
                    setp(Bd, x, y, c); setp(BG, x, y, '#5ad040' if abs(x - px) < rw * 0.3 and y == py else c)
    for dy, hw, k in [(-3, 70, 0.65), (-2, 90, 0.6), (-1, 96, 0.6), (0, 90, 0.65), (1, 70, 0.75)]:
        y = FY + dy
        for x in range(BX - hw - 50, BX + hw - 50):
            if 0 <= x < SW:
                r, g, b_, a = Bd[y, x]
                if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=2.6, lo=0.4, steps=3))
    # Vordergrund: Pilzsilhouetten und Wurzeln
    V = np.zeros((SH, SW, 4), np.uint8); VG = np.zeros((SH, SW, 4), np.uint8)
    mushroom(V, VG, 14, SH + 4, 34, 7, 22, 12, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#1a0e2c', '#3a1e60', VIO[1]], 21)
    mushroom(V, VG, 540, SH + 4, 22, 6, 16, 9, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#1a0e2c', '#3a1e60', VIO[1]], 22)
    stamp(V, VG)
    L['vorn'] = dict(img=V, f=1.35)
    return L, seam


# ------------------------------------------------------------------------------------------- Wirkungen
def dorn(h=40, w=22, n=8, seed=0):
    """Wurzeldorn bricht aus dem Boden: Erdhügel, Dorn wächst in Stufen, hält, bröckelt zurück. Fuß unten Mitte."""
    r = np.random.default_rng(seed)
    grow = [0.0, 0.35, 0.8, 1.0, 1.0, 0.95, 0.55, 0.2][:n]
    side = [(r.uniform(-7, -3), r.uniform(0.4, 0.6)), (r.uniform(3, 7), r.uniform(0.35, 0.55))]
    out = []
    cx = w // 2
    BK = MAT['bark']; TH = MAT['thorn']
    for k in range(n):
        im = np.zeros((h, w, 4), np.uint8)
        g = grow[k]
        def spike(bx, L_, wd, lean):
            for j in range(int(L_)):
                y = h - 1 - j
                hw = wd * (1 - j / L_) ** 0.9
                xc = bx + lean * j
                for x in range(int(round(xc - hw)), int(round(xc + hw)) + 1):
                    if not (0 <= x < w and 0 <= y < h): continue
                    u = (x - (xc - hw)) / max(1, 2 * hw)
                    tip = j > L_ * 0.72
                    c = (TH[4] if u > 0.6 else TH[3]) if tip else (BK[1] if u < 0.3 else BK[2] if u < 0.7 else BK[3])
                    if k >= 6 and hash2(x, y, k) > 0.6: continue
                    im[y, x] = (*hexc(c), 255)
                # grüne Giftspitze
                if j > L_ - 3 and k in (2, 3, 4) and 0 <= int(xc) < w: im[y, int(round(xc))] = (*hexc(SPORE[3]), 255)
        if g > 0:
            spike(cx, (h - 4) * g, w * 0.2, 0.08)
            for dx, kk in side: spike(cx + dx, (h - 4) * g * kk, 2.6, dx * 0.03)
        # Erdbrocken am Fuß
        hb = 2 + (2 if k in (1, 2) else 1)
        for x in range(cx - 8, cx + 9):
            for y in range(h - hb, h):
                if abs(x - cx) < 8 - (h - 1 - y) * 2 and hash2(x, y, 3) > 0.25:
                    im[y, x] = (*hexc('#26201e' if y > h - 2 else '#3a682a'), 255)
        if k == 1:   # Bruch: Erdspritzer
            for i in range(10):
                x, y = int(cx + r.uniform(-10, 10)), int(h - 4 - r.uniform(0, 10))
                if 0 <= x < w and 0 <= y < h: im[y, x] = (*hexc('#443a24'), 255)
        a = im[:, :, 3] > 0
        im[outline_mask(a) & ~a] = 0
        out.append(im)
    return out


def wolke(w=56, h=44, n=10, seed=0):
    """Sporenwolke quillt in Pixelstufen: Kugeln wachsen, Dichte nimmt über Bayer-Schwellen ab. Fuß unten Mitte."""
    r = np.random.default_rng(seed)
    balls = [(r.uniform(-20, 20), r.uniform(4, 30), r.uniform(9, 17), r.uniform(0, 0.25)) for _ in range(8)]
    Y, X = np.mgrid[0:h, 0:w]
    out = []
    for k in range(n):
        t = (k + 1) / n
        im = np.zeros((h, w, 4), np.uint8)
        v = np.zeros((h, w))
        for bx, by, br, d in balls:
            tt = max(0, t - d)
            if tt <= 0: continue
            rad = br * min(1, tt * 2.2 + 0.2)
            cyy = h - 2 - by * min(1, tt * 1.6 + 0.2) - t * 6
            q = 1 - np.hypot(X - (w / 2 + bx * (0.6 + tt)), (Y - cyy) * 1.1) / rad
            v = np.maximum(v, q)
        dens = 1.0 - max(0, t - 0.45) * 1.8          # Ausdünnen in der zweiten Hälfte
        th = BAYER4[Y % 4, X % 4]
        on = (v > 0) & (th < dens + v * 0.5)
        lv = np.where(v > 0.55, 3, np.where(v > 0.3, 2, np.where(v > 0.12, 1, 0)))
        lv = np.clip(lv - (1 if t > 0.7 else 0), 0, 3)
        pal = np.array([(*hexc(c), 255) for c in ['#3a1e60', '#6224b0', '#5ad040', '#b4f478']], np.uint8)
        im[on] = pal[lv[on]]
        out.append(im)
    return out


def build():
    R = POSEN['ruhe']
    N = 8
    idle = []
    for i in range(N):
        ph = i / N; s_ = math.sin(ph * 2 * math.pi)
        p = dict(R, breath=round(s_ * 1.5), lean=R['lean'] + s_ * 1.5, hy=s_,
                 hf=(R['hf'][0] + round(2 * math.sin(ph * 2 * math.pi + 1)), R['hf'][1] + round(2 * math.sin(ph * 2 * math.pi + 2))),
                 hb=(R['hb'][0] + round(2 * math.sin(ph * 2 * math.pi + 2.5)), R['hb'][1]),
                 sac=1 if i in (2, 3, 4) else 0, vein=i // 2 % 2, eye=4 if i in (2, 3, 4) else 3)
        idle.append(figure(p, ph))
    MOM = [('zug', 140), ('h1', 120), ('h1', 520, 'gross'), ('hieb', 70), ('ein', 800, 'hit'), ('ein2', 400), ('auf', 220)]
    frames, hit_idx = [], 0
    for st in MOM:
        pn, ms = st[0], st[1]; tag = st[2] if len(st) > 2 else None
        n = max(1, round(ms / 130)) if tag else 1
        if tag == 'hit': hit_idx = len(frames)
        for k in range(n):
            p = dict(POSEN[pn], sac=(k % 2) if tag else POSEN[pn].get('sac', 0), vein=k % 2, hy=math.sin(k))
            frames.append((figure(p, k / max(1, n)), round(ms / n)))
    Ld, seam = scene()
    fx = {}
    B, imp = finish('faeulnis', FX, FY0, BX, [('koerper', idle, dict(n=N, ms=180))], frames, hit_idx, FX + 112, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#f4ffd8', '#b4f478', '#22882e'], 'fokus': [300, BX - 40], 'teilchen': 'sporen', 'dichte': 3.4, 'dauer': 9.5, 'start': 2.2})
    from bosskino_malgareth import impact_star
    fx['blitz'] = strip(impact_star(pal=SPORE))
    fx['dorn'] = strip(dorn(58, 28, 8, 1))
    fx['dorn2'] = strip(dorn(40, 22, 8, 2))
    fx['wolke'] = strip(wolke(76, 60, 10, 3))
    wave, wm = seam_wave(seam, imp, FY - 2, v=260, ms=60, pal=SPORE, direction=-1, maxd=400, peak=lambda d: 4 if d < 80 else 3 if d < 200 else 2,
                         ages=(0.1, 0.32, 0.65, 1.05))
    fx['welle'] = wave
    ev = [dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'),
          dict(k='bild', r='blitz', at=0, x=imp - 12, y=FY - 18, w=25, h=22, n=4, ms=60, quer=True, z='vorn'),
          dict(k='funken', at=0, x=imp, y=FY - 2, n=22, r=6, vx=40, vy=90, g=200, c=SPORE[::-1][:4]),
          dict(k='funken', at=0, x=imp, y=FY - 1, n=16, r=8, vx=30, vy=40, g=80, c=['#443a24', '#2c2618', '#1a1610'])]
    # Wurzeldornen brechen nacheinander aus (260 px/s nach links), jeder dritte mit Sporenwolke
    for i, x in enumerate(range(imp - 24, 16, -27)):
        big = i % 2 == 0
        w_, h_, rr = (28, 58, 'dorn') if big else (22, 40, 'dorn2')
        at = int((imp - x) / 260 * 1000)
        ev.append(dict(k='bild', r=rr, at=at, x=x - w_ // 2, y=FY + 1 - h_ + (i % 3), w=w_, h=h_, n=8, ms=85, quer=True, z='vorn'))
        if i % 2 == 1:
            ev.append(dict(k='bild', r='wolke', at=at + 160, x=x - 38, y=FY + 2 - 60, w=76, h=60, n=10, ms=110, quer=True, z='vorn'))
            ev.append(dict(k='funken', at=at + 60, x=x, y=FY - 6, n=10, r=6, vx=18, vy=30, g=0, c=SPORE[::-1][:4]))
    B['meta']['ereignisse'] = ev
    B['meta']['warn'] = {'x0': 12, 'x1': imp - 4, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 650, 'c': ['#0e4a1c', '#22882e', '#b4f478']}
    return B
