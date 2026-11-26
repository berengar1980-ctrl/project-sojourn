import { SECURITY_DRONE_SHIP_ID } from '../core/security-drone';
import { securityDroneMk3WeaponIds } from '../systems/ships/security-drone-weapon-loadout';
import type { SectorNpcState } from '../core/npc-types';
import type { NpcInstalledComponents } from '../core/npc-types';
import {
  defaultInstalledShipComponents,
  getShipDefinition,
  componentHullBonus,
  shipHullMaxHp,
  calculateShipModeEnergy,
  createShipyardVariantId,
} from '../systems/ships';

/** Each active security drone weapon mount, hull and shield is Mk III. */
export function equipSecurityDroneMk3(npc: SectorNpcState): void {
  const ship = getShipDefinition(SECURITY_DRONE_SHIP_ID);
  if (!ship) return;
  npc.shipId = SECURITY_DRONE_SHIP_ID;
  npc.aggression = 100;
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
  npc.hullHp = Math.round(newMaximum * fraction);
}
