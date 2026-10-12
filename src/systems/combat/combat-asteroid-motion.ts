import type { LocalAsteroid } from '../../core/local-space-types';
import { integrateAsteroids } from '../local-space/local-space-physics';
import { resolveAsteroidCollisions } from '../local-space/local-space-collision';
import type { CombatVisualAsteroid, StrategicCombatArenaOptions } from './strategic-combat-types';

export function nativeCombatAsteroids(arena: StrategicCombatArenaOptions): LocalAsteroid[] {
  return (arena.asteroids ?? []).map((asteroid) => {
    const physics = asteroid.physics ?? {
      mass: Math.max(1, Math.PI * asteroid.radius ** 2),
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: asteroid.velocity,
      angularVelocity: asteroid.angularVelocity,
      momentOfInertia: Math.max(1, 0.5 * Math.PI * asteroid.radius ** 4),
    };
    return {
      id: asteroid.id,
      kind: asteroid.kind,
      routeBlocking: asteroid.kind === 'resource',
      position: asteroid.position,
      radius: asteroid.radius,
      rotation: asteroid.rotation,
      physics,
      deposits: [],
      scanLevel: 'none',
    } as LocalAsteroid;
  });
}

/** The campaign's physics integrator and rock-to-rock collision solver. */
export function advanceCombatAsteroids(arena: StrategicCombatArenaOptions, dt: number): void {
  const source = arena.asteroids ?? [];
  if (!source.length) return;
  const native = nativeCombatAsteroids(arena);
  integrateAsteroids(native, dt, arena.width, arena.height);
  resolveAsteroidCollisions(native);
  native.forEach((body, index) => {
    const visual = source[index] as CombatVisualAsteroid;
    visual.position.x = body.position.x;
    visual.position.y = body.position.y;
    visual.rotation = body.rotation;
    const velocity = visual.velocity as { x: number; y: number };
    velocity.x = body.physics.velocity.x;
    velocity.y = body.physics.velocity.y;
  });
}
