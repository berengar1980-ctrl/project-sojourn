import type { SalvageField } from '../core/salvage-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { permanentSalvageField } from './game-controller-salvage-stocks';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { createSalvageSecurityDrone, salvageDroneBystanders } from './game-controller-salvage-drone';
import { advanceSalvagePirateResponse } from './game-controller-salvage-pirates';
import { salvageFieldCombatArena, syncSalvageCombatField } from '../systems/combat/field-combat-arena';
import type { WorldPoint } from '../core/world-types';

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
  const id = 'security-drone:' + field.sourceLocationId;
  const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === id);
  if (!npc?.combatMovement) drone.syncAvailability(npc);
  active.set(field.sourceLocationId, { field, drone });
  context.economy.wreckClaims.rememberField(field, drone.exportState());
  return drone;
}

/** Restore known patrol poses and initialize all protected permanent salvage fields. */
function restoreKnownPatrols(context: ControllerRuntimeContext): void {
  if (restoredWorlds.has(context)) return;
  restoredWorlds.add(context);
  for (const saved of context.economy.wreckClaims.droneLocations()) {
    if (worlds(context).has(saved.locationId)) continue;
    const location = narrowsSector.locations.find((entry) => entry.id === saved.locationId);
    if (!location?.activities.salvage) continue;
    const field = permanentSalvageField(context, location, saved.seed);
    careerSalvageDrone(context, field);
  }
  // Permanent salvage security exists before the player visits a field.
  for (const location of narrowsSector.locations) {
    if (!location.activities.salvage || location.dangerLevel >= 3) continue;
    if (worlds(context).has(location.id)) continue;
    careerSalvageDrone(context, permanentSalvageField(context, location));
  }
}

export function backgroundSalvagePatrol(
  context: ControllerRuntimeContext,
  locationId: string
): SalvagePatrolWorld | undefined {
  return worlds(context).get(locationId);
}

/** Offscreen security uses the same traffic, sensors, and combat arena as the mounted scene. */
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
    // One-off event maps retain their existing on-entry lifecycle.
    const location = narrowsSector.locations.find((entry) => entry.id === locationId);
    if (!location?.activities.salvage) continue;
    const traffic = careerSalvagePirates(context, world.field);
    const npcs = context.economy.sectorNpcs.npcs;
    const duels = (context.engagements.activeNpcCombatSnapshots?.() ?? []).filter(
      (duel) => duel.arena.backdropSeed === world.field.seed
    );
    const fieldCombat = context.engagements.fieldCombat?.(locationId, world.field.seed);
    if (fieldCombat) syncSalvageCombatField(world.field, fieldCombat);
    const engage = (attackerId: string, defenderId: string, attacker: WorldPoint, defender: WorldPoint) => {
      const pose = (id: string) => id === 'security-drone:' + locationId ? world.drone : traffic.body(id);
      const first = pose(attackerId);
      const second = pose(defenderId);
      return context.engagements.engageNpcsInArena(attackerId, defenderId, {
        ...salvageFieldCombatArena(world.field),
        attackerPosition: { ...attacker },
        defenderPosition: { ...defender },
        ...(first && {
          attackerHeadingRadians: first.headingRadians,
          attackerVelocity: { x: Math.cos(first.headingRadians) * first.speed, y: Math.sin(first.headingRadians) * first.speed },
        }),
        ...(second && {
          defenderHeadingRadians: second.headingRadians,
          defenderVelocity: { x: Math.cos(second.headingRadians) * second.speed, y: Math.sin(second.headingRadians) * second.speed },
        }),
      });
    };
    for (let i = 0; i < elapsed * 5; i += 1) {
      advanceSalvagePirateResponse({
        field: world.field,
        drone: world.drone,
        pirates: traffic,
        sectorNpcs: npcs,
        // The existing offscreen economic salvage worker owns resource extraction.
        salvagers: [],
        playerPosition: null,
        playerRadius: 0,
        dt: 0.2,
        playerCombat: null,
        npcCombats: duels,
        onPirateAttack: engage,
        onDroneAttack: (pirateId, position) =>
          engage(pirateId, 'security-drone:' + locationId, position, world.drone.position),
        onFreighterExit: (npc) => {
          if (npc.homePortId) context.economy.sectorNpcs.requestTravel(npc, npc.homePortId, 'Rückflug zum Heimathafen');
        },
      });
    }
    context.engagements.fieldCombat?.(
      locationId, world.field.seed,
      salvageDroneBystanders(null, [], world.drone, locationId, traffic.snapshot(npcs))
    );
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
