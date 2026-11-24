import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  resolveShieldCollisions,
  type ShieldCollisionImpact,
  type ShieldWorldGeometry,
} from './local-space-collision';

/** Shared shield solver for ordinary asteroids and independently simulated salvage wrecks. */
export function resolveLocalWreckContacts(
  ship: LocalShipState,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  additional: readonly LocalAsteroid[],
  shield: ShieldWorldGeometry,
  onContact?: () => void
): ShieldCollisionImpact[] {
  const hits = resolveShieldCollisions(
    ship,
    velocity,
    additional.length ? [...asteroids, ...additional] : asteroids,
    shield
  );
  if (additional.length && hits.some((hit) => additional.some((body) => body.id === hit.asteroidId))) {
    onContact?.();
  }
  return hits;
}
