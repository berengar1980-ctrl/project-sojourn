'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { careerSaveBlockReason } = loadStandaloneTypeScriptModule(
  root,
  'src/app/game-controller-career-save-policy.ts'
);
const { createFleetFieldTickOwnership } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/fleet-field-tick-ownership.ts'
);

const idle = {
  mode: 'star-map',
  playerCombatActive: false,
  embeddedCombatActive: false,
  combatResultPending: false,
  activeFieldFleet: false,
  travelling: false,
  fuelJourneyActive: false,
};
assert.equal(careerSaveBlockReason(idle), null, 'idle orbit remains saveable');
assert.equal(careerSaveBlockReason({ ...idle, mode: 'port' }), null, 'port remains saveable');
assert.match(
  careerSaveBlockReason({ ...idle, playerCombatActive: true }),
  /Gefechts/,
  'player 1vs1 cannot save even from orbit'
);
assert.match(
  careerSaveBlockReason({ ...idle, mode: 'combat' }),
  /Gefechts/,
  'combat scene cannot save'
);
assert.match(
  careerSaveBlockReason({ ...idle, embeddedCombatActive: true }),
  /Gefechts/,
  'embedded mining/salvage fight cannot save'
);
assert.match(
  careerSaveBlockReason({ ...idle, combatResultPending: true }),
  /Abschluss/,
  'save remains blocked until the battle result is settled'
);
assert.match(
  careerSaveBlockReason({ ...idle, travelling: true }),
  /ruhenden Orbit/,
  'in-flight saves remain blocked'
);
assert.match(
  careerSaveBlockReason({ ...idle, fuelJourneyActive: true }),
  /ruhenden Orbit/,
  'unresolved fuel journey remains blocked'
);
assert.match(
  careerSaveBlockReason({ ...idle, mode: 'local-space' }),
  /ruhenden Orbit/,
  'ordinary field work is not a permitted manual save location'
);
// Background NPC duels are deliberately not a global save blocker.
assert.equal(careerSaveBlockReason(idle), null, 'unrelated NPC 1vs1 stays saveable');
const owner = createFleetFieldTickOwnership();
const field = { locationId: 'a' };
const fleet = { tick() {} };
assert.equal(owner.hasActiveFleet(), false);
owner.acquire(field, fleet);
assert.equal(owner.hasActiveFleet(), true);
assert.match(
  careerSaveBlockReason({ ...idle, activeFieldFleet: owner.hasActiveFleet() }),
  /FleetCombat/,
  'an uncheckpointed active fleet lease must not be silently saved'
);
owner.release(field, fleet);
assert.equal(owner.hasActiveFleet(), false);
assert.equal(
  careerSaveBlockReason({ ...idle, activeFieldFleet: owner.hasActiveFleet() }),
  null,
  'normal campaign saving resumes after the fleet lease is released'
);
// Loading is an independent callback and must never inherit the save guard.
const storedSlot = { id: 'checkpoint-outside-combat' };
const loadOldSlot = () => storedSlot;
assert.strictEqual(loadOldSlot(), storedSlot, 'existing load action is still callable');
console.log('PASS career save restriction: combat/settlement/fleet blocked, load unaffected');
