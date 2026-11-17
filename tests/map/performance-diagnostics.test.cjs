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
assert(source('src/app/game-controller-star-map.ts').includes("input.select-location"));
assert(source('src/app/game-controller-star-map.ts').includes("input.start-travel"));
assert(source('src/app/game-controller-fuel-forecast.ts').includes("navigation.fuel-route-plan"));
assert(source('src/app/game-controller-scene-tick.ts').includes("scene.combat.update"));
assert(source('src/app/game-controller-scene-tick.ts').includes("scene.local.model"));
assert(source('src/app/game-controller-salvage.ts').includes("scene.salvage.presentation"));
assert(source('src/ui/map/topdown-map-renderer.ts').includes("canvas.star.draw"));
assert(source('src/ui/local-space/local-space-renderer.ts').includes("canvas.local.draw"));
console.log('PASS opt-in browser performance diagnostics');
