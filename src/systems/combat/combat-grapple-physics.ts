import type { CombatGrapple, MutableCombatant } from './strategic-combat-types';
import { shipContact } from './combat-ship-contact-geometry';

const DOCKING_CLEARANCE = 4;

/** Docking requires physical hull proximity plus settled relative velocity.
 * Never trigger tactical boarding merely because a hook has attached.
 */
export function canDockGrappledShips(
  source: Pick<MutableCombatant, 'position' | 'velocity' | 'setup'>,
  target: Pick<MutableCombatant, 'position' | 'velocity' | 'setup'>
): boolean {
  const contact = shipContact(source, target);
  const separation = contact.distance;
  const couplingRange = contact.required + DOCKING_CLEARANCE;
  const relativeSpeed = Math.hypot(
    source.velocity.x - target.velocity.x,
    source.velocity.y - target.velocity.y
  );
  return separation <= couplingRange && relativeSpeed <= 22;
}
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
    source.subsystems.tractor > 0 &&
    target.shieldHp <= 0 &&
    (source.setup.tractorRangeMeters ?? 0) > 0 &&
    separation <= (source.setup.tractorRangeMeters ?? 0);
  const reelRate = WINCH_REEL_METERS_PER_SECOND + (tractorAssisted ? TRACTOR_REEL_BONUS : 0);
  const contact = shipContact(source, target);
  const ropeLength = Math.max(
    contact.required + DOCKING_CLEARANCE,
    grapple.ropeLength - reelRate * deltaSeconds
  );

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
  // The rope preserves orbital motion at range; at genuine docking distance,
  // a small symmetric damping impulse settles relative motion without
  // teleportation or destroying the pair's shared center-of-mass velocity.
  if (separation < contact.required + 42) {
    const smoothing = Math.min(0.22, deltaSeconds * 2.8);
    const diffX = (target.velocity.x - source.velocity.x) * smoothing * 0.5;
    const diffY = (target.velocity.y - source.velocity.y) * smoothing * 0.5;
    source.velocity.x += diffX;
    source.velocity.y += diffY;
    target.velocity.x -= diffX;
    target.velocity.y -= diffY;
  }

  return {
    ...grapple,
    ropeLength,
    tension,
    tractorAssisted,
    origin: { ...source.position },
    target: { ...target.position },
  };
}
