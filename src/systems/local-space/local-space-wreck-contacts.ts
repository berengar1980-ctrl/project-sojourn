import type { LocalAsteroid, LocalShipState } from '../../core/local-space-types';
import type { WorldPoint } from '../../core/world-types';
import {
  resolveShieldCollisions,
  type ShieldCollisionImpact,
  type ShieldWorldGeometry,
} from './local-space-collision';
import { shipContactMassProperties } from '../../core/ship-contact-mass';

/** Shared shield solver for ordinary asteroids and independently simulated salvage wrecks. */
export function resolveLocalWreckContacts(
  ship: LocalShipState,
  velocity: WorldPoint,
  asteroids: readonly LocalAsteroid[],
  additional: readonly LocalAsteroid[],
  shield: ShieldWorldGeometry,
  nominalLengthMeters: number,
  onContact?: () => void
): ShieldCollisionImpact[] {
  const { mass } = shipContactMassProperties(nominalLengthMeters, shield);
  const hits = resolveShieldCollisions(
    ship,
    velocity,
    additional.length ? [...asteroids, ...additional] : asteroids,
    shield,
    mass
  );
  if (
    additional.length &&
    hits.some((hit) => additional.some((body) => body.id === hit.asteroidId))
  ) {
    onContact?.();
  }
  return hits;
}
