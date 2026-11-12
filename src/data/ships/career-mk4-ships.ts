import type { ShipDefinition } from '../../core/ship-types';
import { freighterVariantShips } from './freighter-variant-ships';
import { minerVariantShips } from './miner-variant-ships';
import { salvageVariantShips } from './salvage-variant-ships';
import { getShipRoleProfile } from './ship-role-profiles';

/**
 * Real Mk IV hulls, initially using the respective career's existing silhouette.
 * The world renderer scales sprites by nominal length; all existing hardpoint
 * coordinates remain relative to their source sprite. Distinct artwork may follow.
 */
function careerHull(base: ShipDefinition, length: number, capacity: number): ShipDefinition {
  const original = getShipRoleProfile(base.role);
  return {
    ...base,
    id: base.id.replace(/-variant-\d+$/, '-mk4'),
    name: base.role.toUpperCase() + ' Mk IV',
    nominalLengthMeters: length,
    cargoCapacityTons: capacity,
    navigation: { cruiseSpeed: Math.round(base.navigation.cruiseSpeed * 1.06) },
    gameplayOverrides: {
      ...base.gameplayOverrides,
      hullPoints: Math.round(original.hullPoints * 1.4),
      maxComponentTier: Math.max(4, original.maxComponentTier),
      fuelCapacity: Math.round(original.fuelCapacity * 1.3),
      fuelUse: original.fuelUse * 1.08,
    },
  };
}

export const careerMk4Ships: readonly ShipDefinition[] = [
  careerHull(freighterVariantShips[0]!, 160, 1350),
  careerHull(minerVariantShips[0]!, 110, 620),
  careerHull(salvageVariantShips[0]!, 135, 820),
];
