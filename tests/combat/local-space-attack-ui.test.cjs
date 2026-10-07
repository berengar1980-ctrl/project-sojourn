'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const miningInput = read('src/ui/local-space/local-space-input.ts');
const miningPanel = read('src/ui/local-space/local-space-panel.ts');
const miningRenderer = read('src/ui/local-space/local-space-renderer.ts');
const salvageInput = read('src/ui/salvage/salvage-space-input.ts');
const salvagePanel = read('src/ui/salvage/salvage-space-panel.ts');
const salvageRenderer = read('src/ui/salvage/salvage-space-renderer.ts');
const engagements = read('src/systems/combat/star-map-engagement-service.ts');
const combatPanel = read('src/ui/combat/strategic-combat-panel.ts');
const combatRenderer = read('src/ui/combat/strategic-combat-renderer.ts');
const controller = read('src/app/game-controller.ts');

assert(
  miningInput.indexOf('pickNpc') < miningInput.indexOf('pickAsteroid'),
  'mining-space input must prioritize NPC ships over asteroid hit areas'
);
assert(
  salvageInput.indexOf('pickNpc') < salvageInput.indexOf('pickWreck'),
  'salvage-space input must prioritize NPC ships over wreck hit areas'
);
assert(
  miningRenderer.includes('npcHitAreas') && salvageRenderer.includes('npcHitAreas'),
  'local renderers must publish clickable NPC hit areas'
);
assert(
  miningPanel.includes('local-attack-button') && salvagePanel.includes('salvage-attack-button'),
  'both local-space scenes must expose an attack action for selected ships'
);
assert(
  engagements.includes('engageNpcNow') &&
    controller.includes('context.engagements.engageNpcNow(id)'),
  'local attacks must enter the shared combat service without star-map pursuit'
);
assert(
  miningInput.includes('event.clientX - rect.left') &&
    salvageInput.includes('event.clientX - rect.left'),
  'local click coordinates must be measured against the canvas bounds'
);
assert(
  combatPanel.includes('strategic-combat-map') &&
    combatPanel.includes('StrategicCombatRenderer') &&
    combatRenderer.includes('drawWeaponEvent'),
  'combat contact must open a dedicated local battle-map visualization'
);

console.log('PASS local NPC selection, attack wiring and combat-map transition');
