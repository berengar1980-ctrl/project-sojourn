'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { NavMapRenderer } = loadStandaloneTypeScriptModule(root, 'src/ui/map/nav-map-renderer.ts');
const calls = [];
const context = new Proxy(
  {},
  {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push({ method: key, args });
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }
);

const renderer = new NavMapRenderer(context);
renderer.drawBackground(500, 400, 10, { x: 140, y: 120 }, 1);
const radarCircles = calls.filter((call) => call.method === 'arc');
assert(radarCircles.length > 0, 'NAV radar should draw concentric circles');
assert.equal(radarCircles[0].args[0], 140);
assert.equal(radarCircles[0].args[1], 120);

calls.length = 0;
renderer.drawBackground(500, 400, 10, { x: 180, y: 150 }, 1);
const pannedCircles = calls.filter((call) => call.method === 'arc');
assert.equal(pannedCircles[0].args[0], 180, 'radar follows horizontal map pan');
assert.equal(pannedCircles[0].args[1], 150, 'radar follows vertical map pan');
assert.equal(pannedCircles[0].args[2], radarCircles[0].args[2]);

calls.length = 0;
renderer.drawBackground(500, 400, 10, { x: 180, y: 150 }, 2);
const zoomedCircles = calls.filter((call) => call.method === 'arc');
assert.equal(zoomedCircles[0].args[2], radarCircles[0].args[2] * 2);

calls.length = 0;
renderer.drawLocation({ kind: 'planet' }, { x: 50, y: 60 }, 20);
assert(
  calls.filter((call) => call.method === 'ellipse').length >= 5,
  'NAV planets must have latitude and longitude grid lines'
);

calls.length = 0;
renderer.drawLocation({ kind: 'station' }, { x: 50, y: 60 }, 15);
assert(
  calls.some((call) => call.method === 'rect'),
  'NAV station should use a schematic vector symbol'
);
console.log('PASS NAV radar follows camera pan and zoom, grid globes and station glyphs');
