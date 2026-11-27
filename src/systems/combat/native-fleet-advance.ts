import type { NativeFleetBoarding } from './native-fleet-boarding';
import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { getShipDefinition } from '../ships';
import { shipShieldFootprint } from '../../core/ship-contact-geometry';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import { materializeNativeFleetWrecks } from './native-fleet-wrecks';
import type {
  CombatVisualAsteroid,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatObstacle,
} from './strategic-combat-types';
import { resolveCombatantCollision } from './combat-contact-response';
import {
  claimContactPair as claimPair,
  contactPairKey as pairKey,
  claimFieldContact,
  fieldCombatActors,
  recordForeignContact,
  registerFieldCombatActors,
} from './field-contact-authority';
import type { FleetCombatContacts, StrategicCombatService } from './strategic-combat-service-types';

export function escapedNativeFleetShips(services: readonly StrategicCombatService[]): Set<string> {
  const escaped = new Set<string>();
  for (const service of services) {
    const state = service.getStatus();
    if (state.outcomeReason !== 'escape') continue;
    if (state.winner === 'defender') escaped.add(state.attackerId);
    else if (state.winner === 'attacker') escaped.add(state.defenderId);
  }
  return escaped;
}

interface NativeFleetFrame {
  readonly services: readonly StrategicCombatService[];
  readonly actors: readonly MutableCombatant[];
  readonly baseObstacles: StrategicCombatObstacle[];
  readonly allObstacles: readonly StrategicCombatObstacle[][];
  readonly asteroidWorld: CombatVisualAsteroid[];
  readonly arena: StrategicCombatArenaOptions;
  readonly recordedWrecks: Set<string>;
  /** Completed escapes must remain recorded after the native target is reassigned. */
  readonly escapedRecords: Set<string>;
  readonly radiusById: ReadonlyMap<string, number>;
  readonly seed: number;
  readonly elapsed: number;
  readonly dt: number;
  readonly bystanders: readonly StrategicCombatBystander[];
  readonly ramContacts: Map<string, number>;
  readonly boarding: NativeFleetBoarding;
}

function dynamicWreckBlockers(frame: NativeFleetFrame): StrategicCombatObstacle[] {
  const fixed = new Set(frame.baseObstacles.map((obstacle) => obstacle.id));
  return frame.asteroidWorld
    .filter((rock) => rock.combatWreckVariant && !fixed.has(rock.id))
    .map(wreckObstacle);
}

function wreckObstacle(rock: CombatVisualAsteroid): StrategicCombatObstacle {
  return { id: rock.id, position: rock.position, radius: rock.collisionRadius ?? rock.radius };
}

/** Neutral traffic uses the same navigation footprint as the civilian field.
 * Fleet combatants keep their native tactical radius and contact ownership.
 */
export function neutralFleetBlocker(
  ship: StrategicCombatBystander,
  radiusById: ReadonlyMap<string, number>
): StrategicCombatObstacle {
  const configured = radiusById.get(ship.id);
  const definition = getShipDefinition(ship.shipId);
  const pose = ship.fieldContact?.pose ?? ship;
  const footprint =
    configured === undefined && definition
      ? shipShieldFootprint(definition, pose.position, pose.headingRadians)
      : { position: pose.position, radius: configured ?? 30 };
  return { id: 'ship:' + ship.id, ...footprint };
}

function fleetContacts(frame: NativeFleetFrame, escaped: ReadonlySet<string>): FleetCombatContacts {
  const activePairs = new Set<string>();
  const hullContacts = new Set<string>();
  const grapples = new Set<string>();
  const actors = new Map(frame.actors.map((ship) => [ship.setup.id, ship]));
  for (const service of frame.services) {
    const status = service.getStatus();
    if (!status.winner) activePairs.add(pairKey(status.attackerId, status.defenderId));
  }
  const world = frame.arena.fieldWorld;
  const claimHullContact = (first: string, second: string) =>
    world ? claimFieldContact(world, first, second) : claimPair(hullContacts, first, second);
  return {
    elapsedSeconds: frame.elapsed,
    isBoarding: (id) => frame.boarding.includes(id),
    claimHullContact,
    claimGrapple: (first, second) => claimPair(grapples, first, second),
    claimRamImpact(first, second) {
      const key = pairKey(first, second);
      if (frame.elapsed - (frame.ramContacts.get(key) ?? -Infinity) < 0.9) return false;
      frame.ramContacts.set(key, frame.elapsed);
      return true;
    },
    resolveFleetBystander(ship, bystanderId) {
      const local = actors.get(bystanderId);
      const other = local ?? (world ? fieldCombatActors(world).get(bystanderId) : undefined);
      if (!other) return false;
      // Active opponents run their own ram and hull phases. Applying a
      // bystander correction first would swallow that pair's ram impact.
      const active = activePairs.has(pairKey(ship.setup.id, bystanderId));
      if (!active && other.hullHp > 0 && !escaped.has(bystanderId)) {
        const resolved = resolveCombatantCollision(ship, other, claimHullContact);
        if (resolved && !local && world) recordForeignContact(world);
      }
      return true;
    },
  };
}

function removeCapturedObstacles(
  blockerLists: readonly StrategicCombatObstacle[][],
  initialRockIds: ReadonlySet<string>,
  remaining: readonly CombatVisualAsteroid[],
  removed?: Set<string>
): void {
  const remainingIds = new Set(remaining.map((rock) => rock.id));
  for (const id of initialRockIds) if (!remainingIds.has(id)) removed?.add(id);
  for (const blockers of blockerLists) {
    for (let index = blockers.length - 1; index >= 0; index--) {
      const id = blockers[index]!.id;
      if (initialRockIds.has(id) && !remainingIds.has(id)) blockers.splice(index, 1);
    }
  }
}

function refreshSharedBlockers(frame: NativeFleetFrame): void {
  const world = frame.arena.fieldWorld;
  if (!world) return;
  const bodies = new Map(world.asteroids.map((body) => [body.id, body]));
  for (let i = frame.baseObstacles.length - 1; i >= 0; i--) {
    const blocker = frame.baseObstacles[i]!;
    if (world.removedIds.has(blocker.id)) frame.baseObstacles.splice(i, 1);
    else {
      const current = bodies.get(blocker.id);
      if (current) Object.assign(blocker.position, current.position);
    }
  }
}

function stepWorld(frame: NativeFleetFrame): void {
  const { arena, dt, actors, asteroidWorld, recordedWrecks, seed, elapsed } = frame;
  if (!arena.fieldWorld?.advanced) {
    advanceCombatAsteroids(arena, dt);
    if (arena.fieldWorld) arena.fieldWorld.advanced = true;
  }
  refreshSharedBlockers(frame);
  materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
}

/** One asteroid tick, one native actor tick, one recorded wreck per vessel. */
export function advanceNativeFleetFrame(frame: NativeFleetFrame): void {
  const {
    services,
    actors,
    baseObstacles,
    allObstacles,
    asteroidWorld,
    arena,
    recordedWrecks,
    escapedRecords,
    radiusById,
    seed,
    elapsed,
    dt,
    bystanders,
  } = frame;
  stepWorld(frame);
  const actorIds = new Set(actors.map((actor) => actor.setup.id));
  const world = arena.fieldWorld;
  if (world) registerFieldCombatActors(world, actors, (id) => escapedRecords.has(id));
  const foreignActors = world ? fieldCombatActors(world) : new Map<string, MutableCombatant>();
  const neutralBystanders = bystanders.filter(
    (ship) => !actorIds.has(ship.id) && !foreignActors.has(ship.id)
  );
  const escaped = new Set([...escapedRecords, ...escapedNativeFleetShips(services)]);
  for (const id of escaped) escapedRecords.add(id);
  frame.boarding.resolve(elapsed, true);
  materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
  let wreckBlockers = dynamicWreckBlockers(frame);
  const contacts = fleetContacts(frame, escaped);
  const initialRockIds = new Set(asteroidWorld.map((rock) => rock.id));
  for (const [index, service] of services.entries()) {
    const source = service.getParallelActor?.('attacker');
    const target = service.getParallelActor?.('defender');
    if (!source || !target) throw new Error('Missing native fleet combat actor');
    // A shared target may have escaped through another active duel.
    // Do not move either participant until that service is reassigned.
    if (service.getStatus().winner || escaped.has(source.setup.id) || escaped.has(target.setup.id))
      continue;
    const duelIds = new Set([source.setup.id, target.setup.id]);
    const foreign = [...foreignActors.values()].filter((actor) => !actorIds.has(actor.setup.id));
    const others = [...actors, ...foreign]
      .filter(
        (actor) => !duelIds.has(actor.setup.id) && actor.hullHp > 0 && !escaped.has(actor.setup.id)
      )
      .map((actor) => ({
        id: actor.setup.id,
        shipId: actor.setup.shipId,
        position: actor.position,
        headingRadians: actor.headingRadians,
      }));
    const blockers = allObstacles[index]!;
    blockers.length = 0;
    blockers.push(
      ...baseObstacles,
      ...wreckBlockers,
      ...neutralBystanders.map((ship) => neutralFleetBlocker(ship, radiusById)),
      ...others.map((ship) => ({
        id: 'ship:' + ship.id,
        position: ship.position,
        radius: radiusById.get(ship.id) ?? 35,
      }))
    );
    service.setBystanders([...others, ...neutralBystanders]);
    const rockCount = asteroidWorld.length;
    service.advance(dt, contacts);
    const state = service.getStatus();
    if (state.outcomeReason === 'escape') {
      const escapedId =
        state.winner === 'defender'
          ? state.attackerId
          : state.winner === 'attacker'
            ? state.defenderId
            : null;
      if (escapedId) {
        escaped.add(escapedId);
        escapedRecords.add(escapedId);
      }
    }
    const npcBoarding = frame.boarding.start(service, state, elapsed);
    frame.boarding.resolve(elapsed, false);
    const removedRock = asteroidWorld.length !== rockCount;
    if (removedRock)
      removeCapturedObstacles(
        [baseObstacles, ...allObstacles],
        initialRockIds,
        asteroidWorld,
        arena.fieldWorld?.removedIds
      );
    materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
    if (removedRock || asteroidWorld.length !== rockCount) {
      wreckBlockers = dynamicWreckBlockers(frame);
    }
    if (state.boardingInitiator && !npcBoarding) break;
  }
}
