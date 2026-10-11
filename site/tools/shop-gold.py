"""Gold-Pakete im Shop (site/shop.html): fünf Goldhaufen als Pixel-Art, vom Münzstapel bis zum Schatzberg.
Farben = Goldrampe des Spiels (src/gfx/Icons.js, M.gold), Umriss wie die Spielsymbole, harte Kanten, kein Alpha.
Alle Bilder gleich groß (W x H Bildpunkte), Fuß unten mittig; die Seite vergrößert nur ganzzahlig.
Aufruf: python3 site/tools/shop-gold.py site/img   → gold-1.png … gold-5.png (+ .webp)
"""
import random
import sys
from pathlib import Path

from PIL import Image

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'gold')
OUT.mkdir(parents=True, exist_ok=True)
W, H = 72, 46
GOLD = ['#4a2f10', '#8a5a18', '#c8922a', '#f0c85a', '#fff4c0']
LINE = '#1a0c05'
RUBY = ['#2a0508', '#5a0c14', '#98182a', '#d0303c', '#ff8070']
SAPH = ['#0a1838', '#163070', '#2a58b8', '#5a98f0', '#c0e0ff']
EMER = ['#0a2410', '#16461e', '#2a7a34', '#56b850', '#b8f090']


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


class Canvas:
    """Zeichenfläche in Ebenen: jede Ebene bekommt beim Zusammensetzen ihren eigenen dunklen Umriss."""
    def __init__(self):
        self.layers = [{}]
        self.px = self.layers[0]

    def layer(self):
        self.px = {}
        self.layers.append(self.px)

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[(x, y)] = c

    def coin_flat(self, cx, cy, shade=0):
        """Liegende Münze: 7 x 3 Fläche mit 1 px Rand darunter (Licht von oben links)."""
        rows = [(-2, 2), (-3, 3), (-2, 2)]
        for dy, (a, b) in enumerate(rows):
            for dx in range(a, b + 1):
                t = 3 - (dx + dy) * 0.35 - shade
                k = 4 if (dx, dy) in ((-1, 0), (-2, 1)) and shade == 0 else max(1, min(3, round(t)))
                self.put(cx + dx, cy + dy - 1, GOLD[k])
        for dx in range(-2, 3):
            self.put(cx + dx, cy + 2, GOLD[1])
            self.put(cx + dx, cy + 3, GOLD[0])
        self.put(cx - 3, cy + 1, GOLD[1]); self.put(cx + 3, cy + 1, GOLD[0])
        self.put(cx - 3, cy + 2, GOLD[0]); self.put(cx + 3, cy + 2, GOLD[0])
        self.put(cx + 1, cy, GOLD[2])

    def coin_edge(self, cx, cy):
        """Münze im Stapel (von der Seite): 7 px breit, 2 px hoch."""
        for dx in range(-3, 4):
            self.put(cx + dx, cy, GOLD[3] if dx < 0 else GOLD[2])
            self.put(cx + dx, cy + 1, GOLD[1] if dx < 2 else GOLD[0])
        self.put(cx - 2, cy, GOLD[4])

    def stack(self, cx, base, n):
        for i in range(n):
            self.coin_edge(cx + (1 if i % 3 == 1 else 0), base - 2 * i - 1)
        self.coin_flat(cx + (1 if (n - 1) % 3 == 1 else 0), base - 2 * n - 1)

    def heap(self, cx, base, rx, ry, rnd, density=1.0):
        """Haufen: Münzen von hinten nach vorne in einer Halbellipse, oben lichter."""
        # Grundkörper: Rampe nach Höhe und Seite (Licht oben links), darauf einzelne Münzen
        for x in range(-rx, rx + 1):
            ymax = ry * (1 - (x / rx) ** 2) ** 0.5
            for y in range(0, round(ymax) + 1):
                t = 1.2 + 1.6 * (y / ry) - 0.6 * (x / rx) + (0.5 if (x + y) % 3 == 0 else 0)
                self.put(cx + x, base - y + 2, GOLD[max(0, min(3, round(t)))])
        coins = []
        for _ in range(int(rx * ry * 0.32 * density)):
            x = rnd.uniform(-rx, rx)
            ymax = ry * (1 - (x / rx) ** 2) ** 0.5
            y = rnd.uniform(0, ymax)
            coins.append((cx + round(x), base - round(y)))
        coins.sort(key=lambda c: c[1])
        for x, y in coins:
            self.coin_flat(x, y, shade=0 if y < base - ry * 0.5 else rnd.choice([0, 0, 1]))
        # Boden: liegende Münzen in einer Reihe davor
        for x in range(cx - rx + 2, cx + rx - 1, 5):
            self.coin_flat(x + rnd.randint(-1, 1), base + rnd.randint(0, 1))

    def gem(self, cx, cy, R, big=False):
        shape = ['.##.', '####', '####', '.##.'] if not big else ['.###.', '#####', '#####', '#####', '.###.']
        for dy, row in enumerate(shape):
            for dx, ch in enumerate(row):
                if ch == '#':
                    t = 3 - (dx + dy) * 0.45
                    self.put(cx + dx, cy + dy, R[max(1, min(3, round(t)))])
        self.put(cx + 1, cy + 1, R[4]); self.put(cx + 1, cy, '#ffffff')

    def goblet(self, cx, base):
        """Pokal aus Gold mit Rubin."""
        cup = [(-4, 4), (-4, 4), (-3, 3), (-3, 3), (-2, 2), (-1, 1)]
        top = base - 13
        for dy, (a, b) in enumerate(cup):
            for dx in range(a, b + 1):
                t = 3.4 - (dx + 4) * 0.33
                self.put(cx + dx, top + dy, GOLD[max(1, min(4, round(t)))])
        for dx in range(-4, 5):
            self.put(cx + dx, top, GOLD[4] if dx < 0 else GOLD[3])
        for dy in range(6, 10):
            self.put(cx, top + dy, GOLD[3]); self.put(cx + 1, top + dy, GOLD[1])
        for dx in range(-3, 4):
            self.put(cx + dx, top + 10, GOLD[2] if dx < 1 else GOLD[1])
            self.put(cx + dx, top + 11, GOLD[1])
        self.gem(cx - 1, top + 2, RUBY)

    def crown(self, cx, base):
        top = base - 7
        for dx in range(-5, 6):
            for dy in range(3, 7):
                self.put(cx + dx, top + dy, GOLD[3] if dx < 0 else GOLD[2])
            self.put(cx + dx, top + 6, GOLD[1])
        for px in (-5, -2, 1, 4):
            for dy in range(0, 3):
                self.put(cx + px, top + dy, GOLD[4] if dy == 0 else GOLD[3])
                self.put(cx + px + 1, top + dy + 1, GOLD[2])
        self.gem(cx - 1, top + 3, SAPH)

    def sparkle(self, x, y):
        self.put(x, y, '#ffffff')
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            self.put(x + dx, y + dy, GOLD[4])

    def image(self):
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        # Umriss je Ebene (wie die Spielsymbole), spätere Ebenen liegen vorne
        for px in self.layers:
            for (x, y) in list(px):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in px and 0 <= q[0] < W and 0 <= q[1] < H:
                        img.putpixel(q, hexrgb(LINE))
            for (x, y), c in px.items():
                img.putpixel((x, y), hexrgb(c))
        return img


def tier(n):
    c, rnd = Canvas(), random.Random(7 + n)
    cx, base = W // 2, H - 4
    if n == 1:
        c.stack(cx - 4, base, 5)
        c.layer(); c.stack(cx + 4, base, 3)
        c.coin_flat(cx + 11, base + 1); c.coin_flat(cx - 12, base + 1)
        c.sparkle(cx - 7, base - 15)
    elif n == 2:
        c.stack(cx - 9, base, 7)
        c.layer(); c.heap(cx + 3, base, 11, 7, rnd)
        c.layer(); c.stack(cx + 14, base, 3)
        c.sparkle(cx - 13, base - 19); c.sparkle(cx + 5, base - 9)
    elif n == 3:
        c.stack(cx + 17, base, 8)
        c.layer(); c.heap(cx - 2, base, 16, 11, rnd)
        c.layer(); c.stack(cx - 18, base, 5)
        c.gem(cx + 3, base - 8, SAPH)
        c.sparkle(cx - 4, base - 13); c.sparkle(cx + 20, base - 22)
    elif n == 4:
        c.stack(cx - 24, base, 9)
        c.stack(cx + 25, base, 6)
        c.layer(); c.heap(cx, base, 22, 15, rnd)
        c.gem(cx - 9, base - 9, RUBY); c.gem(cx + 8, base - 6, EMER); c.gem(cx + 1, base - 14, SAPH)
        c.sparkle(cx - 2, base - 18); c.sparkle(cx + 15, base - 12); c.sparkle(cx - 26, base - 24)
    else:
        c.stack(cx - 30, base, 11)
        c.layer(); c.heap(cx + 2, base, 28, 20, rnd, 1.1)
        c.layer(); c.goblet(cx + 16, base - 10)
        c.layer(); c.crown(cx - 11, base - 14)
        c.gem(cx + 2, base - 18, RUBY, True); c.gem(cx - 22, base - 5, EMER); c.gem(cx + 24, base - 4, SAPH)
        for x, y in ((cx + 5, base - 24), (cx - 17, base - 22), (cx + 28, base - 14), (cx - 4, base - 9)):
            c.sparkle(x, y)
    return c.image()


for n in range(1, 6):
    img = tier(n)
    img.save(OUT / f'gold-{n}.png')
    img.save(OUT / f'gold-{n}.webp', lossless=True, quality=100, method=6)
print(f'5 Goldhaufen à {W} x {H}')
