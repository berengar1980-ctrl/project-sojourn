'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { captureCareerNpcs, stageCareerNpcs } = load(
  'src/systems/persistence/career-npc-checkpoint.ts'
);
const npcs = createSectorNpcEconomyStates();
const salvager = npcs.find((npc) => npc.job === 'salvager');
assert(salvager);
const eventId = 'salvage-special-2-3';
salvager.salvageEventId = eventId;
salvager.travel = {
  finalTargetId: eventId,
  targetLocationId: eventId,
  routePoints: [
    { x: 100, y: 150 },
    { x: 320, y: 350 },
  ],
  routeDistance: Math.hypot(220, 200),
  distanceTravelled: 35,
  fuelRequired: 0.6,
  profile: 'safe',
  refuelStops: [],
};
const saved = captureCareerNpcs(narrowsSector, npcs);
const restored = stageCareerNpcs(narrowsSector, saved);
const loaded = restored.find((npc) => npc.id === salvager.id);
assert.equal(loaded.travel.targetLocationId, eventId);
assert.equal(loaded.travel.distanceTravelled, 35);
assert.equal(loaded.salvageEventId, eventId);

// A ship may briefly be parked at the event coordinate before resolving it.
delete salvager.travel;
salvager.locationId = eventId;
salvager.orbit = {
  locationId: eventId,
  center: { x: 320, y: 350 },
  radius: 0,
  angleRadians: 0,
};
const arriving = stageCareerNpcs(narrowsSector, captureCareerNpcs(narrowsSector, npcs));
assert.equal(arriving.find((npc) => npc.id === salvager.id).locationId, eventId);

const invalid = structuredClone(saved);
const traveler = invalid.npcs.find((npc) => npc.id === salvager.id);
traveler.travel.finalTargetId = 'salvage-special-999-999';
assert.throws(() => stageCareerNpcs(narrowsSector, invalid), /Beschädigte NPC-Route/);

const unknown = structuredClone(saved);
unknown.npcs.find((npc) => npc.id === salvager.id).salvageEventId = 'random-target';
assert.throws(() => stageCareerNpcs(narrowsSector, unknown), /Beschädigte NPC-Route/);

console.log('PASS virtual salvage travel and arrival persist without admitting arbitrary IDs');
