import type { WorldPoint } from '../../core/world-types';

export interface SpaceLight {
  readonly x: number;
  readonly y: number;
}

interface CraterFeature {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly squash: number;
}

interface FractureFeature {
  readonly points: readonly WorldPoint[];
}

interface AsteroidSurface {
  readonly outline: readonly WorldPoint[];
  readonly craters: readonly CraterFeature[];
  readonly fractures: readonly FractureFeature[];
}

interface DrawAsteroidOptions {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly rotation: number;
  readonly kind: 'resource' | 'debris';
  readonly light: SpaceLight;
}

interface DrawPlanetOptions {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly dangerLevel: number;
  readonly light: SpaceLight;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

function normalize(light: SpaceLight): SpaceLight {
  const length = Math.hypot(light.x, light.y) || 1;
  return { x: light.x / length, y: light.y / length };
}

function rotate(point: WorldPoint, angle: number): WorldPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export class ProceduralSpaceBodyRenderer {
  private readonly asteroidCache = new Map<string, AsteroidSurface>();
  private readonly planetTextureCache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly context: CanvasRenderingContext2D) {}

  drawAsteroid(options: DrawAsteroidOptions): void {
    const surface = this.asteroidSurface(options.id, options.kind);
    const light = normalize(options.light);
    const context = this.context;

    context.save();
    context.translate(options.x, options.y);
    this.traceOutline(surface.outline, options.radius, options.rotation);
    context.clip();

    this.drawAsteroidBase(options.radius, options.kind, light);
    if (options.kind === 'resource' && options.radius >= 8) {
      this.drawCraterRelief(surface, options.radius, options.rotation, light);
      if (options.radius >= 13) {
        this.drawFractures(surface, options.radius, options.rotation, light);
      }
    }
    this.drawWorldLight(options.radius, light, options.kind === 'debris' ? 0.66 : 0.78);
    context.restore();

    context.save();
    context.translate(options.x, options.y);
    this.traceOutline(surface.outline, options.radius, options.rotation);
    context.strokeStyle = 'rgba(205, 198, 188, .16)';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  drawPlanet(options: DrawPlanetOptions): void {
    const light = normalize(options.light);
    const texture = this.planetTexture(options.id, options.dangerLevel);
    const context = this.context;

    context.save();
    context.beginPath();
    context.arc(options.x, options.y, options.radius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      texture,
      options.x - options.radius,
      options.y - options.radius,
      options.radius * 2,
      options.radius * 2
    );
    context.translate(options.x, options.y);
    this.drawWorldLight(options.radius, light, 0.84);
    context.restore();

    context.save();
    context.strokeStyle = 'rgba(210, 222, 228, .18)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(options.x, options.y, options.radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawAsteroidField(id: string, x: number, y: number, radius: number, light: SpaceLight): void {
    const random = createRandom(hashSeed(id));
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.399 + random() * 0.35;
      const spread = radius * (0.18 + random() * 0.72);
      const size = 1.8 + random() * 3.4;
      this.drawAsteroid({
        id: id + '-map-' + index,
        x: x + Math.cos(angle) * spread,
        y: y + Math.sin(angle) * spread,
        radius: size,
        rotation: random() * Math.PI * 2,
        kind: index % 5 === 0 ? 'resource' : 'debris',
        light,
      });
    }
  }

  private asteroidSurface(id: string, kind: 'resource' | 'debris'): AsteroidSurface {
    const key = id + ':' + kind;
    const cached = this.asteroidCache.get(key);
    if (cached) return cached;

    const random = createRandom(hashSeed(key));
    const vertices = kind === 'debris' ? 9 : 16;
    const outline: WorldPoint[] = [];
    for (let index = 0; index < vertices; index += 1) {
      const angle = (index / vertices) * Math.PI * 2;
      const radius = 0.76 + random() * 0.28;
      outline.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }

    const craters = kind === 'resource' ? this.createCraters(random) : [];
    const fractures = kind === 'resource' ? this.createFractures(random) : [];
    const surface = { outline, craters, fractures };
    this.asteroidCache.set(key, surface);
    return surface;
  }

  private createCraters(random: () => number): readonly CraterFeature[] {
    const craters: CraterFeature[] = [];
    const count = 5 + Math.floor(random() * 4);
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * 0.62;
      craters.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        radius: 0.055 + random() * 0.09,
        squash: 0.62 + random() * 0.3,
      });
    }
    return craters;
  }

  private createFractures(random: () => number): readonly FractureFeature[] {
    const result: FractureFeature[] = [];
    const fractureCount = 2 + Math.floor(random() * 3);
    for (let fracture = 0; fracture < fractureCount; fracture += 1) {
      const points: WorldPoint[] = [];
      let angle = random() * Math.PI * 2;
      let x = (random() - 0.5) * 0.55;
      let y = (random() - 0.5) * 0.55;
      points.push({ x, y });
      const steps = 7 + Math.floor(random() * 4);
      for (let step = 1; step < steps; step += 1) {
        angle += (random() - 0.5) * 1.15;
        const distance = 0.055 + random() * 0.045;
        x += Math.cos(angle) * distance;
        y += Math.sin(angle) * distance;
        points.push({ x, y });
      }
      result.push({ points });
    }
    return result;
  }

  private traceOutline(outline: readonly WorldPoint[], radius: number, rotation: number): void {
    this.context.beginPath();
    outline.forEach((point, index) => {
      const rotated = rotate(point, rotation);
      const x = rotated.x * radius;
      const y = rotated.y * radius;
      if (index === 0) this.context.moveTo(x, y);
      else this.context.lineTo(x, y);
    });
    this.context.closePath();
  }

  private drawAsteroidBase(radius: number, kind: 'resource' | 'debris', light: SpaceLight): void {
    const context = this.context;
    const gradient = context.createRadialGradient(
      light.x * radius * 0.2,
      light.y * radius * 0.2,
      radius * 0.08,
      0,
      0,
      radius
    );
    if (kind === 'debris') {
      gradient.addColorStop(0, '#77716a');
      gradient.addColorStop(0.55, '#4f4943');
      gradient.addColorStop(1, '#292624');
    } else {
      gradient.addColorStop(0, '#9a9187');
      gradient.addColorStop(0.5, '#665f58');
      gradient.addColorStop(1, '#302d2a');
    }
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  }

  private drawCraterRelief(
    surface: AsteroidSurface,
    radius: number,
    rotation: number,
    light: SpaceLight
  ): void {
    const context = this.context;
    for (const crater of surface.craters) {
      const point = rotate(crater, rotation);
      const x = point.x * radius;
      const y = point.y * radius;
      const craterRadius = crater.radius * radius;
      const gradient = context.createRadialGradient(
        x + light.x * craterRadius * 0.16,
        y + light.y * craterRadius * 0.16,
        craterRadius * 0.05,
        x,
        y,
        craterRadius
      );
      gradient.addColorStop(0, 'rgba(2, 3, 4, .76)');
      gradient.addColorStop(0.48, 'rgba(10, 11, 12, .5)');
      gradient.addColorStop(1, 'rgba(15, 16, 16, 0)');
      context.save();
      context.translate(x, y);
      context.scale(1, crater.squash);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, craterRadius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(226, 222, 214, .11)';
      context.beginPath();
      context.arc(
        light.x * craterRadius * 0.48,
        light.y * craterRadius * 0.48,
        craterRadius * 0.38,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
    }
  }

  private drawFractures(
    surface: AsteroidSurface,
    radius: number,
    rotation: number,
    light: SpaceLight
  ): void {
    const context = this.context;
    for (const fracture of surface.fractures) {
      for (let index = 0; index < fracture.points.length - 1; index += 1) {
        const start = rotate(fracture.points[index]!, rotation);
        const end = rotate(fracture.points[index + 1]!, rotation);
        const progress = index / (fracture.points.length - 1);
        context.strokeStyle = 'rgba(3, 4, 5, ' + (0.34 * (1 - progress) + 0.05) + ')';
        context.lineWidth = Math.max(0.35, radius * 0.018 * Math.pow(1 - progress, 1.25));
        context.beginPath();
        context.moveTo(start.x * radius, start.y * radius);
        context.lineTo(end.x * radius, end.y * radius);
        context.stroke();

        context.strokeStyle = 'rgba(225, 221, 213, ' + 0.055 * (1 - progress) + ')';
        context.lineWidth = Math.max(0.25, context.lineWidth * 0.35);
        context.beginPath();
        context.moveTo(start.x * radius + light.x * 0.8, start.y * radius + light.y * 0.8);
        context.lineTo(end.x * radius + light.x * 0.8, end.y * radius + light.y * 0.8);
        context.stroke();
      }
    }
  }

  private drawWorldLight(radius: number, light: SpaceLight, darkness: number): void {
    const context = this.context;
    const gradient = context.createLinearGradient(
      light.x * radius,
      light.y * radius,
      -light.x * radius,
      -light.y * radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,.09)');
    gradient.addColorStop(0.38, 'rgba(255,255,255,.015)');
    gradient.addColorStop(0.58, 'rgba(0,0,0,.16)');
    gradient.addColorStop(0.78, 'rgba(0,0,0,' + darkness * 0.62 + ')');
    gradient.addColorStop(1, 'rgba(0,0,0,' + darkness + ')');
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  }

  private planetTexture(id: string, dangerLevel: number): HTMLCanvasElement {
    const key = id + ':' + dangerLevel;
    const cached = this.planetTextureCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Planet texture canvas unavailable.');

    const random = createRandom(hashSeed(key));
    const base = dangerLevel >= 2 ? '#745448' : dangerLevel === 1 ? '#68705f' : '#536d86';
    context.fillStyle = base;
    context.beginPath();
    context.arc(64, 64, 63, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.beginPath();
    context.arc(64, 64, 62, 0, Math.PI * 2);
    context.clip();

    for (let index = 0; index < 34; index += 1) {
      const x = 18 + random() * 92;
      const y = 18 + random() * 92;
      const width = 8 + random() * 24;
      const height = 4 + random() * 14;
      context.fillStyle = index % 3 === 0 ? 'rgba(205, 194, 158, .14)' : 'rgba(22, 31, 37, .16)';
      context.beginPath();
      context.ellipse(x, y, width, height, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
    this.planetTextureCache.set(key, canvas);
    return canvas;
  }
}
