import { FINE_OUTDOOR } from './outdoor.js';
import { FINE_MARSH } from './marsh.js';
import { FINE_STEPPE } from './steppe.js';
import { FINE_WASTES } from './wastes.js';
import { FINE_FROST } from './frost.js';
import { FINE_PEAKS } from './peaks.js';
import { FINE_ASTRAL, FINE_SHARDS } from './astral.js';

// Feinraster-Böden der Außengebiete je Biom (Schlüssel wie level.biome; 'outdoor' = Glutsenke ohne Biom).
// world/Outdoor.js ergänzt damit die Bodenpaletten (auch die der Deko-Sätze): finePixel/fineSetup, siehe ground/kit.js.
// Aschenwald liegt bei sprites/outdoor.js (BIOME_GROUND.ashwood, Probestück).
const ALL = { outdoor: FINE_OUTDOOR, marsh: FINE_MARSH, steppe: FINE_STEPPE, wastes: FINE_WASTES, frost: FINE_FROST, peaks: FINE_PEAKS, astral: FINE_ASTRAL, shards: FINE_SHARDS };
export const FINE_GROUND = Object.fromEntries(Object.entries(ALL).filter(([, v]) => v));
