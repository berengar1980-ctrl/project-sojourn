import type { NpcEconomyState } from '../../core/economy-types';

export function createTutorialNpcEconomyStates(): NpcEconomyState[] {
  return [
    {
      id: 'npc-trader-helix',
      role: 'trader',
      locationId: 'haven',
      credits: 18000,
      cargoCapacity: 48,
      cargo: {},
      workResourceIds: [],
    },
    {
      id: 'npc-miner-rusk',
      role: 'miner',
      locationId: 'karth-forge',
      credits: 9500,
      cargoCapacity: 56,
      cargo: {},
      workResourceIds: ['ferrite', 'cuprium', 'cobaltite', 'rare-metals'],
    },
    {
      id: 'npc-salvager-varda',
      role: 'salvager',
      locationId: 'coldwater-station',
      credits: 7200,
      cargoCapacity: 42,
      cargo: {},
      workResourceIds: ['spare-parts', 'ship-parts', 'ferrite'],
    },
  ];
}
