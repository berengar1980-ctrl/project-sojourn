'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const generator = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-field-generator.ts'
);
const local = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-local-space-service.ts'
);

const field = generator.generateSalvageField('drift-wreck', 31337, 2);
const wreck = field.wrecks[0];
let collected = 0;
const service = local.createSalvageLocalSpaceService({
  field,
  setup: {
    available: true,
    yieldMultiplier: 1,
    chanceBonus: 0,
    cycleSeconds: 0.1,
    cargoCapacityTons: 260,
    reactorOutput: 40,
    continuousPowerUsed: 16,
  },
  crewSkill: 60,
  approachSpeed: 400,
  collect(_resourceId, amount) {
    collected += amount;
    return amount;
  },
});

service.selectWreck(wreck.id);
service.startInspect(wreck.id);
for (let index = 0; index < 500; index += 1) service.tick(0.05);
assert.equal(wreck.inspected, true, 'approach must transition into a real wreck inspection');
assert.equal(service.getSnapshot().phase, 'idle');

const inspectionSnapshot = service.getSnapshot();
if (inspectionSnapshot.salvageEvent) {
  const safeChoice = inspectionSnapshot.salvageEvent.choices.find(
    (choice) => choice.risk === 'safe'
  );
  assert(safeChoice, 'wreck events must expose a safe decision path');
  service.resolveSalvageEvent(safeChoice.id);
  for (let index = 0; index < 200; index += 1) service.tick(0.05);
  assert.equal(service.getSnapshot().salvageEvent, null);
  assert.equal(service.getSnapshot().salvageEventRecoverySeconds, 0);
}

const firstDeposit = wreck.resources[0];
const before = firstDeposit.remainingAmount;
service.startStrip(wreck.id, firstDeposit.resourceId);
for (let index = 0; index < 20; index += 1) service.tick(0.05);
assert(collected > 0, 'stripping must collect physical salvage cargo');
assert(firstDeposit.remainingAmount < before, 'stripping must deplete the selected wreck reserve');
assert(service.getSnapshot().recoverySerial > 0);

service.startNavigation({ x: 40, y: 40 });
assert.equal(service.getSnapshot().phase, 'navigating');
for (let index = 0; index < 400; index += 1) service.tick(0.05);
assert.equal(service.getSnapshot().phase, 'idle');

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const scene = fs.readFileSync(path.join(root, 'src/app/game-controller-salvage.ts'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-panel.ts'), 'utf8');
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-space-renderer.ts'),
  'utf8'
);

assert(controller.includes("mode === 'salvage-space'"));
assert(controller.includes('salvageLocationById'));
assert(scene.includes('generateSalvageField'));
assert(scene.includes('economy: SalvageEconomyService'));
assert(panel.includes('UNTERSUCHEN'));
assert(panel.includes('BERGEN'));
assert(panel.includes('KOMPONENTE BERGEN'));
assert(!panel.includes('dialog'), 'salvage interaction must remain embedded in local-space UI');
assert(renderer.includes('drawHullFragments'));
assert(renderer.includes('pickWreck'));

console.log('PASS live salvage approach, inspection, stripping, cargo and wreck-field UI');
