import type { WorldPoint } from '../../core/world-types';
import type { MapCamera } from './map-camera';

export function localSpaceExitPoint(width: number, height: number, seed = 0): WorldPoint {
  const side = (Math.imul(seed | 0, 1103515245) >>> 0) % 4;
  const fraction = 0.2 + (((Math.imul(seed | 0, 1664525) >>> 8) % 600) / 1000);
  if (side === 0) return { x: 180, y: height * fraction };
  if (side === 1) return { x: width - 180, y: height * fraction };
  if (side === 2) return { x: width * fraction, y: 180 };
  return { x: width * fraction, y: height - 180 };
}

export function playerAtLocalExit(position: WorldPoint, width: number, height: number, seed = 0): boolean {
  const target = localSpaceExitPoint(width, height, seed);
  return Math.hypot(position.x - target.x, position.y - target.y) <= 150;
}

export function drawLocalSpaceExitGate(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number,
  seed = 0
): void {
  const point = camera.worldToScreen(localSpaceExitPoint(sceneWidth, sceneHeight, seed), width, height);
  context.save();
  context.lineWidth = 3;
  context.strokeStyle = '#70daff';
  context.fillStyle = 'rgba(82, 177, 220, 0.17)';
  context.beginPath();
  context.arc(point.x, point.y, 30, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = '#c7f4ff';
  context.font = 'bold 13px sans-serif';
  context.textAlign = 'center';
  context.fillText('AUSGANG', point.x, point.y - 40);
  context.restore();
}
