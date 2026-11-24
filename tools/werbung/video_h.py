# Werbevideo „Verpass deine Haltestelle“: ein Bosskampf in der Bahn. Oben der Linienplan mit dem Zug, die Stationen
# zählen herunter, im großen Spielbild sinkt das Leben von Ignaroth. Der Boss fällt, die Haltestelle ist verpasst.
# Logo, Knopf und App-Store-Marke kommen erst im Abspann.
#   python3 tools/werbung/video_h.py HUD-ORDNER ZIEL.mp4 [ton.wav]  |  … ZIELORDNER bilder 0.5,1.2
import sys, os, math, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from handy import *
from plan2 import H as P

HUD, OUT = sys.argv[1], sys.argv[2]
DUR, KILL, TH = P['dur'], P['kill'], P['th']; C1, C2 = P['schnitte']; TUER = P['tueren']
A = Aufnahme(f"{HUD}/{P['aufnahme']}"); U = Untertitel(P['stimme'])
NACHT, GLUT, ROT = (16, 70, 112), (150, 52, 10), (232, 48, 40)
BG1, BG2 = glow_bg(NACHT, cy=380), glow_bg(GLUT, cy=380)
embers = Embers()
LOGO_M = logo(680)
T_MOMENT = U.zeit(4); T_DURCH = next(t for n, t, _ in P['extra'] if n == 'durchsage')
F1 = AN(130)
NOCH = text_layer('NOCH', F1, BONE); ZAHL = {n: text_layer(str(n), AN(176), EMBER, 4) for n in (7, 3, 1)}
STAT = {True: text_layer('STATIONEN', F1, BONE), False: text_layer('STATION', F1, BONE)}
BOSSN = text_layer('IGNAROTH', AN(84), (255, 150, 70)); PROZ = {n: text_layer(f'{n} %', AN(84), BONE if n > 25 else ROT) for n in range(0, 101)}
BESIEGT = text_layer('BOSS BESIEGT!', fit('BOSS BESIEGT!', AN, 140, 960), GELB, 5)
DEINE = text_layer('DEINE HALTESTELLE?', fit('DEINE HALTESTELLE?', AN, 120, 960), BONE); VERPASST = text_layer('VERPASST.', AN(170), ROT)
E1 = text_layer('VERPASS DEINE', fit('VERPASS DEINE', AN, 120, 940), BONE); E2 = text_layer('HALTESTELLE.', fit('HALTESTELLE.', AN, 160, 980), EMBER)
HBF = text_layer('HAUPTBAHNHOF', NU(30), GELB, 2); HALT = text_layer('NÄCHSTER HALT: HAUPTBAHNHOF', AN(44), (12, 16, 24)); ZU = text_layer('TÜREN SCHLIESSEN', AN(44), (255, 255, 255))
BTN = text_layer('JETZT KOSTENLOS SPIELEN', AN(62), (20, 8, 2))
X0, DX, ZIEL = 82, 114.5, 7                      # Linienplan: 9 Stationen, das Ziel ist die achte

def zug(t):
    """Stand des Zuges auf der Linie (Stationsnummer, gebrochen = unterwegs); an den Schnitten vergeht Zeit."""
    if t < C1: return 0.9 * t / C1
    if t < C2: return 4.0 + 0.9 * (t - C1) / (C2 - C1)
    if t < 13.1: return 6.0 + (t - C2) / (13.1 - C2)
    if t < TUER + 0.9: return 7.0
    return 7.0 + 1.2 * ((t - TUER - 0.9) / 2.6) ** 1.6

def faehrt(t): return not (13.1 <= t < TUER + 0.9)

def frame(t):
    sieg = t >= KILL; ende = t >= TH; seg = 0 if t < C1 else 1 if t < C2 else 2
    bg = BG1 if not ende else Image.blend(BG1, BG2, ease((t - TH) / 0.4))
    im = Image.blend(Image.new('RGB', (W, H), DARK), bg, 0.82).convert('RGBA')
    d = ImageDraw.Draw(im, 'RGBA')
    if not ende and faehrt(t):                      # Lichter draußen ziehen vorbei, solange die Bahn fährt
        for k in range(4):
            ph = (t * 1.35 + k * 0.37) % 1.0; x = W + 300 - ph * (W + 900); y = (70, 1610, 1750, 1880)[k]
            d.rectangle((x, y, x + 300 + 80 * k, y + 8), fill=(34, 58, 92, 255))
    embers.draw(im, t, amount=0.5 if not ende else 0.9)
    # Spiel ruckelt leicht mit der Bahn; beim Sieg wackelt es kräftig
    dx = dy = 0
    if faehrt(t) and not ende: dx = round(2.2 * math.sin(t * 9.1) + 1.4 * math.sin(t * 23.0)); dy = round(2.0 * math.sin(t * 13.7 + 1) + 1.2 * math.sin(t * 31.0))
    if 0 <= t - KILL < 0.45:
        r = random.Random(int(t * 30)); k = 10 * (1 - (t - KILL) / 0.45); dx += round(r.uniform(-k, k)); dy += round(r.uniform(-k, k))
    bl = max([0.7 * (1 - (t - KILL) / 0.25) if sieg else 0] + [0.55 * (1 - (t - c) / 0.18) for c in (C1, C2) if t >= c])
    spiel(im, A.bild(t), dx, dy, bl, 0.62 * ease((t - TH) / 0.4) if ende else 0)
    d = ImageDraw.Draw(im, 'RGBA')
    if not ende:
        # Linienplan
        a = ease((t - 0.05) / 0.25); y = 228; z = zug(t)
        if a > 0.5:
            d.rectangle((X0, y - 5, X0 + DX * 8, y + 5), fill=(70, 96, 130, 255))
            d.rectangle((X0, y - 5, X0 + DX * min(8, z), y + 5), fill=EMBER + (255,))
            for i in range(9):
                x = X0 + DX * i; r = 17 if i == ZIEL else 11
                col = GELB if i == ZIEL else (EMBER if i <= z else (120, 150, 190))
                d.rectangle((x - r, y - r, x + r, y + r), fill=(10, 12, 20, 255), outline=col + (255,), width=5)
            paste_c(im, HBF, X0 + DX * ZIEL - 20, y + 44, 1, a)
            x = X0 + DX * min(8.6, z); d.rectangle((x - 22, y - 15, x + 22, y + 15), fill=(255, 255, 255, 255)); d.rectangle((x - 14, y - 8, x + 14, y + 2), fill=(20, 30, 50, 255))
        # Schlagzeile: „NOCH 7 STATIONEN“ und darunter der Stand des Kampfes
        if t < T_MOMENT:
            n = (7, 3, 1)[seg]; t0 = (0.05, C1, C2)[seg]; st = STAT[n != 1]
            gw = NOCH.width - 48 + 26 + ZAHL[n].width - 48 + 26 + st.width - 48; x = (W - gw) / 2; a = ease((t - t0) / 0.15)
            pop = 1 + 0.5 * math.exp(-(t - t0) * 8)
            paste_c(im, NOCH, x + (NOCH.width - 48) / 2, 362, 1, a); x += NOCH.width - 48 + 26
            paste_c(im, ZAHL[n], x + (ZAHL[n].width - 48) / 2, 356, pop, a); x += ZAHL[n].width - 48 + 26
            paste_c(im, st, x + (st.width - 48) / 2, 362, 1, a)
            if not sieg:
                f = A.leben(t); p = max(1, min(100, int(math.ceil(f * 100)))); a = ease((t - 0.4) / 0.25)
                gw = BOSSN.width - 48 + 30 + PROZ[p].width - 48; x = (W - gw) / 2
                paste_c(im, BOSSN, x + (BOSSN.width - 48) / 2, 466, 1, a); paste_c(im, PROZ[p], x + BOSSN.width - 48 + 30 + (PROZ[p].width - 48) / 2, 466, 1 + (0.25 * math.exp(-(t - t0) * 8) if seg else 0), a)
                if a > 0.9: leiste(im, 150, 514, 930, 30, f, farbe=ROT if f > 0.25 else (255, 120, 40))
            else:
                p = t - KILL; paste_c(im, BESIEGT, W / 2, 484, 2.0 - 1.0 * back(p / 0.22, 2.2), ease(p / 0.08))
        else:
            p = t - T_MOMENT
            paste_c(im, DEINE, W / 2, 352, 1, ease(p / 0.15))
            p2 = t - U.zeit(4, 'meine')
            if p2 > 0: paste_c(im, VERPASST, W / 2, 480, 1.8 - 0.8 * back(p2 / 0.2, 2.0), ease(p2 / 0.08))
        # Anzeige in der Bahn: nächster Halt, dann Türen (unten links über dem Spiel)
        zeile = None
        if T_DURCH - 0.1 <= t < TUER: zeile = (HALT, GELB, back((t - T_DURCH + 0.1) / 0.25))
        elif TUER <= t < T_MOMENT + 1.9: zeile = (ZU, ROT, ((t - TUER) * 3.3) % 1 < 0.6 or t > TUER + 0.9)
        if zeile:
            l, col, a = zeile; bw = l.width - 48 + 56; cy = GY + GH - 64 + dy; x = 22 + dx
            if l is HALT:
                k = clamp(a); d.rectangle((x, cy - 42 * k, x + bw * k, cy + 42 * k), fill=col + (255,))
                if a > 0.8: paste_c(im, l, x + bw / 2, cy - 2, 1, 1)
            elif a:
                d.rectangle((x, cy - 42, x + bw, cy + 42), fill=col + (255,)); paste_c(im, l, x + bw / 2, cy - 2, 1, 1)
    else:
        p = t - TH
        a1, a2 = p / 0.18, (p - 0.14) / 0.18
        if a1 > 0: paste_c(im, E1, W / 2, 290, 1.5 - 0.5 * ease(a1), ease(a1))
        if a2 > 0: paste_c(im, E2, W / 2, 436, 1.6 - 0.6 * ease(a2), ease(a2))
        paste_c(im, LOGO_M, W / 2, 760, 1.2 - 0.2 * ease((p - 0.2) / 0.35), ease((p - 0.2) / 0.35))
        aufruf(im, p - 0.4, BTN, cy=960)
    U.zeichne(im, t, 1490)
    for tb, st in ((KILL, 120), (TH, 90)):
        if 0 <= t - tb < 0.12: im.alpha_composite(Image.new('RGBA', (W, H), (255, 244, 220, int(st * (1 - (t - tb) / 0.12)))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/h{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
