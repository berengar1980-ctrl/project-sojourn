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
let smallBelowBaselinePeak = false;
let smallAboveBaselinePeak = false;
let bigBelowBaselineMinimum = false;
let bigAboveBaselineMaximum = false;
for (let seed = 1; seed <= 32; seed += 1) {
  const field = generator.generateSalvageField('container-field', seed, 2);
  assert.deepEqual(field, generator.generateSalvageField('container-field', seed, 2));
  const recoverableScrap = field.wrecks.filter((wreck) => wreck.debrisVariant);
  const sections = field.wrecks.filter((wreck) => wreck.sectionVariant);
  const containers = field.wrecks.filter((wreck) => wreck.containerVariant);
  const allScrap = [...field.debris, ...recoverableScrap];
  assert(allScrap.length >= 140 && allScrap.length <= 164,
    'reduce small debris count while keeping enough fragments to fill the salvage field');
  assert(allScrap.every((entry) => entry.radius >= 7 && entry.radius < 58),
    'small fragments must range from their prior scale up to at most twice their prior maximum');
  smallBelowBaselinePeak ||= allScrap.some((entry) => entry.radius < 29);
  smallAboveBaselinePeak ||= allScrap.some((entry) => entry.radius > 40);
  assert(sections.length >= 8 && sections.length <= 11,
    'all eight additional large sections must exist');
  assert.equal(new Set([
    ...field.debris.map((entry) => entry.variant),
    ...recoverableScrap.map((entry) => entry.debrisVariant),
  ]).size, 8, 'every field must include all eight different fragments');
  assert(recoverableScrap.length >= 46,
    'many visible small fragments must support real scanning and selection');
  assert(recoverableScrap.every((entry) => !entry.inspected && entry.resources.length > 0),
    'small selectable debris must hide real loot before the detail scan');
  assert(field.debris.every((entry) => !('resources' in entry) && !('inspected' in entry)),
    'decorative fragments must never become salvage loot targets');
  assert.equal(new Set(sections.slice(0, 8).map((entry) => entry.sectionVariant)).size, 8,
    'every large 3D section must have a distinct room layout');
  assert(sections.some((section) => section.sectionVariant === 'double-deck'),
    'a visible two-deck cutaway is required');
  assert(sections.every((section) => section.radius >= 64.5 &&
    section.radius < 165 && section.driftVelocity),
    'large sections must stay inside the previous scale range adjusted by ±25%');
  bigBelowBaselineMinimum ||= sections.some((section) => section.radius < 86);
  bigAboveBaselineMaximum ||= sections.some((section) => section.radius > 132);
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
assert(smallBelowBaselinePeak && smallAboveBaselinePeak,
  'small fragment sizes must remain varied rather than uniformly doubled');
assert(bigBelowBaselineMinimum && bigAboveBaselineMaximum,
  'large section size variation must reach both sides of the former range');

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
assert(sections.includes('function tornRoof(') &&
  sections.includes('tornRoof(m, [') &&
  sections.includes('C.soot') &&
  sections.includes('C.edgeMetal'),
  'every large wreck must have jagged ceiling remnants, ruptures and scorch');
assert(sections.includes('floor: [42, 49, 53]'),
  'large exposed ship interiors must remain dark, not clean light-grey');
assert(!renderer.includes('drawHullFragments'), 'old fake hull fragments must remain removed');
assert(fragments.includes('drawProjectedSalvageMesh'), 'wreck fragments share the 3D projection pipeline');
for (const kind of ['Corridor', 'Deck', 'Airlock', 'Truss', 'Engine', 'Reactor',
  'Bulkhead', 'Habitation']) {
  assert(fragments.includes('function build' + kind + '('), 'missing mesh for ' + kind);
}
const lod = readModuleSource(root, 'src/ui/salvage/salvage-mesh-lod-cache.ts');
assert(!fragments.includes('compactMesh('),
  'distant debris must keep the real silhouette, not turn into similar boxes');
assert(!sections.includes('const silhouette ='),
  'large ship section LOD must not collapse every room design into one rectangular mesh');
assert(fragments.includes('drawCachedSalvageMesh(') &&
  sections.includes('drawCachedSalvageMesh('),
  'both distant meshes must share the actual geometry view cache');
assert(lod.includes('drawProjectedSalvageMesh') && lod.includes('distantSprites') &&
  lod.includes('MAX_CACHED_VIEWS') && lod.includes('context.drawImage'),
  'cached 3D mesh views must be rasterized once and memory bounded');
assert(fragments.includes('sparkPulse') && fragments.includes('const breathe'),
  'sparks and escaping gas should animate with cheap 2D effects');
assert(mesh.includes("createContainer('standard')") && mesh.includes("createContainer('damaged')") && mesh.includes("createContainer('tank')"));
assert(scene.includes('resolveShipShieldObstacleCollisions'), 'NPC and player collisions remain enabled');
assert(scene.includes('resolveSalvageShieldContacts'), 'NPC shield collision must use dynamic asteroid impulses');
assert(motion.advanceSalvageContainerDrift, 'asteroid drift integration must be callable');
assert(localService.includes('salvageFieldPhysicsBodies'), 'navigation must use asteroid collision bodies');
const physicsSource = readModuleSource(root, 'src/systems/salvage/salvage-container-motion.ts');
assert(!physicsSource.includes('...(field.debris ?? [])') &&
  physicsSource.includes('for (const scrap of field.debris ?? [])'),
  'visual-only debris must drift without collision bodies or route blocking');
assert(localService.includes('this.collisionShields?.applyCollision(collision)'),
  'player collisions must produce visible shield impacts');
assert(renderer.includes('this.model.shieldImpacts'),
  'salvage map must render contact FX outside of combat');
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
