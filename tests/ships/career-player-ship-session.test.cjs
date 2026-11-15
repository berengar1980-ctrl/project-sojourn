'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createShipOwnershipService } = load('src/systems/ships/ship-ownership-service.ts');
const { createShipLoadoutService } = load('src/systems/ships/ship-loadout-service.ts');
const { createShipComponentInventoryService } = load(
  'src/systems/ships/ship-component-inventory-service.ts'
);
const { createShipyardResearchService } = load('src/systems/ships/shipyard-research-service.ts');
const { createShipOperatingService } = load('src/systems/ships/ship-operating-costs.ts');
const { createPlayerTradeService } = load('src/systems/economy/player-trade-service.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { ECONOMY_RESOURCES } = load('src/data/economy/economy-resources.ts');
const { captureCareerPlayerShipSession, stageCareerPlayerShipSession } = load(
  'src/systems/ships/career-player-ship-session.ts'
);
const ship = getAllShipDefinitions()[0];
assert(ship);
const markets = createEconomyMarketService();
const trade = createPlayerTradeService(markets);
const owned = createShipOwnershipService(ship.id, trade);
const loads = createShipLoadoutService();
loads.get(ship);
const inventory = createShipComponentInventoryService(trade.player);
const research = createShipyardResearchService();
const operating = createShipOperatingService(trade);
operating.recordHull(ship, 70, 100);
const saved = captureCareerPlayerShipSession(
  trade.player,
  ship.id,
  owned,
  loads,
  inventory,
  research,
  operating
);
const staged = stageCareerPlayerShipSession(saved, ship.id, markets, ECONOMY_RESOURCES);
assert.equal(staged.activeShipId, ship.id);
assert.equal(staged.trade.player.credits, trade.player.credits);
assert.equal(staged.operating.snapshot(ship, 100).hullHp, 70);
assert.notStrictEqual(staged.trade.player, trade.player);
assert.throws(() =>
  stageCareerPlayerShipSession(
    { ...saved, operating: [{ shipId: 'unknown', fuel: 1, damage: 0 }] },
    ship.id,
    markets,
    ECONOMY_RESOURCES
  )
);
assert.equal(operating.snapshot(ship, 100).hullHp, 70);
console.log('PASS staged player and ship session with independent wallet and operating state');
