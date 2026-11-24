import type { CombatVisualAsteroid } from '../../systems/combat/strategic-combat-types';
import type { ProceduralSpaceBodyRenderer } from '../space/procedural-space-body-renderer';
import { drawCombatAsteroids } from './combat-asteroid-renderer';

/**
 * Custom field painters replace the arena background and its asteroid pass.
 * Draw only newly destroyed native fleet hulls from the shared asteroid world.
 * Existing field wrecks remain owned by the field painter, avoiding duplicates.
 */
export function drawFleetFieldWrecks(
  renderer: ProceduralSpaceBodyRenderer,
  asteroids: readonly CombatVisualAsteroid[],
  scale: number,
  project: (point: { readonly x: number; readonly y: number }) => {
    readonly x: number;
    readonly y: number;
  },
  context: CanvasRenderingContext2D,
  timeSeconds: number
): void {
  const fleetWrecks = asteroids.filter(
    (body) => body.id.startsWith('fleet-wreck:') && Boolean(body.combatWreckVariant)
  );
  if (!fleetWrecks.length) return;
  drawCombatAsteroids(renderer, fleetWrecks, scale, project, context, timeSeconds);
}
