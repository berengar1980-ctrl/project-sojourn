import type { MutableCombatant } from './strategic-combat-types';
import { weaponInArc } from './combat-weapon-geometry';

/** Ready guns with a real firing line, not merely installed weapon slots. */
function canFireSoon(ship: MutableCombatant, enemy: MutableCombatant, range: number): boolean {
  return ship.setup.weapons.some((component, index) => {
    const gun = component.weapon;
    return (
      gun !== undefined &&
      (ship.cooldowns[index] ?? 0) <= 0.75 &&
      range <= gun.rangeMeters &&
      weaponInArc(ship, enemy.position, index, gun)
    );
  });
}

function primaryWeaponCooling(ship: MutableCombatant, enemy: MutableCombatant): boolean {
  const shielded = enemy.shieldHp > 0;
  let maxDamage = 0;
  let remaining = 0;
  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const gun = ship.setup.weapons[index]?.weapon;
    if (!gun) continue;
    const damage = shielded
      ? (gun.combatShieldDamage ?? gun.shieldDamage)
      : (gun.combatHullDamage ?? gun.hullDamage);
    if (damage <= maxDamage) continue;
    maxDamage = damage;
    remaining = ship.cooldowns[index] ?? 0;
  }
  return maxDamage > 0 && remaining >= 1.5;
}

/** Reserve finite boost for a real tactical advantage instead of opening rushes. */
export function usefulCombatBoost(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  range: number,
  desiredRange: number,
  deliberateRam: boolean,
  targetSpeedFactor: number
): boolean {
  if (ship.tactic === 'flee') return true;
  if (deliberateRam) {
    return ship.ramApproach?.phase === 'impact' && range <= 450;
  }
  if (targetSpeedFactor < 0.7 || ship.subsystems.engine <= 0) return false;
  const ownCanFire = canFireSoon(ship, enemy, range);
  if (ownCanFire) return false;
  const enemyCanFire = canFireSoon(enemy, ship, range);
  const maxRange = Math.max(0, ...ship.setup.weapons.map((part) => part.weapon?.rangeMeters ?? 0));
  // Under hostile fire while outranged: close the gap to the first legal shot.
  if (enemyCanFire && range > maxRange && maxRange > 0) return true;
  const needsPosition =
    range > desiredRange * 1.2 || range < Math.max(160, desiredRange * 0.6);
  // Reloading the main gun provides a useful window to change lanes or range.
  return needsPosition && primaryWeaponCooling(ship, enemy);
}
