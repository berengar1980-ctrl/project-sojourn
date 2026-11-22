'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { createConflictManager } = loadStandaloneTypeScriptModule(
  path.resolve(__dirname, '../..'),
  'src/systems/combat/fleet-conflict-manager.ts'
);

const members = [
  { id: 'player', role: 'player' },
  { id: 'miner', role: 'npc', civilianRole: 'miner', armed: false },
  { id: 'freighter', role: 'npc', civilianRole: 'freighter' },
  { id: 'patrol', role: 'npc', civilianRole: 'patrol', armed: true },
  { id: 'drone', role: 'drone' },
  { id: 'drone2', role: 'drone' },
  { id: 'pirate-a1', role: 'pirate', pirateGroup: 'a' },
  { id: 'pirate-a2', role: 'pirate', pirateGroup: 'a' },
  { id: 'pirate-b1', role: 'pirate', pirateGroup: 'b' },
];

const manager = createConflictManager(members);
const hostile = (a, b) => manager.isHostile(a, b);
assert.equal(hostile('pirate-a1', 'pirate-a2'), false);
assert.equal(hostile('pirate-a1', 'pirate-b1'), true);
assert.equal(hostile('pirate-a1', 'player'), true);
assert.equal(hostile('drone', 'pirate-a1'), true);
assert.equal(hostile('drone', 'player'), false);
assert.equal(hostile('drone', 'miner'), false);
assert.equal(hostile('player', 'miner'), false);

// A civilian attacks the player: the witnessing drone protects the player.
manager.recordAttack({ attackerId: 'miner', victimId: 'player', witnessedBy: ['drone'] });
assert.equal(hostile('drone', 'miner'), true);
assert.equal(hostile('drone', 'player'), false);
assert.equal(hostile('drone2', 'miner'), false, 'no omniscient intervention');

// Player attacks civilian: drone protects the civilian, including if pirates
// also arrive. The pirate and player remain independently hostile.
manager.clearEncounter();
manager.recordAttack({ attackerId: 'player', victimId: 'miner', witnessedBy: ['drone'] });
assert.equal(hostile('drone', 'player'), true);
assert.equal(hostile('drone', 'miner'), false);
assert.equal(hostile('drone', 'pirate-a1'), true);
assert.equal(hostile('pirate-a1', 'player'), true);
assert.equal(hostile('pirate-b1', 'pirate-a1'), true);

// Player is defended by a capable NPC when pirates attack.
manager.clearEncounter();
manager.recordAttack({
  attackerId: 'pirate-a1',
  victimId: 'player',
  witnessedBy: ['patrol', 'freighter', 'drone'],
});
assert.equal(hostile('patrol', 'pirate-a1'), true);
assert.equal(hostile('freighter', 'player'), false);
assert.equal(hostile('drone', 'pirate-a1'), true);
assert.equal(hostile('patrol', 'player'), false);

// Neutral NPC victims get the same protection.
manager.clearEncounter();
manager.recordAttack({
  attackerId: 'pirate-b1',
  victimId: 'freighter',
  witnessedBy: ['patrol', 'drone'],
});
assert.equal(hostile('patrol', 'pirate-b1'), true);
assert.equal(hostile('drone', 'freighter'), false);

// Neutral bystanders do not instantly become a common alliance.
manager.clearEncounter();
manager.recordAttack({ attackerId: 'miner', victimId: 'freighter', witnessedBy: [] });
assert.equal(hostile('drone', 'miner'), false);
assert.equal(hostile('miner', 'freighter'), true);
assert.equal(hostile('freighter', 'miner'), true);
assert.equal(hostile('drone', 'pirate-a1'), true);

// Invalid members and fabricated witnesses cannot silently set hostilities.
assert.throws(() => createConflictManager([{ id: 'x', role: 'pirate' }]), /pirateGroup/);
assert.throws(() => manager.recordAttack({
  attackerId: 'player', victimId: 'miner', witnessedBy: ['unknown'],
}), /Unknown conflict participant/);
assert.equal(manager.hostility()('drone', 'pirate-b1'), true);
console.log('PASS: multi-party conflict rules, player/NPC victim protection, pirates, and observed drone intervention');
