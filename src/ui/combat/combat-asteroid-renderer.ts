import type { CombatVisualAsteroid } from '../../systems/combat/strategic-combat-types';
import type { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { drawCombatScrap, isCombatScrap } from './combat-scrap-renderer';

export function drawCombatAsteroids(
  renderer: ProceduralSpaceBodyRenderer,
  asteroids: readonly CombatVisualAsteroid[],
  scale: number,
  project: (point: { readonly x: number; readonly y: number }) => {
    readonly x: number;
    readonly y: number;
  },
  context?: CanvasRenderingContext2D,
  timeSeconds = 0
): void {
  for (const asteroid of asteroids) {
    const center = project(asteroid.position);
    const radius = Math.max(asteroid.kind === 'debris' ? 2 : 5, asteroid.radius * scale);
    if (context && isCombatScrap(asteroid)) {
      const canvas = context.canvas;
      if (
        center.x < -radius * 2 ||
        center.y < -radius * 2 ||
        center.x > canvas.clientWidth + radius * 2 ||
        center.y > canvas.clientHeight + radius * 2
      )
        continue;
      context.save();
      context.translate(center.x, center.y);
      drawCombatScrap(context, asteroid, radius, timeSeconds);
      context.restore();
      continue;
    }
    renderer.drawAsteroid({
      id: asteroid.id,
      x: center.x,
      y: center.y,
      radius,
      rotation: asteroid.rotation,
      kind: asteroid.kind,
      light: { x: -0.72, y: -0.56 },
    });
  }
}
