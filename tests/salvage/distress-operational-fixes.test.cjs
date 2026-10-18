'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');

const { routeAroundDistressShip } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/distress-navigation.ts'
);
const route = routeAroundDistressShip(
  { x: 100, y: 100 },
  { x: 500, y: 100 },
  { x: 300, y: 100 },
  100
);
assert.equal(route.length, 3, 'course across a disabled vessel must detour');
assert(Math.hypot(route[1].x - 300, route[1].y - 100) >= 100);
assert.equal(
  routeAroundDistressShip({ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 300, y: 450 }, 100).length,
  2,
  'clear route remains direct'
);

const { createDistressTowState } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/distress-tow-physics.ts'
);
assert.equal(createDistressTowState({ x: 300, y: 100 }, 1.4).headingRadians, 1.4);

const scan = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-distress-scan-effect.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/salvage/salvage-space-panel.ts'), 'utf8');
assert(scan.includes('elapsed > 3'));
assert(scan.includes('sweepAngle'));
const diagnosisTiming = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-operation-progress.ts'
);
assert.equal(diagnosisTiming.DISTRESS_DIAGNOSIS_SECONDS, 3);
assert(panel.includes('options.onStartDistressDiagnosis(id)'));
assert(!panel.includes('}, 3000)'), 'the old remote diagnosis timer must be removed');

const { createSectorSalvageEventService } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/sector-salvage-event-service.ts'
);
const { narrowsSector } = loadStandaloneTypeScriptModule(root, 'src/data/maps/narrows-sector.ts');
const events = createSectorSalvageEventService(narrowsSector, 1234);
events.advanceDay(0, { x: 3500, y: 3000 }, true);
const distress = events.active.find((event) => event.type === 'distress-rescue');
assert(distress);
events.diagnoseDistress(distress.id, 50);
const evacuated = events.evacuateDistress(distress.id);
assert(evacuated, 'evacuation must respond to the visible button');
assert(
  evacuated.success || evacuated.boardingRequired,
  'evacuation must either succeed or trigger the diagnosed distress trap'
);

console.log('PASS three-second diagnosis, inertial towing orientation, avoidance and evacuation');
