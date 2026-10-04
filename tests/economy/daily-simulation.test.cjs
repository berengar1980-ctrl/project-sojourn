'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const simulation = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/economy-simulation-service.ts'
);

function createMarketService() {
  const markets = [
    {
      locationId: 'consumer',
      produces: new Set(),
      needs: new Set(['steel', 'obscura']),
      entries: {
        steel: { resourceId: 'steel', stock: 900, demand: 0.9, production: 0, price: 100 },
        obscura: { resourceId: 'obscura', stock: 80, demand: 0.8, production: 0, price: 500 },
      },
    },
    {
      locationId: 'producer',
      produces: new Set(['steel']),
      needs: new Set(),
      entries: {
        steel: { resourceId: 'steel', stock: 1200, demand: 0.35, production: 0.9, price: 80 },
      },
    },
  ];
  let recalculations = 0;

  return {
    markets,
    snapshot() {
      return markets;
    },
    recalculate(locationId, resourceId) {
      const market = markets.find((entry) => entry.locationId === locationId);
      const entry = market?.entries[resourceId];
      if (!entry) return null;
      recalculations += 1;
      entry.price = Math.max(1, Math.round(100 + entry.demand * 50 - entry.stock / 100));
      return entry.price;
    },
    get recalculations() {
      return recalculations;
    },
  };
}

const resources = [
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 100,
    legality: 'legal',
  },
  {
    id: 'obscura',
    name: 'Obscura',
    categoryId: 'contraband',
    category: 'Schmuggel',
    basePrice: 500,
    legality: 'illegal',
  },
];

{
  const marketService = createMarketService();
  const player = { credits: 1000, cargo: {} };
  const economy = simulation.createEconomySimulationService(
    marketService,
    player,
    resources,
    12345
  );
  const steelBefore = economy.getResourceTotal('steel');
  const illegalBefore = economy.getResourceTotal('obscura');

  economy.advanceDay(30);
  economy.advanceNextDay();

  assert.equal(
    economy.getResourceTotal('steel'),
    steelBefore,
    'normal consumption and production must conserve legal resources'
  );
  assert.equal(
    economy.getResourceTotal('obscura'),
    illegalBefore,
    'contraband must remain conserved while no real losses occur'
  );
  assert(marketService.recalculations > 0, 'daily simulation must refresh market prices');
  assert(economy.pools.steel.reserve >= 0);
}

{
  const firstMarkets = createMarketService();
  const secondMarkets = createMarketService();
  const first = simulation.createEconomySimulationService(
    firstMarkets,
    { credits: 0, cargo: {} },
    resources,
    77
  );
  const second = simulation.createEconomySimulationService(
    secondMarkets,
    { credits: 0, cargo: {} },
    resources,
    77
  );

  first.advanceDay(365);
  second.advanceDay(365);

  assert.deepEqual(
    firstMarkets.markets,
    secondMarkets.markets,
    'same seed and day count must produce deterministic market evolution'
  );
}

{
  const marketService = createMarketService();
  const player = { credits: 0, cargo: {} };
  const economy = simulation.createEconomySimulationService(marketService, player, resources, 9);
  economy.advanceDay(1000);

  for (const market of marketService.markets) {
    for (const entry of Object.values(market.entries)) {
      assert(
        Number.isFinite(entry.stock) && entry.stock >= 0,
        'stock must stay finite and nonnegative'
      );
      assert(
        Number.isFinite(entry.demand) && entry.demand >= 0 && entry.demand <= 1,
        'demand must stay finite and bounded'
      );
      assert(
        Number.isFinite(entry.price) && entry.price > 0,
        'price must stay finite and positive'
      );
    }
  }
  for (const pool of Object.values(economy.pools)) {
    assert(Number.isFinite(pool.reserve) && pool.reserve >= 0);
    assert(Number.isFinite(pool.externalImports) && pool.externalImports >= 0);
  }
}

{
  const marketService = createMarketService();
  const player = { credits: 0, cargo: {} };
  const economy = simulation.createEconomySimulationService(marketService, player, resources, 3);
  const pool = economy.pools.obscura;
  marketService.markets[0].entries.obscura.stock = 1;

  economy.advanceDay(1);

  assert(
    pool.externalImports > 0,
    'severe contraband depletion must trigger explicit black-market replacement supply'
  );
  assert(
    economy.getResourceTotal('obscura') <= pool.target * 1.1,
    'black-market replacement must respect the 110 percent ceiling'
  );
}

const controllerSource = require('fs').readFileSync(
  path.join(root, 'src/app/game-controller.ts'),
  'utf8'
);
assert(
  controllerSource.includes('simulation.advanceNextDay()'),
  'completed inter-location travel must advance the demo economy by one day'
);

console.log('PASS deterministic daily economy and 1000-day stability');
