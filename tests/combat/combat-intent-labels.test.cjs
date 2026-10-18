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
assert.equal(describeCombatIntent(base), 'BREITSEITE');
assert.equal(
  describeCombatIntent({ ...base, strategy: { kind: 'broadside', broadsideFacing: 'port' } }),
  'BREITSEITE · BACKBORD'
);
assert.equal(
  describeCombatIntent({ ...base, strategy: { kind: 'broadside', broadsideFacing: 'starboard' } }),
  'BREITSEITE · STEUERBORD'
);
assert.equal(describeCombatIntent({ ...base, tactic: 'flee' }), 'FLIEHEN');
assert.equal(describeCombatIntent({ tactic: 'fight', strategy: { kind: 'approach' } }), 'ANNÄHERN');
assert.equal(describeCombatIntent({ tactic: 'fight', strategy: null }), 'KAMPFPOSITION SUCHEN');

// A transient flight/action label may not hide the actual weapon posture.
const snapshot = {
  tactic: 'fight',
  strategy: { kind: 'broadside', broadsideFacing: 'starboard' },
  installedWeapons: 2,
  mineCount: 0,
  combatIntent: 'ANGRIFFSPASSAGE',
};
assert.deepEqual(describeCombatStatus(snapshot), {
  strategy: 'BREITSEITE · STEUERBORD',
  maneuver: 'ANGRIFFSPASSAGE',
});
assert.deepEqual(describeCombatStatus({ ...snapshot, combatIntent: 'ABSTAND GEWINNEN' }), {
  strategy: 'BREITSEITE · STEUERBORD',
  maneuver: 'ABSTAND GEWINNEN',
});
assert.deepEqual(describeCombatStatus({ ...snapshot, combatIntent: 'BREITSEITE' }), {
  strategy: 'BREITSEITE · STEUERBORD',
  maneuver: null,
});
assert.deepEqual(
  describeCombatStatus({ ...snapshot, combatIntent: 'BREITSEITE · STEUERBORD' }),
  { strategy: 'BREITSEITE · STEUERBORD', maneuver: null }
);
assert.deepEqual(describeCombatStatus({ ...snapshot, tactic: 'flee', combatIntent: 'FLIEHEN' }), {
  strategy: 'FLIEHEN',
  maneuver: null,
});
assert.deepEqual(describeCombatStatus({ ...snapshot, tactic: 'kite' }), {
  strategy: 'BREITSEITE · STEUERBORD',
  maneuver: 'ANGRIFFSPASSAGE',
});
assert.deepEqual(
  describeCombatStatus({
    ...snapshot,
    strategy: { kind: 'frontal' },
    combatIntent: 'FRONTALANGRIFF',
  }),
  { strategy: 'FRONTALANGRIFF', maneuver: null }
);
assert.deepEqual(
  describeCombatStatus({
    ...snapshot,
    strategy: { kind: 'skirmish' },
    tactic: 'kite',
    combatIntent: 'ABSTAND HALTEN',
  }),
  { strategy: 'ABSTAND HALTEN', maneuver: null }
);
assert.deepEqual(
  describeCombatStatus({ ...snapshot, strategy: { kind: 'frontal' }, combatIntent: 'VERFOLGEN' }),
  { strategy: 'FRONTALANGRIFF', maneuver: 'VERFOLGEN' }
);

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
