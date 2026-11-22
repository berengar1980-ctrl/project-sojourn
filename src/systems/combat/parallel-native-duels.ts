import { clearCombatSpawn } from './combat-field-spawns';
import { createStrategicCombatService } from './strategic-combat-service';
import { buildCombatArena } from './strategic-combat-arena';
import { advanceNativeFleetFrame, escapedNativeFleetShips } from './native-fleet-advance';
import { reassignNativeFleetTargets, type NativeFleetDriver } from './native-fleet-reassignment';
import {
  activeNativeFleetEngagements,
  type NativeFleetEngagement,
} from './native-fleet-engagements';
export type { NativeFleetEngagement } from './native-fleet-engagements';
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
  /** A duel draws one solid link; a single-driver reinforcement draws a dashed link. */
  readonly engagements: readonly NativeFleetEngagement[];
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

function nativeFootprintRadius(actor: MutableCombatant): number {
  const shield = actor.setup.shieldGeometry;
  return Math.max(18, Math.max(shield?.radiusX ?? 35, shield?.radiusY ?? 24) * 0.85);
}

function nativeFleetRadii(ships: readonly MutableCombatant[]): Map<string, number> {
  return new Map(ships.map((ship) => [ship.setup.id, nativeFootprintRadius(ship)] as const));
}

function nativeFleetFinished(
  actors: readonly MutableCombatant[],
  escaped: ReadonlySet<string>,
  teams: ReadonlyMap<string, 'a' | 'b'>,
 ): boolean {
  const active = (team: 'a' | 'b') =>
    actors.some(
      (ship) => ship.hullHp > 0 && !escaped.has(ship.setup.id) && teams.get(ship.setup.id) === team
    );
  return !active('a') || !active('b');
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
    exitPoint: buildCombatArena(first[0]!.setup, second[0]!.setup, seed, arena).exitPoint!,
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
  const escapedRecords = new Set<string>();
  const teams = new Map(ships.map((ship) => [ship.setup.id, ship.team] as const));
  const drivers: NativeFleetDriver[] = [
    ...pairs.map(() => 'both' as const),
    ...supporters.map(() => 'attacker' as const),
  ];
  let elapsed = 0;
  let cachedSnapshot: ParallelNativeDuelSnapshot | null = null;
  const radiusById = nativeFleetRadii(actors);
  const getSnapshot = (): ParallelNativeDuelSnapshot => {
    if (cachedSnapshot) return cachedSnapshot;
    const duels = pairs.map((service) => service.getSnapshot());
    const additional = supporters.map((service) => service.getSnapshot());
    const states = [...duels, ...additional];
    const escaped = new Set([...escapedRecords, ...escapedNativeFleetShips(services)]);
    const engagements = activeNativeFleetEngagements(states, drivers, pairs.length, escaped);
    cachedSnapshot = {
      duels,
      supporters: additional,
      elapsedSeconds: Math.max(0, ...states.map((duel) => duel.elapsedSeconds)),
      escapedShipIds: [...escaped],
      engagements,
      finished: nativeFleetFinished(actors, escaped, teams),
    };
    return cachedSnapshot;
  };

  return {
    duels: pairs,
    supporters,
    getSnapshot,
    tick(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return getSnapshot();
      const dt = Math.min(seconds, 0.08);
      cachedSnapshot = null;
      elapsed += dt;
      advanceNativeFleetFrame({
        services,
        actors,
        baseObstacles,
        allObstacles,
        asteroidWorld,
        arena: fleetArena,
        recordedWrecks,
        escapedRecords,
        radiusById,
        seed,
        elapsed,
        dt,
      });
      reassignNativeFleetTargets({
        services,
        drivers,
        ships: actors,
        teams,
        escaped: escapedRecords,
      });
      return getSnapshot();
    },
  };
}
