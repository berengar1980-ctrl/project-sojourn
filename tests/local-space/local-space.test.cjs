'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const generator = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-generator.ts'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);

assert(generator.includes('seed'), 'local-space generator must be seed-driven');
assert(
  generator.includes('createAsteroids'),
  'local-space generator must create asteroid entities'
);
assert(service.includes('startMining'), 'local-space service must expose mining start');
assert(service.includes('updateApproach'), 'mining must include ship approach');
assert(service.includes('spawnChunk'), 'mining must break resource chunks from asteroids');
assert(service.includes('tractorActive'), 'mining chunks must enter tractor collection');
assert(!service.includes('Canvas'), 'local-space simulation must stay renderer-independent');
assert(!service.includes('document.'), 'local-space simulation must stay DOM-independent');

console.log('PASS local-space generation and mining ownership');
