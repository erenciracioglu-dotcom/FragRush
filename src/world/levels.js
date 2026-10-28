// Harita kaydi: menude secilen harita -> uretici + ortam.
import { generateArena } from './mapgen.js';
import { generateMeadow } from './meadow.js';
import { generateVolcano } from './volcano.js';
import { generateFrozen } from './frozen.js';
import { generateMoon } from './moon.js';

export const LEVELS = {
  arena: { id: 'arena', label: 'mapArena', generate: generateArena },
  meadow: { id: 'meadow', label: 'mapMeadow', generate: generateMeadow },
  volcano: { id: 'volcano', label: 'mapVolcano', generate: generateVolcano },
  frozen: { id: 'frozen', label: 'mapFrozen', generate: generateFrozen },
  moon: { id: 'moon', label: 'mapMoon', generate: generateMoon },
};
export const LEVEL_ORDER = ['meadow', 'volcano', 'frozen', 'moon', 'arena'];

// ayar ('arena' | 'meadow' | 'volcano' | 'frozen' | 'moon' | 'rotate') ve onceki haritaya gore kurulacak harita
export function resolveLevel(setting, previous = null) {
  if (LEVELS[setting]) return setting;
  if (!previous) return LEVEL_ORDER[0];
  return LEVEL_ORDER[(LEVEL_ORDER.indexOf(previous) + 1) % LEVEL_ORDER.length];
}
