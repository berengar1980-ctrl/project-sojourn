'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

const { createControllerEconomy } = load('src/app/game-controller-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { getShipDefinition } = load('src/systems/ships/index.ts');
const { fieldWorldFor, advanceControllerFieldWorld } = load(
  'src/app/game-controller-field-world-bridge.ts'
);
const { registerSectorShips, advanceNpcPenalCustody } = load(
  'src/app/game-controller-law-enforcement.ts'
);

function createScenario(exercise = false) {
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
    state: { activeShip: getShipDefinition(miner.shipId), mode: 'star-map', localSpace: null },
    world: { world: () => narrowsSector },
    systemLog: { write: (message) => logs.push(message) },
    engagements: {
      activePlayerCombat: () => false,
      finishedFieldCombatSnapshots: () => [],
      engageNpcsInArena: () => false,
    },
  };
  registerSectorShips(context);
  const world = fieldWorldFor(context, undefined, exercise ? location.id : undefined);
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
  localMiner.position = { x: rock.position.x + rock.radius + 48, y: rock.position.y };
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

// A sector duel at Greyrock uses different coordinates from the Greyrock mining field.
{
  const { context, field, location, miner } = createScenario();
  context.state.mode = 'local-space';
  context.state.localSpace = {
    getSnapshot: () => ({ instance: field.instance, laserActive: false }),
  };
  const far = { x: 50, y: 50 };
  const drone = {
    id: 'security-drone:' + location.id,
    position: far,
    hullHp: 100,
    headingRadians: 0,
    speed: 0,
  };
  const duel = { arena: {}, attacker: drone, defender: { ...drone, id: miner.id } };
  context.engagements.activeNpcCombatSnapshots = () => [duel];
  const before = { ...field.drone.position };
  advanceControllerFieldWorld(context, 0.08);
  assert(Math.hypot(before.x - field.drone.position.x, before.y - field.drone.position.y) < 100);
  duel.arena.backdropSeed = field.instance.seed;
  advanceControllerFieldWorld(context, 0.08);
  assert.deepEqual(field.drone.position, far);
}

// Pirate traffic may claim the drone after the active combat snapshots were read.
{
  const { context, field, location } = createScenario();
  const droneNpc = context.economy.sectorNpcs.npcs.find(
    (npc) => npc.id === 'security-drone:' + location.id
  );
  const overlap = field.instance.asteroids.find((body) => body.routeBlocking).position;
  field.drone.restore(overlap, true);
  droneNpc.combatMovement = { mode: 'engaged', position: { ...overlap } };
  context.state.mode = 'local-space';
  context.state.localSpace = { getSnapshot: () => ({ instance: field.instance }) };
  advanceControllerFieldWorld(context, 0.08);
  assert.deepEqual(field.drone.position, overlap, 'patrol may not move a newly engaged drone');
}

// The last native pose must survive the tick that removes the engagement.
{
  const { context, field, location, miner } = createScenario();
  const droneId = 'security-drone:' + location.id;
  const position = { x: 50, y: 50 };
  const drone = {
    id: droneId,
    position,
    hullHp: 100,
    headingRadians: 1.25,
    velocity: { x: Math.cos(1.25) * 37, y: Math.sin(1.25) * 37 },
    speed: 37,
  };
  context.engagements.finishedFieldCombatSnapshots = () => [
    {
      arena: { backdropSeed: field.instance.seed },
      attacker: drone,
      defender: { ...drone, id: miner.id },
    },
  ];
  advanceControllerFieldWorld(context, 0.08);
  assert.deepEqual(field.drone.position, position);
  assert.equal(field.drone.headingRadians, 1.25);
  assert.equal(field.drone.speed, 37);
}

{
  const { context, location } = createScenario(true);
  const simulatedFields = [];
  fieldWorldFor(context).forEachField((field) => simulatedFields.push(field.locationId));
  assert.deepEqual(simulatedFields, [location.id], 'FleetCombat only runs its scenario field');
}
