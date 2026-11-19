import type { ShipDefinition } from '../../core/ship-types';
import { patrolVariantShips } from './patrol-variant-ships';

/**
 * Every pirate class uses a patrol-hull silhouette and its matching hardpoints.
 * Pirate tiers differ in stats, but they retain their source patrol hull's real 60 m scale.
 * Never enlarge a 60 m sprite to 80/120 m just to express difficulty.
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
    ...patrolVariantShips[2]!,
    id: 'pirate-reaver-80m',
    name: 'Korsaren-Reaver (Patrouillenrumpf)',
    role: 'patrol',
    cargoCapacityTons: 145,
    navigation: { cruiseSpeed: 219 },
    gameplayOverrides: { hullPoints: 135, shieldModifier: 1.38, maxComponentTier: 3 },
  },
  {
    ...patrolVariantShips[3]!,
    id: 'pirate-marauder-120m',
    name: 'Korsaren-Marauder (Patrouillenrumpf)',
    role: 'patrol',
    cargoCapacityTons: 205,
    navigation: { cruiseSpeed: 190 },
    gameplayOverrides: { hullPoints: 210, shieldModifier: 1.8, maxComponentTier: 4 },
  },
];
