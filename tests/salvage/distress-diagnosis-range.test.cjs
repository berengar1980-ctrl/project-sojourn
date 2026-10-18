'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const servicePath = 'src/systems/salvage/salvage-local-space-service.ts';
const navigationPath = 'src/systems/salvage/salvage-work-navigation.ts';
const salvage = loadStandaloneTypeScriptModule(root, servicePath);
const navigation = loadStandaloneTypeScriptModule(root, navigationPath);
const createService = salvage.createSalvageLocalSpaceService;
const scanSeconds = salvage.DISTRESS_DIAGNOSIS_SECONDS;
const standoff = navigation.DISTRESS_DIAGNOSIS_STANDOFF;
const serial = (service) => service.getSnapshot().diagnosisSerial;
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function createScene() {
  const wreck = {
    id: 'event-wreck-salvage-distress-test',
    name: 'Havarist',
    kind: 'freighter',
    quality: 2,
    position: { x: 2200, y: 1285 },
    radius: 90,
    rotation: 0,
    driftVelocity: { x: 0, y: 0 },
    integrity: 60,
    resources: [],
    component: null,
    componentStatus: 'none',
    inspected: false,
    scanLevel: 'unscanned',
  };
  const field = {
    id: 'distress-test',
    sourceLocationId: 'rescue',
    seed: 123,
    width: 4400,
    height: 2570,
    wrecks: [wreck],
    debris: [],
  };
  const service = createService({
    field,
    setup: {
      available: true,
      yieldMultiplier: 1,
      chanceBonus: 0,
      cycleSeconds: 4.8,
      cargoCapacityTons: 200,
      reactorOutput: 100,
      continuousPowerUsed: 0,
    },
    crewSkill: 50,
    scanAvailable: true,
    collect: () => null,
    approachSpeed: 85,
    shipLengthMeters: 90,
  });
  return { service, wreck };
}

assert.equal(scanSeconds, 3);
assert(standoff < 105);

const { service, wreck } = createScene();
assert.equal(service.startDistressDiagnosis(wreck.id).phase, 'idle');
service.selectWreck(wreck.id);
let state = service.startDistressDiagnosis(wreck.id);
assert.equal(state.phase, 'approaching');
assert.equal(serial(service), 0);
assert.notEqual(state.navigationTarget, null);

for (let step = 0; step < 900 && serial(service) === 0; step++) {
  state = service.tick(0.1);
  if (state.phase === 'diagnosing') {
    const separation = Math.hypot(
      state.ship.position.x - wreck.position.x,
      state.ship.position.y - wreck.position.y
    );
    assert(separation <= wreck.radius + standoff + 6, 'diagnosis range');
  }
}
assert.equal(serial(service), 1, 'one completed diagnosis after approach');
assert.equal(state.phase, 'idle');
service.tick(2);
assert.equal(serial(service), 1, 'no repeated diagnosis');

const canceled = createScene();
canceled.service.selectWreck(canceled.wreck.id);
canceled.service.startDistressDiagnosis(canceled.wreck.id);
canceled.service.cancelOperation();
for (let step = 0; step < 40; step++) canceled.service.tick(0.1);
assert.equal(serial(canceled.service), 0, 'cancel stops approach');

const retarget = createScene();
retarget.service.selectWreck(retarget.wreck.id);
retarget.service.startDistressDiagnosis(retarget.wreck.id);
retarget.service.selectWreck(null);
for (let step = 0; step < 40; step++) retarget.service.tick(0.1);
assert.equal(serial(retarget.service), 0, 'new selection cancels diagnosis');

const nearby = createScene();
const closePosition = {
  x: nearby.wreck.position.x + nearby.wreck.radius + standoff,
  y: nearby.wreck.position.y,
};
nearby.service.syncCombatPose(closePosition, 0, 0);
nearby.service.selectWreck(nearby.wreck.id);
assert.equal(nearby.service.startDistressDiagnosis(nearby.wreck.id).phase, 'diagnosing');
for (let step = 0; step < 29; step++) nearby.service.tick(0.1);
assert.equal(serial(nearby.service), 0, 'scan takes three seconds');
nearby.service.cancelOperation();
for (let step = 0; step < 35; step++) nearby.service.tick(0.1);
assert.equal(serial(nearby.service), 0, 'cancel stops scan');

const ui = read('src/ui/salvage/salvage-space-panel.ts');
const controls = read('src/ui/salvage/salvage-sector-event.ts');
const controller = read('src/app/game-controller-salvage.ts');
const renderer = read('src/ui/salvage/salvage-space-renderer.ts');
assert(ui.includes('options.onStartDistressDiagnosis(id)'));
assert(!ui.includes('diagnosisTimer'));
assert(controls.includes('model.selectedWreck?.id'));
assert(controller.includes('service.startDistressDiagnosis(wreck.id)'));
assert(controller.includes('service.getSnapshot().diagnosisSerial !== diagnosisSerial'));
assert(renderer.includes("this.model.phase === 'diagnosing'"));
console.log('PASS distress selected target, approach, range, cancel and scan result');
