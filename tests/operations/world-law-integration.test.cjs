'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { createControllerEconomy } = load('src/app/game-controller-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { fieldWorldFor, advanceControllerFieldWorld } = load(
  'src/app/game-controller-field-world-bridge.ts'
);
const { registerSectorShips, advanceNpcPenalCustody } = load(
  'src/app/game-controller-law-enforcement.ts'
);

function createScenario() {
  const economy = createControllerEconomy({
    getSnapshot: () => ({ currentPosition: narrowsSector.star.position }),
  });
  economy.trade.player.credits = 200000;
  const location = narrowsSector.locations.find((entry) => entry.id === 'greyrock-belt');
  assert(location);
  const miner = economy.sectorNpcs.npcs.find(
    (npc) => npc.job === 'miner' && npc.workLocationId === location.id
  );
  assert(miner, 'Scenario requires the real Greyrock miner');
  miner.locationId = location.id;
  delete miner.travel;
  delete miner.combatMovement;
  miner.autonomy = { ...miner.autonomy, phase: 'working' };
  miner.credits = 0;
  miner.cargo = {};
  // Isolate the suspect: competing miners must not obstruct the simulated case.
  for (const other of economy.sectorNpcs.npcs) {
    if (other.id !== miner.id && other.job === 'miner' && other.workLocationId === location.id) {
      other.locationId = 'haven';
      delete other.travel;
    }
    if (other.job === 'patrol' && !other.id.startsWith('security-drone:') && !other.pirate) {
      other.locationId = 'haven';
      delete other.travel;
      delete other.combatMovement;
      other.fuelCapacity = 100000;
      other.fuel = 100000;
      other.credits = 100000;
      other.hullHp = Math.max(1, other.hullMaxHp);
    }
  }
  const logs = [];
  const context = {
    economy,
    state: { activeShip: { id: 'player-hull' }, mode: 'star-map', localSpace: null },
    world: { world: () => narrowsSector },
    systemLog: { write: (message) => logs.push(message) },
    engagements: {
      activePlayerCombat: () => false,
      engageNpcsInArena: () => false,
    },
  };
  registerSectorShips(context);
  const world = fieldWorldFor(context);
  const field = world.field(location.id);
  assert(field);
  const localMiner = field.miners.ships.find((ship) => ship.npcId === miner.id);
  assert(localMiner, 'Real NPC miner must be visible in the persistent field');
  const rock = field.instance.asteroids.find(
    (asteroid) =>
      asteroid.kind === 'resource' &&
      asteroid.deposits.some(
        (deposit) =>
          deposit.oreRemaining >= 12 && miner.workResourceIds.includes(deposit.resourceId)
      )
  );
  assert(rock, 'Generated asteroid field must supply mineable matching ore');
  rock.scanLevel = 'analyzed';
  assert(economy.asteroidClaims.register(location.id, rock, 'player', 1, 200000).ok);
  localMiner.phase = 'mining';
  localMiner.position = { x: rock.position.x + rock.radius + 105, y: rock.position.y };
  localMiner.headingRadians = Math.PI;
  localMiner.targetAsteroidId = rock.id;
  localMiner.laserActive = true;
  localMiner.miningAccumulator = 1.12;
  field.drone.restore({ ...localMiner.position }, true);
  // Ensure unrelated piracy does not interfere with this legal integration.
  for (const npc of economy.sectorNpcs.npcs) {
    if (npc.pirate && npc.locationId === location.id) {
      npc.locationId = 'blackjaw-outpost';
      delete npc.travel;
    }
  }
  return { economy, context, location, miner, localMiner, field, world, rock, logs };
}

function remoteTheftAndPursuitTest() {
  const s = createScenario();
  const oreBefore = s.rock.deposits.reduce((total, d) => total + d.oreRemaining, 0);
  const cargoBefore = Object.values(s.miner.cargo).reduce((total, value) => total + value, 0);
  for (let frame = 0; frame < 40; frame++) {
    advanceControllerFieldWorld(s.context, 0.25);
    if (s.economy.legal.debt(s.miner.shipId + ':' + s.miner.id) > 0) break;
  }
  const offenderShipId = s.miner.shipId + ':' + s.miner.id;
  const debt = s.economy.legal.debt(offenderShipId);
  assert(debt > 0, 'Offscreen NPC ore theft must create a real legal invoice');
  const oreAfter = s.rock.deposits.reduce((total, d) => total + d.oreRemaining, 0);
  const cargoAfter = Object.values(s.miner.cargo).reduce((total, value) => total + value, 0);
  assert(oreAfter < oreBefore, 'Offscreen world has to deplete the actual asteroid');
  assert(cargoAfter > cargoBefore, 'NPC theft must put real ore into offender cargo');
  assert.equal(s.economy.legal.status(offenderShipId), 'wanted');
  const sighting = s.economy.legal.latestSighting(offenderShipId);
  assert.equal(sighting.kind, 'distress');
  assert.equal(sighting.locationId, s.location.id);
  assert.equal(
    s.economy.legal.snapshot().charges.length,
    1,
    'No repeated invoice for a single sample'
  );
  const dispatched = s.economy.sectorNpcs.npcs.find(
    (npc) =>
      npc.job === 'patrol' &&
      !npc.id.startsWith('security-drone:') &&
      npc.travel?.finalTargetId === s.location.id
  );
  assert(dispatched, 'Distress must dispatch a REAL sector patrol route');
  assert.equal(dispatched.locationId, 'haven', 'Patrol must not teleport to the crime scene');
  assert.equal(dispatched.travel.distanceTravelled, 0);
  s.economy.sectorNpcs.tick(0.25);
  assert(dispatched.travel.distanceTravelled > 0, 'Patrol must physically advance on its route');
  let steps = 0;
  while (dispatched.travel && steps++ < 25000) s.economy.sectorNpcs.tick(0.25);
  assert(!dispatched.travel, 'Patrol must eventually finish its flight');
  assert.equal(dispatched.locationId, s.location.id);
  assert(s.economy.legal.isWanted(offenderShipId), 'Arrival alone must not silently cancel debt');
  assert(s.logs.some((line) => line.includes('PATROUILLE >')));
  // Return to the field: no second ore cache or NPC clone.
  s.context.state.mode = 'local-space';
  s.context.state.localSpace = {
    getSnapshot: () => ({ instance: s.field.instance, laserActive: false }),
  };
  const priorInstance = s.field.instance;
  const remainingOre = s.rock.deposits.reduce((total, d) => total + d.oreRemaining, 0);
  advanceControllerFieldWorld(s.context, 0.08);
  assert.strictEqual(fieldWorldFor(s.context).field(s.location.id).instance, priorInstance);
  assert.equal(
    s.field.instance.asteroids
      .find((r) => r.id === s.rock.id)
      .deposits.reduce((total, d) => total + d.oreRemaining, 0),
    remainingOre,
    'Re-entering a visited field must not replace or regenerate mined ore'
  );
  s.context.state.mode = 'star-map';
  s.context.state.localSpace = null;
  assert.strictEqual(
    fieldWorldFor(s.context).field(s.location.id).miners.ships,
    s.field.miners.ships
  );
  // NPC arrest remains a real port event; it cannot occur at a distant field by magic.
  s.miner.locationId = 'haven';
  delete s.miner.travel;
  s.economy.npcPrisoners.clear();
  s.economy.situations.advanceNextDay();
  advanceNpcPenalCustody(s.context);
  assert(
    s.economy.npcPrisoners.has(s.miner.id),
    'Wanted NPC should be arrested at Directorate dock'
  );
  assert.equal(s.economy.legal.status(offenderShipId), 'custody');
  let days = 0;
  while (s.economy.npcPrisoners.has(s.miner.id) && days++ < 100) {
    s.economy.situations.advanceNextDay();
    advanceNpcPenalCustody(s.context);
  }
  assert(days < 100, 'Daily prison labor should settle the outstanding charge');
  assert.equal(s.economy.legal.status(offenderShipId), 'clear');
  assert(!s.economy.npcPrisoners.has(s.miner.id));
  const ledger = s.economy.legal.snapshot();
  assert.equal(ledger.charges[0].paid, ledger.charges[0].amount);
  console.log(
    'PASS integration: physical offscreen ore theft -> drone -> warrant -> travelling patrol ' +
      '-> persistent field return -> Directorate NPC custody and debt settlement'
  );
}

remoteTheftAndPursuitTest();
