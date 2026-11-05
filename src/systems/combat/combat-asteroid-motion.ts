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
      angularVelocity: asteroid.angularVelocity ?? 0,
      momentOfInertia: Math.max(1, 0.5 * Math.PI * asteroid.radius ** 4),
    };
    return {
      id: asteroid.id,
      kind: asteroid.kind,
      routeBlocking: asteroid.kind === 'resource',
      position: asteroid.position,
      radius: asteroid.radius,
      ...(asteroid.collisionRadius !== undefined
        ? { collisionRadius: asteroid.collisionRadius }
        : {}),
      ...(asteroid.collisionRadius !== undefined && !asteroid.debrisVariant && !asteroid.sectionVariant && !asteroid.containerVariant
        ? { contactGeometry: 'silhouette' as const }
        : {}),
      rotation: asteroid.rotation ?? 0,
      // Combat rocks retain their campaign motion but large bodies carry much more inertia.
      // This suppresses unrealistic kickback when a 60 m ship strikes a massive asteroid.
      physics:
        asteroid.kind === 'resource'
          ? {
              ...physics,
              mass: physics.mass * Math.max(8, asteroid.radius / 3),
              momentOfInertia: physics.momentOfInertia * Math.max(8, asteroid.radius / 3),
            }
          : physics,
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
  });
}
