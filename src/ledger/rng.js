// Würfel des Fortschrittsbuchs (src/ledger/README.md). Spiel und Server ziehen dieselben Zahlen:
// ledgerRng(seed, label, n) liefert für Sitzungsschlüssel `seed` (vom Server), Art `label` ('loot', 'trial', …) und
// laufende Nummer `n` immer dieselbe Folge. Der Server würfelt jede gemeldete Beute damit nach und bestätigt nur,
// was dabei herauskommt. Reines JS ohne Abhängigkeiten (Browser, Node, Cloudflare Worker).

// 128-Bit-Hash eines Textes (cyrb128) -> vier 32-Bit-Zahlen
function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// sfc32: schnell, gut verteilt, in jeder JS-Umgebung bitgleich
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function ledgerRng(seed, label, n) {
  const next = sfc32(...hash128(`${seed}|${label}|${n}`));
  for (let i = 0; i < 12; i++) next(); // Anlauf
  return next;
}

// Arten mit eigener Nummernfolge (jede zählt für sich ab 1)
export const RNG_LABELS = ['loot', 'trial', 'daily', 'board'];
