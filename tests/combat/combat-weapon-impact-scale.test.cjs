'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { weaponImpactView } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/strategic-combat-renderer-math.ts'
);
const weapons = [
  'pulse_laser',
  'front_repeater',
  'flux_projector',
  'plasma_battery',
  'guided_missile',
  'ion_laser',
  'ion_cannon',
  'autocannon',
  'railgun',
  'he_missile',
];
for (const family of weapons) {
  const close = weaponImpactView(48, family, true);
  const far = weaponImpactView(12, family, true);
  assert(close.radius > far.radius, family + ' impact tracks camera/projected target scale');
  assert(close.scale > far.scale, family + ' effect geometry scales with target');
  assert(close.radius <= 48 * 0.25, family + ' shield contact remains local');
  const hull = weaponImpactView(48, family, false);
  assert(hull.radius > close.radius, family + ' hull hit may be larger than shield contact');
}
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/fleet-native-combat-renderer.ts'),
  'utf8'
);
const impactBatch = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-impact-visual-batch.ts'),
  'utf8'
);
assert(renderer.includes('drawCombatImpactBatch('), 'renderer delegates contact visuals');
assert(impactBatch.includes('weaponImpactView('), 'contact renderer uses projected hit size');
assert(impactBatch.includes('context.clip()'), 'oversized bloom is clipped to the contact');
assert(impactBatch.includes('context.scale(view.scale, view.scale)'), 'impact scales with zoom');
assert(renderer.includes('this.shieldImpacts.draw('), 'canonical shield effect remains');
console.log('PASS scale-aware, shield-safe weapon impact effects');
