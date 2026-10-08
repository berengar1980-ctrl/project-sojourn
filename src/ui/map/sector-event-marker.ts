import type { WorldPoint } from '../../core/world-types';

export function drawSectorEventMarker(
  context: CanvasRenderingContext2D,
  id: string,
  point: WorldPoint,
  radius: number
): void {
  const distress = id.startsWith('salvage-distress-');
  if (!distress && !id.startsWith('salvage-special-')) return;
  context.save();
  context.strokeStyle = distress ? '#ff9d60' : '#6de2e8';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, radius + 6, 0, Math.PI * 2);
  context.stroke();
  context.fillText(distress ? '!' : '◆', point.x, point.y - radius - 15);
  context.restore();
}
