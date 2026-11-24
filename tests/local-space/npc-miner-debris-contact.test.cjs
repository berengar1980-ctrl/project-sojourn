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
  physics: { mass: 50, velocity: { x: 0, y: 0 }, angularVelocity: 0 },
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
miner.speed = 92;
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
assert(debris.physics.velocity.x > 0, 'small asteroid must receive outward momentum');

npc.combatMovement = { mode: 'engaged' };
miner.position = { x: 100, y: 100 };
miner.speed = 46;
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

console.log('PASS miners push light debris without route deadlock or double combat motion');
