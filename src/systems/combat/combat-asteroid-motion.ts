import type { StrategicCombatArenaOptions } from './strategic-combat-types';

/** Advance the same drift and edge restitution used by local-space asteroid physics. */
export function advanceCombatAsteroids(arena: StrategicCombatArenaOptions, dt: number): void {
  for (const asteroid of arena.asteroids ?? []) {
    const x = asteroid.position.x + asteroid.velocity.x * dt;
    const y = asteroid.position.y + asteroid.velocity.y * dt;
    const min = asteroid.radius;
    const maxX = arena.width - min;
    const maxY = arena.height - min;
    asteroid.position.x = Math.max(min, Math.min(maxX, x));
    asteroid.position.y = Math.max(min, Math.min(maxY, y));
    // Velocity is constant between contacts, as in the local-space generator.
    const velocity = asteroid.velocity as { x: number; y: number };
    if (x < min) velocity.x = Math.abs(velocity.x) * 0.58;
    if (x > maxX) velocity.x = -Math.abs(velocity.x) * 0.58;
    if (y < min) velocity.y = Math.abs(velocity.y) * 0.58;
    if (y > maxY) velocity.y = -Math.abs(velocity.y) * 0.58;
    asteroid.rotation += asteroid.angularVelocity * dt;
  }
}
