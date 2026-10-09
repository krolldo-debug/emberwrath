# Bossbühnen, Teil 2: baut aus den Spielgrafiken (assets.json von bosse-buehne.mjs) je Boss die Bühne und zeichnet alle
# Angriffseffekte selbst als Pixel-Art am ganzzahligen Raster. Aufruf durch bosse-buehne.mjs:
#   python3 bosse-buehne.py NAME ASSETS.json ZIELORDNER ZWISCHENORDNER MASSE.json
# Ebenen: boden (Wand im oberen Drittel, Bodenkacheln in Reihen nach hinten dunkler, Lichtinsel, Schattenoval),
#         kampf (Streifen: Warnflächen, Angriffe, Splitter, Lichtschein, Boss), vorn (Requisiten über allem).
# Regeln: alles ganzzahlig, keine Verläufe (Licht und Abdunkeln nur in festen Stufen), Warnflächen gefüllt mit stufigem
# Pulsieren (3 Stufen), Angriffe und Warnflächen bleiben mindestens 12 % vom Rand entfernt.
import sys, json, base64, io, math
import numpy as np
from PIL import Image

NAME, ASSETS, OUT, ZW, MASSE = sys.argv[1:6]
A = json.load(open(ASSETS))
FPS = 12


def dec(u):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')).copy()


def hexc(h):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def bayer(w, h):
    return np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]


def rng(seed):
    return np.random.default_rng(seed)


# ------------------------------------------------------------------ Ebenen (RGBA float, 0..255)
class Layer:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.float64)

    def over(self, mask, rgb, alpha=1.0):
        """Farbe rgb mit Deckkraft alpha über die Maske legen (Porter-Duff over)."""
        if mask is None or not mask.any():
            return
        a = self.a[mask]
        sa = alpha; da = a[:, 3] / 255
        oa = sa + da * (1 - sa)
        c = (np.array(rgb, np.float64) * sa + a[:, :3] * da[:, None] * (1 - sa)) / np.maximum(oa, 1e-9)[:, None]
        a[:, :3] = c; a[:, 3] = oa * 255
        self.a[mask] = a

    def px(self, x, y, rgb, alpha=1.0):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            d = self.a[y, x]
            if alpha >= 1:
                d[:3] = rgb; d[3] = 255; return
            da = d[3] / 255; oa = alpha + da * (1 - alpha)
            d[:3] = (np.array(rgb, np.float64) * alpha + d[:3] * da * (1 - alpha)) / max(oa, 1e-9); d[3] = oa * 255

    def rect(self, x, y, w, h, rgb, alpha=1.0):
        x0, y0 = max(0, int(x)), max(0, int(y)); x1, y1 = min(self.w, int(x + w)), min(self.h, int(y + h))
        if x1 <= x0 or y1 <= y0:
            return
        if alpha >= 1:
            self.a[y0:y1, x0:x1, :3] = rgb; self.a[y0:y1, x0:x1, 3] = 255; return
        m = np.zeros((self.h, self.w), bool); m[y0:y1, x0:x1] = True; self.over(m, rgb, alpha)

    def sprite(self, img, x0, y0, flip=False, dim=1.0, tint=None):
        """RGBA-Sprite mit linker oberer Ecke (x0, y0) einsetzen (Bildpunkte mit Deckkraft >= 128)."""
        if flip:
            img = img[:, ::-1]
        h, w = img.shape[:2]
        x0, y0 = int(x0), int(y0)
        sx0, sy0 = max(0, -x0), max(0, -y0); sx1, sy1 = min(w, self.w - x0), min(h, self.h - y0)
        if sx1 <= sx0 or sy1 <= sy0:
            return
        src = img[sy0:sy1, sx0:sx1].astype(np.float64)
        on = src[..., 3] >= 128
        dst = self.a[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        rgb = src[..., :3] * dim
        if tint is not None:
            rgb = tint[0] + (rgb - tint[0]) * 1.0
        dst[on, :3] = rgb[on]; dst[on, 3] = 255

    def glow(self, img, x0, y0, flip=False, k=1.0):
        """Leuchtebene: auf deckenden Bildpunkten additiv, daneben als eigene deckende Bildpunkte."""
        if flip:
            img = img[:, ::-1]
        h, w = img.shape[:2]
        x0, y0 = int(x0), int(y0)
        sx0, sy0 = max(0, -x0), max(0, -y0); sx1, sy1 = min(w, self.w - x0), min(h, self.h - y0)
        if sx1 <= sx0 or sy1 <= sy0:
            return
        src = img[sy0:sy1, sx0:sx1].astype(np.float64)
        on = src[..., 3] >= 128
        dst = self.a[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
        solid = dst[..., 3] >= 128
        add = on & solid
        dst[add, :3] = np.minimum(255, dst[add, :3] + src[add, :3] * k)
        free = on & ~solid
        dst[free, :3] = src[free, :3]; dst[free, 3] = 255

    def u8(self):
        o = np.clip(np.round(self.a), 0, 255).astype(np.uint8)
        o[o[..., 3] == 0] = 0
        return o


def ell(w, h, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:h, 0:w]
    if rx <= 0 or ry <= 0:
        return np.zeros((h, w), bool)
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1.0


def rim(m):
    """Randbildpunkte einer Maske (4er-Nachbarschaft)."""
    e = m.copy()
    e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
    return m & ~e


def poly(w, h, pts):
    """Gefülltes Polygon (Mittelpunkt-Test je Bildpunkt)."""
    yy, xx = np.mgrid[0:h, 0:w]
    X, Y = xx + 0.5, yy + 0.5
    inside = np.zeros((h, w), bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        cond = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / ((y2 - y1) or 1e-9) + x1)
        inside ^= cond
    return inside


# ------------------------------------------------------------------ Paletten
RED = [hexc(c) for c in ['#2a0608', '#5a0e10', '#8e1a16', '#c42a1c', '#f04a2a', '#ff8a5a']]
PULSE = [0, 1, 2, 1]  # stufiges Pulsieren, je Stufe 2 Bilder


def pulse(f):
    return PULSE[(f // 2) % 4]


def warn(L, mask, f, prog=None, prog_mask=None, tex=None):
    """Warnfläche: gefüllte rote Bodenmarke, Rand 1 px (vorn 2 px), 3 Pulsstufen; prog_mask = wachsende Innenfläche.
    tex (Rauschfeld 0..1): Bodentextur – dunkle Körnung und gestufter Innenrand, damit die Bahn nicht wie ein Brett wirkt."""
    l = pulse(f)
    L.over(mask, RED[3], [0.34, 0.44, 0.54][l])
    if prog_mask is not None:
        L.over(prog_mask & mask, RED[4], 0.42)
    if tex is not None:
        inner = rim(mask & ~rim(mask))                       # zweite Randreihe: gestufter Rand
        L.over(inner, RED[2], 0.55)
        L.over(mask & ~inner & (tex < 0.09), RED[1], 0.7)    # Körnung (Einzelpixel)
        L.over(mask & ~inner & (tex > 0.95), RED[5], 0.5)
    r = rim(mask)
    lip = mask & ~np.roll(mask, -1, axis=0)  # Unterkante
    lip2 = mask & ~np.roll(mask, -2, axis=0)
    L.over(r | lip2, [RED[3], RED[4], RED[5]][l], 1.0)
    L.over(lip, RED[2 + l], 1.0)


def light(L, cx, cy, rx, ry, rgb, k=1.0):
    """Lichtschein auf dem Boden: drei verschachtelte Ellipsen mit fester Deckkraft (keine Verläufe)."""
    for s, a in [(1.0, 0.10), (0.68, 0.10), (0.4, 0.12)]:
        L.over(ell(L.w, L.h, cx, cy, rx * s, ry * s), rgb, a * k)


# ------------------------------------------------------------------ Bossfigur
def anim(name):
    an = A['anims'][name]
    fr = []
    for f in an['frames']:
        img = dec(f['img'])
        g = None
        if f.get('glow'):
            g0 = dec(f['glow']); g = np.zeros_like(img)
            ox, oy = f['ax'] - f['gax'], f['ay'] - f['gay']
            h, w = g0.shape[:2]; Hh, Ww = img.shape[:2]
            ys0, xs0 = max(0, -oy), max(0, -ox); ys1, xs1 = min(h, Hh - oy), min(w, Ww - ox)
            if ys1 > ys0 and xs1 > xs0:
                g[oy + ys0:oy + ys1, ox + xs0:ox + xs1] = g0[ys0:ys1, xs0:xs1]
        fr.append({'img': img, 'glow': g, 'ax': f['ax'], 'ay': f['ay'], 'meta': f['meta']})
    return {'fps': an['fps'], 'loop': an['loop'], 'frames': fr}


def spr(o):
    img = dec(o['img'])
    g = dec(o['glow']) if o.get('glow') else None
    return {'img': img, 'glow': g, 'ax': o['ax'], 'ay': o['ay']}


# ------------------------------------------------------------------ Boden
def build_floor(cfg, W, H):
    T = A['tiles']
    floor = [dec(u)[..., :3].astype(np.float64) for u in T['floor']]
    upper = [dec(u)[..., :3].astype(np.float64) for u in T['upper']]
    lower = [dec(u)[..., :3].astype(np.float64) for u in T['lower']]
    top = dec(T['top'])[..., :3].astype(np.float64)
    R = rng(cfg['seed'])
    img = np.zeros((H, W, 3), np.float64)
    wb = cfg['wall']                      # Unterkante der Wand = Beginn des Bodens
    nf = cfg.get('faceRows', 2)            # Reihen Wandfront (obere Reihen wiederholt, unterste = untere Kachel)
    crown = wb - 16 * nf
    # Mauerkrone
    for y in range(0, crown, 16):
        for x in range(0, W, 16):
            hh = min(16, crown - y); img[y:y + hh, x:x + 16] = top[:hh, :min(16, W - x)]
    img[crown - 2:crown] = hexc(T['edge']); img[crown - 2] = hexc(T['edgeLight'])
    # Wandfront: obere und untere Reihe
    x = -int(R.integers(0, 16))
    while x < W:
        u = upper[int(R.integers(0, len(upper)))]; lo = lower[int(R.integers(0, len(lower)))]
        x0, x1 = max(0, x), min(W, x + 16)
        for r in range(nf - 1):
            uu = upper[int(R.integers(0, len(upper)))] if r else u
            img[crown + 16 * r:crown + 16 * r + 16, x0:x1] = uu[:, x0 - x:x1 - x]
        img[wb - 16:wb, x0:x1] = lo[:, x0 - x:x1 - x]
        x += 16
    # Bodenkacheln (32er Makrokacheln), Reihen ab wb
    ox = -int(R.integers(0, 32))
    order = list(range(len(floor)))
    y = wb; ry = 0
    while y < H:
        x = ox; last = -1
        while x < W:
            k = int(R.integers(0, len(floor)))
            if k == last:
                k = (k + 1) % len(floor)
            last = k
            t = floor[k]
            hh = min(32, H - y); x0, x1 = max(0, x), min(W, x + 32)
            img[y:y + hh, x0:x1] = t[:hh, x0 - x:x1 - x]
            x += 32
        y += 32; ry += 1
    return img, crown


def shade(img, f, bg):
    return bg + (img - bg) * f


def depth(cfg, W, H, crown):
    """Abdunkeln nach Tiefe: feste Stufen je 16er-Bodenreihe, an der Reihengrenze 2 px Raster-Übergang."""
    wb = cfg['wall']
    k = np.ones((H, W), np.float64)
    B = bayer(W, H)
    k[:crown] = cfg['dark'][0]
    k[crown:wb - 16] = cfg['dark'][1]
    k[wb - 16:wb] = cfg['dark'][2]
    steps = cfg['rows']
    for i in range(0, H - wb):
        r = i // 16
        kr = steps[min(r, len(steps) - 1)]
        if i % 16 < 2 and r > 0:                     # Raster-Übergang zur vorherigen Reihe
            kp = steps[min(r - 1, len(steps) - 1)]
            k[wb + i] = np.where(B[wb + i] < (0.33 if i % 16 == 0 else 0.66), kp, kr)
        else:
            k[wb + i] = kr
    # Schlagschatten der Wand auf dem Boden (3 Stufen)
    for i, s in enumerate([0.55, 0.55, 0.7, 0.7, 0.85]):
        k[wb + i] *= np.where((i >= 4) & (B[wb + i] < 0.5), 1.0, s) if i == 4 else s
    return k


# ------------------------------------------------------------------ gemeinsame Effektbausteine
class Bits:
    """Brocken/Splitter: ballistische Flugbahn, landen auf ihrer Bodenhöhe, bleiben kurz liegen, verschwinden."""
    def __init__(self):
        self.list = []

    def add(self, f0, x, y, vx, vy, gy, cols, size=2, life=10, g=1.6, rest=3):
        self.list.append(dict(f0=f0, x=x, y=y, vx=vx, vy=vy, gy=gy, cols=cols, size=size, life=life, g=g, rest=rest))

    def draw(self, L, f, ymax=None):
        for b in self.list:
            t = f - b['f0']
            if t < 0 or t > b['life'] + b['rest']:
                continue
            tt = min(t, b['life'])
            x = b['x'] + b['vx'] * tt
            y = b['y'] + b['vy'] * tt + 0.5 * b['g'] * tt * tt
            if y > b['gy']:
                # Landung: Zeitpunkt der Landung suchen, dort liegen bleiben
                a, bb, c = 0.5 * b['g'], b['vy'], b['y'] - b['gy']
                disc = bb * bb - 4 * a * c
                tl = (-bb + math.sqrt(max(0, disc))) / (2 * a) if a else tt
                x = b['x'] + b['vx'] * tl; y = b['gy']
            s = b['size']; c0, c1 = b['cols'][0], b['cols'][1]
            X, Y = int(round(x)), int(round(y))
            if s >= 4:
                L.rect(X - 2, Y - 2, 4, 3, c1); L.rect(X - 2, Y - 2, 3, 1, c0); L.px(X - 2, Y - 1, c0)
                L.rect(X - 1, Y, 3, 1, b['cols'][2] if len(b['cols']) > 2 else c1)
            elif s >= 3:
                L.rect(X - 1, Y - 1, 3, 2, c1); L.rect(X - 1, Y - 1, 2, 1, c0); L.px(X + 1, Y + 1, b['cols'][2] if len(b['cols']) > 2 else c1)
            elif s == 2:
                L.rect(X, Y, 2, 2, c1); L.px(X, Y, c0)
            else:
                L.px(X, Y, c0)


def place_sprite(L, s, x, y, flip=False, dim=1.0, glow=True, gk=1.0):
    img = s['img']; ax = s['ax']
    if flip:
        ax = img.shape[1] - ax
    L.sprite(img, x - ax, y - s['ay'], flip=flip, dim=dim)
    if glow and s.get('glow') is not None:
        g = s['glow']
        if g.shape[:2] == img.shape[:2]:
            L.glow(g, x - ax, y - s['ay'], flip=flip, k=gk)
        else:
            # Leuchtebene ohne Umrissrand (1 px kleiner auf jeder Seite)
            ox = (img.shape[1] - g.shape[1]) // 2; oy = (img.shape[0] - g.shape[0]) // 2
            L.glow(g, x - ax + ox, y - s['ay'] + oy, flip=flip, k=gk)


# ------------------------------------------------------------------ Zeitachse der Figur
class Seq:
    """Bildfolge der Bossfigur bei 12 fps. Animationen laufen mit ihrer Spielgeschwindigkeit, höchstens 12 Bilder/s."""
    def __init__(self, idle):
        self.idle = idle; self.frames = []; self.marks = {}

    def mark(self, k):
        self.marks[k] = len(self.frames)

    def idle_run(self, n, t0=0.0):
        an = A_[self.idle]
        for i in range(n):
            t = t0 + i / FPS
            self.frames.append((self.idle, int(math.floor(t * an['fps'] + 1e-9)) % len(an['frames'])))

    def idle_end(self, n):
        """Ruhe am Schluss: Takt läuft genau auf Bild 0 zu (nahtlose Schleife)."""
        self.idle_run(n, t0=-n / FPS)

    def play(self, name, rate=None, hold=0, start=0, stop=None):
        an = A_[name]; r = min(rate or an['fps'], FPS)
        frs = an['frames']; stop = len(frs) if stop is None else stop
        n = math.ceil((stop - start) / r * FPS)
        for i in range(n):
            self.frames.append((name, min(stop - 1, start + int(i * r / FPS))))
        for _ in range(hold):
            self.frames.append((name, stop - 1))

    def play_frames(self, name, idxs):
        for i in idxs:
            self.frames.append((name, i))


A_ = {}


def boss_layer(L, name, idx, foot, cfg):
    fr = A_[name]['frames'][idx]
    x, y = foot
    L.sprite(fr['img'], x - fr['ax'], y - fr['ay'], dim=cfg.get('bossDim', 1.0))
    if fr['glow'] is not None:
        L.glow(fr['glow'], x - fr['ax'], y - fr['ay'], k=cfg.get('glowK', 1.0))
    return fr


def meta(name, idx, foot, key):
    m = A_[name]['frames'][idx]['meta'].get(key)
    if not m:
        return None
    return (foot[0] + m['dx'], foot[1] + m['dy'])


# ================================================================== Bühnen
def stage_ulgrim(cfg, W, H):
    foot = cfg['foot']
    for a in ['idle', 'sweepWindup', 'sweep', 'backsweep', 'chopWindup', 'chop']:
        A_[a] = anim(a)
    S = Seq('idle')
    S.idle_run(6)
    S.mark('warn1'); S.play('sweepWindup', hold=1)
    S.mark('sweep'); S.play('sweep', rate=12, stop=5)
    S.mark('back'); S.play('backsweep', rate=12)
    S.mark('warn2'); S.play('chopWindup', hold=3)
    S.mark('chop'); S.play('chop', rate=11)
    S.mark('rest'); S.idle_end(20)
    GH = [hexc(c) for c in ['#0b3a40', '#127272', '#22b0a4', '#7ef0d6', '#e8fff8']]
    EARTH = [hexc(c) for c in ['#0e0b09', '#1d1712', '#2e251c', '#463a2c', '#655544', '#8a7a62']]
    fx0, fy = foot
    # Warnfläche Schwertkombo: Halbellipse vor dem König
    sweep_m = ell(W, H, fx0 + 6, fy - 13.5, 92, 9) & (np.mgrid[0:H, 0:W][1] >= fx0 + 10)
    # Warnfläche Grabriss: Bahn vom Schwert flach nach hinten rechts, Spitze verjüngt
    a0 = np.array([fx0 + 28.0, fy - 12.0]); a1 = np.array([int(W * 0.88) - 3.0, fy - 22.0])
    d = a1 - a0; L_ = float(np.hypot(*d)); u = d / L_; n = np.array([-u[1], u[0]])
    hw = 6.5
    rift_m = poly(W, H, [tuple(a0 + n * hw), tuple(a0 + u * (L_ - 10) + n * hw), tuple(a1 + n * 2), tuple(a1 - n * 2),
                         tuple(a0 + u * (L_ - 10) - n * hw), tuple(a0 - n * hw)])
    yy, xx = np.mgrid[0:H, 0:W]
    along = (xx + 0.5 - a0[0]) * u[0] + (yy + 0.5 - a0[1]) * u[1]
    B = bayer(W, H)
    # Rissverlauf: je Spalte Mittelhöhe (Zickzack) und halbe Öffnung (1–2 px)
    R = rng(7); path = []; off = 0.0
    for xi in range(int(a0[0]), int(a1[0]) - 2):
        s = (xi - a0[0]) / u[0]
        off = max(-2.5, min(2.5, off + R.choice([-1, 0, 0, 1])))
        y = a0[1] + u[1] * s + off
        hc = 1 if (s < 6 or s > L_ - 14) else (2 if R.random() < 0.45 else 1)
        path.append((xi, int(round(y)), s, hc))
    bits = Bits()
    c_chop = S.marks['chop'] + 1          # Einschlag (Bild 1 der Hiebanimation)
    speed = 19                           # px je Bild (230 px/s)
    for (x, y, sv, hc) in path[::6]:
        f0 = c_chop + int(sv // speed)
        for k in range(2):
            vx = R.uniform(-1.0, 1.0); vy = R.uniform(-6.0, -4.0)
            bits.add(f0, x + R.integers(-2, 3), y - 1, vx, vy, y + R.integers(-5, 6), [EARTH[5], EARTH[3], EARTH[1]], size=4 if k == 0 else 3, life=9, g=1.0, rest=4)
    hit1, hit2 = S.marks['sweep'] + 1, S.marks['back'] + 1
    dust = Bits()
    for hf in [hit1, hit2]:
        for i in range(7):
            x = fx0 + 20 + i * 11 + R.integers(-3, 4); y = fy - 13 + R.integers(-5, 6)
            dust.add(hf, x, y, R.uniform(-0.6, 0.6), R.uniform(-2.2, -1.2), y, [EARTH[4], EARTH[3]], size=2, life=4, g=0.5, rest=0)
    CORE = [(GH[4], GH[3]), (GH[3], GH[2]), (GH[2], GH[1]), (GH[1], EARTH[1]), (EARTH[0], EARTH[1])]

    frames = []
    for f, (an, idx) in enumerate(S.frames):
        L = Layer(W, H)
        # --- Bodenebene
        if S.marks['warn1'] <= f < hit2 + 1:
            warn(L, sweep_m, f)
        for hf in [hit1, hit2]:
            if hf <= f < hf + 3:
                k = f - hf
                L.over(sweep_m, GH[[3, 2, 1][k]], [0.55, 0.4, 0.25][k])
                L.over(rim(sweep_m), GH[[4, 3, 2][k]], 1.0)
        if S.marks['warn2'] <= f:
            front = (f - c_chop) * speed if f >= c_chop else -1
            if front < L_ + 2:
                # Warnbahn: nur der noch nicht aufgerissene Teil, Innenfläche wächst in 4 Stufen
                wl = (f - S.marks['warn2']) / max(1, c_chop - S.marks['warn2'])
                prog = rift_m & (along <= L_ * min(1, (int(wl * 4) + 1) / 4))
                warn(L, rift_m & (along > front), f, prog_mask=prog & (along > front))
            if f >= c_chop:
                # aufgerissene Bahn füllt die Warnfläche: Geisterlicht, dann aufgewühlte Erde, dann gerastert weg
                age = f - c_chop - np.floor(np.maximum(along, 0) / speed)
                passed = rift_m & (along <= front)
                for lo, hi, c, a in [(0, 3, GH[2], 0.5), (3, 8, GH[1], 0.42), (8, 14, EARTH[1], 0.55), (14, 22, EARTH[1], 0.45)]:
                    mm = passed & (age >= lo) & (age < hi)
                    if hi == 22:
                        mm &= B >= (age - 14) / 8
                    L.over(mm, c, a)
                L.over(rim(rift_m) & passed & (age < 8), GH[2], 1.0)
                lit = []
                for (x, y, sv, hc) in path:
                    if sv > front:
                        continue
                    ag = f - (c_chop + int(sv // speed))
                    st = 0 if ag < 2 else 1 if ag < 7 else 2 if ag < 13 else 3 if ag < 18 else 4
                    if st == 4 and BAYER[y % 4, x % 4] < (ag - 18) / 7:
                        continue
                    hi_, mid = CORE[st]
                    L.px(x, y - hc - 1, EARTH[0]); L.px(x, y + hc + 1, EARTH[0])
                    for dy in range(-hc, hc + 1):
                        L.px(x, y + dy, hi_ if dy == 0 or (hc == 2 and dy == 1 and st < 2) else mid)
                    if st < 2:
                        L.px(x, y - hc - 2, EARTH[4])     # aufgeworfene Kante
                    if st < 3:
                        lit.append((x, y, st))
                if lit:
                    st = min(t for _, _, t in lit)
                    xs = [p[0] for p in lit]; ys = [p[1] for p in lit]
                    light(L, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2 - 2, (max(xs) - min(xs)) / 2 + 12, 14, GH[2], k=[1.0, 0.75, 0.45][st])
        # --- Figur und Brocken (nach Tiefe)
        boss_layer(L, an, idx, foot, cfg)
        bits.draw(L, f); dust.draw(L, f)
        frames.append(L.u8())
    masks = [sweep_m, rift_m]
    return frames, masks


def stage_rotmother(cfg, W, H):
    foot = cfg['foot']
    for a in ['idle', 'plungeWindup', 'plunge']:
        A_[a] = anim(a)
    S = Seq('idle')
    S.idle_run(10)
    S.mark('warn'); S.play('plungeWindup', hold=2)
    S.mark('plunge'); S.play('plunge')
    S.mark('rest'); S.idle_end(26)
    VIO = [hexc(c) for c in ['#2a1440', '#4a2470', '#7a3cb4', '#a458f4', '#dea8ff']]
    COLS = [hexc(c) for c in ['#0c0a08', '#1a1610', '#2c2618', '#443a24', '#605234', '#847450']]
    TIP = [hexc('#d4caac'), hexc('#a0947a')]
    spots = cfg['spots']; r = 18; ry = 11
    R = rng(31)
    groups = []
    for i, (cx, cy) in enumerate(spots):
        sp = []
        n = 7
        for j in range(n):
            a = j / n * 2 * math.pi + R.uniform(-0.3, 0.3); rr = 0 if j == 0 else R.uniform(0.35, 0.8) * r
            sp.append(dict(dx=math.cos(a) * rr, dy=math.sin(a) * rr * 0.6, h=R.uniform(26, 32) if j == 0 else R.uniform(13, 21),
                           lean=R.uniform(-0.25, 0.25) + math.cos(a) * 0.25 * (rr / r), w=5 if j == 0 else R.uniform(3, 4)))
        sp.sort(key=lambda s: s['dy'])
        groups.append(dict(cx=cx, cy=cy, sp=sp, m=ell(W, H, cx, cy, r, ry)))
    f_burst0 = S.marks['plunge'] + 2
    for i, g in enumerate(groups):
        g['fb'] = f_burst0 + i * 2
    bits = Bits()
    for g in groups:
        for k in range(6):
            a = R.uniform(0, 2 * math.pi)
            bits.add(g['fb'], g['cx'] + math.cos(a) * 6, g['cy'] + math.sin(a) * 3, math.cos(a) * R.uniform(0.6, 1.4), R.uniform(-4.5, -2.5),
                     g['cy'] + math.sin(a) * 6 + 2, [COLS[5], COLS[3], COLS[1]], size=3 if k < 2 else 2, life=7, g=1.1, rest=2)
        for k in range(4):   # Sporen
            bits.add(g['fb'] + 1, g['cx'] + R.uniform(-10, 10), g['cy'] - 6, R.uniform(-0.4, 0.4), R.uniform(-1.6, -0.8), g['cy'] - 40,
                     [VIO[4], VIO[3]], size=1, life=7, g=0.05, rest=0)

    def grow(f, fb):
        k = f - fb
        if k < 0:
            return 0
        return [0.45, 0.85, 1, 1, 1, 1, 1, 1, 0.75, 0.5, 0.25][k] if k < 11 else 0

    def spikes(L, g, gk):
        for s in g['sp']:
            bx = g['cx'] + s['dx']; by = g['cy'] + s['dy']
            Hh = int(round(s['h'] * gk))
            for y in range(Hh):
                fr = y / s['h']; w = s['w'] * (1 - fr) + 0.6
                x0 = bx + s['lean'] * y + math.sin(fr * 5 + s['dx']) * 0.8
                k = -w
                while k <= w:
                    e = (k + w) / (2 * w)
                    c = COLS[5] if e < 0.25 else COLS[4] if e < 0.5 else COLS[3] if e < 0.8 else COLS[1]
                    if fr > 0.82:
                        c = TIP[0] if e < 0.5 else TIP[1]
                    L.px(x0 + k, by - y, c)
                    k += 1
                if abs(y - s['h'] * 0.45) < 0.5 and Hh > s['h'] * 0.5:
                    L.rect(round(x0 + w + 1), round(by - y - 1), 2, 1, COLS[4]); L.px(round(x0 + w + 3), round(by - y - 2), COLS[4])
            L.rect(round(bx - s['w'] - 2), round(by - 1), round(s['w'] * 2 + 5), 2, COLS[2]); L.rect(round(bx - s['w'] - 1), round(by - 1), 2, 1, COLS[4])

    frames = []
    for f, (an, idx) in enumerate(S.frames):
        L = Layer(W, H)
        for g in groups:
            fb = g['fb']
            if S.marks['warn'] <= f < fb:
                wl = (f - S.marks['warn']) / max(1, fb - S.marks['warn'])
                st = int(wl * 4) + 1
                warn(L, g['m'], f, prog_mask=ell(W, H, g['cx'], g['cy'], r * st / 4, ry * st / 4))
            k = f - fb
            if 0 <= k < 16:
                # aufgeworfene Erde füllt genau den Warnkreis, wird in Stufen dunkler und verschwindet gerastert
                stg = 0 if k < 3 else 1 if k < 8 else 2
                m = g['m']
                if k >= 10:
                    yy, xx = np.mgrid[0:H, 0:W]
                    m = m & (bayer(W, H) >= (k - 9) / 7)
                L.over(m, [COLS[3], COLS[2], COLS[1]][stg], [0.9, 0.75, 0.6][stg])
                L.over(rim(g['m']) & m, COLS[4] if stg == 0 else COLS[2], 1.0)
                if k < 4:
                    light(L, g['cx'], g['cy'] - 2, r + 8, ry + 6, VIO[3], k=[1, 0.8, 0.55, 0.3][k])
        # Figur und Dornen nach Tiefe sortiert
        items = [(foot[1], 'boss')] + [(g['cy'] + 4, g) for g in groups]
        items.sort(key=lambda t: t[0])
        for _, it in items:
            if it == 'boss':
                boss_layer(L, an, idx, foot, cfg)
            else:
                gk = grow(f, it['fb'])
                if gk > 0:
                    spikes(L, it, gk)
                    if f - it['fb'] < 2:   # Leuchtspitzen beim Ausbruch
                        for s in it['sp']:
                            Hh = s['h'] * gk * 0.55
                            L.px(it['cx'] + s['dx'] + s['lean'] * Hh, it['cy'] + s['dy'] - Hh, VIO[4])
        bits.draw(L, f)
        frames.append(L.u8())
    return frames, [g['m'] for g in groups]


def stage_skalvyr(cfg, W, H):
    foot = cfg['foot']
    for a in ['idle', 'callWindup']:
        A_[a] = anim(a)
    S = Seq('idle')
    S.idle_run(10)
    S.mark('warn'); S.play('callWindup', hold=6)
    S.play_frames('callWindup', [6, 5, 4, 3, 2, 1, 0])
    S.mark('rest'); S.idle_end(34)
    CRYS = [hexc(c) for c in ['#0c1826', '#153a62', '#25649c', '#3f9ccf', '#88d4ef', '#dcf8ff', '#ffffff']]
    FROST = [hexc(c) for c in ['#0a3050', '#1670a0', '#34b8e4', '#9aeefc', '#ffffff']]
    SH = hexc('#04020a')
    crack = spr(A['fx']['crackSmall'])
    spots = cfg['spots']; r = 17; ry = 10
    f_hit0 = S.marks['warn'] + 13
    R = rng(11)
    groups = []
    for i, (cx, cy) in enumerate(spots):
        groups.append(dict(cx=cx, cy=cy, m=ell(W, H, cx, cy, r, ry), fh=f_hit0 + i * 2))
    # eigener großer Eiszapfen (Spielpalette): 11 × 30, Licht von links
    ice = Layer(13, 32)
    for y in range(30):
        t = y / 29; hw = 5.6 * (1 - t) ** 0.85 + 0.3
        for x in range(-6, 7):
            if abs(x) <= hw:
                e = x / max(hw, 0.5)
                c = CRYS[5] if e < -0.45 else CRYS[4] if e < 0.05 else CRYS[3] if e < 0.55 else CRYS[2]
                if t > 0.85:
                    c = CRYS[6] if e < 0.3 else CRYS[4]
                ice.px(6 + x, y + 1, c)
    ice.rect(1, 0, 11, 2, CRYS[3]); ice.rect(2, 0, 4, 1, CRYS[5])  # Abbruchkante oben
    ice_img = ice.u8()
    # Umriss
    al = ice_img[..., 3] > 0
    out = np.zeros_like(al)
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        out |= np.roll(np.roll(al, dy, 0), dx, 1)
    ice_img[out & ~al] = (*CRYS[0], 255)
    bits = Bits()
    for g in groups:
        for k in range(14):
            a = R.uniform(math.pi * 1.05, math.pi * 1.95) if k < 10 else R.uniform(0, math.pi)
            sp = R.uniform(1.6, 3.4)
            bits.add(g['fh'] + (1 if k < 7 else 0), g['cx'], g['cy'] - 8 if k < 7 else g['cy'] - 2, math.cos(a) * sp, math.sin(a) * sp * 0.9 - 1.8,
                     g['cy'] + R.uniform(-ry, ry) * 0.8, [CRYS[6], CRYS[4], CRYS[2]], size=3 if k % 4 == 0 else 2, life=7, g=0.75, rest=3)
    top_y = int(H * 0.12) + 2
    frames = []
    for f, (an, idx) in enumerate(S.frames):
        L = Layer(W, H)
        for g in groups:
            k = f - g['fh']
            if S.marks['warn'] <= f < g['fh']:
                warn(L, g['m'], f)
                # Schatten wächst in Stufen (letzte 5 Bilder vor dem Einschlag)
                st = 5 + k
                if st >= 0:
                    s = (st + 1) / 6
                    L.over(ell(W, H, g['cx'], g['cy'], r * s * 0.8, ry * s * 0.8), SH, 0.55)
            if 0 <= k < 18:
                m = g['m']
                if k < 2:
                    L.over(m, CRYS[5], [0.75, 0.45][k]); L.over(rim(m), CRYS[6], 1.0)
                if k < 4:
                    light(L, g['cx'], g['cy'], r + 10, ry + 6, FROST[2], k=[1, 0.8, 0.5, 0.3][k])
                # Frostriss des Spiels
                c = crack['img'].copy()
                if k >= 10:
                    c[bayer(c.shape[1], c.shape[0]) < (k - 9) / 8] = 0
                L.sprite(c, g['cx'] - crack['ax'], g['cy'] - crack['ay'])
        items = [(foot[1], 'boss')] + [(g['cy'], g) for g in groups]
        items.sort(key=lambda t: t[0])
        for _, it in items:
            if it == 'boss':
                boss_layer(L, an, idx, foot, cfg)
                continue
            k = f - it['fh']
            if -4 <= k < 0:
                # fällt: 4 Bilder von oben (Bühnenrand + 12 %) bis zum Boden, Fallstreifen gestuft
                z = [1.0, 0.62, 0.3, 0.08][k + 4]
                yb = it['cy'] - 2 - (it['cy'] - 2 - top_y - 31) * z
                xi = it['cx'] - 6
                L.sprite(ice_img, xi, int(yb) - 31)
            elif 0 <= k < 2:
                # Spitze steckt im Boden, dann zerspringt der Zapfen in Splitter
                cut = [24, 13][k]
                part = ice_img[:cut + 1].copy()
                if k == 1:
                    part[bayer(part.shape[1], part.shape[0]) < 0.5] = 0
                L.sprite(part, it['cx'] - 6, it['cy'] + 2 - cut)
        bits.draw(L, f)
        frames.append(L.u8())
    return frames, [g['m'] for g in groups]


def stage_malgareth(cfg, W, H):
    foot = cfg['foot']
    for a in ['idle_2', 'waveWindup_2', 'wave_2']:
        A_[a] = anim(a)
    S = Seq('idle_2')
    S.idle_run(5)
    S.mark('warn'); S.play('waveWindup_2', hold=2)
    S.mark('wave'); S.play('wave_2', rate=11)
    S.mark('rest'); S.idle_end(22)
    EMB = [hexc(c) for c in ['#1a0a08', '#4a1408', '#8a2a08', '#c8420c', '#f07a1c', '#ffb048', '#fff4c8']]
    ASH = [hexc(c) for c in ['#141012', '#241e1e', '#3a3034', '#5a524c', '#8a8279']]
    fx0, fy = foot
    lanes = []
    for (ex, ey) in cfg['lanes']:
        a0 = np.array([fx0 + 34.0, fy - 14.0]); a1 = np.array([ex, ey], float)
        d = a1 - a0; Lh = np.hypot(*d); u = d / Lh; n = np.array([-u[1], u[0]])
        hw = 13
        m = poly(W, H, [tuple(a0 + n * 7), tuple(a0 + u * 22 + n * hw), tuple(a1 + n * hw), tuple(a1 - n * hw), tuple(a0 + u * 22 - n * hw), tuple(a0 - n * 7)])
        yy, xx = np.mgrid[0:H, 0:W]
        along = (xx + 0.5 - a0[0]) * u[0] + (yy + 0.5 - a0[1]) * u[1]
        lanes.append(dict(a0=a0, u=u, n=n, L=Lh, m=m, along=along, hw=hw))
    f_go = S.marks['wave'] + 1
    speed = 18
    R = rng(5)
    bits = Bits()
    for ln in lanes:
        for s in range(0, int(ln['L']), 7):
            f0 = f_go + s // speed
            p = ln['a0'] + ln['u'] * s + ln['n'] * R.uniform(-ln['hw'], ln['hw'])
            bits.add(f0, p[0], p[1] - 8, R.uniform(-0.5, 0.8), R.uniform(-3.2, -1.6), p[1] - R.uniform(0, 4), [EMB[5], EMB[3]], size=1, life=6, g=0.35, rest=0)
            if s % 21 == 0:
                bits.add(f0, p[0], p[1] - 3, R.uniform(-0.6, 0.6), R.uniform(-2.6, -1.8), p[1], [ASH[4], ASH[2], ASH[1]], size=2, life=6, g=0.8, rest=1)
    frames = []
    B = bayer(W, H)
    NOISE = rng(77).random((H, W))
    for f, (an, idx) in enumerate(S.frames):
        L = Layer(W, H)
        front = (f - f_go) * speed if f >= f_go else -1
        for ln in lanes:
            al = ln['along']; m = ln['m']
            if S.marks['warn'] <= f and front < ln['L']:
                wl = (f - S.marks['warn']) / max(1, f_go - S.marks['warn'])
                prog = m & (al <= ln['L'] * min(1, (int(wl * 4) + 1) / 4))
                warn(L, m & (al > front), f, prog_mask=prog & (al > front), tex=NOISE)
            if f >= f_go:
                # Brandspur: füllt genau die Bahn (frisch glühend → rot → verkohlt → gerastert weg)
                age = f - f_go - np.floor(al / speed)
                passed = m & (al <= front) & (al >= 0)
                for lo, hi, c, a in [(0, 2, EMB[3], 0.8), (2, 5, EMB[2], 0.72), (5, 12, ASH[1], 0.78), (12, 20, ASH[1], 0.62), (20, 27, ASH[0], 0.5)]:
                    mm = passed & (age >= lo) & (age < hi)
                    if hi == 27:
                        mm &= B >= (age - 20) / 7
                    L.over(mm, c, a)
                L.over(passed & (age < 9) & (NOISE < 0.07), EMB[5], 1.0)
                L.over(passed & (age >= 9) & (age < 16) & (NOISE < 0.04), EMB[3], 1.0)
                L.over(rim(m) & passed & (age < 5), EMB[4], 1.0)
        # Wellenkronen (stehen auf dem Boden, nach Tiefe sortiert mit der Figur)
        items = [(fy, 'boss', None)]
        for ln in lanes:
            if f_go <= f and 0 <= front < ln['L'] + speed:
                s_ = min(front, ln['L'] - 1)
                items.append((ln['a0'][1] + ln['u'][1] * s_, 'wave', (ln, s_)))
        items.sort(key=lambda t: t[0])
        for _, kind, dat in items:
            if kind == 'boss':
                boss_layer(L, an, idx, foot, cfg); continue
            ln, s_ = dat
            grow = min(1.0, (f - f_go + 1) / 2)
            fade = 1.0 if front < ln['L'] else 0.55
            p0 = ln['a0'] + ln['u'] * s_
            hw = ln['hw']
            # Wellenkrone als Flammenwand im Seitenprofil: gezackte Flammenzungen, Farbe nach Abstand zur Silhouette in
            # harten Stufen (dunkelroter Saum → orange → gelb → heller Kern), unten wieder dunkler; Glut-/Aschepunkte als Einzelpixel.
            T = 26; Hm = 24 * grow * fade
            for j in range(T - 1, -1, -1):
                sj = s_ - j
                if sj < 0:
                    continue
                c = ln['a0'] + ln['u'] * sj
                x = int(round(c[0])); ym = int(round(c[1])); yb = int(round(c[1] + hw * abs(ln['n'][1])))
                pr = [0.55, 0.8, 0.95, 1.0][j] if j < 4 else math.exp(-(j - 3) / 9.0)
                # Zungen: Sägezahn, Spitzen wandern je Bild, zwei Frequenzen
                ph = (x + f * 2) % 5; ph2 = (x * 3 + f) % 7
                tongue = [7, 3, 0, 1, 4][ph] * (1 if j < 18 else 0.4) + (3 if ph2 == 0 else 0)
                top = int(round(ym - Hm * pr - tongue * grow * fade))
                if top > ym - 1:
                    continue
                for y in range(top, yb + 1):
                    dt = y - top + (1 if NOISE[min(H - 1, max(0, y)), x % W] > 0.7 else 0)
                    db = yb - y
                    if dt < 2 or db < 2:
                        col = EMB[2]
                    elif dt < 5 or db < 5:
                        col = EMB[3] if j > 12 else EMB[4]
                    elif dt < 9 or db < 8:
                        col = EMB[4] if j > 12 else EMB[5]
                    else:
                        col = EMB[5] if (j > 6 or dt > 14 or (x + y) % 5 == 0) else EMB[6]
                    L.px(x, y, col)
            # Funken und Asche über der Krone: Einzelpixel, je Bild neu gestreut
            Rs = rng(1000 + f)
            for k in range(14):
                j = int(Rs.integers(0, 16)); sj = s_ - j
                if sj < 0:
                    continue
                c = ln['a0'] + ln['u'] * sj
                y = int(round(c[1] - Hm * (0.8 + Rs.random() * 0.9) - Rs.integers(0, 10)))
                L.px(int(round(c[0])) + int(Rs.integers(-2, 3)), y, [EMB[6], EMB[5], EMB[4], ASH[4], ASH[3]][k % 5])
        bits.draw(L, f)
        frames.append(L.u8())
    return frames, [ln['m'] for ln in lanes]


# ================================================================== Requisiten
def place_props(L, items, cfg, W, H, depthk=None):
    props = A['props']
    for it in sorted(items, key=lambda t: t[2]):
        key, var, y, x = it[0], it[1], it[2], it[3]
        flip = it[4] if len(it) > 4 else False
        dim = it[5] if len(it) > 5 else 1.0
        s = spr(props[key][var])
        if depthk is not None:
            dim *= depthk(y)
        place_sprite(L, s, x, y, flip=flip, dim=dim, glow=True, gk=dim)


# ================================================================== Bühnendaten
# Servants: 208×156 Weltpixel (4:3), Malgareth 336×252 (4:3). Fuß = Ankerpunkt der Figur.
CFG = {
    'ulgrim': dict(W=208, H=156, wall=52, foot=(80, 141), seed=3, bg='#07080a', dark=[0.55, 0.62, 0.74],
                   rows=[0.55, 0.68, 0.82, 0.95, 1.08, 1.15, 1.15], pool=(0.5, '#5ab4af'), shadow=(38, 7),
                   back=[('ghostBrazier', 0, 58, 26), ('standingStone', 0, 56, 150), ('cairn', 1, 60, 186), ('burialUrn', 0, 57, 112)],
                   front=[('bonePile', 0, 156, 26, False, 0.8), ('bonePile', 1, 158, 62, True, 0.85), ('standingStone', 1, 170, 194, True, 0.7), ('dungeonBones', 2, 152, 108, False, 0.85)],
                   bossDim=1.0, glowK=0.9, stage=stage_ulgrim),
    'rotmother': dict(W=208, H=156, wall=52, foot=(80, 124), seed=5, bg='#08060c', dark=[0.55, 0.62, 0.74],
                      rows=[0.55, 0.68, 0.82, 0.95, 1.08, 1.15, 1.15], pool=(0.5, '#9a6ad0'), shadow=(42, 7),
                      spots=[(148, 124), (165, 98), (134, 72), (44, 74), (44, 122)],
                      back=[('fungalPillar', 0, 56, 22), ('glowMoss', 1, 58, 104), ('sporePod', 0, 57, 176), ('fungalPillar', 1, 56, 196)],
                      front=[('giantMushroom', 1, 172, 14, False, 0.75), ('glowMoss', 0, 155, 108, False, 0.9), ('sporePod', 1, 160, 194, True, 0.8)],
                      bossDim=1.0, glowK=0.9, stage=stage_rotmother),
    'skalvyr': dict(W=208, H=156, wall=52, foot=(76, 136), seed=9, bg='#05080e', dark=[0.55, 0.62, 0.74],
                    rows=[0.55, 0.68, 0.82, 0.95, 1.08, 1.15, 1.15], pool=(0.5, '#7ab8ff'), shadow=(44, 7),
                    spots=[(160, 118), (146, 86), (108, 70), (44, 74), (163, 64)],
                    back=[('icicles', 0, 56, 30), ('iceColumn', 1, 56, 122), ('crystalCluster', 1, 58, 186)],
                    front=[('crystalCluster', 0, 160, 16, False, 0.75), ('snowPile', 1, 157, 116, False, 0.8), ('crystalCluster', 2, 166, 196, True, 0.7)],
                    bossDim=1.0, glowK=0.9, stage=stage_skalvyr),
    'malgareth': dict(W=336, H=252, wall=84, faceRows=3, foot=(110, 222), seed=13, bg='#0a0608', dark=[0.55, 0.62, 0.74],
                      rows=[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.08, 1.15, 1.15, 1.15, 1.15], pool=(0.5, '#ff7a3c'), shadow=(40, 6),
                      lanes=[(292, 194)],
                      back=[('banner', 0, 82, 40), ('banner', 1, 82, 300), ('goldBrazier', 0, 92, 84), ('goldBrazier', 0, 92, 252), ('obsidianPillar', 0, 90, 168)],
                      front=[('goldBrazier', 0, 262, 24, False, 0.8), ('emberCrack', 0, 247, 170, False, 0.9), ('emberCrack', 1, 244, 262, True, 0.9), ('ashStatue', 1, 278, 320, True, 0.7)],
                      bossDim=1.0, glowK=0.9, stage=stage_malgareth),
}


def main():
    cfg = CFG[NAME]; W, H = cfg['W'], cfg['H']
    bg = np.array(hexc(cfg['bg']), np.float64)
    img, crown = build_floor(cfg, W, H)
    K = depth(cfg, W, H, crown)
    # Requisiten an der Wand (in den Boden gebacken, dunkeln mit der Reihe ab)
    back = Layer(W, H)
    place_props(back, cfg['back'], cfg, W, H)
    bk = back.a[..., 3] > 0
    img[bk] = back.a[bk, :3]
    # Lichtinsel um den Boss (zwei feste Stufen) und Zonenfarbe
    fx, fy = cfg['foot']
    pk, pc = cfg['pool']
    pool = np.zeros((H, W)); B = bayer(W, H)
    e1 = ell(W, H, fx + 14, fy - 18, W * 0.52, (H - cfg['wall']) * 0.62)
    e2 = ell(W, H, fx + 10, fy - 10, W * 0.32, (H - cfg['wall']) * 0.38)
    K2 = K * np.where(e2, 1.2, np.where(e1, 1.07, 0.9))
    img = shade(img, K2[..., None] * cfg.get('gain', 1.4), bg)
    tint = np.array(hexc(pc), np.float64)
    img[e2] = img[e2] * 0.9 + tint * 0.1 * 0.6
    # Schattenoval unter dem Boss: Kern und Rand (Raster), keine Verläufe
    rx, ry = cfg['shadow']
    so = ell(W, H, fx, fy + 1, rx, ry); si = ell(W, H, fx, fy + 1, rx * 0.72, ry * 0.7)
    img[si] = shade(img[si], 0.3, bg)
    ring = so & ~si
    img[ring & (B < 0.5)] = shade(img[ring & (B < 0.5)], 0.45, bg)
    img[ring & (B >= 0.5)] = shade(img[ring & (B >= 0.5)], 0.62, bg)
    boden = np.clip(np.round(img), 0, 255).astype(np.uint8)

    frames, masks = cfg['stage'](cfg, W, H)
    # Vorderebene
    vorn = Layer(W, H)
    place_props(vorn, cfg['front'], cfg, W, H)
    vorn = vorn.u8()

    n = len(frames)
    if n * W > 16383:
        raise SystemExit(f'{NAME}: {n} Bilder × {W} px = {n * W} px Streifenbreite > 16383 (WebP-Grenze)')
    strip = np.concatenate(frames, axis=1)
    Image.fromarray(boden).save(f'{OUT}/boss-{NAME}-boden.webp', lossless=True, method=6)
    Image.fromarray(strip, 'RGBA').save(f'{OUT}/boss-{NAME}-kampf.webp', lossless=True, method=6, exact=False)
    Image.fromarray(vorn, 'RGBA').save(f'{OUT}/boss-{NAME}-vorn.webp', lossless=True, method=6)

    def comp(i):
        im = Image.fromarray(boden).convert('RGBA')
        im.alpha_composite(Image.fromarray(frames[i], 'RGBA')); im.alpha_composite(Image.fromarray(vorn, 'RGBA'))
        return im
    comp(0).convert('RGB').save(f'{OUT}/boss-{NAME}-bild.webp', lossless=True, method=6)

    # Kontrolle: Grenzen der Angriffe (12 %) prüfen
    mx, my = int(W * 0.12), int(H * 0.12)
    viol = []
    for k, m in enumerate(masks):
        ys, xs = np.nonzero(m)
        if xs.min() < mx or xs.max() >= W - mx or ys.min() < my or ys.max() >= H - my:
            viol.append((k, int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())))
    # Effekte außerhalb der Bossfigur: Bildpunkte im Randstreifen (ohne Boss) zählen
    # Vorschau
    import os
    os.makedirs(f'{ZW}/{NAME}', exist_ok=True)
    big = [comp(i).resize((W * 3, H * 3), Image.NEAREST) for i in range(n)]
    big[0].save(f'{ZW}/vorschau-{NAME}.webp', save_all=True, append_images=big[1:], duration=int(1000 / FPS), loop=0, lossless=True, method=0)
    sel = list(range(0, n, 3)); cols = 6; rows = (len(sel) + cols - 1) // cols
    sh = Image.new('RGB', (cols * (W * 2 + 4), rows * (H * 2 + 4)), (255, 0, 255))
    for j, i in enumerate(sel):
        sh.paste(comp(i).convert('RGB').resize((W * 2, H * 2), Image.NEAREST), ((j % cols) * (W * 2 + 4), (j // cols) * (H * 2 + 4)))
    sh.save(f'{ZW}/kontakt-{NAME}.png')
    for i in range(n):
        big[i].convert('RGB').save(f'{ZW}/{NAME}/v{i:03d}.png')

    meta = json.load(open(MASSE)) if os.path.exists(MASSE) else {}
    meta[NAME] = {'w': W, 'h': H, 'frames': n, 'fps': FPS, 'foot': {'x': cfg['foot'][0], 'y': cfg['foot'][1]}}
    order = ['ulgrim', 'rotmother', 'skalvyr', 'malgareth']
    meta = {k: meta[k] for k in order if k in meta} | {k: v for k, v in meta.items() if k not in order}
    json.dump(meta, open(MASSE, 'w'), indent=1); open(MASSE, 'a').write('\n')
    kb = lambda p: os.path.getsize(p) / 1024
    print(f'{NAME}: {W}×{H}, {n} Bilder ({n / FPS:.2f} s), Streifen {kb(f"{OUT}/boss-{NAME}-kampf.webp"):.0f} KB, '
          f'Boden {kb(f"{OUT}/boss-{NAME}-boden.webp"):.0f} KB, vorn {kb(f"{OUT}/boss-{NAME}-vorn.webp"):.0f} KB, '
          f'Bild {kb(f"{OUT}/boss-{NAME}-bild.webp"):.0f} KB; Farben im Streifen {len(np.unique(strip.reshape(-1, 4), axis=0))}'
          + (f'; WARNUNG Rand: {viol}' if viol else '; Warnflächen im 12-%-Rahmen'))


main()
