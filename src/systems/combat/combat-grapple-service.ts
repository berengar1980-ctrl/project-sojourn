import type { CombatPoint, StrategicCombatSide } from './strategic-combat-types';

export interface CombatGrapple {
  readonly owner: StrategicCombatSide;
  readonly success: boolean;
  readonly elapsed: number;
  readonly duration: number;
  readonly origin: CombatPoint;
  readonly target: CombatPoint;
  readonly resolved: boolean;
}

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
  return {
    owner: side,
    success: random() < chance,
    elapsed: 0,
    duration: 0.85,
    origin: { ...attacker },
    target: { ...defender },
    resolved: false,
  };
}

export function advanceCombatGrapple(
  hook: CombatGrapple,
  attacker: CombatPoint,
  defender: CombatPoint,
  dt: number
): CombatGrapple {
  return {
    ...hook,
    elapsed: Math.min(hook.duration, hook.elapsed + Math.max(0, dt)),
    origin: { ...attacker },
    target: { ...defender },
    resolved: hook.elapsed + Math.max(0, dt) >= hook.duration,
  };
}
