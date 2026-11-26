'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { npcRouteThreats, pirateHuntDestination } = load('src/systems/npcs/npc-sector-routing.ts');
const { fixedDangerAtPoint } = load('src/systems/navigation/fixed-danger-geography.ts');
const { narrowsSector } = load('src/data/maps/narrows-sector.ts');

const origin = { x: 0, y: 0 };
const pirate = {
  id: 'raider',
  pirate: true,
  pirateClass: 'raider',
  locationId: 'field',
  pirateHuntZoneId: 'field',
  pirateHuntCycles: 2,
  hullHp: 100,
  hullMaxHp: 100,
  aggression: 60,
  credits: 10000,
  fuelUse: 1,
};
const civilian = {
  id: 'civilian',
  job: 'miner',
  hullHp: 100,
  cargo: { ore: 100 },
  autonomy: { phase: 'working' },
};
const field = { id: 'field', position: origin, dangerLevel: 3, activities: { mine: true } };
const world = { locations: [field] };
assert.equal(pirateHuntDestination(world, pirate, [pirate, civilian], () => origin), null);
assert.equal(pirate.pirateHuntCycles, 1);

const contacts = Array.from({ length: 15 }, (_, index) => ({
  ...pirate,
  id: 'pirate-' + index,
}));
contacts.push({ ...pirate, id: 'retired', retiredUntilDay: 10 });
contacts.push({ ...pirate, id: 'recovering', combatRecoverySeconds: 10 });
assert.equal(npcRouteThreats(civilian, contacts, () => origin).length, 15);

const copper = narrowsSector.locations.find((location) => location.id === 'copper-crown-field');
assert(copper);
assert.equal(fixedDangerAtPoint(narrowsSector.regions, copper.position, 3), copper.dangerLevel);
console.log('PASS NPC hunting residence, active route contacts and Copper Crown geography');
