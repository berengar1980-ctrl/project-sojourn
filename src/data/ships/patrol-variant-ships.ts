import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import hardpoints1 from './patrol-60m-variant-01.hardpoints.json';
import hardpoints2 from './patrol-60m-variant-02.hardpoints.json';
import hardpoints3 from './patrol-60m-variant-03.hardpoints.json';
import hardpoints4 from './patrol-60m-variant-04.hardpoints.json';
import hardpoints5 from './patrol-60m-variant-05.hardpoints.json';
import hardpoints6 from './patrol-60m-variant-06.hardpoints.json';
import hardpoints7 from './patrol-60m-variant-07.hardpoints.json';

export const patrolVariantShips: readonly ShipDefinition[] = [
  {
    id: 'patrol-60m-variant-01',
    name: '60 m Patrol V1',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-01.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 171,
      facing: 'right',
      hardpoints: hardpoints1 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-02',
    name: '60 m Patrol V2',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-02.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 174,
      facing: 'right',
      hardpoints: hardpoints2 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-03',
    name: '60 m Patrol V3',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-03.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 180,
      facing: 'right',
      hardpoints: hardpoints3 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-04',
    name: '60 m Patrol V4',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-04.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 164,
      facing: 'right',
      hardpoints: hardpoints4 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-05',
    name: '60 m Patrol V5',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-05.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 173,
      facing: 'right',
      hardpoints: hardpoints5 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-06',
    name: '60 m Patrol V6',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-06.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 165,
      facing: 'right',
      hardpoints: hardpoints6 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'patrol-60m-variant-07',
    name: '60 m Patrol V7',
    role: 'patrol',
    nominalLengthMeters: 60,
    cargoCapacityTons: 120,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/patrol/patrol-60m-variant-07.png',
        import.meta.url
      ).href,
      widthPx: 260,
      heightPx: 171,
      facing: 'right',
      hardpoints: hardpoints7 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
];
