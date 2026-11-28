import { workerAtAssignment, workerCargoFull } from './npc-worker-primitives';
export { moveToward, cargoUsed, chooseEventChoice } from './npc-worker-primitives';
import { stableHash as hashId } from '../../core/stable-hash';
import { distance } from '../../core/field-geometry';
import type { FieldRouteState, FieldRouteObstacle } from '../navigation/field-ship-routing';
import { npcOperationalRoleAllowed } from '../operations/ship-operation-permissions';
import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';

import type { ShipDefinition } from '../../core/ship-types';

import type { SectorNpcState } from '../../core/npc-types';

import type { WorldPoint } from '../../core/world-types';
import type { ManeuveringShipControls } from '../../core/physical-ship-state';
import type { MiningEventCheckpoint } from '../local-space/mining-event-checkpoint';
import type { PhysicalShipState } from '../../core/physical-ship-state';

export type LocalNpcMiningPhase = 'entering' | 'approaching' | 'scanning' | 'mining' | 'exiting';

/** Real NPC ore extraction event; the player tractor renderer visualizes collection. */
export interface NpcOreCollection {
  readonly resourceId: string;
  remainingSeconds: number;
  readonly durationSeconds: number;
}

export interface LocalNpcMinerState extends PhysicalShipState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  readonly speed: number;
  routeState?: FieldRouteState;
  phase: LocalNpcMiningPhase;
  targetAsteroidId: string | null;
  laserActive: boolean;
  scanProgress: number;
  readonly entryPoint: WorldPoint;
  exitPoint: WorldPoint;
  miningAccumulator: number;
  oreCollection?: NpcOreCollection;
}

export interface LocalMinerCheckpoint {
  readonly version: 1;
  readonly locationId: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly ships: readonly LocalNpcMinerState[];
  readonly combatReturns: readonly (readonly [string, WorldPoint])[];
  readonly events: readonly (readonly [string, MiningEventCheckpoint])[];
}

export interface NpcLocalMiningService {
  exportState(): LocalMinerCheckpoint;
  readonly ships: readonly LocalNpcMinerState[];
  syncCombatPose(
    npcId: string,
    position: WorldPoint,
    headingRadians: number,
    velocity: WorldPoint,
    maneuvering?: Partial<ManeuveringShipControls>
  ): void;
  tick(deltaSeconds: number, combatantId?: string): void;
}

export interface NpcLocalMiningOptions {
  readonly locationId: string;
  readonly seed?: number;
  readonly width: number;
  readonly height: number;
  readonly miners: readonly SectorNpcState[];
  readonly dynamicRoster?: boolean;
  readonly initialPosition?: (id: string) => WorldPoint | undefined;
  /** Disable internal contact solving when a shared world handles all NPC collisions. */
  readonly resolveLocalCollisions?: boolean;
  /** Optional live ships to include in the same route planner as asteroid obstacles. */
  readonly getTrafficObstacles?: (npcId: string) => readonly FieldRouteObstacle[];
  readonly getAsteroids: () => readonly LocalAsteroid[];
  readonly mine: (
    npc: SectorNpcState,
    resourceId: string,
    requested: number,
    asteroidId?: string
  ) => number;
  readonly fundMiningBonus?: (asteroidId: string, resourceId: string, amount: number) => number;
  readonly onAsteroidScanned?: (npc: SectorNpcState, asteroid: LocalAsteroid) => void;
  readonly onAsteroidMined?: (
    npc: SectorNpcState,
    asteroid: LocalAsteroid,
    resourceId: string,
    amount: number
  ) => void;
  readonly depart: (npc: SectorNpcState) => boolean;
  readonly playerShip?: ShipDefinition;
  readonly getPlayerShipState?: () => LocalShipState | undefined;
  readonly getPlayerShip?: () => ShipDefinition | undefined;
}

const ENTRY_MARGIN = 18;

const EXIT_MARGIN = 90;

export const NPC_MINING_SURFACE_DISTANCE = 48;

export const FLIGHT_SPEED = 92;

export { WORKER_SCAN_SECONDS as SCAN_SECONDS } from './npc-worker-primitives';

export const MINING_CYCLE_SECONDS = 1.15;

export const MINING_AMOUNT = 4;

export { stableHash as hashId } from '../../core/stable-hash';

export function edgePoint(id: string, width: number, height: number, outside = false): WorldPoint {
  const hash = hashId(id);
  const side = hash % 4;
  const t = ((hash >>> 3) % 1000) / 1000;
  const margin = outside ? EXIT_MARGIN : ENTRY_MARGIN;
  if (side === 0) return { x: outside ? -margin : margin, y: height * (0.15 + t * 0.7) };
  if (side === 1) return { x: width - (outside ? -margin : margin), y: height * (0.15 + t * 0.7) };
  if (side === 2) return { x: width * (0.15 + t * 0.7), y: outside ? -margin : margin };
  return { x: width * (0.15 + t * 0.7), y: height - (outside ? -margin : margin) };
}

export function chooseAsteroid(
  npc: SectorNpcState,
  asteroids: readonly LocalAsteroid[],
  occupied: ReadonlySet<string>,
  knownOnly = false
): LocalAsteroid | null {
  const preferred = asteroids.filter(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      !occupied.has(asteroid.id) &&
      (!knownOnly || asteroid.scanLevel === 'analyzed') &&
      asteroid.deposits.some(
        (deposit) =>
          deposit.oreRemaining > 0 &&
          (npc.workResourceIds.length === 0 || npc.workResourceIds.includes(deposit.resourceId))
      )
  );
  const fallback = asteroids.filter(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      !occupied.has(asteroid.id) &&
      asteroid.deposits.some((deposit) => deposit.oreRemaining > 0)
  );
  const pool = preferred.length > 0 ? preferred : fallback;
  if (pool.length === 0) return null;
  return (
    [...pool].sort(
      (first, second) =>
        distance(first.position, { x: 2200, y: 1285 }) -
          distance(second.position, { x: 2200, y: 1285 }) || first.id.localeCompare(second.id)
    )[hashId(npc.id) % Math.min(8, pool.length)] ??
    pool[0] ??
    null
  );
}

export function approachPoint(npcId: string, asteroid: LocalAsteroid): WorldPoint {
  const angle = ((hashId(npcId + ':' + asteroid.id) % 6283) / 1000) % (Math.PI * 2);
  const radius = asteroid.radius + NPC_MINING_SURFACE_DISTANCE;
  return {
    x: asteroid.position.x + Math.cos(angle) * radius,
    y: asteroid.position.y + Math.sin(angle) * radius,
  };
}

export function eligibleMiner(npc: SectorNpcState, locationId: string): boolean {
  return (
    npcOperationalRoleAllowed(npc, 'mining') &&
    workerAtAssignment(npc, locationId) &&
    !workerCargoFull(npc)
  );
}

/** Maintain working distance on the current side of a drifting asteroid. */
export function holdMinerWorkRange(
  ship: LocalNpcMinerState,
  rocks: readonly LocalAsteroid[],
  dt: number
): void {
  if (ship.phase !== 'scanning' && ship.phase !== 'mining') return;
  const rock = rocks.find((body) => body.id === ship.targetAsteroidId);
  if (!rock) return;
  const dx = ship.position.x - rock.position.x;
  const dy = ship.position.y - rock.position.y;
  const centerDistance = Math.hypot(dx, dy);
  const offset = centerDistance - rock.radius - NPC_MINING_SURFACE_DISTANCE;
  if (offset > 16) {
    ship.phase = 'approaching';
    ship.laserActive = false;
    ship.scanProgress = 0;
    delete ship.routeState;
    delete ship.oreCollection;
    return;
  }
  if (centerDistance === 0) return;
  const correction = Math.max(-16 * dt, Math.min(16 * dt, offset));
  ship.position = {
    x: ship.position.x - (dx / centerDistance) * correction,
    y: ship.position.y - (dy / centerDistance) * correction,
  };
  ship.headingRadians = Math.atan2(-dy, -dx);
}
