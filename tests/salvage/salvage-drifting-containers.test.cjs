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
  const recoverableScrap = field.wrecks.filter((wreck) => wreck.debrisVariant);
  const sections = field.wrecks.filter((wreck) => wreck.sectionVariant);
  const containers = field.wrecks.filter((wreck) => wreck.containerVariant);
  assert(field.debris.length + recoverableScrap.length >= 178 &&
    field.debris.length + recoverableScrap.length <= 212,
    'field should carry asteroid-like numbers of small debris');
  assert(sections.length >= 8 && sections.length <= 11,
    'all eight additional large sections must exist');
  assert.equal(new Set([
    ...field.debris.map((entry) => entry.variant),
    ...recoverableScrap.map((entry) => entry.debrisVariant),
  ]).size, 8, 'every field must include all eight different fragments');
  assert(recoverableScrap.length >= 55,
    'many visible small fragments must support real scanning and selection');
  assert(recoverableScrap.every((entry) => !entry.inspected && entry.resources.length > 0),
    'small selectable debris must hide real loot before the detail scan');
  assert(field.debris.every((entry) => !('resources' in entry) && !('inspected' in entry)),
    'decorative fragments must never become salvage loot targets');
  assert.equal(new Set(sections.slice(0, 8).map((entry) => entry.sectionVariant)).size, 8,
    'every large 3D section must have a distinct room layout');
  assert(sections.some((section) => section.sectionVariant === 'double-deck'),
    'a visible two-deck cutaway is required');
  assert(sections.every((section) => section.radius >= 86 &&
    section.radius < 132 && section.driftVelocity),
    'large sections need real scale and asteroid physics');
  assert(field.debris.every((entry) => entry.radius > 0 && entry.driftVelocity),
    'decorative fragments need physics collision and drift bodies');
  assert.equal(new Set(containers.map((entry) => entry.containerVariant)).size, 3,
    'every field must include all three recoverable container models');
  for (const target of containers) {
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
const section = field.wrecks.find((wreck) => wreck.sectionVariant);
const sectionStart = { ...section.position };
const stationaryDistress = {
  ...target,
  id: 'event-wreck-salvage-distress-ship',
  containerVariant: undefined,
  debrisVariant: undefined,
  sectionVariant: undefined,
  position: { x: 600, y: 600 },
  rotation3d: undefined,
};
field.wrecks.push(stationaryDistress);
motion.advanceSalvageContainerDrift(field, 0.05);
assert.notDeepEqual(target.position, start, 'container world collision positions must follow drift');
assert.notDeepEqual(debris.position, debrisStart, 'debris collision positions follow drift');
assert.notDeepEqual(section.position, sectionStart, 'room-scale sections must drift as rigid bodies');
assert.notDeepEqual(target.rotation3d, angle, '3D tumble angles must advance with simulation time');
assert.deepEqual(stationaryDistress.position, { x: 600, y: 600 }, 'distress ship must not drift');

const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
const mesh = readModuleSource(root, 'src/ui/salvage/salvage-container-mesh.ts');
const fragments = readModuleSource(root, 'src/ui/salvage/salvage-debris-mesh.ts');
const sections = readModuleSource(root, 'src/ui/salvage/salvage-section-mesh.ts');
const controller = readModuleSource(root, 'src/app/game-controller-salvage.ts');
const localService = readModuleSource(root, 'src/systems/salvage/salvage-local-space-service.ts');
const scene = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-service.ts');
assert(renderer.includes('drawSalvageContainer3d') && !renderer.includes('drawHullFragments'));
assert(renderer.includes('drawDistressShipSprite'), 'distress ship must keep its original renderer');
assert(renderer.includes('drawSalvageDebris3d'), 'fragment renderer must draw real 3D mesh geometry');
assert(renderer.includes('drawSalvageSection3d') && renderer.includes('wreck.sectionVariant'),
  'large ship rooms must be both drawn and selectable as wrecks');
assert(renderer.includes('wreck.debrisVariant'),
  'small salvageable wreck fragments must use their correct 3D mesh');
for (const name of ['CorridorComplex', 'DoubleDeck', 'EngineRoom', 'CargoHold',
  'CrewBlock', 'Bridge', 'ReactorHall', 'Medbay']) {
  assert(sections.includes('function build' + name + '('), 'missing large room module ' + name);
}
assert(sections.includes('ladder(') && sections.includes('doorX(') &&
  sections.includes('room('), 'big wreck parts need floors, real doorframes and two deck details');
assert(!renderer.includes('drawHullFragments'), 'old fake hull fragments must remain removed');
assert(fragments.includes('drawProjectedSalvageMesh'), 'wreck fragments share the 3D projection pipeline');
for (const kind of ['Corridor', 'Deck', 'Airlock', 'Truss', 'Engine', 'Reactor',
  'Bulkhead', 'Habitation']) {
  assert(fragments.includes('function build' + kind + '('), 'missing mesh for ' + kind);
}
assert(fragments.includes('distantSprites') && fragments.includes('context.drawImage'),
  'distant debris should use reused prerendered low-poly meshes');
assert(fragments.includes('sparkPulse') && fragments.includes('const breathe'),
  'sparks and escaping gas should animate with cheap 2D effects');
assert(mesh.includes("createContainer('standard')") && mesh.includes("createContainer('damaged')") && mesh.includes("createContainer('tank')"));
assert(scene.includes('resolveShipShieldObstacleCollisions'), 'NPC and player collisions remain enabled');
assert(scene.includes('resolveSalvageShieldContacts'), 'NPC shield collision must use dynamic asteroid impulses');
assert(motion.advanceSalvageContainerDrift, 'asteroid drift integration must be callable');
assert(localService.includes('salvageFieldPhysicsBodies'), 'navigation must use asteroid collision bodies');
assert(controller.includes('asteroids: (field.debris ?? []).map'),
  'scrap must be fed into the existing tractor-throw mechanic');
assert(controller.includes('invalidateSalvagePhysics'),
  'thrown scrap must not respawn after combat');
assert(localService.includes('longRangeScanRadius') &&
  localService.includes("wreck.scanLevel = 'surveyed'"),
  'long-range scan must reuse sensor radius without revealing amounts');
assert(renderer.includes("['???']") && renderer.includes('resource.remaining'),
  'long range scan shows ? while detail scan shows actual contents');
assert(renderer.includes('this.camera.pan(rect.width / 2 - shipPoint.x'),
  'initial camera must show player-centered long-range scan contacts');
assert(renderer.includes('private lastFrameAt') && renderer.includes('Math.min(1.5'),
  'salvage renderer must throttle heavy frames and limit pixel density');
assert(localService.includes('this.options.sensorModifier') &&
  localService.includes('this.options.sensorCrewSkill'),
  'sensor scan must use equipped scanner and crew statistics');
assert(controller.includes('field.debris ?? []'), 'space combat must use fragment obstacles');
assert(renderer.includes('pickWreck'), 'containers must remain clickable');

console.log('PASS dense 3D salvage, eight giant multiroom sections, asteroid impulses, scans and tractor throws');
