'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { BlockadeService } = load('src/systems/operations/blockade-service.ts');
const { PatrolCareerService } = load('src/systems/operations/patrol-career-service.ts');

const world = narrowsSector;
const player = { credits: 35000, cargo: {} };
const tradePort = world.locations.find(
  (location) => location.activities.dock && location.stationType !== 'pirate'
);
assert(tradePort);
const target = world.locations.find(
  (location) => location.activities.trade && location.id !== tradePort.id
);
assert(target);
const patrol = new PatrolCareerService(world, [], player);
assert(patrol.enlist(tradePort.id));
assert(patrol.accept('route', target.id, tradePort.id));
const checkpoint = patrol.exportState();
const staged = new PatrolCareerService(world, [], player, JSON.parse(JSON.stringify(checkpoint)));
assert.deepEqual(staged.exportState(), checkpoint);
assert.equal(player.credits, 35000, 'restore cannot pay a patrol assignment early');
for (let i = 0; i < 50; i += 1) staged.observeArrival(target.id, 0.25);
assert.equal(staged.snapshot().assignments[0].status, 'completed');
const reward = staged.claimReward(tradePort.id);
assert(reward > 0);
assert.equal(staged.claimReward(tradePort.id), 0);
const afterPayment = new PatrolCareerService(world, [], player, staged.exportState());
assert.equal(
  afterPayment.claimReward(tradePort.id),
  0,
  'paid reward cannot be claimed after reload'
);
assert.equal(player.credits, 35000 + reward);
assert.deepEqual(patrol.exportState(), checkpoint);

const markets = createEconomyMarketService(sectorPorts, economyResources);
const pirate = createSectorNpcEconomyStates().find((npc) => npc.pirate);
assert(pirate);
const market = markets.snapshot().find((item) => Object.keys(item.entries).length);
assert(market);
const resourceId = Object.keys(market.entries)[0];
const before = markets.getEntry(market.locationId, resourceId).stock;
let losses = 0;
const options = {
  sector: { npcs: [pirate] },
  markets,
  player,
  recordLoss: (_resourceId, amount) => {
    losses += amount;
  },
  notice: () => {},
};
const order = {
  id: 'blockade-1',
  ownerId: 'player',
  locationId: market.locationId,
  resourceId,
  pirateIds: [pirate.id],
  duration: 7,
  fee: 800,
  orderedDay: 4,
  startedDay: 5,
  phase: 'active',
  removedStock: 9,
  startPrice: 100,
};
const saved = {
  version: 1,
  day: 6,
  sequence: 1,
  orders: [order],
  houseAlarm: { veylan: 5, mercator: 0 },
};
const blockades = new BlockadeService(options, JSON.parse(JSON.stringify(saved)));
assert.deepEqual(blockades.exportState(), saved);
assert.equal(markets.getEntry(market.locationId, resourceId).stock, before);
assert.equal(losses, 0, 'restoring a blockade cannot repeat historic stock losses');
const bad = JSON.parse(JSON.stringify(saved));
bad.orders[0].pirateIds = ['missing'];
assert.throws(() => new BlockadeService(options, bad), /blockade order/);
console.log('PASS career operations: blockade and patrol settlement receipts survive reload');
