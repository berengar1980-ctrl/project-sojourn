'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);
const { campaignCombatResult } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-result-summary.ts'
);

function ship(id, combatSpeed = 120, weapons = []) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 1000,
    hullHp: 1000,
    weapons,
    hitChance: 0.8,
    dodgeChance: 0,
    damageMultiplier: 1,
    criticalChance: 0,
    cycleTimeMultiplier: 1,
    combatSpeed,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
  };
}
const beam = {
  id: 'test-laser',
  name: 'Testlaser',
  weapon: {
    family: 'laser',
    mount: 'turret',
    shieldDamage: 5,
    hullDamage: 5,
    rangeMeters: 1300,
    cooldownSeconds: 0.8,
  },
};
const arena = {
  width: 2600,
  height: 1500,
  exitPoint: { x: 160, y: 750 },
  attackerPosition: { x: 1100, y: 750 },
  defenderPosition: { x: 2180, y: 750 },
  attackerVelocity: { x: 45, y: 0 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  obstacles: [],
};
function play(combat, steps = 1000) {
  const snapshots = [combat.getSnapshot()];
  for (let i = 0; i < steps && !snapshots[snapshots.length - 1].winner; i += 1) {
    snapshots.push(combat.tick(0.08));
  }
  return snapshots;
}
function distanceToExit(frame) {
  return Math.hypot(
    frame.attacker.position.x - frame.exitPoint.x,
    frame.attacker.position.y - frame.exitPoint.y
  );
}

// Turning 180 degrees with existing forward inertia must reach the real gate.
const retreat = createStrategicCombatService(
  ship('retreat', 120, [beam]),
  ship('chaser', 85),
  86,
  arena
);
retreat.setTactic('attacker', 'flee');
const samples = play(retreat);
const end = samples[samples.length - 1];
assert.equal(end.winner, 'defender', 'a clear, physical 180-degree retreat must complete');
assert.equal(end.outcomeReason, 'escape', 'retreat is not destruction or capitulation');
assert.equal(campaignCombatResult(end).outcome, 'FLUCHT');
assert(distanceToExit(end) <= 90, 'ship actually reaches the escape gate');
assert(end.attacker.hullHp > 0, 'escape preserves remaining hull');
assert(
  samples.some((frame) => frame.attacker.velocity.x < 0),
  'inertia reverses and the ship accelerates toward the exit'
);
assert(
  !samples.some((frame) => frame.beams.some((beam) => beam.owner === 'attacker')),
  'fleeing ship must not emit offensive laser beams'
);
assert(
  !samples.some((frame) => frame.projectiles.some((shot) => shot.owner === 'attacker')),
  'fleeing ship must not launch offensive projectiles'
);
assert(
  samples.every((frame) => frame.attacker.tactic === 'flee'),
  'manual flight commitment does not switch back to fighting'
);

// A physical obstacle requires a detour to the actual exit, not an artificial
// point projected 700 metres beyond the map boundary.
const asteroid = createStrategicCombatService(ship('asteroid-runner'), ship('tail', 80), 87, {
  ...arena,
  attackerVelocity: { x: 0, y: 0 },
  obstacles: [{ id: 'blocking-rock', position: { x: 700, y: 750 }, radius: 95 }],
});
asteroid.setTactic('attacker', 'flee');
const obstacleFrames = play(asteroid, 1100);
const obstacleEnd = obstacleFrames[obstacleFrames.length - 1];
assert(
  Math.min(...obstacleFrames.map(distanceToExit)) < 180,
  'asteroid route must actually progress into the exit corridor'
);
assert.equal(obstacleEnd.outcomeReason, 'escape', 'obstacle detour eventually completes escape');

// A camped gate may redirect once, not reselect a new edge indefinitely.
const blocked = createStrategicCombatService(ship('cornered'), ship('blocker', 80), 91, {
  ...arena,
  attackerPosition: { x: 172, y: 750 },
  defenderPosition: { x: 350, y: 750 },
  attackerVelocity: { x: 0, y: 0 },
});
blocked.setTactic('attacker', 'flee');
const blockedFrames = play(blocked, 850);
const detour = blockedFrames[1].exitPoint;
assert.notDeepEqual(detour, arena.exitPoint, 'blocked gate chooses a different physical exit');
assert(
  blockedFrames.every(
    (frame, index) =>
      index === 0 || (frame.exitPoint.x === detour.x && frame.exitPoint.y === detour.y)
  ),
  'alternate gate remains committed even when pursuer follows'
);
assert.equal(
  blocked.getCombatLog().filter((entry) => entry.detail.includes('FLUCHTKORRIDOR BLOCKIERT'))
    .length,
  1
);

// Giving up is a distinct terminal result, not a simulated escape or hull destruction.
const surrender = createStrategicCombatService(ship('captain'), ship('hunter'), 92, arena);
surrender.tick(0.08);
const previous = surrender.getSnapshot();
surrender.surrender('attacker');
const yielded = surrender.getSnapshot();
assert.equal(yielded.winner, 'defender');
assert.equal(yielded.outcomeReason, 'surrender');
assert.equal(yielded.attacker.hullHp, previous.attacker.hullHp);
assert.equal(yielded.defender.hullHp, previous.defender.hullHp);
assert.equal(campaignCombatResult(yielded).outcome, 'NIEDERLAGE');
assert.deepEqual(surrender.tick(0.08), yielded, 'terminal surrender does not advance physics');

// Only flee/surrender are visible player commands; hardware tactics stay active.
const panel = fs.readFileSync(path.join(root, 'src/ui/combat/strategic-combat-panel.ts'), 'utf8');
const mines = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-mines.ts'),
  'utf8'
);
assert(panel.includes('data-command="flee"') && panel.includes('data-command="surrender"'));
assert(!panel.includes('data-tactic="kite"') && !panel.includes('data-tactic="minefield"'));
assert(panel.includes('KAMPF AUFNEHMEN') && panel.includes('KAPITULATION BESTÄTIGEN?'));
assert(panel.includes('strategic-combat-grapple'), 'grapple remains a separate special action');
assert(mines.includes('tacticalMine') && mines.includes('defensiveMine'), 'mine AI is retained');
console.log('PASS physical escape, defensive ceasefire, stable gate, surrender and simplified HUD');
