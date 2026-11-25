'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (file) => loadStandaloneTypeScriptModule(root, file);
const { planFieldPatrolRoute } = load('src/systems/navigation/field-patrol-route.ts');
const { AsteroidSecurityDrone } = load('src/systems/operations/asteroid-security-drone.ts');
const { WreckClaimRegistry } = load('src/systems/operations/wreck-claim-registry.ts');
const { careerSalvageDrone, advanceCareerSalvageDrones } = load(
  'src/app/game-controller-salvage-drone-world.ts'
);

const obstacle = { id: 'wreck', position: { x: 420, y: 280 }, radius: 70 };
const start = { x: 110, y: 280 };
const target = { x: 790, y: 280 };
const route = planFieldPatrolRoute(start, target, [obstacle], 40);
assert(route.length > 1, 'Blocked straight line requires detour points');
assert.deepEqual(route.at(-1), target);
let previous = start;
for (const point of route) {
  const dx = point.x - previous.x;
  const dy = point.y - previous.y;
  const denom = dx * dx + dy * dy;
  const t =
    denom < 1
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((obstacle.position.x - previous.x) * dx + (obstacle.position.y - previous.y) * dy) /
              denom
          )
        );
  const gap = Math.hypot(
    previous.x + t * dx - obstacle.position.x,
    previous.y + t * dy - obstacle.position.y
  );
  assert(gap >= obstacle.radius + 39.99, 'Every segment clears solid obstacle');
  previous = point;
}

const dense = Array.from({ length: 65 }, (_, index) => ({
  id: String(index),
  position: { x: 250 + (index % 13) * 85, y: 300 + Math.floor(index / 13) * 90 },
  radius: 28,
}));
const begun = performance.now();
planFieldPatrolRoute({ x: 90, y: 430 }, { x: 1400, y: 430 }, dense, 40);
assert(performance.now() - begun < 2000, 'Dense patrol must avoid multi-second grid searches');

const field = {
  id: 'salvage-fast-route',
  sourceLocationId: 'salvage-fast-route',
  seed: 29,
  width: 1200,
  height: 800,
  wrecks: [],
  sections: [],
};
const registry = new WreckClaimRegistry();
const context = {
  economy: {
    wreckClaims: registry,
    sectorNpcs: { npcs: [{ id: 'security-drone:' + field.sourceLocationId, hullHp: 100 }] },
  },
  state: { mode: 'salvage-space', salvageScene: { getField: () => field } },
};
const drone = careerSalvageDrone(context, field);
const initial = { ...drone.position };
for (let index = 0; index < 16; index++) {
  context.state.mode = 'star-map';
  advanceCareerSalvageDrones(context, 0.25);
}
assert.notDeepEqual(drone.position, initial, 'Drone patrol advances while scene is absent');
assert.deepEqual(
  registry.droneCheckpoint(field.sourceLocationId),
  drone.exportState(),
  'Offscreen patrol is checkpointed without remount'
);
const again = careerSalvageDrone(context, field);
assert.equal(again, drone, 'Scene remount and offscreen simulation share one authority');
const restored = new WreckClaimRegistry();
restored.restoreState(registry.exportState());
assert.deepEqual(
  restored.droneCheckpoint(field.sourceLocationId),
  drone.exportState(),
  'Career restore retains offscreen patrol pose and route'
);

const rocks = [
  { id: 'a', kind: 'resource', position: { x: 100, y: 150 }, radius: 10, routeBlocking: false },
  { id: 'b', kind: 'resource', position: { x: 850, y: 150 }, radius: 10, routeBlocking: false },
];
const patrol = new AsteroidSecurityDrone(1000, 500, rocks);
for (let index = 0; index < 20; index++) patrol.tick(0.08, rocks, [], [], { x: 600, y: 400 });
assert(patrol.position.y > 150, 'Pirate pursuit replaces routine patrol destination');
console.log('PASS bounded drone navigation, offscreen world, career checkpoint and pursuit');
