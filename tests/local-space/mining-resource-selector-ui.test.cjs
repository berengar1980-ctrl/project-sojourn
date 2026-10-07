'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-panel.ts'),
  'utf8'
);
const selectorSource = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-resource-selector.ts'),
  'utf8'
);
const selector = loadStandaloneTypeScriptModule(
  root,
  'src/ui/local-space/mining-resource-selector.ts'
);
const actions = fs.readFileSync(
  path.join(root, 'src/app/game-controller-local-actions.ts'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);
const resourceRuntime = fs.readFileSync(
  path.join(root, 'src/systems/local-space/mining-resource-runtime.ts'),
  'utf8'
);

assert.deepEqual(selector.toggleMiningResourceSelection(null, 'ferrite'), ['ferrite']);
assert.deepEqual(
  selector.toggleMiningResourceSelection(['ferrite'], 'sulfur'),
  ['ferrite', 'sulfur'],
  'a second resource must be selectable'
);
assert.deepEqual(
  selector.toggleMiningResourceSelection(['ferrite', 'sulfur'], 'silica'),
  ['sulfur', 'silica'],
  'selecting a third resource must replace the oldest target instead of being blocked'
);
assert.deepEqual(selector.toggleMiningResourceSelection(['sulfur', 'silica'], 'sulfur'), [
  'silica',
]);
assert.equal(selector.toggleMiningResourceSelection(['silica'], 'silica'), null);

assert(panel.includes('MiningResourceSelector'));
assert(panel.includes('onMiningResourceSelection'));
assert(selectorSource.includes("allButton.textContent = 'ALLE'"));
assert(selectorSource.includes('DRITTE AUSWAHL ERSETZT DIE ÄLTESTE'));
assert(!selectorSource.includes('selection.length >= 2'));
assert(actions.includes('setMiningResourceSelection(resourceIds)'));
assert(service.includes('this.miningResources.selectionFor(this.selectedAsteroidId)'));
assert(service.includes('this.miningResources.setSelection(asteroid, resourceIds)'));
assert(resourceRuntime.includes('private readonly selections = new Map'));
assert(resourceRuntime.includes('this.selections.set(asteroid.id'));
assert(resourceRuntime.includes('this.selections.delete(asteroid.id)'));
assert(
  !service.includes('if (this.selectedAsteroidId !== id) this.miningResourceSelection = null'),
  'deselecting and reselecting an asteroid must not discard its mining target selection'
);

console.log('PASS mining resource selector switching and per-asteroid persistence');
