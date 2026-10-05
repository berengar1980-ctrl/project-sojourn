import type { PlanetBiome, WorldPoint } from '../../core/world-types';

export interface SurfaceCrater {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly squash: number;
  readonly phase: number;
}

export interface SurfaceFracture {
  readonly points: readonly WorldPoint[];
}

export interface AsteroidSurface {
  readonly outline: readonly WorldPoint[];
  readonly craters: readonly SurfaceCrater[];
  readonly fractures: readonly SurfaceFracture[];
}

export type AsteroidTextureDetail = 'far' | 'normal' | 'near';

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lattice(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = lattice(seed, x0, y0);
  const b = lattice(seed, x0 + 1, y0);
  const c = lattice(seed, x0, y0 + 1);
  const d = lattice(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function fbm(seed: number, x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let normalization = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise(seed + octave * 1013, x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }

  return value / normalization;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixChannel(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function paintPixel(
  data: Uint8ClampedArray,
  index: number,
  first: readonly number[],
  second: readonly number[],
  mix: number,
  brightness: number,
  alpha = 255
): void {
  data[index] = clampByte(mixChannel(first[0] ?? 0, second[0] ?? 0, mix) * brightness);
  data[index + 1] = clampByte(mixChannel(first[1] ?? 0, second[1] ?? 0, mix) * brightness);
  data[index + 2] = clampByte(mixChannel(first[2] ?? 0, second[2] ?? 0, mix) * brightness);
  data[index + 3] = alpha;
}

export function createAsteroidSurface(id: string, kind: 'resource' | 'debris'): AsteroidSurface {
  const random = createRandom(hashSeed(id + ':' + kind));
  const vertices = kind === 'debris' ? 12 : 24;
  const outline: WorldPoint[] = [];

  for (let index = 0; index < vertices; index += 1) {
    const angle = (index / vertices) * Math.PI * 2;
    const broad = Math.sin(angle * 2 + random() * 0.8) * 0.035;
    const radius = 0.79 + random() * 0.2 + broad;
    outline.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  const craters: SurfaceCrater[] = [];
  if (kind === 'resource') {
    const craterCount = 7 + Math.floor(random() * 5);
    for (let index = 0; index < craterCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * 0.58;
      craters.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        radius: 0.055 + random() * 0.105,
        squash: 0.68 + random() * 0.25,
        phase: random() * Math.PI * 2,
      });
    }
  }

  const fractures: SurfaceFracture[] = [];
  if (kind === 'resource') {
    const fractureCount = 2 + Math.floor(random() * 3);
    for (let fracture = 0; fracture < fractureCount; fracture += 1) {
      const points: WorldPoint[] = [];
      let angle = random() * Math.PI * 2;
      let x = (random() - 0.5) * 0.42;
      let y = (random() - 0.5) * 0.42;
      points.push({ x, y });
      const steps = 8 + Math.floor(random() * 5);
      for (let step = 1; step < steps; step += 1) {
        angle += (random() - 0.5) * 1.3;
        const distance = 0.045 + random() * 0.045;
        x += Math.cos(angle) * distance;
        y += Math.sin(angle) * distance;
        points.push({ x, y });
      }
      fractures.push({ points });
    }
  }

  return { outline, craters, fractures };
}

function asteroidTextureSize(kind: 'resource' | 'debris', detail: AsteroidTextureDetail): number {
  if (detail === 'far') return kind === 'debris' ? 48 : 64;
  if (detail === 'near') return kind === 'debris' ? 160 : 320;
  return kind === 'debris' ? 64 : 160;
}

export function createAsteroidTexture(
  id: string,
  kind: 'resource' | 'debris',
  detail: AsteroidTextureDetail = 'normal'
): HTMLCanvasElement {
  const size = asteroidTextureSize(kind, detail);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Asteroid texture canvas unavailable.');

  const image = context.createImageData(size, size);
  const seed = hashSeed(id + ':stone');
  const dark = kind === 'debris' ? [46, 44, 42] : [54, 51, 48];
  const light = kind === 'debris' ? [116, 109, 101] : [137, 129, 119];
  const coarseOctaves = detail === 'near' ? 6 : detail === 'far' ? 4 : 5;
  const fineFrequency = detail === 'near' ? 10.5 : detail === 'far' ? 5.4 : 7.5;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const index = (y * size + x) * 4;
      const coarse = fbm(seed, nx * 2.4 + 11, ny * 2.4 - 7, coarseOctaves);
      const fine = fbm(seed + 701, nx * fineFrequency, ny * fineFrequency, 3);
      const micro = detail === 'near' ? fbm(seed + 1301, nx * 22, ny * 22, 2) : 0.5;
      const ridge = Math.abs(fine - 0.5) * 2;
      const material = Math.max(0, Math.min(1, coarse * 0.72 + fine * 0.22 + micro * 0.06));
      const brightness = 0.79 + ridge * 0.17 + (micro - 0.5) * 0.12;
      paintPixel(image.data, index, dark, light, material, brightness);
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

interface PlanetPalette {
  readonly water: readonly number[];
  readonly lowland: readonly number[];
  readonly highland: readonly number[];
  readonly ice: readonly number[];
}

// prettier-ignore
function planetPalette(biome: PlanetBiome, dangerLevel: number): PlanetPalette {
  if (biome === 'scorched') {
    return {
      water: [48, 34, 31],
      lowland: [102, 61, 43],
      highland: [164, 104, 61],
      ice: [190, 151, 112],
    };
  }
  if (biome === 'desert') {
    return {
      water: [91, 72, 55],
      lowland: [169, 130, 78],
      highland: [116, 91, 65],
      ice: [213, 194, 164],
    };
  }
  if (biome === 'ice') {
    return {
      water: [31, 56, 72],
      lowland: [123, 153, 166],
      highland: [177, 201, 209],
      ice: [224, 238, 241],
    };
  }
  if (biome === 'barren') {
    return {
      water: [58, 57, 54],
      lowland: [101, 99, 94],
      highland: [151, 147, 137],
      ice: [189, 187, 181],
    };
  }
  if (biome === 'gas-giant') {
    return {
      water: [65, 91, 111],
      lowland: [126, 152, 157],
      highland: [191, 174, 137],
      ice: [218, 211, 188],
    };
  }
  if (dangerLevel >= 2) {
    return {
      water: [40, 39, 42],
      lowland: [101, 68, 54],
      highland: [145, 103, 74],
      ice: [190, 177, 157],
    };
  }
  if (dangerLevel === 1) {
    return {
      water: [39, 57, 65],
      lowland: [78, 91, 67],
      highland: [126, 112, 82],
      ice: [197, 204, 196],
    };
  }
  return {
    water: [35, 66, 92],
    lowland: [59, 92, 79],
    highland: [116, 112, 82],
    ice: [211, 220, 220],
  };
}

function paintGasGiantPixel(
  data: Uint8ClampedArray,
  index: number,
  seed: number,
  nx: number,
  ny: number,
  palette: PlanetPalette
): void {
  const turbulence = fbm(seed + 1901, nx * 3.2, ny * 9.5, 4);
  const fine = fbm(seed + 2903, nx * 8.5, ny * 18, 3);
  const wave = Math.sin((ny + turbulence * 0.22) * 34 + fine * 2.8) * 0.5 + 0.5;
  const broad = Math.sin((ny + turbulence * 0.08) * 11) * 0.5 + 0.5;
  const first = broad > 0.55 ? palette.water : palette.lowland;
  const second = wave > 0.58 ? palette.highland : palette.ice;
  paintPixel(data, index, first, second, wave * 0.64, 0.86 + turbulence * 0.16);
}

// prettier-ignore
function paintPlanetTerrain(
  data: Uint8ClampedArray,
  index: number,
  palette: PlanetPalette,
  biome: PlanetBiome,
  elevation: number,
  detail: number,
  polar: number
): void {
  if (biome === 'temperate') {
    if (polar > 0.08 && elevation > 0.38) {
      paintPixel(data, index, palette.highland, palette.ice, Math.min(1, polar * 1.15), 0.96);
      return;
    }
    if (elevation < 0.48) {
      const depth = Math.max(0, Math.min(1, (0.48 - elevation) / 0.22));
      paintPixel(data, index, palette.water, palette.lowland, 0.08, 0.72 + depth * 0.12);
      return;
    }
  }

  if (biome === 'ice') {
    if (elevation < 0.43) {
      paintPixel(data, index, palette.water, palette.lowland, 0.18, 0.78 + detail * 0.1);
      return;
    }
    const frost = Math.max(0.38, Math.min(1, polar * 0.72 + (elevation - 0.43) * 1.25));
    paintPixel(data, index, palette.lowland, palette.ice, frost, 0.88 + detail * 0.12);
    return;
  }

  const mountain = Math.max(0, Math.min(1, (elevation - 0.4) / 0.42));
  paintPixel(
    data,
    index,
    elevation < 0.34 ? palette.water : palette.lowland,
    palette.highland,
    mountain,
    0.8 + detail * 0.2
  );
}

// prettier-ignore
export function createPlanetTexture(
  id: string,
  dangerLevel: number,
  biome: PlanetBiome = 'temperate'
): HTMLCanvasElement {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Planet texture canvas unavailable.');

  const image = context.createImageData(size, size);
  const seed = hashSeed(id + ':planet:' + biome);
  const palette = planetPalette(biome, dangerLevel);

  for (let y = 0; y < size; y += 1) {
    const latitude = Math.abs((y / (size - 1)) * 2 - 1);
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const radiusSquared = nx * nx + ny * ny;
      const index = (y * size + x) * 4;

      if (radiusSquared > 1) {
        image.data[index + 3] = 0;
        continue;
      }

      if (biome === 'gas-giant') {
        paintGasGiantPixel(image.data, index, seed, nx, ny, palette);
        continue;
      }

      const warpX = fbm(seed + 31, nx * 1.7, ny * 1.7, 3) - 0.5;
      const warpY = fbm(seed + 71, nx * 1.7 + 8, ny * 1.7 - 5, 3) - 0.5;
      const terrain = fbm(seed, nx * 2.1 + warpX * 1.15, ny * 2.1 + warpY * 1.15, 6);
      const detail = fbm(seed + 401, nx * 8.4, ny * 8.4, 3);
      const elevation = terrain * 0.83 + detail * 0.17;
      const poleSeed = ny < 0 ? seed + 811 : seed + 977;
      const polarCoast = fbm(poleSeed, nx * 2.9 + warpX * 1.7 + 3, ny * 4.2 + warpY * 1.3 - 9, 5);
      const polarFjords = fbm(poleSeed + 431, nx * 10.5, ny * 6.8, 3);
      const polarEdge =
        0.6 +
        (polarCoast - 0.5) * 0.38 +
        (polarFjords - 0.5) * 0.16 +
        (terrain - 0.5) * 0.12;
      const polarBand = Math.max(0, Math.min(1, (latitude - polarEdge) / 0.2));
      const polarMass = Math.max(0, Math.min(1, (polarCoast + polarFjords * 0.35 - 0.36) / 0.66));
      paintPlanetTerrain(
        image.data,
        index,
        palette,
        biome,
        elevation,
        detail,
        polarBand * polarMass
      );
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}
