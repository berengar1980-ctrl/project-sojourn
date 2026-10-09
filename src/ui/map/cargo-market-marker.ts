import type { WorldPoint } from '../../core/world-types';

export type CargoMarkerRating = 'best' | 'good' | 'low';

export function drawCargoMarketMarker(
  context: CanvasRenderingContext2D,
  point: WorldPoint,
  radius: number,
  rating: CargoMarkerRating
): void {
  const color = rating === 'best' ? '#60dc9d' : rating === 'good' ? '#e8b558' : '#bc7c72';
  context.save();
  context.strokeStyle = color;
  context.lineWidth = rating === 'best' ? 3 : 2;
  context.beginPath();
  context.arc(point.x, point.y, radius + 15, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x + radius + 11, point.y - radius - 9, 4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
