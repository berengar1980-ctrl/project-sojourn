import type { LayeredDamageResult, ShipIntegrityState } from '../../core/combat-types';
import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';

function currentHp(value: number): number {
  return Math.max(0, value);
}

export function resolveShipWeaponHit(
  component: ShipComponentDefinition,
  target: ShipIntegrityState
): LayeredDamageResult {
  if (component.type !== 'weapon' || !component.weapon) {
    throw new Error('Component is not a combat-capable ship weapon.');
  }

  const shieldHp = currentHp(target.shieldHp);
  const hullHp = currentHp(target.hullHp);

  if (shieldHp > 0) {
    const shieldDamage = Math.min(shieldHp, component.weapon.shieldDamage);
    return {
      shieldDamage,
      hullDamage: 0,
      shieldRemaining: shieldHp - shieldDamage,
      hullRemaining: hullHp,
    };
  }

  const hullDamage = Math.min(hullHp, component.weapon.hullDamage);
  return {
    shieldDamage: 0,
    hullDamage,
    shieldRemaining: 0,
    hullRemaining: hullHp - hullDamage,
  };
}
