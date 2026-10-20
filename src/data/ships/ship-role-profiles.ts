import type { ShipGameplayProfile, ShipRole, ShipStationDefinition } from '../../core/ship-types';

const COMMON_STATIONS = [
  { id: 'helm', skill: 'piloting' },
  { id: 'sensor_station', skill: 'sensors' },
  { id: 'weapon_station', skill: 'weapons' },
  { id: 'engine_room', skill: 'engineering' },
] as const satisfies readonly ShipStationDefinition[];

const ROLE_PROFILES: Readonly<Record<ShipRole, ShipGameplayProfile>> = {
  freighter: {
    combatBaseSpeed: 69,
    hullPoints: 115,
    shieldModifier: 1,
    fuelCapacity: 150,
    fuelUse: 0.82,
    weaponSlots: 4,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'cargo_control', skill: 'logistics', bonus: 12 }],
    specialCargo: null,
  },
  mining: {
    hullPoints: 72,
    shieldModifier: 0.875,
    fuelCapacity: 145,
    fuelUse: 0.86,
    weaponSlots: 3,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'mining_station', skill: 'mining', bonus: 12 }],
    specialCargo: { kind: 'mining' },
  },
  salvage: {
    hullPoints: 82,
    shieldModifier: 0.8125,
    fuelCapacity: 155,
    fuelUse: 0.88,
    weaponSlots: 3,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [...COMMON_STATIONS, { id: 'salvage_control', skill: 'salvage', bonus: 12 }],
    specialCargo: { kind: 'salvage' },
  },
  patrol: {
    hullPoints: 96,
    shieldModifier: 1.1875,
    fuelCapacity: 140,
    fuelUse: 0.98,
    weaponSlots: 6,
    crewBerths: 5,
    maxComponentTier: 3,
    stations: [
      ...COMMON_STATIONS.map((station) =>
        station.id === 'weapon_station' ? { ...station, bonus: 10 } : station
      ),
      { id: 'damage_control', skill: 'engineering', bonus: 5 },
    ],
    specialCargo: null,
  },
};

export function getShipRoleProfile(role: ShipRole): ShipGameplayProfile {
  return ROLE_PROFILES[role];
}
