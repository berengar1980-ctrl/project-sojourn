import type { SalvageField } from '../core/salvage-types';
import { measurePerformance } from '../core/performance-diagnostics';
import { narrowsSector } from '../data/maps/narrows-sector';
import { permanentSalvageField } from './game-controller-salvage-stocks';
import type { AsteroidSecurityDrone } from '../systems/operations/asteroid-security-drone';
import { LocalPirateTraffic } from '../systems/npcs/npc-local-pirate-service';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  createSalvageSecurityDrone,
  salvageDroneBystanders,
} from './game-controller-salvage-drone';
import { advanceSalvagePirateResponse } from './game-controller-salvage-pirates';
import {
  salvageFieldCombatArena,
  syncSalvageCombatField,
} from '../systems/combat/field-combat-arena';
import type { AsteroidFieldWorld } from '../systems/operations/asteroid-field-world';
import {
  advanceSalvageContainerDrift,
  invalidateSalvagePhysics,
  salvageFieldPhysicsBodies,
} from '../systems/salvage/salvage-container-motion';
import { syncFieldTrafficImpulses } from '../systems/combat/field-combat-arena';
import { isSecurityDrone } from '../core/security-drone';
import { createNpcSalvageRuntime } from './game-controller-salvage-npc-runtime';
import type { NpcLocalSalvageService } from '../systems/npcs/npc-local-salvage-service';
import type { WorldPoint } from '../core/world-types';

interface SalvagePatrolWorld {
  readonly field: SalvageField;
  readonly drone: AsteroidSecurityDrone;
  readonly salvagers: NpcLocalSalvageService;
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
  if (existing?.field.seed === field.seed) {
    active.set(field.sourceLocationId, existing);
    return existing.drone;
  }
  const drone = createSalvageSecurityDrone(field, context.economy.wreckClaims);
  const id = 'security-drone:' + field.sourceLocationId;
  const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === id);
  if (!npc?.combatMovement) drone.syncAvailability(npc);
  const location = narrowsSector.locations.find((entry) => entry.id === field.sourceLocationId);
  if (location?.activities.salvage) {
    const salvagers = createNpcSalvageRuntime(
      {
        location,
        sectorNpcs: context.economy.sectorNpcs.npcs,
        npcEconomy: context.economy.npcs,
        economy: context.economy.salvage,
        wreckClaims: context.economy.wreckClaims,
        getCurrentDay: () => context.economy.situations.currentDay,
      },
      field
    );
    active.set(field.sourceLocationId, { field, drone, salvagers });
  }
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
    if (!location.activities.salvage) continue;
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
  seconds: number,
  wreckWorld: AsteroidFieldWorld
): void {
  restoreKnownPatrols(context);
  const dt = Math.max(0, Math.min(0.25, seconds));
  if (!Number.isFinite(dt) || dt <= 0) return;
  const start = accumulators.get(context) ?? 0;
  const end = start + dt;
  accumulators.set(context, end >= 1 ? end - 1 : end);
  const activeLocation =
    context.state.mode === 'salvage-space'
      ? context.state.salvageScene?.getField().sourceLocationId
      : null;
  const fields = worlds(context);
  const advanceWindow = (from: number, to: number) => {
    let index = 0;
    for (const [locationId, world] of fields) {
      const phase = ++index / fields.size;
      if (locationId === activeLocation || phase <= from || phase > to) continue;
      // One-off event maps retain their existing on-entry lifecycle.
      const location = narrowsSector.locations.find((entry) => entry.id === locationId);
      if (!location?.activities.salvage) continue;
      measurePerformance('sim.salvage-world.field', () =>
        advanceSalvageField(context, world, wreckWorld, locationId, 1)
      );
    }
  };
  measurePerformance('sim.salvage-world.background-batch', () => {
    advanceWindow(start, Math.min(end, 1));
    if (end > 1) advanceWindow(0, end - 1);
  });
}

/** The primary drone is already captured by rememberField; only capture its escorts here. */
function rememberSalvageEscorts(context: ControllerRuntimeContext, field: SalvageField): void {
  const { wreckClaims, localPirates, sectorNpcs } = context.economy;
  const traffic = localPirates.get(field.sourceLocationId);
  if (!traffic) return;
  const saved = traffic.exportState();
  if (saved.seed !== field.seed) return;
  const active = new Set(
    sectorNpcs.npcs
      .filter(
        (npc) =>
          isSecurityDrone(npc.id) &&
          npc.locationId === field.sourceLocationId &&
          npc.hullHp > 0 &&
          !npc.travel &&
          (npc.combatRecoverySeconds ?? 0) <= 0
      )
      .map((npc) => npc.id)
  );
  wreckClaims.rememberSecurityEscorts(field.sourceLocationId, {
    ...saved,
    ships: saved.ships.filter(
      (ship) =>
        active.has(ship.npcId) &&
        ship.npcId === 'security-drone:' + field.sourceLocationId + ':escort-2'
    ),
    combatReturns: [],
  });
}

/** Capture the live patrols immediately, not just the last background tick. */
export function captureSalvageSecurity(context: ControllerRuntimeContext): void {
  for (const world of worlds(context).values()) {
    context.economy.wreckClaims.rememberField(world.field, world.drone.exportState());
    context.economy.wreckClaims.rememberWorkers(world.field, world.salvagers.ships);
    rememberSalvageEscorts(context, world.field);
  }
}

/** One traffic authority per wreck location across scene switches. */
export function careerSalvagePirates(
  context: ControllerRuntimeContext,
  field: SalvageField
): LocalPirateTraffic {
  const traffic = context.economy.localPirates.get(field.sourceLocationId);
  if (traffic?.matchesField(field.width, field.height, field.seed)) return traffic;
  const saved = context.economy.wreckClaims.securityEscortCheckpoint(field.sourceLocationId);
  const npcs = context.economy.sectorNpcs.npcs;
  const valid =
    saved &&
    saved.seed === field.seed &&
    saved.width === field.width &&
    saved.height === field.height;
  const created = valid
    ? LocalPirateTraffic.fromCheckpoint(field.width, field.height, field.seed, npcs, {
        ...saved,
        ships: saved.ships.filter((ship) =>
          npcs.some(
            (npc) =>
              npc.id === ship.npcId &&
              npc.locationId === field.sourceLocationId &&
              npc.hullHp > 0 &&
              !npc.travel &&
              (npc.combatRecoverySeconds ?? 0) <= 0
          )
        ),
      })
    : new LocalPirateTraffic(field.width, field.height, field.seed);
  context.economy.localPirates.set(field.sourceLocationId, created);
  return created;
}

function advanceSalvageField(
  context: ControllerRuntimeContext,
  world: SalvagePatrolWorld,
  wreckWorld: AsteroidFieldWorld,
  locationId: string,
  elapsed: number
): void {
  const combatWrecks = wreckWorld.combatWrecks(locationId);
  if (combatWrecks.length) {
    const known = new Set(world.field.wrecks.map((wreck) => wreck.id));
    for (const wreck of combatWrecks) {
      if (known.has(wreck.id)) continue;
      world.field.wrecks.push(wreck);
      invalidateSalvagePhysics(world.field);
    }
  }
  const traffic = careerSalvagePirates(context, world.field);
  const npcs = context.economy.sectorNpcs.npcs;
  const duels = (context.engagements.activeNpcCombatSnapshots?.() ?? []).filter(
    (duel) => duel.arena.backdropSeed === world.field.seed
  );
  const fieldCombat = context.engagements.fieldCombat?.(locationId, world.field.seed);
  if (fieldCombat) syncSalvageCombatField(world.field, fieldCombat);
  const engage = backgroundEngagement(context, world, traffic, locationId);
  for (let i = 0; i < elapsed * 5; i += 1) {
    measurePerformance('sim.salvage-world.traffic', () =>
      advanceSalvagePirateResponse({
        field: world.field,
        drone: world.drone,
        pirates: traffic,
        sectorNpcs: npcs,
        salvagers: world.salvagers.ships,
        playerPosition: null,
        playerRadius: 0,
        dt: 0.2,
        playerCombat: null,
        npcCombats: duels,
        onPirateAttack: engage,
        onDroneAttack: (pirateId, position) =>
          engage(pirateId, 'security-drone:' + locationId, position, world.drone.position),
        onFreighterExit: (npc) => {
          if (npc.homePortId)
            context.economy.sectorNpcs.requestTravel(
              npc,
              npc.homePortId,
              'Rückflug zum Heimathafen'
            );
        },
      })
    );
    // The local worker caps each integration step at 80 ms.
    for (let step = 0; step < 4; step++) {
      measurePerformance('sim.salvage-world.workers', () =>
        world.salvagers.tick(0.05, undefined, true)
      );
      const combatOwnsPhysics =
        context.engagements.hasFieldCombat?.(locationId, world.field.seed) ??
        Boolean(context.engagements.fieldCombat?.(locationId, world.field.seed));
      if (!combatOwnsPhysics)
        measurePerformance('sim.salvage-world.drift', () =>
          advanceSalvageContainerDrift(world.field, 0.05)
        );
    }
  }
  const currentCombat = context.engagements.fieldCombat?.(
    locationId,
    world.field.seed,
    salvageDroneBystanders(
      null,
      world.salvagers.ships,
      world.drone,
      locationId,
      traffic.snapshot(npcs)
    )
  );
  if (currentCombat)
    syncFieldTrafficImpulses(salvageFieldPhysicsBodies(world.field), currentCombat.arena);
  measurePerformance('sim.salvage-world.checkpoint', () => {
    wreckWorld.reconcileCombatWrecks(locationId, world.field.wrecks);
    context.economy.wreckClaims.rememberField(world.field, world.drone.exportState());
    context.economy.wreckClaims.rememberWorkers(world.field, world.salvagers.ships);
    rememberSalvageEscorts(context, world.field);
  });
}

function backgroundEngagement(
  context: ControllerRuntimeContext,
  world: SalvagePatrolWorld,
  traffic: LocalPirateTraffic,
  locationId: string
) {
  return (attackerId: string, defenderId: string, attacker: WorldPoint, defender: WorldPoint) => {
    const pose = (id: string) =>
      id === 'security-drone:' + locationId
        ? world.drone
        : (traffic.body(id) ?? world.salvagers.ships.find((ship) => ship.npcId === id));
    const first = pose(attackerId);
    const second = pose(defenderId);
    return context.engagements.engageNpcsInArena(attackerId, defenderId, {
      ...salvageFieldCombatArena(world.field),
      attackerPosition: { ...attacker },
      defenderPosition: { ...defender },
      ...(first && {
        attackerHeadingRadians: first.headingRadians,
        attackerVelocity: {
          x: Math.cos(first.headingRadians) * first.speed,
          y: Math.sin(first.headingRadians) * first.speed,
        },
      }),
      ...(second && {
        defenderHeadingRadians: second.headingRadians,
        defenderVelocity: {
          x: Math.cos(second.headingRadians) * second.speed,
          y: Math.sin(second.headingRadians) * second.speed,
        },
      }),
    });
  };
}
