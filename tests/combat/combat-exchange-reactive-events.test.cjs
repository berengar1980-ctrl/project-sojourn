'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { chooseReactiveDecision, commitReactiveDecision, initialReactionMemory } =
  loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-exchange-reactions.ts');
const ship = (x, y, vx = 0, vy = 0) => ({
  position: { x, y },
  velocity: { x: vx, y: vy },
  shieldHp: 100,
  headingRadians: 0,
  tactic: 'fight',
  subsystems: { tractor: 100 },
  setup: {
    tractorRangeMeters: 600,
    aiControlled: true,
    sensorCrewSkill: 100,
    sensorTier: 6,
    sensorRangeMeters: 1000,
    sensorRangeMultiplier: 1,
  },
});
const attacker = ship(100, 300);
const defender = ship(700, 300);
const runtime = { attacker, defender, thrownAsteroids: [], mines: [], arena: { obstacles: [] } };
const memory = initialReactionMemory(attacker, runtime);
attacker.shieldHp = 0;
assert.equal(
  chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory).kind,
  'shield_down'
);
assert.equal(
  commitReactiveDecision(
    memory,
    { kind: 'shield_down', priority: 80, critical: true, goal: attacker.position },
    1
  ),
  true
);
assert.equal(
  commitReactiveDecision(
    memory,
    { kind: 'shield_down', priority: 80, critical: true, goal: attacker.position },
    1.2
  ),
  false
);
memory.shieldHp = 0;
defender.tactic = 'flee';
assert.equal(
  chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory).kind,
  'pursuit'
);
assert.equal(
  commitReactiveDecision(
    memory,
    { kind: 'pursuit', priority: 45, critical: false, goal: defender.position },
    2
  ),
  false,
  'hysteresis prevents repeated ordinary replanning'
);
assert.equal(
  commitReactiveDecision(
    memory,
    { kind: 'pursuit', priority: 45, critical: false, goal: defender.position },
    5
  ),
  true
);
defender.tactic = 'fight';
runtime.thrownAsteroids.push({ id: 1 });
assert.equal(
  chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory).kind,
  'tractor'
);
runtime.thrownAsteroids.length = 0;
runtime.mines.push({
  id: 4,
  owner: 'defender',
  armedSeconds: 0,
  position: { x: 210, y: 300 },
  definition: { id: 'mine-ion', kind: 'ion', triggerRadiusMeters: 90, stealth: 0, tier: 1 },
});
assert.equal(chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory).kind, 'mine');
runtime.mines[0].owner = 'attacker';
assert.equal(
  chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory),
  null,
  'own mines ignored'
);
runtime.mines.length = 0;
attacker.velocity.x = 140;
defender.position.x = 270;
assert.equal(
  chooseReactiveDecision(runtime, attacker, defender, 'attacker', memory).kind,
  'collision'
);
console.log('PASS five event reaction types, own mine safety, priority and hysteresis');
