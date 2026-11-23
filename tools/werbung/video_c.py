# Werbevideo C „Von 1 auf 50“: echtes Spiel bildfüllend, großer Stufenzähler, schnelle Schnitte auf den Takt.
#   python3 tools/werbung/video_c.py ROH-ORDNER ZIEL.mp4 [ton.mp3] | ... ZIELORDNER bilder 1,4,9
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from lib import *

ROH, OUT = sys.argv[1], sys.argv[2]
DUR = 18.5
# t0, Ordner, erstes Bild, Schritt (Bilder je Ausgabebild: 4 = Echtzeit, 3 = etwas langsamer), Stufe, Ort, Boss, Vergrößerung
CUT = [
    (0.00, 'e-weg-ashwood', 200, 4, 1, 'DER ASCHENWALD', None, 1.25),
    (1.50, 'f-war-whirl', 200, 4, 8, 'DIE FAULMARSCH', None, 1.1),
    (2.50, 'e-b-var', 220, 3, 15, 'DIE KATAKOMBEN', 'VARKHUL', 1.0),
    (3.50, 'h-ritt-pferd', 300, 4, 20, 'DIE ASCHENSTEPPE', None, 1.55),
    (4.50, 'e-b-ign', 250, 3, 26, 'DIE GLUTSCHMIEDE', 'IGNAROTH', 1.0),
    (5.50, 'e-b-rot', 250, 3, 29, 'DER SPORENSCHLUND', 'MUTTER FÄULNIS', 1.1),
    (6.50, 'e-weg-frost', 250, 4, 31, 'DIE FROSTZINNEN', None, 1.5),
    (7.50, 'e-b-sk-dodge', 200, 3, 34, 'DIE REIFHÖHLEN', 'SKALVYR', 1.0),
    (8.50, 'e-ride-drake-up', 330, 4, 36, 'DIE GLUTÖDE', None, 1.4),
    (9.50, 'e-b-mal-dodge', 260, 3, 40, 'DER ASCHETHRON', 'MALGARETH', 1.0),
    (10.75, 'sg-riss', 300, 4, 41, 'DER RISS', None, 1.25),
    (11.75, 'sg-hafen', 200, 4, 43, 'STERNHAFEN', None, 1.3),
    (12.50, 'sg-rochen', 250, 4, 45, 'DIE TREIBENDEN GÄRTEN', None, 1.5),
    (13.25, 'h-ysgarn-r', 250, 3, 47, 'DIE RANKENGRUFT', 'YSGARN', 1.0),
    (14.00, 'h-kaldris-r', 250, 3, 49, 'DIE GLÄSERNEN HALLEN', 'KALDRIS', 1.0),
    (14.75, 'sg-ysmeine-m', 300, 3, 50, 'DIE STERNWARTE', 'KÖNIGIN YSMEINE', 1.0),
]
ENDE = 15.9
embers = Embers(50, 11)
LOGO = logo(820)
BADGE = badge(300)
URL = text_layer('www.emberwrath.com', NU(36), (255, 179, 90), 3)
SLOGAN = text_layer('Wie weit kommst du?', AN(96), BONE, 5)
STUFE = text_layer('STUFE', AN(76), BONE, 5)
ZIFFERN = {n: text_layer(str(n), AN(300), EMBER, 9) for n in range(1, 51)}
ORTE = {}
for *_, ort, boss, _z in CUT:
    ORTE.setdefault(ort, text_layer(ort, fit(ort, CZ, 56, 900), BONE, 4))
    if boss: ORTE.setdefault(boss, text_layer(boss, fit(boss, CZ, 56, 900), (255, 190, 120), 4))

def cut_at(t):
    k = 0
    for i, c in enumerate(CUT):
        if t >= c[0]: k = i
    return k

def level_at(t):
    """Zähler läuft weich zwischen den Schnitten hoch und rastet kurz vor dem nächsten ein."""
    k = cut_at(t); lv = CUT[k][4]
    if k + 1 < len(CUT):
        t0, t1 = CUT[k][0], CUT[k + 1][0]
        p = clamp((t - t0 - (t1 - t0) * 0.55) / max(0.01, (t1 - t0) * 0.4))
        lv = lv + (CUT[k + 1][4] - lv) * ease(p)
    return max(1, min(50, int(round(lv))))

def frame(t):
    k = cut_at(t); t0, name, f0, step, _, ort, boss, zoom = CUT[k]
    im = clip_frame(f'{ROH}/{name}', f0 + int((t - t0) * FPS) * step, zoom).convert('RGBA')
    d = ImageDraw.Draw(im, 'RGBA')
    # dunkle Verläufe oben und unten, damit Schrift überall lesbar bleibt
    for y0, y1, a0, a1 in [(0, 620, 215, 0), (1330, H, 0, 230)]:
        g = Image.new('RGBA', (1, y1 - y0), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
        for y in range(y1 - y0): gd.point((0, y), fill=(0, 0, 0, int(a0 + (a1 - a0) * y / (y1 - y0))))
        im.alpha_composite(g.resize((W, y1 - y0)), (0, y0))
    embers.draw(im, t, amount=0.55)
    end = t >= ENDE
    if not end:
        lv = level_at(t)
        # Stufenzähler: bei jedem Schnitt kurz größer
        pop = 1 + 0.12 * math.exp(-(t - t0) * 9)
        paste_c(im, STUFE, W / 2, 140, 1, ease(t / 0.3))
        paste_c(im, ZIFFERN[lv], W / 2, 330, pop, 1)
        # Fortschrittsbalken 1 … 50
        x0, x1, y = 120, 960, 548
        d.rounded_rectangle((x0, y, x1, y + 24), 12, fill=(30, 22, 22, 220), outline=(8, 5, 5, 255), width=2)
        d.rounded_rectangle((x0, y, x0 + (x1 - x0) * (lv - 1) / 49 + 1, y + 24), 12, fill=EMBER + (255,))
        d.text((x0, y + 40), '1', font=NU(30), fill=(224, 208, 186, 230)); d.text((x1 - 32, y + 40), '50', font=NU(30), fill=(224, 208, 186, 230))
        # Ort und Boss unten
        a = ease((t - t0) / 0.18)
        paste_c(im, ORTE[ort], W / 2, 1640 if not boss else 1600, 1, a)
        if boss: paste_c(im, ORTE[boss], W / 2, 1690, 1, a)
    else:
        p = (t - ENDE)
        paste_c(im, LOGO, W / 2, 300, 1.08 - 0.08 * ease(p / 0.4), ease(p / 0.3))
        paste_c(im, SLOGAN, W / 2, 1330, 1, ease((p - 0.15) / 0.3))
        a = ease((p - 0.4) / 0.3)
        paste_c(im, BADGE, W / 2, 1560, 1, a); paste_c(im, URL, W / 2, 1660, 1, a)
    # harter Weißblitz auf dem Schnitt
    fl = 1 - (t - t0) / 0.1
    if k and fl > 0: im.alpha_composite(Image.new('RGBA', (W, H), (255, 240, 210, int(80 * fl))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/c{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
