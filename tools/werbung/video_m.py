# Werbevideo „Malgareths Bitte“: der Endboss spricht selbst und bittet, das Spiel nicht herunterzuladen, während ihn
# im Handy eine Gruppe besiegt. Zähler „Heute gestürzt“ springt beim Sieg von 3 auf 4, der Knopf dreht sich um.
#   python3 tools/werbung/video_m.py HUD-ORDNER ZIEL.mp4 [ton.wav]  |  … ZIELORDNER bilder 0.5,1.2
import sys, os, math, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from handy import *
from plan2 import M as P

HUD, OUT = sys.argv[1], sys.argv[2]
DUR, KILL, TH = P['dur'], P['kill'], P['th']
A = Aufnahme(f"{HUD}/{P['aufnahme']}"); U = Untertitel(P['stimme'])
ROT, GLUT = (150, 30, 16), (150, 52, 10); HELLROT = (255, 92, 44)
BG1, BG2 = glow_bg(ROT), glow_bg(GLUT)
embers = Embers()
LOGO_S, LOGO_L = logo(380), logo(960)
L1 = text_layer('EINE DRINGENDE BITTE', fit('EINE DRINGENDE BITTE', AN, 150, 960), BONE)
L2 = text_layer('VON MALGARETH.', fit('VON MALGARETH.', AN, 190, 980), HELLROT)
SUB = [(text_layer(s, NU(46), (216, 196, 168)), at) for s, at in (('Aschenfürst.', U.zeit(0, 'Der')), ('Endboss.', U.zeit(0, 'Der') + 0.9), ('Genervt.', U.zeit(3)))]
ENDSUB = text_layer('Im Browser. Auf dem iPhone. Kostenlos.', NU(46), (216, 196, 168))
ORTE = [('IN DER BAHN', U.zeit(3)), ('IN DER MITTAGSPAUSE', U.zeit(3, 'Mittagspause') - 0.25), ('AUF DEM KLO', U.zeit(3, 'Klo') - 0.3)]
T_ZAHL = U.zeit(4, 'dreimal'); T_BITTE = U.zeit(5, 'Ladet')
ZAEHLER = text_layer('HEUTE SCHON GESTÜRZT', AN(50), BONE); MAL = {n: text_layer(f'{n}×', AN(76), (20, 8, 2)) for n in (3, 4)}
BTN_NEIN = text_layer('NICHT HERUNTERLADEN', AN(62), BONE); BTN_JA = text_layer('TROTZDEM SPIELEN', AN(62), (20, 8, 2))

def frame(t):
    sieg = t >= KILL; ende = t >= TH
    bg = BG1 if not ende else Image.blend(BG1, BG2, ease((t - TH) / 0.4))
    beat = math.exp(-((t - 8.38) % 2.0) * 3.0) if 8.38 <= t < KILL + 1.2 else 0
    im = Image.blend(Image.new('RGB', (W, H), DARK), bg, 0.74 + 0.26 * beat).convert('RGBA')
    embers.draw(im, t, amount=0.8)
    d = ImageDraw.Draw(im, 'RGBA')
    if not ende:
        paste_c(im, LOGO_S, W / 2, 84, 1, ease(t / 0.4))
        a1 = (t - 0.1) / 0.18; a2 = (t - U.zeit(0, 'Malgareth') + 0.05) / 0.18
        if a1 > 0: paste_c(im, L1, W / 2, 262, 1.5 - 0.5 * ease(a1), ease(a1))
        if a2 > 0: paste_c(im, L2, W / 2, 425, 1.6 - 0.6 * ease(a2), ease(a2))
        if t < T_ZAHL:                      # Unterzeile: drei Wörter, erscheinen mit dem Text
            aus = 1 - clamp((t - T_ZAHL + 0.25) / 0.2); gap = 14; sw = sum(l.width - 48 for l, _ in SUB) + gap * 2; x = (W - sw) / 2
            for l, at in SUB:
                a = ease((t - at) / 0.2)
                if a > 0: paste_c(im, l, x + (l.width - 48) / 2, 584 + (1 - a) * 14, 1, a * aus)
                x += l.width - 48 + gap
        else:                               # Zähler „Heute schon gestürzt: 3×“, springt beim Sieg auf 4×
            a = back((t - T_ZAHL) / 0.25); n = 4 if sieg else 3
            zw = ZAEHLER.width - 48; bw = 150; gw = zw + 26 + bw; x = (W - gw) / 2; y = 590
            if a > 0.05:
                paste_c(im, ZAEHLER, x + zw / 2, y - 2, 1, clamp(a))
                pop = 1 + (0.6 * math.exp(-(t - KILL) * 7) if sieg else 0)
                hw, hh = bw / 2 * a * pop, 46 * a * pop; cx = x + zw + 26 + bw / 2
                d.rectangle((cx - hw, y - hh, cx + hw, y + hh), fill=(GELB if sieg else EMBER) + (255,))
                paste_c(im, MAL[n], cx, y - 3, a * pop, 1)
    else:
        p = t - TH
        paste_c(im, LOGO_L, W / 2, 330, 1.25 - 0.25 * ease(p / 0.35), ease(p / 0.35))
        paste_c(im, ENDSUB, W / 2, 578 + 14 * (1 - ease((p - 0.3) / 0.3)), 1, ease((p - 0.3) / 0.3))
    dx = dy = 0
    for tb, st, da in ((KILL, 9, 0.45), (8.38, 5, 0.25)):
        if 0 <= t - tb < da:
            r = random.Random(int(t * 30)); k = st * (1 - (t - tb) / da); dx += round(r.uniform(-k, k)); dy += round(r.uniform(-k, k))
    bl = max(0.75 * (1 - (t - KILL) / 0.25) if sieg else 0, 0.45 * (1 - (t - 8.38) / 0.15) if t >= 8.38 else 0)
    handy(im, A.bild(t), dx, dy, bl)
    d = ImageDraw.Draw(im, 'RGBA')
    # Orte, an denen gespielt wird (erscheinen mit den Wörtern, gehen vor der Bitte wieder)
    f = AN(42); ws = [tw(c, f) + 48 for c, _ in ORTE]; x = (W - sum(ws) - 16 * 2) / 2; aus = 1 - clamp((t - T_BITTE + 1.0) / 0.2)
    for (c, at), w in zip(ORTE, ws):
        a = back((t - at) / 0.25) * aus if t > at else 0
        if a > 0.02:
            cy = 1268; hw, hh = w / 2 * a, 42 * a; cx = x + w / 2
            d.rounded_rectangle((cx - hw, cy - hh, cx + hw, cy + hh), 18, fill=(30, 16, 10, 255), outline=HELLROT + (255,), width=3)
            if a > 0.8: d.text((cx - (w - 48) / 2, cy - 30), c, font=f, fill=BONE)
        x += w + 16
    U.zeichne(im, t, 1392 if U.zeit(3) - 0.1 <= t < T_BITTE - 1.0 else 1340, aktiv=(255, 170, 80))
    # Knopf: erst die Bitte des Bosses, am Schluss dreht er sich um
    if t >= T_BITTE:
        if not ende: knopf(im, BTN_NEIN, 1540, back((t - T_BITTE) / 0.3), farbe=(92, 22, 18), breite=700)
        else:
            p = t - TH; dreh = abs(math.cos(min(1, p / 0.3) * math.pi))          # klappt zu und in der neuen Farbe wieder auf
            if p < 0.15: knopf(im, BTN_NEIN.resize((BTN_NEIN.width, max(1, int(BTN_NEIN.height * dreh)))), 1540, 1, farbe=(92, 22, 18), breite=700)
            else: knopf(im, BTN_JA, 1540, (0.3 + 0.7 * dreh) * (1 + 0.035 * (0.5 + 0.5 * math.sin((p - 0.3) * math.pi * 2))), breite=700, schein=p > 0.3, t=p - 0.5)
    fuss(im, t)
    for tb, st in ((KILL, 120), (TH, 110)):
        if 0 <= t - tb < 0.12: im.alpha_composite(Image.new('RGBA', (W, H), (255, 244, 220, int(st * (1 - (t - tb) / 0.12)))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/m{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
