# Werbevideo „Live-Kommentar“: ein Fußballkommentator überträgt den Kampf gegen Skalvyr. Oben Anzeigetafel mit dem
# Leben des Bosses, darunter groß das echte Spiel, dann der Kommentar Wort für Wort. Logo, Knopf und App-Store-Marke
# kommen erst im Abspann.
#   python3 tools/werbung/video_k.py HUD-ORDNER ZIEL.mp4 [ton.wav]  |  … ZIELORDNER bilder 0.5,1.2
import sys, os, math, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from handy import *
from plan2 import K as P

HUD, OUT = sys.argv[1], sys.argv[2]
DUR, KILL, TH = P['dur'], P['kill'], P['th']
A = Aufnahme(f"{HUD}/{P['aufnahme']}"); U = Untertitel(P['stimme'])
EIS, GOLD, ROT = (24, 78, 150), (150, 92, 14), (226, 44, 40)
BG1, BG2 = glow_bg(EIS, cy=380), glow_bg(GOLD, cy=380)
embers = Embers()
LOGO_L = logo(940)
LIVE = text_layer('LIVE', AN(54), (255, 255, 255)); ORT = text_layer('AUS DEN REIFHÖHLEN', AN(54), BONE)
HELDEN = text_layer('3 HELDEN', AN(86), BONE, 4); BOSS = text_layer('SKALVYR', AN(86), (120, 200, 255), 4); GEGEN = text_layer('GEGEN', NU(30), (190, 176, 160))
PROZ = {n: text_layer(f'{n} %', AN(88), EMBER if n > 25 else ROT, 5) for n in range(0, 101)}
LEBEN = text_layer('LEBEN', NU(34), (190, 176, 160))
SIEG = text_layer('BESIEGT!', AN(150), GELB, 8).rotate(4, expand=True, resample=Image.BICUBIC)
SELBST = text_layer('JETZT SELBST MITSPIELEN.', fit('JETZT SELBST MITSPIELEN.', AN, 92, 980), BONE, 4)
BTN = text_layer('JETZT KOSTENLOS SPIELEN', AN(62), (20, 8, 2))
T_AUS = U.zeit(2, 'Ausgewichen')

def frame(t):
    sieg = t >= KILL; ende = t >= TH
    bg = BG1 if not sieg else Image.blend(BG1, BG2, ease((t - KILL) / 0.5))
    beat = math.exp(-((t - 4.68) % 2.0) * 3.0) if 4.68 <= t < TH else 0
    im = Image.blend(Image.new('RGB', (W, H), DARK), bg, 0.78 + 0.22 * beat).convert('RGBA')
    embers.draw(im, t, col=(150, 210, 255) if not sieg else EMBER, amount=0.8)
    # Spiel: wackelt beim Sieg, kurzer Ruck bei der Ausweichrolle und beim Musikeinsatz
    dx = dy = 0
    for tb, st, da in ((KILL, 10, 0.45), (T_AUS - 0.15, 4, 0.2), (4.68, 4, 0.2)):
        if 0 <= t - tb < da:
            r = random.Random(int(t * 30)); k = st * (1 - (t - tb) / da); dx += round(r.uniform(-k, k)); dy += round(r.uniform(-k, k))
    bl = max(0.7 * (1 - (t - KILL) / 0.25) if sieg else 0, 0.35 * (1 - (t - 4.68) / 0.15) if t >= 4.68 else 0)
    spiel(im, A.bild(t), dx, dy, bl, 0.62 * ease((t - TH) / 0.4) if ende else 0)
    d = ImageDraw.Draw(im, 'RGBA')
    if not ende:
        # Zeile „● LIVE  AUS DEN REIFHÖHLEN“
        a = back(t / 0.25); bw = LIVE.width - 48 + 86; gw = bw + 24 + ORT.width - 48; x = (W - gw) / 2; y = 232
        if a > 0:
            d.rectangle((x, y - 40 * a, x + bw, y + 40 * a), fill=ROT + (255,))
            if (t * 2) % 2 < 1.3: d.rectangle((x + 20, y - 11, x + 42, y + 11), fill=(255, 255, 255, 255))
            paste_c(im, LIVE, x + 56 + (LIVE.width - 48) / 2, y - 2, 1, clamp(a))
            paste_c(im, ORT, x + bw + 24 + (ORT.width - 48) / 2, y - 2, 1, ease((t - 0.1) / 0.25))
        # Anzeigetafel
        a = ease((t - 0.2) / 0.25)
        if a > 0:
            al = int(255 * a)
            d.rectangle((30, 284, 1050, 536), fill=(10, 12, 20, 255), outline=(70, 96, 140, 255), width=4)
            paste_c(im, HELDEN, 56 + HELDEN.width / 2 - 14, 336, 1, a); paste_c(im, BOSS, 1024 - BOSS.width / 2 + 14, 336, 1, a)
            paste_c(im, GEGEN, W / 2, 340, 1, a)
            f = A.leben(t)
            leiste(im, 60, 386, 1020, 46, f, farbe=ROT if f > 0.25 else (255, 120, 40))
            if not sieg:
                n = max(1, min(100, int(math.ceil(f * 100))))
                paste_c(im, LEBEN, W / 2 - PROZ[n].width / 2 - 30, 490, 1, a); paste_c(im, PROZ[n], W / 2 + 60, 484, 1, a)
            else:
                p = t - KILL
                paste_c(im, SIEG, W / 2, 468, 2.2 - 1.2 * back(p / 0.22, 2.2), ease(p / 0.08))
    else:
        p = t - TH
        paste_c(im, LOGO_L, W / 2, 310, 1.25 - 0.25 * ease(p / 0.35), ease(p / 0.35))
        paste_c(im, SELBST, W / 2, 478 + 14 * (1 - ease((p - 0.3) / 0.3)), 1, ease((p - 0.3) / 0.3))
        aufruf(im, p - 0.25, BTN)
    U.zeichne(im, t, 1490)
    for tb, st in ((KILL, 120), (TH, 90)):
        if 0 <= t - tb < 0.12: im.alpha_composite(Image.new('RGBA', (W, H), (255, 244, 220, int(st * (1 - (t - tb) / 0.12)))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/k{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
