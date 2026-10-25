// Harita kaydi: menude secilen harita -> uretici + ortam.
import { generateArena } from './mapgen.js';
import { generateMeadow } from './meadow.js';

export const LEVELS = {
  arena: { id: 'arena', label: 'mapArena', generate: generateArena },
  meadow: { id: 'meadow', label: 'mapMeadow', generate: generateMeadow },
};
export const LEVEL_ORDER = ['meadow', 'arena'];

// ayar ('arena' | 'meadow' | 'rotate') ve onceki haritaya gore kurulacak harita
export function resolveLevel(setting, previous = null) {
  if (LEVELS[setting]) return setting;
  if (!previous) return LEVEL_ORDER[0];
  return LEVEL_ORDER[(LEVEL_ORDER.indexOf(previous) + 1) % LEVEL_ORDER.length];
}
