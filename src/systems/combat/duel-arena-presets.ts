import { COMBAT_MAP_WIDTH, COMBAT_MAP_HEIGHT } from '../../core/combat-map-dimensions';
import { generateMiningSpace } from '../local-space/local-space-generator';
import { generateSalvageField } from '../salvage/salvage-field-generator';
import { miningFieldCombatArena, salvageFieldCombatArena } from './field-combat-arena';
import { withClearCombatSpawns } from './combat-field-spawns';
import type { StrategicCombatArenaOptions } from './strategic-combat-types';

export type DuelMapKind =
  'empty' | 'scattered' | 'asteroid_field' | 'scrap_scattered' | 'scrap_field';
export const DUEL_MAPS: readonly { id: DuelMapKind; title: string }[] = [
  { id: 'empty', title: 'Leerer Raum' },
  { id: 'scattered', title: 'Einzelne Asteroiden · klein und groß' },
  { id: 'asteroid_field', title: 'Dichtes Asteroidenfeld' },
  { id: 'scrap_scattered', title: 'Schrottfeld · moderat' },
  { id: 'scrap_field', title: 'Schrottfeld · dicht' },
];

/** Match actual career map geometry. Only the shared generators own density. */
export function createDuelArena(kind: DuelMapKind, seed: number): StrategicCombatArenaOptions {
  if (kind === 'empty') return { width: COMBAT_MAP_WIDTH, height: COMBAT_MAP_HEIGHT, obstacles: [], asteroids: [] };
  if (kind === 'scrap_scattered' || kind === 'scrap_field') {
    const density = kind === 'scrap_scattered' ? 'moderate' : 'standard';
    return withClearCombatSpawns(
      salvageFieldCombatArena(generateSalvageField('duel', seed, 2, density))
    );
  }
  const density = kind === 'scattered' ? 'sparse' : 'standard';
  const field = generateMiningSpace('duel', seed, undefined, density);
  return withClearCombatSpawns(miningFieldCombatArena(field, { x: 0, y: 0 }));
}
