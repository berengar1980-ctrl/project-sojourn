'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { runtimeCombatantEscaped } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-escape-evaluation.ts'
);
const arena = { width: 2400, exitPoint: { x: 100, y: 750 } };
const runner = {
  tactic: 'flee',
  position: { x: 188, y: 750 },
  shieldHp: 1500,
};
const opponent = {
  position: { x: 930, y: 750 },
  hullHp: 1500,
  subsystems: { tractor: 100 },
  setup: { tractorRangeMeters: 0 },
};
assert.equal(runtimeCombatantEscaped(runner, opponent, arena), true,
  'runner within 90m of exit and far from opponent has escaped');
assert.equal(runtimeCombatantEscaped({ ...runner, position: { x: 195, y: 750 } },
  opponent, arena), false, 'outside 90m exit radius is not yet an escape');
assert.equal(runtimeCombatantEscaped({ ...runner, tactic: 'fight' }, opponent, arena),
  false, 'only a fleeing vessel may exit combat');
console.log('PASS escape event is distinct from attacker destruction');
