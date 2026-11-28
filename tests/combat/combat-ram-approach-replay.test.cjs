'use strict';
const assert = require('node:assert/strict');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = require('node:path').resolve(__dirname, '../..');
const { createStrategicCombatService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-service.ts'
);

function combatantSetup(id, bilateral, movingTarget) {
  return {
    id,
    name: id,
    shipId: 'patrol-60m-variant-01',
    shieldHp: 100,
    hullHp: bilateral || id === 'A' ? 200 : 120,
    weapons: [],
    ...(bilateral || id === 'A' ? { armor: { front: 0.15 } } : {}),
    combatSpeed: movingTarget && id === 'B' ? 100 : 120,
    accelerationMetersPerSecond2: 35,
    turnRateRadiansPerSecond: 0.8,
    aiControlled: true,
    aiAggression: 90,
  };
}

function createReplayScenario({ bilateral, movingTarget, obstacle }) {
  const asteroids = obstacle
    ? [
        {
          id: 'ram-test-rock',
          position: { x: 1200, y: 700 },
          radius: 180,
          kind: 'resource',
          rotation: 0,
          velocity: { x: 0, y: 0 },
          angularVelocity: 0,
        },
      ]
    : [];
  const obstacles = asteroids.map((rock) => ({
    id: rock.id,
    position: rock.position,
    radius: rock.radius,
  }));
  const arena = {
    width: 2400,
    height: 1400,
    attackerPosition: { x: 750, y: 700 },
    defenderPosition: { x: 1650, y: 700 },
    attackerHeadingRadians: 0,
    defenderHeadingRadians: Math.PI,
    obstacles,
    asteroids,
    ...(movingTarget ? { defenderVelocity: { x: 0, y: 60 } } : {}),
  };
  const combat = createStrategicCombatService(
    combatantSetup('A', bilateral, movingTarget),
    combatantSetup('B', bilateral, movingTarget),
    123,
    arena
  );
  for (const side of ['attacker', 'defender']) combat.getParallelActor(side).shieldHp = 30;
  return { combat, obstacles };
}

function createMetrics() {
  return {
    ramSeconds: [0, 0],
    ramAttempts: [0, 0],
    retryFrames: [0, 0],
    stalledNearContactSeconds: [0, 0],
    previousPhase: [null, null],
    minimumSeparation: Infinity,
    minimumObstacleClearance: Infinity,
    obstacleContactFrames: 0,
    invalidFrames: 0,
  };
}

function sampleActor(frame, combat, obstacles, metrics, index) {
  const snapshot = index === 0 ? frame.attacker : frame.defender;
  const actor = combat.getParallelActor(index === 0 ? 'attacker' : 'defender');
  if (snapshot.ramPhase) metrics.ramSeconds[index] += 0.08;
  if (snapshot.ramPhase === 'impact' && metrics.previousPhase[index] !== 'impact') {
    metrics.ramAttempts[index] += 1;
  }
  metrics.previousPhase[index] = snapshot.ramPhase ?? null;
  if (actor.ramApproach?.retryCooldownSeconds > 0) metrics.retryFrames[index] += 1;
  if (
    ![snapshot.position.x, snapshot.position.y, snapshot.velocity.x, snapshot.velocity.y].every(
      Number.isFinite
    )
  ) {
    metrics.invalidFrames += 1;
  }
  for (const rock of obstacles) {
    const clearance =
      Math.hypot(snapshot.position.x - rock.position.x, snapshot.position.y - rock.position.y) -
      rock.radius;
    metrics.minimumObstacleClearance = Math.min(metrics.minimumObstacleClearance, clearance);
    if (clearance < 0) metrics.obstacleContactFrames += 1;
  }
}

function sampleApproach(frame, metrics) {
  const actors = [frame.attacker, frame.defender];
  const range = Math.hypot(
    actors[0].position.x - actors[1].position.x,
    actors[0].position.y - actors[1].position.y
  );
  metrics.minimumSeparation = Math.min(metrics.minimumSeparation, range);
  if (range >= 160) return;
  for (let index = 0; index < actors.length; index += 1) {
    const actor = actors[index];
    const enemy = actors[1 - index];
    const towardX = (enemy.position.x - actor.position.x) / Math.max(1, range);
    const towardY = (enemy.position.y - actor.position.y) / Math.max(1, range);
    const closingSpeed =
      (actor.velocity.x - enemy.velocity.x) * towardX +
      (actor.velocity.y - enemy.velocity.y) * towardY;
    if (closingSpeed < 25) metrics.stalledNearContactSeconds[index] += 0.08;
  }
}

function runRamReplay(options) {
  const { combat, obstacles } = createReplayScenario(options);
  const metrics = createMetrics();
  for (let tick = 0; tick < 800; tick += 1) {
    const frame = combat.tick(0.08);
    sampleActor(frame, combat, obstacles, metrics, 0);
    sampleActor(frame, combat, obstacles, metrics, 1);
    sampleApproach(frame, metrics);
    if (frame.winner) break;
  }

  const ramContacts = combat
    .getCombatLog()
    .filter((entry) => entry.event === 'impact' && entry.detail.startsWith('Rumpfkontakt')).length;
  const totalRamAttempts = metrics.ramAttempts.reduce((sum, attempts) => sum + attempts, 0);
  return {
    ramSeconds: metrics.ramSeconds,
    ramAttempts: metrics.ramAttempts,
    ramHitRate: totalRamAttempts > 0 ? Number((ramContacts / totalRamAttempts).toFixed(2)) : 0,
    retryFrames: metrics.retryFrames,
    stalledNearContactSeconds: metrics.stalledNearContactSeconds.map((seconds) =>
      Number(seconds.toFixed(2))
    ),
    minimumSeparation: Number(metrics.minimumSeparation.toFixed(2)),
    minimumObstacleClearance: Number.isFinite(metrics.minimumObstacleClearance)
      ? Number(metrics.minimumObstacleClearance.toFixed(2))
      : null,
    obstacleContactFrames: metrics.obstacleContactFrames,
    invalidFrames: metrics.invalidFrames,
    ramContacts,
    durationSeconds: Number(combat.getSnapshot().elapsedSeconds.toFixed(2)),
  };
}

const bilateral = runRamReplay({ bilateral: true, movingTarget: false, obstacle: false });
assert(bilateral.ramSeconds[0] > 0 && bilateral.ramSeconds[1] > 0, 'both ships choose ramming');
assert(bilateral.ramAttempts[0] > 0 && bilateral.ramAttempts[1] > 0);
assert(
  bilateral.retryFrames[0] > 0 && bilateral.retryFrames[1] > 0,
  'both stalled charges re-stage'
);
assert(bilateral.ramContacts > 0, 'bilateral approach reaches physical contact');
assert(bilateral.minimumSeparation < 86, 'contact resolves at the physical hull radius');
assert(bilateral.stalledNearContactSeconds.every((seconds) => seconds < 20));
assert.equal(bilateral.invalidFrames, 0);

const moving = runRamReplay({ bilateral: false, movingTarget: true, obstacle: false });
assert(moving.ramSeconds[0] > 0, 'reinforced attacker commits against a moving target');
assert(moving.ramAttempts[0] > 0);
assert(moving.retryFrames[0] > 0, 'missed moving-target charge gets another approach');
assert(moving.ramContacts > 0, 'moving-target scenario records a physical ram');
assert(moving.ramHitRate > 0);
assert.equal(moving.invalidFrames, 0);

const obstructed = runRamReplay({ bilateral: false, movingTarget: false, obstacle: true });
assert(obstructed.ramSeconds[0] > 0, 'ram remains an explicit tactical intent around an obstacle');
assert(obstructed.ramHitRate > 0, 'obstructed ram eventually reaches the target');
assert(obstructed.minimumObstacleClearance > 0, 'ram route keeps clearance from a large asteroid');
assert.equal(obstructed.obstacleContactFrames, 0, 'ram does not physically contact the asteroid');
assert.equal(obstructed.invalidFrames, 0);

console.log(
  'PASS F05 bilateral, moving-target and obstacle ram replays',
  JSON.stringify({ bilateral, moving, obstructed })
);
