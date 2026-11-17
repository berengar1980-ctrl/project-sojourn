'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createNpcSmugglingService } = load('src/systems/economy/npc-smuggling-service.ts');
const { captureCareerNpcs, stageCareerNpcs } = load(
  'src/systems/persistence/career-npc-checkpoint.ts'
);
const npcs = createSectorNpcEconomyStates();
const smuggler = npcs.find((npc) => npc.smuggler);
const patrol = npcs.find((npc) => npc.job === 'patrol' && !npc.pirate);
assert(smuggler && patrol, 'requires live sector traffic fixtures');

const destination = narrowsSector.locations.find((location) => location.id !== smuggler.locationId);
assert(destination);
smuggler.travel = {
  finalTargetId: destination.id,
  targetLocationId: destination.id,
  routePoints: [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ],
  routeDistance: 100,
  distanceTravelled: 10,
  fuelRequired: 1,
  profile: 'safe',
  refuelStops: [],
};
smuggler.smugglingSuspicion = 40;
smuggler.smugglingPatrolElapsedSeconds = 2.5;
smuggler.smugglingInspectionCooldownSeconds = 13;
smuggler.smugglingLastArrivalId = smuggler.locationId;
const sector = { livePosition: () => ({ x: 100, y: 100 }) };
const before = createNpcSmugglingService(npcs, sector, () => {}, () => 0, 6);
before.tick(1);
assert.equal(smuggler.smugglingInspectionCooldownSeconds, 12);
assert.equal(smuggler.smugglingPatrolElapsedSeconds, 2.5);

const saved = captureCareerNpcs(narrowsSector, npcs);
const restoredNpcs = stageCareerNpcs(narrowsSector, saved);
const resumed = restoredNpcs.find((npc) => npc.id === smuggler.id);
assert(resumed);
assert.equal(resumed.smugglingInspectionCooldownSeconds, 12);
assert.equal(resumed.smugglingPatrolElapsedSeconds, 2.5);
assert.equal(resumed.smugglingLastArrivalId, smuggler.locationId);
const after = createNpcSmugglingService(restoredNpcs, sector, () => {}, () => 0, 6);
after.advanceDay(6);
assert.equal(resumed.smugglingSuspicion, 40, 'restart cannot repeat six days of decay');
after.tick(1);
before.tick(1);
assert.equal(resumed.smugglingInspectionCooldownSeconds, smuggler.smugglingInspectionCooldownSeconds);
assert.equal(resumed.smugglingPatrolElapsedSeconds, smuggler.smugglingPatrolElapsedSeconds);
after.tick(11);
before.tick(11);
assert.equal(resumed.smugglingInspectionCooldownSeconds, smuggler.smugglingInspectionCooldownSeconds);
assert.equal(after.stats.inspections, before.stats.inspections);
assert.deepEqual(resumed.cargo, smuggler.cargo);
assert.equal(resumed.smugglingSuspicion, smuggler.smugglingSuspicion);

const invalid = structuredClone(saved);
invalid.npcs.find((npc) => npc.id === smuggler.id).smugglingInspectionCooldownSeconds = -1;
assert.throws(() => stageCareerNpcs(narrowsSector, invalid), /Beschädigte NPC-Route/);
console.log('PASS NPC customs inspection, patrol and day clocks survive Career Save');
