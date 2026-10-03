'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shipRenderer = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(shipRenderer.includes('drawEngineGlow'), 'ship renderer must provide engine glow');
assert(shipRenderer.includes('drawImage'), 'ship renderer must draw the actual ship sprite');
assert(shipRenderer.includes('source.pivot.x'), 'ship sprite must rotate around JSON pivot');
assert(shipRenderer.includes('source.pivot.y'), 'ship sprite must use vertical JSON pivot');
assert(mapRenderer.includes('drawPlayerShip'), 'star map must render the player ship');
assert(!shipRenderer.includes('currentLocationId ='), 'ship renderer must not mutate navigation');

console.log('PASS player ship pivot rendering boundary');
