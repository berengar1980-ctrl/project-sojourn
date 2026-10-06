import type {
  LayeredDamageResult,
  ShipIntegrityState,
  ShipMineDefinition,
} from '../../core/combat-types';

function currentHp(value: number): number {
  return Math.max(0, value);
}

export function resolveShipMineHit(
  mine: ShipMineDefinition,
  target: ShipIntegrityState
): LayeredDamageResult {
  const shieldHp = currentHp(target.shieldHp);
  const hullHp = currentHp(target.hullHp);

  if (shieldHp > 0) {
    const shieldDamage = Math.min(shieldHp, mine.shieldDamage);
    return {
      shieldDamage,
      hullDamage: 0,
      shieldRemaining: shieldHp - shieldDamage,
      hullRemaining: hullHp,
    };
  }

  const hullDamage = Math.min(hullHp, mine.hullDamage);
  return {
    shieldDamage: 0,
    hullDamage,
    shieldRemaining: 0,
    hullRemaining: hullHp - hullDamage,
  };
}
