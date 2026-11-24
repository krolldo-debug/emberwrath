# Gemeinsame Bausteine der Werbevideos mit großem Spielbild: das echte Spiel samt Oberfläche in voller Breite,
# Untertitel Wort für Wort, Lebensleiste des Bosses; Knopf, App-Store-Marke und Adresse erst im Abspann
# (Rückmeldung 24.11.: ein Knopf von Anfang an wirkt sofort wie Werbung, das Spiel im Handy war zu klein).
import json, math, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from lib import *
from plan2 import ST

GY, GH = 560, 840                              # Spielbild: volle Breite, 840 hoch (Aufnahme mit VIEW=720x560)
GELB = (255, 214, 64)


class Aufnahme:
    """Bilder einer hud-record-Aufnahme (30 je Sekunde) samt Protokoll (Leben des Bosses je Bild)."""
    def __init__(self, ordner):
        self.d = ordner; self.n = len([f for f in os.listdir(ordner) if f.startswith('f') and f.endswith('.png')])
        self.log = json.load(open(f'{ordner}/log.json')); self._c = {}
    def bild(self, t):
        i = max(0, min(self.n - 1, int(round(t * FPS))))
        if i not in self._c:
            if len(self._c) > 4: self._c.clear()
            self._c[i] = Image.open(f'{self.d}/f{i:04d}.png').convert('RGB').resize((W, GH), Image.LANCZOS)
        return self._c[i]
    def leben(self, t):
        e = self.log[max(0, min(len(self.log) - 1, int(round(t * FPS))))]
        return 0.0 if e['tot'] else e['hp']


def spiel(im, scr, dx=0, dy=0, blitz=0.0, dunkel=0.0):
    """Spielbild in voller Breite; dx/dy verschieben es (Wackeln), blitz hellt auf, dunkel blendet für den Abspann ab."""
    if dunkel > 0.01: scr = Image.blend(scr, Image.new('RGB', scr.size, (8, 5, 9)), min(1, dunkel))
    if blitz > 0.01: scr = Image.blend(scr, Image.new('RGB', scr.size, (255, 236, 200)), min(1, blitz))
    d = ImageDraw.Draw(im)
    d.rectangle((0, GY - 6 + dy, W, GY + GH + 5 + dy), fill=(6, 5, 8, 255))
    im.paste(scr, (dx, GY + dy))
    d.rectangle((0, GY - 6 + dy, W, GY - 1 + dy), fill=(74, 46, 30, 255)); d.rectangle((0, GY + GH + dy, W, GY + GH + 5 + dy), fill=(74, 46, 30, 255))


class Untertitel:
    """Gesprochene Sätze Wort für Wort; das gerade gesprochene Wort ist farbig."""
    def __init__(self, stimme, groesse=62, breite=860):
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


_BADGE = badge(380); _URL = text_layer('www.emberwrath.com', NU(44), (255, 196, 120), 4)
def aufruf(im, p, btn, cy=930, farbe=EMBER):
    """Abspann über dem abgedunkelten Spiel: Knopf, App-Store-Marke, Adresse (p = Sekunden seit Beginn des Abspanns)."""
    k = back(p / 0.3) if p > 0 else 0
    knopf(im, btn, cy, k * (1 + 0.035 * (0.5 + 0.5 * math.sin(p * math.pi * 2))), farbe=farbe, breite=760, schein=p > 0.3, t=p - 0.5)
    a = ease((p - 0.35) / 0.3)
    paste_c(im, _BADGE, W / 2, cy + 150 + 14 * (1 - a), 1, a); paste_c(im, _URL, W / 2, cy + 245 + 14 * (1 - a), 1, ease((p - 0.5) / 0.3))


def leiste(im, x0, y0, x1, h, anteil, farbe=(214, 46, 40), rahmen=(70, 30, 26)):
    """Lebensleiste mit harten Kanten; anteil 0 … 1."""
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle((x0, y0, x1, y0 + h), fill=(22, 12, 14, 255), outline=rahmen + (255,), width=3)
    if anteil > 0.003:
        xe = x0 + 5 + (x1 - x0 - 10) * clamp(anteil)
        d.rectangle((x0 + 5, y0 + 5, xe, y0 + h - 5), fill=farbe + (255,))
        d.rectangle((x0 + 5, y0 + 5, xe, y0 + 5 + max(3, h // 5)), fill=tuple(int(c + (255 - c) * 0.3) for c in farbe) + (255,))
