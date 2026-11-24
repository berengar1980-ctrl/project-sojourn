'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { fieldRouteTarget } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-ship-routing.ts'
);
const ship = { position: { x: 100, y: 500 }, headingRadians: 0, speed: 0 };
const target = { x: 950, y: 500 };
const rock = {
  id: 'blocker',
  position: { x: 500, y: 500 },
  radius: 125,
};
const first = fieldRouteTarget(ship, target, [rock], 65);
assert(first, 'shared A* should find a waypoint around the asteroid');
assert.notDeepEqual(first, target, 'blocked direct route requires a real A* waypoint');
assert.deepEqual(
  fieldRouteTarget(ship, target, [rock], 65),
  first,
  'waypoint stays stable until reached'
);
const clear = fieldRouteTarget(
  { position: { x: 1050, y: 810 }, headingRadians: 0, speed: 0 },
  { x: 1150, y: 850 },
  [rock],
  65
);
assert.deepEqual(clear, { x: 1150, y: 850 }, 'unblocked pirate route stays direct');

const mine = read('src/ui/local-space/local-space-renderer.ts');
const salvage = read('src/ui/salvage/salvage-space-renderer.ts');
const localNpc = read('src/ui/local-space/local-space-scene-layers.ts');
const salvageNpc = read('src/ui/salvage/salvage-scene-layers.ts');
const shared = read('src/ui/combat/embedded-combat-ship-telemetry.ts');
const combat = read('src/ui/combat/fleet-native-ship-annotations.ts');
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
console.log('PASS shared A* corsair routing and campaign/standalone combat overlay parity');
