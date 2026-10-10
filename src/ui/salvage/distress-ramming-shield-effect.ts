import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';
import type { MapCamera } from '../map/map-camera';

export function drawDistressRammingShield(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: SalvageSpaceViewModel,
  width: number,
  height: number
): void {
  const impact = model.distressRamming;
  if (!impact?.impactPoint || impact.impactAge >= 0.8) return;
  const point = camera.worldToScreen(impact.impactPoint, width, height);
  const progress = impact.impactAge / 0.8;
  context.save();
  context.strokeStyle = 'rgba(91, 221, 255, ' + 0.95 * (1 - progress) + ')';
  context.lineWidth = 5 * (1 - progress) + 1;
  context.shadowColor = '#83e6ff';
  context.shadowBlur = 20 * (1 - progress);
  context.beginPath();
  context.arc(point.x, point.y, 8 + progress * 35, -1.4, 1.4);
  context.stroke();
  context.restore();
}
