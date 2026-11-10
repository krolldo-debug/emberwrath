#!/usr/bin/env python3
"""Szenenbilder des Intro-Films (src/intro/film.js) -> src/intro/media/*.webp

Die Bilder sind mit einer Bild-KI gemalt (Figma „generate_image“, Modell gpt-image-2.5-flare, 2048 x 872 angefragt,
geliefert 1792 x 768). Die Originale (PNG) liegen in /mnt/project-files/intro/ki-probe/. Dieses Werkzeug wandelt sie
in WebP um.

Neu malen: Prompt unten nehmen, Bild als PNG mit gleichem Namen in QUELLE legen, dann
    python3 tools/intro/bilder.py
Wichtig: Bildstellen, an denen film.js Lichter setzt (Feuerschalen, Vulkangipfel, Torspalt, Siegelmitte, Runenring), stehen dort als Koordinaten
(Bildpixel bei 1792 Breite) und müssen beim Austausch eines Bildes nachgezogen werden.
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


def main():
    total = 0
    for name in PROMPTS:
        im = Image.open(os.path.join(QUELLE, f'{name}.png')).convert('RGB')
        out = os.path.join(ZIEL, f'{name}.webp')
        im.save(out, 'WEBP', quality=80, method=6)
        total += os.path.getsize(out)
    print(f'{len(PROMPTS)} Bilder, {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
