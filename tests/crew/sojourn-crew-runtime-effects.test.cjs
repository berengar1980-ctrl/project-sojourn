'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const ships = load('src/systems/ships/ship-registry.ts');
const stations = load('src/systems/ships/station-performance.ts');
const runtime = load('src/systems/ships/ship-runtime.ts');
const movement = load('src/systems/ships/ship-stats.ts');
const components = load('src/systems/ships/ship-component-service.ts');
const tradeModule = load('src/systems/economy/player-trade-service.ts');

const helmStation = [{ id: 'helm', skill: 'piloting' }];
const captain = { id: 'captain', skills: { piloting: 100 } };
const assistant = { id: 'assistant', skills: { piloting: 100 } };
const helmAssignments = { helm: 'captain' };
const twoPilots = [captain, assistant];
assert.equal(
  stations.calculateStationSkill(helmStation, helmAssignments, [captain], 'piloting'),
  60,
  'specialist supplies 60 percent when no other trained crew is aboard'
);
assert.equal(
  stations.calculateStationSkill(helmStation, helmAssignments, twoPilots, 'piloting'),
  100,
  'the other crew member provides the remaining 40 percent'
);
assert.equal(
  stations.calculateStationSkill(helmStation, {}, twoPilots, 'piloting'),
  52,
  'unmanned automation retains its 20-point specialist component and crew synergy'
);

const perfectSkills = {
  piloting: 100,
  sensors: 100,
  weapons: 100,
  engineering: 100,
  logistics: 100,
  mining: 100,
  salvage: 100,
};
const crew = ['captain', 'assistant', 'gunner', 'engineer', 'specialist'].map((id) => ({
  id,
  skills: perfectSkills,
}));
const assignments = {
  helm: 'captain',
  sensor_station: 'assistant',
  weapon_station: 'gunner',
  engine_room: 'engineer',
  cargo_control: 'specialist',
  mining_station: 'specialist',
  salvage_control: 'specialist',
};
const options = { crew, assignments, manningFactor: 1 };

const freighter = ships.getShipsByRole('freighter')[0];
const miner = ships.getShipsByRole('mining')[0];
const salvager = ships.getShipsByRole('salvage')[0];
assert(freighter && miner && salvager);

const fullFreight = runtime.resolveShipRuntimeSetup(freighter, options);
assert.equal(fullFreight.stationSkills.logistics, 100);
assert.equal(fullFreight.crewEffects.logistics.saleFeeRate, 0);
const baseFreightCapacity =
  freighter.cargoCapacityTons + components.componentCargoBonus(fullFreight.installed);
assert.equal(
  fullFreight.cargoCapacityTons,
  Math.floor(baseFreightCapacity * 1.15),
  'fitted cargo modules and 15 percent logistics hold bonus must stack'
);
assert.equal(fullFreight.crewEffects.piloting.travelSpeedMultiplier, 1.15);
assert.equal(fullFreight.crewEffects.piloting.turnRateMultiplier, 1.15);
assert.equal(fullFreight.crewEffects.piloting.fuelUseMultiplier, 0.9);
assert.equal(fullFreight.crewEffects.engineering.fuelUseMultiplier, 0.9);
assert.equal(fullFreight.crewEffects.engineering.shieldStrengthMultiplier, 1.15);

const hull = movement.resolveShipCombatMovementStats(freighter, fullFreight.installed);
const crewHull = movement.resolveShipCombatMovementStats(
  freighter,
  fullFreight.installed,
  fullFreight.stationSkills.piloting
);
assert.equal(crewHull.combatSpeed, Math.round(hull.combatSpeed * 1.15));
assert(Math.abs(crewHull.turnRateRadiansPerSecond / hull.turnRateRadiansPerSecond - 1.15) < 1e-9);

const emptyFreight = runtime.resolveShipRuntimeSetup(freighter);
assert(fullFreight.shieldMaxHp > emptyFreight.shieldMaxHp);
const fittedShieldHp =
  movement.shipShieldMaxHp(freighter) + components.componentShieldBonus(fullFreight.installed);
assert.equal(fullFreight.shieldMaxHp, Math.round(fittedShieldHp * 1.15));

const minerRuntime = runtime.resolveShipRuntimeSetup(miner, options);
const salvagerRuntime = runtime.resolveShipRuntimeSetup(salvager, options);
assert.equal(minerRuntime.stationSkills.mining, 100);
assert.equal(minerRuntime.crewEffects.mining.yieldMultiplier, 1.35);
assert.equal(minerRuntime.crewEffects.mining.workTimeMultiplier, 0.75);
assert.equal(salvagerRuntime.crewEffects.salvage.yieldMultiplier, 1.35);
assert.equal(salvagerRuntime.crewEffects.salvage.workTimeMultiplier, 0.75);
assert.equal(minerRuntime.crewEffects.logistics.saleFeeRate, 0.25);

const markets = {
  entry: { price: 100, stock: 10, demand: 0.5, production: 0.1 },
  getEntry: () => markets.entry,
  recalculate: () => {},
};
const trade = tradeModule.createPlayerTradeService(markets, 1000);
assert.equal(trade.buy('haven', 'steel', 2, 10).creditsDelta, -200);
markets.entry.price = 200;
assert.equal(
  trade.sell('haven', 'steel', 1, minerRuntime.crewEffects.logistics.saleFeeRate).creditsDelta,
  150
);
assert.equal(
  trade.sell('haven', 'steel', 1, fullFreight.crewEffects.logistics.saleFeeRate).creditsDelta,
  200
);

console.log('PASS combined 60/40 station crew effects, flight, shields, cargo, mining and sales');
