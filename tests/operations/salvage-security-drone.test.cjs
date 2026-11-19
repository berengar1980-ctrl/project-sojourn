'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);
const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
const { createSalvageSecurityDrone, tickSalvageSecurityDrone } = load(
  'src/app/game-controller-salvage-drone.ts'
);

const field = {
  id: 'field-wreck-23',
  sourceLocationId: 'wreck-23',
  seed: 23,
  width: 1200,
  height: 800,
  wrecks: [
    {
      id: 'wreck-a',
      position: { x: 600, y: 400 },
      radius: 120,
      inspected: false,
      scanLevel: 'unscanned',
      resources: [{ resourceId: 'ferrite', initialAmount: 4, remainingAmount: 4 }],
      componentStatus: 'none',
    },
  ],
  sections: [{ id: 'debris-block', position: { x: 460, y: 460 }, radius: 50 }],
};
const registry = new WreckClaimRegistry();
const drone = createSalvageSecurityDrone(field, registry);
const start = { ...drone.position };
const traffic = [{ id: 'freighter', position: { x: 770, y: 470 }, radius: 70 }];
for (let i = 0; i < 320; i += 1) {
  tickSalvageSecurityDrone(drone, field, 0.08, traffic);
  const distanceToWreck = Math.hypot(drone.position.x - 600, drone.position.y - 400);
  assert(distanceToWreck >= 120, 'Patrol must never pass through solid wreck');
  const distanceToFreighter = Math.hypot(drone.position.x - 770, drone.position.y - 470);
  assert(distanceToFreighter >= 70, 'Patrol must avoid live NPC ship');
}
assert.notDeepEqual(drone.position, start, 'Patrol must continue after selecting next target');
registry.rememberField(field, drone.exportState());
const saved = JSON.parse(JSON.stringify(registry.exportState()));
const restoredRegistry = new WreckClaimRegistry();
restoredRegistry.restoreState(saved);
const resumed = createSalvageSecurityDrone(field, restoredRegistry);
assert.deepEqual(
  resumed.exportState(),
  drone.exportState(),
  'Patrol must survive scene recreation'
);
tickSalvageSecurityDrone(resumed, field, 0.08, traffic);
assert.notDeepEqual(resumed.position, drone.position, 'Patrol resumes from the saved waypoint');
assert.equal(registry.droneCheckpoint('unknown'), null);
console.log('PASS persistent salvage drone patrol, obstacle avoidance and checkpoint');
