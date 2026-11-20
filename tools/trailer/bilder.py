#!/usr/bin/env python3
"""Szenenbilder des Werbe-Trailers (tools/trailer/film.js) -> tools/trailer/media/*.png

Wie beim Intro (tools/intro/bilder.py): Die Szenen malt eine Bild-KI (Figma generate_image, gpt-image-2.5-flare,
1152 x 2048 angefragt, geliefert 864 x 1536). Dieses Werkzeug macht daraus Pixelkunst im festen Raster des Trailers:
360 x 640 Bildpunkte (Hochformat 9:16, x3 = 1080 x 1920), 48 Farben je Bild, harte Kanten, verlustfrei.
    python3 tools/trailer/bilder.py [QUELLE=/mnt/project-files/werbevideos/ki]
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HERE, 'media')
QUELLE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/werbevideos/ki'
AW, AH, FARBEN = 360, 640, 48
NAMEN = ['zitadelle', 'boss', 'reiter', 'riss', 'inseln', 'thron', 'koenige', 'frost', 'dorf']


def pixelkunst(im):
    im = im.convert('RGB').resize((AW, AH), Image.LANCZOS)
    return im.quantize(colors=FARBEN, method=Image.Quantize.MEDIANCUT, kmeans=8, dither=Image.Dither.NONE).convert('RGB')


os.makedirs(ZIEL, exist_ok=True)
for n in NAMEN:
    pixelkunst(Image.open(os.path.join(QUELLE, f'{n}.png'))).save(os.path.join(ZIEL, f'{n}.png'), optimize=True)
    print(n, os.path.getsize(os.path.join(ZIEL, f'{n}.png')) // 1024, 'KB')
