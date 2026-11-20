import type { WorldPoint } from '../../core/world-types';
import { isFleetHostile } from './fleet-faction-policy';
import type { FleetCombatShipSnapshot } from './fleet-combat-service';

export interface FleetHostileContact {
  readonly id: string;
  readonly position: WorldPoint;
}

/**
 * Extra targets for the native pirate route planner during a shared fleet
 * encounter. The normal career miner/player selection remains in
 * LocalPirateTraffic. Only currently present native pirates and the field
 * security drone are offered here, including ships already in combat.
 *
 * The faction policy is the SAME one used by FleetCombat's weapon/target
 * authority; this helper does not create a separate engagement rule.
 */
export function fleetCareerHostileContacts(
  pirateId: string,
  factionId: string,
  ships: readonly FleetCombatShipSnapshot[],
  presentPirateIds: ReadonlySet<string>,
  securityDroneId: string | null
): readonly FleetHostileContact[] {
  return ships
    .filter((candidate) => {
      const id = candidate.ship.id;
      if (id === pirateId || candidate.ship.hullHp <= 0) return false;
      if (candidate.factionId === 'pirate-a' || candidate.factionId === 'pirate-b') {
        if (!presentPirateIds.has(id)) return false;
      } else if (candidate.factionId === 'security') {
        if (id !== securityDroneId) return false;
      } else {
        // Native traffic already supplies the active player and miner contacts.
        return false;
      }
      return isFleetHostile(factionId, candidate.factionId);
    })
    .map((candidate) => ({
      id: candidate.ship.id,
      position: { ...candidate.ship.position },
    }));
}
