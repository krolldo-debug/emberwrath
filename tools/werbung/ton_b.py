# Ton zu Video B: python3 tools/werbung/ton_b.py ZIEL.mp3
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from ton import mix, pruefen
R = '/mnt/project-files/werbevideos/roh-b'; X = '/mnt/project-files/videos/kampagne-patch/werkzeug/sfx'
res = mix(sys.argv[1], 17.5,
    music=(f'{R}/musik-b.mp3', 0.4),          # Takt der Musik: Schläge bei 0,4 s + n × 0,5 s → Video-Schläge auf 0, 0,5, 1 …
    voices=[(f'{R}/b-00.mp3', 0.12), (f'{R}/bm-00.mp3', 5.05), (f'{R}/bm-01.mp3', 7.05), (f'{R}/bm-02.mp3', 9.05), (f'{R}/bm-03.mp3', 11.05), (f'{R}/b-06.mp3', 13.35)],
    sfx=[(f'{X}/impact1.mp3', 0.97, -12), (f'{X}/tick.mp3', 2.4, -16), (f'{X}/tick.mp3', 2.6, -16), (f'{X}/tick.mp3', 2.8, -16), (f'{X}/tick.mp3', 3.0, -16),
         (f'{X}/whoosh1.mp3', 4.86, -12), (f'{X}/whoosh2.mp3', 6.86, -12), (f'{X}/whoosh1.mp3', 8.86, -12), (f'{X}/whoosh2.mp3', 10.86, -12),
         (f'{X}/whoosh1.mp3', 12.86, -12), (f'{X}/shimmer.mp3', 13.0, -14)])
print('Lautheit vor Angleichung', res['lufs_vorher'], 'LUFS'); pruefen(res)
