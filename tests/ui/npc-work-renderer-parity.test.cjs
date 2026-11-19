'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const miner = source('src/ui/local-space/local-space-scene-layers.ts');
const mining = source('src/ui/local-space/mining-effects-renderer.ts');
const salvage = source('src/ui/salvage/salvage-scene-layers.ts');
const salvageEffect = source('src/ui/salvage/salvage-work-effect-renderer.ts');
const bridge = source('src/app/game-controller-field-world-bridge.ts');
const combat = source('src/systems/combat/strategic-combat-service.ts');
const pirate = source('src/data/ships/pirate-class-ships.ts');

assert(miner.includes('this.miningEffects.drawNpcMining('));
assert(!miner.includes('drawNpcMiningBeam('));
assert(mining.includes('this.drawMining(workModel,'));
assert(mining.includes('this.drawTractorFields(workModel,'));
assert(mining.includes('this.drawImpactSparks('));
assert(mining.includes('this.drawImpactDust('));
assert(mining.includes('drawMiningChunkVisual(this.context, point, chunk.id)'));
assert(salvage.includes('drawSalvageWorkEffect('));
assert(!salvage.includes('drawNpcSalvageTether('));
assert(salvageEffect.includes('drawSalvageWorkEffect('));
assert(bridge.includes('activeNpcCombatSnapshots()'));
assert(bridge.includes('setBystanders(bystanders)'));
assert(combat.includes('resolveCombatBystanderContacts('));
assert(!pirate.includes('nominalLengthMeters: 120'));
assert(!pirate.includes('nominalLengthMeters: 80'));

console.log('PASS real player FX reused for NPC work, live duel poses and native patrol scale');
