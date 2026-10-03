'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/local-space/local-space-renderer.ts'),
  'utf8'
);
const effects = fs.readFileSync(
  path.join(root, 'src/ui/local-space/mining-effects-renderer.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(renderer.includes('MiningEffectsRenderer'), 'mining VFX must be split from scene renderer');
assert(
  renderer.includes('SpaceBackgroundRenderer'),
  'local mining must use shared parallax background'
);
assert(renderer.includes('drawShieldFlash'), 'shield impacts must have a visual flash');
assert(renderer.includes('source.pivot.x'), 'local ship renderer must use JSON pivot');
assert(effects.includes('source.pivot.x'), 'mining hardpoints must rotate around JSON pivot');
assert(
  renderer.includes('camera.scale(this.model.ship.nominalLengthMeters)'),
  'local ship visuals must use world scale'
);
assert(effects.includes('drawMining'), 'mining effects renderer must draw the mining beam');
assert(effects.includes('Math.sin(timeSeconds * 13)'), 'mining laser must pulse over time');
assert(effects.includes('drawImpactSparks'), 'mining impact must render sparks');
assert(effects.includes('drawImpactDust'), 'mining impact must render transparent dust');
assert(effects.includes('surfaceImpactPoint'), 'mining impact must occur on asteroid surface');
assert(!effects.includes('arc(target.x, target.y, 4.5'), 'fixed impact point must stay removed');
assert(effects.includes('drawTractorFields'), 'mining effects must render tractor collection');
assert(effects.includes('rgba(54, 229, 117'), 'tractor field must use green pulse rendering');
assert(panel.includes('ABBRECHEN'), 'active mining must provide a cancel action');
assert(
  panel.includes('selected.isMiningTarget'),
  'selected alternate asteroids must remain mineable'
);
assert(panel.includes('ZUR STERNKARTE'), 'local space must provide return to star map');
assert(panel.includes('MINING'), 'asteroid selection must expose mining action');
assert(controller.includes('onCancelMining'), 'app controller must wire mining cancellation');
assert(
  controller.includes("currentLocationId === 'greyrock-belt'"),
  'Greyrock arrival must enter local space'
);
assert(controller.includes('runSceneZoomTransition'), 'scene switch must use zoom transition');

console.log('PASS local-space UI, world-scale shield and mining VFX contract');
