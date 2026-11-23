# Ton zu Video C: python3 tools/werbung/ton_c.py ZIEL.mp3
# Die Musik läuft mit 120 Schlägen je Minute (Schläge bei 0,0 s + n × 0,5 s), genau wie die Schnitte im Bild.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from ton import mix, pruefen
R = '/mnt/project-files/werbevideos/roh-c'; X = '/mnt/project-files/videos/kampagne-patch/werkzeug/sfx'
SCHNITT = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.75, 11.75, 12.5, 13.25, 14.0, 14.75]
BOSS = {2.5, 4.5, 5.5, 7.5, 9.5, 13.25, 14.0, 14.75}
res = mix(sys.argv[1], 18.5,
    music=[(f'{R}/musik-c.mp3', 0.0, 0.0), (f'{R}/musik-c.mp3', 2.0, 12.5, 1.0)],   # zweiter Einsatz: Schlusssteigerung, taktgleich
    voices=[(f'{R}/c-00.mp3', 0.25), (f'{R}/c-01.mp3', 3.6), (f'{R}/c-02.mp3', 16.15)],
    sfx=[(f'{X}/whoosh1.mp3' if i % 2 else f'{X}/whoosh2.mp3', t - 0.12, -19) for i, t in enumerate(SCHNITT)]
        + [(f'{X}/impact1.mp3', t, -15) for t in sorted(BOSS)]
        + [(f'{X}/riser.mp3', 13.3, -17), (f'{X}/braam.mp3', 14.75, -10), (f'{X}/shimmer.mp3', 15.9, -16)])
print('Lautheit vor Angleichung', round(res['lufs_vorher'], 1), 'LUFS'); pruefen(res)
