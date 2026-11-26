import { campaignCombatPresets, campaignPresetDraft, SECURITY_DRONE_PRESET_ID } from './campaign-combat-preset';
import { npcJobShipRole } from '../../core/npc-types';
import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import {
  fitsWeaponHardpoint,
  getAllShipDefinitions,
} from '../../systems/ships';
import type { DuelDraft } from './duel-combatant-setup';

export type FleetScenarioGroup = 'npc' | 'pirates-yellow' | 'pirates-red' | 'drone';
export type FleetScenarioRole = FleetScenarioGroup | 'player';
export type FleetScenarioIncident = 'none' | 'player-attacks-npc' | 'npc-attacks-player';

export interface FleetScenarioCounts {
  readonly group: FleetScenarioGroup;
  readonly initial: number;
  readonly joining: number;
  readonly afterSeconds: number;
}

export interface FleetScenarioShip {
  readonly id: string;
  readonly group: FleetScenarioRole;
  readonly name: string;
  readonly draft: DuelDraft;
  readonly arrivalSeconds: number;
}

export const FLEET_SCENARIO_GROUPS: readonly {
  readonly id: FleetScenarioGroup;
  readonly title: string;
  readonly color: string;
}[] = [
  { id: 'npc', title: 'Zivile NPCs', color: '#9aa7b5' },
  { id: 'pirates-yellow', title: 'Piraten · Gelb', color: '#f0be5b' },
  { id: 'pirates-red', title: 'Piraten · Rot', color: '#e04c44' },
  { id: 'drone', title: 'Sicherheitsdrohnen', color: '#68bdd2' },
];

export const DEFAULT_FLEET_SCENARIO: readonly FleetScenarioCounts[] = [
  { group: 'npc', initial: 2, joining: 0, afterSeconds: 30 },
  { group: 'pirates-yellow', initial: 2, joining: 0, afterSeconds: 30 },
  { group: 'pirates-red', initial: 0, joining: 2, afterSeconds: 20 },
  { group: 'drone', initial: 0, joining: 2, afterSeconds: 35 },
];

function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('FleetCombat test catalog is empty');
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomDraft(
  group: FleetScenarioRole,
  workRole?: 'mining' | 'salvage' | 'freighter' | 'patrol'
): { name: string; draft: DuelDraft } {
  if (group !== 'player') return campaignDraft(group, workRole);
  const ship = pick(getAllShipDefinitions());
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter((item) => item.tier === 1);
  const mines = SHIP_MINE_CATALOG.filter((item) => item.tier === 1);
  const weaponIds = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
    const compatible = weapons.filter(
      (item) => item.weapon && fitsWeaponHardpoint(ship, mount.slotIndex, item.weapon)
    );
    return compatible.length ? pick(compatible).id : '';
  });
  return {
    name: ship.name,
    draft: {
      shipId: ship.id,
      weapons: weaponIds,
      mines: [pick(mines).id],
      crewId: pick(crewDefinitions).id,
      reactorId: 'reactor4',
      engineId: 'engine1',
      shieldId: 'shield1',
      hullId: 'hull1',
      sensorId: 'sensor1',
      tractorId: 'tractor1',
    },
  };
}

function campaignDraft(
  group: FleetScenarioGroup,
  workRole?: 'mining' | 'salvage' | 'freighter' | 'patrol'
): { name: string; draft: DuelDraft } {
  const roster = campaignCombatPresets();
  const candidates = roster.filter((npc) => {
    if (group === 'drone') return npc.id === SECURITY_DRONE_PRESET_ID;
    if (group === 'pirates-yellow') return npc.pirate && npc.pirateClass !== 'marauder' && npc.factionId === 'pirates';
    if (group === 'pirates-red') return npc.pirate && npc.factionId === 'pirates2';
    return !npc.pirate && npc.id !== SECURITY_DRONE_PRESET_ID &&
      (!workRole || npcJobShipRole(npc.job) === workRole);
  });
  const npc = pick(candidates);
  return { name: npc.name, draft: campaignPresetDraft(npc.id) };
}

/** Generate all combatants, including future reinforcements, before battle start. */
export function createFleetScenarioRoster(
  settings: readonly FleetScenarioCounts[],
  mapKind:
    'empty' | 'scattered' | 'asteroid_field' | 'scrap_scattered' | 'scrap_field' = 'asteroid_field'
): FleetScenarioShip[] {
  const result: FleetScenarioShip[] = [
    { id: 'player', group: 'player', arrivalSeconds: 0, ...randomDraft('player') },
  ];
  for (const setting of settings) {
    const initial = Math.min(10, Math.max(0, Math.trunc(setting.initial)));
    const joining = Math.min(10, Math.max(0, Math.trunc(setting.joining)));
    const afterSeconds = Math.max(0, Math.min(3600, setting.afterSeconds));
    for (let index = 0; index < initial + joining; index += 1) {
      // Every world should contain working ships, not only arbitrarily armed hulls.
      const workRoles: readonly ('mining' | 'salvage' | 'freighter' | 'patrol')[] =
        mapKind === 'scrap_scattered' || mapKind === 'scrap_field'
          ? ['salvage', 'freighter', 'patrol']
          : mapKind === 'scattered' || mapKind === 'asteroid_field'
            ? ['mining', 'freighter', 'patrol']
            : ['freighter', 'patrol'];
      const workRole = setting.group === 'npc' ? workRoles[index % workRoles.length] : undefined;
      result.push({
        id:
          setting.group === 'drone'
            ? 'security-drone:test-' + (index + 1)
            : setting.group + '-' + (index + 1),
        group: setting.group,
        arrivalSeconds: index < initial ? 0 : afterSeconds,
        ...randomDraft(setting.group, workRole),
      });
    }
  }
  return result;
}
