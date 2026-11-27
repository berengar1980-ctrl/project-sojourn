'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { AsteroidFieldWorld } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/operations/asteroid-field-world.ts'
);

// Exercise the actual scheduler without generating unrelated field geometry.
const world = Object.create(AsteroidFieldWorld.prototype);
world.fields = new Map(['a', 'b', 'c'].map((id) => [id, { locationId: id }]));
world.backgroundAccumulator = 0;
const steps = [];
const tick = (dt, active) =>
  world.tick(dt, active, (field, seconds) => {
    steps.push([field.locationId, seconds]);
  });
const batch = (ids) =>
  ids.flatMap((id) => Array.from({ length: 4 }, () => [id, 0.0625]));

tick(0.125, 'b');
assert.deepEqual(steps.splice(0), [['b', 0.08]]);
tick(0.125, 'b');
assert.deepEqual(steps.splice(0), [['b', 0.08], ...batch(['a', 'c'])]);
assert.equal(world.backgroundAccumulator, 0);

tick(0.125, null);
assert.deepEqual(steps.splice(0), []);
tick(0.125, 'a');
assert.deepEqual(steps.splice(0), [['a', 0.08], ...batch(['b', 'c'])]);
tick(0, null);
assert.deepEqual(steps.splice(0), []);
tick(1, null);
assert.deepEqual(steps.splice(0), batch(['a', 'b', 'c']));
assert.equal(world.backgroundAccumulator, 0);

console.log('PASS field scheduler order, bounded steps and active-scene ownership');
