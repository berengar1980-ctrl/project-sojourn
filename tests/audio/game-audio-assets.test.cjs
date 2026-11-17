'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const audio = fs.readFileSync(path.join(root, 'src/systems/audio/game-audio-service.ts'), 'utf8');
const effects = fs.readFileSync(
  path.join(root, 'src/ui/ships/ship-maneuver-effects-renderer.ts'),
  'utf8'
);

const expected = [
  ['public/audio/deep-space.ogg', 'AMBIENCE_URL'],
  ['public/audio/spacecraft-rcs-thruster-burst.ogg', 'RCS_BURST_URL'],
];
for (const [relative, constant] of expected) {
  assert(audio.includes(constant), `missing optional audio URL ${constant}`);
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const buffer = fs.readFileSync(file);
  assert.equal(
    buffer.subarray(0, 4).toString('ascii'),
    'OggS',
    `${relative}: replacement media must be valid Ogg audio`
  );
}

assert(audio.includes('async function loadOptionalOgg('));
assert(audio.includes('if (!response.ok) return null'));
assert(audio.includes("String.fromCharCode(...header) !== 'OggS'"));
assert(audio.includes('if (!url) return;'));
assert(audio.includes('!rcsObjectUrl'));
assert(audio.includes('ambience.loop = true'));
assert(audio.includes('activeManeuverThrusterBursts'));
assert(effects.includes('activeManeuverThrusterBursts'));
console.log('PASS optional audio assets may be absent; replacement Ogg files remain validated');
