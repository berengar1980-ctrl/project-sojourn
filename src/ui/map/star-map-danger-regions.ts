import type { WorldRegion } from '../../core/world-types';
import type { MapCamera } from './map-camera';

/** Fixed geographic risk fields are never recolored by ship upgrades or moving pirates. */
export function drawStarMapDangerRegions(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  regions: readonly WorldRegion[],
  bands: Readonly<Record<'green' | 'yellow' | 'red', boolean>>,
  visible: boolean,
  width: number,
  height: number
): void {
  if (!visible) return;
  if (bands.green) {
    ctx.fillStyle = 'rgba(35, 150, 91, 0.055)';
    ctx.fillRect(0, 0, width, height);
  }
  for (const region of regions) {
    const band = region.dangerLevel >= 3 ? 'red' : region.dangerLevel === 2 ? 'yellow' : 'green';
    if (!bands[band]) continue;
    const center = camera.worldToScreen(region.center, width, height);
    const perimeter = camera.worldToScreen(
      { x: region.center.x + region.radius, y: region.center.y },
      width,
      height
    );
    const radius = Math.hypot(perimeter.x - center.x, perimeter.y - center.y);
    if (radius < 1) continue;
    const color =
      band === 'red' ? '205, 58, 65' : band === 'yellow' ? '205, 159, 51' : '40, 150, 100';
    const haze = ctx.createRadialGradient(
      center.x,
      center.y,
      radius * 0.18,
      center.x,
      center.y,
      radius
    );
    haze.addColorStop(0, 'rgba(' + color + ',0.19)');
    haze.addColorStop(0.55, 'rgba(' + color + ',0.13)');
    haze.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
