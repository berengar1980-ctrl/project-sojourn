import type { SalvageWreckView } from '../../features/salvage/salvage-space-view-model';

export function drawWreckSelection(
  context: CanvasRenderingContext2D,
  wreck: SalvageWreckView,
  point: { x: number; y: number },
  radius: number
): void {
  if (!wreck.isSelected && !wreck.isWorkTarget) return;
  context.save();
  context.strokeStyle = wreck.isWorkTarget ? 'rgba(232, 184, 96, 0.95)' : 'rgba(130, 206, 224, 0.86)';
  context.lineWidth = 1.5;
  context.setLineDash(wreck.inspected ? [] : [5, 4]);
  context.beginPath();
  if (!wreck.id.startsWith('event-wreck-salvage-distress-')) {
    context.arc(point.x, point.y, radius + 10, 0, Math.PI * 2);
  } else {
    const extent = radius + 12;
    const arm = 12;
    for (const xSide of [-1, 1]) {
      for (const ySide of [-1, 1]) {
        const x = point.x + xSide * extent;
        const y = point.y + ySide * extent;
        context.moveTo(x - xSide * arm, y);
        context.lineTo(x, y);
        context.lineTo(x, y - ySide * arm);
      }
    }
  }
  context.stroke();
  context.restore();
}
