import type { LocalAsteroid, LocalSpaceInstance } from '../../core/local-space-types';

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

function createAsteroids(seed: number, width: number, height: number): LocalAsteroid[] {
  const random = createRandom(seed);
  const count = 22 + Math.floor(random() * 9);
  const asteroids: LocalAsteroid[] = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 22 + random() * 42;
    const sideBias = index % 2 === 0 ? 0.22 : 0.78;
    const x = width * (sideBias + (random() - 0.5) * 0.42);
    const y = height * (0.12 + random() * 0.76);
    const oreCapacity = Math.round(70 + random() * 180);

    asteroids.push({
      id: `asteroid-${seed}-${index}`,
      position: { x, y },
      velocity: { x: 0, y: 0 },
      radius,
      rotation: random() * Math.PI * 2,
      oreType: random() > 0.82 ? 'Rich Ore' : 'Industrial Ore',
      oreRemaining: oreCapacity,
      oreCapacity,
    });
  }

  return asteroids;
}

export function generateMiningSpace(sourceLocationId: string, seed: number): LocalSpaceInstance {
  const width = 1800;
  const height = 1050;

  return {
    id: `${sourceLocationId}-${seed}`,
    sourceLocationId,
    seed,
    width,
    height,
    asteroids: createAsteroids(seed, width, height),
    chunks: [],
    ship: {
      position: { x: width * 0.5, y: height * 0.5 },
      headingRadians: 0,
      speed: 0,
    },
  };
}
