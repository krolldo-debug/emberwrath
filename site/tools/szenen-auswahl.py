import os, json
from PIL import Image
m = {}
for f in os.listdir('cn'):
    if f.startswith('meta'): m.update(json.load(open('cn/' + f)))
picks = {'titel': 'titel-37', 'kampf-aschenfuerst': 'aschenfuerst-07', 'welt-glutsenke': 'welt-glutsenke-08', 'welt-katakomben': 'welt-katakomben-00', 'welt-aschenwald': 'welt-aschenwald-06',
 'welt-tempel': 'welt-tempel-06', 'welt-schlacke': 'welt-schlacke-02', 'welt-schmiede': 'welt-schmiede-04', 'welt-steppe': 'welt-steppe-04', 'welt-huegelgrab': 'welt-huegelgrab-10',
 'welt-marsch': 'welt-marsch-00', 'welt-sporenschlund': 'welt-sporenschlund-02', 'welt-frostzinnen': 'welt-frostzinnen-06', 'welt-reifhoehlen': 'welt-reifhoehlen-04',
 'welt-gluetoede': 'welt-gluetoede-08', 'welt-aschethron': 'welt-aschethron-08'}
files = sorted(os.listdir('cn'))
os.makedirs('native', exist_ok=True)
focus = {}
for out, pre in picks.items():
    f = [x for x in files if x.startswith(pre) and x.endswith('.png') and (x == pre + '.png' or x[len(pre)] == '-')][0]
    k = m[f[:-4]]
    fx = (k['hero']['x'] + k['target']['x']) / 2; fy = (k['hero']['y'] + k['target']['y']) / 2
    focus[out] = {'fx': round(fx / 960 * 100), 'fy': round(fy / 540 * 100), 'src': f}
    im = Image.open('cn/' + f).convert('RGB')
    im.save(f'native/{"kampf-titel" if out == "titel" else out}.webp', lossless=True, method=6, quality=100)
json.dump(focus, open('native/focus.json', 'w'), indent=1)
print(json.dumps(focus))
