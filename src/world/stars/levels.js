import { lazyLevels } from '../levels.js';
import { calmArrivals } from '../levels3.js';
import { buildDriftingGardens } from './gardens.js';
import { buildSternhafen } from './sternhafen.js';
import { buildSplitterweiten } from './splitterweiten.js';
import { buildRankengruft, buildGlassHalls, buildObservatory } from './dungeons.js';

// Karten der Sternenscherben; gebaut erst beim ersten Zugriff (wie LEVELS3)
const RAW = {
  drifting_gardens: buildDriftingGardens,
  sternhafen: buildSternhafen,
  splitterweiten: buildSplitterweiten,
  rankengruft: buildRankengruft,
  glass_halls: buildGlassHalls,
  observatory: buildObservatory,
};
export const LEVELS_STARS = lazyLevels(Object.fromEntries(Object.entries(RAW).map(([id, build]) => [id, () => calmArrivals(id, build(), 12)])));
