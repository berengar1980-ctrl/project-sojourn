import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type {
  LocalAsteroid,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningImpact,
  MiningPhase,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

export interface LocalAsteroidView {
  readonly id: string;
  readonly kind: LocalAsteroid['kind'];
  readonly routeBlocking: boolean;
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
  readonly turnRateRadiansPerSecond: number;
  readonly angularThrust: number;
  readonly lateralThrust: number;
  readonly speed: number;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
}

export interface LocalSpaceViewModel {
  readonly title: string;
  readonly backgroundSeed: number;
  readonly width: number;
  readonly height: number;
  readonly ship: LocalShipView;
  readonly asteroids: readonly LocalAsteroidView[];
  readonly chunks: readonly LocalChunkView[];
  readonly selectedAsteroid: LocalAsteroidView | null;
  readonly miningTarget: LocalAsteroidView | null;
  readonly miningPhase: MiningPhase;
  readonly laserActive: boolean;
  readonly miningImpact: MiningImpact | null;
  readonly shieldFlash: number;
  readonly collectedOre: number;
}

function mapAsteroid(asteroid: LocalAsteroid, snapshot: LocalSpaceSnapshot): LocalAsteroidView {
  return {
    id: asteroid.id,
    kind: asteroid.kind,
    routeBlocking: asteroid.routeBlocking,
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
    backgroundSeed: snapshot.instance.seed,
    width: snapshot.instance.width,
    height: snapshot.instance.height,
    ship: {
      position: snapshot.instance.ship.position,
      headingRadians: snapshot.instance.ship.headingRadians,
      turnRateRadiansPerSecond: snapshot.instance.ship.turnRateRadiansPerSecond,
      angularThrust: snapshot.instance.ship.angularThrust,
      lateralThrust: snapshot.instance.ship.lateralThrust,
      speed: snapshot.instance.ship.speed,
      nominalLengthMeters: ship.nominalLengthMeters,
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
    miningImpact: snapshot.miningImpact,
    shieldFlash: snapshot.shieldFlash,
    collectedOre: snapshot.collectedOre,
  };
}
