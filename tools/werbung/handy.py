# Gemeinsame Bausteine der Werbevideos im Handy-Stil (wie Video B): Handy quer mit laufendem Spiel samt Oberfläche,
# Untertitel Wort für Wort, Knopf, App-Store-Marke, Lebensleiste des Bosses.
import json, math, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from lib import *
from plan2 import ST

PX, PY, PW, PH = 20, 700, 1040, 502            # Handy außen
SX, SY, SW, SH = 40, 720, 1000, 462            # Bildschirm
GELB = (255, 214, 64)

_phone = Image.new('RGBA', (PW, PH), (0, 0, 0, 0)); _pd = ImageDraw.Draw(_phone)
_pd.rounded_rectangle((0, 0, PW - 1, PH - 1), 48, fill=(58, 55, 62)); _pd.rounded_rectangle((3, 3, PW - 4, PH - 4), 46, fill=(9, 9, 12))
_pd.rounded_rectangle((16, 16, PW - 17, PH - 17), 34, outline=(30, 29, 34), width=2)
MASK = Image.new('L', (SW, SH), 0); ImageDraw.Draw(MASK).rounded_rectangle((0, 0, SW - 1, SH - 1), 30, fill=255)
_shadow = Image.new('RGBA', (PW + 200, PH + 200), (0, 0, 0, 0))
ImageDraw.Draw(_shadow).rounded_rectangle((106, 126, PW + 94, PH + 134), 54, fill=(0, 0, 0, 190))
_shadow = _shadow.filter(ImageFilter.GaussianBlur(28))


class Aufnahme:
    """Bilder einer hud-record-Aufnahme (30 je Sekunde) samt Protokoll (Leben des Bosses je Bild)."""
    def __init__(self, ordner):
        self.d = ordner; self.n = len([f for f in os.listdir(ordner) if f.startswith('f') and f.endswith('.png')])
        self.log = json.load(open(f'{ordner}/log.json')); self._c = {}
    def bild(self, t):
        i = max(0, min(self.n - 1, int(round(t * FPS))))
        if i not in self._c:
            if len(self._c) > 4: self._c.clear()
            self._c[i] = Image.open(f'{self.d}/f{i:04d}.png').convert('RGB').resize((SW, SH), Image.LANCZOS)
        return self._c[i]
    def leben(self, t):
        e = self.log[max(0, min(len(self.log) - 1, int(round(t * FPS))))]
        return 0.0 if e['tot'] else e['hp']


def handy(im, scr, dx=0, dy=0, blitz=0.0):
    """Handy mit Bildschirminhalt zeichnen; dx/dy verschieben es (z. B. Ruckeln in der Bahn), blitz hellt den Schirm auf."""
    im.alpha_composite(_shadow, (PX - 100 + dx, PY - 100 + dy))
    im.alpha_composite(_phone, (PX + dx, PY + dy))
    im.paste(scr, (SX + dx, SY + dy), MASK)
    if blitz > 0.01:
        im.alpha_composite(Image.merge('RGBA', (*Image.new('RGB', (SW, SH), (255, 236, 200)).split(), MASK.point(lambda v: int(v * min(1, blitz))))), (SX + dx, SY + dy))


class Untertitel:
    """Gesprochene Sätze Wort für Wort; das gerade gesprochene Wort ist farbig."""
    def __init__(self, stimme, groesse=62, breite=980):
        self.f = AN(groesse); self.h = int(groesse * 1.3); self.s = []; self._l = {}
        cache = {}
        for name, si, at in stimme:
            w = cache.setdefault(name, json.load(open(f'{ST}/{name}/woerter.json'))); s = w['saetze'][si]
            ws = [(x['wort'], at + x['start'] - s['start'], at + x['ende'] - s['start']) for x in w['woerter'] if x['satz'] == si]
            zeilen, z, b = [], [], 0
            for x in ws:
                wb = tw(x[0], self.f) + 18
                if z and b + wb > breite: zeilen.append((z, b)); z, b = [], 0
                z.append(x); b += wb
            zeilen.append((z, b))
            self.s.append((at, at + s['ende'] - s['start'], ws, zeilen))
    def zeit(self, k, wort=None):
        """Beginn von Satz k oder des ersten Wortes darin, das mit `wort` anfängt."""
        at, e, ws, _ = self.s[k]
        return at if wort is None else next(a for x, a, _ in ws if x.startswith(wort))
    def _wort(self, text, farbe):
        if (text, farbe) not in self._l: self._l[(text, farbe)] = text_layer(text, self.f, farbe, 5)
        return self._l[(text, farbe)]
    def zeichne(self, im, t, y, aktiv=GELB, halten=0.35):
        for k, (a, e, ws, zeilen) in enumerate(self.s):
            bis = min(e + halten, self.s[k + 1][0] - 0.05) if k + 1 < len(self.s) else e + halten
            if not (a - 0.05 <= t < bis): continue
            jetzt = ([i for i, x in enumerate(ws) if t >= x[1] - 0.04] or [-1])[-1] if t < e + 0.1 else -1
            yy = y - (len(zeilen) - 1) * self.h / 2; i = 0
            for z, b in zeilen:
                x = W / 2 - b / 2
                for text, wa, we in z:
                    wb = tw(text, self.f) + 18
                    if t >= wa - 0.04: paste_c(im, self._wort(text, aktiv if i == jetzt else BONE), x + wb / 2, yy, 1.0 + 0.1 * math.exp(-(t - wa + 0.04) * 16), 1)
                    x += wb; i += 1
                yy += self.h


def knopf(im, layer, cy, k=1.0, farbe=EMBER, breite=None, schein=False, t=0.0):
    """Knopf im Stil von Video B; mit schein pulsiert er und ein Lichtstreif läuft darüber."""
    if k <= 0.02: return
    d = ImageDraw.Draw(im, 'RGBA'); cx = W / 2
    bw, bh = (breite or layer.width + 60) * k, 120 * k
    if schein:
        g = Image.new('RGBA', (W, 400), (0, 0, 0, 0)); ImageDraw.Draw(g).rounded_rectangle((cx - bw / 2 - 10, 200 - bh / 2 - 10, cx + bw / 2 + 10, 200 + bh / 2 + 10), 34, fill=farbe + (120,))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(26)), (0, int(cy) - 200)); d = ImageDraw.Draw(im, 'RGBA')
    d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), 28, fill=farbe + (255,))
    hell = tuple(int(c + (255 - c) * 0.16) for c in farbe)
    d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy - bh / 2 + bh * 0.48), 28, fill=hell + (255,))
    d.rectangle((cx - bw / 2, cy - bh / 2 + bh * 0.3, cx + bw / 2, cy - bh / 2 + bh * 0.48), fill=hell + (255,))
    paste_c(im, layer, cx, cy - 2, k, 1)
    sw = (t % 2.0) / 0.5
    if schein and 0 < sw < 1:
        sx = cx - bw / 2 + (bw + 160) * sw - 80
        st = Image.new('RGBA', (W, int(bh)), (0, 0, 0, 0)); ImageDraw.Draw(st).polygon([(sx, 0), (sx + 60, 0), (sx + 20, bh), (sx - 40, bh)], fill=(255, 255, 255, 110))
        m = Image.new('L', (W, int(bh)), 0); ImageDraw.Draw(m).rounded_rectangle((cx - bw / 2, 0, cx + bw / 2, bh - 1), 28, fill=255)
        st.putalpha(ImageChops.multiply(st.getchannel('A'), m)); im.alpha_composite(st, (0, int(cy - bh / 2)))


_BADGE = badge(340); _URL = text_layer('www.emberwrath.com', NU(38), (255, 179, 90), 3)
def fuss(im, t):
    """App-Store-Marke und Adresse, von Anfang an sichtbar."""
    a = ease((t - 0.3) / 0.4)
    paste_c(im, _BADGE, W / 2, 1716, 1, a); paste_c(im, _URL, W / 2, 1806, 1, a)


def leiste(im, x0, y0, x1, h, anteil, farbe=(214, 46, 40), rahmen=(70, 30, 26)):
    """Lebensleiste mit harten Kanten; anteil 0 … 1."""
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle((x0, y0, x1, y0 + h), fill=(22, 12, 14, 255), outline=rahmen + (255,), width=3)
    if anteil > 0.003:
        xe = x0 + 5 + (x1 - x0 - 10) * clamp(anteil)
        d.rectangle((x0 + 5, y0 + 5, xe, y0 + h - 5), fill=farbe + (255,))
        d.rectangle((x0 + 5, y0 + 5, xe, y0 + 5 + max(3, h // 5)), fill=tuple(int(c + (255 - c) * 0.3) for c in farbe) + (255,))
