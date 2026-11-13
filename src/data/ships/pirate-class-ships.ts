import type { ShipDefinition } from '../../core/ship-types';
import { freighterVariantShips } from './freighter-variant-ships';
import { minerVariantShips } from './miner-variant-ships';
import { patrolVariantShips } from './patrol-variant-ships';

/**
 * Salvaged and weaponized hulls: real 60/80/120 m sprites and hardpoint geometry.
 * Cosmetic purpose-built pirate artwork can replace these assets independently.
 */
export const pirateClassShips: readonly ShipDefinition[] = [
  {
    ...patrolVariantShips[1]!,
    id: 'pirate-raider-60m',
    name: 'Korsaren-Raider (60 m)',
    cargoCapacityTons: 100,
    navigation: { cruiseSpeed: 238 },
    gameplayOverrides: { hullPoints: 83, shieldModifier: 0.9, maxComponentTier: 2 },
  },
  {
    ...minerVariantShips[2]!,
    id: 'pirate-reaver-80m',
    name: 'Korsaren-Reaver (80 m)',
    role: 'patrol',
    cargoCapacityTons: 145,
    navigation: { cruiseSpeed: 219 },
    gameplayOverrides: { hullPoints: 135, shieldModifier: 1.38, maxComponentTier: 3 },
  },
  {
    ...freighterVariantShips[3]!,
    id: 'pirate-marauder-120m',
    name: 'Korsaren-Marauder (120 m)',
    role: 'patrol',
    cargoCapacityTons: 205,
    navigation: { cruiseSpeed: 190 },
    gameplayOverrides: { hullPoints: 210, shieldModifier: 1.8, maxComponentTier: 4 },
  },
];
