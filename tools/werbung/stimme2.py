# Sprecher für die Werbevideos: ein ganzer Text in EINEM Abruf (klingt zusammenhängend), mit Regieanweisungen in
# eckigen Klammern (z. B. „[aufgeregt]“), die das Modell spielt, aber nicht spricht. Ergebnis: stimme.wav (48 kHz, mono)
# und woerter.json mit Wort- und Satzzeiten (die Regieanweisungen sind darin entfernt).
#   from stimme2 import sprich;  sprich(ORDNER, [Sätze …], STIMME, modell='eleven_v3', einstellungen={…})
# Schlüssel: der Proxy setzt den Header xi-api-key selbst ein; dieses Skript schickt keinen mit.
import base64, hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.request
import numpy as np

API = 'https://api.elevenlabs.io'
CACHE = '/mnt/project-files/werbevideos/stimme-cache/'
STIMMEN = dict(joel='uYCPzx1CVH5qosGkvHCm', victor='BxoyaO1xuQUNkP2tJIrR', mark='fzqS9sNPYJhLlhsfDm0l', damien='3Yd4qpEiwKewi1JIdeMY',
               snorre='JSV4pJFuHRMCWZTxkpoQ', laura='LB5G0Z4EP98YaEgL654m', leni='WzPl01KDMCPMOyx39EfF', susi='v3V1d2rk6528UrLKRuy8',
               hans='WPbK7Qv9rbyhvUDiwJ0A', carla='rKiu7lQ4c5P3az3745s3', helmut='JiW03c2Gt43XNUQAumRP', stephan='IWm8DnJ4NGjFI7QAM5lM')
SR = 48000


def abruf(text, vid, modell, einstellungen):
    body = dict(text=text, model_id=modell, language_code='de')
    if einstellungen: body['voice_settings'] = einstellungen
    key = hashlib.sha1(json.dumps([body, vid], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:14]
    os.makedirs(CACHE, exist_ok=True); f = f'{CACHE}{vid}-{key}.json'
    if os.path.exists(f): return json.load(open(f))
    for v in range(4):
        req = urllib.request.Request(f'{API}/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_192', data=json.dumps(body).encode(),
                                     method='POST', headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=240) as r: res = json.loads(r.read()); break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and v < 3: time.sleep(4 * (v + 1)); continue
            sys.exit(f'FEHLER ElevenLabs {e.code}: {e.read().decode(errors="replace")[:400]}')
    json.dump(res, open(f, 'w'), ensure_ascii=False)
    print(f'  abgerufen: {len(text)} Zeichen ({modell})', flush=True)
    return res


def sprich(ordner, saetze, stimme, modell='eleven_v3', einstellungen=None):
    """saetze: Liste von Sätzen, Regie in [eckigen Klammern]. Gibt woerter.json als dict zurück."""
    vid = STIMMEN.get(stimme, stimme); text = ' '.join(saetze)
    res = abruf(text, vid, modell, einstellungen)
    al = res.get('alignment') or res['normalized_alignment']
    ch, st, en = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
    # Zeichen der Regieanweisungen überspringen, Rest zu Wörtern bündeln
    laeufe, cur, tief = [], [], 0
    for k, c in enumerate(ch):
        if c == '[': tief += 1
        if tief or c.isspace():
            if cur: laeufe.append(cur); cur = []
        else: cur.append(k)
        if c == ']': tief = max(0, tief - 1)
    if cur: laeufe.append(cur)
    rein = [re.sub(r'\s+', ' ', re.sub(r'\[[^\]]*\]', '', s)).strip() for s in saetze]
    anz = [(w, si) for si, s in enumerate(rein) for w in s.split()]
    if len(laeufe) != len(anz): sys.exit(f'FEHLER: Wortzahl der Zeitmarken ({len(laeufe)}) ≠ Text ({len(anz)})')
    woerter = [dict(wort=w, start=round(st[r[0]], 3), ende=round(en[r[-1]], 3), satz=si) for (w, si), r in zip(anz, laeufe)]
    sz = []
    for si, s in enumerate(rein):
        ws = [w for w in woerter if w['satz'] == si]
        sz.append(dict(text=s, start=ws[0]['start'], ende=ws[-1]['ende']))
    os.makedirs(ordner, exist_ok=True)
    mp3 = f'{ordner}/stimme.mp3'; open(mp3, 'wb').write(base64.b64decode(res['audio_base64']))
    # auf −18,5 dBFS (RMS der gesprochenen Teile) bringen
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.float32).copy(); laut = x[np.abs(x) > 0.01]
    x *= 10 ** (-18.5 / 20) / (np.sqrt(np.mean(laut ** 2)) + 1e-9)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', f'{ordner}/stimme.wav'], input=x.tobytes(), check=True)
    out = dict(stimme=stimme, modell=modell, dauer=round(len(x) / SR, 3), woerter=woerter, saetze=sz,
               regie=[(''.join(ch[a:b + 1]), round(st[a], 3), round(en[b], 3)) for a, b in _klammern(ch)])
    json.dump(out, open(f'{ordner}/woerter.json', 'w'), ensure_ascii=False, indent=1)
    return out


def _klammern(ch):
    res, a = [], None
    for k, c in enumerate(ch):
        if c == '[': a = k
        if c == ']' and a is not None: res.append((a, k)); a = None
    return res


def lebendigkeit(wav):
    """Grobes Maß, wie lebendig eine Aufnahme klingt: Streuung der Tonhöhe (Halbtöne) und der Lautstärke (dB)."""
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.float32); n, h = 640, 160; f0, lv = [], []
    for i in range(0, len(x) - n, h):
        w = x[i:i + n] - np.mean(x[i:i + n]); e = np.sqrt(np.mean(w ** 2))
        if e < 0.02: continue
        ac = np.correlate(w, w, 'full')[n - 1:]; lo, hi = 16000 // 400, 16000 // 60
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.45 * ac[0]: f0.append(16000 / k); lv.append(20 * np.log10(e))
    st = 12 * np.log2(np.array(f0) / np.median(f0))
    return dict(tonhoehe_hz=round(float(np.median(f0))), streuung_ht=round(float(np.percentile(st, 90) - np.percentile(st, 10)), 1), lautstaerke_db=round(float(np.std(lv)), 1))
