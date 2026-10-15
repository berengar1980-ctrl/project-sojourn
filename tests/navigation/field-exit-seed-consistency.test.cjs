'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const gate = loadStandaloneTypeScriptModule(root, 'src/ui/map/local-space-exit-gate.ts');
const localModel = readModuleSource(root, 'src/features/local-space/local-space-view-model.ts');
const salvageModel = readModuleSource(root, 'src/features/salvage/salvage-space-view-model.ts');
const miningUi = readModuleSource(root, 'src/ui/local-space/local-space-panel-view.ts');
const salvageUi = readModuleSource(root, 'src/ui/salvage/salvage-space-panel.ts');
const miningController = readModuleSource(root, 'src/app/game-controller-local-actions.ts');
const salvageController = readModuleSource(root, 'src/app/game-controller-salvage.ts');
const miningRenderer = readModuleSource(root, 'src/ui/local-space/local-space-renderer.ts');
const salvageRenderer = readModuleSource(root, 'src/ui/salvage/salvage-scene-layers.ts');
const styles = readModuleSource(root, 'src/ui/styles.css');

for (const seed of [1, 2, 17, 125, 2468, 31337]) {
  const actualGate = gate.localSpaceExitPoint(4400, 2570, seed);
  assert(
    gate.playerAtLocalExit(actualGate, 4400, 2570, seed),
    'standing in the seeded gate must enable exit for seed ' + seed
  );
  assert(
    gate.playerAtLocalExit({ x: actualGate.x + 75, y: actualGate.y }, 4400, 2570, seed),
    'nearby pilots must be able to leave the field'
  );
  assert(
    !gate.playerAtLocalExit({ x: 2200, y: 1285 }, 4400, 2570, seed),
    'the middle of the field is not automatically the exit'
  );
}
assert(localModel.includes('backgroundSeed: snapshot.instance.seed'));
assert(salvageModel.includes('backgroundSeed: snapshot.field.seed'));
assert(
  /playerAtLocalExit\([\s\S]*?model\.height,\s*model\.backgroundSeed/.test(miningUi),
  'mining exit button must test the gate actually rendered for the current field'
);
assert(
  /playerAtLocalExit\([\s\S]*?model\.height,\s*model\.backgroundSeed/.test(salvageUi),
  'salvage exit button must test the gate actually rendered for the current field'
);
assert(
  miningController.includes(
    'playerAtLocalExit(ship.position, width, height, snapshot.instance.seed)'
  ),
  'mining controller must authorize the same gate as the UI'
);
assert(
  salvageController.includes(
    'playerAtLocalExit(snapshot.ship.position, width, height, snapshot.field.seed)'
  ),
  'salvage controller must authorize the same gate as the UI'
);
assert(
  miningRenderer.includes('this.model.backgroundSeed'),
  'mining renderer must draw the same seeded gate'
);
assert(
  salvageRenderer.includes('this.model.backgroundSeed'),
  'salvage renderer must draw the same seeded gate'
);

assert(
  styles.includes('.local-space-shell .return-map-button') && styles.includes('right: 148px'),
  'local-map exit buttons must remain clear of the settings control'
);

console.log('PASS seeded field exits agree between UI, rendered gate and controller');
