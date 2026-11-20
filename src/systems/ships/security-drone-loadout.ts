import type { SectorNpcState } from '../../core/npc-types';
import type { NpcInstalledComponents } from '../core/npc-types';
import {
  defaultInstalledShipComponents,
  fitsWeaponHardpoint,
  getCompatibleShipComponents,
  getShipDefinition,
  isShipCombatWeaponSlotActive,
  componentHullBonus,
  shipHullMaxHp,
  calculateShipModeEnergy,
  createShipyardVariantId,
} from './index';

/** Each active security drone weapon mount, hull and shield is Mk III. */
export function equipSecurityDroneMk3(npc: SectorNpcState): void {
  const ship = getShipDefinition(npc.shipId);
  if (!ship) return;
  const current = npc.installedComponents ?? defaultInstalledShipComponents(ship);
  const weapons = [...(current.weapon ?? [])];
  const mounts = ship.sprite.hardpoints.weaponMounts ?? [];
  const slots = mounts.length
    ? Math.max(...mounts.map((mount) => mount.slotIndex)) + 1
    : weapons.length;
  const compatible = getCompatibleShipComponents('weapon', 3)
    .filter((part) => part.tier === 3 && part.weapon)
    .sort((a, b) => a.power - b.power || a.cost - b.cost);
  for (let index = 0; index < slots; index += 1) {
    if (!isShipCombatWeaponSlotActive(ship, index)) continue;
    const part = compatible.find(
      (candidate) => candidate.weapon && fitsWeaponHardpoint(ship, index, candidate.weapon)
    );
    if (part) weapons[index] = part.id;
  }
  const mutable = Object.fromEntries(
    Object.entries(current).map(([type, ids]) => [type, [...(ids ?? [])]])
  ) as NpcInstalledComponents;
  const installed: NpcInstalledComponents = {
    ...mutable,
    weapon: weapons,
    hull: ['hull3'],
    shield: ['shield3'],
    reactor: ['reactor3'],
  };
  const energy = calculateShipModeEnergy(installed);
  if (energy.combat > energy.output) {
    const boosted = createShipyardVariantId('reactor', 'reactor3', 'performance', 100);
    if (boosted) installed.reactor = [boosted];
  }
  npc.installedComponents = installed;
  const newMaximum = shipHullMaxHp(ship, componentHullBonus(installed));
  const previousMaximum = Math.max(1, npc.hullMaxHp);
  const fraction = Math.max(0, Math.min(1, npc.hullHp / previousMaximum));
  npc.hullMaxHp = newMaximum;
  npc.hullHp = Math.round(newMaximum * fraction);
}
