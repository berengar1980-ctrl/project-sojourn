'use strict';

const { readModuleSource } = require('../module-source.cjs');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = readModuleSource(root, 'src/ui/map/topdown-map-renderer.ts');
const npcRenderer = readModuleSource(root, 'src/ui/map/npc-ship-map-renderer.ts');
const model = fs.readFileSync(
  path.join(root, 'src/features/star-map/star-map-view-model.ts'),
  'utf8'
);
const controller = readModuleSource(root, 'src/app/game-controller-star-map.ts');

assert(
  model.includes('spriteUrl: string') &&
    model.includes('spriteAspectRatio: number') &&
    model.includes('hardpoints: ShipHardpoints'),
  'star-map NPC contacts must carry real ship sprite metadata'
);
assert(
  controller.includes('definition.sprite.assetUrl') &&
    controller.includes('economy.sectorNpcs.liveHeading(npc)'),
  'star-map controller must resolve each NPC to its real Sojourn ship asset and heading'
);
assert(
  controller.includes('sectorSensorContactInfo') &&
    controller.includes('if (!contact.visible) return []'),
  'star-map NPC visibility must be gated by sensor crew and hardware'
);
assert(
  renderer.includes('NpcShipMapRenderer') &&
    npcRenderer.includes('this.lighting.draw') &&
    npcRenderer.includes('image,') &&
    !npcRenderer.includes('this.context.rotate(Math.PI / 4'),
  'physical star map must render NPC ship sprites instead of diamond dots'
);

console.log('PASS star map renders real NPC ship assets instead of point contacts');
