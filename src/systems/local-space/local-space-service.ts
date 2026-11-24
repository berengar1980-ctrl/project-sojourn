import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningEventResolution,
  MiningImpact,
  MiningPhase,
  MiningResourceSelection,
} from '../../core/local-space-types';
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
import { hasMineableDeposits } from './mining-chunk-service';
import { advanceMiningFormation } from './local-space-mining-formation';
import { selectedAsteroid, selectedRouteOptions } from './local-space-scanning';
import {
  createIdleStationKeepingState,
  resetIdleStationKeeping,
  type IdleStationKeepingState,
} from './local-space-station-keeping';
import type { LocalSpaceService } from './local-space-api';
import { createMiningEventController } from './mining-event-service';
import { MiningResourceRuntime } from './mining-resource-runtime';
import {
  type PointRoutePlanningOptions,
  type RoutePlanningOptions,
} from './local-space-navigation';
import { LocalSpaceAutopilotHazards } from './local-space-autopilot-hazards';
import { LocalSpaceScanClock } from './local-space-scan-clock';
import type { LocalSpaceServiceOptions } from './local-space-options';
import { createLocalSpaceShipSystems } from './local-space-ship-systems';

class LocalSpaceRuntime implements LocalSpaceService {
  private readonly instance: LocalSpaceInstance;
  private readonly approachSpeed: number;
  private readonly turnRateMultiplier: number;
  private readonly shield: ShieldWorldGeometry;
  private readonly miningEnabled: boolean;
  private readonly miningCycleSeconds: number;
  private readonly shipSystems: ReturnType<typeof createLocalSpaceShipSystems>;
  private readonly miningEvents: ReturnType<typeof createMiningEventController>;
  private readonly miningResources: MiningResourceRuntime;
  private readonly hazards: LocalSpaceAutopilotHazards;
  private readonly scanClock: LocalSpaceScanClock;
  private selectedAsteroidId: string | null = null;
  private miningTargetId: string | null = null;
  private scanTargetId: string | null = null;
  private approachPurpose: 'mining' | 'scan' | null = null;
  private miningPhase: MiningPhase = 'idle';
  private approachRoute: readonly WorldPoint[] = [];
  private approachIndex = 0;
  private navigationTarget: WorldPoint | null = null;
  private navigationRoute: readonly WorldPoint[] = [];
  private navigationIndex = 0;
  private miningAccumulator = 0;
  private miningHoldOffset: WorldPoint | null = null;
  private stationKeepingPosition: WorldPoint;
  private shipForwardVelocity = 0;
  private shipLateralVelocity = 0;
  private readonly idleStationKeeping: IdleStationKeepingState;

  constructor(private readonly options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    this.scanClock = new LocalSpaceScanClock(options.instance);
    this.approachSpeed = options.approachSpeed;
    this.turnRateMultiplier = options.turnRateMultiplier ?? 1;
    this.miningEnabled = options.mining?.enabled ?? true;
    this.miningCycleSeconds = Math.max(0.05, options.mining?.cycleSeconds ?? 0.42);
    this.shipSystems = createLocalSpaceShipSystems(options.systems, options.hardpoints);
    this.miningEvents = createMiningEventController(options.instance.seed);
    this.miningResources = new MiningResourceRuntime(
      options.instance,
      options.hardpoints,
      options.nominalLengthMeters,
      Math.max(0, options.mining?.yieldMultiplier ?? 1),
      options.onMiningChunkCollected
    );
    this.shield = createShieldWorldGeometry(options.hardpoints, options.nominalLengthMeters);
    this.hazards = new LocalSpaceAutopilotHazards(
      this.instance,
      this.shield,
      this.approachSpeed,
      options.hazardCrew ?? { piloting: 0, sensors: 0 },
      options.avoidanceRandom ?? Math.random,
      options.onNavigationNotice ?? (() => {}),
      options.additionalObstacles
    );
    this.stationKeepingPosition = { ...options.instance.ship.position };
    this.idleStationKeeping = createIdleStationKeepingState(
      options.instance.seed,
      options.instance.ship
    );
  }

  /** Preserve the complete instantaneous inertial velocity when entering combat. */
  getShipWorldVelocity(): WorldPoint {
    return localShipVelocity(this.instance.ship, {
      miningPhase: this.miningPhase,
      shipForwardVelocity: this.shipForwardVelocity,
      shipLateralVelocity: this.shipLateralVelocity,
      idleLateralVelocity: this.idleStationKeeping.lateralVelocity,
    });
  }

  getSnapshot(): LocalSpaceSnapshot {
    return {
      instance: this.instance,
      selectedAsteroidId: this.selectedAsteroidId,
      miningTargetId: this.miningTargetId,
      scanTargetId: this.scanTargetId,
      navigationTarget: this.navigationTarget,
      navigationRoute: this.navigationRoute,
      longRangeScanProgress: this.scanClock.longProgress(),
      shortRangeScanProgress: this.scanClock.shortProgress(this.miningPhase === 'scanning'),
      miningPhase: this.miningPhase,
      miningAvailable: this.miningEnabled,
      miningResourceSelection: this.miningResources.selectionFor(this.selectedAsteroidId),
      miningEvent: this.miningEvents.pending,
      miningRecoverySeconds: this.miningEvents.recoverySeconds,
      ...this.shipSystems.snapshot(),
      ...this.miningResources.snapshot(),
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
    if (this.miningEvents.pending) return this.getSnapshot();
    // Retargeting a live mining beam must work between extraction cycles.
    // The mining runtime reads this per-asteroid selection on every new chunk.
    const asteroid = this.findAsteroid(this.selectedAsteroidId ?? this.miningTargetId);
    if (!asteroid || asteroid.scanLevel !== 'analyzed') return this.getSnapshot();
    this.miningResources.setSelection(asteroid, resourceIds);
    return this.getSnapshot();
  }

  private navigationObstacles(): readonly LocalAsteroid[] {
    const additional = this.options.additionalObstacles?.() ?? [];
    return additional.length ? [...this.instance.asteroids, ...additional] : this.instance.asteroids;
  }

  getMiningRouteOptions(): RoutePlanningOptions | null {
    const options = selectedRouteOptions(this.instance, this.selectedAsteroidId, this.shield);
    return options ? { ...options, asteroids: this.navigationObstacles() } : null;
  }

  getShortRangeScanRouteOptions(): RoutePlanningOptions | null {
    const options = selectedRouteOptions(this.instance, this.selectedAsteroidId, this.shield);
    return options ? { ...options, asteroids: this.navigationObstacles() } : null;
  }

  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions {
    return {
      start: this.instance.ship.position,
      target,
      asteroids: this.navigationObstacles(),
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
    this.hazards.reset();
    resetAutopilotMotion(this.instance.ship);
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
    return this.getSnapshot();
  }
  startLongRangeScan(sensorModifier?: number, crewSkill?: number): LocalSpaceSnapshot {
    if (!this.shipSystems.scanAvailable) return this.getSnapshot();
    this.scanClock.beginLong(
      sensorModifier ?? this.shipSystems.sensorModifier,
      crewSkill ?? this.shipSystems.sensorCrewSkill
    );
    return this.getSnapshot();
  }
  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot {
    if (!this.miningEnabled || this.miningEvents.pending) return this.getSnapshot();
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    const selection = this.miningResources.selectionFor(asteroid?.id ?? null);
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
    this.scanClock.resetShort();
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
      !hasMineableDeposits(asteroid, this.miningResources.selectionFor(asteroid.id))
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
    this.stationKeepingPosition = { ...this.instance.ship.position };
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

  /** Advance non-flight systems while combat owns both ship and asteroid physics. */
  tickCombatEnvironment(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shipSystems.advance(clamped);
    this.scanClock.advanceLong(clamped);
    this.miningResources.advanceChunks(this.instance.ship, clamped);
    return this.getSnapshot();
  }

  tick(deltaSeconds: number, combatOwnsBodies?: boolean): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shipSystems.advance(clamped);
    this.scanClock.advanceLong(clamped);
    if (!combatOwnsBodies) {
      integrateAsteroids(
        this.instance.asteroids,
        clamped,
        this.instance.width,
        this.instance.height
      );
      resolveAsteroidCollisions(this.instance.asteroids);
    }

    const asteroid = this.findAsteroid(this.activeTargetId());
    if (!asteroid && this.miningPhase !== 'idle') {
      this.finishMining();
    } else if (this.miningPhase === 'idle' && this.navigationTarget) {
      this.updateManualNavigation(clamped);
    } else if (this.miningPhase === 'idle') {
      this.scanClock.keepStation(clamped, this.idleStationKeeping, this.stationKeepingPosition);
    } else if (asteroid && this.miningPhase === 'approaching') {
      this.updateApproach(clamped, asteroid);
    } else if (asteroid && this.miningPhase === 'scanning') {
      this.updateShortRangeScan(clamped, asteroid);
    } else if (asteroid && this.miningPhase === 'extracting') {
      this.updateMining(clamped, asteroid);
    }

    const additional = this.options.additionalObstacles?.() ?? [];
    const collisions = resolveShieldCollisions(
      this.instance.ship,
      localShipVelocity(this.instance.ship, {
        miningPhase: this.miningPhase,
        shipForwardVelocity: this.shipForwardVelocity,
        shipLateralVelocity: this.shipLateralVelocity,
        idleLateralVelocity: this.idleStationKeeping.lateralVelocity,
      }),
      additional.length ? [...this.instance.asteroids, ...additional] : this.instance.asteroids,
      this.shield
    );
    for (const collision of collisions) this.shipSystems.applyCollision(collision);
    if (additional.length && collisions.some((hit) => additional.some((body) => body.id === hit.asteroidId))) {
      this.options.onAdditionalObstacleContact?.();
    }

    this.miningResources.advanceChunks(this.instance.ship, clamped);
    return this.getSnapshot();
  }

  private prepareApproach(route: readonly WorldPoint[]): void {
    this.finishManualNavigation();
    this.miningAccumulator = 0;
    resetAutopilotMotion(this.instance.ship);
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    this.miningHoldOffset = null;
    this.approachRoute = route;
    this.hazards.reset();
    this.approachIndex = this.approachRoute.length > 1 ? 1 : 0;
  }

  private activeTargetId(): string | null {
    return this.approachPurpose === 'scan' ? this.scanTargetId : this.miningTargetId;
  }

  private findAsteroid(id: string | null): LocalAsteroid | null {
    return selectedAsteroid(this.instance, id);
  }

  private currentMiningImpact(): MiningImpact | null {
    if (this.miningPhase !== 'extracting' || this.miningEvents.extractionPaused) return null;
    const asteroid = this.findAsteroid(this.miningTargetId);
    if (!asteroid) return null;
    return calculateMiningImpact(
      this.instance.ship,
      asteroid,
      this.options.hardpoints,
      this.options.nominalLengthMeters
    );
  }

  private finishMining(): void {
    this.miningPhase = 'idle';
    this.miningTargetId = null;
    this.scanTargetId = null;
    this.approachPurpose = null;
    this.miningAccumulator = 0;
    this.miningEvents.clear();
    this.scanClock.resetShort();
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
    const reviewed = this.hazards.review(deltaSeconds, this.navigationRoute, this.navigationIndex);
    this.navigationRoute = reviewed.route;
    this.navigationIndex = reviewed.index;
    const result = advanceAutopilotRoute(
      this.instance.ship,
      this.navigationRoute,
      this.navigationIndex,
      this.approachSpeed,
      deltaSeconds,
      true,
      true,
      this.turnRateMultiplier
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
    const reviewed = this.hazards.review(
      deltaSeconds,
      this.approachRoute,
      this.approachIndex,
      this.activeTargetId()
    );
    this.approachRoute = reviewed.route;
    this.approachIndex = reviewed.index;
    const result = advanceAutopilotRoute(
      this.instance.ship,
      this.approachRoute,
      this.approachIndex,
      this.approachSpeed,
      deltaSeconds,
      false,
      true,
      this.turnRateMultiplier
    );
    this.approachIndex = result.nextIndex;
    if (result.completed) this.finishApproachFacing(deltaSeconds, asteroid);
  }

  private finishApproachFacing(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    const turnRateMultiplier = this.turnRateMultiplier;
    if (!faceAutopilotTarget(ship, asteroid.position, deltaSeconds, turnRateMultiplier)) return;

    if (this.approachPurpose === 'scan') {
      resetAutopilotMotion(ship);
      this.stationKeepingPosition = { ...ship.position };
      this.shipForwardVelocity = 0;
      this.shipLateralVelocity = 0;
      this.scanClock.resetShort();
      this.miningPhase = 'scanning';
      return;
    }

    if (!hasMineableDeposits(asteroid, this.miningResources.selectionFor(asteroid.id))) {
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
    if (
      this.scanClock.advanceShort(
        deltaSeconds,
        asteroid,
        this.idleStationKeeping,
        this.stationKeepingPosition
      )
    ) {
      this.finishMining();
    }
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.updateMiningFormation(deltaSeconds, asteroid);
    if (this.miningEvents.pauseExtraction(asteroid, deltaSeconds)) return;

    this.miningAccumulator += deltaSeconds;
    const cycleSeconds = this.miningEvents.cycleSeconds(this.miningCycleSeconds);
    const selection = this.miningResources.selectionFor(asteroid.id);
    while (this.miningAccumulator >= cycleSeconds && hasMineableDeposits(asteroid, selection)) {
      this.miningAccumulator -= cycleSeconds;
      this.miningResources.spawnChunk(asteroid);
    }

    if (!hasMineableDeposits(asteroid, selection)) this.finishMining();
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
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  return new LocalSpaceRuntime(options);
}
