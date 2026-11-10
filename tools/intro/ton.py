# Tonspur des Intro-Films (src/intro/film.js): Stimme Malgareths je Sprache, Musik und Geräusche von ElevenLabs,
# gemischt mit ffmpeg zu src/intro/media/ton-<sprache>.mp3. Schreibt die Sprechdauern in den Block TIMING von film.js.
# Rohdateien werden zwischengespeichert (ROH, Standard /mnt/project-files/intro/roh): ein zweiter Lauf erzeugt nichts neu,
# er mischt nur. Neu erzeugen: Datei in ROH löschen.
#   python3 tools/intro/ton.py [--nur de]         Schlüssel: Kopfzeile xi-api-key (in der Cloud-Umgebung vom Proxy gesetzt)
import json, os, re, subprocess, sys, urllib.request, urllib.error

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


# ------------------------------------------------------------------ Geräusche (Sekunde im Film, Datei, Text, Länge, Pegel dB)
SFX = [
    (0.0, 'drone', 'Very deep ominous sub-bass drone in a vast dark stone hall, slow swell, no music', 6.0, -8),
    (3.35, 'landen', 'A single glowing ember lands on stone with a soft magical sizzle and a low resonant boom', 2.0, -4),
    (4.0, 'halle', 'Dark empty throne hall ambience, distant fire crackle, faint chains creaking, deep air', 14.0, -14),
    (14.0, 'krone', 'Close crackling embers and a low magical hum, fire breathing slowly', 4.5, -12),
    (18.4, 'schlacht', 'Distant ancient battle charge, many armored warriors running, war cries muffled as in a memory, fire roaring', 6.5, -10),
    (24.9, 'siegel', 'Massive magical seal closing, deep stone grinding and a resonant chime of runes locking, then silence', 4.0, -6),
    (31.8, 'stein', 'Heavy stone floor slowly cracking under pressure, deep creaks and small crumbling pieces, tension', 6.0, -6),
    (37.9, 'bruch', 'Huge stone seal shatters with an explosive crack and a deep magical boom, debris', 2.5, -2),
    (43.1, 'bruch', 'Huge stone seal shatters with an explosive crack and a deep magical boom, debris', 2.5, -5),
    (27.6, 'drone', 'Very deep ominous sub-bass drone in a vast dark stone hall, slow swell, no music', 6.0, -12),
    (45.6, 'drone', 'Very deep ominous sub-bass drone in a vast dark stone hall, slow swell, no music', 6.0, -7),
    (46.2, 'krone', 'Close crackling embers and a low magical hum, fire breathing slowly', 4.5, -10),
    (49.8, 'wind', 'Night wind over a small village in a valley, falling ash, distant crackle of fire, lonely', 7.8, -12),
    (57.6, 'titel', 'Deep cinematic impact boom with a fiery whoosh rising and long tail', 4.4, -4),
]
ROAR = (43.3, os.path.join(REPO, 'src/audio/klang/bossRoar_ash_sovereign.mp3'), -2)


def sfx(name, text, length):
    out = os.path.join(ROH, f'fx-{name}.mp3')
    post('/sound-generation', {'text': text, 'duration_seconds': length, 'prompt_influence': 0.5}, out)
    return out


# ------------------------------------------------------------------ Musik: eine Partitur mit Abschnitten im Takt der Einstellungen
def music():
    out = os.path.join(ROH, 'musik.mp3')
    sec = lambda name, ms, pos, neg=(): {'section_name': name, 'positive_local_styles': list(pos), 'negative_local_styles': list(neg), 'duration_ms': ms, 'lines': []}
    plan = {
        'positive_global_styles': ['dark orchestral fantasy film score', 'cinematic trailer', 'minor key', 'low strings', 'brooding', 'instrumental'],
        'negative_global_styles': ['vocals', 'lyrics', 'pop', 'electronic beat', 'synth lead', 'upbeat', 'happy'],
        'sections': [
            sec('Darkness', 4000, ['single very low sustained cello note', 'sub bass', 'almost silent'], ['drums', 'melody']),
            sec('The sleeping king', 14400, ['slow dark string chords', 'sparse solo cello motif', 'quiet', 'tension'], ['drums', 'brass']),
            sec('Memory of the five kings', 13400, ['war drums', 'low brass', 'wordless choir', 'heroic but tragic', 'building'], ['soft']),
            sec('The seal breaks', 7200, ['string tremolo crescendo', 'rising tension', 'ticking percussion', 'ends abruptly'], ['melody']),
            sec('He awakens', 10800, ['massive wordless dark choir', 'full brass', 'taiko hits', 'menacing climax'], ['soft']),
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


# Ersatz, solange der Schlüssel keine Musik darf: Partitur aus Stücken der Geräusch-Erzeugung (je höchstens 22 s)
SCORE = [
    (0.0, 'score-1', 'Cinematic dark orchestral film underscore, very low sustained cello and contrabass drone, ominous and slow, no percussion', 18.4, -6),
    (18.4, 'score-2', 'Epic dark orchestral film score, war drums, low brass stabs and wordless choir, tragic, building intensity', 13.4, -8),
    (31.8, 'score-3', 'Orchestral film score, string tremolo crescendo with rising tension and ticking percussion, ends abruptly', 7.2, -8),
    (39.0, 'score-4', 'Massive dark orchestral film score climax, menacing wordless choir, full brass and taiko hits', 10.8, -8),
    (49.8, 'score-5', 'Quiet melancholic film score, solo cello with a distant low horn, ominous and sparse', 12.2, -8),
]


# ------------------------------------------------------------------ Mischen
def mix(lang, voices):
    out = os.path.join(MEDIA, f'ton-{lang}.mp3')
    ins, filt, bus_fx, bus_v = [], [], [], []
    n = 0

    def add(path, at, db, extra=''):
        nonlocal n
        ins.extend(['-i', path])
        ms = int(round(at * 1000))
        filt.append(f'[{n}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={db}dB{extra},adelay={ms}|{ms},apad=whole_dur={DUR + 1}[a{n}]')
        n += 1
        return f'[a{n - 1}]'

    m = music()
    if m: mus = add(m, 0.0, -3, ',afade=t=out:st=60.2:d=1.8')
    else:
        parts = [add(sfx(name, text, length), at, db, f',afade=t=in:d=0.05,afade=t=out:st={length - 0.6}:d=0.6') for at, name, text, length, db in SCORE]
        filt.append(f'{"".join(parts)}amix=inputs={len(parts)}:normalize=0[score]')
        mus = '[score]'
    for at, name, text, length, db in SFX: bus_fx.append(add(sfx(name, text, length), at, db))
    bus_fx.append(add(ROAR[1], ROAR[0], ROAR[2]))
    # Stimme: etwas Hall der Halle (in der Glutsenke trockener)
    for (t, _), path in zip(LINES, voices):
        room = ',aecho=0.8:0.55:70|140:0.22|0.12' if t < 49 else ',aecho=0.8:0.4:40:0.1'
        bus_v.append(add(path, t, 2, room))
    filt.append(f'{"".join(bus_v)}amix=inputs={len(bus_v)}:normalize=0,asplit[vo][vside]')
    filt.append(f'{"".join(bus_fx)}amix=inputs={len(bus_fx)}:normalize=0[fx]')
    filt.append(f'{mus}[fx]amix=inputs=2:normalize=0[bed]')
    # Musik und Geräusche weichen der Stimme (Sidechain), dann alles auf Spiellautstärke
    filt.append('[bed][vside]sidechaincompress=threshold=0.04:ratio=6:attack=30:release=450:makeup=1[duck]')
    filt.append(f'[duck][vo]amix=inputs=2:normalize=0,atrim=0:{DUR + 0.8},loudnorm=I=-16:TP=-1.5:LRA=11[out]')
    cmd = ['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', ';'.join(filt), '-map', '[out]', '-ac', '2', '-ar', '44100', '-b:a', '112k', out]
    subprocess.run(cmd, check=True)
    print(f'  {os.path.basename(out)}: {os.path.getsize(out) / 1024:.0f} KB, {dur(out):.1f} s')


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
        mix(lang, voices)
    block = f'// <ton.mjs> – von tools/intro/ton.py geschrieben, nicht von Hand ändern\nconst TIMING = {json.dumps(timing)};\n// </ton.mjs>'
    new = re.sub(r'// <ton\.mjs>.*?// </ton\.mjs>', lambda m: block, open(FILM, encoding='utf8').read(), flags=re.S)
    open(FILM, 'w', encoding='utf8').write(new)


if __name__ == '__main__':
    main()
