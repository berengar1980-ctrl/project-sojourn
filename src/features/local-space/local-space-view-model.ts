import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type {
  LocalAsteroid,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningPhase,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

export interface LocalAsteroidView {
  readonly id: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly rotation: number;
  readonly oreType: string;
  readonly oreRemaining: number;
  readonly oreCapacity: number;
  readonly isSelected: boolean;
  readonly isMiningTarget: boolean;
}

export interface LocalChunkView {
  readonly id: string;
  readonly position: WorldPoint;
  readonly amount: number;
  readonly tractorActive: boolean;
}

export interface LocalShipView {
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
}

export interface LocalSpaceViewModel {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly ship: LocalShipView;
  readonly asteroids: readonly LocalAsteroidView[];
  readonly chunks: readonly LocalChunkView[];
  readonly selectedAsteroid: LocalAsteroidView | null;
  readonly miningTarget: LocalAsteroidView | null;
  readonly miningPhase: MiningPhase;
  readonly laserActive: boolean;
  readonly collectedOre: number;
}

function mapAsteroid(asteroid: LocalAsteroid, snapshot: LocalSpaceSnapshot): LocalAsteroidView {
  return {
    id: asteroid.id,
    position: asteroid.position,
    radius: asteroid.radius,
    rotation: asteroid.rotation,
    oreType: asteroid.oreType,
    oreRemaining: asteroid.oreRemaining,
    oreCapacity: asteroid.oreCapacity,
    isSelected: asteroid.id === snapshot.selectedAsteroidId,
    isMiningTarget: asteroid.id === snapshot.miningTargetId,
  };
}

function mapChunk(chunk: MiningChunk): LocalChunkView {
  return {
    id: chunk.id,
    position: chunk.position,
    amount: chunk.amount,
    tractorActive: chunk.tractorActive,
  };
}

export function createLocalSpaceViewModel(
  snapshot: LocalSpaceSnapshot,
  ship: ShipDefinition,
  title: string
): LocalSpaceViewModel {
  const asteroids = snapshot.instance.asteroids.map((asteroid) => mapAsteroid(asteroid, snapshot));
  const selectedAsteroid = asteroids.find((asteroid) => asteroid.isSelected) ?? null;
  const miningTarget = asteroids.find((asteroid) => asteroid.isMiningTarget) ?? null;

  return {
    title,
    width: snapshot.instance.width,
    height: snapshot.instance.height,
    ship: {
      position: snapshot.instance.ship.position,
      headingRadians: snapshot.instance.ship.headingRadians,
      speed: snapshot.instance.ship.speed,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
      hardpoints: ship.sprite.hardpoints,
    },
    asteroids,
    chunks: snapshot.instance.chunks.map(mapChunk),
    selectedAsteroid,
    miningTarget,
    miningPhase: snapshot.miningPhase,
    laserActive: snapshot.laserActive,
    collectedOre: snapshot.collectedOre,
  };
}
