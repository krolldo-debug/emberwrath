# Bosskino: Skalvyr, der Frostwurm (Stufe 37) in den Reifhöhlen.
# Figur: mächtiger flügelloser Eiswurm (Farben nach frost_wyrm.js): schwerer Leib als Röhre entlang einer Catmull-Rom-
# Kurve, hinten ein hoher Buckel, der Schwanz rollt sich davor ein; Brust auf zwei Vorderklauen gestemmt, der Hals
# steigt in einem S auf. Licht von vorn oben in 4 Tönen je Material, Schuppen als Sicheln längs der Bogenlänge, helle
# Bauchplatten, glühende Frostadern (Puls läuft vom Schwanz zum Herz), Rückendornen aus Eis mit zwei Facetten.
# Kopf: breiter Schädel mit Brauenwulst, glühendes Auge in dunkler Höhle, zwei zurückgeschwungene Kristallhörner, Wangen-
# dorn, Eisfänge, Kinnzapfen; offen glüht der Schlund. Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Attacke „Eiszapfenregen“: er duckt sich, bäumt sich auf (Klauen hoch) und brüllt (gestufte Schallringe, Beben);
# dann wächst unter jedem Zapfen eine große gestufte Schattenmarke (blinkt zuletzt), der Zapfen fällt, zerspringt mit
# Eiskrone und Splittern (1 px Beben), Reif bleibt kurz liegen und läuft durch die Fugen.
# Bühne: ruhiger Eisboden aus großen Platten mit klaren Fugen und Spiegelglanz; Höhle in Ebenen (ferne Eisvorhänge und
# Säulen, gefrorener Wasserfall, nahe Eissäulen und Zapfenbüschel, Kristalle; vorn hängende Zapfen als Schattenriss).
import math
import numpy as np
from bosskino import (Fig, MAT, hash2, hexc, FROST, Buf, bands, BAYER4, vnoise,
                      seam_wave, strip, outline_mask, floor, stamp, finish, SW, SH, FY)

MAT.update({
    'scl': ['#03070e', '#0e2036', '#183652', '#285878', '#4686a6'],
    'scld': ['#02050a', '#0a1828', '#12283e', '#1c3c58', '#2c5878'],
    'bel': ['#0b1a28', '#365c74', '#5a88a0', '#8ab6ca', '#c6e6f2'],
    'crys': ['#06142a', '#1d5488', '#3a94c8', '#88d4f0', '#e8fcff'],
    'crysd': ['#040c18', '#0f2a48', '#1a4670', '#2c6a98', '#4a90bc'],
    'horn': ['#060c16', '#24384e', '#3e5a76', '#6a8aa6', '#a6c4d8'],
    'maw': ['#04030a', '#140a1e', '#2a1030', '#481a3c', '#6c2a4e'],
    'teeth': ['#2a4054', '#6a8aa2', '#c4e0ec', '#e8f6fc', '#ffffff'],
    'fg': FROST,
    'eye': ['#0a3050', '#2a9cd8', '#8aeaff', '#d8fcff', '#ffffff'],
    'svoid': ['#020309'] * 5,
})
RIM_F = {'scl': '#a6dcec', 'bel': '#f0fcff', 'crys': '#ffffff', 'horn': '#d0e8f4', 'scld': '#5a9ab8'}
RIM_B = {'scl': '#2a9cc8', 'scld': '#16608a', 'bel': '#7ed8f0', 'crys': '#9aeefc', 'horn': '#6ac0e0', 'crysd': '#3a94c8'}
OUT = '#010309'

W, H, FX, FY0 = 440, 250, 250, 240
S = 1.0
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
    return np.array(out)


L3 = np.array([0.42, 0.72, 0.55]); L3 = L3 / np.linalg.norm(L3)


def grid(f, X0, Y0, R):
    """Pixelraster (Ausschnitt) um X0, Y0 mit Figurkoordinaten."""
    xa, xb = max(0, X0 - R), min(f.W, X0 + R + 1); ya, yb = max(0, Y0 - R), min(f.H, Y0 + R + 1)
    if xb <= xa or yb <= ya: return None
    YY, XX = np.mgrid[ya:yb, xa:xb]
    return ya, yb, xa, xb, (XX + 0.5 - f.FX) / f.S, (f.FY - (YY + 0.5)) / f.S


def new_part(f, line=True, gap=0, rim=True):
    f.np += 1; f.line[f.np] = line; f.rim[f.np] = rim
    if gap: f.gap[f.np] = gap
    return f.np


class Spine:
    def __init__(s, pts, rad):
        s.sp = catmull(pts)
        d = np.hypot(np.diff(s.sp[:, 0]), np.diff(s.sp[:, 1]))
        s.arc = np.concatenate([[0], np.cumsum(d)])
        tx = np.gradient(s.sp[:, 0]); th = np.gradient(s.sp[:, 1]); ln = np.hypot(tx, th) + 1e-9
        s.tx, s.th = tx / ln, th / ln
        s.ux, s.uh = -s.th, s.tx              # linke Normale der Laufrichtung (Schwanz -> Kopf) = Rücken
        s.r = np.array([rad(k) for k in s.sp[:, 2]])

    def at(s, k):
        j = int(np.searchsorted(s.sp[:, 2], k)); j = min(len(s.sp) - 1, j)
        return j


def tube(f, Sp, k0, k1, ph=0.0, vein=True, heart=None, dark=False, belly_on=True):
    """Leib als Röhre (Scheiben vom Schwanz zum Kopf), nur Steuerbereich k0..k1. Zylinderlicht in 4 Tönen, Schuppen-
    sicheln, Bauchplatten, Frostadern mit wanderndem Puls."""
    sp, arc = Sp.sp, Sp.arc
    part = None
    for j in range(len(sp)):
        x, h, k = sp[j]
        if not (k0 <= k < k1): continue
        r = Sp.r[j]
        if j % 6 == 0 or part is None: part = new_part(f, gap=int(2 * r / 3) + 3)
        X0, Y0 = f.at(x, h)
        g = grid(f, X0, Y0, int(math.ceil(r * f.S)) + 1)
        if g is None: continue
        ya, yb, xa, xb, PX, PH = g
        dx, dh = PX - x, PH - h
        inside = dx * dx + dh * dh <= r * r
        if not inside.any(): continue
        tx, th, ux, uh = Sp.tx[j], Sp.th[j], Sp.ux[j], Sp.uh[j]
        perp = np.clip((dx * ux + dh * uh) / r, -1, 1)      # +1 Rücken, -1 Bauch
        along = dx * tx + dh * th
        nz = np.sqrt(np.maximum(0, 1 - perp * perp))
        v = ux * perp * L3[0] + uh * perp * L3[1] + nz * L3[2]
        tone = np.select([v > 0.88, v > 0.64, v > 0.3], [4, 3, 2], 1)
        a = arc[j] + along
        phi = np.arcsin(perp)
        belly = (perp < -0.5) & (r > 3) & belly_on
        mat = np.where(belly, 'bel', 'scld' if dark else 'scl').astype(object)
        # Bauchplatten: Querbänder mit dunkler Fuge, Oberkante hell
        fb = (a / 4.6) % 1
        bt = np.where(fb < 0.2, np.maximum(1, tone - 1), np.where(fb < 0.42, np.minimum(4, tone + 1), tone))
        # Schuppen: Sicheln, freie Kante zeigt zum Schwanz, Reihen versetzt
        if r > 3:
            b = phi / 0.4
            row = np.floor(b)
            au = (a / 5.2 + 0.5 * (row % 2)) % 1
            fw = b - row
            e = 0.34 * (1 - (2 * fw - 1) ** 2)
            q = au - e
            st = np.where((q >= 0) & (q < 0.17), np.maximum(1, tone - 1),
                          np.where((q >= 0.17) & (q < 0.34) & (tone >= 2), np.minimum(4, tone + 1), tone))
        else:
            st = tone
        tt = np.where(belly, bt, st)
        if vein and r > 5:
            # Frostader längs der Flanke mit Seitenästen; Puls wandert vom Schwanz zum Kopf
            pv = 0.12 + 0.2 * np.sin(a / 21.0) + 0.07 * np.sin(a / 6.3 + 1)
            wpx = np.abs(phi - pv) * r * np.cos(phi)
            br = ((a % 34) < 9) & (np.abs(phi - (pv + ((a % 34) / 9) * 0.55 * np.where((a // 34) % 2 == 0, 1, -1))) * r * np.cos(phi) < 0.55)
            vm = ((wpx < 0.6) | br) & (perp > -0.5) & (perp < 0.75)
            pulse = ((a / 64.0) - ph) % 1
            lv = np.where(pulse < 0.09, 4, np.where(pulse < 0.2, 3, 2))
            mat = np.where(vm, 'fg', mat); tt = np.where(vm, lv, tt)
        sub = inside
        f.mat[ya:yb, xa:xb][sub] = mat[sub]
        f.tone[ya:yb, xa:xb][sub] = tt[sub]
        f.part[ya:yb, xa:xb][sub] = part
    return part


def ridge(Sp, k0, k1, every=10.0, start=4.0, phase=0.0):
    """Punkte auf dem Rücken (Grundpunkt, Normale, Tangente, Radius, k) alle `every` Längeneinheiten."""
    out = []
    nxt = start
    for j in range(len(Sp.sp)):
        k = Sp.sp[j, 2]
        if k < k0 or k >= k1: continue
        if Sp.arc[j] >= nxt and Sp.r[j] > 3:
            nxt = Sp.arc[j] + every
            r = Sp.r[j]
            out.append((Sp.sp[j, 0] + Sp.ux[j] * r * 0.82, Sp.sp[j, 1] + Sp.uh[j] * r * 0.82, Sp.ux[j], Sp.uh[j], Sp.tx[j], Sp.th[j], r, k))
    return out


def bez(p0, p1, p2, n):
    t = np.linspace(0, 1, n)[:, None]
    P0, P1, P2 = np.array(p0), np.array(p1), np.array(p2)
    return (1 - t) ** 2 * P0 + 2 * (1 - t) * t * P1 + t * t * P2


def shard(f, ctrl, w0, w1, mat='crys', n=24, line=True, glint=True):
    """Eiskristall entlang einer Kurve (2 oder 3 Steuerpunkte), Breite w0 -> w1, zwei Facetten (Licht oben vorn),
    heller Grat, weiße Spitze."""
    C = bez(ctrl[0], ctrl[1], ctrl[2], n) if len(ctrl) == 3 else bez(ctrl[0], ((ctrl[0][0] + ctrl[1][0]) / 2, (ctrl[0][1] + ctrl[1][1]) / 2), ctrl[1], n)
    T = np.gradient(C, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    w = np.linspace(w0, w1, n) / 2
    left = C + N * w[:, None]; right = C - N * w[:, None]
    pts = [tuple(p) for p in left[:-1]] + [tuple(C[-1])] + [tuple(p) for p in right[:-1][::-1]]
    m = f.poly(pts)
    ys, xs = np.nonzero(m)
    if len(xs) == 0: return m
    px = (xs + 0.5 - f.FX) / f.S; ph = (f.FY - (ys + 0.5)) / f.S
    d = (px[:, None] - C[None, :, 0]) ** 2 + (ph[:, None] - C[None, :, 1]) ** 2
    i = d.argmin(1)
    side = ((px - C[i, 0]) * N[i, 0] + (ph - C[i, 1]) * N[i, 1]) / np.maximum(0.6, w[i])
    ls = np.sign(N[:, 0] * 0.45 + N[:, 1] * 0.75); ls[ls == 0] = 1
    q = side * ls[i]
    t = i / (n - 1)
    tone = np.where(q > 0.12, np.where(t > 0.5, 4, 3), np.where(q > -0.4, 2, 1))
    if glint: tone = np.where((np.abs(q) <= 0.12) & (t > 0.25), 4, tone)
    p = new_part(f, line=line)
    f.mat[ys, xs] = mat; f.tone[ys, xs] = tone; f.part[ys, xs] = p
    X, Y = f.at(*C[-1])
    if 0 <= X < f.W and 0 <= Y < f.H and m[Y, X]: f.tone[Y, X] = 4
    return m


def limb(f, a, b, wa, wb, mat):
    m = f.seg(a, b, wa, wb)
    f.put(m, mat, shade='dome', r=3.5, dcuts=(0.24, 0.55, 0.82))
    return m


def foreleg(f, sh, foot, near, lift=0.0, ph=0.0):
    """Vorderklaue: Oberarm nach hinten unten (Ellbogen hinten), Unterarm nach vorn unten, Pranke mit drei Eiskrallen,
    Ellbogendorn. Arm als Röhre mit Schuppen wie der Leib."""
    from bosskino import ik
    l1, l2 = 24, 24
    c1 = ik(sh, (foot[0], foot[1] + 5), l1, l2, bend=1); c2 = ik(sh, (foot[0], foot[1] + 5), l1, l2, bend=-1)
    el = min((c1, c2), key=lambda q: q[0] + 0.6 * q[1])
    wr = (foot[0] - 1, foot[1] + 5)
    k = 1.0 if near else 0.88
    Sp = Spine([sh, el, wr], lambda t: float(np.interp(t, [0, 1, 2], [11 * k, 7.5 * k, 6 * k])))
    tube(f, Sp, 0, 99, ph, vein=near, dark=not near, belly_on=False)
    shard(f, [(el[0] + 3, el[1] + 2), (el[0] - 6, el[1] - 2), (el[0] - 11, el[1] - 8)], 6, 1, 'crys' if near else 'crysd', n=12)
    # Pranke und Krallen (Spitzen weiß), bei gehobener Klaue nach vorn oben gespreizt
    fx, fh = foot
    mat = 'scl' if near else 'scld'
    f.put(f.ell(fx + 3, fh + 3.5, 8, 4.5), mat, shade='dome', r=2.5, dcuts=(0.25, 0.55, 0.82))
    cm = 'crys' if near else 'crysd'
    for dx, ln, up in ((5, 10, 0), (9, 11, -1), (12, 9, -2)):
        a = math.radians(-14 + up * 7 + lift * 50)
        b0 = (fx + dx, fh + 3)
        tip = (b0[0] + ln * math.cos(a), b0[1] + ln * math.sin(a) - 2 * (1 - lift))
        shard(f, [b0, (b0[0] + ln * 0.6 * math.cos(a), b0[1] + ln * 0.6 * math.sin(a) + 1.5), tip], 3.8, 0.8, cm, n=12)
    shard(f, [(fx - 3, fh + 2), (fx - 9, fh - 0.5)], 2.8, 0.8, cm, n=8)
    return el


def rot2(p, c, a):
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


TOP = [(-16, 4), (-12, 12), (-2, 17), (10, 20), (20, 20.5), (30, 17), (38, 12), (48, 9.2), (56, 7), (62, 4.6), (65, 1.4), (64, -1)]


def head(f, base, ang=0.0, jaw=0.0, eye=4, roar=0.0):
    """Kopf im eigenen Rahmen (u nach vorn, v nach oben), um ang gedreht. Rückgabe: Maulpunkt, Nüster, Kehle."""
    a = math.radians(ang); c_, s_ = math.cos(a), math.sin(a)
    bx, bh = base
    HS = 1.22
    P = lambda u, v: (bx + HS * (u * c_ - v * s_), bh + HS * (u * s_ + v * c_))
    HG = (-4, -1.5)
    ja = math.radians(-34 * jaw)
    J = lambda u, v: P(*rot2((u, v), HG, ja))
    inv = lambda X, Y: ((((X + 0.5 - f.FX) / f.S - bx) * c_ + ((f.FY - (Y + 0.5)) / f.S - bh) * s_) / HS,
                        (-((X + 0.5 - f.FX) / f.S - bx) * s_ + ((f.FY - (Y + 0.5)) / f.S - bh) * c_) / HS)
    # ferne Hörner (dunkler, hinter dem Schädel)
    shard(f, [P(2, 12), P(-10, 28), P(-36, 40)], 10, 1.2, 'crysd', n=28)
    shard(f, [P(-6, 6), P(-18, 10), P(-30, 6)], 5, 1, 'crysd', n=16)
    # Schlund (offen): Gaumen dunkel, Kehle glüht in Ringen
    if jaw > 0.08:
        mm = f.poly([P(-6, -1), P(30, -0.5), P(60, -0.5), J(58, -2), J(30, -2), J(-6, -2)])
        p = new_part(f)
        ys, xs = np.nonzero(mm)
        cu, cv = 11, -2 - jaw * 6
        for y, x in zip(ys, xs):
            u, v = inv(x, y)
            d = math.hypot((u - cu) / 2.0, v - cv) / (4 + jaw * 3)
            f.part[y, x] = p
            if d < 1:
                f.mat[y, x] = 'fg'; f.tone[y, x] = 4 if d < 0.35 + roar * 0.2 else 3 if d < 0.65 else 2
            else:
                f.mat[y, x] = 'maw'; f.tone[y, x] = 1 if u > 40 else 2 if u > 18 else 3
        # untere Zähne
        for u, ln in ((14, 2.5), (22, 3), (30, 3), (38, 3.5), (46, 3), (54, 5)):
            shard(f, [J(u, -2.5), J(u + 0.6, -2 + ln)], 2.2, 0.6, 'teeth', n=6, line=False, glint=False)
    # Unterkiefer: Kieferkante hell, Seite, dunkle Unterseite, Kehlplatten
    jm = f.poly([J(-8, -2), J(10, -2), J(56, -2), J(60, -4), J(55, -9), J(32, -13), J(8, -15), J(-8, -11)])
    f.put(jm, 'scl', shade='dome', r=4, dcuts=(0.26, 0.55, 0.8))
    ys, xs = np.nonzero(jm)
    for y, x in zip(ys, xs):
        u, v = inv(x, y)
        u, v = rot2((u, v), HG, -ja)
        if v < -11.6 + max(0, u - 6) * 0.07 and u < 34:
            f.mat[y, x] = 'bel'; f.tone[y, x] = 1 if (u % 5) < 1.2 else 2
        elif v > -3.2: f.tone[y, x] = max(int(f.tone[y, x]), 3)
    # Kinnzapfen
    for u, ln in ((12, 7), (20, 10), (28, 6)):
        b0 = J(u, -12.6)
        shard(f, [b0, (b0[0] - 1, b0[1] - ln)], 3, 0.8, 'crys', n=8)
    # Schädel und Oberkiefer: flache Ebenen (Oberseite hell, Seite, Lippe dunkel), Nasenhöcker
    sk = f.poly([P(-15, -5), P(-17, 3)] + [P(u, v) for u, v in TOP[1:]] + [P(62, -1), P(30, -1), P(-4, -3.5)])
    f.put(sk, 'scl', shade='dome', r=5, dcuts=(0.2, 0.48, 0.76))
    tu = [q[0] for q in TOP]; tv = [q[1] for q in TOP]
    ys, xs = np.nonzero(sk)
    for y, x in zip(ys, xs):
        u, v = inv(x, y)
        top = np.interp(u, tu, tv)
        rel = (v + 1) / max(1, top + 1)
        t = int(f.tone[y, x])
        if rel > 0.84: t = max(t, 4 if u > -4 else 3)
        elif rel > 0.6: t = max(t, 3)
        if rel < 0.14: t = min(t, 2)
        if 40 < u < 61 and rel > 0.7 and ((u - 40) % 5.5) < 1.3: t = 4 if t == 3 else 3
        f.tone[y, x] = t
    # Jochbogen: helle Kante vom Auge zum Kiefergelenk, darunter dunkle Falte
    for k in np.linspace(-8, 20, 50):
        v0 = 2.6 + (k - 20) * -0.03
        for dv, t in ((0, 4), (-1.0, 1)):
            X, Y = f.at(*P(k, v0 + dv))
            if 0 <= X < f.W and 0 <= Y < f.H and sk[Y, X] and f.mat[Y, X] == 'scl': f.tone[Y, X] = t
    # Frostadern am Kopf: vom Auge zum Hornansatz und längs des Kiefers
    for pts_ in ((P(14, 8), P(2, 10), P(-10, 7)), (J(-4, -6), J(14, -8), J(34, -7))):
        for k in np.linspace(0, 1, 40):
            q = bez(pts_[0], pts_[1], pts_[2], 41)[int(k * 40)]
            X, Y = f.at(*q)
            if 0 <= X < f.W and 0 <= Y < f.H and f.mat[Y, X] == 'scl': f.mat[Y, X] = 'fg'; f.tone[Y, X] = 2 if k > 0.6 else 3
    # Lippenlinie
    for k in np.linspace(-3, 61, 90):
        X, Y = f.at(*P(k, -0.6))
        if 0 <= X < f.W and 0 <= Y < f.H and sk[Y, X]: f.tone[Y, X] = 1
    # obere Fänge (auch geschlossen sichtbar)
    for u, ln in ((44, 6 + jaw * 2), (56, 5.5 + jaw * 2)):
        shard(f, [P(u, -0.5), P(u - 0.8, -0.5 - ln)], 3, 0.6, 'teeth', n=8, line=False)
    if jaw > 0.08:
        for u in (12, 19, 26, 33, 50):
            shard(f, [P(u, -0.5), P(u - 0.4, -3.2)], 2, 0.6, 'teeth', n=5, line=False, glint=False)
    # Brauenwulst (schwer, Lichtkante oben) und Augenhöhle
    f.put(f.poly([P(6, 12.5), P(20, 18.5), P(32, 17), P(41, 11.5), P(31, 10.6), P(18, 10.2)]), 'scl', light=(1, -1), hi=1, mid=3, flat=5)
    so = f.poly([P(14, 10.6), P(33, 10.8), P(34, 7.2), P(22, 5.2), P(15, 7.2)])
    f.put(so, 'svoid', fixed=0)
    ex, ey = f.at(*P(25.5, 8.4))
    if eye > 0:
        EYE = ['..aabba..', '.abcddcb.', 'abcddddcb', '.abbccba.']
        for dy, row in enumerate(EYE):
            for dx, ch in enumerate(row):
                if ch == '.': continue
                t = max(1, min(4, 'abcd'.index(ch) + 1 + eye - 4))
                X, Y = ex + dx - 4, ey + dy - 2
                if 0 <= X < f.W and 0 <= Y < f.H: f.mat[Y, X] = 'eye'; f.tone[Y, X] = t
        for dx, dy in ((-5, 0), (5, 0), (-4, 1), (6, -1)):
            X, Y = ex + dx, ey + dy
            if 0 <= X < f.W and 0 <= Y < f.H and f.mat[Y, X] == 'svoid': f.mat[Y, X] = 'fg'; f.tone[Y, X] = 1
    else:
        for dx in range(-3, 5): f.px(ex + dx, ey, 'eye', 1)
    # Nüster
    nx, ny = f.at(*P(57, 4.5))
    f.px(nx, ny, 'svoid', 0); f.px(nx + 1, ny, 'svoid', 0); f.px(nx, ny - 1, 'scl', 4); f.px(nx + 1, ny - 1, 'scl', 4)
    # nahe Hörner: großes zurückgeschwungenes Kristallhorn, darüber ein steiles zweites, Brauendornen
    shard(f, [P(4, 13), P(-12, 30), P(-44, 34)], 13, 1.6, 'crys', n=34)
    shard(f, [P(14, 17), P(4, 31), P(-16, 42)], 9, 1.2, 'crys', n=28)
    shard(f, [P(-10, -3), P(-20, -9), P(-32, -7)], 7, 1, 'crys', n=16)
    shard(f, [P(-13, 4), P(-22, 4), P(-30, 10)], 5, 1, 'crys', n=14)
    for u, v, L, aa in ((30, 16.5, 7, 112), (38, 12.5, 5, 104), (46, 9.8, 4, 100)):
        ar = math.radians(aa)
        shard(f, [P(u - 2, v - 0.5), P(u - 2 + L * math.cos(ar), v + L * math.sin(ar))], 3.2, 0.8, 'crys', n=8)
    mouth = P(62, -2 - jaw * 6)
    return {'mund': mouth, 'nase': P(60, 4), 'kehle': J(20, -12)}


def heart(f, at, lv):
    X, Y = f.at(*at)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            d = math.hypot(dx, dy * 1.2)
            if d > 4.2: continue
            if 0 <= X + dx < f.W and 0 <= Y + dy < f.H and f.mat[Y + dy, X + dx] in ('bel', 'scl'):
                t = 4 if d < 1.3 else 3 if d < 2.5 else 2 if d < 3.4 else 1
                t = max(1, min(4, t + lv - 3))
                if t >= 2 or (dx + dy) % 2 == 0:
                    f.mat[Y + dy, X + dx] = 'fg'; f.tone[Y + dy, X + dx] = t


# ------------------------------------------------------------------------------------------- Posen
BODY = [(-198, 44), (-190, 26), (-174, 12), (-152, 11), (-132, 34), (-108, 66), (-82, 58), (-62, 32), (-38, 24), (-18, 32)]
RAD = [2.0, 3.5, 6, 9.5, 13, 17, 19, 21, 22.5, 24, 26, 21.5, 18, 16, 14.5]
rad = lambda k: float(np.interp(k, range(len(RAD)), RAD))

POSEN = {
    'ruhe': dict(C=(0, 46), N=[(10, 70), (12, 94), (22, 114), (36, 124)], kw=-7, ff=(20, 0), fn=(32, 0)),
    'zug': dict(C=(-3, 40), N=[(4, 60), (-2, 80), (6, 96), (20, 102)], kw=-26, jaw=0.15, ff=(18, 0), fn=(30, 0), b9=-3),
    'zug2': dict(C=(-4, 38), N=[(2, 58), (-6, 76), (0, 92), (14, 98)], kw=-30, jaw=0.2, ff=(18, 0), fn=(30, 0), b9=-4),
    'h1': dict(C=(-4, 58), N=[(4, 86), (2, 106), (10, 120), (24, 126)], kw=2, b8=4, jaw=0.5, ff=(18, 16), fn=(30, 22), lift=0.4, b9=6),
    'aus': dict(C=(-6, 68), N=[(0, 96), (-2, 116), (8, 128), (24, 130)], kw=14, b8=8, jaw=1.0, ff=(16, 34), fn=(30, 42), lift=1.0, b9=14, roar=1.0, herz=5),
    'ab': dict(C=(-2, 54), N=[(8, 80), (12, 102), (24, 118), (38, 124)], kw=-4, jaw=0.45, ff=(20, 4), fn=(32, 6), lift=0.2, b9=3),
    'ab2': dict(C=(0, 44), N=[(10, 68), (12, 92), (22, 112), (36, 120)], kw=-16, jaw=0.2, ff=(20, 0), fn=(32, 0)),
}


def figure(p, ph=0.0, ring=-1, puff=-1):
    f = new()
    t = ph * 2 * math.pi
    wv = p.get('wave', 1.0)
    body = [list(q) for q in BODY]
    body[0][0] += 3 * math.sin(t); body[0][1] += 2 * math.cos(t)
    body[1][1] += 1.5 * math.sin(t + 0.8)
    for i, a in ((4, 0.0), (5, 0.9), (6, 1.8)): body[i][1] += 1.6 * math.sin(t + a) * wv
    body[9][1] += p.get('b9', 0); body[8][1] += p.get('b8', 0)
    C = p['C']
    br = p.get('atem', 0)
    pts = [tuple(q) for q in body] + [(C[0], C[1] + br)] + list(p['N'])
    Sp = Spine(pts, lambda k: rad(k) + (br * 0.6 if 9.3 < k < 10.7 else 0))
    # ferne Klaue hinter dem Leib
    shF = (C[0] - 10, C[1] - 12 + br)
    foreleg(f, shF, p['ff'], False, p.get('lift', 0), ph)
    # Leib bis zur Brust, dann Rückendornen des Leibs, dann Hals (läuft über den Buckel)
    tube(f, Sp, 0, 10.2, ph)
    for (x, h, ux, uh, tx, th, r, k) in ridge(Sp, 1.5, 8.1, every=9.5, start=10):
        L = min(24, 5 + r * 0.8) * (1.0 if int(k * 7) % 2 == 0 else 0.7)
        bx_, bh_ = -tx, -th                                   # nach hinten (zum Schwanz) geneigt
        tip = (x + (ux * 0.75 + bx_ * 0.55) * L, h + (uh * 0.75 + bh_ * 0.55) * L)
        mid = (x + ux * L * 0.55 + bx_ * L * 0.15, h + uh * L * 0.55 + bh_ * L * 0.15)
        shard(f, [(x - ux * 2, h - uh * 2), mid, tip], 4 + r * 0.24, 1, 'crys', n=14)
    tube(f, Sp, 10.2, 99, ph)
    for (x, h, ux, uh, tx, th, r, k) in ridge(Sp, 10.4, 13.8, every=8, start=0):
        L = 7 + r * 0.55
        tip = (x + (ux * 0.7 - tx * 0.7) * L, h + (uh * 0.7 - th * 0.7) * L)
        shard(f, [(x - ux * 2, h - uh * 2), tip], 3.6 + r * 0.16, 1, 'crys', n=10)
    # Frostherz in der Brust
    j = Sp.at(10.05)
    hp = (Sp.sp[j, 0] - Sp.ux[j] * Sp.r[j] * 0.45 + 6, Sp.sp[j, 1] - Sp.uh[j] * Sp.r[j] * 0.45)
    heart(f, hp, p.get('herz', 3))
    # nahe Klaue vor der Brust
    shN = (C[0] - 2, C[1] - 15 + br)
    foreleg(f, shN, p['fn'], True, p.get('lift', 0), ph)
    # Kopf
    hx, hh = p['N'][-1]
    hd = head(f, (hx, hh), p['kw'], p.get('jaw', 0), p.get('auge', 4), p.get('roar', 0))
    # Atemreif aus den Nüstern (Ruhe)
    if puff >= 0:
        nx, nh = hd['nase']
        for jn in range(3):
            s = (puff + jn * 4) % 12
            if s > 9: continue
            x, h = nx + 2 + s * 1.6, nh - 1 - s * 0.7 + 0.8 * math.sin(s * 1.3 + jn)
            lv = 3 if s < 3 else 2 if s < 6 else 1
            f.dot(x, h, 'fg', lv)
            if s < 6: f.dot(x + 1, h, 'fg', max(1, lv - 1))
    # Lichtkante oben (Licht von oben): oberste Pixel jeder Schuppenfläche hell
    filled = f.mat != None
    ue = np.ones_like(filled); ue[1:] = ~filled[:-1]
    for m_, t_ in (('scl', 4), ('bel', 4), ('scld', 3)):
        sel = (f.mat == m_) & ue & (f.tone >= 2)
        f.tone[sel] = t_
    im = f.render(outline=OUT, rim=RIM_F, rim_back=RIM_B)
    # Schallringe des Brüllens: gestufte Bögen vor dem Maul (Teil des Bildes, bleiben im Rahmen)
    if ring >= 0:
        mx, mh = hd['mund']
        X0, Y0 = f.at(mx, mh)
        dirr = math.radians(p['kw'] + 8)
        for q in range(3):
            rr = 10 + ((ring * 6 + q * 14) % 42)
            lv = 4 if rr < 20 else 3 if rr < 34 else 2
            span = math.radians(52)
            n_ = int(rr * 2.4) + 1
            for i in range(n_ + 1):
                aa = dirr - span + 2 * span * i / n_
                if lv < 3 and i % 3 == 2: continue
                for w in range(3 if lv == 4 else 2 if lv == 3 else 1):
                    X = int(round(X0 + (rr - w) * math.cos(aa))); Y = int(round(Y0 - (rr - w) * math.sin(aa)))
                    if 0 <= X < W and 0 <= Y < GROUND - 2 and im[Y, X, 3] == 0:
                        im[Y, X] = (*hexc(FROST[lv - w] if w < 2 else OUT), 255)
    im[GROUND:] = 0
    return im


# ------------------------------------------------------------------------------------------- Reifhöhlen
BX = 352
WF = BX - 34          # gefrorener Wasserfall hinter Hals und Kopf
FLOOR = ['#040810', '#0a1626', '#102034', '#172c44', '#203a56']


def pillar(img, glow, x0, w, top, bot, cols, rim, seed=0, waist=0.45, glint=None):
    """Eissäule Decke -> Boden: Taille in der Mitte, Zylinderlicht (links hell), senkrechte Schlieren, Lichtkante."""
    ym = (top + bot) / 2
    for y in range(max(0, top), min(SH, bot)):
        k = abs(y - ym) / ((bot - top) / 2)
        hw = w / 2 * (1 - waist + waist * k ** 1.6) + 1.2 * math.sin(y * 0.21 + seed) * (1 - k)
        a, b = int(round(x0 - hw)), int(round(x0 + hw))
        for x in range(max(0, a), min(SW, b + 1)):
            u = (x - a + 0.5) / max(1, b - a + 1)
            st = math.sin(x * 0.9 + seed * 3 + math.sin(y * 0.05 + seed) * 2)
            t = 3 if u < 0.22 else 2 if u < 0.55 else 1 if u < 0.85 else 0
            if st > 0.82 and 0 < t < 3: t += 1
            if x == a: img[y, x] = (*hexc(rim), 255); continue
            img[y, x] = (*hexc(cols[t]), 255)
            if glint is not None and x == a + 1 and (y // 3) % 4 == 0: glow[y, x] = (*hexc(glint), 255)


def hang(img, x0, w, L, cols, rim, top=0):
    """Hängender Zapfen (Kegel), Licht links."""
    for y in range(top, top + L):
        k = 1 - (y - top) / L
        hw = w / 2 * k ** 0.75
        a, b = int(round(x0 - hw)), int(round(x0 + hw))
        for x in range(max(0, a), min(SW, b + 1)):
            u = (x - a + 0.5) / max(1, b - a + 1)
            t = 2 if u < 0.35 else 1 if u < 0.75 else 0
            img[y, x] = (*hexc(rim if x == a and b - a >= 2 else cols[t]), 255)


def scene():
    L = {}
    rng = np.random.default_rng(5)
    Y, X = np.mgrid[0:SH, 0:SW]
    # ---- Ferne (0,15): gefrorene Vorhänge an der Höhlenwand, ferne Säulen im Dunst, Wasserfall, Deckenzapfen
    F = bands(SH, SW, 0, 176, ['#020409', '#03060d', '#040912', '#060d19', '#081221'])
    G = np.zeros((SH, SW, 4), np.uint8)
    WALL = ['#04080f', '#070e1a', '#0b1525', '#101e32', '#162842']
    xs = np.arange(SW)
    hf = np.sin(xs * 0.11) * 1.0 + np.sin(xs * 0.047 + 1.3) * 1.6 + np.sin(xs * 0.23 + 0.4) * 0.5
    slope = np.gradient(hf)
    for y in range(4, 178):
        vy = 1 - abs(y - 92) / 100
        sh = slope * (1 + 0.15 * math.sin(y * 0.05))
        t = np.select([sh < -0.22, sh < 0.05, sh < 0.28], [3, 2, 1], 0) + (vy > 0.55)
        t = np.clip(t + ((BAYER4[y % 4, xs % 4] < (vy - 0.2)) & (vy < 0.55)), 0, 4)
        F[y, :] = np.array([(*hexc(c), 255) for c in WALL], np.uint8)[t]
    # Rand oben: Wand geht in die Decke über (dunkler), Bayer-Stufe
    for y in range(0, 30):
        for x in range(SW):
            if BAYER4[y % 4, x % 4] > y / 30: F[y, x] = (*hexc('#020409'), 255)
    FP = ['#0c1a2c', '#13253c', '#1b3350', '#284868']
    for x0, w, s in ((118, 30, 1), (470, 34, 3)):
        pillar(F, G, x0, w, 0, 176, FP, '#3a6488', seed=s, waist=0.5)
    # gefrorener Wasserfall: senkrechte Eisbahnen in harten Stufen, Licht in der Mitte
    ICEF = ['#0a1e36', '#123a5a', '#1c5a80', '#2c80a8', '#4aa8d0', '#88d4ef', '#dcf8ff']
    for x in range(WF - 62, WF + 63):
        u = abs(x - WF) / 62
        top = int(10 + 12 * u * u + 3 * math.sin(x * 0.7))
        for y in range(top, 178):
            k = 1 - u * 0.85 - abs(y - 96) / 250
            stripe = math.sin(x * 0.55 + math.sin(x * 0.13) * 2) * 0.5 + 0.5
            v = k * 0.75 + stripe * 0.35 + (BAYER4[y % 4, x % 4] - 0.5) * 0.12
            lv = 6 if v > 0.95 else 5 if v > 0.82 else 4 if v > 0.68 else 3 if v > 0.52 else 2 if v > 0.36 else 1 if v > 0.2 else 0
            if u > 0.92 and BAYER4[y % 4, x % 4] < (u - 0.92) * 12: continue
            F[y, x] = (*hexc(ICEF[max(0, lv - 2)]), 255)
            if lv >= 3: G[y, x] = (*hexc(ICEF[lv]), 255)
    # Deckenzapfen fern: zwei Reihen
    for x0 in range(2, SW, 7):
        L_ = 5 + int(hash2(x0, 3, 1) * 16)
        hang(F, x0, 4 + (x0 % 3), L_, ['#0a1626', '#14283e', '#203c58'], '#3a6488')
    L['fern'] = dict(img=F, f=0.15)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=3.8, lo=0.55, steps=3))
    # ---- Mitte (0,45): hinterer Eisboden, nahe Eissäulen, Zapfenbüschel, Stalagmiten, leuchtende Kristalle
    M = np.zeros((SH, SW, 4), np.uint8); MG = np.zeros((SH, SW, 4), np.uint8)
    bf, bs, _ = floor(168, SH, [3, 3, 4, 4, 5, 6, 7, 8, 9], ['#030710', '#08121f', '#0d1a2c', '#13243a', '#1a3048'], vx=BX, vy=40, tile=30, seed=41, chips=0.0)
    stamp(M, bf)
    for x in range(SW): M[168, x] = (*hexc('#4a7896' if hash2(x, 2, 5) > 0.3 else '#2c5070'), 255)
    MP = ['#050c18', '#0a1828', '#12263c', '#1c3a58']
    pillar(M, MG, 22, 34, 0, 172, MP, '#4a86b0', seed=4, waist=0.42, glint='#88d4f0')
    pillar(M, MG, 540, 40, 0, 172, MP, '#4a86b0', seed=8, waist=0.4, glint='#88d4f0')
    HC = ['#060e1a', '#10223a', '#1c3a5a']
    for x0, w, L_ in ((84, 9, 46), (96, 6, 30), (106, 7, 56), (116, 4, 22), (226, 6, 34), (236, 9, 60), (248, 5, 28),
                      (430, 7, 40), (442, 10, 64), (456, 6, 36), (468, 4, 20), (300, 5, 24), (312, 4, 16)):
        hang(M, x0, w, L_, HC, '#5a9ac0')
        MG[min(SH - 1, L_ - 2), x0] = (*hexc('#9aeefc'), 255)
    def stalag(x0, w, top, bot=171):
        for y in range(top, bot):
            k = (y - top) / (bot - top)
            hw = max(1, int(w * (0.25 + 0.75 * k ** 0.7)))
            for x in range(x0 - hw, x0 + hw + 1):
                u = (x - x0 + hw) / (2 * hw + 1)
                t = 3 if u < 0.2 else 2 if u < 0.55 else 1
                M[y, x] = (*hexc(['#060c16', '#0f1e32', '#1a3350', '#3a6a90'][t]), 255)
    for x0, w, top in ((60, 6, 138), (196, 8, 132), (262, 5, 150), (412, 7, 140), (500, 5, 152)):
        stalag(x0, w, top)
    def crystals(cx, by, n, seed):
        r = np.random.default_rng(seed)
        for i in range(n):
            h = int(r.integers(9, 24)); a = r.uniform(-0.55, 0.55); bx = cx + int(r.integers(-9, 10))
            for k in range(h):
                x = int(round(bx + a * k)); y = by - k
                w = max(0, int(2.6 * (1 - k / h) + 0.5))
                for dx in range(-w, w + 1):
                    c = ['#1d5488', '#3a94c8', '#88d4f0'][min(2, max(0, 1 - dx))]
                    M[y, x + dx] = (*hexc(c), 255)
                    if dx <= 0 and k > h * 0.3: MG[y, x + dx] = (*hexc(FROST[3 if dx < 0 else 2]), 255)
                if k == h - 1: MG[y, x] = (*hexc('#ffffff'), 255)
    crystals(110, 170, 6, 1); crystals(276, 170, 4, 2); crystals(420, 170, 5, 3); crystals(30, 171, 4, 4)
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=3.1, lo=0.5, steps=3))
    # ---- Boden (1,0): große Eisplatten, klare Fugen, ruhige Töne, Spiegelglanz (Schrägstreifen), Abglanz des Wasserfalls
    Bd, seam, tid = floor(FY - 4, SH, [4, 5, 6, 8, 10, 12], FLOOR, vx=BX - 30, vy=-40, tile=44, seed=43, chips=0.0)
    BG = np.zeros((SH, SW, 4), np.uint8)
    C = np.array([(*hexc(c), 255) for c in FLOOR], np.uint8)
    for y in range(FY - 3, SH):
        for x in range(SW):
            if seam[y, x]: continue
            q = (x + (y - FY) * 2.2) % 70
            if q < 3 or 9 <= q < 10:
                ci = FLOOR.index('#%02x%02x%02x' % tuple(Bd[y, x, :3])) if '#%02x%02x%02x' % tuple(Bd[y, x, :3]) in FLOOR else 2
                Bd[y, x] = C[min(4, ci + 1)]
    # Abglanz des Wasserfalls im Eis: Spalten nahe WF heller, Rand gerastert
    for y in range(FY - 3, SH):
        for x in range(WF - 50, WF + 51):
            if seam[y, x]: continue
            k = 1 - abs(x - WF) / 50 - (y - FY) / 40
            if k <= 0 or (k < 0.35 and BAYER4[y % 4, x % 4] > k * 3): continue
            Bd[y, x] = (*hexc('#2c5274' if k > 0.6 and x % 3 else '#1f3c5a'), 255)
    for x in range(SW): Bd[FY - 4, x] = (*hexc('#7aa8c4' if hash2(x, 1, 2) > 0.3 else '#4a7896'), 255)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        Bd[y, x] = (*hexc('#02050b'), 255)
        # Fugen nahe dem Wurm glimmen kalt
        far = abs(x - (BX + 40)) / 140 + (y - FY) / 26
        if far < 1.0 and y < SH - 4:
            Bd[y, x] = (*hexc('#0c2a44'), 255)
            if far < 0.55: BG[y, x] = (*hexc(FROST[1]), 255)
    # Schatten unter dem Wurm (feste Stufen): Brust/Klauen und Leib
    for dy, k in ((-3, 0.62), (-2, 0.55), (-1, 0.55), (0, 0.6), (1, 0.72)):
        y = FY + dy
        for x in range(BX - 46, BX + 170):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
            BG[y, x] = 0
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=3.3, lo=0.4, steps=3))
    # ---- Vorn (1,35): hängende Zapfen oben links/rechts, Eisblöcke unten, Schattenrisse mit Lichtkante
    V = Buf()
    vm = np.zeros((SH, SW), bool)
    for x0, w, L_ in ((6, 16, 40), (20, 10, 26), (34, 13, 50), (48, 7, 20), (530, 14, 44), (546, 10, 30), (516, 8, 22)):
        for y in range(0, L_):
            k = 1 - y / L_
            hw = w / 2 * k ** 0.8
            vm[y, max(0, int(round(x0 - hw))):min(SW, int(round(x0 + hw)) + 1)] = True
    vm[0:3, :60] = True; vm[0:3, 508:] = True
    vm |= V.poly([(-4, SH), (-4, 184), (10, 176), (16, 186), (24, 172), (32, 190), (42, 196), (48, SH)])
    vm |= V.poly([(506, SH), (514, 198), (528, 188), (546, 192), (564, 186), (564, SH)])
    V.a[vm] = (*hexc('#010309'), 255)
    e = outline_mask(~vm) & vm
    V.a[e] = (*hexc('#0f2238'), 255)
    le = vm & ~np.roll(vm, 1, axis=1)
    V.a[le & (Y < 80)] = (*hexc('#3a6a90'), 255)
    top_e = e & ~np.roll(vm, 1, axis=0) & (Y > 100)
    V.a[top_e] = (*hexc('#9cc2d2'), 255)
    V.a[np.roll(top_e, 1, axis=0) & vm] = (*hexc('#4a7896'), 255)
    L['vorn'] = dict(img=V.a, f=1.35)
    return L, seam


# ------------------------------------------------------------------------------------------- Effekte
ZW, ZH = 15, 50


def icicle(h=ZH, w=ZW):
    """Fallender Eiszapfen: oben abgebrochen, drei Facetten, Riss, weiße Spitze, dunkle Kontur."""
    im = np.zeros((h, w, 4), np.uint8)
    C = MAT['crys']
    for y in range(h - 1):
        k = 1 - y / (h - 1)
        hw = (w / 2 - 1) * k ** 0.65
        for x in range(w):
            u = (x + 0.5 - w / 2) / max(0.5, hw)
            if abs(u) > 1: continue
            t = 1 if u < -0.45 else 3 if u < 0.05 else 2 if u < 0.6 else 1
            if -0.15 < u < 0.05 and y > 3: t = 4
            if y < 2: t = 3 if abs(u) < 0.7 else 2
            im[y, x] = (*hexc(C[t]), 255)
    for y in range(8, 20):
        x = int(w / 2 + 2 - (y - 8) * 0.3)
        if im[y, x, 3]: im[y, x] = (*hexc(C[1]), 255)
    im[h - 3:h - 1, w // 2] = (*hexc('#ffffff'), 255)
    a = im[:, :, 3] > 0
    im[outline_mask(a)] = (*hexc(OUT), 255)
    return im


SPW, SPH, SPN = 72, 46, 8


def shatter():
    """Aufschlag: Lichtstern, Eiskrone aus dem Boden, Splitter in Parabeln (bleiben im Rahmen, landen und liegen),
    gestufter Bodenring. Boden in Bildzeile SPH-3."""
    out = []
    rng = np.random.default_rng(9)
    cx, gy = SPW // 2, SPH - 3
    sh = []
    for i in range(30):
        vx = rng.uniform(-68, 68); vy = rng.uniform(50, 165) * (1 - abs(vx) / 140)
        sh.append((vx, vy, int(rng.integers(1, 4)), rng.uniform(-3, 3)))
    crown = [(-12, 8), (-8, 13), (-4, 19), (0, 24), (4, 17), (8, 12), (12, 7), (-1, 10), (6, 21)]
    for k in range(SPN):
        im = np.zeros((SPH, SPW, 4), np.uint8)
        def put(x, y, c):
            x, y = int(round(x)), int(round(y))
            if 0 <= x < SPW and 0 <= y < SPH: im[y, x] = (*hexc(c), 255)
        # Bodenring
        if k >= 1:
            r = 5 + k * 3.6
            n = int(r * 3)
            for i in range(n + 1):
                a = math.pi * 2 * i / n
                if k > 4 and i % 2: continue
                put(cx + r * math.cos(a), gy + r * 0.24 * math.sin(a), FROST[max(1, 4 - k // 2)])
        # Eiskrone: Spitzen schießen hoch (Bild 1-2), brechen in Stufen ab
        if 1 <= k <= 5:
            for ox, hh in crown:
                Lh = hh if k <= 2 else max(0, hh - (k - 2) * 7)
                if k == 1: Lh = int(hh * 0.7)
                lean = ox * 0.035
                for yy in range(int(Lh)):
                    y = gy - yy
                    wd = 3 if yy < Lh * 0.45 else 2 if yy < Lh * 0.8 else 1
                    xc = cx + ox + lean * yy - wd // 2
                    for dx in range(wd):
                        c = '#ffffff' if yy > Lh - 3 else ['#3a94c8', '#88d4f0', '#dcf8ff'][dx if wd == 3 else dx + 1]
                        put(xc + dx, y, c)
                    put(xc - 1, y, OUT); put(xc + wd, y, OUT)
                put(cx + ox + lean * Lh, gy - Lh, OUT)
        # Lichtstern im ersten Bild
        if k == 0:
            for i in range(-20, 21): put(cx + i, gy, '#ffffff' if abs(i) < 6 else '#9aeefc' if abs(i) < 11 else '#34b8e4')
            for j in range(1, 26): put(cx, gy - j, '#ffffff' if j < 10 else '#9aeefc' if j < 14 else '#34b8e4')
            for j in range(1, 8):
                c = '#ffffff' if j < 3 else '#9aeefc' if j < 5 else '#34b8e4'
                put(cx + j, gy - j, c); put(cx - j, gy - j, c)
            for dx in (-1, 0, 1):
                for dy in (0, 1, 2): put(cx + dx, gy - dy, '#ffffff')
            # Bruchstücke des Zapfens
            for x, y in ((-4, -3), (4, -2), (-2, -6), (3, -7)):
                put(cx + x, gy + y, '#88d4f0'); put(cx + x + 1, gy + y, '#3a94c8')
        # Splitter
        if k >= 1:
            t = k * 0.06
            for vx, vy, s, sp in sh:
                x = cx + vx * t; y = gy - (vy * t - 230 * t * t)
                if y > gy: y = gy
                col = '#ffffff' if k < 3 and s == 1 else '#88d4f0' if s < 3 else '#3a94c8'
                if k >= 6: col = '#3a94c8' if s < 3 else '#1d5488'
                put(x, y, col)
                if s >= 2: put(x + (1 if vx > 0 else -1), y, '#3a94c8' if k > 4 else '#88d4f0')
                if s >= 2 and y < gy: put(x, y - 1, '#dcf8ff' if k < 4 else '#3a94c8')
                if s >= 3: put(x + (1 if vx > 0 else -1), y - 1, '#1d5488')
        out.append(im)
    return out


MKW, MKH = 46, 15


def marks(n=10):
    """Schattenmarke unter einem Zapfen: wächst in vier Stufen, dunkler Kern, Ring in Frostfarbe, Ecken als Zielmarke;
    in den letzten Bildern blinkt der Ring weiß/türkis. Deckt die kleine Laufzeitmarke in der Mitte ab."""
    out = []
    cx, cy = MKW // 2, MKH // 2
    for k in range(n):
        im = np.zeros((MKH, MKW, 4), np.uint8)
        st = min(3, k * 4 // n)
        rx = [8, 12, 16, 20][st]; ry = max(2.5, rx / 3.2)
        blink = k >= n - 4
        ring = ('#ffffff' if k % 2 == 0 else '#9aeefc') if blink else ['#0a3050', '#1670a0', '#34b8e4', '#9aeefc'][st]
        for y in range(MKH):
            for x in range(MKW):
                q = ((x + 0.5 - cx - 0.5) / rx) ** 2 + ((y + 0.5 - cy - 0.5) / ry) ** 2
                if q > 1: continue
                if q > 0.72: c = ring if (q > 0.84 or (x + y) % 2 == 0) else '#08142a'
                elif q > 0.4: c = '#050c1a' if (x + y) % 2 else '#02050c'
                else: c = '#02050c'
                im[y, x] = (*hexc(c), 255)
        # Zielecken links und rechts (ab Stufe 2)
        if st >= 1:
            for sgn in (-1, 1):
                x0 = cx + sgn * (rx + 2)
                for d in range(3 if st >= 2 else 2):
                    X = x0 + sgn * d
                    if 0 <= X < MKW: im[cy, X] = (*hexc(ring), 255)
        out.append(im)
    return out


RFW, RFH = 40, 9


def rime(n=8):
    """Reif am Aufschlag: Kruste aus hellen Eiskörnern und kleinen Spitzen, verblasst in Stufen."""
    out = []
    cx, cy = RFW // 2, RFH - 3
    for k in range(n):
        im = np.zeros((RFH, RFW, 4), np.uint8)
        keep = 1.0 if k < 3 else 0.7 if k < 5 else 0.4 if k < 7 else 0.18
        for y in range(RFH):
            for x in range(RFW):
                q = ((x - cx) / 17) ** 2 + ((y - cy) / 2.6) ** 2
                if q > 1: continue
                h_ = hash2(x, y, 31)
                if h_ > keep * (1.15 - q * 0.6): continue
                c = '#dcf8ff' if h_ < 0.15 and k < 5 else '#88d4f0' if h_ < 0.5 else '#3a94c8' if k < 6 else '#1d5488'
                im[y, x] = (*hexc(c), 255)
        if k < 5:
            for ox, hh in ((-9, 3), (-4, 4), (3, 5), (8, 3), (12, 2), (-13, 2)):
                for yy in range(hh - (k // 2)):
                    if 0 <= cy - 1 - yy < RFH: im[cy - 1 - yy, cx + ox] = (*hexc('#ffffff' if yy == hh - 1 - k // 2 else '#88d4f0'), 255)
        out.append(im)
    return out


# ------------------------------------------------------------------------------------------- Bauen
N_RUHE, MS_RUHE = 12, 150
MOMENT = [('zug', 150), ('zug2', 170), ('h1', 90), ('aus', 100, 'hit', 0), ('aus', 100, None, 1), ('aus', 100, None, 2),
          ('aus', 100, None, 3), ('aus', 100, None, 4), ('aus', 100, None, 5), ('aus2', 120, None, 0), ('aus2', 120, None, 2),
          ('aus2', 120, None, 4), ('aus', 140), ('ab', 160), ('ab2', 180), ('ruhe', 160)]


def build():
    R = POSEN['ruhe']
    idle = []
    for i in range(N_RUHE):
        ph = i / N_RUHE
        tt = ph * 2 * math.pi
        p = dict(R)
        p['N'] = [(x + round(1.2 * math.sin(tt + j * 0.5) * (j + 1) / 4), h + round(1.5 * math.sin(tt + 1 + j * 0.3) * (j + 1) / 4)) for j, (x, h) in enumerate(R['N'])]
        p['kw'] = R['kw'] + 2 * math.sin(tt + 1.4)
        p['atem'] = 1 if i in (3, 4, 5, 6) else 0
        p['herz'] = 3 + (1 if i in (4, 5, 6) else 0)
        idle.append(figure(p, ph, puff=i))
    POSEN['aus2'] = dict(POSEN['aus'], jaw=0.85, kw=12, N=[(0, 96), (-2, 116), (8, 128), (25, 129)])
    frames, hit_idx = [], 0
    for k, st in enumerate(MOMENT):
        pn, ms = st[0], st[1]
        if len(st) > 2 and st[2] == 'hit': hit_idx = len(frames)
        ring = st[3] if len(st) > 3 else -1
        p = POSEN[pn]
        frames.append((figure(p, (k % N_RUHE) / N_RUHE, ring=ring), ms))
    Ld, seam = scene()
    fx = {'zapfen': icicle(), 'splitter': strip(shatter()), 'marke': strip(marks()), 'reif': strip(rime())}
    B, imp = finish('skalvyr', FX, FY0, BX, [('koerper', idle, dict(n=N_RUHE, ms=MS_RUHE))], frames, hit_idx, FX + 60, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#ffffff', '#9aeefc', '#34b8e4'], 'fokus': [292, BX - 30], 'teilchen': 'schnee', 'dichte': 5,
                     'dauer': 9.5, 'start': 2.2})
    # Eiszapfenregen: Marke (eigene Bildfolge, deckt die Laufzeitmarke) -> Fall -> Splitter, Reif bleibt liegen
    VOR, MKN = 720, 10
    xs = [292, 236, 178, 122, 66, 264, 206, 148, 94, 38]
    T0, DT = 860, 150
    ev, mk, rf = [], [], []
    for i, x in enumerate(xs):
        at = T0 + i * DT
        ev.append(dict(k='zapfen', r='zapfen', r2='splitter', at=at, x=int(x), y=FY, vor=VOR, w=ZW, h=ZH, n=SPN, ms=60, sw=SPW, sh=SPH, mr=1, z='vorn'))
        mk.append(dict(k='bild', r='marke', at=at - VOR, x=int(x) - MKW // 2, y=FY - 1 - MKH // 2, w=MKW, h=MKH, n=MKN, ms=VOR // MKN, quer=True, z='boden'))
        rf.append(dict(k='bild', r='reif', at=at + 40, x=int(x) - RFW // 2, y=FY + 1 - (RFH - 3), w=RFW, h=RFH, n=8, ms=230, quer=True, z='boden'))
    wave, wm = seam_wave(seam, xs[0], FY - 3, v=230, ms=70, pal=FROST, direction=0, maxd=330, peak=lambda d: 3 if d < 100 else 2,
                         ages=(0.12, 0.35, 0.7, 1.1))
    fx['welle'] = wave
    ev_w = [dict(k='bild', r='welle', at=T0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden')]
    # Brüllen: Reif rieselt von der Decke (Beben kommt mit dem Einschlagbild)
    dust = [dict(k='funken', at=60 + 70 * i, x=int(x), y=10, n=9, r=14, vx=6, vy=-30, g=140, c=['#ffffff', '#9aeefc', '#34b8e4', '#1670a0'])
            for i, x in enumerate((300, 200, 110, 250, 40, 160))]
    B['meta']['ereignisse'] = ev_w + rf + ev + mk + dust
    B['meta']['warn'] = None
    return B
