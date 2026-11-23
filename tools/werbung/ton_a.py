# Ton zu Video A: python3 tools/werbung/ton_a.py ZIEL.mp3
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from ton import mix, pruefen
R = '/mnt/project-files/werbevideos/roh-a'; X = '/mnt/project-files/videos/kampagne-patch/werkzeug/sfx'; T = '/mnt/project-files/werbevideos/roh'
RISS = [1.5, 5.3, 8.7, 12.1]                   # Augenblicke, in denen das gemalte Bild aufreißt
res = mix(sys.argv[1], 18.0,
    music=[(f'{R}/musik-a.mp3', 0.0, 0.0), (f'{R}/musik-a.mp3', 12.0, 14.0, -1.5)],
    voices=[(f'{R}/a-00.mp3', 0.3), (f'{R}/a-01.mp3', 1.95), (f'{R}/a-02.mp3', 5.75), (f'{R}/a-03.mp3', 9.15), (f'{R}/a-04.mp3', 12.5), (f'{R}/a-05.mp3', 15.05)],
    sfx=[(f'{T}/fx-bruch.mp3', t - 0.05, -13) for t in RISS] + [(f'{X}/riser.mp3', t - 0.75, -21) for t in RISS]
        + [(f'{X}/impact2.mp3', 14.3, -14), (f'{X}/shimmer.mp3', 14.6, -18)])
print('Lautheit vor Angleichung', round(res['lufs_vorher'], 1), 'LUFS'); pruefen(res)
