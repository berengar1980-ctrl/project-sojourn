import type { WorldPoint } from '../../core/world-types';

export function drawStarMapWreckMarker(ctx: CanvasRenderingContext2D, point: WorldPoint, radius: number): void {
  ctx.strokeStyle = '#a68d7d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(point.x - radius, point.y + radius * 0.5);
  ctx.lineTo(point.x + radius * 0.8, point.y - radius * 0.5);
  ctx.moveTo(point.x - radius * 0.6, point.y - radius * 0.7);
  ctx.lineTo(point.x + radius, point.y + radius * 0.7);
  ctx.stroke();
}
