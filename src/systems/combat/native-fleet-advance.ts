import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { materializeNativeFleetWrecks } from './native-fleet-wrecks';
import type {
  CombatVisualAsteroid,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatObstacle,
  StrategicCombatService,
} from './strategic-combat-types';

export function escapedNativeFleetShips(services: readonly StrategicCombatService[]): Set<string> {
  const escaped = new Set<string>();
  for (const service of services) {
    const state = service.getSnapshot();
    if (state.outcomeReason !== 'escape') continue;
    if (state.winner === 'defender') escaped.add(state.attacker.id);
    else if (state.winner === 'attacker') escaped.add(state.defender.id);
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
  } = frame;
  advanceCombatAsteroids(arena, dt);
  materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
  const escaped = new Set([...escapedRecords, ...escapedNativeFleetShips(services)]);
  for (const id of escaped) escapedRecords.add(id);
  for (const [index, service] of services.entries()) {
    const source = service.getParallelActor?.('attacker');
    const target = service.getParallelActor?.('defender');
    if (!source || !target) throw new Error('Missing native fleet combat actor');
    // A shared target may have escaped through another active duel.
    // Do not move either participant until that service is reassigned.
    if (escaped.has(source.setup.id) || escaped.has(target.setup.id)) continue;
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
      ...asteroidWorld
        .filter((rock) => rock.id.startsWith('fleet-wreck:'))
        .map((rock) => ({
          id: rock.id,
          position: rock.position,
          radius: rock.collisionRadius ?? rock.radius,
        })),
      ...others.map((ship) => ({
        id: 'ship:' + ship.id,
        position: ship.position,
        radius: radiusById.get(ship.id) ?? 35,
      }))
    );
    service.setBystanders(others);
    const state = service.tick(dt);
    if (state.outcomeReason === 'escape') {
      const escapedId =
        state.winner === 'defender'
          ? state.attacker.id
          : state.winner === 'attacker'
            ? state.defender.id
            : null;
      if (escapedId) {
        escaped.add(escapedId);
        escapedRecords.add(escapedId);
      }
    }
    materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
  }
}
