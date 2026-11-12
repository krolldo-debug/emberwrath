#!/usr/bin/env python3
"""Szenenbilder des Intro-Films (src/intro/film.js) -> src/intro/media/*.webp

Die Bilder sind mit einer Bild-KI gemalt (Figma „generate_image“, Modell gpt-image-2.5-flare, 2048 x 872 angefragt,
geliefert 1792 x 768). Die Originale (PNG) liegen in /mnt/project-files/intro/ki-probe/. Dieses Werkzeug macht daraus
echte Pixelkunst im Raster des Films: 672 x 288 Bildpunkte, feste Palette (48 Farben), harte Kanten, verlustfrei
gespeichert. film.js zeichnet die Bilder 1:1 in dieses Raster und vergrößert erst die fertige Szene pixelgenau.

Neu malen: Prompt unten nehmen, Bild als PNG mit gleichem Namen in QUELLE legen, dann
    python3 tools/intro/bilder.py            (braucht pillow und numpy, für die Ebenen zusätzlich opencv-python-headless)
Wichtig: Bildstellen, an denen film.js Lichter setzt (Feuerschalen, Vulkangipfel, Torspalt, Siegelmitte, Runenring), stehen dort als Koordinaten
(Bildpixel der Vorlage, 1792 breit) und müssen beim Austausch eines Bildes nachgezogen werden.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HERE, '../../src/intro/media')
QUELLE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/intro/ki-probe'

STIL = ('Rich hand-placed pixel clusters, limited palette of indigo, charcoal, bone and ember orange, crisp pixel '
        'edges, no text, no UI, no watermark. Key art frame from a high-end 2D pixel art game cinematic.')
# Name -> Bildbeschreibung (jeweils mit „Cinematic high-detail pixel art film still, ultra-wide 2.35:1 anamorphic,
# dark fantasy.“ davor und STIL dahinter)
PROMPTS = {
    'zitadelle': 'Establishing shot, night. A colossal black volcano rises from a barren ash plain; on its peak a jagged '
                 'black citadel of spires, windows glowing ember orange, lava veins down the slopes, a thick column of '
                 'smoke into a stormy indigo sky lit orange from below. Foreground: jagged rocks and dead trees. No people.',
    'halle': 'A gigantic gothic throne hall seen from the entrance: rows of colossal black pillars with burning braziers '
             'recede toward a far-away stepped dais and a tall dark throne with a tiny crowned figure, only a small '
             'silhouette. Behind the throne a huge circular rune window glows orange. Tattered red banners, smoke, '
             'polished obsidian floor reflecting the fire. One-point perspective, epic scale.',
    'balkon': 'Over-the-shoulder from behind: a tall dark king alone on the high stone balcony of a black citadel, left '
              'third, jagged spiked crown in silhouette, long tattered dark-red cloak in the wind, face hidden, looking out '
              'over a vast dark land with thin glowing lava rivers, distant mountains, a starry indigo sky. Calm, lonely, '
              'ominous, restrained colours, not oversaturated.',
    'koenige': 'Five armoured kings march side by side across a scorched volcanic plain toward a black citadel on a '
               'distant smoking volcano, seen from behind: a bearded king with a great hammer and fur mantle, a knight-king '
               'in silver plate with a winged helm, a slender queen in bronze scale armour with a spear, an elder king in '
               'dark green armour with a horned helm and axe, a young king in white and gold with a tower shield. Banners, '
               'an army of torches far behind.',
    'tor': 'Five small armoured kings seen from behind stand side by side on a stone bridge before a colossal black '
           'citadel gate, a thin line of ember-orange light glowing through the crack of the closed doors, banners, '
           'swords drawn and lowered, the torches of their army far below, ash falling. Calm, tense, symmetrical, '
           'restrained colours.',
    'lichtsaeule': 'Establishing shot, night: from the black citadel on the volcano a blinding pillar of golden-white light '
                   'shoots up into the storm clouds, a gigantic golden rune circle hangs in the sky above it, rays fan out, '
                   'tiny armies with torches look up from the foot of the mountain.',
    'siegel': 'Slightly top-down view of a gigantic circular stone seal in the floor of a forgotten crypt, rings of runes '
              'and a five-pointed royal emblem, five broken swords driven into its rim, centuries of dust, cobwebs, roots '
              'and rubble, cold blue-violet light from a crack in the ceiling, one hairline crack glowing faintly orange.',
    'halle-staub': 'The same throne hall a thousand years later, from the entrance: pillars, cold dark braziers, dust, '
                   'cobwebs, rotted banners, roots and rubble on the cracked floor; on the distant throne a small grey stone '
                   'statue of a crowned king in a single shaft of cold moonlight. Cold indigo and slate grey.',
    'glutsenke': 'Night. A vast volcanic valley with glowing lava rivers, a small walled village with warm windows and a '
                 'watchtower, pine silhouettes, on the horizon a huge dark volcano with a black citadel glowing orange, '
                 'smoke rising into a starry indigo sky. On a hill in the right foreground a tiny lone hooded wanderer '
                 'with a sword on their back, seen from behind.',
    'wanderer': 'Night, over-the-shoulder: close behind a lone hooded wanderer on the left third, worn dark cloak, sword '
                'hilt over the shoulder, face hidden, looking across a dark valley toward a huge distant volcano with a '
                'black citadel glowing orange, starry indigo sky, faint lava rivers. Ember-orange rim light on the hood.',
}


AW, AH = 672, 288      # Raster des Films (Kunstpixel); Vorlage 1792 x 768 = Faktor 8/3
FARBEN = 48

# Vordergrund-Ebenen für die Tiefenwirkung (film.js bewegt Vordergrund und Hintergrund leicht gegeneinander):
# grober Umriss des Vordergrunds in Kunstpixeln; die genaue Kante findet GrabCut (OpenCV) im Band um den Umriss.
# Ergebnis: <name>.webp ohne Vordergrund (die Lücke aus der Umgebung gefüllt) und <name>-v.webp (nur Vordergrund).
EBENEN = {
    'wanderer': [(0, 288), (0, 110), (22, 108), (44, 120), (50, 128), (62, 116), (70, 110), (76, 100), (80, 90), (72, 74), (68, 64),
                 (72, 56), (80, 54), (88, 60), (88, 70), (90, 84), (94, 98), (102, 96), (103, 82), (108, 66), (114, 54), (124, 40),
                 (134, 30), (146, 26), (158, 29), (168, 36), (176, 50), (183, 62), (190, 72), (187, 82), (183, 94), (184, 100),
                 (200, 118), (208, 142), (218, 160), (230, 177), (250, 195), (270, 202), (296, 211), (320, 219), (338, 228),
                 (356, 240), (362, 262), (350, 288)],
    'balkon': [(0, 288), (0, 0), (92, 0), (95, 28), (100, 36), (112, 45), (118, 20), (125, 4), (130, 20), (136, 45), (138, 78),
               (140, 75), (148, 66), (155, 56), (153, 42), (158, 38), (162, 30), (166, 36), (171, 26), (176, 36), (181, 33), (184, 40),
               (189, 38), (187, 52), (186, 62), (192, 68), (200, 76), (204, 96), (206, 112), (212, 128), (228, 142), (250, 156),
               (272, 166), (290, 176), (300, 186), (286, 192), (262, 196), (248, 204), (270, 212), (300, 221), (338, 230), (346, 222),
               (350, 200), (355, 172), (360, 152), (366, 172), (372, 198), (378, 222), (386, 238), (420, 250), (460, 264), (500, 279),
               (520, 288)],
}
BAND = 7               # Kunstpixel: so weit um den Umriss sucht GrabCut die Kante


def pixelkunst(im):
    """Vorlage -> Bild im Filmraster mit fester Palette (ohne Rasterung/Dither: saubere Farbflächen)."""
    im = im.convert('RGB').resize((AW, AH), Image.LANCZOS)
    return im.quantize(colors=FARBEN, method=Image.Quantize.MEDIANCUT, kmeans=8, dither=Image.Dither.NONE)


def vordergrund(im, poly):
    """Maske des Vordergrunds in Vorlagengröße (uint8 0/1) aus dem groben Umriss."""
    import cv2
    import numpy as np
    k = im.width / AW
    rgb = np.asarray(im.convert('RGB'))
    grob = np.zeros(rgb.shape[:2], np.uint8)
    cv2.fillPoly(grob, [np.round(np.array(poly) * k).astype(np.int32)], 1)
    r = int(BAND * k)
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    innen, aussen = cv2.erode(grob, kern), cv2.dilate(grob, kern)
    # Bildränder gehören zum Umriss, wo er sie berührt (erode frisst sie sonst weg)
    m = np.where(aussen == 0, cv2.GC_BGD, np.where(innen == 1, cv2.GC_FGD, np.where(grob == 1, cv2.GC_PR_FGD, cv2.GC_PR_BGD))).astype(np.uint8)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), m, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
    # Aufräumen: Löcher schließen, Krümel entfernen (nur die größte zusammenhängende Fläche bleibt)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    if n > 2: fg = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    loch = 1 - fg
    n, lab, st, _ = cv2.connectedComponentsWithStats(loch, connectivity=4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 2000: fg[lab == i] = 1
    return fg


def spiegeln(rgb, luecke):
    """Lücke im Bild füllen: jeder Bildpunkt holt seine Farbe von der Stelle, die an der nächsten Kante der Lücke
    gespiegelt liegt. So setzt sich die Umgebung mit ihrer echten Pixelstruktur in die Lücke fort (kein Weichzeichnen)."""
    import cv2
    import numpy as np
    h, w = luecke.shape
    _, lab = cv2.distanceTransformWithLabels(luecke.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(luecke == 0)
    by, bx = np.zeros(lab.max() + 1, np.int32), np.zeros(lab.max() + 1, np.int32)
    by[lab[ys, xs]], bx[lab[ys, xs]] = ys, xs
    out = rgb.copy()
    py, px = np.nonzero(luecke)
    ky, kx = by[lab[py, px]], bx[lab[py, px]]                       # nächster Bildpunkt außerhalb der Lücke
    for f in (2.0, 1.5, 1.0):                                       # gespiegelt; liegt das wieder in der Lücke, näher an die Kante
        sy = np.clip(np.round(py + (ky - py) * f).astype(int), 0, h - 1)
        sx = np.clip(np.round(px + (kx - px) * f).astype(int), 0, w - 1)
        ok = luecke[sy, sx] == 0
        out[py[ok], px[ok]] = rgb[sy[ok], sx[ok]]
        py, px, ky, kx = py[~ok], px[~ok], ky[~ok], kx[~ok]
    return out


def ebenen(im, poly):
    """-> (Hintergrund ohne Vordergrund, Vordergrund mit Transparenz, Maske), im Filmraster und in derselben Palette."""
    import cv2
    import numpy as np
    fg = vordergrund(im, poly)
    ganz = np.asarray(pixelkunst(im).convert('RGB'))
    # Maske im Filmraster: Bildpunkt gehört zum Vordergrund, wenn er überwiegend davon bedeckt ist
    klein = np.asarray(Image.fromarray(fg * 255).resize((AW, AH), Image.BOX)) >= 128
    # Hintergrund: die Lücke ist etwas größer als der Vordergrund, damit kein Lichtsaum der Figur stehen bleibt
    luecke = cv2.dilate(klein.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    hinten = spiegeln(ganz, luecke)
    vorn = np.dstack([ganz, np.where(klein, 255, 0).astype(np.uint8)])
    vorn[~klein, :3] = 0
    return Image.fromarray(hinten), Image.fromarray(vorn, 'RGBA'), klein


def main():
    total = 0
    pruef = os.environ.get('PRUEF')            # Ordner für Prüfbilder der Ebenen (Maske rot über dem Bild)
    for name in PROMPTS:
        im = Image.open(os.path.join(QUELLE, f'{name}.png'))
        files = {name: pixelkunst(im).convert('RGB')}
        if name in EBENEN:
            hinten, vorn, maske = ebenen(im, EBENEN[name])
            files = {name: hinten, f'{name}-v': vorn}
            if pruef:
                import numpy as np
                a = np.asarray(pixelkunst(im).convert('RGB')).copy()
                a[maske] = (a[maske] * 0.5 + np.array([255, 0, 0]) * 0.5).astype(np.uint8)
                Image.fromarray(a).resize((AW * 3, AH * 3), Image.NEAREST).save(os.path.join(pruef, f'maske-{name}.png'))
                hinten.resize((AW * 3, AH * 3), Image.NEAREST).save(os.path.join(pruef, f'hinten-{name}.png'))
        for n, bild in files.items():
            out = os.path.join(ZIEL, f'{n}.webp')
            bild.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
            total += os.path.getsize(out)
    print(f'{len(PROMPTS)} Bilder, {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
