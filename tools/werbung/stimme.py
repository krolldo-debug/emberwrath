# Sprecherzeilen der Werbevideos über ElevenLabs (Schlüssel setzt der Proxy ein), mit Zeitmarken je Wort.
#   python3 tools/werbung/stimme.py ZIELORDNER vorsatz "Satz eins." "Satz zwei." …   → vorsatz-00.mp3 + vorsatz-00.json (Wortzeiten)
import sys, os, json, base64, urllib.request
API = 'https://api.elevenlabs.io/v1'
VOICE = 'uYCPzx1CVH5qosGkvHCm'       # Erzähler der Trailer; für Werbung etwas schneller und lebhafter
SET = {'stability': 0.42, 'similarity_boost': 0.8, 'style': 0.4, 'use_speaker_boost': True, 'speed': float(os.environ.get('TEMPO', 1.04))}

def sprechen(out_dir, vorsatz, lines, force=False):
    os.makedirs(out_dir, exist_ok=True); res = []
    for i, text in enumerate(lines):
        mp3, js = f'{out_dir}/{vorsatz}-{i:02d}.mp3', f'{out_dir}/{vorsatz}-{i:02d}.json'
        if force or not os.path.exists(js) or json.load(open(js)).get('text') != text:
            body = {'text': text, 'model_id': 'eleven_multilingual_v2', 'language_code': 'de', 'voice_settings': SET}
            if i: body['previous_text'] = ' '.join(lines[:i])[-300:]
            if i + 1 < len(lines): body['next_text'] = ' '.join(lines[i + 1:])[:300]
            req = urllib.request.Request(f'{API}/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128', data=json.dumps(body).encode(),
                                         headers={'xi-api-key': os.environ.get('ELEVENLABS_API_KEY', 'proxy'), 'Content-Type': 'application/json'})
            d = json.load(urllib.request.urlopen(req, timeout=120)); al = d['alignment']
            open(mp3, 'wb').write(base64.b64decode(d['audio_base64']))
            words, cur = [], None
            for ch, a, b in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
                if ch.strip():
                    if cur is None: cur = [ch, a, b]
                    else: cur[0] += ch; cur[2] = b
                elif cur: words.append(cur); cur = None
            if cur: words.append(cur)
            json.dump({'text': text, 'words': words, 'ende': al['character_end_times_seconds'][-1]}, open(js, 'w'), ensure_ascii=False)
        res.append(json.load(open(js)))
    return res

if __name__ == '__main__':
    for i, r in enumerate(sprechen(sys.argv[1], sys.argv[2], sys.argv[3:])):
        print(i, f"{r['ende']:.2f} s", ' '.join(f"{w}@{a:.2f}" for w, a, b in r['words']))
