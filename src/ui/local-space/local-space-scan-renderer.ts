import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';
import { drawTargetDetailScan, drawWideAreaScan } from '../local-operations/scan-effects';

export function drawLocalShortRangeScan(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: LocalSpaceViewModel,
  width: number,
  height: number,
  timeSeconds: number
): void {
  const progress = model.shortRangeScanProgress;
  const target = model.scanTarget;
  if (progress === null || !target) return;
  drawTargetDetailScan(
    context,
    camera.worldToScreen(target.position, width, height),
    Math.max(14, camera.scale(target.radius) + 9),
    progress,
    timeSeconds
  );
}

export function drawLocalLongRangeScan(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: LocalSpaceViewModel,
  width: number,
  height: number,
  timeSeconds: number
): void {
  const progress = model.longRangeScanProgress;
  if (progress === null) return;
  drawWideAreaScan(
    context,
    camera.worldToScreen(model.ship.position, width, height),
    progress,
    timeSeconds,
    width,
    height
  );
}
