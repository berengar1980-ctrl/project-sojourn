import type { AsteroidFieldRuntime } from '../operations/asteroid-field-world';
import type { FleetCombatService } from './fleet-combat-service';

/**
 * Exclusive field-tick lease for the transition from career to shared FleetCombat.
 * The original field instance remains authoritative. While leased, the normal
 * career field callback must not run for this location: the fleet step already
 * advances the native miner service through its career world bridge.
 */
export interface FleetFieldTickOwnership {
  acquire(field: AsteroidFieldRuntime, fleet: FleetCombatService): void;
  release(field: AsteroidFieldRuntime, fleet: FleetCombatService): void;
  tickIfOwned(field: AsteroidFieldRuntime, seconds: number): boolean;
  owns(field: AsteroidFieldRuntime): boolean;
}

export function createFleetFieldTickOwnership(): FleetFieldTickOwnership {
  const owners = new Map<AsteroidFieldRuntime, FleetCombatService>();
  const ticking = new Set<AsteroidFieldRuntime>();
  return {
    acquire(field, fleet) {
      if (owners.has(field)) throw new Error('FleetCombat field tick is already owned');
      owners.set(field, fleet);
    },
    release(field, fleet) {
      if (owners.get(field) !== fleet) throw new Error('FleetCombat field ownership mismatch');
      if (ticking.has(field)) throw new Error('Cannot release FleetCombat field during tick');
      owners.delete(field);
    },
    tickIfOwned(field, seconds) {
      const fleet = owners.get(field);
      if (!fleet) return false;
      if (ticking.has(field)) throw new Error('Reentrant FleetCombat field tick');
      if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error('Invalid FleetCombat field delta');
      ticking.add(field);
      try {
        fleet.tick(seconds);
      } finally {
        ticking.delete(field);
      }
      return true;
    },
    owns(field) {
      return owners.has(field);
    },
  };
}
