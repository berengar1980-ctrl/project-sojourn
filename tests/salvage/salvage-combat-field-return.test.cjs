'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const load = (name) => loadStandaloneTypeScriptModule(root, name);

const { generateSalvageField } = load('src/systems/salvage/salvage-field-generator.ts');
const { salvageFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');
const { finishSalvageCombat } = load('src/app/game-controller-salvage-combat-return.ts');

const field = generateSalvageField('wreck-test', 4242, 2);
const original = salvageFieldCombatArena(field);
const container = field.wrecks.find((part) => part.containerVariant);
const section = field.wrecks.find((part) => part.sectionVariant);
const debris = field.debris[0];
assert(container && section && debris, 'campaign generator must supply all native body types');

const remaining = original.asteroids
  .filter((part) => part.id !== container.id && part.id !== debris.id)
  .map((part) => ({ ...part, position: { ...part.position }, velocity: { ...part.velocity } }));
const sectionInCombat = remaining.find((part) => part.id === section.id);
assert(sectionInCombat);
sectionInCombat.position.x += 17;
sectionInCombat.position.y += 9;
sectionInCombat.velocity.x += 2.5;
sectionInCombat.rotation += 0.2;

let playerSynced = false;
let npcSynced = false;
const playerService = { syncCombatPose: () => (playerSynced = true) };
const npcService = { syncCombatPose: () => (npcSynced = true) };
const snapshot = {
  arena: { ...original, asteroids: remaining },
  attacker: { position: { x: 90, y: 200 }, headingRadians: 0, speed: 20 },
  defender: {
    id: 'npc-salvager',
    position: { x: 500, y: 700 },
    headingRadians: 1,
    speed: 12,
  },
};
finishSalvageCombat(field, playerService, npcService, snapshot);
assert(playerSynced && npcSynced, 'both ship poses are restored to the local field');
assert(!field.wrecks.some((part) => part.id === container.id), 'thrown container stays removed');
assert(!field.debris.some((part) => part.id === debris.id), 'thrown loose fragment stays removed');
const trackedSection = field.wrecks.find((part) => part.id === section.id);
assert(trackedSection, 'large section survives the battle');
assert.deepEqual(trackedSection.position, sectionInCombat.position);
assert.deepEqual(trackedSection.driftVelocity, sectionInCombat.velocity);
const restored = salvageFieldCombatArena(field);
assert(!restored.asteroids.some((part) => part.id === container.id || part.id === debris.id));
const restoredSection = restored.asteroids.find((part) => part.id === section.id);
assert.equal(restoredSection.rotation, sectionInCombat.rotation);
console.log('PASS native wreck/debris removal and section motion survive combat return');
