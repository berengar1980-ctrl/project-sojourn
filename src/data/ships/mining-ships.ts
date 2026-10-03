import type { ShipDefinition } from '../../core/ship-types';

const miner80mSpriteUrl = new URL(
  '../../../resources/ships/mining/miner-80m-standard.png',
  import.meta.url
).href;

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
    engineAnchors: [
      { x: 0.055, y: 0.335 },
      { x: 0.055, y: 0.665 },
    ],
  },
  navigation: {
    cruiseSpeed: 82,
  },
};

export const miningShips: readonly ShipDefinition[] = [miner80mStandard];
