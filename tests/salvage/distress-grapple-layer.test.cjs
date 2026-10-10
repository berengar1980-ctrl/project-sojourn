'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tow = read('src/ui/salvage/distress-tow-renderer.ts');
const salvage = read('src/ui/salvage/salvage-space-renderer.ts');
const combat = read('src/ui/combat/strategic-combat-renderer.ts');
const combatHook = read('src/ui/combat/combat-grapple-renderer.ts');
const registry = read('src/systems/ships/ship-registry.ts');

assert(
  tow.includes('projectHardpoint(wreckHook, wreckMounts'),
  'towing cable should attach to the wreck mount rather than its center'
);
assert(
  tow.includes("context.strokeStyle = '#606a70'"),
  'launched tow cable should be a subdued metal color'
);
assert(tow.includes("context.fillStyle = '#a5adb2'"), 'hook head should be silver-gray');
assert(
  salvage.indexOf('drawDistressTow(') < salvage.indexOf('this.drawShip(geometry, timeSeconds)'),
  'tow cable must render below player ship'
);
assert(
  combat.indexOf('drawCombatGrapple(') <
    combat.indexOf('this.drawShip(this.model.attacker, width, height, timeSeconds)'),
  'combat grapple must render below both vessels'
);
assert(combatHook.includes("'#697379'"));
assert(
  registry.includes("layer: 'below' as const"),
  'all registered grapple mounts must use below layer'
);
console.log('PASS silver grappling head, metallic cable, target mount and below-ship rendering');
