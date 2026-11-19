import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';

const DRONE_SPRITE_URL = '/drones/security-drone-gc87r8.webp';
export const DRONE_DIAMETER_PX = 26;
export const DRONE_ROTATION_PERIOD_SECONDS = 8;
let droneSprite: HTMLImageElement | null = null;

/** Drone-only omnidirectional shield, visible whenever it is charged. */
export function drawDroneShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  charge = 1,
  impact = 0
): void {
  if (charge <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(36, 160, 225, ' + (0.045 * charge + impact * 0.15) + ')';
  ctx.fill();
  ctx.strokeStyle = 'rgba(86, 215, 250, ' + (0.29 * charge + impact * 0.65) + ')';
  ctx.lineWidth = 1.3 + impact * 2;
  ctx.shadowColor = '#55caff';
  ctx.shadowBlur = 4 + impact * 12;
  ctx.stroke();
  ctx.restore();
}


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
  timeSeconds: number
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

  const diameter = DRONE_DIAMETER_PX * camera.getRelativeZoom();
  drawDroneShield(
    ctx,
    point.x,
    point.y,
    diameter * 0.62,
    1,
    Math.min(1, (drone.shieldContactSeconds ?? 0) / 0.4)
  );
  ctx.translate(point.x, point.y);
  ctx.rotate((timeSeconds * Math.PI * 2) / DRONE_ROTATION_PERIOD_SECONDS);
  const image = securityDroneSprite();
  if (image.complete && image.naturalWidth > 0) {
    const radius = diameter / 2;
    ctx.drawImage(image, -radius, -radius, diameter, diameter);
  } else {
    // Preserve a visible contact marker until the small transparent asset loads.
    ctx.fillStyle = '#455b66';
    ctx.beginPath();
    ctx.arc(0, 0, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
