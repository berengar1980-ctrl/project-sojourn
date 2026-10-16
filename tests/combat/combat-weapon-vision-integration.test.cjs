'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const effects = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/combat-weapon-vision-renderer.ts'
);
const timing = loadStandaloneTypeScriptModule(root, 'src/core/combat-visual-timings.ts');

function recordingCanvas() {
  const operations = [];
  const context = {
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    fillRect() {
      operations.push({ type: 'rect', color: this.fillStyle });
    },
    fill() {
      operations.push({ type: 'fill', color: this.fillStyle });
    },
    stroke() {
      operations.push({ type: 'stroke', color: this.strokeStyle });
    },
  };
  return { context, operations };
}

const from = { x: 30, y: 50 };
const to = { x: 750, y: 50 };
const pulse1 = recordingCanvas();
effects.drawVisionPulseLaser(pulse1.context, from, to, 0.01);
const pulse3 = recordingCanvas();
effects.drawVisionPulseLaser(pulse3.context, from, to, 0.18);
assert(
  pulse3.operations.length > pulse1.operations.length,
  'pulse laser emits three individually timed red needles'
);
assert(
  pulse3.operations.some((op) => op.color === '#ff817c'),
  'pulse laser uses its independent coral-red palette'
);
const pulseExpired = recordingCanvas();
effects.drawVisionPulseLaser(pulseExpired.context, from, to, timing.VISION_PULSE_SECONDS + 0.01);
assert.equal(pulseExpired.operations.length, 0, 'expired pulse beams vanish');

const ionLaser = recordingCanvas();
effects.drawVisionIonLaser(ionLaser.context, from, to, 0.2, 11);
assert(
  ionLaser.operations.filter((op) => op.type === 'stroke').length >= 20,
  'ion laser receives the selected ion cannon beam with fourteen transverse discharges'
);
assert(
  ionLaser.operations.some((op) => op.color === '#48eacb'),
  'ion laser draws the cyan-green ion cannon beam, not purple fibers'
);

for (const family of ['plasma_battery', 'guided_missile', 'he_missile']) {
  const image = recordingCanvas();
  assert.equal(
    effects.drawVisionProjectile(image.context, family, { x: 240, y: 50 }, { x: 1, y: 0 }, 0.25, 5),
    true,
    family + ' uses the new visual while retaining simulation-provided position/direction'
  );
  assert(image.operations.length > 0, family + ' draws visible projectile content');
}
assert.equal(
  effects.drawVisionProjectile(
    recordingCanvas().context,
    'railgun',
    { x: 40, y: 50 },
    { x: 1, y: 0 },
    0.2,
    1
  ),
  false,
  'railgun must keep the existing game beam instead of the interpretation projectile'
);

const cannon = recordingCanvas();
effects.drawVisionAutocannon(cannon.context, from, to, 0.24, 0.6);
assert(cannon.operations.length >= 14, 'autocannon renders multiple copper rounds and casings');
assert(
  cannon.operations.some((op) => op.color === '#b86f40'),
  'autocannon changes from the old yellow tracer to the new copper streak'
);

const families = [
  'pulse_laser',
  'plasma_battery',
  'guided_missile',
  'ion_laser',
  'ion_cannon',
  'autocannon',
  'railgun',
  'he_missile',
];
for (const family of families) {
  const hit = recordingCanvas();
  effects.drawVisionWeaponImpact(hit.context, family, to, 0.13, 37, true);
  assert(hit.operations.length >= 2, family + ' has its own visible contact effect');
  const faded = recordingCanvas();
  effects.drawVisionWeaponImpact(
    faded.context,
    family,
    to,
    timing.VISION_IMPACT_SECONDS + 0.1,
    37,
    false
  );
  assert.equal(faded.operations.length, 0, family + ' impact expires without persistent artifacts');
}
const ionImpact = recordingCanvas();
const cannonImpact = recordingCanvas();
effects.drawVisionWeaponImpact(ionImpact.context, 'ion_laser', to, 0.2, 19, false);
effects.drawVisionWeaponImpact(cannonImpact.context, 'ion_cannon', to, 0.2, 19, false);
assert.deepEqual(
  ionImpact.operations,
  cannonImpact.operations,
  'ion laser and ion cannon share precisely the selected ion cannon interpretation impact'
);

const runtime = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-weapons.ts'),
  'utf8'
);
const renderer = fs.readFileSync(
  path.join(root, 'src/ui/combat/strategic-combat-renderer.ts'),
  'utf8'
);
const types = fs.readFileSync(
  path.join(root, 'src/systems/combat/strategic-combat-types.ts'),
  'utf8'
);
assert(
  types.includes('readonly weaponFamily?: ShipWeaponFamily'),
  'weapon identity is retained on the existing impact event'
);
assert(
  runtime.includes('weaponFamily: weapon.weapon.family') &&
    runtime.includes('weaponFamily: projectile.family'),
  'instant beams and travelling projectiles both attribute impacts to the correct weapon'
);
assert(
  renderer.includes('drawIonCannonArc(') && renderer.includes('drawRailgunLance('),
  'existing ion cannon and railgun flight effects remain in use'
);
assert(
  renderer.includes('drawVisionIonLaser(') &&
    renderer.includes('drawVisionPulseLaser(') &&
    renderer.includes('drawVisionAutocannon(') &&
    renderer.includes('drawVisionWeaponImpact('),
  'the game renderer uses the requested new beam, burst and contact effects'
);
assert(
  !runtime.includes('AUTOCANNON_ROUNDS'),
  'visual seven-shot salvo never multiplies real weapon damage'
);
console.log('PASS eight distinct impacts, selected shot effects, timing and combat integration');
