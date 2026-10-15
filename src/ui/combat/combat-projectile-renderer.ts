import type {
  CombatProjectileSnapshot,
  CombatPoint,
} from '../../systems/combat/strategic-combat-types';
import { drawCombatTorpedo } from './combat-torpedo-renderer';
export function drawCombatProjectile(
  context: CanvasRenderingContext2D,
  zoom: number,
  projectile: CombatProjectileSnapshot,
  point: CombatPoint,
  target: CombatPoint
): void {
  const angle =
    projectile.kind === 'missile'
      ? Math.atan2(projectile.direction.y, projectile.direction.x)
      : Math.atan2(target.y - point.y, target.x - point.x);
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  if (projectile.kind === 'plasma') {
    context.shadowColor = '#73dfff';
    context.shadowBlur = 14;
    context.fillStyle = 'rgba(78, 177, 241, 0.45)';
    context.beginPath();
    context.arc(0, 0, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e1f9ff';
    context.beginPath();
    context.arc(0, 0, 3, 0, Math.PI * 2);
    context.fill();
  } else if (projectile.kind === 'missile') {
    context.scale(zoom / 3, zoom / 3);
    drawCombatTorpedo(context);
  } else {
    context.fillStyle = 'rgba(245, 211, 156, .95)';
    context.fillRect(-3, -1, 6, 2);
  }
  context.restore();
}
