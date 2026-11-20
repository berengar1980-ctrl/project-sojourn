import type { SalvageField, SalvageWreck } from '../../core/salvage-types';
import type { AsteroidFieldRuntime } from '../operations/asteroid-field-world';
import { addDestroyedShipWreck } from '../salvage/combat-destruction-wreck';
import type { FleetCombatShipSnapshot } from './fleet-combat-service';

/** Use the original career salvage-wreck factory and authoritative field store.
 * This is an encounter-scoped, once-only adapter, not a second wreck generator.
 */
export function createFleetCareerWreckSettlement(
  field: AsteroidFieldRuntime,
  careerShipIds: ReadonlySet<string>,
  registerWrecks: (wrecks: readonly SalvageWreck[]) => void,
  encounterId: string
): {
  settle(ships: readonly FleetCombatShipSnapshot[], elapsedSeconds: number): readonly SalvageWreck[];
} {
  const finished = new Set<string>();
  const knownIds = new Set(field.combatWrecks.map((wreck) => wreck.id));
  return {
    settle(ships, elapsedSeconds) {
      const salvage: SalvageField = {
        id: 'combat-field-' + field.locationId,
        sourceLocationId: field.locationId,
        seed: field.instance.seed,
        width: field.instance.width,
        height: field.instance.height,
        wrecks: [...field.combatWrecks],
      };
      const created: SalvageWreck[] = [];
      for (const { ship } of ships) {
        if (!careerShipIds.has(ship.id) || ship.hullHp > 0 || finished.has(ship.id)) continue;
        const wreck = addDestroyedShipWreck(salvage, ship, encounterId, elapsedSeconds);
        if (!wreck) continue;
        finished.add(ship.id);
        if (knownIds.has(wreck.id)) continue;
        knownIds.add(wreck.id);
        created.push(wreck);
      }
      if (created.length) registerWrecks(created);
      return created;
    },
  };
}
