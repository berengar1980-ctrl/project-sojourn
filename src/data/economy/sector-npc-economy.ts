import type { EconomyResourceId } from '../../core/economy-types';
import type { NpcJob, SectorNpcState } from '../../core/npc-types';
import { freighterVariantShips } from '../ships/freighter-variant-ships';
import { minerVariantShips } from '../ships/miner-variant-ships';
import { patrolVariantShips } from '../ships/patrol-variant-ships';
import { salvageVariantShips } from '../ships/salvage-variant-ships';
import { getShipRoleProfile } from '../ships/ship-role-profiles';

const CAPTAINS = [
  'Acastus Avern',
  'Berren Brax',
  'Caldus Cordael',
  'Drustan Drayk',
  'Edrik Eisen',
  'Faustus Ferrox',
  'Galen Gault',
  'Hadric Hadran',
  'Isen Iscor',
  'Jorvan Jex',
  'Kaelus Karsk',
  'Lucan Lorn',
  'Mordec Mordane',
  'Nican Nex',
  'Orren Orsik',
  'Perrin Prax',
  'Quint Quell',
  'Roderic Rath',
  'Stavan Stahl',
  'Tiber Tervan',
  'Ulric Urix',
  'Valen Valk',
  'Wulfric Weyland',
  'Xavian Xerxes',
] as const;

const JOBS: readonly NpcJob[] = [
  'freighter',
  'freighter',
  'miner',
  'salvager',
  'freighter',
  'patrol',
  'freighter',
  'miner',
  'freighter',
  'salvager',
  'freighter',
  'patrol',
  'miner',
  'freighter',
  'salvager',
  'miner',
  'freighter',
  'patrol',
  'freighter',
  'miner',
  'salvager',
  'freighter',
  'patrol',
  'freighter',
];

const TRADE_HOMES = [
  'haven',
  'meridian-exchange',
  'verdant',
  'karth-industrial',
  'helix-shipyards',
  'crown',
  'eidolon',
  'coldwater-station',
] as const;

const MINING_JOBS = [
  {
    locationId: 'karth-industrial',
    workLocationId: 'copper-crown-field',
    resources: ['cuprium', 'kharvium', 'cobaltite'],
  },
  {
    locationId: 'niveus',
    workLocationId: 'greyrock-belt',
    resources: ['ferrite', 'silicite', 'carbon', 'sulfur'],
  },
  {
    locationId: 'crown',
    workLocationId: 'deadlight-belt',
    resources: ['iridite', 'volucrium', 'rare-metals'],
  },
  {
    locationId: 'coldwater-station',
    workLocationId: 'frostline-belt',
    resources: ['silicite', 'iridite', 'rare-metals'],
  },
  {
    locationId: 'haven',
    workLocationId: 'outer-shards',
    resources: ['elydrase', 'orvessium', 'cyranthite', 'rare-metals'],
  },
] as const;

const SALVAGE_JOBS = [
  {
    locationId: 'coldwater-station',
    workLocationId: 'drift-wreck',
    resources: ['spare-parts', 'ship-parts', 'ferrite'],
  },
  {
    locationId: 'meridian-exchange',
    workLocationId: 'sargasso-graveyard',
    resources: ['machine-parts', 'electronics', 'steel'],
  },
  {
    locationId: 'haven',
    workLocationId: 'kestrel-breaker',
    resources: ['machine-parts', 'ship-parts', 'steel'],
  },
  {
    locationId: 'ilex',
    workLocationId: 'ilex',
    resources: ['spare-parts', 'electronics', 'ferrite'],
  },
] as const;

const PATROL_HOMES = ['vigil-station', 'haven', 'karth-industrial', 'coldwater-station'] as const;

const PIRATE_NAMES = [
  'Azrael Crovus',
  'Borsk Dhal',
  'Cairn Eshkar',
  'Dagan Frayne',
  'Ezek Vargos',
  'Fenric Ghor',
  'Gideon Hrax',
  'Havel Jurn',
  'Ishar Krail',
] as const;

const PIRATE_HOMES = {
  pirates: 'blackjaw-outpost',
  pirates2: 'gallows-anchor',
} as const;

function shipForJob(job: NpcJob, index: number) {
  const list =
    job === 'freighter'
      ? freighterVariantShips
      : job === 'miner'
        ? minerVariantShips
        : job === 'salvager'
          ? salvageVariantShips
          : patrolVariantShips;
  return list[index % list.length]!;
}

function activityFor(job: NpcJob): string {
  if (job === 'freighter') return 'Handel / Liegezeit';
  if (job === 'miner') return 'Wartet auf Förderauftrag';
  if (job === 'salvager') return 'Wartet auf Bergungsauftrag';
  if (job === 'pirate') return 'Auf Beutezug';
  return 'Sicherheitspatrouille';
}

export function createSectorNpcEconomyStates(): SectorNpcState[] {
  let minerIndex = 0;
  let salvageIndex = 0;
  let patrolIndex = 0;
  let freighterIndex = 0;

  const civilians = JOBS.map((job, index) => {
    const ship = shipForJob(job, index);
    const profile = getShipRoleProfile(ship.role);
    let locationId: string;
    let workLocationId: string | undefined;
    let workResourceIds: readonly EconomyResourceId[] = [];

    if (job === 'miner') {
      const work = MINING_JOBS[minerIndex++ % MINING_JOBS.length]!;
      locationId = work.locationId;
      workLocationId = work.workLocationId;
      workResourceIds = work.resources;
    } else if (job === 'salvager') {
      const work = SALVAGE_JOBS[salvageIndex++ % SALVAGE_JOBS.length]!;
      locationId = work.locationId;
      workLocationId = work.workLocationId;
      workResourceIds = work.resources;
    } else if (job === 'patrol') {
      locationId = PATROL_HOMES[patrolIndex++ % PATROL_HOMES.length]!;
    } else {
      locationId = TRADE_HOMES[freighterIndex++ % TRADE_HOMES.length]!;
    }

    return {
      id: `npc-${String(index + 1).padStart(2, '0')}`,
      name: CAPTAINS[index]!,
      role: job,
      job,
      shipId: ship.id,
      locationId,
      credits: 3000000 + (index % 7) * 900000,
      cargoCapacity: ship.cargoCapacityTons,
      normalCargoCapacity:
        job === 'miner' || job === 'salvager'
          ? Math.max(20, Math.round(ship.cargoCapacityTons * 0.35))
          : ship.cargoCapacityTons,
      cargo: {},
      marketIntel: {},
      workResourceIds,
      ...(workLocationId ? { workLocationId } : {}),
      fuel: profile.fuelCapacity,
      fuelCapacity: profile.fuelCapacity,
      fuelUse: profile.fuelUse,
      hullHp: profile.hullPoints,
      hullMaxHp: profile.hullPoints,
      aggression: (index * 23 + 17) % 100,
      workRiskPreference: ((index * 23 + 17) % 100) >= 50 ? 'risky' : 'safe',
      activityId: job === 'patrol' ? 'patrol' : 'dock',
      activity: activityFor(job),
      factionId: 'civilian',
      successfulRuns: 0,
    };
  });

  const pirates = PIRATE_NAMES.map((name, index): SectorNpcState => {
    const factionId = index < 5 ? 'pirates' : 'pirates2';
    const ship = patrolVariantShips[index % patrolVariantShips.length]!;
    const profile = getShipRoleProfile(ship.role);
    return {
      id: `pirate-${String(index + 1).padStart(2, '0')}`,
      name,
      role: 'patrol',
      job: 'pirate',
      shipId: ship.id,
      locationId: PIRATE_HOMES[factionId],
      credits: 700000 + (index % 4) * 450000,
      cargoCapacity: ship.cargoCapacityTons,
      normalCargoCapacity: ship.cargoCapacityTons,
      cargo: {},
      marketIntel: {},
      workResourceIds: [],
      fuel: profile.fuelCapacity,
      fuelCapacity: profile.fuelCapacity,
      fuelUse: profile.fuelUse,
      hullHp: profile.hullPoints,
      hullMaxHp: profile.hullPoints,
      aggression: 75 + ((index * 11 + 7) % 25),
      factionId,
      pirate: true,
      pirateMark: factionId === 'pirates' ? 'broken-spear' : 'black-tide',
      pirateHuntCycles: 2 + (index % 5),
      workRiskPreference: 'risky',
      activityId: 'raiding',
      activity: 'Auf Beutezug',
      successfulRuns: 0,
    };
  });

  return [...civilians, ...pirates];
}
