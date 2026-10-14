'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { createStrategicCombatService } = load('src/systems/combat/strategic-combat-service.ts');
const { reviewCombatCommitment, escapeViability } = load('src/systems/combat/combat-commitment.ts');
const { pilotExchangeShip } = load('src/systems/combat/combat-exchange-pilot.ts');
const { updateCombatIntent } = load('src/systems/combat/combat-intent-labels.ts');

const setup = (id) => ({
  id,
  name: id,
  shipId: 'patrol-60m-variant-01',
  shieldHp: 119,
  hullHp: 200,
  weapons: [],
  mines: [],
  hitChance: 0.7,
  dodgeChance: 0.1,
  damageMultiplier: 1,
  criticalChance: 0,
  cycleTimeMultiplier: 1,
  aiControlled: true,
  aiAggression: 50,
  preferredTactic: 'fight',
  combatSpeed: 120,
  accelerationMetersPerSecond2: 35,
  turnRateRadiansPerSecond: 1,
});

const arena = {
  width: 2400,
  height: 1400,
  attackerPosition: { x: 700, y: 650 },
  defenderPosition: { x: 1190, y: 650 },
  exitPoint: { x: 120, y: 650 },
  // Obstacle is only between the escaping ship and its pursuer. The old
  // steering implementation mistakenly plotted around it toward the ENEMY.
  obstacles: [{ id: 'enemy-side-rock', position: { x: 950, y: 650 }, radius: 95 }],
};
const duel = createStrategicCombatService(setup('runner'), setup('hunter'), 2048, arena);
duel.setTactic('attacker', 'flee');
let frame = duel.getSnapshot();
assert.equal(frame.attacker.tactic, 'flee');
assert.equal(frame.attacker.combatIntent, 'FLIEHEN',
  'manual flee command must change the visible status immediately');

const startX = frame.attacker.position.x;
for (let step = 0; step < 80; step += 1) frame = duel.tick(0.08);
assert.equal(frame.attacker.tactic, 'flee',
  'user-selected fleeing must remain authoritative through strategy updates');
assert.equal(frame.attacker.combatIntent, 'FLIEHEN',
  'maneuver labels must not replace a committed flee status');
assert(frame.attacker.position.x < startX - 12,
  'fleeing ship must actually make progress toward the exit, away from enemy-side obstruction');

// Deliberately make escape appear hopeless. An operational engine must not
// cause an autonomous flight order to turn back into an attack at second 16.
const runner = {
  setup: setup('autonomous-runner'),
  position: { x: 1500, y: 650 },
  velocity: { x: 0, y: 0 },
  shieldHp: 10,
  shieldMaxHp: 119,
  hullHp: 60,
  hullMaxHp: 200,
  subsystems: { engine: 100, tractor: 0 },
  mineStock: [],
  tactic: 'flee',
  strategy: { kind: 'escape', focus: 'turret', desiredRange: 1000 },
  escapeCommittedAt: 0,
  nextCommitmentReviewAt: 16,
};
const hunter = {
  ...runner,
  setup: setup('hunter'),
  position: { x: 1000, y: 650 },
  shieldHp: 119,
  hullHp: 200,
  tactic: 'fight',
};
const trapped = {
  ...arena,
  obstacles: [1300, 1200, 1100, 900, 700].map((x, i) => ({
    id: 'barrier-' + i,
    position: { x, y: 650 },
    radius: 80,
  })),
};
assert(escapeViability(runner, hunter, trapped) < 0.2,
  'this test must reproduce poor escape viability that previously aborted flight');
reviewCombatCommitment(runner, hunter, trapped, 16);
assert.equal(runner.tactic, 'flee',
  'an operational engine keeps the escape commitment even if probabilities deteriorate');
runner.subsystems.engine = 0;
reviewCombatCommitment(runner, hunter, trapped, 17);
assert.equal(runner.tactic, 'fight', 'engine loss can still abort an impossible escape');

// Exchange / Alpha preset: when reaction is "turn_to_face", the fleeing
// reactor must point at the exit rather than at its opponent.
const escapingExchangeShip = {
  position: { x: 740, y: 650 },
  velocity: { x: 0, y: 0 },
  headingRadians: 0,
  tactic: 'flee',
  setup: setup('exchange-runner'),
  subsystems: { engine: 100 },
};
const opponent = {
  position: { x: 1110, y: 650 },
  velocity: { x: 0, y: 0 },
};
pilotExchangeShip(
  escapingExchangeShip,
  'reactor',
  {
    initiatorGoal: { x: 1240, y: 650 },
    reactorGoal: { x: 1240, y: 650 },
    initiatorHeading: 0,
    reactorHeading: 0,
  },
  arena,
  0.08,
  opponent,
  false,
  true
);
assert(Math.abs(escapingExchangeShip.headingRadians) > 0.03,
  'exchange reactor must turn toward the exit even when target tracking is requested');

// Only the presentation is debounced. FLEE overrides it immediately.
const status = { tactic: 'fight', combatIntent: undefined };
updateCombatIntent(status, 'ANNÄHERN', 0);
updateCombatIntent(status, 'BREITSEITE', 0.08);
updateCombatIntent(status, 'ZIEL ANVISIEREN', 1.8);
assert.equal(status.combatIntent, 'ANNÄHERN',
  'maneuver labels remain readable for two seconds, not multiple per frame');
updateCombatIntent(status, 'BREITSEITE', 2.1);
assert.equal(status.combatIntent, 'BREITSEITE');
status.tactic = 'flee';
updateCombatIntent(status, 'FRONTALANGRIFF', 2.15);
assert.equal(status.combatIntent, 'FLIEHEN',
  'flee status must bypass all display throttling');
updateCombatIntent(status, 'BREITSEITE', 2.2);
assert.equal(status.combatIntent, 'FLIEHEN');

console.log('PASS fleeing moves toward exit, sticks until engine loss, and shows stable statuses');
