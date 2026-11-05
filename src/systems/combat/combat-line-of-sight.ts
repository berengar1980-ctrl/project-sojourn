import type { MutableCombatant, StrategicCombatArenaOptions } from './strategic-combat-types';
import { firstObstacleHit } from './strategic-combat-damage';
import { combatShieldCenter } from './strategic-combat-damage';
import { weaponMuzzle } from './combat-weapon-geometry';

/** Same segment-to-asteroid intersection used by actual combat projectiles and lasers. */
export function hasClearCombatShot(
  source: MutableCombatant,
  target: MutableCombatant,
  weaponIndex: number,
  arena: StrategicCombatArenaOptions
): boolean {
  if (!arena.obstacles?.length) return true;
  const from = weaponMuzzle(source, weaponIndex);
  const to = target.shieldHp > 0 ? combatShieldCenter(target) : target.position;
  return firstObstacleHit(from, to, arena.obstacles, arena.asteroids) === null;
}
