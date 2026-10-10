# Bosskino: Mutter Fäulnis (Stufe 32) im Sporenschlund.
# Figur nach rot_mother.js: aufgeblähter, geäderter Brutleib auf einem Teppich aus Wurzelsträngen, pulsierende
# Sporenkapseln mit Fleischkragen, Konsolenpilze und kleine Pilze auf dem Rücken; vorn ein verwachsener, gekrümmter
# Oberkörper (Rippen, Wirbelknoten, Myzelmantel mit Fransen), hageres grünes Hexengesicht (Knochenwulst, tiefliegende
# Leuchtaugen, drittes Auge, Hakennase, Maul mit Fängen) unter einem breiten Warzenhut mit glimmenden Lamellen und
# Hyphenfäden; zwei knorrige, gegliederte Rankenarme aus Rinde und Moos mit Dornen, Leuchtknoten und Wurzelkrallen.
# Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Ruhe in drei Teilen mit eigenen Zyklen: hinterer Arm und vorderer Arm (Krallen, Wiegen) und Leib (Atem, Kapseln,
# Augen, Fransen).
# Attacke „Wurzelbruch“: Ausholen (sie richtet sich auf, Ranken hoch), Halten (Kapseln schwellen, Maul auf,
# Zittern), Hieb in zwei Bildern (Ellbogen führt, Unterarm peitscht), Einschlag mit Stauchung (Leib flacher und
# breiter, Hut gequetscht), Nachschwingen, Zurückfedern, Nachbeben; Wurzeldornen brechen nacheinander aus dem Boden,
# aus jedem zweiten Bruch quillt eine Sporenwolke in Pixelstufen, Gift läuft oliv durch die Fugen.
# Gesamte Figur bleibt in allen Bildern unter Szenen-y 20 (Oberkörper gestaucht/abgesenkt, KZ/DZ).
import math
import numpy as np
from bosskino import (Fig, MAT, flip, hash2, hexc, Buf, bands, BAYER4, seam_wave, strip, outline_mask, edge_of,
                      floor, stamp, finish, over, vnoise, dome, SW, SH, FY, ik, rot, lerp)

# Fäulnis-Palette: entsättigt – Fäulnis-Violett, Oliv, Knochen; Leuchten kränklich-giftig (Oliv-Gelb) statt Limette.
SP = ['#1e2410', '#3e4a1e', '#6e7a34', '#a8b05a', '#dcdca0']        # Giftglut (dunkel -> hell)
VI = ['#1e1226', '#3e2a4a', '#5e4670', '#8a6e9a', '#c0aac8']        # Fäulnisviolett
MAT.update({
    'flesh': ['#120a12', '#2c1c2a', '#44303e', '#5e4652', '#7c626a'],
    'fleshd': ['#0a060a', '#20141e', '#30222e', '#44303e', '#5e4652'],
    'fleshl': ['#120a12', '#5e4652', '#7c626a', '#9a8080', '#b8a49a'],
    'skin': ['#0e0e0a', '#2a2a1e', '#42422c', '#5e5c3e', '#7c7852'],
    'skinl': ['#0e0e0a', '#5e5c3e', '#7c7852', '#9c966c', '#bab48a'],
    'hide': ['#0c0a08', '#262019', '#3c3326', '#564a36', '#74664a'],
    'face': ['#100c0c', '#2a2c1e', '#43482c', '#606640', '#808458'],
    'faceh': ['#100c0c', '#606640', '#808458', '#a2a478', '#c2c09a'],
    'rot': ['#120a10', '#261a24', '#382630', '#4a3628', '#62482e'],
    'brow': ['#140a12', '#4e4432', '#7a6c4e', '#ada080', '#d0c6a6'],
    'maw': ['#160810', '#160810', '#220c16', '#2e101c', '#3a1422'],
    'fang': ['#3a2e1e', '#665a40', '#9a8c6a', '#cec4a0', '#ece4c8'],
    'cap': ['#0c070a', '#2a1820', '#40242a', '#583236', '#744642'],
    'capl': ['#0c070a', '#583236', '#744642', '#8e5e52', '#a87c66'],
    'capd': ['#08040a', '#1e1018', '#2a1820', '#40242a', '#583236'],
    'gill': ['#100c12', '#221a26', '#362a3a', '#4e3e50', '#6e5c6e'],
    'gillg': ['#100c12', '#2e3416', '#545c26', '#868e44', '#bcbe7c'],
    'myc': ['#100c12', '#362e3a', '#504650', '#726672', '#9c8e98'],
    'cloak': ['#0c0610', '#22142c', '#36203e', '#503454', '#6e4c6c'],
    'bark': ['#0c0a08', '#28231a', '#3e3626', '#584c36', '#766850'],
    'barkd': ['#080604', '#18150f', '#28231a', '#3e3626', '#584c36'],
    'moss': ['#0c0e08', '#1e2214', '#30361e', '#464e2a', '#626a3a'],
    'mossd': ['#08090a', '#0c0e08', '#1e2214', '#30361e', '#464e2a'],
    'sac': ['#10120a', '#283014', '#424e20', '#66722e', '#8e9648'],
    'sacg': ['#10120a', '#66722e', '#8e9648', '#bcbc76', '#e0dcae'],
    'pus': ['#120e08', '#34321a', '#5a5a28', '#868a40', '#b8b674'],
    'vein': VI,
    'spot': ['#28241c', '#4a4232', '#746a52', '#9e9274', '#c2b896'],
    'bone': ['#16130e', '#363024', '#625844', '#928870', '#c0b698'],
    'slime': ['#0c0e08', '#262c14', '#3e4820', '#646e30', '#9aa056'],
    'eye': ['#262a10', '#4e5a1e', '#8e9a3a', '#c8ca74', '#eeecbc'],
    'void': ['#050307'] * 5,
})
RIM_F = {'flesh': '#9a8484', 'skin': '#9a9670', 'hide': '#8e8060', 'face': '#9c9e70', 'cap': '#8e5e52', 'bark': '#8c7e5c', 'moss': '#7a8048',
         'myc': '#b4a8b0', 'sac': '#bcbc76', 'spot': '#d8ceae'}
RIM_B = {'flesh': '#6e5a80', 'fleshd': '#4e3e60', 'cap': '#6e5a80', 'capd': '#4e3e60', 'bark': '#4e5630', 'barkd': '#30361e',
         'skin': '#6e7a34', 'hide': '#5e5470', 'moss': '#6e7a34', 'mossd': '#3e4a1e', 'gill': '#6e5a80', 'myc': '#6e5a80', 'face': '#6e7a34'}

W, H, FX, FY0 = 340, 214, 196, 206
S = 1.0
GROUND = FY0 + 1
LT = np.array([0.55, -0.72, 0.45]); LT = LT / np.linalg.norm(LT)
def new(): return Fig(W, H, FX, FY0, S)


# ------------------------------------------------------------------------------------------- Werkzeuge
def bez(a, c, b, n=12):
    return [((1 - k) ** 2 * a[0] + 2 * (1 - k) * k * c[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * c[1] + k * k * b[1])
            for k in (i / n for i in range(n + 1))]


class Tube:
    """Strang entlang einer Polylinie (Figurkoordinaten), Breite wf(t) (t 0..1, numpy-fähig).
    Felder (volle Figurgröße): m Maske, t Lauf, e quer (-1..1, Vorzeichen = Seite), v Licht (Normale · LT)."""
    def __init__(s, f, pts, wf, clip=None):
        P = np.array([(f.FX + x * f.S, f.FY - h * f.S) for x, h in pts], float)
        sg = P[1:] - P[:-1]; Ls = np.maximum(1e-6, np.hypot(sg[:, 0], sg[:, 1]))
        cum = np.concatenate([[0], np.cumsum(Ls)]); tot = cum[-1]
        wm = max(float(np.max(wf(np.linspace(0, 1, 21)))), 1) / 2 + 2
        x0, x1 = int(max(0, P[:, 0].min() - wm)), int(min(f.W, P[:, 0].max() + wm + 1))
        y0, y1 = int(max(0, P[:, 1].min() - wm)), int(min(f.H, P[:, 1].max() + wm + 1))
        s.m = np.zeros((f.H, f.W), bool); s.t = np.zeros((f.H, f.W)); s.e = np.zeros((f.H, f.W)); s.v = np.zeros((f.H, f.W))
        s.pts = P
        if x1 <= x0 or y1 <= y0: return
        Y, X = np.mgrid[y0:y1, x0:x1] + 0.5
        best = np.full(Y.shape, 9.0); T = np.zeros(Y.shape); NX = np.zeros(Y.shape); NY = np.zeros(Y.shape); SD = np.ones(Y.shape)
        for i in range(len(sg)):
            A, d, L = P[i], sg[i], Ls[i]
            u = np.clip(((X - A[0]) * d[0] + (Y - A[1]) * d[1]) / (L * L), 0, 1)
            dx, dy = X - (A[0] + u * d[0]), Y - (A[1] + u * d[1])
            dist = np.hypot(dx, dy)
            t = (cum[i] + u * L) / tot
            r = dist / np.maximum(0.5, wf(t) / 2)
            b = r < best
            best = np.where(b, r, best); T = np.where(b, t, T)
            dd = np.maximum(dist, 1e-6)
            NX = np.where(b, dx / dd, NX); NY = np.where(b, dy / dd, NY)
            SD = np.where(b, np.sign(d[0] * dy - d[1] * dx + 1e-9), SD)
        m = best <= 1
        rr = np.clip(best, 0, 1); nz = np.sqrt(1 - rr * rr)
        v = NX * rr * LT[0] + NY * rr * LT[1] + nz * LT[2]
        sl = (slice(y0, y1), slice(x0, x1))
        s.m[sl] = m; s.t[sl] = T * m; s.e[sl] = SD * rr * m; s.v[sl] = v * m
        if clip is not None: s.m[clip:] = False


def tones(v, cuts=(0.2, 0.48, 0.76)):
    return np.select([v < cuts[0], v < cuts[1], v < cuts[2]], [1, 2, 3], 4)


def paint(f, m, mat, tone, line=True, rim=True):
    """Maske m mit Material (Text oder Feld) und Ton (Zahl oder Feld) als neues Teil setzen."""
    f.np += 1; f.line[f.np] = line; f.rim[f.np] = rim
    f.mat[m] = mat[m] if isinstance(mat, np.ndarray) else mat
    f.tone[m] = tone[m] if isinstance(tone, np.ndarray) else tone
    f.part[m] = f.np
    return m


def dots(f, pts, mat, t):
    for x, y in pts: f.px(int(x), int(y), mat, t)


def line_px(a, b):
    """Pixel einer Linie (Bildkoordinaten)."""
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    out = []
    for i in range(n + 1):
        k = i / n
        p = (int(round(a[0] + (b[0] - a[0]) * k)), int(round(a[1] + (b[1] - a[1]) * k)))
        if not out or out[-1] != p: out.append(p)
    return out


# ------------------------------------------------------------------------------------------- Gesicht
# Hageres Pilzweib, Dreiviertelansicht nach rechts (Pixelkarte): Knochenwulst über tiefen Höhlen, schräge
# Mandelaugen (E Kern, e Rand), kleines drittes Auge, Hakennase, eingefallene Wangen mit Fäulnisschatten,
# Maul mit ungleichen Fängen, spitzes Kinn. o Kontur, 1–4 Haut, 5 Glanz, p/q Fäulnis, B/b Wulst, k Höhle.
FACE = [
    '......ooooooooooooo.....',
    '....oo1222333344444oo...',
    '...o1p2223333444445o....',
    '..o1p222333334444455o...',
    '..o1p2223333444455555o..',
    '.o1pkkkk233455kkkkkkk5o.',
    '.o1pkEkkkk345kkkkkEEk4o.',
    '.o1pkkeEkk34kkkeEEkkk4o.',
    '.o1p2kkkk334kkkkkk44455o',
    '.o1p2223334444455544555o',
    '.o1pq2223p34445555445555o',
    '.o1pq222pp344444554455555o',
    '.o1pq222pp3344444444o44455o',
    '..o1q22pp33344444444o2224o.',
    '..o1pq2pp3334444kn44oooooo.',
    '..o1pq2p33oooooooooo.......',
    '...o1ppoMTMMTMMTTMMo....',
    '...o1pqoMMTMMMMMTMo.....',
    '....o1poMMMMMMMMMMo.....',
    '....o1poMtMMMtMMtMo.....',
    '.....o1poMtMMtMMMo......',
    '.....o1pqoooooooo3o.....',
    '......o1pq223334445o....',
    '.......o1pq2233445o.....',
    '........o1p223345o......',
    '.........oo12344o.......',
    '...........oo3oo........',
    '.............o..........',
]
FSPLIT = 18          # ab dieser Zeile klappt der Unterkiefer nach unten
FLEG = {'o': ('face', 0), '1': ('face', 1), '2': ('face', 2), '3': ('face', 3), '4': ('face', 4), '5': ('faceh', 3),
        'p': ('rot', 2), 'q': ('rot', 3), 'B': ('brow', 3), 'b': ('brow', 2), 'k': ('face', 0), 'n': ('face', 0),
        'M': ('maw', 1), 'T': ('fang', 3), 't': ('fang', 2), 'E': ('eye', 4), 'e': ('eye', 2)}


def face(f, x, h, jaw=0, eye=1.0):
    """Gesicht oben links bei Figurpunkt (x, h); jaw: Pixel, um die der Unterkiefer aufklappt; eye 0..1.4 Glut."""
    leg = dict(FLEG)
    ev = 4 if eye >= 1 else 3 if eye >= 0.6 else 2
    leg['E'] = ('eye', ev); leg['e'] = ('eye', max(1, ev - 2))
    if eye >= 1.3: leg['e'] = ('eye', 3)
    rows = FACE[:FSPLIT]
    if jaw > 0:
        mid = FACE[FSPLIT - 1]
        open_ = ''.join(('M' if 10 <= i <= 19 and c != '.' and c != 'o' else c) for i, c in enumerate(mid))
        rows = rows + [open_] * jaw
    rows = rows + FACE[FSPLIT:]
    m = f.sprite(x, h, rows, leg)
    # Schlund glimmt bei offenem Maul
    if jaw >= 2:
        X0, Y0 = f.at(x, h)
        for j in range(jaw):
            for i in range(12, 19):
                Y = Y0 + FSPLIT + j; X = X0 + i
                if 0 <= Y < f.H and f.mat[Y, X] == 'maw' and (i + j) % 2 == 0 and j >= jaw // 2: f.mat[Y, X] = 'eye'; f.tone[Y, X] = 1
    return m


# ------------------------------------------------------------------------------------------- Hut
SPOTS = [(-0.66, 0.42, 3.4), (-0.3, 0.74, 3.8), (0.12, 0.66, 3.0), (0.48, 0.4, 2.8), (-0.05, 0.34, 2.2), (-0.86, 0.14, 2.2),
         (0.74, 0.14, 2.0), (0.34, 0.86, 2.0), (-0.48, 0.16, 1.8), (0.62, 0.66, 1.6)]


def cap(f, c, tilt=0.0, gills=1.0, glow=0, hy=0.0, Rr=42, Hd=25, squash=0.0):
    """Breiter Warzenhut. c: Figurpunkt der Hutunterseite (Mitte); tilt in Grad (+ = nach vorn geneigt)."""
    cx, cy = f.at(*c)
    a = math.radians(tilt); ca, sa = math.cos(a), math.sin(a)
    Hd = Hd * (1 - squash * 0.2)
    Y, X = np.mgrid[0:f.H, 0:f.W] + 0.5
    dx, dy = X - cx, Y - cy
    lx = dx * ca + dy * sa; ly = -dx * sa + dy * ca           # lokal: lx quer, ly nach unten
    q = lx / Rr
    inside = np.abs(q) < 1
    sq = np.sqrt(np.clip(1 - q * q, 0, 1))
    rimy = 1 + 4.0 * q * q + 0.9 * np.sin(lx * 0.7 + 1.3) * np.where(np.abs(q) > 0.45, 1, 0.3)
    top = rimy - Hd * sq * (1 + 0.06 * np.sin(q * 7 + 1)) * (0.92 + 0.08 * (q < 0))
    # Lamellen unter dem Rand
    gd = (3 + 5 * sq) * gills
    gm = inside & (ly > rimy) & (ly <= rimy + gd) & (np.abs(q) < 0.93)
    depth = np.where(gm, (ly - rimy) / np.maximum(gd, 1), 0)
    gx = lx * (1 - depth * 0.5)
    lam = np.floor(gx / 2.6)
    lin = ((gx / 2.6) % 1) < 0.4
    gt = np.where(lin, 1, np.where(depth > 0.6, 2, 3))
    gmat = np.full((f.H, f.W), 'gill', dtype=object)
    hot = gm & ~lin & (np.abs(lx) > 5) & (((lam + glow) % 3) != 0) & (depth < 0.75)
    gmat[hot] = 'gillg'
    gt = np.where(hot, np.where(depth < 0.35, 3 + ((lam + glow) % 2 == 0), 2), gt)
    paint(f, gm, gmat, gt.astype(int), line=False)
    # Kuppel
    dm = inside & (ly >= top) & (ly <= rimy)
    rag = (ly > rimy - 1.3) & (np.abs(q) > 0.3) & (hash2(np.round(lx), 3, 261) < 0.2)
    dm &= ~rag
    hgt = np.where(dm, (rimy - ly) / np.maximum(0.01, rimy - top), 0)
    v = 0.26 + hgt * 0.4 + q * 0.3 + np.where((hgt > 0.55) & (q > -0.1), 0.12, 0)
    v -= np.where(ly > rimy - 1.6, 0.18, 0)
    wr = (hgt > 0.2) & (np.abs(np.sin(q * 9 + hgt * 2.2)) < 0.07)
    v -= np.where(wr, 0.14, 0)
    v += (BAYER4[(Y.astype(int)) % 4, (X.astype(int)) % 4] - 0.5) * 0.12
    t = np.select([v < 0.22, v < 0.42, v < 0.6, v < 0.78], [1, 2, 3, 4], 4)
    cm = np.full((f.H, f.W), 'cap', dtype=object)
    cm[dm & (v >= 0.78)] = 'capl'; t = np.where(dm & (v >= 0.78), np.where(v > 0.9, 3, 2), t)
    # Warzen
    for sx, sh_, r in SPOTS:
        slx = sx * Rr; sly = 1 + 4.0 * sx * sx - sh_ * Hd * math.sqrt(1 - sx * sx)
        dd = np.hypot(lx - slx, (ly - sly) * 1.35)
        wm = dm & (dd < r)
        lit = ((lx - slx) - (ly - sly)) > 0.4
        cm[wm] = 'spot'
        t = np.where(wm, np.where(dd > r - 0.9, np.where(lit, 2, 1), np.where(lit, 4, 3)), t)
    paint(f, dm, cm, t.astype(int))
    # Hyphenfäden vom Rand
    for j in range(12):
        qq = -0.95 + j * 0.172
        if -0.35 < qq < 0.7: continue
        L_ = 5 + hash2(j, 1, 271) * 13
        llx = qq * Rr; lly = 1 + 4.0 * qq * qq + 0.5
        px_, py_ = cx + llx * ca - lly * sa, cy + llx * sa + lly * ca
        for st in range(int(L_)):
            px_ += math.sin(hy + j * 1.3 + st * 0.3) * 0.3 * (st / L_) + sa * 0.6; py_ += 0.95
            f.px(int(round(px_)), int(round(py_)), 'myc', 3 if st < 2 else 2 if st % 2 else 4)
        if hash2(j, 2, 271) < 0.6: f.px(int(round(px_)), int(round(py_)) + 1, 'sacg', 3 + (glow + j) % 2)
    return (cx, cy)


# ------------------------------------------------------------------------------------------- Arme
def finger(f, base, ang, L, curl, w0=4.2, back=False, clip=None):
    """Wurzelkralle: gekrümmter Strang (Grad, Figurkoordinaten), Rinde, Knochenspitze."""
    pts = [base]; x, h = base; a = math.radians(ang)
    n = max(3, int(L / 2))
    for i in range(n):
        a += math.radians(curl) / n
        x += math.cos(a) * L / n; h += math.sin(a) * L / n
        pts.append((x, h))
    T = Tube(f, pts, lambda t: np.maximum(1.0, w0 - np.asarray(t) * (w0 - 1.0)), clip=clip)
    v = T.v - (0.12 if back else 0)
    tn = tones(v, (0.25, 0.5, 0.78))
    mt = np.full((f.H, f.W), 'barkd' if back else 'bark', dtype=object)
    tip = T.t > 0.62
    mt[tip] = 'bone'; tn = np.where(tip, np.where(v > 0.45, 3 if back else 4, 2), tn)
    joint = np.abs(T.t - 0.36) < 0.06
    tn = np.where(joint & ~tip & (tn > 1), tn - 1, tn)
    paint(f, T.m, mt, tn.astype(int))
    return pts[-1]


def arm(f, sh, hand, el_out=0.0, claw=0.0, back=False, seed=0, clip=None, sway=0.0, droop=0.0, fing=None, elbow=None):
    """Knorriger, gegliederter Rankenarm: Schulter -> Ellbogen -> Handgelenk, Rindenglieder mit Ringen und Knoten,
    Moos oben, Dornen außen, Wurzelhaare unten, zwei Leuchtknoten, vier Wurzelkrallen."""
    mb, mm = ('barkd', 'mossd') if back else ('bark', 'moss')
    el = elbow if elbow else ik(sh, hand, 46, 74, bend=1)
    el = (el[0] + el_out * 0.4, el[1] - el_out)
    up = bez(sh, lerp(lerp(sh, el, 0.5), (sh[0] + 6, sh[1] + 8), 0.2), el, 8)
    lo = bez(el, lerp(lerp(el, hand, 0.5), (hand[0] + 6, el[1]), 0.22), hand, 10)
    pts = up + lo[1:]
    n = len(pts); tj = (len(up) - 1) / (n - 1)
    base = 17 if not back else 15
    def wf(t):
        t = np.asarray(t, float)
        w = np.where(t < tj, base - 4.0 * t / tj, (base - 4.5) - 5.5 * (t - tj) / (1 - tj))
        bump = lambda c, a, k: np.maximum(0, a - np.abs(t - c) * k)
        return w + bump(tj, 4.0, 40) + bump(tj * 0.5, 2.2, 30) + bump(tj + (1 - tj) * 0.45, 2.2, 30) + bump(0.97, 3.0, 30) + 1.2 * np.sin(t * 23 + seed)
    T = Tube(f, pts, wf, clip=clip)
    v = T.v - (0.14 if back else 0)
    tn = tones(v, (0.24, 0.5, 0.78))
    mat = np.full((f.H, f.W), mb, dtype=object)
    Y, X = np.mgrid[0:f.H, 0:f.W]
    # Gliederung: dunkle Ringfugen, darüber eine helle Kante (Rindenwulst)
    seg_t = [tj * 0.5, tj, tj + (1 - tj) * 0.45, 0.94]
    for c in seg_t:
        ring = T.m & (np.abs(T.t - c) < 0.011)
        tn = np.where(ring, 1, tn)
        lip = T.m & (T.t - c > 0.011) & (T.t - c < 0.03) & (tn < 4) & (v > 0.3)
        tn = np.where(lip, tn + 1, tn)
    # Längsrisse in der Rinde
    crack = T.m & (np.abs(np.sin(T.t * 70 + T.e * 2.2 + seed)) < 0.1) & (np.abs(T.e) < 0.75) & (tn > 1)
    tn = np.where(crack, tn - 1, tn)
    moss = T.m & (v > 0.55) & (T.t < 0.9) & (vnoise(X * 0.3 + seed * 3, Y * 0.3, 16) > 0.6)
    mat[moss] = mm; tn = np.where(moss, np.where(v > 0.74, 4, 3), tn)
    paint(f, T.m, mat, np.maximum(1, tn).astype(int))
    P = T.pts
    def nrm(i, up_=True):
        a, c = P[max(0, i - 1)], P[min(len(P) - 1, i + 1)]
        tx, ty = c[0] - a[0], c[1] - a[1]; tl = math.hypot(tx, ty) or 1
        nx, ny = ty / tl, -tx / tl
        if (ny > 0) == up_: nx, ny = -nx, -ny
        return nx, ny, tx / tl, ty / tl
    # Wurzelhaare unten
    for i in range(2, len(P) - 2):
        if hash2(i, seed, 289) > 0.55: continue
        nx, ny, tx, ty = nrm(i, up_=False)
        hw = float(wf(i / (len(P) - 1))) / 2
        x_, y_ = P[i][0] + nx * (hw - 0.5), P[i][1] + ny * (hw - 0.5)
        L = 3 + int(hash2(i, seed, 291) * 5)
        for st in range(L):
            x_ += math.sin(sway * 6.28 + i + st * 0.6) * 0.35; y_ += 1
            if clip is not None and y_ >= clip: break
            f.px(int(round(x_)), int(round(y_)), mb, 2 if st < L - 1 else 3)
    # Dornen außen (oben), zur Hand hin kleiner, leicht zur Hand geneigt
    for i in range(1, len(P) - 2, 2):
        nx, ny, tx, ty = nrm(i)
        k = i / (len(P) - 1)
        hw = float(wf(k)) / 2
        L0 = (6.0 - 3.0 * k) * (0.75 + 0.5 * hash2(i, seed, 283))
        bx, by = P[i][0] + nx * (hw - 1.2), P[i][1] + ny * (hw - 1.2)
        tip = (bx + nx * L0 + tx * L0 * 0.5, by + ny * L0 + ty * L0 * 0.5)
        B1 = (bx - tx * 2.4, by - ty * 2.4); B2 = (bx + tx * 2.4, by + ty * 2.4)
        tri = f.poly([(B1[0] - f.FX, f.FY - B1[1]), (tip[0] - f.FX, f.FY - tip[1]), (B2[0] - f.FX, f.FY - B2[1])])
        if clip is not None: tri[clip:] = False
        if tri.any():
            tt = np.where(tri, 2, 0)
            # Licht auf der Vorderkante
            ys, xs = np.nonzero(tri)
            for y, x in zip(ys, xs):
                if not tri[y, min(f.W - 1, x + 1)] or not tri[max(0, y - 1), x]: tt[y, x] = 3
            paint(f, tri, 'bone', tt - (1 if back else 0))
            f.px(int(round(tip[0])), int(round(tip[1])), 'bone', 3 if back else 4)
    # Leuchtknoten (violett) auf zwei Gliedern
    for t0 in (tj * 0.72, tj + (1 - tj) * 0.7):
        i = int(round(t0 * (len(P) - 1)))
        nx, ny, _, _ = nrm(i)
        X_, Y_ = int(round(P[i][0] + nx * 2)), int(round(P[i][1] + ny * 2))
        if clip is not None and Y_ + 1 >= clip: continue
        for dx, dy, tt in ((0, 0, 4), (1, 0, 3), (0, 1, 3), (1, 1, 2), (-1, 0, 2), (0, -1, 2)):
            f.px(X_ + dx, Y_ + dy, 'vein', max(1, tt - (1 if back else 0)))
    # Ellbogenknoten
    kn = f.ell(el[0] - 0.5, el[1] + 0.5, 7.0, 6.0)
    if clip is not None: kn[clip:] = False
    kt = dome(kn, r=2.6, cuts=(0.25, 0.55, 0.82))
    paint(f, kn, mb, np.where(kn, kt - (1 if back else 0), 0).clip(1, 4), line=False)
    eX, eY = f.at(*el)
    for dx, dy, m_, tt in ((1, -3, 'bone', 3), (2, -4, 'bone', 4), (-2, -2, mm, 3), (-3, -2, mm, 4)):
        if clip is None or eY + dy < clip: f.px(eX + dx, eY + dy, m_, tt - (1 if back else 0))
    # Schulterknoten: Wurzelknolle, aus der der Arm wächst, Ausläufer greifen auf den Rumpf
    sk = f.ell(sh[0] + 1, sh[1] + 1, 7, 6)
    if clip is not None: sk[clip:] = False
    st_ = dome(sk, r=3, cuts=(0.28, 0.55, 0.8))
    smat = np.where(sk & (st_ >= 4) & (hash2(*np.mgrid[0:f.H, 0:f.W][::-1], 77) < 0.5), mm, mb).astype(object)
    paint(f, sk, smat, np.where(sk, st_ - (1 if back else 0), 0).clip(1, 4), line=False)
    # Krallen: vier, gespreizt, krümmen sich nach unten
    dx_, dh_ = hand[0] - lo[-3][0], hand[1] - lo[-3][1]
    a0 = math.degrees(math.atan2(dh_, dx_))
    sp = 22 + claw * 14
    fing = fing or (0, 0, 0, 0)
    for j in range(4):
        L = (24, 28, 26, 19)[j] * (0.85 if back else 1)
        finger(f, hand, a0 + (1.5 - j) * sp * 0.6 + 12 - claw * 10 + fing[j], L, -(40 + claw * 50) - fing[j] * 0.5, w0=5.4 if not back else 4.8, back=back, clip=clip)
    hm = f.ell(hand[0], hand[1], 6.6, 6.0)
    if clip is not None: hm[clip:] = False
    paint(f, hm, mb, np.where(hm, dome(hm, r=2, cuts=(0.3, 0.6, 0.85)) - (1 if back else 0), 0).clip(1, 4), line=False)
    return el, T


# ------------------------------------------------------------------------------------------- Leib
SACS = [(-90, 92, 12, 0.0), (-56, 108, 9, 0.35), (-126, 62, 9, 0.6), (-40, 70, 7, 0.15), (-80, 50, 7, 0.8), (-112, 100, 6, 0.5),
        (-140, 30, 5, 0.25), (-62, 30, 5, 0.7)]


def sac(f, x, h, r, pulse, glow):
    """Sporenkapsel, halb im Fleisch: Kragen unten, Haut gewölbt, pulse 0..1 (Größe), glow 0..2 (Helligkeit)."""
    rr = r + (1 if pulse > 0.5 else 0)
    col = f.ell(x, h - 1.2, rr + 2.4, rr + 1.6) & ~f.ell(x, h + 2.5, rr + 1.2, rr)
    ct = dome(col, r=1.6, cuts=(0.25, 0.5, 0.75))
    paint(f, col, 'flesh', np.where(col, np.minimum(4, ct + 1), 0))
    m = f.ell(x, h, rr, rr * 0.94)
    t = dome(m, r=max(2.0, rr * 0.7), cuts=(0.2, 0.45, 0.72))
    tt = np.clip(t + glow - 1, 1, 4)
    mat = np.where(m & (t + glow >= 5), 'sacg', 'sac').astype(object)
    tt = np.where(mat == 'sacg', np.clip(t + glow - 3, 1, 4), tt)
    paint(f, m, mat, np.where(m, tt, 0).astype(int))
    X, Y = f.at(x, h)
    # Membranader quer und dunkle Sporenkörner
    for k in range(-int(rr * 0.7), int(rr * 0.7) + 1):
        yy = Y + int(round(math.sin(k * 0.5 + x) * rr * 0.2 + rr * 0.3))
        xx = X + k
        if 0 <= yy < f.H and 0 <= xx < f.W and m[yy, xx]: f.mat[yy, xx] = 'sac'; f.tone[yy, xx] = max(1, f.tone[yy, xx] - 2) if f.mat[yy, xx] == 'sac' else 1
    for i in range(int(rr * 1.3)):
        dx, dy = int((hash2(i, x, 7) - 0.5) * rr * 1.3), int((hash2(i, h, 9) - 0.5) * rr * 1.2)
        if 0 <= Y + dy < f.H and 0 <= X + dx < f.W and m[Y + dy, X + dx] and (dx + dy) % 2 == 0: f.mat[Y + dy, X + dx] = 'sac'; f.tone[Y + dy, X + dx] = 1
    gx, gy = int(round(X + rr * 0.35)), int(round(Y - rr * 0.5))
    f.px(gx, gy, 'sacg', 4); f.px(gx - 1, gy, 'sacg', 3)
    if rr >= 8: f.px(gx, gy + 1, 'sacg', 3); f.px(gx + 1, gy + 1, 'sacg', 2)


LOBES = [(-126, 40, 34, 36, 1), (-74, 62, 58, 54, 2), (-96, 104, 36, 22, 3), (-22, 40, 32, 38, 4), (-36, 86, 24, 22, 5)]


def brood(f, ph, br=0, sacp=None, glow=None, swell=0.0, vein=0, flat=0.0):
    """Brutleib aus Wülsten (je mit eigener Wölbung, dunkle Furchen dazwischen), hängende Falten über den Wurzeln,
    Fleckung, Adern, Poren, Schleimfäden, Kapseln, Pilze und Konsolen."""
    Y, X = np.mgrid[0:f.H, 0:f.W]
    gy = f.at(0, 0)[1]
    nz = vnoise(X * 0.14, Y * 0.14, 16)
    n2 = vnoise(X * 0.21 + 3, Y * 0.25, 16)
    whole = np.zeros((f.H, f.W), bool)
    fz, fw = 1 - flat, 1 + flat * 0.6        # Stauchung beim Einschlag: flacher und breiter
    for lx, lh, rx, rh, sd in LOBES:
        lx, lh, rx, rh = lx * (1 + flat * 0.25), lh * fz, rx * fw, rh * fz
        b = br * (0.6 if lh > 60 else 0.3)
        m = f.ell(lx, lh + b, rx + br * 0.5, rh + b)
        grow = outline_mask(m) & (nz > 0.6); shrink = edge_of(m) & (nz < 0.3)
        m = (m | grow) & ~shrink
        # hängender Saum unten (Falten über den Wurzeln)
        cols = np.nonzero(m.any(0))[0]
        for x in cols:
            c = np.nonzero(m[:, x])[0]; lo = c.max()
            if lo > gy - 30:
                sag = int(2 + 2.5 * math.sin(x * 0.27 + sd) + 1.5 * math.sin(x * 0.61 + sd * 2))
                m[lo:min(gy, lo + max(0, sag)), x] = True
        m[gy:] = False
        # Ellipsoid-Licht (rechts oben vorn), unten schwer; Stufen mit schmaler Schachbrett-Kante
        cx_, cy_ = f.at(lx, lh + b)
        u = (X + 0.5 - cx_) / (rx + br * 0.5); w = (Y + 0.5 - cy_) / (rh + b)
        rr = np.clip(np.hypot(u, w), 0, 1); nzv = np.sqrt(1 - rr * rr)
        lv = 0.42 * u - 0.55 * w + 0.72 * nzv - np.clip(w, 0, 1) * 0.25 + (n2 - 0.5) * 0.06
        t = np.select([lv < 0.3, lv < 0.55, lv < 0.8], [1, 2, 3], 4)
        low = m & (Y > gy - 30)
        fs = np.sin(X * 0.45 + np.sin(Y * 0.2 + sd) * 0.9)
        t = np.where(low & (fs > 0.6) & (t > 1), t - 1, t)
        t = np.where(low & (fs < -0.8) & (t < 4) & (t > 1), t + 1, t)
        # nasser Glanz: kleine helle Sichel oben rechts
        gl = m & (lv > 0.93) & (hash2(X, Y, 17 + sd) < 0.55)
        t = np.where(m & (Y >= gy - 4), np.maximum(1, t - 1), t)
        t = np.where(m & (Y >= gy - 2), 1, t)
        fm = np.where(gl, 'fleshl', 'flesh').astype(object)
        t = np.where(gl, 3, t)
        paint(f, m, fm, np.where(m, t, 0).astype(int))
        whole |= m
    # Poren
    for y, x in zip(*np.nonzero(whole & (hash2(X // 2, Y // 2, 235) < 0.025) & (X % 2 == 0) & (Y % 2 == 0) & (Y < gy - 8))):
        if f.mat[y, x] == 'flesh' and f.tone[y, x] > 1:
            f.tone[y, x] = 0
            if y + 1 < f.H and f.mat[y + 1, x] == 'flesh': f.tone[y + 1, x] = min(4, f.tone[y + 1, x] + 1)
    # Adern (violett glimmend): weiche Bögen von unten nach oben, Stamm 2 px, Äste 1 px, Glanz daneben
    def vein_line(pts, wide, k):
        for (x1, h1), (x2, h2) in zip(pts, pts[1:]):
            for X_, Y_ in line_px(f.at(x1, h1), f.at(x2, h2)):
                for dx in ((0, 1) if wide else (0,)):
                    xx = X_ + dx
                    if 0 <= Y_ < f.H and 0 <= xx < f.W and whole[Y_, xx] and f.mat[Y_, xx] in ('flesh', 'fleshl') and f.tone[Y_, xx] > 0:
                        hot = ((Y_ // 4 + k + vein) % 5 == 0) and dx == 0
                        f.mat[Y_, xx] = 'vein'; f.tone[Y_, xx] = 4 if hot else 3 if dx == 0 else 2
                if 0 <= Y_ < f.H and X_ - 1 >= 0 and f.mat[Y_, X_ - 1] == 'flesh' and f.tone[Y_, X_ - 1] > 1: f.tone[Y_, X_ - 1] -= 1
                xr = X_ + (2 if wide else 1)
                if 0 <= Y_ < f.H and xr < f.W and f.mat[Y_, xr] == 'flesh' and f.tone[Y_, xr] < 4: f.tone[Y_, xr] += 1
    for k, (sx, top, amp, ph0) in enumerate(((-108, 70, 5, 0.3), (-70, 104, 7, 1.4), (-34, 74, 4, 2.2), (-136, 52, 4, 3.1), (-88, 92, 6, 4.0))):
        top = int(round(top * fz)); sx = sx * (1 + flat * 0.25)
        trunk = [(sx + amp * math.sin(h_ * 0.07 + ph0) + (h_ * 0.08 if k % 2 else -h_ * 0.06), h_) for h_ in range(2, top, 3)]
        vein_line(trunk, True, k)
        for j, i0 in enumerate(range(5, len(trunk) - 3, 8)):
            d = 1 if (j + k) % 2 else -1
            x0, h0 = trunk[i0]
            br_ = [(x0 + d * (q * 2.0 - 0.1 * q * q), h0 + q * 1.6 + 0.12 * q * q) for q in range(0, 9)]
            vein_line(br_, False, k + j)
    # Schleimfäden unten
    for j in range(11):
        x = -158 + j * 16 + hash2(j, 1, 237) * 6
        X_ = f.at(x, 0)[0]
        if not (0 <= X_ < f.W): continue
        c = np.nonzero(whole[:gy - 1, X_])[0]
        if not len(c): continue
        y0 = c.max()
        L = 2 + int(hash2(j, 2, 237) * 3 + (ph * 3 + j) % 3)
        for s_ in range(L):
            if y0 + 1 + s_ < gy - 1: f.px(X_, y0 + 1 + s_, 'slime', 4 if s_ == L - 1 else 2)
    # Pilze auf dem Rücken
    for i, (x, sh_, cw, tl) in enumerate(((-106, 10, 12, -4), (-92, 6, 8, 6), (-62, 9, 11, 3), (-136, 6, 7, -8), (-48, 4, 6, 8), (-120, 4, 6, -2))):
        X_ = f.at(x, 0)[0]
        c = np.nonzero(whole[:, X_])[0]
        if not len(c): continue
        h_ = f.FY - c.min() - 3
        sw = math.sin(ph * 2 * math.pi + i * 1.9) * 0.9 + tl * 0.4
        stem = Tube(f, [(x, h_ - 4), (x + sw * 0.5, h_ + sh_ * 0.5), (x + sw, h_ + sh_)], lambda t: 6.0 - np.asarray(t) * 1.6)
        paint(f, stem.m, 'spot', tones(stem.v, (0.3, 0.55, 0.8)))
        top = (x + sw, h_ + sh_)
        cp = f.poly([(top[0] - cw, top[1] - 1.5), (top[0] - cw * 0.85, top[1] + cw * 0.3), (top[0] - cw * 0.45, top[1] + cw * 0.62), (top[0], top[1] + cw * 0.7),
                     (top[0] + cw * 0.5, top[1] + cw * 0.58), (top[0] + cw * 0.88, top[1] + cw * 0.28), (top[0] + cw, top[1] - 1.5)])
        tt = np.where(cp, dome(cp, r=max(2, cw * 0.45), cuts=(0.25, 0.5, 0.78)), 0)
        cm = np.where(cp & (tt == 4), 'capl', 'cap').astype(object)
        tt = np.where(cm == 'capl', 2, tt)
        paint(f, cp, cm, tt.astype(int))
        X_, Y_ = f.at(top[0] - cw + 1, top[1] - 1.5)
        for k in range(int(cw * 2) - 1):
            f.px(X_ + k, Y_ + 1, 'gillg', 3 if (k + i) % 2 else 2)
        for k in range(3):
            if cw < 8 and k != 1: continue
            sx_, sy_ = f.at(top[0] + (k - 1) * cw * 0.45, top[1] + cw * (0.38 if k != 1 else 0.52))
            f.px(sx_, sy_, 'spot', 4); f.px(sx_ + 1, sy_, 'spot', 3)
    # Konsolenpilze an der Flanke (Regale mit glimmender Unterseite)
    for i, (x, h_, w_) in enumerate(((-150, 50, 8), (-112, 30, 6), (-4, 64, 7))):
        x, h_ = x * (1 + flat * 0.25), h_ * fz
        sh = f.poly([(x - w_, h_), (x - w_ * 0.7, h_ + 4), (x + w_ * 0.3, h_ + 5), (x + w_, h_ + 2), (x + w_ * 0.8, h_ - 0.5)])
        paint(f, sh, 'cap', np.where(sh, dome(sh, r=1.6, cuts=(0.25, 0.5, 0.8)), 0))
        X_, Y_ = f.at(x - w_ + 1, h_ - 0.5)
        for k in range(int(w_ * 2) - 2):
            f.px(X_ + k, Y_, 'gillg', 3 if (k + i) % 2 else 2)
    for i, (x, h_, r, p0) in enumerate(SACS):
        sac(f, x * (1 + flat * 0.25), h_ * fz + br * 0.5, r + swell, sacp[i] if sacp else 0, glow[i] if glow else 1)
    return whole


def roots(f, ph, front=True, wig=0.0, reach=1.0):
    """Wurzelteppich: Stränge vom Leibrand über den Boden, Moos, Ringe, Leuchtspitzen."""
    spec = ((-6, 64, 8, -4, 0), (-40, 22, 6, 5, 1), (-74, -6, 5, 3, 2), (-112, -46, 6, -3, 3), (-150, -200, 8, 5, 4),
            (-130, -176, 5, -4, 5), (-24, 100, 6, 3, 6), (-92, -136, 5, 4, 7)) if front else \
           ((-60, -120, 7, -5, 8), (-20, 48, 7, 4, 9), (-140, -190, 6, 3, 10), (-100, -60, 6, -3, 11), (0, 84, 5, 2, 12))
    Y, X = np.mgrid[0:f.H, 0:f.W]
    for x0, x1, w0, bend, sd in spec:
        x1 = x0 + (x1 - x0) * reach
        pts = []
        for k in range(10):
            u = k / 9
            hump = math.sin(min(1, u * 1.5) * math.pi) * (2.5 + hash2(sd, 4, 201) * 3)
            wv = math.sin(ph * 2 * math.pi + sd + u * 3) * wig * u
            pts.append((x0 + (x1 - x0) * u, (9 if front else 11) * (1 - u) ** 1.6 + hump + wv + 0.6))
        T = Tube(f, pts, lambda t: np.maximum(1.4, w0 * (1 - np.asarray(t) * 0.8)), clip=GROUND - 1)
        v = T.v - (0 if front else 0.15)
        tn = tones(v, (0.25, 0.5, 0.78))
        mat = np.full((f.H, f.W), 'bark' if front else 'barkd', dtype=object)
        ms = (v > 0.5) & (T.t < 0.6) & (hash2(X // 2, Y // 2, 205 + sd) < 0.45)
        mat[ms] = 'moss' if front else 'mossd'
        ring = np.abs(((T.t * 6 + sd * 0.3) % 1) - 0.5) < 0.05
        tn = np.where(ring & (tn > 1), tn - 1, tn)
        paint(f, T.m, mat, tn.astype(int))
        tx, ty = T.pts[-1]
        if hash2(sd, 6, 201) < 0.6:
            f.px(int(tx), int(ty) - 1, 'sacg', 3 + int(math.sin(ph * 2 * math.pi + sd) > 0.3))


# ------------------------------------------------------------------------------------------- Oberkörper, Mantel, Kopf
TB = (-14, 64)
KZ, DZ = 0.8, 6        # Oberkörper gestaucht (Faktor über TB) und tiefer in den Leib gesetzt – Figur bleibt unter y = 20


def body_rt(p):
    """Abbildung Entwurfskoordinaten des Oberkörpers -> Figurkoordinaten (Stauchung, Absenkung, Neigung)."""
    lean = p.get('lean', 0); by = p.get('by', 0); sk = DZ + p.get('sink', 0)
    k = KZ * (1 + by / 60)
    piv = (TB[0], TB[1] - sk)
    def Rt(q):
        h = TB[1] + (q[1] - TB[1]) * k if q[1] > TB[1] else q[1]
        return rot((q[0], h - sk), piv, -lean)
    def inv_np(X, Hh):
        a = math.radians(lean); dx, dh = X - piv[0], Hh - piv[1]
        x0 = piv[0] + dx * np.cos(a) - dh * np.sin(a)
        h0 = piv[1] + dx * np.sin(a) + dh * np.cos(a) + sk
        h0 = np.where(h0 > TB[1], TB[1] + (h0 - TB[1]) / k, h0)
        return x0, h0
    return Rt, inv_np


def _interp(pts, h):
    hs = np.array([q[1] for q in pts]); xs = np.array([q[0] for q in pts])
    o = np.argsort(hs)
    return np.interp(h, hs[o], xs[o])


def torso(f, p, ph):
    """Verwachsener, nach vorn gekrümmter Oberkörper mit klaren Materialzonen (Licht links oben = Figur rechts oben):
    Buckel aus fauligen Rindenplatten (Fugen dunkel, Oberkante hell), eingefallene Brust aus fahler Haut mit
    Rippenbögen, Lamellenfalten am Bauch (Pilzunterseite), gezeichnete Eiterpusteln, Wirbeldornen, Konsolenpilze."""
    Rt, inv = body_rt(p)
    back = [(-34, 64), (-38, 84), (-34, 102), (-24, 118), (-10, 128), (4, 132), (12, 131)]
    front = [(22, 124), (25, 114), (24, 102), (19, 92), (14, 82), (12, 70), (10, 60)]
    m = f.poly([Rt(q) for q in back + front])
    Y, X = np.mgrid[0:f.H, 0:f.W]
    LX, LH = inv((X + 0.5 - f.FX) / f.S, (f.FY - (Y + 0.5)) / f.S)
    xb = _interp(back + [(12, 131)], LH); xf = _interp(front + [(12, 131)], LH)
    U = (LX - xb) / np.maximum(4, xf - xb)                     # 0 Rücken .. 1 Brust
    big = dome(m, r=10, cuts=(0.28, 0.52, 0.78))                # große Form
    mat = np.full((f.H, f.W), 'hide', dtype=object)
    t = big.copy()
    # --- Rindenplatten auf Buckel und Flanke: Reihen entlang der Höhe, versetzte Fugen, je Platte eigene Wölbung
    plate = m & (U < 0.6) & (LH > 70)
    rowh = 10.0
    r = np.floor((LH - 70) / rowh); fr = (LH - 70) / rowh - r
    cc = U * 3.2 + (r % 2) * 0.5; c = np.floor(cc); fc = cc - c
    seam = plate & ((fr < 0.1) | (fc < 0.07))
    pt = np.clip(np.minimum(big, 3) + np.where(fr > 0.7, 1, 0) - np.where(fr < 0.3, 1, 0) + np.where((fc > 0.78) & (fr > 0.3), 1, 0), 1, 4)
    t = np.where(plate, pt, t)
    t = np.where(seam, 1, t)
    # Moosplatten (ganze Platten, klar begrenzt)
    mp = plate & ~seam & (hash2(r, c, 41) < 0.28)
    mat[mp] = 'moss'
    # --- Brust: fahle, eingefallene Haut mit Rippenbögen
    chest = m & (U >= 0.6) & (LH > 84)
    mat[chest] = 'skin'
    t = np.where(chest, np.clip(big, 2, 4), t)
    t = np.where(m & (np.abs(U - 0.6) < 0.035) & (LH > 70), 1, t)    # Fuge Rinde/Haut
    for k in range(5):
        h0 = 92 + k * 7
        ry = h0 - 2.5 * (U - 0.6) / 0.4           # Rippen fallen zur Brust hin
        rib = chest & (LH >= ry) & (LH < ry + 1.6 / KZ)
        und = chest & (LH < ry) & (LH >= ry - 1.3 / KZ)
        t = np.where(rib, np.minimum(4, big + 1), t); mat[rib & (big >= 3)] = 'bone'
        t = np.where(rib & (mat == 'bone'), 3, t)
        t = np.where(und, 1, t)
    # --- Lamellen: Bauchfalten wie eine Pilzunterseite, senkrechte Blätter, Spitzen glimmen giftig
    lam = m & (LH <= 86) & (LH > 60) & (U > 0.3)
    mat[lam] = 'gill'
    st = np.floor(LX / 3.0); sf = LX / 3.0 - st
    lt = np.where(sf < 0.34, 1, np.where(sf < 0.67, 2 + (big >= 3), 3))
    t = np.where(lam, np.clip(lt, 1, 4), t)
    t = np.where(m & (np.abs(LH - 86) < 0.7) & (U > 0.3), 1, t)
    tipg = lam & (LH < 66) & (sf >= 0.35) & (st % 2 == 0)
    mat[tipg] = 'gillg'; t = np.where(tipg, 3, t)
    mat[m & (U >= 0.6) & (LH > 84) & (mat == 'hide')] = 'skin'
    paint(f, m, mat, np.where(m, t, 0).astype(int))
    # --- Eiterpusteln: gezeichnete Kuppen mit Hautkragen, Glanzpunkt oben vorn, dunkle Pore
    for i, (px_, ph_, pr) in enumerate(((-24, 96, 3.6), (-12, 112, 2.8), (-30, 80, 2.6), (-4, 100, 2.2), (16, 106, 2.0),
                                       (-18, 124, 2.0), (6, 118, 1.6), (-36, 92, 1.6))):
        cx, ch = Rt((px_, ph_))
        ring = f.ell(cx, ch - 0.3, pr + 1.2, pr + 0.9)
        paint(f, ring, 'skin', np.where(ring, np.minimum(4, dome(ring, r=1.4, cuts=(0.3, 0.55, 0.8)) + 0), 0), line=True)
        pm = f.ell(cx, ch, pr, pr * 0.9)
        pt_ = dome(pm, r=max(1.2, pr * 0.7), cuts=(0.2, 0.45, 0.72))
        paint(f, pm, 'pus', np.where(pm, pt_, 0), line=True)
        X0, Y0 = f.at(cx + pr * 0.35, ch + pr * 0.4)
        f.px(X0, Y0, 'pus', 4)
        if pr >= 2.5:
            f.px(*f.at(cx - pr * 0.3, ch - pr * 0.3), 'pus', 1)
    # Rückgrat: Wirbeldornen aus Knochen, nach hinten oben gerichtet, zum Nacken kleiner
    for i, ((x1, h1), (x2, h2)) in enumerate(zip(back[1:], back[2:])):
        for k in (0.2, 0.7):
            bx, bh = x1 + (x2 - x1) * k, h1 + (h2 - h1) * k
            tx, th = x2 - x1, h2 - h1; tl = math.hypot(tx, th) or 1
            nx, nh = -th / tl, tx / tl
            L = 11 - i * 1.4 + (2 if k > 0.5 else 0)
            b0 = Rt((bx, bh))
            a_ = Rt((bx - tx / tl * 2.4, bh - th / tl * 2.4)); b_ = Rt((bx + tx / tl * 2.4, bh + th / tl * 2.4))
            tipp = (b0[0] + nx * L - 3 * tx / tl, b0[1] + nh * L * 0.9 - 3 * th / tl)
            tri = [a_, tipp, b_]
            tm = f.poly(tri)
            tt = np.where(tm, 2, 0)
            ys, xs = np.nonzero(tm)
            for y, x in zip(ys, xs):
                if not tm[max(0, y - 1), x] or not tm[y, min(f.W - 1, x + 1)]: tt[y, x] = 3
            paint(f, tm, 'bone', tt)
            X_, Y_ = f.at(*tipp); f.px(X_, Y_, 'bone', 4)
    # Konsolenpilze am Buckel: Regale mit Warzen, Unterseite glimmt
    for i, (x, h_, w_) in enumerate(((-38, 88, 10), (-30, 108, 8))):
        c_ = Rt((x, h_))
        sh = f.poly([(c_[0] + 2, c_[1]), (c_[0] - w_ * 0.4, c_[1] + 3.5), (c_[0] - w_, c_[1] + 2.5), (c_[0] - w_ * 1.1, c_[1] - 0.5), (c_[0] - w_ * 0.6, c_[1] - 1.5), (c_[0] + 2, c_[1] - 1.5)])
        tt = np.where(sh, dome(sh, r=1.8, cuts=(0.25, 0.5, 0.78)), 0)
        cm = np.where(sh & (tt == 4), 'capl', 'cap').astype(object); tt = np.where(cm == 'capl', 2, tt)
        paint(f, sh, cm, tt.astype(int))
        X0, Y0 = f.at(c_[0] - w_ * 1.05, c_[1] - 1)
        for k in range(int(w_ * 1.1)):
            f.px(X0 + k, Y0 + 1, 'gillg', 3 if (k + i) % 2 else 2)
        f.px(*f.at(c_[0] - w_ * 0.5, c_[1] + 2.5), 'spot', 4)
    # Fleischlippen über dem Ansatz (klare Wülste)
    for i, (x, h_, rx, rh) in enumerate(((-28, 64, 15, 9), (-6, 60, 14, 8), (8, 58, 9, 6))):
        cx, ch = Rt((x, h_))
        mm = f.ell(cx, ch, rx, rh)
        paint(f, mm, 'flesh', np.where(mm, np.maximum(1, dome(mm, r=4, cuts=(0.28, 0.55, 0.8)) - 1), 0))
    N = Rt((14, 126))
    return N, None, Rt


def mantle(f, N, Rt, ph, glow=0, sway=0.0):
    """Myzelhaar: wenige durchgehende Hyphensträhnen vom Nacken über den Buckelrand, Spitze glimmt giftig."""
    for i in range(5):
        e = i / 4
        x0, h0 = -10 - e * 22, 128 - e * 22
        X, Y = f.at(*Rt((x0, h0)))
        x, y = float(X), float(Y)
        L = int(12 + 6 * hash2(i, 1, 311) + 6 * e)
        for st in range(L):
            fr = st / L
            x += -0.55 + math.sin(ph * 2 * math.pi + i * 0.9 + st * 0.25) * 0.25 * fr + sway * 0.3 * fr; y += 1
            f.px(int(round(x)), int(round(y)), 'myc', 3 if st < L * 0.5 else 2)
            f.px(int(round(x)) + 1, int(round(y)), 'myc', 4 if st < L * 0.3 else 3)
        f.px(int(round(x)), int(round(y)) + 1, 'sacg', 2 + (glow + i) % 3)


def neck(f, N, p):
    hd = p.get('head', (0, 0))
    hx, hh = N[0] + 13 + hd[0], N[1] + 10 + hd[1]
    # Hals: dürr, zwei Sehnenstränge, Kehle im Schatten
    nk = Tube(f, [(N[0] - 8, N[1] - 10), ((N[0] + hx) / 2 - 3, (N[1] + hh) / 2 - 3), (hx - 1, hh - 4)], lambda t: 13 - np.asarray(t) * 3)
    tn = tones(nk.v, (0.3, 0.55, 0.8))
    mat = np.full((f.H, f.W), 'face', dtype=object)
    sinew = nk.m & ((np.abs(nk.e - 0.45) < 0.1) | (np.abs(nk.e + 0.1) < 0.08))
    tn = np.where(sinew & (tn < 4), tn + 1, tn)
    gap = nk.m & (np.abs(nk.e - 0.22) < 0.08)
    tn = np.where(gap, 1, tn)
    rotn = nk.m & (nk.e < -0.55); mat[rotn] = 'rot'; tn = np.where(rotn, 2, tn)
    paint(f, nk.m, mat, np.clip(tn, 1, 4).astype(int))


def head(f, N, p, ph, glow=0):
    lean = p.get('lean', 0)
    hd = p.get('head', (0, 0))
    hx, hh = N[0] + 13 + hd[0], N[1] + 10 + hd[1]
    jaw = int(round(p.get('jaw', 0) * 6))
    face(f, hx - 9, hh + 14, jaw=jaw, eye=p.get('eye', 1.0))
    capc = (hx + 2 + p.get('capx', 0), hh + 20 + p.get('capy', 0))
    cap(f, capc, tilt=p.get('cap', 8), glow=glow, hy=ph * 2 * math.pi, gills=1 + p.get('gill', 0), squash=p.get('squash', 0))


# ------------------------------------------------------------------------------------------- Posen
POSEN = {
    'ruhe': dict(lean=4, cap=8, hf=(98, 40), hb=(72, 30), ef=(42, 60), eb=(22, 58), eye=1.0),
    # Ausholen: sie richtet sich auf, Ranken hoch (Ellbogen gebeugt, Hände über Kopfhöhe, aber unter y = 20)
    'zug': dict(lean=-3, by=1, cap=4, capy=0, hf=(94, 112), ef=(58, 98), hb=(76, 122), eb=(42, 100), jaw=0.4, eye=1.2, claw=0.8,
                head=(-1, 1), gill=0.3),
    'zug2': dict(lean=-5, by=1, cap=2, capy=-1, hf=(88, 122), ef=(60, 102), hb=(70, 126), eb=(44, 104), jaw=0.8, eye=1.3, claw=1.0,
                 head=(-2, -1), gill=0.6, squash=-0.2),
    'halt': dict(lean=-6, by=1, cap=0, capy=-1, hf=(84, 124), ef=(60, 104), hb=(66, 128), eb=(44, 106), jaw=1.0, eye=1.4, claw=1.0,
                 head=(-2, -2), gill=0.8, squash=-0.25),
    # Hieb: Zwischenbild (Arm vorn oben, Ellbogen führt) und Peitschbild (Unterarm schlägt nach unten durch)
    'hieb0': dict(lean=2, by=1, cap=6, hf=(126, 104), ef=(72, 114), hb=(108, 110), eb=(54, 112), jaw=1.0, eye=1.4, claw=0.6, head=(0, 0), gill=0.5),
    'hieb': dict(lean=12, by=-2, cap=14, hf=(130, 36), ef=(84, 76), hb=(112, 44), eb=(62, 74), jaw=1.0, eye=1.4, claw=0.4, head=(6, 4), gill=0.4),
    # Einschlag: Ranken stecken im Boden, Körper staucht (flacher, breiter Leib, Hut gequetscht), Ellbogen knicken hoch
    'ein': dict(lean=17, by=-5, sink=3, flat=0.10, cap=20, squash=0.35, hf=(128, -14), ef=(84, 60), hb=(108, -12), eb=(62, 58),
                jaw=1.0, eye=1.4, claw=0.2, head=(5, 2), clip=True, gill=0.3),
    # Nachschwingen: Körper schiebt nach, tiefste Stauchung, Hände pflügen weiter, Ellbogen knicken stärker
    'ein_s': dict(lean=21, by=-8, sink=5, flat=0.15, cap=24, squash=0.45, hf=(134, -14), ef=(94, 54), hb=(114, -12), eb=(72, 52),
                  jaw=1.0, eye=1.4, claw=0.2, head=(7, 1), clip=True, gill=0.3),
    # Zurückfedern: Körper schnellt hoch und zurück, Arme strecken sich (Hände bleiben im Boden)
    'ein_r': dict(lean=8, by=3, sink=0, flat=-0.03, cap=9, squash=-0.1, hf=(130, -14), ef=(72, 54), hb=(110, -12), eb=(52, 52),
                  jaw=0.7, eye=1.2, claw=0.2, head=(1, 1), clip=True, gill=0.2),
    # Nachbeben: kleiner werdendes Nachwippen
    'ein_n1': dict(lean=15, by=-3, sink=2, flat=0.06, cap=16, squash=0.2, hf=(131, -14), ef=(80, 58), hb=(111, -12), eb=(58, 56),
                   jaw=0.8, eye=1.3, claw=0.2, head=(4, 2), clip=True),
    'ein_n2': dict(lean=11, by=0, sink=1, flat=0.02, cap=12, squash=0.05, hf=(131, -14), ef=(76, 56), hb=(111, -12), eb=(55, 54),
                   jaw=0.6, eye=1.2, claw=0.2, head=(3, 1), clip=True),
    'ein_n3': dict(lean=13, by=-1, sink=1, flat=0.04, cap=14, squash=0.1, hf=(131, -14), ef=(78, 57), hb=(111, -12), eb=(56, 55),
                   jaw=0.5, eye=1.1, claw=0.2, head=(3, 2), clip=True),
    'auf': dict(lean=8, by=0, cap=12, hf=(112, 18), ef=(60, 56), hb=(90, 14), eb=(40, 52), jaw=0.3, eye=1.0, claw=0.4, head=(1, 0)),
    'auf2': dict(lean=6, by=0, cap=10, hf=(104, 30), ef=(50, 58), hb=(80, 24), eb=(30, 56), jaw=0.1, eye=1.0, claw=0.3, head=(0, 0)),
}


def shoulders(p):
    Rt, _ = body_rt(p)
    return Rt((8, 100)), Rt((-8, 108))


def arm_layer(p, front=True, aph=0.0, clip=None):
    f = new()
    shF, shB = shoulders(p)
    h = p['hf'] if front else p['hb']
    d = p.get('df' if front else 'db', (0, 0))
    arm(f, shF if front else shB, (h[0] + d[0], h[1] + d[1]), el_out=p.get('eo', 0), claw=p.get('claw', 0.3), back=not front,
        seed=7 if front else 3, clip=clip, sway=aph, fing=p.get('fing' if front else 'fingb'), elbow=p.get('ef' if front else 'eb'))
    im = f.render(rim=RIM_F if front else None, rim_back=RIM_B)
    im[GROUND:] = 0
    return im


def body_layer(p, ph=0.0, glow=0, sacp=None, sglow=None):
    f = new()
    lean = p.get('lean', 0)
    roots(f, ph, front=False, wig=0.6)
    brood(f, ph, br=p.get('breath', 0), sacp=sacp, glow=sglow, swell=p.get('swell', 0), vein=glow, flat=p.get('flat', 0))
    roots(f, ph, front=True, wig=0.6)
    neck(f, body_rt(p)[0]((14, 126)), p)
    N, T, _Rt = torso(f, p, ph)
    head(f, N, p, ph, glow=glow)
    im = f.render(rim=RIM_F, rim_back=RIM_B)
    im[GROUND:] = 0
    return im


def parts(p, ph=0.0, aph=0.0, glow=0, sacp=None, sglow=None):
    clip = GROUND if p.get('clip') else None
    return arm_layer(p, False, aph, clip), body_layer(p, ph, glow, sacp, sglow), arm_layer(p, True, aph, clip)


def whole(p, **kw):
    a, b, c = parts(p, **kw)
    return over(over(a, b), c)
# ------------------------------------------------------------------------------------------- Sporenschlund
BX = 372
VIO = ['#1e1226', '#3e2a4a', '#5e4670', '#8a6e9a', '#c0aac8']
SPORE = SP


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
        mushroom(F, G, x0, base, sh, sw, cw, ch, FC, True, ['#160e1e', '#2a1e36', VIO[1], VIO[2]], sd)
    # Brennpunkt: Sporennebel hinter Kopf und Buckel – unregelmäßiger Hof in vier harten Stufen, Kanten im
    # Bayer-Raster aufgelöst (kein glatter Kreis); grüne Sporenkörner darin
    cx, cy = BX - 26, 58
    Y, X = np.mgrid[0:176, 0:SW]
    ang = np.arctan2(Y - cy, (X - cx) / 1.35)
    d = np.hypot((X - cx) / 1.35, Y - cy)
    wob = 1 + 0.16 * np.sin(ang * 5 + 1.2) + 0.09 * np.sin(ang * 11 + 0.4) + (vnoise(X * 0.07, Y * 0.07, 16) - 0.5) * 0.55
    dd = d / wob + (BAYER4[Y % 4, X % 4] - 0.5) * 9
    lv = np.select([dd < 26, dd < 50, dd < 76, dd < 100], [4, 3, 2, 1], 0)
    HALO = ['#120c18', '#1a1224', '#22182e', '#2a1e38', '#342644']
    sub = F[:176]
    dark = sub[:, :, :3].astype(int).sum(-1) < 3 * 0x30
    for k in range(1, 5):
        mk = (lv == k) & dark
        sub[mk] = (*hexc(HALO[k]), 255)
    # Myzelvorhang: Hyphenstränge hängen in den Hof, Spitzen glimmen
    for i in range(26):
        x = int(cx - 120 + i * 9.5 + hash2(i, 1, 41) * 5)
        L_ = int(18 + hash2(i, 2, 41) * 46)
        for y in range(L_):
            xx = x + int(round(math.sin(y * 0.15 + i) * 1.2))
            setp(F, xx, y, '#2a1a3a' if y < L_ - 4 else '#3e2a52')
        if hash2(i, 3, 41) > 0.45:
            setp(F, x + int(round(math.sin(L_ * 0.15 + i) * 1.2)), L_, SPORE[2]); setp(G, x + int(round(math.sin(L_ * 0.15 + i) * 1.2)), L_, SPORE[3])
    for i in range(80):
        a = rng.uniform(0, 2 * math.pi); r = rng.uniform(16, 96)
        x, y = int(cx + math.cos(a) * r * 1.35), int(cy + math.sin(a) * r * 0.85)
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
    MC = ['#0c070a', '#2a1820', '#40242a', '#583236', '#744642']
    GC = ['#0c0e08', '#1e2214', '#30361e', '#464e2a', '#626a3a']
    for x0, sh, sw, cw, ch, cols, sd in ((84, 26, 5, 14, 8, MC, 11), (100, 16, 4, 9, 5, GC, 12), (196, 22, 5, 12, 7, GC, 13), (212, 12, 3, 7, 4, MC, 14),
                                        (480, 30, 6, 16, 9, MC, 15), (500, 18, 4, 10, 6, GC, 16), (14, 18, 4, 10, 6, GC, 17)):
        gc = [SP[0], SP[1], SP[2], SP[3]] if cols is GC else ['#160e1e', '#2a1e36', VIO[1], VIO[2]]
        mushroom(M, MG, x0, 170, sh, sw, cw, ch, cols, True, gc, sd)
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=2.9, lo=0.4, steps=3))
    # Boden: Erde mit Moos, Fugen für das Gift, glimmende Schleimpfützen
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#06040a', '#120e12', '#1c1618', '#26201e', '#322a24'], vx=BX - 30, vy=-40, tile=30, seed=37, chips=0.1)
    for x in range(SW): Bd[FY - 4, x] = (*hexc('#464e2a' if hash2(x, 1, 2) > 0.35 else '#30361e'), 255)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        Bd[y, x] = (*hexc('#0a0610'), 255)
    BG = np.zeros((SH, SW, 4), np.uint8)
    for y in range(FY - 3, SH):
        for x in range(SW):
            n = hash2(x // 6, y // 3, 7)
            if n > 0.88 and not seam[y, x]:
                Bd[y, x] = (*hexc('#22261a' if n < 0.95 else '#30361e'), 255)
    for px, py, rw in ((120, FY + 6, 12), (240, FY + 14, 9), (60, FY + 18, 14), (470, FY + 10, 10)):
        for y in range(py - 2, py + 3):
            for x in range(px - rw, px + rw + 1):
                if ((x - px) / rw) ** 2 + ((y - py) / 2.5) ** 2 <= 1:
                    c = SP[1] if abs(x - px) < rw * 0.6 else SP[0]
                    setp(Bd, x, y, c); setp(BG, x, y, SP[2] if abs(x - px) < rw * 0.3 and y == py else c)
    for dy, hw, k in [(-3, 100, 0.65), (-2, 120, 0.6), (-1, 128, 0.6), (0, 120, 0.65), (1, 100, 0.75)]:
        y = FY + dy
        for x in range(BX - hw + 40, BX + hw + 40):
            if 0 <= x < SW:
                r, g, b_, a = Bd[y, x]
                if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=2.6, lo=0.4, steps=3))
    # Vordergrund: Pilzsilhouetten und Wurzeln
    V = np.zeros((SH, SW, 4), np.uint8); VG = np.zeros((SH, SW, 4), np.uint8)
    mushroom(V, VG, 14, SH + 4, 34, 7, 22, 12, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#160e1e', '#2a1e36', VIO[1]], 21)
    mushroom(V, VG, 540, SH + 4, 22, 6, 16, 9, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#160e1e', '#2a1e36', VIO[1]], 22)
    stamp(V, VG)
    L['vorn'] = dict(img=V, f=1.35)
    return L, seam




# ------------------------------------------------------------------------------------------- Wirkungen
OUT = '#0c0609'


def contour(im, col=OUT):
    a = im[:, :, 3] > 0
    im[outline_mask(a)] = (*hexc(col), 255)
    return im


def dorn(h=64, w=34, seed=0):
    """Wurzeldorn bricht aus dem Boden (Fuß unten Mitte), 9 Bilder: Riss glimmt, Bruch mit Erdbrocken, Dorn schießt
    über die Endlänge hinaus, federt zurück, hält (Gift tropft von der Spitze), bröckelt und sinkt ab.
    Kräftiger Hauptdorn aus Rinde (vier Töne, Licht vorn), zwei Nebendornen, dunkle Kontur."""
    r = np.random.default_rng(seed)
    grow = [0.0, 0.42, 1.08, 0.97, 1.0, 1.0, 0.9, 0.55, 0.22]
    side = [(-0.34, 0.6, -0.6), (0.36, 0.46, 0.55)]
    BK = MAT['bark']; BN = MAT['bone']
    cx = w / 2
    out = []
    lean = r.uniform(-0.12, 0.12)
    for k, g in enumerate(grow):
        im = np.zeros((h, w, 4), np.uint8)
        def spike(bx, L_, wd, ln, crumble=False):
            for j in range(int(L_)):
                y = h - 3 - j
                q = j / max(1, L_)
                hw = wd * (1 - q) ** 0.85
                xc = bx + ln * j + math.sin(q * 3.2) * 1.2 - q * q * 5
                for x in range(int(math.floor(xc - hw)), int(math.ceil(xc + hw)) + 1):
                    if not (0 <= x < w and 0 <= y < h): continue
                    u = (x + 0.5 - (xc - hw)) / max(1, 2 * hw)
                    if u < 0 or u > 1: continue
                    if crumble and hash2(x, y, k) > 0.62: continue
                    tip = q > 0.66
                    if tip: c = BN[4] if u > 0.62 else BN[3] if u > 0.35 else BN[2]
                    else:
                        c = BK[4] if u > 0.78 else BK[3] if u > 0.52 else BK[2] if u > 0.24 else BK[1]
                        if abs(((j + seed * 3) % 9) - 4) == 0 and u < 0.85: c = BK[1]       # Rindenring
                    im[y, x] = (*hexc(c), 255)
            return xc, h - 3 - int(L_)
        if g > 0:
            crum = k >= 7
            L = (h - 8) * g
            for dx, kk, ln in side:
                spike(cx + dx * w * 0.5, L * kk, 4.0, ln * 0.14, crum)
            tx, ty = spike(cx + 1, L, w * 0.27, lean, crum)
            # Giftspitze glimmt, Tropfen
            if k in (2, 3, 4, 5) and 0 <= ty + 1 < h:
                X = int(round(tx))
                for yy, c in ((ty + 1, SPORE[4]), (ty + 2, SPORE[3]), (ty + 3, SPORE[2])):
                    if 0 <= X < w and 0 <= yy < h and im[yy, X, 3]: im[yy, X] = (*hexc(c), 255)
                if k in (4, 5):
                    dy = 4 + (k - 4) * 6
                    for yy in (ty + dy, ty + dy + 1):
                        if 0 <= X + 1 < w and 0 <= yy < h and not im[yy, X + 1, 3]: im[yy, X + 1] = (*hexc(SPORE[3]), 255)
        # Erdhügel und Riss am Fuß
        hb = [2, 5, 4, 4, 4, 4, 3, 3, 2][k]
        for x in range(w):
            dxx = abs(x + 0.5 - cx)
            top = h - 1 - int(max(0, hb - dxx * 0.32) + (hash2(x, 1, seed) > 0.6))
            for y in range(top, h):
                if dxx < 4 + hb * 2.6:
                    im[y, x] = (*hexc('#464e2a' if y == top and hash2(x, 2, seed) > 0.3 else '#26201e' if y > top + 1 else '#443a24'), 255)
        if k == 0:
            for x in range(int(cx - 9), int(cx + 10)):
                if hash2(x, 3, seed) > 0.35: im[h - 2, x] = (*hexc(SPORE[2] if abs(x - cx) < 4 else SPORE[1]), 255)
        if k in (1, 2):   # Erdbrocken fliegen
            for i in range(14 if k == 1 else 8):
                a = r.uniform(0.2, math.pi - 0.2); d = r.uniform(5, 14) * (1 if k == 1 else 1.6)
                x, y = int(cx + math.cos(a) * d * 1.2), int(h - 6 - math.sin(a) * d)
                if 0 <= x < w and 0 <= y < h:
                    im[y, x] = (*hexc('#584c36' if i % 3 else '#464e2a'), 255)
                    if i % 2 and x + 1 < w: im[y, x + 1] = (*hexc('#2c2618'), 255)
        out.append(contour(im))
    return out


def wolke(w=80, h=64, n=11, seed=0):
    """Sporenwolke quillt in Pixelstufen: Ballen wachsen und steigen, helle Kerne, dunkler Saum, zerfällt über
    Bayer-Schwellen; Fuß unten Mitte."""
    r = np.random.default_rng(seed)
    balls = [(r.uniform(-22, 22), r.uniform(4, 30), r.uniform(9, 17), r.uniform(0, 0.25)) for _ in range(9)]
    Y, X = np.mgrid[0:h, 0:w]
    pal = np.array([(*hexc(c), 255) for c in [VI[0], VI[1], SP[1], SP[2], SP[3], SP[4]]], np.uint8)
    out = []
    for k in range(n):
        t = (k + 1) / n
        im = np.zeros((h, w, 4), np.uint8)
        v = np.zeros((h, w))
        for bx, by, br, d in balls:
            tt = max(0, t - d)
            if tt <= 0: continue
            rad = br * min(1, tt * 2.4 + 0.25)
            cyy = h - 3 - by * min(1, tt * 1.6 + 0.2) - t * 8
            q = 1 - np.hypot(X - (w / 2 + bx * (0.6 + tt)), (Y - cyy) * 1.1) / rad
            v = np.maximum(v, q)
        dens = 1.0 - max(0, t - 0.5) * 1.9
        th = BAYER4[Y % 4, X % 4]
        on = (v > 0) & (th < dens + v * 0.6)
        lv = np.select([v > 0.72, v > 0.48, v > 0.26, v > 0.1], [5, 4, 3, 2], 1)
        lv = np.clip(lv - (1 if t > 0.55 else 0) - (1 if t > 0.8 else 0), 0, 5)
        lv = np.where((lv == 5) & (k > 1), 4, lv)
        im[on] = pal[lv[on]]
        a = im[:, :, 3] > 0
        if t < 0.75: im[outline_mask(a)] = pal[0]
        out.append(im)
    return out


def smear(f, c, a0, a1, R, wmax=9, mats=('sacg', 'sac')):
    """Wischer hinter den peitschenden Ranken: Bogen um c (Figurpunkt) von a0 nach a1 (Grad), frisch am Ende breit."""
    cx, cy = f.at(*c)
    Y, X = np.mgrid[0:f.H, 0:f.W]
    dx, dy = X + 0.5 - cx, cy - (Y + 0.5)
    rr = np.hypot(dx, dy); ang = np.degrees(np.arctan2(dy, dx))
    lo, hi = min(a0, a1), max(a0, a1)
    k = np.clip((ang - a0) / (a1 - a0), 0, 1)
    inside = (ang >= lo) & (ang <= hi)
    wdt = wmax * (0.25 + 0.75 * k)
    q = (R - rr) / np.maximum(wdt, 1)
    m = inside & (rr <= R) & (rr >= R - wdt)
    m &= ~((k < 0.35) & ((X + Y) % 2 == 1)) & ~((k < 0.15) & ((X // 2 + Y // 2) % 2 == 1))
    t = np.select([q < 0.2, q < 0.5, q < 0.8], [3, 2, 3], 2)
    mat = np.select([q < 0.5, q < 0.8], [mats[0], mats[1]], 'moss').astype(object)
    paint(f, m, mat, t.astype(int), line=False)


def mound(f, xs, clip):
    """Erdkrone, wo eine Ranke im Boden steckt."""
    if not len(xs): return
    x0, x1 = min(xs), max(xs)
    cx = (x0 + x1) / 2; hw = (x1 - x0) / 2 + 6
    for x in range(int(cx - hw - 3), int(cx + hw + 4)):
        d = abs(x + 0.5 - cx)
        hgt = max(0, 4.5 - max(0, d - (hw - 6)) * 0.8) + (hash2(x, 9, 3) > 0.5)
        for j in range(int(hgt)):
            y = clip - 1 - j
            f.px(x, y, 'moss' if j == int(hgt) - 1 and hash2(x, 2, 7) > 0.4 else 'bark', 3 if j == int(hgt) - 1 else 2 if j else 1)
    for x, y in ((cx - hw - 4, clip - 6), (cx + hw + 3, clip - 8), (cx + hw - 1, clip - 11), (cx - hw + 1, clip - 9)):
        f.px(int(x), int(y), 'bark', 3)
    # Wurzelausläufer kriechen aus der Krone über den Boden
    for d, L in ((-1, 16), (1, 12), (-1, 9)):
        x0 = cx + d * (hw - 3)
        pts = [((x0 + d * L * k / 6) - f.FX, 1.6 + math.sin(k * 0.9) * 1.2 + (2 if L == 9 else 0)) for k in range(7)]
        T = Tube(f, pts, lambda t: 3.6 - np.asarray(t) * 2.4, clip=clip)
        paint(f, T.m, 'bark', tones(T.v, (0.25, 0.5, 0.78)))


# ------------------------------------------------------------------------------------------- Bauen
def arm_frames(p, front, aph, clip, smear_arc=None):
    f = new()
    shF, shB = shoulders(p)
    h = p['hf'] if front else p['hb']
    d = p.get('df' if front else 'db', (0, 0))
    if smear_arc and front: smear(f, *smear_arc)
    el, T = arm(f, shF if front else shB, (h[0] + d[0], h[1] + d[1]), el_out=p.get('eo', 0), claw=p.get('claw', 0.3), back=not front,
                seed=7 if front else 3, clip=clip, sway=aph, fing=p.get('fing' if front else 'fingb'), elbow=p.get('ef' if front else 'eb'))
    xs = []
    if clip is not None:
        row = f.mat[clip - 1]
        xs = [x for x in range(f.W) if row[x] is not None]
        mound(f, xs, clip)
    im = f.render(rim=RIM_F if front else None, rim_back=RIM_B)
    im[GROUND:] = 0
    return im, xs


def build():
    R = POSEN['ruhe']
    # ---- Ruhe: Leib (Atem, Kapseln, Augen, Haar), zwei Arme (Krallen, Wiegen) in eigenem Takt
    NB, NA = 8, 6
    bodies = []
    BR = [0, 0, 1, 1, 1, 1, 0, 0]
    for i in range(NB):
        ph = i / NB
        sacp = [((ph + s_[3]) % 1) for s_ in SACS]
        sgl = [2 if 0.35 < q < 0.75 else 1 for q in sacp]
        sacp = [1 if 0.4 < q < 0.7 else 0 for q in sacp]
        p = dict(R, breath=BR[i], head=(0, BR[i]), eye=1.3 if i in (3, 4) else 1.0, sway=math.sin(ph * 2 * math.pi) * 0.6)
        bodies.append(body_layer(p, ph=ph, glow=i % 3, sacp=sacp, sglow=sgl))
    backs, fronts = [], []
    for i in range(NA):
        a = i / NA * 2 * math.pi
        p = dict(R, df=(round(2 * math.sin(a)), round(1.5 * math.cos(a))), db=(round(1.5 * math.sin(a + 2)), round(1.2 * math.cos(a + 2))),
                 fing=tuple(7 * math.sin(a + j * 1.1) for j in range(4)), fingb=tuple(6 * math.sin(a + 2 + j * 1.3) for j in range(4)),
                 ef=(R['ef'][0] + round(math.sin(a)), R['ef'][1] + round(math.cos(a))), eb=(R['eb'][0], R['eb'][1] + round(math.sin(a + 2))))
        backs.append(arm_frames(p, False, i / NA, None)[0]); fronts.append(arm_frames(p, True, i / NA, None)[0])
    # ---- Attacke: ganze Bilder
    MOM = [('zug', 110, 1), ('zug2', 100, 1), ('halt', 480, 4), ('hieb0', 60, 1), ('hieb', 60, 1), ('ein', 100, 1), ('ein_s', 110, 1),
           ('ein_r', 130, 1), ('ein_n1', 110, 1), ('ein_n2', 120, 1), ('ein_n3', 420, 3), ('auf', 200, 1), ('auf2', 160, 1)]
    frames, hit_idx, imp = [], 0, None
    for pn, ms, n in MOM:
        for k in range(n):
            p = dict(POSEN[pn])
            glow = k % 3
            if pn == 'halt':
                tr = (1, -1, 1, 0)[k]
                p['df'] = (tr, -tr); p['db'] = (-tr, tr); p['swell'] = 1 if k % 2 else 0; p['jaw'] = 1.0 if k % 2 else 0.85
                p['fing'] = tuple(6 * ((k + j) % 2) for j in range(4))
            if pn == 'ein_n3':
                # Halten mit Händen im Boden, solange die Dornen brechen: Kapseln pumpen, Kiefer zittert
                p['swell'] = 1 if k == 1 else 0; p['jaw'] = (0.5, 0.7, 0.4)[k]; p['head'] = (3, (2, 3, 2)[k])
                p['lean'] = (13, 12, 12)[k]; p['flat'] = (0.04, 0.03, 0.02)[k]
            sacp = [1 if (k + i) % 2 else 0 for i in range(len(SACS))] if n > 1 else None
            sgl = [2 if pn in ('halt', 'ein', 'ein_s', 'ein_n3') and (k + i) % 2 == 0 else 1 for i in range(len(SACS))]
            clip = GROUND if p.get('clip') else None
            sm = None
            b_, _ = arm_frames(p, False, k / 6, clip)
            f_, xs = arm_frames(p, True, k / 6, clip, smear_arc=sm)
            bd = body_layer(p, ph=k / 6, glow=glow, sacp=sacp, sglow=sgl)
            if pn == 'ein' and k == 0:
                hit_idx = len(frames); imp = int(round(sum(xs) / len(xs))) if xs else FX + 120
            frames.append((over(over(b_, bd), f_), round(ms / n)))
    Ld, seam = scene()
    fx = {}
    B, imp_s = finish('faeulnis', FX, FY0, BX, [('arm-h', backs, dict(n=NA, ms=150)), ('koerper', bodies, dict(n=NB, ms=170)),
                                               ('arm-v', fronts, dict(n=NA, ms=150))], frames, hit_idx, imp, Ld,
                      ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                      {'glut': [SP[4], SP[3], SP[1]], 'fokus': [300, BX - 40], 'teilchen': 'sporen', 'dichte': 3.4, 'dauer': 9.5, 'start': 2.2})
    from bosskino_malgareth import impact_star
    DW, DH, dW, dH = 40, 78, 30, 54
    fx['blitz'] = strip(impact_star(pal=SPORE))
    fx['dorn'] = strip(dorn(DH, DW, 1))
    fx['dorn2'] = strip(dorn(dH, dW, 2))
    fx['wolke'] = strip(wolke(80, 64, 11, 3))
    wave, wm = seam_wave(seam, imp_s, FY - 2, v=260, ms=60, pal=SPORE, direction=-1, maxd=400, peak=lambda d: 4 if d < 80 else 3 if d < 200 else 2,
                         ages=(0.1, 0.32, 0.65, 1.05))
    fx['welle'] = wave
    ev = [dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'),
          dict(k='bild', r='blitz', at=0, x=imp_s - 12, y=FY - 18, w=25, h=22, n=4, ms=60, quer=True, z='vorn'),
          dict(k='funken', at=0, x=imp_s, y=FY - 2, n=22, r=6, vx=40, vy=90, g=200, c=SPORE[::-1][:4]),
          dict(k='funken', at=0, x=imp_s, y=FY - 1, n=16, r=8, vx=30, vy=40, g=80, c=['#584c36', '#3e3626', '#28231a'])]
    # Wurzeldornen brechen nacheinander aus (260 px/s nach links), groß und klein im Wechsel, jeder zweite mit Wolke
    for i, x in enumerate(range(imp_s - 26, 14, -30)):
        big = i % 2 == 0
        w_, h_, rr = (DW, DH, 'dorn') if big else (dW, dH, 'dorn2')
        at = int((imp_s - x) / 260 * 1000)
        ev.append(dict(k='bild', r=rr, at=at, x=x - w_ // 2, y=FY + 2 - h_ + (i % 3), w=w_, h=h_, n=9, ms=80, quer=True, z='vorn'))
        ev.append(dict(k='funken', at=at + 80, x=x, y=FY - 2, n=8, r=5, vx=26, vy=60, g=220, c=['#584c36', '#3e3626', '#464e2a']))
        if i % 2 == 1:
            ev.append(dict(k='bild', r='wolke', at=at + 140, x=x - 40, y=FY + 2 - 64, w=80, h=64, n=11, ms=100, quer=True, z='vorn'))
            ev.append(dict(k='funken', at=at + 60, x=x, y=FY - 6, n=10, r=6, vx=18, vy=30, g=0, c=SPORE[::-1][:4]))
    B['meta']['ereignisse'] = ev
    B['meta']['stopp'] = 70
    B['meta']['beben'] = [[0, 3], [2, -2], [-2, 1], [1, -1], [-1, 1], [1, 0], [0, 1]]
    B['meta']['warn'] = {'x0': 12, 'x1': imp_s - 4, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 650, 'c': [SP[0], SP[1], SP[3]]}
    return B
