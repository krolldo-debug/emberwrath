# Weltkarte „Atlas“ (Aufruf über atlas.mjs): python3 atlas.py ZWISCHEN IMG
# Blätter = echte Gebietskarten des Spiels (3 Bildpunkte je Kachel), harter Schatten, gedämpfter Glutrahmen in drei
# Bändern (atlas.js zeichnet beim Erreichen den hellen Rahmen darüber), dunkler Glutpfad (atlas.js lässt ihn beim
# Scrollen aufglühen). Unter dem Aschethron reißt der Grund auf, dahinter Sternenhimmel mit den Gebieten der
# Sternenglut hinter einem gerasterten Schleier. Alles in ganzen Bildpunkten, harte Rampen, Bayer-Raster.
import sys, json, os
import numpy as np
from PIL import Image
from titel_kit import BAYER, hexc, ramp, quant, hash2, vnoise, fbm

TMP, IMG = sys.argv[1], sys.argv[2]
W, H = 1000, 2590
RISS = 1620   # Oberkante des Risses zwischen Glutwelt und Sternenhimmel

# id, x, y, Name (wie die Etappe auf der Seite), Stufen, Sprungziel (id der Etappe), Sternenglut
ZONEN = [
    ('emberhollow', 70, 50, 'Glutsenke', '1–5', 'glutsenke', False),
    ('ashwood', 540, 40, 'Der Aschenwald', '6–11', 'aschenwald', False),
    ('cinder_peaks', 576, 480, 'Die Schlackenhöhen', '12–17', 'schlackenhoehen', False),
    ('ashen_steppe', 40, 420, 'Die Aschensteppe', '20–25', 'aschensteppe', False),
    ('blighted_marsh', 40, 850, 'Die Faulmarsch', '25–31', 'faulmarsch', False),
    ('frostspire', 516, 850, 'Die Frostzinnen', '31–36', 'frostzinnen', False),
    ('ember_wastes', 480, 1250, 'Die Glutöde', '36–40', 'gluetoede', False),
    ('ashen_throne', 130, 1260, 'Der Aschethron', '40', 'aschethron', False),
    ('splitterweiten', 40, 1720, 'Die Splitterweiten', 'Bald', None, True),
    ('drifting_gardens', 360, 2170, 'Die Treibenden Gärten', 'Bald', None, True),
]
# Verbindungen: (von, Seite, nach, Seite) in Reiseordnung
WEG = [(0, 'r', 1, 'l'), (1, 'b', 2, 't'), (2, 'l', 3, 'r'), (3, 'b', 4, 't'), (4, 'r', 5, 'l'), (5, 'b', 6, 't'),
       (6, 'l', 7, 'r'), (7, 'b', 8, 't'), (8, 'r', 9, 't')]

yy, xx = np.mgrid[0:H, 0:W]
gb = BAYER[yy & 3, xx & 3]
c = np.zeros((H, W, 3), np.uint8)

# ---------- Grund: Asche oben, gerasterte Flecken; unten Sternenhimmel, nach unten heller (Morgenschimmer)
n = fbm(xx / 140.0, yy / 140.0, 3, 4)
c[:] = quant(np.clip(n * 1.3 - 0.25, 0, 1), ramp('#07040a', '#0b0610', '#100812', '#150a14'))
c[(hash2(xx // 2, yy // 2, 4) < 0.004)] = hexc('#2a1418')
c[(hash2(xx // 2, yy // 2, 9) < 0.0012)] = hexc('#5a2410')
sky = yy >= RISS
t = np.clip((yy - RISS) / (H - RISS), 0, 1)
c[sky] = quant(t, ramp('#06040e', '#0a0818', '#0e0c22', '#14102c', '#1c1436', '#26183e', '#321c44', '#40204a', '#52264e'))[sky]
st = sky & (hash2(xx, yy, 5) < 0.0035)
c[st] = hexc('#8a80b0'); c[st & (hash2(xx, yy, 6) < 0.25)] = hexc('#e8e8ff')
# Riss: gezackte Spalte, oben Glutlippe, innen violettes Licht, unten der Sternenhimmel
jag = (vnoise(xx[0] / 60.0, 0.5, 31) - 0.5) * 50 + (vnoise(xx[0] / 11.0, 1.5, 32) - 0.5) * 12 + (vnoise(xx[0] / 2.5, 2.5, 34) - 0.5) * 3
gap = 8 + vnoise(xx[0] / 45.0, 2.5, 33) ** 2 * 34
edge = (RISS + jag).astype(int)
INNER = ramp('#2a1660', '#4a2690', '#7a48d8', '#b088f8', '#e8d8ff')
for x in range(W):
    e, g = int(edge[x]), int(gap[x])
    c[e - 14:e, x] = c[e - 15, x]
    for y in range(e - 12, e):   # Grund über dem Riss glimmt violett (gerastert)
        if gb[y, x] < (y - (e - 12)) / 24: c[y, x] = hexc('#24123e')
    for k, col in enumerate(['#ffb640', '#c8420c', '#5a1606']):
        c[e - 1 - k, x] = hexc(col) if (k < 2 or (x + k) % 3) else c[e - 1 - k, x]
    for y in range(e, e + g):
        u = 1 - abs((y - e) / max(1, g - 1) * 2 - 1)
        c[y, x] = quant(np.array([[u * 0.999]]), INNER, 1, 1, x, y)[0, 0]
    c[e + g, x] = hexc('#4a2690'); c[e + g + 1, x] = hexc('#2a1660') if (x & 1) else c[e + g + 1, x]
# Haarrisse vom Rand ins Dunkel
rng = np.random.default_rng(7)
for x0 in rng.integers(20, W - 20, 22):
    x, y = int(x0), int(edge[x0]) - 4
    for _ in range(int(rng.integers(8, 30))):
        y -= 1; x += int(rng.integers(-1, 2))
        if 0 <= x < W: c[y, x] = hexc('#7a2208')

boxes = []
for i, (zid, x, y, name, stufe, ziel, stern) in enumerate(ZONEN):
    im = np.array(Image.open(os.path.join(TMP, zid + '.png')).convert('RGB')).astype(int)
    h, w = im.shape[:2]
    assert x + w + 12 <= W and y + h + 12 <= H, zid
    c[y + 8:y + h + 8, x + 8:x + w + 8] = hexc('#020104')
    dim = ['#1a0a06', '#3a1408', '#5a200c'] if not stern else ['#120c24', '#2a1c4a', '#4a3478']
    for k, col in enumerate(dim):
        o = 4 - k
        c[y - o:y + h + o, x - o:x + w + o] = hexc(col)
    if stern:
        sy, sx = yy[y:y + h, x:x + w], xx[y:y + h, x:x + w]
        veil = np.clip(0.3 + 0.55 * vnoise(sx / 70.0, sy / 40.0, 7 + i), 0, 1)
        g = BAYER[sy & 3, sx & 3]
        tone = im * 0.55 + np.array([40, 30, 80]) * 0.45
        deep = tone * 0.6 + np.array([20, 18, 50]) * 0.4
        m1, m2 = g < veil, g < veil - 0.45
        im = np.where(m2[..., None], deep, np.where(m1[..., None], tone, im))
    c[y:y + h, x:x + w] = np.clip(im, 0, 255).astype(np.uint8)
    boxes.append((x, y, w, h))

def side(i, s):
    x, y, w, h = boxes[i]
    return {'r': (x + w + 6, y + h // 2), 'l': (x - 6, y + h // 2), 't': (x + w // 2, y - 6), 'b': (x + w // 2, y + h + 10)}[s]
def stairs(p0, p1, s0):
    (x0, y0), (x1, y1) = p0, p1
    if s0 in 'rl':   # waagrecht los, senkrecht, waagrecht an
        xm = (x0 + x1) // 2 if abs(x1 - x0) > 40 else x1
        return [(x0, y0), (xm, y0), (xm, y1), (x1, y1)] if y0 != y1 else [(x0, y0), (x1, y1)]
    ym = (y0 + y1) // 2
    return [(x0, y0), (x0, ym), (x1, ym), (x1, y1)]
def dedupe(v):
    out = [v[0]]
    for p in v[1:]:
        if p != out[-1]: out.append(p)
    return out
wege = []
for a, sa, b, sb in WEG:
    v = dedupe(stairs(side(a, sa), side(b, sb), sa))
    if sb == 't' and sa in 'rl' and v[-1][1] != v[-2][1] is False: pass
    wege.append({'von': a, 'nach': b, 'p': v, 'stern': ZONEN[b][6]})

# Pfad dunkel einbrennen (3 Bildpunkte breit, Striche 8 an / 6 aus); atlas.js lässt ihn aufglühen
for wg in wege:
    s = 0
    for (x0, y0), (x1, y1) in zip(wg['p'], wg['p'][1:]):
        L = abs(x1 - x0) + abs(y1 - y0)
        dx, dy = np.sign(x1 - x0), np.sign(y1 - y0)
        for k in range(L + 1):
            x, y = x0 + dx * k, y0 + dy * k
            if (s + k) % 14 < 8:
                c[y - 1:y + 2, x - 1:x + 2] = hexc('#2a0c06' if not wg['stern'] else '#1a1236')
                c[y, x] = hexc('#4a1608' if not wg['stern'] else '#2e2058')
        s += L

# Ränder gerastert in den Grund der Seite (#07040a) auslaufen lassen, damit die Karte kein Kasten ist
R = 56
d = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]).astype(float)
fade = gb > np.clip(d / R, 0, 1)
fade |= (d < R) & (gb > np.clip(d / R, 0, 1) ** 0.7) & (hash2(xx // 2, yy // 2, 21) < 0.3)
inside = np.zeros((H, W), bool)
for (x, y, w, h) in boxes: inside[max(0, y - 12):y + h + 12, max(0, x - 12):x + w + 12] = True
c[fade & ~inside] = hexc('#07040a')
Image.fromarray(c).save(os.path.join(IMG, 'atlas.webp'), lossless=True, method=6)
Image.fromarray(c).save(os.path.join(TMP, 'vorschau.png'))
meta = {'W': W, 'H': H, 'RISS': RISS,
        'zonen': [{'id': z[0], 'i': i, 'box': list(boxes[i]), 'name': z[3], 'stufe': z[4], 'ziel': z[5], 'stern': z[6]} for i, z in enumerate(ZONEN)],
        'wege': [{'von': w['von'], 'nach': w['nach'], 'p': [list(map(int, p)) for p in w['p']], 'stern': w['stern']} for w in wege]}
print(json.dumps({'meta': meta, 'size': os.path.getsize(os.path.join(IMG, 'atlas.webp'))}))
