import { boundedSimulationStep, LOCAL_PHYSICS_STEP_SECONDS } from '../../core/simulation-step';
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
import type { ManeuveringShipControls } from '../../core/physical-ship-state';
import { shipFlightBounds } from '../../core/ship-flight-physics';
import {
  createShieldWorldGeometry,
  resolveAsteroidCollisions,
  type ShieldWorldGeometry,
} from './local-space-collision';
import { faceAutopilotTarget, resetAutopilotMotion } from './local-space-autopilot';
import { integrateAsteroids } from './local-space-physics';
import { calculateMiningImpact } from './mining-impact';
import {
  localShipForwardSpeed,
  localShipLateralSpeed,
  localShipVelocity,
  ensureLocalShipPhysicalState,
  setLocalShipComponents,
  setLocalShipVelocity,
} from './local-space-ship-velocity';
import { hasMineableDeposits } from './mining-chunk-service';
import { advanceFieldMiningFormation } from './local-space-mining-formation';
import { selectedAsteroid } from './local-space-scanning';
import {
  createIdleStationKeepingState,
  resetIdleStationKeeping,
  type IdleStationKeepingState,
} from './local-space-station-keeping';
import type { LocalSpaceService } from './local-space-api';
import { createMiningEventController } from './mining-event-service';
import { MiningResourceRuntime } from './mining-resource-runtime';
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';
import {
  pointWreckAwareRouteOptions,
  selectedWreckAwareRouteOptions,
} from './local-space-wreck-navigation';
import { LocalSpaceAutopilotHazards } from './local-space-autopilot-hazards';
import { resolveLocalWreckContacts } from './local-space-wreck-contacts';
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
  private readonly idleStationKeeping: IdleStationKeepingState;

  constructor(private readonly options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    ensureLocalShipPhysicalState(this.instance.ship);
    this.scanClock = new LocalSpaceScanClock(options.instance, options.flightPerformance);
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
      options.additionalObstacles,
      options.getTrafficObstacles
    );
    this.stationKeepingPosition = { ...options.instance.ship.position };
    this.idleStationKeeping = createIdleStationKeepingState(
      options.instance.seed,
      options.instance.ship
    );
  }

  /** Preserve the complete instantaneous inertial velocity when entering combat. */
  getShipWorldVelocity(): WorldPoint {
    return localShipVelocity(this.instance.ship);
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

  getMiningRouteOptions(): RoutePlanningOptions | null {
    return selectedWreckAwareRouteOptions(this.options, this.selectedAsteroidId, this.shield);
  }

  getShortRangeScanRouteOptions(): RoutePlanningOptions | null {
    return this.getMiningRouteOptions();
  }

  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions {
    return pointWreckAwareRouteOptions(this.options, target, this.shield);
  }
  startNavigation(target: WorldPoint, route: readonly WorldPoint[]): LocalSpaceSnapshot {
    if (this.miningEvents.pending || route.length < 2) return this.getSnapshot();
    if (this.miningPhase !== 'idle') this.finishMining();
    this.navigationTarget = { ...target };
    this.navigationRoute = route;
    this.navigationIndex = 1;
    this.hazards.reset();
    resetAutopilotMotion(this.instance.ship);
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
    const result = this.miningEvents.resolve(
      asteroid,
      choiceId,
      (fraction) => this.shipSystems.damageHullFraction(fraction),
      this.options.fundMiningBonus
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

  syncCombatPose(
    position: WorldPoint,
    headingRadians: number,
    velocity: WorldPoint,
    maneuvering?: Partial<ManeuveringShipControls>
  ): LocalSpaceSnapshot {
    this.instance.ship.position = {
      x: Math.max(0, Math.min(this.instance.width, position.x)),
      y: Math.max(0, Math.min(this.instance.height, position.y)),
    };
    this.instance.ship.headingRadians = headingRadians;
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
    setLocalShipVelocity(this.instance.ship, velocity);
    if (maneuvering) {
      this.instance.ship.turnRateRadiansPerSecond = maneuvering.turnRateRadiansPerSecond ?? 0;
      this.instance.ship.angularThrust = maneuvering.angularThrust ?? 0;
      this.instance.ship.lateralThrust = maneuvering.lateralThrust ?? 0;
    }
    return this.getSnapshot();
  }

  /** Advance non-flight systems while combat owns both ship and asteroid physics. */
  tickCombatEnvironment(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = boundedSimulationStep(deltaSeconds, LOCAL_PHYSICS_STEP_SECONDS);
    this.shipSystems.advance(clamped);
    this.scanClock.advanceLong(clamped);
    this.miningResources.advanceChunks(this.instance.ship, clamped);
    return this.getSnapshot();
  }

  tick(deltaSeconds: number, combatOwnsBodies?: boolean): LocalSpaceSnapshot {
    const clamped = boundedSimulationStep(deltaSeconds, LOCAL_PHYSICS_STEP_SECONDS);
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
      if (
        this.scanClock.advanceShort(
          clamped,
          asteroid,
          this.idleStationKeeping,
          this.stationKeepingPosition
        )
      )
        this.finishMining();
    } else if (asteroid && this.miningPhase === 'extracting') {
      this.updateMining(clamped, asteroid);
    }

    const collisions = resolveLocalWreckContacts(
      this.instance.ship,
      localShipVelocity(this.instance.ship),
      this.instance.asteroids,
      this.options.additionalObstacles?.() ?? [],
      this.shield,
      this.options.nominalLengthMeters,
      this.options.onAdditionalObstacleContact
    );
    for (const collision of collisions) this.shipSystems.applyCollision(collision);

    this.miningResources.advanceChunks(this.instance.ship, clamped);
    return this.getSnapshot();
  }

  private prepareApproach(route: readonly WorldPoint[]): void {
    this.finishManualNavigation();
    this.miningAccumulator = 0;
    resetAutopilotMotion(this.instance.ship);
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
    setLocalShipComponents(
      this.instance.ship,
      localShipForwardSpeed(this.instance.ship) * 0.25,
      localShipLateralSpeed(this.instance.ship) * 0.35
    );
  }

  private updateManualNavigation(deltaSeconds: number): void {
    const reviewed = this.hazards.review(deltaSeconds, this.navigationRoute, this.navigationIndex);
    this.navigationRoute = reviewed.route;
    this.navigationIndex = reviewed.index;
    const result = this.hazards.advanceRoute(
      this.instance.ship,
      this.navigationRoute,
      this.navigationIndex,
      this.approachSpeed,
      deltaSeconds,
      true,
      true,
      this.turnRateMultiplier,
      undefined,
      this.options.flightPerformance
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
    const result = this.hazards.advanceRoute(
      this.instance.ship,
      this.approachRoute,
      this.approachIndex,
      this.approachSpeed,
      deltaSeconds,
      true,
      true,
      this.turnRateMultiplier,
      undefined,
      this.options.flightPerformance
    );
    this.approachIndex = result.nextIndex;
    if (result.completed) this.finishApproachFacing(deltaSeconds, asteroid);
  }

  private finishApproachFacing(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    const turnRateMultiplier = this.turnRateMultiplier;
    if (
      !faceAutopilotTarget(
        ship,
        asteroid.position,
        deltaSeconds,
        turnRateMultiplier,
        this.options.flightPerformance,
        shipFlightBounds(this.instance.width, this.instance.height)
      )
    )
      return;

    if (this.approachPurpose === 'scan') {
      resetAutopilotMotion(ship);
      this.stationKeepingPosition = { ...ship.position };
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
    this.miningEvents.begin(asteroid);
    this.miningPhase = 'extracting';
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    advanceFieldMiningFormation(
      this.instance,
      asteroid,
      this.miningHoldOffset,
      this.shield.radiusX,
      deltaSeconds,
      this.options.flightPerformance
    );
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
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  return new LocalSpaceRuntime(options);
}
