'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createMarketSituationService } = load('src/systems/economy/market-situation-service.ts');
const { createMarketIntelService } = load('src/systems/economy/market-intel-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createPlayerTradeService } = load('src/systems/economy/player-trade-service.ts');
const { createShipOwnershipService } = load('src/systems/ships/ship-ownership-service.ts');
const { createShipLoadoutService } = load('src/systems/ships/ship-loadout-service.ts');
const { createShipComponentInventoryService } = load(
  'src/systems/ships/ship-component-inventory-service.ts'
);
const { createShipyardResearchService } = load('src/systems/ships/shipyard-research-service.ts');
const { createShipOperatingService } = load('src/systems/ships/ship-operating-costs.ts');
const { captureCareerPlayerShipSession } = load(
  'src/systems/ships/career-player-ship-session.ts'
);
const { captureCareerCommerceSession } = load('src/systems/persistence/career-commerce-session.ts');
const { stageCareerCommerceShipSession } = load(
  'src/systems/persistence/career-commerce-ship-session.ts'
);

const ship = getAllShipDefinitions()[0];
assert(ship);
const seed = 41;
const markets = createEconomyMarketService(sectorPorts, economyResources);
const trade = createPlayerTradeService(markets);
const owned = createShipOwnershipService(ship.id, trade);
const loadouts = createShipLoadoutService();
loadouts.get(ship);
const inventory = createShipComponentInventoryService(trade.player);
const research = createShipyardResearchService();
const operating = createShipOperatingService(trade);
operating.recordHull(ship, 72, 100);
const playerShips = captureCareerPlayerShipSession(
  trade.player,
  ship.id,
  owned,
  loadouts,
  inventory,
  research,
  operating
);
const npcStates = [];
const situations = createMarketSituationService(sectorPorts, economyResources, seed);
const simulation = createEconomySimulationService(
  markets,
  trade.player,
  economyResources,
  seed,
  npcStates
);
const intel = createMarketIntelService(markets);
const npcs = createNpcEconomyService(markets, simulation, economyResources, npcStates);
const sector = captureCareerCommerceSession(trade.player, narrowsSector, npcStates, {
  markets,
  simulation,
  situations,
  intel,
  npcs,
});
const checkpoint = { version: 1, commerce: sector, ships: playerShips };
const staged = stageCareerCommerceShipSession(
  JSON.parse(JSON.stringify(checkpoint)),
  narrowsSector,
  sectorPorts,
  economyResources,
  seed,
  ship.id
);
assert.strictEqual(staged.ships.trade, staged.commerce.trade);
assert.strictEqual(staged.commerce.economy.npcs.npcs[0], undefined);
assert.equal(staged.ships.operating.snapshot(ship, 100).hullHp, 72);
const corrupted = JSON.parse(JSON.stringify(checkpoint));
corrupted.ships.player.credits += 1;
assert.throws(
  () => stageCareerCommerceShipSession(
    corrupted, narrowsSector, sectorPorts, economyResources, seed, ship.id
  ),
  /wallet mismatch/
);
assert.equal(operating.snapshot(ship, 100).hullHp, 72);
console.log('PASS combined commerce, ship and market staging shares one player authority');
