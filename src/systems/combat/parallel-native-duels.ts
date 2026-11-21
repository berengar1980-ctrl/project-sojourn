import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { clearCombatSpawn } from './combat-field-spawns';
import { createStrategicCombatService } from './strategic-combat-service';
import { buildCombatArena } from './strategic-combat-arena';
import { materializeNativeFleetWrecks } from './native-fleet-wrecks';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatService,
  StrategicCombatSnapshot,
  StrategicCombatObstacle,
  CombatVisualAsteroid,
} from './strategic-combat-types';

export interface NativeDuelShip {
  readonly id: string;
  readonly team: 'a' | 'b';
  readonly setup: StrategicCombatantSetup;
}
export interface ParallelNativeDuelSnapshot {
  readonly duels: readonly StrategicCombatSnapshot[];
  /** One-sided original 1vs1 AI participants; defender is a shared live ship. */
  readonly supporters: readonly StrategicCombatSnapshot[];
  readonly elapsedSeconds: number;
  readonly finished: boolean;
  readonly escapedShipIds: readonly string[];
}
export interface ParallelNativeDuels {
  readonly duels: readonly StrategicCombatService[];
  readonly supporters: readonly StrategicCombatService[];
  tick(dt: number): ParallelNativeDuelSnapshot;
  getSnapshot(): ParallelNativeDuelSnapshot;
}

function fieldStart(
  arena: StrategicCombatArenaOptions,
  team: 'a' | 'b',
  index: number,
  count: number
): CombatPoint {
  return clearCombatSpawn(arena, {
    x: arena.width * (team === 'a' ? 0.27 : 0.73),
    y: arena.height * ((index + 1) / (count + 1)),
  });
}

function nativeActor(
  service: StrategicCombatService,
  side: 'attacker' | 'defender'
): MutableCombatant {
  const actor = service.getParallelActor?.(side);
  if (!actor) throw new Error('Native parallel duel requires a live combatant reference');
  return actor;
}

function nativeTeamActors(
  pairs: readonly StrategicCombatService[],
  extra: readonly StrategicCombatService[]
): MutableCombatant[] {
  // Only the PAIR owner drives paired ships; an extra service owns only its
  // attacker. Its defender reference points to an existing paired actor.
  return [
    ...pairs.flatMap((service) => [
      nativeActor(service, 'attacker'),
      nativeActor(service, 'defender'),
    ]),
    ...extra.map((service) => nativeActor(service, 'attacker')),
  ];
}

function pairFields(
  arena: StrategicCombatArenaOptions,
  obstacles: StrategicCombatObstacle[],
  ship: NativeDuelShip,
  target: NativeDuelShip,
  from: CombatPoint,
  to: CombatPoint
): StrategicCombatArenaOptions {
  return {
    ...arena,
    obstacles,
    attackerPosition: from,
    defenderPosition: to,
    attackerHeadingRadians: ship.team === 'a' ? 0 : Math.PI,
    defenderHeadingRadians: target.team === 'a' ? 0 : Math.PI,
  };
}

/**
 * Each paired ship has exactly one original 1vs1 service. Surplus ships use
 * the same original tactical/weapon code but tick only their OWN combatant.
 * Their target is a reference to the real paired ship, never a copied actor.
 */
function createNativeDuelServices(
  first: readonly NativeDuelShip[],
  second: readonly NativeDuelShip[],
  arena: StrategicCombatArenaOptions,
  seed: number,
  obstacleSet: () => StrategicCombatObstacle[]
): { pairs: StrategicCombatService[]; supporters: StrategicCombatService[] } {
  const paired = Math.min(first.length, second.length);
  const pairs = Array.from({ length: paired }, (_, index) => {
    const ship = first[index]!;
    const target = second[index]!;
    return createStrategicCombatService(
      ship.setup,
      target.setup,
      seed + index,
      pairFields(
        arena,
        obstacleSet(),
        ship,
        target,
        fieldStart(arena, 'a', index, first.length),
        fieldStart(arena, 'b', index, second.length)
      ),
      undefined,
      true
    );
  });
  const extraShips = [
    ...first.slice(paired).map((ship, index) => ({
      ship,
      index: paired + index,
      size: first.length,
      targetSide: 'defender' as const,
    })),
    ...second.slice(paired).map((ship, index) => ({
      ship,
      index: paired + index,
      size: second.length,
      targetSide: 'attacker' as const,
    })),
  ];
  const supporters = extraShips.map((entry, index) => {
    const targetActor = nativeActor(pairs[index % pairs.length]!, entry.targetSide);
    return createStrategicCombatService(
      entry.ship.setup,
      targetActor.setup,
      seed + paired + index,
      pairFields(
        arena,
        obstacleSet(),
        entry.ship,
        {
          id: targetActor.setup.id,
          team: entry.ship.team === 'a' ? 'b' : 'a',
          setup: targetActor.setup,
        },
        fieldStart(arena, entry.ship.team, entry.index, entry.size),
        targetActor.position
      ),
      undefined,
      true,
      targetActor
    );
  });
  return { pairs, supporters };
}

/** A completed escape removes the actual vessel, not its pursuing opponent. */
function escapedFleetShips(services: readonly StrategicCombatService[]): Set<string> {
  const escaped = new Set<string>();
  for (const service of services) {
    const state = service.getSnapshot();
    if (state.outcomeReason !== 'escape') continue;
    if (state.winner === 'defender') escaped.add(state.attacker.id);
    else if (state.winner === 'attacker') escaped.add(state.defender.id);
  }
  return escaped;
}

export function createParallelNativeDuels(
  ships: readonly NativeDuelShip[],
  arena: StrategicCombatArenaOptions,
  seed = 1
): ParallelNativeDuels {
  const first = ships.filter((ship) => ship.team === 'a');
  const second = ships.filter((ship) => ship.team === 'b');
  if (!first.length || !second.length || first.length > 5 || second.length > 5) {
    throw new Error('Parallel native duels require 1 to 5 ships per faction');
  }
  if (new Set(ships.map((ship) => ship.id)).size !== ships.length) {
    throw new Error('Native duel ship IDs must be unique');
  }
  // One physical world and exactly ONE visible escape gate for every native duel.
  // Shallow-copy the asteroid list so newly created wrecks do not mutate a
  // caller's prepared campaign/PvP map; the native bodies themselves stay shared.
  const fleetArena: StrategicCombatArenaOptions = {
    ...arena,
    asteroids: [...(arena.asteroids ?? [])],
    exitPoint: buildCombatArena(first[0]!.setup, second[0]!.setup, seed, arena).exitPoint,
  };
  const asteroidWorld = fleetArena.asteroids as CombatVisualAsteroid[];
  const baseObstacles = fleetArena.obstacles ?? [];
  const allObstacles: StrategicCombatObstacle[][] = [];
  const obstacleSet = (): StrategicCombatObstacle[] => {
    const blockers = [...baseObstacles];
    allObstacles.push(blockers);
    return blockers;
  };
  const { pairs, supporters } = createNativeDuelServices(
    first,
    second,
    fleetArena,
    seed,
    obstacleSet
  );
  const services = [...pairs, ...supporters];
  const actors = nativeTeamActors(pairs, supporters);
  const recordedWrecks = new Set<string>();
  let elapsed = 0;
  const radiusById = new Map(
    actors.map((actor) => [
      actor.setup.id,
      Math.max(
        18,
        Math.max(
          actor.setup.shieldGeometry?.radiusX ?? 35,
          actor.setup.shieldGeometry?.radiusY ?? 24
        ) * 0.85
      ),
    ])
  );
  const getSnapshot = (): ParallelNativeDuelSnapshot => {
    const duels = pairs.map((service) => service.getSnapshot());
    const additional = supporters.map((service) => service.getSnapshot());
    const escaped = escapedFleetShips(services);
    return {
      duels,
      supporters: additional,
      elapsedSeconds: Math.max(0, ...[...duels, ...additional].map((duel) => duel.elapsedSeconds)),
      escapedShipIds: [...escaped],
      finished: services.every(
        (service, index) =>
          service.getSnapshot().winner !== null ||
          (index >= pairs.length &&
            escaped.has(nativeActor(service, 'defender').setup.id))
      ),
    };
  };

  return {
    duels: pairs,
    supporters,
    getSnapshot,
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return getSnapshot();
      const dt = Math.min(seconds, 0.08);
      elapsed += dt;
      if (!services.every((service) => service.getSnapshot().winner !== null)) {
        advanceCombatAsteroids(fleetArena, dt);
      }
      materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
      for (const [index, service] of services.entries()) {
        const escaped = escapedFleetShips(services);
        if (escaped.has(nativeActor(service, 'attacker').setup.id)) continue;
        if (index >= pairs.length && escaped.has(nativeActor(service, 'defender').setup.id)) {
          continue;
        }
        // Both the own actor and its actual target must be omitted from
        // bystander blockers. Otherwise a supporting ship shoots into the
        // target's fake obstacle instead of hitting the real shield/hull.
        const duelIds = new Set([
          nativeActor(service, 'attacker').setup.id,
          nativeActor(service, 'defender').setup.id,
        ]);
        const others = actors
          .filter(
            (actor) =>
              !duelIds.has(actor.setup.id) && actor.hullHp > 0 && !escaped.has(actor.setup.id)
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
        service.tick(dt);
        materializeNativeFleetWrecks(actors, asteroidWorld, recordedWrecks, seed, elapsed);
      }
      return getSnapshot();
    },
  };
}
