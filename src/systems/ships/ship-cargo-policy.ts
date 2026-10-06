import type { EconomyResourceId } from '../../core/economy-types';
import type { ShipDefinition } from '../../core/ship-types';
import { economyResourceById } from '../../data/economy/economy-resources';
import { resolveShipGameplayStats } from './ship-stats';

export function canShipCarryResource(ship: ShipDefinition, resourceId: EconomyResourceId): boolean {
  const specialization = resolveShipGameplayStats(ship).specialCargo;
  if (specialization?.kind !== 'mining') return true;
  return economyResourceById(resourceId)?.categoryId === 'raw';
}
