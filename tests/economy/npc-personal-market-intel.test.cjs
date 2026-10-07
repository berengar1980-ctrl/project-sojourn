'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const npcModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/npc-economy-service.ts'
);

const resources = [
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 40,
    legality: 'legal',
  },
];

function market(locationId, price) {
  return {
    locationId,
    produces: new Set(),
    needs: new Set(['steel']),
    entries: {
      steel: {
        resourceId: 'steel',
        stock: 100,
        demand: 0.5,
        production: 0,
        price,
      },
    },
  };
}

function createMarkets(definitions) {
  const markets = definitions.map(([id, price]) => market(id, price));
  return {
    markets,
    snapshot() {
      return markets;
    },
    getMarket(locationId) {
      return markets.find((candidate) => candidate.locationId === locationId) ?? null;
    },
    getEntry(locationId, resourceId) {
      return this.getMarket(locationId)?.entries[resourceId] ?? null;
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
  };
}

function tickUntil(service, predicate, message, maximumTicks = 2200) {
  for (let tick = 0; tick < maximumTicks; tick += 1) {
    if (predicate()) return;
    service.tick(0.25);
  }
  assert(predicate(), message);
}

const allocator = {
  createMinedResource(_resourceId, amount) {
    return amount;
  },
  allocatePhysicalResource(_resourceId, amount) {
    return amount;
  },
};

function trader(id = 'trader') {
  return {
    id,
    role: 'trader',
    locationId: 'source',
    credits: 5000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: [],
    marketIntel: {},
  };
}

{
  const markets = createMarkets([
    ['source', 40],
    ['market-a', 100],
    ['market-b', 100],
    ['market-c', 100],
    ['market-d', 100],
    ['market-e', 100],
    ['market-f', 100],
    ['market-g', 100],
  ]);
  const first = trader('captain-alpha');
  const second = trader('captain-beta');

  npcModule.createNpcEconomyService(markets, allocator, resources, [first, second]);

  const firstKnown = npcModule.npcKnownMarketIds(first);
  const secondKnown = npcModule.npcKnownMarketIds(second);

  assert.equal(firstKnown.length, 6, 'traders should start with home plus five remote reports');
  assert.equal(secondKnown.length, 6);
  assert(firstKnown.length < markets.markets.length, 'no trader may know every market at start');
  assert.notStrictEqual(
    first.marketIntel,
    second.marketIntel,
    'market intel must belong to each NPC'
  );

  first.marketIntel.source.entries.steel.price = 999;
  assert.equal(
    second.marketIntel.source.entries.steel.price,
    40,
    'one captain changing intel must never mutate another captain knowledge'
  );
}

{
  const markets = createMarkets([
    ['source', 40],
    ['old-best', 220],
    ['old-second', 100],
  ]);
  const npc = trader('stale-intel-captain');
  let travelling = false;
  let requestedDestination = null;

  const service = npcModule.createNpcEconomyService(markets, allocator, resources, [npc], {
    travel: {
      requestTravel(_npc, destinationId) {
        requestedDestination = destinationId;
        travelling = true;
        return true;
      },
      isTravelling() {
        return travelling;
      },
    },
  });

  assert.equal(npc.marketIntel['old-best'].entries.steel.price, 220);
  assert.equal(npc.marketIntel['old-second'].entries.steel.price, 100);

  markets.getEntry('old-best', 'steel').price = 45;
  markets.getEntry('old-second', 'steel').price = 500;

  tickUntil(
    service,
    () => requestedDestination !== null,
    'trader must eventually complete thinking, loading and launch preparation'
  );

  assert.equal(
    requestedDestination,
    'old-best',
    'trade planning must use the captain stale remote report, not current global prices'
  );
  assert.equal(npc.cargo.steel, 10);
  assert.equal(
    npc.marketIntel['old-best'].entries.steel.price,
    220,
    'remote intel must remain unchanged while the NPC is travelling'
  );

  service.advanceDay(3);
  assert.equal(
    npcModule.npcMarketIntelAge(npc, 'old-best', 3),
    3,
    'remote reports must age independently while the NPC is away'
  );

  travelling = false;
  npc.locationId = 'old-best';
  requestedDestination = null;
  service.tick(0.25);

  assert.equal(
    npc.marketIntel['old-best'].entries.steel.price,
    45,
    'arrival must refresh the local market to the exact current price'
  );

  service.advanceDay(4);
  assert.equal(npc.marketIntel['old-best'].observedDay, 4);

  tickUntil(
    service,
    () => requestedDestination !== null,
    'captain must reconsider the stale route after the arrival dwell'
  );
  assert.equal(
    requestedDestination,
    'old-second',
    'after discovering the price collapse the NPC may reroute using its remaining stale intel'
  );
}

{
  const markets = createMarkets([
    ['source', 40],
    ['market-a', 90],
    ['market-b', 90],
    ['market-c', 90],
    ['market-d', 90],
    ['market-e', 90],
    ['market-f', 90],
    ['market-g', 90],
  ]);
  const npc = trader('limited-network-captain');
  let requestedDestination = null;
  const service = npcModule.createNpcEconomyService(markets, allocator, resources, [npc], {
    travel: {
      requestTravel(_npc, destinationId) {
        requestedDestination = destinationId;
        return true;
      },
      isTravelling() {
        return false;
      },
    },
  });

  const known = new Set(npcModule.npcKnownMarketIds(npc));
  const unknown = markets.markets.find(
    (candidate) => candidate.locationId !== 'source' && !known.has(candidate.locationId)
  );
  assert(unknown, 'limited personal network must leave at least one remote market unknown');

  unknown.entries.steel.price = 5000;
  tickUntil(
    service,
    () => requestedDestination !== null,
    'trader should still find a route among known reports'
  );

  assert(requestedDestination, 'trader should still find a route among known reports');
  assert.notEqual(
    requestedDestination,
    unknown.locationId,
    'an unknown live jackpot market must not influence NPC route choice'
  );
}

console.log('PASS NPC personal market intel, stale decisions, aging and local refresh');
