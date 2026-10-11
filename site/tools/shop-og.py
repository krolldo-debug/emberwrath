"""Vorschaubild der Shop-Seite beim Teilen (og:image, 1200 x 630): Logo, die vier Klassen-Sets und die drei Shop-Reittiere
über dem Steppenboden der Reittier-Parade. Alles aus den Bildern der Seite (2× Auflösung), in ganzen Spielpixeln
vergrößert (1 Spielpixel = 6 Bildpunkte), harte Kanten, kein Text außer dem Logo (gilt für alle Sprachen).
Aufruf: python3 site/tools/shop-og.py   → site/img/og-shop.png (neuer Name, damit Messenger kein altes Bild aus dem Cache zeigen)
"""
import random
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / 'img'
W, H, S = 200, 105, 6          # Spielpixel; S Bildpunkte je Spielpixel
BASE = 95                      # Fußlinie
out = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 255))


def px(x, y, w, h, c):
    out.paste(c, (x * S, y * S, (x + w) * S, (y + h) * S))


# Himmel in harten Stufen, nach unten wärmer
SKY = [(6, 3, 10), (9, 5, 15), (13, 7, 20), (19, 9, 24), (28, 11, 26), (40, 14, 24)]
band = 64 // len(SKY)
for i, c in enumerate(SKY):
    px(0, i * band, W, band + 1, c + (255,))
rnd = random.Random(11)
for _ in range(70):
    x, y = rnd.randrange(W), rnd.randrange(0, 46)
    px(x, y, 1, 1, rnd.choice([(255, 244, 192), (232, 194, 90), (150, 120, 170)]) + (255,))


def blit(name, sx, sy, w, h, x, y, flip=False):
    """Ausschnitt eines 2×-Bildes (Maße in Spielpixeln) an Spielposition x, y."""
    im = Image.open(IMG / name).convert('RGBA').crop((sx * 2, sy * 2, (sx + w) * 2, (sy + h) * 2))
    a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.resize((w * S, h * S), Image.NEAREST)
    out.alpha_composite(im, (x * S, y * S))


def tile(name, y, off):
    im = Image.open(IMG / name)
    tw, th = im.width // 2, im.height // 2
    for x in range(-off, W, tw):
        blit(name, 0, 0, tw, min(th, H - y), x, y)


tile('parade-fern.webp', BASE - 34, 37)
tile('parade-nah.webp', BASE - 10, 0)

# Reittiere (gang-<id>.webp: w h FußX FußY, Bild 0..11) und Klassen-Sets (set-<klasse>.webp, untere Reihe = im Set)
MOUNTS = {'phoenix_wing': (62, 44, 30, 42), 'astral_stallion': (41, 45, 19, 41), 'soul_wolf': (42, 46, 21, 43)}
SETS = {'warrior': (25, 39, 11, 37), 'rogue': (28, 32, 12, 30), 'ranger': (20, 41, 9, 39), 'mage': (20, 41, 9, 39)}


def mount(mid, frame, fx, fy):
    w, h, ax, ay = MOUNTS[mid]
    blit(f'gang-{mid}.webp', frame * w, 0, w, h, fx - ax, fy - ay)


def hero(cls, frame, fx):
    w, h, ax, ay = SETS[cls]
    blit(f'set-{cls}.webp', frame * w, h, w, h, fx - ax, BASE - ay)


def shadow(cx, hw):
    for r, k in ((0, hw), (1, hw - 2)):
        for x in range(cx - k, cx + k):
            if r == 0 or (x + r) % 2 == 0:
                px(x, BASE + r, 1, 1, (26, 17, 12, 255))


# Logo oben links (146 × 30 Bildpunkte, ×3 = halbe Spielpixel bleiben ganzzahlig: 1 Logopunkt = 3 Bildpunkte)
logo = Image.open(IMG / 'logo.png').convert('RGBA')
logo = logo.resize((logo.width * 3, logo.height * 3), Image.NEAREST)
out.alpha_composite(logo, (8 * S, 7 * S))

mount('phoenix_wing', 3, 160, 46)                    # fliegt oben rechts
for x, hw in ((22, 9), (178, 9)):
    shadow(x, hw)
mount('soul_wolf', 0, 24, BASE)
mount('astral_stallion', 2, 178, BASE)
for cls, x in (('warrior', 66), ('rogue', 90), ('ranger', 114), ('mage', 136)):
    shadow(x, 6)
    hero(cls, 4, x)

out.convert('RGB').save(IMG / 'og-shop.png', optimize=True)
print('og-shop.png', out.size)
