#!/usr/bin/env python3
"""Rohklänge für das Spiel bei ElevenLabs erzeugen (Soundeffekte und wortlose NPC-Laute).

Der API-Schlüssel kommt nicht von hier: Die Projekt-Umgebung setzt den Header xi-api-key
für api.elevenlabs.io selbst. Jeder Abruf wird mit seinen geschätzten Credits in
budget.json eingetragen; über BUDGET hinaus verweigert das Werkzeug weitere Abrufe.

  python3 tools/klang/elevenlabs.py sfx hit "kurzer, wuchtiger Schwerttreffer" --dur 0.6 --takes 3
  python3 tools/klang/elevenlabs.py tts greet_smith_brom <voice_id> "[gruff] Hm." --takes 2
  python3 tools/klang/elevenlabs.py stand
"""
import argparse, json, math, os, subprocess, sys, time

OUT = os.environ.get('KLANG_ROH', '/mnt/project-files/klang/roh')
LEDGER = os.path.join(os.path.dirname(OUT), 'budget.json')
BUDGET = int(os.environ.get('KLANG_BUDGET', '6000'))  # vom Nutzer freigegeben (17.10.)
API = 'https://api.elevenlabs.io/v1'
SFX_PER_SEC = 20     # Credits je Sekunde bei fester Länge (API)
SFX_AUTO = 100       # Credits bei automatischer Länge (API)


def ledger():
    try:
        with open(LEDGER) as f: return json.load(f)
    except FileNotFoundError: return {'spent': 0, 'calls': []}


def book(cost, entry):
    led = ledger()
    if led['spent'] + cost > BUDGET:
        sys.exit(f'Budget erreicht: {led["spent"]} + {cost} > {BUDGET} Credits, nichts abgerufen.')
    return led


def save(led):
    with open(LEDGER + '.tmp', 'w') as f: json.dump(led, f, indent=1, ensure_ascii=False)
    os.replace(LEDGER + '.tmp', LEDGER)


def post(url, body, dest):
    r = subprocess.run(['curl', '-sS', '-X', 'POST', url, '-H', 'Content-Type: application/json',
                        '-d', json.dumps(body), '-o', dest, '-w', '%{http_code}', '-D', dest + '.hdr'],
                       capture_output=True, text=True)
    code = r.stdout.strip()
    if code != '200':
        msg = open(dest, 'rb').read()[:400].decode('utf8', 'replace') if os.path.exists(dest) else r.stderr
        for p in (dest, dest + '.hdr'):
            if os.path.exists(p): os.remove(p)
        sys.exit(f'HTTP {code}: {msg}')
    os.remove(dest + '.hdr')


def next_take(name):
    n = 1
    while os.path.exists(os.path.join(OUT, f'{name}-{n}.mp3')): n += 1
    return n


def run(kind, name, takes, cost, url, body, meta):
    os.makedirs(OUT, exist_ok=True)
    for _ in range(takes):
        led = book(cost, None)
        n = next_take(name)
        dest = os.path.join(OUT, f'{name}-{n}.mp3')
        post(url, body, dest)
        led = ledger()
        led['spent'] += cost
        led['calls'].append({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), 'kind': kind, 'file': os.path.basename(dest), 'credits': cost, **meta})
        save(led)
        print(f'{os.path.basename(dest)}  {cost} Credits  (gesamt {led["spent"]}/{BUDGET})')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('sfx'); s.add_argument('name'); s.add_argument('prompt')
    s.add_argument('--dur', type=float); s.add_argument('--takes', type=int, default=3); s.add_argument('--influence', type=float, default=0.6)
    t = sub.add_parser('tts'); t.add_argument('name'); t.add_argument('voice'); t.add_argument('text')
    t.add_argument('--takes', type=int, default=2); t.add_argument('--model', default='eleven_v3')
    sub.add_parser('stand')
    a = ap.parse_args()
    if a.cmd == 'stand':
        led = ledger(); print(f'{led["spent"]}/{BUDGET} Credits, {len(led["calls"])} Abrufe'); return
    if a.cmd == 'sfx':
        body = {'text': a.prompt, 'prompt_influence': a.influence}
        if a.dur: body['duration_seconds'] = a.dur
        cost = math.ceil(a.dur * SFX_PER_SEC) if a.dur else SFX_AUTO
        run('sfx', a.name, a.takes, cost, f'{API}/sound-generation?output_format=mp3_44100_128', body, {'prompt': a.prompt, 'dur': a.dur})
    else:
        mult = 0.5 if any(k in a.model for k in ('flash', 'turbo', 'conversational')) else 1
        cost = math.ceil(len(a.text) * mult)
        body = {'text': a.text, 'model_id': a.model}
        run('tts', a.name, a.takes, cost, f'{API}/text-to-speech/{a.voice}?output_format=mp3_44100_128', body, {'text': a.text, 'voice': a.voice, 'model': a.model})


if __name__ == '__main__':
    main()
