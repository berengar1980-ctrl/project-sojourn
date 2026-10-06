import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import industrialHeavyHardpointsJson from './freighter-120m-industrial-heavy.hardpoints.json';

const freighter120mIndustrialHeavySpriteUrl = new URL(
  '../../../resources/ships/freighter/freighter-120m-industrial-heavy.png',
  import.meta.url
).href;

const freighter120mIndustrialHeavyHardpoints: ShipHardpoints = industrialHeavyHardpointsJson as ShipHardpoints;

export const freighter120mIndustrialHeavy: ShipDefinition = {
  id: 'freighter-120m-industrial-heavy',
  name: '120 m Industrial Heavy Freighter',
  role: 'freighter',
  nominalLengthMeters: 120,
  cargoCapacityTons: 900,
  sprite: {
    assetUrl: freighter120mIndustrialHeavySpriteUrl,
    widthPx: 518,
    heightPx: 167,
    facing: 'right',
    hardpoints: freighter120mIndustrialHeavyHardpoints,
  },
  navigation: {
    cruiseSpeed: 220,
  },
};

export const freighterShips: readonly ShipDefinition[] = [freighter120mIndustrialHeavy];
