'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { runtimeCombatantEscaped } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-escape-evaluation.ts'
);
const arena = { width: 2600, height: 1500, exitPoint: { x: 160, y: 750 } };
const runner = {
  tactic: 'flee',
  position: { x: 180, y: 750 },
  shieldHp: 90,
};
const pursuer = {
  position: { x: 260, y: 750 },
  hullHp: 100,
  subsystems: { tractor: 0 },
  setup: { tractorRangeMeters: 0 },
};
assert(runtimeCombatantEscaped(runner, pursuer, arena), 'arriving at exit ends flight');
runner.position.x = 270;
assert.equal(runtimeCombatantEscaped(runner, pursuer, arena), false, 'cannot escape before arrival');
runner.position.x = 180;
runner.shieldHp = 0;
pursuer.subsystems.tractor = 100;
pursuer.setup.tractorRangeMeters = 400;
assert.equal(
  runtimeCombatantEscaped(runner, pursuer, arena),
  false,
  'real tractor interception can still prevent escape'
);
console.log('PASS fixed gate escape completion and intentional tractor lock');
