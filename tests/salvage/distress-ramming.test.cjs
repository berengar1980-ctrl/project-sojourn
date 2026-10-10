'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const physics = loadStandaloneTypeScriptModule(
  root,
  'src/systems/salvage/distress-ramming-physics.ts'
);
const initial = physics.createDistressRammingState({ x: 100, y: 100 });
const impact = physics.advanceDistressRamming(
  initial,
  { x: 130, y: 100 },
  { x: 182, y: 100 },
  35,
  30,
  0.05
);
assert(impact.state.velocity.x > 0, 'collision must transfer momentum to the drifting vessel');
assert.equal(impact.state.impactAge, 0, 'ramming starts a fresh shield effect');
assert(impact.position.x > 182, 'the target must physically move from its starting position');
const after = physics.advanceDistressRamming(
  impact.state,
  { x: 130, y: 100 },
  impact.position,
  35,
  30,
  0.05
);
assert(after.position.x > impact.position.x, 'damaged vessel must continue to drift after impact');
assert(after.state.impactAge > 0);
assert(after.state.cooldown > 0, 'one collision must not trigger every frame');

const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
assert(source('src/ui/salvage/salvage-space-renderer.ts').includes('drawDistressRammingShield('));
assert(source('src/systems/ships/ship-registry.ts').includes("layer: 'below' as const"));
assert(source('src/ui/combat/combat-grapple-renderer.ts').includes('context.lineTo(-9, -10)'));
console.log('PASS distress ramming impulse, drift, shield flash and below-layer hook head');
