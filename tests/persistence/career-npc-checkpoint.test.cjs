'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { captureCareerNpcs, stageCareerNpcs } = load(
  'src/systems/persistence/career-npc-checkpoint.ts'
);
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const world = narrowsSector;
const original = createSectorNpcEconomyStates().slice(0, 3);
assert(original.length >= 2);
const from = original[0].locationId;
const target = world.locations.find((entry) => entry.id !== from);
assert(target);
const start = world.locations.find((entry) => entry.id === from).position;
const end = target.position;
const distance = Math.hypot(end.x - start.x, end.y - start.y);
original[0].travel = {
  finalTargetId: target.id,
  targetLocationId: target.id,
  routePoints: [start, end],
  routeDistance: distance,
  distanceTravelled: distance / 3,
  fuelRequired: 5,
  profile: 'balanced',
  refuelStops: [],
};
original[0].cargo.ferrite = 17;
original[1].combatMovement = {
  mode: 'pursue',
  targetKind: 'npc',
  targetId: original[0].id,
  position: { ...start },
  headingRadians: 1,
  speed: 42,
};
const saved = captureCareerNpcs(world, original);
const restored = stageCareerNpcs(world, JSON.parse(JSON.stringify(saved)));
assert.deepEqual(JSON.parse(JSON.stringify(restored)), original);
assert.notStrictEqual(restored, original);
assert.notStrictEqual(restored[0], original[0]);
restored[0].cargo.ferrite = 999;
assert.equal(original[0].cargo.ferrite, 17, 'Restored cargo must be independent');
assert.equal(saved.npcs[0].cargo.ferrite, 17, 'Captured data must be detached');
const duplicate = JSON.parse(JSON.stringify(saved));
duplicate.npcs[1].id = duplicate.npcs[0].id;
assert.throws(() => stageCareerNpcs(world, duplicate), /NPC-Kennung/);
const invalidRoute = JSON.parse(JSON.stringify(saved));
invalidRoute.npcs[0].travel.distanceTravelled = distance + 100;
assert.throws(() => stageCareerNpcs(world, invalidRoute), /NPC-Route/);
const missingTarget = JSON.parse(JSON.stringify(saved));
missingTarget.npcs[1].combatMovement.targetId = 'nonexistent-ship';
assert.throws(() => stageCareerNpcs(world, missingTarget), /Kampfzuordnung/);
const invalidCargo = JSON.parse(JSON.stringify(saved));
invalidCargo.npcs[0].cargo.ferrite = -1;
assert.throws(() => stageCareerNpcs(world, invalidCargo), /Ladung/);
assert.throws(
  () => stageCareerNpcs({ ...world, id: 'other-system' }, saved),
  /falsches Sternsystem/
);
assert.equal(original[0].travel.distanceTravelled, distance / 3);
console.log('PASS career NPC checkpoint: detached travel, cargo, combat and validation');
