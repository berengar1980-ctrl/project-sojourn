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
const { getShipDefinition } = load('src/systems/ships/ship-registry.ts');
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
const { createTradeCharterService } = load('src/systems/economy/trade-charter-service.ts');
const { createSmugglingService } = load('src/systems/economy/smuggling-service.ts');
const { createFactionReputationService } = load(
  'src/systems/reputation/faction-reputation-service.ts'
);
const { factionDefinitions } = load('src/data/factions/faction-manifest.ts');
const { captureCareerPlayerSociety } = load('src/systems/persistence/career-player-society.ts');
const { createShipOwnershipService } = load('src/systems/ships/ship-ownership-service.ts');
const { createShipLoadoutService } = load('src/systems/ships/ship-loadout-service.ts');
const { createShipComponentInventoryService } = load(
  'src/systems/ships/ship-component-inventory-service.ts'
);
const { createShipyardResearchService } = load('src/systems/ships/shipyard-research-service.ts');
const { createShipOperatingService } = load('src/systems/ships/ship-operating-costs.ts');
const { captureCareerPlayerShipSession } = load('src/systems/ships/career-player-ship-session.ts');
const { captureCareerEconomySession } = load('src/systems/economy/career-economy-session.ts');
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
const { prepareControllerCareer } = load('src/app/game-controller-career-resume.ts');
const { controllerEconomyFromCareer } = load('src/app/game-controller-career-economy.ts');
const { bindCareerFieldWorld } = load('src/app/game-controller-field-world-bridge.ts');
const { permanentSalvageField } = load('src/app/game-controller-salvage-stocks.ts');
const { salvageStockId } = load('src/systems/salvage/salvage-stock-id.ts');
const { createCareerSessionManager } = load('src/systems/persistence/career-session-manager.ts');
const { createCareerSaveStore, CAREER_SAVE_STORAGE_KEY } = load(
  'src/systems/persistence/career-save-store.ts'
);
const { createCareerSessionSlot } = load('src/systems/persistence/career-session-transaction.ts');

const world = narrowsSector;
const seed = 41;
const ship = getShipDefinition('salvage-100m-variant-01');
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
const factionIds = factionDefinitions.map((definition) => definition.id);
const society = captureCareerPlayerSociety({
  charter: createTradeCharterService(trade.player),
  smuggling: createSmugglingService(trade.player, []),
  reputation: createFactionReputationService(factionIds),
});
const ships = captureCareerPlayerShipSession(
  trade.player,
  ship.id,
  ownership,
  loadouts,
  inventory,
  research,
  operating
);
const crew = createCrewRosterService(profile);
const npcs = [];
const situations = createMarketSituationService(sectorPorts, economyResources, seed);
const simulation = createEconomySimulationService(
  markets,
  trade.player,
  economyResources,
  seed,
  npcs
);
const intel = createMarketIntelService(markets);
const npcEconomy = createNpcEconomyService(markets, simulation, economyResources, npcs);
const economy = captureCareerEconomySession({
  markets,
  simulation,
  situations,
  intel,
  npcs: npcEconomy,
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
  population,
  sector,
  blockades,
  patrol,
  salvageEvents,
});
const minerFactory = (location, instance, checkpoint) =>
  createNpcLocalMiningService(
    {
      locationId: location.id,
      seed: instance.seed,
      width: instance.width,
      height: instance.height,
      miners: [],
      getAsteroids: () => instance.asteroids,
      mine: () => 0,
      depart: () => false,
    },
    checkpoint
  );
const legal = new SectorLegalRegistry();
const claims = new AsteroidClaimRegistry();
const fieldWorld = new AsteroidFieldWorld(world.locations, claims, minerFactory);
const fieldsLegal = captureCareerFieldLegalSession(fieldWorld, claims, legal);
const snapshot = {
  version: 1,
  sections: {
    navigation: nav.exportState(),
    player: { version: 1, profile, controllerSecondsIntoDay: 94.5, player: ships.player, society },
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
  factionIds,
  economySeed: seed,
  starterShipId: ship.id,
  profile,
  initialCruiseSpeed: 100,
  campaignDefinitions: [],
  makeMinerFactory: () => minerFactory,
  campaignActions: () => ({ apply: () => true }),
  combatSetups: () => {
    throw new Error('Unexpected combat in this save');
  },
};
const original = { old: true };
const slot = createCareerSessionSlot(original);
const staged = stageCareerFullSession(snapshot, options);
assert.strictEqual(slot.current(), original, 'staging must not activate new authority');
assert.strictEqual(staged.commerce.ships.trade, staged.commerce.commerce.trade);
assert.equal(staged.controllerSecondsIntoDay, 94.5, 'fractional economy day must survive restore');
assert.strictEqual(staged.operations.sector.npcs, staged.commerce.commerce.npcs);
assert.deepEqual(staged.fieldsLegal.fields.exportState(), fieldsLegal.fields);
assert.deepEqual(staged.crew.exportState(), snapshot.sections.crew);
assert.deepEqual(staged.navigationWorld.navigation.exportState(), snapshot.sections.navigation);
assert.deepEqual(
  JSON.parse(JSON.stringify(captureCareerFullSession(staged, world))),
  JSON.parse(JSON.stringify(snapshot))
);
slot.install(staged);
staged.activate();
assert.strictEqual(slot.current(), staged);

const preparedBrowser = prepareControllerCareer(JSON.parse(JSON.stringify(snapshot)));
const controllerEconomy = controllerEconomyFromCareer(preparedBrowser.session, () => {});
assert.strictEqual(controllerEconomy.trade, preparedBrowser.session.commerce.commerce.trade);
assert.strictEqual(
  controllerEconomy.markets,
  preparedBrowser.session.commerce.commerce.economy.markets
);
assert.strictEqual(controllerEconomy.npcs, preparedBrowser.session.commerce.commerce.economy.npcs);
assert.strictEqual(controllerEconomy.sectorNpcs, preparedBrowser.session.operations.sector);
assert.strictEqual(controllerEconomy.asteroidClaims, preparedBrowser.session.fieldsLegal.claims);
assert.strictEqual(controllerEconomy.legal, preparedBrowser.session.fieldsLegal.legal);
assert.deepEqual(preparedBrowser.session.profile, profile);
assert.deepEqual(controllerEconomy.trade.player, staged.commerce.commerce.trade.player);

// Simulate a real game session: purchase goods, close the process by persisting
// only localStorage JSON, construct fresh services and continue from that state.
const beforeRestart = prepareControllerCareer(JSON.parse(JSON.stringify(snapshot)));
const liveTrade = beforeRestart.session.commerce.commerce.trade;
const liveMarkets = beforeRestart.session.commerce.commerce.economy.markets;
const candidate = liveMarkets
  .snapshot()
  .flatMap((market) =>
    Object.values(market.entries).map((entry) => ({ port: market.locationId, entry }))
  )
  .find(({ entry }) => entry.stock >= 4 && entry.price * 3 < liveTrade.player.credits);
assert(candidate, 'a real market must support an affordable purchase');
const { port, entry } = candidate;
const beforeStock = liveMarkets.getEntry(port, entry.resourceId).stock;
const beforeCredits = liveTrade.player.credits;
const purchase = liveTrade.buy(port, entry.resourceId, 3, 1000);
assert(purchase && purchase.quantity === 3, 'purchase must execute through the live wallet');
assert.equal(liveTrade.player.credits, beforeCredits + purchase.creditsDelta);
assert.equal(liveMarkets.getEntry(port, entry.resourceId).stock, beforeStock - 3);
const postPurchase = captureCareerFullSession(beforeRestart.session, world);
const restartedData = new Map();
const restartedStore = createCareerSaveStore({
  getItem: (key) => restartedData.get(key) ?? null,
  setItem: (key, value) => restartedData.set(key, value),
});
restartedStore.save(postPurchase);
const savedEnvelope = restartedData.get(CAREER_SAVE_STORAGE_KEY);
assert.equal(typeof savedEnvelope, 'string');
const restoredEnvelope = createCareerSaveStore({
  getItem: (key) => restartedData.get(key) ?? null,
  setItem: (key, value) => restartedData.set(key, value),
}).read();
assert(restoredEnvelope.ok, 'a freshly created store must open the persisted JSON');
const resumed = prepareControllerCareer(restoredEnvelope.snapshot);
const resumedTrade = resumed.session.commerce.commerce.trade;
const resumedMarkets = resumed.session.commerce.commerce.economy.markets;
assert.notStrictEqual(resumedTrade, liveTrade, 'restart must build fresh service instances');
assert.notStrictEqual(resumedMarkets, liveMarkets);
assert.equal(resumedTrade.player.credits, liveTrade.player.credits);
assert.deepEqual(resumedTrade.player.cargo, liveTrade.player.cargo);
assert.deepEqual(
  resumedMarkets.getEntry(port, entry.resourceId),
  liveMarkets.getEntry(port, entry.resourceId)
);
assert.equal(resumed.session.controllerSecondsIntoDay, 94.5);
assert.deepEqual(resumed.session.crew.exportState(), beforeRestart.session.crew.exportState());
assert.deepEqual(
  resumed.session.commerce.ships.operating.snapshotAll(),
  beforeRestart.session.commerce.ships.operating.snapshotAll()
);

// Both timelines must produce the same single sale and next economic day,
// proving that loading does not pay or consume the previous purchase twice.
for (const timeline of [beforeRestart.session, resumed.session]) {
  const sale = timeline.commerce.commerce.trade.sell(port, entry.resourceId, 2);
  assert(sale && sale.quantity === 2);
  timeline.commerce.commerce.economy.simulation.advanceNextDay();
  timeline.commerce.commerce.economy.npcs.advanceNextDay();
  timeline.commerce.commerce.economy.situations.advanceNextDay();
}
assert.equal(resumedTrade.player.credits, liveTrade.player.credits);
assert.deepEqual(resumedTrade.player.cargo, liveTrade.player.cargo);
assert.deepEqual(
  resumed.session.commerce.commerce.economy.simulation.exportState(),
  beforeRestart.session.commerce.commerce.economy.simulation.exportState(),
  'economy day continues identically without double-production'
);
assert.deepEqual(
  resumed.session.commerce.commerce.economy.markets.snapshot(),
  beforeRestart.session.commerce.commerce.economy.markets.snapshot(),
  'market inventory and prices continue identically'
);

// A tampered envelope must not alter the active game or the stored bytes.
const tampered = JSON.parse(savedEnvelope);
tampered.payload = tampered.payload.slice(0, -1) + 'x';
restartedData.set(CAREER_SAVE_STORAGE_KEY, JSON.stringify(tampered));
const compromised = restartedStore.read();
assert.equal(compromised.ok, false);
assert.equal(compromised.reason, 'corrupt');
assert.equal(resumedTrade.player.credits, liveTrade.player.credits);
assert.deepEqual(resumedTrade.player.cargo, liveTrade.player.cargo);
resumed.session.campaigns.campaigns.destroy();
beforeRestart.session.campaigns.campaigns.destroy();

const damagedClock = JSON.parse(JSON.stringify(snapshot));
damagedClock.sections.player.controllerSecondsIntoDay = 180;
assert.throws(() => stageCareerFullSession(damagedClock, options), /economic day clock/);
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

function bindPhysicalCareer(session) {
  const context = {
    economy: controllerEconomyFromCareer(session, () => {}),
    state: { mode: 'star-map', salvageScene: null, salvageEventFields: new Map() },
  };
  bindCareerFieldWorld(context, session.fieldsLegal.fields);
  return context;
}

function verifyPhysicalCareerRoundTrip() {
  const originalSession = prepareControllerCareer(JSON.parse(JSON.stringify(snapshot))).session;
  const originalContext = bindPhysicalCareer(originalSession);
  const originalEconomy = originalContext.economy;
  const location = world.locations.find((item) => item.id === 'greyrock-belt');
  const red = world.locations.find((item) => item.activities.salvage && item.dangerLevel === 3);
  assert(location && red);
  const instance = originalSession.fieldsLegal.fields.field(location.id).instance;
  const rock = instance.asteroids.find((item) => item.deposits.some((d) => d.oreRemaining >= 6));
  assert(rock);
  const ore = rock.deposits.find((item) => item.oreRemaining >= 6);
  const rockSource = JSON.stringify([location.id, rock.id]);
  const oreStock = originalEconomy.simulation.getPhysicalStock(ore.resourceId, rockSource);
  assert.equal(oreStock, ore.oreRemaining);
  ore.oreRemaining -= 6;
  const chunk = {
    id: 'chunk-' + instance.seed + '-1',
    sourceAsteroidId: rock.id,
    resourceId: ore.resourceId,
    position: { x: 500, y: 500 },
    velocity: { x: 1, y: 2 },
    amount: 6,
    ageSeconds: 0,
    tractorActive: false,
    tractorHardpointId: null,
  };
  instance.chunks.push(chunk);
  const mined = originalEconomy.mining.collect(ore.resourceId, 2, 1000, location.id, rockSource);
  assert.equal(mined, 2);
  chunk.amount -= mined;
  const field = permanentSalvageField(originalContext, red);
  const wreck = field.wrecks.find((item) => item.resources.some((d) => d.remainingAmount >= 4));
  assert(wreck);
  const deposit = wreck.resources.find((item) => item.remainingAmount >= 4);
  const source = salvageStockId(field, wreck);
  const amount = originalEconomy.salvage.recover(deposit.resourceId, 3, 1000, red.id, source);
  assert.equal(amount, 3);
  deposit.remainingAmount -= amount;
  originalEconomy.wreckClaims.rememberField(field);
  const saved = captureCareerFullSession(originalSession, world);
  const reloaded = prepareControllerCareer(JSON.parse(JSON.stringify(saved))).session;
  const resumedContext = bindPhysicalCareer(reloaded);
  const restoredEconomy = resumedContext.economy;
  assert.deepEqual(
    restoredEconomy.simulation.exportState(),
    originalEconomy.simulation.exportState()
  );
  const restoredInstance = reloaded.fieldsLegal.fields.field(location.id).instance;
  const restoredRock = restoredInstance.asteroids.find((item) => item.id === rock.id);
  const restoredOre = restoredRock.deposits.find((item) => item.resourceId === ore.resourceId);
  assert.equal(restoredOre.oreRemaining, ore.oreRemaining);
  assert.equal(restoredInstance.chunks[0].amount, 4);
  assert.equal(
    restoredEconomy.simulation.getPhysicalStock(ore.resourceId, rockSource),
    oreStock - 2
  );
  const restoredField = permanentSalvageField(resumedContext, red);
  const restoredWreck = restoredField.wrecks.find((item) => item.id === wreck.id);
  const restoredDeposit = restoredWreck.resources.find(
    (item) => item.resourceId === deposit.resourceId
  );
  assert.equal(restoredDeposit.remainingAmount, deposit.remainingAmount);
  assert.equal(
    restoredEconomy.simulation.getPhysicalStock(deposit.resourceId, source),
    deposit.remainingAmount
  );
  const timelines = [
    { economy: originalEconomy, chunk, deposit, field },
    {
      economy: restoredEconomy,
      chunk: restoredInstance.chunks[0],
      deposit: restoredDeposit,
      field: restoredField,
    },
  ];
  for (const timeline of timelines) {
    const { economy } = timeline;
    assert.equal(economy.mining.collect(ore.resourceId, 1, 1000, location.id, rockSource), 1);
    timeline.chunk.amount -= 1;
    assert.equal(economy.salvage.recover(deposit.resourceId, 1, 1000, red.id, source), 1);
    timeline.deposit.remainingAmount -= 1;
    economy.wreckClaims.rememberField(timeline.field);
    economy.simulation.advanceNextDay();
  }
  assert.deepEqual(restoredEconomy.trade.player.cargo, originalEconomy.trade.player.cargo);
  assert.deepEqual(
    restoredEconomy.simulation.exportState(),
    originalEconomy.simulation.exportState()
  );
  originalSession.campaigns.campaigns.destroy();
  reloaded.campaigns.campaigns.destroy();
}

verifyPhysicalCareerRoundTrip();
console.log('PASS full Career Save: physical ore, chunks, wreck stock and continued transactions');
