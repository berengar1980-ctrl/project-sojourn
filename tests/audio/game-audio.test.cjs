'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const audio = read('src/systems/audio/game-audio-service.ts');
const bursts = read('src/systems/ships/ship-maneuver-thrusters.ts');
const visual = read('src/ui/ships/ship-maneuver-effects-renderer.ts');
const controller = read('src/app/game-controller.ts');
const salvage = read('src/app/game-controller-salvage.ts');

const ambienceBase64 =
  read('resources/audio/base64/ambience-00.b64').trim() +
  read('resources/audio/base64/ambience-01.b64').trim();
const rcsBase64 = read('resources/audio/base64/rcs-burst.b64').trim();

assert.equal(
  Buffer.from(ambienceBase64, 'base64').subarray(0, 4).toString('ascii'),
  'OggS',
  'bundled ambience must decode to an Ogg stream'
);
assert.equal(
  Buffer.from(rcsBase64, 'base64').subarray(0, 4).toString('ascii'),
  'OggS',
  'bundled RCS burst must decode to an Ogg stream'
);

assert(
  audio.includes('ambience.loop = true') &&
    audio.includes("window.addEventListener('pointerdown', unlock") &&
    audio.includes("window.addEventListener('keydown', unlock"),
  'deep-space ambience must loop and unlock after the first browser user gesture'
);

assert(
  bursts.includes('activeManeuverThrusterBursts') &&
    visual.includes('activeManeuverThrusterBursts') &&
    audio.includes('activeManeuverThrusterBursts'),
  'RCS visual and audio must use the same burst decision function'
);

assert(
  audio.includes('!activeThrusters.has(burst.id)') &&
    audio.includes('RCS_RETRIGGER_SECONDS'),
  'RCS audio must fire on a burst onset without frame-by-frame audio spam'
);

assert(
  controller.includes('context.audio.updatePlayerRcs') &&
    salvage.includes('options.audio.updatePlayerRcs'),
  'player RCS audio must run in mining/local and salvage spaces'
);

console.log('PASS bundled ambience loop and synchronized RCS burst audio wiring');
