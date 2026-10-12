import type { ShipDefinition } from '../../systems/ships';
import { fitsWeaponHardpoint } from '../../systems/ships';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import type { ShipWeaponFamily } from '../../core/ship-types';

type WeaponChoice = readonly [family: ShipWeaponFamily, tier: number];
interface PresetSide {
  readonly role: ShipDefinition['role'];
  readonly variant: number;
  readonly weapons: readonly WeaponChoice[];
  readonly crewIndex: number;
}
export interface DuelEncounter {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly seed: number;
  readonly first: PresetSide;
  readonly second: PresetSide;
}

const side = (
  role: ShipDefinition['role'],
  variant: number,
  weapons: readonly WeaponChoice[],
  crewIndex: number
): PresetSide => ({ role, variant, weapons, crewIndex });

const rail: WeaponChoice = ['railgun', 2];
const cannon: WeaponChoice = ['autocannon', 2];
const plasma: WeaponChoice = ['plasma_battery', 2];
const ion: WeaponChoice = ['ion_cannon', 2];
const laser: WeaponChoice = ['pulse_laser', 2];
const ionLaser: WeaponChoice = ['ion_laser', 2];
const missile: WeaponChoice = ['guided_missile', 2];
const heavyMissile: WeaponChoice = ['he_missile', 2];

export const DUEL_ENCOUNTERS: readonly DuelEncounter[] = [
  {
    id: 'alpha',
    title: 'Alpha · Front gegen Front',
    purpose: 'Railguns, Abstand und Frontalwinkel',
    seed: 1001,
    first: side('patrol', 1, [rail, cannon, cannon, laser], 0),
    second: side('patrol', 2, [rail, cannon, cannon, laser], 1),
  },
  {
    id: 'beta',
    title: 'Beta · Schildbrecher',
    purpose: 'Ionenwaffen gegen Panzerungswaffen',
    seed: 1002,
    first: side('patrol', 3, [rail, ion, ion, ionLaser, missile], 2),
    second: side('patrol', 4, [rail, cannon, cannon, laser, heavyMissile], 3),
  },
  {
    id: 'gamma',
    title: 'Gamma · Breitseiten',
    purpose: 'Backbord- und Steuerbord-Orientierung',
    seed: 1003,
    first: side('salvage', 1, [rail, plasma, plasma, laser], 4),
    second: side('salvage', 2, [rail, cannon, cannon, laser], 5),
  },
  {
    id: 'delta',
    title: 'Delta · Reichweite',
    purpose: 'Railgun gegen kurze Kanonenreichweite',
    seed: 1004,
    first: side('patrol', 5, [rail, cannon, cannon, laser, missile], 6),
    second: side('freighter', 1, [rail, cannon, cannon, laser], 7),
  },
  {
    id: 'epsilon',
    title: 'Epsilon · Traktor',
    purpose: 'Bergungsschiff gegen Patrouille',
    seed: 1005,
    first: side('salvage', 3, [rail, ion, plasma, laser], 8),
    second: side('patrol', 6, [rail, plasma, cannon, laser, missile], 9),
  },
  {
    id: 'zeta',
    title: 'Zeta · Miner',
    purpose: 'Bergbauplattform gegen Kampfschiff',
    seed: 1006,
    first: side('mining', 1, [rail, plasma, cannon, ionLaser], 10),
    second: side('patrol', 7, [rail, cannon, plasma, laser, heavyMissile], 11),
  },
  {
    id: 'eta',
    title: 'Eta · Frachterflucht',
    purpose: 'Langsamer Frachter und Abfangschiff',
    seed: 1007,
    first: side('freighter', 2, [rail, ion, cannon, laser], 12),
    second: side('patrol', 1, [rail, cannon, cannon, laser, missile], 13),
  },
  {
    id: 'theta',
    title: 'Theta · Turmgefecht',
    purpose: 'Bewegungsfreiheit und Rundumlaser',
    seed: 1008,
    first: side('mining', 2, [rail, ion, ion, ionLaser], 14),
    second: side('freighter', 3, [rail, cannon, cannon, laser], 15),
  },
  {
    id: 'iota',
    title: 'Iota · Hüllenduell',
    purpose: 'Schilddurchbruch und Folgeziel Hülle',
    seed: 1009,
    first: side('patrol', 2, [rail, cannon, cannon, laser, heavyMissile], 16),
    second: side('salvage', 4, [rail, ion, plasma, ionLaser], 17),
  },
];

export function resolveDuelPreset(
  preset: DuelEncounter,
  ships: readonly ShipDefinition[]
): readonly { shipId: string; weapons: string[]; crewIndex: number }[] {
  return [preset.first, preset.second].map((choice) => {
    const roleShips = ships.filter((ship) => ship.role === choice.role);
    const ship = roleShips[choice.variant - 1] ?? roleShips[0] ?? ships[0]!;
    const weapons = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount, index) => {
      const [family, tier] = choice.weapons[index] ?? choice.weapons[0]!;
      const candidate = (SHIP_COMPONENT_CATALOG.weapon ?? []).find(
        (component) =>
          component.weapon?.family === family &&
          component.tier === tier &&
          fitsWeaponHardpoint(ship, mount.slotIndex, component.weapon)
      );
      return candidate?.id ?? '';
    });
    return { shipId: ship.id, weapons, crewIndex: choice.crewIndex };
  });
}
