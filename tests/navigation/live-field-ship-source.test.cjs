'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const trafficPath = 'src/systems/navigation/field-traffic-obstacles.ts';
const traffic = loadStandaloneTypeScriptModule(root, trafficPath);
const { collectLiveFieldShips, bindLiveFieldShips, liveFieldBystanders } =
  loadStandaloneTypeScriptModule(root, 'src/app/game-controller-field-traffic.ts', {
    [trafficPath]: traffic,
  });
const field = { width: 1200, height: 900 };
const pose = {
  position: { x: 100, y: 200 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  speed: 30,
};
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
assert.deepEqual(
  traffic.fieldTrafficObstacles(field, 'player').map((body) => body.id),
  ['worker']
);
assert.deepEqual(
  liveFieldBystanders(field).map((body) => body.id),
  ['worker']
);
assert.equal(liveFieldBystanders(field, 'worker').length, 0);
assert.equal(liveFieldBystanders({ ...field }).length, 0);
const old = liveFieldBystanders(field)[0];
assert(old.fieldContact);
pose.position.x = 300;
assert.equal(old.position.x, 100);
assert.equal(liveFieldBystanders(field)[0].position.x, 300);
assert.equal(traffic.fieldTrafficObstacles(field, 'worker').length, 0);
const { resolveCombatBystanderContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-bystander-contacts.ts'
);
const current = liveFieldBystanders(field)[0];
const fighter = {
  setup: { id: 'fighter', shipId: 'miner-80m-variant-04' },
  position: { x: 295, y: 200 },
  velocity: { x: 80, y: 0 },
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.y);
  },
  headingRadians: 0,
};
const claimed = new Set();
const claim = (first, second) => {
  const key = JSON.stringify([first, second].sort());
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
};
resolveCombatBystanderContacts(fighter, [current], undefined, claim);
assert(fighter.position.x < 295);
assert(pose.position.x > 300, 'contact moves the original field pose');
assert(fighter.velocity.x < 80, 'the combatant loses the shared mass-based closing impulse');
assert(pose.velocity.x > 0, 'the live field ship receives the equal-and-opposite impulse');
assert.equal(current.position.x, 300, 'published snapshot remains read-only');
assert.equal(liveFieldBystanders(field)[0].position.x, pose.position.x);
const after = { ...pose.position };
// Reintroduce contact within the same fleet step; only the first claim may act.
fighter.position.x = pose.position.x - 1;
const beforeRepeat = { ...fighter.position };
resolveCombatBystanderContacts(fighter, [current], undefined, claim);
assert.deepEqual(pose.position, after);
assert.deepEqual(fighter.position, beforeRepeat);
npc.hullHp = 0;
assert.equal(current.fieldContact.apply({ x: 1, y: 0 }, 10, { x: 5, y: 0 }), null);
assert.deepEqual(pose.position, after, 'destroyed or departed bodies cannot be corrected');
npc.hullHp = 100;
npc.combatMovement = { mode: 'engaged' };
assert.equal(current.fieldContact.apply({ x: 1, y: 0 }, 10, { x: 5, y: 0 }), null);
assert.equal(liveFieldBystanders(field)[0].fieldContact, undefined);
assert.deepEqual(pose.position, after, 'combat authority must not be overwritten');
console.log('PASS shared live field source, reciprocal contact and exclusive pose ownership');
