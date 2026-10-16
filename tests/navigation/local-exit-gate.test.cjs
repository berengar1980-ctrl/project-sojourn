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
const exit = localSpaceExitPoint(3200, 1900, 417);
assert.deepEqual(exit, localSpaceExitPoint(3200, 1900, 417), 'same seed retains gate');
assert.notDeepEqual(exit, localSpaceExitPoint(3200, 1900, 418), 'different seeds move the gate');
assert.equal(playerAtLocalExit(exit, 3200, 1900, 417), true);
assert.equal(playerAtLocalExit({ x: 1600, y: 950 }, 3200, 1900, 417), false);
assert.equal(playerAtLocalExit(exit, 3200, 1900, 418), false);
for (let seed = 1; seed <= 100; seed += 1) {
  const gate = localSpaceExitPoint(4400, 2570, seed);
  assert(
    gate.x === 180 || gate.x === 4220 || gate.y === 180 || gate.y === 2390,
    'seed ' + seed + ' must select a safe map edge'
  );
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
assert(read('src/app/game-controller-local-actions.ts').includes('playerAtLocalExit('));
assert(read('src/app/game-controller-salvage.ts').includes('playerAtLocalExit('));
assert(read('src/app/game-controller-events.ts').includes('controllerSalvageExitAction'));
assert(
  !read('src/app/game-controller-events.ts').includes(
    'context.navigation.startTravel();\\n      runSceneZoomTransition(context.root, actions.mountStarMap)'
  )
);
assert(read('src/ui/local-space/local-space-renderer.ts').includes('drawLocalSpaceExitGate('));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes('this.drawExitGate('));
assert(read('src/ui/salvage/salvage-scene-layers.ts').includes('drawLocalSpaceExitGate('));
assert(
  read('src/systems/combat/combat-escape-evaluation.ts').includes(
    'distance(combatant.position, gate) <= 90'
  )
);
assert(
  read('src/systems/combat/combat-flight-intent.ts').includes('gate.x - ship.position.x')
);
assert(read('src/ui/combat/combat-escape-gate-renderer.ts').includes('FLUCHTPUNKT'));
assert(read('src/ui/combat/strategic-combat-renderer.ts').includes('drawCombatEscapeGate('));
assert(read('src/core/ship-types.ts').includes('grapplingHooks?'));
assert(read('src/systems/ships/ship-registry.ts').includes('ensureUtilityHardpoints'));
assert(read('src/ui/salvage/salvage-space-panel.ts').includes('TECHNISCHE DIAGNOSE LÄUFT'));
assert(read('src/ui/salvage/salvage-space-renderer.ts').includes('drawDistressScanEffect('));
assert(read('src/app/game-controller-events.ts').includes('showDistressReward('));
console.log('PASS fixed local exits, combat escape marker, distress scan and utility mounts');
