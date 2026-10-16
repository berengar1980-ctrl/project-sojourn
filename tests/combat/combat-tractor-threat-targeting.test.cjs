'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createCombatant } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-geometry.ts'
);
const { targetSubsystem } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-strategy-planner.ts'
);
const { pulseCombatTractor } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-tractor-pulse.ts'
);
const arena = {
  width: 2200,
  height: 1600,
  attackerPosition: { x: 500, y: 800 },
  defenderPosition: { x: 850, y: 800 },
};
const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-test',
  shieldHp: 0,
  hullHp: 300,
  weapons: [],
  hitChance: 1,
  dodgeChance: 0,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  tractorRangeMeters: 700,
});
const victim = createCombatant(setup('victim'), 'defender', arena);
const tractorShip = createCombatant(setup('tractor'), 'attacker', arena);
victim.position.x = 850;
tractorShip.position.x = 500;
victim.velocity.x = 80;
assert.equal(
  targetSubsystem(victim, tractorShip, 10),
  'hull',
  'tractor equipment alone is not a reason to target the subsystem'
);
const runtime = { elapsedSeconds: 10, beamSerial: 0, beams: [], combatLog: [], lastEvent: '' };
pulseCombatTractor(runtime, 'attacker', tractorShip, victim, 0.08);
assert.equal(runtime.beams.length, 1, 'enemy tractor must actually have fired');
assert.equal(targetSubsystem(victim, tractorShip, 11), 'tractor');
assert.equal(targetSubsystem(victim, tractorShip, 23), 'hull');
victim.tractorThreatenedUntil = 30;
victim.position.x = 1550;
assert.equal(targetSubsystem(victim, tractorShip, 11), 'hull');
victim.position.x = 850;
tractorShip.shieldHp = 50;
assert.equal(targetSubsystem(victim, tractorShip, 11), 'hull');
console.log('PASS tractor is targeted only after a credible observed hostile action');
