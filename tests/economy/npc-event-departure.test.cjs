'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { createNpcSectorService } = load('src/systems/npcs/npc-sector-service.ts');

const npc = createSectorNpcEconomyStates().find((entry) => entry.job === 'salvager');
assert(npc);
const sector = createNpcSectorService(narrowsSector, [npc]);
const home = narrowsSector.locations.find((location) => location.id === npc.homePortId);
assert(home);
const origin = sector.livePosition(npc);
const eventId = 'salvage-special-2-3';
npc.locationId = eventId;
npc.orbit = {
  locationId: eventId,
  center: { x: origin.x + 20, y: origin.y + 20 },
  radius: 0,
  angleRadians: 0,
};
const departure = sector.livePosition(npc);
const destination = home.id;
assert(sector.quoteTravel(npc, destination));
assert.equal(sector.requestTravel(npc, 'unknown-destination'), false);
assert.equal(sector.requestTravel(npc, destination, 'Bergung abgeschlossen'), true);
assert.equal(npc.travel.finalTargetId, destination);
assert.deepEqual(npc.travel.routePoints[0], departure);
assert(npc.travel.fuelRequired <= npc.fuel + 0.001);
for (let step = 0; step < 4000 && npc.travel; step++) sector.tick(0.25);
assert.equal(npc.locationId, destination);
assert.equal(npc.travel, undefined);
console.log('PASS NPC departure from a temporary salvage contact through normal sector routing');
