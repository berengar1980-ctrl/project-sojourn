'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const { addDestroyedShipWreck } = load('src/systems/salvage/combat-destruction-wreck.ts');
const { salvageFieldPhysicsBodies, syncSalvagePhysicsContacts } = load(
  'src/systems/salvage/salvage-container-motion.ts'
);
const { planPointRoute } = load('src/systems/local-space/local-space-navigation.ts');
const { resolveShieldCollisions } = load('src/systems/local-space/local-space-collision.ts');
const { createSalvageFieldService } = load('src/systems/salvage/salvage-field-service.ts');

const field = {
  id: 'wreck-contact-test',
  sourceLocationId: 'wreck-contact-test',
  seed: 100,
  width: 1800,
  height: 1400,
  wrecks: [],
};
const wreck = addDestroyedShipWreck(
  field,
  { id: 'lost-frigate', position: { x: 650, y: 700 }, hullHp: 0 },
  'encounter', 40, () => 0.5
);
assert(wreck, 'combat destruction must produce a recoverable wreck');
const bodies = salvageFieldPhysicsBodies(field);
assert.equal(bodies.length, 1, 'one saved wreck maps to one physical body');
assert.equal(bodies[0].kind, 'resource', 'combat wrecks are heavy solid sections');
assert.equal(bodies[0].routeBlocking, true, 'combat wrecks must block navigation');

const plan = planPointRoute({
  start: { x: 200, y: 700 },
  target: { x: 1100, y: 700 },
  asteroids: bodies,
  clearance: 60,
  width: field.width,
  height: field.height,
});
assert(plan.route.length > 2, 'a route crossing the wreck must detour around its hull');

const startingPosition = { ...wreck.position };
const impacts = resolveShieldCollisions(
  {
    position: { x: wreck.position.x - 8, y: wreck.position.y },
    headingRadians: 0,
    speed: 20,
    turnRateRadiansPerSecond: 0,
    angularThrust: 0,
    lateralThrust: 0,
  },
  { x: 20, y: 0 },
  bodies,
  { centerOffset: { x: 0, y: 0 }, radiusX: 24, radiusY: 18 }
);
assert(impacts.some((hit) => hit.asteroidId === wreck.id), 'ship shields must collide with saved wreck');
syncSalvagePhysicsContacts(field);
assert.notDeepEqual(wreck.position, startingPosition, 'wreck collision impulses reach saved position');

const salvage = createSalvageFieldService({
  field,
  setup: { available: true, cargoCapacityTons: 100, yieldMultiplier: 1 },
  crewSkill: 10,
  collect: (_resource, requested) => requested,
});
salvage.inspectWreck(wreck.id);
const amountBefore = wreck.resources.reduce((sum, entry) => sum + entry.remainingAmount, 0);
const recovery = salvage.recoverResource(wreck.id, 'steel');
assert(recovery?.recovered > 0, 'inspected wreck permits actual resource recovery');
const amountAfter = wreck.resources.reduce((sum, entry) => sum + entry.remainingAmount, 0);
assert(amountAfter < amountBefore, 'recovery consumes finite saved wreck resources');

const local = source('src/systems/local-space/local-space-service.ts');
const wiring = source('src/app/game-controller-mining-runtime.ts');
const world = source('src/systems/operations/asteroid-field-world.ts');
const navigation = source('src/systems/local-space/local-space-wreck-navigation.ts');
const collisions = source('src/systems/local-space/local-space-wreck-contacts.ts');
assert.match(local, /additionalObstacles\?\.\(\)/, 'mining local simulation reads dynamic wreck bodies');
assert.match(local, /onAdditionalObstacleContact/, 'mining contacts synchronize wreck motion');
assert.match(local, /pointWreckAwareRouteOptions\(this\.options, target, this\.shield\)/, 'point navigation uses wreck obstacles');
assert.match(local, /resolveLocalWreckContacts\(/, 'shield contacts include real wreck bodies');
assert.match(wiring, /combatWreckPhysicsBodies\(location\.id\)/, 'controller shares world wreck colliders');
assert.match(world, /syncSalvagePhysicsContacts\(field\)/, 'contact mutations persist to salvage');
assert.match(navigation, /navigationBodies\(instance, additional\)/, 'route planner includes physical wrecks');
assert.match(collisions, /resolveShieldCollisions\(/, 'native shield collision solver is reused');
console.log('PASS recoverable combat wrecks are solid and route-blocking in local fields');
