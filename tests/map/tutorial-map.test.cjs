'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const data = fs.readFileSync(path.join(root, 'src/data/maps/tutorial-cluster.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app/bootstrap.ts'), 'utf8');

for (const id of [
  'haven',
  'karth-forge',
  'greyrock-belt',
  'coldwater-station',
  'drift-wreck',
  'saint-vela',
  'blackjaw-outpost',
]) {
  assert(data.includes(`id: '${id}'`), `tutorial map missing ${id}`);
}

assert(data.includes('mine: true'), 'tutorial map needs a mining location');
assert(data.includes('salvage: true'), 'tutorial map needs a salvage location');
assert(data.includes("id: 'red-gap'"), 'tutorial map needs a danger region');
assert(renderer.includes('class TopdownMapRenderer'), 'top-down renderer missing');
assert(renderer.includes('pickLocation'), 'renderer must expose picking without owning gameplay');
assert(!renderer.includes('locationId ='), 'renderer must not mutate player navigation state');
assert(app.includes('createStarMapViewModel'), 'app must compose map through a view model');

console.log('PASS tutorial star-map contract');
