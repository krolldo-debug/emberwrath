# Bosskino: Mutter Fäulnis (Stufe 32) im Sporenschlund.
# Figur nach rot_mother.js: aufgeblähter, geäderter Brutleib auf einem Teppich aus Wurzelsträngen, pulsierende
# Sporenkapseln mit Fleischkragen, Konsolenpilze und kleine Pilze auf dem Rücken; vorn ein verwachsener, gekrümmter
# Oberkörper (Rippen, Wirbelknoten, Myzelmantel mit Fransen), hageres grünes Hexengesicht (Knochenwulst, tiefliegende
# Leuchtaugen, drittes Auge, Hakennase, Maul mit Fängen) unter einem breiten Warzenhut mit glimmenden Lamellen und
# Hyphenfäden; zwei knorrige, gegliederte Rankenarme aus Rinde und Moos mit Dornen, Leuchtknoten und Wurzelkrallen.
# Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Ruhe in drei Teilen mit eigenen Zyklen: hinterer Arm und vorderer Arm (Krallen, Wiegen) und Leib (Atem, Kapseln,
# Augen, Fransen).
# Attacke „Wurzelbruch“: Ausholen (sie bäumt sich auf, Ranken hoch, Hut zurück), Halten (Kapseln schwellen, Maul
# auf, Zittern), Hieb (Wischer), Einschlag (Ranken stecken im Boden, Erdkronen); Wurzeldornen brechen nacheinander
# aus dem Boden, aus jedem zweiten Bruch quillt eine Sporenwolke in Pixelstufen, Gift läuft grün durch die Fugen.
import math
import numpy as np
from bosskino import (Fig, MAT, flip, hash2, hexc, SPORE, Buf, bands, BAYER4, seam_wave, strip, outline_mask, edge_of,
                      floor, stamp, finish, over, vnoise, dome, SW, SH, FY, ik, rot, lerp)

MAT.update({
    'flesh': ['#16091a', '#3e1c42', '#5e2c5c', '#82467a', '#a8669a'],
    'fleshd': ['#0c060e', '#261628', '#3c2240', '#583656', '#7a5272'],
    'fleshl': ['#16091a', '#82467a', '#a8669a', '#d098b8', '#ecc8d8'],
    'skin': ['#0c120e', '#262e26', '#3e4a3a', '#5c6a52', '#7e8c6c'],
    'skinl': ['#0c120e', '#5c6a52', '#7e8c6c', '#a2ae88', '#c4ccaa'],
    'face': ['#120a10', '#22341c', '#3a5a2a', '#58803a', '#7aa04c'],
    'faceh': ['#120a10', '#58803a', '#7aa04c', '#a4c470', '#cce0a0'],
    'rot': ['#140a12', '#2a1630', '#3c2042', '#4e3424', '#6a4a30'],
    'brow': ['#140a12', '#5a4a34', '#8c7650', '#cbb98c', '#ece0b8'],
    'maw': ['#1c0812', '#1c0812', '#2a0c1a', '#3a1022', '#4a1428'],
    'fang': ['#3a2a1a', '#6a5a3a', '#a8946a', '#e6dab2', '#fff8e0'],
    'cap': ['#0e070f', '#361634', '#522046', '#742e54', '#9a4660'],
    'capl': ['#0e070f', '#742e54', '#9a4660', '#c2706c', '#e0a08a'],
    'capd': ['#08040a', '#201024', '#361634', '#522046', '#742e54'],
    'gill': ['#120c16', '#261c2e', '#3e3048', '#5c4a66', '#84708e'],
    'gillg': ['#120c16', '#2e0e52', '#6224b0', '#a458f4', '#dea8ff'],
    'myc': ['#120c16', '#3e3048', '#5c4a66', '#84708e', '#b4a2ba'],
    'cloak': ['#0c0610', '#22142c', '#36203e', '#503454', '#6e4c6c'],
    'bark': ['#0c0a08', '#2c2618', '#443a24', '#605234', '#847450'],
    'barkd': ['#080604', '#1a1610', '#2c2618', '#443a24', '#605234'],
    'moss': ['#0c1a0c', '#183018', '#264a20', '#3a682a', '#5a903a'],
    'mossd': ['#080e08', '#0c1a0c', '#183018', '#264a20', '#3a682a'],
    'sac': ['#08180c', '#1a4e22', '#2e7c30', '#5aae44', '#a2de6c'],
    'sacg': ['#08180c', '#5aae44', '#a2de6c', '#d2f4a0', '#f4ffd8'],
    'vein': ['#2e0e52', '#4a1a80', '#6224b0', '#a458f4', '#dea8ff'],
    'spot': ['#3a3428', '#6a5a46', '#a4927a', '#d6c8a6', '#f4ecd4'],
    'bone': ['#1a1610', '#3a3428', '#6a604a', '#a0947a', '#d4caac'],
    'slime': ['#0c160a', '#24421a', '#3c6426', '#64923a', '#a2de6c'],
    'eye': ['#0e4a1c', '#22882e', '#8fe03a', '#d8ff90', '#f4ffd8'],
    'void': ['#050307'] * 5,
})
RIM_F = {'flesh': '#c8a8b2', 'skin': '#94a888', 'face': '#82bc40', 'cap': '#c2706c', 'bark': '#a09060', 'moss': '#7ab84a',
         'myc': '#d4c4d8', 'sac': '#d2f4a0', 'spot': '#fff4dc'}
RIM_B = {'flesh': '#a458f4', 'fleshd': '#6224b0', 'cap': '#a458f4', 'capd': '#6224b0', 'bark': '#3a682a', 'barkd': '#264a20',
         'skin': '#5ad040', 'moss': '#5ad040', 'mossd': '#22882e', 'gill': '#a458f4', 'myc': '#a458f4', 'face': '#5ad040'}

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


def brood(f, ph, br=0, sacp=None, glow=None, swell=0.0, vein=0):
    """Brutleib aus Wülsten (je mit eigener Wölbung, dunkle Furchen dazwischen), hängende Falten über den Wurzeln,
    Fleckung, Adern, Poren, Schleimfäden, Kapseln, Pilze und Konsolen."""
    Y, X = np.mgrid[0:f.H, 0:f.W]
    gy = f.at(0, 0)[1]
    nz = vnoise(X * 0.14, Y * 0.14, 16)
    n2 = vnoise(X * 0.21 + 3, Y * 0.25, 16)
    whole = np.zeros((f.H, f.W), bool)
    for lx, lh, rx, rh, sd in LOBES:
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
        lv = 0.42 * u - 0.55 * w + 0.72 * nzv - np.clip(w, 0, 1) * 0.25 + (n2 - 0.5) * 0.18
        dth = ((X + Y) % 2) * 0.05 - 0.025
        lv = lv + dth
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
        sh = f.poly([(x - w_, h_), (x - w_ * 0.7, h_ + 4), (x + w_ * 0.3, h_ + 5), (x + w_, h_ + 2), (x + w_ * 0.8, h_ - 0.5)])
        paint(f, sh, 'cap', np.where(sh, dome(sh, r=1.6, cuts=(0.25, 0.5, 0.8)), 0))
        X_, Y_ = f.at(x - w_ + 1, h_ - 0.5)
        for k in range(int(w_ * 2) - 2):
            f.px(X_ + k, Y_, 'gillg', 3 if (k + i) % 2 else 2)
    for i, (x, h_, r, p0) in enumerate(SACS):
        sac(f, x, h_ + br * 0.5, r + swell, sacp[i] if sacp else 0, glow[i] if glow else 1)
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


def torso(f, p, ph):
    """Verwachsener, nach vorn gekrümmter Oberkörper (Umriss): Buckel mit Wirbelknoten und Schulterblatt, eingefallene
    Brust mit Rippenbögen, Fäulnisflecken, Konsolenpilze am Rücken; Fleischlippen, wo er aus dem Leib wächst."""
    lean = p.get('lean', 0); by = p.get('by', 0)
    Rt = lambda q: rot((q[0], q[1] + (by * (q[1] - TB[1]) / 60 if q[1] > TB[1] else 0)), TB, -lean)
    back = [(-34, 64), (-38, 84), (-34, 102), (-24, 118), (-10, 128), (4, 132), (12, 131)]
    front = [(22, 124), (25, 114), (24, 102), (19, 92), (14, 82), (12, 70), (10, 60)]
    m = f.poly([Rt(q) for q in back + front])
    Y, X = np.mgrid[0:f.H, 0:f.W]
    t = dome(m, r=9, cuts=(0.3, 0.55, 0.8))
    mat = np.full((f.H, f.W), 'skin', dtype=object)
    hi = m & (t == 4); mat[hi] = 'skinl'; t = np.where(hi, 2, t)
    # Rippenbögen: Linien quer über die Brust, leicht nach unten gebogen
    for k in range(6):
        h0 = 112 - k * 6
        pts = [Rt((x, h0 - 0.03 * (x - 22) ** 2 * 0.25 - (22 - x) * 0.12)) for x in range(-4, 25)]
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            for X_, Y_ in line_px(f.at(x1, y1), f.at(x2, y2)):
                if 0 <= Y_ < f.H - 1 and m[Y_, X_] and m[Y_ + 1, X_]:
                    t[Y_, X_] = 1; t[Y_ + 1, X_] = min(4, t[Y_ + 1, X_] + 1)
                    if mat[Y_ + 1, X_] == 'skinl': mat[Y_ + 1, X_] = 'skin'; t[Y_ + 1, X_] = 4
    # Schulterblatt: Wulst mit heller Oberkante
    sb = f.ell(*Rt((-12, 112)), 12, 7) & m
    t = np.where(edge_of(sb) & (Y < np.where(sb.any(0), 0, 0) + 999) & sb, np.where(np.roll(sb, 1, 0), t, np.minimum(4, t + 1)), t)
    sbl = sb & ~np.roll(sb, -1, 0)
    t = np.where(sbl & (t > 1), t - 1, t)
    rotm = m & (vnoise(X * 0.12 + 7, Y * 0.12, 16) > 0.66) & (X < f.at(*Rt((4, 0)))[0])
    t = np.where(rotm & (t > 1) & ((X + Y) % 2 == 0), t - 1, np.where(rotm & (t > 2), t - 1, t))
    # Moos- und Myzelflecken auf dem Buckel (Kanten im Schachbrett aufgelöst)
    nzm = vnoise(X * 0.16 + 11, Y * 0.16 + 3, 16)
    top = m & (Y < f.at(*Rt((0, 100)))[1])
    mp = top & ((nzm > 0.6) | ((nzm > 0.55) & ((X + Y) % 2 == 0)))
    mat[mp] = 'moss'; t = np.where(mp, np.clip(t, 1, 4), t)
    myp = m & ~mp & (vnoise(X * 0.22 + 5, Y * 0.22 + 9, 16) > 0.7) & ((X + Y) % 2 == 0)
    mat[myp] = 'myc'; t = np.where(myp, np.clip(t, 1, 3), t)
    paint(f, m, mat, np.where(m, t, 0).astype(int))
    # Rückgrat: Wirbeldornen aus Knochen, nach hinten oben gerichtet, zum Nacken kleiner
    for i, ((x1, h1), (x2, h2)) in enumerate(zip(back[1:], back[2:])):
        for k in (0.2, 0.7):
            bx, bh = x1 + (x2 - x1) * k, h1 + (h2 - h1) * k
            tx, th = x2 - x1, h2 - h1; tl = math.hypot(tx, th) or 1
            nx, nh = -th / tl, tx / tl
            L = 12 - i * 1.4 + (2 if k > 0.5 else 0)
            tri = [Rt((bx - tx / tl * 2.4, bh - th / tl * 2.4)), Rt((bx + nx * L - tx / tl * 3, bh + nh * L - th / tl * 3)), Rt((bx + tx / tl * 2.4, bh + th / tl * 2.4))]
            tm = f.poly(tri)
            tt = np.where(tm, 2, 0)
            ys, xs = np.nonzero(tm)
            for y, x in zip(ys, xs):
                if not tm[max(0, y - 1), x] or not tm[y, min(f.W - 1, x + 1)]: tt[y, x] = 3
            paint(f, tm, 'bone', tt)
            X_, Y_ = f.at(*tri[1]); f.px(X_, Y_, 'bone', 4)
    # Konsolenpilze am Buckel: Regale mit Warzen, Unterseite glimmt violett
    for i, (x, h_, w_) in enumerate(((-38, 90, 10), (-30, 108, 8), (-16, 122, 6))):
        c = Rt((x, h_))
        sh = f.poly([(c[0] + 2, c[1]), (c[0] - w_ * 0.4, c[1] + 3.5), (c[0] - w_, c[1] + 2.5), (c[0] - w_ * 1.1, c[1] - 0.5), (c[0] - w_ * 0.6, c[1] - 1.5), (c[0] + 2, c[1] - 1.5)])
        tt = np.where(sh, dome(sh, r=1.8, cuts=(0.25, 0.5, 0.78)), 0)
        cm = np.where(sh & (tt == 4), 'capl', 'cap').astype(object); tt = np.where(cm == 'capl', 2, tt)
        paint(f, sh, cm, tt.astype(int))
        X0, Y0 = f.at(c[0] - w_ * 1.05, c[1] - 1)
        for k in range(int(w_ * 1.1)):
            f.px(X0 + k, Y0 + 1, 'gillg', 3 if (k + i) % 2 else 2)
        f.px(*f.at(c[0] - w_ * 0.5, c[1] + 2.5), 'spot', 4)
    # Fleischlippen über dem Ansatz
    for i, (x, h_, rx, rh) in enumerate(((-28, 64, 15, 9), (-6, 60, 14, 8), (8, 58, 9, 6))):
        mm = f.ell(x, h_, rx, rh)
        nz = vnoise(X * 0.3 + i * 5, Y * 0.3, 16)
        mm = (mm | (outline_mask(mm) & (nz > 0.6))) & ~(edge_of(mm) & (nz < 0.3))
        paint(f, mm, 'flesh', np.where(mm, np.maximum(1, dome(mm, r=4, cuts=(0.28, 0.55, 0.8)) - 1), 0))
    N = Rt((14, 126))
    return N, None, Rt


def mantle(f, N, Rt, ph, glow=0, sway=0.0):
    """Myzelhaar: Hyphenstränge wachsen vom Hinterkopf über den Buckel und hängen in Fransen herab; einzelne
    Spitzen glimmen grün, Knoten violett."""
    for i in range(9):
        e = i / 8
        x0, h0 = -30 + e * 40, 0
        # Startpunkt auf dem Rückenumriss
        h0 = 104 + 28 * math.sin(min(1, e * 1.25) * math.pi * 0.5)
        X, Y = f.at(*Rt((x0, h0)))
        x, y = float(X), float(Y)
        L = int(10 + 12 * hash2(i, 1, 311) + 8 * (1 - e))
        for st in range(L):
            fr = st / L
            x += -0.45 * (1 - fr) + math.sin(ph * 2 * math.pi + i * 0.9 + st * 0.3) * 0.3 * fr + sway * 0.3 * fr; y += 1
            if fr > 0.7 and hash2(i, st, 313) < (fr - 0.7) * 2.5: continue
            if st % 5 == 4 and i % 2: continue
            f.px(int(round(x)), int(round(y)), 'myc', 3 if st % 4 else 4 if i % 2 else 2)
        if i % 3 == 1: f.px(int(round(x)), int(round(y)) + 1, 'sacg', 2 + (glow + i) % 3)
        elif i % 4 == 2: f.px(int(round(x)), int(round(y)) + 1, 'vein', 3)


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
    'ruhe': dict(lean=4, cap=8, hf=(98, 44), hb=(72, 34), ef=(40, 64), eb=(20, 62), eye=1.0),
    'zug': dict(lean=-6, by=2, cap=-4, capy=1, hf=(96, 144), ef=(60, 114), hb=(78, 148), eb=(44, 116), jaw=0.4, eye=1.2, claw=0.8,
                head=(-1, 1), gill=0.3),
    'zug2': dict(lean=-12, by=4, cap=-10, capy=2, hf=(90, 162), ef=(60, 124), hb=(72, 166), eb=(44, 124), jaw=0.8, eye=1.3, claw=1.0,
                 head=(-2, 3), gill=0.6, squash=-0.2),
    'halt': dict(lean=-14, by=5, cap=-12, capy=2, hf=(90, 168), ef=(60, 128), hb=(72, 170), eb=(44, 128), jaw=1.0, eye=1.4, claw=1.0,
                 head=(-2, 4), gill=0.8, squash=-0.25),
    'hieb': dict(lean=10, by=0, cap=14, hf=(116, 80), ef=(62, 104), hb=(100, 90), eb=(46, 106), jaw=1.0, eye=1.4, claw=0.4, head=(2, -1), gill=0.4),
    'ein': dict(lean=16, by=-3, cap=20, hf=(126, -14), ef=(64, 84), hb=(106, -12), eb=(46, 76), jaw=0.9, eye=1.4, claw=0.2, head=(3, -3),
                clip=True, gill=0.3),
    'ein2': dict(lean=15, by=-2, cap=18, hf=(126, -14), ef=(64, 82), hb=(106, -12), eb=(46, 74), jaw=0.6, eye=1.2, claw=0.2, head=(3, -2), clip=True),
    'auf': dict(lean=8, by=0, cap=12, hf=(110, 22), ef=(52, 70), hb=(88, 18), eb=(34, 64), jaw=0.3, eye=1.0, claw=0.4, head=(1, 0)),
}


def shoulders(p):
    lean = p.get('lean', 0); by = p.get('by', 0)
    Rt = lambda q: rot(q, TB, -lean)
    return Rt((8, 96 + by)), Rt((-8, 104 + by))


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
    brood(f, ph, br=p.get('breath', 0), sacp=sacp, glow=sglow, swell=p.get('swell', 0), vein=glow)
    roots(f, ph, front=True, wig=0.6)
    lean = p.get('lean', 0); by = p.get('by', 0)
    neck(f, rot((14, 126 + by * (126 - TB[1]) / 60), TB, -lean), p)
    N, T, _Rt = torso(f, p, ph)
    mantle(f, N, _Rt, ph, glow=glow, sway=p.get('sway', 0))
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
    # Brennpunkt: Sporennebel hinter Kopf und Buckel – unregelmäßiger Hof in vier harten Stufen, Kanten im
    # Bayer-Raster aufgelöst (kein glatter Kreis); grüne Sporenkörner darin
    cx, cy = BX - 26, 58
    Y, X = np.mgrid[0:176, 0:SW]
    ang = np.arctan2(Y - cy, (X - cx) / 1.35)
    d = np.hypot((X - cx) / 1.35, Y - cy)
    wob = 1 + 0.16 * np.sin(ang * 5 + 1.2) + 0.09 * np.sin(ang * 11 + 0.4) + (vnoise(X * 0.07, Y * 0.07, 16) - 0.5) * 0.55
    dd = d / wob + (BAYER4[Y % 4, X % 4] - 0.5) * 9
    lv = np.select([dd < 26, dd < 50, dd < 76, dd < 100], [4, 3, 2, 1], 0)
    HALO = ['#120a1c', '#1c1030', '#25163c', '#2f1d4a', '#3b2558']
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
    mushroom(V, VG, 14, SH + 4, 34, 7, 22, 12, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#1a0e2c', '#3a1e60', VIO[1]], 21)
    mushroom(V, VG, 540, SH + 4, 22, 6, 16, 9, ['#030205', '#08050c', '#0e0a14', '#140e1c', '#1a1224'], True, ['#08050c', '#1a0e2c', '#3a1e60', VIO[1]], 22)
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
                    im[y, x] = (*hexc('#3a682a' if y == top and hash2(x, 2, seed) > 0.3 else '#26201e' if y > top + 1 else '#443a24'), 255)
        if k == 0:
            for x in range(int(cx - 9), int(cx + 10)):
                if hash2(x, 3, seed) > 0.35: im[h - 2, x] = (*hexc(SPORE[2] if abs(x - cx) < 4 else SPORE[1]), 255)
        if k in (1, 2):   # Erdbrocken fliegen
            for i in range(14 if k == 1 else 8):
                a = r.uniform(0.2, math.pi - 0.2); d = r.uniform(5, 14) * (1 if k == 1 else 1.6)
                x, y = int(cx + math.cos(a) * d * 1.2), int(h - 6 - math.sin(a) * d)
                if 0 <= x < w and 0 <= y < h:
                    im[y, x] = (*hexc('#605234' if i % 3 else '#3a682a'), 255)
                    if i % 2 and x + 1 < w: im[y, x + 1] = (*hexc('#2c2618'), 255)
        out.append(contour(im))
    return out


def wolke(w=80, h=64, n=11, seed=0):
    """Sporenwolke quillt in Pixelstufen: Ballen wachsen und steigen, helle Kerne, dunkler Saum, zerfällt über
    Bayer-Schwellen; Fuß unten Mitte."""
    r = np.random.default_rng(seed)
    balls = [(r.uniform(-22, 22), r.uniform(4, 30), r.uniform(9, 17), r.uniform(0, 0.25)) for _ in range(9)]
    Y, X = np.mgrid[0:h, 0:w]
    pal = np.array([(*hexc(c), 255) for c in ['#2e0e52', '#3a1e60', '#22882e', '#5ad040', '#b4f478', '#f4ffd8']], np.uint8)
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


def smear(f, c, a0, a1, R, wmax=9, mats=('sacg', 'moss')):
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
    t = np.select([q < 0.2, q < 0.5, q < 0.8], [4, 3, 4], 3)
    mat = np.select([q < 0.5, q < 0.8], [mats[0], mats[1]], 'mossd').astype(object)
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
    MOM = [('zug', 120, 1), ('zug2', 110, 1), ('halt', 520, 4), ('hieb', 70, 1), ('ein', 780, 6), ('ein2', 400, 2), ('auf', 220, 1)]
    frames, hit_idx, imp = [], 0, None
    for pn, ms, n in MOM:
        for k in range(n):
            p = dict(POSEN[pn])
            glow = k % 3
            if pn == 'halt':
                tr = (1, -1, 1, 0)[k]
                p['df'] = (tr, -tr); p['db'] = (-tr, tr); p['swell'] = 1 if k % 2 else 0; p['jaw'] = 1.0 if k % 2 else 0.85
                p['fing'] = tuple(6 * ((k + j) % 2) for j in range(4))
            if pn == 'ein':
                p['jaw'] = (1.0, 1.0, 0.9, 0.8, 0.8, 0.7)[k]; p['swell'] = 1 if k in (1, 3) else 0
                p['head'] = (3, -3 + (k % 2)); p['breath'] = -1 if k < 2 else 0
            sacp = [1 if (k + i) % 2 else 0 for i in range(len(SACS))] if n > 1 else None
            sgl = [2 if pn in ('halt', 'ein') and (k + i) % 2 == 0 else 1 for i in range(len(SACS))]
            clip = GROUND if p.get('clip') else None
            sm = None
            if pn == 'hieb':
                sh = shoulders(p)[0]
                sm = (sh, 66, -16, 112, 16)
            b_, _ = arm_frames(p, False, k / 6, clip)
            f_, xs = arm_frames(p, True, k / 6, clip, smear_arc=sm)
            bd = body_layer(p, ph=k / 6, glow=glow, sacp=sacp, sglow=sgl)
            if pn == 'ein' and k == 0:
                hit_idx = len(frames); imp = int(round(sum(xs) / len(xs))) if xs else FX + 120
            frames.append((over(over(over(b_, f_), bd), np.zeros_like(bd)) if p.get('hinten') else over(over(b_, bd), f_), round(ms / n)))
    Ld, seam = scene()
    fx = {}
    B, imp_s = finish('faeulnis', FX, FY0, BX, [('arm-h', backs, dict(n=NA, ms=150)), ('koerper', bodies, dict(n=NB, ms=170)),
                                               ('arm-v', fronts, dict(n=NA, ms=150))], frames, hit_idx, imp, Ld,
                      ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                      {'glut': ['#f4ffd8', '#b4f478', '#22882e'], 'fokus': [300, BX - 40], 'teilchen': 'sporen', 'dichte': 3.4, 'dauer': 9.5, 'start': 2.2})
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
          dict(k='funken', at=0, x=imp_s, y=FY - 1, n=16, r=8, vx=30, vy=40, g=80, c=['#605234', '#443a24', '#2c2618'])]
    # Wurzeldornen brechen nacheinander aus (260 px/s nach links), groß und klein im Wechsel, jeder zweite mit Wolke
    for i, x in enumerate(range(imp_s - 26, 14, -30)):
        big = i % 2 == 0
        w_, h_, rr = (DW, DH, 'dorn') if big else (dW, dH, 'dorn2')
        at = int((imp_s - x) / 260 * 1000)
        ev.append(dict(k='bild', r=rr, at=at, x=x - w_ // 2, y=FY + 2 - h_ + (i % 3), w=w_, h=h_, n=9, ms=80, quer=True, z='vorn'))
        ev.append(dict(k='funken', at=at + 80, x=x, y=FY - 2, n=8, r=5, vx=26, vy=60, g=220, c=['#605234', '#443a24', '#3a682a']))
        if i % 2 == 1:
            ev.append(dict(k='bild', r='wolke', at=at + 140, x=x - 40, y=FY + 2 - 64, w=80, h=64, n=11, ms=100, quer=True, z='vorn'))
            ev.append(dict(k='funken', at=at + 60, x=x, y=FY - 6, n=10, r=6, vx=18, vy=30, g=0, c=SPORE[::-1][:4]))
    B['meta']['ereignisse'] = ev
    B['meta']['warn'] = {'x0': 12, 'x1': imp_s - 4, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 650, 'c': ['#0e4a1c', '#22882e', '#b4f478']}
    return B
