import type { ShipDefinition } from '../../core/ship-types';
import { fitsWeaponHardpoint, getShipComponent } from '../ships';

/** Shared weapon slot resolution for the duel, campaign player and NPC ships. */
export function combatEquippedWeapons(ship: ShipDefinition, weaponIds: readonly string[]) {
  return weaponIds.flatMap((id, slotIndex) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon && fitsWeaponHardpoint(ship, slotIndex, component.weapon)
      ? [{ component, slotIndex }]
      : [];
  });
}

/** Convert sprite hardpoints to world-space mounts once for every combat mode. */
export function combatWeaponMounts(
  ship: ShipDefinition,
  equipped: readonly { readonly slotIndex: number }[]
) {
  const points = ship.sprite.hardpoints;
  const scale = ship.nominalLengthMeters / points.sourceWidth;
  return equipped.flatMap((entry, slotIndex) => {
    const mount = points.weaponMounts?.find((point) => point.slotIndex === entry.slotIndex);
    return mount
      ? [
          {
            slotIndex,
            x: (mount.x - points.pivot.x) * scale,
            y: (mount.y - points.pivot.y) * scale,
            facing: mount.facing,
            ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),
            ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),
            ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
          },
        ]
      : [];
  });
}
