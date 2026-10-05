import type { PlanetRingStyle, WorldPoint } from '../../core/world-types';

export class PlanetRingRenderer {
  constructor(private readonly context: CanvasRenderingContext2D) {}

  drawBack(style: PlanetRingStyle, id: string, point: WorldPoint, radius: number): void {
    if (style === 'asteroid') {
      this.drawAsteroidRing(id, point, radius);
      return;
    }
    this.drawBand(style, point, radius, false);
  }

  drawFront(style: PlanetRingStyle, point: WorldPoint, radius: number): void {
    if (style === 'asteroid') return;
    this.drawBand(style, point, radius, true);
  }

  private drawBand(
    style: Exclude<PlanetRingStyle, 'asteroid'>,
    point: WorldPoint,
    radius: number,
    front: boolean
  ): void {
    const context = this.context;
    const outer = style === 'broad' ? radius * 1.85 : radius * 1.55;
    const width = style === 'broad' ? Math.max(3, radius * 0.22) : Math.max(1.5, radius * 0.08);
    context.save();
    context.translate(point.x, point.y);
    context.rotate(-0.22);
    context.strokeStyle =
      style === 'broad' ? 'rgba(191, 179, 154, .62)' : 'rgba(194, 206, 211, .5)';
    context.lineWidth = width;
    context.beginPath();
    context.ellipse(
      0,
      0,
      outer,
      outer * 0.33,
      0,
      front ? 0 : Math.PI,
      front ? Math.PI : Math.PI * 2
    );
    context.stroke();
    if (style === 'broad') {
      context.strokeStyle = 'rgba(105, 119, 125, .55)';
      context.lineWidth = Math.max(1, width * 0.28);
      context.beginPath();
      context.ellipse(
        0,
        0,
        outer * 0.82,
        outer * 0.27,
        0,
        front ? 0 : Math.PI,
        front ? Math.PI : Math.PI * 2
      );
      context.stroke();
    }
    context.restore();
  }

  private drawAsteroidRing(id: string, point: WorldPoint, radius: number): void {
    const context = this.context;
    const seed = this.hashSeed(id);
    context.save();
    context.fillStyle = 'rgba(160, 151, 137, .72)';
    for (let index = 0; index < 34; index += 1) {
      const angle = (index / 34) * Math.PI * 2 + ((seed >>> (index % 16)) & 7) * 0.012;
      const spread = (((seed + index * 97) >>> 3) % 100) / 100;
      const orbit = radius * (1.45 + spread * 0.42);
      const x = point.x + Math.cos(angle) * orbit;
      const y = point.y + Math.sin(angle) * orbit * 0.38;
      const size = 0.8 + (((seed + index * 43) >>> 5) % 8) / 8;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private hashSeed(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
