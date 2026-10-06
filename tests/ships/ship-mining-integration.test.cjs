'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const mining = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-mining-capability.ts');

function createShip(role, laserCount, cargoCapacityTons = 360) {
  return {
    id: role + '-test',
    name: role + ' test ship',
    role,
    nominalLengthMeters: 80,
    cargoCapacityTons,
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
        miningLasers: Array.from({ length: laserCount }, (_, index) => ({
          id: 'laser-' + index,
          x: 250,
          y: 60 + index * 20,
          width: 7,
        })),
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

const miner = createShip('mining', 3);
const defaultLoadout = mining.defaultInstalledShipComponents(miner);
const baseline = mining.resolveShipMiningSetup(miner, defaultLoadout);

assert.deepEqual(defaultLoadout.mining, ['mining1']);
assert.equal(baseline.available, true, 'a standard miner must have a usable mining system');
assert.equal(baseline.laserCount, 3);
assert.equal(baseline.yieldMultiplier, 1);
assert.equal(baseline.cycleSeconds, 0.42, 'three Mk I lasers must preserve current mining pace');
assert.equal(baseline.cargoCapacityTons, 360);
assert.equal(baseline.reactorOutput, 40);
assert.equal(baseline.continuousPowerUsed, 22);

const freighter = mining.resolveShipMiningSetup(createShip('freighter', 0));
assert.equal(freighter.available, false, 'ships without mining hardpoints must not mine');

const noModule = mining.resolveShipMiningSetup(miner, {
  reactor: ['reactor1'],
  engine: ['engine1'],
  sensor: ['sensor1'],
});
assert.equal(noModule.available, false, 'a visual laser alone must not replace a mining module');

const underpowered = mining.resolveShipMiningSetup(miner, {
  reactor: ['reactor1'],
  engine: ['engine3'],
  sensor: ['sensor3'],
  mining: ['mining3'],
});
assert.equal(underpowered.continuousPowerUsed, 42);
assert.equal(underpowered.available, false, 'reactor output must cover continuous mining load');

const upgraded = mining.resolveShipMiningSetup(miner, {
  ...defaultLoadout,
  mining: ['mining2'],
});
assert(upgraded.cycleSeconds < baseline.cycleSeconds, 'better mining modules must extract faster');

const singleLaser = mining.resolveShipMiningSetup(createShip('mining', 1));
assert(
  singleLaser.cycleSeconds > baseline.cycleSeconds,
  'fewer physical mining emitters must reduce extraction rate'
);

const cargoExpanded = mining.resolveShipMiningSetup(miner, {
  ...defaultLoadout,
  cargo: ['cargo2'],
});
assert.equal(
  cargoExpanded.cargoCapacityTons,
  405,
  'cargo modules must increase mining cargo limit'
);

const incompatibleTier = mining.resolveShipMiningSetup(miner, {
  ...defaultLoadout,
  mining: ['mining6'],
});
assert.equal(
  incompatibleTier.available,
  false,
  'mining modules above the hull component tier must not become operational'
);

const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const miningComposition = fs.readFileSync(
  path.join(root, 'src/app/mining-local-space.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');

assert(service.includes('miningAvailable: this.miningEnabled'));
assert(service.includes('this.miningAccumulator >= this.miningCycleSeconds'));
assert(miningComposition.includes('const runtime = resolveShipRuntimeSetup(ship)'));
assert(miningComposition.includes('cycleSeconds: runtime.mining.cycleSeconds'));
assert(miningComposition.includes('runtime.cargo.totalCapacityTons'));
assert(panel.includes('!model.miningAvailable'));

console.log('PASS ship modules, reactor load, hardpoints and cargo drive local mining');
