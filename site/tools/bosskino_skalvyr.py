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
    up_, lo_ = P(40, -1), J(40, -2.5)
    return {'mund': mouth, 'nase': P(60, 4), 'kehle': J(20, -12), 'schlund': ((up_[0] + lo_[0]) / 2, (up_[1] + lo_[1]) / 2),
            'gape': ang - 17 * jaw}


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


JET = ['#0a1e34', '#1c4468', '#3a7aa6', '#8ac8e4', '#dcf6ff', '#ffffff']
# Atemstoß je Stufe: (Reichweite, abgelöstes Ende hinten, Tonversatz)
JETS = [(18, 0, 1), (48, 0, 1), (82, 0, 0), (104, 6, 0), (112, 34, -1)]


def breath(im, f, mouth, ang, st):
    """Eisiger Atemstoß aus dem Rachen: flacher Kegel nach vorn unten, aus Fasern (Bahnen längs des Strahls) mit
    unterschiedlich weit reichenden, zerfaserten Enden; harte Tonstufen von der weißen Achse zum dunklen Rand;
    eingestreute Eissplitter, die mit dem Strahl fliegen. In der letzten Stufe löst sich der Strahl vom Maul."""
    R, B, sh = JETS[st]
    a = math.radians(ang); dx, dh = math.cos(a), math.sin(a); nx, nh = -dh, dx
    mx, mh = mouth
    Hh, Ww = im.shape[:2]
    X0, Y0 = f.at(mx, mh)
    span = int(R * f.S) + 4
    for y in range(max(0, Y0 - span), min(Hh, Y0 + span)):
        for x in range(max(0, X0 - 6), min(Ww, X0 + span)):
            px = (x + 0.5 - f.FX) / f.S - mx; ph = (f.FY - (y + 0.5)) / f.S - mh
            d = px * dx + ph * dh; o = px * nx + ph * nh
            if d > R: continue
            w = 2 + d * 0.36                                    # halbe Kegelbreite (flach)
            o2 = o * (1.2 if o > 0 else 1.0)                    # Oberseite etwas flacher
            lane = math.floor(o / 1.6)
            if B and d < B * (0.6 + 0.8 * hash2(lane, st, 63)): continue
            reach = R * (0.55 + 0.45 * hash2(lane, st, 61))
            side = w * (0.7 + 0.3 * hash2(lane, math.floor(d / 5), 62))
            if abs(o2) > side or d > reach: continue
            r = abs(o2) / w; q = (d - B) / max(1, reach - B)
            t = 5 if (r < 0.2 and q < 0.55) else 4 if (r < 0.42 and q < 0.78) else 3 if (r < 0.66 and q < 0.92) else 2
            if r > 0.86 or q > 0.97: t = 1
            if B > 0 and q < 0.15: t = min(t, 2)
            t = max(1, min(5, t + sh))
            im[y, x] = (*hexc(JET[t]), 255)
    # Eissplitter im und vor dem Strahl: kurze Striche längs der Flugrichtung, Kopf weiß, Schweif cyan
    rng = np.random.default_rng(70 + st)
    for i in range(4 + st * 5):
        d = rng.uniform(0.35, 1.15) * R
        if d < B: continue
        o = rng.uniform(-1.3, 1.3) * (2 + d * 0.36)
        hx, hh = mx + dx * d + nx * o, mh + dh * d + nh * o
        Ls = 2 + int(rng.integers(0, 3))
        for k in range(Ls + 1):
            X, Y = f.at(hx - dx * k, hh - dh * k)
            if 0 <= X < Ww and 0 <= Y < Hh: im[Y, X] = (*hexc('#ffffff' if k == 0 else JET[3] if k < 2 else JET[2]), 255)


# ------------------------------------------------------------------------------------------- Posen
BODY = [(-198, 44), (-190, 26), (-174, 12), (-152, 11), (-132, 34), (-108, 66), (-82, 58), (-62, 32), (-38, 24), (-18, 32)]
RAD = [2.0, 3.5, 6, 9.5, 13, 17, 19, 21, 22.5, 24, 26, 21.5, 18, 16, 14.5]
rad = lambda k: float(np.interp(k, range(len(RAD)), RAD))

POSEN = {
    'ruhe': dict(C=(0, 44), N=[(10, 64), (12, 86), (22, 105), (36, 115)], kw=-7, ff=(20, 0), fn=(32, 0)),
    'zug': dict(C=(-3, 40), N=[(4, 60), (-2, 80), (6, 96), (20, 102)], kw=-26, jaw=0.15, ff=(18, 0), fn=(30, 0), b9=-3, atem=2),
    'zug2': dict(C=(-4, 38), N=[(2, 58), (-6, 76), (0, 92), (14, 98)], kw=-30, jaw=0.1, ff=(18, 0), fn=(30, 0), b9=-4, atem=3),
    'h1': dict(C=(-4, 56), N=[(2, 80), (2, 98), (10, 110), (22, 116)], kw=12, b8=4, jaw=0.6, ff=(18, 14), fn=(30, 20), lift=0.4, b9=6, atem=2),
    'aus': dict(C=(-6, 64), N=[(-2, 86), (2, 104), (10, 116), (20, 122)], kw=34, b8=8, jaw=1.0, ff=(16, 30), fn=(30, 38), lift=1.0, b9=14, roar=1.0, herz=5, cdir=-30),
    'ab': dict(C=(-2, 50), N=[(8, 74), (12, 94), (24, 108), (38, 112)], kw=-6, jaw=0.5, ff=(20, 4), fn=(32, 6), lift=0.2, b9=3),
    'ab2': dict(C=(0, 44), N=[(10, 64), (12, 86), (22, 104), (36, 112)], kw=-14, jaw=0.2, ff=(20, 0), fn=(32, 0)),
}


def figure(p, ph=0.0, puff=-1, cloud=-1):
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
    if cloud >= 0:
        breath(im, f, hd['schlund'], hd['gape'] + p.get('cdir', 0), cloud)
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
from PIL import Image as _Img, ImageDraw as _Draw

ICE = MAT['crys']                      # dunkel -> hell
WHITE = '#ffffff'
MIST = ['#0a1e34', '#1c4468', '#3a7aa6', '#8ac8e4', '#dcf6ff', '#ffffff']


def pmask(w, h, pts):
    m = _Img.new('L', (w, h), 0)
    _Draw.Draw(m).polygon([(float(x), float(y)) for x, y in pts], fill=1)
    return np.array(m, bool)


def put(im, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < im.shape[1] and 0 <= y < im.shape[0]: im[y, x] = (*hexc(c), 255)


def outline(im, col=OUT, only_empty=True):
    a = im[:, :, 3] > 0
    im[outline_mask(a)] = (*hexc(col), 255)


# Salve: (x, Boden-y, Größe, Einschlag-Zeit relativ zum Treffer). Tiefe über y (kleineres y = weiter hinten).
ZAP = {'l': (30, 104), 'm': (24, 82), 's': (18, 62)}
SALVE = [(252, 194, 's', -130), (160, 190, 'm', -110), (208, 197, 's', -90), (226, 188, 'm', -70),
         (138, 196, 's', -40), (174, 187, 's', -20), (190, 195, 'l', 0)]
SAL_X = 192                              # Mitte des Feldes (Szene)


def icicle_big(w, h, seed=0, cracks=0):
    """Großer fallender Eiszapfen (Szenenausrichtung, Licht links oben): oben abgebrochen mit heller Bruchfläche und
    Reifkruste, drei Facetten (linke Lichtseite, Grat, Vorderseite, dunkle rechte Seite), Wachstumsringe, Innenriss,
    weiße Spitze, dunkle Kontur. cracks > 0: glühende Sprünge (kurz vor dem Bersten)."""
    im = np.zeros((h, w, 4), np.uint8)
    cx = w / 2
    rings = [0.22 + 0.05 * hash2(seed, 1), 0.47 + 0.05 * hash2(seed, 2)]
    # schräge Bruchkante (links höher) mit einem stehengebliebenen Splitter und kleinen Kerben
    sp = int(w * (0.55 + 0.2 * hash2(seed, 6)))
    ytop = []
    for x in range(w):
        yb = 1 + (x / w) * h * 0.09
        if abs(x - sp) <= 1: yb -= 1 if x != sp else 2
        if hash2(x, seed, 5) > 0.75: yb += 1
        ytop.append(int(max(0, round(yb))))
    tone = np.full((h, w), -1, int)
    for y in range(h - 1):
        t = y / (h - 2)
        hw = (w / 2 - 1.5) * (1 - t) ** 0.78
        band = -1
        for i, rt in enumerate(rings):
            if 0 <= t - rt < 1.1 / h: band = 0
        for x in range(w):
            u = (x + 0.5 - cx) / max(0.6, hw)
            if abs(u) > 1 or y < ytop[x]: continue
            tt = 3 if u < -0.38 else 4 if u < -0.2 else 2 if u < 0.42 else 1
            if band == 0 and -0.75 < u < 0.6: tt = min(4, tt + 1)
            if band == 1 and abs(u) < 0.95: tt = max(1, tt - 1)
            if y < ytop[x] + 2: tt = 4 if u < 0.2 else 3                 # Bruchfläche oben
            tone[y, x] = tt
    # Innenriss: dunkle Linie mit heller Kante links
    x0, y0 = cx + w * 0.16, h * 0.14; x1, y1 = cx - w * 0.12, h * 0.5
    for k in np.linspace(0, 1, int(h * 0.5)):
        x = int(x0 + (x1 - x0) * k + 1.2 * math.sin(k * 9 + seed)); y = int(y0 + (y1 - y0) * k)
        if 0 <= y < h and 0 <= x < w and tone[y, x] >= 2:
            tone[y, x] = 1
            if x - 1 >= 0 and tone[y, x - 1] >= 1: tone[y, x - 1] = 4
    # Lichtfleck oben in der Lichtseite, Luftblasen in der dunklen Seite
    for y in range(int(h * 0.08), int(h * 0.3)):
        x = int(cx - w * 0.3 + (y - h * 0.08) * 0.08)
        if 0 <= x < w and tone[y, x] >= 2 and y % 7 < 4: tone[y, x] = 5
    for i in range(4):
        y = int(h * (0.2 + 0.12 * i + 0.04 * hash2(i, seed, 9))); x = int(cx + w * (0.12 + 0.1 * hash2(i, seed, 8)))
        if 0 <= y < h and 0 <= x < w and tone[y, x] == 1: tone[y, x] = 3
    # Spitze weiß
    for y in range(h - 6, h - 1):
        for x in range(w):
            if tone[y, x] >= 2: tone[y, x] = 5 if y > h - 4 else 4
    cols = [ICE[0], ICE[1], ICE[2], ICE[3], ICE[4], WHITE]
    for y, x in zip(*np.nonzero(tone >= 0)): im[y, x] = (*hexc(cols[tone[y, x]]), 255)
    # Reifkruste auf der Bruchfläche
    for x in range(w):
        if tone[ytop[x], x] >= 0 and hash2(x, seed, 13) > 0.55: put(im, x, ytop[x], WHITE)
    if cracks:
        rng = np.random.default_rng(seed + 50)
        for c in range(1 + cracks):
            y = h * (0.15 + 0.6 * rng.random()); x = cx + (rng.random() - 0.5) * w * 0.4
            for k in range(int(4 + cracks * 3)):
                x += rng.choice([-1, 0, 1]); y += 1
                if 0 <= int(y) < h and 0 <= int(x) < w and im[int(y), int(x), 3]: put(im, x, y, FROST[3] if k % 3 else WHITE)
    outline(im)
    return im


def stuck_frames(size, n=5, seed=0):
    """Zapfen steckt im Eisboden: Spitze eingesunken, Krater mit Bruchkante, Risse laufen über den Boden, im Zapfen
    leuchten Sprünge auf (Bild 0: Aufprallblitz am Fuß). Boden in Bildzeile sh-2."""
    w, h = ZAP[size]
    sw, sh = w + 36, h + 6
    g = sh - 2
    out = []
    for k in range(n):
        im = np.zeros((sh, sw, 4), np.uint8)
        ic = icicle_big(w, h, seed, cracks=max(0, k - 1))
        sink = 5 + min(k, 2)
        ox = (sw - w) // 2; oy = g - h + sink + 1
        for y in range(h):
            Y = oy + y
            if Y > g or Y < 0: continue
            sel = ic[y, :, 3] > 0
            im[Y, ox:ox + w][sel] = ic[y][sel]
        # Krater: dunkle Mulde, helle Bruchkante vorne, Splitter
        cxx = sw / 2; rx = w * 0.62 + k; ry = 2.2
        for y in range(g - 3, sh):
            for x in range(sw):
                q = ((x + 0.5 - cxx) / rx) ** 2 + ((y + 0.5 - g - 0.5) / ry) ** 2
                if q > 1: continue
                if im[y, x, 3] and y <= g - 1: continue
                im[y, x] = (*hexc('#02050c' if q < 0.55 else ICE[1] if y < g else ICE[3]), 255)
        # Risse über den Boden (flach, perspektivisch)
        for a, L in ((-0.25, 14), (0.18, 16), (3.0, 13), (3.4, 15), (2.7, 9), (0.5, 9)):
            Lk = L * min(1, 0.4 + k * 0.25)
            for s in range(int(rx), int(rx + Lk)):
                x = cxx + math.cos(a) * s; y = g + 0.5 + math.sin(a) * s * 0.22 + (1 if s % 5 == 0 else 0)
                put(im, x, y, FROST[3] if s < rx + 4 else FROST[2] if s < rx + 9 else FROST[1])
        if k == 0:
            for i in range(-int(rx + 8), int(rx + 9)):
                put(im, cxx + i, g, WHITE if abs(i) < rx else FROST[3])
            for j in range(1, 8):
                c = WHITE if j < 4 else FROST[3]
                put(im, cxx - w / 2 - j * 0.8, g - j, c); put(im, cxx + w / 2 + j * 0.8, g - j, c)
        out.append(im)
    return out, sw, sh


def spike(im, bx, by, ang, L, wb, br=0.0):
    """Eisdorn aus dem Boden (Frostkranz): zwei Facetten, Grat, weiße Spitze, Kontur. ang in Grad von der Senkrechten
    (negativ = nach links). br > 0: oben abgebrochen (nur Stumpf bis Länge (1-br)·L, mit heller Bruchkante)."""
    a = math.radians(ang); dx, dy = math.sin(a), -math.cos(a); nx, ny = -dy, dx
    Lr = L * (1 - br)
    wt = wb * 0.5 * br * 0.9 if br else 0
    p0l = (bx - nx * wb / 2, by - ny * wb / 2); p0r = (bx + nx * wb / 2, by + ny * wb / 2)
    tip = (bx + dx * Lr, by + dy * Lr)
    tl = (tip[0] - nx * wt, tip[1] - ny * wt); tr = (tip[0] + nx * wt, tip[1] + ny * wt)
    H, W = im.shape[:2]
    m = pmask(W, H, [p0l, tl, tr, p0r] if br else [p0l, tip, p0r])
    ys, xs = np.nonzero(m)
    if not len(xs): return
    # Seite: links vom Grat (Licht von links oben) hell
    s = (xs + 0.5 - bx) * nx + (ys + 0.5 - by) * ny
    along = ((xs + 0.5 - bx) * dx + (ys + 0.5 - by) * dy) / max(1, Lr)
    lit_left = nx < 0.2
    left = s < 0
    hi = left if lit_left else ~left
    tone = np.where(hi, 3, 1)
    tone = np.where(np.abs(s) < 0.8, 4, tone)
    tone = np.where(along > 0.9, 4, tone) if br else np.where(along > 0.82, 5, tone)
    cols = [ICE[0], ICE[1], ICE[2], ICE[3], ICE[4], WHITE]
    for y, x, t in zip(ys, xs, tone): im[y, x] = (*hexc(cols[t]), 255)
    e = outline_mask(m) & ~m
    ey, ex = np.nonzero(e)
    for y, x in zip(ey, ex):
        if y <= by + 1: im[y, x] = (*hexc(OUT), 255)


def billows(im, balls, sh=0, ar=1.0, lo=0):
    """Frostnebel aus Ballen: Ton nach Höhe in der Wolke, helle Kappe nach links oben, Falten über hinteren Ballen."""
    if not balls: return
    H, W = im.shape[:2]
    own = np.full((H, W), -1, int); tone = np.zeros((H, W), int)
    top = min(y - r for _, y, r, _ in balls); bot = max(y + r for _, y, r, _ in balls)
    for i, (bx, by, r, s2) in enumerate(balls):
        for y in range(int(by - r * ar - 1), int(by + r * ar + 2)):
            for x in range(int(bx - r - 1), int(bx + r + 2)):
                if not (0 <= x < W and 0 <= y < H): continue
                ux = (x + 0.5 - bx) / r; uy = (y + 0.5 - by) / (r * ar)
                q = ux * ux + uy * uy
                if q > 1: continue
                gg = (bot - (y + 0.5)) / max(1, bot - top)
                t = 3 if gg > 0.6 else 2 if gg > 0.28 else 1
                rim = -ux * 0.55 - uy * 0.83
                if q > 0.5 and rim > 0.5: t += 1
                elif q > 0.55 and rim < -0.5: t -= 1
                if q > 0.8 and own[y, x] >= 0: t -= 1
                own[y, x] = i; tone[y, x] = max(lo, min(5, t + sh + s2))
    for y, x in zip(*np.nonzero(own >= 0)): im[y, x] = (*hexc(MIST[tone[y, x]]), 255)


def frost_bank(im, cx, gy, spread, hgt, sh, seed):
    """Flacher Reifschleier: Linse über dem Boden aus waagrechten Fasern (2 Zeilen hoch) mit unterschiedlich weit
    auslaufenden, zerfaserten Enden und Rissen; Töne in harten Stufen vom hellen Kern zum dunklen Rand, Oberkante hell."""
    H, W = im.shape[:2]
    tone = np.full((H, W), -1, int)
    for y in range(int(gy - hgt), int(gy + 3)):
        e = (gy - y) / max(1, hgt)                           # 0 am Boden, 1 oben
        if e < -0.3: continue
        half = spread * math.sqrt(max(0, 1 - max(0, e))) * (1 - 0.25 * max(0, -e))
        row = y // 2
        for side in (-1, 1):
            hl = half * (0.62 + 0.38 * hash2(row, side, seed * 7 + 1))
            for i in range(int(hl) + 1):
                x = int(round(cx + side * i))
                if not (0 <= x < W and 0 <= y < H): continue
                if e > 0.3 and hash2(x // 5, row, seed * 7 + 2) > 0.8: continue          # Risse
                r = i / max(1, hl)
                t = 4 if (r < 0.32 and e < 0.75) else 3 if r < 0.62 else 2 if r < 0.88 else 1
                tone[y, x] = max(1, min(5, t + sh))
        # auslaufende Fasern am Rand
        for side in (-1, 1):
            if hash2(row, side, seed * 7 + 3) > 0.55 and e < 0.6:
                L0 = half * (0.6 + 0.38 * hash2(row, side, seed * 7 + 1)); Lf = 6 + 12 * hash2(row, side, seed * 7 + 4)
                for i in range(int(Lf)):
                    x = int(round(cx + side * (L0 + i)))
                    if 0 <= x < W and 0 <= y < H and (i % 4 != 3): tone[y, x] = max(1, 2 + sh - (1 if i > Lf / 2 else 0))
    m = tone >= 0
    up = m & ~np.roll(m, 1, axis=0)
    tone[up & (tone >= 2)] = np.minimum(5, tone[up & (tone >= 2)] + 1)                  # Oberkante hell
    for y, x in zip(*np.nonzero(m)): im[y, x] = (*hexc(MIST[tone[y, x]]), 255)


def chunk_shape(r, seed, rot):
    """Eisbrocken als Polygon (4-5 Ecken) um 0,0, gedreht."""
    n = 4 + int(hash2(seed, 3) * 2)
    pts = []
    for i in range(n):
        a = rot + i * 2 * math.pi / n + 0.5 * hash2(seed, i)
        rr = r * (0.65 + 0.45 * hash2(seed, i + 10))
        pts.append((math.cos(a) * rr, math.sin(a) * rr * 0.85))
    return pts


def chunk(im, x, y, r, seed, rot):
    pts = [(x + px, y + py) for px, py in chunk_shape(r, seed, rot)]
    H, W = im.shape[:2]
    m = pmask(W, H, pts)
    ys, xs = np.nonzero(m)
    if not len(xs):
        put(im, x, y, ICE[3]); return
    s = (xs + 0.5 - x) * -0.6 + (ys + 0.5 - y) * -0.8
    for yy, xx, v in zip(ys, xs, s):
        im[yy, xx] = (*hexc(ICE[4] if v > r * 0.45 else ICE[3] if v > -r * 0.05 else ICE[2] if v > -r * 0.5 else ICE[1]), 255)
    e = outline_mask(m) & ~m & (im[:, :, 3] == 0)
    im[e] = (*hexc(OUT), 255)


EXW, EXH, EXN, EXMS = 260, 150, 12, 60
EX0, EY0 = SAL_X - EXW // 2, FY + 12 - EXH         # Bildursprung in der Szene


def chunks_plan():
    """Brocken je Zapfen: Start im Zapfenleib, Flug in Parabeln (Szenenkoordinaten), Landung auf dem Boden."""
    rng = np.random.default_rng(21)
    out = []
    for i, (x, y, sz, at) in enumerate(SALVE):
        w, h = ZAP[sz]
        n = {'l': 7, 'm': 5, 's': 4}[sz]
        for j in range(n):
            hy = y - h * (0.12 + 0.7 * j / n)
            side = 1 if x + rng.uniform(-8, 8) > SAL_X else -1
            vx = side * rng.uniform(30, 95); vy = -rng.uniform(40, 150)
            r = {'l': 4.5, 'm': 3.6, 's': 2.8}[sz] * rng.uniform(0.7, 1.25)
            gy = y + rng.uniform(-3, 4)
            out.append(dict(x0=x + rng.uniform(-w * 0.25, w * 0.25), y0=hy, vx=vx, vy=vy, r=r, gy=gy, seed=i * 10 + j,
                            spin=rng.uniform(-9, 9)))
    return out


def chunk_at(c, t):
    """Lage eines Brockens zur Zeit t (s nach dem Bersten): Flug, Landung, kleiner Rutsch."""
    G = 420
    y = c['y0'] + c['vy'] * t + 0.5 * G * t * t
    if y < c['gy']:
        return c['x0'] + c['vx'] * t, y, c['spin'] * t, False
    # Landezeit
    A, B, C = 0.5 * G, c['vy'], c['y0'] - c['gy']
    tl = (-B + math.sqrt(B * B - 4 * A * C)) / (2 * A)
    xl = c['x0'] + c['vx'] * tl
    slide = min(t - tl, 0.12) * c['vx'] * 0.35
    return xl + slide, c['gy'], c['spin'] * tl, True


def crown_plan():
    """Dornen des Frostkranzes: je Einschlag 2-3 Dornen, nach außen geneigt, groß in der Mitte."""
    out = []
    for i, (x, y, sz, at) in enumerate(SALVE):
        big = {'l': 1.0, 'm': 0.8, 's': 0.62}[sz]
        side = -1 if x < SAL_X else 1
        for j, (da, dl) in enumerate(((-34, 0.75), (8, 1.0), (40, 0.7), (-62, 0.42), (66, 0.4))):
            ang = da + side * 12 + 6 * hash2(i, j, 3)
            ox = [-6, 0, 6, -11, 11][j]
            out.append((x + ox, y + (1 if j == 1 else 0), ang, 60 * big * dl, (12 * big + 3) * (0.7 if j > 2 else 1)))
    return out


def kranz():
    """Haupteinschlag als Bildfolge (Szene ab EX0, EY0): Lichtblitz -> Frostkranz aus Eisdornen, Frostnebel quillt auf,
    Zapfen zerbersten in Brocken, Bodenring läuft aus; Dornen brechen, Nebel zerfällt, Brocken landen."""
    frames = []
    CH = chunks_plan(); CR = crown_plan()
    gc = FY + 2 - EY0                      # Feldmitte am Boden im Bild
    cxl = SAL_X - EX0
    L = lambda x: x - EX0
    T = lambda y: y - EY0
    for k in range(EXN):
        im = np.zeros((EXH, EXW, 4), np.uint8)
        # Bodenring (Ellipse in Bodenperspektive), läuft aus und dunkelt in Stufen
        if 1 <= k <= 6:
            rx = 40 + k * 17; ry = rx * 0.13
            for th in np.linspace(0, 2 * math.pi, int(rx * 7)):
                for dr, c in ((0, FROST[4 - min(3, (k + 1) // 2)]), (-1.5, FROST[max(0, 3 - (k + 1) // 2)])):
                    put(im, cxl + (rx + dr) * math.cos(th), gc + (ry + dr * 0.13) * math.sin(th), c)
        # Splitterregen: kurze Eisstriche fliegen aus jedem Einschlag
        if 1 <= k <= 6:
            rng = np.random.default_rng(500)
            t = (k - 0.5) * EXMS / 1000
            for (x, y, sz, at) in SALVE:
                for j in range({'l': 12, 'm': 8, 's': 6}[sz]):
                    vx = rng.uniform(-150, 150); vy = -rng.uniform(60, 220); y0 = T(y) - rng.uniform(2, 30)
                    px, py = L(x) + vx * t, y0 + vy * t + 300 * t * t
                    if py > T(y) + 2: continue
                    sp = math.hypot(vx, vy + 600 * t) + 1e-6
                    ux, uy = vx / sp, (vy + 600 * t) / sp
                    for q in range(3):
                        put(im, px - ux * q, py - uy * q, WHITE if q == 0 else ICE[3] if q == 1 else ICE[2])
        # Frostkranz: Eisdornen schießen aus dem Boden, brechen dann
        if 1 <= k <= 6:
            grow = [0, 0.6, 1.0, 1.0, 1.0, 1.0, 1.0][k]; br = [0, 0, 0, 0, 0.35, 0.6, 0.8][k]
            for (x, y, ang, Ln, wb) in sorted(CR, key=lambda q: q[1]):
                spike(im, L(x), T(y), ang, Ln * grow, wb, br)
            # abgebrochene Spitzen fallen
            if k >= 4:
                for i, (x, y, ang, Ln, wb) in enumerate(CR):
                    a = math.radians(ang)
                    tx = L(x) + math.sin(a) * Ln * 0.8 + math.sin(a) * (k - 3) * 4
                    ty = T(y) - math.cos(a) * Ln * 0.8 + (k - 4) ** 2 * 5 + 2
                    if ty < T(y): chunk(im, tx, ty, wb * 0.32, 300 + i, (k - 4) * 1.3 + i)
        # Frostbank: flacher, zerrissener Reifschleier am Boden, Fasern laufen nach außen aus
        if 1 <= k <= 8:
            spread, hgt, sh = [None, (50, 11, 1), (78, 13, 1), (94, 12, 0), (104, 10, 0), (110, 8, 0), (114, 6, -1),
                               (116, 4, -1), (118, 3, -1)][k]
            frost_bank(im, cxl, gc, spread, hgt, sh, k)
        # Brocken der Zapfen
        if k >= 1:
            t = (k - 0.6) * EXMS / 1000
            for c in CH:
                x, y, rot, landed = chunk_at(c, t)
                chunk(im, L(x), T(y) - c['r'] * 0.5, c['r'], c['seed'], rot)
        # Lichtblitz (Bild 0): flacher Lichtstern am Boden (drei Stufen), Blitzrauten an jedem Einschlag
        if k == 0:
            for sc, c in ((1.0, FROST[2]), (0.78, FROST[3]), (0.52, WHITE)):
                pts = []
                for i in range(16):
                    a_ = math.pi * i / 8
                    sy = math.sin(a_)
                    R = (40 + 50 * max(0, sy) ** 3 + 70 * abs(math.cos(a_)) ** 6) if i % 2 == 0 else 12 + 6 * max(0, sy)
                    R *= sc
                    pts.append((cxl + math.cos(a_) * R, gc - sy * R * (1 if sy > 0 else 0.12)))
                m_ = pmask(EXW, EXH, pts)
                im[m_] = (*hexc(c), 255)
            for (x, y, sz, at) in SALVE:
                for d in range(7):
                    for (ex, ey) in ((d, 0), (-d, 0), (0, -d * 2), (0, d * 0.5)):
                        put(im, L(x) + ex, T(y) + ey, WHITE if d < 4 else FROST[3])
        # Glitzer
        if 1 <= k <= 4:
            for j in range(10 + 4 * k):
                x = cxl + (hash2(j, k, 41) - 0.5) * 200; y = gc - hash2(j, k, 42) * (40 + 12 * k)
                put(im, x, y, WHITE if j % 2 else FROST[3])
        frames.append(im)
    return frames


RFW, RFH = 260, 26
RF0 = (SAL_X - RFW // 2, FY + 12 - RFH)
RFN, RFMS, RFAT = 11, 150, 270


def reste():
    """Eisreste am Boden: Reifkruste je Einschlag, Dornstümpfe, gelandete Brocken; zerfällt in Stufen (Brocken
    werden kleiner und verschwinden, Kruste schrumpft)."""
    CH = chunks_plan(); CR = crown_plan()
    out = []
    for k in range(RFN):
        im = np.zeros((RFH, RFW, 4), np.uint8)
        L = lambda x: x - RF0[0]; T = lambda y: y - RF0[1]
        keep = [1, 1, 1, 1, 0.9, 0.8, 0.66, 0.52, 0.38, 0.24, 0.12][k]
        for i, (x, y, sz, at) in enumerate(SALVE):
            w, _ = ZAP[sz]
            rx = (w * 1.3 + 8) * keep; ry = max(1.0, 3.2 * keep)
            for yy in range(RFH):
                for xx in range(RFW):
                    q = ((xx + 0.5 - L(x)) / max(0.5, rx)) ** 2 + ((yy + 0.5 - T(y)) / ry) ** 2
                    if q > 1: continue
                    c = ICE[2] if q > 0.6 else ICE[3] if q > 0.25 else '#c6eaf6'
                    if yy < T(y) - ry * 0.3 and q > 0.5: c = ICE[3]
                    im[yy, xx] = (*hexc(c), 255)
            # Krater in der Mitte
            if keep > 0.5:
                for xx in range(int(L(x) - w * 0.35 * keep), int(L(x) + w * 0.35 * keep) + 1): put(im, xx, T(y), '#02050c')
        # Stümpfe der Kranzdornen
        if k < 7:
            for (x, y, ang, Ln, wb) in sorted(CR, key=lambda q: q[1]):
                spike(im, L(x), T(y), ang, Ln * (0.35 if k < 3 else 0.25 if k < 5 else 0.15), wb * (0.9 if k < 5 else 0.7), 0.3)
        # Brocken (erst sichtbar, wenn die Explosionsfolge endet)
        if RFAT + k * RFMS >= EXN * EXMS:
            for c in CH:
                x, y, rot, _ = chunk_at(c, 5.0)
                r = c['r'] * (1 if k < 6 else 0.8 if k < 8 else 0.6)
                if k >= 7 and hash2(c['seed'], 7) > keep * 2.2: continue
                chunk(im, L(x), T(y) - c['r'] * 0.5, r, c['seed'], rot)
        out.append(im)
    return out


SHMS = 40
VOR = 640


def schatten():
    """Schattenfeld: unter jedem Zapfen wächst ein Schatten, je näher der Zapfen, desto größer und dunkler; kurz vor
    dem Einschlag blinkt ein Frostrand. Rückgabe (Bilder, Startzeit relativ zum Treffer)."""
    t0 = min(at for *_, at in SALVE) - VOR
    t1 = max(at for *_, at in SALVE)
    n = int(math.ceil((t1 - t0) / SHMS))
    out = []
    for k in range(n):
        t = t0 + k * SHMS
        im = np.zeros((RFH, RFW, 4), np.uint8)
        for (x, y, sz, at) in sorted(SALVE, key=lambda q: q[1]):
            p = (t - (at - VOR)) / VOR
            if not (0 <= p < 1): continue
            w, _ = ZAP[sz]
            rx = 3 + (w * 0.8 - 3) * p ** 0.7; ry = max(1.2, rx * 0.26)
            cx, cy = x - RF0[0], y - RF0[1]
            blink = p > 0.72 and k % 2 == 0
            for yy in range(RFH):
                for xx in range(RFW):
                    q = ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2
                    if q > 1: continue
                    if q > 0.7 and p > 0.72: c = FROST[3] if blink else FROST[1]
                    elif q > 0.5: c = '#08142a'
                    else: c = '#02050c'
                    im[yy, xx] = (*hexc(c), 255)
        out.append(im)
    return out, t0


# ------------------------------------------------------------------------------------------- Bauen
N_RUHE, MS_RUHE = 12, 150
# (Pose, ms, Atemwolke, Kopfzittern)
MOMENT = [('zug', 150, -1, 0), ('zug2', 170, -1, 0), ('h1', 100, -1, 0), ('aus', 110, 0, 0), ('aus', 110, 1, 1),
          ('aus', 110, 2, -1), ('aus', 110, 3, 1), ('aus', 110, 4, 0),
          ('ab', 150, -1, 0), ('ab', 170, -1, 0), ('ab2', 190, -1, 0), ('ruhe', 170, -1, 0)]
HIT = 8


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
    frames = []
    for k, (pn, ms, cl, jit) in enumerate(MOMENT):
        p = dict(POSEN[pn])
        if jit:      # Brüllen: Kopf und Hals zittern
            p['N'] = [(x + jit * (j // 2), h - (j % 2)) for j, (x, h) in enumerate(p['N'])]
            p['kw'] = p['kw'] + jit * 0.5
        frames.append((figure(p, (k % N_RUHE) / N_RUHE, cloud=cl), ms))
    Ld, seam = scene()
    fx = {}
    ev = []
    # Salve: großer Zapfen fällt (Laufzeit 'zapfen': fällt beschleunigt vom oberen Rand), steckt dann im Boden
    for sz in ZAP:
        w, h = ZAP[sz]
        fx['zapfen-' + sz] = icicle_big(w, h, seed={'l': 1, 'm': 2, 's': 3}[sz])
        st, sw, sh = stuck_frames(sz, 5, seed={'l': 1, 'm': 2, 's': 3}[sz])
        fx['steckt-' + sz] = strip(st)
    END = EXMS          # die steckenden Zapfen bersten mit Bild 1 der Hauptexplosion
    for (x, y, sz, at) in sorted(SALVE, key=lambda q: q[1]):
        w, h = ZAP[sz]
        ms = max(12, int(round((END - at) / 5)))
        ev.append(dict(k='zapfen', r='zapfen-' + sz, r2='steckt-' + sz, at=at, x=int(x), y=int(y), vor=VOR, w=w, h=h,
                       n=5, ms=ms, sw=w + 36, sh=h + 6, mr=1, z='vorn'))
    fx['kranz'] = strip(kranz())
    ev.append(dict(k='bild', r='kranz', at=0, x=EX0, y=EY0, w=EXW, h=EXH, n=EXN, ms=EXMS, quer=True, z='vorn'))
    sh_, t0 = schatten()
    fx['schatten'] = strip(sh_)
    fx['reste'] = strip(reste())
    bd = [dict(k='bild', r='schatten', at=t0, x=RF0[0], y=RF0[1], w=RFW, h=RFH, n=len(sh_), ms=SHMS, quer=True, z='boden'),
          dict(k='bild', r='reste', at=RFAT, x=RF0[0], y=RF0[1], w=RFW, h=RFH, n=RFN, ms=RFMS, quer=True, z='boden')]
    wave, wm = seam_wave(seam, SAL_X, FY - 3, v=260, ms=60, pal=FROST, direction=0, maxd=330,
                         peak=lambda d: 4 if d < 60 else 3 if d < 150 else 2, ages=(0.1, 0.3, 0.6, 1.0))
    fx['welle'] = wave
    bd.append(dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'))
    # Brüllen: Reif rieselt von der Decke über dem Feld
    dust = [dict(k='funken', at=-520 + 60 * i, x=int(x), y=10, n=10, r=16, vx=6, vy=-30, g=140,
                 c=['#ffffff', '#9aeefc', '#34b8e4', '#1670a0']) for i, x in enumerate((200, 150, 250, 120, 228, 176))]
    B, imp = finish('skalvyr', FX, FY0, BX, [('koerper', idle, dict(n=N_RUHE, ms=MS_RUHE))], frames, HIT, FX + 60, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#ffffff', '#9aeefc', '#34b8e4'], 'fokus': [292, 298], 'teilchen': 'schnee', 'dichte': 5,
                     'dauer': 9.5, 'start': 2.2,
                     'beben': [[0, 4], [3, -3], [-3, 2], [2, -2], [-2, 1], [1, -1], [0, 1], [1, 0]], 'stopp': 80})
    B['meta']['ereignisse'] = bd + ev + dust
    B['meta']['warn'] = None
    return B
