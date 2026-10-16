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
const arena = {
  width: 2600,
  height: 1500,
  attackerPosition: { x: 1100, y: 750 },
  defenderPosition: { x: 1650, y: 750 },
  attackerHeadingRadians: 0,
  defenderHeadingRadians: Math.PI,
  exitPoint: { x: 160, y: 750 },
  obstacles: [],
};
const combat = createStrategicCombatService(setup('runner'), setup('hunter'), 86, arena);
combat.tick(0.08);
combat.setTactic('attacker', 'flee');
const initial = combat.getSnapshot();
const first = combat.tick(0.08);
assert.equal(first.attacker.tactic, 'flee');
assert.equal(first.attacker.strategy?.kind, 'escape', 'player order replans immediately');
assert.equal(first.attacker.combatIntent, 'FLIEHEN');
assert(
  first.attacker.velocity.x < initial.attacker.velocity.x,
  'RCS should begin correcting velocity toward exit during a 180-degree turn'
);
const startX = initial.attacker.position.x;
let last = first;
for (let tick = 0; tick < 60 && !last.winner; tick += 1) last = combat.tick(0.08);
assert(last.attacker.position.x < startX - 25, 'flight must progress toward the exit');
assert.equal(last.attacker.tactic, 'flee', 'autonomous review cannot override manual escape');
combat.setTactic('attacker', 'fight');
const resumed = combat.tick(0.08);
assert.equal(resumed.attacker.tactic, 'fight');
assert.notEqual(resumed.attacker.strategy?.kind, 'escape');
for (const heading of [0, Math.PI / 2, Math.PI]) {
  for (const seed of [85, 86]) {
    const duel = createStrategicCombatService(setup('pilot'), setup('pursuer'), seed, {
      ...arena,
      attackerHeadingRadians: heading,
    });
    duel.setTactic('attacker', 'flee');
    let previous = duel.getSnapshot();
    let totalRotation = 0;
    for (let tick = 0; tick < 70 && !previous.winner; tick += 1) {
      const frame = duel.tick(0.08);
      const delta = frame.attacker.headingRadians - previous.attacker.headingRadians;
      totalRotation += Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
      previous = frame;
    }
    assert(
      previous.attacker.position.x < arena.attackerPosition.x - 25,
      'manual flight progresses toward exit across seeds and starting headings'
    );
    assert(totalRotation < Math.PI * 1.75, 'escaping must not spin repeatedly in open space');
  }
}
const blocked = createStrategicCombatService(setup('blocked'), setup('guard'), 86, {
  ...arena,
  attackerPosition: { x: 172, y: 750 },
  defenderPosition: { x: 350, y: 750 },
});
blocked.setTactic('attacker', 'flee');
const blockSnapshot = blocked.tick(0.08);
assert.deepEqual(
  blockSnapshot.exitPoint,
  arena.exitPoint,
  'enemy cannot relocate an existing gate'
);
blocked.setTactic('attacker', 'flee');
assert.deepEqual(
  blocked.getSnapshot().exitPoint,
  arena.exitPoint,
  'repeated flight order does not regenerate escape destination'
);

// Longer physical trajectories must reach the real exit, not just display FLIEHEN.
const longRun = createStrategicCombatService(setup('long-runner'), setup('long-hunter'), 86, {
  ...arena,
  defenderPosition: { x: 2250, y: 750 },
});
longRun.setTactic('attacker', 'flee');
let longFrame = longRun.getSnapshot();
for (let tick = 0; tick < 900 && !longFrame.winner; tick += 1) {
  longFrame = longRun.tick(0.08);
}
assert.equal(longFrame.outcomeReason, 'escape', 'clear route finishes as actual escape');
assert.equal(longFrame.winner, 'defender', 'an escaped attacker does not win by destruction');

const asteroidRun = createStrategicCombatService(setup('rock-runner'), setup('rock-hunter'), 86, {
  ...arena,
  defenderPosition: { x: 2250, y: 750 },
  obstacles: [{ id: 'rock', position: { x: 680, y: 750 }, radius: 90 }],
});
asteroidRun.setTactic('attacker', 'flee');
let rockFrame = asteroidRun.getSnapshot();
for (let tick = 0; tick < 1100 && !rockFrame.winner; tick += 1) {
  rockFrame = asteroidRun.tick(0.08);
}
assert.equal(rockFrame.outcomeReason, 'escape', 'asteroid detour reaches the exit');

const surrendered = createStrategicCombatService(setup('captain'), setup('pirate'), 87, arena);
const untouched = surrendered.getSnapshot();
surrendered.surrender('attacker');
const capitulation = surrendered.getSnapshot();
assert.equal(capitulation.outcomeReason, 'surrender', 'distinct capitulation result');
assert.equal(capitulation.winner, 'defender', 'capitulation is a voluntary loss');
assert.equal(capitulation.attacker.hullHp, untouched.attacker.hullHp, 'no artificial hull damage');
assert.deepEqual(surrendered.tick(0.08), capitulation, 'surrender ends the simulation');

// Reproduce the actual dense duel map, not only an isolated test rock.
const dense = createDuelArena('asteroid_field', 1001);
const denseDuel = createStrategicCombatService(setup('field-runner'), setup('field-chaser'), 92, {
  ...dense,
  exitPoint: { x: 160, y: dense.height * 0.5 },
});
denseDuel.setTactic('attacker', 'flee');
let denseFrame = denseDuel.getSnapshot();
const startDistance = Math.hypot(
  denseFrame.attacker.position.x - denseFrame.exitPoint.x,
  denseFrame.attacker.position.y - denseFrame.exitPoint.y
);
let closestDistance = startDistance;
let totalTurn = 0;
for (let tick = 0; tick < 1600 && !denseFrame.winner; tick += 1) {
  const next = denseDuel.tick(0.08);
  const change = next.attacker.headingRadians - denseFrame.attacker.headingRadians;
  totalTurn += Math.abs(Math.atan2(Math.sin(change), Math.cos(change)));
  denseFrame = next;
  const remaining = Math.hypot(
    denseFrame.attacker.position.x - denseFrame.exitPoint.x,
    denseFrame.attacker.position.y - denseFrame.exitPoint.y
  );
  closestDistance = Math.min(closestDistance, remaining);
}
assert(
  closestDistance < startDistance - 450,
  'dense real asteroid field must not strand escaping ships oscillating in place'
);
assert(totalTurn < 35, 'fluctuating asteroid navigation must not cause endless alternating turns');
assert.deepEqual(denseFrame.exitPoint, { x: 160, y: dense.height * 0.5 });

console.log('PASS manual flee, long escape, asteroid detour, real dense field and surrender');
