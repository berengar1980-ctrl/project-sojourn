'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const trafficPath = 'src/systems/navigation/field-traffic-obstacles.ts';
const traffic = loadStandaloneTypeScriptModule(root, trafficPath);
const {
  collectLiveFieldShips,
  bindLiveFieldShips,
  liveFieldBystanders,
} = loadStandaloneTypeScriptModule(root, 'src/app/game-controller-field-traffic.ts', {
  [trafficPath]: traffic,
});
const field = { width: 1200, height: 900 };
const pose = { position: { x: 100, y: 200 }, headingRadians: 0, speed: 30 };
const npc = { id: 'worker', hullHp: 100, shipId: 'miner-80m-variant-01', locationId: 'field' };
const roster = new Map([
  [npc.id, npc],
  ['dead', { ...npc, id: 'dead', hullHp: 0 }],
  ['remote', { ...npc, id: 'remote', locationId: 'elsewhere' }],
]);
bindLiveFieldShips(field, () =>
  collectLiveFieldShips('field', roster, (add) => {
    add('worker', pose);
    add('worker', pose);
    add('dead', pose);
    add('remote', pose);
  })
);
assert.deepEqual(traffic.fieldTrafficObstacles(field, 'player').map((body) => body.id), ['worker']);
assert.deepEqual(liveFieldBystanders(field).map((body) => body.id), ['worker']);
assert.equal(liveFieldBystanders(field, 'worker').length, 0);
assert.equal(liveFieldBystanders({ ...field }).length, 0);
const old = liveFieldBystanders(field)[0];
pose.position.x = 300;
assert.equal(old.position.x, 100);
assert.equal(liveFieldBystanders(field)[0].position.x, 300);
assert.equal(traffic.fieldTrafficObstacles(field, 'worker').length, 0);
console.log('PASS navigation and combat share a live field identity source');
