'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const resourcesSource = fs.readFileSync(
  path.join(root, 'src/data/economy/economy-resources.ts'),
  'utf8'
);
const portsSource = fs.readFileSync(path.join(root, 'src/data/ports/tutorial-ports.ts'), 'utf8');
const marketSource = fs.readFileSync(
  path.join(root, 'src/systems/economy/market-service.ts'),
  'utf8'
);
const controllerSource = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(
  resourcesSource.includes("resource('obscura'") &&
    resourcesSource.includes("resource('xeno-artifacts'") &&
    resourcesSource.includes("resource('proscribed-data'"),
  'economy catalog must include multiple illegal resources'
);
assert(
  resourcesSource.includes("'restricted'") && resourcesSource.includes("'illegal'"),
  'resource catalog must distinguish restricted and illegal legality'
);
assert(
  resourcesSource.includes("resource('steel'") &&
    resourcesSource.includes("resource('reactor-parts'") &&
    resourcesSource.includes("resource('medical'") &&
    resourcesSource.includes("resource('amasec'"),
  'economy catalog must cover produced industry, supplies and luxury goods'
);

const resourceCount = (resourcesSource.match(/resource\('/g) ?? []).length;
assert(resourceCount >= 50, 'economy catalog should expose a broad resource set');

assert(
  portsSource.includes('producedCommodityIds: [') && portsSource.includes('neededCommodityIds: ['),
  'ports must declare stable produced and required resource ids'
);
assert(
  portsSource.includes("commodity('obscura'") &&
    portsSource.includes("commodity('xeno-artifacts'"),
  'at least some demo ports must expose contraband markets'
);
assert(
  marketSource.includes('marketTargetPrice') &&
    marketSource.includes('scarcity') &&
    marketSource.includes('demandPressure') &&
    marketSource.includes('productionPressure') &&
    marketSource.includes('rolePressure'),
  'market pricing must react to stock, demand, production and economic role'
);
assert(
  marketSource.includes("resource.legality === 'illegal'") &&
    marketSource.includes("resource.legality === 'restricted'"),
  'market pricing must account for legality risk'
);
assert(
  controllerSource.includes('createEconomyMarketService(tutorialPorts, economyResources)'),
  'game controller must own persistent market state instead of rebuilding prices per view'
);

const marketModule = loadStandaloneTypeScriptModule(root, 'src/systems/economy/market-service.ts');
const resource = {
  id: 'test-good',
  name: 'Test Good',
  categoryId: 'industry',
  category: 'Industrie',
  basePrice: 100,
  legality: 'legal',
};

const abundant = marketModule.marketTargetPrice(
  resource,
  { stock: 12000, demand: 0.25, production: 0.9 },
  true,
  false
);
const scarce = marketModule.marketTargetPrice(
  resource,
  { stock: 100, demand: 0.95, production: 0.05 },
  false,
  true
);
assert(scarce > abundant, 'scarce needed goods must cost more than abundant produced goods');

const illegalPrice = marketModule.marketTargetPrice(
  { ...resource, legality: 'illegal' },
  { stock: 600, demand: 0.8, production: 0 },
  false,
  true
);
const legalPrice = marketModule.marketTargetPrice(
  resource,
  { stock: 600, demand: 0.8, production: 0 },
  false,
  true
);
assert(illegalPrice > legalPrice, 'illegal goods must include a risk premium');

console.log('PASS economy resource catalog and persistent market pricing');
