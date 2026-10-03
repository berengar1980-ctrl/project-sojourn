import type { ShieldImpactEffect, ShieldState } from '../../core/shield-types';
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
  readonly scanLevel: LocalAsteroid['scanLevel'];
  readonly surveyResult: 'unknown' | 'empty' | 'deposit';
  readonly resourceName: string | null;
  readonly resourceAmount: number | null;
  readonly resourceCapacity: number | null;
  readonly isSelected: boolean;
  readonly isMiningTarget: boolean;
  readonly isScanTarget: boolean;
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
  readonly scanTarget: LocalAsteroidView | null;
  readonly miningPhase: MiningPhase;
  readonly laserActive: boolean;
  readonly miningImpact: MiningImpact | null;
  readonly shield: ShieldState;
  readonly shieldImpacts: readonly ShieldImpactEffect[];
  readonly collectedOre: number;
  readonly collectedResources: LocalSpaceSnapshot['collectedResources'];
}

function mapAsteroid(asteroid: LocalAsteroid, snapshot: LocalSpaceSnapshot): LocalAsteroidView {
  const surveyed = asteroid.scanLevel !== 'unscanned';
  const analyzed = asteroid.scanLevel === 'analyzed';

  return {
    id: asteroid.id,
    kind: asteroid.kind,
    routeBlocking: asteroid.routeBlocking,
    position: asteroid.position,
    radius: asteroid.radius,
    rotation: asteroid.rotation,
    scanLevel: asteroid.scanLevel,
    surveyResult: !surveyed ? 'unknown' : asteroid.resourceId ? 'deposit' : 'empty',
    resourceName: analyzed && asteroid.resourceId ? asteroid.oreType : null,
    resourceAmount: analyzed ? asteroid.oreRemaining : null,
    resourceCapacity: analyzed ? asteroid.oreCapacity : null,
    isSelected: asteroid.id === snapshot.selectedAsteroidId,
    isMiningTarget: asteroid.id === snapshot.miningTargetId,
    isScanTarget: asteroid.id === snapshot.scanTargetId,
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
  const scanTarget = asteroids.find((asteroid) => asteroid.isScanTarget) ?? null;

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
    scanTarget,
    miningPhase: snapshot.miningPhase,
    laserActive: snapshot.laserActive,
    miningImpact: snapshot.miningImpact,
    shield: snapshot.shield,
    shieldImpacts: snapshot.shieldImpacts,
    collectedOre: snapshot.collectedOre,
    collectedResources: snapshot.collectedResources,
  };
}
