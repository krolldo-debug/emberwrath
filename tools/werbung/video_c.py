# Werbevideo C „Von 1 auf 50“ (Fassung 2): nur Kämpfe und Bosssiege aus dem echten Spiel, Stufenzähler oben,
# Schnitt auf die Trailermusik, Untertitel Wort für Wort, Abspann mit Logo und Aufruf.
#   python3 tools/werbung/video_c.py ROH-ORDNER ZIEL.mp4 [ton.wav] | ... ZIELORDNER bilder 1,4,9
import sys, os, math, json, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from c_plan import *

ROH, OUT = sys.argv[1], sys.argv[2]
GELB = (255, 214, 64)
embers = Embers(60, 11)
LOGO = logo(900)
BADGE = badge(400)
URL = text_layer('www.emberwrath.com', NU(54), (255, 196, 120), 4)
KNOPF_T = text_layer('JETZT KOSTENLOS SPIELEN', AN(66), (24, 12, 6), 0)
FRAGE = text_layer('Wie weit kommst du?', CZ(50), BONE, 4)
STUFE = text_layer('STUFE', AN(70), BONE, 5)
ZIFFERN = {n: text_layer(str(n), AN(280), EMBER, 9) for n in range(1, 51)}
TITEL = {}
for c in CUT:
    tit, unter, boss = c[8], c[9], c[10]
    TITEL.setdefault(tit, text_layer(tit, fit(tit, CZ, 60, 940), (255, 190, 120) if boss else BONE, 4))
    if unter: TITEL.setdefault(unter, text_layer(unter, fit(unter, NU, 32, 900), (224, 208, 186), 3))

# Untertitel: Wortzeiten der Sprecheraufnahme, auf die Videozeit umgerechnet
_w = json.load(open('/tmp/tage/t901/woerter.json'))
SAETZE = []
for si, at in STIMME:
    s = _w['saetze'][si]
    ws = [(w['wort'], at + w['start'] - s['start'], at + w['ende'] - s['start']) for w in _w['woerter'] if w['satz'] == si]
    SAETZE.append((at, at + s['ende'] - s['start'], ws))
UF = AN(74)
_wl = {}
def wort(text, farbe):
    if (text, farbe) not in _wl: _wl[(text, farbe)] = text_layer(text, UF, farbe, 6)
    return _wl[(text, farbe)]

def untertitel(im, t):
    for a, e, ws in SAETZE:
        if not (a - 0.05 <= t < e + 0.3): continue
        # Zeilen bis 880 px Breite
        zeilen, z, b = [], [], 0
        for w in ws:
            wb = tw(w[0], UF) + 22
            if z and b + wb > 960: zeilen.append((z, b)); z, b = [], 0
            z.append(w); b += wb
        zeilen.append((z, b))
        y = 1400 - (len(zeilen) - 1) * 48
        jetzt = ([w[0] for w in ws if t >= w[1] - 0.04] or [None])[-1] if t < e + 0.1 else None
        for z, b in zeilen:
            x = W / 2 - b / 2
            for text, wa, we in z:
                wb = tw(text, UF) + 22
                if t >= wa - 0.04:                       # Wörter erscheinen, sobald sie gesprochen werden
                    aktiv = text == jetzt
                    paste_c(im, wort(text, GELB if aktiv else BONE), x + wb / 2, y, 1.0 + 0.1 * math.exp(-(t - wa + 0.04) * 16), 1)
                x += wb
            y += 96

def level_at(t):
    """Zähler läuft kurz vor dem nächsten Schnitt hoch und rastet auf dem Schnitt ein."""
    k = cut_at(t); lv = CUT[k][7]
    if k == 0: return 50
    if k + 1 < len(CUT):
        t1 = CUT[k + 1][0]; p = clamp((t - (t1 - 0.3)) / 0.3)
        lv = lv + (CUT[k + 1][7] - 1 - lv) * p
    return max(1, min(50, int(lv)))

_verlauf = {}
def verlauf(y0, y1, a0, a1):
    key = (y0, y1, a0, a1)
    if key not in _verlauf:
        g = Image.new('RGBA', (1, y1 - y0)); gd = ImageDraw.Draw(g)
        for y in range(y1 - y0): gd.point((0, y), fill=(0, 0, 0, int(a0 + (a1 - a0) * y / (y1 - y0))))
        _verlauf[key] = g.resize((W, y1 - y0))
    return _verlauf[key]

def szene(t):
    """Spielbild: ganzzahlig vergrößert, Ausschnitt um (dx, dy) versetzt, auf Akzenten kurzes Wackeln."""
    k, nr = bild_nr(t); c = CUT[k]; name, ms, dx, dy = c[1], c[4], c[5], c[6]
    d = f'{ROH}/{name}'; n = len([f for f in os.listdir(d) if f[0] == 'f' and f.endswith('.png')]) if d not in _n else _n[d]
    _n[d] = n
    im = Image.open(f'{d}/f{max(0, min(n - 1, nr)):05d}.png').convert('RGB')
    cw, ch = -(-W // ms), -(-H // ms)
    dt = t - c[0]
    if c[0] in AKZENT and dt < 0.22:
        r = random.Random(int(t * 30)); a = 3 * (1 - dt / 0.22)
        dx += round(r.uniform(-a, a)); dy += round(r.uniform(-a, a))
    x = max(0, min(im.width - cw, (im.width - cw) // 2 + dx)); y = max(0, min(im.height - ch, (im.height - ch) // 2 + dy))
    im = im.crop((x, y, x + cw, y + ch)).resize((cw * ms, ch * ms), Image.NEAREST)
    return im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H))
_n = {}

def frame(t):
    k = cut_at(t); c = CUT[k]; t0, tit, unter, boss = c[0], c[8], c[9], c[10]
    im = szene(t)
    if t >= TH:                                 # Abspann: Spiel läuft abgedunkelt in Zeitlupe weiter
        im = Image.blend(im, Image.new('RGB', (W, H), (8, 5, 9)), 0.72 * ease((t - TH) / 0.35))
    im = im.convert('RGBA')
    im.alpha_composite(verlauf(0, 760, 225, 0), (0, 0))
    im.alpha_composite(verlauf(1150, H, 0, 235), (0, 1150))
    embers.draw(im, t, amount=0.5 if t < TH else 0.9)
    d = ImageDraw.Draw(im, 'RGBA')
    aus = 1 - ease((t - TH) / 0.2)
    if aus > 0.003:
        lv = level_at(t)
        pop = 1 + (0.45 if t0 in AKZENT else 0.14) * math.exp(-(t - t0) * 9)
        paste_c(im, STUFE, W / 2, 132, 1, ease(t / 0.25) * aus)
        paste_c(im, ZIFFERN[lv], W / 2, 312, pop, aus)
        x0, x1, y = 120, 960, 512; al = int(255 * aus)
        d.rectangle((x0, y, x1, y + 22), fill=(30, 22, 22, int(220 * aus)), outline=(8, 5, 5, al), width=3)
        d.rectangle((x0 + 3, y + 3, x0 + 3 + (x1 - x0 - 6) * (lv - 1) / 49, y + 19), fill=EMBER + (al,))
        a = ease((t - t0) / 0.12) * aus
        paste_c(im, TITEL[tit], W / 2, 606, 1, a)
        if unter: paste_c(im, TITEL[unter], W / 2, 672, 1, a)
        untertitel(im, t)
    if t >= TH:
        p = t - TH
        paste_c(im, LOGO, W / 2, 560, 1 + 0.35 * (1 - back(p / 0.4)), ease(p / 0.12))
        paste_c(im, FRAGE, W / 2, 830, 1, ease((p - 0.5) / 0.4))
        q = t - TE
        if q > 0:
            a = ease(q / 0.3); s = 0.9 + 0.1 * back(q / 0.35)
            bw, bh = 880 * s, 132 * s; cx, cy = W / 2, 1060
            d.rectangle((cx - bw / 2 - 6, cy - bh / 2 - 6, cx + bw / 2 + 6, cy + bh / 2 + 6), fill=(60, 22, 6, int(255 * a)))
            d.rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), fill=EMBER + (int(255 * a),))
            d.rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy - bh / 2 + 9), fill=(255, 196, 110, int(255 * a)))
            paste_c(im, KNOPF_T, cx, cy + 2, s, a)
            paste_c(im, URL, W / 2, 1192, 1, ease((q - 0.25) / 0.3))
            qa = q - 0.7
            paste_c(im, BADGE, W / 2, 1380, 0.9 + 0.1 * back(qa / 0.35), ease(qa / 0.25))
    # Lichtblitz auf dem Schnitt, stärker auf den Akzenten und dem Logo
    for tb, st, da in [(t0, 150 if t0 in AKZENT else 70, 0.14 if t0 in AKZENT else 0.09)] * (k > 0) + [(TH, 170, 0.16)]:
        fl = 1 - (t - tb) / da
        if t >= tb and fl > 0: im.alpha_composite(Image.new('RGBA', (W, H), (255, 240, 210, int(st * fl))))
    return im.convert('RGB')

if len(sys.argv) > 3 and sys.argv[3] == 'bilder':
    os.makedirs(OUT, exist_ok=True)
    for t in map(float, sys.argv[4].split(',')): frame(t).save(f'{OUT}/c{t:05.2f}.png')
else:
    ff = writer(OUT, sys.argv[3] if len(sys.argv) > 3 else None, DUR)
    for n in range(int(DUR * FPS)): ff.stdin.write(frame(n / FPS).tobytes())
    ff.stdin.close(); ff.wait(); print('fertig', OUT)
