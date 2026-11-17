'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const diagnostics = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-performance-diagnostics.ts'
);
const value = diagnostics.measurePerformance('test.operation', () => 42);
assert.equal(value, 42);
assert.deepEqual(diagnostics.performanceReport(), []);
assert.throws(
  () =>
    diagnostics.measurePerformance('test.exception', () => {
      throw new Error('expected');
    }),
  /expected/
);

const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const has = (file, fragment) => source(file).includes(fragment);
assert(has('src/app/game-controller-star-map.ts', 'input.select-location'));
assert(has('src/app/game-controller-star-map.ts', 'input.start-travel'));
assert(has('src/app/game-controller-fuel-forecast.ts', 'navigation.fuel-route-plan'));
assert(has('src/app/game-controller-scene-tick.ts', 'scene.combat.update'));
assert(has('src/app/game-controller-scene-tick.ts', 'scene.local.model'));
assert(has('src/app/game-controller-salvage.ts', 'scene.salvage.presentation'));
assert(has('src/ui/map/topdown-map-renderer.ts', 'canvas.star.draw'));
assert(has('src/ui/local-space/local-space-renderer.ts', 'canvas.local.draw'));
console.log('PASS opt-in browser performance diagnostics');
