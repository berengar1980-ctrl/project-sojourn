import { usesNaturalCombatContour } from './combat-visible-collider';
import type { LocalAsteroid } from '../../core/local-space-types';
import { integrateAsteroids } from '../local-space/local-space-physics';
import { resolveAsteroidCollisions } from '../local-space/local-space-collision';
import type { CombatVisualAsteroid, StrategicCombatArenaOptions } from './strategic-combat-types';

export function nativeCombatAsteroids(arena: StrategicCombatArenaOptions): LocalAsteroid[] {
  return (arena.asteroids ?? []).map((asteroid) => {
    const physics = asteroid.physics ?? {
      mass: Math.max(
        1,
        Math.PI * asteroid.radius ** 2 * (asteroid.kind === 'resource' ? 5.8 : 16.5)
      ),
      centerOfMassOffset: { x: 0, y: 0 },
      velocity: asteroid.velocity,
      angularVelocity: asteroid.angularVelocity ?? 0,
      momentOfInertia: Math.max(
        1,
        0.5 *
          Math.PI *
          asteroid.radius ** 2 *
          (asteroid.kind === 'resource' ? 5.8 : 16.5) *
          asteroid.radius ** 2
      ),
    };
    return {
      id: asteroid.id,
      kind: asteroid.kind,
      routeBlocking: asteroid.routeBlocking ?? asteroid.kind === 'resource',
      position: asteroid.position,
      radius: asteroid.radius,
      ...(asteroid.collisionRadius !== undefined
        ? { collisionRadius: asteroid.collisionRadius }
        : {}),
      ...(usesNaturalCombatContour(asteroid) ? { contactGeometry: 'silhouette' as const } : {}),
      rotation: asteroid.rotation ?? 0,
      physics: { ...physics, velocity: { ...physics.velocity } },
      deposits: [],
      scanLevel: 'unscanned',
    } satisfies LocalAsteroid;
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
    // Keep navigation/projectile blockers on the moving rock's current position.
    for (const obstacle of arena.obstacles ?? []) {
      if (obstacle.id !== body.id) continue;
      const position = obstacle.position as { x: number; y: number };
      position.x = body.position.x;
      position.y = body.position.y;
    }
    visual.rotation = body.rotation;
    if (visual.rotation3d) {
      visual.rotation3d.x = (visual.rotation3d.x + (visual.spin3d?.x ?? 0) * dt) % (Math.PI * 2);
      visual.rotation3d.y = (visual.rotation3d.y + (visual.spin3d?.y ?? 0) * dt) % (Math.PI * 2);
      visual.rotation3d.z = body.rotation;
    }
    const velocity = visual.velocity as { x: number; y: number };
    velocity.x = body.physics.velocity.x;
    velocity.y = body.physics.velocity.y;
    if (visual.physics) {
      visual.physics.velocity = { ...body.physics.velocity };
      visual.physics.angularVelocity = body.physics.angularVelocity;
    }
  });
}
