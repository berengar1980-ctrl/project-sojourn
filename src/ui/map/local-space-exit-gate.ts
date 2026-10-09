import type { WorldPoint } from '../../core/world-types';
import { MapCamera } from './map-camera';

export function localSpaceExitPoint(width: number, height: number): WorldPoint {
  return { x: width - 180, y: height * 0.5 };
}

export function playerAtLocalExit(position: WorldPoint, width: number, height: number): boolean {
  const target = localSpaceExitPoint(width, height);
  return Math.hypot(position.x - target.x, position.y - target.y) <= 150;
}

export function drawLocalSpaceExitGate(
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  width: number,
  height: number,
  sceneWidth: number,
  sceneHeight: number
): void {
  const point = camera.worldToScreen(localSpaceExitPoint(sceneWidth, sceneHeight), width, height);
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
