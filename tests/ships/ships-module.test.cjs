'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'src/systems/ships/index.ts'), 'utf8');
const registry = fs.readFileSync(
  path.join(root, 'src/systems/ships/ship-registry.ts'),
  'utf8'
);
const data = fs.readFileSync(path.join(root, 'src/data/ships/mining-ships.ts'), 'utf8');
const asset = path.join(root, 'resources/ships/mining/miner-80m-standard.png');

assert(index.includes('getShipDefinition'), 'ships public API missing');
assert(registry.includes('miningShips'), 'ship registry must consume ship data');
assert(data.includes("id: 'miner-80m-standard'"), 'first mining ship missing');
assert(data.includes('widthPx: 346'), 'sprite width metadata must match source asset');
assert(data.includes('heightPx: 182'), 'sprite height metadata must match source asset');
assert(fs.existsSync(asset), 'mining ship sprite asset missing');

console.log('PASS ships module and first mining ship');
