# Bosskino: Nerith, die Ertrunkene Priesterin (Stufe 12) in der Altarhalle des Versunkenen Tempels.
# Figur nach src/sprites/nerith.js: schwebende Priesterin, fahle blaugraue Haut, türkis leuchtende Augen, nasses
# dunkelgrünes Haar, das wie unter Wasser treibt (große Masse nach hinten), Korallenkrone auf Goldreif mit Perle,
# türkisgrüne Robe mit Goldsaum, Schärpe, Gürtel mit Muschel-Medaillon und Runen; der Unterleib löst sich in
# Wasserschleier und zwei eingerollte Tentakel auf, die ins Wasser reichen. Dreizack aus Grünspan-Bronze mit
# Goldzinken und leuchtender Perle in der Gabel.
# Gezeichnet mit Blick nach rechts (x nach vorn, h nach oben, Wasserlinie bei h = 0), im Bild gespiegelt (Blick links).
# Drei Lagen je Bild (hinten: Haar, Arm, Leib; Kopf; vorn: Strähnen, Arm, Dreizack), jede mit eigenem Umriss.
# Gesicht, Augen, Strähnen, Glanz und Perlenschein im Feinraster.
# Attacke „Flutwelle“ (Spiel: Dreizack-Schwung + Flutwelle): sie steigt auf, holt den Dreizack über die hintere
# Schulter, die Perle lodert, Schrei; Hieb nach vorn unten ins Wasser (Gischtsichel auf der Zinkenbahn),
# Einfrieren, Beben, Wasserkrone am Einschlag; eine Flutwelle rollt nach links durch die Halle, Licht durch die Fugen.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, ik, lerp, over, flip, hash2, hexc, Buf, bands, BAYER4, chk,
                      seam_wave, strip, outline_mask, edge_of, floor, bricks, stamp, finish, SW, SH, FY, K, GLOW, SPEC,
                      up, PAD, SWX, dome)

MAT.update({
    'skin': ['#0e141c', '#33434e', '#546873', '#7f959e', '#aabfc2'],
    'skinh': ['#d6e6e4'] * 5,
    'robe': ['#04121a', '#0d2d32', '#15474a', '#1f655e', '#32877a'],
    'robed': ['#030c12', '#081e24', '#0d2d32', '#15474a', '#1f655e'],
    'gold': ['#1a1208', '#5a4a24', '#8c7a42', '#bea866', '#e4d49a'],
    'goldd': ['#120c06', '#3a2e16', '#5a4a24', '#7a6a38', '#9c8a52'],
    'hair': ['#020608', '#0b1a1e', '#14302e', '#1f4541', '#2f6057'],
    'haird': ['#010405', '#071214', '#0d2022', '#14302e', '#1f4541'],
    'wat': ['#030c1a', '#0f2c4a', '#1a4f78', '#3384ae', '#6cb8da'],
    'watd': ['#020814', '#0a1e36', '#113352', '#1c5882', '#3384ae'],
    'foam': ['#3886b2', '#76bcdc', '#a8dcef', '#c6eaf6', '#ffffff'],
    'coral': ['#2a0a12', '#6c2228', '#a43c38', '#d4664e', '#f4a07e'],
    'bronze': ['#060e0d', '#1d332f', '#2f4f48', '#4a7266', '#78a292'],
    'pearl': ['#2a3a48', '#5e7e8e', '#a2c4ce', '#dcf2f2', '#ffffff'],
    'tg': ['#063a48', '#0e7888', '#2ec8cc', '#a0fff0', '#ffffff'],
    'lip': ['#1a1424', '#3a2c40', '#5c4864', '#806c88', '#a493a8'],
    'sock': ['#070c12', '#101820', '#18242e', '#22303a', '#2c3c46'],
    'white': ['#ffffff'] * 5,
    'hairs': ['#5aa08a'] * 5,
    'alg': ['#060e08', '#132719', '#203e25', '#315831', '#4a783f'],
})
GLOW.clear(); GLOW.update({'tg'})
SPEC.clear(); SPEC.update({'gold': '#fff4c8', 'bronze': '#b4dcc8', 'pearl': '#ffffff', 'coral': '#ffd8c0'})
TG = MAT['tg']
WATER = ['#061226', '#0f2c4a', '#1a4f78', '#3384ae', '#6cb8da', '#c6eaf6', '#ffffff']
RIM_F = {'skin': '#d6e6e4', 'robe': '#54a996', 'gold': '#fff0b8', 'hair': '#3f7a6c', 'wat': '#a8dcef', 'coral': '#ffc0a0',
         'bronze': '#a6d0bc', 'robed': '#2f6057'}
RIM_B = {'hair': '#13807e', 'haird': '#0b5a62', 'robe': '#2ec8cc', 'robed': '#0e7888', 'wat': '#5ae0e0', 'watd': '#1aa8b0',
         'skin': '#7ee8e0', 'gold': '#a0fff0', 'coral': '#ff9a7a', 'bronze': '#2ec8cc'}
OUT = '#02060a'

W, H, FX, FY0 = 330, 190, 175, 180
GROUND = FY0 + 1
HMAX = 166


class NFig(Fig):
    """Fig mit Kugelschattierung (shade='ball') und Feinpixeln, die nur auf einem Teil landen (under=Teilnummer)."""
    def __init__(s):
        super().__init__(W, H, FX, FY0, 1.0)

    def put(s, mask, mat, shade='cyl', **kw):
        if shade != 'ball': return super().put(mask, mat, shade=shade, **kw)
        r = super().put(mask, mat, fixed=2, line=kw.get('line', True))
        ys, xs = np.nonzero(mask)
        if not len(xs): return r
        cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
        rx, ry = max(1, (xs.max() - xs.min() + 1) / 2), max(1, (ys.max() - ys.min() + 1) / 2)
        L = np.array([0.62, 0.62, 0.48]); L /= np.linalg.norm(L)
        cuts = kw.get('dcuts', (0.3, 0.6, 0.84))
        for y, x in zip(ys, xs):
            u = (x + 0.5 - cx) / rx; v = (cy - y - 0.5) / ry
            z = math.sqrt(max(0.0, 1 - min(1.0, u * u + v * v)))
            d = u * L[0] + v * L[1] + z * L[2]
            s.tone[y, x] = 1 if d < cuts[0] else 2 if d < cuts[1] else 3 if d < cuts[2] else 4
        return r

    def _apply_fdec(s, k):
        dec = getattr(s, 'fdec', [])
        if not dec: return
        pd = s.np + 1; s.line[pd] = False; s.rim[pd] = False
        for X, Y, m, t, under in dec:
            if k == 1: X, Y = X // K, Y // K
            if not (0 <= X < s.W and 0 <= Y < s.H): continue
            if under is True and s.mat[Y, X] is None: continue
            if under is not True and under is not False and under and s.part[Y, X] != under: continue
            if m is None: s.mat[Y, X] = None; s.part[Y, X] = 0; continue
            if s.mat[Y, X] is None: s.part[Y, X] = pd
            s.mat[Y, X] = m; s.tone[Y, X] = t


def new(): return NFig()


def pol(a, L, o=(0, 0)):
    r = math.radians(a); return (o[0] + L * math.cos(r), o[1] + L * math.sin(r))


# ------------------------------------------------------------------------------------------- Bänder (Haar, Schleier)
def ribbon_lin(f, pts, w0, w1, mat, tone_fn, line=True):
    return ribbon(f, pts, w0, w1, mat, tone_fn, line=line, ex=1.0)


def ribbon(f, pts, w0, w1, mat, tone_fn, line=True, rim=True, ex=1.2):
    """Band entlang einer Mittellinie (Figurpunkte), Breite w0 -> w1 (spitz). tone_fn(v, t): v quer (-1 unten/hinten ..
    +1 oben/vorn, Seite zum Licht oben rechts), t längs 0..1. Gibt (Maske, Teilnummer, Abtastpunkte) zurück."""
    P = np.array(pts, float)
    n = len(P)
    seg = np.hypot(*(P[1:] - P[:-1]).T)
    cum = np.concatenate([[0], np.cumsum(seg)]); Lt = cum[-1] or 1
    tt = cum / Lt
    d = np.gradient(P, axis=0); d /= np.maximum(1e-6, np.hypot(d[:, 0], d[:, 1]))[:, None]
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    # Normale zeige nach oben-rechts (Licht)
    flipm = (nrm[:, 0] * 0.45 + nrm[:, 1]) < 0
    nrm[flipm] *= -1
    wd = w0 + (w1 - w0) * tt ** ex
    left = P + nrm * (wd / 2)[:, None]; right = P - nrm * (wd / 2)[:, None]
    poly = [tuple(q) for q in left] + [tuple(q) for q in right[::-1]]
    m = f.poly(poly)
    for i in range(n - 1):
        m |= f.seg(tuple(P[i]), tuple(P[i + 1]), wd[i], wd[i + 1])
    f.put(m, mat, fixed=2, line=line, rim=rim)
    pid = f.np
    ys, xs = np.nonzero(m)
    if len(xs):
        X = xs + 0.5 - f.FX; Hh = f.FY - (ys + 0.5)
        best = None
        for i0 in range(0, n, 64):
            Q = P[i0:i0 + 64]
            dd = (X[:, None] - Q[None, :, 0]) ** 2 + (Hh[:, None] - Q[None, :, 1]) ** 2
            j = dd.argmin(1); dv = dd[np.arange(len(j)), j]
            if best is None: best, bj = dv, j + i0
            else:
                sel = dv < best; best[sel] = dv[sel]; bj[sel] = j[sel] + i0
        v = ((X - P[bj, 0]) * nrm[bj, 0] + (Hh - P[bj, 1]) * nrm[bj, 1]) / np.maximum(0.5, wd[bj] / 2)
        for y, x, vv, t_ in zip(ys, xs, v, tt[bj]):
            if f.part[y, x] == pid: f.tone[y, x] = tone_fn(max(-1, min(1, vv)), t_)
    return m, pid, (P, nrm, wd, tt)


def cap_h(h, H0=HMAX - 16, k=10.0):
    """Weiche Höhengrenze (Haar, Strähnen bleiben unter HMAX)."""
    return h if h <= H0 else H0 + k * (1 - math.exp(-(h - H0) / k))


def limb(f, a, b, w0, w1, mat, hi=0.5, line=True):
    """Glied/Stab mit Licht quer zur Achse (Seite oben rechts hell), gleich gut in jeder Richtung."""
    pts = [lerp(a, b, i / 8) for i in range(9)]
    def tf(v, t):
        return 4 if v > hi + 0.25 else 3 if v > hi - 0.45 else 2 if v > -0.55 else 1
    P_ = np.array(pts)
    m, pid, geo = ribbon_lin(f, pts, w0, w1, mat, tf, line)
    return m, pid, geo


def path(o, a0, L, step, bend):
    """Mittellinie: Start o, Winkel a0 (Grad), Länge L; bend(s, f) = Winkeländerung je Schritt (Grad)."""
    pts = [o]; x, h = o; a = a0; s = 0
    while s < L:
        f = s / L
        a += bend(s, f)
        x += math.cos(math.radians(a)) * step; h += math.sin(math.radians(a)) * step
        pts.append((x, h)); s += step
    return pts


def strand_line(f, geo, off, mat, tone, pid, t0=0.06, t1=0.8, width=1):
    """Feine Strähne (1 Feinpixel) im Band bei Querlage off (-1..1), nur auf diesem Teil."""
    P, nrm, wd, tt = geo
    for i in range(len(P) - 1):
        if not (t0 <= tt[i] <= t1): continue
        A = (P[i, 0] + nrm[i, 0] * wd[i] / 2 * off, P[i, 1] + nrm[i, 1] * wd[i] / 2 * off)
        B = (P[i + 1, 0] + nrm[i + 1, 0] * wd[i + 1] / 2 * off, P[i + 1, 1] + nrm[i + 1, 1] * wd[i + 1] / 2 * off)
        f.fline(A, B, mat, tone, under=pid)


# ------------------------------------------------------------------------------------------- Pose
DEF = dict(fl=0.0, lean=0.0, hairT=0.0, cloth=0.0, lift=0.25, wild=0.0, hF=(34, 76), staff=86.0, hB=(-46, 60),
           openB=0.7, jaw=0.0, cast=0.0, pearl=1.0, veil=0.0, trail=0.0, head=0.0, headY=0.0, eye=1.0, behind=False,
           tilt=0.0)


class Pose:
    def __init__(s, p):
        s.p = dict(DEF, **p)
        s.w = (0.0, 62 + s.p['fl'])
        s.lean = s.p['lean']

    def T(s, x, h):
        a = math.radians(-s.lean)
        return (s.w[0] + x * math.cos(a) - h * math.sin(a), s.w[1] + x * math.sin(a) + h * math.cos(a))

    def U(s, pts): return [s.T(x, h) for x, h in pts]


# ------------------------------------------------------------------------------------------- Haar hinten
def hair_back(f, Pz, head_c):
    """Haarmasse nach hinten: Strähnenbündel ungleicher Breite, Länge und Phase, unterbrochene Glanzlinien auf den
    Lichtseiten, Spitzen laufen in dünne, auseinanderdriftende Fäden aus."""
    P = Pz.p
    hx, hh = head_c
    n = 13
    T = P['hairT']; lift = P['lift']; wild = P['wild']
    for jj in range(n - 1, -1, -1):
        u = jj / (n - 1)
        r1, r2, r3, r4 = (hash2(jj, 3, k) for k in (1, 2, 3, 4))
        far = jj % 3 == 1
        th = math.radians(75 + u * 125)
        o = (hx - 2 + math.cos(th) * 7.5, hh + 1 + math.sin(th) * 9)
        a0 = 150 + u * 92 - lift * (22 + 18 * u) + (r1 - 0.5) * 16
        clump = int(min(3.999, u * 4))
        L = 78 + [26, 8, 34, 14][clump] - abs(u - 0.5) * 24 + wild * 18 - (10 if far else 0) + r2 * 22
        ph = r3 * 6.28; amp = 0.7 + r4 * 0.8
        def bend(s, fr, u=u, ph=ph, amp=amp):
            return (math.sin(T + s * (0.05 + 0.04 * amp) + ph) * (1.4 + 3.8 * fr) * amp * (1 + wild * 1.4)
                    + math.sin(T * 2 + ph + s * 0.11) * 0.9 * fr * wild + (0.5 - u) * 0.5)
        pts = [(x, cap_h(h)) for x, h in path(o, a0, L, 2.0, bend)]
        w0 = 15 + r2 * 9 - u * 4
        mat = 'haird' if far else 'hair'
        def tf(v, t, far=far):
            k = 3 if v > 0.45 else 2 if v > -0.35 else 1
            if v > 0.75 and t < 0.55: k = 4
            if t > 0.8: k -= 1
            if far: k -= 1
            return max(1, k)
        m, pid, geo = ribbon(f, pts, w0, 2.4, mat, tf, line=(jj % 3 == 0))
        Pp, nrm, wd, tt = geo
        if not far:
            # unterbrochene Glanzlinien (Lichtseite), dazu eine dunkle Fuge
            for q in range(2 + (jj % 2)):
                t0 = 0.03 + hash2(jj, q, 7) * 0.35; t1 = t0 + 0.12 + hash2(jj, q, 8) * 0.25
                off = 0.35 + hash2(jj, q, 9) * 0.45
                strand_line(f, geo, off, 'hairs' if q == 0 else 'hair', 4, pid, t0, t1)
                if q == 0: strand_line(f, geo, off - 0.1, 'hair', 4, pid, t0 + 0.02, t1 + 0.04)
            strand_line(f, geo, -0.25 + r1 * 0.3, 'hair', 1, pid, 0.15 + r3 * 0.2, 0.7)
        else:
            strand_line(f, geo, 0.55, 'haird', 4, pid, 0.05, 0.3 + r4 * 0.2)
        # Spitzen: ein Faden spaltet sich ab und läuft dünn aus
        i0 = int(len(Pp) * (0.7 + r1 * 0.08)); base = Pp[i0]
        d = Pp[min(len(Pp) - 1, i0 + 1)] - Pp[i0 - 1]; ang = math.degrees(math.atan2(d[1], d[0]))
        if far or jj % 2: continue
        for q in range(1):
            sgn = 1 if jj % 4 else -1
            oo = (base[0] + nrm[i0, 0] * wd[i0] * 0.3 * sgn, base[1] + nrm[i0, 1] * wd[i0] * 0.3 * sgn)
            Lw = (L * 0.16 + hash2(jj, q, 11) * 10) * (1 + wild * 0.3)
            def wb(s, fr, q=q, sgn=sgn):
                return math.sin(T * 1.3 + q * 2 + s * 0.16 + ph) * (1.5 + 3 * fr) + sgn * 0.6
            wp = [(x, cap_h(h)) for x, h in path(oo, ang + sgn * 3, Lw, 1.5, wb)]
            ribbon(f, wp, max(2.6, wd[i0] * 0.35), 1.6, mat, tf, line=False)


# ------------------------------------------------------------------------------------------- Unterleib aus Wasser
def veils(f, Pz):
    P = Pz.p; T = P['cloth']
    wx, wh = Pz.T(0, -2)
    for c in (-1, 1):
        tentacle(f, Pz, c)
    n = 11
    for j in range(n):
        u = j / (n - 1)
        tent = False
        x0 = wx - 13 + u * 26
        top = (x0, wh + 2)
        L = wh + 2 - (0 if not tent else 22)
        spread = (u - 0.5) * (66 + 26 * P['veil'])
        pts = []
        for i in range(25):
            v = i / 24
            x = x0 + spread * v * v - P['trail'] * 30 * v * v + math.sin(T + u * 2.4 + v * 3.5) * 5 * v
            h = top[1] - L * v
            if tent:
                c = (1 if j == 9 else -1)
                if v > 0.55:
                    q = (v - 0.55) / 0.45
                    x += c * math.sin(q * 2.2) * 9 * q
                    h += (1 - math.cos(q * 2.2)) * 9 * q
            pts.append((x, max(-1.0, h)))
        mat = 'watd' if j % 2 else 'wat'
        def tf(v, t, j=j, tent=tent):
            k = 3 if v > 0.3 else 2 if v > -0.45 else 1
            if v > 0.78: k = 4
            if t > 0.86 and not tent: k = min(4, k + 1)
            return k
        m, pid, geo = ribbon(f, pts, 14 if not tent else 8, 6 if not tent else 1.5, mat, tf)
        if not tent and 2 <= j <= 8:
            strand_line(f, geo, 0.35, 'foam', 1, pid, 0.18, 0.92)
            if 3 <= j <= 7: strand_line(f, geo, 0.05, 'tg', 2, pid, 0.25, 0.8)
        if tent:
            Pp, nrm, wd, tt = geo
            for i in range(4, len(Pp) - 3, 3):
                X, Y = f.fat(Pp[i, 0] - nrm[i, 0] * wd[i] * 0.25, Pp[i, 1] - nrm[i, 1] * wd[i] * 0.25)
                f.fpx(X, Y, 'foam', 3, under=pid); f.fpx(X + 1, Y + 1, 'watd', 1, under=pid)
        # Gischt unten
        b = pts[-1]
        if not tent:
            for k in range(-2, 3):
                f.fdot(b[0] + k * 0.8, b[1] + 0.6 + (k % 2) * 0.4, 'foam', 3 if abs(k) < 2 else 2, under=pid)


def tentacle(f, Pz, c):
    """Eingerollter Tentakel an der Seite des Wasserleibs (c = -1 hinten, 1 vorn), Saugnäpfe in Feinpixeln."""
    P = Pz.p; T = P['cloth']
    o = Pz.T(c * 12, -30)
    a0 = -90 + c * 52 + math.sin(T + c) * 6
    def bend(s, fr):
        return c * (1.5 + 13.0 * fr ** 2.4) + math.sin(T + s * 0.2) * 0.6
    pts = [(x, max(1.0, h)) for x, h in path(o, a0, 44, 1.0, bend)]
    def tf(v, t):
        k = 3 if v > 0.35 else 2 if v > -0.4 else 1
        if v > 0.8 and t < 0.7: k = 4
        return k
    m, pid, geo = ribbon(f, pts, 9, 1.4, 'watd', tf)
    Pp, nrm, wd, tt = geo
    for i in range(6, len(Pp) - 6, 4):
        X, Y = f.fat(Pp[i, 0] - nrm[i, 0] * wd[i] * 0.28, Pp[i, 1] - nrm[i, 1] * wd[i] * 0.28)
        f.fpx(X, Y, 'foam', 3, under=pid); f.fpx(X + 1, Y, 'foam', 1, under=pid); f.fpx(X, Y + 1, 'watd', 0, under=pid)
    strand_line(f, geo, 0.6, 'wat', 4, pid, 0.05, 0.7)


def skirt(f, Pz):
    P = Pz.p; T = P['cloth']
    n = 10
    for i in range(n):
        u = i / (n - 1)
        x0 = -15 + u * 30
        L = 26 + math.sin(u * 7) * 5 - abs(u - 0.45) * 10
        pts = []
        for k in range(13):
            v = k / 12
            x = x0 + (u - 0.5) * 12 * v - P['trail'] * 14 * v * v + math.sin(T + u * 2.2 + v * 3) * 2.2 * v
            pts.append(Pz.T(x, 1 - L * v))
        sh = 3 if u > 0.75 else 2 if u > 0.35 else 1
        mat = 'robe' if i % 2 == 0 else 'robed'
        def tf(v, t, sh=sh):
            k = sh + (1 if v > 0.5 else 0) - (1 if v < -0.6 else 0)
            if t > 0.8: k -= 1
            return max(1, min(4, k))
        m, pid, geo = ribbon(f, pts, 7.5, 2.5, mat, tf)
        # Goldsaum quer über die Bahn
        Pp, nrm, wd, tt = geo
        gi = int(len(Pp) * 0.32)
        A = Pp[gi] + nrm[gi] * wd[gi] / 2; B = Pp[gi] - nrm[gi] * wd[gi] / 2
        f.fline(tuple(A), tuple(B), 'gold', 3, under=pid)
        f.fline(tuple(A + [0, -0.5]), tuple(B + [0, -0.5]), 'gold', 2, under=pid)
        if i % 3 == 1:
            ri = int(len(Pp) * 0.55)
            c = Pp[ri]
            X, Y = f.fat(*c)
            for dx, dy, t in ((0, 0, 4), (0, 1, 3), (0, 2, 3), (1, -1, 3), (-1, 2, 2)):
                f.fpx(X + dx, Y + dy, 'tg', t, under=pid)


# ------------------------------------------------------------------------------------------- Rumpf
def relief(f, Pz, pid, hfun, mat, matd, cuts=(0.3, 0.52, 0.74), L=(0.5, 0.55, 0.67)):
    """Feinraster-Schattierung eines Teils aus einem Höhenfeld im Rumpfsystem (x vorn, h oben, in Figurpixeln):
    Normalen aus dem Gradienten, Licht oben vorn (mit der Neigung gedreht), harte Stufen; tiefe Falten dunkler."""
    ys, xs = np.nonzero(f.part == pid)
    if not len(xs): return
    X0, X1 = xs.min() * K - 1, (xs.max() + 1) * K + 1; Y0, Y1 = ys.min() * K - 1, (ys.max() + 1) * K + 1
    Yg, Xg = np.mgrid[Y0:Y1, X0:X1]
    x = (Xg + 0.5) / K - f.FX; h = f.FY - (Yg + 0.5) / K
    a = math.radians(-Pz.lean); dx, dh = x - Pz.w[0], h - Pz.w[1]
    lx = dx * math.cos(a) + dh * math.sin(a); lh = -dx * math.sin(a) + dh * math.cos(a)
    z = hfun(lx, lh)
    gy, gx = np.gradient(z)
    n = np.stack([-gx * K, gy * K, np.ones_like(z)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Lv = np.array(L, float); Lv /= np.linalg.norm(Lv)
    b = math.radians(Pz.lean); Lv = np.array([Lv[0] * math.cos(b) - Lv[1] * math.sin(b), Lv[0] * math.sin(b) + Lv[1] * math.cos(b), Lv[2]])
    d = n @ Lv
    tone = np.select([d < cuts[0], d < cuts[1], d < cuts[2]], [1, 2, 3], 4)
    for yy, xx in zip(*np.nonzero(np.ones_like(d, bool))):
        X, Y = X0 + xx, Y0 + yy
        if not (0 <= X // K < f.W and 0 <= Y // K < f.H) or f.part[Y // K, X // K] != pid: continue
        if d[yy, xx] < cuts[0] - 0.14: f.fpx(X, Y, matd, 2, under=pid)
        else: f.fpx(X, Y, mat, int(tone[yy, xx]), under=pid)

def torso(f, Pz):
    U = Pz.U
    body = f.poly(U([(-10, -3), (-11, 8), (-14, 18), (-18, 27), (-22, 33), (-22, 37), (-15, 41), (-5, 45), (7, 45),
                     (15, 42), (22, 38), (22, 33), (20, 27), (17, 22), (14, 14), (11, 4), (10, -3)]))
    f.put(body, 'robe', fixed=3)
    bid = f.np
    T = Pz.p['cloth']
    def hfun(x, h):
        hw = np.interp(h, [-4, 4, 14, 27, 36, 46], [10, 12.5, 14, 19, 22, 20])
        base = np.sqrt(np.clip(1 - (x / hw) ** 2, 0, 1)) * hw * 0.7
        G = lambda x0, h0, sx, sh: np.exp(-((x - x0) / sx) ** 2 - ((h - h0) / sh) ** 2)
        chest = 1.2 * G(-6, 30, 7, 6) + 1.5 * G(7, 30, 7, 6)
        blouse = 1.6 * np.exp(-((h - 6) / 3.2) ** 2) - 1.4 * np.exp(-((h - 0.5) / 1.6) ** 2)
        phi = np.arctan2(h - 41, x - 13); r = np.hypot(h - 41, x - 13)
        sw = np.sin(phi * 7 + T * 0.6 + r * 0.04)
        drape = 2.2 * np.sign(sw) * np.abs(sw) ** 0.5 * np.clip((r - 6) / 10, 0, 1) * np.clip((46 - r) / 12, 0, 1) * (x > -18)
        gw = np.sin(x * 0.7 + h * 0.15 + T * 0.4)
        gath = 1.0 * np.sign(gw) * np.abs(gw) ** 0.5 * np.exp(-((h - 8) / 6) ** 2)
        return base + chest + blouse + drape + gath
    relief(f, Pz, bid, hfun, 'robe', 'robed')
    # Ausschnitt: fahle Haut, Schlüsselbeine
    neck = f.poly(U([(-5, 45), (8, 45), (4, 33), (1, 31)]))
    f.put(neck, 'skin', shade='vcyl', cut=(0.3, 0.6), line=True)
    nid = f.np
    f.fline(Pz.T(-4, 42.5), Pz.T(0, 41.5), 'skinh', 4, under=nid)
    f.fline(Pz.T(2, 41.5), Pz.T(6, 42.5), 'skin', 4, under=nid)
    f.fline(Pz.T(2, 39), Pz.T(2, 35), 'skin', 2, under=nid)
    # Goldsaum am Ausschnitt
    for a, b in (((-6, 45.5), (1, 30.5)), ((9, 45.5), (4, 32))):
        m = f.seg(Pz.T(*a), Pz.T(*b), 1.6, 1.6)
        f.put(m, 'gold', fixed=3, line=False)
    f.fline(Pz.T(-6, 45), Pz.T(1, 31), 'gold', 4)
    # Schärpe (hintere Schulter -> vordere Hüfte)
    sash = f.seg(Pz.T(-17, 37), Pz.T(13, 4), 4.2, 3.6)
    f.put(sash, 'gold', cut=(0.3, 0.7))
    sid = f.np
    f.fline(Pz.T(-16, 38.5), Pz.T(13.5, 5.6), 'gold', 4, under=sid)
    f.fline(Pz.T(-17.5, 35.5), Pz.T(12, 2.2), 'gold', 1, under=sid)
    # Gürtel mit Muschel-Medaillon und Perle
    belt = f.poly(U([(-13, -3), (13, -3), (13.5, 1.5), (-13, 1.5)]))
    f.put(belt, 'gold', shade='vcyl', cut=(0.3, 0.6))
    beid = f.np
    f.fline(Pz.T(-12, 1.2), Pz.T(13, 1.2), 'gold', 4, under=beid)
    sc = Pz.T(5, -1)
    shell = f.ell(sc[0], sc[1] + 0.5, 4, 3.6) & ~f.poly([(sc[0] - 9, sc[1] - 9), (sc[0] + 9, sc[1] - 9), (sc[0] + 9, sc[1] - 2.2), (sc[0] - 9, sc[1] - 2.2)])
    f.put(shell, 'gold', shade='ball', dcuts=(0.2, 0.5, 0.8))
    shid = f.np
    for a in (110, 90, 70, 50, 130):
        A = pol(a, 0.8, (sc[0], sc[1] - 1.5)); B = pol(a, 4.0, (sc[0], sc[1] - 1.5))
        f.fline(A, B, 'gold', 1, under=shid)
    pc = (sc[0], sc[1] - 3.8)
    f.put(f.ell(pc[0], pc[1], 1.8, 1.8), 'pearl', shade='ball', dcuts=(0.1, 0.4, 0.75))
    f.fdot(pc[0] + 0.4, pc[1] + 0.6, 'white', 4)
    # Runen auf der Robe (Leuchtglyphen, feiner Kern)
    for k, h in ((-6, 12), (6, 20), (-3, 28)):
        X, Y = f.fat(*Pz.T(k, h))
        rune = ['.a.', 'aEa', '.a.', '.ab', '..b']
        for j, row in enumerate(rune):
            for i, ch in enumerate(row):
                if ch == '.': continue
                f.fpx(X + i, Y + j, 'tg', {'E': 4, 'a': 3, 'b': 2}[ch], under=bid)
    return body


# ------------------------------------------------------------------------------------------- Arme
def sleeve(f, a, b, w0, w1, mat):
    return f.put(f.seg(a, b, w0, w1), mat, cut=(0.3, 0.62))


def bell(f, sh, el, mat, P, ph=0.0):
    """Weiter Glockenärmel bis kurz vor den Ellbogen; Saum öffnet sich und weht in langen Fetzen nach hinten unten
    (Wasser hebt ihn, Wellenbewegung läuft durch). Ellbogen bleibt sichtbar (Haut, Kugelschattierung)."""
    dx, dh = el[0] - sh[0], el[1] - sh[1]; L = math.hypot(dx, dh) or 1
    ux, uh = dx / L, dh / L
    nx, nh = -uh, ux
    T = P['cloth'] + ph
    # Oberarm (Haut) und Ellbogen unter dem Ärmel
    limb(f, lerp(sh, el, 0.55), el, 6.4, 6.0, 'skin', hi=0.45)
    f.put(f.ell(el[0], el[1], 3.4, 3.4), 'skin', shade='ball', dcuts=(0.05, 0.4, 0.78))
    end = lerp(sh, el, 0.8)
    _, sid, _ = limb(f, sh, end, 10.5, 15.5, mat, hi=0.4)
    # Fetzen vom Saum: lange, spitz auslaufende Bänder, nach hinten unten treibend
    for i in range(6):
        k = (i - 2.5) / 2.5
        o = (end[0] + nx * k * 7.2 - ux * 1.5, end[1] + nh * k * 7.2 - uh * 1.5)
        a0 = -96 - P['trail'] * 30 + P['lift'] * 14 + k * 8 + (8 if ux < 0 else -6)
        Lf = 13 + (2.5 - abs(i - 2.5)) * 3.2 + (i * 7 % 5) + P['lift'] * 4
        def bend(s_, fr, i=i):
            return math.sin(T * 1.0 + i * 1.3 + s_ * 0.3) * (2 + 7 * fr) - 3 * fr * (1 if a0 < -90 else -1)
        pts = path(o, a0, Lf, 1.0, bend)
        def tf(v, t, i=i):
            kk = 3 if v > 0.3 else 2 if v > -0.4 else 1
            if v > 0.7 and t < 0.5: kk = 4
            if i % 2: kk = max(1, kk - 1)
            return kk
        m, pid, geo = ribbon(f, pts, 5.4 - abs(k) * 0.8, 0.8, mat, tf)
        if i % 2 == 0: strand_line(f, geo, 0.55, mat, 4, pid, 0.05, 0.55)
    rim_ = f.seg((end[0] + nx * 8, end[1] + nh * 8), (end[0] - nx * 8, end[1] - nh * 8), 2.2, 2.2)
    f.put(rim_, 'gold' if mat == 'robe' else 'goldd', fixed=3, line=False)
    f.fline((end[0] + nx * 7.5 + ux * 0.6, end[1] + nh * 7.5 + uh * 0.6), (end[0] - nx * 7.5 + ux * 0.6, end[1] - nh * 7.5 + uh * 0.6),
            'gold' if mat == 'robe' else 'goldd', 4)


def grip(f, el, hand, ang):
    """Hand umgreift den Schaft: Handrücken, vier Finger quer über den Schaft (Knöchellicht), Daumen darüber."""
    a = math.radians(ang); u = (math.cos(a), math.sin(a)); v = (-u[1], u[0])
    dx, dh = hand[0] - el[0], hand[1] - el[1]; L = math.hypot(dx, dh) or 1
    d = (dx / L, dh / L)
    s = 1 if (-d[0] * v[0] - d[1] * v[1]) > 0 else -1          # Seite, von der die Hand kommt
    Q = lambda uu, vv: (hand[0] + u[0] * uu + v[0] * vv * s, hand[1] + u[1] * uu + v[1] * vv * s)
    sg = 1 if (d[0] * u[0] + d[1] * u[1]) >= 0 else -1        # Daumen zeigt in Unterarmrichtung längs des Schafts
    wr = (hand[0] - d[0] * 4.0, hand[1] - d[1] * 4.0)
    back = f.seg(wr, Q(0, 3.0), 4.8, 8.4) | f.poly([Q(-5.2, 3.8), Q(5.2, 3.8), Q(5.4, 1.2), Q(-5.4, 1.2)])
    f.put(back, 'skin', shade='ball', dcuts=(0.0, 0.3, 0.68))
    bid = f.np
    fm = np.zeros((f.H, f.W), bool)
    offs = [(k - 1.5) * 2.7 * sg for k in range(4)]
    for k, o in enumerate(offs):
        ln = 3.3 - abs(k - 1.2) * 0.25
        fm |= f.seg(Q(o, 2.0), Q(o * 0.96, -ln), 3.0, 2.6)
    f.put(fm, 'skin', fixed=3)
    fid = f.np
    for k, o in enumerate(offs):
        ln = 3.3 - abs(k - 1.2) * 0.25
        if k < 3:
            g = o + 1.35 * sg
            f.fline(Q(g, 1.4), Q(g * 0.96, -ln + 0.4), 'skin', 1, under=fid)
        f.fline(Q(o - 0.5 * sg, 1.6), Q(o * 0.96 - 0.5 * sg, -ln + 0.8), 'skin', 4, under=fid)
        f.fdot(*Q(o, 2.3), 'skinh', 4, under=fid); f.fdot(*Q(o + 0.5, 2.3), 'skinh', 4, under=fid)
        f.fline(Q(o - 1.0, -ln + 0.3), Q(o + 1.0, -ln + 0.3), 'skin', 2, under=fid)
    f.fline(Q(-4.6, 3.2), Q(4.6, 3.2), 'skinh', 4, under=bid)
    th = f.seg(Q(-4.6 * sg, 3.0), Q(-6.6 * sg, -0.6), 3.0, 2.4)
    th |= f.seg(Q(-6.6 * sg, -0.6), Q(-4.2 * sg, -2.4), 2.4, 2.0)
    f.put(th, 'skin', fixed=3)
    tid = f.np
    f.fline(Q(-5.0 * sg, 2.4), Q(-6.4 * sg, 0.0), 'skinh', 4, under=tid)


def arm_back(f, Pz):
    P = Pz.p
    sh = Pz.T(-15, 37)
    hand = P['hB']
    el = ik(sh, hand, 24, 23, bend=1 if hand[0] < sh[0] else -1)
    bell(f, sh, el, 'robed', P)
    limb(f, el, hand, 6, 4.5, 'skin', hi=0.6)
    open_hand(f, el, hand, P['openB'], far=True)
    return el


def open_hand(f, el, hand, op, far=False):
    dx, dh = hand[0] - el[0], hand[1] - el[1]; L = math.hypot(dx, dh) or 1
    ux, uh = dx / L, dh / L
    palm = f.ell(hand[0] + ux * 1.5, hand[1] + uh * 1.5, 3.4, 3.4)
    f.put(palm, 'skin', shade='ball', dcuts=(0.0, 0.35, 0.72))
    a0 = math.degrees(math.atan2(uh, ux))
    for k, (da, Lf) in enumerate(((-38 * op - 8, 6.5), (-12 * op, 8), (12 * op, 8.5), (32 * op + 6, 7.5))):
        b = pol(a0 + da, Lf, (hand[0] + ux * 2, hand[1] + uh * 2))
        f.put(f.seg((hand[0] + ux * 2, hand[1] + uh * 2), b, 1.9, 1.1), 'skin', cut=(0.3, 0.6), line=False)
    # Daumen
    th = pol(a0 + 70, 5.5, hand)
    f.put(f.seg(hand, th, 2.2, 1.3), 'skin', cut=(0.3, 0.6), line=False)


def trident(f, hand, ang, P):
    """Dreizack: Griff in der Hand, ang = Richtung zur Gabel (Grad). Gibt Spitze, Perle und Bahnpunkte zurück."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a)
    vx, vh = -uh, ux
    Q = lambda u, v: (hand[0] + ux * u + vx * v, hand[1] + uh * u + vh * v)
    LO, HI = -44, 52
    # Schaft
    _, sid, _ = limb(f, Q(LO, 0), Q(HI, 0), 3.8, 3.6, 'bronze', hi=0.35)
    f.fline(Q(LO + 2, 0.9), Q(HI - 2, 0.9), 'bronze', 4, under=sid)
    f.fline(Q(-3, 1.0), Q(6, 1.0), 'white', 4, under=sid)
    # Schaftspitze
    f.put(f.poly([Q(LO - 6, 0), Q(LO, -2.4), Q(LO, 2.4)]), 'gold', fixed=3)
    # Ringe
    for r in (LO + 3, -12, 14, HI - 3):
        f.put(f.seg(Q(r - 1, 0), Q(r + 1, 0), 5.2, 5.2), 'gold', shade='ball', dcuts=(0.15, 0.45, 0.8))
    # Algen-Wickel am Schaft
    for k, s in enumerate(range(22, 40, 3)):
        X, Y = f.fat(*Q(s, -1.6 + (k % 2)))
        f.fpx(X, Y, 'alg', 3); f.fpx(X + 1, Y + 1, 'alg', 2)
    fr = f.poly([Q(26, -2.5), Q(31, -6), Q(33, -5), Q(29, -1)])
    f.put(fr, 'alg', fixed=2)
    # Gabel: Halbmond-Querbalken, dessen Enden zu den Seitenzinken aufsteigen; Mittelzinke als Speerblatt
    def arc_pts(sg):
        return [Q(HI + 1, 0), Q(HI + 2.5, sg * 5), Q(HI + 5, sg * 9), Q(HI + 9, sg * 11.5), Q(HI + 15, sg * 12.5), Q(HI + 22, sg * 11.6)]
    tips = []
    for sg in (-1, 1):
        pts = arc_pts(sg)
        def tf(v, t):
            k = 3 if v > 0.25 else 2 if v > -0.45 else 1
            if v > 0.75: k = 4
            return k
        m, pid, geo = ribbon(f, pts, 4.6, 2.2, 'gold', tf)
        strand_line(f, geo, 0.55, 'gold', 4, pid, 0.1, 0.9)
        tip = pts[-1]
        # Spitze mit Widerhaken nach außen
        tp = Q(HI + 27, sg * 10.8)
        f.put(f.poly([Q(HI + 20, sg * 13.2), tp, Q(HI + 20, sg * 10.2)]), 'gold', fixed=3)
        f.put(f.poly([Q(HI + 18, sg * 12.4), Q(HI + 16, sg * 16), Q(HI + 21, sg * 12.8)]), 'gold', fixed=2)
        f.fdot(*tp, 'white', 4)
        tips.append(tp)
    # Mittelzinke: Schaft, Blatt, Widerhaken
    f.put(f.seg(Q(HI, 0), Q(HI + 22, 0), 3.4, 2.6), 'gold', cut=(0.3, 0.6))
    blade = f.poly([Q(HI + 19, 0), Q(HI + 23, -3.4), Q(HI + 26, -2.6), Q(HI + 35, 0), Q(HI + 26, 2.6), Q(HI + 23, 3.4)])
    f.put(blade, 'gold', shade='ball', dcuts=(0.1, 0.42, 0.75))
    bid = f.np
    f.fline(Q(HI + 21, 0.6), Q(HI + 33, 0.3), 'gold', 4, under=bid)
    f.fline(Q(HI + 21, -0.8), Q(HI + 32, -0.4), 'gold', 1, under=bid)
    tip = Q(HI + 35, 0)
    f.fdot(*tip, 'white', 4)
    tips.append(tip)
    # Perle in der Gabel
    pr = 2.6 + P['pearl'] * 0.4
    pc = Q(HI + 10.5, 0)
    f.put(f.ell(pc[0], pc[1], pr, pr), 'pearl', shade='ball', dcuts=(0.05, 0.4, 0.78), line=False)
    pid = f.np
    f.fdot(pc[0] + pr * 0.45, pc[1] + pr * 0.45, 'white', 4, under=pid)
    f.fdot(pc[0] + pr * 0.45 + 0.5, pc[1] + pr * 0.45, 'white', 4, under=pid)
    f.fdot(pc[0] - pr * 0.4, pc[1] - pr * 0.5, 'pearl', 1, under=pid)
    return dict(tip=tips[2], pearl=pc, pr=pr, butt=Q(LO - 6, 0), Q=Q)


def arm_front(f, Pz, tri_ang, mode='beide'):
    """mode: 'beide' (Arm, dann Dreizack), 'stab' (nur Dreizack), 'arm' (nur Arm und Hand)."""
    P = Pz.p
    sh = Pz.T(14, 37)
    hand = P['hF']
    el = ik(sh, hand, 24, 23, bend=-1 if hand[1] < sh[1] + 10 else 1)
    def armparts():
        bell(f, sh, el, 'robe', P, 1.3)
        wr = lerp(el, hand, 0.82)
        _, aid, _ = limb(f, lerp(el, hand, -0.04), wr, 6.4, 4.2, 'skin', hi=0.4)
        f.put(f.ell(*lerp(el, hand, 0.22), 3.7, 3.7) & f.seg(el, wr, 7.6, 7.6), 'skin', fixed=3, line=False)
        f.fline(lerp(el, hand, 0.12), lerp(el, hand, 0.55), 'skinh', 4)
        f.fline(lerp(el, hand, 0.3), lerp(el, hand, 0.7), 'skin', 4)
        bx = lerp(el, hand, 0.6)
        dx, dh = hand[0] - el[0], hand[1] - el[1]; L = math.hypot(dx, dh) or 1
        f.put(f.seg((bx[0] - dx / L * 1.4, bx[1] - dh / L * 1.4), (bx[0] + dx / L * 1.4, bx[1] + dh / L * 1.4), 7, 7), 'gold', shade='ball', dcuts=(0.12, 0.45, 0.78))
        # Muschelspange an der Schulter
        c = Pz.T(14, 40)
        sp = f.ell(c[0], c[1], 6, 4.5)
        f.put(sp, 'gold', shade='ball', dcuts=(0.2, 0.5, 0.8))
        spid = f.np
        for a in (40, 70, 100, 130):
            f.fline(pol(a, 1, (c[0], c[1] - 3)), pol(a, 7, (c[0], c[1] - 3)), 'gold', 1, under=spid)
        f.put(f.ell(c[0] + 1, c[1] + 0.5, 1.6, 1.6), 'pearl', shade='ball', line=False)
        f.fdot(c[0] + 1.5, c[1] + 1, 'white', 4)
    tri = None
    if mode == 'hinten': tri = trident(f, hand, tri_ang, P)
    if mode in ('beide', 'arm', 'hinten'): armparts()
    if mode in ('beide', 'stab'): tri = trident(f, hand, tri_ang, P)
    if mode == 'stab': return tri
    grip(f, el, hand, tri_ang)
    return tri


# ------------------------------------------------------------------------------------------- Kopf (Feinraster)
HRX, HRH = 10.2, 13.6
HEADUP = HRH + 3.4          # Kopfmitte über dem Halsansatz (Rumpfpunkt 3, 46)


def head_center(Pz):
    P = Pz.p; n = Pz.T(3, 46)
    return n[0] + 2 + P['head'], n[1] + HEADUP + P['headY']


def head_shape(u, v):
    """Kopfumriss (Gesicht 3/4 nach rechts): Ei mit hohen Wangenknochen, schmalem Kiefer, spitzem Kinn."""
    w = np.where(v < -0.1, np.clip(1 - (-v - 0.1) * 0.62, 0.3, 1), 1.0)
    w = w * np.where((v < -0.1) & (u > 0), 1.04, 1.0)
    uu = u / w
    return uu * uu + v * v <= 1


def head_fine(f, cx, ch, P, hid):
    """Gesicht im Feinraster aus einem Höhenfeld (Ellipsoid + Nasenrücken, Brauenbogen, tiefe Augenhöhlen, hohe
    Wangenknochen, eingefallene Wangen, Lippen, Kinn) mit Licht von oben vorn rechts in harten Stufen; darüber
    leuchtende Augen mit hellem Kern und Glanz, feine Brauen, Nasenrücken-Licht, Mund, leuchtende Tränenspur."""
    RX, RH = HRX, HRH
    X0, Y0 = f.fat(cx - RX - 1, ch + RH + 1)
    X1, Y1 = f.fat(cx + RX + 1, ch - RH - 1)
    Yg, Xg = np.mgrid[Y0:Y1 + 1, X0:X1 + 1]
    x = (Xg + 0.5) / K - f.FX; h = f.FY - (Yg + 0.5) / K
    u = (x - cx) / RX; v = (h - ch) / RH
    inside = head_shape(u, v)
    G = lambda u0, v0, su, sv: np.exp(-((u - u0) / su) ** 2 - ((v - v0) / sv) ** 2)
    base = np.sqrt(np.clip(1 - u * u - v * v, 0, 1))
    ridge_u = 0.2 + (0.12 - v) * 0.18                              # Nasenrücken läuft leicht nach vorn
    nose = 0.22 * np.exp(-((u - ridge_u) / 0.075) ** 2) * np.exp(-((v + 0.1) / 0.24) ** 4)
    hf = (base + nose + 0.12 * G(0.32, -0.33, 0.1, 0.07)          # Nasenspitze
          + 0.07 * G(0.05, 0.36, 0.55, 0.07)                       # Brauenbogen
          - 0.24 * G(-0.4, 0.16, 0.2, 0.11) - 0.2 * G(0.58, 0.16, 0.15, 0.1)   # Augenhöhlen
          + 0.12 * G(-0.55, -0.08, 0.2, 0.07) + 0.1 * G(0.7, -0.08, 0.12, 0.07)  # Wangenknochen
          - 0.14 * G(-0.48, -0.38, 0.17, 0.14) - 0.08 * G(0.62, -0.4, 0.12, 0.12)  # eingefallene Wangen
          + 0.05 * G(0.14, -0.56, 0.16, 0.05) + 0.09 * G(0.14, -0.86, 0.14, 0.08))  # Lippen, Kinn
    gy, gx = np.gradient(hf)
    sc = 6.0
    nx_, ny_ = -gx * sc, gy * sc                                   # Bildzeile nach unten -> v nach oben
    n = np.stack([nx_, ny_, np.ones_like(hf)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array([0.5, 0.55, 0.67]); L /= np.linalg.norm(L)
    d = n @ L
    sock = G(-0.4, 0.16, 0.2, 0.11) * 0.24 + G(0.58, 0.16, 0.15, 0.1) * 0.2
    tone = np.select([d < 0.34, d < 0.55, d < 0.74, d < 0.9], [1, 2, 3, 4], 5)
    tone = np.where(sock > 0.14, np.minimum(tone, 2), tone)
    for (yy, xx) in zip(*np.nonzero(inside)):
        t = int(tone[yy, xx]); X, Y = X0 + xx, Y0 + yy
        if sock[yy, xx] > 0.19: f.fpx(X, Y, 'sock', 3, under=hid)
        elif t == 5: f.fpx(X, Y, 'skinh', 4, under=hid)
        else: f.fpx(X, Y, 'skin', t, under=hid)
    def F(u_, v_): return f.fat(cx + u_ * RX, ch + v_ * RH)
    def put(u_, v_, rows, leg):
        X, Y = F(u_, v_)
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c in leg: f.fpx(X + i, Y + j, *leg[c], under=hid)
    LEG = {'K': ('sock', 0), 'k': ('sock', 1), 's': ('sock', 2), 'b': ('hair', 1), 'B': ('hair', 0),
           'W': ('white', 4), 'E': ('tg', 4), 'e': ('tg', 3), 'i': ('tg', 2), 'I': ('tg', 1),
           '1': ('skin', 1), '2': ('skin', 2), '3': ('skin', 3), '4': ('skin', 4), 'H': ('skinh', 4),
           'l': ('lip', 1), 'L': ('lip', 2), 'm': ('lip', 0), 'p': ('lip', 3), 'q': ('lip', 4), 'o': ('sock', 0)}
    # Brauen: hoch gewölbt, fein; nahe Braue länger
    put(-0.74, 0.43, ['...bbbbb....', '.bbB...Bbb..', 'b.........b.'], LEG)
    put(0.38, 0.42, ['.bbbbb.', 'b....Bb'], LEG)
    if P['eye'] > 0.15:
        # nahes Auge (mandelförmig, schräg), fernes schmaler; Leuchtkern weiß, Iris türkis, dunkler Lidrand
        put(-0.66, 0.27, ['...KKKKKKK...', '.KKkIieeiIkK.', 'KkIeEWWWEeiIk', 'KkieEWWEEeiik', '.kkiieeeiiIk.', '..kkkkkkkkk..', '....3333.....'], LEG)
        put(0.38, 0.26, ['.KKKKKKK.', 'KIieWWeiK', 'kieEWWEik', '.kiieeiik', '..kkkkkk.'], LEG)
        if P['eye'] > 0.7:
            put(-0.46, -0.05, ['i', 'e', 'i', 'I', 'i', '.', 'I', 'i', '.', 'I'], LEG)
    else:
        put(-0.66, 0.2, ['KKKKKKKKK', '.11111111'], LEG)
        put(0.38, 0.19, ['KKKKKKK', '.11111.'], LEG)
    # Nasenrücken-Licht, Spitze, Nasenflügel und Schatten auf der Lichtabseite
    X, Y = F(0.2, 0.16)
    for k in range(13):
        uu = 0.2 + (0.12 - (0.16 - k / 2 / K / RH * 2)) * 0.18
        f.fpx(F(uu + 0.02, 0)[0], Y + k, 'skinh', 4, under=hid)
        if k > 3: f.fpx(F(uu + 0.02, 0)[0] - 1, Y + k, 'skin', 2, under=hid)
    put(0.16, -0.25, ['..3H4', '.2344', 'o1o2.'], LEG)
    # Mund: schmal, Mundwinkel fallen leicht ab (unheimlich ernst); offen beim Schrei
    jaw = P['jaw']
    if jaw < 0.3:
        put(-0.14, -0.49, ['...lLLLll...', '.mmmmmmmmmm.', 'm..lpqqpl..m', '....2222....'], LEG)
    else:
        n_ = int(2 + jaw * 4)
        rows = ['..lLLLLLl...', '.mWWWWWWWm..'] + ['.mooooooom..'] * n_ + ['..moooooom..', '...lpqqpl...', '....2222....']
        put(-0.14, -0.49, rows, LEG)
    # Kinnlicht, Kieferkante
    put(0.04, -0.84, ['.444.', '..3..'], LEG)
    return F


def head(f, Pz):
    """Kopf: Haar hinten, Gesicht (Feinraster), Haarkappe mit Scheitel, nasse Locken neben dem Gesicht,
    Goldreif mit Korallenästen und Perle. Gibt (Kopfmitte, Kronenspitzen) zurück."""
    P = Pz.p
    cx, ch = head_center(Pz)
    sx, sy = HRX / 8.2, HRH / 11.6
    Hd = lambda dx, dh: (cx + dx * sx, ch + dh * sy)
    limb(f, Pz.T(2, 42), (cx - 1, ch - HRH * 0.55), 8, 7.5, 'skin', hi=0.5)
    # Haarmasse hinter dem Kopf
    hb = f.poly([Hd(-9, 7), Hd(-5, 12.5), Hd(3, 13.5), Hd(8, 10), Hd(6, 5), Hd(-1, 4), Hd(-5, -4), Hd(-6, -14), Hd(-11, -18), Hd(-12, -6)])
    f.put(hb, 'hair', shade='ball', dcuts=(0.2, 0.55, 0.85))
    # Gesicht
    Y, X = np.mgrid[0:f.H, 0:f.W]
    u = (X + 0.5 - f.FX - cx) / HRX; v = (f.FY - Y - 0.5 - ch) / HRH
    face = head_shape(u, v)
    f.put(face, 'skin', fixed=3)
    hid = f.np
    head_fine(f, cx, ch, P, hid)
    # Haarkappe über der Stirn mit Scheitel und Strähnen
    cap = f.poly([Hd(-9.6, 3), Hd(-9, 9), Hd(-5, 12.8), Hd(2, 13.4), Hd(7.5, 10.5), Hd(8.8, 6.5), Hd(5, 8.4), Hd(1, 9), Hd(-3, 8), Hd(-6.6, 5), Hd(-8, 2)])
    f.put(cap, 'hair', shade='ball', dcuts=(0.25, 0.55, 0.82))
    cid = f.np
    for k in range(6):
        a = Hd(-7.5 + k * 2.4, 12.6 - abs(k - 2) * 0.3); b = Hd(-8.4 + k * 2.9, 6.5 + k * 0.5)
        f.fline(a, b, 'hair', 4 if k % 2 else 1, under=cid)
    # nasse Locken neben dem Gesicht (gewellt, spitz auslaufend)
    def lock(o, a0, L, w0, side):
        pts = path(o, a0, L, 0.8, lambda s_, fr: side * math.sin(s_ * 0.35 + P['hairT']) * 4 * (0.3 + fr))
        def tf(v_, t):
            k = 3 if v_ > 0.35 else 2 if v_ > -0.4 else 1
            if v_ > 0.75 and t < 0.6: k = 4
            return k
        m, pid, geo = ribbon(f, pts, w0, 0.8, 'hair', tf)
        strand_line(f, geo, 0.55, 'hair', 4, pid, 0.05, 0.6)
    lock(Hd(-8.4, 6), -88, HRH * 1.55, 3.6, 1)
    lock(Hd(-9.6, 3), -96, HRH * 1.9, 3.2, -1)
    lock(Hd(8.4, 6.5), -84, HRH * 0.95, 2.2, 1)
    # Krone
    band = f.poly([Hd(-8.5, 9.5), Hd(-8, 12.5), Hd(1, 14.4), Hd(8.6, 11.6), Hd(8.6, 8.6), Hd(1, 11.2)])
    f.put(band, 'gold', shade='vcyl', cut=(0.25, 0.6))
    bid = f.np
    f.fline(Hd(-8, 12), Hd(1, 14), 'gold', 4, under=bid)
    f.fline(Hd(1, 14), Hd(8.4, 11.4), 'gold', 4, under=bid)
    tips = []
    for i, (bx, L, a, side_) in enumerate(((-6.5, 10, 106, -1), (-2.5, 14.5, 97, -1), (1.5, 19, 88, 1), (5.2, 13.5, 78, 1), (8, 9, 64, 1))):
        b0 = Hd(bx, 12.5 + (0.6 if 0 < bx < 3 else 0) - (1.0 if bx > 6 else 0))
        pts = [b0]; aa = a; x_, h_ = b0
        for s_ in range(int(L)):
            aa += math.sin(s_ * 1.1 + i * 2) * 5
            x_ += math.cos(math.radians(aa)); h_ += math.sin(math.radians(aa))
            pts.append((x_, cap_h(h_, HMAX - 6, 4)))
        def tf(v_, t):
            k = 3 if v_ > 0.2 else 2 if v_ > -0.5 else 1
            if t > 0.8: k = min(4, k + 1)
            return k
        m, pid, geo = ribbon(f, pts, 3.6, 1.2, 'coral', tf, line=True)
        strand_line(f, geo, 0.45, 'coral', 4, pid, 0.1, 0.9)
        tip = pts[-1]
        f.fdot(*tip, 'coral', 4); f.fdot(tip[0], tip[1] + 0.5, 'skinh', 4)
        tips.append(tip)
        k0 = int(len(pts) * 0.5)
        sb = path(pts[k0], aa + 38 * side_ * (-1), L * 0.42, 1.0, lambda s_, fr, i=i: 4 * side_)
        ribbon(f, sb, 2.2, 1.0, 'coral', tf, line=True)
        f.fdot(*sb[-1], 'coral', 4)
        for j in range(2, len(pts) - 2, 3):
            f.fdot(pts[j][0] - 0.4, pts[j][1], 'coral', 1, under=pid)
    pc = Hd(1.2, 12.8)
    f.put(f.ell(pc[0], pc[1], 2.4, 2.4), 'pearl', shade='ball', dcuts=(0.05, 0.4, 0.78))
    f.fdot(pc[0] + 0.8, pc[1] + 0.8, 'white', 4)
    return (cx, ch), tips


def hair_front(f, Pz, head_c):
    P = Pz.p
    cx, ch = head_c
    for j in range(2):
        o = (cx - 8.5 + j * 1.5, ch - 1 - j * 3)
        a0 = -100 - j * 6 + P['lift'] * 30
        L = 30 + j * 10 + P['wild'] * 10
        def bend(s, fr, j=j):
            return math.sin(P['hairT'] + s * 0.09 + j) * (0.8 + 3 * fr) * (1 + P['wild']) + 0.4
        pts = path(o, a0, L, 1.5, bend)
        def tf(v, t):
            k = 3 if v > 0.3 else 2 if v > -0.4 else 1
            if t > 0.8: k -= 1
            return max(1, k)
        m, pid, geo = ribbon(f, pts, 6.5 - j * 1.5, 1.2, 'hair', tf)
        strand_line(f, geo, 0.5, 'hair', 4, pid, 0.05, 0.6)


# ------------------------------------------------------------------------------------------- Perlenschein (ohne Umriss)
def halo(im, c, r, lv):
    """Gestufter Schein um die Perle (Feinraster, harte Ringe), nur auf leeren Pixeln. lv 0..2."""
    if lv <= 0: return im
    cx, cy = K * (FX + c[0]), K * (FY0 - c[1])
    R = K * (r + 2.5 + lv * 2.2)
    Y, X = np.mgrid[0:im.shape[0], 0:im.shape[1]]
    d = np.hypot(X + 0.5 - cx, Y + 0.5 - cy)
    empty = im[:, :, 3] == 0
    rings = [(R, TG[0]), (R - K * 1.6, TG[1]), (R - K * 3.0, TG[2])]
    for rr, col in rings:
        sel = empty & (d < rr) & ((d >= rr - K * 1.6) | (rr == rings[-1][0]))
        sel &= ((X + Y) % 2 == 0) | (rr < R)
        im[sel] = (*hexc(col), 255)
    if lv >= 2:
        # Strahlenstern
        for k in range(int(K * (r + 10 + lv * 4))):
            for dx, dy, q in ((1, 0, 1), (-1, 0, 1), (0, -1, 1.3), (0, 1, 0.8)):
                x, y = int(cx + dx * k * q), int(cy + dy * k * q)
                if 0 <= x < im.shape[1] and 0 <= y < im.shape[0] and im[y, x, 3] == 0:
                    im[y, x] = (*hexc(TG[4] if k < K * (r + 4) else TG[3] if k < K * (r + 9) else TG[2]), 255)
    return im


# ------------------------------------------------------------------------------------------- Bild einer Pose
def figure(p, smear_from=None):
    Pz = Pose(p); P = Pz.p
    head_c = head_center(Pz)
    # hinten: Haar, hinterer Arm, Wasserleib, Robe
    fa = new()
    hair_back(fa, Pz, head_c)
    arm_back(fa, Pz)
    veils(fa, Pz)
    skirt(fa, Pz)
    torso(fa, Pz)
    A = fa.render(outline=OUT, rim=RIM_F, rim_back=RIM_B)
    # Kopf
    if P['behind']:
        # Dreizack über die hintere Schulter geholt: hinter Kopf und Arm
        ft = new()
        tri = arm_front(ft, Pz, P['staff'], 'hinten')
        A = over(A, ft.render(outline=OUT, rim=RIM_F, rim_back=RIM_B))
    fb = new()
    hc, tips = head(fb, Pz)
    B_ = fb.render(outline=OUT, rim=RIM_F, rim_back=RIM_B)
    # vorn: Strähnen, Arm, Dreizack
    fc = new()
    hair_front(fc, Pz, hc)
    if not P['behind']: tri = arm_front(fc, Pz, P['staff'])
    C = fc.render(outline=OUT, rim=RIM_F, rim_back=RIM_B)
    im = over(over(A, B_), C)
    lv = 2 if P['cast'] > 0.6 else 1
    halo(im, tri['pearl'], tri['pr'], lv)
    im[GROUND * K:] = 0
    return im, tri


# ------------------------------------------------------------------------------------------- Gischtsichel
def smear(p0, p1, n=160):
    """Gischtsichel als runder Bogen um die Hand der Endpose (Radius = Zinkenspitze), vom Winkel der Ausholpose bis zum
    Endwinkel;
    Sichel wächst vom alten Ende (spitz, gerastert) zum neuen (breit, rund): außen weiß, dann hellblau, innen tiefblau.
    Unter der Hallendecke der Figur (HMAX) läuft sie dünn aus statt abgeschnitten zu werden."""
    q0, q1 = Pose(p0).p, Pose(p1).p
    cx, ch = q1['hF']; R = 89.0
    a0 = math.radians(q0['staff'] + 14); a1 = math.radians(q1['staff'])
    span = a1 - a0
    Y, X = np.mgrid[0:H, 0:W]
    x = X + 0.5 - FX; h = FY0 - Y - 0.5
    phi = np.arctan2(h - ch, x - cx)
    phi = a0 + ((phi - a0) * np.sign(span)) % (2 * math.pi) * np.sign(span)
    t = (phi - a0) / span
    r = np.hypot(x - cx, h - ch)
    TH = 20.0
    th = TH * np.clip(t, 0, 1) ** 0.9 * np.clip((HMAX - 3 - h) / 10, 0, 1)
    rad = (r - (R + 1.5 - th)) / np.maximum(th, 0.5)
    m = (t >= 0) & (t <= 1.02) & (rad >= 0) & (rad <= 1) & (th > 0.6)
    out = np.zeros((H, W, 4), np.uint8)
    for y, xx in zip(*np.nonzero(m)):
        tt = t[y, xx]; rr = rad[y, xx]
        lv = 6 if rr > 0.82 else 5 if rr > 0.6 else 4 if rr > 0.36 else 3
        if tt < 0.5: lv = min(lv, 5)
        if tt < 0.3:
            lv = min(lv, 4)
            if (xx + y) % 2 or hash2(xx, y, 9) < 0.35: continue
        if tt < 0.14 and hash2(xx, y, 4) < 0.6: continue
        out[y, xx] = (*hexc(WATER[lv]), 255)
    out[FY0:] = 0
    return out


# ------------------------------------------------------------------------------------------- Posen
POSEN = {
    'ruhe': dict(),
    'auf': dict(fl=5, lift=0.5, hF=(26, 80), staff=92, hB=(-40, 78), openB=1.0, pearl=1.6, cast=0.4, veil=0.3, jaw=0.2),
    'hol': dict(fl=8, lean=-5, lift=0.75, wild=0.3, hF=(12, 110), staff=126, hB=(-30, 92), openB=1.0, pearl=1.9, cast=0.7, jaw=0.4,
                veil=0.5, behind=True),
    'aus': dict(fl=9, lean=-9, lift=1.0, wild=0.8, hF=(-2, 118), staff=152, hB=(26, 92), openB=1.0, pearl=2.3, cast=1.0, jaw=1.0,
                veil=0.8, head=-1, headY=1, behind=True),
    'hieb': dict(fl=6, lean=8, lift=0.8, wild=0.6, hF=(38, 98), staff=46, hB=(-36, 90), openB=0.8, pearl=2.0, cast=0.8, jaw=0.8,
                 veil=0.6, trail=0.3),
    'ein': dict(fl=1, lean=17, lift=1.1, wild=0.7, hF=(50, 62), staff=-42, hB=(-40, 98), openB=1.0, pearl=1.8, cast=0.6, jaw=0.6,
                veil=0.9, trail=0.6, head=1),
    'nach1': dict(fl=0, lean=19, lift=1.0, wild=0.5, hF=(50, 61), staff=-42.5, hB=(-40, 94), openB=0.9, pearl=1.6, cast=0.4, jaw=0.4,
                  veil=1.0, trail=0.7, head=1),
    'nach2': dict(fl=1, lean=15, lift=0.7, wild=0.3, hF=(48, 63), staff=-41, hB=(-38, 86), openB=0.8, pearl=1.3, cast=0.2, jaw=0.2,
                  veil=0.7, trail=0.5, head=1),
    'zieh': dict(fl=2, lean=8, lift=0.5, wild=0.1, hF=(40, 72), staff=20, hB=(-38, 74), openB=0.7, pearl=1.1, veil=0.3, trail=0.2),
}


def mischpose(a, b, k):
    q = dict(b)
    for key in set(a) | set(b):
        va, vb = a.get(key, DEF.get(key)), b.get(key, DEF.get(key))
        if isinstance(vb, tuple): q[key] = tuple(x + (y - x) * k for x, y in zip(va, vb))
        elif isinstance(vb, bool): q[key] = vb if k >= 0.5 else va
        elif isinstance(vb, (int, float)): q[key] = va + (vb - va) * k
    return q


POSEN['zieh2'] = mischpose(POSEN['zieh'], POSEN['ruhe'], 0.55)

# (Pose, ms, Art)
MOMENT = [('auf', 150, None), ('hol', 130, None), ('aus', 120, 'halt'), ('aus', 120, 'halt'), ('aus', 120, 'halt'), ('aus', 120, 'halt'),
          ('hieb', 60, 'bogen'), ('ein', 70, 'hit'), ('ein', 80, None), ('nach1', 110, None), ('nach2', 160, None), ('nach2', 220, None),
          ('zieh', 150, None), ('zieh2', 150, None)]


# ------------------------------------------------------------------------------------------- Altarhalle des Versunkenen Tempels
BX = 356
OCU = (292, 46, 27)      # Oculus (Lichtöffnung zur Wasseroberfläche): Mitte, Radius
TST = ['#070d0f', '#0c1517', '#132024', '#1a2b2f', '#223739', '#2c4545', '#3a5754']
VERD = ['#0f2624', '#173a35', '#22564a', '#327560', '#4f9a7c', '#86c6a4']
ALG = ['#0f1f16', '#16301d', '#1f4324', '#2d5a2c', '#437334']
CORALS = ['#2c0c18', '#521428', '#82223a', '#b23c48', '#d8645a']
TFIRE = ['#04201f', '#073a38', '#0d5f5a', '#18918a', '#3cc8b8', '#8cf0e2', '#e4fff9']
FLOORC = ['#03080b', '#08141a', '#0c1c22', '#11262c', '#183238']


def _o(img): return PAD if img.shape[1] == SWX else 0


def brighten(img, m, add, dither=None):
    """Lichtkegel: Pixel unter m heller (feste Stufe), Rand gerastert (dither: Maske der Randzone)."""
    sel = m & (img[:, :, 3] > 0)
    if dither is not None:
        Y, X = np.nonzero(dither & sel)
        drop = BAYER4[Y % 4, X % 4] > 0.5
        sel[Y[drop], X[drop]] = False
    v = img[sel, :3].astype(int) + np.array(add)
    img[sel, :3] = np.clip(v, 0, 255)


def shafts_mask(w=SWX, spread=1.0):
    """Lichtschächte vom Oculus schräg nach unten rechts (Licht von oben links), Rand gerastert."""
    cx, cy, R = OCU
    Y, X = np.mgrid[0:SH, 0:w]; Xs = X - PAD
    core = np.zeros((SH, w), bool); edge = np.zeros((SH, w), bool)
    for off, wd in ((-14, 9), (2, 13), (19, 8), (32, 5)):
        # Mittellinie: vom Oculus (y = cy) nach unten, je Zeile 0,42 nach rechts
        xc = cx + off + (Y - cy) * 0.42
        hw = (wd + (Y - cy) * 0.09) * spread
        d = np.abs(Xs - xc)
        ok = Y > cy - R * 0.3
        core |= ok & (d < hw * 0.6)
        edge |= ok & (d < hw) & ~(d < hw * 0.6)
    return core, edge


def vnoise_mask(w, seed=0, thr=0.62):
    """Weiche Flecken (Wertrauschen) als Maske, Rand gerastert."""
    from bosskino import vnoise
    Y, X = np.mgrid[0:SH, 0:w]
    v = vnoise(X * 0.06 + seed * 3.7, Y * 0.09 + seed, 16) * 0.7 + vnoise(X * 0.15 + 5, Y * 0.2 + seed * 2, 16) * 0.3
    return (v > thr) | ((v > thr - 0.05) & (BAYER4[Y % 4, X % 4] > 0.5))


MARB = ['#0a1312', '#152322', '#1f3230', '#2b4340', '#3a5752', '#4d6d64']


def statue_niche(F, G, nx):
    """Nische (Rundbogen) mit Statue: verhüllte Priesterin hält eine Urne, aus der ein Wasserstrahl in ein Becken fällt."""
    x0, x1, top, bot = nx - 22 + PAD, nx + 22 + PAD, 52, 150
    T = Buf(w=SWX)
    niche = T.poly([(x0, bot), (x0, top + 18), (x0 + 6, top + 6), (x0 + 22, top), (x1 - 6, top + 6), (x1, top + 18), (x1, bot)])
    F[niche] = (*hexc('#030708'), 255)
    F[outline_mask(niche) & ~niche] = (*hexc(TST[5]), 255)
    e2 = outline_mask(outline_mask(niche) | niche) & ~niche & ~outline_mask(niche)
    F[e2] = (*hexc(TST[1]), 255)
    c = nx + PAD
    def shp(pts): return T.poly([(c + x, y) for x, y in pts])
    body = shp([(-10, 146), (-9, 112), (-11, 96), (-9, 84), (-6, 78), (6, 78), (9, 84), (11, 96), (9, 112), (10, 146)])
    hood = T.ell(c, 72, 6.5, 8) | shp([(-7, 72), (-8, 84), (8, 84), (7, 72)])
    urn = T.ell(c + 1, 96, 7, 6) | shp([(-3, 88), (5, 88), (4, 91), (-2, 91)])
    base = shp([(-14, 150), (-14, 144), (14, 144), (14, 150)])
    for m, sh in ((body, 0), (hood, 1), (urn, 2), (base, 0)):
        ys, xs = np.nonzero(m)
        x_min = {y: xs[ys == y].min() for y in set(ys)}; x_max = {y: xs[ys == y].max() for y in set(ys)}
        for y, x in zip(ys, xs):
            u = (x - x_min[y] + 0.5) / (x_max[y] - x_min[y] + 1)
            t = 4 if u < 0.2 else 3 if u < 0.5 else 2 if u < 0.8 else 1
            if sh == 2: t = min(5, t + 1)
            F[y, x] = (*hexc(MARB[t]), 255)
    # Falten
    for k in (-5, 0, 5):
        for y in range(100, 144):
            x = c + k + int(round(math.sin(y * 0.15 + k) * 0.8))
            if body[y, x] and not urn[y, x]: F[y, x] = (*hexc(MARB[1]), 255)
    F[outline_mask(body | hood | urn | base) & niche] = (*hexc('#010304'), 255)
    # Gesicht im Schatten der Kapuze
    F[70:76, c - 3:c + 4] = (*hexc(MARB[1]), 255); F[72, c - 2:c + 3] = (*hexc(MARB[0]), 255)
    # Wasserstrahl aus der Urne ins Becken (Grundbild und Leuchtebene)
    for y in range(94, 145):
        x = c + 8 + int(min(4, (y - 94) * 0.25))
        F[y, x] = (*hexc('#3a7482'), 255); F[y, x + 1] = (*hexc('#225060'), 255)
        G[y, x] = (*hexc(TG[3] if y % 7 < 2 else TG[2]), 255); G[y, x + 1] = (*hexc(TG[1]), 255)
    for dx in range(-4, 6):
        F[144, c + 12 + dx] = (*hexc('#3a7482'), 255)
        G[144, c + 12 + dx] = (*hexc(TG[2] if abs(dx) < 2 else TG[1]), 255)


def scene():
    L = {}
    # ---- Ferne (0,15): Rückwand aus türkisgrünem Stein, Friese mit Wellenranke, Apsis mit Oculus, Lichtschächte
    F = bands(SH, SWX, 0, 160, ['#010304', '#03080a', '#050c0f', '#071114', '#0a1619'])
    wall = bricks(-PAD, 30, SW + PAD, 166, 24, 10, TST[0:5], seed=21, ox=-PAD, w=SWX)
    stamp(F, wall)
    # Dunkle Wand oben (Gewölbe), Friese
    G = np.zeros((SH, SWX, 4), np.uint8)
    WAVE = ['..##....', '.#..#...', '#....#.#', '......#.']
    def frieze(y, h):
        F[y:y + h, :] = (*hexc(TST[1]), 255)
        F[y, :] = (*hexc(TST[5]), 255); F[y + 1, :] = (*hexc(TST[4]), 255); F[y + h - 1, :] = (*hexc(TST[0]), 255)
        for x in range(SWX):
            u = (x - PAD) % 8
            for j in range(4):
                if WAVE[j][u] == '#':
                    F[y + 2 + j, x] = (*hexc(VERD[2]), 255)
                    if j < 3 and WAVE[j + 1][u] != '#': F[y + 3 + j, x] = (*hexc(TST[0]), 255)
    frieze(22, 8); frieze(150, 7)
    # Apsis: tiefer gewölbter Bogen hinter dem Boss
    T = Buf(w=SWX)
    ax0, ax1 = BX - 70 + PAD, BX + 70 + PAD
    apse = T.poly([(ax0, 150), (ax0, 70), (ax0 + 12, 46), (ax0 + 36, 32), (ax0 + 70, 27), (ax1 - 36, 32), (ax1 - 12, 46), (ax1, 70), (ax1, 150)])
    F[apse] = (*hexc('#040a0c'), 255)
    ring = outline_mask(apse) | outline_mask(outline_mask(apse) | apse)
    F[ring & ~apse] = (*hexc(TST[5]), 255)
    F[outline_mask(apse) & ~ring] = (*hexc(TST[0]), 255)
    # Apsis-Rückwand: große Platten, eine Statue der Meeresgöttin als Relief (Schattenriss mit Lichtkante)
    inner_b = bricks(ax0 - PAD, 30, ax1 - PAD, 150, 32, 14, ['#040a0c', '#060e11', '#081316', '#0b181b'], seed=5, ox=-PAD, w=SWX)
    F[apse] = inner_b[apse]
    # Oculus links oben: Wasseroberfläche von unten (Wellen in Stufen), Rahmen aus Stein
    cx, cy, R = OCU
    Y, X = np.mgrid[0:SH, 0:SWX]; Xs = X - PAD
    d = np.hypot(Xs + 0.5 - cx, Y + 0.5 - cy)
    win = d < R
    wv = np.sin(Xs * 0.42 + np.sin(Y * 0.5) * 1.4) + np.sin(Y * 0.9 + Xs * 0.15)
    OC = ['#0a3a44', '#0e5a66', '#18808a', '#2ec8cc', '#a0fff0']
    lvl = np.clip((1 - d / R) * 3.2 + wv * 0.45, 0, 4).astype(int)
    for k in range(5):
        F[win & (lvl == k)] = (*hexc(OC[max(0, k - 1)]), 255)
        G[win & (lvl == k)] = (*hexc(OC[k]), 255)
    rim_ = (d >= R) & (d < R + 4)
    F[rim_] = (*hexc(TST[3]), 255)
    F[(d >= R) & (d < R + 1.2)] = (*hexc(TST[0]), 255)
    F[(d >= R + 3) & (d < R + 4) & (Y < cy)] = (*hexc(TST[5]), 255)
    for k in range(12):           # Speichen
        a = k / 12 * 2 * math.pi
        for r in np.arange(4, R, 0.5):
            x, y = int(cx + math.cos(a) * r) + PAD, int(cy + math.sin(a) * r)
            F[y, x] = (*hexc(TST[2]), 255); G[y, x] = 0
    G[(d >= R)] = 0
    # Nasse Flecken und Algen auf der Wand (gerasterte Ränder)
    wet = vnoise_mask(SWX, seed=4)
    Ywall = (Y > 32) & (Y < 148)
    sel = wet & Ywall & ~apse & (F[:, :, 3] > 0)
    F[sel, :3] = (F[sel, :3].astype(int) * 0.72).astype(np.uint8)
    for x in range(SWX):                       # Sickerspuren unter dem Fries
        if hash2(x // 3, 7, 3) < 0.07:
            Lg = int(20 + hash2(x, 2, 3) * 60)
            for y in range(31, 31 + Lg):
                if F[y, x, 3] and not apse[y, x]: F[y, x, :3] = (F[y, x, :3].astype(int) * 0.6).astype(np.uint8)
    # Statuennischen mit Priesterinnen, die Wasser aus Urnen gießen
    for nx in (118, 604):
        statue_niche(F, G, nx)

    core, edge = shafts_mask()
    brighten(F, core & ~win, (9, 30, 32))
    brighten(F, edge & ~win, (4, 14, 15), dither=edge)
    L['fern'] = dict(img=F, f=0.15)
    gsh = core & ~win & (Y < 150) & ((Xs * 3 + Y * 7) % 23 == 0)
    G[gsh] = (*hexc('#18808a'), 255)
    L['fern-glut'] = dict(img=G, f=0.15, glow=dict(per=4.2, lo=0.45, steps=3))
    # ---- Mitte (0,45): Säulen mit Grünspan-Kapitellen, Algen, Tang, Feuerschalen, hinterer gefluteter Boden
    M = np.zeros((SH, SWX, 4), np.uint8); MG = np.zeros((SH, SWX, 4), np.uint8)
    bf, bseam, _ = floor(168, SH, [3, 3, 4, 4, 5, 5, 6, 7, 8, 9], FLOORC, vx=BX, vy=40, tile=30, seed=7, w=SWX, ox=-PAD)
    stamp(M, bf)
    # Wasserspiegel: helle Wellenstriche
    for y in range(169, SH, 2):
        for x in range(SWX):
            n = hash2(x // 5, y, 3)
            if n < 0.12: M[y, x] = (*hexc('#1a3a44'), 255)
            elif n > 0.965: M[y, x] = (*hexc('#2c5a66'), 255)
    core2, edge2 = shafts_mask()
    brighten(M, core2 & (np.mgrid[0:SH, 0:SWX][0] > 168), (8, 24, 26))
    hz = (np.mgrid[0:SH, 0:SWX][0])
    band = (hz >= 160) & (hz < 172) & (M[:, :, 3] == 0)
    PIL = TST[1:]
    def column(x0, w, top=30, bot=170, broken=None):
        x0 += PAD
        y_top = top if broken is None else broken
        for y in range(y_top, bot):
            for x in range(x0, x0 + w):
                u = (x - x0 + 0.5) / w
                t = 1 if u < 0.2 else 2 if u < 0.5 else 3 if u < 0.8 else 2
                if (x - x0) % 5 == 0 and 0 < x - x0 < w - 1: t = max(0, t - 1)      # Kanneluren
                if x == x0 + w - 1: t = 0
                M[y, x] = (*hexc(PIL[t]), 255)
        # Basis
        for x in range(x0 - 4, x0 + w + 4):
            for yy in range(bot - 7, bot):
                M[yy, x] = (*hexc(PIL[3 if yy == bot - 7 else 2 if yy < bot - 3 else 1]), 255)
        if broken is None:
            # Kapitell aus Grünspan-Bronze (Voluten), Abakus
            for yy in range(34, 44):
                k = yy - 34
                ext = 5 - abs(k - 4) // 2
                for x in range(x0 - ext, x0 + w + ext):
                    u = (x - x0 + ext + 0.5) / (w + 2 * ext)
                    t = 4 if (k <= 1 and u > 0.25) else 3 if u > 0.55 else 2 if u > 0.2 else 1
                    if k == 9: t = 0
                    M[yy, x] = (*hexc(VERD[t]), 255)
            for x in range(x0 - 6, x0 + w + 6):
                M[30:34, x] = (*hexc(PIL[2]), 255); M[30, x] = (*hexc(PIL[4]), 255)
            # Tang hängt vom Kapitell
            for j in range(4):
                xx = x0 + 2 + j * (w - 4) // 3
                Lg = 18 + int(hash2(x0, j, 2) * 26)
                for yy in range(44, 44 + Lg):
                    sw = int(round(1.5 * math.sin(yy * 0.25 + j)))
                    c = ALG[3] if yy < 44 + Lg * 0.4 else ALG[2] if yy < 44 + Lg * 0.8 else ALG[1]
                    M[yy, xx + sw] = (*hexc(c), 255); M[yy, xx + sw + 1] = (*hexc(ALG[1]), 255)
        else:
            # Bruchkante
            for x in range(x0, x0 + w):
                yy = y_top + int(hash2(x, 1, 5) * 5)
                M[y_top:yy, x] = 0
                M[yy, x] = (*hexc(PIL[4]), 255)
        # Algen am Fuß
        for x in range(x0 - 3, x0 + w + 3):
            hh = int(hash2(x, 2, 7) * 7)
            for yy in range(bot - 7 - hh, bot - 7):
                M[yy, x] = (*hexc(ALG[2] if yy > bot - 9 - hh else ALG[3]), 255)
    for x0, br in ((-118, None), (26, None), (166, 92), (500, None), (640, 110)):
        column(x0, 24, broken=br)
    # Rote Korallenbüsche und Fächerkorallen am Säulenfuß
    def coral(cx_, by, h, seed, pal=CORALS):
        rng = np.random.default_rng(seed)
        for b in range(7):
            x = cx_ + PAD + rng.uniform(-6, 6); y = by; a = -math.pi / 2 + rng.uniform(-0.7, 0.7)
            for s in range(int(h * rng.uniform(0.5, 1.0))):
                a += rng.uniform(-0.25, 0.25)
                x += math.cos(a); y += math.sin(a)
                c = pal[3] if s > h * 0.6 else pal[2]
                M[int(y), int(x)] = (*hexc(c), 255); M[int(y), int(x) + 1] = (*hexc(pal[1]), 255)
            M[int(y), int(x)] = (*hexc(pal[4]), 255)
    coral(50, 166, 16, 1); coral(150, 167, 12, 2); coral(470, 166, 18, 3)
    # Feuerschalen (türkis) auf Bronze-Dreifüßen
    braziers = []
    for bx_, by_ in ((92, 146), (468, 146)):
        for k in range(20):
            y = by_ + 4 + k
            for dx in (-6 + k // 3, 6 - k // 3, 0):
                M[y, bx_ + dx + PAD] = (*hexc(VERD[2] if dx else VERD[1]), 255)
        for dx in range(-7, 8):
            for dy in range(0, 5):
                if abs(dx) <= 7 - dy:
                    M[by_ + dy, bx_ + dx + PAD] = (*hexc([VERD[4], VERD[3], VERD[2], VERD[1], VERD[0]][dy]), 255)
        for dx in range(-6, 7): MG[by_ - 1, bx_ + dx + PAD] = (*hexc(TFIRE[5] if abs(dx) < 3 else TFIRE[4]), 255)
        braziers.append((bx_, by_))
    # Runen an den Säulen (Leuchtebene)
    for x0 in (26, 500):
        for k in range(3):
            y = 70 + k * 22; x = x0 + 11 + PAD
            for dx, dy in ((0, 0), (0, 1), (0, 2), (1, 0), (-1, 2)):
                M[y + dy, x + dx] = (*hexc(VERD[3]), 255); MG[y + dy, x + dx] = (*hexc(TFIRE[4] if dy == 1 else TFIRE[3]), 255)
    # Dunst über dem Wasser: gerastertes Band vor dem Säulenfuß
    Yh, Xh = np.mgrid[0:SH, 0:SWX]
    haze = (Yh >= 158) & (Yh < 170) & (M[:, :, 3] > 0)
    pat = BAYER4[Yh % 4, Xh % 4] < (Yh - 156) / 28
    brighten(M, haze & pat, (4, 12, 13))
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=3.7, lo=0.55, steps=3))
    # ---- Boden (1): geflutete Tempelplatten, flaches Wasser darüber, Glanz im Lichtschacht
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], FLOORC, vx=BX - 30, vy=-40, tile=36, seed=13, w=SWX, ox=-PAD)
    for x in range(SWX):
        Bd[FY - 4, x] = (*hexc('#1e3c44' if hash2(x - PAD, 1, 2) > 0.25 else '#142a30'), 255)
    BG = np.zeros((SH, SWX, 4), np.uint8)
    Yb = np.mgrid[0:SH, 0:SWX][0]
    # Wasseroberfläche: lange helle Wellenlinien in Stufen
    for y in range(FY - 2, SH):
        for x in range(SWX):
            n = hash2(x // (6 + (y - FY) // 3), y, 11)
            if n > 0.93: Bd[y, x] = (*hexc('#3a7482' if n > 0.975 else '#225060'), 255)
    core3, edge3 = shafts_mask(spread=1.4)
    lit = (core3 | edge3) & (Yb >= FY - 3)
    brighten(Bd, core3 & (Yb >= FY - 3), (10, 28, 30))
    brighten(Bd, edge3 & (Yb >= FY - 3), (5, 14, 15), dither=edge3)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        far = abs(x - PAD - BX) / 100 + (y - FY) / 30
        if far < 1.4 and y < FY + 18:
            Bd[y, x] = (*hexc('#0e3a40'), 255)
            if far < 0.9 and chk(x, y): BG[y, x] = (*hexc(TG[1]), 255)
    # Glitzern im Lichtschacht (Leuchtebene)
    for y, x in zip(*np.nonzero(lit)):
        if hash2(x // 3, y, 17) > 0.94 and (x + y) % 3 == 0: BG[y, x] = (*hexc(TG[3] if hash2(x, y, 5) > 0.5 else TG[2]), 255)
    # Schatten der Priesterin im Wasser (dunkler Fleck, feste Stufen), Wellenringe um den Wasserleib
    for dy, hw, k in [(-3, 26, 0.65), (-2, 36, 0.6), (-1, 40, 0.6), (0, 36, 0.62), (1, 26, 0.7)]:
        y = FY + dy
        for x in range(BX - hw + PAD, BX + hw + PAD):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
            BG[y, x] = 0
    for rx, ry, c, gc in ((48, 5, '#3a7482', TG[2]), (64, 7, '#225060', TG[1])):
        for i in range(int(2 * math.pi * rx)):
            a = i / rx
            x, y = int(round(BX + math.cos(a) * rx)) + PAD, int(round(FY - 1 + math.sin(a) * ry))
            if math.sin(a) < -0.2 or not (0 <= y < SH): continue
            if hash2(i // 3, rx, 1) < 0.25: continue
            Bd[y, x] = (*hexc(c), 255)
            if math.sin(a) > 0.3: BG[y, x] = (*hexc(gc), 255)
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=2.8, lo=0.45, steps=3))
    # ---- Vordergrund (1,35): Säulenstumpf und Korallen links, Tang rechts, Tang von oben; Schattenriss mit Kante
    V = Buf(w=SWX)
    vm = V.poly([(x + PAD, y) for x, y in [(-PAD - 4, SH), (-PAD - 4, 196), (-128, 192), (-116, 186), (-104, 189), (-88, 183),
                                            (-70, 185), (-54, 180), (-40, 183), (-30, 178), (-20, 184), (-8, 190), (4, 196), (12, SH)]])
    vm |= V.poly([(x + PAD, y) for x, y in [(-96, SH), (-96, 150), (-93, 146), (-86, 149), (-80, 145), (-72, 150), (-72, SH)]])
    V.a[vm] = (*hexc('#010506'), 255)
    e = outline_mask(~vm) & vm
    top_e = e & ~np.roll(vm, 1, axis=0)
    V.a[top_e] = (*hexc('#0e3438'), 255)
    for y, x in zip(*np.nonzero(top_e)):
        if hash2(x, y, 9) < 0.3: V.a[y, x] = (*hexc('#1a7a7a'), 255)
    # Tangwedel
    def frond(x0, y0, L_, ph, lean):
        for k in range(L_):
            y = y0 - k; x = x0 + PAD + lean * k * k / L_ + 2.5 * math.sin(k / 7 + ph)
            w_ = max(1, int(3 * (1 - k / L_)) + 1)
            for j in range(w_):
                V.set(x + j, y, '#020807')
            V.set(x + w_, y, '#0e3030' if k % 5 else '#1a5a4a')
    for x0, L_, ph, ln in ((-60, 46, 0.2, -6), (-46, 34, 1.4, 4), (552, 52, 2.0, 6), (566, 38, 0.6, -5), (580, 30, 1.0, 3)):
        frond(x0, SH - 2, L_, ph, ln)
    # Tang von oben rechts
    for cx_, L_, ph_ in ((548, 58, 0.0), (560, 40, 1.7), (-112, 44, 0.9)):
        for k in range(L_):
            x = cx_ + PAD + int(round(2.2 * math.sin(k / 8 + ph_)))
            V.set(x, k, '#020807'); V.set(x + 1, k, '#020807' if k % 6 else '#0e3030'); V.set(x - 1, k, '#0a2222' if k % 4 == 0 else '#020807')
    L['vorn'] = dict(img=V.a, f=1.35)
    return L, seam, braziers


# ------------------------------------------------------------------------------------------- Effekte (Feinraster)
def wave_img(w, h, t, n, k=K):
    """Brechende Flutwelle, läuft nach links: flacher Rücken rechts, Kamm mit eingerollter Lippe links, dunkle Röhre
    unter der Lippe, angestrahlte Front (Licht von oben links), Schaumkante an der Lippe, Gischtwalze am Fuß.
    Harte Stufen. Bild t von n (Schleife). Rückgabe RGBA (k·h × k·w), Fuß unten."""
    Yf, Xf = np.mgrid[0:h * k, 0:w * k]
    x = (Xf + 0.5) / (k * w); y = 1 - (Yf + 0.5) / (k * h)
    ph = 2 * math.pi * t / n
    nz = np.sin(x * 31 + ph) * 0.5 + np.sin(x * 57 - ph * 2 + y * 13) * 0.5
    # Rücken
    top = 0.86 * np.clip(1 - (x - 0.34) / 0.66, 0, 1) ** 1.35 + nz * 0.012
    xf = 0.12 + 0.1 * np.sin(np.clip(y / 0.5, 0, 1) * math.pi) + 0.02 * math.sin(ph)     # hohle Front
    body = (x >= xf) & (y < np.where(x < 0.34, 0.86, top))
    # Lippe: elliptischer Bogen um (cx, cy), dicker am Kamm, dünn zur Spitze
    cx, cy, rx, ry = 0.33, 0.6, 0.27 + 0.01 * math.sin(ph), 0.27
    dx, dy = (x - cx) / rx, (y - cy) / ry
    r = np.hypot(dx, dy); th = (np.degrees(np.arctan2(dy, dx)) + 360) % 360
    tq = np.clip((th - 40) / 180, 0, 1)
    thick = 0.42 * (1 - tq) + 0.1
    lip = (th >= 40) & (th <= 220) & (r < 1) & (r > 1 - thick)
    body &= ~((th >= 60) & (th <= 250))
    tube = (th >= 90) & (th <= 230) & (r <= 1 - thick)
    C = [hexc(c) for c in WATER]
    lv = np.full(x.shape, -1)
    # Front angestrahlt, Rücken dunkler, Licht-Riefen längs der Strömung
    depth = np.clip((x - xf) / 0.45, 0, 1)
    bl = np.select([depth < 0.12, depth < 0.35, depth < 0.7], [5, 4, 3], 2)
    bl = np.where((np.sin((x * 2.2 - y + 0.08 * np.sin(y * 9)) * 20 + ph) > 0.86) & (bl < 5) & (x > 0.4), bl + 1, bl)
    bl = np.where(top - y < 0.05, np.maximum(bl, 4), bl)
    lv = np.where(body, bl, lv)
    ll = np.where(r > 0.93, 6, np.where(r > 1 - thick * 0.45, 5, 4))
    ll = np.where((th > 175) & (r > 0.9), 6, ll)
    lv = np.where(lip, ll, lv)
    lv = np.where(tube & (y > 0.2) & (r > 0.25), np.where(r > 1 - thick - 0.06, 1, 0), lv)
    # Gischtwalze am Fuß (unregelmäßig, je Szenenpixel)
    rb = 0.13 + 0.04 * np.sin(x * 40 + ph * 2) + 0.03 * np.sin(x * 83 - ph)
    roll = (y < rb) & (x > 0.03) & (x < 0.6)
    lv = np.where(roll & (lv < 5), np.where(rb - y < 0.035, 6, 5), lv)
    out = np.zeros((h * k, w * k, 4), np.uint8)
    for q in range(7): out[lv == q] = (*C[q], 255)
    rng = np.random.default_rng(t)
    for i in range(16):                               # Gischt über Lippe und Kamm
        a = math.radians(rng.uniform(80, 200)); rr = rng.uniform(1.04, 1.25)
        X = int((cx + math.cos(a) * rx * rr) * w * k); Y = int((1 - (cy + math.sin(a) * ry * rr)) * h * k)
        if 0 <= X < w * k - 1 and 0 <= Y < h * k - 1:
            out[Y, X] = (*C[6], 255); out[Y + 1, X] = (*C[4], 255)
    a_ = out[:, :, 3] > 0
    out[outline_mask(a_) & (Yf < h * k * 0.86)] = (*hexc('#030a14'), 255)
    return out


def column_img(w, h, t, n, k=K):
    """Gischtwalze als Spur der Welle: flacher Schaumhügel, der brodelt, mit springenden Tropfen. RGBA (k·h × k·w)."""
    Yf, Xf = np.mgrid[0:h * k, 0:w * k]
    x = (Xf + 0.5) / (k * w) - 0.5; y = 1 - (Yf + 0.5) / (k * h)
    ph = 2 * math.pi * t / n
    bumps = 0.72 + 0.14 * np.sin(x * 9 + ph) + 0.06 * np.sin(x * 17 - ph * 2)
    prof = bumps * np.clip(1 - (x / 0.5) ** 2, 0, 1) ** 0.45
    m = y < prof
    C = [hexc(c) for c in WATER]
    lv = np.where(prof - y < 0.12, 6, np.where(prof - y < 0.3, 5, np.where(x < 0, 4, 3)))
    out = np.zeros((h * k, w * k, 4), np.uint8)
    for q in range(7): out[m & (lv == q)] = (*C[q], 255)
    rng = np.random.default_rng(t + 50)
    for i in range(5):
        X = int(rng.uniform(0.1, 0.9) * w * k); Y = int(rng.uniform(0.0, 0.3) * h * k)
        if out[Y, X, 3] == 0: out[Y, X] = (*C[6], 255)
    a_ = out[:, :, 3] > 0
    out[outline_mask(a_) & (Yf < h * k * 0.8)] = (*hexc('#030a14'), 255)
    return out


def crown_imgs(w=64, h=92, n=9, k=K):
    """Wasserkrone am Einschlag: erst eine Kuppel aus Gischt, dann ein Kranz aus spitzen, nach außen gebogenen
    Fontänen (mittlere am höchsten) mit Tropfenköpfen, die zerfallen und zurückfallen. Harte Stufen, Feinraster."""
    out = []
    jets = [(-20, 0.46, 0), (-10, 0.74, 1), (0, 1.0, 3), (10, 0.7, 4), (20, 0.42, 6)]
    C = [hexc(c) for c in WATER]
    Yf, Xf = np.mgrid[0:h * k, 0:w * k]
    xs = (Xf + 0.5) / k; hs = h - (Yf + 0.5) / k                      # Szenen-x im Bild, Höhe über dem Fuß
    for f in range(n):
        im = np.zeros((h * k, w * k, 4), np.uint8)
        tt = (f + 0.7) / n
        grow = math.sin(min(1.0, tt * 1.8) * math.pi * 0.5)
        lvl = np.full(xs.shape, -1)
        if f < 3:                                                     # Gischtkuppel
            r = 9 + f * 6; ry = r * (0.9 - f * 0.12)
            d = ((xs - w / 2) / r) ** 2 + ((hs - 1) / ry) ** 2
            lvl = np.where(d < 1, np.where(d < 0.35, 6 if f == 0 else 5, np.where(d < 0.7, 4, 3)), lvl)
        for dx, hgt, sd in jets:
            Hj = h * 0.92 * hgt * grow
            fall = max(0.0, tt - 0.55) * 2.2                         # Säule sinkt von unten weg, Kopf zerfällt
            if Hj < 3: continue
            fr = np.clip(hs / Hj, 0, 1.2)
            xc = w / 2 + dx * (0.5 + tt * 0.4) + dx * 0.35 * fr ** 2
            hw = (4.4 - abs(dx) * 0.08) * np.clip(1 - fr, 0, 1) ** 0.55 + 0.8
            u = (xs - xc) / hw
            m = (np.abs(u) < 1) & (hs >= 0) & (hs < Hj) & (fr > fall)
            jl = np.where(u > 0.35, 5, np.where(u > -0.4, 4, 3))
            jl = np.where(fr > 0.8, 6, jl)
            lvl = np.where(m, np.maximum(lvl, jl), lvl)
            # Tropfenkopf über der Spitze
            hx, hy = w / 2 + dx * (0.5 + tt * 0.4) + dx * 0.35, Hj + 1.5 + tt * 3
            dd = ((xs - hx) / 2.4) ** 2 + ((hs - hy) / 2.2) ** 2
            if tt < 0.85: lvl = np.where(dd < 1, np.maximum(lvl, np.where(dd < 0.4, 6, 5)), lvl)
        for q in range(7):
            im[lvl == q] = (*C[q], 255)
        rng = np.random.default_rng(f + 7)
        for i in range(int(10 + 8 * tt)):
            X = int((w / 2 + rng.uniform(-28, 28)) * k); Y = int((h - rng.uniform(4, h * 0.95 * grow + 4)) * k)
            if 0 <= X < w * k - 1 and 0 <= Y < h * k - 1 and im[Y, X, 3] == 0:
                im[Y, X] = (*C[6 if i % 3 else 4], 255); im[Y + 1, X] = (*C[3], 255)
        # Ring am Wasser
        rx = 10 + tt * 26; ry = rx * 0.25
        for i in range(int(rx * 8)):
            a = i / (rx * 8) * 2 * math.pi
            X, Y = int((w / 2 + math.cos(a) * rx) * k), int((h - 3 + math.sin(a) * ry) * k)
            if 0 <= X < w * k and 0 <= Y < h * k and (i // 3) % 4: im[Y, X] = (*C[5 if math.sin(a) > 0 else 4], 255)
        a_ = im[:, :, 3] > 0
        im[outline_mask(a_)] = (*hexc('#030a14'), 255)
        out.append(im)
    return out


# ------------------------------------------------------------------------------------------- Bauen
N_RUHE, MS_RUHE = 12, 160


def idle_pose(i):
    ph = i / N_RUHE; tt = ph * 2 * math.pi
    return dict(fl=1.5 * math.sin(tt), hairT=tt, cloth=tt, pearl=1 + 0.5 * math.sin(tt), lean=0.8 * math.sin(tt + 1),
                hF=(34, 76 + 1.2 * math.sin(tt)), hB=(-46 + 0.8 * math.cos(tt), 60 + 1.4 * math.sin(tt + 0.6)),
                staff=86 + 0.8 * math.sin(tt), head=0.4 * math.sin(tt), cast=0.0)


def build():
    idle = [figure(idle_pose(i))[0] for i in range(N_RUHE)]
    frames, hit, imp = [], 0, 0
    prev = POSEN['ruhe']
    for k, (pn, ms, art) in enumerate(MOMENT):
        p = dict(POSEN[pn])
        ph = (k % N_RUHE) / N_RUHE * 2 * math.pi
        p.setdefault('hairT', ph); p.setdefault('cloth', ph)
        if art == 'halt':
            p['hairT'] = ph * 1.5; p['cloth'] = ph * 1.5
            p['fl'] = p['fl'] + (k % 2)
        im, tri = figure(p)
        if art in ('bogen', 'hit'):
            sm = smear(POSEN['aus'] if art == 'bogen' else POSEN['hieb'], p)
            im = over(sm, im) if art == 'bogen' else over(im, sm)
        if art == 'hit':
            hit = len(frames); imp = int(round(FX + tri['tip'][0]))
        im[:(FY0 - 168) * K] = 0
        frames.append((im, ms))
    Ld, seam, braziers = scene()
    fx = {}
    # Flutwelle (Ereignis 'wand'): große Welle, Gischtsäulen als Spur, kleine Spritzer
    WW, WH, W2, H2, W3, H3 = 76, 72, 30, 22, 18, 12
    fx['wand'] = strip([wave_img(WW, WH, i, 6) for i in range(6)])
    fx['wand2'] = strip([column_img(W2, H2, i, 6) for i in range(6)])
    fx['wand3'] = strip([column_img(W3, H3, i + 2, 6) for i in range(6)])
    fx['schale'] = strip([feuer(16, 20, i, 6, seed=5, hw=0.38, pal=TFIRE[1:6], k=K) for i in range(6)])
    CW, CH, CN = 64, 92, 9
    fx['krone'] = strip(crown_imgs(CW, CH, CN))
    B, imp_s = finish('nerith', FX, FY0, BX, [('koerper', idle, dict(n=N_RUHE, ms=MS_RUHE))], frames, hit, imp, Ld,
                      ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                      {'glut': ['#e4fff9', '#3cc8b8', '#0d5f5a'], 'fokus': [300, BX - 66], 'teilchen': 'geist', 'dichte': 3.0,
                       'dauer': 9.5, 'start': 2.2, 'stopp': 80,
                       'beben': [[0, 3], [2, -2], [-2, 1], [1, -1], [0, 1], [1, 0]]})
    wave, wm = seam_wave(seam, imp_s, FY - 3, v=280, ms=60, pal=TG, direction=-1, maxd=430, ox=-PAD,
                         peak=lambda d: 4 if d < 60 else 3 if d < 170 else 2)
    B['fx']['welle'] = wave
    SPRAY = ['#ffffff', '#c6eaf6', '#76bcdc', '#3886b2']
    BUBB = ['#e4fff9', '#8cf0e2', '#3cc8b8', '#0d5f5a']
    B['meta']['ereignisse'] = [
        dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'),
        dict(k='bild', r='krone', at=0, x=int(imp_s) - CW // 2, y=FY + 2 - CH, w=CW, h=CH, n=CN, ms=70, quer=True, z='vorn'),
        dict(k='wand', r='wand', r2='wand2', r3='wand3', at=60, x=int(imp_s) - 14, y=FY + 3, dir=-1, v=260,
             weg=int(imp_s) + PAD - 20, w=WW, h=WH, w2=W2, h2=H2, w3=W3, h3=H3, n=6, ms=80, abst=9, nach=620, z='vorn',
             einzeln=True, staub=[WATER[5], WATER[4], WATER[3]]),
        dict(k='funken', at=0, x=int(imp_s), y=FY - 2, n=36, r=6, vx=70, vy=160, g=320, c=SPRAY),
        dict(k='funken', at=40, x=int(imp_s), y=FY - 1, n=18, r=12, vx=20, vy=40, g=0, c=BUBB),
    ]
    B['meta']['warn'] = {'x0': 10, 'x1': int(imp_s) - 8, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 700,
                         'c': ['#063a48', '#0e7888', '#a0fff0']}
    B['meta']['schalen'] = [[int(x - 8), int(y - 19)] for x, y in braziers]
    B['meta']['schale'] = {'w': 16, 'h': 20, 'n': 6, 'ms': 90}
    B['meta']['schaleNach'] = 'mitte-glut'
    B['fein'] = {'wand', 'wand2', 'wand3', 'schale', 'krone'}
    return B
