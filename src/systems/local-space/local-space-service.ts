import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningChunk,
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
import { integrateAsteroids } from './local-space-physics';
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

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function heading(a: WorldPoint, b: WorldPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDelta(current: number, target: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function turnToward(current: number, target: number, maximumDelta: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

function moveToward(current: WorldPoint, target: WorldPoint, maximumDistance: number): WorldPoint {
  const total = distance(current, target);
  if (total <= maximumDistance || total === 0) return { ...target };

  const ratio = maximumDistance / total;
  return {
    x: current.x + (target.x - current.x) * ratio,
    y: current.y + (target.y - current.y) * ratio,
  };
}

class LocalSpaceRuntime implements LocalSpaceService {
  private readonly instance: LocalSpaceInstance;
  private readonly approachSpeed: number;
  private readonly shield: ShieldWorldGeometry;
  private selectedAsteroidId: string | null = null;
  private miningTargetId: string | null = null;
  private miningPhase: MiningPhase = 'idle';
  private approachRoute: readonly WorldPoint[] = [];
  private approachIndex = 0;
  private collectedOre = 0;
  private miningAccumulator = 0;
  private chunkCounter = 0;
  private shieldFlash = 0;

  constructor(options: LocalSpaceServiceOptions) {
    this.instance = options.instance;
    this.approachSpeed = options.approachSpeed;
    this.shield = createShieldWorldGeometry(options.hardpoints, options.nominalLengthMeters);
  }

  getSnapshot(): LocalSpaceSnapshot {
    return {
      instance: this.instance,
      selectedAsteroidId: this.selectedAsteroidId,
      miningTargetId: this.miningTargetId,
      miningPhase: this.miningPhase,
      collectedOre: this.collectedOre,
      laserActive: this.miningPhase === 'extracting',
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

  private finishMining(): void {
    this.miningPhase = 'idle';
    this.miningTargetId = null;
    this.miningAccumulator = 0;
    this.approachRoute = [];
    this.approachIndex = 0;
    this.instance.ship.speed = 0;
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
    ship.headingRadians = turnToward(ship.headingRadians, desiredHeading, turnLimit);

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
    ship.headingRadians = turnToward(
      ship.headingRadians,
      desiredHeading,
      MAX_TURN_RATE * deltaSeconds
    );
    ship.speed = 0;

    if (Math.abs(angleDelta(ship.headingRadians, desiredHeading)) <= 0.04) {
      ship.headingRadians = desiredHeading;
      this.miningPhase = 'extracting';
    }
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.instance.ship.speed = 0;
    this.miningAccumulator += deltaSeconds;

    while (this.miningAccumulator >= 0.42 && asteroid.oreRemaining > 0) {
      this.miningAccumulator -= 0.42;
      this.spawnChunk(asteroid);
    }

    if (asteroid.oreRemaining <= 0) {
      this.finishMining();
    }
  }

  private spawnChunk(asteroid: LocalAsteroid): void {
    const angle = asteroid.rotation + this.chunkCounter * 1.7;
    const amount = Math.min(6, asteroid.oreRemaining);
    asteroid.oreRemaining -= amount;

    this.instance.chunks.push({
      id: 'chunk-' + this.instance.seed + '-' + this.chunkCounter,
      position: {
        x: asteroid.position.x + Math.cos(angle) * asteroid.radius * 0.65,
        y: asteroid.position.y + Math.sin(angle) * asteroid.radius * 0.65,
      },
      velocity: { x: Math.cos(angle) * 34, y: Math.sin(angle) * 34 },
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
