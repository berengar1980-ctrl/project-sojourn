'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const npcModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/npc-economy-service.ts'
);
const simulationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/economy-simulation-service.ts'
);

function createMarkets() {
  const markets = [
    {
      locationId: 'source',
      produces: new Set(),
      needs: new Set(),
      entries: {
        steel: { resourceId: 'steel', stock: 50, demand: 0.3, production: 0, price: 40 },
        ferrite: { resourceId: 'ferrite', stock: 60, demand: 0.3, production: 0, price: 30 },
        obscura: { resourceId: 'obscura', stock: 30, demand: 0.3, production: 0, price: 20 },
      },
    },
    {
      locationId: 'destination',
      produces: new Set(),
      needs: new Set(['steel', 'ferrite']),
      entries: {
        steel: { resourceId: 'steel', stock: 20, demand: 0.9, production: 0, price: 100 },
        ferrite: { resourceId: 'ferrite', stock: 10, demand: 0.9, production: 0, price: 90 },
        obscura: { resourceId: 'obscura', stock: 1, demand: 0.9, production: 0, price: 400 },
      },
    },
  ];

  return {
    markets,
    snapshot() {
      return markets;
    },
    getMarket(locationId) {
      return markets.find((market) => market.locationId === locationId) ?? null;
    },
    getEntry(locationId, resourceId) {
      return this.getMarket(locationId)?.entries[resourceId] ?? null;
    },
    recalculate(locationId, resourceId) {
      return this.getEntry(locationId, resourceId)?.price ?? null;
    },
  };
}

const resources = [
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 40,
    legality: 'legal',
  },
  {
    id: 'ferrite',
    name: 'Ferriterz',
    categoryId: 'raw',
    category: 'Rohstoffe',
    basePrice: 30,
    legality: 'legal',
  },
  {
    id: 'obscura',
    name: 'Obscura',
    categoryId: 'contraband',
    category: 'Schmuggel',
    basePrice: 20,
    legality: 'illegal',
  },
];

{
  const markets = createMarkets();
  const trader = {
    id: 'trader',
    role: 'trader',
    locationId: 'source',
    credits: 1000,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: [],
  };
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    { credits: 0, cargo: {} },
    resources,
    17,
    [trader]
  );
  const service = npcModule.createNpcEconomyService(markets, simulation, resources, [trader]);
  const steelBefore = simulation.getResourceTotal('steel');

  service.advanceDay(0);

  assert.equal(trader.locationId, 'destination');
  assert.equal(trader.cargo.steel, 10, 'trader must buy the profitable legal route');
  assert.equal(markets.markets[0].entries.steel.stock, 40);
  assert.equal(trader.cargo.obscura, undefined, 'ordinary NPC trade must not buy illegal cargo');
  assert.equal(
    simulation.getResourceTotal('steel'),
    steelBefore,
    'NPC purchase must conserve physical stock'
  );

  service.advanceDay(1);

  assert.equal(trader.cargo.steel, undefined);
  assert.equal(markets.markets[1].entries.steel.stock, 30);
  assert(trader.credits > 1000, 'completed profitable route must increase NPC credits');
  assert.equal(
    simulation.getResourceTotal('steel'),
    steelBefore,
    'NPC sale must conserve physical stock'
  );
}

{
  const markets = createMarkets();
  const miner = {
    id: 'miner',
    role: 'miner',
    locationId: 'source',
    credits: 500,
    cargoCapacity: 10,
    cargo: {},
    workResourceIds: ['ferrite'],
  };
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    { credits: 0, cargo: {} },
    resources,
    23,
    [miner]
  );
  const service = npcModule.createNpcEconomyService(markets, simulation, resources, [miner]);
  const before = simulation.getResourceTotal('ferrite');

  service.advanceDay(0);

  assert.equal(miner.cargo.ferrite, 8, 'miner must fill cargo from the shared circulation pool');
  assert.equal(npcModule.npcCargoUsed(miner), 8);
  assert.equal(
    simulation.getResourceTotal('ferrite'),
    before,
    'NPC mining must transfer physical material rather than create it'
  );

  service.advanceDay(1);

  assert.equal(miner.cargo.ferrite, undefined, 'loaded resource worker must sell its cargo');
  assert.equal(miner.locationId, 'destination');
  assert.equal(
    simulation.getResourceTotal('ferrite'),
    before,
    'NPC resource sale must keep the sector total conserved'
  );
}

{
  const markets = createMarkets();
  const npcs = [
    {
      id: 'trader',
      role: 'trader',
      locationId: 'source',
      credits: 3000,
      cargoCapacity: 12,
      cargo: {},
      workResourceIds: [],
    },
    {
      id: 'miner',
      role: 'miner',
      locationId: 'source',
      credits: 1000,
      cargoCapacity: 16,
      cargo: {},
      workResourceIds: ['ferrite'],
    },
  ];
  const simulation = simulationModule.createEconomySimulationService(
    markets,
    { credits: 0, cargo: {} },
    resources,
    31,
    npcs
  );
  const service = npcModule.createNpcEconomyService(markets, simulation, resources, npcs);

  for (let day = 0; day < 365; day += 1) {
    simulation.advanceDay(day);
    service.advanceDay(day);
  }

  for (const npc of npcs) {
    assert(Number.isFinite(npc.credits) && npc.credits >= 0);
    assert(npcModule.npcCargoUsed(npc) <= npc.cargoCapacity);
    for (const amount of Object.values(npc.cargo)) {
      assert(Number.isFinite(amount) && amount >= 0);
    }
  }
  for (const market of markets.markets) {
    for (const entry of Object.values(market.entries)) {
      assert(Number.isFinite(entry.stock) && entry.stock >= 0);
    }
  }
}

const controllerSource = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
assert(
  controllerSource.includes('npcs.advanceNextDay()'),
  'completed travel must advance NPC economic activity with the daily economy'
);

console.log('PASS NPC trade, resource work, conservation and 365-day stability');
