# Bosskino: Ulgrim, der Hügelgrabkönig (Stufe 26) im Heulenden Hügelgrab.
# Figur: untoter Geisterkönig, breit und schwer, leicht gebeugt. Großer Totenschädel unter einem Kronhelm aus
# nachgedunkelter Bronze (Kronzacken mit Grünspan, Geistersteine im Reif, Wangenklappe, Kettenbrünne), glühende
# Geisteraugen. Verfallene Königsrüstung: gewölbte Brustplatte mit Goldsaum und Grat, Schulterpanzer in drei Lagen,
# Kettenhemd an Armen und Hüfte, Bauchreifen, Gürtel mit Geisterstein, Beinschienen mit Kniekacheln, Sabatons;
# Wappenrock in dunklem Ochsenblut, zerrissener Grabmantel in tiefem Schiefergrün (Farben nach barrow_king.js,
# Leuchtrampe GHOST). Großes Runenschwert mit Blattklinge. Gezeichnet mit Blick nach rechts, im Bild gespiegelt.
# Attacke „Grabesschlag“: Schwert aus dem Boden ziehen, über die Schulter ausholen (Kopf bleibt frei), halten (Kiefer
# öffnet sich, Runen glühen auf), Schwung in einzeln gezeichneten Bildern mit Sichel auf der Klingenbahn, Einschlag
# vor dem König; eine Geisterwand läuft über den Boden, aus dem Riss steigen Totengeister; Nachschwingen.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, ik, lerp, over, flip, flame, hash2, hexc, GHOST, Buf, bands, chk, BAYER4,
                      seam_wave, strip, outline_mask, edge_of, floor, bricks, stamp, finish, SW, SH, FY)

MAT.update({
    'brz': ['#0b0807', '#1d1610', '#30261a', '#4a3d28', '#6e5a3a'],      # Rüstbronze, nachgedunkelt
    'brzd': ['#070505', '#120e0b', '#1d1610', '#30261a', '#4a3d28'],     # Bronze im Schatten (hintere Teile)
    'gold': ['#1e1206', '#4a3412', '#86622a', '#c09a4a', '#f0d48e'],     # Säume, Krone
    'ver': ['#0a1a18', '#143028', '#22504a', '#337564', '#56a088'],      # Grünspan
    'mail': ['#06070a', '#14171c', '#252a31', '#3a4149', '#5c6670'],     # Kettenhemd
    'bone': ['#1a140f', '#4a3e30', '#7e705a', '#b4a586', '#e4dabc'],     # Schädel
    'ucape': ['#030507', '#081015', '#0f1b22', '#172a32', '#223c44'],    # Grabmantel
    'robe': ['#07030a', '#150a15', '#251223', '#381b32', '#4e2645'],     # Wappenrock (Ochsenblut/Purpur)
    'ulea': ['#0a0605', '#1a0f0b', '#30190f', '#4a2818', '#663a22'],
    'gh': GHOST,
    'uvoid': ['#030405'] * 5,
})
RIM_F = {'brz': '#d8b66a', 'gold': '#fff0c0', 'bone': '#fff6dc', 'mail': '#8a96a0', 'ver': '#8cc8a8', 'robe': '#6e3a60'}
RIM_B = {'brz': '#127272', 'brzd': '#0b3a40', 'gold': '#22b0a4', 'ucape': '#22b0a4', 'bone': '#7ef0d6', 'mail': '#127272',
         'ver': '#7ef0d6', 'robe': '#127272', 'ulea': '#127272'}

W, H, FX, FY0 = 360, 240, 180, 232
S = 1.0
GROUND = FY0 + 1
def new(): return Fig(W, H, FX, FY0, S)


def patina(f, m, amt=0.18, seed=2, only=('brz',)):
    """Grünspan in kleinen Flecken (2-4 Pixel), vor allem in den dunklen Tönen und an Unterkanten."""
    for y, x in zip(*np.nonzero(m)):
        if f.mat[y, x] not in only or f.tone[y, x] > 2: continue
        if hash2(x // 3, y // 2, seed) < amt * 0.6 and hash2(x, y, seed + 1) < 0.7:
            f.mat[y, x] = 'ver'; f.tone[y, x] = 2 if f.tone[y, x] == 2 else 1


def mailify(f, m):
    """Kettenhemd: Ringe als versetztes Muster (heller Ring, dunkler Zwischenraum)."""
    for y, x in zip(*np.nonzero(m)):
        if f.mat[y, x] != 'mail': continue
        t = f.tone[y, x]
        if (x + (y // 2) % 2) % 2 == 0 and y % 2 == 0: f.tone[y, x] = max(1, t - 1)
        elif y % 2 == 1 and t < 4 and (x + y) % 3 == 0: f.tone[y, x] = t + 1


def trim(f, m, side='top', mat='gold', w=1):
    """Saum an einer Teilmaske: oberste/unterste/rechte Randreihe in Gold."""
    for y, x in zip(*np.nonzero(m)):
        ok = False
        for k in range(1, w + 1):
            yy = y - k if side == 'top' else y + k
            if side in ('top', 'bot'):
                if yy < 0 or yy >= f.H or not m[yy, x]: ok = True
        if ok:
            f.mat[y, x] = mat; f.tone[y, x] = 4 if side == 'top' else 2


# ------------------------------------------------------------------------------------------- Kopf
FACE = [
    'ab' + 'vvvv' + 'bbbcccccd' + 'vvvvvv' + 'cd',
    'ab' + 'vvvvv' + 'bbcccc' + 'vvvvvvvv' + 'cd',
    'ab' + 'vvvvvv' + 'bccc' + 'vvvvvvvvv' + 'cd',
    'ab' + 'vvFEvvv' + 'bc' + 'vvvFEEvvvv' + 'cd',
    'ab' + 'vvFFvvv' + 'bc' + 'vvvEEEvvvv' + 'cd',
    'ab' + 'bvvvvvv' + 'bc' + 'vvvFEFvvvv' + 'cd',
    'aab' + 'vvvvv' + 'bccb' + 'vvvvvvvv' + 'ccd',
    'aabb' + 'vvv' + 'bcccc' + 'b' + 'vvvvvv' + 'cccd',
    '.abbbbbbbc' + 'vvvv' + 'cddddddcd',
    '.abbbbbbbb' + 'vvvv' + 'bcdddddcd',
    '.aabbbbbbb' + 'vvv' + 'bbbcccccd' + '.',
    '..abbbbbbb' + 'bvv' + 'bbbbcccd' + '..',
    '..aabbbbbbbb' + 'bbbbbcccd' + '..',
    '..aabbbbcccccccccccd' + '...',
    '..aAA' + 'tAtAtAtAtAtAt' + 'Abd' + '..',
    '..aAA' + 'tAtAtAtAtAtAt' + 'Acd' + '..',
    '..a' + 'A' * 16 + 'bd' + '..',
    '..a' + 'AAtAtAtAtAtAtAA' + 'bcd' + '..',
    '..a' + 'AAtAtAtAtAtAtA' + 'bbcd' + '..',
    '..aa' + 'A' * 12 + 'bbccd' + '..',
    '...a' + 'bbbbbb' + 'cccccccccc' + 'd' + '..',
    '...aa' + 'bbbbb' + 'cccccccc' + 'd' + '....',
    '....aa' + 'bbbbb' + 'cccccc' + 'dd' + '....',
    '.....aaa' + 'bbbb' + 'ccc' + 'dd' + '......',
    '.......aaaa' + 'bbbb' + '........',
]
assert all(len(r) == 23 for r in FACE), [len(r) for r in FACE]
JAW_GAP = '..aAAA' + 'v' * 11 + 'AAbd..'
JAW_GLOW = '..aAvvv' + 'HHFFFHH' + 'vvvAAbd..'
FLEG = {'a': ('bone', 1), 'b': ('bone', 2), 'c': ('bone', 3), 'd': ('bone', 4), 'A': ('bone', 0), 't': ('bone', 4),
        'v': ('uvoid', 0), 'E': ('gh', 4), 'F': ('gh', 3), 'H': ('gh', 2)}


def head(f, x, h, jaw=0, glow=0):
    """Kopf mit Kronhelm. (x, h) = linke obere Ecke des Gesichts. jaw: Kiefer offen (Zeilen). Rückgabe: Augenpunkte."""
    P = lambda i, j: (x + i, h - j)          # Gesichtsraster -> Figur
    # Kettenbrünne hinten/unten (hängt vom Helm auf die Schultern)
    av = f.poly([P(-12, -1), P(-4, -1), P(-2, 22), P(4, 28 + jaw), P(10, 30 + jaw), P(-2, 33 + jaw), P(-14, 30), P(-16, 18)])
    f.put(av, 'mail', shade='cyl', cut=(0.3, 0.6)); mailify(f, av)
    # Helmglocke hinter den Zacken
    dome = f.ell(x + 8, h + 4, 17, 8) & f.poly([P(-12, -15), P(30, -15), P(30, -2), P(-12, -2)])
    f.put(dome, 'brzd', shade='dome', r=4, dcuts=(0.3, 0.6, 0.84))
    patina(f, dome, 0.2, 3, only=('brzd',))
    # Kronzacken (vor der Glocke): Basis auf dem Reif, Höhe, Neigung; zwei sind abgebrochen
    for cx, ht, lean, broken in ((-7, 13, -3, False), (0, 18, -1.5, False), (8.5, 22, 0, False), (17, 18, 1.5, True), (24.5, 13, 3, False)):
        top = (cx + lean, ht)
        if broken:
            sp = f.poly([P(cx - 4, -4), P(cx - 2.4, -ht * 0.5), (x + cx + lean * 0.6 - 1.2, h + ht * 0.82), (x + cx + lean * 0.6 + 0.6, h + ht * 0.7),
                         (x + cx + lean * 0.6 + 1.6, h + ht * 0.78), P(cx + 2.6, -ht * 0.5), P(cx + 4, -4)])
        else:
            sp = f.poly([P(cx - 4, -4), P(cx - 2.3 + lean * 0.4, -ht * 0.55), (x + cx + lean, h + ht + 0.5), P(cx + 2.3 + lean * 0.4, -ht * 0.55), P(cx + 4, -4)])
        f.put(sp, 'gold', shade='cyl', cut=(0.3, 0.6))
        patina(f, sp, 0.16, 5 + cx, only=('gold',))
    # Kronreif (Stirnband des Helms): 4 Reihen, Steine
    band = f.poly([P(-11, -4.6), P(27, -4.6), P(27, 0), P(-11, 0)])
    f.put(band, 'gold', shade='lame', bh=4)
    for i in range(-11, 27):
        X, Y = f.at(*P(i + 0.5, -0.5)); f.px(X, Y, 'gold', 1 if i < 10 else 2)
    for gi, gc in ((-6, 1), (3, 2), (12, 2), (21, 2)):
        X, Y = f.at(*P(gi + 0.5, -2.5))
        lv = 4 if gi == 12 else 3
        for dx, dy, t in ((0, 0, lv), (1, 0, lv - 1), (0, -1, lv - 1), (1, -1, lv - 2 if lv > 3 else 1)):
            f.px(X + dx, Y + dy, 'gh', min(4, t + glow))
    # Hinterkopf / Nackenschutz (links hinter dem Gesicht)
    nk = f.poly([P(-12, -1), P(-2, -1), P(-1, 14), P(-6, 17), P(-13, 13)])
    f.put(nk, 'brzd', shade='cyl', cut=(0.3, 0.7)); patina(f, nk, 0.15, 6, only=('brzd',))
    # Gesicht
    rows = list(FACE)
    if jaw:
        ins = [JAW_GAP] + [JAW_GLOW] * max(0, jaw - 2) + [JAW_GAP] * min(1, jaw - 1)
        rows = rows[:17] + ins + rows[17:]
    f.sprite(x, h, rows, FLEG)
    # Wangenklappe (vor der fernen Gesichtsseite)
    ch = f.poly([P(-5, -0.5), P(1.6, -0.5), P(2, 9), P(1, 16), P(-2, 19), P(-5, 16)])
    f.put(ch, 'brz', shade='cyl', cut=(0.35, 0.7))
    patina(f, ch, 0.22, 8)
    for j in (3, 8, 13):
        X, Y = f.at(*P(-1.5, -j - 0.5)); f.px(X, Y, 'gold', 4)
    eyes = [f.at(*P(4.5, -3.5)), f.at(*P(16, -3.5))]
    return eyes


# ------------------------------------------------------------------------------------------- Schwert
def sword(f, grip, ang, L=94, glow=0):
    """Runenschwert, Blattklinge aus dunkler Bronze, Goldheft, Geisterstein im Knauf. Rückgabe: Klingenmaske."""
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a); vx, vh = -uh, ux
    gx, gh = grip
    P = lambda u, v: (gx + ux * u + vx * v, gh + uh * u + vh * v)
    # Klinge
    up, dn = [], []
    for k in range(41):
        u = 7 + (L - 7) * k / 40
        q = (u - 7) / (L - 7)
        w = 3.4 + 1.5 * math.sin(min(1, q / 0.78) * math.pi * 0.9) if q < 0.82 else (1 - q) / 0.18 * 4.0
        up.append(P(u, w)); dn.append(P(u, -w))
    blade = f.poly(up + dn[::-1])
    f.put(blade, 'brz', shade='cyl', cut=(0.35, 0.6))
    e = edge_of(blade)
    for y, x in zip(*np.nonzero(e)): f.mat[y, x] = 'gold'; f.tone[y, x] = 3
    # Hohlkehle mit Runen
    for k in np.linspace(12, L - 18, 160):
        X, Y = f.at(*P(k, 0))
        if 0 <= Y < f.H and 0 <= X < f.W and blade[Y, X]: f.mat[Y, X] = 'brz'; f.tone[Y, X] = 0
    for u0 in range(16, L - 20, 8):
        for j, (du, dv) in enumerate(((0, 0), (1, 0), (2, 0), (1, 1), (1, -1))):
            X, Y = f.at(*P(u0 + du, dv * 0.9))
            if 0 <= Y < f.H and blade[Y, X]: f.mat[Y, X] = 'gh'; f.tone[Y, X] = min(4, (3 if j < 3 else 2) + glow)
    patina(f, blade, 0.1, 7)
    # Griff (Leder), Parierstange (Gold, nach vorn gebogen), Knauf
    f.put(f.poly([P(-11, -3), P(-8, -3.6), P(-6, 0), P(-8, 3.6), P(-11, 3)]), 'gold', shade='dome', r=1.6)
    f.put(f.poly([P(-6, -1.8), P(4, -1.8), P(4, 1.8), P(-6, 1.8)]), 'ulea', fixed=2)
    for u in (-4, -1, 2):
        f.recolor(f.poly([P(u - 0.5, -1.8), P(u + 0.5, -1.8), P(u + 0.5, 1.8), P(u - 0.5, 1.8)]), tone=1)
    f.put(f.poly([P(4, -12), P(2, -13), P(4.5, -14), P(7.5, -9), P(7.5, 9), P(4.5, 14), P(2, 13), P(4, 12), P(4, 3), P(4, -3)]), 'gold',
          light=(1, -1), hi=1, mid=2, flat=3)
    f.put(f.ell(*P(5.8, 0), 1.7, 1.7), 'gh', fixed=min(4, 3 + glow), line=False)
    X, Y = f.at(*P(-8.6, 0)); f.px(X, Y, 'gh', 4)
    return blade


# ------------------------------------------------------------------------------------------- Mantel
def cape(f, ph, lean=0, billow=0, lift=0):
    """Grabmantel hinter dem König: von den Schultern bis zum Boden, nach hinten (links) gebauscht, zerrissener Saum."""
    t = ph * 2 * math.pi
    back = []
    for hh in range(124, 2, -6):
        k = (124 - hh) / 122
        back.append((-18 - k * (34 + billow) - 2.4 * math.sin(t - k * 5) * k * k + lean * hh / 124, hh + billow * 0.35 * k * k + lift * (1 - k)))
    hem = []
    xe = back[-1][0]
    for i in range(15):
        k = i / 14
        jag = (6 if i % 2 else 0) + (3 if i % 5 == 2 else 0) + 1.5 * math.sin(t + i * 1.7)
        hem.append((xe + k * (-xe + 2), 3 + billow * 0.35 * (1 - k) + jag * (1 - k * 0.4)))
    m = f.poly([(-4 + lean, 126 + lift)] + back + hem + [(4, 20), (4 + lean * 0.5, 100)])
    f.put(m, 'ucape', fixed=2)
    ys, xs = np.nonzero(m)
    rows = {}
    for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
    yt, yb = ys.min(), ys.max()
    for y, x in zip(ys, xs):
        a0, b0 = min(rows[y]), max(rows[y])
        u = (x - a0) / max(1, b0 - a0); dep = (y - yt) / max(1, yb - yt)
        fo = math.sin((u * 3.0 + dep * 0.6) * 2 * math.pi + t * 0.6 + dep * 2.2)
        f.tone[y, x] = 2 + (1 if fo > 0.55 else -1 if fo < -0.25 else 0)
        if fo > 0.85 and u > 0.2: f.tone[y, x] = 4 if dep < 0.5 else 3
        if x - a0 < 1: f.tone[y, x] = 1
        below = y + 1 >= f.H or not m[y + 1, x]
        if below and dep > 0.5:
            f.tone[y, x] = 1
        elif hash2(x // 3, y // 4, 4) < 0.045 and 0.35 < dep < 0.92 and u < 0.8:
            f.mat[y, x] = None          # Mottenlöcher
    return m


# ------------------------------------------------------------------------------------------- Körper
def hands_of(p):
    (gx, gh), ang = p['grip'], p['ang']
    a = math.radians(ang); ux, uh = math.cos(a), math.sin(a)
    hA = (gx - 3.0 * ux, gh - 3.0 * uh); hB = (gx + 3.4 * ux, gh + 3.4 * uh)
    n, f_ = (hA, hB) if p.get('near', 'A') == 'A' else (hB, hA)
    if p.get('frei'): f_ = p['frei']
    return n, f_


def gauntlet(f, c, far=False):
    m = f.ell(c[0], c[1], 5.0, 4.4)
    f.put(m, 'brzd' if far else 'brz', shade='dome', r=2.2, dcuts=(0.25, 0.55, 0.8))
    # Fingerglieder
    ys, xs = np.nonzero(m)
    if len(ys):
        cy = int(np.median(ys))
        for x in range(xs.min() + 1, xs.max(), 2):
            if m[cy, x]: f.px(x, cy, 'brz', 0)
    return m


def body(f, p):
    b = p.get('breath', 0); c = p.get('crouch', 0); lean = p.get('lean', 0) + 4
    HIP = 74
    def up(x, h):
        if h >= HIP - 6: return (x + lean * (h - HIP + 6) / 52, h + b * min(1, (h - HIP + 6) / 30) - c)
        return (x, h - c * h / HIP)
    U = lambda pts: [up(x, h) for x, h in pts]
    nh, fh = p['hands']
    # --- fernes Bein (hinten), fernes Schulterstück, ferner Arm
    fF, fN = -20 + p.get('fF', 0), 22 + p.get('fN', 0)
    hipF, hipN = up(-8, 66), up(8, 66)
    kF = ik(hipF, (fF, 7), 34, 32, bend=1); kN = ik(hipN, (fN, 7), 34, 32, bend=1)
    f.put(f.seg(hipF, kF, 18, 16), 'mail', cut=(0.3, 0.6))
    f.put(f.seg(kF, (fF, 8), 16, 13), 'brzd', cut=(0.3, 0.6))
    f.put(f.poly([(fF - 9, 0), (fF + 11, 0), (fF + 9, 4), (fF + 3, 9), (fF - 6, 10)]), 'brzd', light=(1, -1), hi=1, mid=2, flat=4)
    f.put(f.ell(kF[0] + 1, kF[1], 6, 5.5), 'brzd', shade='dome', r=2.5)
    # ferne Schulter (rechts hinten, nur Kante sichtbar)
    fs = f.ell(*up(18, 113), 11, 9)
    f.put(fs, 'brz', shade='dome', r=3, dcuts=(0.3, 0.6, 0.85)); patina(f, fs, 0.2, 40)
    for y, x in zip(*np.nonzero(edge_of(fs))):
        if y == np.nonzero(fs[:, x])[0].max(): f.mat[y, x] = 'gold'; f.tone[y, x] = 2
    shF = up(16, 108)
    ef = ik(shF, fh, 25, 23, bend=-1)
    f.put(f.seg(shF, ef, 11, 10), 'mail', cut=(0.3, 0.6));
    f.put(f.seg(ef, fh, 11, 9), 'brzd', cut=(0.3, 0.6))
    gauntlet(f, fh, far=True)
    # --- nahes Bein
    th = f.seg(hipN, kN, 19, 17); f.put(th, 'mail', cut=(0.25, 0.55)); mailify(f, th)
    sh_ = f.seg(kN, (fN, 8), 17, 14); f.put(sh_, 'brz', cut=(0.25, 0.55))
    trim(f, f.seg(lerp(kN, (fN, 8), 0.84), (fN, 8), 17.6, 14.6), 'top')
    patina(f, sh_, 0.14, 11)
    for k in np.linspace(0.12, 0.8, 40):          # Schienbeingrat
        X, Y = f.at(*lerp(kN, (fN + 2, 8), k)); X += 2
        if sh_[Y, X]: f.mat[Y, X] = 'brz'; f.tone[Y, X] = 4
        if sh_[Y, X - 1]: f.mat[Y, X - 1] = 'brz'; f.tone[Y, X - 1] = 2
    sab = f.poly([(fN - 8, 0), (fN + 15, 0), (fN + 13, 3), (fN + 8, 7), (fN + 2, 10), (fN - 7, 11)])
    f.put(sab, 'brz', shade='lame', bh=3)
    kc = f.poly([(kN[0] - 2, kN[1] + 7), (kN[0] + 6, kN[1] + 5), (kN[0] + 8, kN[1] - 2), (kN[0] + 4, kN[1] - 7), (kN[0] - 3, kN[1] - 5)])
    f.put(kc, 'brz', shade='dome', r=2.5, dcuts=(0.2, 0.5, 0.78)); trim(f, kc, 'top')
    # --- Kettenschurz, Bauchreifen, Gürtel
    sk = f.poly(U([(-19, 82)]) + [(-21, 44 - c * 0.6), (-8, 40 - c * 0.6), (8, 41 - c * 0.6), (22, 45 - c * 0.6)] + U([(20, 82)]))
    f.put(sk, 'mail', shade='cyl', cut=(0.3, 0.62)); mailify(f, sk)
    for y, x in zip(*np.nonzero(edge_of(sk))):
        if not sk[min(f.H - 1, y + 1), x]: f.mat[y, x] = 'mail'; f.tone[y, x] = 4 if x % 2 else 3
    # Wappenrock vorn (zwischen den Beinen, zerrissen)
    hem = [(14 - k * 2.6, 22 - c * 0.5 + (5 if k % 2 else 0) + (3 if k == 2 else 0)) for k in range(9)]
    tb = f.poly(U([(-6, 82)]) + [(-7, 40 - c * 0.5)] + hem[::-1] + [(16, 38 - c * 0.5)] + U([(15, 82)]))
    f.put(tb, 'robe', shade='cyl', cut=(0.3, 0.65))
    for y, x in zip(*np.nonzero(tb)):      # Faltenlinien
        X0 = f.FX + 4
        if (x - X0) % 7 == 0 and f.tone[y, x] > 1: f.tone[y, x] -= 1
    # Wappen: Geisterschädel-Krone auf dem Rock (gold ausgefädelt)
    cx_, ch_ = up(5, 64)
    for dx, dh, t in ((-3, 0, 3), (-2, 2, 3), (0, 3, 4), (2, 2, 3), (3, 0, 3), (-3, -1, 2), (-2, -1, 2), (-1, -1, 2), (0, -1, 2), (1, -1, 2), (2, -1, 2), (3, -1, 2)):
        f.dot(cx_ + dx, ch_ + dh, 'gold', t)
    fa = f.poly(U([(-20, 84), (21, 84), (22, 72), (-20, 70)]))
    f.put(fa, 'brz', shade='lame', bh=4); patina(f, fa, 0.18, 12)
    belt = f.poly(U([(-21, 82), (22, 82), (22, 87), (-21, 87)]))
    f.put(belt, 'ulea', shade='cyl', cut=(0.3, 0.7))
    bk = f.poly(U([(5, 81), (13, 81), (13, 88), (5, 88)]))
    f.put(bk, 'gold', shade='dome', r=2)
    f.dot(*up(9, 84.5), 'gh', 4); f.dot(*up(8, 84.5), 'gh', 3); f.dot(*up(9, 85.5), 'gh', 3)
    # Mantelkragen (Stoffwulst um die Schultern, hinter dem Kopf)
    mk = f.poly(U([(-24, 112), (-26, 122), (-18, 131), (-4, 134), (12, 133), (22, 127), (24, 118), (10, 120), (-10, 120)]))
    f.put(mk, 'ucape', shade='cyl', cut=(0.3, 0.6))
    # --- Brustplatte: Wölbung nach vorn, Mittelgrat, Goldsaum am Hals und unten, Grünspan, Riss mit Geisterlicht
    chest = f.poly(U([(-19, 86), (-23, 98), (-23, 110), (-17, 120), (-6, 124), (10, 123), (20, 117), (25, 105), (24, 94), (19, 86)]))
    f.put(chest, 'brz', shade='chest')
    patina(f, chest, 0.08, 13)
    for hh in range(88, 121):
        X, Y = f.at(*up(9 + 3 * math.sin((hh - 88) / 33 * math.pi), hh))
        if chest[Y, X]: f.tone[Y, X] = 4 if hh > 96 else 3; f.mat[Y, X] = 'brz'
        if chest[Y, X - 1]: f.tone[Y, X - 1] = 1; f.mat[Y, X - 1] = 'brz'
    for y, x in zip(*np.nonzero(edge_of(chest))):
        ys_ = np.nonzero(chest[:, x])[0]
        if len(ys_) and (y - ys_.min() <= 1): f.mat[y, x] = 'gold'; f.tone[y, x] = 3
        elif len(ys_) and (ys_.max() - y <= 0): f.mat[y, x] = 'gold'; f.tone[y, x] = 2
    # Riss in der Brustplatte, darin Geisterlicht
    crk = [(14, 112), (12, 109), (13, 106), (11, 103), (12, 100), (10, 97)]
    for (x1, h1), (x2, h2) in zip(crk, crk[1:]):
        for k in range(5):
            X, Y = f.at(*up(x1 + (x2 - x1) * k / 5, h1 + (h2 - h1) * k / 5))
            f.px(X, Y, 'gh', 3 if k % 2 else 2); f.px(X - 1, Y, 'brz', 0)
    # Brustzeichen: Krone in Gold über dem Riss
    ex_, eh_ = up(4, 104)
    for dx, dh, t in ((-4, 0, 2), (-3, 0, 3), (-2, 0, 3), (-1, 0, 3), (0, 0, 4), (1, 0, 4), (2, 0, 3), (3, 0, 3), (4, 0, 2),
                      (-4, 1, 3), (-4, 2, 4), (0, 1, 4), (0, 2, 4), (0, 3, 4), (4, 1, 3), (4, 2, 3), (-2, 1, 2), (2, 1, 2),
                      (-3, -1, 1), (-2, -1, 1), (-1, -1, 1), (0, -1, 1), (1, -1, 1), (2, -1, 1), (3, -1, 1)):
        f.dot(ex_ + dx, eh_ + dh, 'gold', t)
    # --- Kopf
    hx, hh0 = up(3 - p.get('kopf', 0), 141 + p.get('kopfh', 0))
    eyes = head(f, hx, hh0, jaw=p.get('jaw', 0), glow=p.get('glow', 0))
    # Halsberge (Kragen unter dem Kiefer, vor dem Kinn), Goldsaum
    gg = f.poly(U([(-8, 112), (-9, 118), (-4, 122), (12, 122), (20, 118), (20, 112), (8, 110)]))
    gg &= f.poly([(-60, hh0 - 22), (80, hh0 - 22), (80, 0), (-60, 0)])
    f.put(gg, 'brz', shade='vcyl', cut=(0.25, 0.5))
    for y, x in zip(*np.nonzero(gg)):
        if not gg[y - 1, x]: f.mat[y, x] = 'gold'; f.tone[y, x] = 4 if x > f.FX else 3
        elif not gg[y + 1, x]: f.mat[y, x] = 'gold'; f.tone[y, x] = 1
    # --- naher Arm: Oberarm im Kettenhemd, Ellbogenkachel, Unterarmschiene, Panzerhandschuh
    shN = up(-11, 104)
    en = ik(shN, nh, 25, 23, bend=-1)
    ua = f.seg(shN, en, 13, 12); f.put(ua, 'mail', cut=(0.25, 0.55)); mailify(f, ua)
    fa_ = f.seg(en, nh, 12, 11); f.put(fa_, 'brz', cut=(0.25, 0.55)); patina(f, fa_, 0.15, 30)
    cuff = f.seg(lerp(en, nh, 0.62), lerp(en, nh, 0.8), 14, 14); f.put(cuff, 'brz', cut=(0.25, 0.6)); trim(f, cuff, 'top')
    ex, eh = en
    f.put(f.poly([(ex - 1, eh + 6), (ex - 7, eh + 1), (ex - 5, eh - 5), (ex, eh - 1)]), 'gold', light=(1, -1), hi=1, mid=3, flat=4)
    f.put(f.ell(ex, eh, 5.4, 5), 'brz', shade='dome', r=2.6, dcuts=(0.15, 0.45, 0.75))
    # --- nahe Schulter: großer Schulterpanzer aus Lamellen (Saum gold), oben eine Kuppel
    sx, sh0 = up(-13, 110)
    pl = f.poly([(sx - 15, sh0 + 4), (sx - 17, sh0 - 6), (sx - 15, sh0 - 16), (sx - 4, sh0 - 19), (sx + 9, sh0 - 16), (sx + 14, sh0 - 6), (sx + 13, sh0 + 4)])
    f.put(pl, 'brz', fixed=2)
    X0, Y0 = f.at(sx - 2, sh0)
    xs_ = np.nonzero(pl.any(0))[0]; half = max(1, (xs_.max() - xs_.min()) / 2)
    for y, x in zip(*np.nonzero(pl)):
        u = (x - X0) / half
        s_ = (y - Y0) - 4.0 * u * u                      # Lamellen als Bögen um die Schulter
        pos = int(math.floor(s_)) % 6
        t = 4 if pos == 0 and u > -0.2 else 3 if pos <= 1 else 1 if pos == 5 else 2
        if u < -0.55 and t > 1: t -= 1
        if u > 0.6 and t == 2: t = 3
        f.tone[y, x] = t
        if pos == 5: f.mat[y, x] = 'gold'; f.tone[y, x] = 2 if u < 0 else 3
    patina(f, pl, 0.15, 21)
    dm = f.ell(sx, sh0 + 3, 14, 10) & f.poly([(sx - 30, sh0 - 1), (sx + 30, sh0 - 1), (sx + 30, sh0 + 30), (sx - 30, sh0 + 30)])
    f.put(dm, 'brz', shade='dome', r=5, dcuts=(0.25, 0.55, 0.82))
    patina(f, dm, 0.15, 24)
    for y, x in zip(*np.nonzero(edge_of(dm))):
        ys_ = np.nonzero(dm[:, x])[0]
        if y == ys_.max(): f.mat[y, x] = 'gold'; f.tone[y, x] = 3
    # Dorn auf der Schulter
    sp = f.poly([(sx - 5, sh0 + 10), (sx - 9, sh0 + 19), (sx - 0.5, sh0 + 11.5)])
    f.put(sp, 'gold', shade='cyl', cut=(0.35, 0.7))
    return eyes


POSEN = {
    'ruhe': dict(grip=(-31, 68), ang=-90, near='A', frei=(25, 62), wehen=3),
    'zug': dict(grip=(-26, 84), ang=-96, near='A', lean=-1, crouch=-1),
    'zug2': dict(grip=(-8, 100), ang=-150, near='B', lean=-3, back=True, jaw=1),
    'aus1': dict(grip=(6, 102), ang=176, near='B', lean=-6, crouch=3, back=True, jaw=2, wehen=2, fN=5, fF=-3),
    'aus': dict(grip=(9, 100), ang=150, near='B', lean=-9, crouch=5, jaw=3, glow=1, back=True, wehen=4, fN=8, fF=-6),
    'aus2': dict(grip=(8, 99), ang=146, near='B', lean=-11, crouch=6, jaw=4, glow=1, back=True, wehen=6, fN=8, fF=-6),
    's1': dict(grip=(46, 110), ang=33, near='B', lean=4, crouch=3, jaw=3, glow=1, wehen=8, fN=10, fF=-6),
    's2': dict(grip=(48, 100), ang=-24, near='B', lean=10, crouch=7, jaw=3, glow=1, wehen=6, fN=10, fF=-6),
    'hit': dict(grip=(48, 64), ang=-60, near='B', lean=15, crouch=13, jaw=4, glow=1, wehen=3, fN=10, fF=-6, boden=GROUND),
    'n1': dict(grip=(48, 66), ang=-62, near='B', lean=14, crouch=12, jaw=3, glow=1, wehen=1, fN=10, fF=-6, boden=GROUND),
    'n2': dict(grip=(46, 72), ang=-66, near='B', lean=10, crouch=8, jaw=1, fN=10, fF=-6, boden=GROUND),
    'zur': dict(grip=(-18, 76), ang=-94, near='A', lean=1, crouch=1, fN=2, fF=-1, frei=(24, 66), boden=GROUND),
    'n3': dict(grip=(36, 84), ang=-80, near='A', lean=5, crouch=4, fN=5, fF=-3, boden=GROUND),
}


def figure(p, ph=0.0, ft=0, smear=None, flames=True):
    nh, fh = hands_of(p)
    p = dict(p, hands=(nh, fh))
    fb = new(); cape(fb, ph, lean=(p.get('lean', 0) + 2) * 0.6, billow=p.get('wehen', 0), lift=p.get('breath', 0) - p.get('crouch', 0))
    back = fb.render(rim_back=RIM_B)
    fs = new(); blade = sword(fs, p['grip'], p['ang'], glow=p.get('glow', 0))
    swi = fs.render(rim=RIM_F, rim_back=RIM_B)
    g = p.get('boden', GROUND)
    swi[g:] = 0; blade[g:] = False
    fk = new(); eyes = body(fk, p)
    bd = fk.render(rim=RIM_F, rim_back=RIM_B)
    fg = new(); gauntlet(fg, nh); hand = fg.render(rim=RIM_F, rim_back=RIM_B)
    # Geisterfeuer in den Augen (kleine Zungen nach hinten oben)
    if flames:
        src = np.zeros((H, W), bool)
        for X, Y in eyes: src[Y, X] = True
        R = 2.2 + 0.6 * p.get('glow', 0)
        gf = flame(src, ft, 6, R=R, pal=GHOST, up=0.6, side=1.4, rise=0.8)
    back[GROUND:] = 0; bd[GROUND:] = 0
    if p.get('back'):
        im = over(over(back, swi), bd)
    else:
        im = over(over(back, bd), swi)
    if smear is not None: im = over(smear, im) if p.get('smear_front') else over(over(back, smear), im)
    im = over(im, hand)
    if flames:
        gm = gf[:, :, 3] > 0
        # nur über dem Kopf/hinter dem Kopf: Zungen dürfen den Schädel nicht zudecken -> nur auf leere oder Helm-Pixel
        free = (im[:, :, 3] == 0) | (fk.mat != None) & ~np.isin(fk.mat.astype(str), ['bone'])
        free &= ~(bd[:, :, 3] == 0) | (im[:, :, 3] == 0)
        im[gm & free] = gf[gm & free]
    return im, blade


def sweep(p0, p1, L=94, hmax=162, n=140, t_end=1.0):
    """Schwungsichel: die überstrichene Fläche der äußeren Klinge zwischen zwei Posen (Griff und Winkel linear
    interpoliert). Hinten (alt) dünn und gerastert, vorn an der Klinge breit und hell. Liegt die Spitze über hmax,
    wird sie verkürzt (die Klinge schwingt auf den Betrachter zu), damit oben nichts anstößt."""
    out = np.zeros((H, W, 4), np.uint8)
    age = np.full((H, W), -1.0)
    f = new()
    (g0, a0), (g1, a1) = (p0['grip'], p0['ang']), (p1['grip'], p1['ang'])
    if a1 - a0 > 180: a1 -= 360
    if a0 - a1 > 180: a1 += 360
    rad = np.zeros((H, W))
    for i in range(n + 1):
        t = i / n * t_end
        gx, gh = lerp(g0, g1, t); a = math.radians(a0 + (a1 - a0) * t)
        ux, uh = math.cos(a), math.sin(a)
        Lk = L
        if gh + uh * L > hmax: Lk = max(30, (hmax - gh) / max(uh, 1e-3))
        u0 = Lk * (0.9 - 0.32 * t ** 1.5)
        for u in np.arange(u0, Lk + 1.5, 0.5):
            X, Y = f.at(gx + ux * u, gh + uh * u)
            if 0 <= X < W and 0 <= Y < H and t >= age[Y, X]:
                age[Y, X] = t; rad[Y, X] = (u - u0) / max(1, Lk + 1 - u0)
    # Lücken zwischen den Strahlen schließen (eine Runde Nachbarn)
    for _ in range(2):
        m0 = age < 0
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sa = np.full_like(age, -1.0); sr = np.zeros_like(rad)
            ys0, ys1 = max(0, dy), H + min(0, dy); xs0, xs1 = max(0, dx), W + min(0, dx)
            sa[ys0:ys1, xs0:xs1] = age[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]; sr[ys0:ys1, xs0:xs1] = rad[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
            fill = m0 & (sa >= 0)
            age[fill] = sa[fill]; rad[fill] = sr[fill]; m0 &= ~fill
    ys, xs = np.nonzero(age >= 0)
    for y, x in zip(ys, xs):
        k = age[y, x]; rr = rad[y, x]
        lv = 4 if k > 0.8 else 3 if k > 0.55 else 2 if k > 0.3 else 1
        if rr < 0.4: lv -= 1
        if rr > 0.86 and k > 0.3: lv += 1
        lv = max(1, min(4, lv))
        if k < 0.3 and (x + y) % 2: continue
        if k < 0.12 and (x // 2 + y) % 2: continue
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




def wraith(k, n=12, w=32, h=60, seed=0):
    """Totengeist steigt aus dem Riss: Schädel unter einer Kapuze, Schultern, Klauenarme nach oben, Schweif bis in den
    Boden. Bild k von n. Harte Stufen (Kontur dunkel, Körper mittel, Kern hell); Zerfall durch wegfallende Pixel."""
    B_ = Buf(w, h)
    rise = min(1.0, (k + 1) / (n * 0.42))
    fade = max(0.0, (k - n * 0.62) / (n * 0.38))
    top = (h - 6) - (h - 10) * rise - max(0, k - n * 0.42) * 1.2
    cx = w / 2 + 1.8 * math.sin(k * 0.7 + seed)
    m = np.zeros((h, w), bool)
    # Schweif und Körper (Vieleck, wellt)
    pts_l, pts_r = [], []
    for j in range(13):
        v = j / 12
        yy = top + 9 + v * (h - top - 9)
        hw = 7.5 * (1 - v) ** 0.8 + 1.0
        sx = cx + 2.5 * math.sin(v * 5 + k * 0.9 + seed) * v
        pts_l.append((sx - hw, yy)); pts_r.append((sx + hw, yy))
    m |= B_.poly(pts_l + pts_r[::-1])
    hd = B_.ell(cx, top + 5, 5.2, 5.6)
    m |= hd
    # Arme: Schulter -> Ellbogen -> Klaue (nach oben außen), Takt zuckt
    for sgn in (-1, 1):
        sh = (cx + sgn * 6, top + 11)
        el = (cx + sgn * (11 + (k % 2)), top + 6 - rise * 2)
        cl = (cx + sgn * (12 + (k % 3 == 0)), top - 2 - rise * 3)
        for (x1, y1), (x2, y2), wd in ((sh, el, 3.4), (el, cl, 2.8)):
            dx, dy = x2 - x1, y2 - y1; L_ = math.hypot(dx, dy) or 1; nx, ny = -dy / L_ * wd / 2, dx / L_ * wd / 2
            m |= B_.poly([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)])
        for d in (-1, 0, 1):
            X, Y = int(cl[0] + d), int(cl[1] - 1 - (d == 0))
            if 0 <= X < w and 0 <= Y < h: m[Y, X] = True
    Y_, X_ = np.mgrid[0:h, 0:w]
    m &= Y_ < h - 1 if rise < 1 else Y_ < h
    # Schweif reißt unten in Fetzen
    m &= ~((Y_ > top + (h - top) * 0.75) & ((X_ + Y_ // 2 + k) % 4 == 0))
    inner = m & ~edge_of(m); inner2 = inner & ~edge_of(inner)
    lv = np.zeros((h, w), int); lv[m] = 1; lv[inner] = 2
    core = inner2 & (np.abs(X_ + 0.5 - cx - 1) < 2.2) & (Y_ < top + (h - top) * 0.6)
    lv[core] = 3
    lv[hd & inner] = 4; lv[hd & inner & ~(hd & ~edge_of(hd) & (X_ + 0.5 > cx - 3))] = 3
    # Gesicht: Augenhöhlen, Nasenloch, Maul (dunkel)
    ey = int(round(top + 5))
    dark = []
    for ex in (int(round(cx - 2.5)), int(round(cx + 1.5))):
        dark += [(ex, ey), (ex + 1, ey), (ex, ey + 1), (ex + 1, ey + 1)]
    dark += [(int(round(cx - 0.5)), ey + 3), (int(round(cx - 1.5)), ey + 5), (int(round(cx - 0.5)), ey + 5), (int(round(cx + 0.5)), ey + 5)]
    if fade > 0:
        m &= BAYER4[Y_ % 4, X_ % 4] > fade * 1.05 - (Y_ < top + 10) * 0.15
        lv = np.maximum(1, lv - (1 if fade > 0.45 else 0))
    im = np.zeros((h, w, 4), np.uint8)
    for L in range(1, 5):
        im[m & (lv == L)] = (*hexc(GHOST[L]), 255)
    for x, y in dark:
        if 0 <= x < w and 0 <= y < h and m[y, x]: im[y, x] = (*hexc('#04161a'), 255)
    return im


UMH_N, UMH_MS = 8, 180
MOMENT = [('zug', 140), ('zug2', 100), ('aus1', 80), ('aus', 120), ('aus2', 550, 'halt'), ('s1', 55, 'bogen1'),
          ('s2', 55, 'bogen2'), ('hit', 300, 'hit'), ('n1', 260), ('n2', 220), ('n3', 200), ('zur', 160)]


def build():
    R = POSEN['ruhe']
    idle = []
    for i in range(UMH_N):
        p = dict(R, breath=1 if i in (2, 3, 4, 5) else 0)
        im, _ = figure(p, ph=i / UMH_N, ft=i % 6)
        idle.append(im)
    frames = []
    hit_idx, imp_px = 0, FX
    for st in MOMENT:
        pn, ms = st[0], st[1]; tag = st[2] if len(st) > 2 else None
        p = POSEN[pn]
        n = max(1, round(ms / 110)) if tag in ('halt', 'hit') else 1
        for k in range(n):
            sm = None
            if tag == 'bogen1': sm = sweep(POSEN['aus2'], p)
            if tag == 'bogen2': sm = sweep(POSEN['aus2'], p)
            if tag == 'hit' and k == 0: sm = sweep(POSEN['s1'], p)
            im, blade = figure(p, ph=(len(frames) % 8) / 8, ft=len(frames) % 6, smear=sm)
            if tag == 'hit' and k == 0:
                hit_idx = len(frames)
                ys, xs = np.nonzero(blade[:GROUND + 1]); imp_px = int(round(xs[ys == ys.max()].mean()))
            frames.append((im, round(ms / n)))
    Ld, seam, braz = scene()
    fx = {}
    B, imp = finish('ulgrim', FX, FY0, BX, [('koerper', idle, dict(n=UMH_N, ms=UMH_MS))], frames, hit_idx, imp_px, Ld,
                    ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'], fx,
                    {'glut': ['#e8fff8', '#7ef0d6', '#127272'], 'fokus': [300, BX - 40], 'teilchen': 'geist', 'dichte': 3.0, 'dauer': 9.0, 'start': 2.2,
                     'stopp': 75, 'beben': [[0, 3], [2, -2], [-2, 1], [1, -1], [-1, 1], [0, 1]]})
    crack = crack_mask(imp - 2, FY - 1, 14)
    allseam = seam | crack
    wave, wm = seam_wave(allseam, imp, FY - 2, v=280, ms=60, pal=GHOST, direction=-1, maxd=420, peak=lambda d: 4 if d < 90 else 3 if d < 220 else 2,
                         extra={(int(x), int(y)): abs(x - imp) * 0.9 for y, x in zip(*np.nonzero(crack))}, ages=(0.09, 0.3, 0.6, 1.0))
    fx['welle'] = wave
    # Geisterwand: läuft über den Boden nach vorn (laufende Säule + Spur), drei Größen
    fx['wand'] = strip([feuer(30, 62, i, 6, pal=GHOST, seed=4, hw=0.4, core=0.5) for i in range(6)])
    fx['wand2'] = strip([feuer(20, 36, i, 6, pal=GHOST, seed=6, hw=0.4) for i in range(6)])
    fx['wand3'] = strip([feuer(12, 18, i, 6, pal=GHOST, seed=9, hw=0.4) for i in range(6)])
    fx['geist'] = strip([wraith(k, 12, seed=1) for k in range(12)])
    fx['saeule'] = strip([feuer(28, 78, i, 6, pal=GHOST, seed=12, hw=0.42, core=0.55) for i in range(6)])
    fx['blitz'] = strip(impact_star())
    ev = [dict(k='bild', r='welle', at=0, x=wm['x'], y=wm['y'], w=wm['w'], h=wm['h'], n=wm['n'], ms=wm['ms'], z='boden'),
          dict(k='bild', r='blitz', at=0, x=imp - 17, y=FY - 30, w=35, h=32, n=5, ms=60, quer=True, z='vorn'),
          dict(k='bild', r='saeule', at=60, x=imp - 14, y=FY + 3 - 78, w=28, h=78, n=8, ms=80, loop=6, quer=True, z='vorn'),
          dict(k='wand', r='wand', r2='wand2', r3='wand3', at=30, x=imp - 4, y=FY + 3, dir=-1, v=260, weg=240, w=30, h=62, w2=20, h2=36,
               w3=12, h3=18, n=6, ms=80, abst=8, nach=560, z='vorn'),
          dict(k='funken', at=0, x=imp, y=FY - 2, n=30, r=5, vx=50, vy=120, g=260, c=GHOST[::-1][:4]),
          dict(k='funken', at=0, x=imp, y=FY - 1, n=18, r=8, vx=34, vy=46, g=90, c=['#4a5a62', '#323e46', '#232c32'])]
    # Totengeister steigen aus dem Riss (nah beim König, im Handy-Ausschnitt)
    ys, xs = np.nonzero(crack)
    for i, (dx, at) in enumerate(((34, 80), (78, 210), (128, 330), (186, 460))):
        x = imp - dx
        yy = int(ys[np.argmin(np.abs(xs - x))]) if len(xs) else FY
        ev.append(dict(k='bild', r='geist', at=at, x=x - 16, y=yy + 2 - 60, w=32, h=60, n=12, ms=80, quer=True, z='vorn'))
    B['meta']['ereignisse'] = ev
    fx['schale'] = strip([feuer(16, 22, i, 6, pal=GHOST, seed=8, hw=0.36) for i in range(6)])
    B['meta'].update({'schalen': [[int(x - 8), int(y - 21)] for x, y in braz], 'schale': {'w': 16, 'h': 22, 'n': 6, 'ms': 90}, 'schaleNach': 'mitte-glut'})
    B['meta']['warn'] = {'x0': max(14, imp - 250), 'x1': imp - 4, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 600, 'c': ['#0b3a40', '#127272', '#7ef0d6']}
    return B


def impact_star(pal=GHOST, w=35, h=32):
    """Einschlag: Lichtkreuz, dann Geisterkranz und zerfallender Bogen (5 Bilder, Fußpunkt unten Mitte)."""
    out = []
    cx, cy = w // 2, h - 3
    for k in range(5):
        im = np.zeros((h, w, 4), np.uint8)
        def put(x, y, lv):
            x, y = int(round(cx + x)), int(round(cy + y))
            if 0 <= x < w and 0 <= y < h and lv >= 0: im[y, x] = (*hexc(pal[lv]), 255)
        if k == 0:
            for i in range(-15, 16): put(i, 0, 4 if abs(i) < 6 else 3 if abs(i) < 11 else 2)
            for i in range(-15, 16): put(i, -1, 3 if abs(i) < 4 else -1)
            for j in range(1, 26): put(0, -j, 4 if j < 9 else 3 if j < 16 else 2)
            for j in range(1, 26): put(1, -j, 3 if j < 6 else -1)
            for j in range(1, 9): put(j, -j, 3 if j < 4 else 2); put(-j, -j, 3 if j < 4 else 2)
        else:
            r = (6, 10, 14, 17)[k - 1]
            n_ = int(math.pi * r * 1.6)
            for i in range(n_ + 1):
                a = math.pi * i / n_
                if k >= 3 and (i // 2) % 2: continue
                put(r * math.cos(a), -r * math.sin(a) * 0.75, (4, 3, 2, 1)[k - 1])
                if k < 3: put((r - 1) * math.cos(a), -(r - 1) * math.sin(a) * 0.75, (3, 2, 1, 1)[k - 1])
            for j in range(k + 1): put(-j * 3 - 4, 0, 2); put(j * 3 + 4, 0, 2)
        out.append(im)
    return out
