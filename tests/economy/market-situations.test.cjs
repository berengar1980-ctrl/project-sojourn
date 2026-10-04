'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const situationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/market-situation-service.ts'
);
const marketModule = loadStandaloneTypeScriptModule(root, 'src/systems/economy/market-service.ts');

const resources = [
  {
    id: 'medical',
    name: 'Medicae',
    categoryId: 'supplies',
    category: 'Versorgung',
    basePrice: 100,
    legality: 'legal',
  },
  {
    id: 'steel',
    name: 'Stahl',
    categoryId: 'industry',
    category: 'Industrie',
    basePrice: 80,
    legality: 'legal',
  },
];

function port(locationId) {
  return {
    locationId,
    subtitle: locationId,
    economy: 'Test',
    population: '1',
    security: 'medium',
    shipyard: false,
    producedCommodityIds: [],
    neededCommodityIds: [],
    commodities: [
      { id: 'medical', stock: 1000, demand: 0.5, production: 0.2 },
      { id: 'steel', stock: 1000, demand: 0.5, production: 0.2 },
    ],
    crew: [],
  };
}

{
  const situations = situationModule.createMarketSituationService([], resources, 7);
  const markets = marketModule.createEconomyMarketService(
    [port('source'), port('destination')],
    resources,
    {
      situationModifier: (locationId, resourceId) => situations.modifier(locationId, resourceId),
    }
  );

  const sourceBefore = markets.getEntry('source', 'medical').price;
  const destinationBefore = markets.getEntry('destination', 'medical').price;

  situations.add({
    id: 'local-medical',
    name: 'Medicae-Notstand',
    description: 'Test',
    scope: 'local',
    locationId: 'destination',
    resourceModifiers: { medical: 0.5 },
    startDay: -1,
    endDay: 1,
  });

  markets.recalculate('source', 'medical');
  markets.recalculate('destination', 'medical');

  assert.equal(markets.getEntry('source', 'medical').price, sourceBefore);
  assert(
    markets.getEntry('destination', 'medical').price > destinationBefore,
    'local market situation must raise the affected market price only'
  );
  assert.equal(situations.modifier('source', 'medical'), 0);
  assert.equal(situations.modifier('destination', 'medical'), 0.5);

  situations.advanceDay(1);
  markets.recalculate('destination', 'medical');

  assert.equal(situations.modifier('destination', 'medical'), 0);
  assert.equal(
    markets.getEntry('destination', 'medical').price,
    sourceBefore,
    'expired situation must no longer influence target price'
  );
}

{
  const situations = situationModule.createMarketSituationService([], resources, 9);
  situations.add({
    id: 'sector-steel',
    name: 'Sektorweiter Engpass',
    description: 'Test',
    scope: 'sector',
    resourceModifiers: { steel: 0.9 },
    startDay: -1,
    endDay: 5,
  });

  assert.equal(situations.modifier('source', 'steel'), 0.9);
  assert.equal(situations.modifier('destination', 'steel'), 0.9);

  situations.add({
    id: 'sector-steel-two',
    name: 'Weiterer Engpass',
    description: 'Test',
    scope: 'sector',
    resourceModifiers: { steel: 0.5 },
    startDay: -1,
    endDay: 5,
  });

  assert.equal(
    situations.modifier('source', 'steel'),
    0.9,
    'stacked positive situations must respect the +90 percent cap'
  );
}

{
  const ports = [port('source'), port('destination')];
  const first = situationModule.createMarketSituationService(ports, resources, 77);
  const second = situationModule.createMarketSituationService(ports, resources, 77);

  first.advanceDay(365);
  second.advanceDay(365);

  assert.deepEqual(
    first.active(),
    second.active(),
    'market situation generation must be deterministic for the same seed'
  );
  assert(first.active().length <= 5, 'active market situations must stay capped at five');
  for (const situation of first.active()) {
    assert(situation.endDay > first.currentDay);
    for (const modifier of Object.values(situation.resourceModifiers)) {
      assert(Number.isFinite(modifier));
    }
  }
}

const controllerSource = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
assert(
  controllerSource.includes('situations.advanceNextDay()'),
  'completed travel must advance market situations before daily price simulation'
);

console.log('PASS deterministic market situations, scoped pricing and expiry');
