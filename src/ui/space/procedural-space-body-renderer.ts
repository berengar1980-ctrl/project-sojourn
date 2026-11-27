import type { PlanetBiome, WorldPoint } from '../../core/world-types';
import { measurePerformance } from '../../core/performance-diagnostics';
import {
  createAsteroidSurface,
  createAsteroidTexture,
  createPlanetTexture,
  createRandom,
  hashSeed,
  type AsteroidSurface,
  type AsteroidTextureDetail,
} from './procedural-surface-textures';

export interface SpaceLight {
  readonly x: number;
  readonly y: number;
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
  readonly biome?: PlanetBiome;
  readonly light: SpaceLight;
}

function normalize(light: SpaceLight): SpaceLight {
  const length = Math.hypot(light.x, light.y) || 1;
  return { x: light.x / length, y: light.y / length };
}

export class ProceduralSpaceBodyRenderer {
  private readonly asteroidSurfaceCache = new Map<string, AsteroidSurface>();
  private readonly asteroidSpriteCache = new Map<string, HTMLCanvasElement>();
  private readonly planetTextureCache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly context: CanvasRenderingContext2D) {}

  drawAsteroid(options: DrawAsteroidOptions): void {
    const detail = this.asteroidDetail(options.radius);
    const sprite = this.asteroidSprite(options.id, options.kind, detail);
    const context = this.context;

    context.save();
    context.translate(options.x, options.y);
    context.rotate(options.rotation);
    context.drawImage(
      sprite,
      -options.radius,
      -options.radius,
      options.radius * 2,
      options.radius * 2
    );
    context.restore();

    // Tiny debris is too small for a meaningful lighting pass.
    // Avoid per-frame clipping and gradient creation at this LOD.
    if (options.radius < 5) return;

    const surface = this.asteroidSurface(options.id, options.kind);
    const light = normalize(options.light);
    context.save();
    context.translate(options.x, options.y);
    this.traceOutline(surface.outline, options.radius, options.rotation);
    // The current path is not part of the Canvas drawing state. Restoring
    // the clip preserves the exact path for the unclipped rim stroke.
    context.save();
    context.clip();
    this.drawSphereLight(options.radius, light, options.kind === 'debris' ? 0.72 : 0.84);
    context.restore();
    context.strokeStyle = 'rgba(205, 198, 188, .12)';
    context.lineWidth = Math.max(0.7, Math.min(1.15, options.radius * 0.025));
    context.stroke();
    context.restore();
  }

  drawPlanet(options: DrawPlanetOptions): void {
    const light = normalize(options.light);
    const biome = options.biome ?? 'temperate';
    const texture = this.planetTexture(options.id, options.dangerLevel, biome);
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
    this.drawSphereLight(options.radius, light, 0.9);
    context.restore();

    this.drawPlanetAtmosphere(options.x, options.y, options.radius, light, biome);
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
    const cached = this.asteroidSurfaceCache.get(key);
    if (cached) return cached;

    const surface = createAsteroidSurface(id, kind);
    this.asteroidSurfaceCache.set(key, surface);
    return surface;
  }

  private asteroidDetail(radius: number): AsteroidTextureDetail {
    if (radius < 15) return 'far';
    if (radius > 60) return 'near';
    return 'normal';
  }

  private asteroidSprite(
    id: string,
    kind: 'resource' | 'debris',
    detail: AsteroidTextureDetail
  ): HTMLCanvasElement {
    const key = id + ':' + kind + ':' + detail;
    const cached = this.asteroidSpriteCache.get(key);
    if (cached) return cached;

    const size =
      detail === 'far'
        ? kind === 'debris'
          ? 48
          : 64
        : detail === 'near'
          ? kind === 'debris'
            ? 160
            : 320
          : kind === 'debris'
            ? 64
            : 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Asteroid sprite canvas unavailable.');

    const surface = this.asteroidSurface(id, kind);
    // The finished sprite owns the baked texture. Do not retain a second canvas.
    const texture = measurePerformance('canvas.asteroid.texture-build', () =>
      createAsteroidTexture(id, kind, detail)
    );
    const radius = size * 0.5;
    context.save();
    context.translate(radius, radius);
    this.traceStaticOutline(context, surface.outline, radius);
    context.clip();
    context.drawImage(texture, -radius, -radius, size, size);

    if (kind === 'resource') {
      this.drawStaticCraterRelief(context, surface, radius);
      this.drawStaticFractures(context, surface, radius);
      if (detail === 'near') this.drawStaticMicroRelief(context, id, radius);
    }

    context.restore();
    this.asteroidSpriteCache.set(key, canvas);
    return canvas;
  }

  private drawStaticMicroRelief(
    context: CanvasRenderingContext2D,
    id: string,
    radius: number
  ): void {
    const random = createRandom(hashSeed(id + ':micro-relief'));
    const count = 24;

    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius * 0.72;
      const craterRadius = radius * (0.008 + random() * 0.018);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const gradient = context.createRadialGradient(
        x - craterRadius * 0.25,
        y - craterRadius * 0.25,
        craterRadius * 0.08,
        x,
        y,
        craterRadius
      );
      gradient.addColorStop(0, 'rgba(8, 8, 8, .5)');
      gradient.addColorStop(0.68, 'rgba(25, 23, 21, .2)');
      gradient.addColorStop(1, 'rgba(205, 196, 181, .08)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, craterRadius, 0, Math.PI * 2);
      context.fill();
    }
  }

  private traceStaticOutline(
    context: CanvasRenderingContext2D,
    outline: readonly WorldPoint[],
    radius: number
  ): void {
    if (outline.length < 3) return;
    const first = outline[0]!;
    const last = outline[outline.length - 1]!;
    context.beginPath();
    context.moveTo((first.x + last.x) * 0.5 * radius, (first.y + last.y) * 0.5 * radius);

    for (let index = 0; index < outline.length; index += 1) {
      const point = outline[index]!;
      const next = outline[(index + 1) % outline.length]!;
      context.quadraticCurveTo(
        point.x * radius,
        point.y * radius,
        (point.x + next.x) * 0.5 * radius,
        (point.y + next.y) * 0.5 * radius
      );
    }

    context.closePath();
  }

  private drawStaticCraterRelief(
    context: CanvasRenderingContext2D,
    surface: AsteroidSurface,
    radius: number
  ): void {
    for (const crater of surface.craters) {
      const craterRadius = crater.radius * radius;
      context.save();
      context.translate(crater.x * radius, crater.y * radius);
      context.rotate(crater.phase);
      context.scale(1, crater.squash);
      this.traceStaticCrater(context, craterRadius, crater.phase);

      const bowl = context.createRadialGradient(0, 0, craterRadius * 0.08, 0, 0, craterRadius);
      bowl.addColorStop(0, 'rgba(2, 2, 2, .76)');
      bowl.addColorStop(0.58, 'rgba(12, 11, 10, .48)');
      bowl.addColorStop(0.82, 'rgba(40, 37, 33, .15)');
      bowl.addColorStop(1, 'rgba(185, 178, 166, .1)');
      context.fillStyle = bowl;
      context.fill();
      context.restore();
    }
  }

  private traceStaticCrater(
    context: CanvasRenderingContext2D,
    radius: number,
    phase: number
  ): void {
    const vertices = 14;
    context.beginPath();
    for (let index = 0; index < vertices; index += 1) {
      const angle = (index / vertices) * Math.PI * 2;
      const wobble =
        0.84 + Math.sin(angle * 5 + phase) * 0.07 + Math.sin(angle * 9 - phase) * 0.035;
      const x = Math.cos(angle) * radius * wobble;
      const y = Math.sin(angle) * radius * wobble;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  private drawStaticFractures(
    context: CanvasRenderingContext2D,
    surface: AsteroidSurface,
    radius: number
  ): void {
    context.fillStyle = 'rgba(2, 3, 4, .52)';
    for (const fracture of surface.fractures) {
      for (let index = 0; index < fracture.points.length - 1; index += 1) {
        const start = fracture.points[index]!;
        const end = fracture.points[index + 1]!;
        const progress = index / (fracture.points.length - 1);
        const width = radius * 0.018 * Math.pow(1 - progress, 1.35) + 0.2;
        const dx = (end.x - start.x) * radius;
        const dy = (end.y - start.y) * radius;
        const length = Math.hypot(dx, dy) || 1;
        const nx = (-dy / length) * width;
        const ny = (dx / length) * width;
        const sx = start.x * radius;
        const sy = start.y * radius;
        const ex = end.x * radius;
        const ey = end.y * radius;

        context.beginPath();
        context.moveTo(sx + nx, sy + ny);
        context.lineTo(ex + nx * 0.32, ey + ny * 0.32);
        context.lineTo(ex - nx * 0.32, ey - ny * 0.32);
        context.lineTo(sx - nx, sy - ny);
        context.closePath();
        context.fill();
      }
    }
  }

  private planetTexture(id: string, dangerLevel: number, biome: PlanetBiome): HTMLCanvasElement {
    const key = id + ':' + dangerLevel + ':' + biome;
    const cached = this.planetTextureCache.get(key);
    if (cached) return cached;

    const texture = createPlanetTexture(id, dangerLevel, biome);
    this.planetTextureCache.set(key, texture);
    return texture;
  }

  private traceOutline(outline: readonly WorldPoint[], radius: number, rotation: number): void {
    if (outline.length < 3) return;

    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const rotated = outline.map((point) => ({
      x: point.x * cosine - point.y * sine,
      y: point.x * sine + point.y * cosine,
    }));
    const first = rotated[0]!;
    const last = rotated[rotated.length - 1]!;
    this.context.beginPath();
    this.context.moveTo((first.x + last.x) * 0.5 * radius, (first.y + last.y) * 0.5 * radius);

    for (let index = 0; index < rotated.length; index += 1) {
      const point = rotated[index]!;
      const next = rotated[(index + 1) % rotated.length]!;
      this.context.quadraticCurveTo(
        point.x * radius,
        point.y * radius,
        (point.x + next.x) * 0.5 * radius,
        (point.y + next.y) * 0.5 * radius
      );
    }

    this.context.closePath();
  }

  private drawSphereLight(radius: number, light: SpaceLight, darkness: number): void {
    const context = this.context;
    const directional = context.createLinearGradient(
      light.x * radius,
      light.y * radius,
      -light.x * radius,
      -light.y * radius
    );
    directional.addColorStop(0, 'rgba(255,255,255,.11)');
    directional.addColorStop(0.38, 'rgba(255,255,255,.015)');
    directional.addColorStop(0.54, 'rgba(0,0,0,.14)');
    directional.addColorStop(0.7, 'rgba(0,0,0,' + darkness * 0.48 + ')');
    directional.addColorStop(1, 'rgba(0,0,0,' + darkness + ')');
    context.fillStyle = directional;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);

    const edge = context.createRadialGradient(0, 0, radius * 0.36, 0, 0, radius);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(0.72, 'rgba(0,0,0,.05)');
    edge.addColorStop(1, 'rgba(0,0,0,.58)');
    context.fillStyle = edge;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  }

  private drawPlanetAtmosphere(
    x: number,
    y: number,
    radius: number,
    light: SpaceLight,
    biome: PlanetBiome
  ): void {
    if (biome === 'barren') return;
    const context = this.context;
    const tint =
      biome === 'desert' || biome === 'scorched'
        ? '195, 145, 93'
        : biome === 'ice'
          ? '151, 205, 226'
          : biome === 'gas-giant'
            ? '183, 201, 204'
            : '140, 184, 211';
    const glow = context.createRadialGradient(
      x + light.x * radius * 0.1,
      y + light.y * radius * 0.1,
      radius * 0.84,
      x,
      y,
      radius * 1.08
    );
    glow.addColorStop(0, 'rgba(' + tint + ', 0)');
    glow.addColorStop(0.82, 'rgba(' + tint + ', .025)');
    glow.addColorStop(1, 'rgba(' + tint + ', .16)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 1.08, 0, Math.PI * 2);
    context.fill();
  }
}
