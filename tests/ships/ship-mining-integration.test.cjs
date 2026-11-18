'use strict';

const { readModuleSource } = require('../module-source.cjs');

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
assert.equal(baseline.cargoCapacityTons, 390);
assert.equal(baseline.reactorOutput, 40);
assert.equal(
  baseline.continuousPowerUsed,
  27,
  'mining and installed tractor beam both draw reactor power'
);

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

const service = readModuleSource(root, 'src/systems/local-space/local-space-service.ts');
const controller = readModuleSource(root, 'src/app/game-controller-mining.ts');
const panel = readModuleSource(root, 'src/ui/local-space/local-space-panel.ts');

assert(service.includes('miningAvailable: this.miningEnabled'));
assert(
  service.includes('const cycleSeconds = this.miningEvents.cycleSeconds(this.miningCycleSeconds)')
);
assert(service.includes('this.miningAccumulator >= cycleSeconds'));
assert(controller.includes('const runtime = resolveShipRuntimeSetup(ship, runtimeOptions)'));
assert(
  controller.includes('runtime.mining.cycleSeconds * runtime.crewEffects.mining.workTimeMultiplier')
);
assert(
  controller.includes('runtime.mining.yieldMultiplier * runtime.crewEffects.mining.yieldMultiplier')
);
assert(
  service.includes('this.yieldMultiplier') && service.includes('options.mining?.yieldMultiplier'),
  'mining yield must flow from ship setup into resource extraction'
);
assert(controller.includes('runtime.cargoCapacityTons'));
assert(panel.includes('!model.miningAvailable'));

const miningEffects = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-effects-renderer.ts'),
  'utf8'
);
const miningVisuals = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-beam-visuals.ts'),
  'utf8'
);
assert(
  miningEffects.includes('interferenceStrength') &&
    miningEffects.includes('Math.floor(timeSeconds * 9') &&
    miningEffects.includes('drawMiningLaserBeam(') &&
    miningVisuals.includes('context.lineTo(end.x, end.y)') &&
    miningVisuals.includes('context.globalAlpha = strength'),
  'mining laser interference must remain a visual intensity dropout on a straight beam'
);

console.log('PASS ship modules, reactor load, hardpoints and cargo drive local mining');
