'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const file = path.resolve(__dirname, '../../src/systems/combat/combat-engagement-manager.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = module.paths;
loaded._compile(compiled, file);
const { createCombatEngagementManager } = loaded.exports;

const manager = createCombatEngagementManager();
// Two separate fights must remain separate in the same physical world.
const duel1 = manager.engage('player', 'pirate-a');
const duel2 = manager.engage('miner-1', 'pirate-b');
assert.equal(duel1.kind, 'duel');
assert.equal(duel2.kind, 'duel');
assert.notEqual(duel1.id, duel2.id);
assert.equal(manager.engagements().length, 2);
assert.equal(manager.isEngaged('miner-2'), false);

// Reinforcement upgrades ONLY the linked duel; unrelated miners remain idle.
const upgraded = manager.engage('drone-1', 'pirate-a');
assert.equal(upgraded.id, duel1.id);
assert.equal(upgraded.kind, 'fleet');
assert.deepEqual(new Set(upgraded.memberIds), new Set(['player', 'pirate-a', 'drone-1']));
assert.equal(manager.engagementFor('miner-1').id, duel2.id);

// Connecting two running engagements creates one fleet, with each ID once.
const joined = manager.engage('pirate-a', 'pirate-b');
assert.equal(joined.kind, 'fleet');
assert.equal(manager.engagements().length, 1);
assert.equal(new Set(joined.memberIds).size, 5);
for (const id of joined.memberIds) assert.equal(manager.engagementFor(id).id, joined.id);

// A former fleet must not downgrade automatically after losses.
manager.disengage('miner-1');
manager.disengage('pirate-b');
manager.disengage('drone-1');
assert.equal(manager.engagements()[0].kind, 'fleet');
manager.disengage('pirate-a');
assert.equal(manager.engagements().length, 0);
assert.equal(manager.isEngaged('player'), false);

assert.throws(() => manager.engage('player', 'player'));
assert.throws(() => manager.engage('', 'pirate'));
manager.engage('player', 'pirate-a');
manager.clear();
assert.equal(manager.engagements().length, 0);
assert.equal(manager.isEngaged('player'), false);
console.log('PASS fleet engagement topology, unique ownership and no automatic downgrade');
