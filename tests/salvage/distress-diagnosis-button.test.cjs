'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller-events.ts'), 'utf8');
const scene = fs.readFileSync(path.join(root, 'src/app/game-controller-salvage.ts'), 'utf8');

assert(panel.includes("ui.sectorEventContainer.addEventListener('pointerdown'"));
assert(panel.includes("closest<HTMLButtonElement>('button[data-distress-action]')"));
assert(panel.includes('event.stopPropagation()'));
for (const action of ['diagnose', 'repair', 'tow', 'evacuate']) {
  assert(panel.includes("case '" + action + "':"), action + ' dispatch missing');
}
assert(panel.includes('options.onDiagnoseDistress?.(id)'));
assert(scene.includes('onDiagnoseDistress: options.onDiagnoseDistress'));
assert(controller.includes('economy.salvageEvents.diagnoseDistress('));
console.log('PASS distress action pointer handling and diagnosis callbacks');
