import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import type { ShipMineDefinition } from '../../core/combat-types';

interface NativeDamage {
  readonly shieldDamage: number;
  readonly hullDamage: number;
}

/** Combat damage lives in its weapon or mine definition, not in a second lookup table. */
export function nativeWeaponDamage(
  component: Pick<ShipComponentDefinition, 'id' | 'weapon'>
): NativeDamage {
  return {
    shieldDamage: component.weapon?.combatShieldDamage ?? component.weapon?.shieldDamage ?? 0,
    hullDamage: component.weapon?.combatHullDamage ?? component.weapon?.hullDamage ?? 0,
  };
}

export function nativeMineDamage(
  definition: Pick<
    ShipMineDefinition,
    'id' | 'shieldDamage' | 'hullDamage' | 'combatShieldDamage' | 'combatHullDamage'
  >
): NativeDamage {
  return {
    shieldDamage: definition.combatShieldDamage ?? definition.shieldDamage,
    hullDamage: definition.combatHullDamage ?? definition.hullDamage,
  };
}
