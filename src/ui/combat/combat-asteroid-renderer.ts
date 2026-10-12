import type { StrategicCombatObstacle } from '../../systems/combat/strategic-combat-service';
import { hash } from './strategic-combat-renderer-math';

export function drawCombatAsteroids(
  context: CanvasRenderingContext2D,
  obstacles: readonly StrategicCombatObstacle[],
  scale: number,
  project: (point: { readonly x: number; readonly y: number }) => { readonly x: number; readonly y: number }
): void {
  for (const obstacle of obstacles) {
    const center = project(obstacle.position);
    const radius = Math.max(3, obstacle.radius * scale);
    const seed = hash(obstacle.id);
    context.save();
    context.translate(center.x, center.y);
    context.beginPath();
    for (let i = 0; i < 11; i += 1) {
      const angle = (i / 11) * Math.PI * 2;
      const variance = 0.78 + (((seed + i * 3719) >>> 0) % 100) / 260;
      const x = Math.cos(angle) * radius * variance;
      const y = Math.sin(angle) * radius * variance;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = '#43494b';
    context.strokeStyle = '#737e81';
    context.lineWidth = 1.2;
    context.fill();
    context.stroke();
    context.restore();
  }
}
