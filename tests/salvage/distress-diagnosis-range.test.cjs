'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createSalvageLocalSpaceService, DISTRESS_DIAGNOSIS_SECONDS } =
  loadStandaloneTypeScriptModule(root, 'src/systems/salvage/salvage-local-space-service.ts');
const { DISTRESS_DIAGNOSIS_STANDOFF } =
  loadStandaloneTypeScriptModule(root, 'src/systems/salvage/salvage-work-navigation.ts');

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
  const service = createSalvageLocalSpaceService({
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

assert.equal(DISTRESS_DIAGNOSIS_SECONDS, 3);
assert(DISTRESS_DIAGNOSIS_STANDOFF < 105, 'diagnosis standoff must be closer than ordinary salvage');

const { service, wreck } = createScene();
assert.equal(service.startDistressDiagnosis(wreck.id).phase, 'idle', 'must select havarist first');
service.selectWreck(wreck.id);
let snapshot = service.startDistressDiagnosis(wreck.id);
assert.equal(snapshot.phase, 'approaching', 'distant diagnosis must first fly toward the target');
assert.equal(snapshot.diagnosisSerial, 0);
assert.notEqual(snapshot.navigationTarget, null);
for (let step = 0; step < 900 && snapshot.diagnosisSerial === 0; step++) {
  snapshot = service.tick(0.1);
  if (snapshot.phase === 'diagnosing') {
    assert(
      Math.hypot(
        snapshot.ship.position.x - wreck.position.x,
        snapshot.ship.position.y - wreck.position.y
      ) <= wreck.radius + DISTRESS_DIAGNOSIS_STANDOFF + 6,
      'scan may only begin inside short-range stand-off'
    );
  }
}
assert.equal(snapshot.diagnosisSerial, 1, 'after arriving, scan must complete exactly once');
assert.equal(snapshot.phase, 'idle');
assert.equal(service.tick(2).diagnosisSerial, 1, 'completed scan must not repeat');

const canceled = createScene();
canceled.service.selectWreck(canceled.wreck.id);
canceled.service.startDistressDiagnosis(canceled.wreck.id);
canceled.service.cancelOperation();
for (let step = 0; step < 40; step++) canceled.service.tick(0.1);
assert.equal(canceled.service.getSnapshot().diagnosisSerial, 0, 'cancel prevents remote resolution');

const retarget = createScene();
retarget.service.selectWreck(retarget.wreck.id);
retarget.service.startDistressDiagnosis(retarget.wreck.id);
retarget.service.selectWreck(null);
for (let step = 0; step < 40; step++) retarget.service.tick(0.1);
assert.equal(retarget.service.getSnapshot().diagnosisSerial, 0, 'deselecting the target cancels diagnosis');

const nearby = createScene();
nearby.service.syncCombatPose(
  { x: nearby.wreck.position.x + nearby.wreck.radius + DISTRESS_DIAGNOSIS_STANDOFF, y: nearby.wreck.position.y },
  0,
  0
);
nearby.service.selectWreck(nearby.wreck.id);
assert.equal(nearby.service.startDistressDiagnosis(nearby.wreck.id).phase, 'diagnosing');
for (let step = 0; step < 29; step++) nearby.service.tick(0.1);
assert.equal(nearby.service.getSnapshot().diagnosisSerial, 0, 'no early results');
nearby.service.cancelOperation();
for (let step = 0; step < 35; step++) nearby.service.tick(0.1);
assert.equal(nearby.service.getSnapshot().diagnosisSerial, 0, 'cancel during scanning stops result');

const ui = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-panel.ts'), 'utf8');
const controls = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-sector-event.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller-salvage.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-renderer.ts'), 'utf8');
assert(ui.includes('options.onStartDistressDiagnosis(id)'));
assert(!ui.includes('diagnosisTimer'), 'diagnosis must be driven by operation time, not a UI timer');
assert(controls.includes('model.selectedWreck?.id'), 'event actions require selected target');
assert(controller.includes('service.startDistressDiagnosis(wreck.id)'));
assert(controller.includes('service.getSnapshot().diagnosisSerial !== diagnosisSerial'));
assert(renderer.includes("this.model.phase === 'diagnosing'"), 'beam only draws while scanning');
console.log('PASS distress target selection, close approach, scan completion and cancellation');
