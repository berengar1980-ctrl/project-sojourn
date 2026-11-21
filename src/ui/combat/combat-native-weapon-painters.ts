import { drawCombatTorpedo } from './combat-torpedo-renderer';
import { drawVisionAutocannon, drawVisionProjectile } from './combat-weapon-vision-renderer';
import { drawCombatMineMarker } from './combat-ship-detail-renderer';
import type { AutocannonVisualBurst, Point } from './strategic-combat-renderer-types';
import type {
  CombatMineSnapshot,
  CombatProjectileSnapshot,
} from '../../systems/combat/strategic-combat-types';

/** Exact native 1vs1 weapon-effect painters, shared by both duel snapshots.
 * These functions have no camera or independent rendering lifecycle.
 */
export function paintNativeProjectile(
  context: CanvasRenderingContext2D,
  projectile: CombatProjectileSnapshot,
  point: Point,
  target: Point,
  elapsedSeconds: number,
  zoom: number
): void {
  if (
    drawVisionProjectile(
      context,
      projectile.family,
      point,
      projectile.direction,
      elapsedSeconds,
      projectile.id
    )
  ) {
    return;
  }
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

export function paintNativeAutocannonBursts(
  context: CanvasRenderingContext2D,
  bursts: Iterable<AutocannonVisualBurst>,
  project: (point: Point) => Point,
  elapsedSeconds: number
): void {
  for (const burst of bursts) {
    drawVisionAutocannon(
      context,
      project(burst.origin),
      project(burst.target),
      elapsedSeconds - burst.spawnedAt,
      burst.flightSeconds
    );
  }
}

export function paintNativeMines(
  context: CanvasRenderingContext2D,
  mines: readonly CombatMineSnapshot[],
  project: (point: Point) => Point
): void {
  for (const mine of mines) {
    if (mine.detection === 'hidden') continue;
    drawCombatMineMarker(context, mine, project(mine.position));
  }
}
