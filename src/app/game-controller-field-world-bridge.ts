import { recoverNpcEventField } from './game-controller-npc-event-stocks';
import {
  balancePermanentSalvageStocks,
  permanentSalvageField,
  recoverBackgroundSalvage,
} from './game-controller-salvage-stocks';
import { balanceAsteroidStocks } from './game-controller-asteroid-stocks';
import { invalidateSalvagePhysics } from '../systems/salvage/salvage-container-motion';
import { measurePerformance } from '../core/performance-diagnostics';
import type { LocalSpaceInstance } from '../core/local-space-types';
import type { SectorNpcState } from '../core/npc-types';
import { localFieldDuels } from '../systems/combat/dynamic-fleet-combat';
import {
  syncMiningCombatField,
  syncFieldTrafficImpulses,
} from '../systems/combat/field-combat-arena';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createNpcLocalMiningService } from '../systems/npcs/npc-local-mining-service';
import {
  AsteroidFieldWorld,
  type AsteroidFieldRuntime,
} from '../systems/operations/asteroid-field-world';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import {
  registerNpcAsteroidClaim,
  recordNpcAsteroidTheft,
} from './game-controller-field-miner-events';
import { tickFieldPirates, tickFieldSecurity } from './game-controller-security';
import type {
  CombatVisualAsteroid,
  StrategicCombatSnapshot,
} from '../systems/combat/strategic-combat-types';

import type { FieldWitness } from '../systems/combat/career-fleet-encounter';
import { droneSeesTarget } from '../systems/operations/asteroid-security-drone';
import { salvageDroneObstacleAsteroids, salvageDroneCanSee } from './game-controller-salvage-drone';
import { careerSalvageDrone } from './game-controller-salvage-drone-world';

function escortWitness(
  context: ControllerRuntimeContext,
  locationId: string,
  id: string,
  target: Parameters<FieldWitness>[2]
) {
  const salvage = context.state.salvageScene?.getField();
  const field = fieldWorldFor(context).field(locationId);
  const body = context.economy.localPirates.get(locationId)?.body(id);
  const rocks =
    salvage?.sourceLocationId === locationId
      ? salvageDroneObstacleAsteroids(salvage)
      : field?.instance.asteroids;
  return body && rocks && droneSeesTarget(body.position, target, rocks) ? body : null;
}
export function fieldWitnessFor(
  context: ControllerRuntimeContext | null,
  ...[locationId, npc, target]: Parameters<FieldWitness>
): ReturnType<FieldWitness> {
  if (!context || npc.locationId !== locationId || npc.travel) return null;
  const salvage = context.state.salvageScene?.getField();
  const field = fieldWorldFor(context).field(locationId);
  if (npc.id.startsWith('security-drone:')) {
    if (npc.id !== 'security-drone:' + locationId) {
      return escortWitness(context, locationId, npc.id, target);
    }
    if (salvage?.sourceLocationId === locationId) {
      const drone = careerSalvageDrone(context, salvage);
      return salvageDroneCanSee(drone, salvage, target) ? drone : null;
    }
    return field?.drone.detect(target, field.instance.asteroids) ? field.drone : null;
  }
  return context.economy.localPirates.get(locationId)?.body(npc.id) ?? null;
}

const fieldWorlds = new WeakMap<ControllerRuntimeContext, AsteroidFieldWorld>();
const lastAsteroidBalanceDay = new WeakMap<ControllerRuntimeContext, number>();

function balanceDailyAsteroids(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld,
  localId: string | null
): void {
  const simulation = context.economy.simulation;
  const day = simulation.currentDay;
  const previous = lastAsteroidBalanceDay.get(context);
  if (previous !== undefined && day <= previous) return;
  lastAsteroidBalanceDay.set(context, day);
  balanceDailySalvage(context, day);
  releaseExpiredEventStocks(context);
  fields.forEachField((field) => {
    const activeTargets = new Set(field.miners.ships.map((ship) => ship.targetAsteroidId));
    balanceAsteroidStocks(simulation, field.instance, (id) => {
      if (field.locationId === localId || activeTargets.has(id)) return false;
      const asteroid = field.instance.asteroids.find((entry) => entry.id === id);
      return !!asteroid && !context.economy.asteroidClaims.claim(field.locationId, asteroid);
    });
  });
}

function releaseExpiredEventStocks(context: ControllerRuntimeContext): void {
  const { simulation, salvageEvents } = context.economy;
  const active = new Set(salvageEvents.active.map((event) => event.id));
  const expired = new Set<string>();
  for (const pool of Object.values(simulation.pools)) {
    for (const sourceId of Object.keys(pool.physicalStocks ?? {})) {
      if (!sourceId.startsWith('["sector-event-field-')) continue;
      const [fieldId] = JSON.parse(sourceId) as [string, string];
      const eventId = fieldId.slice('sector-event-field-'.length);
      if (!active.has(eventId)) expired.add(sourceId);
    }
  }
  for (const sourceId of expired) simulation.releasePhysicalStock(sourceId);
}

function balanceDailySalvage(context: ControllerRuntimeContext, day: number): void {
  const { simulation, wreckClaims } = context.economy;
  const mounted = context.state.salvageScene?.getField();
  for (const location of narrowsSector.locations) {
    if (!location.activities.salvage) continue;
    if (mounted?.sourceLocationId === location.id) {
      balancePermanentSalvageStocks(simulation, mounted, () => false);
      continue;
    }
    const field = permanentSalvageField(context, location);
    balancePermanentSalvageStocks(simulation, field, (id) => !wreckClaims.claim(field.id, id, day));
    wreckClaims.rememberField(field);
  }
}

function installPermanentSalvageEconomy(context: ControllerRuntimeContext): void {
  const { wreckClaims, npcs, npcSalvageEvents } = context.economy;
  npcSalvageEvents.setPhysicalEventRecovery?.((npc, event) =>
    recoverNpcEventField(context, npc, event)
  );
  const locations = narrowsSector.locations.filter((location) => location.activities.salvage);
  for (const location of locations) {
    wreckClaims.rememberField(permanentSalvageField(context, location));
  }
  npcs.setPhysicalSalvageWorker((npc, day) => {
    const location = locations.find((entry) => entry.id === npc.locationId);
    if (!location) return;
    const mounted = context.state.salvageScene?.getField();
    if (context.state.mode === 'salvage-space' && mounted?.sourceLocationId === location.id) return;
    const field = permanentSalvageField(context, location);
    recoverBackgroundSalvage(context, npc, field, day);
  });
}

function registerInitialAsteroidStocks(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld
): void {
  fields.forEachField((field) => {
    const pending = new Map<string, number>();
    for (const chunk of field.instance.chunks) {
      const key = JSON.stringify([chunk.sourceAsteroidId, chunk.resourceId]);
      pending.set(key, (pending.get(key) ?? 0) + chunk.amount);
    }
    for (const asteroid of field.instance.asteroids) {
      const sourceId = JSON.stringify([field.locationId, asteroid.id]);
      for (const deposit of asteroid.deposits) {
        const key = JSON.stringify([asteroid.id, deposit.resourceId]);
        context.economy.simulation.registerInitialPhysicalStock(
          deposit.resourceId,
          sourceId,
          deposit.oreRemaining + (pending.get(key) ?? 0)
        );
      }
    }
  });
}

/** Install the already staged field authority instead of generating new ore/NPCs. */
export function bindCareerFieldWorld(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld
): void {
  if (fieldWorlds.has(context)) throw new Error('Field world already installed');
  installPermanentSalvageEconomy(context);
  registerInitialAsteroidStocks(context, fields);
  lastAsteroidBalanceDay.set(context, context.economy.simulation.currentDay);
  fieldWorlds.set(context, fields);
  for (const location of narrowsSector.locations) {
    const field = fields.field(location.id);
    if (!field) continue;
    context.economy.securityDrones.set(location.id, field.drone);
    context.economy.localPirates.set(location.id, field.pirates);
  }
}

/** Create once per campaign; world state lives independently of mounted scenes. */
export function fieldWorldFor(
  context: ControllerRuntimeContext,
  initial?: AsteroidFieldRuntime['instance'],
  exerciseLocationId?: string
): AsteroidFieldWorld {
  const previous = fieldWorlds.get(context);
  if (previous) return previous;
  const { economy, state } = context;
  const fields = new AsteroidFieldWorld(
    exerciseLocationId
      ? narrowsSector.locations.filter((location) => location.id === exerciseLocationId)
      : narrowsSector.locations,
    economy.asteroidClaims,
    (location, instance) =>
      createNpcLocalMiningService({
        locationId: location.id,
        seed: instance.seed,
        width: instance.width,
        height: instance.height,
        get miners() {
          return economy.sectorNpcs.npcs.filter(
            (npc) => npc.job === 'miner' && npc.workLocationId === location.id
          );
        },
        getAsteroids: () => instance.asteroids,
        initialPosition: (id) => context.fieldExerciseSpawns?.get(id),
        mine: (npc, resourceId, requested, asteroidId) =>
          economy.npcs.mineLocal(
            npc,
            resourceId,
            requested,
            asteroidId ? JSON.stringify([location.id, asteroidId]) : undefined
          ),
        onAsteroidScanned: (npc, asteroid) =>
          registerNpcAsteroidClaim(context, location, npc, asteroid),
        onAsteroidMined: (npc, asteroid, resourceId, amount) =>
          recordNpcAsteroidTheft(context, location, npc, asteroid, resourceId, amount),
        depart: (npc) => economy.npcs.dispatchLoadedWorker(npc),
        getPlayerShip: () => state.activeShip,
        getPlayerShipState: () => {
          // The duel owns the player pose and collisions during embedded combat.
          if (state.embeddedCombat === 'local-space') return undefined;
          const scene = state.localSpace?.getSnapshot().instance;
          return scene?.sourceLocationId === location.id ? scene.ship : undefined;
        },
      }),
    undefined,
    undefined,
    initial
  );
  if (!exerciseLocationId) installPermanentSalvageEconomy(context);
  registerInitialAsteroidStocks(context, fields);
  lastAsteroidBalanceDay.set(context, context.economy.simulation.currentDay);
  fieldWorlds.set(context, fields);
  for (const location of narrowsSector.locations) {
    const field = fields.field(location.id);
    if (!field) continue;
    economy.securityDrones.set(location.id, field.drone);
    const npc = economy.sectorNpcs.npcs.find(
      (entry) => entry.id === 'security-drone:' + location.id
    );
    field.drone.syncAvailability(npc);
    economy.localPirates.set(location.id, field.pirates);
  }
  return fields;
}

/** NPC versus NPC duels have one PvP movement authority; mirror those poses
 * into the local world so civilians never freeze at the combat start point.
 */
function syncNpcDuelFieldPoses(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  duels: readonly StrategicCombatSnapshot[]
): void {
  for (const duel of duels) {
    for (const combatant of [duel.attacker, duel.defender]) {
      const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === combatant.id);
      if (npc?.locationId !== field.locationId) continue;
      if (combatant.hullHp <= 0 && npc.hullHp > 0) continue;
      field.miners.syncCombatPose(
        combatant.id,
        combatant.position,
        combatant.headingRadians,
        combatant.speed
      );
      field.pirates.syncCombatPose(
        combatant.id,
        combatant.position,
        combatant.headingRadians,
        combatant.speed
      );
      if (combatant.id === 'security-drone:' + field.locationId) {
        field.drone.syncCombatPose(
          combatant.position,
          combatant.headingRadians,
          combatant.speed,
          combatant.hullHp > 0
        );
      }
    }
  }
}

function syncCombatWreckPoses(
  field: AsteroidFieldRuntime,
  bodies: ReadonlyMap<string, CombatVisualAsteroid>
): void {
  for (const wreck of field.combatWrecks) {
    const body = bodies.get(wreck.id);
    if (!body) continue;
    wreck.position = { ...body.position };
    wreck.driftVelocity = { ...body.velocity };
    wreck.rotation = body.rotation;
    if (body.rotation3d) wreck.rotation3d = { ...body.rotation3d };
  }
}

function setFieldBystanders(
  context: ControllerRuntimeContext,
  field: AsteroidFieldRuntime,
  playerShip?: LocalSpaceInstance['ship']
): void {
  const bystanders = [
    ...(playerShip
      ? [
          {
            id: 'player',
            shipId: context.state.activeShip.id,
            position: playerShip.position,
            headingRadians: playerShip.headingRadians,
          },
        ]
      : []),
    ...field.miners.ships.map((ship) => ({
      id: ship.npcId,
      shipId: ship.shipId,
      position: { ...ship.position },
      headingRadians: ship.headingRadians,
    })),
    ...field.pirates.snapshot(context.economy.sectorNpcs.npcs).map((ship) => ({
      id: ship.npcId,
      shipId: ship.shipId,
      position: ship.position,
      headingRadians: ship.headingRadians,
    })),
    ...context.economy.sectorNpcs.npcs
      .filter((npc) => npc.id === 'security-drone:' + field.locationId)
      .filter((npc) => npc.hullHp > 0 && field.drone.snapshot().operational)
      .map((npc) => ({
        id: npc.id,
        shipId: npc.shipId,
        position: field.drone.snapshot().position,
        headingRadians: field.drone.headingRadians,
      })),
  ];
  context.engagements.fieldCombat?.(field.locationId, field.instance.seed, bystanders);
}

function syncFinishedFieldPoses(
  context: ControllerRuntimeContext,
  fieldWorld: AsteroidFieldWorld,
  finished: readonly StrategicCombatSnapshot[]
): void {
  if (finished.length === 0) return;
  fieldWorld.forEachField((field) => {
    const duels = finished.filter((duel) => duel.arena.backdropSeed === field.instance.seed);
    syncNpcDuelFieldPoses(context, field, duels);
  });
}

/** All field operations advance on the campaign clock, not only during local rendering. */
export function advanceControllerFieldWorld(
  context: ControllerRuntimeContext,
  deltaSeconds: number
): void {
  const scene = context.state.localSpace?.getSnapshot();
  const localId =
    context.state.mode === 'local-space' ? (scene?.instance.sourceLocationId ?? null) : null;
  const combat =
    context.state.embeddedCombat === 'local-space'
      ? (context.engagements.activePlayerCombat()?.getSnapshot() ?? null)
      : null;
  const background = context.engagements.activeNpcCombatSnapshots?.() ?? [];
  const fleet = combat ? context.engagements.activePlayerFleet?.()?.getSnapshot() : null;
  const finished = context.engagements.finishedFieldCombatSnapshots();
  const localDuels = localFieldDuels(background, fleet);
  const fieldWorld = fieldWorldFor(context);
  syncFinishedFieldPoses(context, fieldWorld, finished);
  balanceDailyAsteroids(context, fieldWorld, localId);
  fieldWorld.advanceCombatWreckLifetime(deltaSeconds, (locationId, ids) => {
    for (const id of ids) context.economy.simulation.releasePhysicalStock(id);
    context.engagements.removeFieldCombatWrecks(ids);
    const sceneField = context.state.salvageScene?.getField();
    const fields = new Set([sceneField, ...context.state.salvageEventFields.values()]);
    for (const field of fields) {
      if (field?.sourceLocationId !== locationId) continue;
      for (let i = field.wrecks.length - 1; i >= 0; i--) {
        if (ids.has(field.wrecks[i]!.id)) field.wrecks.splice(i, 1);
      }
      invalidateSalvagePhysics(field);
    }
  });
  const combatLocations = new Set<string>();
  for (const duel of background) {
    if (duel.arena.backdropSeed === undefined) continue;
    const npc = context.economy.sectorNpcs.npcs.find((entry) => entry.id === duel.attacker.id);
    if (npc) combatLocations.add(npc.locationId);
  }
  fieldWorld.tick(deltaSeconds, localId, (field, seconds) => {
    const activeCombat = field.locationId === localId ? combat : null;
    const fieldCombat =
      activeCombat ?? context.engagements.fieldCombat?.(field.locationId, field.instance.seed);
    if (fieldCombat) {
      combatLocations.add(field.locationId);
      const bodies = new Map((fieldCombat.arena.asteroids ?? []).map((body) => [body.id, body]));
      syncMiningCombatField(field.instance.asteroids, bodies);
      syncCombatWreckPoses(field, bodies);
    }
    if (activeCombat) {
      context.state.localSpace?.syncCombatPose(
        activeCombat.attacker.position,
        activeCombat.attacker.headingRadians,
        activeCombat.attacker.speed
      );
    }
    const duels = (activeCombat ? localDuels : background).filter(
      (duel) => duel.arena.backdropSeed === field.instance.seed
    );
    if (activeCombat && !fleet) duels.push(activeCombat);
    const finishedHere = finished.filter((duel) => duel.arena.backdropSeed === field.instance.seed);
    const poseDuels = [...finishedHere, ...duels];
    syncNpcDuelFieldPoses(context, field, duels);
    const defenderId = activeCombat?.defender.id;
    measurePerformance('sim.field.miners', () => field.miners.tick(seconds, defenderId));
    measurePerformance('sim.field.pirates', () =>
      tickFieldPirates(context, seconds, field, defenderId)
    );
    // The combat engine owns drone motion while it is fighting.
    // A second patrol tick would jump its sprite away from the hitbox.
    const droneId = 'security-drone:' + field.locationId;
    const droneFightingNpc = poseDuels.some((duel) =>
      [duel.attacker, duel.defender].some((ship) => ship.id === droneId && ship.hullHp > 0)
    );
    if (activeCombat?.defender.id !== droneId && !droneFightingNpc) {
      measurePerformance('sim.field.security', () => tickFieldSecurity(context, seconds, field));
    }
    if (fieldCombat) {
      syncFieldTrafficImpulses(field.instance.asteroids, fieldCombat.arena);
      setFieldBystanders(
        context,
        field,
        !activeCombat && field.locationId === localId ? scene?.instance.ship : undefined
      );
    }
  });
  const salvageLocation =
    context.state.mode === 'salvage-space'
      ? context.state.salvageScene?.getField().sourceLocationId
      : null;
  fieldWorld.advanceCombatWreckMotion(
    deltaSeconds,
    context.state.embeddedCombat === 'local-space' ? localId : salvageLocation,
    combatLocations
  );
}

function activeFieldContact(context: ControllerRuntimeContext | null, npc: SectorNpcState) {
  if (!context || npc.travel) return false;
  if (npc.id === 'security-drone:' + npc.locationId) return true;
  if (context.state.mode !== 'local-space' && context.state.mode !== 'salvage-space') return false;
  return npc.locationId === context.navigation.getSnapshot().currentLocationId;
}

export function fieldEngagementHooks(get: () => ControllerRuntimeContext | null) {
  return {
    fieldOwnsContact: (npc: SectorNpcState) => activeFieldContact(get(), npc),
    fieldWitness: (...args: Parameters<FieldWitness>) => fieldWitnessFor(get(), ...args),
  };
}
