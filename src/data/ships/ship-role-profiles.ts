import type {
  ShipComponentSlots,
  ShipRoleProfile,
  ShipStationDefinition,
} from '../../core/ship-gameplay-types';
import type { ShipRole } from '../../core/ship-types';

const COMMON_STATIONS: readonly ShipStationDefinition[] = [
  { id: 'helm', skill: 'piloting' },
  { id: 'sensor-station', skill: 'sensors' },
  { id: 'weapon-station', skill: 'weapons' },
  { id: 'engine-room', skill: 'engineering' },
];

function slots(
  weapon: number,
  cargo: number,
  mining: number,
  salvage: number
): ShipComponentSlots {
  return {
    reactor: 1,
    engine: 1,
    shield: 1,
    hull: 1,
    sensor: 1,
    weapon,
    cargo,
    mining,
    salvage,
  };
}

export const shipRoleProfiles: Readonly<Record<ShipRole, ShipRoleProfile>> = {
  freighter: {
    role: 'freighter',
    hullPoints: 78,
    fuelCapacity: 150,
    fuelUse: 0.82,
    weaponSlots: 2,
    crewCapacity: 5,
    maxComponentTier: 3,
    cargoMode: 'general',
    stations: [...COMMON_STATIONS, { id: 'cargo-control', skill: 'logistics' }],
    componentSlots: slots(2, 1, 0, 0),
  },
  mining: {
    role: 'mining',
    hullPoints: 72,
    fuelCapacity: 145,
    fuelUse: 0.86,
    weaponSlots: 1,
    crewCapacity: 5,
    maxComponentTier: 3,
    cargoMode: 'mining',
    stations: [...COMMON_STATIONS, { id: 'mining-station', skill: 'mining' }],
    componentSlots: slots(1, 0, 1, 0),
  },
  salvage: {
    role: 'salvage',
    hullPoints: 82,
    fuelCapacity: 155,
    fuelUse: 0.88,
    weaponSlots: 1,
    crewCapacity: 5,
    maxComponentTier: 3,
    cargoMode: 'salvage',
    stations: [...COMMON_STATIONS, { id: 'salvage-control', skill: 'salvage' }],
    componentSlots: slots(1, 0, 0, 1),
  },
  patrol: {
    role: 'patrol',
    hullPoints: 96,
    fuelCapacity: 140,
    fuelUse: 0.98,
    weaponSlots: 3,
    crewCapacity: 5,
    maxComponentTier: 3,
    cargoMode: 'general',
    stations: [...COMMON_STATIONS, { id: 'damage-control', skill: 'engineering' }],
    componentSlots: slots(3, 0, 0, 0),
  },
};
