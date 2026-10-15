'use strict';
const assert = require('node:assert/strict');
const { load, pair, arena } = require('./maneuver-fixtures.cjs');
const { reviewCombatStrategy } = load('src/systems/combat/combat-strategy-planner.ts');
const { updateCombatManeuver } = load('src/systems/combat/combat-maneuver-director.ts');
const { createCombatFlightOrder } = load('src/systems/combat/combat-flight-order.ts');
const { snapshot } = load('src/systems/combat/strategic-combat-geometry.ts');
const [a, b] = pair(['weapon-railgun-1', 'weapon-autocannon-1'], ['forward', 'port']);
a.strategy = { kind: 'frontal', focus: 'forward', desiredRange: 500, score: 1, reason: 'front' };
b.position.x = 2700;
updateCombatManeuver(a, b, arena, 0);
assert.equal(a.maneuver.kind, 'intercept');
const serial = a.maneuver.serial;
for (let i = 1; i <= 50; i++) {
  b.position.y += 2;
  b.combatIntent = i % 2 ? 'BREITSEITENPASSAGE' : 'GEGENPASSAGE';
  b.strategy = { kind: i % 2 ? 'broadside' : 'frontal' };
  a.position.x += 4;
  updateCombatManeuver(a, b, arena, i * 0.08);
  assert.equal(
    a.maneuver.serial,
    serial,
    'moving intercept and enemy state changes do not replace our objective'
  );
}
assert(
  createCombatFlightOrder(a, b, arena).heading < 0.3,
  'spare broadside gun must not overwrite frontal weapon posture'
);
b.position = { x: a.position.x + 500, y: a.position.y };
updateCombatManeuver(a, b, arena, 4.1);
assert.equal(a.maneuver.kind, 'hold', 'intercept finishes on reaching firing envelope');
const hold = a.maneuver.serial;
for (let i = 0; i < 100; i++) {
  b.position.x = a.position.x + 500 + (i % 2 ? 20 : -20);
  a.fireControl.lastShotAt = 4 + i * 0.08;
  updateCombatManeuver(a, b, arena, 4.2 + i * 0.08);
  assert.equal(a.maneuver.serial, hold, 'small range fluctuations cannot churn maneuver');
}
// Lack of motion alone is not failure: an aligned ship making shots is productive.
for (let t = 13; t < 40; t++) {
  a.fireControl.lastShotAt = t;
  updateCombatManeuver(a, b, arena, t);
  assert.equal(a.maneuver.serial, hold);
}
// Real absence of range, angle AND weapon progress causes a committed recovery.
updateCombatManeuver(a, b, arena, 60);
assert.equal(a.maneuver.kind, 'extend');
assert.equal(a.maneuver.recoveries, 1);
const goal = { ...a.maneuver.goal };
for (let i = 1; i < 20; i++) {
  b.position.x -= 2;
  updateCombatManeuver(a, b, arena, 60 + i * 0.08);
  assert.deepEqual(a.maneuver.goal, goal, 'recovery destination cannot follow enemy oscillations');
}
const view = snapshot(a);
view.maneuver.goal.x = -999;
assert.deepEqual(a.maneuver.goal, goal, 'maneuver snapshot is detached');
assert(!JSON.stringify(snapshot(a)).includes('null'), 'diagnostics contain finite JSON data');
a.tactic = 'flee';
reviewCombatStrategy(a, b, 'attacker', 62);
updateCombatManeuver(a, b, arena, 62);
assert.equal(a.maneuver.kind, 'escape', 'explicit flee interrupts immediately');
assert(createCombatFlightOrder(a, b, arena).velocity.x < 0);
console.log(
  'PASS maneuver commitment, geometric completion, livelock recovery, truthful front angle and detached state'
);

for (const [x, y] of [
  [400, 400],
  [3600, 400],
  [400, 2600],
  [3600, 2600],
]) {
  const [edge, enemy] = pair();
  edge.position = { x, y };
  enemy.position = { x: x + (x < 2000 ? 100 : -100), y: y + (y < 1500 ? 100 : -100) };
  edge.strategy = { kind: 'frontal', focus: 'forward', desiredRange: 500 };
  for (let step = 0; step < 20; step++) updateCombatManeuver(edge, enemy, arena, step * 0.08);
  assert.equal(edge.maneuver.serial, 1, 'corner cannot repeatedly complete a zero-length maneuver');
  assert(Math.hypot(edge.maneuver.goal.x - x, edge.maneuver.goal.y - y) >= 150);
}
