'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const panel = readModuleSource(root, 'src/ui/local-space/local-space-panel.ts');
const selectorSource = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-resource-selector.ts'),
  'utf8'
);
const selector = loadStandaloneTypeScriptModule(
  root,
  'src/ui/local-space/mining-resource-selector.ts'
);
const actions = readModuleSource(root, 'src/app/game-controller-local-actions.ts');
const service = readModuleSource(root, 'src/systems/local-space/local-space-service.ts');
const resourceRuntime = readModuleSource(
  root,
  'src/systems/local-space/mining-resource-runtime.ts'
);

assert.deepEqual(selector.toggleMiningResourceSelection(null, 'ferrite'), ['ferrite']);
assert.deepEqual(
  selector.toggleMiningResourceSelection(['ferrite'], 'sulfur'),
  ['ferrite', 'sulfur'],
  'a second resource must be selectable'
);
assert.deepEqual(
  selector.toggleMiningResourceSelection(['ferrite', 'sulfur'], 'silica'),
  ['ferrite', 'sulfur', 'silica'],
  'selecting a third resource must keep all three targets active'
);
assert.deepEqual(selector.toggleMiningResourceSelection(['ferrite', 'sulfur', 'silica'], 'sulfur'), [
  'ferrite', 'silica',
]);
assert.deepEqual(selector.toggleMiningResourceSelection(['ferrite', 'silica'], 'sulfur'), [
  'ferrite', 'silica', 'sulfur',
]);
assert.deepEqual(selector.toggleMiningResourceSelection(['ferrite', 'silica'], 'ferrite'), [
  'silica',
]);
assert.equal(selector.toggleMiningResourceSelection(['silica'], 'silica'), null);

assert(panel.includes('MiningResourceSelector'));
assert(panel.includes('onMiningResourceSelection'));
assert(selectorSource.includes("allButton.textContent = 'ALLE'"));
assert(selectorSource.includes('FREIE KOMBINATION'));
assert(!selectorSource.includes('DRITTE AUSWAHL ERSETZT DIE ÄLTESTE'));
assert(!selectorSource.includes('selection.length >= 2'));
assert(actions.includes('setMiningResourceSelection(resourceIds)'));
assert(service.includes('this.miningResources.selectionFor(this.selectedAsteroidId)'));
assert(service.includes('this.miningResources.setSelection(asteroid, resourceIds)'));
assert(
  !service.includes("if (this.miningPhase !== 'idle') return this.getSnapshot();"),
  'live extraction must accept new per-resource targeting decisions'
);
assert(selectorSource.includes("target.closest('button')"),
  'click events should resolve the actual resource button');
assert(readModuleSource(root, 'src/ui/local-space/local-space-panel-view.ts')
  .includes('miningResourceSelector.update(model, eventActive)'),
  'buttons must remain enabled during running mining operations');
assert(resourceRuntime.includes('private readonly selections = new Map'));
assert(resourceRuntime.includes('this.selections.set(asteroid.id'));
assert(resourceRuntime.includes('this.selections.delete(asteroid.id)'));
assert(
  !service.includes('if (this.selectedAsteroidId !== id) this.miningResourceSelection = null'),
  'deselecting and reselecting an asteroid must not discard its mining target selection'
);

console.log('PASS mining resource selector switching and per-asteroid persistence');
