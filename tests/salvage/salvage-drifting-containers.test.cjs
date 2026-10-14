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
  for (const target of field.wrecks) {
    variants.add(target.containerVariant);
    assert(types.includes(target.containerVariant), 'old flat wreck variants must not spawn');
    assert(target.driftVelocity && target.rotation3d && target.spin3d, 'containers need 3D motion');
    assert(target.resources.length > 0, 'containers must stay physically salvageable');
    assert(target.radius > 0, 'containers must keep a collision body');
  }
}
assert.deepEqual([...variants].sort(), types.sort(), 'all three container variants must spawn');

const field = generator.generateSalvageField('container-field', 42);
const target = field.wrecks[0];
const start = { ...target.position };
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
assert.notDeepEqual(target.rotation3d, angle, '3D tumble angles must advance with simulation time');
assert.deepEqual(stationaryDistress.position, { x: 600, y: 600 }, 'distress ship must not drift');

const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
const mesh = readModuleSource(root, 'src/ui/salvage/salvage-container-mesh.ts');
const scene = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-service.ts');
assert(renderer.includes('drawSalvageContainer3d') && !renderer.includes('drawHullFragments'));
assert(renderer.includes('drawDistressShipSprite'), 'distress ship must keep its original renderer');
assert(mesh.includes("createContainer('standard')") && mesh.includes("createContainer('damaged')") && mesh.includes("createContainer('tank')"));
assert(scene.includes('resolveShipShieldObstacleCollisions'), 'NPC and player collisions remain enabled');
assert(scene.includes('options.field.wrecks.map'), 'collisions must use live container positions');
assert(renderer.includes('pickWreck'), 'containers must remain clickable');

console.log('PASS salvage container variants, 3D drift, loot, click, collisions, distress exclusion');
