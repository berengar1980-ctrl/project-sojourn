'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const { drawCombatRamEffect, ramCameraImpulse } = loadStandaloneTypeScriptModule(
  root,
  'src/ui/combat/combat-ram-effect-renderer.ts'
);
const geometry = {
  center: { x: 300, y: 200 },
  width: 100,
  height: 50,
  angle: 0,
};
function strokeCount(ship, elapsed = 12, rotations = []) {
  let strokes = 0;
  const context = {
    save() {},
    restore() {},
    translate() {},
    rotate(angle) {
      rotations.push(angle);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {
      strokes += 1;
    },
  };
  drawCombatRamEffect(context, ship, geometry, elapsed);
  return strokes;
}
assert.equal(strokeCount({}), 0, 'ordinary travel creates no ram effect');
assert.equal(strokeCount({ ramPhase: 'flank' }), 1, 'flank approach adds a subtle bow wave');
assert.equal(
  strokeCount({ ramPhase: 'impact', boostActive: false }),
  1,
  'unboosted impact alignment has only a subtle arc'
);
assert.equal(
  strokeCount({ ramPhase: 'impact', boostActive: true }),
  3,
  'boosted ram charge has three compression wavefronts'
);
assert.equal(strokeCount({ ramImpactAt: 12 }), 6, 'real impact adds flash and five sparks');
assert.equal(strokeCount({ ramImpactAt: 12 }, 12.4), 0, 'impact spark window expires');
const droneRotations = [];
strokeCount(
  { id: 'security-drone:field', ramPhase: 'impact', velocity: { x: 0, y: 40 } },
  12,
  droneRotations
);
assert.deepEqual(droneRotations, [Math.PI / 2], 'drone ram effects point along world travel');
const empty = {};
const rammed = { ramImpactAt: 12 };
assert.deepEqual(ramCameraImpulse(empty, empty, 12), { x: 0, y: 0 });
const impulse = ramCameraImpulse(rammed, empty, 12);
assert(Math.hypot(impulse.x, impulse.y) > 0, 'real collision gives bounded camera impulse');
assert.deepEqual(ramCameraImpulse(rammed, empty, 12.23), { x: 0, y: 0 });
console.log('PASS deterministic ram bow wave, charge arcs, collision sparks and brief camera jolt');
