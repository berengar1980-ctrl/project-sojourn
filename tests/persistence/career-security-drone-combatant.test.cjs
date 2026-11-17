'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/app/game-controller-economy.ts'), 'utf8');
assert(source.includes('delete drone.travel;'));
assert(source.includes('delete drone.combatMovement;'));
assert(source.includes('delete drone.orbit;'));

const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');
const { createSectorNpcEconomyStates } = load('src/data/economy/sector-npc-economy.ts');
const { captureCareerNpcs } = load('src/systems/persistence/career-npc-checkpoint.ts');
const template = createSectorNpcEconomyStates().find((npc) => npc.job === 'patrol');
assert(template);
const field = narrowsSector.locations.find((location) => location.activities.mine);
assert(field);
const elsewhere = narrowsSector.locations.find((location) => location.id !== field.id);
assert(elsewhere);
template.orbit = {
  locationId: elsewhere.id,
  center: elsewhere.position,
  radius: 100,
  angleRadians: 0,
};
template.travel = {
  finalTargetId: elsewhere.id,
  targetLocationId: elsewhere.id,
  routePoints: [field.position, elsewhere.position],
  routeDistance: Math.hypot(
    elsewhere.position.x - field.position.x,
    elsewhere.position.y - field.position.y
  ),
  distanceTravelled: 0,
  fuelRequired: 1,
  profile: 'balanced',
  refuelStops: [],
};
const drone = {
  ...template,
  id: 'security-drone:' + field.id,
  locationId: field.id,
  homePortId: field.id,
  cargo: {},
  marketIntel: {},
  credits: 0,
};
assert.throws(
  () => captureCareerNpcs(narrowsSector, [drone]),
  /Beschädigte NPC-Route/,
  'copied patrol movement is not a valid local security drone'
);
delete drone.travel;
delete drone.combatMovement;
delete drone.orbit;
assert.equal(captureCareerNpcs(narrowsSector, [drone]).npcs.length, 1);
console.log('PASS fresh security drone never inherits another patrol ship movement or orbit');
