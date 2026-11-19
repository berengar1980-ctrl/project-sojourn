import type { StrategicCombatSnapshot } from '../../systems/combat/strategic-combat-service';
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
  readonly claimOwnerId?: string | null;
  readonly registeredOre?: readonly { resourceName: string; amount: number }[];
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

export interface LocalNpcShipView {
  readonly id: string;
  readonly name: string;
  readonly position: WorldPoint;
  readonly headingRadians: number;
  readonly speed: number;
  readonly phase: 'entering' | 'approaching' | 'scanning' | 'mining' | 'exiting';
  readonly targetAsteroidId: string | null;
  readonly laserActive: boolean;
  readonly oreCollection?: {
    readonly resourceId: string;
    readonly remainingSeconds: number;
    readonly durationSeconds: number;
  };
  readonly scanProgress?: number;
  readonly nominalLengthMeters: number;
  readonly spriteUrl: string;
  readonly spriteAspectRatio: number;
  readonly hardpoints: ShipHardpoints;
  readonly isSelected?: boolean;
  readonly isPirate?: boolean;
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
  readonly selectedAsteroidClaimOwner?: string | null;
  readonly securityDrone?: {
    readonly position: WorldPoint;
    readonly scanRadius: number;
    readonly operational: boolean;
    readonly shieldContactSeconds?: number;
  } | null;
  readonly title: string;
  readonly backgroundSeed: number;
  readonly width: number;
  readonly height: number;
  readonly ship: LocalShipView;
  readonly npcShips: readonly LocalNpcShipView[];
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
  readonly miningResourceSelection: readonly string[] | null;
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
  readonly combat: StrategicCombatSnapshot | null;
  readonly npcCombats?: readonly StrategicCombatSnapshot[];
}

function estimateResourceAmount(amount: number): number {
  if (amount <= 0) return 0;
  const step = amount >= 250 ? 25 : amount >= 100 ? 10 : 5;
  return Math.max(step, Math.round(amount / step) * step);
}

function mapAsteroid(asteroid: LocalAsteroid, snapshot: LocalSpaceSnapshot): LocalAsteroidView {
  const surveyed = asteroid.scanLevel !== 'unscanned';
  const analyzed = asteroid.scanLevel === 'analyzed';
  const deposits = asteroid.deposits.map((deposit) => {
    const identified = analyzed || deposit.identified;
    return {
      resourceId: identified ? deposit.resourceId : null,
      resourceName: identified ? deposit.oreType : null,
      estimatedAmount: analyzed ? estimateResourceAmount(deposit.oreRemaining) : null,
      capacity: analyzed ? deposit.oreCapacity : null,
    };
  });

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
  title: string,
  npcShips: readonly LocalNpcShipView[] = [],
  selectedNpcId: string | null = null,
  combat: StrategicCombatSnapshot | null = null
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
      position: combat?.attacker.position ?? snapshot.instance.ship.position,
      headingRadians: combat?.attacker.headingRadians ?? snapshot.instance.ship.headingRadians,
      turnRateRadiansPerSecond: snapshot.instance.ship.turnRateRadiansPerSecond,
      angularThrust: snapshot.instance.ship.angularThrust,
      lateralThrust: snapshot.instance.ship.lateralThrust,
      speed: combat?.attacker.speed ?? snapshot.instance.ship.speed,
      nominalLengthMeters: ship.nominalLengthMeters,
      spriteUrl: ship.sprite.assetUrl,
      spriteAspectRatio: ship.sprite.widthPx / ship.sprite.heightPx,
      hardpoints: ship.sprite.hardpoints,
    },
    npcShips: npcShips.map((npc) => {
      if (combat?.defender.id === npc.id) {
        return {
          ...npc,
          position: combat.defender.position,
          headingRadians: combat.defender.headingRadians,
          speed: combat.defender.speed,
          isSelected: true,
        };
      }
      return { ...npc, isSelected: npc.id === selectedNpcId };
    }),
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
    miningResourceSelection: snapshot.miningResourceSelection,
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
    combat,
  };
}
