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
const projector = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-hardpoint-projector.ts'),
  'utf8'
);
const engines = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-engine-effects-renderer.ts'),
  'utf8'
);
const panel = fs.readFileSync(path.join(root, 'src/ui/local-space/local-space-panel.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/app/game-controller.ts'), 'utf8');

assert(renderer.includes('MiningEffectsRenderer'), 'mining VFX must be split from scene renderer');
assert(
  renderer.includes('this.camera.zoomAt(3'),
  'larger local space must preserve the previous initial visual scale'
);
assert(
  renderer.includes('SpaceBackgroundRenderer'),
  'local mining must use shared parallax background'
);
assert(renderer.includes('ShipEngineEffectsRenderer'), 'engine VFX must use shared renderer');
assert(renderer.includes('projectShieldGeometry'), 'shield must use shared ship projection');
assert(renderer.includes('spriteDrawOffset'), 'ship sprite must use shared pivot projection');
assert(renderer.includes("asteroid.kind === 'debris'"), 'renderer must distinguish small debris');
assert(
  renderer.includes("asteroid.kind === 'resource'"),
  'only resource asteroids should be selectable'
);
assert(
  renderer.includes('camera.scale(this.model.ship.nominalLengthMeters)'),
  'local ship visuals must use world scale'
);
assert(projector.includes('projectHardpoint'), 'shared projector must expose hardpoint projection');
assert(
  projector.includes('projectShieldGeometry'),
  'shared projector must expose shield projection'
);
assert(engines.includes('projectHardpoint'), 'engine effects must use shared hardpoint projection');
assert(engines.includes('fastPulse'), 'engine thrust must include subtle flicker');
assert(effects.includes('projectHardpoint'), 'mining lasers must use shared hardpoint projection');
assert(effects.includes('model.miningImpact'), 'mining VFX must use simulation impact point');
assert(!effects.includes('surfaceImpactPoint'), 'renderer must not invent its own mining impact');
assert(effects.includes('Math.sin(timeSeconds * 13)'), 'mining laser must pulse over time');
assert(effects.includes('drawImpactSparks'), 'mining impact must render sparks');
assert(effects.includes('drawImpactDust'), 'mining impact must render transparent dust');
assert(effects.includes('drawTractorFields'), 'mining effects must render tractor collection');
assert(effects.includes('rgba(54, 229, 117'), 'tractor field must use green pulse rendering');
assert(panel.includes('ABBRECHEN'), 'active mining must provide a cancel action');
assert(
  panel.includes('selected.isMiningTarget'),
  'selected alternate asteroids must remain mineable'
);
assert(controller.includes('onCancelMining'), 'app controller must wire mining cancellation');

console.log('PASS shared ship projection, engine, mining impact and local rendering contract');
