import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningEventResolution,
  MiningImpact,
  MiningPhase,
  MiningResourceSelection,
} from '../../core/local-space-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import {
  createShieldWorldGeometry,
  resolveAsteroidCollisions,
  resolveShieldCollisions,
  type ShieldWorldGeometry,
} from './local-space-collision';
import {
  advanceAutopilotRoute,
  faceAutopilotTarget,
  resetAutopilotMotion,
} from './local-space-autopilot';
import { integrateAsteroids } from './local-space-physics';
import { calculateMiningImpact } from './mining-impact';
import { localShipVelocity } from './local-space-ship-velocity';
import {
  advanceAndCollectMiningChunks,
  createMiningChunk,
  hasMineableDeposits,
  identifyMinedResource,
  type MiningChunkCollector,
} from './mining-chunk-service';
import { advanceMiningFormation } from './local-space-mining-formation';
import {
  runLongRangeAsteroidScan,
  selectedAsteroid,
  selectedRouteOptions,
} from './local-space-scanning';
import {
  createIdleStationKeepingState,
  resetIdleStationKeeping,
  updateIdleStationKeeping,
  type IdleStationKeepingState,
} from './local-space-station-keeping';
import type { LocalSpaceService } from './local-space-api';
import { createMiningEventController } from './mining-event-service';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';
import type { LocalSpaceServiceOptions } from './local-space-options';
import { createLocalSpaceShipSystems } from './local-space-ship-systems';

class LocalSpaceRuntime implements LocalSpaceService {
  private readonly instance: LocalSpaceInstance;
  private readonly approachSpeed: number;
  private readonly shield: ShieldWorldGeometry;
  private readonly hardpoints: ShipHardpoints;
  private readonly nominalLengthMeters: number;
  private readonly miningEnabled: boolean;
  private readonly miningCycleSeconds: number;
  private readonly miningYieldMultiplier: number;
  private readonly shipSystems: ReturnType<typeof createLocalSpaceShipSystems>;
  private readonly miningEvents: ReturnType<typeof createMiningEventController>;
  private readonly onMiningChunkCollected: MiningChunkCollector | undefined;
  private selectedAsteroidId: string | null = null;
  private miningTargetId: string | null = null;
  private scanTargetId: string | null = null;
  private approachPurpose: 'mining' | 'scan' | null = null;
  private miningPhase: MiningPhase = 'idle';
  private readonly miningResourceSelections = new Map<string, readonly string[]>();
  private approachRoute: readonly WorldPoint[] = [];
  private approachIndex = 0;
  private navigationTarget: WorldPoint | null = null;
  private navigationRoute: readonly WorldPoint[] = [];
  private navigationIndex = 0;
  private collectedOre = 0;
  private readonly collectedResources = new Map<string, number>();
  private miningAccumulator = 0;
  private chunkCounter = 0;
  private miningHoldOffset: WorldPoint | null = null;
  private stationKeepingPosition: WorldPoint;
  private shipForwardVelocity = 0;
  private shipLateralVelocity = 0;
  private readonly idleStationKeeping: IdleStationKeepingState;
  private longRangeScanElapsed = 0;
  private shortRangeScanElapsed = 0;
  private longRangeScanParameters: { sensorModifier: number; crewSkill: number } | null = null;

  constructor(options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    this.approachSpeed = options.approachSpeed;
    this.hardpoints = options.hardpoints;
    this.nominalLengthMeters = options.nominalLengthMeters;
    this.miningEnabled = options.mining?.enabled ?? true;
    this.miningCycleSeconds = Math.max(0.05, options.mining?.cycleSeconds ?? 0.42);
    this.miningYieldMultiplier = Math.max(0, options.mining?.yieldMultiplier ?? 1);
    this.shipSystems = createLocalSpaceShipSystems(options.systems, options.hardpoints);
    this.miningEvents = createMiningEventController(options.instance.seed);
    this.onMiningChunkCollected = options.onMiningChunkCollected;
    this.shield = createShieldWorldGeometry(options.hardpoints, options.nominalLengthMeters);
    this.stationKeepingPosition = { ...options.instance.ship.position };
    this.idleStationKeeping = createIdleStationKeepingState(
      options.instance.seed,
      options.instance.ship
    );
  }

  getSnapshot(): LocalSpaceSnapshot {
    return {
      instance: this.instance,
      selectedAsteroidId: this.selectedAsteroidId,
      miningTargetId: this.miningTargetId,
      scanTargetId: this.scanTargetId,
      navigationTarget: this.navigationTarget,
      navigationRoute: this.navigationRoute,
      longRangeScanProgress: this.longRangeScanParameters
        ? Math.min(1, this.longRangeScanElapsed / 5)
        : null,
      shortRangeScanProgress:
        this.miningPhase === 'scanning' ? Math.min(1, this.shortRangeScanElapsed / 5) : null,
      miningPhase: this.miningPhase,
      miningAvailable: this.miningEnabled,
      miningResourceSelection: this.miningSelectionFor(this.selectedAsteroidId),
      miningEvent: this.miningEvents.pending,
      miningRecoverySeconds: this.miningEvents.recoverySeconds,
      ...this.shipSystems.snapshot(),
      collectedOre: this.collectedOre,
      collectedResources: [...this.collectedResources.entries()].map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
      laserActive: this.miningPhase === 'extracting' && !this.miningEvents.extractionPaused,
      miningImpact: this.currentMiningImpact(),
    };
  }

  selectAsteroid(id: string | null): LocalSpaceSnapshot {
    const asteroid = this.findAsteroid(id);
    if (id && (!asteroid || asteroid.kind !== 'resource')) {
      throw new Error('Unknown mineable asteroid: ' + id);
    }
    this.selectedAsteroidId = id;
    return this.getSnapshot();
  }

  setMiningResourceSelection(resourceIds: MiningResourceSelection): LocalSpaceSnapshot {
    if (this.miningPhase !== 'idle') return this.getSnapshot();
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    if (!asteroid || asteroid.scanLevel !== 'analyzed') return this.getSnapshot();
    if (resourceIds === null) {
      this.miningResourceSelections.delete(asteroid.id);
      return this.getSnapshot();
    }

    const unique = [...new Set(resourceIds)];
    if (unique.length < 1 || unique.length > 2) {
      throw new Error('Targeted mining requires one or two resources.');
    }
    const available = new Set(asteroid.deposits.map((deposit) => deposit.resourceId));
    if (unique.some((resourceId) => !available.has(resourceId))) {
      throw new Error('Unknown asteroid resource selected for mining.');
    }
    this.miningResourceSelections.set(asteroid.id, [...unique]);
    return this.getSnapshot();
  }

  getMiningRouteOptions(): RoutePlanningOptions | null {
    return selectedRouteOptions(this.instance, this.selectedAsteroidId, this.shield);
  }

  getShortRangeScanRouteOptions(): RoutePlanningOptions | null {
    return selectedRouteOptions(this.instance, this.selectedAsteroidId, this.shield);
  }

  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions {
    return {
      start: this.instance.ship.position,
      target,
      asteroids: this.instance.asteroids,
      clearance: Math.max(this.shield.radiusX, this.shield.radiusY) + 24,
      width: this.instance.width,
      height: this.instance.height,
    };
  }

  startNavigation(target: WorldPoint, route: readonly WorldPoint[]): LocalSpaceSnapshot {
    if (this.miningEvents.pending || route.length < 2) return this.getSnapshot();
    if (this.miningPhase !== 'idle') this.finishMining();

    this.navigationTarget = { ...target };
    this.navigationRoute = route;
    this.navigationIndex = 1;
    resetAutopilotMotion(this.instance.ship);
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
    return this.getSnapshot();
  }

  startLongRangeScan(sensorModifier?: number, crewSkill?: number): LocalSpaceSnapshot {
    if (!this.shipSystems.scanAvailable) return this.getSnapshot();
    if (!this.longRangeScanParameters) {
      this.longRangeScanElapsed = 0;
      this.longRangeScanParameters = {
        sensorModifier: sensorModifier ?? this.shipSystems.sensorModifier,
        crewSkill: crewSkill ?? this.shipSystems.sensorCrewSkill,
      };
    }
    return this.getSnapshot();
  }

  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot {
    if (!this.miningEnabled || this.miningEvents.pending) return this.getSnapshot();
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    const selection = this.miningSelectionFor(asteroid?.id ?? null);
    if (!asteroid || !hasMineableDeposits(asteroid, selection)) return this.getSnapshot();

    this.miningTargetId = asteroid.id;
    this.scanTargetId = null;
    this.approachPurpose = 'mining';
    this.miningPhase = 'approaching';
    this.prepareApproach(route);
    return this.getSnapshot();
  }

  startShortRangeScan(route: readonly WorldPoint[]): LocalSpaceSnapshot {
    if (!this.shipSystems.scanAvailable || this.miningEvents.pending) return this.getSnapshot();
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    if (!asteroid) return this.getSnapshot();

    this.scanTargetId = asteroid.id;
    this.miningTargetId = null;
    this.approachPurpose = 'scan';
    this.shortRangeScanElapsed = 0;
    this.miningPhase = 'approaching';
    this.prepareApproach(route);
    return this.getSnapshot();
  }

  resolveMiningEvent(choiceId: string): MiningEventResolution | null {
    const asteroid = this.findAsteroid(this.miningTargetId);
    if (!asteroid) return null;
    const result = this.miningEvents.resolve(asteroid, choiceId, (fraction) =>
      this.shipSystems.damageHullFraction(fraction)
    );
    if (
      result?.aborted ||
      !hasMineableDeposits(asteroid, this.miningSelectionFor(asteroid.id))
    ) {
      this.finishMining();
    }
    return result;
  }

  cancelMining(): LocalSpaceSnapshot {
    this.finishMining();
    return this.getSnapshot();
  }

  syncCombatPose(position: WorldPoint, headingRadians: number, speed: number): LocalSpaceSnapshot {
    this.instance.ship.position = {
      x: Math.max(0, Math.min(this.instance.width, position.x)),
      y: Math.max(0, Math.min(this.instance.height, position.y)),
    };
    this.instance.ship.headingRadians = headingRadians;
    this.instance.ship.speed = Math.max(0, speed);
    this.navigationTarget = null;
    this.navigationRoute = [];
    this.navigationIndex = 0;
    this.approachRoute = [];
    this.approachIndex = 0;
    this.miningPhase = 'idle';
    this.miningTargetId = null;
    this.scanTargetId = null;
    this.approachPurpose = null;
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
    return this.getSnapshot();
  }


  tick(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shipSystems.advance(clamped);
    this.updateLongRangeScan(clamped);
    integrateAsteroids(this.instance.asteroids, clamped, this.instance.width, this.instance.height);
    resolveAsteroidCollisions(this.instance.asteroids);

    const asteroid = this.findAsteroid(this.activeTargetId());
    if (!asteroid && this.miningPhase !== 'idle') {
      this.finishMining();
    } else if (this.miningPhase === 'idle' && this.navigationTarget) {
      this.updateManualNavigation(clamped);
    } else if (this.miningPhase === 'idle') {
      this.updatePassiveStationKeeping(clamped);
    } else if (asteroid && this.miningPhase === 'approaching') {
      this.updateApproach(clamped, asteroid);
    } else if (asteroid && this.miningPhase === 'scanning') {
      this.updateShortRangeScan(clamped, asteroid);
    } else if (asteroid && this.miningPhase === 'extracting') {
      this.updateMining(clamped, asteroid);
    }

    const collisions = resolveShieldCollisions(
      this.instance.ship,
      localShipVelocity(this.instance.ship, {
        miningPhase: this.miningPhase,
        shipForwardVelocity: this.shipForwardVelocity,
        shipLateralVelocity: this.shipLateralVelocity,
        idleLateralVelocity: this.idleStationKeeping.lateralVelocity,
      }),
      this.instance.asteroids,
      this.shield
    );
    for (const collision of collisions) this.shipSystems.applyCollision(collision);

    this.updateChunks(clamped);
    return this.getSnapshot();
  }

  private updateLongRangeScan(deltaSeconds: number): void {
    if (!this.longRangeScanParameters) return;
    this.longRangeScanElapsed += deltaSeconds;
    if (this.longRangeScanElapsed < 5) return;

    runLongRangeAsteroidScan(
      this.instance,
      this.longRangeScanParameters.sensorModifier,
      this.longRangeScanParameters.crewSkill
    );
    this.longRangeScanElapsed = 0;
    this.longRangeScanParameters = null;
  }

  private prepareApproach(route: readonly WorldPoint[]): void {
    this.finishManualNavigation();
    this.miningAccumulator = 0;
    resetAutopilotMotion(this.instance.ship);
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    this.miningHoldOffset = null;
    this.approachRoute = route;
    this.approachIndex = this.approachRoute.length > 1 ? 1 : 0;
  }

  private activeTargetId(): string | null {
    return this.approachPurpose === 'scan' ? this.scanTargetId : this.miningTargetId;
  }

  private findAsteroid(id: string | null): LocalAsteroid | null {
    return selectedAsteroid(this.instance, id);
  }

  private miningSelectionFor(asteroidId: string | null): MiningResourceSelection {
    if (!asteroidId) return null;
    return this.miningResourceSelections.get(asteroidId) ?? null;
  }

  private currentMiningImpact(): MiningImpact | null {
    if (this.miningPhase !== 'extracting' || this.miningEvents.extractionPaused) return null;
    const asteroid = this.findAsteroid(this.miningTargetId);
    if (!asteroid) return null;
    return calculateMiningImpact(
      this.instance.ship,
      asteroid,
      this.hardpoints,
      this.nominalLengthMeters
    );
  }

  private finishMining(): void {
    this.miningPhase = 'idle';
    this.miningTargetId = null;
    this.scanTargetId = null;
    this.approachPurpose = null;
    this.miningAccumulator = 0;
    this.miningEvents.clear();
    this.shortRangeScanElapsed = 0;
    this.approachRoute = [];
    this.approachIndex = 0;
    resetAutopilotMotion(this.instance.ship);
    this.miningHoldOffset = null;
    this.stationKeepingPosition = { ...this.instance.ship.position };
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
    this.shipForwardVelocity *= 0.25;
    this.shipLateralVelocity *= 0.35;
  }

  private updateManualNavigation(deltaSeconds: number): void {
    const result = advanceAutopilotRoute(
      this.instance.ship,
      this.navigationRoute,
      this.navigationIndex,
      this.approachSpeed,
      deltaSeconds,
      true,
      true
    );
    this.navigationIndex = result.nextIndex;
    if (result.completed) this.finishManualNavigation();
  }

  private finishManualNavigation(): void {
    this.navigationTarget = null;
    this.navigationRoute = [];
    this.navigationIndex = 0;
    resetAutopilotMotion(this.instance.ship);
    this.stationKeepingPosition = { ...this.instance.ship.position };
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
  }

  private updateApproach(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const result = advanceAutopilotRoute(
      this.instance.ship,
      this.approachRoute,
      this.approachIndex,
      this.approachSpeed,
      deltaSeconds,
      false,
      true
    );
    this.approachIndex = result.nextIndex;
    if (result.completed) this.finishApproachFacing(deltaSeconds, asteroid);
  }

  private finishApproachFacing(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    if (!faceAutopilotTarget(ship, asteroid.position, deltaSeconds)) return;

    if (this.approachPurpose === 'scan') {
      resetAutopilotMotion(ship);
      this.stationKeepingPosition = { ...ship.position };
      this.shipForwardVelocity = 0;
      this.shipLateralVelocity = 0;
      this.shortRangeScanElapsed = 0;
      this.miningPhase = 'scanning';
      return;
    }

    if (!hasMineableDeposits(asteroid, this.miningSelectionFor(asteroid.id))) {
      this.finishMining();
      return;
    }

    this.miningHoldOffset = {
      x: ship.position.x - asteroid.position.x,
      y: ship.position.y - asteroid.position.y,
    };
    this.stationKeepingPosition = { ...ship.position };
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    this.miningEvents.begin(asteroid);
    this.miningPhase = 'extracting';
  }

  private updateShortRangeScan(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.shortRangeScanElapsed += deltaSeconds;
    updateIdleStationKeeping(
      this.idleStationKeeping,
      this.instance.ship,
      this.stationKeepingPosition,
      this.instance.seed,
      deltaSeconds
    );
    if (this.shortRangeScanElapsed < 5) return;

    asteroid.scanLevel = 'analyzed';
    for (const deposit of asteroid.deposits) deposit.identified = true;
    this.finishMining();
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.updateMiningFormation(deltaSeconds, asteroid);
    if (this.miningEvents.pauseExtraction(asteroid, deltaSeconds)) return;

    this.miningAccumulator += deltaSeconds;
    const cycleSeconds = this.miningEvents.cycleSeconds(this.miningCycleSeconds);
    const selection = this.miningSelectionFor(asteroid.id);
    while (
      this.miningAccumulator >= cycleSeconds &&
      hasMineableDeposits(asteroid, selection)
    ) {
      this.miningAccumulator -= cycleSeconds;
      this.spawnChunk(asteroid);
    }

    if (!hasMineableDeposits(asteroid, selection)) this.finishMining();
  }

  private updatePassiveStationKeeping(deltaSeconds: number): void {
    updateIdleStationKeeping(
      this.idleStationKeeping,
      this.instance.ship,
      this.stationKeepingPosition,
      this.instance.seed,
      deltaSeconds
    );
  }

  private updateMiningFormation(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const velocity = advanceMiningFormation({
      ship: this.instance.ship,
      asteroid,
      asteroids: this.instance.asteroids,
      holdOffset: this.miningHoldOffset,
      shieldRadiusX: this.shield.radiusX,
      forwardVelocity: this.shipForwardVelocity,
      lateralVelocity: this.shipLateralVelocity,
      deltaSeconds,
    });
    this.shipForwardVelocity = velocity.forward;
    this.shipLateralVelocity = velocity.lateral;
  }

  private spawnChunk(asteroid: LocalAsteroid): void {
    const chunk = createMiningChunk(
      asteroid,
      this.instance.ship,
      this.hardpoints,
      this.nominalLengthMeters,
      this.instance.seed,
      this.chunkCounter,
      this.miningYieldMultiplier,
      this.miningSelectionFor(asteroid.id)
    );
    if (!chunk) return;
    this.instance.chunks.push(chunk);
    this.chunkCounter += 1;
  }

  private updateChunks(deltaSeconds: number): void {
    const result = advanceAndCollectMiningChunks(
      this.instance.chunks,
      this.instance.ship.position,
      deltaSeconds,
      this.onMiningChunkCollected
    );
    for (const [resourceId, amount] of result.collected) {
      this.collectedOre += amount;
      this.collectedResources.set(
        resourceId,
        (this.collectedResources.get(resourceId) ?? 0) + amount
      );
    }
    for (const sample of result.samples) {
      const asteroid = this.findAsteroid(sample.sourceAsteroidId);
      if (asteroid) identifyMinedResource(asteroid, sample.resourceId);
    }
    this.instance.chunks.splice(0, this.instance.chunks.length, ...result.remaining);
  }
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  return new LocalSpaceRuntime(options);
}
