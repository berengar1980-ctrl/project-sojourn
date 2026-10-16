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

// Each installed weapon reloads independently, including fast repeaters.
const cooldowns = { setup: { weapons: [{}, {}, {}] }, cooldowns: [0.2, 1.6, 0] };
fire.advanceWeaponCooldowns(cooldowns, 0.15);
assert(Math.abs(cooldowns.cooldowns[0] - 0.05) < 0.000001);
assert(Math.abs(cooldowns.cooldowns[1] - 1.45) < 0.000001);
assert.equal(cooldowns.cooldowns[2], 0, 'ready weapon stays ready');
fire.advanceWeaponCooldowns(cooldowns, 0.05);
assert.equal(cooldowns.cooldowns[0], 0, 'fast weapon reloads without a global lock');
assert.equal(fire.weaponCycleSeconds({ cooldownSeconds: 0.2 }, 1), 0.2);
assert.equal(fire.weaponCycleSeconds({ cooldownSeconds: 7.2 }, 1), 7.2);

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
  escapeLogic.runtimeCombatantEscaped(
    { ...fleeing, position: { x: 1800, y: 800 } },
    pursuer,
    arena
  ),
  false
);
assert.equal(
  escapeLogic.runtimeCombatantEscaped(
    fleeing,
    { ...pursuer, position: { x: 1850, y: 800 } },
    arena
  ),
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
console.log('PASS independent weapon cooldowns, escape safety and terminal combat outcomes');
