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
  resolveShieldCollisions,
  type ShieldWorldGeometry,
  updateAsteroidMotion,
} from './local-space-collision';
import { findApproachWaypoint } from './local-space-navigation';

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

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function heading(a: WorldPoint, b: WorldPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
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
    if (id && !this.findAsteroid(id)) throw new Error('Unknown asteroid: ' + id);
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
    return this.getSnapshot();
  }

  cancelMining(): LocalSpaceSnapshot {
    this.finishMining();
    return this.getSnapshot();
  }

  tick(deltaSeconds: number): LocalSpaceSnapshot {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.shieldFlash = Math.max(0, this.shieldFlash - clamped / 0.22);
    updateAsteroidMotion(
      this.instance.asteroids,
      clamped,
      this.instance.width,
      this.instance.height
    );

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
    this.instance.ship.speed = 0;
  }

  private updateApproach(deltaSeconds: number, asteroid: LocalAsteroid): void {
    const ship = this.instance.ship;
    const miningRange = asteroid.radius + 120;
    const targetHeading = heading(ship.position, asteroid.position);
    const currentDistance = distance(ship.position, asteroid.position);

    if (currentDistance <= miningRange + 1) {
      ship.headingRadians = targetHeading;
      ship.speed = 0;
      this.miningPhase = 'extracting';
      return;
    }

    const stopPoint = {
      x: asteroid.position.x - Math.cos(targetHeading) * miningRange,
      y: asteroid.position.y - Math.sin(targetHeading) * miningRange,
    };
    const clearance = Math.max(this.shield.radiusX, this.shield.radiusY);
    const waypoint = findApproachWaypoint(
      ship,
      stopPoint,
      this.instance.asteroids,
      asteroid.id,
      clearance
    );
    ship.headingRadians = heading(ship.position, waypoint);
    const nextPosition = moveToward(ship.position, waypoint, this.approachSpeed * deltaSeconds);
    ship.position = nextPosition;

    if (distance(nextPosition, stopPoint) <= 0.75) {
      ship.position = stopPoint;
      ship.headingRadians = targetHeading;
      ship.speed = 0;
      this.miningPhase = 'extracting';
      return;
    }

    ship.speed = this.approachSpeed;
  }

  private updateMining(deltaSeconds: number, asteroid: LocalAsteroid): void {
    this.instance.ship.speed = 0;
    this.instance.ship.headingRadians = heading(this.instance.ship.position, asteroid.position);
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
