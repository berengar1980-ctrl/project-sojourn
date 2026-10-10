'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shipsDir = path.resolve(__dirname, '../../src/data/ships');
const files = fs.readdirSync(shipsDir).filter((name) => name.endsWith('.hardpoints.json'));
assert.equal(files.length, 28);

for (const file of files) {
  const ship = JSON.parse(fs.readFileSync(path.join(shipsDir, file), 'utf8'));
  const mounts = ship.weaponMounts;
  const isPatrol = file.startsWith('patrol-');
  assert.equal(mounts.length, isPatrol ? 5 : 4, file + ': weapon slot count');
  const expected = [
    ['forward', 'forward', 60, ['railgun']],
    ['port', 'broadside', 90, ['plasma_battery', 'ion_cannon', 'autocannon']],
    ['starboard', 'broadside', 90, ['plasma_battery', 'ion_cannon', 'autocannon']],
    ['forward', 'turret', 360, ['pulse_laser', 'ion_laser']],
    ...(isPatrol ? [['forward', 'guided', 360, ['guided_missile', 'he_missile']]] : []),
  ];
  mounts.forEach((mount, index) => {
    const [facing, kind, arc, families] = expected[index];
    assert.equal(mount.slotIndex, index, file + ': stable index');
    assert.equal(mount.facing, facing, file + ': facing ' + index);
    assert.deepEqual(mount.allowedMounts, [kind], file + ': mount class ' + index);
    assert.deepEqual(mount.allowedFamilies, families, file + ': weapon families ' + index);
    assert.equal(mount.arcDegrees, arc, file + ': arc ' + index);
    assert(mount.x >= 0 && mount.x <= ship.sourceWidth, file + ': mount x');
    assert(mount.y >= 0 && mount.y <= ship.sourceHeight, file + ': mount y');
  });
}
console.log('PASS all 28 ships have directional broadside turret and patrol missile hardpoints');
