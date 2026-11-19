import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';

const DRONE_SPRITE_URL = '/drones/security-drone-gc87r8.webp';
export const DRONE_DIAMETER_PX = 26;
export const DRONE_ROTATION_PERIOD_SECONDS = 3;
let droneSprite: HTMLImageElement | null = null;

function securityDroneSprite(): HTMLImageElement {
  if (!droneSprite) {
    droneSprite = new Image();
    droneSprite.src = DRONE_SPRITE_URL;
  }
  return droneSprite;
}

/** Shared paint-only layer for mining and salvage, including native PvP overlays. */
export function drawLocalSecurityDrone(
  ctx: CanvasRenderingContext2D,
  camera: MapCamera,
  drone: LocalSpaceViewModel['securityDrone'],
  width: number,
  height: number,
  timeSeconds: number,
  hideBody = false
): void {
  if (!drone?.operational) return;
  const point = camera.worldToScreen(drone.position, width, height);
  ctx.save();
  ctx.strokeStyle = 'rgba(80, 185, 225, 0.17)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 10]);
  ctx.beginPath();
  ctx.arc(point.x, point.y, camera.scale(drone.scanRadius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (hideBody) {
    ctx.restore();
    return;
  }
  ctx.translate(point.x, point.y);
  ctx.rotate((timeSeconds * Math.PI * 2) / DRONE_ROTATION_PERIOD_SECONDS);
  const image = securityDroneSprite();
  if (image.complete && image.naturalWidth > 0) {
    const diameter = DRONE_DIAMETER_PX * camera.getRelativeZoom();
    const radius = diameter / 2;
    ctx.drawImage(image, -radius, -radius, diameter, diameter);
  } else {
    // Preserve a visible contact marker until the small transparent asset loads.
    ctx.fillStyle = '#455b66';
    ctx.beginPath();
    ctx.arc(0, 0, (DRONE_DIAMETER_PX * camera.getRelativeZoom()) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
