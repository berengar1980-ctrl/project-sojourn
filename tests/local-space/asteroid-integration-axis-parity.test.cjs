'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');
const root = path.resolve(__dirname, '../..');
const { integrateAsteroids } = loadStandaloneTypeScriptModule(
  root,
  'src/systems/local-space/local-space-physics.ts'
);

function axis(position, velocity, radius, extent) {
  if (position < radius) return { position: radius, velocity: Math.abs(velocity) * 0.58 };
  if (position > extent - radius)
    return { position: extent - radius, velocity: -Math.abs(velocity) * 0.58 };
  return { position, velocity };
}
for (const radius of [5, 20, 80]) {
  for (const x of [-20, 10, 50, 110]) {
    for (const y of [-20, 10, 50, 110]) {
      const rock = {
        position: { x, y },
        radius,
        rotation: 0.4,
        physics: { velocity: { x: 30, y: -20 }, angularVelocity: 0.1 },
      };
      const expectedX = axis(x + 30 * 0.05, 30, radius, 100);
      const expectedY = axis(y - 20 * 0.05, -20, radius, 100);
      integrateAsteroids([rock], 0.05, 100, 100);
      assert.deepEqual(rock.position, { x: expectedX.position, y: expectedY.position });
      assert.deepEqual(rock.physics.velocity, { x: expectedX.velocity, y: expectedY.velocity });
      assert.equal(rock.rotation, 0.4 + 0.1 * 0.05);
    }
  }
}
console.log('PASS asteroid integration retains exact boundary and velocity behavior');
