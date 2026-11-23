# Tonmischung der Werbevideos: Musik, Sprecher, Geräusche → eine Datei mit −14 LUFS (Vorgabe von TikTok/Instagram).
# Die Musik weicht dem Sprecher aus (Absenkung nach dessen Hüllkurve); pruefen() misst je Satz den Abstand Stimme/Rest.
import subprocess, re, numpy as np
SR = 44100

def load(path, start=0.0):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)

def db(x): return 10 ** (x / 20)
def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)

def speech_gain(x, target=-20.0):
    """Sprache auf gleiche Lautheit bringen: gemessen wird nur, wo gesprochen wird."""
    e = np.sqrt((x.reshape(-1, 2) ** 2).mean(1)); loud = x[e > e.max() * 0.05]
    return db(target - rms_db(loud))

def place(bus, x, t, gain=1.0, fade=0.01):
    i = int(t * SR); x = x[:max(0, len(bus) - i)] * gain
    n = int(fade * SR)
    if len(x) > 2 * n: x = x.copy(); x[:n] *= np.linspace(0, 1, n)[:, None]; x[-n:] *= np.linspace(1, 0, n)[:, None]
    bus[i:i + len(x)] += x

def envelope(x, attack=0.03, release=0.35):
    """Hüllkurve 0…1 der Stimme: schnell auf, langsam ab."""
    hop = 441; e = np.sqrt((x[:len(x) // hop * hop].reshape(-1, hop, 2) ** 2).mean((1, 2)))
    e = np.clip(e / 0.03, 0, 1); out = np.zeros_like(e); v = 0.0
    ka, kr = 1 - np.exp(-hop / SR / attack), 1 - np.exp(-hop / SR / release)
    for i, t in enumerate(e):
        v += (t - v) * (ka if t > v else kr); out[i] = v
    return np.repeat(out, hop)

def mix(out, dur, music=None, voices=(), sfx=(), duck_db=12.0, music_db=-24.0, fade_out=0.5, lufs=-14.0):
    """music: (Datei, Anfang in der Datei, [dB]); voices: [(Datei, Zeit, [dB])]; sfx: [(Datei, Zeit, dB)]."""
    n = int(dur * SR); V = np.zeros((n, 2)); M = np.zeros((n, 2)); F = np.zeros((n, 2)); spans = []
    for path, t, *g in voices:
        x = load(path); x = x * speech_gain(x) * db(g[0] if g else 0)
        e = np.sqrt((x ** 2).mean(1)); idx = np.where(e > e.max() * 0.05)[0]
        spans.append((path.split('/')[-1], t + idx[0] / SR, t + idx[-1] / SR)); place(V, x, t)
    if music:
        x = load(music[0], music[1]); x = x * db(music_db - rms_db(x[:int(min(len(x), n))])) * db(music[2] if len(music) > 2 else 0)
        place(M, x, 0, fade=0.02)
    for path, t, g in sfx: place(F, load(path), t, db(g))
    env = envelope(V); env = np.pad(env, (0, n - len(env)))[:n]
    M *= db(-duck_db * env)[:, None]; F *= db(-duck_db * 0.75 * env)[:, None]
    bed = M + F; k = int(fade_out * SR); ramp = np.linspace(1, 0, k)[:, None]; bed[-k:] *= ramp; V[-k:] *= ramp
    y = V + bed
    tmp = out + '.roh.wav'
    def write(arr, path, af=None):
        cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-'] + (['-af', af] if af else []) + [path]
        subprocess.run(cmd, input=arr.astype(np.float32).tobytes(), check=True)
    write(y, tmp)
    rep = subprocess.run(['ffmpeg', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', rep)[-1])
    gain = lufs - I
    for _ in range(3):                 # der Begrenzer nimmt Spitzen weg: nachmessen und nachstellen
        write(y * db(gain), out, 'alimiter=limit=0.84:attack=3:release=60:level=disabled')
        rep = subprocess.run(['ffmpeg', '-i', out, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        got = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', rep)[-1])
        if abs(got - lufs) < 0.3: break
        gain += lufs - got
    subprocess.run(['rm', '-f', tmp])
    def gap(a, b):                     # nur wo wirklich gesprochen wird (Pausen zwischen Wörtern zählen nicht)
        i, j = int(a * SR), int(b * SR); v, m = V[i:j], bed[i:j]; w = 2205; k = (j - i) // w
        ev = np.sqrt((v[:k * w].reshape(k, w, 2) ** 2).mean((1, 2))); em = np.sqrt((m[:k * w].reshape(k, w, 2) ** 2).mean((1, 2)))
        on = ev > ev.max() * 0.3
        return 20 * np.log10(np.sqrt((ev[on] ** 2).mean()) / (np.sqrt((em[on] ** 2).mean()) + 1e-9))
    res = [(name, a, b, gap(a, b)) for name, a, b in spans]
    return dict(lufs_vorher=I, saetze=res)

def pruefen(res, soll=10.0):
    ok = True
    for name, a, b, gap in res['saetze']:
        flag = '' if gap >= soll else '  ← zu knapp'; ok &= gap >= soll
        print(f'  {name}  {a:5.2f}–{b:5.2f} s  Stimme {gap:4.1f} dB über Musik und Geräuschen{flag}')
    return ok
