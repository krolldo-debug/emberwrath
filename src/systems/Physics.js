// Bewegung mit achsengetrennter Kollisionsauflösung gegen die Tilemap.
// Fußabdruck = flaches Rechteck am Fußpunkt (passt zur 3/4-Perspektive).
export function footprint(e, x = e.x, y = e.y) {
  const r = e.radius;
  return [x - r, y - r * 0.7, x + r, y + r * 0.4];
}

export function moveAndCollide(e, dx, dy, dungeon) {
  let hitX = false, hitY = false;
  if (dx) {
    const steps = Math.ceil(Math.abs(dx) / 3);
    const sx = dx / steps;
    for (let i = 0; i < steps; i++) {
      const [x0, y0, x1, y1] = footprint(e, e.x + sx, e.y);
      if (dungeon.collidesRect(x0, y0, x1, y1)) { hitX = true; break; }
      e.x += sx;
    }
  }
  if (dy) {
    const steps = Math.ceil(Math.abs(dy) / 3);
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const [x0, y0, x1, y1] = footprint(e, e.x, e.y + sy);
      if (dungeon.collidesRect(x0, y0, x1, y1)) { hitY = true; break; }
      e.y += sy;
    }
  }
  return { hitX, hitY };
}

// Weiche Trennung überlappender Akteure (kein Stapeln von Gegnern).
export function separateActors(actors, dungeon) {
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (a.dead || !a.solid) continue;
    for (let j = i + 1; j < actors.length; j++) {
      const b = actors[j];
      if (b.dead || !b.solid) continue;
      const dx = b.x - a.x, dy = (b.y - a.y) * 1.4;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      const wa = a.mass ?? 1, wb = b.mass ?? 1;
      const ta = wb / (wa + wb), tb = wa / (wa + wb);
      moveAndCollide(a, -nx * push * ta, -ny * push * ta, dungeon);
      moveAndCollide(b, nx * push * tb, ny * push * tb, dungeon);
    }
  }
}
