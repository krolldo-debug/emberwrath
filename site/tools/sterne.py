# „Bald“-Abschnitt Sternenglut (Aufruf über sterne.mjs): python3 sterne.py ZWISCHEN IMG
# Bühne 1280 × 440 Feinpixel (vistaStage, Weltraster ×2), drei Bosse im Feinraster 1:1, Blick nach links.
# Bossstreifen je Boss drei Zeilen: hell (enthüllt), Schatten (Tinte mit Randlicht links rosa, oben Morgengold,
# rechts Nachtblau), Lichtkante (alle Bildpunkte hell, für den wandernden Streif). Standbild: mittlerer Boss enthüllt.
import sys, json, os
import numpy as np
from PIL import Image

TMP, IMG = sys.argv[1], sys.argv[2]
hexc = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.uint8)
vista = np.array(Image.open(os.path.join(TMP, 'vista.png')).convert('RGB'))
H, W = vista.shape[:2]
meta = json.load(open(os.path.join(TMP, 'bosse.json')))
FY = 356                     # Fußlinie (Feinpixel) auf der Insel
XS = [660, 880, 1104]        # Fußpunkte der drei Bosse
INK, ROSA, GOLD, NACHT, HELL = hexc('#0e0b1e'), hexc('#e89a88'), hexc('#f6c294'), hexc('#3a3478'), hexc('#fff0c8')

rows, info = [], []
for i, m in enumerate(meta):
    a = np.array(Image.open(os.path.join(TMP, f'boss{i}.png')).convert('RGBA'))
    w, n = m['w'], m['n']
    fr = [a[:, k * w:(k + 1) * w][:, ::-1].copy() for k in range(n)]   # gespiegelt: Blick nach links
    ax = w - 1 - m['ax']
    lit, sil, hell = [], [], []
    for f in fr:
        msk = f[..., 3] > 127
        s = f.copy(); s[..., :3] = INK
        s[msk & ~np.roll(msk, -1, 1), :3] = NACHT
        s[msk & ~np.roll(msk, 1, 1), :3] = ROSA
        s[msk & ~np.roll(msk, 1, 0), :3] = GOLD
        l = f.copy(); l[msk & ~np.roll(msk, 1, 1), :3] = GOLD     # enthüllt: Morgenlicht von links
        hl = f.copy(); hl[..., :3] = HELL
        lit.append(l); sil.append(s); hell.append(hl)
    rows.append([np.concatenate(r, 1) for r in (lit, sil, hell)])
    info.append({'w': w, 'h': m['h'], 'n': n, 'fps': m['fps'], 'x': XS[i] - ax, 'y': FY - m['ay']})

SW = max(r[0].shape[1] for r in rows)
sheet = np.zeros((sum(r[0].shape[0] * 3 for r in rows), SW, 4), np.uint8)
y = 0
for i, r in enumerate(rows):
    info[i]['row'] = y
    for part in r:
        sheet[y:y + part.shape[0], :part.shape[1]] = part; y += part.shape[0]

def save(arr, name):
    p = os.path.join(IMG, name); Image.fromarray(arr).save(p, lossless=True, method=6); return os.path.getsize(p)
sizes = {}
sizes['teaser-buehne.webp'] = save(vista, 'teaser-buehne.webp')
sizes['teaser-bosse.webp'] = save(sheet, 'teaser-bosse.webp')
wort = np.array(Image.open(os.path.join(TMP, 'wort.png')).convert('RGBA'))
sizes['teaser-schrift.webp'] = save(wort, 'teaser-schrift.webp')
# Standbild: Kaldris enthüllt, die anderen Schatten
poster = vista.copy()
for i, r in enumerate(rows):
    part = r[0] if i == 1 else r[1]
    f = part[:, :info[i]['w']]; x0, y0 = info[i]['x'], info[i]['y']
    hh, ww = f.shape[:2]; m = f[..., 3] > 127
    poster[y0:y0 + hh, x0:x0 + ww][m] = f[..., :3][m]
sizes['teaser.webp'] = save(poster, 'teaser.webp')
Image.fromarray(poster).save(os.path.join(TMP, 'vorschau.png'))
print(json.dumps({'meta': {'W': W, 'H': H, 'FY': FY, 'bosse': info, 'wort': list(wort.shape[1::-1]),
                           'dims': {'teaser-buehne': [W, H], 'teaser-bosse': [SW, sheet.shape[0]]}}, 'sizes': sizes}))
