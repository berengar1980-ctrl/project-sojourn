'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const events = loadStandaloneTypeScriptModule(root, 'src/systems/salvage/salvage-event-service.ts');

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0.1;
}

function wreck() {
  return {
    id: 'event-wreck',
    name: 'Testwrack',
    kind: 'salvager',
    quality: 3,
    position: { x: 0, y: 0 },
    radius: 45,
    rotation: 0,
    integrity: 62,
    resources: [
      { resourceId: 'steel', initialAmount: 40, remainingAmount: 40 },
      { resourceId: 'electronics', initialAmount: 20, remainingAmount: 20 },
    ],
    component: {
      type: 'salvage',
      componentId: 'salvage3',
      recoveryDifficulty: 80,
      cargoTons: 20,
    },
    componentStatus: 'available',
    inspected: true,
  };
}

{
  const target = wreck();
  const controller = events.createSalvageEventController(9, sequence([0.9, 0.1, 0.2, 0.7, 0.4]));
  const event = controller.inspect(target);
  assert(event, 'inspection should be able to expose a live wreck event');
  assert.equal(event.type, 'data-core');
  const result = controller.resolve(target, 'extract');
  assert(result);
  assert.equal(result.bonusResourceId, 'stolen-data');
  assert(result.resourceAddedTons > 0);
  assert(
    target.resources.some(
      (deposit) => deposit.resourceId === 'stolen-data' && deposit.remainingAmount > 0
    ),
    'event rewards must become physical wreck deposits instead of abstract loot'
  );
  assert(controller.recoverySeconds > 0);
}

{
  const target = wreck();
  const controller = events.createSalvageEventController(11, sequence([0.1, 0.99]));
  assert.equal(controller.inspect(target), null, 'unscheduled wrecks must not fabricate events');
}

const localService = fs.readFileSync(
  path.join(root, 'src/systems/salvage/salvage-local-space-service.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-event-panel.ts'), 'utf8');
assert(localService.includes('this.events.inspect(wreck)'));
assert(localService.includes('resolveSalvageEvent'));
assert(localService.includes('this.events.blocked'));
assert(panel.includes('BERGUNGSEREIGNIS // LIVE'));
assert(!panel.includes('dialog'), 'salvage decisions must remain embedded in local-space UI');

console.log('PASS live salvage wreck events, decisions, physical consequences and non-modal UI');
