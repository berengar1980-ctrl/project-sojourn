import type { BoardingMeleeProfile, BoardingWeaponProfile } from '../../core/boarding-types';

export const boardingRangedWeapons = {
  sidearm: {
    id: 'sidearm',
    name: 'Dienstpistole',
    range: 3,
    hitBonus: 4,
    damage: 3,
    armorPenetration: 0,
    spread: 5,
    canSuppress: false,
  },
  rifle: {
    id: 'rifle',
    name: 'Schiffsgewehr',
    range: 6,
    hitBonus: 6,
    damage: 4,
    armorPenetration: 0,
    spread: 3,
    canSuppress: true,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Bordflinte',
    range: 3,
    hitBonus: 10,
    damage: 5,
    armorPenetration: 0,
    spread: 6,
    canSuppress: false,
  },
  breacher: {
    id: 'breacher',
    name: 'Breschenkarabiner',
    range: 4,
    hitBonus: 3,
    damage: 5,
    armorPenetration: 1,
    spread: 4,
    canSuppress: true,
  },
} as const satisfies Readonly<Record<string, BoardingWeaponProfile>>;

export const boardingMeleeWeapons = {
  knife: {
    id: 'knife',
    name: 'Bordmesser',
    hitBonus: 10,
    damage: 3,
    armorPenetration: 0,
  },
  baton: {
    id: 'baton',
    name: 'Schlagstock',
    hitBonus: 7,
    damage: 3,
    armorPenetration: 0,
  },
  breachingTool: {
    id: 'breaching-tool',
    name: 'Breschenwerkzeug',
    hitBonus: 1,
    damage: 5,
    armorPenetration: 1,
  },
} as const satisfies Readonly<Record<string, BoardingMeleeProfile>>;
