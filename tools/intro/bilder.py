#!/usr/bin/env python3
"""Szenenbilder des Intro-Films (src/intro/film.js) -> src/intro/media/*.webp

Die Bilder sind mit einer Bild-KI gemalt (Figma „generate_image“, Modell gpt-image-2.5-flare, 2048 x 872 angefragt,
geliefert 1792 x 768). Die Originale (PNG) liegen in /mnt/project-files/intro/ki-probe/. Dieses Werkzeug wandelt sie
in WebP um und baut die Steinfassung des Antlitzes (für „Ich bin nicht zornig“, bevor die Augen aufglühen).

Neu malen: Prompt unten nehmen, Bild als PNG mit gleichem Namen in QUELLE legen, dann
    python3 tools/intro/bilder.py
Wichtig: Bildstellen, an denen film.js Lichter setzt (Augen, Feuerschalen, Siegelmitte), stehen dort als Koordinaten
(Bildpixel bei 1792 Breite) und müssen beim Austausch eines Bildes nachgezogen werden.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HERE, '../../src/intro/media')
QUELLE = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/intro/ki-probe'

STIL = ('Rich hand-placed pixel clusters, limited palette of indigo, charcoal, bone and ember orange, crisp pixel '
        'edges, no text, no UI, no watermark. Key art frame from a high-end 2D pixel art game cinematic.')
MALGARETH = ('the ancient undead sorcerer-king Malgareth: gaunt pale ash-grey skull-like face, burning amber eyes, '
             'long lank black hair, a tall jagged dark iron crown with glowing ember-red gems, heavy grey plate armour '
             'with ember-orange edges, a tattered deep-red cloak')

# Name -> Bildbeschreibung (jeweils mit „Cinematic high-detail pixel art film still, ultra-wide 2.35:1 anamorphic,
# dark fantasy.“ davor und STIL dahinter)
PROMPTS = {
    'thron': f'A vast ruined obsidian throne hall from a low angle. On a high stepped dais sits {MALGARETH}, a huge '
             'blackened greatsword across his knees, half turned to stone, chained to the throne by broken runic chains. '
             'Behind the throne a giant cracked circular seal glows molten orange. Embers, smoky light shafts.',
    'antlitz': f'Extreme close-up portrait of {MALGARETH} on his throne, face filling the right half of the frame, '
               'thin grey beard. Behind him, out of focus, a giant cracked circular rune seal glowing orange.',
    'koenige': 'Five armoured kings march side by side across a scorched volcanic plain toward a black citadel on a '
               'distant smoking volcano, seen from behind: a bearded king with a great hammer and fur mantle, a knight-king '
               'in silver plate with a winged helm, a slender queen in bronze scale armour with a spear, an elder king in '
               'dark green armour with a horned helm and axe, a young king in white and gold with a tower shield. Banners, '
               'an army of torches far behind.',
    'treppe': f'Low angle from behind five armoured kings at the foot of a vast black stairway, weapons raised. At the top '
              f'stands {MALGARETH}, towering and defiant, greatsword in one hand, fire swirling around his raised other hand. '
              'Behind him a wall of flame and a giant circular rune seal.',
    'bann': f'In a dark circular throne hall five armoured kings stand in a ring, thrusting glowing swords and spears toward '
            f'the centre where {MALGARETH} kneels, bound by golden-white runic chains of light, grey stone creeping up his '
            'body as he turns to stone. A glowing rune circle on the floor.',
    'siegel': 'Slightly top-down view of a gigantic circular stone seal in the floor of a forgotten crypt, rings of runes '
              'and a five-pointed royal emblem, five broken swords driven into its rim, centuries of dust, cobwebs, roots '
              'and rubble, cold blue-violet light from a crack in the ceiling, one hairline crack glowing faintly orange.',
    'erwachen': 'Extreme close-up of the face of Malgareth carved in cracked grey stone, covered in dust, tall jagged iron '
                'crown. The stone is splitting open: molten ember-orange cracks across face and crown, flakes peel away, '
                'his eyes have just snapped open, burning bright amber. Dust and sparks burst outward.',
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
    # Steinfassung: entsättigt, kühl, dunkler (die Augen erlöschen dadurch, film.js lässt sie wieder aufglühen)
    a = np.asarray(Image.open(os.path.join(QUELLE, 'antlitz.png')).convert('RGB')).astype(np.float32) / 255
    lum = (a @ np.array([0.3, 0.55, 0.15]))[..., None]
    stone = np.clip((lum * np.array([0.78, 0.8, 0.9]) * 0.85) ** 1.1, 0, 1)
    out = os.path.join(ZIEL, 'antlitz-stein.webp')
    Image.fromarray((stone * 255).astype(np.uint8)).save(out, 'WEBP', quality=80, method=6)
    total += os.path.getsize(out)
    print(f'{len(PROMPTS) + 1} Bilder, {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
