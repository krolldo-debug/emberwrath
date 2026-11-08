// Boss-Fokus: Im Bosskampf muss der Boss jederzeit lesbar bleiben. Treffer von Held, Gruppe und Fähigkeiten landen
// fast alle auf ihm; ihre Blitzlichter, Glanz-Flächen und Funken addierten sich zu einer weißen Wolke über dem Boss.
// Hier steht nur, WO gedämpft wird (über dem Boss, solange er kämpft) und WIE STARK; World.addLight und
// systems/Feedback.js wenden es an.

export const BOSS_FOCUS = {
  pad: 26,          // Rand um den Bosskörper (Weltpixel), in dem Treffereffekte gedämpft werden
  lightBloom: 0.3,  // Schein-Anteil kurzer Lichter über dem Boss
  lightLevel: 0.7,  // Helligkeit kurzer Lichter über dem Boss
  sparks: 0.5,      // Anteil der Funken/Splitter bei Treffern am Boss
  flashMax: 0.28,   // weißer Treffer-Umriss des Bosses: höchstens so deckend …
  flashGap: 450,    // … und höchstens alle so viele Millisekunden (egal wer trifft)
};

// Der Boss, solange der Kampf läuft (sonst null)
export function activeBoss(world) {
  const b = world?.boss;
  return b && b.engaged && !b.dead ? b : null;
}

// Liegt der Punkt über dem Bosskörper (inkl. Rand)? Große Bosse (Mutter Fäulnis) sind breiter als ihr Trefferkreis,
// deshalb mindestens 64 Weltpixel seitlich.
export function overBoss(world, x, y, pad = BOSS_FOCUS.pad) {
  const b = activeBoss(world);
  if (!b) return false;
  const half = Math.max(64, (b.hurtRadius ?? 16) * 3) + pad;
  const top = b.y - (b.bodyHeight ?? 32) - pad;
  return Math.abs(x - b.x) < half && y > top && y < b.y + pad;
}

export const isBoss = (t) => !!(t && (t.def?.boss || t.boss));
