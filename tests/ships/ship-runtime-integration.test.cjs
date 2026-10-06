'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const runtimeModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-runtime.ts');
const cargoModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-cargo-policy.ts');
const tradeModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/player-trade-service.ts'
);

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

function fakeMarkets() {
  const entries = {
    ferrite: {
      resourceId: 'ferrite',
      stock: 1000,
      demand: 0.5,
      production: 0.2,
      price: 1,
    },
    steel: {
      resourceId: 'steel',
      stock: 1000,
      demand: 0.5,
      production: 0.2,
      price: 1,
    },
  };

  return {
    entries,
    getEntry(locationId, resourceId) {
      return locationId === 'haven' ? entries[resourceId] ?? null : null;
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
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

const specialistRuntime = runtimeModule.resolveShipRuntimeSetup(miner, {
  crew: [
    {
      id: 'operator',
      skills: { mining: 80, sensors: 70, engineering: 60 },
    },
  ],
  assignments: {
    mining_station: 'operator',
    sensor_station: 'operator',
    engine_room: 'operator',
  },
});
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

{
  const player = { credits: 1000, cargo: {} };
  assert.equal(cargoModule.shipTradeCargoLimit(miner, player, 'ferrite'), 360);
  assert.equal(cargoModule.shipTradeCargoLimit(miner, player, 'steel'), 270);
}

{
  const markets = fakeMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const oreLimit = cargoModule.shipTradeCargoLimit(miner, trade.player, 'ferrite');
  trade.buy('haven', 'ferrite', 90, oreLimit);
  const steelLimit = cargoModule.shipTradeCargoLimit(miner, trade.player, 'steel');
  const steel = trade.buy('haven', 'steel', 500, steelLimit);

  assert(steel);
  assert.equal(steel.quantity, 270);
  assert.equal(trade.player.cargo.ferrite.qty, 90);
  assert.equal(trade.player.cargo.steel.qty, 270);
  assert.equal(
    tradeModule.playerCargoUsed(trade.player),
    360,
    'reserved ore space must not reduce the miner total ore-capable hold'
  );
}

{
  const markets = fakeMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const steelLimit = cargoModule.shipTradeCargoLimit(miner, trade.player, 'steel');
  const steel = trade.buy('haven', 'steel', 500, steelLimit);

  assert(steel);
  assert.equal(
    steel.quantity,
    270,
    'an empty miner must not use the ore-only reserve for ordinary freight'
  );
}

const miningComposition = fs.readFileSync(
  path.join(root, 'src/app/mining-local-space.ts'),
  'utf8'
);
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const panel = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-panel.ts'),
  'utf8'
);

assert(miningComposition.includes('const runtime = resolveShipRuntimeSetup(ship)'));
assert(miningComposition.includes('runtime.cargo.totalCapacityTons'));
assert(controller.includes('shipTradeCargoLimit(ship, trade.player, resourceId)'));
assert(miningComposition.includes('shieldMaxHp: runtime.shieldMaxHp'));
assert(miningComposition.includes('modifier: runtime.sensorModifier'));
assert(service.includes('this.hullState.currentHp - result.overflowDamage'));
assert(service.includes('sensorModifier = this.sensorModifier'));
assert(panel.includes('HÜLLEN-INTEGRITÄT'));

console.log('PASS ship runtime defense, sensors, crew and reserved mining cargo');
