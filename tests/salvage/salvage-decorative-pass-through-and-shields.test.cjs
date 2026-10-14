'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const { readModuleSource } = require('../module-source.cjs');
const root = path.resolve(__dirname, '../..');
const loader = (file) => loadStandaloneTypeScriptModule(root, file);
const generation = loader('src/systems/salvage/salvage-field-generator.ts');
const physics = loader('src/systems/salvage/salvage-container-motion.ts');
const local = loader('src/systems/salvage/salvage-local-space-service.ts');

const field = generation.generateSalvageField('shield-collision-test', 513, 1);
const decoration = field.debris[0];
const target = field.wrecks.find((wreck) => wreck.containerVariant);
assert(decoration && target);
// Isolate the two bodies to make shield impulse assertions deterministic.
field.debris.splice(0, field.debris.length, decoration);
field.wrecks.splice(0, field.wrecks.length, target);
const hardpoints = {
  sourceWidth: 100,
  pivot: { x: 50, y: 50 },
  shield: {
    centerX: 50,
    centerY: 50,
    radiusX: 50,
    radiusY: 42,
    modifier: 1,
    maxHp: 100,
  },
};
const service = local.createSalvageLocalSpaceService({
  field,
  setup: {
    available: true,
    yieldMultiplier: 1,
    chanceBonus: 0,
    cycleSeconds: 0.1,
    cargoCapacityTons: 100,
    reactorOutput: 45,
    continuousPowerUsed: 10,
  },
  hardpoints,
  shipLengthMeters: 100,
  crewSkill: 65,
  approachSpeed: 80,
  collect() {
    return 0;
  },
});
const player = service.getSnapshot().ship.position;
const world = physics.salvageFieldPhysicsBodies(field);
assert.equal(
  world.length,
  field.wrecks.length + field.debris.length,
  'all visible scrap pieces must have physical collision bodies'
);
const decorativeBody = world.find((body) => body.id === decoration.id);
const targetBody = world.find((body) => body.id === target.id);
assert(decorativeBody && targetBody, 'both scanned and unscanned scrap must be physical');
assert.equal(
  decorativeBody.routeBlocking,
  false,
  'unscannable small scrap never causes autopilot detours'
);
assert.equal(
  targetBody.routeBlocking,
  false,
  'small selectable containers can be pushed but do not block routes'
);

const planner = loader('src/systems/local-space/local-space-navigation.ts');
const centerY = field.height * 0.48;
decorativeBody.position = { x: field.width * 0.5, y: centerY };
targetBody.position = { x: field.width * 0.72, y: centerY + 350 };
const direct = planner.planPointRoute({
  start: { x: field.width * 0.2, y: centerY },
  target: { x: field.width * 0.8, y: centerY },
  asteroids: world,
  clearance: 70,
  width: field.width,
  height: field.height,
});
assert.equal(
  direct.route.length,
  2,
  'autopilot must fly straight through small scrap despite physical collision bodies'
);

// Put an incoming fragment on the player's shield and verify the actual
// asteroid impulse is transferred into its velocity, plus a shield effect.
decorativeBody.position = { x: player.x + 43, y: player.y };
decorativeBody.physics.velocity = { x: -80, y: 0 };
targetBody.position = { x: player.x + 800, y: player.y + 450 };
const incoming = decorativeBody.physics.velocity.x;
const after = service.tick(0.05);
assert(
  after.shieldImpacts.length >= 1,
  'colliding with non-selectable scrap must visibly activate the shield'
);
assert(
  after.shieldImpacts.some((effect) => effect.lifetimeSeconds > 0),
  'shield impacts must have a duration, just like in mining fields'
);
assert(
  decorativeBody.physics.velocity.x > incoming,
  'small scrap must be flung away by the shield impulse, not passed through'
);

const npc = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-service.ts');
const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
assert(
  npc.includes("if (body.id === 'player') continue"),
  'NPC shield updates must not consume player impact effects before they are recorded'
);
assert(
  renderer.includes('this.model.shieldImpacts'),
  'the salvage renderer must draw its field shield impacts'
);

console.log('PASS all salvage scrap collides and is pushed, while small pieces never block routes');
