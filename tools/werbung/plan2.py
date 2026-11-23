# Drei Werbevideos im Handy-Stil (wie B), je eine eigene Idee und ein eigener Sprecher. Gemeinsamer Zeitplan für
# Bild (video_k.py, video_m.py, video_h.py) und Ton (ton2.py). Zeiten in Sekunden im fertigen Video.
#   k = „Live-Kommentar“: ein Fußballkommentator überträgt den Kampf gegen Skalvyr.
#   m = „Malgareths Bitte“: der Endboss bittet, das Spiel nicht herunterzuladen.
#   h = „Verpass deine Haltestelle“: ein Bosskampf in der Bahn, Station um Station.
# Die Aufnahmen (tools/werbung/hud-record.mjs, Szenen k-skalvyr, m-malgareth, b-ignaroth) laufen ohne Schnitt mit;
# kill = Sekunde des Sieges in Aufnahme und Video. Musik: Trailerstücke m_a / m_b, [Datei, Quelle ab, von, bis, ein, aus, Pegel].
ST = '/mnt/project-files/werbevideos/stimmen'          # Sprecheraufnahmen (stimme2.py): <ST>/<name>/stimme.wav + woerter.json

def _musik_a(td, bis, th, ende, auftakt='m_b.mp3'):
    """Auftakt, Einsatz von m_a bei td (großer Akzent 9,47 s später), Schlussschlag bei th."""
    seg = [(auftakt, 0.0, 0.0, td - 0.3, 0.0, 0.3, 0.85)] if auftakt == 'm_b.mp3' else [('m_a.mp3', 0.0, 0.0, min(6.3, td - 0.4), 0.0, 0.5, 1.0)]
    return seg + [('m_a.mp3', 6.53 - 0.33, td - 0.33, bis, 0.0, 0.3, 1.0), ('m_a.mp3', 25.3, th - 0.06, min(ende, th + 3.0), 0.04, 0.6, 1.0)]

K = dict(name='k', aufnahme='k-skalvyr', dur=23.0, kill=14.15, th=18.9, boss='SKALVYR',
         stimme=[('kommentar', 0, 0.25), ('kommentar', 1, 4.7), ('kommentar', 2, 7.35), ('kommentar', 3, 11.15), ('kommentar', 4, 14.25), ('kommentar', 5, 18.9)],
         musik=_musik_a(4.68, 18.6, 18.9, 23.0) + [('m_b.mp3', 18.0, 21.4, 23.0, 0.5, 1.2, 0.75)],
         cine=[('subdrop', 0.0, 1.0), ('riser', 4.68 - 3.03, 0.6), ('subdrop', 4.68, 1.0), ('impact1', 14.15, 1.0), ('braam', 18.9, 0.9)],
         extra=[('publikum', 0.0, 0.5), ('jubel', 14.2, 1.0)], klang_bis=18.8)

M = dict(name='m', aufnahme='m-malgareth', dur=26.6, kill=21.85, th=24.2, boss='MALGARETH',
         stimme=[('malgareth', 0, 0.3), ('malgareth', 1, 4.6), ('malgareth', 2, 8.4), ('malgareth', 3, 11.65), ('malgareth', 4, 15.2), ('malgareth', 5, 18.7), ('malgareth', 6, 22.6)],
         musik=_musik_a(8.38, 23.3, 24.2, 26.6, auftakt='m_a.mp3'),
         cine=[('subdrop', 0.0, 1.0), ('riser', 8.38 - 3.03, 0.5), ('subdrop', 8.38, 1.0), ('impact1', 21.85, 1.0), ('braam', 24.2, 0.9)],
         extra=[], klang_bis=24.0)

H = dict(name='h', aufnahme='b-ignaroth', dur=21.5, kill=12.85, th=17.5, boss='IGNAROTH', schnitte=(4.0, 7.6), tueren=14.4,
         stimme=[('bahn', 0, 0.3), ('bahn', 1, 4.3), ('bahn', 2, 7.8), ('bahn', 3, 13.2), ('bahn', 4, 15.4), ('bahn', 5, 17.8)],
         musik=[('m_b.mp3', 0.0, 0.0, 12.85, 0.0, 0.12, 0.85), ('m_a.mp3', 25.3, 12.79, 15.8, 0.04, 0.6, 1.0), ('m_b.mp3', 18.0, 17.45, 21.5, 0.25, 1.2, 0.8)],
         cine=[('subdrop', 0.0, 1.0), ('impact1', 12.85, 1.0), ('braam', 17.5, 0.8)],
         extra=[('zug', 0.0, 0.55), ('gong', 4.0, 0.8), ('gong', 7.6, 0.8), ('durchsage', 10.8, 1.0), ('tueren', 14.4, 0.9)], klang_bis=17.3)

PLAN = dict(k=K, m=M, h=H)
