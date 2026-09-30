// Kleiner, reproduzierbarer Zufall (mulberry32). Gleicher Samen -> gleiche Söldner auf Server und Client.
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  // Gewichtete Wahl: [[wert, gewicht], …]
  next.weighted = (pairs) => {
    let sum = 0;
    for (const [, w] of pairs) sum += w;
    let r = next() * sum;
    for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  return next;
}

export function randomSeed() { return (Math.random() * 4294967296) >>> 0; }
