import type { WorldPoint } from '../../core/world-types';
import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';
import { mapSymbolScale } from './map-visual-scale';
import { StationSymbolRenderer } from './station-symbol-renderer';

export class NavMapRenderer {
  private readonly stationSymbols: StationSymbolRenderer;

  constructor(private readonly context: CanvasRenderingContext2D) {
    this.stationSymbols = new StationSymbolRenderer(context);
  }

  drawBackground(width: number, height: number, timeSeconds: number): void {
    const context = this.context;
    context.fillStyle = '#010807';
    context.fillRect(0, 0, width, height);

    context.save();
    context.strokeStyle = 'rgba(83, 181, 126, .075)';
    context.lineWidth = 1;
    const spacing = 64;
    for (let x = (width % spacing) * 0.5; x < width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = (height % spacing) * 0.5; y < height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const centerX = width * 0.5;
    const centerY = height * 0.5;
    context.strokeStyle = 'rgba(99, 211, 147, .095)';
    for (let radius = 120; radius < Math.max(width, height); radius += 120) {
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }

    const sweepAngle = timeSeconds * 0.22;
    context.strokeStyle = 'rgba(112, 236, 161, .16)';
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(
      centerX + Math.cos(sweepAngle) * Math.max(width, height),
      centerY + Math.sin(sweepAngle) * Math.max(width, height)
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
      this.stationSymbols.draw(location.stationType ?? 'utility', point, radius);
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
    context.beginPath();
    context.moveTo(-radius * 1.25, 0);
    context.lineTo(-radius * 0.72, 0);
    context.moveTo(radius * 0.72, 0);
    context.lineTo(radius * 1.25, 0);
    context.moveTo(0, -radius * 1.25);
    context.lineTo(0, -radius * 0.72);
    context.moveTo(0, radius * 0.72);
    context.lineTo(0, radius * 1.25);
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
