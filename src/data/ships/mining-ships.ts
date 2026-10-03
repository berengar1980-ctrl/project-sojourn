import type { ShipDefinition, ShipHardpoints } from '../../core/ship-types';
import hardpointsJson from '../../../resources/ships/mining/miner-80m-standard.hardpoints.json';

const miner80mSpriteUrl = new URL(
  '../../../resources/ships/mining/miner-80m-standard.png',
  import.meta.url
).href;

const miner80mHardpoints: ShipHardpoints = hardpointsJson;

export const miner80mStandard: ShipDefinition = {
  id: 'miner-80m-standard',
  name: '80 m Standard Miner',
  role: 'mining',
  nominalLengthMeters: 80,
  sprite: {
    assetUrl: miner80mSpriteUrl,
    widthPx: 346,
    heightPx: 182,
    facing: 'right',
    hardpoints: miner80mHardpoints,
  },
  navigation: {
    cruiseSpeed: 82,
  },
};

export const miningShips: readonly ShipDefinition[] = [miner80mStandard];
