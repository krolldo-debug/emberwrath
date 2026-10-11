"""Vorschaubild der Shop-Seite beim Teilen (og:image, 1200 x 630). Blickfang: der Krieger im Set „Wehr des Glutthrons“
vorne, die Phönixschwinge darüber, die drei übrigen Klassen-Sets dahinter, vor einem Glutschein in harten Ringen.
Ein einziges Raster für alles: 1 Bildpunkt der 2×-Bilder der Seite (= halber Spielpixel) und 1 Logopunkt = U Bildpunkte.
Harte Kanten, kein Alpha, kein Text außer dem Logo (gilt für alle Sprachen).
Aufruf: python3 site/tools/shop-og.py   → site/img/og-shop.png (neuer Name, damit Messenger kein altes Bild aus dem Cache zeigen)
"""
import random
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / 'img'
U = 4                              # Bildpunkte je Rasterpunkt
W, H = 300, 158                    # Rasterpunkte (1200 × 632, unten auf 630 beschnitten)
BASE = 150                         # Fußlinie der vorderen Reihe in Rasterpunkten
canvas = Image.new('RGBA', (W, H), (0, 0, 0, 255))
rnd = random.Random(11)


def fill(x, y, w, h, c):
    canvas.paste(c + (255,), (x, y, x + w, y + h))


# Himmel in Stufen, Übergänge im Schachbrett statt harter Streifen
SKY = [(6, 3, 10), (9, 5, 15), (13, 7, 20), (18, 8, 23), (24, 10, 25)]
step = 22
for i, c in enumerate(SKY):
    fill(0, i * step, W, H - i * step, c)
    if i:
        for y in range(i * step, i * step + 2):
            for x in range((y % 2), W, 2):
                canvas.putpixel((x, y), SKY[i - 1] + (255,))
# Glutschein hinter der Gruppe: harte Ellipsenringe, nach innen heller
CX, CY = 128, 104
for (rx, ry), c in zip(((150, 96), (118, 76), (90, 58), (64, 42)), ((30, 11, 25), (44, 15, 26), (62, 20, 27), (84, 27, 26))):
    for y in range(max(0, CY - ry), min(H, CY + ry + 1)):
        hw = int(rx * (1 - ((y - CY) / ry) ** 2) ** 0.5)
        fill(max(0, CX - hw), y, min(W, CX + hw) - max(0, CX - hw), 1, c)
for _ in range(90):
    x, y = rnd.randrange(W), rnd.randrange(0, 70)
    inner = ((x - CX) / 118) ** 2 + ((y - CY) / 76) ** 2 < 1
    if not inner:
        canvas.putpixel((x, y), rnd.choice([(255, 244, 192), (232, 194, 90), (150, 120, 170)]) + (255,))


def load(name, box=None):
    im = Image.open(IMG / name).convert('RGBA')
    if box:
        im = im.crop(box)
    im.putalpha(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    return im


def rim(im, color=(255, 176, 96), k=0.55):
    """Randlicht: deckende Punkte mit freier Nachbarschaft oben oder links werden zur Glut hin aufgehellt."""
    px = im.load()
    w, h = im.size
    out = im.copy()
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if (x == 0 or not px[x - 1, y][3]) or (y == 0 or not px[x, y - 1][3]):
                po[x, y] = (round(r + (color[0] - r) * k), round(g + (color[1] - g) * k), round(b + (color[2] - b) * k), 255)
    return out


def tile(name, y):
    im = load(name)
    for x in range(-37, W, im.width):
        canvas.alpha_composite(im, (x, y))


def shadow(cx, y, hw):
    for r, k in ((0, hw), (1, hw - 3)):
        for x in range(cx - k, cx + k):
            if r == 0 and abs(x - cx) < hw - 3 or (x + r) % 2 == 0:
                canvas.putpixel((x, y + r), (22, 14, 10, 255))


tile('parade-fern.webp', BASE - 74)
tile('parade-nah.webp', BASE - 22)

# Bilder der Seite: set-<klasse>.webp (untere Reihe = im Set), gang-<id>.webp; Maße in Spielpixeln wie in shop.html
SETS = {'warrior': (25, 39, 11, 37), 'rogue': (28, 32, 12, 30), 'ranger': (20, 41, 9, 39), 'mage': (20, 41, 9, 39)}


def hero(cls, frame, fx, base, light=True, dim=1.0):
    w, h, ax, ay = SETS[cls]
    im = load(f'set-{cls}.webp', (frame * w * 2, h * 2, (frame + 1) * w * 2, h * 4))
    if dim < 1:                    # hintere Reihe etwas dunkler: Blick geht zum Krieger
        r, g, b, a = im.split()
        r, g, b = (c.point(lambda v: int(v * dim)) for c in (r, g, b))
        im = Image.merge('RGBA', (r, g, b, a))
    if light:
        im = rim(im)
    shadow(fx, base, 14)
    canvas.alpha_composite(im, (fx - ax * 2, base - ay * 2))


# Hintere Reihe (etwas höher, überlappt), dann vorne der Krieger
hero('mage', 4, 58, BASE - 8, dim=0.82)
hero('rogue', 6, 196, BASE - 6, dim=0.82)
hero('ranger', 2, 224, BASE - 10, dim=0.82)
# Phönixschwinge fliegt über der Gruppe
w, h, ax, ay = 62, 44, 30, 42
dragon = load('gang-phoenix_wing.webp', (3 * w * 2, 0, 4 * w * 2, h * 2))
canvas.alpha_composite(dragon, (222 - ax * 2, 88 - ay * 2))
hero('warrior', 4, 128, BASE)

# Logo oben links (1 Logopunkt = 1 Rasterpunkt)
canvas.alpha_composite(load('logo.png'), (12, 10))

out = canvas.resize((W * U, H * U), Image.NEAREST).crop((0, 0, 1200, 630)).convert('RGB')
out.save(IMG / 'og-shop.png', optimize=True)
print('og-shop.png', out.size)
