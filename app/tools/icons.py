# Erzeugt App-Symbol und Startbild der Store-App aus den Spielgrafiken (Pixelraster bleibt ganzzahlig).
#   python3 tools/icons.py     (aus app/, braucht Pillow)
# Quelle Symbol: src/ui/pwa/app-icon-512.png, Quelle Startbild: site/img/logo.png.
from pathlib import Path
from PIL import Image

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent
BG = (5, 2, 10)

def icon(size):
    src = Image.open(ROOT / 'src/ui/pwa/app-icon-512.png').convert('RGBA')
    big = src.resize((1024, 1024), Image.NEAREST)
    flat = Image.new('RGB', big.size, BG)
    flat.paste(big, mask=big.split()[3])  # Apple verlangt ein Symbol ohne Transparenz
    return flat if size == 1024 else flat.resize((size, size), Image.LANCZOS)

def splash(size=2732, scale=8):
    logo = Image.open(ROOT / 'site/img/logo.png').convert('RGBA')
    logo = logo.resize((logo.width * scale, logo.height * scale), Image.NEAREST)
    img = Image.new('RGB', (size, size), BG)
    img.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
    return img

ios = APP / 'ios/App/App/Assets.xcassets'
if ios.exists():
    for f in (ios / 'AppIcon.appiconset').glob('*.png'): f.unlink()
    icon(1024).save(ios / 'AppIcon.appiconset/AppIcon-512@2x.png')
    s = splash()
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        s.save(ios / 'Splash.imageset' / name)
    print('iOS: Symbol und Startbild geschrieben')

res = APP / 'android/app/src/main/res'
if res.exists():
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for d, k in dens.items():
        folder = res / f'mipmap-{d}'
        if not folder.exists(): continue
        for name in ('ic_launcher.png', 'ic_launcher_round.png'):
            icon(round(48 * k)).save(folder / name)
        # Adaptives Symbol: Vordergrund 108 dp, sichtbarer Kreis ~72 dp in der Mitte
        fg = round(108 * k)
        inner = icon(round(72 * k))
        canvas = Image.new('RGB', (fg, fg), BG)
        canvas.paste(inner, ((fg - inner.width) // 2, (fg - inner.height) // 2))
        canvas.save(folder / 'ic_launcher_foreground.png')
    for folder in res.glob('drawable*'):
        p = folder / 'splash.png'
        if p.exists():
            w, h = Image.open(p).size
            img = Image.new('RGB', (w, h), BG)
            logo = Image.open(ROOT / 'site/img/logo.png').convert('RGBA')
            scale = max(1, int(min(w, h) * 0.6) // logo.width)
            logo = logo.resize((logo.width * scale, logo.height * scale), Image.NEAREST)
            img.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2), logo)
            img.save(p)
    print('Android: Symbole und Startbilder geschrieben')
