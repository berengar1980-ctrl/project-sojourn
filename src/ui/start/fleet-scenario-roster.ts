import { securityDroneMk3WeaponIds } from '../../systems/ships/security-drone-weapon-loadout';
import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import {
  fitsWeaponHardpoint,
  getAllShipDefinitions,
  getShipDefinition,
  calculateShipModeEnergy,
  createShipyardVariantId,
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

function randomDraft(group: FleetScenarioRole): { name: string; draft: DuelDraft } {
  const ships = getAllShipDefinitions();
  const pirateShips = [
    getShipDefinition('pirate-raider-60m'),
    getShipDefinition('pirate-reaver-80m'),
    getShipDefinition('pirate-marauder-120m'),
  ].filter((ship): ship is NonNullable<typeof ship> => ship !== null);
  const civilianShips = ships.filter((candidate) =>
    candidate.role !== 'patrol' || !candidate.id.startsWith('pirate-')
  ).filter((candidate) => !pirateShips.some((pirate) => pirate.id === candidate.id));
  const matching =
    group === 'drone'
      ? ships.filter((ship) => ship.role === 'patrol')
      : group === 'pirates-yellow' || group === 'pirates-red'
        ? pirateShips
        : civilianShips;
  const ship = pick(matching);
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter((item) => item.tier === 1);
  const mines = SHIP_MINE_CATALOG.filter((item) => item.tier === 1);
  const weaponIds = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
    const compatible = weapons.filter(
      (item) => item.weapon && fitsWeaponHardpoint(ship, mount.slotIndex, item.weapon)
    );
    return compatible.length ? pick(compatible).id : '';
  });
  const securityDrone = group === 'drone';
  const equipped = securityDrone ? securityDroneMk3WeaponIds(ship) : weaponIds;
  const reactor = securityDrone ? 'reactor3' : 'reactor4';
  const reactorId =
    securityDrone &&
    calculateShipModeEnergy({
      reactor: [reactor],
      engine: ['engine1'],
      hull: ['hull3'],
      shield: ['shield3'],
      weapon: equipped.filter(Boolean),
    }).combat > calculateShipModeEnergy({ reactor: [reactor] }).output
      ? (createShipyardVariantId('reactor', reactor, 'performance', 100) ?? reactor)
      : reactor;
  return {
    name: securityDrone ? 'Sicherheitsdrohne GC-87' : ship.name,
    draft: {
      shipId: ship.id,
      weapons: equipped,
      mines: securityDrone ? [] : [pick(mines).id],
      crewId: pick(crewDefinitions).id,
      reactorId,
      engineId: 'engine1',
      shieldId: group === 'drone' ? 'shield3' : 'shield1',
      hullId: group === 'drone' ? 'hull3' : 'hull1',
      sensorId: 'sensor1',
      tractorId: 'tractor1',
    },
  };
}

/** Generate all combatants, including future reinforcements, before battle start. */
export function createFleetScenarioRoster(
  settings: readonly FleetScenarioCounts[]
): FleetScenarioShip[] {
  const result: FleetScenarioShip[] = [
    { id: 'player', group: 'player', arrivalSeconds: 0, ...randomDraft('player') },
  ];
  for (const setting of settings) {
    const initial = Math.min(10, Math.max(0, Math.trunc(setting.initial)));
    const joining = Math.min(10, Math.max(0, Math.trunc(setting.joining)));
    const afterSeconds = Math.max(0, Math.min(3600, setting.afterSeconds));
    for (let index = 0; index < initial + joining; index += 1) {
      result.push({
        id:
          setting.group === 'drone'
            ? 'security-drone:test-' + (index + 1)
            : setting.group + '-' + (index + 1),
        group: setting.group,
        arrivalSeconds: index < initial ? 0 : afterSeconds,
        ...randomDraft(setting.group),
      });
    }
  }
  return result;
}
