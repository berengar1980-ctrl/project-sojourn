import type {
  AsteroidPhysics,
  LocalAsteroid,
  LocalSpaceInstance,
} from '../../core/local-space-types';
import { pickMiningResource } from '../../data/resources/mining-resources';

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

function createResourceAsteroids(
  seed: number,
  random: () => number,
  width: number,
  height: number
): LocalAsteroid[] {
  const count = 96 + Math.floor(random() * 25);
  const asteroids: LocalAsteroid[] = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 22 + random() * 42;
    const sideBias = index % 2 === 0 ? 0.22 : 0.78;
    const x = width * (sideBias + (random() - 0.5) * 0.42);
    const y = height * (0.12 + random() * 0.76);
    const containsResource = random() < 0.68;
    const resource = containsResource ? pickMiningResource(random) : null;
    const rarityAmountFactor = resource ? Math.max(0.35, 1.15 - resource.rarity * 0.055) : 0;
    const oreCapacity = resource
      ? Math.round((70 + random() * 180) * rarityAmountFactor)
      : 0;

    asteroids.push({
      id: `asteroid-${seed}-${index}`,
      kind: 'resource',
      routeBlocking: true,
      position: { x, y },
      radius,
      rotation: random() * Math.PI * 2,
      physics: createPhysics(radius, random, 5.8, 0.1, 1.9),
      resourceId: resource?.id ?? null,
      oreType: resource?.name ?? '',
      oreRemaining: oreCapacity,
      oreCapacity,
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
  const count = 190 + Math.floor(random() * 51);
  const debris: LocalAsteroid[] = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 4 + random() * 9;
    debris.push({
      id: `debris-${seed}-${index}`,
      kind: 'debris',
      routeBlocking: false,
      position: {
        x: radius + random() * (width - radius * 2),
        y: radius + random() * (height - radius * 2),
      },
      radius,
      rotation: random() * Math.PI * 2,
      physics: createPhysics(radius, random, 16.5, 0.36, 1.15),
      resourceId: null,
      oreType: '',
      oreRemaining: 0,
      oreCapacity: 0,
      scanLevel: 'analyzed',
    });
  }

  return debris;
}

export function generateMiningSpace(sourceLocationId: string, seed: number): LocalSpaceInstance {
  const width = 5400;
  const height = 3150;
  const random = createRandom(seed);

  return {
    id: `${sourceLocationId}-${seed}`,
    sourceLocationId,
    seed,
    width,
    height,
    asteroids: [
      ...createResourceAsteroids(seed, random, width, height),
      ...createDebris(seed, random, width, height),
    ],
    chunks: [],
    ship: {
      position: { x: width * 0.5, y: height * 0.5 },
      headingRadians: 0,
      speed: 0,
      turnRateRadiansPerSecond: 0,
      angularThrust: 0,
      lateralThrust: 0,
    },
  };
}
