'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { sectorPorts } = load('src/data/ports/sector-ports.ts');
const { economyResources } = load('src/data/economy/economy-resources.ts');
const { createPlayerProfile } = load('src/core/player-profile.ts');
const { getAllShipDefinitions } = load('src/systems/ships/ship-registry.ts');
const { createNavigationService } = load('src/systems/navigation/navigation-service.ts');
const { createCampaignWorldService } = load('src/systems/campaigns/campaign-world-service.ts');
const { createCrewRosterService } = load('src/systems/crew/crew-roster-service.ts');
const { createEconomyMarketService } = load('src/systems/economy/market-service.ts');
const { createEconomySimulationService } = load(
  'src/systems/economy/economy-simulation-service.ts'
);
const { createMarketSituationService } = load('src/systems/economy/market-situation-service.ts');
const { createMarketIntelService } = load('src/systems/economy/market-intel-service.ts');
const { createNpcEconomyService } = load('src/systems/economy/npc-economy-service.ts');
const { createSectorSalvageEventService } = load(
  'src/systems/salvage/sector-salvage-event-service.ts'
);
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
const { captureCareerEconomySession } = load(
  'src/systems/economy/career-economy-session.ts'
);
const { captureCareerNpcs } = load('src/systems/persistence/career-npc-checkpoint.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { createNpcPopulationService } = load('src/systems/npcs/npc-population-service.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');
const { BlockadeService } = load('src/systems/operations/blockade-service.ts');
const { PatrolCareerService } = load('src/systems/operations/patrol-career-service.ts');
const { captureCareerOperationsSession } = load(
  'src/systems/persistence/career-operations-session.ts'
);
const { captureCareerFieldLegalSession } = load(
  'src/systems/persistence/career-field-legal-session.ts'
);
const { captureCareerCustody } = load('src/systems/persistence/career-custody-checkpoint.ts');
const { stageCareerFullSession, captureCareerFullSession } = load(
  'src/systems/persistence/career-full-session.ts'
);
const { createCareerSessionManager } = load(
  'src/systems/persistence/career-session-manager.ts'
);
const { createCareerSaveStore, CAREER_SAVE_STORAGE_KEY } = load(
  'src/systems/persistence/career-save-store.ts'
);
const { createCareerSessionSlot } = load(
  'src/systems/persistence/career-session-transaction.ts'
);

const world = narrowsSector;
const seed = 41;
const ship = getAllShipDefinitions()[0];
assert(ship);
const profile = createPlayerProfile({
  portraitId: 1,
  captainName: 'Career Tester',
  shipName: 'Test Ship',
});
const nav = createNavigationService(world, world.startLocationId, 100);
const campaignWorld = createCampaignWorldService(world, nav);
const markets = createEconomyMarketService(sectorPorts, economyResources);
const trade = createPlayerTradeService(markets);
const ownership = createShipOwnershipService(ship.id, trade);
const loadouts = createShipLoadoutService();
loadouts.get(ship);
const inventory = createShipComponentInventoryService(trade.player);
const research = createShipyardResearchService();
const operating = createShipOperatingService(trade);
const ships = captureCareerPlayerShipSession(
  trade.player, ship.id, ownership, loadouts, inventory, research, operating
);
const crew = createCrewRosterService(profile);
const npcs = [];
const situations = createMarketSituationService(sectorPorts, economyResources, seed);
const simulation = createEconomySimulationService(markets, trade.player, economyResources, seed, npcs);
const intel = createMarketIntelService(markets);
const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcs);
const economy = captureCareerEconomySession({
  markets, simulation, situations, intel, npcs: npcEconomy,
});
const population = createNpcPopulationService(npcs, markets);
const sector = createNpcSectorService(world, npcs, { markets, population });
const blockades = new BlockadeService({
  sector,
  markets,
  player: trade.player,
  recordLoss: () => {},
  notice: () => {},
});
const patrol = new PatrolCareerService(world, npcs, trade.player);
const salvageEvents = createSectorSalvageEventService(world);
const operations = captureCareerOperationsSession({
  population, sector, blockades, patrol, salvageEvents,
});
const minerFactory = (location, instance, checkpoint) =>
  createNpcLocalMiningService({
    locationId: location.id,
    seed: instance.seed,
    width: instance.width,
    height: instance.height,
    miners: [],
    getAsteroids: () => instance.asteroids,
    mine: () => 0,
    depart: () => false,
  }, checkpoint);
const legal = new SectorLegalRegistry();
const claims = new AsteroidClaimRegistry();
const fieldWorld = new AsteroidFieldWorld(world.locations, claims, minerFactory);
const fieldsLegal = captureCareerFieldLegalSession(fieldWorld, claims, legal);
const snapshot = {
  version: 1,
  sections: {
    navigation: nav.exportState(),
    player: ships.player,
    ships,
    crew: crew.exportState(),
    economy,
    npcs: captureCareerNpcs(world, npcs),
    operations,
    fields: fieldsLegal.fields,
    claims: fieldsLegal.claims,
    legal: fieldsLegal.legal,
    custody: captureCareerCustody(new Set(), null),
    combat: null,
    campaigns: { snapshotVersion: 1, enabled: {}, campaigns: {} },
    world: campaignWorld.exportCareerState(),
  },
};
const options = {
  baseWorld: world,
  ports: sectorPorts,
  resources: economyResources,
  economySeed: seed,
  starterShipId: ship.id,
  profile,
  initialCruiseSpeed: 100,
  campaignDefinitions: [],
  makeMinerFactory: () => minerFactory,
  campaignActions: () => ({ apply: () => true }),
  combatSetups: () => { throw new Error('Unexpected combat in this save'); },
};
const original = { old: true };
const slot = createCareerSessionSlot(original);
const staged = stageCareerFullSession(snapshot, options);
assert.strictEqual(slot.current(), original, 'staging must not activate new authority');
assert.strictEqual(staged.commerce.ships.trade, staged.commerce.commerce.trade);
assert.strictEqual(staged.operations.sector.npcs, staged.commerce.commerce.npcs);
assert.deepEqual(staged.fieldsLegal.fields.exportState(), fieldsLegal.fields);
assert.deepEqual(staged.crew.exportState(), snapshot.sections.crew);
assert.deepEqual(staged.navigationWorld.navigation.exportState(), snapshot.sections.navigation);
assert.deepEqual(captureCareerFullSession(staged, world), snapshot);
slot.install(staged);
staged.activate();
assert.strictEqual(slot.current(), staged);
const damaged = JSON.parse(JSON.stringify(snapshot));
damaged.sections.operations.population.fundCredits = -1;
assert.throws(() => stageCareerFullSession(damaged, options));
assert.strictEqual(slot.current(), staged, 'failed restore cannot partially replace career');
const browserData = new Map();
const store = createCareerSaveStore({
  getItem: (key) => browserData.get(key) ?? null,
  setItem: (key, value) => browserData.set(key, value),
});
const manager = createCareerSessionManager(staged, world, options, store);
manager.save();
const beforeLoad = manager.current();
const loaded = manager.load();
assert.equal(loaded.ok, true);
assert.strictEqual(loaded.previous, beforeLoad);
assert.notStrictEqual(manager.current(), beforeLoad);
const afterLoad = manager.current();
browserData.set(CAREER_SAVE_STORAGE_KEY, '{invalid');
const invalidRead = manager.load();
assert.equal(invalidRead.ok, false);
assert.strictEqual(manager.current(), afterLoad);
afterLoad.campaigns.campaigns.destroy();
staged.campaigns.campaigns.destroy();
console.log('PASS full Career Save: all 14 domains staged on shared authorities, atomic install');
