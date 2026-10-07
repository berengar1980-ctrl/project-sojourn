'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-panel.ts'),
  'utf8'
);
const selector = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-resource-selector.ts'),
  'utf8'
);
const actions = fs.readFileSync(
  path.join(root, 'src/app/game-controller-local-actions.ts'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(root, 'src/systems/local-space/local-space-service.ts'),
  'utf8'
);

assert(panel.includes('MiningResourceSelector'));
assert(panel.includes('onMiningResourceSelection'));
assert(selector.includes("allButton.textContent = 'ALLE'"));
assert(selector.includes('current.length < 2'));
assert(selector.includes('50 % SCHWUND'));
assert(actions.includes('setMiningResourceSelection(resourceIds)'));
assert(service.includes('unique.length < 1 || unique.length > 2'));
assert(service.includes('miningResourceSelection: this.miningResourceSelection'));

console.log('PASS mining resource selector UI and runtime wiring');
