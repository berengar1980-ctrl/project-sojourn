import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';

/** Field drone paint-only layer; it owns no simulation state. */
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
  ctx.translate(point.x, point.y);
  ctx.rotate(timeSeconds * 0.3);
  ctx.fillStyle = '#455b66';
  ctx.strokeStyle = '#74c8df';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let corner = 0; corner < 6; corner++) {
    const angle = (corner * Math.PI) / 3;
    const x = Math.cos(angle) * 13;
    const y = Math.sin(angle) * 13;
    if (corner === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#aeeaf9';
  ctx.beginPath();
  ctx.arc(0, 0, 3 + Math.sin(timeSeconds * 3) * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
