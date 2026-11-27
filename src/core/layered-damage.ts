import type { LayeredDamageResult, ShipIntegrityState } from './combat-types';

/** Damage absorption is independent of weapon balance and armor policy. */
export function absorbDamage(hp: number, damage: number) {
  const absorbed = Math.min(hp, damage);
  return {
    absorbed,
    remaining: Math.max(0, hp - absorbed),
    overflow: Math.max(0, damage - absorbed),
  };
}

/** Ordinary weapon and mine hits affect only the layer present before impact. */
export function resolveLayeredHit(
  target: ShipIntegrityState,
  shieldDamage: number,
  hullDamage: number
): LayeredDamageResult {
  const shieldHp = Math.max(0, target.shieldHp);
  const hullHp = Math.max(0, target.hullHp);
  if (shieldHp > 0) {
    const hit = absorbDamage(shieldHp, shieldDamage);
    return {
      shieldDamage: hit.absorbed,
      hullDamage: 0,
      shieldRemaining: hit.remaining,
      hullRemaining: hullHp,
    };
  }
  const hit = absorbDamage(hullHp, hullDamage);
  return {
    shieldDamage: 0,
    hullDamage: hit.absorbed,
    shieldRemaining: 0,
    hullRemaining: hit.remaining,
  };
}
