'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { createNpcLocalMiningService } = load('src/systems/npcs/npc-local-mining-service.ts');
const { getShipDefinition } = load('src/systems/ships/index.ts');

const definition = getShipDefinition('miner-80m-variant-01');
assert(definition, 'real mining ship definition is required');
const npc = {
  id: 'debris-miner',
  name: 'Debris miner',
  role: 'miner',
  job: 'miner',
  shipId: definition.id,
  locationId: 'debris-field',
  workLocationId: 'debris-field',
  autonomy: { phase: 'working' },
  cargo: {},
  cargoCapacity: 100,
  hullHp: 100,
  hullMaxHp: 100,
  workResourceIds: ['ferrite'],
  workRiskPreference: 'safe',
};
const ore = {
  id: 'ore',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 950, y: 100 },
  radius: 35,
  deposits: [{ resourceId: 'ferrite', oreRemaining: 200, oreCapacity: 200 }],
};
const debris = {
  id: 'floating-fragment',
  kind: 'debris',
  routeBlocking: false,
  position: { x: 125, y: 100 },
  radius: 8,
  collisionRadius: 8,
  rotation: 0,
  physics: {
    mass: 50,
    centerOfMassOffset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    momentOfInertia: 1000,
  },
  deposits: [],
};
const service = createNpcLocalMiningService({
  locationId: 'debris-field',
  width: 1800,
  height: 800,
  seed: 42,
  miners: [npc],
  getAsteroids: () => [ore, debris],
  mine: () => 0,
  depart: () => true,
});
const miner = service.ships[0];
assert(miner);
miner.position = { x: 100, y: 100 };
miner.headingRadians = 0;
miner.velocity = { x: 92, y: 0 };
miner.phase = 'approaching';
miner.targetAsteroidId = ore.id;
delete miner.routeState;
const beforeX = miner.position.x;
service.tick(0.08);
assert(
  miner.position.x > beforeX,
  'miner must keep advancing instead of being pushed backwards by debris'
);
assert(debris.position.x > 125, 'small asteroid must be pushed aside by the NPC shield');
assert(miner.velocity.x > 0 && miner.velocity.x < 92, 'debris slows the ship without stopping it');

npc.combatMovement = { mode: 'engaged' };
miner.position = { x: 100, y: 100 };
miner.velocity = { x: 46, y: 0 };
debris.position = { x: 125, y: 100 };
const beforeRock = { ...debris.position };
service.tick(0.08);
assert.deepEqual(
  miner.position,
  { x: 100, y: 100 },
  'native duel alone owns the fighting miner pose'
);
assert.deepEqual(debris.position, beforeRock, 'field solver must not integrate a native fighter');
assert.equal(miner.speed, 46, 'duel flight speed is retained for visual thrusters');

const { resolveShipFieldDebrisContacts, resolveFieldDebrisContacts } = load(
  'src/systems/local-space/field-debris-contact.ts'
);
const { shipShieldFootprint } = load('src/core/ship-contact-geometry.ts');
const { solidFieldRockObstacles } = load('src/systems/local-space/local-asteroid-footprint.ts');
const pose = {
  position: { x: 150, y: 200 },
  headingRadians: Math.PI / 2,
  velocity: { x: 0, y: -40 },
};
const footprint = shipShieldFootprint(definition, pose.position, pose.headingRadians);
const fragment = {
  ...debris,
  position: { x: footprint.position.x, y: footprint.position.y - 10 },
  physics: {
    mass: 50,
    centerOfMassOffset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    momentOfInertia: 1000,
  },
};
const reference = structuredClone(fragment);
assert.equal(resolveShipFieldDebrisContacts(definition, pose, [fragment]), 1);
assert(fragment.physics.velocity.y < 0, 'the shared solver transfers momentum into the debris');
assert.equal(
  resolveFieldDebrisContacts(
    footprint.position,
    pose.velocity,
    [reference],
    footprint.radius,
    100000
  ),
  1
);
assert(
  reference.physics.velocity.y < 0,
  'the circle shield adapter uses the same momentum response'
);
assert.notDeepEqual(fragment.position, reference.position);
assert.notDeepEqual(fragment.physics.velocity, reference.physics.velocity);
assert.deepEqual(solidFieldRockObstacles([fragment, { ...ore, collisionRadius: 23 }]), [
  { id: ore.id, position: ore.position, radius: 23 },
]);

console.log('PASS miners push light debris without route deadlock or double combat motion');
