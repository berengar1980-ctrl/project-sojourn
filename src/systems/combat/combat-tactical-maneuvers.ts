import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { normalize } from './strategic-combat-geometry';

export interface TacticalManeuver {
  readonly direction: CombatPoint;
  readonly speedFactor: number;
  readonly reason: string;
}

/** Lead an escaping target instead of following its current position. */
export function pursuitManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant
): TacticalManeuver | null {
  if (ship.tactic === 'flee' || enemy.tactic !== 'flee' || ship.subsystems.engine <= 0) return null;
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const distance = Math.hypot(dx, dy);
  const lead = Math.min(3, distance / Math.max(65, ship.setup.combatSpeed ?? 120));
  return {
    direction: normalize(dx + enemy.velocity.x * lead, dy + enemy.velocity.y * lead),
    speedFactor: 1,
    reason: 'ABFANGKURS',
  };
}

/** Force the pursuer to close along the ship's trail before laying mines. */
export function mineBaitManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant
): TacticalManeuver | null {
  if (ship.tactic !== 'minefield' || ship.mineStock.length === 0 || ship.subsystems.engine <= 0)
    return null;
  const separation = Math.hypot(
    ship.position.x - enemy.position.x,
    ship.position.y - enemy.position.y
  );
  if (separation > 760 || separation < 170) return null;
  const away = normalize(ship.position.x - enemy.position.x, ship.position.y - enemy.position.y);
  const forward = ship.velocity.x * away.x + ship.velocity.y * away.y;
  return {
    direction: away,
    speedFactor: forward > 80 ? 0.68 : 0.88,
    reason: 'MINENKORRIDOR',
  };
}
