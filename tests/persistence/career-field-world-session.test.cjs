'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { AsteroidClaimRegistry } = load('src/systems/operations/asteroid-claim-registry.ts');
const { AsteroidFieldWorld } = load('src/systems/operations/asteroid-field-world.ts');
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');

const factory = (location, instance, checkpoint) =>
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
const firstClaims = new AsteroidClaimRegistry();
const first = new AsteroidFieldWorld(narrowsSector.locations, firstClaims, factory);
const saved = first.exportState();
assert(Object.keys(saved.fields).length > 0);
const freshClaims = new AsteroidClaimRegistry();
assert(freshClaims.restoreState(firstClaims.exportState()));
const second = new AsteroidFieldWorld(
  narrowsSector.locations,
  freshClaims,
  factory,
  JSON.parse(JSON.stringify(saved)),
  []
);
assert.deepEqual(second.exportState(), saved);
assert.notStrictEqual(second, first);
const fieldId = Object.keys(saved.fields)[0];
assert.notStrictEqual(second.field(fieldId), first.field(fieldId));

const damaged = JSON.parse(JSON.stringify(saved));
damaged.fields[fieldId].miners.width += 1;
assert.throws(
  () => new AsteroidFieldWorld(narrowsSector.locations, freshClaims, factory, damaged, []),
  /Miner-Spielstand/
);
const missing = JSON.parse(JSON.stringify(saved));
delete missing.fields[fieldId];
assert.throws(
  () => new AsteroidFieldWorld(narrowsSector.locations, freshClaims, factory, missing, []),
  /locations mismatch/
);
assert.deepEqual(first.exportState(), saved, 'failed staging must not mutate previous world');
console.log('PASS local field session: all fields staged, miner/drone/pirate state isolated');
