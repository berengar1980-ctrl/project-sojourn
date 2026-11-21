import { advanceCombatAsteroids } from './combat-asteroid-motion';
import { clearCombatSpawn } from './combat-field-spawns';
import { createStrategicCombatService } from './strategic-combat-service';
import type {
  CombatPoint,
  MutableCombatant,
  StrategicCombatArenaOptions,
  StrategicCombatantSetup,
  StrategicCombatService,
  StrategicCombatSnapshot,
  StrategicCombatObstacle,
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

function nativeActor(service: StrategicCombatService, side: 'attacker' | 'defender'): MutableCombatant {
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
  const baseObstacles = arena.obstacles ?? [];
  const allObstacles: StrategicCombatObstacle[][] = [];
  const obstacleSet = (): StrategicCombatObstacle[] => {
    const blockers = [...baseObstacles];
    allObstacles.push(blockers);
    return blockers;
  };
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
        { id: targetActor.setup.id, team: entry.ship.team === 'a' ? 'b' : 'a', setup: targetActor.setup },
        fieldStart(arena, entry.ship.team, entry.index, entry.size),
        targetActor.position
      ),
      undefined,
      true,
      targetActor
    );
  });
  const services = [...pairs, ...supporters];
  const actors = nativeTeamActors(pairs, supporters);
  const radiusById = new Map(
    actors.map((actor) => [
      actor.setup.id,
      Math.max(
        18,
        Math.max(actor.setup.shieldGeometry?.radiusX ?? 35, actor.setup.shieldGeometry?.radiusY ?? 24) *
          0.85
      ),
    ])
  );
  const getSnapshot = (): ParallelNativeDuelSnapshot => {
    const duels = pairs.map((service) => service.getSnapshot());
    const additional = supporters.map((service) => service.getSnapshot());
    return {
      duels,
      supporters: additional,
      elapsedSeconds: Math.max(0, ...[...duels, ...additional].map((duel) => duel.elapsedSeconds)),
      finished: services.every((service) => service.getSnapshot().winner !== null),
    };
  };

  return {
    duels: pairs,
    supporters,
    getSnapshot,
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return getSnapshot();
      const dt = Math.min(seconds, 0.08);
      if (!services.every((service) => service.getSnapshot().winner !== null)) {
        advanceCombatAsteroids(arena, dt);
      }
      for (const [index, service] of services.entries()) {
        const owned = index < pairs.length
          ? [nativeActor(service, 'attacker'), nativeActor(service, 'defender')]
          : [nativeActor(service, 'attacker')];
        const ownedIds = new Set(owned.map((actor) => actor.setup.id));
        const others = actors
          .filter((actor) => !ownedIds.has(actor.setup.id) && actor.hullHp > 0)
          .map((actor) => ({
            id: actor.setup.id,
            shipId: actor.setup.shipId,
            position: actor.position,
            headingRadians: actor.headingRadians,
          }));
        const blockers = allObstacles[index]!;
        blockers.splice(baseObstacles.length);
        blockers.push(...others.map((ship) => ({
          id: 'ship:' + ship.id,
          position: ship.position,
          radius: radiusById.get(ship.id) ?? 35,
        })));
        service.setBystanders(others);
        service.tick(dt);
      }
      return getSnapshot();
    },
  };
}
