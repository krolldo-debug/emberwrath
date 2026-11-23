# Ton zu Werbevideo C (Fassung 2): echte Trailermusik (m_b als Auftakt, m_a ab dem Einsatz, Schlussschlag aufs Logo),
# Sprecher in einem Guss aufgenommen (tage-stimme.py → /tmp/tage/t901, Abspann-Satz aus /tmp/tage/t200),
# Spielklänge der gezeigten Szenen (klang.mjs), Schnitt-Klänge. Stimme mindestens 15 dB vor allem anderen, −14 LUFS.
#   PORT=8863 python3 tools/werbung/ton_c.py ROH-ORDNER ARBEITSORDNER   → ARBEITSORDNER/ton.wav
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from c_plan import *

ROH, OUT = sys.argv[1], sys.argv[2]
WZ = '/mnt/project-files/videos/kampagne-patch/werkzeug'
SR = 48000; N = int(DUR * SR)
os.makedirs(OUT, exist_ok=True)

def lade(pfad, ch=2):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', pfad, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.float32).reshape(-1, ch).copy()
def setze(spur, clip, t, gain=1.0):
    i = int(round(t * SR))
    if i < 0: clip = clip[-i:]; i = 0
    n = min(len(clip), len(spur) - i)
    if n > 0: spur[i:i + n] += clip[:n] * gain
def glatt(x, ms):
    k = max(1, int(SR * ms / 1000)); return np.convolve(x, np.ones(k) / k, mode='same')
def db(x): return 20 * np.log10(x + 1e-9)

# Musik: [Datei, Quelle ab, von, bis, einblenden, ausblenden, Pegel]
C = TH - 0.04
SEG = [('m_b.mp3', 0.0, 0.0, TD - 0.3, 0.0, 0.3, 0.85),
       ('m_a.mp3', 6.53 - 0.33, TD - 0.33, C, 0.0, 0.3, 1.0),
       ('m_a.mp3', 25.3, TH - 0.06, TH + 3.0, 0.04, 0.6, 1.0),
       ('m_b.mp3', 18.0, TH + 2.5, DUR, 0.5, 1.2, 0.75)]
mus = np.zeros((N, 2), np.float32); cache = {}
for d, q, a, b, fi, fo, g in SEG:
    x = cache.setdefault(d, lade(f'{WZ}/musik/{d}'))
    seg = x[int(q * SR):int(q * SR) + int((b - a) * SR)].copy()
    if fi > 0: k = min(len(seg), int(fi * SR)); seg[:k] *= np.linspace(0, 1, k)[:, None]
    if fo > 0: k = min(len(seg), int(fo * SR)); seg[-k:] *= np.linspace(1, 0, k)[:, None]
    setze(mus, seg, a, g)

# Stimme: Sätze einzeln an ihre Zeitpunkte
stimme = np.zeros(N, np.float32)
for nr, liste in ((901, STIMME), (200, [ABSPANN])):
    woe = json.load(open(f'/tmp/tage/t{nr}/woerter.json')); st = lade(f'/tmp/tage/t{nr}/stimme.wav', 1)[:, 0]
    for si, at in liste:
        s = woe['saetze'][si]; a = int(max(0, s['start'] - 0.06) * SR); e = int((s['ende'] + 0.18) * SR)
        seg = st[a:e].copy(); r = int(0.03 * SR); seg[-r:] *= np.linspace(1, 0, r); seg[:r // 2] *= np.linspace(0, 1, r // 2)
        setze(stimme, seg, at - (s['start'] - a / SR))

# Spielklänge der gezeigten Ausschnitte (Aufnahmezeit → Videozeit); Schritte u. Ä. bleiben, Dauerfeuer wird ausgedünnt
ev = []
for i, c in enumerate(CUT):
    t0, name, f0, step = c[:4]; t1 = CUT[i + 1][0] if i + 1 < len(CUT) else TH
    letzte = {}
    for t, n, opts in json.load(open(f'{ROH}/{name}/sfx.json')):
        tv = t0 + (t * 120 - f0) / (step * 30)
        if not (t0 <= tv < t1 - 0.03) or n == 'step': continue
        if tv - letzte.get(n, -9) < 0.09: continue
        letzte[n] = tv; ev.append(dict(t=round(tv, 4), name=n, opts=opts))
json.dump(dict(dauer=DUR, events=ev), open(f'{OUT}/ereignisse.json', 'w'))
subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'klang.mjs'), f'{OUT}/ereignisse.json', f'{OUT}/klang.wav'], check=True)
klang = lade(f'{OUT}/klang.wav'); klang = np.pad(klang, ((0, max(0, N - len(klang))), (0, 0)))[:N]

# Schnitt-Klänge
CINE = [('subdrop', 0.0, 1.0), ('riser', TD - 3.03, 0.7), ('subdrop', TD, 1.0), ('shimmer', TD - 0.05, 0.8),
        ('impact2', 8.5, 0.9), ('impact2', 12.5, 0.9), ('impact1', 16.5, 1.0), ('riser', TH - 3.03, 0.8),
        ('braam', TH, 1.0), ('shimmer', TE, 0.8)]
cine = np.zeros((N, 2), np.float32); cache = {}
for n, t, g in CINE:
    c = cache.setdefault(n, lade(f'{WZ}/sfx/{n}.mp3'))
    pk = np.abs(c).max() + 1e-9; rms = np.sqrt(np.mean(c ** 2)) + 1e-9
    setze(cine, c * min(0.12 / rms, 0.85 / pk), t, g)

# Stimme aufbereiten: Hochpass + Kompressor, danach liegt sie klar vorn
r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-af', 'highpass=f=90,acompressor=threshold=0.06:ratio=3.5:attack=4:release=90:makeup=2', '-f', 'f32le', '-'],
                   input=stimme.tobytes(), capture_output=True, check=True)
stimme = np.frombuffer(r.stdout, np.float32).copy()[:N]; stimme = np.pad(stimme, (0, N - len(stimme)))
env = glatt(np.abs(stimme), 25); an = (env > 0.01).astype(np.float32)
duck = np.clip(glatt(an, 220) * 1.6, 0, 1)
mg = (1 - duck * (1 - 10 ** (-17 / 20)))[:, None]; fg = (1 - duck * (1 - 10 ** (-8 / 20)))[:, None]
bg = mus * 0.62 * mg + (klang * 0.42 + cine * 0.9) * fg
sp = an > 0.5
# Abstand je Satz messen; Sätze über lauten Stellen (Einsatz, Schläge) bekommen bis zu 7 dB mehr Platz,
# danach wird die Stimme so weit angehoben, dass auch der knappste Satz 15 dB vor dem Hintergrund liegt.
SAETZE = []
for nr, liste in ((901, STIMME), (200, [ABSPANN])):
    woe = json.load(open(f'/tmp/tage/t{nr}/woerter.json'))
    for si, at in liste:
        s = woe['saetze'][si]; SAETZE.append((at, at + s['ende'] - s['start'], s['text']))
def abstand(a, e, vg=1.0):
    a, e = int(a * SR), int(e * SR); m = sp[a:e]
    return db(np.sqrt(np.mean((stimme[a:e][m] * vg) ** 2)) / np.sqrt(np.mean(np.mean(bg[a:e][m] ** 2, axis=1))))
g0 = [abstand(a, e) for a, e, _ in SAETZE]; ziel = float(np.median(g0)); extra = np.ones(N, np.float32)
for (a, e, _), g in zip(SAETZE, g0):
    extra[int((a - 0.05) * SR):int((e + 0.1) * SR)] = 10 ** (-min(7.0, max(0.0, ziel - g)) / 20)
bg *= glatt(extra, 160)[:, None]
vg = max(1.0, 10 ** ((15.0 - min(abstand(a, e) for a, e, _ in SAETZE)) / 20))
mix = bg + stimme[:, None] * vg
print(f'Stimme ×{vg:.2f}')
tmp = f'{OUT}/mix.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', tmp], input=mix.astype(np.float32).tobytes(), check=True)
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
j = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
af = (f"loudnorm=I=-14:TP=-1:LRA=9:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
      f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-ar', '48000', f'{OUT}/ton.wav'], check=True)
for a, e, text in SAETZE: print(f'  {a:5.2f} s  {abstand(a, e, vg):5.1f} dB  {text}')
print(len(ev), 'Spielklänge →', f'{OUT}/ton.wav')
