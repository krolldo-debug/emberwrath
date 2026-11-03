# Schnitt der Bossfilme (Aufnahmen von tools/bossfilm.mjs) für das Bosskino der Startseite.
# Je Boss: die 7 Sekunden (105 Bilder bei 15 fps) mit den meisten Bosseffekten (Gewichte in GEWICHT, gezählt aus
# meta.json), Ausschnitt 704 × 352 Feinpixel zwischen Gruppe und Boss, als Film ×2 nächster Nachbar hochgerechnet
# (H.264, 4:2:0: so trägt jedes Feinpixel genau einen Farbwert, die Pixelkanten bleiben hart) und ein verlustfreies
# Standbild (erstes Bild) für den Start, ohne JavaScript und bei reduzierter Bewegung.
# Dazu derselbe Film als VP9 (.webm) für Browser ohne H.264 (z. B. Chromium ohne Lizenz-Codecs).
# Schreibt site/img/bosskampf-<boss>.mp4/.webm/.webp und den Block <bossfilm.py> in site/bosskino.js.
# Aufruf: python3 site/tools/bossfilm.py AUFNAHMEN [boss=startbild,…]   (braucht ffmpeg mit libx264, Pillow)
import hashlib, json, os, re, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, '..', 'img')
JS = os.path.join(HERE, '..', 'bosskino.js')
REIHE = ['nerith', 'ignaroth', 'aasmutter', 'skalvyr', 'malgareth']   # Reihenfolge im Kino (nach Stufe)
FPS, N, W, H = 15, 105, 704, 352
GEWICHT = {'TideWave': 6, 'Whirlpool': 1, 'FallingIcicle': 2, 'Meteor': 4, 'FlameRing': 1.5, 'EmberSpear': 1, 'AshWave': 5,
           'ToxicCloud': 0.5, 'VineLash': 3, 'SporeLob': 3, 'ThrustFlare': 3}

src = sys.argv[1]
fest = dict(a.split('=') for a in sys.argv[2:])
meta = json.load(open(os.path.join(src, 'meta.json')))
bosse, h = {}, hashlib.sha1()
for n in REIHE:
    alle = sorted(k for k in meta if k.startswith(n + '-'))
    wert = [sum(GEWICHT.get(k, 0) for k in meta[b]['fx']) for b in alle]
    s = int(fest[n]) if n in fest else max(range(len(alle) - N), key=lambda i: sum(wert[i:i + N]))
    held, ziel = meta[alle[0]]['hero'], meta[alle[0]]['target']
    x0 = max(0, min(960 - W, (held['x'] + ziel['x']) // 2 - W // 2))
    y0 = max(0, min(540 - H, ziel['y'] - 250))
    film, vp9, bild = (os.path.join(IMG, f'bosskampf-{n}.{e}') for e in ('mp4', 'webm', 'webp'))
    ein = ['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-start_number', str(s), '-i', os.path.join(src, f'{n}-%03d.png'),
           '-frames:v', str(N), '-vf', f'crop={W}:{H}:{x0}:{y0},scale={W * 2}:{H * 2}:flags=neighbor', '-pix_fmt', 'yuv420p', '-an']
    subprocess.run(ein + ['-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', '21', '-profile:v', 'high', '-level', '4.0',
                          '-movflags', '+faststart', film], check=True)
    subprocess.run(ein + ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', vp9], check=True)
    Image.open(os.path.join(src, f'{n}-{s:03d}.png')).convert('RGB').crop((x0, y0, x0 + W, y0 + H)).save(bild, 'WEBP', lossless=True, method=6)
    for f in (film, vp9, bild):
        h.update(open(f, 'rb').read())
    bosse[n] = {'start': s}
    print(f'{n:10} ab Bild {s:3}  Film {os.path.getsize(film) // 1024} KB, VP9 {os.path.getsize(vp9) // 1024} KB  Standbild {os.path.getsize(bild) // 1024} KB')

block = {'W': W, 'H': H, 'reihe': REIHE, 'dauer': N / FPS, 'v': h.hexdigest()[:10]}
js = open(JS).read()
neu = re.sub(r'  // <bossfilm\.py>.*?// </bossfilm\.py>',
             f'  // <bossfilm.py> – von tools/bossfilm.py geschrieben, nicht von Hand ändern\n  const META = {json.dumps(block)};\n  // </bossfilm.py>',
             js, flags=re.S)
if neu == js and '<bossfilm.py>' not in js:
    sys.exit('Block <bossfilm.py> in bosskino.js nicht gefunden')
open(JS, 'w').write(neu)
