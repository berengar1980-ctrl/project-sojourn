'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
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

// Broad sensor sweep sees the object, but must never leak actual loot amounts.
const scanField = generator.generateSalvageField('survey-field', 125, 1);
const scanService = local.createSalvageLocalSpaceService({
  field: scanField,
  setup: {
    available: true,
    yieldMultiplier: 1,
    chanceBonus: 0,
    cycleSeconds: 0.1,
    cargoCapacityTons: 260,
    reactorOutput: 40,
    continuousPowerUsed: 16,
  },
  crewSkill: 65,
  approachSpeed: 400,
  collect() {
    return 0;
  },
});
const nearby = scanField.wrecks[0];
const shipPoint = scanService.getSnapshot().ship.position;
nearby.position = { x: shipPoint.x + 80, y: shipPoint.y + 40 };
scanService.startLongRangeScan();
for (let frame = 0; frame < 105; frame += 1) scanService.tick(0.05);
assert.equal(nearby.scanLevel, 'surveyed', 'shared asteroid long-range scan must discover contact');
assert.equal(nearby.inspected, false, 'long-range scan must not reveal cargo contents');
assert.equal(scanService.getSnapshot().longRangeScanProgress, null, 'five-second scan completes');
const catchup = local.createSalvageLocalSpaceService({
  field: generator.generateSalvageField('catch-up', 301, 1),
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
  collect() {
    return 0;
  },
});
catchup.startLongRangeScan();
catchup.tick(0.12);
assert(
  catchup.getSnapshot().longRangeScanProgress > 0.02,
  'slow frames must advance elapsed scan time instead of dropping everything above 50ms'
);

const firstDeposit = wreck.resources[0];
const before = firstDeposit.remainingAmount;
service.startStrip(wreck.id, firstDeposit.resourceId);
// The inspected container has drifted while idle: allow approach before extraction.
for (let index = 0; index < 400 && collected === 0; index += 1) service.tick(0.05);
assert(collected > 0, 'stripping must collect physical salvage cargo');
assert(firstDeposit.remainingAmount < before, 'stripping must deplete the selected wreck reserve');
assert(service.getSnapshot().recoverySerial > 0);

service.startNavigation({ x: 40, y: 40 });
assert.equal(service.getSnapshot().phase, 'navigating');
for (let index = 0; index < 400; index += 1) service.tick(0.05);
assert.equal(service.getSnapshot().phase, 'idle');

const controller = readModuleSource(root, 'src/app/game-controller.ts');
const scene = readModuleSource(root, 'src/app/game-controller-salvage.ts');
const panel = readModuleSource(root, 'src/ui/salvage/salvage-space-panel.ts');
const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');

assert(controller.includes("mode === 'salvage-space'"));
assert(controller.includes('salvageLocationById'));
assert(scene.includes('generateSalvageField'));
assert(scene.includes('economy: SalvageEconomyService'));
assert(panel.includes('UNTERSUCHEN'));
assert(panel.includes('BERGEN'));
assert(panel.includes('KOMPONENTE BERGEN'));
assert(!panel.includes('dialog'), 'salvage interaction must remain embedded in local-space UI');
assert(renderer.includes('drawSalvageContainer3d'));
assert(renderer.includes('pickWreck'));
assert(
  renderer.includes('emitters[index % emitters.length]'),
  'salvage tractor particles must travel to individual tractor emitters, not one shared center'
);

console.log('PASS live salvage approach, inspection, stripping, cargo and wreck-field UI');
