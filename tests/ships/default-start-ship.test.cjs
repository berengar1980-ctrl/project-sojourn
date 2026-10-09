'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const bootstrap = fs.readFileSync(path.join(root, 'src/app/bootstrap.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(bootstrap.includes("getShipDefinition('salvage-100m-variant-01')"),
  'new games must start with the salvager V1');
assert(controller.includes("state.activeShip.role === 'salvage'"),
  'initial world events must use the role of the actual starting ship');
console.log('PASS 100m salvager V1 is the starting ship with salvage event eligibility');
