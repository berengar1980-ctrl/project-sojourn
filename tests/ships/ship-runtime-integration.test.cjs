'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const runtimeModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const cargoModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-cargo-policy.ts');

function createShip(role, laserCount, cargoCapacityTons = 360) {
  return {
    id: role + '-runtime-test',
    name: role + ' runtime test',
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
const runtime = runtimeModule.resolveShipRuntimeSetup(miner);

assert.equal(runtime.hullMaxHp, 72);
assert.equal(runtime.shieldMaxHp, 88);
assert.equal(runtime.shieldPowered, true);
assert.equal(runtime.energy.output, 40);
assert.equal(runtime.energy.baseUsed, 22);
assert.equal(runtime.sensorModifier, 1);
assert.equal(runtime.sensorCrewSkill, 20);
assert.equal(runtime.miningCrewSkill, 20);
assert.equal(runtime.mining.cycleSeconds, 0.42);
assert.equal(runtime.mining.cargoCapacityTons, 360);
assert.equal(runtime.cargo.totalCapacityTons, 360);
assert.equal(runtime.cargo.generalCapacityTons, 270);
assert.equal(runtime.cargo.reservedSpecialCargoTons, 90);

const crew = [
  {
    id: 'operator',
    skills: { mining: 80, sensors: 70, engineering: 60 },
  },
];
const assignments = {
  mining_station: 'operator',
  sensor_station: 'operator',
  engine_room: 'operator',
};
const specialistRuntime = runtimeModule.resolveShipRuntimeSetup(miner, { crew, assignments });

assert(specialistRuntime.miningCrewSkill > 20);
assert(specialistRuntime.sensorCrewSkill > 20);
assert(
  specialistRuntime.mining.cycleSeconds < runtime.mining.cycleSeconds,
  'a skilled mining operator must increase extraction rate'
);

const underpowered = runtimeModule.resolveShipRuntimeSetup(miner, {
  installed: {
    reactor: ['reactor1'],
    engine: ['engine3'],
    shield: ['shield3'],
    sensor: ['sensor3'],
    mining: ['mining3'],
  },
});

assert.equal(underpowered.energy.baseFree < 0, true);
assert.equal(underpowered.mining.available, false);
assert.equal(underpowered.shieldPowered, false);
assert.equal(underpowered.sensorModifier, 0.25);

const policy = cargoModule.resolveShipCargoPolicy(miner);
assert.deepEqual(policy, {
  totalCapacityTons: 360,
  generalCapacityTons: 270,
  reservedSpecialCargoTons: 90,
  specialCargoKind: 'mining',
});

const emptyCargo = { credits: 0, cargo: {} };
assert.equal(cargoModule.shipTradeCargoLimit(miner, emptyCargo, 'ferrite'), 360);
assert.equal(cargoModule.shipTradeCargoLimit(miner, emptyCargo, 'steel'), 270);

const oreInReserve = {
  credits: 0,
  cargo: {
    ferrite: { qty: 90, totalCost: 0 },
  },
};
assert.equal(
  cargoModule.shipTradeCargoLimit(miner, oreInReserve, 'steel'),
  360,
  'ore in the reserved bay must not consume general trade capacity'
);

const fullOfOre = {
  credits: 0,
  cargo: {
    ferrite: { qty: 360, totalCost: 0 },
  },
};
assert.equal(
  cargoModule.shipTradeCargoLimit(miner, fullOfOre, 'ferrite'),
  360,
  'ore must be allowed to fill the entire miner cargo capacity'
);

const miningComposition = fs.readFileSync(path.join(root, 'src/app/mining-local-space.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');

assert(miningComposition.includes('const runtime = resolveShipRuntimeSetup(ship)'));
assert(miningComposition.includes('runtime.cargo.totalCapacityTons'));
assert(controller.includes('shipTradeCargoLimit(ship, trade.player, resourceId)'));
assert(miningComposition.includes('shieldMaxHp: runtime.shieldMaxHp'));
assert(miningComposition.includes('modifier: runtime.sensorModifier'));
assert(service.includes('this.hullState.currentHp - result.overflowDamage'));
assert(service.includes('sensorModifier = this.sensorModifier'));
assert(panel.includes('HÜLLEN-INTEGRITÄT'));

console.log('PASS ship runtime defense, sensors, crew and reserved mining cargo');
