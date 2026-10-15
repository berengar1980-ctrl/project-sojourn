'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { describeCombatIntent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-intent-labels.ts'
);
const base = { tactic: 'fight', strategy: { kind: 'broadside' } };
assert.equal(describeCombatIntent(base), 'BREITSEITE');
assert.equal(describeCombatIntent({ ...base, tactic: 'flee' }), 'FLIEHEN');
assert.equal(describeCombatIntent({ tactic: 'fight', strategy: { kind: 'approach' } }), 'ANNÄHERN');
assert.equal(describeCombatIntent({ tactic: 'fight', strategy: null }), 'KAMPFPOSITION SUCHEN');
const fs = require('node:fs');
const source = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-telemetry.ts'),
  'utf8'
);
assert(
  source.includes('updateCombatIntent(') && source.includes('describeCombatIntent(ship)'),
  'non-Alpha battles update readable intent through the stable status helper'
);
const { updateCombatIntent } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-intent-labels.ts'
);
const status = { tactic: 'fight' };
updateCombatIntent(status, 'ANNÄHERN', 0);
updateCombatIntent(status, 'BREITSEITE', 0.08);
assert.equal(status.combatIntent, 'BREITSEITE', 'HUD reflects an accepted order immediately');
updateCombatIntent(status, 'BREITSEITE', 2.01);
assert.equal(status.combatIntent, 'BREITSEITE', 'unchanged order keeps the same label');
status.tactic = 'flee';
updateCombatIntent(status, 'FLANKIEREN', 2.02);
assert.equal(status.combatIntent, 'FLIEHEN', 'flee overrides status display immediately');

console.log('PASS combat intent labels for all duels');
