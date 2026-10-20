import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import hardpoints1 from './salvage-100m-variant-01.hardpoints.json';
import hardpoints2 from './salvage-100m-variant-02.hardpoints.json';
import hardpoints3 from './salvage-100m-variant-03.hardpoints.json';
import hardpoints4 from './salvage-100m-variant-04.hardpoints.json';
import hardpoints5 from './salvage-100m-variant-05.hardpoints.json';
import hardpoints6 from './salvage-100m-variant-06.hardpoints.json';
import hardpoints7 from './salvage-100m-variant-07.hardpoints.json';

export const salvageVariantShips: readonly ShipDefinition[] = [
  {
    id: 'salvage-100m-variant-01',
    name: '100 m Salvager V1',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-01.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 298,
      facing: 'right',
      hardpoints: hardpoints1 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-02',
    name: '100 m Salvager V2',
    role: 'salvage',
    gameplayOverrides: { stationBonuses: { salvage_control: 6, sensor_station: 8 } },
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-02.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 290,
      facing: 'right',
      hardpoints: hardpoints2 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-03',
    name: '100 m Salvager V3',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-03.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 295,
      facing: 'right',
      hardpoints: hardpoints3 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-04',
    name: '100 m Salvager V4',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-04.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 302,
      facing: 'right',
      hardpoints: hardpoints4 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-05',
    name: '100 m Salvager V5',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-05.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 282,
      facing: 'right',
      hardpoints: hardpoints5 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-06',
    name: '100 m Salvager V6',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-06.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 278,
      facing: 'right',
      hardpoints: hardpoints6 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
  {
    id: 'salvage-100m-variant-07',
    name: '100 m Salvager V7',
    role: 'salvage',
    nominalLengthMeters: 100,
    cargoCapacityTons: 500,
    sprite: {
      assetUrl: new URL(
        '../../../resources/ships/salvage/salvage-100m-variant-07.png',
        import.meta.url
      ).href,
      widthPx: 432,
      heightPx: 299,
      facing: 'right',
      hardpoints: hardpoints7 as ShipHardpoints,
    },
    navigation: { cruiseSpeed: 220 },
  },
];
