import type {
  LocalAsteroid,
  LocalShipState,
  MiningChunk,
  MiningResourceSelection,
} from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import { distance } from './local-space-motion';
import { calculateMiningImpact } from './mining-impact';

export type MiningChunkCollector = (resourceId: string, amount: number) => number;

export interface CollectedMiningSample {
  readonly sourceAsteroidId: string;
  readonly resourceId: string;
  readonly amount: number;
}

export function identifyMinedResource(
  asteroid: LocalAsteroid,
  resourceId: string
): boolean {
  const deposit = asteroid.deposits.find((entry) => entry.resourceId === resourceId);
  if (!deposit || deposit.identified) return false;
  deposit.identified = true;
  return true;
}

function activeMiningDeposits(
  asteroid: LocalAsteroid,
  resourceSelection: MiningResourceSelection
) {
  const selected = resourceSelection ? new Set(resourceSelection) : null;
  return asteroid.deposits.filter(
    (deposit) =>
      deposit.oreRemaining > 0 && (!selected || selected.has(deposit.resourceId))
  );
}

export function hasMineableDeposits(
  asteroid: LocalAsteroid,
  resourceSelection: MiningResourceSelection = null
): boolean {
  return activeMiningDeposits(asteroid, resourceSelection).length > 0;
}

function heading(from: WorldPoint, to: WorldPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function createMiningChunk(
  asteroid: LocalAsteroid,
  ship: LocalShipState,
  hardpoints: ShipHardpoints,
  nominalLengthMeters: number,
  seed: number,
  chunkCounter: number,
  yieldMultiplier = 1,
  resourceSelection: MiningResourceSelection = null
): MiningChunk | null {
  const activeDeposits = activeMiningDeposits(asteroid, resourceSelection);
  if (activeDeposits.length === 0) return null;

  const deposit = activeDeposits[chunkCounter % activeDeposits.length]!;
  const impact = calculateMiningImpact(ship, asteroid, hardpoints, nominalLengthMeters);
  const amountPerChunk = Math.max(1, Math.round(6 * Math.max(0, yieldMultiplier)));
  const amount = Math.min(amountPerChunk, deposit.oreRemaining);
  deposit.oreRemaining -= amount;

  if (resourceSelection) {
    const selected = new Set(resourceSelection);
    const collateralLoss = (amount * 0.5) / activeDeposits.length;
    for (const other of asteroid.deposits) {
      if (selected.has(other.resourceId) || other.oreRemaining <= 0) continue;
      other.oreRemaining = Math.max(0, other.oreRemaining - collateralLoss);
    }
  }

  const tangent = { x: -impact.normal.y, y: impact.normal.x };
  const spread = Math.sin(chunkCounter * 2.17) * 0.42;
  const speed = 24 + (chunkCounter % 4) * 4;
  const direction = {
    x: impact.normal.x + tangent.x * spread,
    y: impact.normal.y + tangent.y * spread,
  };
  const directionLength = Math.max(0.001, Math.hypot(direction.x, direction.y));

  return {
    id: 'chunk-' + seed + '-' + chunkCounter,
    sourceAsteroidId: asteroid.id,
    resourceId: deposit.resourceId,
    position: {
      x: impact.point.x + impact.normal.x * 2,
      y: impact.point.y + impact.normal.y * 2,
    },
    velocity: {
      x: (direction.x / directionLength) * speed,
      y: (direction.y / directionLength) * speed,
    },
    amount,
    ageSeconds: 0,
    tractorActive: false,
  };
}

export function advanceMiningChunk(
  chunk: MiningChunk,
  shipPosition: WorldPoint,
  deltaSeconds: number
): void {
  chunk.ageSeconds += deltaSeconds;
  if (chunk.ageSeconds > 0.42) chunk.tractorActive = true;

  if (chunk.tractorActive) {
    const angle = heading(chunk.position, shipPosition);
    chunk.velocity = {
      x: Math.cos(angle) * 190,
      y: Math.sin(angle) * 190,
    };
  }

  chunk.position = {
    x: chunk.position.x + chunk.velocity.x * deltaSeconds,
    y: chunk.position.y + chunk.velocity.y * deltaSeconds,
  };
}

export function collectMiningChunk(chunk: MiningChunk, collector?: MiningChunkCollector): number {
  const accepted = Math.max(
    0,
    Math.min(chunk.amount, Math.floor(collector?.(chunk.resourceId, chunk.amount) ?? chunk.amount))
  );
  chunk.amount -= accepted;
  return accepted;
}

export interface MiningChunkCollectionResult {
  readonly remaining: MiningChunk[];
  readonly collected: ReadonlyMap<string, number>;
  readonly samples: readonly CollectedMiningSample[];
}

export function advanceAndCollectMiningChunks(
  chunks: readonly MiningChunk[],
  shipPosition: WorldPoint,
  deltaSeconds: number,
  collector?: MiningChunkCollector
): MiningChunkCollectionResult {
  const remaining: MiningChunk[] = [];
  const collected = new Map<string, number>();
  const samples: CollectedMiningSample[] = [];

  for (const chunk of chunks) {
    advanceMiningChunk(chunk, shipPosition, deltaSeconds);
    if (distance(chunk.position, shipPosition) < 24) {
      const accepted = collectMiningChunk(chunk, collector);
      if (accepted > 0) {
        collected.set(chunk.resourceId, (collected.get(chunk.resourceId) ?? 0) + accepted);
        samples.push({
          sourceAsteroidId: chunk.sourceAsteroidId,
          resourceId: chunk.resourceId,
          amount: accepted,
        });
      }
    }
    if (chunk.amount > 0) remaining.push(chunk);
  }

  return { remaining, collected, samples };
}
