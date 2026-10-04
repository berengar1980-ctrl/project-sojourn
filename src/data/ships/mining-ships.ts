import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import industrialHeavyHardpointsJson from './miner-80m-industrial-heavy.hardpoints.json';
import standardHardpointsJson from './miner-80m-standard.hardpoints.json';

const miner80mStandardSpriteUrl = new URL(
  '../../../resources/ships/mining/miner-80m-standard.png',
  import.meta.url
).href;
const miner80mIndustrialHeavySpriteUrl = new URL(
  '../../../resources/ships/mining/miner-80m-industrial-heavy.png',
  import.meta.url
).href;

const miner80mStandardHardpoints: ShipHardpoints = standardHardpointsJson;
const miner80mIndustrialHeavyHardpoints: ShipHardpoints = industrialHeavyHardpointsJson;

export const miner80mStandard: ShipDefinition = {
  id: 'miner-80m-standard',
  name: '80 m Standard Miner',
  role: 'mining',
  nominalLengthMeters: 80,
  cargoCapacityTons: 280,
  sprite: {
    assetUrl: miner80mStandardSpriteUrl,
    widthPx: 346,
    heightPx: 182,
    facing: 'right',
    hardpoints: miner80mStandardHardpoints,
  },
  navigation: {
    cruiseSpeed: 82,
  },
};

export const miner80mIndustrialHeavy: ShipDefinition = {
  id: 'miner-80m-industrial-heavy',
  name: '80 m Industrial Heavy Miner',
  role: 'mining',
  nominalLengthMeters: 80,
  cargoCapacityTons: 360,
  sprite: {
    assetUrl: miner80mIndustrialHeavySpriteUrl,
    widthPx: 346,
    heightPx: 207,
    facing: 'right',
    hardpoints: miner80mIndustrialHeavyHardpoints,
  },
  navigation: {
    cruiseSpeed: 82,
  },
};

export const miningShips: readonly ShipDefinition[] = [miner80mStandard, miner80mIndustrialHeavy];
