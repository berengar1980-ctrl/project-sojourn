import type { CombatPoint, MutableCombatant } from './strategic-combat-types';

/**
 * Approach a target from its port/starboard flank before committing to impact.
 * The target is recomputed from the enemy's actual heading, not a fixed screen axis.
 * No extra AI state: a ship already approaching one flank stays on that flank.
 */
export function ramFlankTarget(ship: MutableCombatant, enemy: MutableCombatant): CombatPoint {
  if (!Number.isFinite(enemy.headingRadians)) return enemy.position;
  const sideX = -Math.sin(enemy.headingRadians);
  const sideY = Math.cos(enemy.headingRadians);
  const forwardX = Math.cos(enemy.headingRadians);
  const forwardY = Math.sin(enemy.headingRadians);
  const relativeX = ship.position.x - enemy.position.x;
  const relativeY = ship.position.y - enemy.position.y;
  const alongSide = relativeX * sideX + relativeY * sideY;
  const alongBow = relativeX * forwardX + relativeY * forwardY;
  const side = alongSide < 0 ? -1 : 1;
  const stagingDistance = Math.max(150, (enemy.setup.shieldGeometry?.radiusY ?? 25) * 4);
  const staged = Math.abs(alongSide) >= stagingDistance * 0.8 && Math.abs(alongBow) < 100;
  if (staged) {
    const lead = 0.25;
    return {
      x: enemy.position.x + enemy.velocity.x * lead,
      y: enemy.position.y + enemy.velocity.y * lead,
    };
  }
  return {
    x: enemy.position.x + sideX * side * stagingDistance,
    y: enemy.position.y + sideY * side * stagingDistance,
  };
}
