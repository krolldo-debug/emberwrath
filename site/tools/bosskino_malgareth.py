# Bosskino: Malgareth, der Aschenfürst (Finale, Stufe 40) im Saal des Aschethrons.
# Figur: riesiger Krieger in schwerer geschwärzter Plattenrüstung, deren Fugen von innen glühen (Glut zwischen den
# Lamellen, glühender Kern im Kürass), breite Schulterpanzer mit Flammenzacken, Kniekacheln und Ellbogenkacheln verdecken
# die Gelenke. Hageres aschfahles Gesicht in Dreiviertelansicht mit zwei glühenden Augen, langer Bart und Haar aus Asche,
# eiserne Flammenkrone. Echte Schwingen: Oberarm-, Unterarm- und Fingerknochen, dazwischen gespannte, zerrissene Haut mit
# verbrannten Rändern. Karminroter Königsmantel und Wappenrock. Bidenhänder aus schwarzem Stahl mit Glutader.
# Er steht frontal zur Kamera (Schultern breit, beide Schulterpanzer und Schwingen, breiter Stand), in Ruhe das Schwert vor
# sich in den Boden gestemmt. Gezeichnet mit x = Richtung der Attacke (h nach oben, Füße bei h = 0), im Bild gespiegelt (Hieb nach links).
# Attacke „Aschewelle“: Klinge aus dem Boden ziehen, Rückschwung über die Schulter hinter den Kopf, Halten, Hieb über den Kopf in den Boden
# (jedes Schwungbild eigens gestellt, Schwungsichel genau auf der Klingenbahn), Treffer-Einfrieren, Beben, Nachfedern;
# eine halbhohe Feuerwand läuft durch die ganze Halle nach links, Glut durch die Fugen der Bodenplatten.
import math
import numpy as np
from bosskino import (fire as feuer, Fig, MAT, ik, lerp, rot, over, flip, flame, vnoise, hash2, hexc, FLAME, Buf, bands, chk, BAYER4,
                      seam_wave, common_crop, strip, dedupe, outline_mask, edge_of, floor, bricks, stamp, SW, SH, FY, K, kcrop, GLOW, SPEC, up, PAD, SWX)

MAT.update({
    'iron': ['#07050a', '#15101a', '#2a222c', '#4a3e48', '#8c7c7a'],
    'irond': ['#050307', '#100c13', '#1d1820', '#2e2630', '#4a4048'],
    'gold': ['#140b08', '#4a2a12', '#86501c', '#c4842e', '#f4c46a'],
    'goldd': ['#0e0806', '#2e1a0e', '#4a2a12', '#6e4018', '#98602a'],
    'blade': ['#060408', '#120e16', '#221b28', '#3c3344', '#7c7084'],
    'robe': ['#1e070c', '#3c0d15', '#5e141d', '#851f25', '#ae3330'],
    'robed': ['#12040a', '#250910', '#3a0c14', '#541219', '#6e1820'],
    'skin': ['#140c0e', '#40302f', '#6c5a55', '#9c8a80', '#cdbcae'],
    'beard': ['#0c0809', '#2e2626', '#4e4442', '#7a6e68', '#aca096'],
    'hair': ['#09070a', '#1a1517', '#2e2627', '#4a403e', '#6c605a'],
    'mem': ['#0a0507', '#26110f', '#3c1a15', '#58271c', '#7a3622'],
    'memd': ['#070406', '#170b0b', '#22100f', '#311612', '#431d16'],
    'wbone': ['#120c0c', '#3a2f2b', '#655850', '#968878', '#c8baa4'],
    'wboned': ['#0c0808', '#241d1b', '#3e3532', '#5a4e48', '#7a6c62'],
    'lea': ['#0e0809', '#1e1418', '#2e2026', '#443038', '#5e4650'],
    'emb': ['#5a1406', '#a8300a', '#f0661a', '#ffb048', '#fff0c0'],
    'void': ['#07040a'] * 5,
    'eyew': ['#ffffff'] * 5,
    'pupil': ['#1a0503'] * 5,
    'spec': ['#e8e4f0'] * 5,
})
GLOW.clear(); GLOW.update({'emb'})
SPEC.clear(); SPEC.update({'iron': '#c4bcb8', 'blade': '#c8c0d4', 'gold': '#fff0b8', 'wbone': '#f0e6d2'})
INNER_WARM = {'iron': '#b8400e', 'irond': '#7a2208', 'gold': '#ffb048'}
COLD = {'iron': '#a4aec0', 'irond': '#525868', 'blade': '#c8d0e0', 'wbone': '#e8eef4'}
RIM_F = {'iron': '#a4aec0', 'irond': '#5a6070', 'gold': '#ffe0a0', 'robe': '#d8503a', 'skin': '#efe4d6', 'beard': '#d0c6b8', 'blade': '#b4a8b8',
         'wbone': '#efe2c8', 'hair': '#8a7c74'}
RIM_B = {'iron': '#e8641a', 'irond': '#a8300a', 'gold': '#ffb048', 'goldd': '#c8420c', 'robe': '#f0661a', 'robed': '#c8420c',
         'mem': '#c8420c', 'memd': '#7a2208', 'wbone': '#ffb048', 'wboned': '#c8420c', 'hair': '#c8420c', 'beard': '#f0a050',
         'skin': '#ffb048', 'blade': '#e8641a'}

W, H, FX, FY0 = 330, 190, 150, 180
GROUND = FY0 + 1
HMAX = 163            # höchster Punkt der Klinge/Schwingen über den Füßen (Szene: y >= 20 inkl. Kontur und Flammen)


class GFig(Fig):
    """Fig mit glühenden Fugen: Teile derselben Gruppe bekommen statt der dunklen Innenkante eine Glutlinie."""
    def __init__(s):
        super().__init__(W, H, FX, FY0, 1.0)
        s.grp = {}; s.glow = {}

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

    def g(s, mask, mat, grp, glow=1, **kw):
        s.put(mask, mat, **kw); s.grp[s.np] = grp; s.glow[s.np] = glow
        return mask

    def render_px(s, outline='#0c0609', rim=None, rim_back=None, inner=True):
        Hh, Ww = s.H, s.W
        im = np.zeros((Hh, Ww, 4), np.uint8)
        filled = s.mat != None
        P = s.part.astype(np.int64); mp = int(P.max()) + 1
        larr = np.array([bool(s.line.get(p)) for p in range(mp)])
        rarr = np.array([s.rim.get(p, True) for p in range(mp)])
        garr = np.array([s.grp.get(p, -1) if p in s.grp else -1 for p in range(mp)], dtype=object)
        gid = {g: i for i, g in enumerate(sorted({g for g in s.grp.values()}))}
        gnum = np.array([gid[s.grp[p]] if p in s.grp else -1 for p in range(mp)])
        glw = np.array([s.glow.get(p, 1) for p in range(mp)])
        t = s.tone.astype(np.int64).copy()
        col = np.zeros((Hh, Ww), np.int64)          # 0 = Materialfarbe, 1 = Glutfuge, 2 = warme Kante, 3 = kalte Kante
        gl = np.zeros((Hh, Ww), np.int64)
        Pp = np.pad(P, 1); Fp = np.pad(filled, 1)
        Y, X = np.mgrid[0:Hh, 0:Ww]
        done = ~(filled & larr[P])
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            q = Pp[1 + dy:Hh + 1 + dy, 1 + dx:Ww + 1 + dx]; fq = Fp[1 + dy:Hh + 1 + dy, 1 + dx:Ww + 1 + dx]
            hit = ~done & fq & (q > 0) & (q < P)
            same = hit & (gnum[P] >= 0) & (gnum[q] == gnum[P])
            col[same] = 1
            gl[same] = np.where((X[same] + Y[same]) % 5 != 0, glw[P[same]], np.minimum(4, glw[P[same]] + 1))
            t[hit & ~same] = 0
            done |= hit
        if K > 1:
            # Glutfuge im Feinraster: heller Kern (1 Feinpixel, eine Stufe heißer) mit dunkelrotem Saum auf der Nachbarplatte
            core = col == 1
            gl[core] = np.minimum(4, gl[core] + 1)
            cp = np.pad(core, 1)
            nb = np.zeros((Hh, Ww), bool)
            for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)): nb |= cp[1 + dy:Hh + 1 + dy, 1 + dx:Ww + 1 + dx]
            saum = nb & ~core & filled & (gnum[P] >= 0) & (col == 0) & (t > 0)
            col[saum] = 1; gl[saum] = 1
        left = np.full((Hh, Ww), -1, np.int64); left[:, 1:] = np.where(filled[:, :-1], P[:, :-1], -1)
        above = np.full((Hh, Ww), -1, np.int64); above[1:] = np.where(filled[:-1], P[:-1], -1)
        free = filled & (col == 0) & (s.tone > 0)
        for m in {m for m in s.mat[filled]}:
            sel = s.mat == m
            if rim_back and m in INNER_WARM:
                w_ = free & sel & (left != P) & (left < P) & rarr[P]
                col[w_] = 2
            if m in COLD:
                c_ = free & sel & (col == 0) & (s.tone >= 3) & (above != P) & (above < P) & ~((left != P) & (left < P) & rarr[P] & bool(rim_back) & (m in INNER_WARM))
                col[c_] = 3
            C = np.array([hexc(c) for c in MAT[m]], np.uint8)
            mm = sel & (col == 0)
            im[mm, :3] = C[np.clip(t[mm], 0, 4)]
            if m in INNER_WARM: im[sel & (col == 2), :3] = hexc(INNER_WARM[m])
            if m in COLD: im[sel & (col == 3), :3] = hexc(COLD[m])
        E = np.array([hexc(c) for c in MAT['emb']], np.uint8)
        im[col == 1, :3] = E[gl[col == 1]]
        im[filled, 3] = 255
        a0 = filled
        for side, R in ((1, rim), (-1, rim_back)):
            if not R: continue
            nb = np.zeros((Hh, Ww), bool)
            if side == 1: nb[:, :-1] = a0[:, 1:]
            else: nb[:, 1:] = a0[:, :-1]
            edge = a0 & ~nb & (s.tone > 0) & rarr[P]
            for m, c in R.items(): im[edge & (s.mat == m), :3] = hexc(c)
        if outline:
            a = im[:, :, 3] > 0
            o = np.zeros_like(a)
            o[1:, :] |= a[:-1, :]; o[:-1, :] |= a[1:, :]; o[:, 1:] |= a[:, :-1]; o[:, :-1] |= a[:, 1:]
            o &= ~a
            im[o] = (*hexc(outline), 255)
        return im


def line_px(f, A, B, mat, tone, only=None, step=0.4):
    L = math.hypot(B[0] - A[0], B[1] - A[1]); n = max(2, int(L / step))
    for k in range(n + 1):
        X, Y = f.at(*lerp(A, B, k / n))
        if 0 <= X < f.W and 0 <= Y < f.H and f.mat[Y, X] is not None and (only is None or f.mat[Y, X] in only):
            f.mat[Y, X] = mat; f.tone[Y, X] = tone


def pol(a, L, o=(0, 0)):
    r = math.radians(a); return (o[0] + L * math.cos(r), o[1] + L * math.sin(r))


# ------------------------------------------------------------------------------------------- Pose -> Gelenke
DEF = dict(crouch=0, lean=0, hipx=0, fN=21, fF=-21, breath=0, wo=0.0, wd=0.0, wehen=0, vor=0, rock=0, head=0)


class Pose:
    def __init__(s, p):
        s.p = dict(DEF, **p); P = s.p
        s.hip = (P['hipx'], 74 - P['crouch'])
        s.lean = P['lean']

    def T(s, x, h):
        """Rumpf-Ortskoordinaten (Hüfte = 0, 0) -> Figur; Atem hebt alles über der Taille."""
        b = s.p['breath']
        if h > 8: h = h + b * min(1.0, (h - 8) / 24)
        a = math.radians(-s.lean)
        return (s.hip[0] + x * math.cos(a) - h * math.sin(a), s.hip[1] + x * math.sin(a) + h * math.cos(a))

    def U(s, pts): return [s.T(x, h) for x, h in pts]


# ------------------------------------------------------------------------------------------- Schwert
LB = 84                    # Klingenlänge
def sword_geom(grip, ang):
    """Richtung (projiziert) und Längenfaktor: steht die Klinge so hoch, dass die Spitze über HMAX käme, wird sie wie
    über den Kopf in die Tiefe geschwungen verkürzt gezeichnet."""
    a = math.radians(ang); c, s_ = math.cos(a), math.sin(a)
    tipu = 10 + LB
    k = 1.0
    raw = grip[1] + tipu * s_
    H0 = HMAX - 16
    if s_ > 0 and raw > H0:
        hh = H0 + 13 * (1 - math.exp(-(raw - H0) / 13))
        k = max(0.12, (hh - grip[1]) / (tipu * s_))
    return (c, s_), k


def sword(f, grip, ang, glow=1):
    (ux, uh), sc = sword_geom(grip, ang)
    vx, vh = -uh, ux
    gx, gh = grip
    P = lambda u, v: (gx + ux * u * sc + vx * v, gh + uh * u * sc + vh * v)
    # Knauf (Dornring), Griff
    f.put(f.poly([P(-17, 0), P(-14, -3.6), P(-11, 0), P(-14, 3.6)]), 'gold', shade='dome', r=1.5)
    f.put(f.poly([P(-18.8, -0.8), P(-16.5, -0.8), P(-16.5, 0.8), P(-18.8, 0.8)]), 'gold', fixed=4)
    f.put(f.poly([P(-11, -1.9), P(7, -1.9), P(7, 1.9), P(-11, 1.9)]), 'lea', fixed=2)
    for u in (-8, -5, -2, 1, 4):
        f.recolor(f.poly([P(u - 0.5, -1.9), P(u + 0.5, -1.9), P(u + 0.5, 1.9), P(u - 0.5, 1.9)]), tone=1)
    # Klinge: breit, gerade, Spitze lang
    tip = 10 + LB
    pts = [P(9, -5.2), P(16, -4.6), P(tip - 16, -4.0), P(tip, 0), P(tip - 16, 4.0), P(16, 4.6), P(9, 5.2)]
    blade = f.poly(pts)
    f.put(blade, 'blade', fixed=2)
    ys, xs = np.nonzero(blade)
    # obere Schneide hell (Licht von oben vorn), untere dunkel, Hohlkehle mit Glutader
    for y, x in zip(ys, xs):
        h = f.FY - (y + 0.5); xx = x + 0.5 - f.FX
        v = (xx - gx) * vx + (h - gh) * vh
        f.tone[y, x] = 3 if v > 1.8 else 2 if v > -1.2 else 1
    for y, x in zip(*np.nonzero(edge_of(blade))):
        h = f.FY - (y + 0.5); xx = x + 0.5 - f.FX
        v = (xx - gx) * vx + (h - gh) * vh
        f.tone[y, x] = 4 if v > 0 else 1
    line_px(f, P(16, 0), P(tip - 14, 0), 'emb', 2 if glow else 1, only=('blade',))
    line_px(f, P(20, 0), P(tip - 26, 0), 'emb', 3 if glow else 1, only=('blade', 'emb'), step=0.9)
    for u0, d in ((30, 1), (48, -1), (64, 1)):
        line_px(f, P(u0, 0), P(u0 + 4, 2.6 * d), 'emb', 1, only=('blade',))
    # Parierstange: breit, Enden zur Klinge gebogen, Glutstein
    f.put(f.poly([P(7, -3), P(6, -12), P(9, -17), P(12, -15), P(10, -11), P(10.5, -3), P(10.5, 3), P(10, 11), P(12, 15), P(9, 17), P(6, 12), P(7, 3)]),
          'gold', shade='dome', r=1.6, dcuts=(0.25, 0.55, 0.8))
    f.put(f.poly([P(7.2, -1.8), P(10.2, -1.8), P(10.2, 1.8), P(7.2, 1.8)]), 'emb', fixed=4, line=False)
    # Feinraster: durchgehende Glanzlinie an der oberen Schneide, Glanzpunkt nahe der Parierstange
    f.fline(P(11, 4.3), P(tip - 15, 3.4), 'blade', 4)
    f.fline(P(13, 3.9), P(24, 3.7), 'spec', 4)
    fire = f.poly([P(26, -5), P(tip - 14, -4), P(tip, 0), P(tip - 14, 4), P(26, 5)]) & blade
    tipp = P(tip, 0)
    return blade, fire, tipp, P


def hands_of(grip, ang):
    (ux, uh), sc = sword_geom(grip, ang)
    hA = (grip[0] - 4 * ux * sc, grip[1] - 4 * uh * sc); hB = (grip[0] + 3.5 * ux * sc, grip[1] + 3.5 * uh * sc)
    return hB, hA       # vordere Hand an der Parierstange, hintere am Knauf


def gauntlet(f, c, d, far=False):
    """Panzerhandschuh: weit ausgestellte Stulpe mit Goldrand, Faust um den Griff (d = Richtung Ellbogen -> Hand)."""
    m, gm = ('irond', 'goldd') if far else ('iron', 'gold')
    px_, ph_ = -d[1], d[0]
    a, b = (c[0] - d[0] * 9, c[1] - d[1] * 9), (c[0] - d[0] * 2.5, c[1] - d[1] * 2.5)
    cuff = f.poly([(a[0] + px_ * 4, a[1] + ph_ * 4), (b[0] + px_ * 7, b[1] + ph_ * 7), (b[0] - px_ * 7, b[1] - ph_ * 7), (a[0] - px_ * 4, a[1] - ph_ * 4)])
    f.put(cuff, m, shade='dome', r=2, dcuts=(0.15, 0.42, 0.72))
    line_px(f, (b[0] + px_ * 6.5, b[1] + ph_ * 6.5), (b[0] - px_ * 6.5, b[1] - ph_ * 6.5), gm, 3, only=(m,))
    fist = f.ell(c[0] + d[0] * 0.5, c[1] + d[1] * 0.5, 4.8, 4.4)
    f.put(fist, m, shade='ball', dcuts=(0.12, 0.5, 0.82))
    for k in (-1.8, 0, 1.8):
        X, Y = f.at(c[0] + d[0] * 3 + px_ * k, c[1] + d[1] * 3 + ph_ * k)
        f.px(X, Y, m, 4 if not far else 3)
    return fist


# ------------------------------------------------------------------------------------------- Kopf (Handarbeit)
HEAD = [
    '.......hhhHHHhh.........',
    '.....hhHHHGGG3333.......',
    '....hHHHGG233334444.....',
    '...hHHHG22333344444.....',
    '...hHHG223333444444K....',
    '..hHHHG2233333444444K...',
    '..hHHG22233334444444K...',
    '..hHHG2223333344444444..',
    '..hHHG2223333344444444..',
    '..hHHG2223333344444443..',
    '..hHHh2122333344444443..',
    '..hHHh112223333444443K..',
    '..hHHhK1122233344443K...',
    '..hHHhKK112223334443K...',
    '..hHHbK1112233333443K...',
    '..hHHbBK11BBcCCcCBcK....',
    '..hHHbBcKBcKKKKKKcBc....',
    '..hHHbBcBcBcCcCcBcBc....',
    '...hHbBcBcCcBcCcBcBc....',
    '...hHbBccBcCcBcCcBc.....',
    '....hbBcCcBcCcfBcCc.....',
    '....hbBccCcBcCcBcCb.....',
    '.....bBcCcBcfcBcCcb.....',
    '.....bBccCcBcCcBcb......',
    '.....bBcCfcBcCcBcb......',
    '......bBcCcBcfcBb.......',
    '......bBccCcBcCcb.......',
    '.......bBcfcBcCb........',
    '.......bBcCcBcb.........',
    '........bBcBfcb.........',
    '........bBcCcb..........',
    '.........bcfb...........',
    '.........bBcb...........',
    '..........fc............',
    '..........f.............',
]
HLEG = {'K': ('skin', 0), '1': ('skin', 1), '2': ('skin', 2), '3': ('skin', 3), '4': ('skin', 4),
        'h': ('hair', 1), 'H': ('hair', 2), 'G': ('hair', 3),
        'E': ('emb', 4), 'o': ('emb', 3), 'r': ('emb', 1), 'f': ('emb', 2),
        'b': ('beard', 1), 'B': ('beard', 2), 'c': ('beard', 3), 'C': ('beard', 4)}


# Gesicht im Feinraster (Feinpixel relativ zur linken oberen Ecke von HEAD; Licht kommt im Bild von links oben = hier von
# rechts oben): Brauenkante, Lidspalte mit Glut, runde Pupille mit Glanzpunkt, Unterlid, Nasenrücken, Mund.
FACE_F = {
    # Blick zum Betrachter (Dreiviertel): beide Augen gleich hoch, runde Pupillen mittig, Nasenrücken zwischen den Augen
    # nach unten, Mund mittig darunter, Brauen zur Nase hin gesenkt. Hinteres Auge (Schattenseite) etwas schmaler.
    (17, 12): ['KKK......',
               '.44KKKK..',
               'KKKKKKKKK',
               'KKroEEorK',
               'KroEppWoK',
               'KroEppEoK',
               'KKrooooKK',
               '.KKKKKKK.',
               '..22222..'],
    (32, 12): ['.......KKK',
               '..KKKK44..',
               'KKKKKKKKKK',
               'KKroEEEorK',
               'KroEppWEoK',
               'KroEppEEoK',
               'KKrroooorK',
               '.KKKKKKKK.',
               '..333333..'],
    # Nasenrücken (Lichtseite rechts), Nasenspitze mit Nasenlöchern
    (27, 16): ['.24', '.24', '.24', '.234', '.234', '1234', '1234', '12334', 'K2333K', '.KK.KK'],
    # Mund: waagrecht, Unterlippe hell
    (24, 29): ['.KKKKKKKKKKK.', '..233333332..'],
}
FLEG_F = {'K': ('skin', 0), '1': ('skin', 1), '2': ('skin', 2), '3': ('skin', 3), '4': ('skin', 4),
          'r': ('emb', 1), 'o': ('emb', 3), 'E': ('emb', 4), 'W': ('eyew', 4), 'p': ('pupil', 0)}


def face_fine(f, X0, Y0):
    for (dx, dy), rows in FACE_F.items():
        f.fsprite(X0 * K + dx, Y0 * K + dy, rows, FLEG_F, under=True)


def head(f, Pz):
    """Kopf (Dreiviertel, Blick nach vorn), Haar und Krone; gibt (Zackenmaske, Bildzeile der Reifoberkante) zurück."""
    n = Pz.T(0, 44)
    hx, hh = round(n[0] - 12 + Pz.p['head']), round(n[1] + 21)
    wh = Pz.p['wehen']; ph = Pz.p.get('hph', 0)
    hairpts = [(hx + 5, hh - 0.5), (hx + 0.5, hh - 5), (hx - 2, hh - 14), (hx - 4 - wh * 0.3, hh - 22), (hx - 7 - wh * 0.5, hh - 31 + ph),
               (hx - 1, hh - 30), (hx + 3, hh - 22), (hx + 6, hh - 16)]
    # von vorn: Haar fällt zu beiden Seiten des Gesichts (Seite +x gespiegelt, weht weniger)
    ax = hx + 12.5
    hair2 = [(2 * ax - x + (wh * 0.4 if j in (3, 4) else 0), h) for j, (x, h) in enumerate(hairpts)]
    f.put(f.poly(hair2), 'hair', shade='cyl', cut=(0.3, 0.7))
    f.put(f.poly(hairpts), 'hair', shade='cyl', cut=(0.3, 0.7))
    f.sprite(hx, hh, HEAD, HLEG)
    face_fine(f, *f.at(hx, hh))
    # Krone: goldener Reif über der Stirn (schräg, Dreiviertel), fünf Flammenzacken, Glutsteine
    band = f.poly([(hx + 2, hh - 7.5), (hx + 2, hh - 3), (hx + 10, hh + 0.5), (hx + 20, hh + 0.3), (hx + 20.3, hh - 4.3), (hx + 10, hh - 5)])
    f.put(band, 'gold', shade='vcyl', cut=(0.25, 0.6))
    sp = np.zeros((f.H, f.W), bool)
    for x0, L, lean_ in ((3.0, 8, -2.4), (7.2, 12, -1.2), (11.8, 15, 0.3), (16.0, 12, 1.6), (19.2, 7, 2.6)):
        b0 = hh - 0.8 if x0 > 8 else hh - 2.6 - (8.5 - x0) * 0.4
        tip = (hx + x0 + lean_, b0 + L)
        m = f.poly([(hx + x0 - 2, b0), (hx + x0 - 0.9, b0 + L * 0.5), tip, (hx + x0 + 1.0, b0 + L * 0.45), (hx + x0 + 2, b0)])
        f.put(m, 'gold', light=(1, -1), hi=1, mid=2, flat=4)
        sp |= m
        X, Y = f.at(*tip); f.px(X, Y, 'emb', 4); f.px(X, Y + 1, 'emb', 3)
    for x0 in (5.5, 11.5, 17.5):
        X, Y = f.at(hx + x0, hh - 2.2 + (0.8 if x0 > 9 else 0))
        f.px(X, Y, 'emb', 4); f.px(X + 1, Y, 'emb', 3); f.px(X, Y + 1, 'emb', 2)
    return sp, f.at(0, hh + 1)[1]


# ------------------------------------------------------------------------------------------- Schwingen
def wing(f, root, wo, wd, ph, far=False):
    """Schwinge: Oberarm- und Unterarmknochen bis zum Handgelenk mit Daumenkralle, vier Fingerknochen, Haut dazwischen
    in Bögen gespannt, mit Rissen und verbrannten Löchern. wo: 0 halb gefaltet .. 1 weit offen; wd: Schlag nach unten."""
    mm, bm = ('memd', 'wboned') if far else ('mem', 'wbone')
    br = 0.05 * math.sin(ph * 2 * math.pi)
    a1 = 128 + 26 * wo + 25 * wd + (6 if far else 0) + br * 30
    a2 = 80 + 52 * wo + 150 * wd + (8 if far else 0) + br * 60
    E = pol(a1, 25, root)
    Wr = pol(a2, 29, E)
    fins = []
    base = [(198, 58), (222, 70), (246, 72), (266, 60)]
    for i, (a, L) in enumerate(base):
        aa = a - 16 * wo * (1 - i * 0.18) + wd * (8 + i * 14) + (6 if far else 0) + br * 40 * (1 - i * 0.2)
        fins.append(pol(aa, L * (1 + 0.12 * wo), Wr))
    # Höhenbegrenzung: alles unter HMAX
    top = max(Wr[1] + 7, E[1] + 3)
    if top > HMAX:
        d = top - HMAX
        E = (E[0], E[1] - d * 0.5); Wr = (Wr[0], Wr[1] - d); fins = [(x, h - d) for x, h in fins]
    attach = (root[0] + 4, root[1] - 46 + 6 * wd)
    pts = [root, E, Wr, fins[0]]
    seq = fins + [attach]
    for i in range(len(seq) - 1):
        A, B_ = seq[i], seq[i + 1]
        mid = lerp(A, B_, 0.5)
        pts.append(lerp(mid, Wr, (0.22 + 0.2 * wd) if i < len(fins) - 1 else 0.12))
        pts.append(B_)
    mem = f.poly(pts)
    f.put(mem, mm, fixed=2)
    # Töne je Feld: an der vorderen (oberen) Rippe hell, zur Bucht dunkel
    ys, xs = np.nonzero(mem)
    wx, wy = f.FX + Wr[0], f.FY - Wr[1]
    angs = [math.atan2(-(t[1] - Wr[1]), t[0] - Wr[0]) for t in fins + [attach]]
    for y, x in zip(ys, xs):
        a = math.atan2(y + 0.5 - wy, x + 0.5 - wx)
        for i in range(len(angs) - 1):
            a1_, a2_ = angs[i], angs[i + 1]
            # Winkel laufen im Bild (y nach unten) von a1 nach a2 aufsteigend oder über die Naht bei ±pi
            span = (a2_ - a1_) % (2 * math.pi)
            u = ((a - a1_) % (2 * math.pi)) / span if span > 0 else 2
            if u <= 1:
                t = 3 if u < 0.14 else 2 if u < 0.6 else 1
                f.tone[y, x] = max(1, t - (1 if far else 0)); break
        else:
            f.tone[y, x] = 2 if not far else 1
    # Risse in der Haut: schmale Keile von der Hinterkante zum Handgelenk, Ränder verbrannt
    tears = [(0, 0.34, 2.6), (1, 0.42, 3.2), (2, 0.3, 2.4), (3, 0.38, 2.8)]
    seqt = fins + [attach]
    for i, depth, wdt in tears:
        if far and i % 2: continue
        A, B_ = seqt[i], seqt[i + 1]
        mpt = lerp(lerp(A, B_, 0.5), Wr, 0.22)
        dx, dh = Wr[0] - mpt[0], Wr[1] - mpt[1]; L = math.hypot(dx, dh) or 1
        ux, uh = dx / L, dh / L
        o = (-uh * wdt, ux * wdt)
        endp = (mpt[0] + dx * depth, mpt[1] + dh * depth)
        cutm = f.poly([(mpt[0] + o[0] - ux * 2, mpt[1] + o[1] - uh * 2), endp, (mpt[0] - o[0] * 0.4 - ux * 2, mpt[1] - o[1] * 0.4 - uh * 2)]) & mem
        ring = outline_mask(cutm) & mem & ~cutm
        for y, x in zip(*np.nonzero(cutm)): f.mat[y, x] = None
        mem = mem & ~cutm
        if not far:
            for y, x in zip(*np.nonzero(ring)):
                if hash2(x, y, 2) < 0.55: f.mat[y, x] = 'emb'; f.tone[y, x] = 1
    # Hinterkante ausgefranst: Kerben in den Buchten
    em = edge_of(mem)
    for y, x in zip(*np.nonzero(em)):
        if f.mat[y, x] is None: continue
        hs = hash2(x, y, 7 if far else 3)
        if (f.FY - y) < Wr[1] - 6:
            if hs < 0.18: f.mat[y, x] = None
            elif hs < 0.3 and not far: f.mat[y, x] = 'emb'; f.tone[y, x] = 1
    # Knochen
    f.put(f.seg(root, E, 6, 5), bm, cut=(0.3, 0.62))
    f.put(f.seg(E, Wr, 5, 4), bm, cut=(0.3, 0.62))
    f.put(f.ell(E[0], E[1], 3.2, 3.2), bm, shade='dome', r=1.6)
    for i, T_ in enumerate(fins):
        f.put(f.seg(Wr, T_, 3.4 - i * 0.3, 1.3), bm, cut=(0.3, 0.62), line=False)
        f.put(f.ell(*lerp(Wr, T_, 0.42), 1.8, 1.8), bm, shade='dome', r=1)
        X, Y = f.at(*T_); f.px(X, Y, bm, 4)
    f.put(f.ell(Wr[0], Wr[1], 3.6, 3.4), bm, shade='dome', r=1.8)
    # Daumenkralle am Handgelenk, nach vorn oben gekrümmt
    cl = [pol(a2 - 40, 3, Wr), pol(a2 - 10, 8, Wr), pol(a2 - 20, 3.2, Wr)]
    f.put(f.poly([Wr] + cl), bm, fixed=3)
    return mem


# ------------------------------------------------------------------------------------------- Mantel
def cape(f, Pz, ph):
    """Königsmantel von vorn: fällt von beiden Schultern hinter dem Körper bis zum Boden, links und rechts der Beine
    sichtbar, zwischen den Beinen sieht man sein Futter. wehen: weht beim Hieb nach hinten (-x), vor: Saum schwingt nach."""
    P = Pz.p
    t = ph * 2 * math.pi
    wh, vo = P['wehen'], P['vor']
    shB, shF = Pz.T(-19, 40), Pz.T(19, 40)
    n = 14
    back, front = [], []
    for i in range(n + 1):
        k = i / n
        h = shB[1] * (1 - k) + 2 * k
        x = shB[0] - 3 - k * (15 + wh * 2.0) - 1.6 * math.sin(t - k * 4.5) * k + vo * k * k
        back.append((x, h + wh * 0.8 * k * k))
        h = shF[1] * (1 - k) + 2 * k
        x = shF[0] + 3 + k * (13 - wh * 1.1) + 1.4 * math.sin(t + 1.3 - k * 4.0) * k + vo * k * k * 1.4
        front.append((x, h + wh * 0.3 * k * k))
    hem = []
    xa, xb = back[-1][0], front[-1][0]
    for i in range(1, 12):
        k = i / 12
        x = xa + (xb - xa) * k
        hem.append((x, 2 + 2.0 * math.sin(t + k * 9) * (0.6 + 0.4 * k) + wh * 0.5 * (1 - k) + max(0, vo) * 0.3))
    pts = back + hem + front[::-1]
    m = f.poly(pts)
    f.put(m, 'robe', fixed=2)
    ys, xs = np.nonzero(m)
    y_top, y_bot = ys.min(), ys.max()
    rows = {}
    for y, x in zip(ys, xs): rows.setdefault(y, []).append(x)
    cx = f.at(*Pz.T(0, 0))[0]
    for y, x in zip(ys, xs):
        a0, b0 = min(rows[y]), max(rows[y])
        dep = (y - y_top) / max(1, y_bot - y_top)
        fo = math.sin((x - cx) * 0.42 + t * 0.6 + dep * 2.0)
        tt = 2 + (1 if fo > 0.55 else -1 if fo < -0.35 else 0)
        if abs(x - cx) < 9 and dep > 0.35: tt = max(1, tt - 1)            # Futter zwischen den Beinen: dunkler
        f.tone[y, x] = tt
        if x - a0 < 1: f.tone[y, x] = 1
        if b0 - x < 1 and tt < 3: f.tone[y, x] = tt + 1                  # Lichtseite (+x) mit heller Kante
    for y, x in zip(ys, xs):
        if y + 1 < f.H and not m[y + 1, x]:
            hs = hash2(x, y, 4)
            if hs < 0.25: f.mat[y, x] = None
            else: f.mat[y, x] = 'emb'; f.tone[y, x] = 2 if hs > 0.7 else 1
        elif y + 2 < f.H and not m[y + 2, x] and dep_ok(y, y_bot):
            f.mat[y, x] = 'gold'; f.tone[y, x] = 2
    return m


def dep_ok(y, yb): return yb - y < 30


# ------------------------------------------------------------------------------------------- Körper (von vorn)
# Malgareth steht frontal zur Kamera (wie der Kopf): Schultern breit, beide Schulterpanzer, Kürass aus zwei Brustplatten
# mit Mittelgrat, breiter Stand mit beiden Beinen nebeneinander. In Ruhe ist der Bidenhänder vor ihm in den Boden gestemmt,
# beide Hände auf dem Knauf. Rumpf-Ort: x quer (nach +x = Blickrichtung der Attacke, im Bild links), h nach oben.
SHX = 21         # Schulter quer zur Mitte


def legs(f, Pz):
    P = Pz.p
    out = {}
    for s in (-1, 1):
        m, gm = 'iron', 'gold'
        hipj = Pz.T(8 * s, -4)
        fx0 = P['fN'] if s > 0 else P['fF']
        ank = (fx0, 12)
        # von vorn: gebeugte Knie zeigen zur Kamera (Bein kürzer), nur leicht nach außen
        kn = lerp(hipj, ank, 0.5); kn = (kn[0] + s * (1.0 + P['crouch'] * 0.12), kn[1])
        f.put(f.seg(hipj, kn, 18, 14), m, cut=(0.22, 0.5))
        f.put(f.seg(kn, ank, 13, 9.5), m, cut=(0.22, 0.5))
        a, b = lerp(kn, ank, 0.18), lerp(kn, ank, 0.8)
        f.put(f.poly([a, (lerp(kn, ank, 0.4)[0] - 7.5, lerp(kn, ank, 0.4)[1]), (b[0] - 4.5, b[1]), (b[0] + 4.5, b[1]),
                      (lerp(kn, ank, 0.4)[0] + 7.5, lerp(kn, ank, 0.4)[1])]), m, cut=(0.22, 0.5))
        line_px(f, (kn[0] + 1.5, kn[1] - 6), (ank[0] + 1.2, ank[1] + 3), m, 4, only=(m,))
        # Panzerschuh von vorn: breite Kappe, Spitze leicht nach außen, Lamellen quer, Goldrand am Rist
        o = 2.5 * s
        sab = f.poly([(fx0 - 8 + o, 0), (fx0 + 8 + o, 0), (fx0 + 8 + o * 0.6, 4), (fx0 + 6, 10), (fx0 + 5, 14), (fx0 - 5, 14), (fx0 - 6, 10), (fx0 - 8 + o * 0.6, 4)])
        f.put(sab, m, shade='dome', r=3, dcuts=(0.15, 0.42, 0.72))
        for hh in (4, 7.5):
            line_px(f, (fx0 - 6.5 + o * 0.5, hh), (fx0 + 6.5 + o * 0.5, hh), m, 0, only=(m,))
        f.put(f.poly([(fx0 - 6, 10.5), (fx0 + 6, 10.5), (fx0 + 6, 13.5), (fx0 - 6, 13.5)]), gm, fixed=3)
        # Kniekachel: Kuppel mit Fächern zu beiden Seiten
        kx, kh = kn
        for d in (-1, 1):
            f.put(f.poly([(kx + d * 1, kh + 7), (kx + d * 9, kh + 3), (kx + d * 9, kh - 4), (kx + d * 1, kh - 3)]), gm, light=(1, -1), hi=1, mid=2, flat=4)
        f.put(f.ell(kx, kh, 6.5, 6.5), m, shade='ball', dcuts=(0.12, 0.5, 0.82))
        f.put(f.poly([(kx - 2, kh - 4), (kx, kh - 10), (kx + 2, kh - 4)]), m, light=(1, -1), hi=1, mid=2, flat=4)
        X, Y = f.at(kx, kh - 9.5); f.px(X, Y, gm, 4)
        out[s] = kn
    return out


def torso(f, Pz):
    P = Pz.p
    U = Pz.U
    sw = P['rock']
    # Wappenrock vorn zwischen den Beinen, karmin mit Goldsaum, unten spitz
    lo = Pz.T(-11, -16), Pz.T(11, -16)
    rock = f.poly(U([(-9, 3), (9, 3)]) + [(lo[1][0] + 1, lo[1][1]), (lo[1][0] + 1 + sw, 30), (Pz.T(0, -16)[0] + sw * 1.4, 22),
                                          (lo[0][0] - 1 + sw, 30), (lo[0][0] - 1, lo[0][1])])
    f.put(rock, 'robe', cut=(0.25, 0.6))
    ys, xs = np.nonzero(rock)
    for y, x in zip(ys, xs):
        if y + 2 < f.H and (not rock[y + 1, x] or not rock[y + 2, x]): f.mat[y, x] = 'gold'; f.tone[y, x] = 3 if rock[y + 1, x] else 2
    c = Pz.T(0, -9)
    for dx, dh, t in ((0, 0, 4), (-2, 0, 3), (2, 0, 3), (0, 1, 3), (0, -1, 3), (0, -2, 2), (-1, 2, 2), (1, 2, 2), (-3, 2, 2), (3, 2, 2), (0, 3, 3)):
        f.dot(c[0] + dx, c[1] + dh, 'gold', t)
    # Beintaschen beidseits über den Hüften (zwei Reihen)
    for s in (-1, 1):
        for i, (h0, h1) in enumerate(((3, -10), (-8, -21))):
            q = [(s * (6 + i * 2), h0), (s * (19 + i), h0 - 1), (s * (19 + i), h1), (s * (8 + i * 2), h1 + 2)]
            f.put(f.poly(U(q)), 'iron', shade='dome', r=3, dcuts=(0.15, 0.42, 0.72))
    # Gürtel mit Glutschnalle in der Mitte
    f.put(f.poly(U([(-14, 2), (14, 2), (14, 7), (-14, 7)])), 'lea', fixed=2)
    f.put(f.poly(U([(-3.5, 1), (3.5, 1), (3.5, 8), (-3.5, 8)])), 'gold', shade='dome', r=1.5)
    f.dot(*Pz.T(0, 4.5), 'emb', 4); f.dot(*Pz.T(0, 3.5), 'emb', 3)
    # Bauchreifen: zur Brust breiter
    for h0, h1, w0, w1 in ((7, 12, 13, 14), (11, 17, 14, 17)):
        f.g(f.poly(U([(-w0, h0), (w0, h0), (w1, h1), (-w1, h1)])), 'iron', 'bauch', glow=1, shade='lame', bh=6)
    # Kürass: zwei Brustplatten mit Mittelgrat, breit zur Kamera
    rb, rt = (0, 14), (0, 47)
    pl = [(-12, 49), (-20, 44), (-23, 32), (-18, 20)]
    left_pl = f.poly(U([rb, rt] + pl))
    right_pl = f.poly(U([rb, rt] + [(-x, h) for x, h in pl]))
    f.g(left_pl, 'iron', 'bauch', glow=1, shade='ball', dcuts=(0.05, 0.45, 0.8))
    f.g(right_pl, 'iron', 'bauch', glow=1, shade='ball', dcuts=(0.1, 0.4, 0.72))
    line_px(f, Pz.T(*rb), Pz.T(*rt), 'gold', 3)
    line_px(f, Pz.T(1, 16), Pz.T(1, 46), 'iron', 4, only=('iron',))
    # glühender Kern mit Rissen, die als Glutadern über die Platten laufen
    hx, hh = Pz.T(0, 28)
    core = f.ell(hx, hh, 3.6, 3.4)
    for y, x in zip(*np.nonzero(core)):
        d = math.hypot(x + 0.5 - f.FX - hx, f.FY - y - 0.5 - hh)
        f.mat[y, x] = 'emb'; f.tone[y, x] = 4 if d < 1.6 else 3 if d < 2.6 else 2
    rng = np.random.default_rng(5)
    for a0, L in ((20, 13), (75, 12), (130, 10), (200, 11), (250, 9), (320, 12), (165, 7), (290, 8)):
        x, h = hx, hh; a = math.radians(a0)
        for j in range(int(L)):
            a += rng.uniform(-0.5, 0.5)
            x += math.cos(a); h += math.sin(a)
            X, Y = f.at(x, h)
            if 0 <= X < f.W and 0 <= Y < f.H and f.mat[Y, X] in ('iron', 'gold', 'emb') and not (f.mat[Y, X] == 'emb' and f.tone[Y, X] > 2):
                f.mat[Y, X] = 'emb'; f.tone[Y, X] = 2 if j < L * 0.4 else 1
    # hohe Halsberge: drei Ringe um den Hals, oben Goldrand
    for i, (h0, h1, w) in enumerate(((43, 48, 12), (47, 52, 11), (51, 56, 10))):
        gm_ = f.poly(U([(-w, h0), (w, h0 + 0.5), (w - 1, h1), (-w + 1, h1)]))
        f.g(gm_, 'iron', 'hals', glow=1, shade='ball', dcuts=(0.05, 0.45, 0.8))
        if i == 2:
            for y, x in zip(*np.nonzero(gm_)):
                if y == 0 or not gm_[y - 1, x]: f.mat[y, x] = 'gold'; f.tone[y, x] = 3
    return right_pl


def pauldron(f, Pz, s):
    """Schulterpanzer der Seite s (-1 / +1): zwei Lamellen mit Glutfugen, große Kuppel mit Goldrand, Flammenzacken nach
    oben außen."""
    m, gm = 'iron', 'gold'
    c = Pz.T(s * 25, 39)
    lame = f.ell(c[0] + s * 0.5, c[1] - 4, 12, 9) & ~f.poly([(c[0] - 30, c[1] + 30), (c[0] + 30, c[1] + 30), (c[0] + 30, c[1] - 5), (c[0] - 30, c[1] - 5)])
    f.g(lame, m, 'pauld%d' % s, glow=1, shade='ball', dcuts=(0.0, 0.42, 0.75))
    dome = f.ell(c[0] + s * 0.5, c[1] + 2, 12.5, 12) & ~f.poly([(c[0] - 30, c[1] - 30), (c[0] + 30, c[1] - 30), (c[0] + 30, c[1] - 6), (c[0] - 30, c[1] - 6)])
    f.g(dome, m, 'pauld%d' % s, glow=1, shade='ball', dcuts=(0.12, 0.5, 0.82))
    line_px(f, (c[0] - 7, c[1] + 9), (c[0] + 7, c[1] + 9), gm, 3, only=(m,))
    ed = edge_of(dome)
    for y, x in zip(*np.nonzero(dome)):
        if ed[y, x] or (y + 2 < f.H and not dome[y + 2, x]): f.mat[y, x] = gm; f.tone[y, x] = 3 if ed[y, x] and y + 1 < f.H and dome[y + 1, x] else 2
    # Flammenzacken nach oben außen
    for x0, L, a in ((-11, 10, 140), (-5, 14, 120), (2, 10, 100)):
        b = (c[0] + (x0 if s < 0 else -x0), c[1] + 8 + (2 if x0 > -9 else 0))
        aa = a if s < 0 else 180 - a
        tip = pol(aa, L, b)
        mid = pol(aa + (20 if s < 0 else -20), L * 0.55, b)
        f.put(f.poly([(b[0] - 3, b[1] - 1), mid, tip, (b[0] + 3, b[1] - 1)]), m, light=(1, -1), hi=1, mid=2, flat=4)
        X, Y = f.at(*tip); f.px(X, Y, 'emb', 3); f.px(X, Y + 1, 'emb', 2)
    return dome


def elbow(Pz, sh, hand, s, l1=27, l2=27):
    """Ellbogen von vorn: von beiden Lösungen die weiter außen liegende (Seite s)."""
    a, b = ik(sh, hand, l1, l2, bend=1), ik(sh, hand, l1, l2, bend=-1)
    mid = Pz.T(0, 30)[0]
    return a if (a[0] - mid) * s > (b[0] - mid) * s else b


def upper_arm(f, sh, el, far=False):
    m, gm = ('irond', 'goldd') if far else ('iron', 'gold')
    f.put(f.seg(sh, el, 12, 9.5), m, cut=(0.22, 0.5))
    a = lerp(sh, el, 0.72); b = lerp(sh, el, 0.8)
    f.put(f.seg(a, b, 11.5, 11), m, cut=(0.22, 0.5))
    dx, dh = el[0] - sh[0], el[1] - sh[1]; L = math.hypot(dx, dh) or 1
    px_, ph_ = -dh / L, dx / L
    line_px(f, (b[0] + px_ * 5.6, b[1] + ph_ * 5.6), (b[0] - px_ * 5.6, b[1] - ph_ * 5.6), gm, 3, only=(m,))


def forearm(f, el, hand, far=False):
    """Armschiene zur Hand schmaler, Ellbogenkachel mit Fächer, Panzerhandschuh mit Stulpe."""
    m, gm = ('irond', 'goldd') if far else ('iron', 'gold')
    f.put(f.seg(el, hand, 11, 7.5), m, cut=(0.22, 0.5))
    dx, dh = hand[0] - el[0], hand[1] - el[1]; L = math.hypot(dx, dh) or 1
    ux, uh = dx / L, dh / L
    line_px(f, (el[0] + ux * 6 - uh * 1.5, el[1] + uh * 6 + ux * 1.5), (hand[0] - ux * 8 - uh * 1.2, hand[1] - uh * 8 + ux * 1.2), m, 4, only=(m,))
    back = (el[0] - ux * 8, el[1] - uh * 8)
    side = (-uh, ux) if ux >= 0 else (uh, -ux)
    f.put(f.poly([(el[0] + side[0] * 6, el[1] + side[1] * 6), (back[0] - side[0] * 2, back[1] - side[1] * 2),
                  (el[0] - side[0] * 5, el[1] - side[1] * 5)]), gm, light=(1, -1), hi=1, mid=2, flat=4)
    f.put(f.ell(el[0], el[1], 6, 6), m, shade='ball', dcuts=(0.12, 0.5, 0.82))
    gauntlet(f, hand, (ux, uh), far)


def body(f, p, smear_im=None):
    """Ganzer Körper mit Schwert in Zeichenreihenfolge. Rückgabe Kronenmaske, Feuermaske der Klinge, Klinge, Spitze."""
    Pz = Pose(p)
    hN, hF = hands_of(p['grip'], p['ang'])
    behind = p.get('hinter', False)
    if behind: blade, fire, tip, _ = sword(f, p['grip'], p['ang'], glow=p.get('glut', 1))
    legs(f, Pz)
    torso(f, Pz)
    # Hände: die weiter vorn (+x) liegende gehört zum Arm der Seite +x; gleich weit: die untere
    hs = sorted([hN, hF], key=lambda q: (q[0], -q[1]))
    arms = []
    for s, hand in ((-1, hs[0]), (1, hs[1])):
        sh = Pz.T(s * SHX, 33)
        el = elbow(Pz, sh, hand, s)
        arms.append((s, sh, el, hand))
        upper_arm(f, sh, el)
    pauldron(f, Pz, -1)
    pauldron(f, Pz, 1)
    crown = head(f, Pz)
    if not behind: blade, fire, tip, _ = sword(f, p['grip'], p['ang'], glow=p.get('glut', 1))
    for s, sh, el, hand in arms: forearm(f, el, hand)
    return crown, fire, blade, tip


# ------------------------------------------------------------------------------------------- Bilder einer Pose
def new(): return GFig()


def mirror_into(dst, src, col):
    """Teilkarte von src an der Spalte col gespiegelt nach dst übernehmen (dst noch leer)."""
    Wd = dst.W
    for j in range(src.W):
        jj = 2 * col - j
        if 0 <= jj < Wd:
            dst.mat[:, jj] = src.mat[:, j]; dst.tone[:, jj] = src.tone[:, j]; dst.part[:, jj] = src.part[:, j]
    dst.np = src.np; dst.line = dict(src.line); dst.rim = dict(src.rim)


def back_img(p, ph):
    """Schwingen (beide Seiten, hinter den Schultern ausgebreitet) und Mantel."""
    q = dict(DEF, **p)
    Pz = Pose(q); f = new()
    rF, rB = Pz.T(10, 37), Pz.T(-10, 37)
    # Schwinge der Seite +x: als Schwinge nach -x gezeichnet und an ihrer Wurzel gespiegelt
    tmp = new()
    wing(tmp, rF, q['wo'], q['wd'] * 0.6, ph + 0.35)
    mirror_into(f, tmp, f.at(*rF)[0])
    wing(f, rB, q['wo'], q['wd'], ph)
    cape(f, Pz, ph)
    im = f.render(rim=None, rim_back=RIM_B)
    im[GROUND * K:] = 0
    return im


def crown_fl(cm, t, R):
    fl = flame(cm[0], t, FLA_N, R=R, up=0.3, rise=1.4)
    fl[cm[1] * K:] = 0
    return fl


def body_img(p):
    f = new()
    crown, fire, blade, tip = body(f, p)
    im = f.render(rim=RIM_F, rim_back=RIM_B)
    im[GROUND * K:] = 0
    fire[FY0 - 2:] = False; blade[FY0:] = False
    return im, crown, fire, blade, tip


def smear(p0, p1, n=200, hot=1.0):
    """Schwungsichel genau auf der Klingenbahn: die Klinge wird zwischen zwei Posen in kleinen Schritten mitgeführt
    (Griff und Winkel wie in den Bildern). Sichelform: in der Mitte der Bahn am dicksten, an beiden Enden spitz, eng an
    der Spitzenbahn. Drei harte Glutstufen: an der Schneide (außen) weißgelb, dann orange, innen dunkelrot; das alte Ende
    gerastert und zerfasert."""
    f = new()
    best = np.full((H, W), -1.0); rad = np.zeros((H, W))
    Y, X = np.mgrid[0:H, 0:W]
    for i in range(n + 1):
        t = i / n
        g = lerp(p0['grip'], p1['grip'], t); a = p0['ang'] + (p1['ang'] - p0['ang']) * t
        (ux, uh), sc = sword_geom(g, a)
        tu = (10 + LB) * sc
        thick = 0.17 * max(0.0, math.sin(math.pi * min(1.0, t))) ** 1.2
        u0 = tu * (1 - max(0.02, thick))
        A = (g[0] + ux * u0, g[1] + uh * u0); B = (g[0] + ux * (tu + 0.5), g[1] + uh * (tu + 0.5))
        m = f.seg(A, B, 1.2, 1.2) & (best < t)
        if not m.any(): continue
        uu = ((X[m] + 0.5 - f.FX - g[0]) * ux + (f.FY - Y[m] - 0.5 - g[1]) * uh)
        best[m] = t; rad[m] = np.clip((uu - u0) / max(1, tu - u0), 0, 1)
    out = np.zeros((H, W, 4), np.uint8)
    ys, xs = np.nonzero(best >= 0)
    for y, x in zip(ys, xs):
        t = best[y, x] * hot; r = rad[y, x]
        lv = 4 if r > 0.72 else 3 if r > 0.38 else 1
        if t < 0.55: lv = min(lv, 3)
        if t < 0.3: lv = min(lv, 2) if r > 0.5 else 0
        if t < 0.3 and ((x + y) % 2 or hash2(x, y, 9) < 0.35): continue
        if t < 0.15 and hash2(x, y, 4) < 0.5: continue
        out[y, x] = (*hexc(FLAME[lv]), 255)
    out[FY0:] = 0
    return out


def cracks(xi, k):
    """Risse und Glut im Boden an der Einschlagstelle (Figurraster), k = 0 frisch .. 3 abgekühlt."""
    out = np.zeros((H, W, 4), np.uint8)
    pal = [FLAME[4], FLAME[3], FLAME[2], FLAME[1]]
    rays = [(-1, 0.0, 16), (1, 0.0, 12), (-1, 0.35, 9), (1, 0.3, 7), (-1, 0.75, 6), (1, 0.7, 5)]
    for d, sl, L in rays:
        L = L + 2 * min(k, 2)
        for j in range(1, int(L)):
            x = int(round(xi + d * j)); y = FY0 - 1 + int(round(j * sl * 0.5 + (hash2(j, d, 3) > 0.6)))
            age = j / L
            lv = min(3, int(age * 3) + k)
            if 0 <= x < W and 0 <= y < H: out[y, x] = (*hexc(pal[lv] if lv < 4 else FLAME[0]), 255)
    for dx in range(-3, 4):
        x = xi + dx
        if 0 <= x < W: out[FY0 - 1, x] = (*hexc(pal[min(3, k + (abs(dx) > 1))]), 255)
    return out


def chunks(xi, k):
    """Gesteinsbrocken fliegen beim Einschlag (Nachbilder), dunkle Platten mit Glutkante."""
    out = np.zeros((H, W, 4), np.uint8)
    rocks = [(-9, 1, 3), (-16, 0.6, 2), (7, 1.2, 2), (13, 0.7, 3), (-4, 1.5, 2)]
    for vx, vy, s in rocks:
        x = int(round(xi + vx * (k + 1) * 0.8)); y = int(round(FY0 - 2 - vy * 9 * (k + 1) + 3 * (k + 1) ** 2))
        for dy in range(s):
            for dx in range(s):
                X, Y = x + dx, y + dy
                if 0 <= X < W and 0 <= Y < FY0: out[Y, X] = (*hexc('#2a1a21' if dy else '#c8420c'), 255)
    return out


# ------------------------------------------------------------------------------------------- Posen
POSEN = {
    # frontal: Griffhöhe und -lage in Figurkoordinaten; hinter = Klinge hinter Kopf und Rumpf (Ausholen über die Schulter)
    'ruhe': dict(grip=(0, 86), ang=-450, wo=0.3),
    'zug': dict(grip=(0, 100), ang=-456, crouch=2, wo=0.2, rock=-1),
    'h1': dict(grip=(-12, 122), ang=-120, crouch=3, lean=-4, wo=0.4, wehen=3, rock=-1),
    'h2': dict(grip=(-18, 140), ang=-138, crouch=4, lean=-7, wo=0.75, wehen=6, rock=-2, hinter=True),
    'aus': dict(grip=(-20, 148), ang=-150, crouch=6, lean=-9, wo=1.0, wehen=8, rock=-2, glut=1, hinter=True),
    'hieb1': dict(grip=(16, 155), ang=-256, crouch=3, lean=2, wo=0.75, wd=0.2, wehen=8, fN=22, hipx=2),
    'hieb2': dict(grip=(46, 98), ang=-332, crouch=8, lean=12, wo=0.35, wd=0.55, wehen=6, vor=2, fN=28, hipx=5, rock=2),
    'ein': dict(grip=(56, 58), ang=-410, crouch=17, lean=22, wo=0.2, wd=0.9, wehen=12, fN=32, fF=-20, hipx=9, rock=4, head=1),
    'nach1': dict(grip=(56, 56), ang=-410.5, crouch=21, lean=25, wo=0.15, wd=1.0, wehen=16, fN=32, fF=-20, hipx=9, rock=5, head=1),
    'nach2': dict(grip=(56, 58), ang=-410, crouch=15, lean=20, wo=0.3, wd=0.6, wehen=9, fN=32, fF=-20, hipx=9, rock=3, head=1),
    'nach3': dict(grip=(56, 58), ang=-410, crouch=17, lean=22, wo=0.22, wd=0.75, wehen=5, fN=32, fF=-20, hipx=9, rock=2, head=1),
    'zieh': dict(grip=(40, 78), ang=-424, crouch=9, lean=12, wo=0.15, wd=0.3, vor=2, fN=26, fF=-19, hipx=5, rock=1),
    'auf': dict(grip=(16, 84), ang=-440, crouch=3, lean=4, wo=0.15, fN=20, hipx=2),
}

def mischpose(a, b, k):
    """Zwischenpose: Zahlenwerte von a nach b (Anteil k), Tupel je Achse, Rest von b."""
    q = dict(b)
    for key in set(a) | set(b):
        va, vb = a.get(key, DEF.get(key, 0)), b.get(key, DEF.get(key, 0))
        if isinstance(vb, tuple): q[key] = tuple(round(x + (y - x) * k, 1) for x, y in zip(va, vb))
        elif isinstance(vb, (int, float)) and isinstance(va, (int, float)):
            q[key] = va + (vb - va) * k
            if isinstance(va, int) and isinstance(vb, int): q[key] = int(round(q[key]))
    return q


# Zwischenbilder beim Aufrichten nach dem Einschlag (aus der Hocke über halbe Stufen in den Stand)
POSEN['zieh0'] = mischpose(POSEN['nach3'], POSEN['zieh'], 0.5)
POSEN['auf0'] = mischpose(POSEN['zieh'], POSEN['auf'], 0.5)
POSEN['auf1'] = mischpose(POSEN['auf'], POSEN['ruhe'], 0.5)


# (Pose, ms, Art): 'gross' = Klingenflammen groß, 'bogen' = Schwungsichel von der vorigen Pose, 'hit' = Einschlag
MOMENT = [('zug', 130, None), ('h1', 110, None), ('h2', 110, None), ('aus', 560, 'gross'), ('hieb1', 60, 'bogen'),
          ('hieb2', 50, 'bogen'), ('ein', 60, 'hit'), ('ein', 70, 'halt'), ('nach1', 90, 'nach'), ('nach2', 110, 'nach'), ('nach3', 420, 'nach'),
          ('zieh0', 110, None), ('zieh', 130, None), ('auf0', 110, None),
          ('auf', 130, None), ('auf1', 120, None)]


# ------------------------------------------------------------------------------------------- Saal des Aschethrons
# ------------------------------------------------------------------------------------------- Saal des Aschethrons
BX = 352            # Fußpunkt des Bosses in der Szene (x)
SUN = (370, 66, 54)  # Glutsonne hinter dem Thron: Mitte, Radius
OBSI = ['#07040a', '#0e0912', '#140c17', '#1b111d', '#251624']
FLOORC = ['#07040a', '#120b11', '#1a1017', '#23151d', '#2f1c22']
EMB = MAT['emb']


def sheen(img, seam, cx, w, y0, y1):
    """Spiegelung der Glutsonne im polierten Obsidian: Platten nahe cx eine Stufe wärmer, Rand gerastert."""
    o = PAD if img.shape[1] == SWX else 0
    for y in range(y0, y1):
        for x in range(max(-o, int(cx - 2 * w)), min(SW + o, int(cx + 2 * w))):
            if seam[y, x + o] or img[y, x + o, 3] == 0: continue
            k = 1 - abs(x - cx) / w - (y - y0) / (y1 - y0) * 0.35
            if k <= 0: continue
            lv = 2 if k > 0.55 else 1
            if k < 0.25 and BAYER4[y % 4, x % 4] > k * 4: continue
            r, g, b, _ = img[y, x + o]
            img[y, x + o, :3] = (min(255, r + 18 * lv), min(255, g + 6 * lv), min(255, b + 2 * lv))


def scene():
    L = {}
    # ---- Ferne: Rückwand, Friese, Glutsonne, Thron (Tiefe 0,15)
    # Arrays SWX breit (Spalte = Szenen-x + PAD), damit breite Bühnen links und rechts weiter Halle zeigen
    F = bands(SH, SWX, 0, 150, ['#030106', '#07030a', '#0b050e', '#110710', '#170a12'])
    wall = bricks(0, 26, SW + PAD, 168, 22, 9, OBSI, seed=4, ox=-PAD, w=SWX)
    wall2 = bricks(-22 * 7, 26, 0, 168, 22, 9, OBSI, seed=4, ox=-PAD, w=SWX)
    stamp(F, wall); stamp(F, wall2)
    G = np.zeros((SH, SWX, 4), np.uint8)
    def frieze(y, h, col=('#2a1408', '#5a3010', '#8a4a18')):
        F[y:y + h, :] = (*hexc('#0a0508'), 255)
        F[y, :] = (*hexc(col[2]), 255); F[y + h - 1, :] = (*hexc(col[0]), 255)
        for x in range(SWX):           # Mäander
            u = (x - PAD) % 8
            pat = [(1, 1, 1, 1, 1, 0, 0, 0), (1, 0, 0, 0, 1, 0, 1, 1), (1, 0, 1, 1, 1, 0, 1, 0), (1, 0, 0, 0, 0, 0, 1, 0)]
            for j in range(min(4, h - 3)):
                if pat[j][u]: F[y + 2 + j, x] = (*hexc(col[1]), 255)
    frieze(24, 8); frieze(150, 7)
    # Glutsonne: Ringe in harten Stufen, Strahlen
    cx, cy, R = SUN
    Y, X = np.mgrid[0:SH, 0:SWX]; X = X - PAD
    d = np.hypot(X + 0.5 - cx, (Y + 0.5 - cy) * 1.0)
    SUNC = ['#2a0a06', '#4a1008', '#7a1e08', '#b8380c', '#e86418', '#ffa040', '#ffd890']
    dd = d / R                      # ohne Raster: harte Ringkanten
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
    T = Buf(w=SWX)
    tx = cx - 2 + PAD                 # Thron in Spalten
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
    L['fern-glut'] = dict(img=G, f=0.15)          # deckend, ohne Pulsieren (kein Überblenden, harte Stufen)
    # ---- Mitte: Säulen, Banner, Feuerschalen, hinterer Boden (Tiefe 0,45)
    M = np.zeros((SH, SWX, 4), np.uint8); MG = np.zeros((SH, SWX, 4), np.uint8)
    back_floor, bseam, _ = floor(168, SH, [3, 3, 4, 4, 5, 5, 6, 7, 8, 9], FLOORC, vx=cx, vy=40, tile=30, seed=7, w=SWX, ox=-PAD)
    sheen(back_floor, bseam, cx, 46, 168, 190)
    stamp(M, back_floor)
    # Glut vom Thron auf dem hinteren Boden: Fugen nahe der Mitte glimmen
    for y, x in zip(*np.nonzero(bseam)):
        dx = abs(x - PAD - cx)
        if dx < 120 and y > 172:
            M[y, x] = (*hexc('#3a1208' if dx > 60 else '#5a1a0c'), 255)
            if dx < 60 and chk(x, y): MG[y, x] = (*hexc(EMB[1]), 255)
    PIL = ['#06030a', '#0f0913', '#19101c', '#241626', '#33202e']
    def column(x0, w, top=0, bot=172):
        x0 += PAD
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
    for x0 in (-116, 28, 172, 488, 632):
        column(x0, 24)
    # Banner: karmin, Goldsaum, Krone, unten geschlitzt
    BAN = ['#1e070c', '#3c0d15', '#5e141d', '#851f25', '#ae3330']
    def banner(x0, w=20, top=38, L=74, seed=1):
        x0 += PAD
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
    for x0, s in ((-40, 4), (96, 1), (232, 2), (528, 3), (664, 5)):
        banner(x0, seed=s)
    # Feuerschalen auf Dreifüßen: Schale in Mitte, Flamme als eigene Bildfolge
    braziers = []
    for bx_, by_ in ((78, 150), (444, 150)):
        for k in range(18):
            y = by_ + 4 + k
            for dx in (-6 + k // 3, 6 - k // 3, 0):
                M[y, bx_ + dx + PAD] = (*hexc('#5a3010' if dx else '#2a1408'), 255)
        for dx in range(-6, 7):
            for dy in range(0, 5):
                if abs(dx) <= 6 - dy:
                    M[by_ + dy, bx_ + dx + PAD] = (*hexc(['#c4752a', '#8a4a18', '#5a3010', '#2a1408', '#2a1408'][dy]), 255)
        for dx in range(-5, 6): MG[by_ - 1, bx_ + dx + PAD] = (*hexc(EMB[3] if abs(dx) < 3 else EMB[2]), 255)
        braziers.append((bx_, by_))
    L['mitte'] = dict(img=M, f=0.45)
    L['mitte-glut'] = dict(img=MG, f=0.45, glow=dict(per=4.1, lo=0.66, steps=3))
    # ---- Boden: Thronpodest vorn (Tiefe 1): große Platten, Glutfugen nahe dem Boss
    Bd, seam, _ = floor(FY - 4, SH, [4, 5, 6, 7, 9, 11], ['#07040a', '#150d13', '#1f141a', '#2a1a21', '#3a2428'], vx=BX - 30, vy=-40, tile=34, seed=11, w=SWX, ox=-PAD)
    sheen(Bd, seam, SUN[0], 40, FY - 4, SH)
    # Kante oben vom Thron angestrahlt
    for x in range(SWX):
        Bd[FY - 4, x] = (*hexc('#4a2a22' if hash2(x - PAD, 1, 2) > 0.2 else '#33201e'), 255)
    BG = np.zeros((SH, SWX, 4), np.uint8)
    for y, x in zip(*np.nonzero(seam)):
        if y == FY - 4: continue
        far = abs(x - PAD - BX) / 90 + (y - FY) / 30
        lv = 0 if far < 0.5 else 1 if far < 1.3 else 2
        deep = y > FY + 18
        Bd[y, x] = (*hexc('#3a1410' if lv == 2 or deep else EMB[1]), 255)
        if lv < 2 and not deep: BG[y, x] = (*hexc(EMB[3] if lv == 0 else EMB[2]), 255)
    # Schatten des Bosses (feste Stufen)
    for dy, hw, k in [(-3, 30, 0.6), (-2, 40, 0.55), (-1, 44, 0.55), (0, 40, 0.6), (1, 30, 0.7)]:
        y = FY + dy
        for x in range(BX - hw + PAD, BX + hw + PAD):
            r, g, b_, a = Bd[y, x]
            if a: Bd[y, x] = (int(r * k), int(g * k), int(b_ * k), a)
            BG[y, x] = 0
    L['boden'] = dict(img=Bd, f=1.0)
    L['boden-glut'] = dict(img=BG, f=1.0, glow=dict(per=3.4, lo=0.6, steps=3))
    # ---- Vordergrund (Tiefe 1,35): Säulentrümmer links, Kette rechts oben, Schattenriss mit Glutkante
    V = Buf(w=SWX)
    vm = V.poly([(x + PAD, y) for x, y in [(-PAD - 4, SH), (-PAD - 4, 194), (-134, 190), (-112, 187), (-96, 191), (-74, 184), (-52, 181),
                                           (-38, 176), (-24, 179), (-10, 176), (4, 172), (10, 178), (18, 174), (26, 184), (34, 192), (44, 200), (50, SH)]])
    V.a[vm] = (*hexc('#07040a'), 255)
    e = outline_mask(~vm) & vm
    top_e = e & ~np.roll(vm, 1, axis=0)
    V.a[top_e] = (*hexc('#3a1a14'), 255)
    for y, x in zip(*np.nonzero(top_e)):
        if hash2(x, y, 9) < 0.25: V.a[y, x] = (*hexc('#7a2a10'), 255)
    # Kette
    for cx_, L_, ph_ in ((536, 64, 0.0), (-92, 48, 1.7)):
        for k in range(L_):
            y = k; x = cx_ + PAD + int(round(2 * math.sin(k / 9 + ph_)))
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
        e = dict(name=n, img=d['img'][y0:y1, x0:x1], x=int(x0) - (PAD if d['img'].shape[1] == SWX else 0), y=int(y0), f=d['f'])
        if 'glow' in d: e['glow'] = d['glow']
        if n.endswith('-glut'): e['poster'] = True
        out.append(e)
    return out



def impact_star(pal=FLAME, w=41, h=34):
    """Einschlag: Lichtkreuz, dann aufreißender Glutbogen und zerfallender Kranz (5 Bilder, Fußpunkt unten Mitte)."""
    out = []
    cx, cy = w // 2, h - 3
    for k in range(5):
        im = np.zeros((h, w, 4), np.uint8)
        def put(x, y, lv):
            x, y = int(round(cx + x)), int(round(cy + y))
            if 0 <= x < w and 0 <= y < h and lv >= 0: im[y, x] = (*hexc(pal[lv]), 255)
        if k == 0:
            for i in range(-18, 19): put(i, 0, 4 if abs(i) < 6 else 3 if abs(i) < 12 else 2)
            for i in range(-12, 13): put(i, -1, 4 if abs(i) < 4 else 3 if abs(i) < 8 else 2)
            for j in range(1, 28): put(0, -j, 4 if j < 10 else 3 if j < 18 else 2); put(1 if j < 14 else 0, -j, 4 if j < 6 else 3)
            for j in range(1, 10): put(j, -j, 3 if j < 5 else 2); put(-j, -j, 3 if j < 5 else 2)
            for x in range(-3, 4):
                for y in range(-3, 1): put(x, y, 4)
        else:
            r = (6, 10, 14, 17)[k - 1]
            nn = int(math.pi * r * 1.8)
            for i in range(nn + 1):
                a = math.pi * i / nn
                if k >= 3 and (i // 2) % 2: continue
                put(r * math.cos(a), -r * math.sin(a) * 0.75, (4, 3, 2, 1)[k - 1])
                if k < 3: put((r - 1) * math.cos(a), -(r - 1) * math.sin(a) * 0.75, (3, 2, 1)[k - 1])
            for j in range(k + 2): put(-j * 3 - 4, 0, max(0, 3 - k)); put(j * 3 + 4, 0, max(0, 3 - k))
        out.append(im)
    return out


def bush(w, h, t, tongues, k=K):
    """Buschige Flammenwand: mehrere Zungen nebeneinander (x-Mitte, Breite, Höhe als Anteil, Saat), harte Stufen.
    Im Feinraster (k·h × k·w)."""
    out = np.zeros((h * k, w * k, 4), np.uint8)
    order = sorted(tongues, key=lambda q: q[2])
    for cx, ww, hh, sd in order:
        tw, th = max(6, int(w * ww)), max(8, int(h * hh))
        im = feuer(tw, th, (t + sd) % 6, 6, seed=sd, hw=0.46, lick=1.15, core=0.55, k=k)
        x0 = int(round(cx * w - tw / 2)) * k; y0 = (h - th) * k
        sub = out[y0:y0 + th * k, max(0, x0):x0 + tw * k]
        src = im[:, max(0, -x0):max(0, -x0) + sub.shape[1]]
        msk = src[:, :, 3] > 0
        # hellere Stufe gewinnt (Kern über Rand), damit sich die Zungen zu einer Wand verbinden
        lum = src[:, :, :3].astype(int).sum(-1); old = sub[:, :, :3].astype(int).sum(-1)
        msk &= (sub[:, :, 3] == 0) | (lum > old)
        sub[msk] = src[msk]
    return out


# ------------------------------------------------------------------------------------------- Bauen
UMH_N, UMH_MS = 8, 170
FLA_N, FLA_MS = 6, 100
ATEM = [0, 0, 0, 1, 1, 2, 2, 2, 1, 1]
ATEM_MS = 210


def build():
    R = POSEN['ruhe']
    # ---- Ruhe in Ebenen: hinten (Schwingen atmen, Mantel weht), Körper (Atem, mit Schwert), Kronenflammen, Klingenflammen
    backs = [back_img(dict(R, wo=R['wo'] + 0.05 * math.sin(i / UMH_N * 2 * math.pi)), i / UMH_N) for i in range(UMH_N)]
    bodies, crowns, krone_dy = [], [], []
    for br in (0, 1, 2):
        im, cm, fire, blade, _ = body_img(dict(R, breath=br))
        bodies.append(im)
        top = np.nonzero(cm[0])[0].min()
        if br == 0:
            top0 = top
            crowns = [crown_fl(cm, i, 3.0) for i in range(FLA_N)]
            fire0 = fire
        krone_dy.append(int(top - top0))
    flammen = [flame(fire0, i, FLA_N, R=4.4) for i in range(FLA_N)]
    # ---- Moment: ganze Bilder
    frames, seq, hit, imp_x = [], [], 0, 0
    prev, tms = R, 0
    for pn, ms, art in MOMENT:
        p = POSEN[pn]
        n = max(1, round(ms / 80)) if art in ('gross',) else 3 if pn == 'nach3' else 1
        for k in range(n):
            q = dict(p)
            if art == 'gross': q['breath'] = k % 2          # gespanntes Zittern beim Halten
            if pn == 'nach3': q['breath'] = (0, 1, 1)[k]
            ph = (tms // UMH_MS) % UMH_N / UMH_N
            bk = back_img(q, ph)
            bd, cm, fire, blade, tip = body_img(q)
            im = bk
            # beim Hieb über den Kopf keine Sichel: die Klinge ist dort verkürzt, die Bahn läge als flaches Band oben
            if art == 'hit': im = over(im, smear(POSEN['hieb2'], p, hot=0.8))
            im = over(im, bd)
            im = over(im, crown_fl(cm, len(frames) % FLA_N, 4.0 if art in ('gross', 'hit') else 3.0))
            if art not in ('bogen',) and pn != 'zug':
                fl = flame(fire, len(frames) % FLA_N, FLA_N, R=5.0 if art == 'gross' else 3.6 if art == 'nach' else 4.4)
                im = over(im, fl)
            if art == 'hit':
                hit = len(frames)
                xs = np.nonzero(blade[FY0 - 1])[0]
                imp_x = int(round(xs.mean()))
            if art in ('hit', 'halt', 'nach') or pn == 'zieh':
                kk = {'ein': 0 if art == 'hit' else 1, 'nach1': 1, 'nach2': 2, 'nach3': 3, 'zieh': 3}[pn]
                im = over(im, cracks(imp_x, min(3, kk)))
                if pn in ('nach1', 'nach2'): im = over(im, chunks(imp_x, kk - 1))
            im[:(FY0 - 168) * K] = 0            # Schutz: nichts über 170 px (Szene y >= 20)
            frames.append(im); seq.append(round(ms / n)); tms += round(ms / n)
        prev = p
    uniq, idx = dedupe(frames)
    # ---- gemeinsamer Rahmen, gespiegelt (Blick nach links)
    allims = backs + bodies + crowns + flammen + uniq
    c0, r0, c1, r1 = kcrop(*common_crop(allims))
    cut = lambda im: flip(im[r0:r1, c0:c1])
    x0, y0, x1, y1 = c0 // K, r0 // K, c1 // K, r1 // K          # Szenenpixel
    fw, fh_ = x1 - x0, y1 - y0
    fx = (x1 - 1) - FX
    fy = FY0 - y0
    sheets = {'hinten': strip([cut(i) for i in backs]), 'koerper': strip([cut(i) for i in bodies]),
              'krone': strip([cut(i) for i in crowns]), 'flamme': strip([cut(i) for i in flammen]),
              'moment': strip([cut(i) for i in uniq])}
    FXs, FYs = BX - fx, FY - fy
    imp_scene = int(FXs + (x1 - 1 - imp_x))
    poster = over(over(over(cut(backs[0]), cut(bodies[0])), cut(crowns[0])), cut(flammen[0]))
    # ---- Szene
    Ld, seam, braziers = scene()
    layers = layer_list(Ld, ['fern', 'fern-glut', 'mitte', 'mitte-glut', 'boden', 'boden-glut', 'vorn'])
    # ---- Effekte: Fugenwelle, Feuerwand (halbe Bühnenhöhe) durch die ganze Halle, Einschlagstern, Feuerschalen
    wave, wmeta = seam_wave(seam, imp_scene, FY - 3, v=300, ms=60, pal=FLAME, direction=-1, maxd=420, ox=-PAD,
                            peak=lambda d: 4 if d < 60 else 3 if d < 180 else 2)
    fx_ = {'welle': wave}
    WW, WH, W2, H2, W3, H3 = 74, 100, 40, 58, 18, 28
    fx_['wand'] = strip([bush(WW, WH, i, [(0.5, 0.62, 1.0, 1), (0.24, 0.42, 0.72, 4), (0.76, 0.44, 0.8, 7), (0.1, 0.24, 0.45, 9), (0.9, 0.26, 0.5, 11)]) for i in range(6)])
    fx_['wand2'] = strip([bush(W2, H2, i, [(0.5, 0.7, 1.0, 2), (0.22, 0.5, 0.7, 5), (0.8, 0.5, 0.78, 8)]) for i in range(6)])
    fx_['wand3'] = strip([feuer(W3, H3, i, 6, seed=3, k=K) for i in range(6)])
    fx_['schale'] = strip([feuer(16, 20, i, 6, seed=5, hw=0.38, k=K) for i in range(6)])
    fx_['blitz'] = strip(impact_star())
    sch = [[int(x - 8), int(y - 19)] for x, y in braziers]
    FUNKEN = ['#fff2c0', '#ffb648', '#e8641a', '#a8300a']
    STAUB = ['#6a5040', '#4e3a30', '#3a2a24']
    meta = {
        'name': 'malgareth', 'glut': ['#fff2c0', '#ffb648', '#c8420c'],
        'fokus': [300, BX - 62],
        'fig': {'x': int(FXs), 'y': int(FYs), 'w': int(fw), 'h': int(fh_)},
        'ruhe': [dict(r='hinten', n=UMH_N, ms=UMH_MS), dict(r='koerper', seq=ATEM, ms=ATEM_MS),
                 dict(r='krone', n=FLA_N, ms=FLA_MS, dy=krone_dy, von='koerper'), dict(r='flamme', n=FLA_N, ms=FLA_MS)],
        'moment': {'f': [[i, m] for i, m in zip(idx, seq)], 'hit': hit},
        'stopp': 80,
        'beben': [[0, 3], [2, -2], [-1, 1], [1, 0]],
        'warn': {'x0': 8, 'x1': int(imp_scene) - 6, 'y': FY - 3, 'h': 7, 'dir': -1, 'vor': 760, 'c': ['#7a1a08', '#c8420c', '#ffb648']},
        'ereignisse': [
            dict(k='bild', r='welle', at=0, x=wmeta['x'], y=wmeta['y'], w=wmeta['w'], h=wmeta['h'], n=wmeta['n'], ms=wmeta['ms'], z='boden'),
            dict(k='bild', r='blitz', at=0, x=int(imp_scene) - 20, y=FY - 31, w=41, h=34, n=5, ms=60, quer=True, z='vorn'),
            dict(k='wand', r='wand', r2='wand2', r3='wand3', at=30, x=int(imp_scene) - 4, y=FY + 3, dir=-1, v=300,
                 weg=int(imp_scene) + WW + 8, w=WW, h=WH, w2=W2, h2=H2, w3=W3, h3=H3, n=6, ms=70, abst=8, nach=680, z='vorn'),
            dict(k='funken', at=0, x=int(imp_scene), y=FY - 2, n=34, r=5, vx=60, vy=140, g=300, c=FUNKEN),
            dict(k='funken', at=0, x=int(imp_scene), y=FY - 1, n=20, r=9, vx=40, vy=50, g=80, c=STAUB),
        ],
        'schalen': sch, 'schale': {'w': 16, 'h': 20, 'n': 6, 'ms': 90}, 'schaleNach': 'mitte-glut',
        'teilchen': 'asche', 'dichte': 2.2,
        'nach': 'boden-glut',
        'dauer': 9.5, 'start': 2.4,
    }
    return {'layers': layers, 'figure': {'sheets': sheets, 'meta': {'fx': int(fx), 'fy': int(fy)}, 'poster': poster, 'x': int(FXs), 'y': int(FYs)},
            'fx': fx_, 'fein': {'wand', 'wand2', 'wand3', 'schale'}, 'meta': meta, 'figure_after': 'boden-glut',
            'previews': {'moment': sheets['moment']}}
