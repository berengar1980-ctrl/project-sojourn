'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const renderer = read('src/ui/combat/strategic-combat-renderer.ts');
const mining = read('src/ui/local-space/local-space-renderer.ts');
const salvage = read('src/ui/salvage/salvage-space-renderer.ts');
const miningLayers = read('src/ui/local-space/local-space-scene-layers.ts');
const salvageLayers = read('src/ui/salvage/salvage-scene-layers.ts');
const playerEffects = read('src/ui/local-space/mining-effects-renderer.ts');
const navigationRoute = read('src/ui/local-space/local-space-navigation-route.ts');

assert(renderer.includes('this.drawCareerActors?.('));
for (const scene of [mining, salvage]) {
  assert(
    scene.includes('this.drawNpcShips(width, height, timeSeconds, active)'),
    'all noncombat NPCs must be drawn on top of the native PvP battle scene'
  );
  assert(scene.includes('battle.attacker.id, battle.defender.id'));
}
for (const source of [miningLayers, salvageLayers]) {
  assert(source.includes('excludedIds.has(npc.id)'), 'combatants must not be duplicated');
}
assert(
  !miningLayers.includes('this.context.setLineDash([4, 5])'),
  'scanning must no longer draw a misleading blue dashed connection'
);
assert(miningLayers.includes('this.miningEffects.drawNpcMining('));
assert(playerEffects.includes('this.drawMining(workModel,'));
assert(playerEffects.includes('this.drawTractorFields(workModel,'));
assert(playerEffects.includes('drawMiningTractorBeam('));
assert(playerEffects.includes('drawMiningLaserBeam('));
assert(navigationRoute.includes("model.miningPhase === 'extracting'"));

console.log('PASS career NPC visibility and shared mining FX');
