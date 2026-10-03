'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const data = fs.readFileSync(path.join(root, 'src/data/maps/tutorial-cluster.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');

assert(data.includes("id: 'solis'"), 'tutorial system needs a central star');
assert(data.includes('star: {'), 'star must be a world object, not a travel location');
assert(data.includes('mine: true'), 'tutorial map needs a mining location');
assert(data.includes('salvage: true'), 'tutorial map needs a salvage location');
assert(data.includes("id: 'red-gap'"), 'tutorial map needs a danger region');
assert(renderer.includes('drawStar'), 'renderer must draw the system star');
assert(renderer.includes('drawOrbits'), 'renderer must support orbital structure');
assert(renderer.includes('class TopdownMapRenderer'), 'top-down renderer missing');
assert(!renderer.includes('locationId ='), 'renderer must not mutate player navigation state');
assert(!panel.includes('<aside'), 'star map must not contain a permanent sidebar');

console.log('PASS production tutorial star-map contract');
