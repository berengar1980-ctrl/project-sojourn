import type { LocalSpaceInstance } from '../core/local-space-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { fieldTrafficObstacles } from '../systems/navigation/field-traffic-obstacles';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import {
  bindLiveFieldShips,
  collectLiveFieldShips,
  visitArmedFieldTraffic,
} from './game-controller-field-traffic';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export function miningTrafficObstacles(
  instance: LocalSpaceInstance,
  excludedId: string
): readonly FieldRouteObstacle[] {
  return fieldTrafficObstacles(instance, excludedId);
}

function collectMiningTraffic(context: ControllerRuntimeContext, field: AsteroidFieldRuntime) {
  const sector = context.economy.sectorNpcs;
  const byId = sector.indexById?.() ?? new Map(sector.npcs.map((npc) => [npc.id, npc]));
  const state = context.state;
  const player =
    state.mode === 'local-space' && state.localSpace?.getSnapshot().instance === field.instance
      ? {
          ship: state.activeShip,
          pose: field.instance.ship,
          fixed: Boolean(context.engagements?.activePlayerCombat?.()),
        }
      : undefined;
  return collectLiveFieldShips(
    field.locationId,
    byId,
    (add) => {
      for (const ship of field.miners.ships) add(ship.npcId, ship);
      visitArmedFieldTraffic(field.locationId, field.pirates, field.drone, add);
    },
    player,
    field.instance
  );
}

/** Bind both newly generated and restored field authorities to live traffic. */
export function bindMiningTraffic(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime
): void {
  bindLiveFieldShips(field.instance, () => collectMiningTraffic(context, field));
}
