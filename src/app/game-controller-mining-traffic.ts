import type { LocalSpaceInstance } from '../core/local-space-types';
import type { SectorNpcState } from '../core/npc-types';
import type { FieldRouteObstacle } from '../systems/navigation/field-ship-routing';
import { shipTrafficObstacle } from '../systems/navigation/field-traffic-obstacles';
import type { AsteroidFieldRuntime } from '../systems/operations/asteroid-field-world';
import { getShipDefinition } from '../systems/ships';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

const providers = new WeakMap<
  LocalSpaceInstance,
  (excludedId: string) => readonly FieldRouteObstacle[]
>();

export function miningTrafficObstacles(
  instance: LocalSpaceInstance,
  excludedId: string
): readonly FieldRouteObstacle[] {
  return providers.get(instance)?.(excludedId) ?? [];
}

function npcInField(npc: SectorNpcState | undefined, locationId: string): npc is SectorNpcState {
  return Boolean(npc && npc.hullHp > 0 && !npc.travel && npc.locationId === locationId);
}

function collectMiningTraffic(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  excludedId: string
): FieldRouteObstacle[] {
  const npcs = context.economy.sectorNpcs.npcs;
  const byId = new Map(npcs.map((npc) => [npc.id, npc]));
  const result: FieldRouteObstacle[] = [];
  const added = new Set<string>([excludedId]);
  const add = (id: string, pose: Parameters<typeof shipTrafficObstacle>[2]) => {
    if (added.has(id)) return;
    const npc = byId.get(id);
    if (!npcInField(npc, field.locationId)) return;
    const ship = getShipDefinition(npc.shipId);
    if (!ship) return;
    added.add(id);
    result.push(shipTrafficObstacle(id, ship, pose));
  };
  for (const ship of field.miners.ships) add(ship.npcId, ship);
  for (const ship of field.pirates.snapshot(npcs, byId)) add(ship.npcId, ship);
  if (field.drone.snapshot().operational) add('security-drone:' + field.locationId, field.drone);
  const state = context.state;
  if (
    !added.has('player') &&
    state.mode === 'local-space' &&
    state.localSpace?.getSnapshot().instance === field.instance
  ) {
    result.push(shipTrafficObstacle('player', state.activeShip, field.instance.ship));
  }
  return result;
}

/** Bind both newly generated and restored field authorities to live traffic. */
export function bindMiningTraffic(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime
): void {
  providers.set(field.instance, (excludedId) => collectMiningTraffic(context, field, excludedId));
}
