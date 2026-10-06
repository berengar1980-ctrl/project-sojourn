import type { ShieldImpactEffect, ShieldState } from '../../core/shield-types';
import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import type {
  LocalAsteroid,
  LocalHullState,
  LocalReactorState,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningEventState,
  MiningImpact,
  MiningPhase,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import { miningResourceById } from '../../data/resources/mining-resources';

export interface LocalAsteroidDepositView {
  readonly resourceId: string | null;
  readonly resourceName: string | null;
  readonly estimatedAmount: number | null;
  readonly capacity: number | null;
}

export interface LocalAsteroidView {
  readonly id: string;
  readonly kind: LocalAsteroid['kind'];
  readonly routeBlocking: boolean;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly rotation: number;
  readonly scanLevel: LocalAsteroid['scanLevel'];
  readonly surveyResult: 'unknown' | 'empty' | 'deposit';
  readonly deposits: readonly LocalAsteroidDepositView[];
  readonly totalRemaining: number | null;
  readonly totalCapacity: number | null;
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

export interface LocalCargoResourceView {
  readonly resourceId: string;
  readonly name: string;
  readonly amount: number;
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
  readonly navigationTarget: WorldPoint | null;
  readonly navigationRoute: readonly WorldPoint[];
  readonly longRangeScanProgress: number | null;
  readonly shortRangeScanProgress: number | null;
  readonly miningPhase: MiningPhase;
  readonly miningAvailable: boolean;
  readonly miningEvent: MiningEventState | null;
  readonly miningRecoverySeconds: number;
  readonly scanAvailable: boolean;
  readonly hull: LocalHullState;
  readonly reactor: LocalReactorState;
  readonly laserActive: boolean;
  readonly miningImpact: MiningImpact | null;
  readonly shield: ShieldState;
  readonly shieldImpacts: readonly ShieldImpactEffect[];
  readonly collectedOre: number;
  readonly cargoResources: readonly LocalCargoResourceView[];
}

function estimateResourceAmount(amount: number): number {
  if (amount <= 0) return 0;
  const step = amount >= 250 ? 25 : amount >= 100 ? 10 : 5;
  return Math.max(step, Math.round(amount / step) * step);
}

function mapAsteroid(asteroid: LocalAsteroid, snapshot: LocalSpaceSnapshot): LocalAsteroidView {
  const surveyed = asteroid.scanLevel !== 'unscanned';
  const analyzed = asteroid.scanLevel === 'analyzed';
  const deposits = asteroid.deposits.map((deposit) => ({
    resourceId: analyzed ? deposit.resourceId : null,
    resourceName: analyzed ? deposit.oreType : null,
    estimatedAmount: analyzed ? estimateResourceAmount(deposit.oreRemaining) : null,
    capacity: analyzed ? deposit.oreCapacity : null,
  }));

  return {
    id: asteroid.id,
    kind: asteroid.kind,
    routeBlocking: asteroid.routeBlocking,
    position: asteroid.position,
    radius: asteroid.radius,
    rotation: asteroid.rotation,
    scanLevel: asteroid.scanLevel,
    surveyResult: !surveyed ? 'unknown' : deposits.length > 0 ? 'deposit' : 'empty',
    deposits,
    totalRemaining: analyzed
      ? asteroid.deposits.reduce((sum, deposit) => sum + deposit.oreRemaining, 0)
      : null,
    totalCapacity: analyzed
      ? asteroid.deposits.reduce((sum, deposit) => sum + deposit.oreCapacity, 0)
      : null,
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

function mapCargo(snapshot: LocalSpaceSnapshot): LocalCargoResourceView[] {
  return snapshot.collectedResources
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({
      resourceId: entry.resourceId,
      name: miningResourceById(entry.resourceId)?.name ?? entry.resourceId,
      amount: entry.amount,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
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
    navigationTarget: snapshot.navigationTarget,
    navigationRoute: snapshot.navigationRoute,
    longRangeScanProgress: snapshot.longRangeScanProgress,
    shortRangeScanProgress: snapshot.shortRangeScanProgress,
    miningPhase: snapshot.miningPhase,
    miningAvailable: snapshot.miningAvailable,
    miningEvent: snapshot.miningEvent,
    miningRecoverySeconds: snapshot.miningRecoverySeconds,
    scanAvailable: snapshot.scanAvailable,
    hull: snapshot.hull,
    reactor: snapshot.reactor,
    laserActive: snapshot.laserActive,
    miningImpact: snapshot.miningImpact,
    shield: snapshot.shield,
    shieldImpacts: snapshot.shieldImpacts,
    collectedOre: snapshot.collectedOre,
    cargoResources: mapCargo(snapshot),
  };
}
