'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { describeCombatIntent, describeCombatStatus } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-intent-labels.ts'
);

const base = { tactic: 'fight', strategy: { kind: 'broadside' } };
const port = { ...base, strategy: { kind: 'broadside', broadsideFacing: 'port' } };
const starboard = { ...base, strategy: { kind: 'broadside', broadsideFacing: 'starboard' } };

assert.equal(describeCombatIntent(base), 'BREITSEITE');
assert.equal(describeCombatIntent(port), 'BREITSEITE · BACKBORD');
assert.equal(describeCombatIntent(starboard), 'BREITSEITE · STEUERBORD');
assert.equal(describeCombatIntent({ ...base, tactic: 'flee' }), 'FLIEHEN');
assert.equal(describeCombatIntent({ tactic: 'fight', strategy: null }), 'KAMPFPOSITION SUCHEN');
const approach = { tactic: 'fight', strategy: { kind: 'approach' } };
assert.equal(describeCombatIntent(approach), 'ANNÄHERN');

// The current flight maneuver must not overwrite the chosen weapon posture.
const snapshot = {
  tactic: 'fight',
  strategy: { kind: 'broadside', broadsideFacing: 'starboard' },
  installedWeapons: 2,
  mineCount: 0,
  combatIntent: 'ANGRIFFSPASSAGE',
};

const cases = [
  {
    overrides: {},
    strategy: 'BREITSEITE · STEUERBORD',
    maneuver: 'ANGRIFFSPASSAGE',
  },
  {
    overrides: { combatIntent: 'ABSTAND GEWINNEN' },
    strategy: 'BREITSEITE · STEUERBORD',
    maneuver: 'ABSTAND GEWINNEN',
  },
  {
    overrides: { combatIntent: 'BREITSEITE' },
    strategy: 'BREITSEITE · STEUERBORD',
    maneuver: null,
  },
  {
    overrides: { combatIntent: 'BREITSEITE · STEUERBORD' },
    strategy: 'BREITSEITE · STEUERBORD',
    maneuver: null,
  },
  {
    overrides: { tactic: 'kite' },
    strategy: 'BREITSEITE · STEUERBORD',
    maneuver: 'ANGRIFFSPASSAGE',
  },
  {
    overrides: { tactic: 'flee', combatIntent: 'FLIEHEN' },
    strategy: 'FLIEHEN',
    maneuver: null,
  },
  {
    overrides: { strategy: { kind: 'frontal' }, combatIntent: 'FRONTALANGRIFF' },
    strategy: 'FRONTALANGRIFF',
    maneuver: null,
  },
  {
    overrides: { strategy: { kind: 'frontal' }, combatIntent: 'VERFOLGEN' },
    strategy: 'FRONTALANGRIFF',
    maneuver: 'VERFOLGEN',
  },
  {
    overrides: { strategy: { kind: 'skirmish' }, tactic: 'kite', combatIntent: 'ABSTAND HALTEN' },
    strategy: 'ABSTAND HALTEN',
    maneuver: null,
  },
];

for (const test of cases) {
  const actual = describeCombatStatus({ ...snapshot, ...test.overrides });
  assert.deepEqual(actual, { strategy: test.strategy, maneuver: test.maneuver });
}

const telemetry = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-telemetry.ts'),
  'utf8'
);
assert(telemetry.includes('ship.combatIntent = describeCombatIntent(ship)'));
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
assert(
  renderer.includes('describeCombatStatus(combatant)'),
  'the ship caption must render the separate strategy and action labels'
);
console.log('PASS independent combat strategy and movement status labels');
