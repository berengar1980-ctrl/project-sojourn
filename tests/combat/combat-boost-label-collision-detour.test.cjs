'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
assert(
  renderer.includes('combatant.combatIntent,'),
  'tactical status contains only the chosen maneuver'
);
assert(!renderer.includes("combatant.combatIntent + (combatant.boostActive"));
assert(renderer.includes('drawCombatBoostMeter('), 'boost visuals and charge meter remain');
assert(renderer.includes('combatant.boostActive'), 'engine boost visual effects remain');

const { resolveCombatantCollision } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-movement.ts'
);
const { escapeContactDetour } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/combat-collision-evasion.ts'
);
const vessel = (x, y, vx, vy) => ({
  position: { x, y },
  velocity: { x: vx, y: vy },
  speed: Math.hypot(vx, vy),
});
const runner = vessel(500, 500, 100, 55);
const chaser = vessel(565, 500, 20, 55);
resolveCombatantCollision(runner, chaser);
assert.equal(runner.velocity.y, 55, 'contact must retain escape tangent velocity');
assert.equal(chaser.velocity.y, 55, 'contact must retain pursuit tangent velocity');
assert(
  runner.velocity.x < 100 && chaser.velocity.x > 20,
  'only normal closing speed is resolved'
);
const resolvedDistance = Math.hypot(
  runner.position.x - chaser.position.x,
  runner.position.y - chaser.position.y
);
assert(resolvedDistance >= 86, 'hulls do not overlap');
const parallel = vessel(500, 500, 0, -100);
const neighbour = vessel(565, 500, 0, -100);
resolveCombatantCollision(parallel, neighbour);
assert.equal(parallel.velocity.y, -100, 'parallel ships do not suffer phantom braking');
assert.equal(neighbour.velocity.y, -100);

const flight = vessel(900, 600, 70, 0);
const blocker = vessel(1020, 600, 0, 0);
const forward = { x: 1, y: 0 };
const first = escapeContactDetour(flight, blocker, 'attacker', forward);
assert(first && first.y > 0, 'close blocker creates a lateral bypass');
blocker.position.y = 610;
const second = escapeContactDetour(flight, blocker, 'attacker', forward);
assert(second && second.y > 0, 'avoidance side cannot alternate each tick');
blocker.position.x = 650;
assert.equal(escapeContactDetour(flight, blocker, 'attacker', forward), null);
assert.equal(flight.escapeAvoidanceSide, undefined, 'after overtaking, clear detour state');
console.log('PASS boost status, tangential collision impulse and persistent escape detour');
