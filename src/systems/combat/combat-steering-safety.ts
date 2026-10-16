import type { MutableCombatant } from './strategic-combat-types';

interface SteeringHazards {
  readonly mines: boolean;
  readonly obstacle: boolean;
  readonly boundary: boolean;
  readonly waypoint: boolean;
  readonly cover: boolean;
  readonly collision: boolean;
  readonly detour: boolean;
}

/** The same clearance decision controls weapon aiming and automatic boost. */
export function evaluateSteeringSafety(
  ship: MutableCombatant,
  hazards: SteeringHazards
): { clear: boolean; canAim: boolean } {
  const { mines, obstacle, boundary, waypoint, cover, collision, detour } = hazards;
  return {
    clear:
      !mines &&
      !obstacle &&
      (ship.tactic === 'flee' || !boundary) &&
      !waypoint &&
      !cover &&
      !collision &&
      !detour,
    canAim: !mines && !obstacle && !boundary && !collision && !detour,
  };
}
