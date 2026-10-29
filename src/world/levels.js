// Harita kaydi: menude secilen harita -> uretici + ortam.
import { generateArena } from './mapgen.js';
import { generateMeadow } from './meadow.js';
import { generateVolcano } from './volcano.js';
import { generateFrozen } from './frozen.js';
import { generateMoon } from './moon.js';
import { generateToyroom } from './toyroom.js';

export const LEVELS = {
  arena: { id: 'arena', label: 'mapArena', generate: generateArena },
  meadow: { id: 'meadow', label: 'mapMeadow', generate: generateMeadow },
  volcano: { id: 'volcano', label: 'mapVolcano', generate: generateVolcano },
  frozen: { id: 'frozen', label: 'mapFrozen', generate: generateFrozen },
  moon: { id: 'moon', label: 'mapMoon', generate: generateMoon },
  toyroom: { id: 'toyroom', label: 'mapToyroom', generate: generateToyroom },
};
// SIRAYLA sirasi (varsayilan ayar SIRAYLA: oyun ilk haritayla acilir). Oyuncak odasi once: renkli, okunakli,
// dahili kartta hizli (~100 FPS), ani olum tehlikesi yok. Sonra karsitlik: gece volkani, ay, buz; en agir cayir en sonda.
export const LEVEL_ORDER = ['toyroom', 'volcano', 'moon', 'frozen', 'arena', 'meadow'];

// ayar ('arena' | 'meadow' | 'volcano' | 'frozen' | 'moon' | 'toyroom' | 'rotate') ve onceki haritaya gore kurulacak harita
export function resolveLevel(setting, previous = null) {
  if (LEVELS[setting]) return setting;
  if (!previous) return LEVEL_ORDER[0];
  return LEVEL_ORDER[(LEVEL_ORDER.indexOf(previous) + 1) % LEVEL_ORDER.length];
}
