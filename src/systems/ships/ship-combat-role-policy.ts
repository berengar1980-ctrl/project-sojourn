import type { ShipDefinition, ShipRole, ShipWeaponHardpoint } from '../../core/ship-types';
import { getShipComponent, type InstalledShipComponents } from './ship-component-service';

/**
 * Weapon slots are stable sprite indices, NOT the number of physical sockets.
 * A civilian hull may keep unused construction hardpoints without being able
 * to arm them. All entry points (lobby, shipyard, NPC and combat) use this rule.
 */
const ACTIVE_WEAPON_SLOTS: Readonly<Record<ShipRole, readonly number[]>> = {
  patrol: [0, 1, 2, 3, 4, 5],
  freighter: [0, 3],
  mining: [0],
  salvage: [0],
};

/** Every hull carries a standard maneuver/boarding tractor. Fitted upgrades extend its reach. */
export const STANDARD_MANEUVER_TRACTOR_RANGE_METERS = 400;

export function isShipCombatWeaponSlotActive(ship: ShipDefinition, slotIndex: number): boolean {
  return ACTIVE_WEAPON_SLOTS[ship.role].includes(slotIndex);
}

export function shipActiveCombatWeaponMounts(ship: ShipDefinition): readonly ShipWeaponHardpoint[] {
  return (ship.sprite.hardpoints.weaponMounts ?? []).filter((mount) =>
    isShipCombatWeaponSlotActive(ship, mount.slotIndex)
  );
}

/** Heavy manipulation of asteroids, wreckage and armed mines needs an industrial tractor. */
export function shipHasIndustrialTractor(ship: ShipDefinition): boolean {
  return ship.role === 'mining' || ship.role === 'salvage';
}

export function shipCombatTractorRange(installed?: InstalledShipComponents): number {
  return Math.max(
    STANDARD_MANEUVER_TRACTOR_RANGE_METERS,
    ...(installed?.tractor ?? []).map((id) => getShipComponent('tractor', id)?.range ?? 0)
  );
}
