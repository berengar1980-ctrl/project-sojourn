'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createMarketSituationService } = load('src/systems/economy/market-situation-service.ts');
const { createMarketIntelService } = load('src/systems/economy/market-intel-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { captureCareerNpcEconomySession, stageCareerNpcEconomySession } = load(
  'src/systems/persistence/career-npc-economy-session.ts'
);
const { captureCareerCommerceSession, stageCareerCommerceSession } = load(
  'src/systems/persistence/career-commerce-session.ts'
);

const seed = 17;
const world = narrowsSector;
const validPorts = new Set(sectorPorts.map((port) => port.locationId));
const npcs = createSectorNpcEconomyStates()
  .filter((npc) => validPorts.has(npc.locationId))
  .slice(0, 3);
assert(npcs.length >= 2);
const player = { credits: 15000, cargo: {} };
const situations = createMarketSituationService(sectorPorts, economyResources, seed);
const markets = createEconomyMarketService(sectorPorts, economyResources);
const simulation = createEconomySimulationService(markets, player, economyResources, seed, npcs);
const intel = createMarketIntelService(markets);
const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcs);
simulation.advanceDay(2);
npcEconomy.advanceDay(2);
situations.advanceDay(2);
intel.recordHistory(2);

const liveEconomy = { markets, simulation, situations, intel, npcs: npcEconomy };
const saved = captureCareerNpcEconomySession(world, npcs, liveEconomy);
const clone = (value) => JSON.parse(JSON.stringify(value));
const staged = stageCareerNpcEconomySession(
  clone(saved),
  world,
  sectorPorts,
  economyResources,
  clone(player),
  seed
);
assert.deepEqual(captureCareerNpcEconomySession(world, staged.npcs, staged.economy), saved);
assert.notStrictEqual(staged.npcs, npcs);
assert.notStrictEqual(staged.npcs[0], npcs[0]);
assert.strictEqual(staged.economy.npcs.npcs[0], staged.npcs[0]);
staged.economy.npcs.advanceDay(2);
assert.deepEqual(staged.economy.npcs.exportState(), saved.economy.npcEconomy);

// A live NPC may be stationed at a real asteroid field without a trading market.
const mineLocation = world.locations.find(
  (location) => location.activities.mine && !validPorts.has(location.id)
);
assert(mineLocation, 'fixture needs a nonmarket mining location');
const fieldSave = clone(saved);
fieldSave.npcs.npcs[0].locationId = mineLocation.id;
fieldSave.npcs.npcs[0].homePortId = mineLocation.id;
if (fieldSave.npcs.npcs[0].autonomy) {
  fieldSave.npcs.npcs[0].autonomy.lastLocationId = mineLocation.id;
}
delete fieldSave.npcs.npcs[0].orbit;
const atField = stageCareerNpcEconomySession(
  fieldSave,
  world,
  sectorPorts,
  economyResources,
  clone(player),
  seed
);
assert.equal(atField.npcs[0].locationId, mineLocation.id);
assert.strictEqual(atField.economy.npcs.npcs[0], atField.npcs[0]);
const invalidIntel = clone(fieldSave);
invalidIntel.npcs.npcs[0].marketIntel = {
  [mineLocation.id]: {
    locationId: mineLocation.id,
    observedDay: 0,
    entries: {},
  },
};
assert.throws(
  () =>
    stageCareerNpcEconomySession(
      invalidIntel,
      world,
      sectorPorts,
      economyResources,
      clone(player),
      seed
    ),
  /market observation/
);

const badOrder = clone(saved);
badOrder.npcs.npcs[0].autonomy.pendingTrade = {
  resourceId: 'not-a-resource',
  destinationId: sectorPorts[0].locationId,
  quantity: 7,
  reason: 'Handel',
};
assert.throws(
  () =>
    stageCareerNpcEconomySession(
      badOrder,
      world,
      sectorPorts,
      economyResources,
      clone(player),
      seed
    ),
  /pending trade/
);

const badIdentity = clone(saved);
badIdentity.economy.npcEconomy.npcIds[0] = 'missing';
assert.throws(
  () =>
    stageCareerNpcEconomySession(
      badIdentity,
      world,
      sectorPorts,
      economyResources,
      clone(player),
      seed
    ),
  /identity mismatch/
);
assert.deepEqual(captureCareerNpcEconomySession(world, npcs, liveEconomy), saved);

const commerce = captureCareerCommerceSession(player, world, npcs, liveEconomy);
const rebuilt = stageCareerCommerceSession(
  clone(commerce),
  world,
  sectorPorts,
  economyResources,
  seed
);
assert.deepEqual(
  captureCareerCommerceSession(rebuilt.trade.player, world, rebuilt.npcs, rebuilt.economy),
  commerce
);
const entry = rebuilt.economy.markets
  .snapshot()
  .flatMap((market) =>
    Object.values(market.entries).map((item) => ({
      locationId: market.locationId,
      resourceId: item.resourceId,
      stock: item.stock,
    }))
  )
  .find((item) => item.stock > 0);
assert(entry);
const beforeStock = rebuilt.economy.markets.getEntry(entry.locationId, entry.resourceId).stock;
const trade = rebuilt.trade.buy(entry.locationId, entry.resourceId, 1, 500);
assert(trade, 'staged player must be able to trade on restored market');
assert.equal(
  rebuilt.economy.markets.getEntry(entry.locationId, entry.resourceId).stock,
  beforeStock - 1
);

const invalidPlayer = clone(commerce);
invalidPlayer.player.credits = -1;
assert.throws(() =>
  stageCareerCommerceSession(invalidPlayer, world, sectorPorts, economyResources, seed)
);
assert.deepEqual(captureCareerNpcEconomySession(world, npcs, liveEconomy), saved);
console.log('PASS career NPC economy session: detached roundtrip and trade reference validation');
