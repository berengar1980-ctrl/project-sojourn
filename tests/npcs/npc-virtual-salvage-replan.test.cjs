'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const { replanNpcTravel } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/npcs/npc-sector-live-replan.ts'
);

// A temporary salvage target has coordinates and a route, but does not
// appear in world.locations. It must not be passed to planRouteFromPoint.
const world = { locations: [{ id: 'station-1' }] };
const npc = {
  travel: {
    targetLocationId: 'salvage-special-2-3',
    profile: 'safe',
    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 20 }],
    routeDistance: 102,
    distanceTravelled: 30,
    fuelRequired: 5,
    replanCooldown: 0,
  },
};
const initial = JSON.stringify(npc.travel);
const getContacts = () => {
  throw new Error('A temporary destination must not query NPC route threats');
};
const replanned = replanNpcTravel(world, npc, getContacts, 1);
assert.equal(replanned, false);
assert.equal(JSON.stringify(npc.travel), initial, 'temporary target route must remain unchanged');

console.log('PASS NPC route replan skips temporary salvage destinations');
