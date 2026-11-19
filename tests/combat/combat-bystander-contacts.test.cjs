'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { resolveCombatBystanderContacts } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-bystander-contacts.ts'
);
const fighter = {
  setup: { id: 'player', shipId: 'miner-80m-variant-04' },
  position: { x: 100, y: 100 },
  velocity: { x: 80, y: 0 },
  headingRadians: 0,
  speed: 80,
};
const civilian = {
  id: 'npc-miner',
  shipId: 'miner-80m-variant-01',
  position: { x: 115, y: 100 },
  headingRadians: 0,
};
resolveCombatBystanderContacts(fighter, [civilian]);
assert(fighter.position.x < 100, 'player must not pass through a civilian ship');
assert.equal(fighter.velocity.x, 0, 'contact must cancel closing velocity');
assert.deepEqual(civilian.position, { x: 115, y: 100 }, 'PvP must not mutate civilian poses');
console.log('PASS PvP combat ship cannot pass through noncombat miner');
