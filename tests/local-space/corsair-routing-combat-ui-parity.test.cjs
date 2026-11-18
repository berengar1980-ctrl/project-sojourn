'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { pirateRouteDestination } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/npcs/npc-local-pirate-routing.ts'
);
const start = { x: 100, y: 500 };
const target = { x: 950, y: 500 };
const rock = {
  id: 'blocker',
  kind: 'resource',
  routeBlocking: true,
  position: { x: 500, y: 500 },
  radius: 125,
};
const first = pirateRouteDestination(start, target, null, [rock], 1200, 1000);
assert(first.detour, 'direct path through an asteroid requires a detour');
assert(
  Math.hypot(first.destination.x - rock.position.x, first.destination.y - rock.position.y) >
    rock.radius + 100,
  'route clearance must account for the size of the corsair'
);
const again = pirateRouteDestination({ x: 150, y: 510 }, target, first.detour, [rock], 1200, 1000);
assert.deepEqual(again.destination, first.destination, 'flank must not switch every tick');
const clear = pirateRouteDestination(
  { x: 1050, y: 810 },
  { x: 1150, y: 850 },
  null,
  [rock],
  1200,
  1000
);
assert.equal(clear.detour, null, 'unblocked travel keeps a direct route');

const mine = read('src/ui/local-space/local-space-renderer.ts');
const salvage = read('src/ui/salvage/salvage-space-renderer.ts');
const localNpc = read('src/ui/local-space/local-space-scene-layers.ts');
const salvageNpc = read('src/ui/salvage/salvage-scene-layers.ts');
const shared = read('src/ui/combat/embedded-combat-ship-telemetry.ts');
const combat = read('src/ui/combat/strategic-combat-renderer.ts');
for (const source of [mine, salvage, localNpc, salvageNpc]) {
  assert(
    source.includes('drawEmbeddedCombatShipTelemetry'),
    'both local maps must draw strategy and boost on both duelling ships'
  );
}
assert(shared.includes('drawCombatShipStatus(') && shared.includes('drawCombatBoostMeter('));
assert(combat.includes('drawCombatShipStatus(') && combat.includes('drawCombatBoostMeter('));

const safety = read('src/systems/combat/combat-steering-safety.ts');
const steering = read('src/systems/combat/combat-route-steering.ts');
assert(safety.includes('(!obstacle || waypoint)'));
assert(steering.includes('cover ?? waypoint ?? direction'));
console.log('PASS corsair obstacle detours and campaign/standalone combat overlay parity');
