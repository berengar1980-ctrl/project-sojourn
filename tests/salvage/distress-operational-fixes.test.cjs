'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');

const traffic = loadStandaloneTypeScriptModule(
  root,
  'src/systems/navigation/field-traffic-obstacles.ts'
);
const motion = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-container-motion.ts'
);
const { bindFieldTraffic, fieldTrafficObstacles } = traffic;
const { salvageFieldPhysicsBodies } = motion;
const { planSalvageRoute } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/salvage-work-navigation.ts',
  {
    'src/systems/navigation/field-traffic-obstacles.ts': traffic,
    'src/systems/salvage/salvage-container-motion.ts': motion,
  }
);
const { routeSegmentClear } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-navigation.ts'
);
const field = {
  id: 'distress-route-test',
  sourceLocationId: 'distress-route-test',
  seed: 41,
  width: 1800,
  height: 1400,
  wrecks: [
    {
      id: 'event-wreck-salvage-distress-test',
      name: 'Disabled ship',
      kind: 'distress',
      quality: 'standard',
      position: { x: 650, y: 700 },
      radius: 80,
      rotation: 0,
      integrity: 100,
      resources: [],
      component: null,
      componentStatus: 'none',
      inspected: false,
    },
  ],
};
const trafficBlocker = { id: 'hauler', position: { x: 900, y: 820 }, radius: 85 };
bindFieldTraffic(field, () => [trafficBlocker]);
const route = planSalvageRoute(field, { x: 200, y: 700 }, { x: 1100, y: 700 }, 70);
assert(route.length > 2, 'distress and traffic obstacles require a shared detour');
const bodies = [
  ...salvageFieldPhysicsBodies(field).map((body) => ({
    id: body.id,
    position: body.position,
    radius: body.radius,
    collisionRadius: body.collisionRadius,
    routeBlocking: body.routeBlocking,
  })),
  ...fieldTrafficObstacles(field, 'player').map((obstacle) => ({
    id: 'traffic:' + obstacle.id,
    position: obstacle.position,
    radius: obstacle.radius,
    routeBlocking: true,
  })),
];
assert(
  route.slice(1).every((point, index) => routeSegmentClear(route[index], point, bodies, 32)),
  'each route segment must clear the distress ship and live traffic'
);
assert.equal(route[0].x, 200);
assert.equal(route.at(-1).x, 1100);

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

console.log('PASS shared distress avoidance, three-second diagnosis, towing and evacuation');
