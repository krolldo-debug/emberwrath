# Zusatzklänge der Handy-Werbevideos nach /mnt/project-files/werbevideos/klang/: Publikum und Jubel (Live-Kommentar),
# Bahn-Innenraum (Haltestelle) über ElevenLabs „sound-generation“; Gong und Türsignal werden gerechnet; die Durchsage
# ist die Sprecheraufnahme „durchsage“ mit Lautsprecherklang.   python3 tools/werbung/klang2.py
import json, os, subprocess, sys, urllib.request
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from plan2 import ST
OUT = '/mnt/project-files/werbevideos/klang/'; SR = 48000
os.makedirs(OUT, exist_ok=True)

def erzeuge(name, text, sek):
    f = f'{OUT}{name}.mp3'
    if os.path.exists(f): return
    req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', method='POST', headers={'Content-Type': 'application/json'},
                                 data=json.dumps(dict(text=text, duration_seconds=sek, prompt_influence=0.5)).encode())
    with urllib.request.urlopen(req, timeout=240) as r: open(f, 'wb').write(r.read())
    print('erzeugt', name)

def schreibe(name, x):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', f'{OUT}{name}.wav'], input=x.astype(np.float32).tobytes(), check=True)

def ton(f, sek, ab=6.0, ober=0.3):
    t = np.arange(int(sek * SR)) / SR
    return (np.sin(2 * np.pi * f * t) + ober * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * ab) * np.minimum(1, t / 0.004)

erzeuge('publikum', 'Large football stadium crowd ambience, steady excited murmur and distant chanting, no music, no announcer', 12)
erzeuge('jubel', 'Huge football stadium crowd suddenly erupts into loud roaring cheers and applause after a goal', 6)
erzeuge('zug', 'Interior of a moving subway train, steady low rumble and rhythmic rail clatter, no voices, no announcements', 11)
# Gong: zwei Töne wie vor einer Durchsage
g = np.zeros(int(1.6 * SR)); a = ton(659.3, 1.2, 4.5); b = ton(523.3, 1.25, 4.0)
g[:len(a)] += a; g[int(0.33 * SR):int(0.33 * SR) + len(b)] += b; schreibe('gong', g * 0.5)
# Türsignal: schnelle Pieptöne, dann schließen die Türen dumpf
t = np.zeros(int(1.5 * SR))
for k in range(6):
    p = ton(1870, 0.075, 3.0, 0.1); i = int(k * 0.13 * SR); t[i:i + len(p)] += p * 0.45
rnd = np.random.default_rng(4); n = int(0.28 * SR); zu = rnd.standard_normal(n) * np.exp(-np.arange(n) / SR * 22)
zu = np.convolve(zu, np.ones(180) / 180, 'same') * 5 + ton(62, 0.28, 14)[:n] * 0.9
t[int(0.92 * SR):int(0.92 * SR) + n] += zu; schreibe('tueren', t)
# Durchsage mit Lautsprecherklang
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{ST}/durchsage/stimme.wav', '-af', 'highpass=f=380,lowpass=f=3100,acompressor=threshold=0.05:ratio=6:makeup=3,aecho=0.7:0.5:45|90:0.3|0.18',
                '-ar', str(SR), f'{OUT}durchsage.wav'], check=True)
print(sorted(os.listdir(OUT)))
