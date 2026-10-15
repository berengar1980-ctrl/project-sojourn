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
  const minefield = ship.tactic === 'minefield' && ship.mineStock.length > 0;
  // Relative velocity feedback brakes before crossing the firing envelope.
  // RCS can maintain range while the bow continues tracking a fixed gun's target.
  const radial =
    minefield && separation < 760
      ? -speed * 0.72
      : clamp((separation - desired) * 0.5, -speed * 0.65, speed);
  const { broadside, facing } = weaponPosture(ship);
  const side = facing === 'starboard' ? -1 : 1;
  const tangent = broadside && separation < desired * 1.4 ? speed * 0.2 * side : 0;
  let vx = enemy.velocity.x + toward.x * radial - toward.y * tangent;
  let vy = enemy.velocity.y + toward.y * radial + toward.x * tangent;
  const magnitude = Math.hypot(vx, vy);
  if (magnitude > speed) {
    vx *= speed / magnitude;
    vy *= speed / magnitude;
  }
  const lead = enemy.tactic === 'flee' ? Math.min(3, separation / speed) : 0;
  const bearing = Math.atan2(dy + enemy.velocity.y * lead, dx + enemy.velocity.x * lead);
  const heading = minefield
    ? Math.atan2(vy, vx)
    : broadside && separation < desired * 1.4
      ? bearing + (side * Math.PI) / 2
      : bearing;
  return { velocity: { x: vx, y: vy }, heading };
}

function weaponPosture(ship: MutableCombatant) {
  const broadside =
    ship.strategy?.focus === 'broadside' ||
    (!ship.strategy && ship.setup.weapons.some(({ weapon }) => weapon?.mount === 'broadside'));
  const facing =
    ship.strategy?.broadsideFacing ??
    ship.setup.weaponMounts?.find((mount) => mount.facing !== 'forward')?.facing ??
    'port';
  return { broadside, facing };
}
