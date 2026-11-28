'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => loadStandaloneTypeScriptModule(root, file);

// Regression guard: the established 1v1 engine is not rewritten for local fights.
const controller = read('src/app/game-controller-scene-tick.ts');
const fieldBridge = read('src/app/game-controller-field-world-bridge.ts');
const miningService = read('src/systems/npcs/npc-local-mining-service.ts');
const salvageScene = read('src/app/game-controller-salvage.ts');
const salvageNpc = read('src/systems/npcs/npc-local-salvage-service.ts');
assert(
  controller.includes('tickCombatEnvironment(deltaSeconds)'),
  'embedded mining advances background systems'
);
assert(
  fieldBridge.includes('const fieldWorld = fieldWorldFor(context)') &&
    fieldBridge.includes('fieldWorld.tick(deltaSeconds, localId'),
  'mining field stays active in duel'
);
assert(
  fieldBridge.includes('fieldCombat.arena.asteroids'),
  'mining uses authoritative combat rocks'
);
assert(
  fieldBridge.includes('field.miners.tick(seconds, defenderId)'),
  'non-engaged miners continue'
);
assert(
  miningService.includes('if (ship.npcId === combatantId) continue'),
  'duel miner is never moved twice'
);
assert(
  salvageScene.includes('npcSalvage.tick(deltaSeconds, combat.defender.id, true)'),
  'non-engaged salvagers continue'
);
assert(
  salvageNpc.includes('if (ship.npcId === combatantId) continue'),
  'duel salvager is never moved twice'
);
assert(
  salvageScene.includes('syncSalvageCombatField(context.field, fieldCombat)'),
  'visible wrecks follow combat'
);

// Runtime check: native wreck objects follow combat motion, including fragments
// that were removed by the grapple/tractor mechanics.
const { generateSalvageField } = load('src/systems/salvage/salvage-field-generator.ts');
const { salvageFieldCombatArena } = load('src/systems/combat/field-combat-arena.ts');
const { syncSalvageCombatField } = load('src/app/game-controller-salvage-combat-return.ts');
const field = generateSalvageField('embedded-combat', 4343, 2);
const arena = salvageFieldCombatArena(field);
const tracked = field.wrecks[0];
const removed = field.debris[0];
assert(tracked && removed);
const bodies = arena.asteroids
  .filter((body) => body.id !== removed.id)
  .map((body) => ({ ...body, position: { ...body.position }, velocity: { ...body.velocity } }));
const changed = bodies.find((body) => body.id === tracked.id);
assert(changed);
changed.position.x += 23;
changed.position.y += 11;
changed.rotation += 0.3;
syncSalvageCombatField(field, { arena: { ...arena, asteroids: bodies } });
assert.deepEqual(tracked.position, changed.position);
assert.equal(tracked.rotation, changed.rotation);
assert(!field.debris.some((body) => body.id === removed.id), 'destroyed debris does not reappear');
const { salvageDroneObstacleAsteroids } = load('src/systems/salvage/salvage-patrol-geometry.ts');
const { resolveFieldDebrisContacts } = load('src/systems/local-space/field-debris-contact.ts');
const light = field.wrecks.find((body) => body.containerVariant);
const heavy = field.wrecks.find((body) => body.sectionVariant);
const trafficBodies = salvageDroneObstacleAsteroids(field);
const lightBody = trafficBodies.find((body) => body.id === light.id);
const heavyBody = trafficBodies.find((body) => body.id === heavy.id);
assert.equal(lightBody.routeBlocking, false);
assert.equal(heavyBody.routeBlocking, true);
assert.equal(
  resolveFieldDebrisContacts(lightBody.position, { x: 80, y: 0 }, [lightBody], 15, 100000),
  1
);
assert.notDeepEqual(lightBody.position, light.position);
console.log('PASS local embedded combat keeps environmental and NPC simulations separate');
