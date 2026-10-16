import type { ShipWeaponHardpoint } from './ship-types';

/**
 * Slot role comes from the JSON fitting policy, not from the default firing
 * direction. In particular, 360° turrets and guided launchers remain
 * physically mounted on the ship without being labelled as bow guns.
 */
export function weaponHardpointName(
  mount: Pick<ShipWeaponHardpoint, 'facing' | 'allowedMounts'>
): string {
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
