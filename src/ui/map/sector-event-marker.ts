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
  context.lineWidth = 3;
  context.shadowColor = distress ? '#ff8a42' : '#42dbe8';
  context.shadowBlur = 14;
  context.beginPath();
  context.arc(point.x, point.y, radius + 6, 0, Math.PI * 2);
  context.stroke();
  context.textAlign = 'center';
  context.font = 'bold 12px monospace';
  context.fillStyle = distress ? '#ffb27b' : '#8df4f5';
  context.fillText(distress ? 'NOTRUF' : 'BERGUNG', point.x, point.y - radius - 14);
  context.restore();
}
