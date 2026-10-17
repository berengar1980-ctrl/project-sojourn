import type { ShipWeaponHardpoint } from './ship-types';

/**
 * Slot role comes from the JSON fitting policy, not from the default firing
 * direction. In particular, 360° turrets and guided launchers remain
 * physically mounted on the ship without being labelled as bow guns.
 */
export function weaponHardpointName(
  mount: Pick<ShipWeaponHardpoint, 'facing' | 'allowedMounts'>
): string {
  if (mount.allowedMounts?.includes('turret') && mount.allowedMounts.includes('guided')) {
    return 'Universalwaffe';
  }
  if (mount.allowedMounts?.length === 1) {
    if (mount.allowedMounts[0] === 'turret') return 'Geschützturm';
    if (mount.allowedMounts[0] === 'guided') return 'Lenkwaffenwerfer';
  }
  if (mount.facing === 'port') return 'Backbordwaffe';
  if (mount.facing === 'starboard') return 'Steuerbordwaffe';
  return 'Bugwaffe';
}

/** Human-readable display only: never changes weapon fitting or fire geometry. */
export function weaponHardpointDescription(
  mount: Pick<ShipWeaponHardpoint, 'facing' | 'allowedMounts' | 'arcDegrees'>
): string {
  const name = weaponHardpointName(mount);
  if (mount.arcDegrees === undefined) return name + ' · Winkel gemäß Waffe';
  const suffix =
    mount.allowedMounts?.length === 1 && mount.allowedMounts[0] === 'guided'
      ? ' Zielerfassung'
      : ' Feuerwinkel';
  return name + ' · ' + mount.arcDegrees + '°' + suffix;
}

export type WeaponUiGroup = 'front' | 'port' | 'starboard' | 'turret';

/** Shared display ordering only; physical slotIndex is never renumbered. */
export function weaponUiGroup(
  mount: Pick<ShipWeaponHardpoint, 'facing' | 'allowedMounts'>
): WeaponUiGroup {
  if (mount.allowedMounts?.includes('turret') || mount.allowedMounts?.includes('guided')) {
    return 'turret';
  }
  if (mount.facing === 'port') return 'port';
  if (mount.facing === 'starboard') return 'starboard';
  return 'front';
}

export function weaponUiOrder(
  mount: Pick<ShipWeaponHardpoint, 'slotIndex' | 'facing' | 'allowedMounts'>
): number {
  const group = weaponUiGroup(mount);
  const rank = { front: 0, port: 1, starboard: 2, turret: 3 }[group];
  return rank * 100 + mount.slotIndex;
}
