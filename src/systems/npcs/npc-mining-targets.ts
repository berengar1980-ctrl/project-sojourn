import type {
  LocalAsteroid,
  LocalShipState,
  MiningEventChoice,
} from '../../core/local-space-types';

import type { ShipDefinition } from '../../core/ship-types';

import type { SectorNpcState } from '../../core/npc-types';

import type { WorldPoint } from '../../core/world-types';
import type { MiningEventCheckpoint } from '../local-space/mining-event-checkpoint';

export type LocalNpcMiningPhase = 'entering' | 'approaching' | 'scanning' | 'mining' | 'exiting';

export interface LocalNpcMinerState {
  readonly npcId: string;
  readonly name: string;
  readonly shipId: string;
  position: WorldPoint;
  headingRadians: number;
  speed: number;
  phase: LocalNpcMiningPhase;
  targetAsteroidId: string | null;
  laserActive: boolean;
  scanProgress: number;
  readonly entryPoint: WorldPoint;
  exitPoint: WorldPoint;
  miningAccumulator: number;
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
  syncCombatPose(npcId: string, position: WorldPoint, headingRadians: number, speed: number): void;
  tick(deltaSeconds: number): void;
}

export interface NpcLocalMiningOptions {
  readonly locationId: string;
  readonly seed?: number;
  readonly width: number;
  readonly height: number;
  readonly miners: readonly SectorNpcState[];
  readonly getAsteroids: () => readonly LocalAsteroid[];
  readonly mine: (npc: SectorNpcState, resourceId: string, requested: number) => number;
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

const APPROACH_DISTANCE = 105;

export const FLIGHT_SPEED = 92;

export const SCAN_SECONDS = 5;

export const MINING_CYCLE_SECONDS = 1.15;

export const MINING_AMOUNT = 4;

export function hashId(id: string): number {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function moveToward(
  ship: LocalNpcMinerState,
  target: WorldPoint,
  speed: number,
  dt: number
): boolean {
  const dx = target.x - ship.position.x;
  const dy = target.y - ship.position.y;
  const remaining = Math.hypot(dx, dy);
  ship.headingRadians = Math.atan2(dy, dx);
  ship.speed = speed;
  if (remaining <= Math.max(2, speed * dt)) {
    ship.position = { ...target };
    ship.speed = 0;
    return true;
  }
  ship.position = {
    x: ship.position.x + (dx / remaining) * speed * dt,
    y: ship.position.y + (dy / remaining) * speed * dt,
  };
  return false;
}

export function cargoUsed(npc: SectorNpcState): number {
  return Object.values(npc.cargo).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount)), 0);
}

export function chooseAsteroid(
  npc: SectorNpcState,
  asteroids: readonly LocalAsteroid[],
  occupied: ReadonlySet<string>
): LocalAsteroid | null {
  const preferred = asteroids.filter(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      !occupied.has(asteroid.id) &&
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
  const radius = asteroid.radius + APPROACH_DISTANCE;
  return {
    x: asteroid.position.x + Math.cos(angle) * radius,
    y: asteroid.position.y + Math.sin(angle) * radius,
  };
}

export function eligibleMiner(npc: SectorNpcState, locationId: string): boolean {
  return (
    npc.job === 'miner' &&
    npc.workLocationId === locationId &&
    npc.locationId === locationId &&
    !npc.travel &&
    !npc.combatMovement &&
    npc.autonomy?.phase === 'working' &&
    cargoUsed(npc) < Math.max(1, Math.floor(npc.cargoCapacity))
  );
}

export function chooseEventChoice(
  npc: SectorNpcState,
  choices: readonly MiningEventChoice[]
): MiningEventChoice | null {
  if (choices.length === 0) return null;
  const rank = { safe: 0, controlled: 1, risky: 2, high_risk: 3 } as const;
  const risky = npc.workRiskPreference === 'risky';
  return (
    [...choices].sort((a, b) =>
      risky ? rank[b.risk] - rank[a.risk] : rank[a.risk] - rank[b.risk]
    )[0] ?? null
  );
}
