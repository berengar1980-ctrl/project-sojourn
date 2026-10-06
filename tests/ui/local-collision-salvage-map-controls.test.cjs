'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mapPanel = fs.readFileSync(path.join(root, 'src/ui/map/star-map-panel.ts'), 'utf8');
const mapRenderer = fs.readFileSync(
  path.join(root, 'src/ui/map/topdown-map-renderer.ts'),
  'utf8'
);
const miningNpc = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-local-mining-service.ts'),
  'utf8'
);
const salvageNpc = fs.readFileSync(
  path.join(root, 'src/systems/npcs/npc-local-salvage-service.ts'),
  'utf8'
);
const salvagePanel = fs.readFileSync(
  path.join(root, 'src/ui/salvage/salvage-space-panel.ts'),
  'utf8'
);

assert(
  mapPanel.includes('NAMEN // AN') &&
    mapPanel.includes('NAMEN // AUS') &&
    mapRenderer.includes('setLabelsVisible'),
  'star map must offer a persistent names on/off toggle'
);
assert(
  miningNpc.includes('resolveShipShieldObstacleCollisions') &&
    miningNpc.includes('options.getAsteroids().map'),
  'NPC miners must collide with local asteroids'
);
assert(
  salvageNpc.includes('resolveShipShieldObstacleCollisions') &&
    salvageNpc.includes('options.field.wrecks.map'),
  'player and NPC ships must collide with wrecks in salvage space'
);
assert(
  salvagePanel.includes('ANFLIEGEN & SCANNEN') &&
    salvagePanel.includes('ANFLIEGEN & BERGEN') &&
    salvagePanel.includes('KEIN BERGUNGSSYSTEM'),
  'salvage UI must explain the workflow and clearly expose missing salvage equipment'
);
assert(
  salvagePanel.includes("ui.resources.addEventListener('pointerdown'") &&
    salvagePanel.includes("button[data-salvage-action]") &&
    salvagePanel.includes("dataset.salvageAction = 'strip'") &&
    salvagePanel.includes('event.preventDefault()'),
  'frame-rebuilt salvage buttons must fire on pointerdown before the button node is replaced'
);

console.log('PASS local collision wiring, star-map name toggle and salvage guidance');
