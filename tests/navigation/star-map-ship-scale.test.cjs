'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const scale = loadStandaloneTypeScriptModule(root, 'src/ui/map/map-visual-scale.ts');
const player = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const npc = fs.readFileSync(path.join(root, 'src/ui/map/npc-ship-map-renderer.ts'), 'utf8');

assert(
  player.includes('starMapShipWidth(ship.nominalLengthMeters, relativeZoom)'),
  'player star-map ships must use the shared scale'
);
assert(
  npc.includes('starMapShipWidth(npc.nominalLengthMeters, zoom)'),
  'NPC star-map ships must use the same shared scale'
);
assert(
  scale.starMapShipWidth(80, 1) >= 18,
  '80m ships must be larger than the old 15px player sprite'
);
assert(
  scale.starMapShipWidth(120, 1) > scale.starMapShipWidth(60, 1),
  'shared scaling must preserve meaningful physical size differences'
);

console.log('PASS shared enlarged star-map ship scale');
