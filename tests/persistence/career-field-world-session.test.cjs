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
const { SectorLegalRegistry } = load('src/systems/operations/sector-legal-registry.ts');
const { captureCareerFieldLegalSession, stageCareerFieldLegalSession } = load(
  'src/systems/persistence/career-field-legal-session.ts'
);

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

const originalField = first.field(fieldId);
const rock = originalField.instance.asteroids.find((item) => item.kind === 'resource');
assert(rock);
const deposit = rock.deposits.find((item) => item.oreRemaining > 1);
assert(deposit);
deposit.oreRemaining -= 1;
const legal = new SectorLegalRegistry();
const complete = captureCareerFieldLegalSession(first, firstClaims, legal);
const fullRestore = stageCareerFieldLegalSession(
  JSON.parse(JSON.stringify(complete)),
  narrowsSector.locations,
  factory,
  []
);
assert.deepEqual(
  captureCareerFieldLegalSession(fullRestore.fields, fullRestore.claims, fullRestore.legal),
  complete
);
const restoredRock = fullRestore.fields
  .field(fieldId)
  .instance.asteroids.find((item) => item.id === rock.id);
assert.equal(
  restoredRock.deposits.find((item) => item.resourceId === deposit.resourceId).oreRemaining,
  deposit.oreRemaining,
  'mined ore must not reappear after restore'
);
const { addDestroyedShipWreck } = load('src/systems/salvage/combat-destruction-wreck.ts');
const combatField = {
  id: 'battle-' + fieldId,
  sourceLocationId: fieldId,
  seed: originalField.instance.seed,
  width: originalField.instance.width,
  height: originalField.instance.height,
  wrecks: [],
};
const battleWreck = addDestroyedShipWreck(
  combatField,
  { id: 'destroyed-npc', position: { x: 500, y: 500 }, hullHp: 0 },
  'battle-15',
  22
);
assert(battleWreck);
first.registerCombatWrecks(fieldId, [battleWreck]);
assert.strictEqual(first.field(fieldId).combatWrecks[0], battleWreck);
first.registerCombatWrecks(fieldId, [battleWreck]);
assert.equal(first.combatWrecks(fieldId).length, 1, 'same destroyed ship cannot be duplicated');
const initialPose = {
  position: { ...battleWreck.position },
  rotation: { ...battleWreck.rotation3d },
};
first.advanceCombatWreckMotion(0.05);
assert.notDeepEqual(battleWreck.position, initialPose.position, 'combat wrecks must drift');
assert.notDeepEqual(
  battleWreck.rotation3d,
  initialPose.rotation,
  'combat wrecks must rotate in 3D'
);
const pausedPose = {
  position: { ...battleWreck.position },
  rotation: { ...battleWreck.rotation3d },
};
first.advanceCombatWreckMotion(0.05, fieldId);
assert.deepEqual(
  battleWreck.position,
  pausedPose.position,
  'active salvage/combat owns its own drift'
);
assert.deepEqual(battleWreck.rotation3d, pausedPose.rotation, 'skip prevents double integration');
battleWreck.position = { x: 700, y: 720 };
battleWreck.rotation3d = { x: 0.4, y: 0.5, z: 1.4 };
first.advanceCombatWreckMotion(0.05, fieldId);
first.advanceCombatWreckMotion(0.05);
assert(
  Math.hypot(battleWreck.position.x - 700, battleWreck.position.y - 720) < 1,
  'background physics must resume from the live salvage/combat pose, not an old cached body'
);
assert(battleWreck.rotation3d.x > 0.4, '3D rotation must continue from the live pose');
const combatSave = first.exportState();
const combatRestore = new AsteroidFieldWorld(
  narrowsSector.locations,
  freshClaims,
  factory,
  JSON.parse(JSON.stringify(combatSave)),
  []
);
assert.deepEqual(combatRestore.exportState(), combatSave);
const restoredWreck = combatRestore.combatWrecks(fieldId)[0];
assert.equal(restoredWreck.combatWreckVariant, battleWreck.combatWreckVariant);
restoredWreck.resources[0].remainingAmount -= 1;
assert.notEqual(
  restoredWreck.resources[0].remainingAmount,
  battleWreck.resources[0].remainingAmount
);
combatRestore.reconcileCombatWrecks(fieldId, []);
assert.equal(combatRestore.combatWrecks(fieldId).length, 0);
const invalidWreckSave = JSON.parse(JSON.stringify(combatSave));
invalidWreckSave.combatWrecksByLocation[fieldId][0].position.x = Infinity;
assert.throws(
  () => new AsteroidFieldWorld(narrowsSector.locations, freshClaims, factory, invalidWreckSave, []),
  /Invalid saved combat wreck field/
);
console.log('PASS local field session: all fields staged, miner/drone/pirate state isolated');
