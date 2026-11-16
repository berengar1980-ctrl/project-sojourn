import type { ShipRole } from '../../core/ship-types';
import type { SectorNpcState } from '../../core/npc-types';
import { getShipDefinition } from '../ships';

/** Exactly the same physical hull permission policy for player and NPCs. */
export function operationalRoleAllowed(role: ShipRole, operation: 'blockade' | 'patrol' | 'mining' | 'salvage'): boolean {
  return role === ({ blockade: 'freighter', patrol: 'patrol', mining: 'mining', salvage: 'salvage' } as const)[operation];
}

/** A worker's job cannot grant equipment missing from its actual hull. */
export function npcOperationalRoleAllowed(npc: SectorNpcState, operation: 'mining' | 'salvage' | 'patrol'): boolean {
  const ship = getShipDefinition(npc.shipId);
  return Boolean(ship && operationalRoleAllowed(ship.role, operation) &&
    npc.job === ({ mining: 'miner', salvage: 'salvager', patrol: 'patrol' } as const)[operation]);
}
