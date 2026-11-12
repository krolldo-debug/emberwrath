# Tonspur des Intro-Films (src/intro/film.js): Stimme Malgareths je Sprache, Musik und Geräusche von ElevenLabs,
# gemischt mit ffmpeg zu src/intro/media/ton-<sprache>.mp3. Schreibt die Sprechdauern in den Block TIMING von film.js.
# Rohdateien werden zwischengespeichert (ROH, Standard /mnt/project-files/intro/roh): ein zweiter Lauf erzeugt nichts neu,
# er mischt nur. Neu erzeugen: Datei in ROH löschen.
#   python3 tools/intro/ton.py [--nur de]         Schlüssel: Kopfzeile xi-api-key (in der Cloud-Umgebung vom Proxy gesetzt)
#   python3 tools/intro/ton.py --pruefen          misst je Satz, wie weit die Stimme über Musik und Geräuschen liegt
#
# So ist gemischt: Jeder Satz der Stimme hat dieselbe Lautheit (V). Jede andere Datei wird erst gemessen und dann auf
# einen Pegel relativ zur Stimme gebracht (die Rohdateien sind sehr verschieden laut). Unter der Stimme sinken Musik
# und Geräusche weich ab und kommen danach langsam zurück; zwischen den Sätzen bleibt die Musik unter der Stimme,
# nur die großen Schläge (Siegel bricht, Ausbruch, Titel) dürfen lauter sein.
import json, math, os, re, subprocess, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../..'))
ROH = os.environ.get('ROH', '/mnt/project-files/intro/roh')
MEDIA = os.path.join(REPO, 'src/intro/media')
FILM = os.path.join(REPO, 'src/intro/film.js')
API = 'https://api.elevenlabs.io/v1'
KEY = os.environ.get('ELEVENLABS_API_KEY', 'proxy')
VOICE = 'BxoyaO1xuQUNkP2tJIrR'      # „Victor Voss – Sinister Villain“ (Bibliothek): ruhig, kalt, kontrolliert
LANGS = ['de', 'en', 'es', 'fr']
DUR = 62.0
V = -16.0                           # Lautheit jedes gesprochenen Satzes (LUFS); alle Pegel unten sind dB relativ dazu
os.makedirs(ROH, exist_ok=True)

# Sprechtexte aus film.js (deutsch) und ihre Fassungen aus den Wörterbüchern
src = open(FILM, encoding='utf8').read()
LINES = [(float(t), txt) for t, txt in re.findall(r"\{ t: ([\d.]+), text: '([^']+)' \}", src)]


def dict_for(lang):
    if lang == 'de': return {}
    d = {}
    for k, v in re.findall(r'^\s*"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)",?$', open(os.path.join(REPO, f'src/i18n/{lang}.js'), encoding='utf8').read(), re.M):
        d[json.loads(f'"{k}"')] = json.loads(f'"{v}"')
    return d


def post(path, body, out):
    if os.path.exists(out) and os.path.getsize(out) > 1000: return False
    req = urllib.request.Request(f'{API}{path}', data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    with urllib.request.urlopen(req, timeout=300) as r: data = r.read()
    open(out, 'wb').write(data)
    print('  erzeugt', os.path.basename(out), f'{len(data) / 1024:.0f} KB')
    return True


def dur(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())


def speech_len(path):
    """Dauer ohne Stille am Ende (Untertitel enden mit der Stimme)."""
    out = subprocess.run(['ffmpeg', '-i', path, '-af', 'silencedetect=noise=-40dB:d=0.25', '-f', 'null', '-'], capture_output=True, text=True).stderr
    total = dur(path)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
    if starts and starts[-1] > 0.3 and (len(ends) < len(starts) or ends[-1] > total - 0.08): return starts[-1]
    return total


# ------------------------------------------------------------------ Stimme
def voice(lang, i, text):
    out = os.path.join(ROH, f'stimme-{lang}-{i:02d}.mp3')
    post(f'/text-to-speech/{VOICE}?output_format=mp3_44100_128', {
        'text': text, 'model_id': 'eleven_multilingual_v2', 'language_code': lang,
        'voice_settings': {'stability': 0.62, 'similarity_boost': 0.8, 'style': 0.22, 'use_speaker_boost': True, 'speed': 0.9},
    }, out)
    return out


# ------------------------------------------------------------------ Geräusche
# (Sekunde im Film, Datei, Text für die Erzeugung, Länge, Pegel, Bezug[, Zusätze])
#   Pegel: dB relativ zur Stimme. Bezug 'I' = Lautheit über die ganze Datei (Dauerklang), 'M' = lauteste Stelle (Schlag,
#   Schwellklang). Zusätze: ab/bis = nur diesen Teil der Datei spielen (Sekunden), ein = so lange einblenden.
DRONE = 'Very deep ominous sub-bass drone in a vast dark stone hall, slow swell, no music'
EMBER = 'A single glowing ember lands on stone with a soft magical sizzle and a low resonant boom'
FIRE = 'Close crackling embers and a low magical hum, fire breathing slowly'
WIND = 'Night wind over a small village in a valley, falling ash, distant crackle of fire, lonely'

# Atmosphäre: liegt unter allem (wie weit die Gruppen der Stimme weichen: DUCK)
RAUM = [
    (0.0, 'drone', DRONE, 6.0, -6, 'M'),                    # Dunkel, der Funke fällt
    (4.0, 'halle', 'Dark empty throne hall ambience, distant fire crackle, faint chains creaking, deep air', 14.0, -15, 'I'),
    (14.0, 'krone', FIRE, 4.5, -13, 'I'),                   # Feuerschale auf dem Balkon
    (18.4, 'schlacht', 'Distant ancient battle charge, many armored warriors running, war cries muffled as in a memory, fire roaring', 6.5, -8, 'I'),
    (27.6, 'drone', DRONE, 6.0, -10, 'M'),                  # der Bann
    (33.9, 'stein', 'Heavy stone floor slowly cracking under pressure, deep creaks and small crumbling pieces, tension', 6.0, -5, 'M'),
    (39.0, 'wind', WIND, 7.8, -15, 'I', {'bis': 4.3}),      # kalte, stille Halle
    (41.5, 'drone', DRONE, 6.0, -3, 'M'),                   # Grollen schwillt in den Ausbruch
    (46.2, 'krone', FIRE, 4.5, -12, 'I', {'bis': 3.6}),     # Feuer nach dem Ausbruch
    (49.8, 'wind', WIND, 7.8, -13, 'I'),                    # Glutsenke bei Nacht
    (58.6, 'drone', DRONE, 6.0, -9, 'M'),                   # tiefer Ton unter dem Titel
]
# Schläge: einzelne Ereignisse, auf das Bild gesetzt (der Einsatz liegt je Datei verschieden spät)
SCHLAG = [
    (3.35, 'landen', EMBER, 2.0, -3, 'M'),                  # der Funke landet (LAND)
    (24.25, 'landen', EMBER, 2.0, -5, 'M'),                 # Erschütterung vor dem Tor
    (24.7, 'siegel', 'Massive magical seal closing, deep stone grinding and a resonant chime of runes locking, then silence', 4.0, -1, 'M'),   # Einsatz 0,4 s: Schnitt auf die Lichtsäule (25,1)
    (37.9, 'bruch', 'Huge stone seal shatters with an explosive crack and a deep magical boom, debris', 2.5, 3, 'M'),                         # das Siegel bricht (BREAK)
    (42.9, 'ausbruch', 'Massive volcanic eruption: a deep earth rumble swelling into one huge explosive boom, rocks cracking, lava roaring, long rolling thunder tail, no voices, no animal sounds', 5.0, 4, 'M'),   # Einsatz 0,25 s: Ausbruch (ROAR − 0,15)
    (57.1, 'titel', 'Deep cinematic impact boom with a fiery whoosh rising and long tail', 4.4, 3, 'M'),                                      # Einschlag nach 0,5 s: Schnitt auf den Titel (57,6)
]


def sfx(name, text, length):
    out = os.path.join(ROH, f'fx-{name}.mp3')
    post('/sound-generation', {'text': text, 'duration_seconds': length, 'prompt_influence': 0.5}, out)
    return out


# ------------------------------------------------------------------ Musik: eine Partitur mit Abschnitten im Takt der Einstellungen
# (Schnitte bei 4,0 · 18,4 · 25,1 · 31,8 · 37,9 Siegelbruch · 43,2 Ausbruch · 49,8 · 57,6 Titel)
def music():
    out = os.path.join(ROH, 'musik.mp3')
    sec = lambda name, ms, pos, neg=(): {'section_name': name, 'positive_local_styles': list(pos), 'negative_local_styles': list(neg), 'duration_ms': ms, 'lines': []}
    plan = {
        'positive_global_styles': ['dark orchestral fantasy film score', 'cinematic trailer', 'minor key', 'low strings', 'brooding', 'instrumental'],
        'negative_global_styles': ['vocals', 'lyrics', 'pop', 'electronic beat', 'synth lead', 'upbeat', 'happy'],
        'sections': [
            sec('Darkness', 4000, ['single very low sustained cello note', 'sub bass', 'almost silent'], ['drums', 'melody']),
            sec('The sleeping king', 14400, ['slow dark string chords', 'sparse solo cello motif', 'quiet', 'tension'], ['drums', 'brass']),
            sec('Memory of the five kings', 6700, ['war drums', 'low brass', 'wordless choir', 'heroic but tragic', 'building'], ['soft']),
            sec('The ban', 6700, ['solemn dark choir', 'shimmering high strings', 'deep organ', 'one long sustained chord', 'awe and dread'], ['drums']),
            sec('A thousand years', 6100, ['near silence', 'low drone', 'then string tremolo crescendo', 'rising tension', 'ends abruptly'], ['melody']),
            sec('Stillness', 5300, ['almost silent', 'single cold low note', 'empty hall'], ['drums', 'melody', 'brass']),
            sec('He awakens', 6600, ['massive wordless dark choir', 'full brass', 'taiko hits', 'menacing climax'], ['soft']),
            sec('The ember hollow', 7800, ['quiet melancholic solo cello', 'distant low horn', 'ominous', 'sparse'], ['drums']),
            sec('Title', 4400, ['final orchestral swell', 'big low hit', 'long reverb tail'], ['melody']),
        ],
    }
    try:
        post('/music', {'composition_plan': plan, 'model_id': 'music_v1'}, out)
        return out
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403): raise
        print('  Musik: Schlüssel ohne Recht „Music“ – Ersatz aus Klang-Stücken (SCORE)')
        return None


# Ersatz, solange der Schlüssel keine Musik darf: Partitur aus Stücken der Geräusch-Erzeugung (je höchstens 22 s).
# Die Stücke sind auf das Bild gesetzt: Das Tremolo (score-3) gipfelt nach 3,05 s und bricht ab – genau im Siegelbruch;
# der Chor (score-4) setzt mit dem Ausbruch ein, davor ist die verstaubte Halle still. Die Stücke klingen meist früher
# aus als bestellt (Hüllkurve prüfen, bevor eines verschoben wird).
CELLO = 'Cinematic dark orchestral film underscore, very low sustained cello and contrabass drone, ominous and slow, no percussion'
SCORE = [
    (0.0, 'score-1', CELLO, 18.4, -9, 'I'),
    (18.4, 'score-2', 'Epic dark orchestral film score, war drums, low brass stabs and wordless choir, tragic, building intensity', 13.4, -7, 'I'),
    (24.9, 'score-6', 'Cinematic film score, solemn dark choir with shimmering high strings over a deep organ note, an ancient sacred ritual, one long sustained chord slowly swelling and held, awe and dread, no drums, no percussion', 14.0, -10, 'I'),
    (31.0, 'score-1', CELLO, 18.4, -11, 'I', {'ab': 6.0, 'bis': 10.4, 'ein': 1.0}),      # der Bordun des Anfangs kehrt zurück: tausend Jahre Stille
    (34.85, 'score-3', 'Orchestral film score, string tremolo crescendo with rising tension and ticking percussion, ends abruptly', 7.2, -1, 'M'),
    (43.15, 'score-4', 'Massive dark orchestral film score climax, menacing wordless choir, full brass and taiko hits', 10.8, -6, 'I'),
    (49.8, 'score-5', 'Quiet melancholic film score, solo cello with a distant low horn, ominous and sparse', 12.2, -9, 'I'),
]


# ------------------------------------------------------------------ Messen
STEREO = 'aformat=sample_rates=44100:channel_layouts=stereo'
_laut = {}


def lautheit(path, af=''):
    """(Lautheit über die ganze Datei, lauteste Stelle über 0,4 s) in LUFS nach EBU R 128; af = Filter davor."""
    if (path, af) not in _laut:
        # immer als Stereo messen, so wie gemischt wird (eine Mono-Datei zählt auf zwei Kanälen 3 dB lauter)
        r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', f'{STEREO},{af + "," if af else ""}apad=pad_dur=0.5,ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        ms = [float(m) for m in re.findall(r'TARGET:.*?M:\s*(-?[\d.]+)', r)]
        i = re.search(r'Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS', r, re.S)
        _laut[(path, af)] = (float(i.group(1)), max(ms))
    return _laut[(path, af)]


# ------------------------------------------------------------------ Mischen
# Unter der Stimme sinkt jede Gruppe weich ab: die Höhen (ab 250 Hz, dort liegt die Sprache) stark, die Tiefen kaum.
# So behalten Musik und Schläge ihre Wucht, und die Stimme bleibt frei. Je Gruppe: Höhen dB, Tiefen dB, wie lange
# nach dem Satz gehalten wird und wie lange die Rückkehr dauert (Sekunden)
DUCK = {'musik': (12, 4, 0.25, 1.2), 'raum': (8, 3, 0.25, 1.2), 'schlag': (12, 4, 0.05, 0.4)}
# Sätze, unter denen besonders viel los ist (gezählt ab 0), Höhen dort zusätzlich tiefer: Satz 5 beginnt mit dem Schlag
# des Banns, Satz 6 reicht in manchen Sprachen bis ins Tremolo, Satz 8 („Nur geduldig.“) fällt mitten in den Ausbruch
TIEFER = {4: 3, 5: 5, 7: 9}
WEICHE = 250                        # Trennfrequenz Tiefen/Höhen (Hz)
# Stimme: Brummen weg; Satzteile angleichen (leise gesprochene Enden gehen sonst unter); gleichmäßig (Kompressor);
# etwas mehr Deutlichkeit um 3 kHz, damit sie sich auf kleinen Lautsprechern durchsetzt
STIMME = 'highpass=f=90,dynaudnorm=f=150:g=7:p=0.7:m=4:s=0,acompressor=threshold=-22dB:ratio=3:attack=8:release=180:makeup=1,equalizer=f=3200:t=q:w=1.1:g=3'


def lens_of(voices):
    return [speech_len(v) for v in voices]


def mix(lang, voices, out=None, only=None):
    """only: None = alles; zum Prüfen (ohne Begrenzer) nur 'stimme', nur 'bett' (alles außer der Stimme) oder nur eine
    Gruppe ('musik', 'raum', 'schlag')"""
    out = out or os.path.join(MEDIA, f'ton-{lang}.mp3')
    ins, filt = [], []
    n = 0

    def add(path, at, db, pre='', post=''):
        """Datei bei Sekunde at einsetzen: Filter pre, dann Pegel db, dann Filter post"""
        nonlocal n
        ins.extend(['-i', path])
        ms = int(round(at * 1000))
        filt.append(f'[{n}:a]{STEREO}{pre},volume={db:.2f}dB{post},adelay={ms}|{ms},apad=whole_dur={DUR + 1}[a{n}]')
        n += 1
        return f'[a{n - 1}]'

    def clip(at, name, text, length, level, ref, opt={}):
        """Datei erzeugen/holen, messen, auf den Pegel relativ zur Stimme bringen; weich ein- und ausblenden"""
        path = sfx(name, text, length)
        i, m = lautheit(path)
        a, b = opt.get('ab', 0), min(opt.get('bis', length), dur(path))
        cut = f',atrim={a}:{b:.2f},asetpts=PTS-STARTPTS,afade=t=in:d={opt.get("ein", 0.03)},afade=t=out:st={b - a - 0.6:.2f}:d=0.6'
        return add(path, at, V + level - (i if ref == 'I' else m), post=cut)

    def bus(name, parts):
        filt.append(f'{"".join(parts)}amix=inputs={len(parts)}:normalize=0[{name}]' if len(parts) > 1 else f'{parts[0]}anull[{name}]')

    m = music()
    if m: bus('musik', [add(m, 0.0, V - 8 - lautheit(m)[0])])
    else: bus('musik', [clip(*c) for c in SCORE])
    bus('raum', [clip(*c) for c in RAUM])
    bus('schlag', [clip(*c) for c in SCHLAG])
    # Stimme: jeder Satz bearbeitet, dann auf dieselbe Lautheit gebracht; etwas Hall der Halle (in der Glutsenke trockener)
    parts = []
    for (t, _), path in zip(LINES, voices):
        room = ',aecho=0.8:0.55:70|140:0.22|0.12' if t < 49 else ',aecho=0.8:0.4:40:0.1'
        parts.append(add(path, t, V - lautheit(path, STIMME + room)[0], pre=',' + STIMME + room))
    bus('stimme0', parts)
    filt.append('[stimme0]alimiter=limit=0.794:attack=3:release=40:level=0[stimme]')      # einzelne Spitzen der Stimme abfangen
    # Unter jedem Satz sinkt der Hintergrund weich ab (feste Hüllkurve statt Kompressor: verlässlich, kein Pumpen);
    # danach kommt er langsam zurück, kurze Pausen zwischen zwei Sätzen bleiben also ruhig
    lens = lens_of(voices)

    def huelle(db, hold, rel, extra={}):
        """Verstärkung über die Zeit (ffmpeg-Ausdruck): vor jedem Satz in 0,35 s um db hinunter, danach zurück"""
        a = [1 - 10 ** (-(db + extra.get(i, 0)) / 20) for i in range(len(LINES))]
        wins = '+'.join(f'{a[i]:.3f}*clip((t-{t - 0.45:.2f})/0.35\\,0\\,1)*clip(({t + L + hold + rel:.2f}-t)/{rel}\\,0\\,1)' for i, ((t, _), L) in enumerate(zip(LINES, lens)))
        return f"volume='1-min({max(a):.3f}\\,{wins})':eval=frame"

    ducked = []
    for name, (hi, lo, hold, rel) in DUCK.items():
        mute = ',volume=0' if only not in (None, 'bett', name) else ''
        filt.append(f'[{name}]acrossover=split={WEICHE}:order=4th[{name}L][{name}H]')
        filt.append(f'[{name}L]asetnsamples=n=256,{huelle(lo, hold, rel)}[{name}Ld]')
        filt.append(f'[{name}H]asetnsamples=n=256,{huelle(hi, hold, rel, TIEFER)}[{name}Hd]')
        filt.append(f'[{name}Ld][{name}Hd]amix=inputs=2:normalize=0{mute}[{name}d]')
        ducked.append(f'[{name}d]')
    filt.append(f'{"".join(ducked)}amix=inputs={len(ducked)}:normalize=0[bett]')
    filt.append(f'[stimme]{"anull" if only in (None, "stimme") else "volume=0"}[vo]')
    # Begrenzer nur für die Spitzen der großen Schläge; die Lautheit steht durch die Stimme fest
    limit = '' if only else ',alimiter=limit=0.794:attack=5:release=80:level=0'
    filt.append(f'[bett][vo]amix=inputs=2:normalize=0{limit},atrim=0:{DUR + 0.8},afade=t=out:st={DUR - 1.4}:d=1.4[out]')
    fmt = ['-c:a', 'pcm_f32le'] if out.endswith('.wav') else ['-b:a', '112k']          # Prüfdateien ohne Abschneiden der Spitzen
    cmd = ['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', ';'.join(filt), '-map', '[out]', '-ac', '2', '-ar', '44100', *fmt, out]
    subprocess.run(cmd, check=True)
    if only: return
    r = subprocess.run(['ffmpeg', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i, lra, pk = re.search(r'Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS.*?LRA:\s+(-?[\d.]+) LU.*?Peak:\s+(-?[\d.]+) dBFS', r, re.S).groups()
    print(f'  {os.path.basename(out)}: {os.path.getsize(out) / 1024:.0f} KB, {dur(out):.1f} s, Lautheit {i} LUFS, Spitze {pk} dB')


def pegel(path, win=0.2):
    """Pegel je Zeitfenster (dB) im Bereich der Sprachverständlichkeit, 300 bis 4000 Hz"""
    af = f'highpass=f=300,lowpass=f=4000,asetnsamples=n={int(44100 * win)}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-'
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-af', af, '-f', 'null', '-'], capture_output=True, text=True).stdout
    return [-120.0 if x == '-inf' else float(x) for x in re.findall(r'RMS_level=(-?[\d.]+|-inf)', out)]


def pruefen(lang, voices, lens):
    """Abstand Stimme zu Hintergrund je Satz im Sprachbereich (300–4000 Hz), gemessen dort, wo gesprochen wird:
    über den ganzen Satz und an der engsten Stelle (0,6 s). Ziel: Satz mindestens 15 dB, engste Stelle mindestens 10 dB."""
    tmp = os.path.join(ROH, 'pruefen')
    os.makedirs(tmp, exist_ok=True)
    v, b = os.path.join(tmp, f'stimme-{lang}.wav'), os.path.join(tmp, f'bett-{lang}.wav')
    mix(lang, voices, v, 'stimme'); mix(lang, voices, b, 'bett')
    pv, pb = [[10 ** (x / 10) for x in pegel(f)] for f in (v, b)]
    db = lambda x: 10 * math.log10(max(x, 1e-12))
    worst_line, worst_spot = 99, 99
    for (t, text), L in zip(LINES, lens):
        fr = list(range(int(t / 0.2), min(len(pv), len(pb), int((t + L) / 0.2) + 1)))
        top = max(pv[i] for i in fr)
        act = [i for i in fr if pv[i] > top / 31.6]                    # gesprochen: höchstens 15 dB unter der lautesten Stelle
        line = db(sum(pv[i] for i in act)) - db(sum(pb[i] for i in act))
        spot = min(db(sum(pv[j] for j in w)) - db(sum(pb[j] for j in w)) for w in ([i - 1, i, i + 1] for i in act[1:-1] or act) if all(j in act for j in w) or len(act) < 3)
        worst_line, worst_spot = min(worst_line, line), min(worst_spot, spot)
        print(f'  {t:5.1f} s  Stimme {lautheit(v, f"atrim={t}:{t + L}")[0]:6.1f} LUFS  Abstand {line:5.1f} dB, engste Stelle {spot:5.1f} dB  {text[:40]}')
    print(f'  {lang}: kleinster Abstand {worst_line:.1f} dB, engste Stelle {worst_spot:.1f} dB')


def main():
    only = sys.argv[sys.argv.index('--nur') + 1].split(',') if '--nur' in sys.argv else LANGS
    timing = json.loads(re.search(r'const TIMING = (\{.*?\});', src, re.S).group(1) or '{}') if 'const TIMING = {' in src else {}
    for lang in only:
        print(lang)
        d = dict_for(lang)
        voices = []
        for i, (t, text) in enumerate(LINES):
            say = d.get(text, text) if lang != 'de' else text
            voices.append(voice(lang, i, say))
        lens = [round(speech_len(v), 2) for v in voices]
        for (t, text), L, nxt in zip(LINES, lens, [l[0] for l in LINES[1:]] + [DUR]):
            if t + L > nxt - 0.15: print(f'  WARNUNG {lang}: „{text}“ {L:.1f} s überlappt die nächste Zeile ({nxt - t:.1f} s Platz)')
        timing[lang] = lens
        if '--pruefen' in sys.argv: pruefen(lang, voices, lens); continue
        mix(lang, voices)
    block = f'// <ton.mjs> – von tools/intro/ton.py geschrieben, nicht von Hand ändern\nconst TIMING = {json.dumps(timing)};\n// </ton.mjs>'
    new = re.sub(r'// <ton\.mjs>.*?// </ton\.mjs>', lambda m: block, open(FILM, encoding='utf8').read(), flags=re.S)
    open(FILM, 'w', encoding='utf8').write(new)


if __name__ == '__main__':
    main()
