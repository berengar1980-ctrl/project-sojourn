import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningImpact,
  MiningPhase,
} from '../../core/local-space-types';
import type { ShieldImpactEffect, ShieldState } from '../../core/shield-types';
import type { ShipHardpoints } from '../../core/ship-types';
import type { WorldPoint } from '../../core/world-types';
import {
  createShieldWorldGeometry,
  resolveAsteroidCollisions,
  resolveShieldCollisions,
  type ShieldWorldGeometry,
} from './local-space-collision';
import { distance } from './local-space-motion';
import {
  advanceAutopilotRoute,
  faceAutopilotTarget,
  resetAutopilotMotion,
} from './local-space-autopilot';
import { integrateAsteroids } from './local-space-physics';
import { calculateMiningImpact } from './mining-impact';
import { localShipVelocity } from './local-space-ship-velocity';
import { advanceMiningChunk, createMiningChunk } from './mining-chunk-service';
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
import type { PointRoutePlanningOptions, RoutePlanningOptions } from './local-space-navigation';
import { advanceShieldImpacts, applyShieldHit, createShieldState } from '../shields';

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
  readonly hardpoints: ShipHardpoints;
  readonly nominalLengthMeters: number;
}

export interface LocalSpaceService {
  getSnapshot(): LocalSpaceSnapshot;
  selectAsteroid(id: string | null): LocalSpaceSnapshot;
  getMiningRouteOptions(): RoutePlanningOptions | null;
  getShortRangeScanRouteOptions(): RoutePlanningOptions | null;
  getPointRouteOptions(target: WorldPoint): PointRoutePlanningOptions;
  startLongRangeScan(sensorModifier?: number, crewSkill?: number): LocalSpaceSnapshot;
  startNavigation(target: WorldPoint, route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  startShortRangeScan(route: readonly WorldPoint[]): LocalSpaceSnapshot;
  cancelMining(): LocalSpaceSnapshot;
  tick(deltaSeconds: number): LocalSpaceSnapshot;
}

class LocalSpaceRuntime implements LocalSpaceService {
  private readonly instance: LocalSpaceInstance;
  private readonly approachSpeed: number;
  private readonly shield: ShieldWorldGeometry;
  private readonly hardpoints: ShipHardpoints;
  private readonly nominalLengthMeters: number;
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
  private collectedOre = 0;
  private readonly collectedResources = new Map<string, number>();
  private miningAccumulator = 0;
  private chunkCounter = 0;
  private readonly shieldState: ShieldState;
  private shieldImpacts: ShieldImpactEffect[] = [];
  private shieldImpactCounter = 0;
  private miningHoldOffset: WorldPoint | null = null;
  private stationKeepingPosition: WorldPoint;
  private shipForwardVelocity = 0;
  private shipLateralVelocity = 0;
  private readonly idleStationKeeping: IdleStationKeepingState;
  private longRangeScanElapsed = 0;
  private longRangeScanParameters: { sensorModifier: number; crewSkill: number } | null = null;

  constructor(options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    this.approachSpeed = options.approachSpeed;
    this.hardpoints = options.hardpoints;
    this.nominalLengthMeters = options.nominalLengthMeters;
    this.shield = createShieldWorldGeometry(options.hardpoints, options.nominalLengthMeters);
    this.shieldState = createShieldState(
      options.hardpoints.shield.maxHp,
      options.hardpoints.shield.modifier
    );
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
      miningPhase: this.miningPhase,
      collectedOre: this.collectedOre,
      collectedResources: [...this.collectedResources.entries()].map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
      laserActive: this.miningPhase === 'extracting',
      miningImpact: this.currentMiningImpact(),
      shield: this.shieldState,
      shieldImpacts: this.shieldImpacts,
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

  getMiningRouteOptions(): RoutePlanningOptions | null {
    return this.getSelectedRouteOptions();
  }

  getShortRangeScanRouteOptions(): RoutePlanningOptions | null {
    return this.getSelectedRouteOptions();
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
    if (route.length < 2) return this.getSnapshot();
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

  startLongRangeScan(sensorModifier = 1, crewSkill = 0): LocalSpaceSnapshot {
    if (!this.longRangeScanParameters) {
      this.longRangeScanElapsed = 0;
      this.longRangeScanParameters = { sensorModifier, crewSkill };
    }
    return this.getSnapshot();
  }

  startMining(route: readonly WorldPoint[]): LocalSpaceSnapshot {
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    if (!asteroid) return this.getSnapshot();

    this.miningTargetId = asteroid.id;
    this.scanTargetId = null;
    this.approachPurpose = 'mining';
    this.miningPhase = 'approaching';
    this.prepareApproach(route);
    return this.getSnapshot();
  }

  startShortRangeScan(route: readonly WorldPoint[]): LocalSpaceSnapshot {
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    if (!asteroid) return this.getSnapshot();

    this.scanTargetId = asteroid.id;
    this.miningTargetId = null;
    this.approachPurpose = 'scan';
    this.miningPhase = 'approaching';
    this.prepareApproach(route);
    return this.getSnapshot();
  }

  cancelMining(): LocalSpaceSnapshot {
    this.finishMining();
    return this.getSnapshot();
  }

  tick(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shieldImpacts = advanceShieldImpacts(this.shieldImpacts, clamped);
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
    for (const collision of collisions) {
      const result = applyShieldHit(
        this.shieldState,
        {
          source: 'asteroid',
          point: collision.point,
          normal: collision.normal,
          impactEnergy: collision.kineticEnergy,
        },
        this.shieldImpactCounter
      );
      this.shieldImpactCounter += 1;
      if (result.damage > 0) this.shieldImpacts.push(result.impact);
    }

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

  private getSelectedRouteOptions(): RoutePlanningOptions | null {
    return selectedRouteOptions(this.instance, this.selectedAsteroidId, this.shield);
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

  private currentMiningImpact(): MiningImpact | null {
    if (this.miningPhase !== 'extracting') return null;
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
      this.approachPurpose === 'mining'
    );
    this.approachIndex = result.nextIndex;
    if (result.completed) this.finishApproachFacing(deltaSeconds, asteroid);
  }

  private finishApproachFacing(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    if (!faceAutopilotTarget(ship, asteroid.position, deltaSeconds)) return;

    if (this.approachPurpose === 'scan') {
      asteroid.scanLevel = 'analyzed';
      this.finishMining();
      return;
    }

    asteroid.scanLevel = 'analyzed';
    if (asteroid.oreRemaining <= 0) {
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
    this.miningPhase = 'extracting';
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.updateMiningFormation(deltaSeconds, asteroid);
    this.miningAccumulator += deltaSeconds;

    while (this.miningAccumulator >= 0.42 && asteroid.oreRemaining > 0) {
      this.miningAccumulator -= 0.42;
      this.spawnChunk(asteroid);
    }

    if (asteroid.oreRemaining <= 0) {
      this.finishMining();
    }
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
      this.chunkCounter
    );
    if (!chunk) return;
    this.instance.chunks.push(chunk);
    this.chunkCounter += 1;
  }

  private updateChunks(deltaSeconds: number): void {
    const remaining: MiningChunk[] = [];

    for (const chunk of this.instance.chunks) {
      advanceMiningChunk(chunk, this.instance.ship.position, deltaSeconds);
      if (distance(chunk.position, this.instance.ship.position) < 24) {
        this.collectedOre += chunk.amount;
        const collected = this.collectedResources.get(chunk.resourceId) ?? 0;
        this.collectedResources.set(chunk.resourceId, collected + chunk.amount);
      } else {
        remaining.push(chunk);
      }
    }

    this.instance.chunks.splice(0, this.instance.chunks.length, ...remaining);
  }
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  return new LocalSpaceRuntime(options);
}
