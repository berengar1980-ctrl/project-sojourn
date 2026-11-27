'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const priorityPath = 'src/systems/navigation/field-traffic-priority.ts';
const trafficPath = 'src/systems/navigation/field-traffic-obstacles.ts';
const priority = loadStandaloneTypeScriptModule(root, priorityPath);
const traffic = loadStandaloneTypeScriptModule(root, trafficPath, { [priorityPath]: priority });
const { moveFieldShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts',
  { [priorityPath]: priority, [trafficPath]: traffic }
);
const { registerTrafficPose, beginTrafficLeg, trafficIntent, hasTrafficPriority } = priority;
const a = { npcId: 'a', position: { x: 100, y: 300 }, headingRadians: 0, speed: 0 };
const b = { npcId: 'b', position: { x: 180, y: 300 }, headingRadians: Math.PI, speed: 0 };
const bounds = { width: 1000, height: 600 };
registerTrafficPose(a, 'a', false, bounds);
registerTrafficPose(b, 'b', false, bounds);
beginTrafficLeg(a, { x: 900, y: 300 });
beginTrafficLeg(b, { x: 10, y: 300 });
assert(hasTrafficPriority('a', trafficIntent(a, 'a'), 'b', trafficIntent(b, 'b')));
assert(!hasTrafficPriority('b', trafficIntent(b, 'b'), 'a', trafficIntent(a, 'a')));
registerTrafficPose(b, 'b', false, bounds, true);
assert(hasTrafficPriority('b', trafficIntent(b, 'b'), 'a', trafficIntent(a, 'a')));
registerTrafficPose(b, 'b', false, bounds);
const obstacle = (ship) => ({
  id: ship.npcId,
  position: { ...ship.position },
  radius: 30,
  velocity: { x: 0, y: 0 },
  intent: trafficIntent(ship, ship.npcId),
});
// Freeze the encounter decision before the lower-ranked ship accumulates wait time.
assert.equal(priority.yieldsToTraffic(b, obstacle(a), 50), true);
assert.equal(priority.yieldsToTraffic(a, obstacle(b), 50), false);
for (let i = 0; i < 20; i += 1) priority.noteTrafficProgress(b, 0.1, true);
assert.equal(priority.yieldsToTraffic(b, obstacle(a), 50), true, 'encounter remains committed');
assert(hasTrafficPriority('b', trafficIntent(b, 'b'), 'a', trafficIntent(a, 'a')));
const escape = priority.trafficEscapeWaypoint(b, [obstacle(a)], 50);
assert(escape, 'lower priority ship must obtain a safe escape');
assert.deepEqual(escape, priority.trafficEscapeWaypoint(b, [obstacle(a)], 50));
assert(escape.y < b.position.y, 'head-on ship yields to starboard');
const before = { ...b.position };
moveFieldShip(b, { x: 10, y: 300 }, 60, 0.1, [obstacle(a)], 50);
assert(Math.hypot(b.position.x - before.x, b.position.y - before.y) <= 6.001);
assert(b.position.y < before.y, 'escape is integrated, not teleported');
assert(
  !traffic.trafficStepClear(
    a.position,
    { x: 170, y: 300 },
    0.1,
    [obstacle(b)],
    50,
    a
  ),
  'priority must not bypass immediate contact safety'
);
console.log('PASS deterministic priority, committed starboard escape and immediate contact safety');
