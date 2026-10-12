import type { CombatVisualAsteroid } from '../../systems/combat/strategic-combat-types';
import { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';

export function drawCombatAsteroids(
  renderer: ProceduralSpaceBodyRenderer,
  asteroids: readonly CombatVisualAsteroid[],
  scale: number,
  project: (point: { readonly x: number; readonly y: number }) => { readonly x: number; readonly y: number }
): void {
  for (const asteroid of asteroids) {
    const center = project(asteroid.position);
    renderer.drawAsteroid({
      id: asteroid.id,
      x: center.x,
      y: center.y,
      radius: Math.max(asteroid.kind === 'debris' ? 2 : 5, asteroid.radius * scale),
      rotation: asteroid.rotation,
      kind: asteroid.kind,
      light: { x: -0.72, y: -0.56 },
    });
  }
}
