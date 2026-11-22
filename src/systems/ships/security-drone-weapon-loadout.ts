import type { ShipDefinition } from '../../core/ship-types';
import { getCompatibleShipComponents } from './ship-component-service';
import { fitsWeaponHardpoint } from './ship-loadout-service';
import { isShipCombatWeaponSlotActive } from './ship-combat-role-policy';

/**
 * The same Mk III security armament is used by campaign drones and the
 * FleetCombat scenario laboratory. Preserve each physical weapon slot index.
 */
export function securityDroneMk3WeaponIds(
  ship: ShipDefinition,
  previous: readonly string[] = []
): string[] {
  const weapons = [...previous];
  const mounts = ship.sprite.hardpoints.weaponMounts ?? [];
  const slots = mounts.length ? Math.max(...mounts.map((mount) => mount.slotIndex)) + 1 : weapons.length;
  const compatible = getCompatibleShipComponents('weapon', 3)
    .filter((part) => part.tier === 3 && part.weapon)
    .sort((a, b) => a.power - b.power || a.cost - b.cost);
  for (let index = 0; index < slots; index += 1) {
    if (!isShipCombatWeaponSlotActive(ship, index)) continue;
    const selected = compatible.find(
      (candidate) => candidate.weapon && fitsWeaponHardpoint(ship, index, candidate.weapon)
    );
    if (selected) weapons[index] = selected.id;
  }
  return weapons;
}
