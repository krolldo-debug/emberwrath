# Gemeinsames Werkzeug der Werbevideos (1080 × 1920, 30 Bilder je Sekunde): Schriften, Text, Aufruf-Block, Ausgabe.
# Die Videos zeigen das echte Spiel: Aufnahmen mit Oberfläche aus tools/werbung/hud-record.mjs, Hochformat-Szenen aus
# /mnt/project-files/videos/kampagne-patch/werkzeug/tage-record.mjs.
import math, random, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
FW = '/mnt/project-files/videos/kampagne-patch/werkzeug'
EMBER, BONE, DARK = (255, 140, 40), (246, 230, 200), (12, 9, 14)

_fonts = {}
def font(name, size):
    key = (name, int(size))
    if key not in _fonts: _fonts[key] = ImageFont.truetype(f'{FW}/fonts/{name}', int(size))
    return _fonts[key]
AN = lambda s: font('anton-latin-400-normal.woff', s)
CZ = lambda s: font('cinzel-latin-900-normal.woff', s)
NU = lambda s: font('nunito-latin-800-normal.woff', s)

clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
ease = lambda p: 1 - (1 - clamp(p)) ** 3
def back(p, s=1.7):                      # leicht überschießen, dann einrasten
    p = clamp(p) - 1; return 1 + (s + 1) * p ** 3 + s * p ** 2

_scratch = ImageDraw.Draw(Image.new('RGB', (8, 8)))
def tw(text, f): return _scratch.textlength(text, font=f)
def fit(text, mk, size, maxw):
    while tw(text, mk(size)) > maxw: size -= 2
    return mk(size)

def text_layer(text, f, fill, stroke=0, stroke_fill=(10, 4, 2), pad=24):
    """Text als eigene durchsichtige Ebene (zum Einfliegen, Skalieren, Überblenden)."""
    l, t, r, b = _scratch.textbbox((0, 0), text, font=f, stroke_width=stroke)
    im = Image.new('RGBA', (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return im

def paste_c(dst, layer, cx, cy, scale=1.0, alpha=1.0):
    """Ebene mittig auf (cx, cy) setzen, optional skaliert und durchscheinend."""
    if alpha <= 0.003: return
    if abs(scale - 1) > 0.002:
        layer = layer.resize((max(1, round(layer.width * scale)), max(1, round(layer.height * scale))), Image.BICUBIC)
    if alpha < 0.997:
        layer = layer.copy(); layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    dst.alpha_composite(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2))) if _inside(dst, layer, cx, cy) else _paste_clip(dst, layer, cx, cy)

def _inside(dst, layer, cx, cy):
    x, y = round(cx - layer.width / 2), round(cy - layer.height / 2)
    return x >= 0 and y >= 0 and x + layer.width <= dst.width and y + layer.height <= dst.height
def _paste_clip(dst, layer, cx, cy):
    x, y = round(cx - layer.width / 2), round(cy - layer.height / 2)
    box = (max(0, -x), max(0, -y), min(layer.width, dst.width - x), min(layer.height, dst.height - y))
    if box[2] > box[0] and box[3] > box[1]: dst.alpha_composite(layer.crop(box), (max(0, x), max(0, y)))

def glow_bg(tint, cy=980, r=420, base=DARK):
    """Dunkler Grund mit weichem Schein in der Farbe der Szene."""
    small = Image.new('RGB', (W // 8, H // 8), base)
    ImageDraw.Draw(small).ellipse(((W / 2 - r) / 8, (cy - r) / 8, (W / 2 + r) / 8, (cy + r) / 8), fill=tint)
    return small.filter(ImageFilter.GaussianBlur(22)).resize((W, H), Image.BICUBIC)

class Embers:
    """Aufsteigende Glutfunken auf festem Pixelraster (harte Kanten wie im Spiel)."""
    def __init__(self, n=70, seed=3):
        rnd = random.Random(seed)
        self.p = [(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(40, 150), rnd.uniform(0, 6.28), rnd.choice([3, 3, 6, 6, 9]), rnd.uniform(0.25, 0.9)) for _ in range(n)]
    def draw(self, im, t, col=EMBER, amount=1.0):
        d = ImageDraw.Draw(im, 'RGBA')
        for x0, y0, v, ph, s, a in self.p:
            y = (y0 - v * t) % (H + 40) - 20; x = x0 + math.sin(t * 0.9 + ph) * 26
            fl = 0.6 + 0.4 * math.sin(t * 5 + ph * 3)
            x, y = int(x) // 3 * 3, int(y) // 3 * 3
            d.rectangle((x, y, x + s - 1, y + s - 1), fill=(*col, int(255 * a * fl * amount)))

_badge = None
def badge(width):
    global _badge
    if _badge is None: _badge = Image.open(f'{FW}/ui/badge-appstore-de.png').convert('RGBA')
    return _badge.resize((width, int(width * _badge.height / _badge.width)), Image.LANCZOS)
def logo(width):
    im = Image.open(f'{FW}/ui/logo.png').convert('RGBA')
    return im.resize((width, int(width * im.height / im.width)), Image.LANCZOS)

def writer(out, audio=None, dur=None, crf=18):
    """ffmpeg-Ausgabe: rohe RGB-Bilder über die Leitung, optional mit Ton."""
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    if audio: cmd += ['-i', audio]
    cmd += ['-map', '0:v']
    if audio: cmd += ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    if dur: cmd += ['-t', str(dur)]
    return subprocess.Popen(cmd + [out], stdin=subprocess.PIPE)


def clip_frame(dir_, i, zoom=1.0):
    """Bild aus einer Hochformat-Aufnahme (tage-record.mjs): ganzzahlig vergrößern, dann mittig beschneiden."""
    import os
    n = _clip_len(dir_); i = max(0, min(n - 1, i))
    im = Image.open(f'{dir_}/f{i:05d}.png').convert('RGB')
    k = max(1, -(-W // im.width), -(-H // im.height))
    if zoom > 1.01:                      # näher heran: erst beschneiden, dann vergrößern (Held wird größer)
        cw, ch = round(im.width / zoom), round(im.height / zoom)
        im = im.crop(((im.width - cw) // 2, (im.height - ch) // 2, (im.width - cw) // 2 + cw, (im.height - ch) // 2 + ch))
        k = max(1, -(-W // im.width), -(-H // im.height))
    im = im.resize((im.width * k, im.height * k), Image.NEAREST)
    if im.width > W or im.height > H:
        x, y = (im.width - W) // 2, (im.height - H) // 2
        im = im.crop((x, y, x + W, y + H))
    return im

_lens = {}
def _clip_len(dir_):
    import os
    if dir_ not in _lens: _lens[dir_] = len([f for f in os.listdir(dir_) if f.startswith('f') and f.endswith('.png')])
    return _lens[dir_]
