'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'src/systems/ships/index.ts'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/systems/ships/ship-registry.ts'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src/data/ships/mining-ships.ts'), 'utf8');
const asset = path.join(root, 'resources/ships/mining/miner-80m-standard.png');
const hardpointsPath = path.join(root, 'src/data/ships/miner-80m-standard.hardpoints.json');
const hardpoints = JSON.parse(fs.readFileSync(hardpointsPath, 'utf8'));

assert(index.includes('getShipDefinition'), 'ships public API missing');
assert(index.includes('ShipPivot'), 'ships public API must expose pivot type');
assert(registry.includes('miningShips'), 'ship registry must consume ship data');
assert(data.includes("id: 'miner-80m-standard'"), 'first mining ship missing');
assert(data.includes('widthPx: 346'), 'sprite width metadata must match source asset');
assert(data.includes('heightPx: 182'), 'sprite height metadata must match source asset');
assert(data.includes('hardpointsJson'), 'ship definition must load hardpoints from JSON');
assert(fs.existsSync(asset), 'mining ship sprite asset missing');
assert.equal(hardpoints.sourceWidth, 346, 'hardpoint source width must match sprite');
assert.equal(hardpoints.sourceHeight, 182, 'hardpoint source height must match sprite');
assert(hardpoints.pivot, 'ship hardpoint data must define a pivot');
assert(
  hardpoints.pivot.x >= 0 && hardpoints.pivot.x <= hardpoints.sourceWidth,
  'pivot x out of bounds'
);
assert(
  hardpoints.pivot.y >= 0 && hardpoints.pivot.y <= hardpoints.sourceHeight,
  'pivot y out of bounds'
);
assert.equal(hardpoints.engines.length, 2, 'miner must define two engine hardpoints');
assert.equal(hardpoints.miningLasers.length, 2, 'miner must define two mining laser hardpoints');
assert.equal(
  hardpoints.maneuverThrusters.length,
  4,
  'miner must define four maneuver thrusters'
);
assert.equal(hardpoints.engines[0].x, 23, 'upper engine hardpoint must match calibrated nozzle');
assert.equal(hardpoints.engines[1].x, 23, 'lower engine hardpoint must match calibrated nozzle');
assert.equal(hardpoints.miningLasers[0].x, 329, 'upper laser hardpoint must match emitter tip');
assert.equal(hardpoints.miningLasers[1].x, 329, 'lower laser hardpoint must match emitter tip');
assert(hardpoints.shield, 'ship hardpoint data must define shield geometry');
assert(hardpoints.shield.radiusX > 0, 'shield must define horizontal radius');
assert(hardpoints.shield.radiusY > 0, 'shield must define vertical radius');
for (const hardpoint of [
  ...hardpoints.engines,
  ...hardpoints.miningLasers,
  ...hardpoints.maneuverThrusters,
]) {
  assert(hardpoint.width > 0, 'every hardpoint must define a positive width');
}
for (const thruster of hardpoints.maneuverThrusters) {
  assert(Number.isFinite(thruster.forceX), 'maneuver thruster must define forceX');
  assert(Number.isFinite(thruster.forceY), 'maneuver thruster must define forceY');
}

console.log('PASS ships module, sprite, JSON pivot, hardpoints and shield geometry');
