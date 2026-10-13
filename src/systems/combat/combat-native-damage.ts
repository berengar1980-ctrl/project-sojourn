import type { ShipComponentDefinition } from '../../data/ships/ship-component-catalog';
import type { ShipMineDefinition } from '../../core/combat-types';

interface NativeDamage {
  readonly shieldDamage: number;
  readonly hullDamage: number;
}

// Explicit combat-only effective damage, frozen from the original 0.18 balance.
// The source catalog intentionally retains its raw data for noncombat consumers.
const WEAPON_DAMAGE: Readonly<Record<string, NativeDamage>> = {
  'weapon1': { shieldDamage: 2.6999999999999997, hullDamage: 2.6999999999999997 },
  'weapon2': { shieldDamage: 3.5999999999999996, hullDamage: 3.5999999999999996 },
  'weapon3': { shieldDamage: 4.5, hullDamage: 4.5 },
  'weapon4': { shieldDamage: 5.58, hullDamage: 5.58 },
  'weapon5': { shieldDamage: 6.84, hullDamage: 6.84 },
  'weapon6': { shieldDamage: 8.1, hullDamage: 8.1 },
  'weapon-plasma-battery-1': { shieldDamage: 4.32, hullDamage: 4.32 },
  'weapon-plasma-battery-2': { shieldDamage: 5.58, hullDamage: 5.58 },
  'weapon-plasma-battery-3': { shieldDamage: 7.199999999999999, hullDamage: 7.199999999999999 },
  'weapon-plasma-battery-4': { shieldDamage: 8.82, hullDamage: 8.82 },
  'weapon-plasma-battery-5': { shieldDamage: 10.799999999999999, hullDamage: 10.799999999999999 },
  'weapon-plasma-battery-6': { shieldDamage: 12.959999999999999, hullDamage: 12.959999999999999 },
  'weapon-guided-missile-1': { shieldDamage: 3.2399999999999998, hullDamage: 4.5 },
  'weapon-guided-missile-2': { shieldDamage: 4.14, hullDamage: 5.9399999999999995 },
  'weapon-guided-missile-3': { shieldDamage: 5.3999999999999995, hullDamage: 7.38 },
  'weapon-guided-missile-4': { shieldDamage: 6.66, hullDamage: 9.18 },
  'weapon-guided-missile-5': { shieldDamage: 8.1, hullDamage: 11.34 },
  'weapon-guided-missile-6': { shieldDamage: 9.719999999999999, hullDamage: 13.5 },
  'weapon-ion-laser-1': { shieldDamage: 5.3999999999999995, hullDamage: 1.08 },
  'weapon-ion-laser-2': { shieldDamage: 7.02, hullDamage: 1.44 },
  'weapon-ion-laser-3': { shieldDamage: 9, hullDamage: 1.7999999999999998 },
  'weapon-ion-laser-4': { shieldDamage: 10.98, hullDamage: 2.16 },
  'weapon-ion-laser-5': { shieldDamage: 13.5, hullDamage: 2.6999999999999997 },
  'weapon-ion-laser-6': { shieldDamage: 16.2, hullDamage: 3.2399999999999998 },
  'weapon-ion-cannon-1': { shieldDamage: 9, hullDamage: 0.54 },
  'weapon-ion-cannon-2': { shieldDamage: 11.7, hullDamage: 0.72 },
  'weapon-ion-cannon-3': { shieldDamage: 14.94, hullDamage: 0.8999999999999999 },
  'weapon-ion-cannon-4': { shieldDamage: 18.36, hullDamage: 1.08 },
  'weapon-ion-cannon-5': { shieldDamage: 22.5, hullDamage: 1.44 },
  'weapon-ion-cannon-6': { shieldDamage: 27, hullDamage: 1.6199999999999999 },
  'weapon-autocannon-1': { shieldDamage: 1.44, hullDamage: 6.12 },
  'weapon-autocannon-2': { shieldDamage: 1.7999999999999998, hullDamage: 7.92 },
  'weapon-autocannon-3': { shieldDamage: 2.34, hullDamage: 10.08 },
  'weapon-autocannon-4': { shieldDamage: 2.88, hullDamage: 12.6 },
  'weapon-autocannon-5': { shieldDamage: 3.5999999999999996, hullDamage: 15.299999999999999 },
  'weapon-autocannon-6': { shieldDamage: 4.32, hullDamage: 18.36 },
  'weapon-railgun-1': { shieldDamage: 0.8999999999999999, hullDamage: 54 },
  'weapon-railgun-2': { shieldDamage: 1.26, hullDamage: 70.2 },
  'weapon-railgun-3': { shieldDamage: 1.44, hullDamage: 89.1 },
  'weapon-railgun-4': { shieldDamage: 1.7999999999999998, hullDamage: 110.7 },
  'weapon-railgun-5': { shieldDamage: 2.34, hullDamage: 135 },
  'weapon-railgun-6': { shieldDamage: 2.6999999999999997, hullDamage: 162 },
  'weapon-he-missile-1': { shieldDamage: 1.7999999999999998, hullDamage: 8.64 },
  'weapon-he-missile-2': { shieldDamage: 2.34, hullDamage: 11.16 },
  'weapon-he-missile-3': { shieldDamage: 3.06, hullDamage: 14.219999999999999 },
  'weapon-he-missile-4': { shieldDamage: 3.78, hullDamage: 17.64 },
  'weapon-he-missile-5': { shieldDamage: 4.5, hullDamage: 21.599999999999998 },
  'weapon-he-missile-6': { shieldDamage: 5.3999999999999995, hullDamage: 25.919999999999998 },
};

const MINE_DAMAGE: Readonly<Record<string, NativeDamage>> = {
  'mine-ion-1': { shieldDamage: 11.7, hullDamage: 0.8999999999999999 },
  'mine-ion-2': { shieldDamage: 15.299999999999999, hullDamage: 1.26 },
  'mine-ion-3': { shieldDamage: 19.259999999999998, hullDamage: 1.44 },
  'mine-ion-4': { shieldDamage: 23.939999999999998, hullDamage: 1.7999999999999998 },
  'mine-ion-5': { shieldDamage: 29.34, hullDamage: 2.34 },
  'mine-ion-6': { shieldDamage: 35.1, hullDamage: 2.6999999999999997 },
  'mine-shaped-charge-1': { shieldDamage: 1.7999999999999998, hullDamage: 13.5 },
  'mine-shaped-charge-2': { shieldDamage: 2.34, hullDamage: 17.64 },
  'mine-shaped-charge-3': { shieldDamage: 3.06, hullDamage: 22.32 },
  'mine-shaped-charge-4': { shieldDamage: 3.78, hullDamage: 27.72 },
  'mine-shaped-charge-5': { shieldDamage: 4.5, hullDamage: 33.839999999999996 },
  'mine-shaped-charge-6': { shieldDamage: 5.3999999999999995, hullDamage: 40.5 },
  'mine-hunter-1': { shieldDamage: 7.199999999999999, hullDamage: 7.199999999999999 },
  'mine-hunter-2': { shieldDamage: 9.36, hullDamage: 9.36 },
  'mine-hunter-3': { shieldDamage: 11.879999999999999, hullDamage: 11.879999999999999 },
  'mine-hunter-4': { shieldDamage: 14.76, hullDamage: 14.76 },
  'mine-hunter-5': { shieldDamage: 18, hullDamage: 18 },
  'mine-hunter-6': { shieldDamage: 21.599999999999998, hullDamage: 21.599999999999998 },
};

/** Unknown custom components already supply native damage values. */
export function nativeWeaponDamage(component: Pick<ShipComponentDefinition, 'id' | 'weapon'>): NativeDamage {
  return WEAPON_DAMAGE[component.id] ?? {
    shieldDamage: component.weapon?.shieldDamage ?? 0,
    hullDamage: component.weapon?.hullDamage ?? 0,
  };
}

export function nativeMineDamage(definition: Pick<ShipMineDefinition, 'id' | 'shieldDamage' | 'hullDamage'>): NativeDamage {
  return MINE_DAMAGE[definition.id] ?? {
    shieldDamage: definition.shieldDamage,
    hullDamage: definition.hullDamage,
  };
}
