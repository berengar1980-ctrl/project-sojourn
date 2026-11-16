'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const operations = read('src/ui/operations/operations-panel.ts');
const operationsCss = read('src/ui/operations/operations.css');
const settings = read('src/ui/settings/settings-menu.ts');

assert.match(operationsCss, /right: 18px;/);
assert.match(operationsCss, /top: 18px;/);
assert.match(operationsCss, /position: sticky;/);
assert(operations.includes('data-blockade-reason'));
assert(operations.includes('Gesperrt: nicht genügend Credits.'));
assert(
  operations.includes('Gesperrt: zuerst an einem zivilen Hafen andocken.')
);
assert(
  operations.includes('Gesperrt: ein Patrouillenschiff als aktives Schiff wählen.')
);
assert(operations.includes('während des Einsatzes verbündet'));
assert(operations.includes('concessionMarkup(m)'));
// The existing concession register stays reachable.
assert(operations.includes('currentModel = options.model()'));
// Each render uses one model snapshot.
assert(settings.includes('role="alertdialog"'));
assert(settings.includes('requestConfirm('));
assert(settings.includes("hideConfirm()"), 'cancel must only dismiss confirmation');
assert(settings.includes('pendingAction = null'), 'pending action must be cleared');
assert(settings.includes('confirmCancel.focus()'));
assert(!settings.includes('window.confirm('));
assert(settings.includes('loadSavedCareer(onLoadCareer, saveStatus)'));
assert(settings.includes('onReturnToMainMenu'));

console.log('PASS Operations layout and settings confirmation UI contracts');
