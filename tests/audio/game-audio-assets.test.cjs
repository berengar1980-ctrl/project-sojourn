'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function maxOggGranule(buffer) {
  let offset = 0;
  let max = 0n;
  while (offset + 27 <= buffer.length) {
    if (buffer.subarray(offset, offset + 4).toString('ascii') !== 'OggS') {
      offset += 1;
      continue;
    }

    let granule = 0n;
    for (let index = 0; index < 8; index += 1) {
      granule |= BigInt(buffer[offset + 6 + index]) << BigInt(index * 8);
    }
    if (granule > max) max = granule;

    const segmentCount = buffer[offset + 26];
    let bodyLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      bodyLength += buffer[offset + 27 + index];
    }
    offset += 27 + segmentCount + bodyLength;
  }
  return max;
}

function opusDurationSeconds(buffer) {
  return Number(maxOggGranule(buffer)) / 48000;
}

const ambienceChunks = Array.from({ length: 5 }, (_, index) =>
  fs.readFileSync(
    path.join(
      root,
      'resources/audio/ambience',
      'deep-space-' + String(index).padStart(2, '0') + '.b64'
    ),
    'utf8'
  )
);
const ambience = Buffer.from(ambienceChunks.join('').trim(), 'base64');

assert.equal(ambience.subarray(0, 4).toString('ascii'), 'OggS');
assert.equal(
  crypto.createHash('sha256').update(ambience).digest('hex'),
  'ae563895f5877cf4f9fc12cfd46e84483f90d1550be6e0e1f8af1e7cbe57e694',
  'chunked ambience must rebuild to the verified full encoded asset'
);
assert(
  opusDurationSeconds(ambience) > 151 && opusDurationSeconds(ambience) < 153,
  'deep-space ambience must remain the full ~152 second loop'
);

const rcs = fs.readFileSync(path.join(root, 'resources/audio/spacecraft-rcs-thruster-burst.ogg'));
assert.equal(rcs.subarray(0, 4).toString('ascii'), 'OggS');
assert(
  opusDurationSeconds(rcs) > 1 && opusDurationSeconds(rcs) < 1.2,
  'RCS burst must remain the supplied ~1.1 second sound'
);

const audioService = fs.readFileSync(
  path.join(root, 'src/systems/audio/game-audio-service.ts'),
  'utf8'
);
const maneuverRenderer = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-maneuver-effects-renderer.ts'),
  'utf8'
);

assert.equal(
  (audioService.match(/deep-space-\d\d\.b64/g) ?? []).length,
  5,
  'audio service must load every verified ambience chunk'
);
assert(audioService.includes('ambience.loop = true'));
assert(audioService.includes('activeManeuverThrusterBursts'));
assert(
  maneuverRenderer.includes('activeManeuverThrusterBursts'),
  'visual and audible RCS bursts must use the same trigger function'
);

console.log('PASS full ambience duration, RCS asset and synchronized burst trigger');
