'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const navigationModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/navigation-service.ts'
);
const mapModule = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const shipModule = loadStandaloneTypeScriptModule(root, 'src/systems/ships/ship-registry.ts');

const ship = shipModule.getShipDefinition('miner-80m-variant-01');
assert(ship);
const navigation = navigationModule.createNavigationService(
  mapModule.narrowsSector,
  mapModule.narrowsSector.startLocationId,
  ship.navigation.cruiseSpeed
);

const start = navigation.getSnapshot().currentPosition;
const target = { x: start.x + 600, y: start.y + 180 };
navigation.startPursuit('npc-test', target);

assert.equal(navigation.getSnapshot().isPursuing, true);
assert.equal(navigation.getSnapshot().pursuitTargetId, 'npc-test');
assert.equal(navigation.getSnapshot().currentLocationId, null);

const initialDistance = Math.hypot(target.x - start.x, target.y - start.y);
for (let step = 0; step < 80; step += 1) navigation.tick(0.1);
const pursued = navigation.getSnapshot();
const pursuedDistance = Math.hypot(
  target.x - pursued.currentPosition.x,
  target.y - pursued.currentPosition.y
);
assert(pursuedDistance < initialDistance, 'pursuit must physically close on moving contacts');

navigation.updatePursuitTarget({ x: target.x + 300, y: target.y - 250 });
for (let step = 0; step < 20; step += 1) navigation.tick(0.1);
assert.notEqual(
  navigation.getSnapshot().headingRadians,
  pursued.headingRadians,
  'pursuit heading must follow target movement'
);

navigation.stopPursuit();
const destination = mapModule.narrowsSector.locations.find(
  (location) => location.id !== mapModule.narrowsSector.startLocationId
);
assert(destination);
navigation.selectDestination(destination.id);
navigation.startTravel();
const deepSpaceTravel = navigation.getSnapshot();

assert.equal(deepSpaceTravel.isTravelling, true);
assert.equal(
  deepSpaceTravel.activeRoute?.fromId,
  'deep-space',
  'a ship must be able to resume normal navigation after combat in open space'
);

console.log('PASS moving-target pursuit and deep-space recovery navigation');
