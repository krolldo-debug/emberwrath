# Hintergründe des Intro-Films „Die Stimme im Thron“ (src/intro/film.js) in Szenenpixeln; das Spiel zeichnet sie ×2 ins
# Feinraster (1280 × 544, Kinoformat 2,35:1), die Figuren (Malgareth, Könige, der eigene Held) kommen live aus dem Spiel.
# Stil wie die Startseite (site/tools/titel_kit.py): harte Rampen, Bayer-Raster, keine weichen Verläufe, kein Alpha.
# Ebenen mit Lücken (Vordergründe) als WebP mit harter Deckmaske. Aufruf:  python3 tools/intro/szenen.py [ZIEL]
# Ziel: src/intro/media. Gibt Dateigrößen aus. Anker der Figuren stehen als ANKER in film.js (hier nur genannt).
import sys, os, math, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../site/tools'))
import numpy as np
from PIL import Image
from titel_kit import *

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '../../src/intro/media')
os.makedirs(OUT, exist_ok=True)
sizes = {}


def grid(w, h):
    return np.mgrid[0:h, 0:w]


def save_rgb(c, name):
    p = os.path.join(OUT, name + '.webp')
    Image.fromarray(c).save(p, lossless=True, method=6)
    sizes[name] = os.path.getsize(p)


def save_rgba(c, m, name):
    a = np.dstack([c, (m * 255).astype(np.uint8)])
    p = os.path.join(OUT, name + '.webp')
    Image.fromarray(a, 'RGBA').save(p, lossless=True, method=6, exact=True)
    sizes[name] = os.path.getsize(p)


def H(h): return hexc(h)


def halo_into(c, yy, xx, cx, cy, rx, ry, cols, add=False, mask=None):
    b = BAYER[yy & 3, xx & 3]
    d = np.hypot((xx - cx) / rx, (yy - cy) / ry)
    n = len(cols)
    for i, col in enumerate(cols):
        m = d + (b - 0.5) * 0.06 < 1 - i / n
        if mask is not None: m &= mask
        c[m] = mix(c[m], col, add)


def chain(c, p0, p1, sag, lit_fn, seed=0):
    x0, y0 = p0; x1, y1 = p1
    n = int(math.hypot(x1 - x0, y1 - y0) / 2.6)
    h, w = c.shape[:2]
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t + math.sin(t * math.pi) * sag
        li = lit_fn(x, y)
        col = ['#0c070c', '#1c1014', '#34201a', '#56301c', '#80481e', '#a86628'][min(5, int(li * 6.5))]
        dark = ['#050306', '#0c070c', '#1c1014', '#34201a', '#56301c', '#80481e'][min(5, int(li * 6.5))]
        xi, yi = int(x), int(y)
        cells = [(0, 0), (1, 0), (2, 0), (0, -1), (2, -1), (0, 1), (2, 1)] if i % 2 else [(0, -1), (0, 0), (0, 1), (1, -1), (1, 1)]
        for dx, dy in cells:
            if 0 <= yi + dy < h and 0 <= xi + dx < w: c[yi + dy, xi + dx] = H(col if dy <= 0 else dark)


# ---------------------------------------------------------------- gemeinsame Halle
WALL = ramp('#040207', '#080410', '#0e0614', '#170a16', '#221016', '#321614', '#462014', '#5c2a16')
HALO = [H('#2a0e12'), H('#3e1412'), H('#561c10'), H('#6e2610')]


def halo_fire(c, yy, xx, cx, cy, rx, ry, cols, add, seed=3):
    """Lichthof der Krone: harte Bänder, Rand wie Flammen (Rauschen auf dem Radius)."""
    b = BAYER[yy & 3, xx & 3]
    ang = np.arctan2(yy - cy, xx - cx)
    wob = 0.12 * (fbm(ang * 3 + 9, 0.5, seed, 3) - 0.5) + 0.08 * (fbm(ang * 9 + 3, 1.5, seed + 1, 2) - 0.5)
    d = np.hypot((xx - cx) / rx, (yy - cy) / ry) + wob
    n = len(cols)
    for i, col in enumerate(cols):
        m = d + (b - 0.5) * 0.05 < 1 - i / n
        c[m] = mix(c[m], col, add)


def hall(w, h, cx, cy, lit_r, light, floor_y, seed=1):
    """Dunkle Thronhalle, nur im Licht der Krone (cx, cy) sichtbar. light 0..1 = Stärke (Flackern)."""
    yy, xx = grid(w, h)
    c = np.zeros((h, w, 3), np.uint8)
    lit = np.clip(1 - np.hypot((xx - cx) / (lit_r * 1.45), (yy - cy) / (lit_r * 1.05)), 0, 1) ** 0.9 * (0.9 + 0.12 * light)
    stone = 0.07 * fbm(xx / 7, yy / 7, 21 + seed, 3) + 0.05 * (hash2(xx // 2, yy // 2, 5) - 0.5)
    c[:] = quant(lit * 1.05 + stone, WALL)
    row = yy // 12
    joint = (yy % 12 == 0) | (((xx + row * 9) % 22) == 0)
    jl = joint & (lit > 0.12) & (yy < floor_y)
    c[jl] = quant(lit * 0.6, ramp('#040207', '#06030a', '#0a050e', '#120810', '#1a0c10', '#24100e'))[jl]
    top = (yy % 12 == 1) & (lit > 0.25) & (yy < floor_y) & ~joint
    c[top] = quant(lit * 1.15 + 0.08, WALL)[top]
    # Spitzbogen-Nische hinter dem Thron: dunkler, mit gemeißeltem Rand
    aw = lit_r * 0.62; ab = floor_y; at = cy - lit_r * 0.75
    rel = np.abs(xx - cx) / aw
    arch_top = at + (aw * 0.9) * (1 - np.sqrt(np.clip(1 - (1 - rel) ** 2, 0, 1)))
    inside = (rel < 1) & (yy > arch_top) & (yy < ab)
    c[inside] = quant(lit * 0.55 + stone * 0.5, WALL)[inside]
    rim = (rel < 1.08) & (yy > arch_top - 4) & (yy < ab) & ~inside
    c[rim] = quant(lit * 1.25 + 0.05, WALL)[rim]
    c[rim & ((yy + xx) % 7 == 0)] = quant(lit * 0.7, WALL)[rim & ((yy + xx) % 7 == 0)]
    # Pfeiler mit Kapitell
    for px_ in (cx - lit_r * 1.05, cx + lit_r * 1.05):
        px_ = int(px_)
        pm = (np.abs(xx - px_) <= 14) & (yy < floor_y)
        pl = np.clip(1 - np.hypot((xx - cx) / (lit_r * 1.7), (yy - cy) / (lit_r * 1.2)), 0, 1)
        sh = np.clip(pl * (0.75 + 0.5 * ((xx - px_) * np.sign(cx - px_) / 14)), 0, 1)
        c[pm] = quant(sh, ramp('#030106', '#08040c', '#100812', '#1c0e14', '#2c1612', '#402014'))[pm]
        cap = (np.abs(xx - px_) <= 18) & (np.abs(yy - (cy - lit_r * 0.6)) <= 3)
        c[cap] = quant(pl * 1.1, ramp('#06030a', '#140a10', '#2a1612', '#462414'))[cap]
        flute = pm & (((xx - px_) % 6) == 0)
        c[flute] = quant(sh * 0.6, ramp('#030106', '#08040c', '#100812', '#1c0e14'))[flute]
    # Banner (zerschlissen) zwischen Nische und Pfeilern
    for bx in (cx - lit_r * 0.82, cx + lit_r * 0.82):
        bx = int(bx); bt = int(cy - lit_r * 0.55); bl = int(lit_r * 0.9)
        L = bl - (np.abs(xx - bx) * 0.9) - (hash2(xx // 2, 3, 77) * 10)
        bm = (np.abs(xx - bx) <= 11) & (yy >= bt) & (yy < bt + L)
        bsh = np.clip(np.clip(1 - np.hypot((xx - cx) / (lit_r * 1.5), (yy - cy) / (lit_r * 1.1)), 0, 1) * (0.8 + 0.35 * np.sin((xx - bx) / 3.2)), 0, 1)
        c[bm] = quant(bsh, ramp('#080208', '#1a0408', '#30080a', '#4a0e0c', '#6a1810', '#8a2414'))[bm]
        c[(np.abs(xx - bx) <= 13) & (yy == bt)] = H('#3a2416')
        emb = bm & (np.abs(xx - bx) <= 3) & (np.abs(yy - bt - 22) <= 4) & ((np.abs(xx - bx) + np.abs(yy - bt - 22)) % 3 == 0)
        c[emb] = H('#8a5a20')
    # Boden: Platten in Fluchtlinien
    fm = yy >= floor_y
    fl = np.clip(1 - np.hypot((xx - cx) / (lit_r * 1.7), (yy - floor_y - 10) / (lit_r * 0.55)), 0, 1) * (0.9 + 0.12 * light)
    c[fm] = quant(fl * 1.0 + 0.05 * fbm(xx / 10, yy / 3, 31, 2), ramp('#030106', '#07040a', '#0e0810', '#180c12', '#261212', '#341810', '#46200e'))[fm]
    dep = (yy - floor_y + 6.0)
    fx = (xx - cx) / np.maximum(dep, 1) * 6
    gl = fm & ((np.abs(fx - np.round(fx / 14) * 14) < 0.35) | ((np.log(np.maximum(dep, 1)) * 9) % 3 < 0.25)) & (fl > 0.1)
    c[gl] = quant(fl * 0.55, ramp('#030106', '#06030a', '#0c060e', '#140a10', '#1c0e10'))[gl]
    c[(yy == floor_y) & (lit > 0.08)] = H('#3a1a12')
    return c, yy, xx, lit


GLYPHS = [
    ['.X.', 'XXX', '.X.', '.X.', 'X.X'], ['X.X', '.X.', 'XXX', '.X.', '.X.'], ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
    ['.XX', 'X..', '.X.', '..X', 'XX.'], ['X..', 'XX.', 'X.X', 'XX.', 'X..'], ['XXX', '..X', '.X.', 'X..', 'XXX'],
    ['X.X', 'X.X', '.X.', 'X.X', 'X.X'], ['.X.', 'X.X', 'X.X', 'X.X', '.X.'],
]


def runes(c, cx, cy, rx, ry, n, col_fn, seed=0, dead=None):
    """Runen als kleine Zeichen entlang der Ellipse. col_fn(i) -> Farbe oder None; dead(i) -> erloschen."""
    h, w = c.shape[:2]
    for i in range(n):
        a = i / n * math.tau
        x0 = int(round(cx + math.cos(a) * rx)) - 1; y0 = int(round(cy + math.sin(a) * ry)) - 2
        g = GLYPHS[(i * 5 + seed) % len(GLYPHS)]
        col = col_fn(i)
        if col is None: continue
        for gy, row in enumerate(g):
            for gx, ch in enumerate(row):
                if ch == 'X' and 0 <= y0 + gy < h and 0 <= x0 + gx < w: c[y0 + gy, x0 + gx] = col


def crack_paths(seed, n, rx, ry):
    """Feste Rissbahnen (gerade Stücke, Knicke, Äste) als Punktlisten relativ zur Mitte."""
    rng = np.random.default_rng(seed)
    paths = []
    for k in range(n):
        a = k / n * math.tau + rng.normal(0, 0.25)
        x, y = math.cos(a) * rx * 0.05, math.sin(a) * ry * 0.05
        pts = []; ang = a
        while (x / rx) ** 2 + (y / ry) ** 2 < 1.15:
            run = 3 + int(rng.random() * 8)
            for _ in range(run):
                pts.append((x, y)); x += math.cos(ang) * 1.0; y += math.sin(ang) * ry / rx
            ang = a + rng.normal(0, 0.45)
            if rng.random() < 0.25 and len(pts) > 10:
                b = ang + rng.choice([-1, 1]) * (0.6 + rng.random() * 0.5); bx, by = x, y; br = []
                for _ in range(6 + int(rng.random() * 12)):
                    br.append((bx, by)); bx += math.cos(b); by += math.sin(b) * ry / rx; b += rng.normal(0, 0.2)
                paths.append((br, len(pts)))
        paths.append((pts, 0))
    return paths


def seal(c, yy, xx, cx, fy, rx, ry, glow, cracks=0.0, seed=4, dead=0.0):
    """Siegelring am Boden. glow 0..1 Leuchtkraft, cracks 0..1 Fortschritt der Risse, dead 0..1 Anteil erloschener Runen."""
    hot = ['#2a100e', '#3a1410', '#5a1c10', '#7a2a0e', '#a83a0e', '#c8460e', '#f07a1c', '#ffb640', '#fff0b0']
    g = lambda k: H(hot[max(0, min(len(hot) - 1, int(round(k))))])
    for r, wv, base in [(1.0, 1.2, 5.0), (0.84, 0.9, 3.5)]:
        d = np.hypot((xx - cx) / (rx * r), (yy - fy) / (ry * r))
        ring = (np.abs(d - 1) < 0.018 * wv * max(1, 60 / ry))
        c[ring] = g(base * glow + 0.6)
    n = max(12, int(rx / 5.5))
    off = int(dead * n)
    runes(c, cx, fy, rx * 0.92, ry * 0.92, n, lambda i: g(1) if (i - n // 2) % n < off else g(6.5 * glow + 1), seed)
    if cracks > 0:
        for pts, start in crack_paths(seed, 7, rx * 0.9, ry * 0.9):
            m = int(len(pts) * cracks) if start == 0 else int(len(pts) * max(0, cracks * 1.6 - 0.6))
            for s_, (x, y) in enumerate(pts[:m]):
                xi, yi = int(cx + x), int(fy + y)
                h, w = c.shape[:2]
                if 0 <= yi < h and 0 <= xi < w:
                    tip = s_ > m - 5 and cracks < 1
                    c[yi, xi] = g(8 if tip else 6 * glow + 1.5)
                    if start == 0 and s_ < len(pts) * 0.5 and xi + 1 < w: c[yi, xi + 1] = g(4.5 * glow + 1)


def embers(c, n, seed, cols, y0=0, y1=None):
    rng = np.random.default_rng(seed)
    h, w = c.shape[:2]; y1 = y1 or h
    for _ in range(n):
        x, y = int(rng.random() * w), int(y0 + rng.random() * (y1 - y0))
        c[y, x] = H(cols[int(rng.random() * len(cols))])


# ================================================================ Einstellung 2: Halle weit (Schwenk), 3 Lichtstufen
# Malgareth steht ×1 (Feinraster) mit den Füßen bei (HW_CX, HW_FY) Szenenpixeln, Krone etwa 112 Szenenpixel darüber.
HW_W, HW_H, HW_CX, HW_FY = 720, 272, 360, 226
for k, light in enumerate((0.0, 0.5, 1.0)):
    c, yy, xx, lit = hall(HW_W, HW_H, HW_CX, HW_FY - 112, 150, light, 214)
    halo_fire(c, yy, xx, HW_CX, HW_FY - 116, 48 + 4 * light, 38 + 3 * light, HALO, add=0.45 + 0.1 * light)
    seal(c, yy, xx, HW_CX, HW_FY, 150, 24, 0.55 + 0.1 * light)
    lf = lambda x, y: max(0.0, 1 - math.hypot((x - HW_CX) / 200, (y - (HW_FY - 112)) / 150))
    for (a, b, s) in [((HW_CX - 300, -4), (HW_CX - 140, HW_FY - 4), 30), ((HW_CX + 300, -4), (HW_CX + 140, HW_FY - 4), 30),
                      ((HW_CX - 210, -4), (HW_CX - 120, HW_FY - 2), 14), ((HW_CX + 210, -4), (HW_CX + 120, HW_FY - 2), 14)]:
        chain(c, a, b, s, lf)
    # Ösen am Ring
    for ox in (-140, 140, -120, 120):
        c[HW_FY - 6:HW_FY - 1, HW_CX + ox - 1:HW_CX + ox + 2] = H('#3a1c14')
    embers(c, 50, 11 + k, ['#3a1a14', '#5a2010'])
    save_rgb(c, f'halle-{k}')

# ================================================================ Einstellung 3 + 6: Halle nah (Malgareth ×2), hoch für die Neigung
# Füße bei (HN_CX, HN_FY) Szenenpixeln (unter dem Bildrand), Krone etwa 228 Szenenpixel darüber. Höhe 360: die Kamera
# beginnt oben an der Krone (Einstellung 3) und steht in Einstellung 6 unten (y 88).
HN_W, HN_H, HN_CX, HN_FY = 720, 360, 400, 384
for name, light, cracks in [('nah-ruhe', 0.0, 0.0), ('nah-wach', 1.0, 1.0)]:
    c, yy, xx, lit = hall(HN_W, HN_H, HN_CX, HN_FY - 232, 210, light, 318)
    cols = HALO if light < 0.5 else [H('#3a1210'), H('#5a1a10'), H('#7a2610'), H('#9a3410'), H('#c04a12')]
    halo_fire(c, yy, xx, HN_CX, HN_FY - 236, 80 + 10 * light, 64 + 8 * light, cols, add=0.5 + 0.15 * light)
    seal(c, yy, xx, HN_CX, HN_FY - 30, 230, 34, 0.55 + 0.45 * light, cracks)
    lf = lambda x, y: max(0.0, 1 - math.hypot((x - HN_CX) / 260, (y - (HN_FY - 232)) / 190))
    for (a, b, s) in [((0, 30), (HN_CX - 200, 330), 26), ((HN_W - 1, 10), (HN_CX + 200, 330), 26), ((60, -4), (HN_CX - 150, 326), 12)]:
        chain(c, a, b, s, lf)
    embers(c, 90, 21, ['#3a1a14', '#7a2a10'] + (['#f07a1c', '#ffb640'] if light else []))
    save_rgb(c, name)

# ================================================================ Einstellung 5: das Siegel von oben, Risse in 8 Stufen
SG_W, SG_H, SG_CX, SG_CY = 640, 272, 320, 150
for f in range(8):
    k = f / 7
    yy, xx = grid(SG_W, SG_H)
    c = np.zeros((SG_H, SG_W, 3), np.uint8)
    fl = np.clip(1 - np.hypot((xx - SG_CX) / 330, (yy - SG_CY) / 150), 0, 1)
    c[:] = quant(fl * (0.55 + 0.4 * k) + 0.05 * fbm(xx / 12, yy / 6, 41, 2), ramp('#030106', '#07040a', '#0e0810', '#180c12', '#261212', '#341810'))
    # Bodenplatten: Ringe und Speichen um das Siegel
    rr = np.hypot((xx - SG_CX) / 270, (yy - SG_CY) / 104)
    aa = np.arctan2((yy - SG_CY) / 104, (xx - SG_CX) / 270)
    j = ((np.abs((rr * 6) - np.round(rr * 6)) < 0.03 * (1 + rr)) | (np.abs(((aa / math.tau * 24) % 1) - 0.5) > 0.47)) & (rr > 0.18)
    c[j & (fl > 0.05)] = H('#05020a')
    c[(rr < 0.18) & (rr > 0.16)] = H('#2a1210')
    glow = 1.0 - 0.55 * min(1, k * 1.3) if f < 6 else 0.6 + (f - 5) * 0.2
    seal(c, yy, xx, SG_CX, SG_CY, 270, 104, glow, cracks=min(1.0, k * 1.15), seed=9, dead=min(1.0, k * 1.2))
    if f >= 6:
        halo_into(c, yy, xx, SG_CX, SG_CY, 50 + 50 * (f - 6), 20 + 20 * (f - 6), [H('#5a1c10'), H('#a83a0e'), H('#f07a1c'), H('#ffd070'), H('#fff4d0')], add=0.65)
    save_rgb(c, f'siegel-{f}')

# ================================================================ Einstellung 4: Erinnerung im Feuer (Sturm auf den Thron), zweifarbig rot
# Malgareth (Schattenriss) steht auf dem Thron bei (ER_TX, 120); die Könige laufen live davor.
ER_W, ER_H, ER_TX, HOR = 800, 272, 470, 176
S = Scene(ER_W, ER_H, 1)
yy, xx = S.grid()
sky(S, ramp('#050209', '#0d0514', '#1e0a1e', '#40141a', '#742a10', '#8e3a10'), 0, HOR)
for sd, yc, th in [(41, 36, 0.56), (42, 92, 0.54), (43, 140, 0.55)]:
    cl = fbm(xx / 140 + yy / 300, (yy - yc) / 13, sd, 5) - np.abs(yy - yc) / 50
    cm = (cl > th - 0.25) & (yy < HOR)
    S.c[cm] = quant(np.clip((cl - th + 0.25) * 4, 0, 1), ramp('#150912', '#200c16', '#2e1018'))[cm]
    S.c[cm & ~np.roll(cm, -1, 0)] = H('#6a2410')
halo(S, ER_TX, 70, 150, 120, [H('#4a1612'), H('#5e1e12'), H('#782a10'), H('#963a10'), H('#b84e12')], mask=(yy < HOR + 10))
ridge(S, HOR, 18, 60, 11, H('#120810'))
for i, (hw, top) in enumerate([(150, 168), (120, 156), (92, 144), (66, 132), (44, 120)]):
    m = (np.abs(xx - ER_TX) <= hw) & (yy >= top)
    S.c[m] = H(['#140a10', '#1a0c12', '#200e14', '#281016', '#30121a'][i])
    S.c[(np.abs(xx - ER_TX) <= hw) & (yy == top)] = H(['#5a1e12', '#6a2412', '#7a2a12', '#8e3412', '#a84012'][i])
st = (np.abs(xx - ER_TX) <= 16) & (yy >= 120) & (yy < 200)
S.c[st] = np.where(((yy[st] - 120) % 4 == 0)[:, None], H('#7a2c12'), H('#2c1016'))
fg = yy >= 196 + (line1d(ER_W, 14, 40, 3)[None, :] * 10).astype(int)
S.c[fg] = quant(0.3 + 0.3 * fbm(xx / 30, yy / 10, 15, 3), ramp('#0c060a', '#120810', '#180a12', '#1e0c12'))[fg]
d1, d2, _ = voronoi_xy(xx * 1.0, yy * 2.6, 26, 16)
crack = fg & (d2 - d1 < 0.04) & (yy > 204) & (fbm(xx / 50, yy / 20, 17, 3) > 0.56)
S.c[crack] = H('#5a1e10'); S.c[crack & (d2 - d1 < 0.015)] = H('#a83c10')
# zweifarbig: Helligkeit -> Erinnerungsrampe (Glut auf Schwarz)
lum = S.c.astype(float) @ np.array([0.3, 0.55, 0.15]) / 255
MEM = ramp('#050102', '#14040a', '#2a0808', '#4a0e08', '#7a1a0a', '#b0300c', '#e05a14', '#ffa040', '#ffe0a0')
c = quant(np.clip(lum * 2.1, 0, 1), MEM)
save_rgb(c, 'erinnerung')

# ================================================================ Einstellung 7: die Glutsenke bei Nacht, Asche fällt
# Der Held steht live auf der Anhöhe (film.js HERO_X/HERO_Y, Kuppe bei x 400) und blickt nach links zum Aschegrat.
GS_W, GS_H, HOR = 720, 272, 150
S = Scene(GS_W, GS_H, 1)
yy, xx = S.grid()
sky(S, ramp('#06030c', '#0a0512', '#100718', '#18091c', '#220c1c', '#30101a', '#421616', '#561e12'), 0, HOR + 2)
stars(S, (yy < 60), 0.003, 7, [H('#4a3a5a'), H('#7a6a90')])
for sd, yc, th in [(51, 46, 0.55), (52, 100, 0.53)]:
    cl = fbm(xx / 120 + yy / 300, (yy - yc) / 12, sd, 5) - np.abs(yy - yc) / 46
    cm = (cl > th - 0.25) & (yy < HOR)
    S.c[cm] = quant(np.clip((cl - th + 0.25) * 4, 0, 1), ramp('#0e0612', '#160914', '#200c16'))[cm]
    S.c[cm & ~np.roll(cm, -1, 0)] = H('#3a1414')
# Aschegrat links: Kegel mit glühendem Gipfel, Rauchsäule
VX, VT = 170, 64
x1 = np.arange(GS_W)
prof = np.round(VT + np.abs(x1 - VX) * 0.62 + (line1d(GS_W, 61, 8, 3) - 0.5) * 6).astype(int)
vm = (yy >= prof[None, :]) & (yy <= HOR + 6)
S.c[vm] = H('#120810'); S.c[vm & (xx > VX) & (gb_ := (BAYER[yy & 3, xx & 3] < 0.35))] = H('#180a12')
halo(S, VX, VT + 2, 40, 22, [H('#3a1214'), H('#5a1a12'), H('#7a2610')], add=0.5, mask=(yy < VT + 10))
lava = np.zeros_like(vm); lava2 = np.zeros_like(vm)
for i, (dx, drift) in enumerate(((-2, -0.35), (1, 0.05), (4, 0.4))):
    xx_ = float(VX + dx); yv = VT
    rng = np.random.default_rng(70 + i); seg = 0; dirx = drift
    while yv < HOR and 0 <= xx_ < GS_W:
        if seg <= 0: seg = 3 + int(rng.random() * 6); dirx = drift + rng.normal(0, 0.55)
        xi = int(round(xx_))
        if vm[int(yv), xi]:
            lava[int(yv), xi] = True
            if yv > VT + 12 and rng.random() < 0.5: lava2[int(yv), xi + (1 if dirx > 0 else -1)] = True
        yv += 1; xx_ += dirx; seg -= 1
S.c[lava2 & vm] = H('#7a2a10')
S.c[lava] = H('#c8460e'); S.c[lava & (yy < VT + 24)] = H('#f07a1c'); S.c[lava & (yy < VT + 10)] = H('#ffb640')
S.c[(yy >= VT - 1) & (yy <= VT + 1) & (np.abs(xx - VX) < 6)] = H('#ffd070')
plume = (fbm(xx / 16, yy / 12, 71, 4) > 0.44) & (yy < VT - 2) & (np.abs(xx - VX - (VT - yy) * 0.6) < 8 + (VT - yy) * 0.55)
S.c[plume] = quant(np.clip((VT - yy) / 64, 0, 1), ramp('#4a1a16', '#2e1418', '#1c0e16', '#140a12'))[plume]
S.c[plume & ~np.roll(plume, 1, 1) & (yy > VT - 30)] = H('#7a2a14')
# ferne Hügel
ridge(S, HOR + 2, 10, 50, 62, H('#0e0610'))
# Talboden und Anhöhe rechts
ground = yy >= HOR + 4 + (line1d(GS_W, 63, 60, 3)[None, :] * 6).astype(int)
S.c[ground] = quant(0.25 + 0.3 * fbm(xx / 24, yy / 8, 64, 3) + (yy - HOR) / 400, ramp('#0a050a', '#100810', '#160a12', '#1c0c12'))[ground]
hill = yy >= np.round(216 - 30 * np.clip(1 - ((x1 - 400) / 170) ** 2, 0, 1) + (line1d(GS_W, 65, 12, 3) - 0.5) * 3).astype(int)[None, :]
S.c[hill] = quant(0.3 + 0.25 * fbm(xx / 10, yy / 6, 66, 3), ramp('#060306', '#0a050a', '#100810'))[hill]
S.c[hill & ~np.roll(hill, 1, 0)] = H('#3a1c16')
# Dorf der Glutsenke in der Mitte: Dächer, warme Fenster
rng = np.random.default_rng(5)
for i in range(9):
    hx = 250 + i * 22 + int(rng.normal(0, 4)); hb = HOR + 26 + int(rng.random() * 8); hw = 8 + int(rng.random() * 6); hh = 8 + int(rng.random() * 5)
    body = (np.abs(xx - hx) <= hw) & (yy <= hb) & (yy > hb - hh)
    roof = (yy <= hb - hh) & (yy > hb - hh - hw) & (np.abs(xx - hx) <= hw - (hb - hh - yy))
    S.c[body | roof] = H('#0c060c'); S.c[roof & ~np.roll(roof, 1, 0)] = H('#2a1414')
    for wx in (hx - hw // 2, hx + hw // 2 - 1):
        if rng.random() < 0.7: S.c[hb - hh + 3:hb - hh + 5, wx:wx + 2] = H('#ffb640'); S.c[hb - hh + 4, wx] = H('#f07a1c')
# Glutspalten im Talboden
d1, d2, _ = voronoi_xy(xx * 1.0, yy * 3.0, 30, 67)
cr = ground & ~hill & (d2 - d1 < 0.04) & (fbm(xx / 40, yy / 20, 68, 3) > 0.52)
S.c[cr] = H('#7a2a10'); S.c[cr & (d2 - d1 < 0.015)] = H('#c8460e')
save_rgb(S.c, 'glutsenke')

print(json.dumps({k: f'{v / 1024:.1f} KB' for k, v in sizes.items()}, indent=1))
print('Summe', f'{sum(sizes.values()) / 1024:.0f} KB')
