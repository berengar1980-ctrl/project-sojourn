'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const index = fs.readFileSync(path.join(root, 'src/systems/ships/index.ts'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/systems/ships/ship-registry.ts'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src/data/ships/mining-ships.ts'), 'utf8');
const freighterData = fs.readFileSync(
  path.join(root, 'src/data/ships/freighter-ships.ts'),
  'utf8'
);
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

function loadHardpoints(baseName) {
  const filePath = path.join(root, 'src/data/ships', baseName + '.hardpoints.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertHardpoints(hardpoints, width, height) {
  assert.equal(hardpoints.sourceWidth, width, 'hardpoint source width must match sprite');
  assert.equal(hardpoints.sourceHeight, height, 'hardpoint source height must match sprite');
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
  assert.equal(hardpoints.maneuverThrusters.length, 4, 'miner must define four maneuver thrusters');
  assert(hardpoints.shield, 'ship hardpoint data must define shield geometry');
  assert(hardpoints.shield.radiusX > 0, 'shield must define horizontal radius');
  assert(hardpoints.shield.radiusY > 0, 'shield must define vertical radius');
  assert.equal(hardpoints.shield.maxHp, 100, 'starter shield must have 100 HP');
  assert.equal(hardpoints.shield.modifier, 1, 'starter shield modifier must be 1');

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
}

const standardAsset = path.join(root, 'resources/ships/mining/miner-80m-standard.png');
const industrialAsset = path.join(root, 'resources/ships/mining/miner-80m-industrial-heavy.png');
const freighterAsset = path.join(
  root,
  'resources/ships/freighter/freighter-120m-industrial-heavy.png'
);
const standardHardpoints = loadHardpoints('miner-80m-standard');
const industrialHardpoints = loadHardpoints('miner-80m-industrial-heavy');
const freighterHardpoints = loadHardpoints('freighter-120m-industrial-heavy');

assert(index.includes('getShipDefinition'), 'ships public API missing');
assert(index.includes('ShipPivot'), 'ships public API must expose pivot type');
assert(registry.includes('miningShips'), 'ship registry must consume mining ship data');
assert(registry.includes('freighterShips'), 'ship registry must consume freighter ship data');
assert(
  controller.includes('getShipDefinition(shipId)') && controller.includes('activeShip = nextShip'),
  'test ship switcher must resolve a complete ship definition by stable id'
);
assert(
  controller.includes('hardpoints: ship.sprite.hardpoints'),
  'local-space creation must consume the selected ship hardpoint JSON'
);
assert(
  controller.includes('navigation.setCruiseSpeed(nextShip.navigation.cruiseSpeed)'),
  'ship switching must apply navigation stats from the selected definition'
);

assert(data.includes("id: 'miner-80m-standard'"), 'standard mining ship missing');
assert(data.includes("id: 'miner-80m-industrial-heavy'"), 'industrial mining ship missing');
assert(
  data.includes('cargoCapacityTons: 280') && data.includes('cargoCapacityTons: 360'),
  'registered miners must define explicit cargo capacity'
);
assert.equal(
  (data.match(/cruiseSpeed: 220/g) ?? []).length,
  2,
  'registered miners must use the fast strategic cruise speed'
);
assert(
  data.includes("import standardHardpointsJson from './miner-80m-standard.hardpoints.json'"),
  'standard miner must load its own hardpoint JSON'
);
assert(
  data.includes(
    "import industrialHeavyHardpointsJson from './miner-80m-industrial-heavy.hardpoints.json'"
  ),
  'industrial miner must load its own hardpoint JSON'
);
assert(fs.existsSync(standardAsset), 'standard mining ship sprite asset missing');
assert(fs.existsSync(industrialAsset), 'industrial mining ship sprite asset missing');
assert(fs.existsSync(freighterAsset), 'industrial freighter sprite asset missing');
assert(
  freighterData.includes("id: 'freighter-120m-industrial-heavy'") &&
    freighterData.includes("role: 'freighter'") &&
    freighterData.includes('nominalLengthMeters: 120') &&
    freighterData.includes('cargoCapacityTons: 900'),
  '120 m industrial freighter must be a registered selectable ship'
);

assertHardpoints(standardHardpoints, 346, 182);
assertHardpoints(industrialHardpoints, 346, 207);
assert.equal(freighterHardpoints.sourceWidth, 518, 'freighter hardpoint width must match asset');
assert.equal(freighterHardpoints.sourceHeight, 167, 'freighter hardpoint height must match asset');
assert.equal(freighterHardpoints.engines.length, 3, 'freighter must define three engine hardpoints');
assert.equal(
  freighterHardpoints.miningLasers.length,
  0,
  'freighter must not expose mining laser hardpoints'
);
assert.equal(
  freighterHardpoints.maneuverThrusters.length,
  4,
  'freighter must define four maneuver thrusters'
);

assert.equal(
  standardHardpoints.engines[0].x,
  20,
  'standard miner upper engine hardpoint must match calibrated nozzle'
);
assert.equal(
  standardHardpoints.engines[1].x,
  20,
  'standard miner lower engine hardpoint must match calibrated nozzle'
);
assert.equal(
  standardHardpoints.miningLasers[0].x,
  323,
  'standard miner upper laser hardpoint must match emitter tip'
);
assert.equal(
  standardHardpoints.miningLasers[1].x,
  323,
  'standard miner lower laser hardpoint must match emitter tip'
);
assert.equal(
  industrialHardpoints.engines[0].x,
  17,
  'industrial miner upper engine hardpoint must match calibrated nozzle'
);
assert.equal(
  industrialHardpoints.engines[1].x,
  17,
  'industrial miner lower engine hardpoint must match calibrated nozzle'
);
assert.equal(
  industrialHardpoints.miningLasers[0].x,
  327,
  'industrial miner upper laser hardpoint must match emitter tip'
);
assert.equal(
  industrialHardpoints.miningLasers[1].x,
  327,
  'industrial miner lower laser hardpoint must match emitter tip'
);

console.log('PASS ships module, per-ship sprites, JSON hardpoints and shield geometry');
