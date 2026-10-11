"""Vorschaubild aller Seiten beim Teilen (og:image und twitter:image, 1200 x 630): drei Helden auf Reittieren bei
Abendglut über der Steppe der Reittier-Parade, oben die Phönixschwinge. Echte Spielgrafik aus den Paradestreifen
(gang-*.webp, parade-*.webp), ein Raster für alles: 1 Streifenpixel (= halber Spielpixel) und 1 Logopunkt = 3 Bildpunkte.
Harte Kanten, kein Alpha, kein Text außer dem Logo (gilt für alle Sprachen).
Aufruf: python3 site/tools/og.py   → site/img/og-teilen.png
Bei einem neuen Motiv einen neuen Dateinamen wählen, sonst zeigen Messenger das alte Bild aus ihrem Zwischenspeicher.
"""
import random
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parent.parent
IMG = SITE / 'img'
U = 3                              # Bildpunkte je Streifenpixel
W, H, BASE = 400, 210, 176         # Streifenpixel; BASE = Lauflinie
SKY = [(7, 4, 12), (10, 5, 16), (15, 7, 20), (22, 9, 23), (34, 12, 24), (52, 17, 22), (78, 26, 20)]


def load(name, box=None):
    im = Image.open(IMG / name).convert('RGBA')
    if box:
        im = im.crop(box)
    im.putalpha(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    return im


# Maße der Gangarten wie in data-f der Parade (index.html): Breite, Höhe, Fuß x/y in Spielpixeln
DEFS = {}
for li in (SITE / 'index.html').read_text().split('<li data-m="')[1:]:
    name, f = li.split('"')[0], li.split('data-f="')[1].split('"')[0].split()
    DEFS[name] = [int(v) for v in f[:4]] + [int(f[6])]
DEFS['phoenix_wing'] = [62, 44, 30, 42, 26]

canvas = Image.new('RGBA', (W, H), (0, 0, 0, 255))
rnd = random.Random(3)
# Himmel in Stufen, Übergänge im Schachbrett
for i, c in enumerate(SKY):
    canvas.paste(c + (255,), (0, i * 15, W, H))
    if i:
        for y in range(i * 15, i * 15 + 2):
            for x in range(y % 2, W, 2):
                canvas.putpixel((x, y), SKY[i - 1] + (255,))
for _ in range(70):
    canvas.putpixel((rnd.randrange(W), rnd.randrange(0, 60)), rnd.choice([(255, 244, 192), (232, 194, 90), (150, 120, 170), (90, 70, 120)]) + (255,))
# Steppe der Parade, zwei Ebenen
far, near = load('parade-fern.webp'), load('parade-nah.webp')
for x in range(-37, W, far.width):
    canvas.alpha_composite(far, (x, BASE - 68))
for x in range(-91, W, near.width):
    canvas.alpha_composite(near, (x, BASE - 20))


def ride(name, frame, x, lift=0):
    w, h, fx, fy, fly = DEFS[name]
    im = load(f'gang-{name}.webp', (frame * w * 2, 0, (frame + 1) * w * 2, h * 2))
    if not fly:   # Schatten: drei Reihen, deckend abgedunkelt
        for r, k in ((-1, 0.8), (0, 1), (1, 0.8)):
            hw = int(w * 0.62 * k)
            for xx in range(max(0, x - hw), min(W, x + hw)):
                p = canvas.getpixel((xx, BASE + r))
                canvas.putpixel((xx, BASE + r), tuple(v // 2 for v in p[:3]) + (255,))
    canvas.alpha_composite(im, (x - fx * 2, BASE - fy * 2 - lift))


ride('phoenix_wing', 6, 300, 74)
ride('nightmare_steed', 3, 96)
ride('hellhound', 4, 232)
for _ in range(60):   # Staub auf der Lauflinie
    canvas.putpixel((rnd.randrange(W), BASE - rnd.randrange(0, 8)), rnd.choice([(110, 90, 72), (143, 122, 98)]) + (255,))
canvas.alpha_composite(load('logo.png'), (10, 9))

out = canvas.convert('RGB').resize((W * U, H * U), Image.NEAREST)
out.save(IMG / 'og-teilen.png', optimize=True)
print('og-teilen.png', out.size)
