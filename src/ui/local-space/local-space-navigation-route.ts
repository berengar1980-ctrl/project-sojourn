import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';
import type { MapCamera } from '../map/map-camera';

export function drawLocalNavigationRoute(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  model: LocalSpaceViewModel,
  width: number,
  height: number
): void {
  const route = model.navigationRoute;
  const target = model.navigationTarget;
  if (!target || route.length === 0) return;

  context.save();
  context.strokeStyle = 'rgba(104, 213, 239, .7)';
  context.lineWidth = 1.25;
  context.setLineDash([6, 6]);
  context.beginPath();

  route.forEach((point, index) => {
    const screen = camera.worldToScreen(point, width, height);
    if (index === 0) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
  });
  context.stroke();
  context.setLineDash([]);

  const point = camera.worldToScreen(target, width, height);
  const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.12;
  const radius = 8 * pulse;
  context.strokeStyle = 'rgba(119, 226, 248, .9)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(point.x - radius - 5, point.y);
  context.lineTo(point.x + radius + 5, point.y);
  context.moveTo(point.x, point.y - radius - 5);
  context.lineTo(point.x, point.y + radius + 5);
  context.stroke();
  context.restore();
}
