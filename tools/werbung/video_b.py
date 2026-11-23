# Werbevideo B „Ein ganzes MMORPG“: Spiel mit Oberfläche im Handy quer, große Schlagzeile, vier Merkmale, Knopf.
#   python3 tools/werbung/video_b.py HUD-ORDNER ZIEL.mp4 [ton.mp3]        (ganzes Video)
#   python3 tools/werbung/video_b.py HUD-ORDNER ZIELORDNER bilder 0.5,1.2  (Standbilder zum Prüfen)
# Takt: 120 Schläge je Minute, Schnitte auf den Taktanfängen (1, 3, 5 … s), siehe ton_b.py.
import sys, os, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
sys.path.insert(0, os.path.dirname(__file__))
from lib import *

HUD, OUT = sys.argv[1], sys.argv[2]
DUR = 17.5
SEG = [   # Zeit, Szene (Ordner unter HUD), erstes Bild, Schlagzeile, Schein, Merkmal
    dict(t0=0.0, t1=5.0, scene='boss-ignaroth', f0=0, head=('EIN GANZES', 'MMORPG.'), tint=(150, 52, 10), chip=None),
    dict(t0=5.0, t1=7.0, scene='frost', f0=20, head=('VON STUFE', '1 BIS 50.'), tint=(24, 78, 150), chip=0),
    dict(t0=7.0, t1=9.0, scene='boss-malgareth', f0=0, head=('MÄCHTIGE', 'BOSSE.'), tint=(150, 30, 16), chip=1),
    dict(t0=9.0, t1=11.0, scene='reiten', f0=24, head=('EIGENE', 'REITTIERE.'), tint=(160, 84, 12), chip=2),
    dict(t0=11.0, t1=13.0, scene='gruppe', f0=60, head=('KÄMPFE IN', '3ER-GRUPPEN.'), tint=(150, 52, 10), chip=3),
    dict(t0=13.0, t1=DUR, scene='stadt-weg', f0=0, head=None, tint=(96, 50, 150), chip='alle'),
]
CHIPS = ['STUFE 1–50', 'BOSSE', 'REITTIERE', '3ER-GRUPPEN']
SUB = [('Im Browser.', 2.0), ('Auf dem iPhone.', 2.5), ('Kostenlos.', 3.0)]
PX, PY, PW, PH = 20, 700, 1040, 502            # Handy außen
SX, SY, SW, SH = 40, 720, 1000, 462            # Bildschirm

for s in SEG:
    s['bg'] = glow_bg(s['tint'])
    if s['head']:
        s['l1'] = text_layer(s['head'][0], fit(s['head'][0], AN, 150, 940), BONE)
        s['l2'] = text_layer(s['head'][1], fit(s['head'][1], AN, 190, 980), EMBER)
embers = Embers()
LOGO_S, LOGO_L = logo(380), logo(960)
BADGE = badge(340)
URL = text_layer('www.emberwrath.com', NU(38), (255, 179, 90), 3)
SUBL = [text_layer(t, NU(46), (216, 196, 168)) for t, _ in SUB]
gap = 14; subw = sum(l.width - 48 for l in SUBL) + gap * 2
BTN_T = text_layer('JETZT KOSTENLOS SPIELEN', AN(62), (20, 8, 2))

# Handy: Gehäuse und Bildschirmmaske
phone = Image.new('RGBA', (PW, PH), (0, 0, 0, 0)); pd = ImageDraw.Draw(phone)
pd.rounded_rectangle((0, 0, PW - 1, PH - 1), 48, fill=(58, 55, 62)); pd.rounded_rectangle((3, 3, PW - 4, PH - 4), 46, fill=(9, 9, 12))
pd.rounded_rectangle((16, 16, PW - 17, PH - 17), 34, outline=(30, 29, 34), width=2)
MASK = Image.new('L', (SW, SH), 0); ImageDraw.Draw(MASK).rounded_rectangle((0, 0, SW - 1, SH - 1), 30, fill=255)
SHADOW = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(SHADOW).rounded_rectangle((PX + 6, PY + 26, PX + PW - 6, PY + PH + 34), 54, fill=(0, 0, 0, 190))
SHADOW = SHADOW.filter(ImageFilter.GaussianBlur(28))

_cache = {}
def shot(scene, i):
    n = len([f for f in os.listdir(f'{HUD}/{scene}') if f.startswith('f')])
    i = max(0, min(n - 1, i)); key = (scene, i)
    if key not in _cache:
        if len(_cache) > 6: _cache.clear()
        _cache[key] = Image.open(f'{HUD}/{scene}/f{i:04d}.png').convert('RGB').resize((SW, SH), Image.LANCZOS)
    return _cache[key]

def seg_at(t):
    for i, s in enumerate(SEG):
        if t < s['t1']: return i
    return len(SEG) - 1

def screen(t):
    """Bildschirminhalt: Szene läuft in Echtzeit; beim Wechsel schiebt die neue Szene die alte hinaus."""
    i = seg_at(t); s = SEG[i]
    cur = shot(s['scene'], s['f0'] + int((t - s['t0']) * FPS))
    p = (t - s['t0']) / 0.2
    if i == 0 or p >= 1: return cur, 0.0
    prev = SEG[i - 1]; old = shot(prev['scene'], prev['f0'] + int((t - prev['t0']) * FPS))
    dx = int(SW * ease(p)); im = Image.new('RGB', (SW, SH))
    im.paste(old, (-dx, 0)); im.paste(cur, (SW - dx, 0))
    return im, 0.0

def frame(t):
    i = seg_at(t); s = SEG[i]; end = s['chip'] == 'alle'
    # Grund: Schein der Szene, weich in den nächsten überblendet, pulsiert im Takt
    bg = s['bg']
    if i > 0 and t - s['t0'] < 0.3: bg = Image.blend(SEG[i - 1]['bg'], bg, (t - s['t0']) / 0.3)
    beat = math.exp(-((t - 1.0) % 2.0) * 3.0) if t >= 1.0 else 0
    im = Image.blend(Image.new('RGB', (W, H), DARK), bg, 0.78 + 0.22 * beat).convert('RGBA')
    embers.draw(im, t, amount=0.8)
    # Logo oben (klein); am Schluss groß anstelle der Schlagzeile
    if not end: paste_c(im, LOGO_S, W / 2, 96, 1, ease(t / 0.4))
    else:
        p = (t - s['t0']) / 0.35
        paste_c(im, LOGO_L, W / 2, 330, 1.25 - 0.25 * ease(p), ease(p))
    # Schlagzeile: zwei Zeilen, schlagen nacheinander ein
    if s['head']:
        a1 = (t - (0.1 if i == 0 else s['t0'])) / 0.18; a2 = (t - (1.0 if i == 0 else s['t0'] + 0.12)) / 0.18
        out = 1 - clamp((t - (s['t1'] - 0.1)) / 0.1) if not SEG[i + 1]['head'] or True else 1
        if a1 > 0: paste_c(im, s['l1'], W / 2, 250, 1.5 - 0.5 * ease(a1), ease(a1) * out)
        if a2 > 0: paste_c(im, s['l2'], W / 2, 425, 1.6 - 0.6 * ease(a2), ease(a2) * out)
    # Unterzeile: drei Aussagen, erscheinen auf den Schlägen und bleiben stehen
    x = (W - subw) / 2
    for l, (_, at) in zip(SUBL, SUB):
        a = ease((t - at) / 0.2)
        if a > 0: paste_c(im, l, x + (l.width - 48) / 2, 578 + (1 - a) * 14, 1, a)
        x += l.width - 48 + gap
    # Handy
    im.alpha_composite(SHADOW)
    im.alpha_composite(phone, (PX, PY))
    scr, _ = screen(t)
    im.paste(scr, (SX, SY), MASK)
    fl = 1 - (t - s['t0']) / 0.16
    if i > 0 and fl > 0: im.alpha_composite(Image.merge('RGBA', (*Image.new('RGB', (SW, SH), (255, 236, 200)).split(), MASK.point(lambda v: int(v * 0.5 * fl)))), (SX, SY))
    d = ImageDraw.Draw(im, 'RGBA')
    # Merkmale: erscheinen ab 2,4 s nacheinander; das laufende ist gefüllt
    f = AN(42); ws = [tw(c, f) + 48 for c in CHIPS]; x = (W - sum(ws) - 16 * 3) / 2; y = 1300
    for k, (c, w) in enumerate(zip(CHIPS, ws)):
        a = back((t - (2.4 + 0.2 * k)) / 0.25) if t > 2.4 + 0.2 * k else 0
        if a > 0:
            on = end or s['chip'] == k
            lift = 0
            if s['chip'] == k: lift = -8 * ease((t - s['t0']) / 0.15)
            if end: lift = -6 * max(0, math.sin((t - s['t0'] - 0.1 * k) * 6)) * (1 if t - s['t0'] < 0.62 + 0.1 * k else 0)
            cy = y + 42 + lift; hw, hh = w / 2 * a, 42 * a; cx = x + w / 2
            d.rounded_rectangle((cx - hw, cy - hh, cx + hw, cy + hh), 18, fill=(EMBER if on else (30, 16, 10)) + (255,), outline=EMBER + (255,), width=3)
            if a > 0.8: d.text((cx - (w - 48) / 2, cy - 30), c, font=f, fill=(20, 8, 2) if on else BONE)
        x += w + 16
    # Knopf: ab 3,5 s, am Schluss pulsierend mit Lichtstreif
    a = back((t - 3.5) / 0.3) if t > 3.5 else 0
    if a > 0:
        k = a * (1 + (0.035 * (0.5 + 0.5 * math.sin((t - 13) * math.pi * 2)) if end else 0))
        bw, bh = 700 * k, 120 * k; cx, cy = W / 2, 1540
        if end:
            g = Image.new('RGBA', (W, 400), (0, 0, 0, 0)); ImageDraw.Draw(g).rounded_rectangle((cx - bw / 2 - 10, 200 - bh / 2 - 10, cx + bw / 2 + 10, 200 + bh / 2 + 10), 34, fill=EMBER + (120,))
            im.alpha_composite(g.filter(ImageFilter.GaussianBlur(26)), (0, int(cy) - 200))
            d = ImageDraw.Draw(im, 'RGBA')
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), 28, fill=EMBER + (255,))
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy - bh / 2 + bh * 0.48), 28, fill=(255, 176, 84, 90))
        paste_c(im, BTN_T, cx, cy - 2, k, 1)
        sw = ((t - 13.4) % 2.0) / 0.5
        if end and 0 < sw < 1:
            sx = cx - bw / 2 + (bw + 160) * sw - 80
            st = Image.new('RGBA', (W, int(bh)), (0, 0, 0, 0)); ImageDraw.Draw(st).polygon([(sx, 0), (sx + 60, 0), (sx + 20, bh), (sx - 40, bh)], fill=(255, 255, 255, 110))
            m = Image.new('L', (W, int(bh)), 0); ImageDraw.Draw(m).rounded_rectangle((cx - bw / 2, 0, cx + bw / 2, bh - 1), 28, fill=255)
            st.putalpha(ImageChops.multiply(st.getchannel('A'), m)); im.alpha_composite(st, (0, int(cy - bh / 2)))
    # App-Store-Marke und Adresse: von Anfang an
    a = ease((t - 0.3) / 0.4)
    paste_c(im, BADGE, W / 2, 1716, 1, a); paste_c(im, URL, W / 2, 1806, 1, a)
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/b{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)):
        ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
