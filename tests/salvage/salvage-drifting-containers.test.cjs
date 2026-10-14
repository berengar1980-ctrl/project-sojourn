'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');

const root = path.resolve(__dirname, '../..');
const generator = loadStandaloneTypeScriptModule(root, 'src/systems/salvage/salvage-field-generator.ts');
const motion = loadStandaloneTypeScriptModule(root, 'src/systems/salvage/salvage-container-motion.ts');
const types = ['standard', 'damaged', 'tank'];
const variants = new Set();
for (let seed = 1; seed <= 32; seed += 1) {
  const field = generator.generateSalvageField('container-field', seed, 2);
  assert.deepEqual(field, generator.generateSalvageField('container-field', seed, 2));
  assert(field.debris.length >= 8 && field.debris.length <= 11, 'field should have 8-11 fragments');
  assert.equal(new Set(field.debris.slice(0, 8).map((entry) => entry.variant)).size, 8,
    'every field must include all eight different fragments');
  assert(field.debris.every((entry) => !('resources' in entry) && !('inspected' in entry)),
    'decorative fragments must never become salvage loot targets');
  assert(field.debris.every((entry) => entry.radius > 0 && entry.driftVelocity),
    'decorative fragments need physics collision and drift bodies');
  assert.equal(new Set(field.wrecks.map((entry) => entry.containerVariant)).size, 3,
    'every field must include all three recoverable container models');
  for (const target of field.wrecks) {
    variants.add(target.containerVariant);
    assert(types.includes(target.containerVariant), 'old flat wreck variants must not spawn');
    assert(target.driftVelocity && target.rotation3d && target.spin3d, 'containers need 3D motion');
    assert(target.resources.length > 0, 'containers must stay physically salvageable');
    assert(target.radius >= 11.5 && target.radius < 25.5,
      'all ordinary containers must be one third the prior physical size');
  }
}
assert.deepEqual([...variants].sort(), types.sort(), 'all three container variants must spawn');

const field = generator.generateSalvageField('container-field', 42);
const target = field.wrecks[0];
const start = { ...target.position };
const debris = field.debris[0];
const debrisStart = { ...debris.position };
const angle = { ...target.rotation3d };
const stationaryDistress = {
  ...target,
  id: 'event-wreck-salvage-distress-ship',
  containerVariant: undefined,
  position: { x: 600, y: 600 },
  rotation3d: undefined,
};
field.wrecks.push(stationaryDistress);
motion.advanceSalvageContainerDrift(field, 0.05);
assert.notDeepEqual(target.position, start, 'container world collision positions must follow drift');
assert.notDeepEqual(debris.position, debrisStart, 'debris collision positions follow drift');
assert.notDeepEqual(target.rotation3d, angle, '3D tumble angles must advance with simulation time');
assert.deepEqual(stationaryDistress.position, { x: 600, y: 600 }, 'distress ship must not drift');

const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
const mesh = readModuleSource(root, 'src/ui/salvage/salvage-container-mesh.ts');
const fragments = readModuleSource(root, 'src/ui/salvage/salvage-debris-mesh.ts');
const controller = readModuleSource(root, 'src/app/game-controller-salvage.ts');
const scene = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-service.ts');
assert(renderer.includes('drawSalvageContainer3d') && !renderer.includes('drawHullFragments'));
assert(renderer.includes('drawDistressShipSprite'), 'distress ship must keep its original renderer');
assert(renderer.includes('drawSalvageDebris3d'), 'fragment renderer must draw real 3D mesh geometry');
assert(!renderer.includes('drawHullFragments'), 'old fake hull fragments must remain removed');
assert(fragments.includes('drawProjectedSalvageMesh'), 'wreck fragments share the 3D projection pipeline');
for (const kind of ['Corridor', 'Deck', 'Airlock', 'Truss', 'Engine', 'Reactor',
  'Bulkhead', 'Habitation']) {
  assert(fragments.includes('function build' + kind + '('), 'missing mesh for ' + kind);
}
assert(fragments.includes('sparkPulse') && fragments.includes('const breathe'),
  'sparks and escaping gas should animate with cheap 2D effects');
assert(mesh.includes("createContainer('standard')") && mesh.includes("createContainer('damaged')") && mesh.includes("createContainer('tank')"));
assert(scene.includes('resolveShipShieldObstacleCollisions'), 'NPC and player collisions remain enabled');
assert(scene.includes('options.field.wrecks.map'), 'collisions must use live container positions');
assert(scene.includes('this.options.field.debris ?? []'), 'ship shields must collide with fragments');
assert(controller.includes('field.debris ?? []'), 'space combat must use fragment obstacles');
assert(renderer.includes('pickWreck'), 'containers must remain clickable');

console.log('PASS salvage container variants, 3D drift, loot, click, collisions, distress exclusion');
