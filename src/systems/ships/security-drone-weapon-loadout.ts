import type { ShipDefinition } from '../../core/ship-types';
import { getCompatibleShipComponents } from './ship-component-service';
import { fitsWeaponHardpoint } from './ship-loadout-service';
import { isShipCombatWeaponSlotActive } from './ship-combat-role-policy';

/**
 * The same Mk III security armament is used by campaign drones and the
 * FleetCombat scenario laboratory. Preserve each physical weapon slot index.
 */
export function securityDroneMk3WeaponIds(
  ship: ShipDefinition,
  previous: readonly string[] = []
): string[] {
  const weapons = [...previous];
  const mounts = ship.sprite.hardpoints.weaponMounts ?? [];
  const slots = mounts.length
    ? Math.max(...mounts.map((mount) => mount.slotIndex)) + 1
    : weapons.length;
  const compatible = getCompatibleShipComponents('weapon', 3)
    .filter((part) => part.tier === 3 && part.weapon)
    .sort((a, b) => a.power - b.power || a.cost - b.cost);
  for (let index = 0; index < slots; index += 1) {
    if (!isShipCombatWeaponSlotActive(ship, index)) continue;
    const selected = compatible.find(
      (candidate) => candidate.weapon && fitsWeaponHardpoint(ship, index, candidate.weapon)
    );
    if (selected) weapons[index] = selected.id;
  }
  return weapons;
}

import { SECURITY_DRONE_SHIP_ID } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import type { NpcInstalledComponents } from '../../core/npc-types';
import {
  defaultInstalledShipComponents,
  getShipDefinition,
  componentHullBonus,
  shipHullMaxHp,
  calculateShipModeEnergy,
  createShipyardVariantId,
} from './index';

/** Each active security drone weapon mount, hull and shield is Mk III. */
export function equipSecurityDroneMk3(npc: SectorNpcState): void {
  const ship = getShipDefinition(SECURITY_DRONE_SHIP_ID);
  if (!ship) return;
  npc.shipId = SECURITY_DRONE_SHIP_ID;
  npc.aggression = 100;
  npc.cargoCapacity = 0;
  npc.normalCargoCapacity = 0;
  const current = defaultInstalledShipComponents(ship);
  const weapons = securityDroneMk3WeaponIds(ship, current.weapon);
  const mutable = Object.fromEntries(
    Object.entries(current).map(([type, ids]) => [type, [...(ids ?? [])]])
  ) as NpcInstalledComponents;
  const installed: NpcInstalledComponents = {
    ...mutable,
    weapon: weapons,
    armor: ['armor-all-3'],
    engine: ['engine3'],
    sensor: ['sensor3'],
    cargo: [],
    mine: [],
    tractor: [],
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
  npc.hullHp = fraction > 0 ? Math.max(1, Math.round(newMaximum * fraction)) : 0;
}
