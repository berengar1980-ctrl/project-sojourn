'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const weapons = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
const impactRenderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-hull-impact-renderer.ts'),
  'utf8'
);
const types = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-types.ts'),
  'utf8'
);
const { segmentShieldHit } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/combat/strategic-combat-damage.ts'
);
const target = {
  position: { x: 400, y: 200 },
  headingRadians: 0,
  shieldHp: 100,
  setup: {
    shieldGeometry: {
      centerOffset: { x: 0, y: 0 },
      radiusX: 45,
      radiusY: 35,
      modifier: 1,
    },
  },
};
const shieldHit = segmentShieldHit({ x: 320, y: 200 }, { x: 400, y: 200 }, target);
assert(shieldHit, 'approaching missile must first intersect the shield');
assert(Math.abs(shieldHit.point.x - 355) < 0.001, 'shield contact is on its near surface');
assert.equal(
  segmentShieldHit({ x: 320, y: 380 }, { x: 400, y: 380 }, target),
  null,
  'projectiles that pass above or below do not strike the shield'
);
assert(weapons.includes('const targetPoint = hit'), 'missed shots aim away from the hull');
assert(weapons.includes('missed: !hit'), 'projectiles keep their missed trajectory');
assert(weapons.includes("projectile.kind === 'missile' && !projectile.missed"));
assert(weapons.includes('weaponKind: projectile.kind'), 'impact visuals know projectile type');
assert(types.includes('readonly weaponKind?: CombatProjectileKind | CombatBeamKind'));
assert(impactRenderer.includes("impact.weaponKind === 'missile'"), 'rocket gets visible explosion');
assert(
  /obstacle\.point,\s*kind,\s*weapon\.weapon\.family/.test(weapons),
  'beam obstacle impacts carry weapon kind and specific family to the renderer'
);
assert(
  /obstacle\.point,\s*projectile\.kind,\s*projectile\.family\s*\)/.test(weapons),
  'projectile obstacle impacts carry weapon kind and specific family to the renderer'
);
assert(impactRenderer.includes("impact.layer === 'obstacle'"), 'solid rocks get hit effects');
assert(
  impactRenderer.includes("impact.weaponKind === 'rail'"),
  'kinetic rock impacts are distinct'
);

assert(impactRenderer.includes("impact.layer === 'shield'"), 'shield hit gets an impact flash');
const nativeWeaponPainters = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-native-weapon-painters.ts'),
  'utf8'
);
const fleetRenderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/fleet-native-combat-renderer.ts'),
  'utf8'
);
const torpedoRenderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-torpedo-renderer.ts'),
  'utf8'
);
assert(
  renderer.includes('drawCombatTorpedo(this.context)') &&
    fleetRenderer.includes('paintNativeProjectile(') &&
    nativeWeaponPainters.includes('drawCombatTorpedo(context)'),
  'combat renderer uses torpedo silhouette'
);
assert(torpedoRenderer.includes("context.fillStyle = '#343a40'"), 'torpedo has dark-grey hull');
assert(!torpedoRenderer.includes('lineTo(-8, 5)'), 'torpedo has no rocket fins');
const impactBatch = fs.readFileSync(
  path.join(root, 'src/ui/combat/combat-impact-visual-batch.ts'),
  'utf8'
);
assert(
  renderer.includes('drawCombatImpactBatch(') &&
    impactBatch.includes('drawStrategicHullImpact(') &&
    fs
      .readFileSync(path.join(root, 'src/ui/combat/strategic-hull-impact-effect.ts'), 'utf8')
      .includes('drawCombatHullImpact('),
  'combat renderer delegates explosions through the impact batch to the impact renderer'
);
console.log('PASS projectile misses, shield contacts and distinctive missile impacts');
