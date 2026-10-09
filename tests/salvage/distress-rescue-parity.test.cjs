'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { createSectorSalvageEventService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/sector-salvage-event-service.ts'
);
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');

function findDistress(predicate) {
  for (let seed = 1; seed <= 100; seed += 1) {
    const service = createSectorSalvageEventService(narrowsSector, seed);
    for (let day = 0; day <= 8; day += 1) {
      service.advanceDay(day, { x: 3500, y: 3000 }, true);
      const event = service.active.find((candidate) => candidate.type === 'distress-rescue');
      if (event && predicate(event)) return { service, event };
    }
  }
  throw new Error('No matching distress profile in deterministic world-event seeds');
}

const tow = findDistress(
  (event) => event.distressDamage === 'power_grid' || event.distressDamage === 'drive_control'
);
assert(tow.event.distressRequiredEngineering > 0);
const diagnosis = tow.service.diagnoseDistress(tow.event.id, 0);
assert.equal(diagnosis.success, true);
assert.equal(tow.service.event(tow.event.id).distressCanRepair, false);
const failedRepair = tow.service.repairDistress(tow.event.id, 0);
assert.equal(failedRepair.success, false);
assert.equal(tow.service.event(tow.event.id).distressStage, 'tow_required');
const towing = tow.service.towDistress(tow.event.id);
assert.equal(towing.success, true);
assert(towing.towDestinationId);
assert.equal(towing.rewardCredits, 0, 'starting tow must never pay reward');
assert.equal(tow.service.finishTowAtLocation('not-the-destination'), null);
assert.equal(tow.service.event(tow.event.id).distressStage, 'towing');
const delivered = tow.service.finishTowAtLocation(towing.towDestinationId);
assert(delivered.success);
assert(delivered.rewardCredits > 0, 'payment occurs only on delivery');
assert.equal(tow.service.finishTowAtLocation(towing.towDestinationId), null, 'no duplicate reward');

const repair = findDistress((event) => event.distressDamage === 'nav_bus');
repair.service.diagnoseDistress(repair.event.id, 100);
const repaired = repair.service.repairDistress(repair.event.id, 100);
assert.equal(repaired.success, true);
assert(repaired.rewardCredits > 0);
assert.equal(repair.service.event(repair.event.id), null);

const evacuation = findDistress(
  (event) => event.distressDamage === 'total_loss' && !event.distressTrap
);
evacuation.service.diagnoseDistress(evacuation.event.id, 100);
const evacuated = evacuation.service.evacuateDistress(evacuation.event.id);
assert.equal(evacuated.success, true);
assert(evacuated.rewardCredits >= 0);

const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');
const callbacks = fs.readFileSync(path.join(root, 'src/app/game-controller-events.ts'), 'utf8');
assert(controller.includes('completeDistressTowOnArrival(context, currentLocationId)'));
assert(callbacks.includes('finishTowAtLocation(currentLocationId)'));
assert(callbacks.includes('applyDistressOutcome(context, result)'));
console.log(
  'PASS distress diagnosis, repair, tow delivery, evacuation, payment and arrival wiring'
);
