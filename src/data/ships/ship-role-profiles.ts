import type { ShipGameplayProfile, ShipRole, ShipStationDefinition } from '../../core/ship-types';

const COMMON_STATIONS = [
  { id: 'helm', skill: 'piloting' },
  { id: 'sensor_station', skill: 'sensors' },
  { id: 'weapon_station', skill: 'weapons' },
  { id: 'engine_room', skill: 'engineering' },
] as const satisfies readonly ShipStationDefinition[];

const ROLE_PROFILES: Readonly<Record<ShipRole, ShipGameplayProfile>> = {
  freighter: {
    hullPoints: 78,
    shieldModifier: 1,
    fuelCapacity: 150,
    fuelUse: 0.82,
    weaponSlots: 2,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'cargo_control', skill: 'logistics' }],
    specialCargo: null,
  },
  mining: {
    hullPoints: 72,
    shieldModifier: 0.875,
    fuelCapacity: 145,
    fuelUse: 0.86,
    weaponSlots: 1,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'mining_station', skill: 'mining' }],
    specialCargo: { kind: 'mining', capacityTons: 90 },
  },
  salvage: {
    hullPoints: 82,
    shieldModifier: 0.8125,
    fuelCapacity: 155,
    fuelUse: 0.88,
    weaponSlots: 1,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'salvage_control', skill: 'salvage' }],
    specialCargo: { kind: 'salvage', capacityTons: 45 },
  },
  patrol: {
    hullPoints: 96,
    shieldModifier: 1.1875,
    fuelCapacity: 140,
    fuelUse: 0.98,
    weaponSlots: 3,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'damage_control', skill: 'engineering' }],
    specialCargo: null,
  },
};

export function getShipRoleProfile(role: ShipRole): ShipGameplayProfile {
  return ROLE_PROFILES[role];
}
