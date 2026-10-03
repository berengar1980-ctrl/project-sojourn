'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shipRenderer = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');

assert(shipRenderer.includes('ShipEngineEffectsRenderer'), 'star map must share engine VFX');
assert(
  shipRenderer.includes('ShipManeuverEffectsRenderer'),
  'star map must render maneuver thrusters from navigation state'
);
assert(
  shipRenderer.includes('spriteDrawOffset'),
  'star-map sprite must use shared pivot projection'
);
assert(shipRenderer.includes('drawImage'), 'ship renderer must draw the actual ship sprite');
assert(mapRenderer.includes('drawPlayerShip'), 'star map must render the player ship');
assert(!shipRenderer.includes('currentLocationId ='), 'ship renderer must not mutate navigation');

console.log('PASS player ship shared projection and engine rendering boundary');
