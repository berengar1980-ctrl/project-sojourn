'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const fire = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-weapon-fire-control.ts'
);
const escapeLogic = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-escape-evaluation.ts'
);
const winner = loadStandaloneTypeScriptModule(root, 'src/systems/combat/combat-runtime-winner.ts');

function fireState(charges = 2, max = 2) {
  return { fireControl: { charges, max, lastShotAt: -100, nextRechargeAt: 0 } };
}

const state = fireState();
assert.equal(fire.consumeFireControl(state, 0), true);
assert.equal(state.fireControl.charges, 1);
assert.equal(fire.consumeFireControl(state, 0.44), false, 'no second pulse during global lockout');
assert.equal(fire.consumeFireControl(state, 0.45), true, 'second pulse at minimum interval');
assert.equal(state.fireControl.charges, 0);
assert.equal(fire.consumeFireControl(state, 0.79), false, 'empty charge bank cannot fire');
fire.rechargeFireControl(state, 1.6);
assert.equal(state.fireControl.charges, 2, 'charges replenish sequentially to capacity');
assert.equal(state.fireControl.nextRechargeAt, 0, 'full bank stops scheduling recharges');
fire.rechargeFireControl(state, 100);
assert.equal(state.fireControl.charges, 2, 'charge bank never overfills');
for (const [max, expected] of [
  [1, 0.9],
  [2, 0.8],
  [3, 0.72],
  [4, 0.68],
]) {
  assert.equal(fire.fireControlRechargeSeconds(max), expected);
}

const arena = { width: 2400, height: 1600, exitPoint: { x: 2100, y: 800 } };
const fleeing = {
  setup: { name: 'Runner' },
  tactic: 'flee',
  position: { x: 2100, y: 800 },
  shieldHp: 100,
  hullHp: 80,
  subsystems: { tractor: 0 },
};
const pursuer = {
  setup: { name: 'Chaser', tractorRangeMeters: 400 },
  tactic: 'fight',
  position: { x: 900, y: 800 },
  shieldHp: 100,
  hullHp: 80,
  subsystems: { tractor: 100 },
};
assert.equal(escapeLogic.runtimeCombatantEscaped(fleeing, pursuer, arena), true);
assert.equal(
  escapeLogic.runtimeCombatantEscaped({ ...fleeing, tactic: 'fight' }, pursuer, arena),
  false
);
assert.equal(
  escapeLogic.runtimeCombatantEscaped({ ...fleeing, position: { x: 1800, y: 800 } }, pursuer, arena),
  false
);
assert.equal(
  escapeLogic.runtimeCombatantEscaped(fleeing, { ...pursuer, position: { x: 1850, y: 800 } }, arena),
  false,
  'ship too close to pursuing opponent cannot escape'
);
const tractorPursuer = {
  ...pursuer,
  position: { x: 1600, y: 800 },
  setup: { name: 'Chaser', tractorRangeMeters: 550 },
};
assert.equal(
  escapeLogic.runtimeCombatantEscaped({ ...fleeing, shieldHp: 0 }, tractorPursuer, arena),
  false,
  'active tractor prevents unshielded ship from leaving'
);
assert.equal(
  escapeLogic.runtimeCombatantEscaped(
    { ...fleeing, shieldHp: 0 },
    { ...tractorPursuer, subsystems: { tractor: 0 } },
    arena
  ),
  true,
  'tractor shutdown restores escape eligibility beyond safe separation'
);

function runtime(a, b) {
  return { attacker: a, defender: b, winner: null, lastEvent: '', arena };
}
let fight = runtime({ ...fleeing, tactic: 'fight', hullHp: 80 }, { ...pursuer, hullHp: 0 });
winner.resolveRuntimeWinner(fight);
assert.equal(fight.winner, 'attacker', 'defender hull depletion ends battle');
assert.match(fight.lastEvent, /gewinnt das Gefecht/);
winner.resolveRuntimeWinner(fight);
assert.equal(fight.winner, 'attacker', 'winner cannot be overwritten');
fight = runtime({ ...fleeing, tactic: 'fight', hullHp: 0 }, { ...pursuer, hullHp: 80 });
winner.resolveRuntimeWinner(fight);
assert.equal(fight.winner, 'defender', 'attacker hull depletion ends battle');
fight = runtime(fleeing, pursuer);
winner.resolveRuntimeWinner(fight);
assert.equal(fight.winner, 'defender', 'escaping attacker causes defender outcome');
assert.match(fight.lastEvent, /entkommt aus dem Gefecht/);
fight = runtime({ ...fleeing, tactic: 'fight' }, pursuer);
winner.resolveRuntimeWinner(fight);
assert.equal(fight.winner, null, 'active combat does not spontaneously declare a winner');
console.log('PASS fire-control pulses, escape safety and terminal combat outcomes');
