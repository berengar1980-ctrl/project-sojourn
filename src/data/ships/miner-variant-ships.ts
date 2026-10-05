import type { ShipDefinition } from '../../core/ship-types';
import hardpoints1 from './miner-80m-variant-01.hardpoints.json';
import hardpoints2 from './miner-80m-variant-02.hardpoints.json';
import hardpoints3 from './miner-80m-variant-03.hardpoints.json';
import hardpoints4 from './miner-80m-variant-04.hardpoints.json';
import hardpoints5 from './miner-80m-variant-05.hardpoints.json';
import hardpoints6 from './miner-80m-variant-06.hardpoints.json';
import hardpoints7 from './miner-80m-variant-07.hardpoints.json';

export const minerVariantShips: readonly ShipDefinition[] = [
  {
    id: 'miner-80m-variant-01',
    name: '80 m Miner V1',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-01.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 215,
      facing: 'right',
      hardpoints: hardpoints1,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-02',
    name: '80 m Miner V2',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-02.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 213,
      facing: 'right',
      hardpoints: hardpoints2,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-03',
    name: '80 m Miner V3',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-03.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 213,
      facing: 'right',
      hardpoints: hardpoints3,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-04',
    name: '80 m Miner V4',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-04.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 236,
      facing: 'right',
      hardpoints: hardpoints4,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-05',
    name: '80 m Miner V5',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-05.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 201,
      facing: 'right',
      hardpoints: hardpoints5,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-06',
    name: '80 m Miner V6',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-06.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 231,
      facing: 'right',
      hardpoints: hardpoints6,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'miner-80m-variant-07',
    name: '80 m Miner V7',
    role: 'mining',
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: new URL('../../../resources/ships/mining/miner-80m-variant-07.png', import.meta.url).href,
      widthPx: 346,
      heightPx: 223,
      facing: 'right',
      hardpoints: hardpoints7,
    },
    navigation: { cruiseSpeed: 220 },
  },
];
