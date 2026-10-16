import type { MutableCombatant } from './strategic-combat-types';
import type { ShipWeaponProfile } from '../../core/ship-types';

/** Each installed weapon owns its reload timer; no ship-wide pulse budget. */
export function weaponCycleSeconds(weapon: ShipWeaponProfile, crewMultiplier: number): number {
  return Math.max(0.05, weapon.cooldownSeconds * Math.max(0.4, Math.min(2, crewMultiplier)));
}

export function advanceWeaponCooldowns(ship: MutableCombatant, dt: number): void {
  for (let index = 0; index < ship.setup.weapons.length; index += 1) {
    const remaining = (ship.cooldowns[index] ?? 0) - dt;
    // Floating-point residue must not postpone a shot at the exact reload deadline.
    ship.cooldowns[index] = remaining <= 0.000001 ? 0 : remaining;
  }
}
