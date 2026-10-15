// Handy quer: HUD bis an den Bildschirmrand (Thread D).
// iOS meldet im Querformat links UND rechts denselben Sicherheitsabstand (iPhone 15 Pro: 59 px), obwohl Kamera-Insel
// bzw. Notch nur auf einer Seite sitzen und dort nur das mittlere Drittel der Höhe verdecken. Die HUD-Elemente lagen
// dadurch auf beiden Seiten weit vom Rand weg.
// Setzt auf <html> fünf CSS-Variablen (theme.css „Handy quer: bis an den Rand“):
//   --ef-edge-l/-r/-t  Ecken (Heldenrahmen, Chat, Inventar, Minimap, Menü): kleiner fester Rand, die Insel reicht nicht bis dort
//   --ef-safe-l/-r  Elemente auf mittlerer Höhe (Aktionsknöpfe, offener Chat): nur auf der Kameraseite voller Abstand
// Ohne den iOS-Fall (Android meldet nur die Seite mit der Kamera, Desktop 0) bleiben alle vier = env(safe-area-inset-*).

// Ecken: seitlich 16 px + 8 px Eigenabstand = 24 px, oben 6 + 8 = 14 px. So bleibt jede Elementecke innerhalb der gerundeten
// Bildschirmecke (Radius bis 62 pt beim iPhone 16 Pro: (62−24)² + (62−14)² < 62²).
const EDGE = 16, EDGE_TOP = 6;

// 90: Gerät nach links gedreht, Oberkante (Kamera) links; −90 bzw. 270: Kamera rechts
function cameraSide() {
  const a = typeof window.orientation === 'number' ? window.orientation : screen.orientation?.angle;
  if (a === 90) return 'l';
  if (a === -90 || a === 270) return 'r';
  return null;
}

export function installSafeEdges() {
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;'
    + 'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
  (document.body ?? root).append(probe);
  const vars = ['--ef-edge-l', '--ef-edge-r', '--ef-edge-t', '--ef-safe-l', '--ef-safe-r'];

  const apply = () => {
    const cs = getComputedStyle(probe);
    const l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
    const side = cameraSide();
    const landscape = window.innerWidth > window.innerHeight;
    if (!landscape || !side || l <= 0 || Math.abs(l - r) > 0.5) {
      for (const v of vars) root.style.removeProperty(v);
      return;
    }
    const s = root.style;
    s.setProperty('--ef-edge-l', `${EDGE}px`);
    s.setProperty('--ef-edge-r', `${EDGE}px`);
    s.setProperty('--ef-edge-t', `${EDGE_TOP}px`);
    s.setProperty('--ef-safe-l', `${side === 'l' ? l : EDGE}px`);
    s.setProperty('--ef-safe-r', `${side === 'r' ? r : EDGE}px`);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => { apply(); setTimeout(apply, 300); });
  screen.orientation?.addEventListener?.('change', apply);
}
