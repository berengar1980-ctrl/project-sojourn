import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { getShipDefinition } from '../ships';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import { materializeNativeFleetWrecks } from './native-fleet-wrecks';
import type {
  CombatVisualAsteroid,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatObstacle,
} from './strategic-combat-types';
import type { StrategicCombatService } from './strategic-combat-service-types';

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
  readonly baseObstacles: readonly StrategicCombatObstacle[];
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
}

function wreckObstacle(rock: CombatVisualAsteroid): StrategicCombatObstacle {
  return { id: rock.id, position: rock.position, radius: rock.collisionRadius ?? rock.radius };
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
    ramContacts,
  } = frame;
  advanceCombatAsteroids(arena, dt);
  materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
  let wreckBlockers = asteroidWorld
    .filter((rock) => rock.id.startsWith('fleet-wreck:'))
    .map(wreckObstacle);
  const claimRamImpact = (firstId: string, secondId: string) => {
    const key = JSON.stringify(firstId < secondId ? [firstId, secondId] : [secondId, firstId]);
    if (elapsed - (ramContacts.get(key) ?? -Infinity) < 0.9) return false;
    ramContacts.set(key, elapsed);
    return true;
  };
  const bystanderBlockers = bystanders.map((ship) => ({
    id: 'ship:' + ship.id,
    position: ship.position,
    radius:
      radiusById.get(ship.id) ??
      Math.max(20, (getShipDefinition(ship.shipId)?.nominalLengthMeters ?? 60) * 0.5),
  }));
  const escaped = new Set([...escapedRecords, ...escapedNativeFleetShips(services)]);
  for (const id of escaped) escapedRecords.add(id);
  for (const [index, service] of services.entries()) {
    const source = service.getParallelActor?.('attacker');
    const target = service.getParallelActor?.('defender');
    if (!source || !target) throw new Error('Missing native fleet combat actor');
    // A shared target may have escaped through another active duel.
    // Do not move either participant until that service is reassigned.
    if (service.getStatus().winner || escaped.has(source.setup.id) || escaped.has(target.setup.id))
      continue;
    const duelIds = new Set([source.setup.id, target.setup.id]);
    const others = actors
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
    blockers.splice(baseObstacles.length);
    blockers.push(
      ...wreckBlockers,
      ...bystanderBlockers.filter((ship) => !duelIds.has(ship.id.slice('ship:'.length))),
      ...others.map((ship) => ({
        id: 'ship:' + ship.id,
        position: ship.position,
        radius: radiusById.get(ship.id) ?? 35,
      }))
    );
    service.setBystanders([...others, ...bystanders.filter((ship) => !duelIds.has(ship.id))]);
    const rockCount = asteroidWorld.length;
    service.advance(dt, claimRamImpact);
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
    const removedRock = asteroidWorld.length !== rockCount;
    materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
    if (removedRock || asteroidWorld.length !== rockCount) {
      wreckBlockers = asteroidWorld
        .filter((rock) => rock.id.startsWith('fleet-wreck:'))
        .map(wreckObstacle);
    }
  }
}
