import type { WorldPoint } from '../../core/world-types';
import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';
import { mapSymbolScale } from './map-visual-scale';

export class NavMapRenderer {
  constructor(private readonly context: CanvasRenderingContext2D) {}

  drawBackground(
    width: number,
    height: number,
    timeSeconds: number,
    radarOrigin: WorldPoint,
    relativeZoom: number
  ): void {
    const context = this.context;
    context.fillStyle = '#010807';
    context.fillRect(0, 0, width, height);

    context.save();
    context.strokeStyle = 'rgba(83, 181, 126, .075)';
    context.lineWidth = 1;
    const spacing = 64 * relativeZoom;
    const offsetX = ((radarOrigin.x % spacing) + spacing) % spacing;
    const offsetY = ((radarOrigin.y % spacing) + spacing) % spacing;
    for (let x = offsetX; x < width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = offsetY; y < height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const maximumRadius = Math.hypot(
      Math.max(radarOrigin.x, width - radarOrigin.x),
      Math.max(radarOrigin.y, height - radarOrigin.y)
    );
    context.strokeStyle = 'rgba(99, 211, 147, .095)';
    for (let radius = 120 * relativeZoom; radius < maximumRadius; radius += 120 * relativeZoom) {
      context.beginPath();
      context.arc(radarOrigin.x, radarOrigin.y, radius, 0, Math.PI * 2);
      context.stroke();
    }

    const sweepAngle = timeSeconds * 0.22;
    context.strokeStyle = 'rgba(112, 236, 161, .16)';
    context.beginPath();
    context.moveTo(radarOrigin.x, radarOrigin.y);
    context.lineTo(
      radarOrigin.x + Math.cos(sweepAngle) * maximumRadius,
      radarOrigin.y + Math.sin(sweepAngle) * maximumRadius
    );
    context.stroke();
    context.restore();
  }

  drawStar(point: WorldPoint, relativeZoom: number): void {
    const context = this.context;
    const radius = 25 * mapSymbolScale(relativeZoom);
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = 'rgba(255, 211, 113, .82)';
    context.fillStyle = 'rgba(255, 193, 76, .14)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawLocation(location: StarMapLocationView, point: WorldPoint, radius: number): void {
    if (location.kind === 'station') {
      this.drawStation(point, radius);
      return;
    }
    if (location.kind === 'wreck') {
      this.drawWreck(point, radius);
      return;
    }
    if (location.kind === 'asteroid-field') {
      this.drawAsteroidField(location.id, point, radius);
      return;
    }

    const context = this.context;
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = location.kind === 'moon' ? '#729d87' : '#76c9a0';
    context.fillStyle = 'rgba(71, 165, 117, .08)';
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    // Orthographic longitude and latitude projections make planets read as globes.
    context.strokeStyle = 'rgba(111, 201, 151, .42)';
    context.lineWidth = 0.8;
    for (const widthFactor of [0.42, 0.78]) {
      context.beginPath();
      context.ellipse(0, 0, radius * widthFactor, radius, 0, 0, Math.PI * 2);
      context.stroke();
    }
    for (const latitude of [-0.5, 0, 0.5]) {
      const arcWidth = radius * Math.sqrt(1 - latitude * latitude);
      context.beginPath();
      context.ellipse(0, radius * latitude, arcWidth, radius * 0.12, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private drawStation(point: WorldPoint, radius: number): void {
    const context = this.context;
    const size = Math.max(7, radius * 0.8);
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = '#79d7a4';
    context.fillStyle = 'rgba(71, 165, 117, .09)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.rect(-size * 0.63, -size * 0.63, size * 1.26, size * 1.26);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * 0.36, 0, Math.PI * 2);
    context.moveTo(-size * 1.12, 0);
    context.lineTo(-size * 0.63, 0);
    context.moveTo(size * 0.63, 0);
    context.lineTo(size * 1.12, 0);
    context.moveTo(0, -size * 1.12);
    context.lineTo(0, -size * 0.63);
    context.moveTo(0, size * 0.63);
    context.lineTo(0, size * 1.12);
    context.stroke();
    context.restore();
  }

  drawShip(point: WorldPoint, headingRadians: number, relativeZoom: number): void {
    const context = this.context;
    const scale = mapSymbolScale(relativeZoom);
    const size = 8 + scale * 3;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(headingRadians);
    context.strokeStyle = '#9dffc4';
    context.fillStyle = 'rgba(112, 232, 157, .18)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(size, 0);
    context.lineTo(-size * 0.72, -size * 0.58);
    context.lineTo(-size * 0.35, 0);
    context.lineTo(-size * 0.72, size * 0.58);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawAsteroidField(id: string, point: WorldPoint, radius: number): void {
    const context = this.context;
    const seed = this.hashSeed(id);
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = 'rgba(103, 177, 136, .46)';
    context.setLineDash([3, 4]);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(116, 194, 148, .72)';
    for (let index = 0; index < 9; index += 1) {
      const angle = ((seed % 97) + index * 137) * 0.13;
      const distance = radius * (0.18 + ((seed + index * 31) % 61) / 100);
      const size = 1.2 + ((seed + index * 17) % 18) / 10;
      context.beginPath();
      context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawWreck(point: WorldPoint, radius: number): void {
    const context = this.context;
    context.save();
    context.strokeStyle = '#7fae91';
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(point.x - radius, point.y + radius * 0.5);
    context.lineTo(point.x + radius * 0.8, point.y - radius * 0.5);
    context.moveTo(point.x - radius * 0.6, point.y - radius * 0.7);
    context.lineTo(point.x + radius, point.y + radius * 0.7);
    context.stroke();
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
