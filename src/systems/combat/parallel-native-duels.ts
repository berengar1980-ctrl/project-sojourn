import { clearCombatSpawn } from './combat-field-spawns';
import type { StrategicCombatBystander } from './strategic-combat-bystander-types';
import {
  defaultFleetHostility,
  hasActiveFleetHostilities,
  type FleetHostility,
} from './native-fleet-hostility';
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
  StrategicCombatSnapshot,
  StrategicCombatObstacle,
  CombatVisualAsteroid,
} from './strategic-combat-types';
import type { StrategicCombatService } from './strategic-combat-service-types';

export interface NativeDuelShip {
  readonly id: string;
  readonly team: string;
  readonly setup: StrategicCombatantSetup;
  /** Existing world-space pose when a ship hands off to native combat. */
  readonly position?: CombatPoint;
  readonly velocity?: CombatPoint;
  readonly headingRadians?: number;
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
  getActor(id: string): MutableCombatant | null;
  /** World traffic is a physical bystander, not an automatically hostile combatant. */
  setBystanders(ships: readonly StrategicCombatBystander[]): void;
  /** Bring an existing campaign or test ship into the live battle exactly once. */
  addShip(ship: NativeDuelShip, conflictKey?: string, targetId?: string): boolean;
  tick(dt: number, beforePrimaryAttackerReplacement?: () => void): ParallelNativeDuelSnapshot;
  advance(dt: number, beforePrimaryAttackerReplacement?: () => void): void;
  isFinished(): boolean;
  boardingService(shipId?: string): StrategicCombatService | undefined;
  hasEscaped(shipId: string): boolean;
  getSnapshot(): ParallelNativeDuelSnapshot;
}

function fieldStart(
  arena: StrategicCombatArenaOptions,
  team: string,
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
    attackerHeadingRadians:
      ship.headingRadians ?? arena.attackerHeadingRadians ?? (ship.team === 'a' ? 0 : Math.PI),
    defenderHeadingRadians:
      target.headingRadians ?? arena.defenderHeadingRadians ?? (target.team === 'a' ? 0 : Math.PI),
    ...(ship.velocity ? { attackerVelocity: ship.velocity } : {}),
    ...(target.velocity ? { defenderVelocity: target.velocity } : {}),
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
        ship.position ??
          (index === 0 ? arena.attackerPosition : undefined) ??
          fieldStart(arena, 'a', index, first.length),
        target.position ??
          (index === 0 ? arena.defenderPosition : undefined) ??
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
        entry.ship.position ?? fieldStart(arena, entry.ship.team, entry.index, entry.size),
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
  factions: ReadonlyMap<string, string>,
  hostility: FleetHostility,
  services: readonly StrategicCombatService[]
): boolean {
  // A surrendered duel is over even if both hulls remain intact and hostile.
  // Never resurrect an already resolved battle merely because the participants survived.
  if (services.every((service) => service.getStatus().winner !== null)) return true;
  return !hasActiveFleetHostilities(actors, escaped, factions, hostility);
}

interface NativeFleetJoinContext {
  readonly services: StrategicCombatService[];
  readonly supporters: StrategicCombatService[];
  readonly actors: MutableCombatant[];
  readonly drivers: NativeFleetDriver[];
  readonly teams: Map<string, string>;
  readonly escaped: ReadonlySet<string>;
  readonly radii: Map<string, number>;
  readonly arena: StrategicCombatArenaOptions;
  readonly obstacleSet: () => StrategicCombatObstacle[];
  readonly seed: number;
  readonly hostility: FleetHostility;
}

function joinNativeFleetShip(
  context: NativeFleetJoinContext,
  ship: NativeDuelShip,
  conflictKey?: string,
  targetId?: string
): boolean {
  const { actors, teams, hostility, escaped, arena, seed, obstacleSet } = context;
  const id = ship.setup.id;
  if (actors.some((actor) => actor.setup.id === id)) return false;
  const affiliation = conflictKey ?? ship.team;
  const target = actors
    .filter(
      (actor) =>
        (!targetId || actor.setup.id === targetId) &&
        actor.hullHp > 0 &&
        !escaped.has(actor.setup.id) &&
        (hostility(affiliation, teams.get(actor.setup.id)!) ||
          hostility(teams.get(actor.setup.id)!, affiliation))
    )
    .sort((a, b) => a.setup.id.localeCompare(b.setup.id))[0];
  if (!target) return false;
  const shipIndex = actors.length;
  const support = createStrategicCombatService(
    ship.setup,
    target.setup,
    seed + shipIndex,
    pairFields(
      arena,
      obstacleSet(),
      ship,
      { id: target.setup.id, team: teams.get(target.setup.id)!, setup: target.setup },
      ship.position ??
        clearCombatSpawn(arena, {
          x: arena.width * 0.5,
          y: (arena.height * ((shipIndex % 9) + 1)) / 10,
        }),
      target.position
    ),
    undefined,
    true,
    target
  );
  const newActor = nativeActor(support, 'attacker');
  context.supporters.push(support);
  context.services.push(support);
  actors.push(newActor);
  context.drivers.push('attacker');
  teams.set(id, affiliation);
  context.radii.set(id, nativeFootprintRadius(newActor));
  return true;
}

// The shared frame coordinator keeps its mutable world and AI-owner maps together.
// eslint-disable-next-line max-lines-per-function
export function createParallelNativeDuels(
  ships: readonly NativeDuelShip[],
  arena: StrategicCombatArenaOptions,
  seed = 1,
  hostility: FleetHostility = defaultFleetHostility,
  conflictKeys?: ReadonlyMap<string, string>,
  restoredDuel?: StrategicCombatService
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
    exitPoint:
      arena.exitPoint ??
      buildCombatArena(first[0]!.setup, second[0]!.setup, seed, arena).exitPoint!,
  };
  const asteroidWorld = fleetArena.asteroids as CombatVisualAsteroid[];
  const baseObstacles = fleetArena.obstacles ?? [];
  const allObstacles: StrategicCombatObstacle[][] = [];
  const obstacleSet = (): StrategicCombatObstacle[] => {
    const blockers = [...baseObstacles];
    allObstacles.push(blockers);
    return blockers;
  };
  if (restoredDuel) restoredDuel.attachToFleet(obstacleSet(), asteroidWorld);
  const { pairs, supporters } = restoredDuel
    ? { pairs: [restoredDuel], supporters: [] as StrategicCombatService[] }
    : createNativeDuelServices(first, second, fleetArena, seed, obstacleSet);
  const services = [...pairs, ...supporters];
  const actors = nativeTeamActors(pairs, supporters);
  const recordedWrecks = new Set(
    asteroidWorld
      .filter((rock) => rock.id.startsWith('fleet-wreck:'))
      .map((rock) => rock.id.slice('fleet-wreck:'.length))
  );
  const escapedRecords = new Set<string>();
  const ramContacts = new Map<string, number>();
  const actorById = new Map(actors.map((actor) => [actor.setup.id, actor]));
  // An encounter-aware policy may use individual ship IDs rather than broad
  // A/B test teams, allowing distinct player/NPC/drone/pirate relations.
  const teams = new Map<string, string>(
    ships.map((ship) => [ship.setup.id, conflictKeys?.get(ship.setup.id) ?? ship.team] as const)
  );
  const drivers: NativeFleetDriver[] = [
    ...pairs.map(() => 'both' as const),
    ...supporters.map(() => 'attacker' as const),
  ];
  let elapsed = restoredDuel?.getSnapshot().elapsedSeconds ?? 0;
  let bystanders: readonly StrategicCombatBystander[] = [];
  let cachedSnapshot: ParallelNativeDuelSnapshot | null = null;
  const radiusById = nativeFleetRadii(actors);
  const isFinished = () => nativeFleetFinished(actors, escapedRecords, teams, hostility, services);
  const boardingService = (shipId?: string) =>
    services.find((service) => {
      const state = service.getStatus();
      return (
        state.boardingInitiator !== null &&
        (shipId === undefined || state.attackerId === shipId || state.defenderId === shipId)
      );
    });
  const getSnapshot = (): ParallelNativeDuelSnapshot => {
    if (cachedSnapshot) return cachedSnapshot;
    const escaped = new Set([...escapedRecords, ...escapedNativeFleetShips(services)]);
    const visibleState = (service: StrategicCombatService) => {
      const state = service.getSnapshot();
      if (
        state.winner === null &&
        !escaped.has(state.attacker.id) &&
        !escaped.has(state.defender.id)
      )
        return state;
      return { ...state, projectiles: [], beams: [], thrownAsteroids: [] };
    };
    const duels = pairs.map(visibleState);
    const additional = supporters.map(visibleState);
    const states = [...duels, ...additional];
    const engagements = activeNativeFleetEngagements(states, drivers, pairs.length, escaped);
    cachedSnapshot = {
      duels,
      supporters: additional,
      elapsedSeconds: Math.max(0, ...states.map((duel) => duel.elapsedSeconds)),
      escapedShipIds: [...escaped],
      engagements,
      finished: nativeFleetFinished(actors, escaped, teams, hostility, services),
    };
    return cachedSnapshot;
  };

  const advance = (seconds: number, beforePrimaryAttackerReplacement?: () => void): void => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
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
      bystanders,
      ramContacts,
    });
    reassignNativeFleetTargets({
      ...(beforePrimaryAttackerReplacement ? { beforePrimaryAttackerReplacement } : {}),
      services,
      drivers,
      ships: actors,
      teams,
      hostility,
      escaped: escapedRecords,
    });
  };

  return {
    duels: pairs,
    supporters,
    addShip(ship, conflictKey, targetId) {
      const joined = joinNativeFleetShip(
        {
          services,
          supporters,
          actors,
          drivers,
          teams,
          escaped: escapedRecords,
          radii: radiusById,
          arena: fleetArena,
          obstacleSet,
          seed,
          hostility,
        },
        ship,
        conflictKey,
        targetId
      );
      if (joined) {
        actorById.set(ship.id, actors.at(-1)!);
        cachedSnapshot = null;
      }
      return joined;
    },
    getActor: (id) => actorById.get(id) ?? null,
    setBystanders(contacts) {
      bystanders = contacts.filter((ship) => !actorById.has(ship.id));
    },
    getSnapshot,
    advance,
    isFinished,
    boardingService,
    hasEscaped: (id) => escapedRecords.has(id),
    tick(seconds, beforePrimaryAttackerReplacement) {
      advance(seconds, beforePrimaryAttackerReplacement);
      return getSnapshot();
    },
  };
}
