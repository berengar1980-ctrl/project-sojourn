import type {
  CombatImpactLayer,
  CombatTargetSubsystem,
  MutableCombatant,
  WeaponTelemetry,
} from './strategic-combat-types';

/** Weapon statistics belong to the firing ship, not a renderer or parsed log. */
export function createWeaponTelemetry(ship: Pick<MutableCombatant, 'setup'>): WeaponTelemetry[] {
  return ship.setup.weapons.map((component, index) => ({
    slotIndex: index,
    weaponId: component.id,
    weaponName: component.name,
    shotsFired: 0,
    shieldDamageDealt: 0,
    hullDamageDealt: 0,
    lastFiredAt: null,
  }));
}

export function recordWeaponFired(source: MutableCombatant, slotIndex: number, time: number): void {
  const entry = source.weaponTelemetry?.[slotIndex];
  if (!entry) return;
  entry.shotsFired += 1;
  entry.lastFiredAt = time;
}

/** Only actually absorbed/dealt damage counts; misses and obstacles award nothing. */
export function recordWeaponDamage(
  source: MutableCombatant,
  slotIndex: number | undefined,
  layer: CombatImpactLayer,
  damage: number,
  subsystem?: CombatTargetSubsystem
): void {
  if (slotIndex === undefined || !Number.isFinite(damage) || damage <= 0) return;
  const entry = source.weaponTelemetry?.[slotIndex];
  if (!entry) return;
  if (layer === 'shield') entry.shieldDamageDealt += damage;
  if (layer === 'hull' && !subsystem) entry.hullDamageDealt += damage;
}
