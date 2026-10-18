'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { createDuelArena } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/duel-arena-presets.ts'
);

function setup(id) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 200,
    hullHp: 200,
    weapons: [],
    hitChance: 0.7,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed: 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}

const stepSeconds = 0.08;
const maxTicks = 2200;
// These are real procedural duel maps, not one artificial obstacle. They have
// moving bodies and the same physical/nav footprints that players encounter.
const scenarios = [
  ['asteroid_field', 1001],
  ['asteroid_field', 1002],
  ['asteroid_field', 1003],
  ['scrap_field', 1001],
  ['scrap_field', 1002],
  ['scrap_field', 1003],
];

for (const [kind, seed] of scenarios) {
  const map = createDuelArena(kind, seed);
  const gate = { x: 160, y: map.height * 0.5 };
  const arena = {
    ...map,
    exitPoint: gate,
    defenderPosition: { x: map.width - 260, y: map.height * 0.5 },
  };
  const battle = createStrategicCombatService(
    setup('escaping-' + kind + '-' + seed),
    setup('pursuing-' + kind + '-' + seed),
    seed,
    arena
  );
  battle.setTactic('attacker', 'flee');

  let frame = battle.getSnapshot();
  let totalTurn = 0;
  let largestTurn = 0;
  let previousHeading = frame.attacker.headingRadians;
  for (let tick = 0; tick < maxTicks && !frame.winner; tick += 1) {
    frame = battle.tick(stepSeconds);
    const heading = frame.attacker.headingRadians;
    const turn = Math.abs(Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading)));
    totalTurn += turn;
    largestTurn = Math.max(largestTurn, turn);
    previousHeading = heading;
    assert(Number.isFinite(frame.attacker.position.x) && Number.isFinite(frame.attacker.position.y));
    assert.equal(frame.attacker.tactic, 'flee', kind + ' seed ' + seed + ': no AI flight reversal');
    assert.deepEqual(frame.exitPoint, gate, kind + ' seed ' + seed + ': exit must never move');
  }
  const label = kind + ' seed ' + seed;
  const residual = Math.hypot(frame.attacker.position.x - gate.x, frame.attacker.position.y - gate.y);
  assert.equal(
    frame.outcomeReason,
    'escape',
    label + ': must actually reach exit before ' + maxTicks * stepSeconds +
      ' s; remaining ' + residual.toFixed(1) + 'm, turns ' + totalTurn.toFixed(1)
  );
  assert.equal(frame.winner, 'defender', label + ': escaped attacker ends the encounter');
  assert(totalTurn < 60, label + ': excess aggregate turning ' + totalTurn.toFixed(1));
  assert(largestTurn < 0.5, label + ': discontinuous heading jump');
}
console.log('PASS six full seeded asteroid/scrap escapes, stable gate, committed flight and steering');
