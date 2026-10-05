import type { ShipDefinition } from '../../core/ship-types';
import hardpoints1 from './freighter-120m-variant-01.hardpoints.json';
import hardpoints2 from './freighter-120m-variant-02.hardpoints.json';
import hardpoints3 from './freighter-120m-variant-03.hardpoints.json';
import hardpoints4 from './freighter-120m-variant-04.hardpoints.json';
import hardpoints5 from './freighter-120m-variant-05.hardpoints.json';
import hardpoints6 from './freighter-120m-variant-06.hardpoints.json';
import hardpoints7 from './freighter-120m-variant-07.hardpoints.json';

export const freighterVariantShips: readonly ShipDefinition[] = [
  {
    id: 'freighter-120m-variant-01',
    name: '120 m Freighter V1',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-01.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 324,
      facing: 'right',
      hardpoints: hardpoints1,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-02',
    name: '120 m Freighter V2',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-02.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 331,
      facing: 'right',
      hardpoints: hardpoints2,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-03',
    name: '120 m Freighter V3',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-03.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 322,
      facing: 'right',
      hardpoints: hardpoints3,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-04',
    name: '120 m Freighter V4',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-04.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 330,
      facing: 'right',
      hardpoints: hardpoints4,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-05',
    name: '120 m Freighter V5',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-05.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 337,
      facing: 'right',
      hardpoints: hardpoints5,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-06',
    name: '120 m Freighter V6',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-06.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 315,
      facing: 'right',
      hardpoints: hardpoints6,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'freighter-120m-variant-07',
    name: '120 m Freighter V7',
    role: 'freighter',
    nominalLengthMeters: 120,
    cargoCapacityTons: 900,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/freighter/freighter-120m-variant-07.png',
        import.meta.url
      ).href,
      widthPx: 518,
      heightPx: 324,
      facing: 'right',
      hardpoints: hardpoints7,
    },
    navigation: { cruiseSpeed: 220 },
  },
];
