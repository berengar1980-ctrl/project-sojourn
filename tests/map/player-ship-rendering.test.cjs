'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shipRenderer = fs.readFileSync(path.join(root, 'src/ui/map/player-ship-renderer.ts'), 'utf8');
const mapRenderer = fs.readFileSync(path.join(root, 'src/ui/map/topdown-map-renderer.ts'), 'utf8');
const mapInput = fs.readFileSync(path.join(root, 'src/ui/map/star-map-input.ts'), 'utf8');
const mapPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');

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
assert(shipRenderer.includes('const BASE_SHIP_WIDTH = 32;'), 'star-map ship must stay compact');
assert(
  shipRenderer.includes('updateIdleStationKeeping'),
  'stationary star-map ship must reuse local-space station keeping'
);
assert(
  shipRenderer.includes(
    'const idle = ship.isTravelling ? null : this.updateIdleShip(ship, timeSeconds);'
  ),
  'star-map idle drift must remain presentation-only'
);
assert(
  shipRenderer.includes('createIdleStationKeepingState'),
  'star map must share the exact idle state initializer with local space'
);
assert(
  shipRenderer.includes('ShipHardpointDebugRenderer'),
  'star-map ship must support hardpoint calibration'
);
assert(
  mapRenderer.includes('toggleHardpointDebug'),
  'star-map renderer must expose hardpoint debug toggling'
);
assert(mapInput.includes("event.key.toLowerCase() === 'h'"), 'H must toggle star-map hardpoints');
assert(mapRenderer.includes('drawPlayerShip'), 'star map must render the player ship');
assert(
  mapPanel.includes('createSystemLogPanel'),
  'star map must render the shared system log'
);
assert(
  mapPanel.includes("placementClass: 'star-system-log'"),
  'star map must use its own shared-log placement'
);
assert(!shipRenderer.includes('currentLocationId ='), 'ship renderer must not mutate navigation');

console.log('PASS player ship shared projection and engine rendering boundary');
