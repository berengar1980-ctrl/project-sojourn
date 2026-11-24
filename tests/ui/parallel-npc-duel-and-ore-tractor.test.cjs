'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const model = read('src/app/game-controller-models.ts');
const view = read('src/features/local-space/local-space-view-model.ts');
const scene = read('src/ui/local-space/local-space-renderer.ts');
const npcScene = read('src/ui/local-space/local-space-scene-layers.ts');
const combatFx = read('src/ui/local-space/local-space-npc-combat-effects.ts');
const mining = read('src/systems/npcs/npc-local-mining-service.ts');
const playerEffects = read('src/ui/local-space/mining-effects-renderer.ts');
const pirate = read('src/systems/npcs/npc-local-pirate-service.ts');

assert(model.includes('activeNpcCombatSnapshots?.()'));
assert(view.includes('readonly npcCombats?'));
assert(scene.includes('drawLocalNpcCombatEffects('));
assert(combatFx.includes('drawCombatBeamVisual('));
assert(combatFx.includes('drawCombatImpactBatch('));
assert(combatFx.includes('paintNativeProjectile('));
assert(npcScene.includes('this.model.npcCombats'));
assert(npcScene.includes('combatDefender.shieldImpacts'));
assert(npcScene.includes('fighting) return'));

assert(mining.includes('ship.oreCollection = {'));
assert(mining.includes('if (accepted > 0)'));
assert(playerEffects.includes('const extraction = npc.oreCollection;'));
assert(playerEffects.includes('this.drawTractorFields(workModel,'));
assert(!playerEffects.includes('Array.from({ length: 4 }'));
assert(pirate.includes('moveFieldShip('));
assert(!pirate.includes('keepPirateApart('));
assert(!pirate.includes('pirateRouteDestination('));

console.log('PASS NPC duels and real single ore pickup through player tractor renderer');
