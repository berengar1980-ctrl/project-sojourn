import type { CombatGrapple, CombatPoint, StrategicCombatSide } from './strategic-combat-types';

export type { CombatGrapple } from './strategic-combat-types';
export function grappleChance(hull: number, hullMax: number): number {
  const percent = Math.max(0, Math.min(1, hull / Math.max(1, hullMax)));
  return Math.min(0.6, 0.3 + (1 - percent) * (0.3 / 0.85));
}

export function fireCombatGrapple(
  side: StrategicCombatSide,
  attacker: CombatPoint,
  defender: CombatPoint,
  targetShield: number,
  targetHull: number,
  targetHullMax: number,
  alreadyUsed: boolean,
  random: () => number
): CombatGrapple | null {
  if (alreadyUsed || targetShield > 0 || targetHull <= 0) return null;
  const chance = grappleChance(targetHull, targetHullMax);
  const success = random() < chance;
  return {
    owner: side,
    success,
    elapsed: 0,
    duration: success ? 0.65 : 1.1,
    origin: { ...attacker },
    target: { ...defender },
    resolved: false,
    ropeLength: Math.max(92, Math.hypot(defender.x - attacker.x, defender.y - attacker.y)),
    tension: 0,
    tractorAssisted: false,
  };
}

export function advanceCombatGrapple(
  hook: CombatGrapple,
  attacker: CombatPoint,
  defender: CombatPoint,
  dt: number
): CombatGrapple {
  const elapsed = Math.min(hook.duration, hook.elapsed + Math.max(0, dt));
  const resolved = elapsed >= hook.duration;
  return {
    ...hook,
    elapsed,
    origin: { ...attacker },
    target: { ...defender },
    resolved,
    // The rope attaches at the ships' current distance, not at the distance
    // recorded when the hook was fired while both ships were still moving.
    ropeLength:
      hook.success && resolved && !hook.resolved
        ? Math.max(140, Math.hypot(defender.x - attacker.x, defender.y - attacker.y))
        : hook.ropeLength,
  };
}
