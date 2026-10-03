import type {
  LocalAsteroid,
  LocalSpaceInstance,
  LocalSpaceSnapshot,
  MiningChunk,
  MiningPhase,
} from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';

export interface LocalSpaceServiceOptions {
  readonly instance: LocalSpaceInstance;
  readonly approachSpeed: number;
}

export interface LocalSpaceService {
  getSnapshot(): LocalSpaceSnapshot;
  selectAsteroid(id: string | null): LocalSpaceSnapshot;
  startMining(): LocalSpaceSnapshot;
  tick(deltaSeconds: number): LocalSpaceSnapshot;
}

function distance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function heading(a: WorldPoint, b: WorldPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function moveToward(
  current: WorldPoint,
  target: WorldPoint,
  maximumDistance: number
): WorldPoint {
  const total = distance(current, target);
  if (total <= maximumDistance || total === 0) return { ...target };
  const ratio = maximumDistance / total;
  return {
    x: current.x + (target.x - current.x) * ratio,
    y: current.y + (target.y - current.y) * ratio,
  };
}

export function createLocalSpaceService(options: LocalSpaceServiceOptions): LocalSpaceService {
  const instance = options.instance;
  let selectedAsteroidId: string | null = null;
  let miningTargetId: string | null = null;
  let miningPhase: MiningPhase = 'idle';
  let collectedOre = 0;
  let miningAccumulator = 0;
  let chunkCounter = 0;

  const findAsteroid = (id: string | null): LocalAsteroid | null =>
    id ? (instance.asteroids.find((asteroid) => asteroid.id === id) ?? null) : null;

  const snapshot = (): LocalSpaceSnapshot => ({
    instance,
    selectedAsteroidId,
    miningTargetId,
    miningPhase,
    collectedOre,
    laserActive: miningPhase === 'extracting',
  });

  const spawnChunk = (asteroid: LocalAsteroid): void => {
    const angle = asteroid.rotation + chunkCounter * 1.7;
    const amount = Math.min(6, asteroid.oreRemaining);
    asteroid.oreRemaining -= amount;
    instance.chunks.push({
      id: `chunk-${instance.seed}-${chunkCounter}`,
      position: {
        x: asteroid.position.x + Math.cos(angle) * asteroid.radius * 0.65,
        y: asteroid.position.y + Math.sin(angle) * asteroid.radius * 0.65,
      },
      velocity: { x: Math.cos(angle) * 34, y: Math.sin(angle) * 34 },
      amount,
      ageSeconds: 0,
      tractorActive: false,
    });
    chunkCounter += 1;
  };

  const updateApproach = (deltaSeconds: number, asteroid: LocalAsteroid): void => {
    const ship = instance.ship;
    const miningRange = asteroid.radius + 145;
    ship.headingRadians = heading(ship.position, asteroid.position);
    const currentDistance = distance(ship.position, asteroid.position);

    if (currentDistance <= miningRange) {
      ship.speed = 0;
      miningPhase = 'extracting';
      return;
    }

    const stopPoint = {
      x:
        asteroid.position.x -
        Math.cos(ship.headingRadians) * miningRange,
      y:
        asteroid.position.y -
        Math.sin(ship.headingRadians) * miningRange,
    };
    ship.position = moveToward(
      ship.position,
      stopPoint,
      options.approachSpeed * deltaSeconds
    );
    ship.speed = options.approachSpeed;
  };

  const updateMining = (deltaSeconds: number, asteroid: LocalAsteroid): void => {
    instance.ship.speed = 0;
    instance.ship.headingRadians = heading(instance.ship.position, asteroid.position);
    miningAccumulator += deltaSeconds;

    while (miningAccumulator >= 0.42 && asteroid.oreRemaining > 0) {
      miningAccumulator -= 0.42;
      spawnChunk(asteroid);
    }

    if (asteroid.oreRemaining <= 0) {
      miningPhase = 'idle';
      miningTargetId = null;
    }
  };

  const updateChunks = (deltaSeconds: number): void => {
    const ship = instance.ship;
    const remaining: MiningChunk[] = [];

    for (const chunk of instance.chunks) {
      chunk.ageSeconds += deltaSeconds;
      if (chunk.ageSeconds > 0.42) chunk.tractorActive = true;

      if (chunk.tractorActive) {
        const angle = heading(chunk.position, ship.position);
        const tractorSpeed = 190;
        chunk.velocity = {
          x: Math.cos(angle) * tractorSpeed,
          y: Math.sin(angle) * tractorSpeed,
        };
      }

      chunk.position = {
        x: chunk.position.x + chunk.velocity.x * deltaSeconds,
        y: chunk.position.y + chunk.velocity.y * deltaSeconds,
      };

      if (distance(chunk.position, ship.position) < 24) {
        collectedOre += chunk.amount;
      } else {
        remaining.push(chunk);
      }
    }

    instance.chunks.splice(0, instance.chunks.length, ...remaining);
  };

  return {
    getSnapshot: snapshot,
    selectAsteroid(id) {
      if (id && !findAsteroid(id)) throw new Error('Unknown asteroid: ' + id);
      selectedAsteroidId = id;
      return snapshot();
    },
    startMining() {
      const asteroid = findAsteroid(selectedAsteroidId);
      if (!asteroid || asteroid.oreRemaining <= 0) return snapshot();
      miningTargetId = asteroid.id;
      miningPhase = 'approaching';
      miningAccumulator = 0;
      return snapshot();
    },
    tick(deltaSeconds) {
      const clamped = Math.min(Math.max(deltaSeconds, 0), 0.05);
      const asteroid = findAsteroid(miningTargetId);

      if (asteroid && miningPhase === 'approaching') {
        updateApproach(clamped, asteroid);
      } else if (asteroid && miningPhase === 'extracting') {
        updateMining(clamped, asteroid);
      }

      updateChunks(clamped);
      return snapshot();
    },
  };
}
