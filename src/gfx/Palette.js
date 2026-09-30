// Kuratierte Farbrampen (dunkel -> hell). Alle Sprites und Tiles ziehen
// ihre Farben von hier, damit der Look konsistent bleibt.
export const PAL = {
  outline: '#0b0710',
  shadow: 'rgba(5,3,10,0.55)',

  stone: ['#1a1622', '#252030', '#312a3d', '#3e364b', '#4d4459', '#5f566b'],
  stoneWarm: ['#231b1e', '#302529', '#3f3035', '#4f3d40'],
  mortar: '#120e18',
  moss: ['#1e2a1f', '#2b3b27', '#3d5232'],

  steel: ['#1c2130', '#2d3548', '#48526a', '#6d7a94', '#a3b0c6', '#dfe7f2'],
  crimson: ['#2a0a12', '#4a0f1c', '#7a1a26', '#a8283a', '#d0454a'],
  leather: ['#1f130f', '#33211a', '#4d3326', '#6b4a34'],
  gold: ['#4a2f10', '#7d5418', '#b8862a', '#e8c25a', '#fff0a8'],
  skin: ['#5a3a30', '#8a5a44', '#c08a68'],

  bone: ['#463d30', '#80755c', '#bcae8e', '#e6dcc0', '#fffbef'],
  rust: ['#2e1a14', '#5a3222', '#8a4e2e', '#b06a3a'],

  spider: ['#140d1c', '#2e2240', '#46345e', '#64507e', '#8a70aa'],
  spiderMark: ['#6a1420', '#b02a2a'],

  ember: ['#3a0e05', '#7a2208', '#c8420c', '#f07a1c', '#ffb640', '#fff0b0'],
  magic: ['#1a0a2e', '#3a1466', '#6a2cb0', '#a060f0', '#e0b8ff'],
  blood: ['#2a0508', '#4e0a10', '#7c1418', '#a82020'],
  eye: ['#ff3a2a', '#ffb070'],
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
