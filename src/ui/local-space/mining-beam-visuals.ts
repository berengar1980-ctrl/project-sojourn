import type { ScreenPoint } from '../map/map-camera';

/** The same glowing tractor field is used by player ore chunks and NPC mining ships. */
export function drawMiningTractorBeam(
  context: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  pulse: number
): void {
  context.save();
  context.shadowColor = 'rgba(74, 255, 140, .82)';
  context.shadowBlur = 7 + pulse * 8;
  context.strokeStyle = 'rgba(54, 229, 117, ' + (0.12 + pulse * 0.2) + ')';
  context.lineWidth = 4 + pulse * 3;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.shadowBlur = 2 + pulse * 2;
  context.strokeStyle = 'rgba(166, 255, 195, ' + (0.42 + pulse * 0.42) + ')';
  context.lineWidth = 0.9 + pulse * 1.4;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

/** The red cutting beam matches the active player mining laser. */
export function drawMiningLaserBeam(
  context: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  width: number,
  strength: number,
  pulse: number
): void {
  context.save();
  context.shadowColor = 'rgba(255, 54, 30, .85)';
  context.shadowBlur = 5 + pulse * 6;
  context.strokeStyle = 'rgba(238, 62, 40, ' + (0.62 + pulse * 0.3) + ')';
  context.globalAlpha = strength;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}
