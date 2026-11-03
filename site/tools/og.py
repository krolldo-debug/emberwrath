"""Vorschaubild aller Seiten beim Teilen (og:image und twitter:image, 1200 x 630): Ausschnitt aus dem Titelbild
„Der Himmel reißt auf“ (img/titel.webp, Feinraster) mit Riss, Aschethron und der Gruppe am Glutpfad, 1 Feinpixel = 2 Bildpunkte,
oben links das Logo (1 Logopunkt = 3 Bildpunkte). Harte Kanten, kein Text außer dem Logo (gilt für alle Sprachen).
Aufruf: python3 site/tools/og.py   → site/img/og-riss.png (nach neuem Titelbild neu erzeugen)
Bei einem neuen Motiv einen neuen Dateinamen wählen, sonst zeigen Messenger das alte Bild aus ihrem Zwischenspeicher.
"""
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / 'img'
X, Y = 560, 118                    # linke obere Ecke des Ausschnitts im Titelbild (Feinpixel), 600 x 315

bild = Image.open(IMG / 'titel.webp').convert('RGBA').crop((X, Y, X + 600, Y + 315)).resize((1200, 630), Image.NEAREST)
logo = Image.open(IMG / 'logo.png').convert('RGBA')
bild.alpha_composite(logo.resize((logo.width * 3, logo.height * 3), Image.NEAREST), (42, 40))
bild.convert('RGB').save(IMG / 'og-riss.png', optimize=True)
print('site/img/og-riss.png')
