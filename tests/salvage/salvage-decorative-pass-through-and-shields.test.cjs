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
const hardpoints = {
  sourceWidth: 100,
  pivot: { x: 50, y: 50 },
  shield: {
    centerX: 50, centerY: 50, radiusX: 50, radiusY: 42,
    modifier: 1, maxHp: 100,
  },
};
const service = local.createSalvageLocalSpaceService({
  field,
  setup: {
    available: true, yieldMultiplier: 1, chanceBonus: 0,
    cycleSeconds: 0.1, cargoCapacityTons: 100,
    reactorOutput: 45, continuousPowerUsed: 10,
  },
  hardpoints,
  shipLengthMeters: 100,
  crewSkill: 65,
  approachSpeed: 80,
  collect() { return 0; },
});
const player = service.getSnapshot().ship.position;
const world = physics.salvageFieldPhysicsBodies(field);
assert.equal(world.length, field.wrecks.filter((wreck) =>
  wreck.containerVariant || wreck.sectionVariant || wreck.debrisVariant).length,
  'only interactive wrecks and containers have collision bodies');
assert(!world.some((body) => body.id === decoration.id),
  'purely decorative scrap must never occupy the physics or autopilot obstacle list');
decoration.position = { x: player.x + 7, y: player.y };
decoration.driftVelocity = { x: -50, y: 0 };
const fxBefore = service.getSnapshot().shieldImpacts.length;
service.tick(0.05);
assert.equal(service.getSnapshot().shieldImpacts.length, fxBefore,
  'moving through a purely decorative fragment cannot trigger shield damage or collision FX');

const body = world.find((candidate) => candidate.id === target.id);
assert(body);
body.position = { x: player.x + 43, y: player.y };
body.physics.velocity = { x: -75, y: 0 };
const after = service.tick(0.05);
assert(after.shieldImpacts.length >= 1,
  'a real salvage target must create a visible shield impact on contact');
assert(after.shieldImpacts.some((effect) => effect.lifetimeSeconds > 0),
  'shield collision FX must have a real duration, just like asteroid contacts');

const npc = readModuleSource(root, 'src/systems/npcs/npc-local-salvage-service.ts');
const renderer = readModuleSource(root, 'src/ui/salvage/salvage-space-renderer.ts');
assert(npc.includes("if (body.id === 'player') continue"),
  'NPC shield updates must not consume player impact effects before they are recorded');
assert(renderer.includes('this.model.shieldImpacts'),
  'the salvage renderer must draw its field shield impacts');

console.log('PASS decorative salvage debris is pass-through; selectable wrecks produce shield impact FX');
