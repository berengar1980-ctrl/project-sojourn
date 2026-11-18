import type { ShipDefinition } from '../../core/ship-types';
import { patrolVariantShips } from './patrol-variant-ships';

/**
 * Every pirate class uses a patrol-hull silhouette and its matching hardpoints.
 * Higher classes are physically enlarged patrol hulls until dedicated pirate art exists.
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
    nominalLengthMeters: 80,
    id: 'pirate-reaver-80m',
    name: 'Korsaren-Reaver (80 m)',
    role: 'patrol',
    cargoCapacityTons: 145,
    navigation: { cruiseSpeed: 219 },
    gameplayOverrides: { hullPoints: 135, shieldModifier: 1.38, maxComponentTier: 3 },
  },
  {
    ...patrolVariantShips[3]!,
    nominalLengthMeters: 120,
    id: 'pirate-marauder-120m',
    name: 'Korsaren-Marauder (120 m)',
    role: 'patrol',
    cargoCapacityTons: 205,
    navigation: { cruiseSpeed: 190 },
    gameplayOverrides: { hullPoints: 210, shieldModifier: 1.8, maxComponentTier: 4 },
  },
];
