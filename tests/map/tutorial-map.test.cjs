'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const data = fs.readFileSync(path.join(root, 'src/data/maps/narrows-sector.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');

assert(data.includes("id: 'solis'"), 'sector needs a central star');
assert(data.includes('star: {'), 'star must be a world object, not a travel location');
assert(data.includes("planetBiome: 'scorched'"), 'inner system needs scorched rocky worlds');
assert(data.includes("planetBiome: 'desert'"), 'inner system needs desert worlds');
assert(data.includes("planetBiome: 'temperate'"), 'habitable band needs temperate worlds');
assert(data.includes("planetBiome: 'ice'"), 'outer system needs ice worlds');
assert(data.includes("kind: 'moon'"), 'sector must contain moons');
assert(
  data.includes("parentLocationId: 'karth-forge'"),
  'moons and orbital sites need parent bodies'
);
assert(data.includes('mine: true'), 'sector needs mining locations');
assert(data.includes('salvage: true'), 'sector needs salvage locations');
assert(data.includes("id: 'blackjaw-outpost'"), 'sector needs a pirate port');
assert(data.includes("id: 'gallows-anchor'"), 'sector needs more than one pirate port');
assert(data.includes("id: 'red-gap'"), 'sector needs a danger region');
assert(renderer.includes('drawStar'), 'renderer must draw the system star');
assert(renderer.includes('drawOrbits'), 'renderer must support orbital structure');
assert(
  renderer.includes('location.parentLocationId'),
  'renderer must draw moon and station orbits around parent bodies'
);
assert(renderer.includes('class TopdownMapRenderer'), 'top-down renderer missing');
assert(!renderer.includes('locationId ='), 'renderer must not mutate player navigation state');
assert(panel.includes("'WERFT'"), 'star map must identify shipyard locations');
assert(!panel.includes('<aside'), 'star map must not contain a permanent sidebar');

console.log('PASS expanded sector star-map contract');
