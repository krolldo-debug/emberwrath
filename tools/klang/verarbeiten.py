#!/usr/bin/env python3
"""Ausgewählte Rohklänge spielfertig machen: Stille vorn und hinten weg, kurz ausblenden,
auf gleiche Spitze bringen, Mono-MP3 nach src/audio/klang/ und die Liste src/audio/klangListe.js schreiben.

Welche Versionen ins Spiel kommen, steht in tools/klang/auswahl.json:
  "hit": { "takes": [1, 3], "group": "fx", "gain": 0.7, "vary": true }
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROH = os.environ.get('KLANG_ROH', '/mnt/project-files/klang/roh')
OUT = os.path.join(ROOT, 'src/audio/klang')
LIST = os.path.join(ROOT, 'src/audio/klangListe.js')
PEAK = -2.0  # dBFS


def ff(*args):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y', *args], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])
    return r.stderr


def prepare(src, dest, trim_db, kbps):
    tmp = dest + '.wav'
    trim = (f'silenceremove=start_periods=1:start_threshold={trim_db}dB:start_silence=0.005,areverse,'
            f'silenceremove=start_periods=1:start_threshold={trim_db - 5}dB:start_silence=0.02,areverse')
    ff('-i', src, '-ac', '1', '-ar', '44100', '-af', trim, tmp)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp],
                               capture_output=True, text=True).stdout)
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', ff('-i', tmp, '-af', 'volumedetect', '-f', 'null', '-')).group(1))
    fade = min(0.08, dur * 0.25)
    ff('-i', tmp, '-af', f'volume={PEAK - peak}dB,afade=t=in:d=0.003,afade=t=out:st={max(0, dur - fade):.3f}:d={fade:.3f}',
       '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', dest)
    os.remove(tmp)
    return dur


def main():
    sel = json.load(open(os.path.join(ROOT, 'tools/klang/auswahl.json')))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.mp3'): os.remove(os.path.join(OUT, f))
    lines, total = [], 0
    for name, k in sorted(sel.items()):
        files = []
        for i, take in enumerate(k['takes'], 1):
            dest = f'{name}-{i}.mp3' if len(k['takes']) > 1 else f'{name}.mp3'
            prepare(os.path.join(ROH, f'{name}-{take}.mp3'), os.path.join(OUT, dest), k.get('trim', -45), 56 if k['group'] == 'greet' else 80)
            total += os.path.getsize(os.path.join(OUT, dest))
            files.append(dest)
        lines.append(f"  {name}: {{ group: '{k['group']}', gain: {k.get('gain', 1)}, vary: {str(k.get('vary', False)).lower()}, files: {json.dumps(files)} }},")
    with open(LIST, 'w') as f:
        f.write('// Erzeugt von tools/klang/verarbeiten.py aus tools/klang/auswahl.json – nicht von Hand ändern.\n')
        f.write('// group: fx | boss | greet (Ladereihenfolge), gain: Lautstärke, vary: leicht verstimmen je Wiedergabe.\n')
        f.write('export const KLANG = {\n' + '\n'.join(lines) + '\n};\n')
    print(f'{len(sel)} Klänge, {total / 1024:.0f} KB in src/audio/klang/')


if __name__ == '__main__':
    main()
