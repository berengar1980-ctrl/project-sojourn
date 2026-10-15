import type { SalvageWreckView } from '../../features/salvage/salvage-space-view-model';
import type { ScreenPoint } from '../map/map-camera';
export function drawSalvageWreckLabel(
  context: CanvasRenderingContext2D,
  wreck: SalvageWreckView,
  point: ScreenPoint,
  radius: number
): void {
  // Same map callouts as asteroid scan: ? from range scan, contents after detail scan.
  if (wreck.scanLevel === 'surveyed' || wreck.scanLevel === 'analyzed') {
    const lines =
      wreck.scanLevel === 'analyzed'
        ? wreck.resources.length > 0
          ? wreck.resources.map(
              (resource) =>
                resource.name.toUpperCase() + ' · ' + Math.round(resource.remaining) + ' t'
            )
          : ['LEER']
        : ['???'];
    const x = point.x + radius * 0.72;
    const y = point.y - radius * 0.72;
    context.save();
    context.strokeStyle = wreck.inspected ? 'rgba(121,220,237,.82)' : 'rgba(139,192,153,.72)';
    context.fillStyle = wreck.inspected ? 'rgba(179,235,244,.92)' : 'rgba(168,205,178,.84)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 10, y - 10);
    context.lineTo(x + 18, y - 10);
    context.stroke();
    context.font = '9px ui-monospace, monospace';
    lines.forEach((line, index) => context.fillText(line, x + 22, y - 10 + index * 12));
    context.restore();
  }
}
