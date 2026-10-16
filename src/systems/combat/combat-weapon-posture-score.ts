import type { MutableCombatant } from './strategic-combat-types';
import { clamp, wrapAngle } from './strategic-combat-geometry';
import { weaponInArc } from './combat-weapon-geometry';

export type WeaponPostureGroup = {
  readonly focus: 'forward' | 'broadside' | 'turret';
  readonly facing?: 'port' | 'starboard';
};

function weaponGroup(ship: MutableCombatant, index: number): WeaponPostureGroup | null {
  const weapon = ship.setup.weapons[index]?.weapon;
  if (!weapon) return null;
  const facing = ship.setup.weaponMounts?.find((mount) => mount.slotIndex === index)?.facing;
  const mount =
    weapon.mount ??
    (weapon.family === 'railgun'
      ? 'forward'
      : ['plasma_battery', 'ion_cannon', 'autocannon'].includes(weapon.family)
        ? 'broadside'
        : 'turret');
  if (mount === 'turret' || mount === 'guided') return { focus: 'turret' };
  if (mount === 'forward' && (!facing || facing === 'forward')) return { focus: 'forward' };
  if (mount === 'broadside') {
    return { focus: 'broadside', facing: facing === 'starboard' ? 'starboard' : 'port' };
  }
  return null;
}

function groupMatches(a: WeaponPostureGroup, b: WeaponPostureGroup): boolean {
  return a.focus === b.focus && a.facing === b.facing;
}

function aimedHeading(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  group: WeaponPostureGroup
): number {
  if (group.focus === 'turret') return ship.headingRadians;
  const bearing = Math.atan2(
    enemy.position.y - ship.position.y,
    enemy.position.x - ship.position.x
  );
  if (group.focus === 'forward') return bearing;
  return bearing + (group.facing === 'starboard' ? -Math.PI / 2 : Math.PI / 2);
}

function damageRate(ship: MutableCombatant, index: number, enemyShielded: boolean): number {
  const weapon = ship.setup.weapons[index]?.weapon;
  if (!weapon) return 0;
  const damage = enemyShielded
    ? (weapon.combatShieldDamage ?? weapon.shieldDamage)
    : (weapon.combatHullDamage ?? weapon.hullDamage);
  const cycle = weapon.cooldownSeconds * clamp(ship.setup.cycleTimeMultiplier ?? 1, 0.4, 2);
  return Math.max(0, damage) / Math.max(0.45, cycle);
}

function coverageFactor(degrees: number): number {
  // Wider existing arcs provide more firing opportunity, not more damage per hit.
  return 0.55 + 0.45 * clamp(degrees / 180, 0, 1);
}

interface WeaponPostureScore {
  readonly firepower: number;
  readonly effectiveRange: number;
  readonly turnSeconds: number;
}

export function scoreWeaponPosture(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  group: WeaponPostureGroup
): WeaponPostureScore | null {
  const heading = aimedHeading(ship, enemy, group);
  const projected = { ...ship, headingRadians: heading };
  const enemyShielded = enemy.shieldHp > 0;
  let primary = 0;
  let supplementary = 0;
  let rangeSum = 0;
  let rangeWeight = 0;
  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const weapon = ship.setup.weapons[index]?.weapon;
    const installed = weaponGroup(ship, index);
    if (!weapon || !installed) continue;
    if (!weaponInArc(projected, enemy.position, index, weapon)) continue;
    const mount = ship.setup.weaponMounts?.find((point) => point.slotIndex === index);
    const arc = Math.min(weapon.arcDegrees ?? 360, mount?.arcDegrees ?? 360);
    const rate = damageRate(ship, index, enemyShielded);
    const adjusted = rate * coverageFactor(arc);
    if (groupMatches(installed, group)) {
      primary += adjusted;
      rangeSum += adjusted * weapon.rangeMeters;
      rangeWeight += adjusted;
    } else if (installed.focus === 'turret') {
      // Independent turrets can fire during a forward or broadside approach.
      supplementary += adjusted * 0.25;
    }
  }
  if (primary <= 0) return null;
  const turning = Math.abs(wrapAngle(heading - ship.headingRadians));
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? 0.72);
  return {
    firepower: primary + supplementary,
    effectiveRange: rangeSum / Math.max(0.001, rangeWeight),
    turnSeconds: group.focus === 'turret' ? 0 : turning / turnRate,
  };
}
