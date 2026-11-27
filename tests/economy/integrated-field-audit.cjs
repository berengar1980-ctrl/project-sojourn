'use strict';

const assert = require('node:assert/strict');

function validateFieldStocks(fields, physical, salvageLocations, context, salvageStockId, stocks) {
  const { permanentSalvageField } = stocks;
  fields.forEachField((field) => {
    for (const asteroid of field.instance.asteroids) {
      const source = JSON.stringify([field.locationId, asteroid.id]);
      for (const deposit of asteroid.deposits) {
        const stock = physical.getPhysicalStock(deposit.resourceId, source);
        assert.equal(stock, Math.floor(deposit.oreRemaining), source + ' ore stock');
      }
    }
  });
  for (const location of salvageLocations) {
    const field = permanentSalvageField(context, location);
    for (const wreck of field.wrecks) {
      for (const deposit of wreck.resources) {
        const source = salvageStockId(field, wreck);
        const stock = physical.getPhysicalStock(deposit.resourceId, source);
        assert.equal(stock, deposit.remainingAmount);
      }
    }
  }
}

function recordWorkedSite(sites, npc, amount) {
  if (amount <= 0) return;
  const visited = (sites[npc.id] ??= []);
  if (!visited.includes(npc.locationId)) visited.push(npc.locationId);
}

function createIntegratedFieldAudit(
  load,
  world,
  physical,
  npcs,
  sector,
  player,
  lossAudit,
  profile = (_name, work) => work
) {
  const { salvageStockId } = load('src/systems/salvage/salvage-stock-id.ts');
  const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
  const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
  const eventModule = load('src/systems/salvage/sector-salvage-event-service.ts');
  const { createSectorSalvageEventService } = eventModule;
  const { createNpcSalvageEventService } = load('src/systems/npcs/npc-salvage-event-service.ts');
  const { createShipyardResearchService } = load('src/systems/ships/index.ts');
  const { createSalvageEconomyService } = load('src/systems/economy/salvage-economy-service.ts');
  const bridgePath = 'src/app/game-controller-field-world-bridge.ts';
  const stocksPath = 'src/app/game-controller-salvage-stocks.ts';
  const salvageWorldPath = 'src/app/game-controller-salvage-drone-world.ts';
  const stocks = load(stocksPath);
  const salvageWorld = load(salvageWorldPath, { [stocksPath]: stocks });
  const bridge = load(bridgePath, { [stocksPath]: stocks, [salvageWorldPath]: salvageWorld });
  const { fieldWorldFor, balanceDailyAsteroids, advanceControllerFieldWorld } = bridge;
  // The standalone loader otherwise creates another module-local WeakMap of field worlds.
  const { recordCareerCombatWrecks } = load('src/app/game-controller-combat-wrecks.ts', {
    [bridgePath]: bridge,
    [salvageWorldPath]: salvageWorld,
  });

  const events = createSectorSalvageEventService(world, 0x50a7a9e);
  const research = createShipyardResearchService();
  const npcSalvageEvents = createNpcSalvageEventService({ world, sector, events, research });
  const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
  const { getShipDefinition } = load('src/systems/ships/ship-registry.ts');
  const context = {
    economy: {
      simulation: physical,
      legal: new SectorLegalRegistry(),
      trade: { player },
      npcs,
      sectorNpcs: sector,
      asteroidClaims: new AsteroidClaimRegistry(),
      wreckClaims: new WreckClaimRegistry(),
      securityDrones: new Map(),
      localPirates: new Map(),
      situations: { currentDay: 0 },
      salvageEvents: events,
      npcSalvageEvents,
      salvage: createSalvageEconomyService(physical, { player }),
    },
    state: {
      mode: 'star-map',
      salvageEventFields: new Map(),
      activeShip: getShipDefinition(sector.npcs[0].shipId),
      combatReengageSeconds: 0,
    },
    world: { world: () => world },
    systemLog: { write() {} },
  };
  const fields = fieldWorldFor(context);
  const miningLocations = world.locations.filter((location) => location.activities.mine);
  const salvageLocations = world.locations.filter((location) => location.activities.salvage);
  assert(miningLocations.length > 0 && salvageLocations.length > 0);
  const stats = {
    minedUnits: 0,
    recoveredUnits: 0,
    miningSitesByNpc: {},
    salvageSitesByNpc: {},
    miningFields: miningLocations.length,
    salvageFields: salvageLocations.length,
  };

  trackPhysicalRecovery(npcs, physical, stats);
  const tickEvents = profile('fields.events', () => npcSalvageEvents.tick());
  const tickMining = profile('fields.mining-world', (dt) =>
    advanceControllerFieldWorld(context, dt)
  );
  const tickSalvage = profile('fields.salvage-world', (dt) =>
    salvageWorld.advanceCareerSalvageDrones(context, dt, fields)
  );

  return createFieldAuditCallbacks({
    stats,
    bridge,
    context,
    events,
    balanceDailyAsteroids,
    fields,
    lossAudit,
    tickEvents,
    tickMining,
    tickSalvage,
    recordCareerCombatWrecks,
    physical,
    salvageLocations,
    salvageStockId,
    stocks,
  });
}

function createFieldAuditCallbacks({
  stats,
  bridge,
  context,
  events,
  balanceDailyAsteroids,
  fields,
  lossAudit,
  tickEvents,
  tickMining,
  tickSalvage,
  recordCareerCombatWrecks,
  physical,
  salvageLocations,
  salvageStockId,
  stocks,
}) {
  const recordLosses = (snapshot, locationId, losses) => {
    const created = recordCareerCombatWrecks(context, snapshot, locationId, losses);
    for (const wreck of created) {
      const registered = fields.combatWrecks(locationId);
      assert(registered.includes(wreck), 'creation and expiry must share the same field world');
    }
    lossAudit.observeWrecks(losses, created, locationId);
  };
  return {
    stats,
    hooks: {
      ...bridge.fieldEngagementHooks(() => context),
      onFieldFleetLosses(snapshot, losses, locationId) {
        recordLosses(snapshot, locationId, losses);
      },
    },
    lossReport(population) {
      return lossAudit.report(population, (locationId) => fields.combatWrecks(locationId));
    },
    bindEngagements(engagements) {
      context.engagements = engagements;
    },
    beginDay(day) {
      context.economy.situations.currentDay = day;
      events.advanceDay(day, { x: -99999, y: -99999 }, false);
    },
    balanceDay() {
      balanceDailyAsteroids(context, fields, null);
    },
    tick(dt) {
      tickEvents();
      tickMining(dt);
      tickSalvage(dt);
    },
    validate() {
      validateFieldStocks(fields, physical, salvageLocations, context, salvageStockId, stocks);
    },
  };
}

module.exports = { createIntegratedFieldAudit };

function trackPhysicalRecovery(npcs, physical, stats) {
  const mine = npcs.mineLocal.bind(npcs);
  npcs.mineLocal = (npc, id, amount, source) => {
    assert(source && physical.getPhysicalStock(id, source) !== undefined);
    const accepted = mine(npc, id, amount, source);
    stats.minedUnits += accepted;
    recordWorkedSite(stats.miningSitesByNpc, npc, accepted);
    return accepted;
  };
  const recover = npcs.salvageLocal.bind(npcs);
  npcs.salvageLocal = (npc, id, amount, source) => {
    assert(source && physical.getPhysicalStock(id, source) !== undefined);
    const accepted = recover(npc, id, amount, source);
    stats.recoveredUnits += accepted;
    recordWorkedSite(stats.salvageSitesByNpc, npc, accepted);
    return accepted;
  };
}
