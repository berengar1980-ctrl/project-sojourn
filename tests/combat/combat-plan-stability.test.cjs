'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (p) => loadStandaloneTypeScriptModule(root, p);
const executor = load('src/systems/combat/combat-plan-executor.ts');
const targeting = load('src/systems/combat/combat-subsystem-targeting.ts');
const intent = load('src/systems/combat/combat-intent-labels.ts');

const ship = (x) => ({
  position: { x, y: 500 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  hullHp: 100,
  hullMaxHp: 100,
  shieldHp: 100,
  tactic: 'fight',
  mineStock: [],
  subsystems: { engine: 100, tractor: 0 },
  strategy: { kind: 'skirmish', focus: 'turret', desiredRange: 500, phase: 'fire' },
  setup: { weapons: [], preferredTactic: 'fight' },
});
const pursuer = ship(250);
const target = ship(900);

assert.equal(executor.executeCombatPlan(pursuer, target), 'fire',
  'previously firing ship must not oscillate at the original 1.2x range boundary');
target.position.x = 920;
assert.equal(executor.executeCombatPlan(pursuer, target), 'reach_range',
  'a genuinely out-of-range target should trigger pursuit');
target.position.x = 530;
assert.equal(executor.executeCombatPlan(pursuer, target), 'reach_range',
  'a very close collision approach still requires corrective movement');
target.position.x = 710;
assert.equal(executor.executeCombatPlan(pursuer, target), 'fire',
  'the stabilized weapon envelope should resume firing');
target.tactic = 'flee';
target.shieldHp = 0;
target.headingRadians = 0;
target.subsystems.engine = 100;
assert(targeting.canEngagePreferredSubsystem(pursuer, target),
  'unexposed enemy engines must never suppress all otherwise valid hull shots');
assert.equal(intent.describeCombatIntent(pursuer), 'UNBEWAFFNET · DISTANZ HALTEN');

console.log('PASS stable combat firing envelope, no soft-lock on fleeing engine and useful unarmed status');
