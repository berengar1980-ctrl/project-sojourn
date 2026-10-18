'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const shipsDir = path.join(root, 'src/data/ships');
const files = fs
  .readdirSync(shipsDir)
  .filter((name) => name.endsWith('.hardpoints.json'))
  .sort();

assert(files.length > 0, 'expected ship hardpoint files');

for (const name of files) {
  const data = JSON.parse(fs.readFileSync(path.join(shipsDir, name), 'utf8'));
  assert(Array.isArray(data.engines), name + ': engines must be an array');
  assert(Array.isArray(data.weaponLasers), name + ': weaponLasers must be an array');
  assert(Array.isArray(data.weaponMounts), name + ': weaponMounts must be an array');
  for (const [index, mount] of data.weaponMounts.entries()) {
    assert.equal(mount.slotIndex, index, name + ': stable slot mapping');
    assert(['port', 'starboard', 'forward'].includes(mount.facing), name + ': gun facing');
    if (mount.allowedMounts !== undefined) {
      assert(Array.isArray(mount.allowedMounts), name + ': allowedMounts must be an array');
      assert(
        mount.allowedMounts.every((kind) =>
          ['forward', 'broadside', 'turret', 'guided'].includes(kind)
        ),
        name + ': invalid weapon mount kind'
      );
    }
    if (mount.allowedFamilies !== undefined) {
      assert(Array.isArray(mount.allowedFamilies), name + ': allowedFamilies must be an array');
      assert(
        mount.allowedFamilies.every((family) =>
          [
            'pulse_laser',
            'front_repeater',
            'ion_laser',
            'plasma_battery',
            'ion_cannon',
            'autocannon',
            'railgun',
            'guided_missile',
            'he_missile',
          ].includes(family)
        ),
        name + ': invalid weapon family'
      );
    }
    if (mount.arcDegrees !== undefined) {
      assert(Number.isFinite(mount.arcDegrees), name + ': invalid weapon arc');
      assert(mount.arcDegrees >= 1 && mount.arcDegrees <= 360, name + ': arc outside range');
    }
    assert(mount.x >= 0 && mount.x <= data.sourceWidth, name + ': mount outside sprite X');
    assert(mount.y >= 0 && mount.y <= data.sourceHeight, name + ': mount outside sprite Y');
  }
  assert(Array.isArray(data.tractorBeams), name + ': tractorBeams must be an array');
  assert(Array.isArray(data.maneuverThrusters), name + ': maneuverThrusters must be an array');

  for (const hardpoint of [
    ...data.engines,
    ...data.weaponLasers,
    ...data.weaponMounts,
    ...data.miningLasers,
    ...data.tractorBeams,
    ...data.maneuverThrusters,
  ]) {
    assert(
      ['below', 'above'].includes(hardpoint.layer),
      name + ': hardpoint ' + hardpoint.id + ' must declare a supported render layer'
    );
  }

  const frontUpper = data.maneuverThrusters.find((item) => item.id === 'rcs-front-upper');
  const frontLower = data.maneuverThrusters.find((item) => item.id === 'rcs-front-lower');
  assert(frontUpper, name + ': missing rcs-front-upper');
  assert(frontLower, name + ': missing rcs-front-lower');
  assert.equal(frontUpper.forceX, -1, name + ': upper front RCS must push toward stern');
  assert.equal(frontLower.forceX, -1, name + ': lower front RCS must push toward stern');
  assert.equal(frontUpper.forceY, 0, name + ': upper front RCS forceY must be zero');
  assert.equal(frontLower.forceY, 0, name + ': lower front RCS forceY must be zero');
}

console.log('PASS ship hardpoint layer schema and front RCS contract');
