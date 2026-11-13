import type { StarMapLocationView } from '../../features/star-map/star-map-view-model';
import type { MapCamera } from './map-camera';
import { safeDestinationRadius } from '../../systems/navigation/route-safety';

/** Grounded, fixed civilian arrival perimeters; no safety bubbles around pirate harbors. */
export function drawSafeDestinationRings(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  locations: readonly StarMapLocationView[],
  width: number,
  height: number
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(91, 202, 171, 0.43)';
  ctx.fillStyle = 'rgba(34, 138, 119, 0.045)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 8]);
  for (const location of locations) {
    const radius = safeDestinationRadius(location);
    if (!radius) continue;
    const center = camera.worldToScreen(location.position, width, height);
    const edge = camera.worldToScreen(
      { x: location.position.x + radius, y: location.position.y },
      width,
      height
    );
    const ringRadius = Math.hypot(edge.x - center.x, edge.y - center.y);
    if (ringRadius <= 2) continue;
    ctx.beginPath();
    ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
