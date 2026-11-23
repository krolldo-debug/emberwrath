# Werbevideo A „Vom Bild ins Spiel“: ein gemaltes Bild reißt auf, dahinter läuft dieselbe Szene im echten Spiel.
#   python3 tools/werbung/video_a.py ROH-ORDNER ZIEL.mp4 [ton.mp3] | ... ZIELORDNER bilder 1,4,9
import sys, os, math, random
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from lib import *

ROH, OUT = sys.argv[1], sys.argv[2]
KI = '/mnt/project-files/werbevideos/ki'
DUR = 18.0
# t0: Anfang, bild: gemalte Szene, clip/f0/step/zoom: echtes Spiel dahinter, auf: wann das Bild aufreißt (nach t0), titel
SZ = [
    dict(t0=0.0, t1=4.2, bild='boss', clip='e-b-mal-dodge', f0=260, step=3, zoom=1.0, auf=1.5, titel='DIE LEGENDE', unten='MALGARETH, DER ASCHENFÜRST'),
    dict(t0=4.2, t1=7.6, bild='reiter', clip='e-ride-drake-up', f0=330, step=4, zoom=1.15, auf=1.1, titel='DEIN WEG', unten='REITTIERE AB STUFE 20'),
    dict(t0=7.6, t1=11.0, bild='frost', clip='e-b-sk-dodge', f0=200, step=3, zoom=1.0, auf=1.1, titel='DEIN KAMPF', unten='SKALVYR, DER FROSTWURM'),
    dict(t0=11.0, t1=DUR, bild='inseln', clip='sg-rochen', f0=40, step=2, zoom=1.2, auf=1.1, titel='DEINE WELT', unten='DIE TREIBENDEN GÄRTEN · STUFE 40–50'),
]
ENDE = 14.3

def gemalt(name):
    im = Image.open(f'{KI}/{name}.png').convert('RGB').resize((360, 640), Image.LANCZOS)   # erst aufs Spielraster, dann hart hoch
    return im.resize((W, H), Image.NEAREST)
for s in SZ:
    s['mal'] = gemalt(s['bild'])
    s['tl'] = text_layer(s['titel'], CZ(72), BONE, 5)
    s['ul'] = text_layer(s['unten'], fit(s['unten'], NU, 40, 920), (236, 214, 184), 3)
embers = Embers(60, 7)
LOGO = logo(820)
BADGE = badge(300)
URL = text_layer('www.emberwrath.com', NU(36), (255, 179, 90), 3)
Z1 = text_layer('Das ist kein Film.', AN(92), BONE, 5)
Z2 = text_layer('Das spielst du.', AN(92), EMBER, 5)

def riss_maske(p, seed):
    """Aufreißende Öffnung: gezackter Stern, der von der Mitte her wächst (p = 0 … 1)."""
    rnd = random.Random(seed); n = 20
    zack = [0.58 + 0.52 * rnd.random() for _ in range(n)]
    r = p * 1.5
    pts = []
    for i in range(n):
        a = i / n * math.tau
        rr = r * zack[i] * (1 + 0.18 * math.sin(a * 3 + seed))
        pts.append((W / 2 + math.cos(a) * rr * W * 0.95, H / 2 + math.sin(a) * rr * H * 0.62))
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    return m, pts

def frame(t):
    s = SZ[0]
    for x in SZ:
        if t >= x['t0']: s = x
    tl = t - s['t0']
    p = clamp((tl - s['auf']) / 0.42)                # Fortschritt des Aufreißens
    # gemaltes Bild, ganz leicht herangefahren
    k = 1.0 + 0.035 * (tl / max(0.5, s['t1'] - s['t0']))
    mal = s['mal'].resize((round(W * k), round(H * k)), Image.BICUBIC)
    im = mal.crop(((mal.width - W) // 2, (mal.height - H) // 2, (mal.width - W) // 2 + W, (mal.height - H) // 2 + H)).convert('RGBA')
    if p > 0:
        spiel = clip_frame(f"{ROH}/{s['clip']}", s['f0'] + int((tl - s['auf']) * FPS) * s['step'], s['zoom'])
        m, pts = riss_maske(ease(p), hash(s['bild']) % 97)
        im.paste(spiel, (0, 0), m)
        if p < 1:                                     # glühende Bruchkante
            d = ImageDraw.Draw(im, 'RGBA')
            kante = Image.new('RGBA', (W, H), (0, 0, 0, 0)); kd = ImageDraw.Draw(kante)
            kd.polygon(pts, outline=(255, 140, 40, 255), width=22)
            im.alpha_composite(kante.filter(ImageFilter.GaussianBlur(14)))
            d.polygon(pts, outline=(255, 236, 190, 255), width=5)
    im = im.convert('RGBA')
    # dunkle Verläufe für die Schrift
    for y0, y1, a0, a1 in [(0, 420, 200, 0), (1430, H, 0, 225)]:
        g = Image.new('RGBA', (1, y1 - y0), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
        for y in range(y1 - y0): gd.point((0, y), fill=(0, 0, 0, int(a0 + (a1 - a0) * y / (y1 - y0))))
        im.alpha_composite(g.resize((W, y1 - y0)), (0, y0))
    embers.draw(im, t, amount=0.6)
    if t < ENDE:
        a = ease(tl / 0.35) * (1 - clamp((tl - (s['t1'] - s['t0']) + 0.25) / 0.25))
        paste_c(im, s['tl'], W / 2, 200, 1, a)
        paste_c(im, s['ul'], W / 2, 1620, 1, ease((tl - s['auf'] - 0.3) / 0.3) * a)
    else:
        q = t - ENDE
        paste_c(im, LOGO, W / 2, 230, 1.06 - 0.06 * ease(q / 0.4), ease(q / 0.3))
        paste_c(im, Z1, W / 2, 1275, 1, ease((q - 0.1) / 0.25))
        paste_c(im, Z2, W / 2, 1385, 1, ease((q - 0.35) / 0.25))
        a = ease((q - 0.7) / 0.3)
        paste_c(im, BADGE, W / 2, 1600, 1, a); paste_c(im, URL, W / 2, 1700, 1, a)
    # Weißblitz im Augenblick des Aufreißens
    fl = 1 - (tl - s['auf']) / 0.12 if tl >= s['auf'] else 0
    if fl > 0: im.alpha_composite(Image.new('RGBA', (W, H), (255, 240, 210, int(95 * fl))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/a{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
