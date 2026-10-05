'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { mapLocationVisualRadius } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/map/map-visual-scale.ts'
);

const smallestPlanet = mapLocationVisualRadius('planet', 22);
const largestPlanet = mapLocationVisualRadius('planet', 92);
const smallestMoon = mapLocationVisualRadius('moon', 8);
const largestMoon = mapLocationVisualRadius('moon', 20);

assert(
  largestPlanet / smallestPlanet >= 4,
  'sector overview must preserve strong visual size differences between planets'
);
assert(
  largestMoon / smallestMoon >= 2,
  'sector overview must preserve clearly different moon sizes'
);
assert(
  smallestMoon < smallestPlanet,
  'small moons must remain visually smaller than even small planets'
);
assert.equal(
  mapLocationVisualRadius('planet', 500),
  70,
  'planet symbols still need a readability cap'
);
assert.equal(
  mapLocationVisualRadius('station', 24),
  17,
  'stations must remain compact compared with planetary bodies'
);

console.log('PASS star-map body size hierarchy');
