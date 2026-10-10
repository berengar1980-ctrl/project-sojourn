import type { CombatGrapple, MutableCombatant } from './strategic-combat-types';

const COUPLING_DISTANCE = 140;
const WINCH_REEL_METERS_PER_SECOND = 84;
const TRACTOR_REEL_BONUS = 76;

/**
 * A taut rope only pulls; it does not rotate the velocity vectors to match a ship's bow.
 * Opposite impulses on both ships preserve shared momentum and permit trailing/swinging.
 */
export function advanceCombatGrappleTether(
  grapple: CombatGrapple,
  source: MutableCombatant,
  target: MutableCombatant,
  deltaSeconds: number
): CombatGrapple {
  if (!grapple.success || !grapple.resolved || deltaSeconds <= 0) return grapple;

  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;
  const separation = Math.max(0.001, Math.hypot(dx, dy));
  const normalX = dx / separation;
  const normalY = dy / separation;
  const tractorAssisted =
    source.hullHp > 0 &&
    target.shieldHp <= 0 &&
    (source.setup.tractorRangeMeters ?? 0) > 0 &&
    separation <= (source.setup.tractorRangeMeters ?? 0);
  const reelRate = WINCH_REEL_METERS_PER_SECOND + (tractorAssisted ? TRACTOR_REEL_BONUS : 0);
  const ropeLength = Math.max(COUPLING_DISTANCE, grapple.ropeLength - reelRate * deltaSeconds);

  const separatingSpeed =
    (target.velocity.x - source.velocity.x) * normalX +
    (target.velocity.y - source.velocity.y) * normalY;
  const stretched = Math.max(0, separation - ropeLength);
  const tension =
    stretched > 0 ? Math.min(130, stretched * 0.9 + Math.max(0, separatingSpeed) * 1.3) : 0;

  if (stretched > 0) {
    // A taut rope cannot be longer than the length reached by the winch.
    // Correct both positions equally: neither ship gets teleported onto
    // the other, and the pair's center of mass stays in the same place.
    const correction = stretched / 2;
    source.position.x += normalX * correction;
    source.position.y += normalY * correction;
    target.position.x -= normalX * correction;
    target.position.y -= normalY * correction;

    // Constraint impulse also removes separating radial velocity. Without
    // this, normal combat steering can continually pull the ships apart
    // faster than the spring force closes the gap.
    const constraintImpulse = Math.max(0, (separatingSpeed + reelRate) / 2);
    const impulse = Math.max(constraintImpulse, (tension * deltaSeconds) / 2);
    source.velocity.x += normalX * impulse;
    source.velocity.y += normalY * impulse;
    target.velocity.x -= normalX * impulse;
    target.velocity.y -= normalY * impulse;
  }
  // Tangential momentum is unaffected, so the captured ship can swing.
  source.speed = Math.hypot(source.velocity.x, source.velocity.y);
  target.speed = Math.hypot(target.velocity.x, target.velocity.y);

  return {
    ...grapple,
    ropeLength,
    tension,
    tractorAssisted,
    origin: { ...source.position },
    target: { ...target.position },
  };
}
