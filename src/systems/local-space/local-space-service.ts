import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningImpact,
  MiningPhase,
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
  angleDelta,
  distance,
  heading,
  moveToward,
  turnToward,
} from './local-space-motion';
import { integrateAsteroids } from './local-space-physics';
import { calculateMiningImpact } from './mining-impact';
import {
  createIdleStationKeepingState,
  resetIdleStationKeeping,
  updateIdleStationKeeping,
  type IdleStationKeepingState,
} from './local-space-station-keeping';
import { planMiningApproachRoute } from './local-space-navigation';

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
  readonly hardpoints: ShipHardpoints;
  readonly nominalLengthMeters: number;
}

export interface LocalSpaceService {
  getSnapshot(): LocalSpaceSnapshot;
  selectAsteroid(id: string | null): LocalSpaceSnapshot;
  startMining(): LocalSpaceSnapshot;
  cancelMining(): LocalSpaceSnapshot;
  tick(deltaSeconds: number): LocalSpaceSnapshot;
}

const MAX_TURN_RATE = 1.15;

class LocalSpaceRuntime implements LocalSpaceService {
  private readonly instance: LocalSpaceInstance;
  private readonly approachSpeed: number;
  private readonly shield: ShieldWorldGeometry;
  private readonly hardpoints: ShipHardpoints;
  private readonly nominalLengthMeters: number;
  private selectedAsteroidId: string | null = null;
  private miningTargetId: string | null = null;
  private miningPhase: MiningPhase = 'idle';
  private approachRoute: readonly WorldPoint[] = [];
  private approachIndex = 0;
  private collectedOre = 0;
  private miningAccumulator = 0;
  private chunkCounter = 0;
  private shieldFlash = 0;
  private miningHoldOffset: WorldPoint | null = null;
  private stationKeepingPosition: WorldPoint;
  private shipForwardVelocity = 0;
  private shipLateralVelocity = 0;
  private readonly idleStationKeeping: IdleStationKeepingState;

  constructor(options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    this.approachSpeed = options.approachSpeed;
    this.hardpoints = options.hardpoints;
    this.nominalLengthMeters = options.nominalLengthMeters;
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
      miningPhase: this.miningPhase,
      collectedOre: this.collectedOre,
      laserActive: this.miningPhase === 'extracting',
      miningImpact: this.currentMiningImpact(),
      shieldFlash: this.shieldFlash,
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

  startMining(): LocalSpaceSnapshot {
    const asteroid = this.findAsteroid(this.selectedAsteroidId);
    if (!asteroid || asteroid.oreRemaining <= 0) return this.getSnapshot();

    this.miningTargetId = asteroid.id;
    this.miningPhase = 'approaching';
    this.miningAccumulator = 0;
    this.instance.ship.speed = 0;
    this.instance.ship.turnRateRadiansPerSecond = 0;
    this.instance.ship.angularThrust = 0;
    this.instance.ship.lateralThrust = 0;
    this.shipForwardVelocity = 0;
    this.shipLateralVelocity = 0;
    this.miningHoldOffset = null;
    this.approachRoute = planMiningApproachRoute({
      start: this.instance.ship.position,
      target: asteroid,
      asteroids: this.instance.asteroids,
      clearance: Math.max(this.shield.radiusX, this.shield.radiusY) + 24,
      width: this.instance.width,
      height: this.instance.height,
    });
    this.approachIndex = this.approachRoute.length > 1 ? 1 : 0;
    return this.getSnapshot();
  }

  cancelMining(): LocalSpaceSnapshot {
    this.finishMining();
    return this.getSnapshot();
  }

  tick(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shieldFlash = Math.max(0, this.shieldFlash - clamped / 0.48);
    integrateAsteroids(this.instance.asteroids, clamped, this.instance.width, this.instance.height);
    resolveAsteroidCollisions(this.instance.asteroids);

    const asteroid = this.findAsteroid(this.miningTargetId);
    if (!asteroid && this.miningPhase !== 'idle') {
      this.finishMining();
    } else if (this.miningPhase === 'idle') {
      this.updatePassiveStationKeeping(clamped);
    } else if (asteroid && this.miningPhase === 'approaching') {
      this.updateApproach(clamped, asteroid);
    } else if (asteroid && this.miningPhase === 'extracting') {
      this.updateMining(clamped, asteroid);
    }

    if (resolveShieldCollisions(this.instance.ship, this.instance.asteroids, this.shield)) {
      this.shieldFlash = 1;
    }

    this.updateChunks(clamped);
    return this.getSnapshot();
  }

  private findAsteroid(id: string | null): LocalAsteroid | null {
    if (!id) return null;
    return this.instance.asteroids.find((asteroid) => asteroid.id === id) ?? null;
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
    this.miningAccumulator = 0;
    this.approachRoute = [];
    this.approachIndex = 0;
    this.instance.ship.speed = 0;
    this.instance.ship.turnRateRadiansPerSecond = 0;
    this.instance.ship.angularThrust = 0;
    this.instance.ship.lateralThrust = 0;
    this.miningHoldOffset = null;
    this.stationKeepingPosition = { ...this.instance.ship.position };
    resetIdleStationKeeping(this.idleStationKeeping, this.instance.ship);
    this.shipForwardVelocity *= 0.25;
    this.shipLateralVelocity *= 0.35;
  }

  private updateApproach(deltaSeconds: number, asteroid: LocalAsteroid): void {
    if (this.approachIndex >= this.approachRoute.length) {
      this.finishApproachFacing(deltaSeconds, asteroid);
      return;
    }

    const ship = this.instance.ship;
    const waypoint = this.approachRoute[this.approachIndex]!;
    const desiredHeading = heading(ship.position, waypoint);
    const turnLimit = MAX_TURN_RATE * deltaSeconds;
    const previousHeading = ship.headingRadians;
    ship.headingRadians = turnToward(ship.headingRadians, desiredHeading, turnLimit);
    ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
    ship.angularThrust = Math.max(
      -1,
      Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 5))
    );
    ship.lateralThrust = 0;

    const remainingTurn = Math.abs(angleDelta(ship.headingRadians, desiredHeading));
    const alignment = Math.max(0.18, 1 - remainingTurn / (Math.PI / 2));
    const step = this.approachSpeed * alignment * deltaSeconds;
    ship.position = moveToward(ship.position, waypoint, step);
    ship.speed = this.approachSpeed * alignment;

    if (distance(ship.position, waypoint) <= 1) {
      ship.position = { ...waypoint };
      this.approachIndex += 1;
    }
  }

  private finishApproachFacing(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    const desiredHeading = heading(ship.position, asteroid.position);
    const previousHeading = ship.headingRadians;
    ship.headingRadians = turnToward(
      ship.headingRadians,
      desiredHeading,
      MAX_TURN_RATE * deltaSeconds
    );
    ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
    ship.angularThrust = Math.max(
      -1,
      Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 6))
    );
    ship.lateralThrust = 0;
    ship.speed = 0;

    if (Math.abs(angleDelta(ship.headingRadians, desiredHeading)) <= 0.04) {
      ship.headingRadians = desiredHeading;
      ship.turnRateRadiansPerSecond = 0;
      ship.angularThrust = 0;
      this.miningHoldOffset = {
        x: ship.position.x - asteroid.position.x,
        y: ship.position.y - asteroid.position.y,
      };
      this.stationKeepingPosition = { ...ship.position };
      this.shipForwardVelocity = 0;
      this.shipLateralVelocity = 0;
      this.miningPhase = 'extracting';
    }
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
    const offset = this.miningHoldOffset;
    if (!offset) {
      this.instance.ship.speed = 0;
      this.instance.ship.lateralThrust = 0;
      this.instance.ship.turnRateRadiansPerSecond = 0;
      this.instance.ship.angularThrust = 0;
      return;
    }

    const ship = this.instance.ship;
    const desiredPosition = {
      x: asteroid.position.x + offset.x,
      y: asteroid.position.y + offset.y,
    };
    const desiredHeading = heading(ship.position, asteroid.position);
    const previousHeading = ship.headingRadians;
    ship.headingRadians = turnToward(
      ship.headingRadians,
      desiredHeading,
      MAX_TURN_RATE * 0.35 * deltaSeconds
    );
    ship.turnRateRadiansPerSecond = angleDelta(previousHeading, ship.headingRadians) / deltaSeconds;
    ship.angularThrust = Math.max(
      -1,
      Math.min(1, angleDelta(previousHeading, desiredHeading) / (Math.PI / 8))
    );

    const forwardX = Math.cos(ship.headingRadians);
    const forwardY = Math.sin(ship.headingRadians);
    const sideX = -forwardY;
    const sideY = forwardX;
    const errorX = desiredPosition.x - ship.position.x;
    const errorY = desiredPosition.y - ship.position.y;
    const forwardError = errorX * forwardX + errorY * forwardY;
    const lateralError = errorX * sideX + errorY * sideY;

    const threat = this.closestClosingDebris();
    let lateralThrust = -this.shipLateralVelocity * 0.68 + lateralError * 0.13;
    lateralThrust = Math.max(-0.62, Math.min(0.62, lateralThrust));
    if (threat) {
      const threatSide = threat.dx * sideX + threat.dy * sideY;
      lateralThrust = threatSide >= 0 ? -1 : 1;
    }
    if (Math.abs(lateralError) < 1.5 && Math.abs(this.shipLateralVelocity) < 0.18) {
      lateralThrust = 0;
    }

    let forwardThrust = -this.shipForwardVelocity * 0.62 + forwardError * 0.11;
    forwardThrust = Math.max(-0.52, Math.min(0.72, forwardThrust));
    if (Math.abs(forwardError) < 1.5 && Math.abs(this.shipForwardVelocity) < 0.2) {
      forwardThrust = 0;
    }

    ship.lateralThrust = lateralThrust;
    this.shipLateralVelocity += lateralThrust * 2.2 * deltaSeconds;
    this.shipForwardVelocity += forwardThrust * 2.8 * deltaSeconds;
    this.shipForwardVelocity = Math.max(-3.2, Math.min(4.5, this.shipForwardVelocity));
    this.shipLateralVelocity = Math.max(-3.5, Math.min(3.5, this.shipLateralVelocity));

    ship.position = {
      x:
        ship.position.x +
        (forwardX * this.shipForwardVelocity + sideX * this.shipLateralVelocity) * deltaSeconds,
      y:
        ship.position.y +
        (forwardY * this.shipForwardVelocity + sideY * this.shipLateralVelocity) * deltaSeconds,
    };
    ship.speed = Math.max(0, this.shipForwardVelocity);
  }

  private closestClosingDebris(): { dx: number; dy: number } | null {
    const ship = this.instance.ship;
    const threat = this.instance.asteroids
      .filter((asteroid) => asteroid.kind === 'debris')
      .map((asteroid) => {
        const dx = asteroid.position.x - ship.position.x;
        const dy = asteroid.position.y - ship.position.y;
        return { asteroid, dx, dy, range: Math.hypot(dx, dy) };
      })
      .filter(({ asteroid, dx, dy, range }) => {
        if (range > this.shield.radiusX + asteroid.radius + 32) return false;
        const closing = dx * asteroid.physics.velocity.x + dy * asteroid.physics.velocity.y;
        return closing < 0;
      })
      .sort((a, b) => a.range - b.range)[0];

    return threat ? { dx: threat.dx, dy: threat.dy } : null;
  }

  private spawnChunk(asteroid: LocalAsteroid): void {
    const impact = calculateMiningImpact(
      this.instance.ship,
      asteroid,
      this.hardpoints,
      this.nominalLengthMeters
    );
    const amount = Math.min(6, asteroid.oreRemaining);
    asteroid.oreRemaining -= amount;

    const tangent = { x: -impact.normal.y, y: impact.normal.x };
    const spread = Math.sin(this.chunkCounter * 2.17) * 0.42;
    const speed = 24 + (this.chunkCounter % 4) * 4;
    const direction = {
      x: impact.normal.x + tangent.x * spread,
      y: impact.normal.y + tangent.y * spread,
    };
    const directionLength = Math.max(0.001, Math.hypot(direction.x, direction.y));

    this.instance.chunks.push({
      id: 'chunk-' + this.instance.seed + '-' + this.chunkCounter,
      position: {
        x: impact.point.x + impact.normal.x * 2,
        y: impact.point.y + impact.normal.y * 2,
      },
      velocity: {
        x: (direction.x / directionLength) * speed,
        y: (direction.y / directionLength) * speed,
      },
      amount,
      ageSeconds: 0,
      tractorActive: false,
    });
    this.chunkCounter += 1;
  }

  private updateChunks(deltaSeconds: number): void {
    const remaining: MiningChunk[] = [];

    for (const chunk of this.instance.chunks) {
      this.updateChunk(chunk, deltaSeconds);
      if (distance(chunk.position, this.instance.ship.position) < 24) {
        this.collectedOre += chunk.amount;
      } else {
        remaining.push(chunk);
      }
    }

    this.instance.chunks.splice(0, this.instance.chunks.length, ...remaining);
  }

  private updateChunk(chunk: MiningChunk, deltaSeconds: number): void {
    chunk.ageSeconds += deltaSeconds;
    if (chunk.ageSeconds > 0.42) chunk.tractorActive = true;

    if (chunk.tractorActive) {
      const angle = heading(chunk.position, this.instance.ship.position);
      chunk.velocity = {
        x: Math.cos(angle) * 190,
        y: Math.sin(angle) * 190,
      };
    }

    chunk.position = {
      x: chunk.position.x + chunk.velocity.x * deltaSeconds,
      y: chunk.position.y + chunk.velocity.y * deltaSeconds,
    };
  }
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  return new LocalSpaceRuntime(options);
}
