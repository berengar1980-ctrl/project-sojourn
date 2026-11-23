import type { SectorNpcState } from '../../core/npc-types';
import type { LocalAsteroid } from '../../core/local-space-types';
import type { SalvageField } from '../../core/salvage-types';
import type { FieldRouteObstacle } from '../../systems/navigation/field-ship-routing';
import { createNpcLocalMiningService } from '../../systems/npcs/npc-local-mining-service';
import { createNpcLocalSalvageService } from '../../systems/npcs/npc-local-salvage-service';

/** Existing campaign workers, wired to the very same FleetCombat world and traffic. */
export function createFleetWorldWorkers(
  states: readonly { readonly npc: SectorNpcState }[],
  rocks: LocalAsteroid[],
  salvageField: SalvageField | null,
  seed: number,
  width: number,
  height: number,
  trafficFor: (id: string) => readonly FieldRouteObstacle[]
) {
  const miners = createNpcLocalMiningService({
    locationId: 'duel',
    seed,
    width,
    height,
    resolveLocalCollisions: false,
    getTrafficObstacles: (id) => trafficFor(id),
    miners: states.filter((entry) => entry.npc.job === 'miner').map((entry) => entry.npc),
    getAsteroids: () => rocks,
    mine: (npc, resourceId, requested) => {
      const capacity = Math.max(
        0,
        npc.cargoCapacity - Object.values(npc.cargo).reduce((a, b) => a + b, 0)
      );
      const accepted = Math.min(requested, capacity);
      if (accepted > 0) npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + accepted;
      return accepted;
    },
    depart: (npc) => {
      if (npc.autonomy) npc.autonomy.phase = 'ready';
      return true;
    },
  });
  const salvagers = salvageField
    ? createNpcLocalSalvageService({
        locationId: 'duel',
        field: salvageField,
        resolveLocalCollisions: false,
        getTrafficObstacles: (id) => trafficFor(id),
        salvagers: states.filter((entry) => entry.npc.job === 'salvager').map((entry) => entry.npc),
        recover: (npc, resourceId, requested) => {
          const used = Object.values(npc.cargo).reduce((sum, amount) => sum + amount, 0);
          const accepted = Math.max(0, Math.min(requested, npc.cargoCapacity - used));
          if (accepted > 0) npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + accepted;
          return accepted;
        },
        depart: (npc) => {
          if (npc.autonomy) npc.autonomy.phase = 'ready';
          return true;
        },
      })
    : null;
  return { miners, salvagers };
}
