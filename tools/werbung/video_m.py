# Werbevideo „Malgareths Bitte“: der Endboss spricht selbst und bittet als Erstes, das Spiel nicht herunterzuladen,
# während ihn im großen Spielbild eine Gruppe besiegt. Zähler „Heute schon gestürzt“ springt beim Sieg von 3 auf 4;
# im Abspann dreht sich der Knopf von „Nicht herunterladen“ auf „Trotzdem spielen“.
#   python3 tools/werbung/video_m.py HUD-ORDNER ZIEL.mp4 [ton.wav]  |  … ZIELORDNER bilder 0.5,1.2
import sys, os, math, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from handy import *
from plan2 import M as P

HUD, OUT = sys.argv[1], sys.argv[2]
DUR, KILL, TH = P['dur'], P['kill'], P['th']; TD = 8.48
A = Aufnahme(f"{HUD}/{P['aufnahme']}"); U = Untertitel(P['stimme'])     # Sätze: 0 Bitte, 1 Vorstellung, 2 „Und dann kommt ihr“, 3 Orte, 4 dreimal, 5 „Nicht schon wieder“
ROT, GLUT = (150, 30, 16), (150, 52, 10); HELLROT = (255, 92, 44)
BG1, BG2 = glow_bg(ROT, cy=380), glow_bg(GLUT, cy=380)
embers = Embers()
LOGO_L = logo(940)
L1 = text_layer('EINE DRINGENDE BITTE', fit('EINE DRINGENDE BITTE', AN, 130, 960), BONE)
L2 = text_layer('VON MALGARETH.', fit('VON MALGARETH.', AN, 150, 980), HELLROT)
SUB = [(text_layer(s, NU(46), (216, 196, 168)), at) for s, at in (('Aschenfürst.', U.zeit(1, 'Der')), ('Endboss.', U.zeit(1, 'Der') + 0.7), ('Genervt.', U.zeit(2, 'Mit')))]
ENDSUB = text_layer('Im Browser. Auf dem iPhone. Kostenlos.', NU(46), (216, 196, 168))
ORTE = [('IN DER BAHN', U.zeit(3)), ('IN DER MITTAGSPAUSE', U.zeit(3, 'Mittagspause') - 0.25), ('AUF DEM KLO', U.zeit(3, 'Klo') - 0.3)]
T_ORT = U.zeit(3) - 0.2; T_ZAHL = U.zeit(4, 'dreimal')
ZAEHLER = text_layer('HEUTE SCHON GESTÜRZT', AN(50), BONE); MAL = {n: text_layer(f'{n}×', AN(76), (20, 8, 2)) for n in (3, 4)}
BTN_NEIN = text_layer('NICHT HERUNTERLADEN', AN(62), BONE); BTN_JA = text_layer('TROTZDEM SPIELEN', AN(62), (20, 8, 2))

def frame(t):
    sieg = t >= KILL; ende = t >= TH
    bg = BG1 if not ende else Image.blend(BG1, BG2, ease((t - TH) / 0.4))
    beat = math.exp(-((t - TD) % 2.0) * 3.0) if TD <= t < KILL + 0.9 else 0
    im = Image.blend(Image.new('RGB', (W, H), DARK), bg, 0.74 + 0.26 * beat).convert('RGBA')
    embers.draw(im, t, amount=0.8)
    dx = dy = 0
    for tb, st, da in ((KILL, 10, 0.45), (TD, 5, 0.25)):
        if 0 <= t - tb < da:
            r = random.Random(int(t * 30)); k = st * (1 - (t - tb) / da); dx += round(r.uniform(-k, k)); dy += round(r.uniform(-k, k))
    bl = max(0.7 * (1 - (t - KILL) / 0.25) if sieg else 0, 0.4 * (1 - (t - TD) / 0.15) if t >= TD else 0)
    spiel(im, A.bild(t), dx, dy, bl, 0.62 * ease((t - TH) / 0.4) if ende else 0)
    d = ImageDraw.Draw(im, 'RGBA')
    if not ende:
        a1 = (t - 0.08) / 0.18; a2 = (t - 0.45) / 0.18
        if a1 > 0: paste_c(im, L1, W / 2, 248, 1.5 - 0.5 * ease(a1), ease(a1))
        if a2 > 0: paste_c(im, L2, W / 2, 372, 1.6 - 0.6 * ease(a2), ease(a2))
        y = 498
        if t < T_ORT + 0.2:                 # Unterzeile: drei Wörter, erscheinen mit dem Text
            aus = 1 - clamp((t - T_ORT) / 0.2); gap = 14; sw = sum(l.width - 48 for l, _ in SUB) + gap * 2; x = (W - sw) / 2
            for l, at in SUB:
                a = ease((t - at) / 0.2)
                if a > 0: paste_c(im, l, x + (l.width - 48) / 2, y + (1 - a) * 14, 1, a * aus)
                x += l.width - 48 + gap
        if T_ORT <= t < T_ZAHL:             # Orte, an denen gespielt wird, erscheinen mit den Wörtern
            f = AN(42); ws = [tw(c, f) + 48 for c, _ in ORTE]; x = (W - sum(ws) - 16 * 2) / 2; aus = 1 - clamp((t - T_ZAHL + 0.2) / 0.2)
            for (c, at), w in zip(ORTE, ws):
                a = back((t - at) / 0.25) * aus if t > at else 0
                if a > 0.02:
                    hw, hh = w / 2 * a, 40 * a; cx = x + w / 2
                    d.rounded_rectangle((cx - hw, y - hh, cx + hw, y + hh), 18, fill=(30, 16, 10, 255), outline=HELLROT + (255,), width=3)
                    if a > 0.8: d.text((cx - (w - 48) / 2, y - 30), c, font=f, fill=BONE)
                x += w + 16
        if t >= T_ZAHL:                     # Zähler „Heute schon gestürzt: 3×“, springt beim Sieg auf 4×
            a = back((t - T_ZAHL) / 0.25); n = 4 if sieg else 3
            zw = ZAEHLER.width - 48; bw = 150; gw = zw + 26 + bw; x = (W - gw) / 2
            if a > 0.05:
                paste_c(im, ZAEHLER, x + zw / 2, y - 2, 1, clamp(a))
                pop = 1 + (0.6 * math.exp(-(t - KILL) * 7) if sieg else 0)
                hw, hh = bw / 2 * a * pop, 44 * a * pop; cx = x + zw + 26 + bw / 2
                d.rectangle((cx - hw, y - hh, cx + hw, y + hh), fill=(GELB if sieg else EMBER) + (255,))
                paste_c(im, MAL[n], cx, y - 3, a * pop, 1)
    else:
        p = t - TH
        paste_c(im, LOGO_L, W / 2, 310, 1.25 - 0.25 * ease(p / 0.35), ease(p / 0.35))
        paste_c(im, ENDSUB, W / 2, 478 + 14 * (1 - ease((p - 0.3) / 0.3)), 1, ease((p - 0.3) / 0.3))
        q = p - 0.2                         # Knopf: erst die Bitte des Bosses, dann dreht er sich um
        if 0 < q < 0.6: knopf(im, BTN_NEIN, 930, back(q / 0.25) * (1 - clamp((q - 0.48) / 0.12)), farbe=(92, 22, 18), breite=760)
        aufruf(im, q - 0.6, BTN_JA)
    U.zeichne(im, t, 1490, aktiv=(255, 170, 80))
    for tb, st in ((KILL, 120), (TH, 90)):
        if 0 <= t - tb < 0.12: im.alpha_composite(Image.new('RGBA', (W, H), (255, 244, 220, int(st * (1 - (t - tb) / 0.12)))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/m{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
