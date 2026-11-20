# Tonspuren der Werbe-Trailer (tools/trailer/film.js): Stimme, Musik-Stücke und Geräusche, gemischt wie beim Intro-Film.
# Nutzt die Mischung aus tools/intro/ton.py (gleiche Regeln: Stimme fest, Hintergrund weicht ihr aus) mit dem Zeitplan
# des jeweiligen Trailers. Rohdateien liegen in ROH (Standard /mnt/project-files/werbevideos/roh): die Stimmen
# (ElevenLabs, erzeugt mit --stimme) und die Klänge des Intros (fx-*.mp3). Nichts wird neu erzeugt, solange die Dateien da sind.
#   python3 tools/trailer/ton.py t1 [ZIEL]        mischen -> /mnt/project-files/werbevideos/ton-<film>.mp3
#   python3 tools/trailer/ton.py t1 --pruefen     Abstand Stimme/Hintergrund je Satz
#   python3 tools/trailer/ton.py t3 --stimme      fehlende Sätze sprechen lassen (Kopfzeile xi-api-key setzt der Proxy)
import json, os, re, subprocess, sys, importlib.util, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROH = os.environ.setdefault('ROH', '/mnt/project-files/werbevideos/roh')
FILM = os.path.join(HERE, 'film.js')
spec = importlib.util.spec_from_file_location('introton', os.path.join(HERE, '../intro/ton.py'))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)
T.music = lambda: None                      # keine erzeugte Filmmusik (Schlüssel ohne Recht „Music“): Stücke aus SCORE
# Der Nachhall großer Schläge grollt um 300 Hz, genau unter leisen Satzanfängen: Schläge weichen der Stimme auch in den Tiefen
T.DUCK = {**T.DUCK, 'schlag': (12, 11, 0.05, 0.4)}
N = 99                                      # Länge „ganze Datei“

# Je Film: Stimme (Dateivorsatz, ElevenLabs-Stimme, Einstellungen), Musik-Stücke, Raumklang, Schläge (Zeiten = Bildzeiten
# aus film.js), TIEFER = Sätze (gezählt ab 0), unter denen besonders viel los ist
MALGARETH = ('stimme-de', 'BxoyaO1xuQUNkP2tJIrR', {'stability': 0.6, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True, 'speed': 0.9})
# Erzähler von Trailer 3: „Joel“, die tiefe Stimme der Reels-Kampagne
ERZAEHLER = ('erzaehler-de', 'uYCPzx1CVH5qosGkvHCm', {'stability': 0.5, 'similarity_boost': 0.8, 'style': 0.3, 'use_speaker_boost': True, 'speed': 0.94})
PLAN = {
    # Könige 0 (Siegel reißt 4,5) · Dorf 6,9 · Dämon 13,3 (Augen 13,8) · Frostzinnen 17,0 (Wyrm 20,0) · Inseln 21,4 ·
    # Thronsaal 24,6 · Titel 28,9 · Endkarte 32,3 · Ende 36,3
    't3': dict(stimme=ERZAEHLER, tiefer={1: 8, 7: 8}, score=[
        (0, 'score-1', '', N, -9, 'I', {'bis': 7.2}),
        (6.7, 'score-5', '', N, -8, 'I', {'bis': 7.0, 'ein': 0.8}),             # einsames Cello: das Dorf, der Held
        (13.1, 'score-2', '', N, -7, 'I', {'bis': 8.6, 'ein': 0.4}),            # Kriegstrommeln: Tiefe und Frostzinnen
        (21.4, 'score-6', '', N, -8, 'I', {'bis': 3.6, 'ein': 0.3}),
        (24.4, 'score-1', '', N, -10, 'I', {'ab': 6.0, 'bis': 10.6, 'ein': 0.6}),
        (25.85, 'score-3', '', N, -1, 'M'),
        (28.9, 'score-4', '', N, -5, 'I', {'bis': 7.4}),
    ], raum=[
        (0, 'wind', '', N, -12, 'I', {'bis': 6.9}),
        (6.9, 'wind', '', N, -15, 'I', {'bis': 5.0}),
        (13.3, 'halle', '', N, -15, 'I', {'bis': 3.7}),
        (17.0, 'wind', '', N, -9, 'I', {'bis': 4.4}),
        (24.6, 'krone', '', N, -13, 'I', {'bis': 4.3}),
        (31.9, 'drone', '', N, -9, 'M', {'bis': 4.4}),
    ], schlag=[
        (0, 'landen', '', N, -3, 'M'),
        (4.5, 'bruch', '', N, 1, 'M'),                                          # das Siegel reißt auf
        (13.0, 'whoosh', '', N, -5, 'M'),
        (13.8, 'landen', '', N, -4, 'M'),
        (16.7, 'whoosh', '', N, -6, 'M'),
        (20.0, 'landen', '', N, -2, 'M'),                                       # der Frostwyrm erwacht
        (20.0, 'shimmer', '', N, -5, 'M'),
        (21.1, 'whoosh', '', N, -7, 'M'),
        (28.4, 'titel', '', N, 3, 'M'),
    ]),
    # Einstieg 0 · Ausbruch 5,25 · Dämon 9,3 (Augen 10,25) · Reiter 16,5 · Riss 19,7 (reißt 20,7) · Inseln 24,8 ·
    # Thronsaal 28,6 · Titel 34,3 · Endkarte 37,8 · Ende 41,8
    't1': dict(stimme=MALGARETH, tiefer={1: 12, 5: 6, 8: 8}, score=[
        (0, 'score-1', '', N, -9, 'I', {'bis': 6.0}),                         # tiefer Bordun: tausend Jahre unter dem Stein
        (5.15, 'score-4', '', N, -6, 'I', {'bis': 6.6}),                      # Chor und Blech setzen mit dem Ausbruch ein
        (9.1, 'score-2', '', N, -7, 'I', {'bis': 10.8, 'ein': 0.6}),          # Kriegstrommeln: Dämon, drei Helden, Reiter
        (19.7, 'score-6', '', N, -8, 'I', {'bis': 9.3, 'ein': 0.3}),          # feierlicher Chor, hohe Streicher: Riss und Inseln
        (28.4, 'score-1', '', N, -10, 'I', {'ab': 6.0, 'bis': 12.0, 'ein': 0.8}),   # der Bordun kehrt im Thronsaal zurück
        (31.25, 'score-3', '', N, -1, 'M'),                                   # Tremolo gipfelt nach 3,05 s und bricht ab: Titel
        (34.3, 'score-4', '', N, -5, 'I', {'bis': 7.5}),                      # Chor unter Titel und Endkarte
    ], raum=[
        (0, 'drone', '', N, -6, 'M'),
        (9.3, 'halle', '', N, -15, 'I', {'bis': 7.2}),
        (16.5, 'wind', '', N, -11, 'I', {'bis': 3.3}),
        (24.8, 'wind', '', N, -13, 'I', {'bis': 3.9}),
        (28.6, 'krone', '', N, -13, 'I'),
        (37.4, 'drone', '', N, -9, 'M', {'bis': 4.4}),
    ], schlag=[
        (0, 'landen', '', N, -3, 'M'),                                        # Einstieg
        (5, 'ausbruch', '', N, 4, 'M'),                                       # Einsatz nach 0,25 s: Ausbruch
        (10.25, 'landen', '', N, -4, 'M'),                                    # die Augen des Dämons flammen auf
        (16.15, 'whoosh', '', N, -5, 'M'),                                    # Schnitt auf den Reiter
        (20.7, 'bruch', '', N, 1, 'M'),                                       # der Himmel reißt
        (20.75, 'shimmer', '', N, -5, 'M'),
        (24.5, 'whoosh', '', N, -7, 'M'),                                     # hinauf über die Wolken
        (33.8, 'titel', '', N, 3, 'M'),                                       # Einschlag nach 0,5 s: Titel
    ]),
    # Kurzfassung: Ausbruch 0,3 · Dämon 2,8 (Augen 3,15) · Reiter 5,6 · Riss 7,8 (reißt 8,25) · Thronsaal 9,8 · Titel 11,6 ·
    # Endkarte 13,0 · Ende 15,0
    't2': dict(stimme=MALGARETH, tiefer={0: 12, 1: 4, 3: 6}, score=[
        (0.2, 'score-4', '', N, -6, 'I', {'bis': 5.6}),
        (2.6, 'score-2', '', N, -7, 'I', {'bis': 7.4, 'ein': 0.4}),
        (8.55, 'score-3', '', N, -1, 'M'),
        (11.6, 'score-4', '', N, -5, 'I', {'bis': 3.4}),
    ], raum=[
        (0, 'drone', '', N, -8, 'M', {'bis': 3.0}),
        (9.8, 'krone', '', N, -13, 'I', {'bis': 1.9}),
    ], schlag=[
        (0.05, 'ausbruch', '', N, 4, 'M'),
        (3.15, 'landen', '', N, -4, 'M'),
        (5.3, 'whoosh', '', N, -5, 'M'),
        (8.25, 'bruch', '', N, 1, 'M'),
        (8.3, 'shimmer', '', N, -5, 'M'),
        (11.1, 'titel', '', N, 3, 'M'),
    ]),
}


def lines_of(film):
    src = open(FILM, encoding='utf8').read()
    block = re.search(rf'const {film.upper()}_LINES = \[(.*?)\];', src, re.S).group(1)
    return [(float(t), txt, int(v) if v else i) for i, (t, txt, v) in enumerate(re.findall(r"\{ t: ([\d.]+), text: '([^']+)'(?:, v: (\d+))? \}", block))]


def sprechen(film):
    """Fehlende Sätze sprechen lassen: Satz für Satz, mit dem Text davor und danach als Zusammenhang."""
    vorsatz, voice, settings = PLAN[film]['stimme']
    L = lines_of(film)
    for i, (_, text, v) in enumerate(L):
        out = os.path.join(ROH, f'{vorsatz}-{v:02d}.mp3')
        if os.path.exists(out) and os.path.getsize(out) > 1000: continue
        body = {'text': text, 'model_id': 'eleven_multilingual_v2', 'language_code': 'de', 'voice_settings': settings}
        if i: body['previous_text'] = ' '.join(x[1] for x in L[:i])[-300:]
        if i + 1 < len(L): body['next_text'] = ' '.join(x[1] for x in L[i + 1:])[:300]
        req = urllib.request.Request(f'{T.API}/text-to-speech/{voice}?output_format=mp3_44100_128', data=json.dumps(body).encode(),
                                     headers={'xi-api-key': T.KEY, 'Content-Type': 'application/json'})
        open(out, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
        print(f'  {os.path.basename(out)} {T.speech_len(out):.2f} s  {text}')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    film = args[0] if args else 't1'
    plan = PLAN[film]
    if '--stimme' in sys.argv: return sprechen(film)
    L = lines_of(film)
    src = open(FILM, encoding='utf8').read()
    T.LINES = [(t, txt) for t, txt, _ in L]
    T.DUR = float(re.search(rf"{film}: makeFilm\(.*?\{{ t0: [\d.]+, t1: ([\d.]+), draw: shotEnd", src, re.S).group(1))
    T.SCORE, T.RAUM, T.SCHLAG, T.TIEFER = plan['score'], plan['raum'], plan['schlag'], plan['tiefer']
    voices = [os.path.join(ROH, f'{plan["stimme"][0]}-{v:02d}.mp3') for _, _, v in L]
    lens = [round(T.speech_len(v), 2) for v in voices]
    for (t, text), ln, nxt in zip(T.LINES, lens, [x[0] for x in T.LINES[1:]] + [T.DUR]):
        if t + ln > nxt - 0.1: print(f'  WARNUNG: „{text}“ {ln:.1f} s überlappt die nächste Zeile ({nxt - t:.1f} s Platz)')
    if '--pruefen' in sys.argv: return T.pruefen(film, voices, lens)
    out = args[1] if len(args) > 1 else f'/mnt/project-files/werbevideos/ton-{film}.mp3'
    roh = os.path.join(ROH, f'mix-{film}.wav')
    T.mix(film, voices, roh, None)
    # Für Reels/TikTok auf −14 LUFS, Spitzen höchstens −1 dBTP (die Verhältnisse der Mischung bleiben)
    i = T.lautheit(roh)[0]
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', roh, '-af', f'volume={-14 - i:.2f}dB,alimiter=limit=0.89:attack=5:release=80:level=0',
                    '-ar', '44100', '-b:a', '192k', out], check=True)
    print(f'  {out}: {T.dur(out):.1f} s, Lautheit {T.lautheit(out)[0]:.1f} LUFS')
    timing = json.loads(re.search(r'const TIMING = (\{.*?\});', src).group(1))
    timing[film] = lens
    block = f'// <ton> – von tools/trailer/ton.py geschrieben\nconst TIMING = {json.dumps(timing)};\n// </ton>'
    open(FILM, 'w', encoding='utf8').write(re.sub(r'// <ton>.*?// </ton>', lambda m: block, src, flags=re.S))


if __name__ == '__main__':
    main()
