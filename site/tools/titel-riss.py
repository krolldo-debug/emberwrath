# Titelbild der Startseite „Der Himmel reißt auf“, Teil 2 (aufgerufen von titel-riss.mjs): Ebenen, Bildfolgen, Standbild.
# Nacht über der Glutöde, ein Lavastrom fließt zum Aschethron; darüber reißt der Himmel auf und zeigt die Inseln der
# Sternenglut im Morgenlicht. Die vier Klassen (echte Spielfiguren, Feinraster) stehen auf einer Felsnase und blicken hinüber.
# Komposition in Szenenpixeln (640 × 272), jede Ebene ganzzahlig ×Q in Feinpixeln; die Helden 1:1 im Feinraster.
# Harte Rampen, Bayer-Raster, keine Alpha-Verläufe. Ergebnis (verlustfrei, WebP) nach IMG, META als JSON auf stdout.
#   python3 titel-riss.py TMP IMG     (TMP enthält helden.png/helden.json von titel-riss.mjs)
import sys, os, json
import numpy as np
from PIL import Image
from titel_kit import *

TMP, IMG = sys.argv[1], sys.argv[2]
Q, W, H, HOR = 2, 640, 272, 164
yy, xx = np.mgrid[0:H, 0:W]
gb = bay(H, W)
NR = 8          # Bilder des Risses
NL = 4          # Bilder des Lavastroms


class Layer:
    """Ebene in Szenenpixeln mit Deckmaske (hart)."""
    def __init__(self, fill=None):
        self.c = np.zeros((H, W, 3), np.uint8); self.m = np.zeros((H, W), bool)
        if fill is not None: self.c[:] = fill; self.m[:] = True

    def put(self, mask, col):
        self.c[mask] = col if np.ndim(col) == 1 else col[mask]; self.m |= mask

    def rgba(self):
        a = np.dstack([self.c, (self.m * 255).astype(np.uint8)])
        return np.repeat(np.repeat(a, Q, 0), Q, 1)


def webp(arr, name):
    p = os.path.join(IMG, name + '.webp')
    Image.fromarray(arr).save(p, lossless=True, method=6)
    return name + '.webp', os.path.getsize(p)


# ============================================================ 1. Himmel mit Aschewolken (still)
S = Scene(W, H)
sky(S, ramp('#040209', '#07030d', '#0b0513', '#10071a', '#170920', '#200b20', '#2e0e1c', '#421318', '#5a1a12', '#742410'), 0, HOR + 4)
S.c[HOR + 4:] = hexc('#742410')
for sd, yc, th, cols in [(31, 40, 0.56, ('#0a050e', '#100710', '#170a14')), (32, 95, 0.54, ('#120812', '#1c0c16', '#2a1018')), (33, 140, 0.55, ('#1e0c14', '#2c1016', '#3e1614'))]:
    cl = fbm(xx / 150 + yy / 300, (yy - yc) / 14, sd, 5) - np.abs(yy - yc) / 55
    cm = (cl > th - 0.25) & (yy < HOR)
    S.c[cm] = quant(np.clip((cl - th + 0.25) * 4, 0, 1), ramp(*cols))[cm]
    S.c[cm & ~np.roll(cm, -1, 0)] = hexc('#5a1c10') if yc > 60 else hexc('#2a0e14')
stars(S, (yy < 70) & (S.c.sum(2) < 60), 0.004, 3, [hexc('#5a4a6a'), hexc('#8a7aa0')])
HIMMEL = Layer(); HIMMEL.c = S.c.copy(); HIMMEL.m[:] = True

# ============================================================ 2. Der Riss (Bildfolge)
P0, P1 = np.array([388.0, -6.0]), np.array([560.0, 124.0])
dv = P1 - P0; Lr = np.hypot(*dv); u = dv / Lr; nrm = np.array([-u[1], u[0]])
rx, ry = xx - P0[0], yy - P0[1]
along = (rx * u[0] + ry * u[1]) / Lr
bend = 26 * np.sin(np.clip(along, 0, 1) * np.pi) * 0.6
across = rx * nrm[0] + ry * nrm[1] - bend
env = np.sin(np.clip(along, 0, 1) * np.pi) ** 0.9
jagL = (fbm(along * 16, 0.3, 77, 4) - 0.5) * 22 + (hash2(np.floor(along * 140), 3, 79) - 0.5) * 5
jagR = (fbm(along * 16, 2.3, 78, 4) - 0.5) * 22 + (hash2(np.floor(along * 140), 4, 80) - 0.5) * 5
wL, wR = 30 * env + jagL * env, 30 * env + jagR * env
inside = (along > 0) & (along < 1) & (across > -wL) & (across < wR)
dist = np.where(across < 0, -wL - across, across - wR)
DAWN = ramp('#160f38', '#221852', '#33246a', '#4a3280', '#6c428e', '#965296', '#c06890', '#e08a86', '#f4ae8c', '#ffd2a6')
GRASS = ramp('#2e5a50', '#467a64', '#6aa47c', '#a8d8a0')
CLIFF = ramp('#2a1e4a', '#3a2a5e', '#4e3a74', '#6a5090')
KEEL = ramp('#160f30', '#1e1640', '#2a1e50')
ISLES = [(462, 70, 40, 22, 1, 0.0), (520, 100, 22, 12, 2, 2.1), (420, 34, 18, 9, 3, 4.0), (492, 46, 10, 6, 4, 1.0)]
rng = np.random.default_rng(7)
SPL = [(0.08 + 0.84 * rng.random(), rng.choice([-1, 1]), 4 + rng.random() * 8, 1 + int(rng.random() * 3), rng.random() * 6.28) for _ in range(14)]
CRK = []
for k in range(10):
    a0 = 0.12 + 0.76 * rng.random(); side = 1 if rng.random() < 0.5 else -1
    p = P0 + dv * a0 + nrm * (side * (30 * math.sin(a0 * math.pi) ** 0.9 + 2) + 26 * math.sin(a0 * math.pi) * 0.6)
    ang = math.atan2(nrm[1] * side, nrm[0] * side) + rng.normal(0, 0.6); pts = []
    for s in range(int(8 + rng.random() * 22)):
        pts.append((int(round(p[0])), int(round(p[1])))); ang += rng.normal(0, 0.4); p = p + np.array([math.cos(ang), math.sin(ang)])
    CRK.append((pts, rng.random() * 6.28))


def riss(f):
    ph = 2 * math.pi * f / NR
    L = Layer()
    # Innen: anderer Himmel, Morgenwolken ziehen (1 Szenenpixel je Bild nach rechts, Muster wiederholt sich nach NR)
    L.put(inside, quant(np.clip(yy / 150, 0, 1), DAWN))
    mc = fbm(((xx - f) % 640) / 40, yy / 8, 61, 3)
    L.put(inside & (mc > 0.6) & (yy > 50), quant(np.clip(yy / 150 + 0.12, 0, 1), DAWN))
    tw = hash2(xx, yy, 5); tk = hash2(xx, yy, 6 + f // 2)
    st = inside & (yy < 80) & (tw < 0.014)
    L.c[st] = np.where((tk[st] < 0.5)[:, None], hexc('#c8b8ff'), hexc('#fff6e0')); L.c[st & (tk < 0.1)] = hexc('#ffffff')
    # Inseln schweben (±1 Szenenpixel, eigene Phase)
    tmp = Scene(W, H); tmp.c = L.c.copy()
    for cx, top, w_, dep, sd, p in ISLES:
        dy = int(round(math.sin(ph + p)))
        island(tmp, cx, top + dy, w_, dep, sd, GRASS, CLIFF, KEEL)
    oy = int(round(math.sin(ph)))
    for (x, y) in [(452, 66 + oy), (470, 68 + oy)]:
        tmp.c[y - 3:y, x] = hexc('#a8e8ff'); tmp.c[y - 4, x] = hexc('#ffffff' if f % 4 < 2 else '#d8f4ff')
    tmp.c[52 + oy:68 + oy, 464:466] = hexc('#3a2a5e'); tmp.c[49 + oy:52 + oy, 464:466] = hexc('#ffe8b0' if f % 2 else '#fff8e0')
    L.c[inside] = tmp.c[inside]
    # Kante in harten Bändern; der weiße Kern atmet (Bild 0 = voll)
    pulse = math.cos(ph)
    core = 1.2 + 0.5 * pulse
    for lo, hi, c in [(-1.2 - core, -1.2, '#a070ff'), (-1.2, 0.0, '#f6e8ff'), (0.0, 1.0, '#7a3ad0'), (1.0, 2.4, '#3a1470')]:
        L.put((along > 0.005) & (along < 0.995) & (dist >= lo) & (dist < hi), hexc(c))
    for lo, hi, k, c in [(2.4, 7, 0.45 + 0.12 * pulse, '#2a0e4a'), (7, 14, 0.24 + 0.08 * pulse, '#1e0a30')]:
        L.put((dist >= lo) & (dist < hi) & (along > 0.02) & (along < 0.98) & (gb < k), hexc(c))
    # Splitter kreisen langsam am Rand
    for a, side, off, sz, p in SPL:
        e = math.sin(a * math.pi) ** 0.9 * 30
        o = side * (e + off + 1.5 * math.sin(ph + p)) + 26 * math.sin(a * math.pi) * 0.6
        cx, cy = P0 + dv * (a + 0.006 * math.cos(ph + p)) + nrm * o
        for oy_ in range(-sz, sz + 1):
            for ox_ in range(-sz, sz + 1):
                X, Y = int(cx + ox_), int(cy + oy_)
                if abs(ox_) + abs(oy_) <= sz and 0 <= Y < H and 0 <= X < W:
                    L.c[Y, X] = hexc('#c8a0ff') if abs(ox_) + abs(oy_) == sz else hexc('#4a3080'); L.m[Y, X] = True
    # Haarrisse flackern
    for pts, p in CRK:
        hot = math.cos(ph * 2 + p) > 0.3
        for s, (x, y) in enumerate(pts):
            if 0 <= x < W and 0 <= y < HOR:
                L.c[y, x] = hexc('#c090ff') if (hot and s < 4) else (hexc('#9a60e8') if s < 6 else hexc('#4a2088')); L.m[y, x] = True
    return L


RISS = [riss(f) for f in range(NR)]
um = np.zeros((H, W), bool)
for L in RISS: um |= L.m
ys, xs = np.nonzero(um)
RB = [int(xs.min()) - 1, int(max(0, ys.min())), int(xs.max()) + 2, int(ys.max()) + 2]   # Rahmen in Szenenpixeln

# ============================================================ 3. Ferne: Bergketten und Aschethron (still + Glut)
F = Layer(); FG = Layer()
S = Scene(W, H); S.c[:] = 0
far1 = ridge(S, HOR - 1, 16, 70, 11, hexc('#0e0710'))
far0 = np.round(HOR - 1 - 7 * line1d(W, 12, 30, 4)).astype(int)
F.put(yy >= far1[None, :], hexc('#0e0710'))
F.put(yy >= far0[None, :], hexc('#170a14'))
for x in range(W):
    if abs(x - 476) < 190 and far1[x] < far0[x]: F.c[far1[x], x] = hexc('#3a1a52')
TX, TB = 476, HOR + 1
TH = hexc('#07030a')
def rect(L, x0, y0, x1, y1, c=TH): L.put((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1), c)
rect(F, TX - 30, TB - 16, TX + 32, TB + 6); rect(F, TX - 20, TB - 24, TX + 22, TB)
for ox, h_, w_ in [(-28, 30, 4), (-19, 40, 5), (-11, 50, 4), (-4, 70, 9), (9, 54, 4), (16, 42, 5), (25, 32, 4)]:
    rect(F, TX + ox, TB - h_, TX + ox + w_, TB)
    for k in range(w_ // 2 + 1):
        rect(F, TX + ox + k, TB - h_ - (w_ // 2 + 3) + k * 2, TX + ox + w_ - k, TB - h_ - (w_ // 2 + 3) + k * 2 + 2)
for k in range(14):
    F.put((yy == TB - 66 - k) & ((xx == TX - 5 - k // 3) | (xx == TX + 13 + k // 3)), TH)
tm = F.m & np.all(F.c == TH, axis=2)
F.c[tm & ~np.roll(tm, -1, 1) & (yy < TB - 3)] = hexc('#4a2470')
F.c[tm & ~np.roll(tm, 1, 0) & (yy < TB - 3)] = hexc('#2e1448')
for ox, oy in [(-2, 44), (3, 44), (0, 56), (-17, 30), (18, 32), (-26, 20), (27, 20), (-9, 38), (11, 40)]:
    F.put((xx == TX + ox) & (yy >= TB - oy) & (yy < TB - oy + 3), hexc('#5a1408'))
    FG.put((xx == TX + ox) & (yy >= TB - oy) & (yy < TB - oy + 2), hexc('#ffb640'))
    FG.put((xx == TX + ox) & (yy == TB - oy + 2), hexc('#c8420c'))

# ============================================================ 4. Ebene mit Lavastrom (Bildfolge)
y0 = HOR + 2
t = np.clip((yy - y0) / (H - y0), 0, 1)
FLAT = ramp('#080408', '#0d060b', '#13080e', '#1a0b12', '#231014')
pm = yy >= y0
base = Layer(); base.put(pm, quant(np.clip(0.1 + t * 0.55 + (vnoise(xx / 40, yy / (2 + t * 10), 21) - 0.5) * 0.5, 0, 1), FLAT))
r5 = np.random.default_rng(5); VEINS = []
for i in range(70):
    yb = y0 + 2 + (r5.random() ** 1.7) * (H - y0 - 4); tz = (yb - y0) / (H - y0)
    x = r5.random() * W; ln = 8 + tz * 70 * r5.random() + 6; dirx = r5.choice([-1, 1]); y = yb; slope = r5.normal(0, 0.06 + tz * 0.2)
    hot = 0.25 + r5.random() * (0.4 + tz * 0.3); pts = []
    for s_ in range(int(ln)):
        pts.append((int(x), int(round(y)), hot * (1 - abs(s_ / ln - 0.5) * 1.2), tz)); x += dirx; y += slope; slope += r5.normal(0, 0.05)
    VEINS.append((pts, r5.random() * 6.28))
ty = np.arange(y0, H); tt = (ty - HOR) / (H - HOR)
cxs = TX - 8 - tt * 290 + np.sin(tt * 6.0 + 0.3) * 70 * tt ** 0.9
wid = 0.8 + tt ** 1.6 * 34


def ebene(f):
    ph = 2 * math.pi * f / NL
    L = Layer(); L.c = base.c.copy(); L.m = base.m.copy()
    for pts, p in VEINS:
        k_ = 0.85 + 0.15 * math.cos(ph + p)
        for x, y, k, tz in pts:
            if 0 <= x < W and y0 <= y < H:
                L.c[y, x] = EMBER[min(5, max(0, int(k * k_ * 5 + gb[y, x] * 0.8)))]
                if tz > 0.5 and k > 0.4 and y + 1 < H: L.c[y + 1, x] = EMBER[1]
    for i, c in enumerate(['#3a1210', '#260c0e']):
        L.c[(yy == y0 + i) & (gb < 0.6)] = hexc(c)
    # Lavastrom: Muster fließt stromabwärts (Rauschen entlang y verschoben, nach NL Bildern nahtlos)
    for y, cx_, w_ in zip(ty, cxs, wid):
        xs_ = np.arange(max(0, int(cx_ - w_ - 8)), min(W, int(cx_ + w_ + 9)))
        if not len(xs_): continue
        rel = np.abs(xs_ - cx_) / max(0.8, w_)
        fl = (vnoise(xs_ / (3 + w_ * 0.35) + y * 0.2, (y - f * 0.75) / 2.2, 41) * (NL - f) + vnoise(xs_ / (3 + w_ * 0.35) + y * 0.2, (y - (f - NL) * 0.75) / 2.2, 41) * f) / NL
        tv = np.clip(1.15 - rel * 0.8 + (fl - 0.5) * 0.9, 0, 1)
        cols = quant(tv[None, :], EMBER, oy=y, ox=int(xs_[0]))[0]
        inn = rel <= 1
        L.c[y, xs_[inn]] = cols[inn]
        e1 = 1 + 1.5 / max(1, w_); e2 = 1 + 6 / max(1, w_)
        L.c[y, xs_[(rel > 1) & (rel < e1)]] = hexc('#5a1408')
        L.c[y, xs_[(rel >= e1) & (rel < e2) & (gb[y, xs_] < 0.4)]] = hexc('#3a0e08')
    return L


EBENE = [ebene(f) for f in range(NL)]

# ============================================================ 5. Vordergrund: Felsnase (still + Fugenglut)
gx = np.arange(W).astype(float)
edge_y = 198 + (line1d(W, 91, 10, 3) - 0.5) * 5 + np.clip((560 - gx) / 240, 0, 1) * 8
tipx = 318
drop = np.clip((tipx + 26 - gx) / 26, 0, 1)
edge_y = edge_y + (vnoise(gx / 7, np.full(W, 0.5), 98) - 0.5) * 6 * np.clip((gx - tipx) / 40, 0, 1)
edge_y = edge_y + drop ** 1.8 * 90 + (hash2(gx.astype(int), 1, 97) - 0.5) * 2 * (drop > 0)
ROCK = ramp('#050208', '#0a050c', '#110812', '#1a0e19', '#261521', '#341d2a')
N = Layer(); NG = Layer()
rock_m = yy >= np.round(edge_y)[None, :]
lit = np.clip(0.55 - (yy - edge_y[None, :]) / 26 + (vnoise(xx / 5, yy / 3, 92) - 0.5) * 0.35, 0, 1)
N.put(rock_m, quant(lit * (1 - 0.6 * drop[None, :]), ROCK))
for bx, bw, bh in [(470, 9, 5), (520, 14, 7), (585, 11, 6), (612, 18, 9)]:
    for ox in range(-bw, bw + 1):
        hh = int(bh * (1 - (ox / bw) ** 2) ** 0.6); x_ = bx + ox
        if 0 <= x_ < W:
            y_ = int(round(edge_y[x_]))
            col = quant(np.clip(np.linspace(0.65, 0.3, hh + 1)[:, None] + (ox > 0) * 0.15, 0, 1), ROCK)[:, 0]
            N.c[y_ - hh:y_ + 1, x_] = col; N.m[y_ - hh:y_ + 1, x_] = True
            edge_y[x_] = min(edge_y[x_], y_ - hh)
rock_m = N.m.copy()
d1, d2, idv = voronoi_xy(xx.astype(float), yy.astype(float) * 3.0, 17, 95)
surf_band = rock_m & (yy < np.round(edge_y)[None, :] + 22) & (drop[None, :] < 0.3)
cr = surf_band & ((d2 - d1) < 0.055) & (yy > np.round(edge_y)[None, :] + 1)
heat = np.clip(0.55 - (yy - edge_y[None, :]) / 40 + vnoise(xx / 30, yy / 9, 96) * 0.4, 0, 1)
N.c[cr] = quant(heat * 0.6, EMBER)[cr]            # Fuge ohne Glut (dunkel), die Glut liegt in NG
NG.put(cr, quant(heat, EMBER))
top = rock_m & ~np.roll(rock_m, 1, 0)
N.c[top] = hexc('#6a3c78')
N.c[np.roll(top, 1, 0) & rock_m] = hexc('#3a2246')
N.c[rock_m & ~np.roll(rock_m, 1, 1) & (drop[None, :] > 0)] = hexc('#5a1c12')
NT = int(np.round(edge_y).min()) - 4             # Oberkante der Felsebene (Szenenpixel)

# ============================================================ 6. Helden (Feinraster, von titel-riss.mjs)
HM = json.load(open(os.path.join(TMP, 'helden.json')))
HS = np.array(Image.open(os.path.join(TMP, 'helden.png')).convert('RGBA'))
POS = {'ranger': 372, 'mage': 392, 'warrior': 416, 'rogue': 438}
for k, h in HM['helden'].items():
    h['x'] = POS[k] * Q; h['y'] = int(round(edge_y[POS[k]])) * Q + 4      # Fußpunkt in Feinpixeln


def stamp(big, k, i):
    h = HM['helden'][k]; w, hh = h['w'], h['h']
    a = HS[h['row']:h['row'] + hh, i * w:(i + 1) * w]
    x0, y0 = h['x'] - h['fx'], h['y'] - h['fy']
    sub = big[y0:y0 + hh, x0:x0 + w]; m = a[..., 3] > 127
    sub[m] = a[..., :3][m] if big.shape[2] == 3 else a[m]

# ============================================================ 7. Ausgabe
sizes = {}
def out(arr, n):
    f, s = webp(arr, n); sizes[f] = s
    return arr.shape[1], arr.shape[0]
dims = {}
dims['titel-himmel'] = out(HIMMEL.rgba()[:, :, :3].copy(), 'titel-himmel')
rb = [v * Q for v in RB]
dims['titel-riss'] = out(np.concatenate([L.rgba()[rb[1]:rb[3], rb[0]:rb[2]] for L in RISS], 0), 'titel-riss')
fy0 = (HOR - 90) * Q
dims['titel-fern'] = out(F.rgba()[fy0:], 'titel-fern')
dims['titel-fern-glut'] = out(FG.rgba()[fy0:], 'titel-fern-glut')
ey0 = y0 * Q
dims['titel-ebene'] = out(np.concatenate([L.rgba()[ey0:, :, :3] for L in EBENE], 0).copy(), 'titel-ebene')
dims['titel-fels'] = out(N.rgba()[NT * Q:], 'titel-fels')
dims['titel-fels-glut'] = out(NG.rgba()[NT * Q:], 'titel-fels-glut')
dims['titel-helden'] = out(HS, 'titel-helden')

# Standbild = Bild 0 der Szene (alle Ebenen, Glut voll), auch Grundlage für LCP
def comp(f_r=0, f_l=0):
    big = HIMMEL.rgba()[:, :, :3].copy()
    def over(a, x0, y0):
        h, w = a.shape[:2]; m = a[..., 3] > 127; big[y0:y0 + h, x0:x0 + w][m] = a[..., :3][m]
    over(RISS[f_r].rgba()[rb[1]:rb[3], rb[0]:rb[2]], rb[0], rb[1])
    over(F.rgba(), 0, 0); over(FG.rgba(), 0, 0)
    e = EBENE[f_l].rgba(); big[ey0:] = e[ey0:, :, :3]
    over(N.rgba(), 0, 0); over(NG.rgba(), 0, 0)
    for k in HM['helden']: stamp(big, k, 0)
    return big
poster = comp()
f_, s_ = webp(poster, 'titel'); sizes[f_] = s_
Image.fromarray(poster).save(os.path.join(TMP, 'vorschau.png'))
for i in range(NR): Image.fromarray(comp(i, i % NL)).save(os.path.join(TMP, f'bild-{i}.png'))

kante = [int(round(edge_y[x])) * Q for x in range(W)]
meta = {
    'szene': {'Q': Q, 'W': W * Q, 'H': H * Q, 'HOR': HOR * Q, 'RB': rb, 'NR': NR, 'NL': NL, 'EY': ey0, 'NT': NT * Q, 'FY0': fy0,
              'FX': 410 * Q, 'FYP': int(round(edge_y[410])) * Q, 'RX': 480 * Q, 'RY': 60 * Q, 'TX': TX * Q, 'TY': (TB - 40) * Q},
    'helden': {k: {kk: v for kk, v in h.items()} for k, h in HM['helden'].items()},
    'kante': {'x0': 300 * Q, 'y': [kante[x] for x in range(300, W)]},
    'dims': dims,
}
print(json.dumps({'meta': meta, 'sizes': sizes}))
