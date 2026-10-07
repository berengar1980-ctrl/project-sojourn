'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { MapCamera } = loadStandaloneTypeScriptModule(root, 'src/ui/map/map-camera.ts');

const bounds = { minX: -180, minY: -180, maxX: 6380, maxY: 5380 };
const camera = new MapCamera(6200, 5200);

camera.fit(1600, 900, bounds);
assert.equal(camera.getRelativeZoom(), 1, 'initial map fit must start at the minimum zoom');
camera.zoomAt(0.05, { x: 800, y: 450 }, 1600, 900);
assert.equal(camera.getRelativeZoom(), 1, 'initial map must not zoom farther out than fit');

camera.updateViewport(1180, 720, bounds);
assert(
  Math.abs(camera.getRelativeZoom() - 1) < 1e-9,
  'settled viewport must preserve the same fitted minimum zoom'
);
camera.zoomAt(0.05, { x: 590, y: 360 }, 1180, 720);
assert(
  Math.abs(camera.getRelativeZoom() - 1) < 1e-9,
  'returned or resized map must have the same zoom-out limit as startup'
);

camera.zoomAt(2, { x: 590, y: 360 }, 1180, 720);
const beforeResize = camera.getRelativeZoom();
camera.updateViewport(1320, 760, bounds);
assert(
  Math.abs(camera.getRelativeZoom() - beforeResize) < 1e-9,
  'viewport updates must preserve the current relative zoom when already zoomed in'
);

console.log('PASS star-map minimum zoom remains stable across viewport rebuilds');
