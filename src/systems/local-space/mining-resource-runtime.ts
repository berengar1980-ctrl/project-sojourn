import type {
  LocalAsteroid,
  LocalSpaceInstance,
  MiningResourceSelection,
  ResourceCargoEntry,
} from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import {
  advanceAndCollectMiningChunks,
  createMiningChunk,
  identifyMinedResource,
  type MiningChunkCollector,
} from './mining-chunk-service';

export interface MiningResourceRuntimeSnapshot {
  readonly collectedOre: number;
  readonly collectedResources: readonly ResourceCargoEntry[];
}

export class MiningResourceRuntime {
  private readonly selections = new Map<string, readonly string[]>();
  private collectedOre = 0;
  private readonly collectedResources = new Map<string, number>();
  private chunkCounter = 0;

  constructor(
    private readonly instance: LocalSpaceInstance,
    private readonly hardpoints: ShipHardpoints,
    private readonly nominalLengthMeters: number,
    private readonly yieldMultiplier: number,
    private readonly collector?: MiningChunkCollector
  ) {
    const prefix = 'chunk-' + instance.seed + '-';
    for (const chunk of instance.chunks) {
      if (!chunk.id.startsWith(prefix)) continue;
      const index = Number(chunk.id.slice(prefix.length));
      if (Number.isSafeInteger(index) && index >= 0) {
        this.chunkCounter = Math.max(this.chunkCounter, index + 1);
      }
    }
  }

  selectionFor(asteroidId: string | null): MiningResourceSelection {
    if (!asteroidId) return null;
    return this.selections.get(asteroidId) ?? null;
  }

  setSelection(asteroid: LocalAsteroid, resourceIds: MiningResourceSelection): void {
    if (resourceIds === null) {
      this.selections.delete(asteroid.id);
      return;
    }

    const unique = [...new Set(resourceIds)];
    if (unique.length < 1 || unique.length > 2) {
      throw new Error('Targeted mining requires one or two resources.');
    }

    const available = new Set(asteroid.deposits.map((deposit) => deposit.resourceId));
    if (unique.some((resourceId) => !available.has(resourceId))) {
      throw new Error('Unknown asteroid resource selected for mining.');
    }
    this.selections.set(asteroid.id, [...unique]);
  }

  snapshot(): MiningResourceRuntimeSnapshot {
    return {
      collectedOre: this.collectedOre,
      collectedResources: [...this.collectedResources.entries()].map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
    };
  }

  spawnChunk(asteroid: LocalAsteroid): void {
    const chunk = createMiningChunk(
      asteroid,
      this.instance.ship,
      this.hardpoints,
      this.nominalLengthMeters,
      this.instance.seed,
      this.chunkCounter,
      this.yieldMultiplier,
      this.selectionFor(asteroid.id)
    );
    if (!chunk) return;
    this.instance.chunks.push(chunk);
    this.chunkCounter += 1;
  }

  advanceChunks(ship: LocalSpaceInstance['ship'], deltaSeconds: number): void {
    const result = advanceAndCollectMiningChunks(
      this.instance.chunks,
      ship,
      this.hardpoints,
      this.nominalLengthMeters,
      deltaSeconds,
      this.collector
    );

    for (const [resourceId, amount] of result.collected) {
      this.collectedOre += amount;
      this.collectedResources.set(
        resourceId,
        (this.collectedResources.get(resourceId) ?? 0) + amount
      );
    }

    for (const sample of result.samples) {
      const asteroid = this.instance.asteroids.find(
        (candidate) => candidate.id === sample.sourceAsteroidId
      );
      if (asteroid) identifyMinedResource(asteroid, sample.resourceId);
    }

    this.instance.chunks.splice(0, this.instance.chunks.length, ...result.remaining);
  }
}
