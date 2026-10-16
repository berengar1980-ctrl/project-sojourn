import type { MutableCombatant } from './strategic-combat-types';
import type { ShipWeaponProfile } from '../../core/ship-types';
import { clamp, wrapAngle } from './strategic-combat-geometry';
import { weaponInArc } from './combat-weapon-geometry';
import { weaponCycleSeconds } from './combat-weapon-fire-control';

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
    (weapon.family === 'railgun' || weapon.family === 'front_repeater'
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

function matches(a: WeaponPostureGroup, b: WeaponPostureGroup): boolean {
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
  return group.focus === 'forward'
    ? bearing
    : bearing + (group.facing === 'starboard' ? -Math.PI / 2 : Math.PI / 2);
}

function damageRate(ship: MutableCombatant, profile: ShipWeaponProfile, shielded: boolean): number {
  const damage = shielded
    ? (profile.combatShieldDamage ?? profile.shieldDamage)
    : (profile.combatHullDamage ?? profile.hullDamage);
  return Math.max(0, damage) / weaponCycleSeconds(profile, ship.setup.cycleTimeMultiplier ?? 1);
}

function coverageFactor(degrees: number): number {
  return 0.55 + 0.45 * clamp(degrees / 180, 0, 1);
}

export interface WeaponPostureScore {
  readonly firepower: number;
  readonly effectiveRange: number;
  readonly turnSeconds: number;
}

interface ScoredWeapon {
  readonly profile: ShipWeaponProfile;
  readonly primary: boolean;
  readonly weight: number;
}

/** Resolve legal firing arcs once for any proposed ship heading. */
function availableWeapons(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  group: WeaponPostureGroup,
  heading: number
): ScoredWeapon[] {
  const projected = { ...ship, headingRadians: heading };
  const shielded = enemy.shieldHp > 0;
  const result: ScoredWeapon[] = [];

  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const profile = ship.setup.weapons[index]?.weapon;
    const installed = weaponGroup(ship, index);
    if (!profile || !installed || !weaponInArc(projected, enemy.position, index, profile)) {
      continue;
    }
    const mount = ship.setup.weaponMounts?.find((point) => point.slotIndex === index);
    const arc = Math.min(profile.arcDegrees ?? 360, mount?.arcDegrees ?? 360);
    const primary = matches(installed, group);
    if (!primary && installed.focus !== 'turret') continue;
    const rate = damageRate(ship, profile, shielded);
    const weight = rate * coverageFactor(arc) * (primary ? 1 : 0.25);
    if (weight > 0) result.push({ profile, primary, weight });
  }
  return result;
}

/** Calculate useful weapon damage at an exact distance, not a mean of gun ranges. */
function selectFiringEnvelope(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  available: readonly ScoredWeapon[]
): { readonly firepower: number; readonly range: number } {
  const primary = available.filter((entry) => entry.primary);
  const enemyRanges = enemy.setup.weapons.map((weapon) => weapon.weapon?.rangeMeters ?? 0);
  const enemyRange = Math.max(0, ...enemyRanges);
  const ownSpeed = ship.setup.combatSpeed ?? 120;
  const enemySpeed = enemy.setup.combatSpeed ?? 120;
  const mobility = ownSpeed / Math.max(65, enemySpeed);

  let bestRange = 0;
  let bestFirepower = 0;
  let bestScore = -Infinity;

  for (const candidate of primary) {
    const range = Math.max(180, candidate.profile.rangeMeters * 0.8);
    const firepower = available.reduce(
      (total, entry) => total + (entry.profile.rangeMeters >= range ? entry.weight : 0),
      0
    );
    const safety = range > enemyRange ? 1.12 : 1;
    const exposure = range < enemyRange && mobility < 0.95 ? 0.86 : 1;
    const score = firepower * safety * exposure * (1 + range / 12000);
    if (score > bestScore) {
      bestScore = score;
      bestRange = range;
      bestFirepower = firepower;
    }
  }
  return { firepower: bestFirepower, range: bestRange };
}

/**
 * Score discrete, reachable firing envelopes instead of averaging dissimilar ranges.
 * A long railgun and a short repeater create two valid engagement distances.
 */
export function scoreWeaponPosture(
  ship: MutableCombatant,
  enemy: MutableCombatant,
  group: WeaponPostureGroup
): WeaponPostureScore | null {
  const heading = aimedHeading(ship, enemy, group);
  const available = availableWeapons(ship, enemy, group, heading);
  if (!available.some((entry) => entry.primary)) return null;

  const envelope = selectFiringEnvelope(ship, enemy, available);
  const turning = Math.abs(wrapAngle(heading - ship.headingRadians));
  const turnRate = Math.max(0.25, ship.setup.turnRateRadiansPerSecond ?? 0.72);
  return {
    firepower: envelope.firepower,
    effectiveRange: envelope.range,
    turnSeconds: group.focus === 'turret' ? 0 : turning / turnRate,
  };
}
