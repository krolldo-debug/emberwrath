# Werbevideo C „Von 1 auf 50“, Fassung 2: gemeinsamer Plan für Bild (video_c.py) und Ton (ton_c.py).
# Der Schnitt sitzt auf der Trailermusik m_a (Video = m_a − 3,5 s): Einsatz bei TD, Schläge auf x,0 / x,5,
# große Akzente bei 8,5 / 12,5 / 16,5, Schlussschlag bei TH, Abspann ab TE.
TD, TH, TE, DUR = 3.03, 18.0, 19.53, 24.0   # Einsatz, Schlussschlag (Logo), Abspann, Ende
AKZENT = (TD, 8.5, 12.5, 16.5)

# t0, Aufnahme, erstes Bild, Schritt (4 = Echtzeit, 3 = etwas langsamer), Maßstab, dx, dy (Ausschnitt in Quellpixeln),
# Stufe, Titel, Unterzeile (bei Bossen der Ort), Boss?
CUT = [
    (0.00, 'sg-ysmeine-a', 150, 3, 3, 14, -30, 50, 'KÖNIGIN YSMEINE', 'DIE STERNWARTE', True),
    (TD, 'c-senke', 20, 4, 5, -14, 30, 1, 'DIE GLUTSENKE', None, False),
    (5.00, 'e-b-var', 240, 3, 4, 0, 40, 6, 'VARKHUL', 'DIE KATAKOMBEN', True),
    (6.00, 'c-wald', 20, 4, 5, -14, 30, 9, 'DER ASCHENWALD', None, False),
    (7.00, 'f-b-ner', 105, 3, 4, 0, 0, 12, 'NERITH', 'DER VERSUNKENE TEMPEL', True),
    (8.00, 'c-gipfel', 350, 4, 5, 0, 20, 16, 'DIE SCHLACKENHÖHEN', None, False),
    (8.50, 'f-kill-ign', 578, 4, 4, 0, 0, 20, 'IGNAROTH', 'DIE GLUTSCHMIEDE', True),
    (9.50, 'f-war-charge', 395, 4, 4, 0, 0, 22, 'DIE ASCHENSTEPPE', None, False),
    (10.00, 'e-b-ulg', 400, 4, 4, 0, 0, 24, 'ULGRIM', 'DAS HEULENDE HÜGELGRAB', True),
    (10.50, 'f-war-whirl', 20, 4, 4, 0, 0, 27, 'DIE FAULMARSCH', None, False),
    (11.00, 'e-b-rot', 200, 4, 4, 0, 0, 30, 'MUTTER FÄULNIS', 'DER SPORENSCHLUND', True),
    (11.50, 'e-k-war', 150, 4, 4, 0, 0, 33, 'DIE FROSTZINNEN', None, False),
    (12.00, 'f-kill-sk', 785, 4, 4, 0, 0, 35, 'SKALVYR', 'DIE REIFHÖHLEN', True),
    (12.50, 'h-mal-rage', 770, 4, 3, 0, -36, 40, 'MALGARETH', 'DER ASCHETHRON', True),
    (13.50, 'h-pack-pirscher', 185, 4, 4, 0, 0, 42, 'DIE TREIBENDEN GÄRTEN', None, False),
    (14.50, 'h-ysgarn-kill', 215, 4, 4, 0, 0, 44, 'YSGARN', 'DIE RANKENGRUFT', True),
    (15.00, 'h-pack-waechter', 255, 4, 4, 0, 0, 46, 'DIE SPLITTERWEITEN', None, False),
    (15.50, 'h-kaldris-kill', 395, 4, 4, 0, 0, 48, 'KALDRIS', 'DIE GLÄSERNEN HALLEN', True),
    (16.00, 'sg-ysmeine-kill', 140, 4, 4, 0, 0, 49, 'KÖNIGIN YSMEINE', 'DIE STERNWARTE', True),
    (16.50, 'sg-ysmeine-kill', 405, 4, 3, 14, -30, 50, 'KÖNIGIN YSMEINE', 'DIE STERNWARTE', True),
]
# Sprecher: (Satz in /tmp/tage/t901, Zeitpunkt im Video); Abspann-Satz aus /tmp/tage/t200 (Satz 6)
STIMME = [(0, 0.15), (1, 3.20), (2, 6.05), (3, 8.70), (4, 13.55), (5, 16.75)]
ABSPANN = (6, TE + 0.07)


def cut_at(t):
    k = 0
    for i, c in enumerate(CUT):
        if t >= c[0]: k = i
    return k


def bild_nr(t):
    """Aufnahme und Bildnummer zur Videozeit t (nach TH läuft die letzte Szene in Zeitlupe weiter)."""
    k = cut_at(t); c = CUT[k]
    if t >= TH: return k, c[2] + int(round((TH - c[0]) * 30)) * c[3] + int(round((t - TH) * 30))
    return k, c[2] + int(round((t - c[0]) * 30)) * c[3]
