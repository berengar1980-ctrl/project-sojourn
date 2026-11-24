'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller-events.ts'), 'utf8');
const scene = fs.readFileSync(path.join(root, 'src/app/game-controller-salvage.ts'), 'utf8');
const diagnosis = fs.readFileSync(
  path.join(root, 'src/app/game-controller-salvage-diagnosis.ts'),
  'utf8'
);

assert(panel.includes("ui.sectorEventContainer.addEventListener('pointerdown'"));
assert(panel.includes("closest<HTMLButtonElement>('button[data-distress-action]')"));
assert(panel.includes('event.stopPropagation()'));
for (const action of ['diagnose', 'repair', 'tow', 'evacuate']) {
  assert(panel.includes("case '" + action + "':"), action + ' dispatch missing');
}
assert(panel.includes('options.onStartDistressDiagnosis(id)'));
assert(scene.includes('requestDistressDiagnosis(context, eventId)'));
assert(scene.includes('tickDistressDiagnosis(context, deltaSeconds, Boolean(fieldCombat))'));
assert(diagnosis.includes('options.onDiagnoseDistress?.(event.id)'));
assert(controller.includes('economy.salvageEvents.diagnoseDistress('));
console.log('PASS distress action pointer handling and diagnosis callbacks');
