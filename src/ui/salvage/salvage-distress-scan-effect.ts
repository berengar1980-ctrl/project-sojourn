import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import { MapCamera } from '../map/map-camera';

export function drawDistressScanEffect(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  elapsed: number,
  width: number,
  height: number
): void {
  if (elapsed < 0 || elapsed > 1.25 || !model.sectorEvent) return;
  const target = model.wrecks[0];
  if (!target) return;
  const point = camera.worldToScreen(target.position, width, height);
  const source = camera.worldToScreen(model.ship.position, width, height);
  const progress = Math.min(1, elapsed / 1.05);
  context.save();
  context.strokeStyle = 'rgba(112, 221, 245, ' + (0.9 - progress * 0.7) + ')';
  context.lineWidth = 2.5;
  context.beginPath();
  context.arc(point.x, point.y, 18 + 140 * progress, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([6, 9]);
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  context.restore();
}
