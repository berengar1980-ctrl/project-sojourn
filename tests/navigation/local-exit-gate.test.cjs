'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { localSpaceExitPoint, playerAtLocalExit } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/map/local-space-exit-gate.ts'
);
const exit = localSpaceExitPoint(3200, 1900);
assert.deepEqual(exit, { x: 3020, y: 950 });
assert.equal(playerAtLocalExit({ x: 3020, y: 950 }, 3200, 1900), true);
assert.equal(playerAtLocalExit({ x: 500, y: 950 }, 3200, 1900), false);
assert.equal(playerAtLocalExit({ x: 3020, y: 700 }, 3200, 1900), false);

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
assert(read('src/app/game-controller-local-actions.ts').includes('playerAtLocalExit('));
assert(read('src/app/game-controller-salvage.ts').includes('playerAtLocalExit('));
assert(read('src/app/game-controller-events.ts').includes('controllerSalvageExitAction'));
assert(!read('src/app/game-controller-events.ts').includes('context.navigation.startTravel();\n      runSceneZoomTransition(context.root, actions.mountStarMap)'));
assert(read('src/ui/local-space/local-space-renderer.ts').includes('drawLocalSpaceExitGate('));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes('drawLocalSpaceExitGate('));
assert(
  read('src/systems/combat/strategic-combat-service.ts').includes(
    'distance(combatant.position, arena.exitPoint) <= 90'
  )
);
assert(
  read('src/systems/combat/strategic-combat-movement.ts').includes(
    'arena.exitPoint.x - combatant.position.x'
  )
);
assert(read('src/ui/combat/strategic-combat-renderer.ts').includes('FLUCHTPUNKT'));
assert(read('src/core/ship-types.ts').includes('grapplingHooks?'));
assert(read('src/systems/ships/ship-registry.ts').includes('ensureUtilityHardpoints'));
assert(read('src/ui/salvage/salvage-space-panel.ts').includes('TECHNISCHE DIAGNOSE LÄUFT'));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes('drawDistressDiagnosis('));
assert(read('src/app/game-controller-events.ts').includes('showDistressReward('));
console.log('PASS fixed local exits, combat escape marker, distress scan and utility mounts');
