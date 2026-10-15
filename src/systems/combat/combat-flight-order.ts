import { usesMineCorridor } from './combat-weapon-posture';
import { combatWeaponHeading } from './combat-weapon-posture';
import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import type { CombatFlightControl } from './combat-flight-controller';
import { clamp, normalize } from './strategic-combat-geometry';
import { preferredRange } from './combat-tactic-choice';

/** One selected movement objective; alignment never replaces translation. */
export function createCombatFlightOrder(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  arena: StrategicCombatArenaOptions
): CombatFlightControl {
  const dx = enemy.position.x - ship.position.x;
  const dy = enemy.position.y - ship.position.y;
  const separation = Math.hypot(dx, dy);
  const toward = normalize(dx, dy);
  const speed = Math.max(65, ship.setup.combatSpeed ?? 120);
  if (ship.tactic === 'flee') {
    const away = arena.exitPoint
      ? normalize(arena.exitPoint.x - ship.position.x, arena.exitPoint.y - ship.position.y)
      : { x: -toward.x, y: -toward.y };
    return {
      velocity: { x: away.x * speed, y: away.y * speed },
      heading: Math.atan2(away.y, away.x),
    };
  }
  const desired = ship.strategy?.desiredRange ?? preferredRange(ship);
  const minefield = usesMineCorridor(ship);
  // Relative velocity feedback brakes before crossing the firing envelope.
  // RCS can maintain range while the bow continues tracking a fixed gun's target.
  const radial =
    minefield && separation < 760
      ? -speed * 0.72
      : clamp((separation - desired) * 0.5, -speed * 0.65, speed);
  const broadside = ship.strategy?.focus === 'broadside';
  const facing = ship.strategy?.broadsideFacing;
  const side = facing === 'starboard' ? -1 : 1;
  const tangent = broadside && separation < desired * 1.4 ? speed * 0.2 * side : 0;
  let vx = enemy.velocity.x + toward.x * radial - toward.y * tangent;
  let vy = enemy.velocity.y + toward.y * radial + toward.x * tangent;
  const magnitude = Math.hypot(vx, vy);
  if (magnitude > speed) {
    vx *= speed / magnitude;
    vy *= speed / magnitude;
  }
  const goal = ship.maneuver?.goal;
  if (goal) {
    const direction = normalize(goal.x - ship.position.x, goal.y - ship.position.y);
    const remaining = Math.hypot(goal.x - ship.position.x, goal.y - ship.position.y);
    const acceleration = ship.setup.accelerationMetersPerSecond2 ?? 34;
    const travelSpeed = Math.min(speed * 0.8, Math.sqrt(2 * acceleration * 0.4 * remaining));
    vx = direction.x * travelSpeed;
    vy = direction.y * travelSpeed;
  }
  return {
    velocity: { x: vx, y: vy },
    heading: minefield ? Math.atan2(vy, vx) : combatWeaponHeading(ship, enemy),
  };
}
