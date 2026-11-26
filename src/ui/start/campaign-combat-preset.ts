import { SECURITY_DRONE_SHIP_ID } from '../../core/security-drone';
import type { SectorNpcState } from '../../core/npc-types';
import { createSectorNpcEconomyStates } from '../../data/economy/sector-npc-economy';
import { equipSecurityDroneMk3 } from '../../systems/ships/security-drone-weapon-loadout';
import { ensureNpcInstalledComponents } from '../../systems/npcs/npc-upgrade-service';

export const SECURITY_DRONE_PRESET_ID = 'security-drone:standard';

/** Test scenarios use the actual campaign spawn templates, not a second balance table. */
export function campaignCombatPresets(): SectorNpcState[] {
  const roster = createSectorNpcEconomyStates();
  const patrol = roster.find((npc) => npc.job === 'patrol' && !npc.pirate);
  if (!patrol) throw new Error('Missing campaign patrol template');
  const drone: SectorNpcState = {
    ...structuredClone(patrol),
    id: SECURITY_DRONE_PRESET_ID,
    name: 'GC-87 Sicherheitsdrohne',
    cargo: {},
    hullHp: patrol.hullMaxHp,
  };
  equipSecurityDroneMk3(drone);
  return [...roster, drone];
}

export function campaignCombatPreset(id: string): SectorNpcState {
  const npc = campaignCombatPresets().find((entry) => entry.id === id);
  if (!npc) throw new Error('Unknown campaign combat preset: ' + id);
  ensureNpcInstalledComponents(npc);
  return npc;
}

export function campaignPresetDraft(id: string) {
  const npc = campaignCombatPreset(id);
  const installed = ensureNpcInstalledComponents(npc);
  const component = (type: keyof typeof installed) => installed[type]?.[0] ?? '';
  return {
    campaignNpcId: id,
    shipId: npc.shipId,
    weapons: [...(installed.weapon ?? [])],
    mines: [...(installed.mine ?? [])],
    crewId: '',
    reactorId: component('reactor'),
    engineId: component('engine'),
    shieldId: component('shield'),
    hullId: component('hull'),
    armorId: component('armor'),
    sensorId: component('sensor'),
    tractorId: component('tractor'),
    miningId: component('mining'),
    salvageId: component('salvage'),
    cargoId: component('cargo'),
  };
}

export function campaignPresetIsDrone(npc: SectorNpcState): boolean {
  return npc.shipId === SECURITY_DRONE_SHIP_ID;
}
