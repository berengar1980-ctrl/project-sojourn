'use strict';

const assert = require('node:assert/strict');

function createIntegratedFieldAudit(load, world, physical, npcs, sector, player) {
  const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
  const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
  const eventModule = load('src/systems/salvage/sector-salvage-event-service.ts');
  const { createSectorSalvageEventService } = eventModule;
  const { createNpcSalvageEventService } = load('src/systems/npcs/npc-salvage-event-service.ts');
  const { createShipyardResearchService } = load('src/systems/ships/index.ts');
  const { createSalvageEconomyService } = load('src/systems/economy/salvage-economy-service.ts');
  const bridge = load('src/app/game-controller-field-world-bridge.ts');
  const { fieldWorldFor, balanceDailyAsteroids } = bridge;
  const { recordCareerCombatWrecks } = load('src/app/game-controller-combat-wrecks.ts');
  const { permanentSalvageField } = load('src/app/game-controller-salvage-stocks.ts');
  const { salvageStockId } = load('src/systems/salvage/salvage-stock-id.ts');

  const events = createSectorSalvageEventService(world, 0x50a7a9e);
  const research = createShipyardResearchService();
  const npcSalvageEvents = createNpcSalvageEventService({ world, sector, events, research });
  const context = {
    economy: {
      simulation: physical,
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
    state: { mode: 'star-map', salvageEventFields: new Map() },
    systemLog: { write() {} },
  };
  const fields = fieldWorldFor(context);
  const miningLocations = world.locations.filter((location) => location.activities.mine);
  const salvageLocations = world.locations.filter((location) => location.activities.salvage);
  assert(miningLocations.length > 0 && salvageLocations.length > 0);
  const stats = {
    minedUnits: 0,
    recoveredUnits: 0,
    combatWrecksCreated: 0,
    combatWrecksExpired: 0,
    miningFields: miningLocations.length,
    salvageFields: salvageLocations.length,
  };

  const mine = npcs.mineLocal.bind(npcs);
  npcs.mineLocal = (npc, id, amount, source) => {
    assert(source && physical.getPhysicalStock(id, source) !== undefined);
    const accepted = mine(npc, id, amount, source);
    stats.minedUnits += accepted;
    return accepted;
  };
  const recover = npcs.salvageLocal.bind(npcs);
  npcs.salvageLocal = (npc, id, amount, source) => {
    assert(source && physical.getPhysicalStock(id, source) !== undefined);
    const accepted = recover(npc, id, amount, source);
    stats.recoveredUnits += accepted;
    return accepted;
  };

  return {
    stats,
    beginDay(day) {
      context.economy.situations.currentDay = day;
      events.advanceDay(day, { x: -99999, y: -99999 }, false);
    },
    balanceDay() {
      balanceDailyAsteroids(context, fields, null);
    },
    tick(dt) {
      npcSalvageEvents.tick();
      fields.tick(dt, null, (field, seconds) => field.miners.tick(seconds));
      fields.advanceCombatWreckLifetime(dt, (_locationId, ids) => {
        for (const id of ids) {
          physical.releasePhysicalStock(id);
          stats.combatWrecksExpired++;
        }
      });
    },
    combatEnded(snapshot, attacker) {
      const created = recordCareerCombatWrecks(context, snapshot, attacker.locationId);
      stats.combatWrecksCreated += created.length;
    },
    validate() {
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
    },
  };
}

module.exports = { createIntegratedFieldAudit };
