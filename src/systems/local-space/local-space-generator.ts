import { seededLocalGate } from '../../core/local-space-exit';
import { asteroidContactBound } from '../../core/asteroid-contact-profile';
import type {
  AsteroidPhysics,
  LocalAsteroid,
  LocalSpaceInstance,
} from '../../core/local-space-types';
import { pickMiningResource } from '../../data/resources/mining-resources';
import type { AsteroidResourceDeposit } from '../../core/local-space-types';

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createPhysics(
  radius: number,
  random: () => number,
  maximumDrift: number,
  maximumAngularVelocity: number,
  density: number
): AsteroidPhysics {
  const mass = Math.max(1, Math.PI * radius * radius * density);
  const speed = random() * maximumDrift;
  const direction = random() * Math.PI * 2;
  const centerOffsetRadius = radius * random() * 0.12;
  const centerOffsetAngle = random() * Math.PI * 2;

  return {
    mass,
    centerOfMassOffset: {
      x: Math.cos(centerOffsetAngle) * centerOffsetRadius,
      y: Math.sin(centerOffsetAngle) * centerOffsetRadius,
    },
    velocity: {
      x: Math.cos(direction) * speed,
      y: Math.sin(direction) * speed,
    },
    angularVelocity: (random() * 2 - 1) * maximumAngularVelocity,
    momentOfInertia: Math.max(1, 0.5 * mass * radius * radius),
  };
}

function createDeposits(
  random: () => number,
  resourceIds?: readonly string[]
): AsteroidResourceDeposit[] {
  if (random() >= 0.68) return [];

  const roll = random();
  const depositCount = roll < 0.62 ? 1 : roll < 0.9 ? 2 : 3;
  const deposits: AsteroidResourceDeposit[] = [];
  const usedResourceIds = new Set<string>();

  while (deposits.length < depositCount) {
    const resource = pickMiningResource(random, resourceIds);
    if (usedResourceIds.has(resource.id)) continue;
    usedResourceIds.add(resource.id);

    const rarityAmountFactor = Math.max(0.35, 1.15 - resource.rarity * 0.055);
    const oreCapacity = Math.round((55 + random() * 155) * rarityAmountFactor);
    deposits.push({
      resourceId: resource.id,
      oreType: resource.name,
      oreRemaining: oreCapacity,
      oreCapacity,
      identified: false,
    });
  }

  return deposits;
}

function createResourceAsteroids(
  seed: number,
  random: () => number,
  width: number,
  height: number,
  resourceIds?: readonly string[]
): LocalAsteroid[] {
  const count = 64 + Math.floor(random() * 17);
  const asteroids: LocalAsteroid[] = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 22 + random() * 42;
    const sideBias = index % 2 === 0 ? 0.22 : 0.78;
    const x = width * (sideBias + (random() - 0.5) * 0.42);
    const y = height * (0.12 + random() * 0.76);
    const deposits = createDeposits(random, resourceIds);

    const id = `asteroid-${seed}-${index}`;
    const collisionRadius = radius * asteroidContactBound(id, 'resource');
    asteroids.push({
      id,
      kind: 'resource',
      routeBlocking: true,
      position: { x, y },
      radius,
      collisionRadius,
      contactGeometry: 'silhouette',
      rotation: random() * Math.PI * 2,
      physics: createPhysics(radius, random, 5.8, 0.1, 1.9),
      deposits,
      scanLevel: 'unscanned',
    });
  }

  return asteroids;
}

function createDebris(
  seed: number,
  random: () => number,
  width: number,
  height: number
): LocalAsteroid[] {
  const count = 127 + Math.floor(random() * 34);
  const debris: LocalAsteroid[] = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 4 + random() * 9;
    const id = `debris-${seed}-${index}`;
    const collisionRadius = radius * asteroidContactBound(id, 'debris');
    debris.push({
      id,
      kind: 'debris',
      routeBlocking: false,
      position: {
        x: radius + random() * (width - radius * 2),
        y: radius + random() * (height - radius * 2),
      },
      radius,
      collisionRadius,
      contactGeometry: 'silhouette',
      rotation: random() * Math.PI * 2,
      physics: createPhysics(radius, random, 16.5, 0.36, 1.15),
      deposits: [],
      scanLevel: 'analyzed',
    });
  }

  return debris;
}

export function generateMiningSpace(
  sourceLocationId: string,
  seed: number,
  resourceIds?: readonly string[]
): LocalSpaceInstance {
  const width = 4400;
  const height = 2570;
  const random = createRandom(seed);

  return {
    id: `${sourceLocationId}-${seed}`,
    sourceLocationId,
    seed,
    width,
    height,
    asteroids: [
      ...createResourceAsteroids(seed, random, width, height, resourceIds),
      ...createDebris(seed, random, width, height),
    ],
    chunks: [],
    ship: {
      position: seededLocalGate(width, height, seed),
      headingRadians: 0,
      speed: 0,
      turnRateRadiansPerSecond: 0,
      angularThrust: 0,
      lateralThrust: 0,
    },
  };
}
