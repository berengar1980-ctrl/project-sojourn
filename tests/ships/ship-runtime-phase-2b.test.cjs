'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const runtime = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const cargoPolicy = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-cargo-policy.ts');
const localSystems = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-ship-systems.ts'
);

function createShip(role = 'mining') {
  return {
    id: role + '-runtime-test',
    name: role + ' runtime test',
    role,
    nominalLengthMeters: 80,
    cargoCapacityTons: 360,
    sprite: {
      assetUrl: '',
      widthPx: 320,
      heightPx: 180,
      facing: 'right',
      hardpoints: {
        sourceWidth: 320,
        sourceHeight: 180,
        pivot: { x: 160, y: 90 },
        engines: [],
        miningLasers:
          role === 'mining'
            ? [
                { id: 'laser-a', x: 250, y: 70, width: 7 },
                { id: 'laser-b', x: 250, y: 90, width: 7 },
                { id: 'laser-c', x: 250, y: 110, width: 7 },
              ]
            : [],
        maneuverThrusters: [],
        shield: {
          centerX: 160,
          centerY: 90,
          radiusX: 170,
          radiusY: 100,
          maxHp: 100,
          modifier: 1,
        },
      },
    },
    navigation: { cruiseSpeed: 220 },
  };
}

const miner = createShip();
const baseline = runtime.resolveShipRuntimeSetup(miner);

assert.equal(baseline.hullMaxHp, 72);
assert.equal(baseline.shieldMaxHp, 88);
assert.equal(baseline.energy.output, 40);
assert.equal(baseline.energy.baseUsed, 22);
assert.equal(baseline.scanAvailable, true);
assert.equal(baseline.sensorModifier, 1);
assert.equal(baseline.sensorCrewSkill, 20, 'unmanned sensor station must retain automation skill');
assert.equal(baseline.cargoCapacityTons, 360);
assert.equal(
  baseline.mining.cargoCapacityTons,
  baseline.cargoCapacityTons,
  'mining must use the whole physical hold, not a separate ore-capacity ceiling'
);

const upgraded = runtime.resolveShipRuntimeSetup(miner, {
  installed: {
    reactor: ['reactor2'],
    engine: ['engine1'],
    shield: ['shield2'],
    hull: ['hull2'],
    sensor: ['sensor2'],
    mining: ['mining2'],
    cargo: ['cargo2'],
  },
});

assert.equal(upgraded.hullMaxHp, 88);
assert.equal(upgraded.shieldMaxHp, 106);
assert.equal(upgraded.sensorModifier, 1.15);
assert.equal(upgraded.cargoCapacityTons, 405);
assert(upgraded.mining.cycleSeconds < baseline.mining.cycleSeconds);

const underpowered = runtime.resolveShipRuntimeSetup(miner, {
  installed: {
    reactor: ['reactor1'],
    engine: ['engine3'],
    sensor: ['sensor3'],
    mining: ['mining3'],
  },
});
assert.equal(underpowered.energy.baseUsed, 42);
assert.equal(underpowered.scanAvailable, false);
assert.equal(underpowered.mining.available, false);

const incompatibleSensor = runtime.resolveShipRuntimeSetup(miner, {
  installed: {
    reactor: ['reactor1'],
    engine: ['engine1'],
    sensor: ['sensor6'],
    mining: ['mining1'],
  },
});
assert.equal(incompatibleSensor.installed.sensor, undefined);
assert.equal(incompatibleSensor.scanAvailable, false);

assert.equal(cargoPolicy.canShipCarryResource(miner, 'ferrite'), true);
assert.equal(cargoPolicy.canShipCarryResource(miner, 'steel'), false);
assert.equal(cargoPolicy.canShipCarryResource(createShip('freighter'), 'steel'), true);

const systems = localSystems.createLocalSpaceShipSystems(
  {
    shieldMaxHp: 50,
    shieldModifier: 1,
    hullMaxHp: 80,
    scanAvailable: true,
    sensorModifier: 1.15,
    sensorCrewSkill: 60,
    reactorOutput: 55,
    reactorContinuousUsed: 28,
  },
  miner.sprite.hardpoints
);
systems.applyCollision({
  asteroidId: 'impact',
  point: { x: 0, y: 0 },
  normal: { x: 1, y: 0 },
  surfaceAnchor: { x: 1, y: 0 },
  mass: 1000,
  impactSpeed: 100,
  kineticEnergy: 10_000_000,
});
const systemSnapshot = systems.snapshot();
assert.equal(systemSnapshot.shield.currentHp, 0);
assert.equal(systemSnapshot.hull.currentHp, 30, 'shield overflow must damage hull');
assert.equal(systemSnapshot.reactor.continuousFree, 27);

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const miningController = fs.readFileSync(
  path.join(root, 'src/app/game-controller-mining.ts'),
  'utf8'
);
assert(controller.includes('canShipCarryResource(ship, resourceId)'));
assert(controller.includes('runtime.cargoCapacityTons'));
assert(miningController.includes('systems: {'));
assert(miningController.includes('sensorCrewSkill: runtime.sensorCrewSkill'));

console.log('PASS Phase 2B ship runtime, hull overflow, sensors, reactor and cargo specialization');
