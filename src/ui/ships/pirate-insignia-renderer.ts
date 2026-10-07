import type { ShipScreenGeometry } from './ship-hardpoint-projector';

export type PirateInsignia = 'broken-spear' | 'black-tide';

export function drawPirateInsignia(
  context: CanvasRenderingContext2D,
  mark: PirateInsignia,
  geometry: ShipScreenGeometry
): void {
  if (geometry.width < 10) return;
  const size = Math.max(5, Math.min(10, geometry.width * 0.42));
  context.save();
  context.translate(geometry.center.x, geometry.center.y);
  context.lineWidth = 1.35;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle =
    mark === 'broken-spear' ? 'rgba(240, 190, 91, .92)' : 'rgba(224, 76, 68, .92)';
  context.fillStyle =
    mark === 'broken-spear' ? 'rgba(240, 190, 91, .32)' : 'rgba(224, 76, 68, .28)';

  if (mark === 'broken-spear') {
    context.beginPath();
    context.moveTo(-size * 0.52, size * 0.48);
    context.lineTo(-size * 0.08, size * 0.04);
    context.lineTo(size * 0.18, -size * 0.2);
    context.moveTo(size * 0.48, -size * 0.5);
    context.lineTo(size * 0.12, -size * 0.14);
    context.stroke();

    context.beginPath();
    context.moveTo(-size * 0.16, -size * 0.08);
    context.lineTo(size * 0.22, size * 0.3);
    context.lineTo(-size * 0.04, size * 0.38);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.beginPath();
    context.arc(0, 0, size * 0.5, Math.PI * 0.15, Math.PI * 1.85);
    context.stroke();

    context.beginPath();
    context.moveTo(-size * 0.52, size * 0.2);
    context.lineTo(-size * 0.15, size * 0.52);
    context.lineTo(0, size * 0.22);
    context.lineTo(size * 0.18, size * 0.52);
    context.lineTo(size * 0.52, size * 0.18);
    context.stroke();
  }

  context.restore();
}
