import type { ShipWeaponProfile } from '../../core/ship-types';
import type { CombatPoint, MutableCombatant } from './strategic-combat-types';

/** Ship-local gun hardpoints follow rotation, never the camera. */
export function weaponMuzzle(source: MutableCombatant, slot: number): CombatPoint {
  const mount = source.setup.weaponMounts?.find((point) => point.slotIndex === slot);
  if (!mount) return { ...source.position };
  const angle = source.headingRadians;
  return {
    x: source.position.x + mount.x * Math.cos(angle) - mount.y * Math.sin(angle),
    y: source.position.y + mount.x * Math.sin(angle) + mount.y * Math.cos(angle),
  };
}

function supportedWeaponMount(
  mount: NonNullable<MutableCombatant['setup']['weaponMounts']>[number] | undefined,
  kind: NonNullable<ShipWeaponProfile['mount']>,
  profile: ShipWeaponProfile
): boolean {
  if (mount?.allowedMounts && !mount.allowedMounts.includes(kind)) return false;
  if (mount?.allowedFamilies && !mount.allowedFamilies.includes(profile.family)) return false;
  return true;
}

export function weaponInArc(
  source: MutableCombatant,
  target: CombatPoint,
  slot: number,
  profile: ShipWeaponProfile
): boolean {
  let kind = profile.mount;
  if (!kind) {
    if (profile.family === 'railgun') kind = 'forward';
    else if (['plasma_battery', 'ion_cannon', 'autocannon'].includes(profile.family)) {
      kind = 'broadside';
    } else kind = 'turret';
  }
  const mount = source.setup.weaponMounts?.find((point) => point.slotIndex === slot);
  if (!supportedWeaponMount(mount, kind, profile)) return false;
  const defaultArc = kind === 'forward' ? 60 : kind === 'broadside' ? 90 : 360;
  const weaponArc = profile.arcDegrees ?? defaultArc;
  const degrees = Math.min(weaponArc, mount?.arcDegrees ?? 360);
  if (degrees >= 360) return true;
  const muzzle = weaponMuzzle(source, slot);
  const side = mount?.facing ?? (kind === 'broadside' ? 'port' : 'forward');
  const facing =
    source.headingRadians +
    (side === 'starboard' ? Math.PI / 2 : side === 'port' ? -Math.PI / 2 : 0);
  const bearing = Math.atan2(target.y - muzzle.y, target.x - muzzle.x);
  const delta = Math.atan2(Math.sin(bearing - facing), Math.cos(bearing - facing));
  return Math.abs(delta) <= (degrees * Math.PI) / 360 + 0.000001;
}
