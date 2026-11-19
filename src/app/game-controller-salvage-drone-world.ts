import type { SalvageField } from '../core/salvage-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { generateSalvageField } from '../systems/salvage';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  createSalvageSecurityDrone,
  tickSalvageSecurityDrone,
} from './game-controller-salvage-drone';

interface SalvagePatrolWorld {
  readonly field: SalvageField;
  readonly drone: AsteroidSecurityDrone;
}

const patrolWorlds = new WeakMap<ControllerRuntimeContext, Map<string, SalvagePatrolWorld>>();
const accumulators = new WeakMap<ControllerRuntimeContext, number>();
const restoredWorlds = new WeakSet<ControllerRuntimeContext>();

function worlds(context: ControllerRuntimeContext): Map<string, SalvagePatrolWorld> {
  let result = patrolWorlds.get(context);
  if (!result) {
    result = new Map();
    patrolWorlds.set(context, result);
  }
  return result;
}

/** The scene and the background campaign tick share one drone authority. */
export function careerSalvageDrone(
  context: ControllerRuntimeContext,
  field: SalvageField
): AsteroidSecurityDrone {
  const active = worlds(context);
  const existing = active.get(field.sourceLocationId);
  if (existing) {
    active.set(field.sourceLocationId, { field, drone: existing.drone });
    return existing.drone;
  }
  const drone = createSalvageSecurityDrone(field, context.economy.wreckClaims);
  active.set(field.sourceLocationId, { field, drone });
  context.economy.wreckClaims.rememberField(field, drone.exportState());
  return drone;
}

/** Restore only previously visited permanent wreck maps, not every possible
 * map at startup. Expired one-off event maps are restored on re-entry.
 */
function restoreKnownPatrols(context: ControllerRuntimeContext): void {
  if (restoredWorlds.has(context)) return;
  restoredWorlds.add(context);
  for (const saved of context.economy.wreckClaims.droneLocations()) {
    if (worlds(context).has(saved.locationId)) continue;
    const location = narrowsSector.locations.find((entry) => entry.id === saved.locationId);
    if (!location?.activities.salvage) continue;
    const field = generateSalvageField(location.id, saved.seed, location.dangerLevel);
    context.economy.wreckClaims.restoreField(field);
    careerSalvageDrone(context, field);
  }
}

/** Offscreen patrols continue at 1Hz without rendering or route-grid work. */
export function advanceCareerSalvageDrones(
  context: ControllerRuntimeContext,
  seconds: number
): void {
  restoreKnownPatrols(context);
  let accumulator = (accumulators.get(context) ?? 0) + Math.max(0, Math.min(0.25, seconds));
  if (accumulator < 1) {
    accumulators.set(context, accumulator);
    return;
  }
  const activeLocation =
    context.state.mode === 'salvage-space'
      ? context.state.salvageScene?.getField().sourceLocationId
      : null;
  const elapsed = Math.min(2, Math.floor(accumulator));
  accumulator -= elapsed;
  accumulators.set(context, accumulator);
  for (const [locationId, world] of worlds(context)) {
    if (locationId === activeLocation) continue;
    // Bounded steps preserve waypoint transitions and keep expensive route
    // recalculations outside the rendering cadence.
    for (let i = 0; i < elapsed * 5; i += 1)
      tickSalvageSecurityDrone(world.drone, world.field, 0.2, []);
    context.economy.wreckClaims.rememberDrone(locationId, world.drone.exportState());
  }
}

/** One traffic authority per wreck location across scene switches. */
export function careerSalvagePirates(
  context: ControllerRuntimeContext,
  field: SalvageField
): LocalPirateTraffic {
  const traffic = context.economy.localPirates.get(field.sourceLocationId);
  if (traffic) return traffic;
  const created = new LocalPirateTraffic(field.width, field.height, field.seed);
  context.economy.localPirates.set(field.sourceLocationId, created);
  return created;
}
