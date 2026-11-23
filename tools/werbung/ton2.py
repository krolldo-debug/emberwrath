# Ton der Werbevideos im Handy-Stil (plan2.py): Trailermusik, Sprecher (Sätze einzeln an ihre Zeitpunkte), Spielklänge
# der Aufnahme (sfx.json → klang.mjs), Schnitt-Klänge und Zusatzklänge (klang2.py). Die Stimme liegt in jedem Satz
# mindestens 15 dB vor allem anderen, das Ganze endet bei −14 LUFS.
#   PORT=8863 python3 tools/werbung/ton2.py k|m|h HUD-ORDNER ARBEITSORDNER   → ARBEITSORDNER/ton-<name>.wav
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from plan2 import PLAN, ST

P = PLAN[sys.argv[1]]; HUD, OUT = sys.argv[2], sys.argv[3]
WZ = '/mnt/project-files/videos/kampagne-patch/werkzeug'; KL = '/mnt/project-files/werbevideos/klang/'
SR = 48000; DUR = P['dur']; N = int(DUR * SR); BETT = ('publikum', 'zug')
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
def rms(x): return float(np.sqrt(np.mean(x ** 2)) + 1e-9)

mus = np.zeros((N, 2), np.float32); cache = {}
for d, q, a, b, fi, fo, g in P['musik']:
    x = cache.setdefault(d, lade(f'{WZ}/musik/{d}'))
    seg = x[int(q * SR):int(q * SR) + int((b - a) * SR)].copy()
    if fi > 0: k = min(len(seg), int(fi * SR)); seg[:k] *= np.linspace(0, 1, k)[:, None]
    if fo > 0: k = min(len(seg), int(fo * SR)); seg[-k:] *= np.linspace(1, 0, k)[:, None]
    setze(mus, seg, a, g)

stimme = np.zeros(N, np.float32); SAETZE = []; cache = {}
for name, si, at in P['stimme']:
    woe, st = cache.setdefault(name, (json.load(open(f'{ST}/{name}/woerter.json')), lade(f'{ST}/{name}/stimme.wav', 1)[:, 0]))
    s = woe['saetze'][si]; a = int(max(0, s['start'] - 0.05) * SR); e = int((s['ende'] + 0.16) * SR)
    seg = st[a:e].copy(); r = int(0.03 * SR); seg[-r:] *= np.linspace(1, 0, r); seg[:r // 2] *= np.linspace(0, 1, r // 2)
    setze(stimme, seg, at - (s['start'] - a / SR)); SAETZE.append((at, at + s['ende'] - s['start'], s['text']))

# Spielklänge der Aufnahme (läuft ohne Schnitt mit dem Video); Schritte und Menütöne bleiben weg, Dauerfeuer wird ausgedünnt
ev, letzte = [], {}
for t, n, opts in json.load(open(f"{HUD}/{P['aufnahme']}/sfx.json")):
    if t >= P['klang_bis'] or n in ('step', 'ui', 'unlock', 'ready') or t - letzte.get(n, -9) < 0.09: continue
    letzte[n] = t; ev.append(dict(t=round(t, 4), name=n, opts=opts))
json.dump(dict(dauer=DUR, events=ev), open(f"{OUT}/ereignisse-{P['name']}.json", 'w'))
kw = f"{OUT}/klang-{P['name']}.wav"
subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'klang.mjs'), f"{OUT}/ereignisse-{P['name']}.json", kw], check=True, stdout=subprocess.DEVNULL)
klang = lade(kw); klang = np.pad(klang, ((0, max(0, N - len(klang))), (0, 0)))[:N]

fx = np.zeros((N, 2), np.float32); cache = {}
for n, t, g in P['cine']:
    c = cache.setdefault(n, lade(f'{WZ}/sfx/{n}.mp3'))
    setze(fx, c * min(0.12 / rms(c), 0.85 / (np.abs(c).max() + 1e-9)), t, g)
for n, t, g in P['extra']:
    c = lade(next(f'{KL}{n}{e}' for e in ('.wav', '.mp3') if os.path.exists(f'{KL}{n}{e}')))
    if n in BETT:                                   # Klangbett: bis zum Abspann wiederholen, weich ein und aus
        bis = P['th'] if P['name'] == 'h' else DUR; L = int((bis - t) * SR); k = int(0.6 * SR); c = c[int(0.3 * SR):len(c) - int(0.3 * SR)]
        bett = np.zeros((L + len(c), 2), np.float32); i = 0
        while i < L:
            s = c.copy(); s[:k] *= np.linspace(0, 1, k)[:, None]; s[-k:] *= np.linspace(1, 0, k)[:, None]; bett[i:i + len(s)] += s; i += len(c) - k
        bett = bett[:L]; bett[:k] *= np.linspace(0, 1, k)[:, None]; bett[-2 * k:] *= np.linspace(1, 0, 2 * k)[:, None]
        setze(fx, bett * (0.05 / rms(c)), t, g)
    else: setze(fx, c * min(0.12 / rms(c), 0.85 / (np.abs(c).max() + 1e-9)), t, g)

r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-af', 'highpass=f=90,acompressor=threshold=0.06:ratio=3.5:attack=4:release=90:makeup=2', '-f', 'f32le', '-'],
                   input=stimme.tobytes(), capture_output=True, check=True)
stimme = np.frombuffer(r.stdout, np.float32).copy()[:N]; stimme = np.pad(stimme, (0, N - len(stimme)))
env = glatt(np.abs(stimme), 25); an = (env > 0.01).astype(np.float32)
duck = np.clip(glatt(an, 220) * 1.6, 0, 1)
mg = (1 - duck * (1 - 10 ** (-17 / 20)))[:, None]; fg = (1 - duck * (1 - 10 ** (-8 / 20)))[:, None]
bg = mus * 0.62 * mg + (klang * 0.42 + fx * 0.9) * fg
sp = an > 0.5
def abstand(a, e, vg=1.0):
    a, e = int(a * SR), int(e * SR); m = sp[a:e]
    return db(np.sqrt(np.mean((stimme[a:e][m] * vg) ** 2)) / np.sqrt(np.mean(np.mean(bg[a:e][m] ** 2, axis=1))))
g0 = [abstand(a, e) for a, e, _ in SAETZE]; ziel = float(np.median(g0)); extra = np.ones(N, np.float32)
for (a, e, _), g in zip(SAETZE, g0):
    extra[int(max(0, a - 0.05) * SR):int((e + 0.1) * SR)] = 10 ** (-min(7.0, max(0.0, ziel - g)) / 20)
bg *= glatt(extra, 160)[:, None]
vg = max(1.0, 10 ** ((15.0 - min(abstand(a, e) for a, e, _ in SAETZE)) / 20))
mix = bg + stimme[:, None] * vg
tmp = f"{OUT}/mix-{P['name']}.wav"; ziel = f"{OUT}/ton-{P['name']}.wav"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', tmp], input=mix.astype(np.float32).tobytes(), check=True)
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
j = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
af = (f"loudnorm=I=-14:TP=-1:LRA=9:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
      f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-ar', '48000', ziel], check=True)
print(f"{P['name']}: Stimme ×{vg:.2f}, {len(ev)} Spielklänge → {ziel}")
for a, e, text in SAETZE: print(f'  {a:5.2f} s  {abstand(a, e, vg):5.1f} dB  {text}')
