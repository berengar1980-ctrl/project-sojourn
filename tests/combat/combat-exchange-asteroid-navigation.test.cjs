'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const controller = read('src/systems/combat/combat-exchange-controller.ts');
const pilot = read('src/systems/combat/combat-exchange-pilot.ts');
const routing = read('src/systems/combat/combat-asteroid-routing.ts');
const asteroid = read('src/systems/combat/combat-asteroid-motion.ts');
assert(
  controller.includes('combatRouteHeading(initiator, state.flight.initiatorGoal'),
  'pilot route is planned before beginning the exchange'
);
assert(
  controller.includes('combatRouteHeading(opponent, state.flight.reactorGoal'),
  'reactor route is planned before beginning the exchange'
);
assert(
  pilot.includes('const route = combatRouteHeading(ship, goal, arena, dt)'),
  'exchange pilot follows the asteroid route during thrust'
);
assert(
  /accelerateExchangeShip\(\s*ship,\s*safeGoal/.test(pilot),
  'ship accelerates toward a navigable waypoint instead of an obstacle'
);
assert(routing.includes('pathBlocked('), 'avoid only actual obstructed trajectories');
assert(routing.includes('MAX_DETOUR_HOPS = 5'), 'combat detours have a strict work budget');
assert(!routing.includes('planPointRoute('), 'combat does not perform full-grid A* per exchange');
assert(asteroid.includes('mass: physics.mass *'), 'massive rocks resist small-ship impulses');
console.log('PASS preflight asteroid routing and massive-rock inertia contracts');
