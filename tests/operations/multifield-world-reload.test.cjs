'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { getAllShipDefinitions } = load('src/systems/ships/index.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { captureCareerFieldLegalSession, stageCareerFieldLegalSession } = load(
  'src/systems/persistence/career-field-legal-session.ts'
);

const locations = narrowsSector.locations
  .filter((location) => location.activities.mine)
  .slice(0, 2);
assert.equal(locations.length, 2, 'The real sector must contain at least two mineable fields');
const minerShip = getAllShipDefinitions().find((ship) => ship.role === 'mining');
assert(minerShip);

function minersFor(fields) {
  return fields.map((location, index) => ({
    id: 'remote-miner-' + index,
    name: 'Remote Miner ' + index,
    role: 'miner',
    job: 'miner',
    shipId: minerShip.id,
    locationId: location.id,
    workLocationId: location.id,
    autonomy: { phase: 'working' },
    cargo: {},
    cargoCapacity: 1000,
    hullHp: 100,
    hullMaxHp: 100,
    workResourceIds: [],
    workRiskPreference: 'safe',
  }));
}

function factory(miners) {
  return (location, instance, checkpoint) =>
    createNpcLocalMiningService(
      {
        locationId: location.id,
        seed: instance.seed,
        width: instance.width,
        height: instance.height,
        miners: miners.filter((npc) => npc.workLocationId === location.id),
        getAsteroids: () => instance.asteroids,
        mine: (npc, resourceId, amount) => {
          npc.cargo[resourceId] = (npc.cargo[resourceId] ?? 0) + amount;
          return amount;
        },
        depart: () => false,
      },
      checkpoint
    );
}

function ore(field) {
  return field.instance.asteroids
    .flatMap((rock) => rock.deposits)
    .reduce((sum, deposit) => sum + deposit.oreRemaining, 0);
}

function advance(world, activeLocationId, frames) {
  for (let index = 0; index < frames; index++) {
    world.tick(0.25, activeLocationId, (field, seconds) => {
      field.miners.tick(seconds);
      field.drone.tick(seconds, field.instance.asteroids, []);
    });
  }
}

function prepareMining(world) {
  for (const location of locations) {
    const field = world.field(location.id);
    assert(field);
    const ship = field.miners.ships[0];
    assert(ship, 'Each remote field needs its own real NPC miner');
    const rock = field.instance.asteroids.find(
      (entry) =>
        entry.kind === 'resource' && entry.deposits.some((deposit) => deposit.oreRemaining > 5)
    );
    assert(rock);
    ship.position = { x: rock.position.x + rock.radius + 100, y: rock.position.y };
    ship.phase = 'mining';
    ship.targetAsteroidId = rock.id;
    ship.laserActive = true;
    ship.miningAccumulator = 1.12;
  }
}

const liveMiners = minersFor(locations);
const claims = new AsteroidClaimRegistry();
const world = new AsteroidFieldWorld(locations, claims, factory(liveMiners));
prepareMining(world);
const initialOre = locations.map((location) => ore(world.field(location.id)));
advance(world, null, 100);
for (const [index, location] of locations.entries()) {
  assert(
    ore(world.field(location.id)) < initialOre[index],
    'Both distant fields must mine without any mounted player scene'
  );
  assert(
    Object.values(liveMiners[index].cargo).some((amount) => amount > 0),
    'Each remote miner must receive the extracted ore'
  );
}

const saved = captureCareerFieldLegalSession(world, claims, new SectorLegalRegistry());
const restoredMiners = JSON.parse(JSON.stringify(liveMiners));
const restored = stageCareerFieldLegalSession(
  JSON.parse(JSON.stringify(saved)),
  locations,
  factory(restoredMiners),
  restoredMiners
);
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.fields.exportState())),
  JSON.parse(JSON.stringify(saved.fields)),
  'Both remote fields must keep their miner, pirate and drone snapshots across reload'
);
for (const location of locations) {
  const original = world.field(location.id);
  const reloaded = restored.fields.field(location.id);
  assert.notStrictEqual(reloaded, original, 'Reload must construct independent field objects');
  assert.equal(ore(reloaded), ore(original), 'Reload must never regenerate previously mined ore');
}

const first = world.field(locations[0].id);
const second = world.field(locations[1].id);
advance(world, locations[0].id, 20);
advance(restored.fields, locations[0].id, 20);
advance(world, locations[1].id, 20);
advance(restored.fields, locations[1].id, 20);
assert.strictEqual(world.field(locations[0].id), first, 'Revisiting field A must not recreate it');
assert.strictEqual(world.field(locations[1].id), second, 'Visiting field B must not recreate it');
assert.deepEqual(
  JSON.parse(JSON.stringify(restored.fields.exportState())),
  JSON.parse(JSON.stringify(world.exportState())),
  'After both scene handoffs, reloaded and uninterrupted simulations must agree'
);
assert.deepEqual(
  restoredMiners.map((npc) => npc.cargo),
  liveMiners.map((npc) => npc.cargo),
  'Reload must neither lose nor duplicate NPC mining rewards'
);
console.log('PASS multi-field world: two offscreen miners, saved ore/drone state, scene handoffs');
