import type { CombatPoint, MutableCombatant } from './strategic-combat-types';
import { normalize } from './strategic-combat-geometry';

export interface TacticalManeuver {
  readonly direction: CombatPoint;
  readonly speedFactor: number;
  readonly reason: string;
}

/** Lead an escaping target instead of following its current position. */
export function pursuitManeuver(ship: MutableCombatant, enemy: MutableCombatant): TacticalManeuver | null {
  if (ship.tactic === 'flee' || enemy.tactic !== 'flee' || ship.subsystems.engine <= 0)
    return null;
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
export function mineBaitManeuver(ship: MutableCombatant, enemy: MutableCombatant): TacticalManeuver | null {
  if (ship.tactic !== 'minefield' || ship.mineStock.length === 0 || ship.subsystems.engine <= 0)
    return null;
  const separation = Math.hypot(ship.position.x - enemy.position.x, ship.position.y - enemy.position.y);
  if (separation > 760 || separation < 170) return null;
  const away = normalize(ship.position.x - enemy.position.x, ship.position.y - enemy.position.y);
  const forward = ship.velocity.x * away.x + ship.velocity.y * away.y;
  return {
    direction: away,
    speedFactor: forward > 80 ? 0.68 : 0.88,
    reason: 'MINENKORRIDOR',
  };
}

/** Preserve a useful firing arc with a lateral pass, not a stationary nose-on hover. */
export function broadsideOrbitManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  desiredRange: number
): TacticalManeuver | null {
  if (ship.strategy?.kind !== 'broadside' || ship.subsystems.engine <= 0) return null;
  const toward = normalize(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  const distance = Math.hypot(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  if (distance < desiredRange * 0.75 || distance > desiredRange * 1.25) return null;
  const side = ship.strategy.broadsideFacing === 'starboard' ? -1 : 1;
  const radial = Math.max(-0.45, Math.min(0.45, (distance - desiredRange) / desiredRange));
  return {
    direction: normalize(-toward.y * side + toward.x * radial, toward.x * side + toward.y * radial),
    speedFactor: 0.52,
    reason: 'BREITSEITE',
  };
}

/** Non-fleeing pilots brake relative to moving targets, not to the world origin. */
export function interceptBrakeManeuver(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  desiredRange: number
): TacticalManeuver | null {
  if (ship.tactic === 'flee' || ship.subsystems.engine <= 0) return null;
  const separation = Math.hypot(enemy.position.x - ship.position.x, enemy.position.y - ship.position.y);
  if (separation > desiredRange * 1.05 || ship.strategy?.phase === 'align_weapons') return null;
  const relativeX = ship.velocity.x - enemy.velocity.x;
  const relativeY = ship.velocity.y - enemy.velocity.y;
  if (Math.hypot(relativeX, relativeY) < 45) return null;
  return { direction: normalize(-relativeX, -relativeY), speedFactor: 0.38, reason: 'RELATIV BREMSEN' };
}
